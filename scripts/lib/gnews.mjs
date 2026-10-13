// Google-News-RSS liefert nur Weiterleitungs-URLs (news.google.com/rss/articles/…).
// Hier werden sie in die echte Artikel-URL aufgelöst (zwei Anfragen pro Artikel) und gecacht.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const CACHE_MAX_AGE_DAYS = 21;
const CACHE_MAX_ENTRIES = 3000;

export function googleNewsId(url) {
  const m = String(url).match(/news\.google\.com\/(?:rss\/)?articles\/([^/?#]+)/);
  return m ? m[1] : null;
}

export async function resolveGoogleNewsUrl(id, timeoutMs = 10000) {
  const page = await fetch(`https://news.google.com/rss/articles/${id}`, {
    headers: { "user-agent": UA, "accept-language": "de-DE,de;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!page.ok) throw new Error(`HTTP ${page.status}`);
  const html = await page.text();
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  const did = html.match(/data-n-a-id="([^"]+)"/)?.[1] || id;
  if (!sg || !ts) {
    // Ältere Kennungen enthalten die URL direkt in der Base64-Kodierung
    const direct = decodeLegacy(id);
    if (direct) return direct;
    throw new Error("Signatur nicht gefunden");
  }
  const inner = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    did,
    Number(ts),
    sg,
  ]);
  const body = new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", inner, null, "generic"]]]) });
  const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (batchexecute)`);
  const txt = await res.text();
  const m = txt.match(/\[\\"garturlres\\",\\"([^\\"]+)\\"/) || txt.match(/"garturlres","([^"]+)"/);
  if (!m) throw new Error("Keine URL in der Antwort");
  const url = m[1].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
  if (!/^https?:\/\//i.test(url)) throw new Error("Ungültige URL");
  return url;
}

function decodeLegacy(id) {
  try {
    const buf = Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    const m = buf.match(/https?:\/\/[\x21-\x7e]+/);
    if (m && !m[0].startsWith("https://news.google.com")) return m[0];
  } catch {}
  return null;
}

export async function loadCache(file) {
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function saveCache(file, cache) {
  const cutoff = Date.now() - CACHE_MAX_AGE_DAYS * 86400000;
  const entries = Object.entries(cache)
    .filter(([, v]) => v && v.at && new Date(v.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b[1].at) - new Date(a[1].at))
    .slice(0, CACHE_MAX_ENTRIES);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(Object.fromEntries(entries)), "utf8");
}
