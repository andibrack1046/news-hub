// Schlagwort-Klassifizierung für Quellen, die mehrere Themen mischen (heise, t3n, HN …).
// Reihenfolge = Priorität bei Mehrfachtreffern. Erweiterbar über sources.json ("keywords").
export const CATEGORY_KEYWORDS = {
  region: [
    "hannover", "neustadt", "rübenberge", "ruebenberge", "wunstorf", "garbsen", "langenhagen", "wedemark",
    "nienburg", "burgdorf", "lehrte", "laatzen", "seelze", "steinhuder", "mardorf", "poggenhagen",
    "region hannover", "leine", "96 ", "hannover 96", "recken", "messe hannover", "maschsee",
  ],
  ki: [
    "ki-", " ki ", "künstliche intelligenz", "kuenstliche intelligenz", " ai ", "ai-", "artificial intelligence",
    "chatgpt", "openai", "gpt-", "claude", "anthropic", "gemini", "deepmind", "llm", "sprachmodell",
    "sora", "veo", "runway", "kling", "higgsfield", "midjourney", "stable diffusion", "flux", "pika", "luma",
    "elevenlabs", "suno", "copilot", "nano banana", "ki-video", "ai video", "generative", "generativ",
    "machine learning", "neural", "mistral", "llama", "grok", "perplexity", "notebooklm", "agent",
  ],
  social: [
    "instagram", "tiktok", "youtube", "reels", "shorts", "threads", "facebook", "snapchat", "linkedin",
    "creator", "influencer", "algorithmus", "algorithm", "social media", "social-media", "follower",
    "twitter", "bluesky", "pinterest", "twitch", "whatsapp", "meta ", "metas ", "zuckerberg", "mosseri",
    "kurzvideo", "short-form", "subscriber", "abonnenten", "livestream", "podcast",
  ],
  video: [
    "kamera", "camera", "sony", "canon", "nikon", "fujifilm", "fuji ", "panasonic", "lumix", "blackmagic",
    "dji", "drohne", "drone", "gimbal", "objektiv", "lens", "premiere pro", "final cut", "davinci", "resolve",
    "capcut", "iphone", "ipad", "macbook", "mac mini", "mac studio", "apple", "mikrofon", "microphone", "rode",
    "licht", "lighting", "filmmaking", "filmemacher", "videograf", "cinematography", "cinema", "lut", "4k", "8k",
    "osmo", "insta360", "gopro", "sigma", "tamron", "zeiss", "leica", "atomos", "aputure", "godox", "sennheiser",
  ],
  marketing: [
    "ads", "werbung", "anzeigen", "leadgen", "lead ", "leads", "marketing", "kampagne", "campaign", "roas", "cpm",
    "conversion", "funnel", "seo", "google business", "local business", "kleine unternehmen",
    "mittelstand", "kmu", "recruiting", "employer branding", "kunden gewinnen", "akquise", "advertiser",
    "werbetreibende", "performance marketing", "retargeting", "landingpage", "landing page", "crm",
  ],
  trends: [
    "viral", "trend", "meme", "challenge", "hype", "popkultur", "pop culture", "promi", "celebrity", "gossip",
    "netflix", "kino", "charts", "song", "sound", "tiktok-trend", "internet", "slang", "drama", "skandal",
  ],
};

// Treffer nur am Wortanfang ("ads" trifft nicht "heads", "kamera" trifft "kameras").
const regexCache = new Map();
function keywordRegex(word) {
  let re = regexCache.get(word);
  if (!re) {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "iu");
    regexCache.set(word, re);
  }
  return re;
}

export function hasKeyword(text, word) {
  return keywordRegex(word).test(text);
}

export function classify(text, { fallback = null, order = Object.keys(CATEGORY_KEYWORDS) } = {}) {
  let best = null;
  let bestScore = 0;
  for (const cat of order) {
    const words = CATEGORY_KEYWORDS[cat] || [];
    let score = 0;
    for (const w of words) if (hasKeyword(text, w)) score += w.trim().length > 5 ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best ?? fallback;
}

export function matchesAny(text, keywords = []) {
  return keywords.some((k) => hasKeyword(text, k));
}

// Wörter, die auf "heiße" Meldungen hindeuten (kleiner Bonus im Score)
export const HOT_WORDS = [
  "neu", "new ", "launch", "startet", "vorgestellt", "announces", "introducing", "update", "feature", "funktion",
  "algorithmus", "algorithm", "offiziell", "official", "verbot", "ban", "leak", "erstmals", "first", "rekord",
  "kostenlos", "free", "preis", "price", "release", "veröffentlicht", "rollout", "beta",
];
