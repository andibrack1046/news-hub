#!/usr/bin/env node
// Holt alle Quellen aus sources.json, bereinigt, dedupliziert, bewertet und schreibt
// public/data/news.json. Läuft lokal (npm run fetch) und in GitHub Actions.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseFeed } from "./lib/feed.mjs";
import { classify, matchesAny, HOT_WORDS, CATEGORY_KEYWORDS } from "./lib/classify.mjs";
import {
  cleanText, truncate, normalizeUrl, normalizeTitle, titleTokens, jaccard, sharedTokens,
  shortHash, detectLang,
} from "./lib/text.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES_FILE = path.join(ROOT, "sources.json");
const OUT_FILE = path.join(ROOT, "public", "data", "news.json");
const USER_AGENT = "Mozilla/5.0 (compatible; NewsHub/1.0; +https://github.com/) personal RSS reader";

const now = new Date();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchText(url, timeoutMs, accept = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*") {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept, "accept-language": "de-DE,de;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function googleNewsUrl(source) {
  const lang = source.lang === "en" ? { hl: "en-US", gl: "US", ceid: "US:en" } : { hl: "de", gl: "DE", ceid: "DE:de" };
  const q = encodeURIComponent(`${source.query} when:${source.days ?? 2}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=${lang.hl}&gl=${lang.gl}&ceid=${lang.ceid}`;
}

function hnUrl(source, maxAgeDays) {
  const since = Math.floor((Date.now() - maxAgeDays * 86400000) / 1000);
  const filters = [`created_at_i>${since}`, `points>${source.minPoints ?? 20}`].join(",");
  if (source.frontPage) {
    return `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=${encodeURIComponent(filters)}&hitsPerPage=60`;
  }
  return `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(source.query)}&tags=story&numericFilters=${encodeURIComponent(filters)}&hitsPerPage=30`;
}

// Rohdaten einer Quelle -> einheitliche Einträge
async function fetchSource(source, limits) {
  const t0 = Date.now();
  let raw = [];
  if (source.type === "googlenews") {
    const items = parseFeed(await fetchText(googleNewsUrl(source), limits.timeoutMs));
    raw = items.map((it) => ({
      title: it.title.replace(/\s+-\s+[^-]{2,60}$/, "").trim(),
      url: it.link,
      date: it.date,
      summary: "",
      sourceName: it.source || "Google News",
    }));
  } else if (source.type === "hn") {
    const data = JSON.parse(await fetchText(hnUrl(source, limits.maxAgeDays), limits.timeoutMs, "application/json"));
    raw = (data.hits || []).map((h) => ({
      title: h.title || h.story_title || "",
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      date: h.created_at,
      summary: `${h.points} Punkte, ${h.num_comments ?? 0} Kommentare auf Hacker News`,
      sourceName: "Hacker News",
      discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
    }));
  } else if (source.type === "gtrends") {
    const items = parseFeed(await fetchText(source.url, limits.timeoutMs));
    raw = items.map((it) => {
      const first = it.newsItems[0];
      const headlines = it.newsItems.slice(0, 2).map((n) => n.title).filter(Boolean).join(" · ");
      return {
        title: `Trend: ${it.title}`,
        url: first?.url || `https://trends.google.com/trending?geo=DE&q=${encodeURIComponent(it.title)}`,
        date: it.date,
        summary: [it.traffic ? `${it.traffic} Suchanfragen` : "", headlines].filter(Boolean).join(". "),
        sourceName: first?.source ? `Google Trends · ${first.source}` : "Google Trends",
      };
    });
  } else {
    const items = parseFeed(await fetchText(source.url, limits.timeoutMs));
    raw = items.map((it) => ({
      title: it.title,
      url: it.link,
      date: it.date,
      summary: it.description,
      sourceName: source.name,
    }));
  }

  const entries = [];
  const max = source.max ?? (source.type === "googlenews" ? 15 : limits.maxItemsPerSource);
  for (const r of raw.slice(0, max)) {
    const title = cleanText(r.title);
    if (!title || !r.url || !/^https?:\/\//i.test(r.url)) continue;
    const summary = truncate(cleanText(r.summary || ""), 260);
    const haystack = `${title} ${summary}`;
    if (source.keywords?.length && !matchesAny(haystack, source.keywords)) continue;

    let category = source.category;
    if (source.classify) {
      const found = classify(haystack, { fallback: null });
      if (found) category = found;
      else if (source.onlyMatching) continue;
    }
    // Google-News-Suchen treffen oft nur im Fließtext: Schlagzeile muss selbst zum Thema passen
    const requireCategory = source.requireCategory ?? source.type === "googlenews";
    if (requireCategory && !matchesAny(haystack, CATEGORY_KEYWORDS[source.category] || [])) continue;
    const url = normalizeUrl(r.url);
    const publishedAt = r.date && new Date(r.date) <= new Date(Date.now() + 3600000) ? r.date : null;
    entries.push({
      id: shortHash(url),
      title,
      url,
      discussionUrl: r.discussionUrl,
      source: r.sourceName || source.name,
      sourceId: source.id,
      category,
      lang: source.type === "googlenews" || source.classify ? detectLang(haystack) : source.lang || detectLang(haystack),
      publishedAt,
      summary,
      weight: source.weight ?? 1,
    });
  }
  return { entries, ms: Date.now() - t0 };
}

async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function scoreItem(item, relatedCount) {
  const published = new Date(item.publishedAt || item.firstSeenAt).getTime();
  const ageH = Math.max(0, (Date.now() - published) / 3600000);
  const recency = Math.max(0, 1 - ageH / 72);
  const hot = HOT_WORDS.some((w) => ` ${item.title.toLowerCase()} `.includes(w)) ? 1 : 0;
  const datePenalty = item.publishedAt ? 0 : 0.2;
  const score = item.weight * (0.35 + 0.65 * recency) + 0.3 * Math.min(relatedCount, 3) + 0.15 * hot - datePenalty;
  return Math.round(score * 1000) / 1000;
}

// Ähnliche Schlagzeilen aus verschiedenen Quellen zusammenfassen (Union-Find)
function clusterItems(items) {
  const tokens = items.map((it) => titleTokens(it.title));
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].sourceId === items[j].sourceId && items[i].source === items[j].source) continue;
      const shared = sharedTokens(tokens[i], tokens[j]);
      if (shared >= 4 || (shared >= 3 && jaccard(tokens[i], tokens[j]) >= 0.5)) union(i, j);
    }
  }
  const groups = new Map();
  items.forEach((_, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  });
  return groups;
}

