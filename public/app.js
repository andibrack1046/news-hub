/* News-Hub: Oberfläche. Kein Framework, keine Abhängigkeiten.
   Daten: ./data/news.json (von scripts/fetch.mjs). Zustand: localStorage. */
(() => {
  "use strict";

  const DATA_URL = "./data/news.json";
  const STORE_KEY = "newshub.v1";
  const TODAY_HOURS = 36;
  const TODAY_HOURS_FALLBACK = 72;
  const TODAY_MAX = 8;
  const PAGE_SIZE = 40;

  const $main = document.getElementById("main");
  const $status = document.getElementById("status");
  const $toast = document.getElementById("toast");

  // ---------- Zustand ----------
  const defaultState = () => ({
    saved: {},     // id -> Meldung (Kopie, damit sie nach 7 Tagen nicht verloren geht)
    ideas: {},     // id -> { item, note, done, createdAt }
    used: {},      // id -> Zeitstempel "erledigt/verwendet"
    lastVisit: null,
    showDone: false,
    category: "all",
    query: "",
  });
  let state = loadState();
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
      } catch (err) {
        toast("Speichern im Browser fehlgeschlagen");
      }
    }, 80);
  }

  // ---------- Helfer ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  const fullDate = (iso) =>
    iso ? new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
  const when = (it) => it.publishedAt || it.firstSeenAt;
  const catLabel = (id) => data.categories.find((c) => c.id === id)?.label || id;
  const isNew = (it) => previousVisit && it.firstSeenAt && new Date(it.firstSeenAt).getTime() > new Date(previousVisit).getTime();
  const isUsed = (it) => Boolean(state.used[it.id]);
  const isSaved = (it) => Boolean(state.saved[it.id]);
  const isIdea = (it) => Boolean(state.ideas[it.id]);

  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, 2200);
  }

  function snapshot(it) {
    const { title, url, source, category, publishedAt, firstSeenAt, summary, ai, id, discussionUrl } = it;
    return { id, title, url, source, category, publishedAt, firstSeenAt, summary, ai: ai || null, discussionUrl };
  }

  // ---------- Daten ----------
  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.offline) throw new Error("offline");
      data = json;
      offline = false;
    } catch (err) {
      offline = true;
      if (!data.items.length) {
        // Service Worker liefert ggf. den letzten Stand, sonst leer
        try {
          const cached = await caches?.match?.(DATA_URL);
          if (cached) data = await cached.json();
        } catch {}
      }
    }
    itemsById = new Map(data.items.map((it) => [it.id, it]));
    // Kopien in Merkliste/Ideen mit frischen Daten (z. B. KI-Text) auffrischen
    for (const id of Object.keys(state.saved)) if (itemsById.has(id)) state.saved[id] = snapshot(itemsById.get(id));
    for (const id of Object.keys(state.ideas)) if (itemsById.has(id)) state.ideas[id].item = snapshot(itemsById.get(id));
    renderStatus();
    render();
  }

  function renderStatus() {
    if (!data.generatedAt) {
      $status.textContent = offline ? "Offline, keine Daten" : "Keine Daten";
      $status.classList.toggle("offline", offline);
      return;
    }
    const failed = data.stats?.sourcesFailed?.length || 0;
    $status.textContent = `${offline ? "Offline · " : ""}Stand ${timeAgo(data.generatedAt)}${failed ? ` · ${failed} Quellen gestört` : ""}`;
    $status.title = `Zuletzt aktualisiert: ${fullDate(data.generatedAt)}`;
    $status.classList.toggle("offline", offline);
  }

  // ---------- Auswahl ----------
  function currentTab() {
    const h = (location.hash || "#heute").slice(1);
    return ["heute", "alle", "gemerkt", "ideen"].includes(h) ? h : "heute";
  }

  function pickToday(items) {
    const now = Date.now();
    const leads = items.filter((it) => it.lead !== false && !isUsed(it));
    const within = (hours) => leads.filter((it) => now - new Date(when(it)).getTime() < hours * 3600000);
    let pool = within(TODAY_HOURS);
    if (pool.length < 5) pool = within(TODAY_HOURS_FALLBACK);
    pool.sort((a, b) => b.score - a.score);
    const perCat = {};
    const perSource = {};
    const out = [];
    for (const it of pool) {
      if ((perCat[it.category] || 0) >= 3) continue;
      if ((perSource[it.source] || 0) >= 2) continue;
      perCat[it.category] = (perCat[it.category] || 0) + 1;
      perSource[it.source] = (perSource[it.source] || 0) + 1;
      out.push(it);
      if (out.length >= TODAY_MAX) break;
    }
    return out;
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

  // ---------- Darstellung ----------
  function card(it, { top = false, compact = false } = {}) {
    const used = isUsed(it);
    const rel = relatedOf(it);
    const ai = it.ai && (it.ai.summary || it.ai.hook);
    return `
<article class="card${top ? " top" : ""}${used ? " done" : ""}${compact ? " compact" : ""}" data-id="${esc(it.id)}">
  <h2 class="title"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h2>
  <p class="meta">
    ${isNew(it) ? '<span class="new">Neu</span><span>·</span>' : ""}
    <span>${esc(catLabel(it.category))}</span><span>·</span>
    <span>${esc(it.source)}</span><span>·</span>
    <time datetime="${esc(when(it))}" title="${esc(fullDate(when(it)))}">${esc(timeAgo(when(it)))}</time>
    ${it.alsoIn?.length ? `<span>·</span><span>auch bei ${esc(it.alsoIn.join(", "))}</span>` : ""}
  </p>
  ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ""}
  ${ai ? `<div class="ai">${it.ai.summary ? `<p>${esc(it.ai.summary)}</p>` : ""}${it.ai.hook ? `<p><span class="bar">Hook</span>${esc(it.ai.hook)}</p>` : ""}</div>` : ""}
  ${rel.length ? `<details class="related"><summary>${rel.length === 1 ? "1 ähnliche Meldung" : `${rel.length} ähnliche Meldungen`}</summary><ul>${rel
    .map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}<span>${esc(r.source)} · ${esc(timeAgo(when(r)))}</span></a></li>`)
    .join("")}</ul></details>` : ""}
  <div class="actions">
    <button class="pill" data-action="save" aria-pressed="${isSaved(it)}">${isSaved(it) ? "Gemerkt" : "Merken"}</button>
    <button class="pill" data-action="idea" aria-pressed="${isIdea(it)}">${isIdea(it) ? "In Ideen" : "Videoidee"}</button>
    <button class="pill quiet" data-action="used" aria-pressed="${used}">${used ? "Erledigt" : "Erledigt?"}</button>
  </div>
</article>`;
  }

  function viewHeute() {
    const items = data.items;
    const top = pickToday(items);
    const topIds = new Set(top.map((t) => t.id));
    const newCount = previousVisit ? items.filter(isNew).length : 0;
    const sub = !items.length
      ? offline ? "Offline und noch kein gespeicherter Stand." : "Noch keine Daten. Der erste Abruf läuft oder ist fehlgeschlagen."
      : newCount
        ? `${newCount} neue Meldungen seit deinem letzten Besuch.`
        : `${items.length} Meldungen aus den letzten Tagen, ${data.stats?.sourcesOk ?? "?"} Quellen.`;

    const extra = data.categories
      .map((c) => {
        const rows = items
          .filter((it) => it.category === c.id && it.lead !== false && !topIds.has(it.id) && !isUsed(it))
          .filter((it) => Date.now() - new Date(when(it)).getTime() < 48 * 3600000)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        if (!rows.length) return "";
        return `<h2 class="section-title">${esc(c.label)}</h2><div class="rows">${rows
          .map((it) => `<a class="row" href="${esc(it.url)}" target="_blank" rel="noopener" data-id="${esc(it.id)}"><b>${esc(it.title)}</b><span>${esc(it.source)} · ${esc(timeAgo(when(it)))}</span></a>`)
          .join("")}</div>`;
      })
      .join("");

    const failed = data.stats?.sourcesFailed || [];
    return `
<div class="view-head"><h1>Was heute <span class="bar">zählt</span></h1><p>${esc(sub)}</p></div>
${top.length ? `<div class="list single">${top.map((it) => card(it, { top: true })).join("")}</div>` : `<div class="empty">Gerade nichts Heißes. Schau unter Alle nach.</div>`}
${extra ? `<h2 class="section-title" style="margin-top:34px">Außerdem</h2>${extra}` : ""}
<p class="note">${data.generatedAt ? `Zuletzt aktualisiert ${esc(fullDate(data.generatedAt))}. ` : ""}${failed.length ? `<b>Gestört:</b> ${esc(failed.join(", "))}. ` : ""}Aktualisierung alle drei Stunden über GitHub Actions.</p>`;
  }

  function viewAlle() {
    const list = filterAll(data.items);
    const shown = list.slice(0, visibleCount);
    const chips = [{ id: "all", label: "Alle" }, ...data.categories]
      .map((c) => `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="${state.category === c.id}">${esc(c.label)}</button>`)
      .join("");
    return `
<div class="view-head"><h1>Alle <span class="bar">Meldungen</span></h1><p>${list.length} Treffer${state.query ? ` für „${esc(state.query)}“` : ""}.</p></div>
<div class="toolbar">
  <input class="search" id="search" type="search" placeholder="Suchen …" value="${esc(state.query)}" autocomplete="off" autocapitalize="off" enterkeyhint="search">
  <div class="chips">${chips}</div>
</div>
<div class="toolbar-row"><button class="pill small quiet" data-action="toggle-done" aria-pressed="${state.showDone}">${state.showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}</button><span>${Object.keys(state.used).length} erledigt</span></div>
${shown.length ? `<div class="list" style="margin-top:12px">${shown.map((it) => card(it)).join("")}</div>` : `<div class="empty" style="margin-top:12px">Nichts gefunden.</div>`}
${list.length > shown.length ? `<div class="more"><button class="pill" data-action="more">Mehr laden (${list.length - shown.length} weitere)</button></div>` : ""}`;
  }

  function viewGemerkt() {
    const items = Object.values(state.saved).sort((a, b) => new Date(when(b)) - new Date(when(a)));
    return `
<div class="view-head"><h1><span class="bar">Gemerkt</span></h1><p>${items.length ? `${items.length} gespeicherte Meldungen, nur auf diesem Gerät.` : "Noch nichts gemerkt."}</p></div>
${items.length ? `<div class="list">${items.map((it) => card(itemsById.get(it.id) || it)).join("")}</div>` : `<div class="empty">Tippe bei einer Meldung auf Merken. Sie bleibt hier, auch wenn sie aus den News verschwindet.</div>`}`;
  }

  function viewIdeen() {
    const ideas = Object.values(state.ideas).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const open = ideas.filter((i) => !i.done);
    const done = ideas.filter((i) => i.done);
    const ideaCard = (idea) => {
      const it = idea.item;
      return `
<article class="card idea${idea.done ? " done" : ""}" data-id="${esc(it.id)}">
  <h2 class="title">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)}</h2>
  <p class="meta"><span>${esc(it.source || "Eigene Idee")}</span>${it.publishedAt ? `<span>·</span><time>${esc(dateOnly(it.publishedAt))}</time>` : ""}<span>·</span><span>notiert ${esc(timeAgo(idea.createdAt))}</span></p>
  ${it.ai?.hook ? `<p class="hook"><span class="bar">Hook</span> ${esc(it.ai.hook)}</p>` : ""}
  <textarea data-action="note" placeholder="Notiz: Format, Hook, Dreh-Idee, Kunde …" aria-label="Notiz">${esc(idea.note || "")}</textarea>
  <div class="actions">
    <button class="pill" data-action="idea-done" aria-pressed="${idea.done}">${idea.done ? "Gedreht" : "Gedreht?"}</button>
    ${it.url ? `<a class="pill quiet" href="${esc(it.url)}" target="_blank" rel="noopener">Öffnen</a>` : ""}
    <button class="pill quiet" data-action="idea-remove">Entfernen</button>
  </div>
