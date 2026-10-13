// Kleiner RSS/Atom/RDF-Parser ohne Abhängigkeiten. Reicht für Nachrichten-Feeds:
// Titel, Link, Datum, Beschreibung, Quelle (Google News), Autor.
import { cleanText, decodeEntities, stripCdata } from "./text.mjs";

function firstTag(xml, names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = xml.match(re);
    if (m) return m[1];
  }
  return "";
}

function firstTagWithAttrs(xml, name) {
  const re = new RegExp(`<${name}(\\s[^>]*)?(?:\\/>|>([\\s\\S]*?)<\\/${name}>)`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push({ attrs: parseAttrs(m[1] || ""), inner: m[2] || "" });
  return out;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(str))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
  return attrs;
}

function textOf(xml, names) {
  return cleanText(firstTag(xml, names));
}

function rawOf(xml, names) {
  return decodeEntities(stripCdata(firstTag(xml, names))).trim();
}

function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    // Häufige Abweichung: "Mon, 13 Oct 2026 08:00:00 CEST"
    d = new Date(s.replace(/\s(CEST|CET|MEZ|MESZ)$/i, (_, z) => (/CEST|MESZ/i.test(z) ? " +0200" : " +0100")));
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function atomLink(entry) {
  const links = firstTagWithAttrs(entry, "link");
  if (!links.length) return "";
  const alt = links.find((l) => !l.attrs.rel || l.attrs.rel === "alternate");
  return (alt || links[0]).attrs.href || "";
}

function rssLink(item) {
  // <link>…</link> kann leer sein, dann steht die URL oft im guid oder als Atom-Link
  let link = rawOf(item, ["link"]);
  if (!link) {
    const atom = firstTagWithAttrs(item, "atom:link").find((l) => l.attrs.href);
    if (atom) link = atom.attrs.href;
  }
  if (!link) {
    const guid = rawOf(item, ["guid"]);
    if (/^https?:\/\//i.test(guid)) link = guid;
  }
  return link;
}

export function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockTag = isAtom ? "entry" : "item";
  const re = new RegExp(`<${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${blockTag}>`, "gi");
  const items = [];
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const title = textOf(block, ["title"]);
    const link = isAtom ? atomLink(block) : rssLink(block);
    const date = parseDate(
      rawOf(block, ["pubDate", "published", "updated", "dc:date", "dcterms:issued", "lastBuildDate"])
    );
    const description = textOf(block, ["description", "summary", "content:encoded", "content", "media:description"]);
    const sourceTag = firstTagWithAttrs(block, "source")[0];
    const source = sourceTag ? cleanText(sourceTag.inner) : "";
    const sourceUrl = sourceTag?.attrs?.url || "";
    const author = textOf(block, ["dc:creator", "author", "name"]);

    // Google Trends liefert Begriff + Beispiel-Schlagzeilen
    const traffic = textOf(block, ["ht:approx_traffic"]);
    const newsItems = firstTagWithAttrs(block, "ht:news_item").map((n) => ({
      title: textOf(n.inner, ["ht:news_item_title"]),
      url: rawOf(n.inner, ["ht:news_item_url"]),
      source: textOf(n.inner, ["ht:news_item_source"]),
    }));

    if (!title && !link) continue;
    items.push({ title, link, date, description, source, sourceUrl, author, traffic, newsItems });
  }
  return items;
}