async function main() {
  const config = await loadJson(SOURCES_FILE, null);
  if (!config) throw new Error(`sources.json nicht lesbar: ${SOURCES_FILE}`);
  const limits = { maxAgeDays: 7, maxItemsTotal: 700, maxItemsPerSource: 40, timeoutMs: 20000, concurrency: 6, ...config.limits };
  const previous = await loadJson(OUT_FILE, { items: [] });
  const previousById = new Map((previous.items || []).map((it) => [it.id, it]));
  const sources = config.sources.filter((s) => s.enabled !== false);

  log(`Hole ${sources.length} Quellen …`);
  const results = await runPool(
    sources.map((source) => async () => {
      try {
        const { entries, ms } = await fetchSource(source, limits);
        log(`ok   ${source.id.padEnd(24)} ${String(entries.length).padStart(3)} Einträge  ${ms} ms`);
        return { source, entries, ok: true, ms };
      } catch (err) {
        log(`FEHL ${source.id.padEnd(24)} ${err.message}`);
        return { source, entries: [], ok: false, error: err.message };
      }
    }),
    limits.concurrency
  );

  // Zusammenführen mit dem letzten Stand, damit Einträge nicht verschwinden, wenn ein Feed ausfällt
  const nowIso = now.toISOString();
  const merged = new Map();
  const seenTitles = new Map();
  const addItem = (item) => {
    const prev = previousById.get(item.id);
    const firstSeenAt = prev?.firstSeenAt || item.firstSeenAt || nowIso;
    const titleKey = normalizeTitle(item.title);
    const dupe = seenTitles.get(titleKey);
    if (dupe && dupe.id !== item.id) {
      // gleiche Schlagzeile unter anderer URL: schwerere Quelle gewinnt, Quelle wird vermerkt
      if ((item.weight ?? 1) > (dupe.weight ?? 1)) {
        merged.delete(dupe.id);
      } else {
        dupe.alsoIn = [...new Set([...(dupe.alsoIn || []), item.source])].filter((s) => s !== dupe.source).slice(0, 4);
        return;
      }
    }
    const full = { ...item, firstSeenAt, ai: prev?.ai || item.ai || null };
    merged.set(full.id, full);
    seenTitles.set(titleKey, full);
  };
  for (const r of results) for (const e of r.entries) addItem(e);
  const cutoff = Date.now() - limits.maxAgeDays * 86400000;
  for (const old of previous.items || []) {
    if (merged.has(old.id)) continue;
    const t = new Date(old.publishedAt || old.firstSeenAt).getTime();
    if (t >= cutoff) addItem(old);
  }

  let items = [...merged.values()].filter((it) => new Date(it.publishedAt || it.firstSeenAt).getTime() >= cutoff);

  // Verwandte Meldungen bündeln: pro Bündel führt die bestbewertete Meldung (lead), die anderen hängen dran
  const groups = clusterItems(items);
  for (const idxs of groups.values()) {
    const related = idxs.length - 1;
    for (const i of idxs) {
      items[i].related = related;
      items[i].score = scoreItem(items[i], related);
    }
    const lead = idxs.reduce((best, i) => (items[i].score > items[best].score ? i : best), idxs[0]);
    for (const i of idxs) {
      items[i].clusterId = items[lead].id;
      items[i].lead = i === lead;
    }
  }
  items.sort((a, b) => new Date(b.publishedAt || b.firstSeenAt) - new Date(a.publishedAt || a.firstSeenAt));
  items = items.slice(0, limits.maxItemsTotal);

  const perCategory = Object.fromEntries(config.categories.map((c) => [c.id, 0]));
  for (const it of items) perCategory[it.category] = (perCategory[it.category] || 0) + 1;

  const output = {
    generatedAt: nowIso,
    categories: config.categories,
    stats: {
      total: items.length,
      newThisRun: items.filter((it) => it.firstSeenAt === nowIso).length,
      perCategory,
      sourcesOk: results.filter((r) => r.ok).length,
      sourcesFailed: results.filter((r) => !r.ok).map((r) => r.source.id),
    },
    sources: results.map((r) => ({
      id: r.source.id, name: r.source.name, category: r.source.category, ok: r.ok,
      count: r.entries.length, error: r.error || null, ms: r.ms ?? null,
    })),
    items: items.map(({ weight, ...rest }) => rest),
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(output), "utf8");
  log(`Fertig: ${items.length} Meldungen (${output.stats.newThisRun} neu), ${output.stats.sourcesOk}/${results.length} Quellen ok -> ${path.relative(ROOT, OUT_FILE)}`);
  if (output.stats.sourcesFailed.length) log(`Ausgefallen: ${output.stats.sourcesFailed.join(", ")}`);
  if (output.stats.sourcesOk === 0) {
    process.exitCode = 1;
    console.error("Keine Quelle erreichbar, Ausgabe trotzdem geschrieben.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