</article>`;
    };
    return `
<div class="view-head"><h1>Deine <span class="bar">Videoideen</span></h1><p>${ideas.length ? `${open.length} offen, ${done.length} gedreht.` : "Noch keine Ideen. Tippe bei einer Meldung auf Videoidee."}</p></div>
<div class="actions" style="margin-bottom:18px">
  <button class="pill primary" data-action="export-copy"${ideas.length ? "" : " disabled"}>Als Markdown kopieren</button>
  <button class="pill" data-action="export-file"${ideas.length ? "" : " disabled"}>Markdown-Datei</button>
</div>
<form class="card new-idea" id="new-idea" style="margin-bottom:18px">
  <input name="title" type="text" placeholder="Eigene Idee festhalten …" aria-label="Eigene Idee" autocomplete="off">
  <div class="actions"><button class="pill" type="submit">Hinzufügen</button></div>
</form>
${open.length ? `<div class="list">${open.map(ideaCard).join("")}</div>` : ""}
${done.length ? `<h2 class="section-title">Gedreht</h2><div class="list">${done.map(ideaCard).join("")}</div>` : ""}
<p class="note">Export für Obsidian: Markdown kopieren und in eine Notiz einfügen, oder die Datei direkt in den Vault legen.</p>`;
  }

  function render() {
    const tab = currentTab();
    document.querySelectorAll(".tabs a").forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    const views = { heute: viewHeute, alle: viewAlle, gemerkt: viewGemerkt, ideen: viewIdeen };
    const scrollY = window.scrollY;
    $main.innerHTML = views[tab]();
    if (render.lastTab === tab) window.scrollTo(0, scrollY);
    else window.scrollTo(0, 0);
    render.lastTab = tab;
    document.title = tab === "heute" ? "News-Hub" : `${{ alle: "Alle", gemerkt: "Gemerkt", ideen: "Ideen" }[tab]} · News-Hub`;
  }

  // Nur eine Karte neu zeichnen, damit Scrollposition und Fokus bleiben
  function rerenderCard(id) {
    const el = $main.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    const it = itemsById.get(id) || state.saved[id] || state.ideas[id]?.item;
    if (!el || !it || el.classList.contains("idea")) return render();
    const top = el.classList.contains("top");
    const compact = el.classList.contains("compact");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = card(it, { top, compact });
    el.replaceWith(wrapper.firstElementChild);
  }

  // ---------- Aktionen ----------
  function toggleSave(it) {
    if (state.saved[it.id]) {
      delete state.saved[it.id];
      toast("Aus Merkliste entfernt");
    } else {
      state.saved[it.id] = snapshot(it);
      toast("Gemerkt");
    }
    saveState();
  }
  function toggleIdea(it) {
    if (state.ideas[it.id]) {
      delete state.ideas[it.id];
      toast("Aus Ideen entfernt");
    } else {
      state.ideas[it.id] = { item: snapshot(it), note: "", done: false, createdAt: new Date().toISOString() };
      toast("In Ideenliste");
    }
    saveState();
  }
  function toggleUsed(it) {
    if (state.used[it.id]) {
      delete state.used[it.id];
      toast("Wieder offen");
    } else {
      state.used[it.id] = new Date().toISOString();
      toast("Als erledigt markiert");
    }
    saveState();
  }

  function markdownExport() {
    const ideas = Object.values(state.ideas).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const today = new Date().toISOString().slice(0, 10);
    const lines = [`# Videoideen aus dem News-Hub`, ``, `Exportiert am ${dateOnly(new Date().toISOString())}, ${ideas.length} Ideen.`, ``];
    const block = (idea) => {
      const it = idea.item;
      const out = [`## ${it.title}`, ``];
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
      // Rückfall: Textfeld markieren
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
    const cardEl = btn.closest("[data-id]");
    const id = cardEl?.dataset.id;
    const it = id ? itemsById.get(id) || state.saved[id] || state.ideas[id]?.item : null;

    if (action === "save" && it) { toggleSave(it); rerenderCard(id); if (currentTab() === "gemerkt" && !state.saved[id]) render(); }
    else if (action === "idea" && it) { toggleIdea(it); rerenderCard(id); }
    else if (action === "used" && it) { toggleUsed(it); rerenderCard(id); }
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
    document.getElementById("search")?.blur();
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
    state.ideas[id] = { item: { id, title, source: "", url: "", category: "", publishedAt: null, ai: null }, note: "", done: false, createdAt: new Date().toISOString() };
    saveState();
    render();
    toast("Idee hinzugefügt");
  });

  // Enter im Suchfeld schließt die Tastatur
  $main.addEventListener("keydown", (e) => {
    if (e.target.id === "search" && e.key === "Enter") e.target.blur();
  });

  window.addEventListener("hashchange", () => { visibleCount = PAGE_SIZE; render(); });

  // Letzten Besuch merken (für „Neu seit deinem letzten Besuch“), Daten beim Zurückkommen auffrischen
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

  render();
  loadData();
})();
