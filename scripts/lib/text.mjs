import { createHash } from "node:crypto";

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ndash: "–", mdash: "—",
  hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", euro: "€", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(str = "") {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

export function stripCdata(str = "") {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

export function stripHtml(str = "") {
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Text aus einem Feed-Feld: CDATA weg, HTML weg, Entities doppelt auflösen
// (viele Feeds liefern &amp;quot; o. ä.).
export function cleanText(str = "") {
  return decodeEntities(decodeEntities(stripHtml(stripCdata(str)))).replace(/\s+/g, " ").trim();
}

export function truncate(str = "", max = 280) {
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + " …";
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|source$|cmpid|ocid|ns_|ito$|at_)/i;

export function normalizeUrl(url = "") {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^(www|m|amp)\./, "");
    let s = u.toString();
    if (u.search === "") s = s.replace(/\?$/, "");
    return s.replace(/\/+$/, "");
  } catch {
    return url.trim();
  }
}

export function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/[„“”"'’‘«»]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOPWORDS = new Set((
  "der die das den dem des ein eine einer eines einem einen und oder aber auch nicht mit für von vor nach bei aus auf " +
  "ist sind war wird werden hat haben kann können soll sollen muss noch mehr neue neuer neues neuen wie was wer " +
  "the a an and or but not with for from of to in on at by is are was were be been has have had will would can could " +
  "should new more how what who why this that these those its it's about into over after before your you we they " +
  "als auch dass sich sie ihr ihre ihren ihrem ihrer wir uns man schon jetzt nur zum zur im am um"
).split(/\s+/));

export function titleTokens(title = "") {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function sharedTokens(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

export function shortHash(str) {
  return createHash("sha1").update(str).digest("hex").slice(0, 12);
}

export function detectLang(text = "") {
  const t = ` ${text.toLowerCase()} `;
  const de = (t.match(/ (der|die|das|und|nicht|mit|für|ist|sind|eine|einen|auf|wird|bei|nach|auch|sich|oder|wie|neue) /g) || []).length;
  const en = (t.match(/ (the|and|with|for|that|this|from|are|you|your|new|how|what|will|has|about|into|over|after) /g) || []).length;
  if (de === 0 && en === 0) return /[äöüß]/.test(t) ? "de" : "en";
  return de >= en ? "de" : "en";
}
