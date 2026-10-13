import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "../lib/feed.mjs";
import { cleanText, normalizeUrl, normalizeTitle, jaccard, titleTokens } from "../lib/text.mjs";
import { classify, matchesAny } from "../lib/classify.mjs";

test("RSS 2.0 mit CDATA, Entities und Google-News-Quelle", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
    <item><title><![CDATA[Instagram &amp; Reels: neue Funktion]]></title>
      <link>https://www.example.com/a?utm_source=rss&amp;id=1</link>
      <pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Text mit <b>HTML</b> &quot;drin&quot;</p>]]></description>
      <source url="https://example.com">Beispielquelle</source>
    </item></channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Instagram & Reels: neue Funktion");
  assert.equal(items[0].link, "https://www.example.com/a?utm_source=rss&id=1");
  assert.equal(items[0].date, "2026-10-12T10:00:00.000Z");
  assert.equal(items[0].description, 'Text mit HTML "drin"');
  assert.equal(items[0].source, "Beispielquelle");
});

test("Atom mit link rel=alternate und updated", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Neue Kamera</title>
    <link rel="self" href="https://x/self"/><link rel="alternate" href="https://x/artikel"/>
    <updated>2026-10-12T08:00:00Z</updated><summary>Kurz</summary></entry></feed>`;
  const [item] = parseFeed(xml);
  assert.equal(item.link, "https://x/artikel");
  assert.equal(item.date, "2026-10-12T08:00:00.000Z");
});

test("RDF/RSS 1.0 (NDR) und leeres link-Element mit guid", () => {
  const xml = `<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item>
    <title>Hannover: Test</title><link></link><guid>https://ndr.de/x.html</guid><dc:date>2026-10-12T07:00:00+02:00</dc:date></item></rdf:RDF>`;
  const [item] = parseFeed(xml);
  assert.equal(item.link, "https://ndr.de/x.html");
  assert.equal(item.date, "2026-10-12T05:00:00.000Z");
});

test("Google Trends Felder", () => {
  const xml = `<rss><channel><item><title>test trend</title><ht:approx_traffic>200+</ht:approx_traffic>
    <pubDate>Tue, 13 Oct 2026 08:30:00 +0000</pubDate>
    <ht:news_item><ht:news_item_title>Schlagzeile</ht:news_item_title><ht:news_item_url>https://a/b</ht:news_item_url><ht:news_item_source>WDR</ht:news_item_source></ht:news_item>
  </item></channel></rss>`;
  const [item] = parseFeed(xml);
  assert.equal(item.traffic, "200+");
  assert.equal(item.newsItems[0].url, "https://a/b");
});

test("URL-Normalisierung entfernt Tracking und www", () => {
  assert.equal(normalizeUrl("https://www.Example.com/a/?utm_source=x&fbclid=y#top"), "https://example.com/a");
  assert.equal(normalizeUrl("https://example.com/a?id=2&utm_medium=m"), "https://example.com/a?id=2");
});

test("Titel-Ähnlichkeit", () => {
  const a = titleTokens("Anthropic’s Claude AI submitted false murder tip to Philadelphia police");
  const b = titleTokens("Claude sent Philadelphia police a false murder tip");
  assert.ok(jaccard(a, b) > 0.4);
  assert.equal(normalizeTitle("„Hallo“ Welt!"), "hallo welt");
});

test("Klassifizierung mit Wortanfang", () => {
  assert.equal(classify("DJI stellt neue Drohne vor"), "video");
  assert.equal(classify("Instagram ändert den Algorithmus für Reels"), "social");
  assert.equal(classify("Börse: Aktien laden zum Einstieg"), null);
  assert.equal(matchesAny("Threads of fate", ["ads"]), false);
  assert.equal(matchesAny("Meta Ads werden teurer", ["ads"]), true);
  assert.equal(cleanText("a &amp;amp; b"), "a & b");
});
