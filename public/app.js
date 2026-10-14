/* News-Hub: Oberfläche im Zeitungsaufbau. Kein Framework, keine Abhängigkeiten.
   Daten: ./data/news.json (von scripts/fetch.mjs). Zustand: localStorage. */
(() => {
  "use strict";

  const DATA_URL = "./data/news.json";
  const STORE_KEY = "newshub.v1";
  const FRESH_HOURS = 36;
  const FRESH_HOURS_FALLBACK = 72;
  const TOP_COUNT = 6;
  const PAGE_SIZE = 40;

  const $main = document.getElementById("main");
  const $status = document.getElementById("status");
  const $toast = document.getElementById("toast");
  const $nav = document.getElementById("ressort-nav");

  // ---------- Zustand ----------
  const defaultState = () => ({
    saved: {},
    ideas: {},
    used: {},
    lastVisit: null,
    showDone: false,
    category: "all",
    query: "",
  });
  let state = loadState();
  state.query = ""; // Suchbegriff gilt nur für die aktuelle Sitzung
  let data = { items: [], categories: [], generatedAt: null, sources: [], stats: {} };
  let itemsById = new Map();
  let offline = false;
  let visibleCount = PAGE_SIZE;
  const sessionStart = Date.now();
  const previousVisit = state.lastVisit;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch {
      return defaultState();
    }
  }
  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        toast("Speichern im Browser fehlgeschlagen");
      }
    }, 80);
  }

  // ---------- Helfer ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function timeAgo(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.round(min / 60);
    if (h < 24) return `vor ${h} Std.`;
    const d = Math.round(h / 24);
    if (d === 1) return "gestern";
    if (d < 7) return `vor ${d} Tagen`;
    return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }
  const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
  const fullDate = (iso) => (iso ? new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const when = (it) => it.publishedAt || it.firstSeenAt;
  const ageH = (it) => (Date.now() - new Date(when(it)).getTime()) / 3600000;
  const catLabel = (id) => data.categories.find((c) => c.id === id)?.label || id || "";
  const isNew = (it) => previousVisit && it.firstSeenAt && new Date(it.firstSeenAt).getTime() > new Date(previousVisit).getTime();
  const isUsed = (it) => Boolean(state.used[it.id]);
  const isSaved = (it) => Boolean(state.saved[it.id]);
  const isIdea = (it) => Boolean(state.ideas[it.id]);
  const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 2200);
  }

  function snapshot(it) {
    const { title, url, source, category, publishedAt, firstSeenAt, summary, ai, id, image } = it;
    return { id, title, url, source, category, publishedAt, firstSeenAt, summary, ai: ai || null, image: image || null };
  }

  // ---------- Daten ----------
  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.offline) throw new Error("offline");
      data = json;
      offline = res.headers.get("x-newshub-offline") === "1";
    } catch {
      offline = true;
      if (!data.items.length) {
        try {
          const cached = await caches?.match?.(DATA_URL);
          if (cached) data = await cached.json();
        } catch {}
      }
    }
    itemsById = new Map(data.items.map((it) => [it.id, it]));
    for (const id of Object.keys(state.saved)) if (itemsById.has(id)) state.saved[id] = snapshot(itemsById.get(id));
    for (const id of Object.keys(state.ideas)) if (itemsById.has(id)) state.ideas[id].item = snapshot(itemsById.get(id));
    renderNav();
    renderStatus();
    render();
  }

  function renderStatus() {
    const wide = window.matchMedia("(min-width: 720px)").matches;
    const today = new Date().toLocaleDateString("de-DE", wide ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
    if (!data.generatedAt) {
      $status.textContent = offline ? "Offline, keine Daten" : today;
      $status.classList.toggle("offline", offline);
      return;
    }
    const failed = data.stats?.sourcesFailed?.length || 0;
    const stand = isToday(data.generatedAt) ? `Stand ${clock(data.generatedAt)} Uhr` : `Stand ${timeAgo(data.generatedAt)}`;
    $status.textContent = `${offline ? "Offline · " : ""}${today} · ${stand}${failed ? ` · ${failed} Quellen gestört` : ""}`;
    $status.title = `Zuletzt aktualisiert: ${fullDate(data.generatedAt)}`;
    $status.classList.toggle("offline", offline);
  }

  function renderNav() {
    const route = currentRoute();
    const links = [
      { href: "#start", label: "Start", active: route.view === "start" },
      ...data.categories.map((c) => ({ href: `#ressort/${c.id}`, label: c.label, active: route.view === "ressort" && route.id === c.id })),
      { href: "#neueste", label: "Neueste", active: route.view === "neueste" },
      { href: "#gemerkt", label: "Gemerkt", active: route.view === "gemerkt" },
      { href: "#ideen", label: "Ideen", active: route.view === "ideen" },
    ];
    $nav.innerHTML = links.map((l) => `<a href="${l.href}"${l.active ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`).join("");
    const active = $nav.querySelector('[aria-current="page"]');
    if (active && typeof active.scrollIntoView === "function") {
      try { active.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" }); } catch {}
    }
    document.querySelectorAll(".tabs-bottom a").forEach((a) => {
      if (a.dataset.tab === route.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  // ---------- Routing ----------
  function currentRoute() {
    const h = (location.hash || "#start").slice(1);
    if (h === "heute" || h === "" || h === "start") return { view: "start" };
    if (h === "alle" || h === "neueste") return { view: "neueste" };
    if (h.startsWith("ressort/")) {
      const id = h.slice(8);
      if (data.categories.some((c) => c.id === id)) return { view: "ressort", id };
      return { view: "start" };
    }
    if (h === "gemerkt" || h === "ideen") return { view: h };
    return { view: "start" };
  }

  // ---------- Auswahl ----------
  const leads = () => data.items.filter((it) => it.lead !== false && !isUsed(it));

  function freshPool(items, hours = FRESH_HOURS, min = 6) {
    let pool = items.filter((it) => ageH(it) < hours);
    if (pool.length < min) pool = items.filter((it) => ageH(it) < FRESH_HOURS_FALLBACK);
    if (pool.length < min) pool = items.slice();
    return pool.sort((a, b) => b.score - a.score);
  }

  // Aufmacher plus Top-Themen: bestbewertet, höchstens 2 pro Ressort und 2 pro Quelle, Aufmacher mit Bild
  function pickFront(items) {
    const pool = freshPool(items);
    const perCat = {};
    const perSource = {};
    const picked = [];
    for (const it of pool) {
      if ((perCat[it.category] || 0) >= 2 || (perSource[it.source] || 0) >= 2) continue;
      perCat[it.category] = (perCat[it.category] || 0) + 1;
      perSource[it.source] = (perSource[it.source] || 0) + 1;
      picked.push(it);
      if (picked.length >= TOP_COUNT + 1) break;
    }
    let heroIdx = picked.findIndex((it, i) => i < 4 && it.image);
    if (heroIdx < 0) heroIdx = 0;
    const hero = picked[heroIdx];
    const top = picked.filter((_, i) => i !== heroIdx);
    return { hero, top };
  }

  function pickRessort(catId, exclude, leadCount = 1, rowCount = 4) {
    const pool = freshPool(leads().filter((it) => it.category === catId && !exclude.has(it.id)), 72, 3);
    let leadIdx = pool.findIndex((it, i) => i < 3 && it.image);
    if (leadIdx < 0) leadIdx = 0;
    const lead = pool[leadIdx];
    const rows = pool.filter((_, i) => i !== leadIdx).slice(0, rowCount);
    return { lead, rows, total: pool.length };
  }

  function filterAll(items) {
    const q = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((it) => it.lead !== false)
      .filter((it) => state.category === "all" || it.category === state.category)
      .filter((it) => state.showDone || !isUsed(it))
      .filter((it) => !q.length || q.every((w) => `${it.title} ${it.summary} ${it.source} ${it.ai?.summary || ""} ${it.ai?.hook || ""}`.toLowerCase().includes(w)))
      .sort((a, b) => new Date(when(b)) - new Date(when(a)));
  }

  function relatedOf(it) {
    if (!it.related) return [];
    return data.items.filter((o) => o.clusterId === it.clusterId && o.id !== it.id);
  }

  // ---------- Bausteine ----------
  function imgHtml(it, cls = "") {
    const src = it.image;
    const sourceAttr = `data-source="${esc(it.source || "")}"`;
    if (!src) return `<a class="img none ${cls}" ${sourceAttr} href="${esc(it.url)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"></a>`;
    return `<a class="img ${cls}" ${sourceAttr} href="${esc(it.url)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('.img').classList.add('broken')"></a>`;
  }

  function metaHtml(it, { withCat = true } = {}) {
    const parts = [];
    if (isNew(it)) parts.push('<span class="new">Neu</span>');
    if (withCat) parts.push(`<a href="#ressort/${esc(it.category)}">${esc(catLabel(it.category))}</a>`);
    parts.push(`<span>${esc(it.source)}</span>`);
    parts.push(`<time datetime="${esc(when(it))}" title="${esc(fullDate(when(it)))}">${esc(timeAgo(when(it)))}</time>`);
    if (it.alsoIn?.length) parts.push(`<span>auch bei ${esc(it.alsoIn.join(", "))}</span>`);
    return `<p class="meta">${parts.join("<span>·</span>")}</p>`;
  }

  function pillsHtml(it) {
    const used = isUsed(it);
    return `<div class="actions">
      <button class="pill" data-action="save" aria-pressed="${isSaved(it)}">${isSaved(it) ? "Gemerkt" : "Merken"}</button>
      <button class="pill" data-action="idea" aria-pressed="${isIdea(it)}">${isIdea(it) ? "In Ideen" : "Videoidee"}</button>
      <button class="pill quiet" data-action="used" aria-pressed="${used}">${used ? "Erledigt" : "Erledigt?"}</button>
    </div>`;
  }

  function miniHtml(it, { withUsed = true } = {}) {
    return `<div class="mini">
      <button data-action="save" aria-pressed="${isSaved(it)}">${isSaved(it) ? "Gemerkt" : "Merken"}</button>
      <button data-action="idea" aria-pressed="${isIdea(it)}">${isIdea(it) ? "In Ideen" : "Videoidee"}</button>
      ${withUsed ? `<button data-action="used" aria-pressed="${isUsed(it)}">${isUsed(it) ? "Erledigt" : "Erledigt?"}</button>` : ""}
    </div>`;
  }

  function relatedHtml(it) {
    const rel = relatedOf(it);
    if (!rel.length) return "";
    return `<details class="related"><summary>${rel.length === 1 ? "1 ähnliche Meldung" : `${rel.length} ähnliche Meldungen`}</summary><ul>${rel
      .map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}<span>${esc(r.source)} · ${esc(timeAgo(when(r)))}</span></a></li>`)
      .join("")}</ul></details>`;
  }

  function teaserText(it) {
    return it.ai?.summary || it.summary || "";
  }
  // Deutsche Schlagzeile aus dem KI-Schritt, sonst Original; Original bleibt als Tooltip erhalten
  function headline(it) {
    const de = it.ai?.titleDe;
    if (de) return `<a href="${esc(it.url)}" target="_blank" rel="noopener" title="${esc(it.title)}">${esc(de)}</a>`;
    return `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>`;
  }
  const titleText = (it) => it.ai?.titleDe || it.title;
  function hookHtml(it) {
    return it.ai?.hook ? `<p class="hook"><span class="bar">Hook</span>${esc(it.ai.hook)}</p>` : "";
  }

  function heroHtml(it) {
    return `<article class="hero${isUsed(it) ? " done" : ""}" data-id="${esc(it.id)}">
      ${imgHtml(it)}
      <div>
        <span class="kicker">${esc(catLabel(it.category))}</span>
        <h2>${headline(it)}</h2>
        ${teaserText(it) ? `<p class="teaser">${esc(teaserText(it))}</p>` : ""}
        ${hookHtml(it)}
        ${metaHtml(it, { withCat: false })}
        ${relatedHtml(it)}
        ${pillsHtml(it)}
      </div>
    </article>`;
  }

  function tileHtml(it) {
    return `<article class="tile${isUsed(it) ? " done" : ""}" data-id="${esc(it.id)}">
      ${imgHtml(it)}
      <h3>${headline(it)}</h3>
      ${metaHtml(it)}
      ${miniHtml(it, { withUsed: false })}
    </article>`;
  }

  function leadHtml(it, { withCat = false } = {}) {
    return `<article class="lead${isUsed(it) ? " done" : ""}" data-id="${esc(it.id)}">
      ${imgHtml(it)}
      <h3>${headline(it)}</h3>
      ${teaserText(it) ? `<p class="teaser">${esc(teaserText(it))}</p>` : ""}
      ${hookHtml(it)}
      ${metaHtml(it, { withCat })}
      ${relatedHtml(it)}
      ${pillsHtml(it)}
    </article>`;
  }

  function rowHtml(it, { withCat = true, thumb = true } = {}) {
    const showThumb = thumb && Boolean(it.image);
    return `<article class="row${showThumb ? "" : " no-thumb"}${isUsed(it) ? " done" : ""}" data-id="${esc(it.id)}">
      <div>
        <h3>${headline(it)}</h3>
        ${metaHtml(it, { withCat })}
        ${it.ai?.hook ? `<p class="hook" style="font-size:14px">${esc(it.ai.hook)}</p>` : ""}
        ${miniHtml(it)}
      </div>
      ${showThumb ? imgHtml(it, "square") : ""}
    </article>`;
  }

  function tickerHtml(items, count = 14) {
    const perSource = {};
    const latest = items
      .slice()
      .sort((a, b) => new Date(when(b)) - new Date(when(a)))
      .filter((it) => {
        const key = it.sourceId || it.source;
        perSource[key] = (perSource[key] || 0) + 1;
        return perSource[key] <= 2;
      })
      .slice(0, count);
    if (!latest.length) return "";
    return `<section class="ticker" aria-label="Neueste Meldungen">
      <div class="ressort-head"><h2>Ticker</h2><a href="#neueste">Alle Meldungen</a></div>
      <ul>${latest
        .map((it) => `<li><time datetime="${esc(when(it))}">${esc(isToday(when(it)) ? clock(when(it)) : timeAgo(when(it)))}</time><div>${headline(it)}<span>${esc(catLabel(it.category))} · ${esc(it.source)}</span></div></li>`)
        .join("")}</ul>
    </section>`;
  }

  // ---------- Seiten ----------
  function viewStart() {
    const all = leads();
    if (!all.length) {
      return `<div class="page-head"><h1>News-<span class="bar">Hub</span></h1><p>${offline ? "Offline und noch kein gespeicherter Stand." : "Noch keine Daten. Der erste Abruf läuft oder ist fehlgeschlagen."}</p></div>`;
    }
    const { hero, top } = pickFront(all);
    const used = new Set([hero.id, ...top.map((t) => t.id)]);
    const newCount = previousVisit ? data.items.filter(isNew).length : 0;

    const ressorts = data.categories
      .map((c) => {
        const { lead, rows, total } = pickRessort(c.id, used);
        if (!lead) return "";
        [lead, ...rows].forEach((it) => used.add(it.id));
        return `<section class="ressort" aria-label="${esc(c.label)}">
          <div class="ressort-head"><h2>${esc(c.label)}</h2><a href="#ressort/${esc(c.id)}">Alle ${total} Meldungen</a></div>
          <div class="ressort-body">
            ${leadHtml(lead)}
            <div class="rows">${rows.map((it) => rowHtml(it, { withCat: false })).join("")}</div>
          </div>
        </section>`;
      })
      .join("");

    const failed = data.stats?.sourcesFailed || [];
    return `
      <div class="with-ticker">
        <div>
          ${heroHtml(hero)}
          <div class="grid">${top.map(tileHtml).join("")}</div>
          ${ressorts}
        </div>
        ${tickerHtml(all)}
      </div>
      <p class="note">${newCount ? `<b>${newCount} neue Meldungen</b> seit deinem letzten Besuch. ` : ""}${data.items.length} Meldungen aus ${data.stats?.sourcesOk ?? "?"} Quellen, zuletzt aktualisiert ${esc(fullDate(data.generatedAt))}. ${failed.length ? `<b>Gestört:</b> ${esc(failed.join(", "))}. ` : ""}${data.ai?.lastRunAt ? `KI-Texte zuletzt ${esc(timeAgo(data.ai.lastRunAt))}. ` : ""}Aktualisierung alle drei Stunden.</p>`;
  }

  function viewRessort(catId) {
    const label = catLabel(catId);
    const pool = leads().filter((it) => it.category === catId);
    const sorted = pool.slice().sort((a, b) => new Date(when(b)) - new Date(when(a)));
    const { lead } = pickRessort(catId, new Set(), 1, 0);
    const rest = sorted.filter((it) => it.id !== lead?.id);
    const shown = rest.slice(0, visibleCount);
    const words = label.split(" ");
    const last = words.pop();
    return `
      <div class="page-head"><h1>${esc(words.join(" "))} <span class="bar">${esc(last)}</span></h1><p>${pool.length} Meldungen aus den letzten Tagen.</p></div>
      ${lead ? heroHtml(lead) : `<div class="empty">Gerade nichts in diesem Ressort.</div>`}
      <div class="rows two">${shown.map((it) => rowHtml(it, { withCat: false })).join("")}</div>
      ${rest.length > shown.length ? `<div class="more"><button class="pill" data-action="more">Mehr laden (${rest.length - shown.length} weitere)</button></div>` : ""}`;
  }

  function viewNeueste() {
    const list = filterAll(data.items);
    const shown = list.slice(0, visibleCount);
    const chips = [{ id: "all", label: "Alle" }, ...data.categories]
      .map((c) => `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="${state.category === c.id}">${esc(c.label)}</button>`)
      .join("");
    return `
      <div class="page-head"><h1>Neueste <span class="bar">Meldungen</span></h1><p>${list.length} Treffer${state.query ? ` für „${esc(state.query)}“` : ""}, neueste zuerst.</p></div>
      <div class="toolbar">
        <input class="search" id="search" type="search" placeholder="Suchen …" value="${esc(state.query)}" autocomplete="off" autocapitalize="off" enterkeyhint="search">
        <div class="chips">${chips}</div>
      </div>
      <div class="toolbar-row"><button class="pill small quiet" data-action="toggle-done" aria-pressed="${state.showDone}">${state.showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}</button><span>${Object.keys(state.used).length} erledigt</span></div>
      ${shown.length ? `<div class="rows two">${shown.map((it) => rowHtml(it)).join("")}</div>` : `<div class="empty">Nichts gefunden.</div>`}
      ${list.length > shown.length ? `<div class="more"><button class="pill" data-action="more">Mehr laden (${list.length - shown.length} weitere)</button></div>` : ""}`;
  }

  function viewGemerkt() {
    const items = Object.values(state.saved).sort((a, b) => new Date(when(b)) - new Date(when(a)));
    return `
      <div class="page-head"><h1><span class="bar">Gemerkt</span></h1><p>${items.length ? `${items.length} gespeicherte Meldungen, nur auf diesem Gerät.` : "Noch nichts gemerkt."}</p></div>
      ${items.length ? `<div class="rows two">${items.map((it) => rowHtml(itemsById.get(it.id) || it)).join("")}</div>` : `<div class="empty">Tippe bei einer Meldung auf Merken. Sie bleibt hier, auch wenn sie aus den News verschwindet.</div>`}`;
  }

  function viewIdeen() {
    const ideas = Object.values(state.ideas).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const open = ideas.filter((i) => !i.done);
    const done = ideas.filter((i) => i.done);
    const ideaCard = (idea) => {
      const it = idea.item;
      return `
<article class="card idea${idea.done ? " done" : ""}" data-id="${esc(it.id)}">
  <div class="idea-grid">
    <div>
      <h2 class="title">${it.url ? headline(it) : esc(it.title)}</h2>
      <p class="meta"><span>${esc(it.source || "Eigene Idee")}</span>${it.publishedAt ? `<span>·</span><time>${esc(dateOnly(it.publishedAt))}</time>` : ""}<span>·</span><span>notiert ${esc(timeAgo(idea.createdAt))}</span></p>
    </div>
    ${it.image ? imgHtml(it, "square") : ""}
  </div>
  ${hookHtml(it)}
  <textarea data-action="note" placeholder="Notiz: Format, Hook, Dreh-Idee, Kunde …" aria-label="Notiz">${esc(idea.note || "")}</textarea>
  <div class="actions">
    <button class="pill" data-action="idea-done" aria-pressed="${idea.done}">${idea.done ? "Gedreht" : "Gedreht?"}</button>
    ${it.url ? `<a class="pill quiet" href="${esc(it.url)}" target="_blank" rel="noopener">Öffnen</a>` : ""}
    <button class="pill quiet" data-action="idea-remove">Entfernen</button>
  </div>
</article>`;
    };
    return `
      <div class="page-head"><h1>Deine <span class="bar">Videoideen</span></h1><p>${ideas.length ? `${open.length} offen, ${done.length} gedreht.` : "Noch keine Ideen. Tippe bei einer Meldung auf Videoidee."}</p></div>
      <div class="actions" style="margin:0 0 18px">
        <button class="pill primary" data-action="export-copy"${ideas.length ? "" : " disabled"}>Als Markdown kopieren</button>
        <button class="pill" data-action="export-file"${ideas.length ? "" : " disabled"}>Markdown-Datei</button>
      </div>
      <form class="card new-idea" id="new-idea" style="margin-bottom:18px">
        <input name="title" type="text" placeholder="Eigene Idee festhalten …" aria-label="Eigene Idee" autocomplete="off">
        <div class="actions" style="margin:0"><button class="pill" type="submit">Hinzufügen</button></div>
      </form>
      ${open.length ? `<div class="list">${open.map(ideaCard).join("")}</div>` : ""}
      ${done.length ? `<h2 class="section-title">Gedreht</h2><div class="list">${done.map(ideaCard).join("")}</div>` : ""}
      <p class="note">Export für Obsidian: Markdown kopieren und in eine Notiz einfügen, oder die Datei direkt in den Vault legen.</p>`;
  }

  function render() {
    const route = currentRoute();
    const key = route.view + (route.id || "");
    const scrollY = window.scrollY;
    let html = "";
    if (route.view === "start") html = viewStart();
    else if (route.view === "ressort") html = viewRessort(route.id);
    else if (route.view === "neueste") html = viewNeueste();
    else if (route.view === "gemerkt") html = viewGemerkt();
    else html = viewIdeen();
    $main.innerHTML = html;
    if (render.lastKey === key) window.scrollTo(0, scrollY);
    else window.scrollTo(0, 0);
    render.lastKey = key;
    renderNav();
    const titles = { start: "News-Hub", neueste: "Neueste · News-Hub", gemerkt: "Gemerkt · News-Hub", ideen: "Ideen · News-Hub", ressort: `${catLabel(route.id)} · News-Hub` };
    document.title = titles[route.view];
  }

  // Nur die Schaltflächen eines Artikels aktualisieren, Bilder und Scrollposition bleiben
  function refreshItem(id) {
    const it = itemsById.get(id) || state.saved[id] || state.ideas[id]?.item;
    if (!it) return render();
    const els = $main.querySelectorAll(`[data-id="${CSS.escape(id)}"]`);
    if (!els.length) return render();
    els.forEach((el) => {
      if (el.classList.contains("idea")) return;
      const actions = el.querySelector(".actions");
      if (actions) actions.outerHTML = pillsHtml(it);
      const mini = el.querySelector(".mini");
      if (mini) mini.outerHTML = miniHtml(it, { withUsed: mini.querySelectorAll("button").length > 2 });
      el.classList.toggle("done", isUsed(it));
    });
  }

  // ---------- Aktionen ----------
  function toggleSave(it) {
    if (state.saved[it.id]) { delete state.saved[it.id]; toast("Aus Merkliste entfernt"); }
    else { state.saved[it.id] = snapshot(it); toast("Gemerkt"); }
    saveState();
  }
  function toggleIdea(it) {
    if (state.ideas[it.id]) { delete state.ideas[it.id]; toast("Aus Ideen entfernt"); }
    else { state.ideas[it.id] = { item: snapshot(it), note: "", done: false, createdAt: new Date().toISOString() }; toast("In Ideenliste"); }
    saveState();
  }
  function toggleUsed(it) {
    if (state.used[it.id]) { delete state.used[it.id]; toast("Wieder offen"); }
    else { state.used[it.id] = new Date().toISOString(); toast("Als erledigt markiert"); }
    saveState();
  }

  function markdownExport() {
    const ideas = Object.values(state.ideas).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const today = new Date().toISOString().slice(0, 10);
    const lines = [`# Videoideen aus dem News-Hub`, ``, `Exportiert am ${dateOnly(new Date().toISOString())}, ${ideas.length} Ideen.`, ``];
    const block = (idea) => {
      const it = idea.item;
      const out = [`## ${titleText(it)}`, ``];
      if (it.ai?.titleDe) out.push(`- Original: ${it.title}`);
      out.push(`- Status: ${idea.done ? "gedreht" : "offen"}`);
      if (it.source) out.push(`- Quelle: ${it.source}${it.publishedAt ? `, ${dateOnly(it.publishedAt)}` : ""}`);
      if (it.url) out.push(`- Link: ${it.url}`);
      if (it.category) out.push(`- Kategorie: ${catLabel(it.category)}`);
      if (it.ai?.summary) out.push(`- Kurz: ${it.ai.summary}`);
      if (it.ai?.hook) out.push(`- Hook: ${it.ai.hook}`);
      out.push(`- Notiert: ${dateOnly(idea.createdAt)}`);
      if (idea.note?.trim()) out.push(``, idea.note.trim());
      out.push(``);
      return out.join("\n");
    };
    const open = ideas.filter((i) => !i.done);
    const done = ideas.filter((i) => i.done);
    if (open.length) lines.push(...open.map(block));
    if (done.length) lines.push(`# Gedreht`, ``, ...done.map(block));
    return { text: lines.join("\n"), filename: `${today} Videoideen News-Hub.md` };
  }

  async function exportCopy() {
    const { text } = markdownExport();
    try {
      await navigator.clipboard.writeText(text);
      toast("Markdown kopiert");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(ok ? "Markdown kopiert" : "Kopieren nicht möglich");
    }
  }

  async function exportFile() {
    const { text, filename } = markdownExport();
    const file = new File([text], filename, { type: "text/markdown" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Datei wird gespeichert");
  }

  $main.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.closest("[data-id]")?.dataset.id;
    const it = id ? itemsById.get(id) || state.saved[id] || state.ideas[id]?.item : null;
    const route = currentRoute();

    if (action === "save" && it) { toggleSave(it); if (route.view === "gemerkt") render(); else refreshItem(id); }
    else if (action === "idea" && it) { toggleIdea(it); refreshItem(id); }
    else if (action === "used" && it) { toggleUsed(it); refreshItem(id); }
    else if (action === "toggle-done") { state.showDone = !state.showDone; saveState(); render(); }
    else if (action === "more") { visibleCount += PAGE_SIZE; render(); }
    else if (action === "export-copy") exportCopy();
    else if (action === "export-file") exportFile();
    else if (action === "idea-done" && id && state.ideas[id]) { state.ideas[id].done = !state.ideas[id].done; saveState(); render(); }
    else if (action === "idea-remove" && id && state.ideas[id]) { delete state.ideas[id]; saveState(); render(); toast("Idee entfernt"); }
  });

  $main.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip[data-cat]");
    if (!chip) return;
    state.category = chip.dataset.cat;
    visibleCount = PAGE_SIZE;
    saveState();
    render();
  });

  let searchTimer = null;
  $main.addEventListener("input", (e) => {
    if (e.target.id === "search") {
      clearTimeout(searchTimer);
      const value = e.target.value;
      searchTimer = setTimeout(() => {
        state.query = value;
        visibleCount = PAGE_SIZE;
        saveState();
        const active = document.activeElement === e.target;
        const pos = e.target.selectionStart;
        render();
        if (active) {
          const input = document.getElementById("search");
          input?.focus();
          try { input?.setSelectionRange(pos, pos); } catch {}
        }
      }, 180);
    }
    if (e.target.dataset.action === "note") {
      const id = e.target.closest("[data-id]")?.dataset.id;
      if (id && state.ideas[id]) {
        state.ideas[id].note = e.target.value;
        saveState();
      }
    }
  });

  $main.addEventListener("submit", (e) => {
    if (e.target.id !== "new-idea") return;
    e.preventDefault();
    const input = e.target.querySelector("input[name=title]");
    const title = input.value.trim();
    if (!title) return;
    const id = `own-${Date.now().toString(36)}`;
    state.ideas[id] = { item: { id, title, source: "", url: "", category: "", publishedAt: null, ai: null, image: null }, note: "", done: false, createdAt: new Date().toISOString() };
    saveState();
    render();
    toast("Idee hinzugefügt");
  });

  $main.addEventListener("keydown", (e) => {
    if (e.target.id === "search" && e.key === "Enter") e.target.blur();
  });

  window.addEventListener("hashchange", () => { visibleCount = PAGE_SIZE; render(); });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      state.lastVisit = new Date().toISOString();
      saveState();
    } else if (Date.now() - sessionStart > 60000) {
      loadData();
    }
  });
  window.addEventListener("pagehide", () => {
    state.lastVisit = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  });
  window.addEventListener("online", loadData);
  window.addEventListener("offline", () => { offline = true; renderStatus(); });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((reg) => reg.update().catch(() => {})).catch(() => {});
    });
  }

  renderStatus();
  render();
  loadData();
})();
