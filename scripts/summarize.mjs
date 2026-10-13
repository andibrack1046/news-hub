#!/usr/bin/env node
// Optional: KI-Zusammenfassung (1 Satz) und Reel-Hook pro Meldung mit Claude.
// Läuft nur, wenn ANTHROPIC_API_KEY gesetzt ist. Kostendeckel über AI_MAX_ITEMS / AI_MAX_REQUESTS.
// Ergebnisse landen im Feld "ai" in public/data/news.json und bleiben über Läufe erhalten.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(ROOT, "public", "data", "news.json");

const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const MAX_ITEMS = clampInt(process.env.AI_MAX_ITEMS, 40, 0, 400);
const MAX_REQUESTS = clampInt(process.env.AI_MAX_REQUESTS, 8, 0, 100);
const BATCH_SIZE = 8;
const MAX_AGE_HOURS = 48;
// Preis für die Kostenschätzung im Log (USD pro 1 Mio Token, Haiku 5.5)
const PRICE = { input: 0.1, output: 0.5 };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function clampInt(v, def, min, max) {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

const SYSTEM = `Du hilfst Andi, einem selbstständigen Videografen und Social-Media-Manager aus Neustadt am Rübenberge (Region Hannover). Seine Kunden sind kleine Betriebe, Vereine und Kommunen; er dreht Reels, Imagefilme und Social-Media-Content und arbeitet viel mit KI-Tools.

Du bekommst Nachrichtenmeldungen und lieferst pro Meldung zwei Dinge auf Deutsch:
1. "summary": ein einziger klarer Satz (max. 160 Zeichen), was passiert ist und warum es für Andi relevant ist. Kein Clickbait, keine Floskeln, kein "Du".
2. "hook": der erste gesprochene Satz eines Reels zu diesem Thema (max. 110 Zeichen). Konkret, neugierig machend, direkt an die Zielgruppe (Unternehmer in der Region oder Creator). Keine Emojis, keine Hashtags, keine Anführungszeichen.

Bei Meldungen, die sich nicht für ein Video eignen (z. B. Aktienkurse, reine Pressemitteilungen ohne Nutzen), setze "hook" auf einen leeren String. Gib ausschließlich das JSON zurück.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          hook: { type: "string" },
        },
        required: ["id", "summary", "hook"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function pickCandidates(items) {
  const cutoff = Date.now() - MAX_AGE_HOURS * 3600000;
  return items
    .filter((it) => !it.ai && it.lead !== false)
    .filter((it) => new Date(it.publishedAt || it.firstSeenAt).getTime() >= cutoff)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_ITEMS);
}

function formatBatch(batch) {
  return batch
    .map((it) => `ID: ${it.id}\nTitel: ${it.title}\nQuelle: ${it.source} (${it.category})\nTeaser: ${it.summary || "-"}`)
    .join("\n\n");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY nicht gesetzt, KI-Schritt übersprungen.");
    return;
  }
  if (MAX_ITEMS === 0 || MAX_REQUESTS === 0) {
    log("AI_MAX_ITEMS oder AI_MAX_REQUESTS ist 0, KI-Schritt übersprungen.");
    return;
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { jsonSchemaOutputFormat } = await import("@anthropic-ai/sdk/helpers/json-schema");
  const client = new Anthropic({ maxRetries: 2, timeout: 90000 });

  const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const candidates = pickCandidates(data.items || []);
  if (!candidates.length) {
    log("Nichts zu tun: alle aktuellen Meldungen haben schon KI-Texte.");
    return;
  }
  log(`Modell ${MODEL}: ${candidates.length} Meldungen in Paketen zu ${BATCH_SIZE}, max. ${MAX_REQUESTS} Anfragen.`);

  const byId = new Map(data.items.map((it) => [it.id, it]));
  let requests = 0;
  let done = 0;
  const usage = { input: 0, output: 0 };
  const now = new Date().toISOString();

  for (let i = 0; i < candidates.length && requests < MAX_REQUESTS; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    requests++;
    try {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low", format: jsonSchemaOutputFormat(SCHEMA) },
        messages: [{ role: "user", content: `Meldungen:\n\n${formatBatch(batch)}` }],
      });
      usage.input += response.usage.input_tokens + (response.usage.cache_creation_input_tokens || 0) + (response.usage.cache_read_input_tokens || 0);
      usage.output += response.usage.output_tokens;
      if (response.stop_reason === "refusal") {
        log(`Paket ${requests}: abgelehnt (${response.stop_details?.category || "ohne Kategorie"}), übersprungen.`);
        continue;
      }
      const parsed = response.parsed_output;
      if (!parsed?.items) {
        log(`Paket ${requests}: keine verwertbare Antwort (stop_reason ${response.stop_reason}).`);
        continue;
      }
      for (const out of parsed.items) {
        const it = byId.get(out.id);
        if (!it) continue;
        const summary = String(out.summary || "").trim().slice(0, 220);
        const hook = String(out.hook || "").trim().slice(0, 160);
        if (!summary) continue;
        it.ai = { summary, hook, model: MODEL, at: now };
        done++;
      }
      log(`Paket ${requests}: ${batch.length} Meldungen, ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
    } catch (err) {
      const status = err?.status ? ` (HTTP ${err.status})` : "";
      log(`Paket ${requests} fehlgeschlagen${status}: ${err?.message || err}`);
      if (err?.status === 401 || err?.status === 403) {
        log("API-Key ungültig oder ohne Rechte, breche KI-Schritt ab.");
        break;
      }
    }
  }

  const cost = (usage.input * PRICE.input + usage.output * PRICE.output) / 1e6;
  data.ai = { model: MODEL, lastRunAt: now, summarized: done, requests, estimatedCostUsd: Math.round(cost * 10000) / 10000 };
  await writeFile(DATA_FILE, JSON.stringify(data), "utf8");
  log(`Fertig: ${done} Meldungen mit KI-Text, ${requests} Anfragen, ca. ${usage.input} Input- und ${usage.output} Output-Token, geschätzt ${cost.toFixed(4)} USD.`);
}

main().catch((err) => {
  // Der KI-Schritt darf die Veröffentlichung nie blockieren
  console.error("KI-Schritt mit Fehler beendet:", err?.message || err);
  process.exitCode = 0;
});
