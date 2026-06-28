// =================================================================
// BenchBuddy AI · Frontend logic (vanilla JS, no build step)
// Features: chat, sources modal, copy/export/print, voice input,
// theme toggle, toasts, keyboard shortcuts, follow-ups, escalation
// submission, KB filtering with category pills, query history.
// =================================================================

const API = {
  health: "/api/health",
  query: "/api/query",
  faqs: "/api/faqs",
  kb: (id) => `/api/kb/${id}`,
  related: (id) => `/api/related/${id}?limit=5`,
  categories: "/api/categories",
  analytics: "/api/analytics",
  samples: "/api/samples",
  escalations: "/api/escalations",
};

const els = {
  chat: document.getElementById("chat"),
  empty: document.getElementById("empty-state"),
  composer: document.getElementById("composer"),
  input: document.getElementById("query-input"),
  sendBtn: document.getElementById("send-btn"),
  voiceBtn: document.getElementById("voice-btn"),
  charCounter: document.getElementById("char-counter"),
  clearBtn: document.getElementById("clear-btn"),
  copyLastBtn: document.getElementById("copy-last-btn"),
  kbStatus: document.getElementById("kb-status"),
  appVersion: document.getElementById("app-version"),
  kbSizePill: document.getElementById("kb-size-pill"),
  kbCount: document.getElementById("kb-count"),
  chips: document.getElementById("sample-chips"),
  catChips: document.getElementById("cat-chips"),
  kbGrid: document.getElementById("kb-grid"),
  kbSearch: document.getElementById("kb-search"),
  kbFilters: document.getElementById("kb-filters"),
  refreshAnalytics: document.getElementById("refresh-analytics"),
  metrics: document.getElementById("metrics"),
  catBars: document.getElementById("cat-bars"),
  recentList: document.getElementById("recent-list"),
  statusDonut: document.getElementById("status-donut"),
  refreshTickets: document.getElementById("refresh-tickets"),
  ticketsList: document.getElementById("tickets-list"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalClose: document.getElementById("modal-close"),
  toasts: document.getElementById("toasts"),
  themeBtn: document.getElementById("theme-toggle"),
  shortcutBtn: document.getElementById("shortcut-btn"),
  exportBtn: document.getElementById("export-btn"),
  printBtn: document.getElementById("print-btn"),
  statKB: document.getElementById("stat-kb"),
  statQ: document.getElementById("stat-queries"),
  statT: document.getElementById("stat-tickets"),
  onboard: document.getElementById("onboard"),
  onboardDismiss: document.getElementById("onboard-dismiss"),
};

// State
let faqCache = null;
let categoriesCache = null;
let activeCategoryFilter = null;
let queryHistory = [];
let queryHistoryIdx = -1;
let lastAnswer = null;          // most recent bot reply payload
let conversation = [];          // [{role, text, data?, ts}]
let queriesAsked = 0;
let ticketsSubmitted = 0;

// ============================================================
// Boot
// ============================================================
async function boot() {
  initTheme();
  initKeyboardShortcuts();
  initOnboarding();

  try {
    const h = await fetch(API.health).then((r) => r.json());
    els.kbStatus.textContent = `Knowledge base: ${h.kb_size} FAQs loaded`;
    els.appVersion.textContent = h.version;
    if (els.kbSizePill) els.kbSizePill.textContent = `${h.kb_size} FAQs`;
    if (els.kbCount) els.kbCount.textContent = h.kb_size;
    els.statKB.textContent = h.kb_size;
  } catch {
    els.kbStatus.textContent = "Knowledge base unavailable";
    toast("Backend unreachable", "error");
  }

  try {
    const s = await fetch(API.samples).then((r) => r.json());
    renderChips(s.samples || []);
  } catch {}

  try {
    categoriesCache = await fetch(API.categories).then((r) => r.json());
    renderCatChips(categoriesCache.categories || []);
  } catch {}
}

function renderChips(samples) {
  els.chips.innerHTML = "";
  samples.forEach((q) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = q;
    chip.addEventListener("click", () => {
      els.input.value = q;
      submitQuery(q);
    });
    els.chips.appendChild(chip);
  });
}

function renderCatChips(cats) {
  els.catChips.innerHTML = "";
  cats.slice(0, 10).forEach((c) => {
    const b = document.createElement("button");
    b.className = "badge badge-category";
    b.dataset.cat = c.name;
    b.textContent = `${c.name} (${c.count})`;
    b.style.cursor = "pointer";
    b.addEventListener("click", () => {
      switchTab("kb");
      activeCategoryFilter = c.name;
      paintKBFilters();
      drawKB(faqCache || [], els.kbSearch.value);
    });
    els.catChips.appendChild(b);
  });
}

// ============================================================
// Tabs
// ============================================================
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === tab)
  );
  if (tab === "kb") renderKB();
  if (tab === "analytics") renderAnalytics();
  if (tab === "tickets") renderTickets();
}

// ============================================================
// Composer
// ============================================================
els.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;
  submitQuery(q);
});

els.input.addEventListener("input", () => {
  els.charCounter.textContent = `${els.input.value.length}/500`;
});

els.input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && queryHistory.length) {
    e.preventDefault();
    queryHistoryIdx = Math.min(queryHistoryIdx + 1, queryHistory.length - 1);
    els.input.value = queryHistory[queryHistoryIdx];
    els.charCounter.textContent = `${els.input.value.length}/500`;
  } else if (e.key === "ArrowDown" && queryHistory.length) {
    e.preventDefault();
    queryHistoryIdx = Math.max(queryHistoryIdx - 1, -1);
    els.input.value = queryHistoryIdx === -1 ? "" : queryHistory[queryHistoryIdx];
    els.charCounter.textContent = `${els.input.value.length}/500`;
  }
});

els.clearBtn.addEventListener("click", () => {
  els.chat.innerHTML = "";
  if (els.empty) {
    els.empty.style.display = "";   // re-show after submitQuery hid it
    els.chat.appendChild(els.empty);
  }
  conversation = [];
  lastAnswer = null;
  queryHistoryIdx = -1;
  els.input.value = "";
  els.charCounter.textContent = "0/500";
  els.input.focus();
  toast("Chat cleared", "info");
});

els.copyLastBtn.addEventListener("click", () => copyLastAnswer());

async function submitQuery(query) {
  if (els.empty && els.empty.parentNode === els.chat) {
    els.empty.style.display = "none";
  }
  pushUser(query);
  queryHistory.unshift(query);
  queryHistoryIdx = -1;
  els.input.value = "";
  els.charCounter.textContent = "0/500";
  els.sendBtn.disabled = true;
  const typing = pushTyping();
  try {
    const resp = await fetch(API.query, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    typing.remove();
    pushBot(data);
    lastAnswer = data;
    queriesAsked++;
    els.statQ.textContent = queriesAsked;
  } catch (err) {
    typing.remove();
    pushBot({
      answer: `Sorry — I hit an error: ${err.message}`,
      confidence_pct: 0,
      confidence: 0,
      category: "Unknown",
      status: "OutOfScope",
      sources: [],
      sentiment: "neutral",
      latency_ms: 0,
      timestamp: new Date().toISOString(),
      query_id: "err",
    });
    toast("Request failed: " + err.message, "error");
  } finally {
    els.sendBtn.disabled = false;
    els.input.focus();
  }
}

// ============================================================
// Render messages
// ============================================================
function pushUser(text) {
  const tpl = document.getElementById("msg-user-template");
  const node = tpl.content.cloneNode(true);
  node.querySelector(".msg-text").textContent = text;
  node.querySelector(".msg-time").textContent = formatTime(new Date());
  els.chat.appendChild(node);
  conversation.push({ role: "user", text, ts: Date.now() });
  scrollChat();
}

function pushTyping() {
  const tpl = document.getElementById("typing-template");
  const node = tpl.content.cloneNode(true);
  els.chat.appendChild(node);
  const ref = els.chat.lastElementChild;
  scrollChat();
  return ref;
}

function pushBot(data) {
  const tpl = document.getElementById("msg-bot-template");
  const node = tpl.content.cloneNode(true);

  const catBadge = node.querySelector(".badge-category");
  catBadge.textContent = data.category || "Unknown";
  catBadge.dataset.cat = data.category || "Unknown";

  const statusBadge = node.querySelector(".badge-status");
  statusBadge.textContent = statusLabel(data.status);
  statusBadge.dataset.status = data.status;

  const sentBadge = node.querySelector(".badge-sentiment");
  sentBadge.textContent = data.sentiment;
  sentBadge.dataset.sent = data.sentiment;

  const latBadge = node.querySelector(".badge-latency");
  latBadge.textContent = `${data.latency_ms} ms`;

  node.querySelector(".msg-text").innerHTML = formatAnswer(data.answer);

  const pct = data.confidence_pct ?? Math.round((data.confidence || 0) * 100);
  node.querySelector(".confidence-pct").textContent = pct + "%";
  const fill = node.querySelector(".confidence-bar-fill");
  setTimeout(() => { fill.style.width = pct + "%"; }, 30);

  const conf = node.querySelector(".confidence");
  conf.title =
    `Raw cosine similarity from TF-IDF retrieval, ` +
    `passed through a logistic squash to map to 0–95%. ` +
    `Boosted by ~5% when a category keyword is in your query.`;

  // === Sources ===
  const sList = node.querySelector(".sources-list");
  const sourcesPanel = node.querySelector(".sources-panel");
  const sourceToggle = node.querySelector(".source-toggle-btn");

  if (data.sources && data.sources.length) {
    data.sources.forEach((s) => {
      const row = document.createElement("button");
      row.className = "source-row";
      row.type = "button";
      row.setAttribute("aria-label", `Open FAQ ${s.question}`);
      row.innerHTML = `
        <div class="source-rank">#${s.rank}</div>
        <div>
          <div><b>${escapeHtml(s.question)}</b></div>
          <div style="color: var(--text-muted); margin-top: 4px;">${escapeHtml(s.answer)}</div>
          <div style="margin-top: 6px;"><span class="badge badge-category" data-cat="${escapeHtml(s.category)}">${escapeHtml(s.category)}</span></div>
        </div>
        <div class="source-score">${(s.score * 100).toFixed(1)}%</div>`;
      row.addEventListener("click", () => openSourceModal(s.id));
      sList.appendChild(row);
    });
    sourceToggle.textContent = `📎 Sources (${data.sources.length})`;
    sourceToggle.addEventListener("click", () => {
      sourcesPanel.hidden = !sourcesPanel.hidden;
      sourceToggle.textContent = sourcesPanel.hidden
        ? `📎 Sources (${data.sources.length})`
        : `📎 Hide sources (${data.sources.length})`;
    });
  } else {
    sourceToggle.hidden = true;
  }

  // === Follow-ups ===
  const followBtn = node.querySelector(".followup-btn");
  const followupsPanel = node.querySelector(".followups-panel");
  const followupsList = followupsPanel.querySelector(".followups-list");
  if (data.sources && data.sources.length) {
    followBtn.hidden = false;
    followBtn.addEventListener("click", async () => {
      if (followupsPanel.hidden) {
        followupsList.innerHTML = `<div style="color: var(--text-muted); font-size:12px;">Loading…</div>`;
        followupsPanel.hidden = false;
        try {
          const rel = await fetch(API.related(data.sources[0].id)).then((r) => r.json());
          followupsList.innerHTML = "";
          if (!rel.length) {
            followupsList.innerHTML = `<div style="color: var(--text-muted); font-size:12px;">No related FAQs.</div>`;
          }
          rel.forEach((r) => {
            const row = document.createElement("div");
            row.className = "followup-row";
            row.innerHTML = `
              <span>${escapeHtml(r.question)}</span>
              <span class="badge badge-category" data-cat="${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>`;
            row.addEventListener("click", () => {
              els.input.value = r.question;
              submitQuery(r.question);
            });
            followupsList.appendChild(row);
          });
        } catch {
          followupsList.innerHTML = `<div style="color: var(--bad); font-size:12px;">Failed to load.</div>`;
        }
      } else {
        followupsPanel.hidden = true;
      }
    });
  }

  // === Copy answer ===
  node.querySelector(".copy-btn").addEventListener("click", () => {
    copyText(data.answer);
    toast("Answer copied to clipboard", "success");
  });

  // === Escalation ===
  if (data.status === "Escalate") {
    const escBtn = node.querySelector(".escalate-btn");
    escBtn.hidden = false;
    escBtn.addEventListener("click", () => openEscalateModal(data));
    if (data.escalation_target) {
      const esc = node.querySelector(".escalation");
      esc.hidden = false;
      esc.querySelector(".escalation-text").textContent =
        `Will route to: ${data.escalation_target} — click "Submit to PMO" to create a ticket.`;
    }
  }

  els.chat.appendChild(node);
  conversation.push({ role: "bot", text: data.answer, data, ts: Date.now() });
  scrollChat();
}

function statusLabel(s) {
  switch (s) {
    case "Answered":   return "✓ Answered";
    case "Escalate":   return "↗ Escalated";
    case "Clarify":    return "? Needs clarification";
    case "OutOfScope": return "○ Out of scope";
    default: return s;
  }
}

function formatAnswer(text) {
  if (!text) return "";
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\n)• /g, "$1<br>• ")
    .replace(/\n/g, "<br>");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function scrollChat() {
  els.chat.scrollTop = els.chat.scrollHeight;
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ============================================================
// Modals
// ============================================================
function openModal(title, bodyHTML) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = bodyHTML;
  els.modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  els.modalBackdrop.hidden = true;
  els.modalBody.innerHTML = "";
  document.body.style.overflow = "";
}

els.modalClose.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});

async function openSourceModal(id) {
  openModal("Knowledge Base · FAQ", `<div style="color: var(--text-muted); font-size: 13px;">Loading…</div>`);
  try {
    const [row, related] = await Promise.all([
      fetch(API.kb(id)).then((r) => r.json()),
      fetch(API.related(id)).then((r) => r.json()),
    ]);
    const html = `
      <div class="kb-detail-block">
        <span class="badge badge-category" data-cat="${escapeHtml(row.category)}">${escapeHtml(row.category)}</span>
        <span class="badge" style="margin-left: 6px;">ID #${row.id}</span>
      </div>
      <div class="kb-detail-block">
        <h4>Question</h4>
        <p><b>${escapeHtml(row.question)}</b></p>
      </div>
      <div class="kb-detail-block">
        <h4>Approved Answer</h4>
        <p>${escapeHtml(row.answer)}</p>
      </div>
      <div class="kb-detail-block">
        <h4>Source</h4>
        <p style="color: var(--text-muted); font-size: 12px;">
          PMO_FAQ_Knowledge_Base*.xlsx · row imported by <code>backend/kb_loader.py</code>.
          This is the verbatim approved text — nothing is paraphrased by the bot.
        </p>
      </div>
      <div class="kb-detail-block">
        <h4>Related FAQs (${related.length})</h4>
        ${
          related.length
            ? related.map((r) => `
              <div class="related-row" data-rel-id="${r.id}">
                <b>${escapeHtml(r.question)}</b>
                <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">${escapeHtml(r.answer)}</div>
              </div>`).join("")
            : `<div style="color: var(--text-muted); font-size: 13px;">No related FAQs in this category.</div>`
        }
      </div>
      <div class="modal-actions">
        <button class="ghost-btn" id="copy-faq-btn">📋 Copy answer</button>
        <button class="btn-primary" id="ask-followup-btn">Ask this question →</button>
      </div>`;
    els.modalBody.innerHTML = html;

    els.modalBody.querySelectorAll(".related-row").forEach((el) => {
      el.addEventListener("click", () => {
        const rid = parseInt(el.dataset.relId, 10);
        openSourceModal(rid);
      });
    });
    els.modalBody.querySelector("#copy-faq-btn").addEventListener("click", () => {
      copyText(`${row.question}\n${row.answer}`);
      toast("FAQ copied to clipboard", "success");
    });
    els.modalBody.querySelector("#ask-followup-btn").addEventListener("click", () => {
      closeModal();
      els.input.value = row.question;
      switchTab("chat");
      submitQuery(row.question);
    });
  } catch (e) {
    els.modalBody.innerHTML = `<div style="color: var(--bad);">Failed to load FAQ: ${e.message}</div>`;
  }
}

function openEscalateModal(data) {
  const html = `
    <div class="kb-detail-block">
      <p style="color: var(--text-dim);">Submit this query as an escalation ticket to the PMO team. You will receive a ticket id you can quote when following up.</p>
    </div>
    <div class="kb-detail-block">
      <h4>Your question</h4>
      <p>${escapeHtml(data.query || data.answer || "")}</p>
      <div style="margin-top: 6px;">
        <span class="badge badge-category" data-cat="${escapeHtml(data.category)}">${escapeHtml(data.category)}</span>
        <span class="badge badge-status" data-status="${escapeHtml(data.status)}">${statusLabel(data.status)}</span>
      </div>
    </div>
    <label>Your name</label>
    <input type="text" id="esc-name" placeholder="e.g. Aditya Yadav" />
    <label>Email / Teams handle</label>
    <input type="email" id="esc-email" placeholder="aditya.yadav@epam.com" />
    <label>Additional notes (optional)</label>
    <textarea id="esc-notes" placeholder="Any context that will help PMO act on this faster…"></textarea>
    <div class="modal-actions">
      <button class="ghost-btn" id="esc-cancel">Cancel</button>
      <button class="btn-primary" id="esc-submit">🚨 Submit to PMO</button>
    </div>`;
  openModal("Escalate to PMO", html);
  els.modalBody.querySelector("#esc-cancel").addEventListener("click", closeModal);
  els.modalBody.querySelector("#esc-submit").addEventListener("click", async () => {
    const body = {
      query_id: data.query_id || "ad-hoc",
      query: data.query || data.answer || "",
      category: data.category || "General",
      associate_name: els.modalBody.querySelector("#esc-name").value,
      associate_email: els.modalBody.querySelector("#esc-email").value,
      notes: els.modalBody.querySelector("#esc-notes").value,
    };
    try {
      const resp = await fetch(API.escalations, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const ticket = await resp.json();
      ticketsSubmitted++;
      els.statT.textContent = ticketsSubmitted;
      closeModal();
      toast(`Ticket ${ticket.ticket_id} created · ETA ${ticket.eta_hours}h`, "success");
    } catch (e) {
      toast("Failed to submit: " + e.message, "error");
    }
  });
}

function openShortcutsModal() {
  openModal(
    "Keyboard shortcuts",
    `<ul class="kbd-list" style="list-style:none;padding:0;">
      <li><span class="kbd">/</span> focus the question box</li>
      <li><span class="kbd">↑</span> <span class="kbd">↓</span> browse query history</li>
      <li><span class="kbd">Esc</span> close any modal</li>
      <li><span class="kbd">Cmd/Ctrl</span>+<span class="kbd">K</span> filter Knowledge Base</li>
      <li><span class="kbd">Cmd/Ctrl</span>+<span class="kbd">L</span> clear chat</li>
      <li><span class="kbd">Cmd/Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">C</span> copy last answer</li>
      <li><span class="kbd">G</span> then <span class="kbd">C</span>/<span class="kbd">K</span>/<span class="kbd">A</span>/<span class="kbd">T</span> jump to tab</li>
      <li><span class="kbd">T</span> toggle theme</li>
      <li><span class="kbd">V</span> start voice input</li>
      <li><span class="kbd">?</span> open this card</li>
    </ul>`
  );
}

// ============================================================
// Toast notifications
// ============================================================
function toast(msg, kind = "info", ttl = 2800) {
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  els.toasts.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    t.style.transition = "all 0.18s ease";
    setTimeout(() => t.remove(), 250);
  }, ttl);
}

// ============================================================
// Theme + onboarding
// ============================================================
function initTheme() {
  const saved = localStorage.getItem("bb-theme") || "dark";
  document.documentElement.dataset.theme = saved;
  els.themeBtn.textContent = saved === "dark" ? "🌙" : "☀️";
  els.themeBtn.addEventListener("click", toggleTheme);
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("bb-theme", next);
  els.themeBtn.textContent = next === "dark" ? "🌙" : "☀️";
  toast(`Switched to ${next} mode`, "info", 1600);
}

function initOnboarding() {
  // Show banner only on first visit
  if (!localStorage.getItem("bb-onboard-seen")) {
    els.onboard.hidden = false;
  }
  // ALWAYS bind the dismiss handler — bind once, regardless of visibility,
  // so a click reliably hides the banner and persists the choice.
  els.onboardDismiss.addEventListener("click", (e) => {
    e.preventDefault();
    els.onboard.hidden = true;
    localStorage.setItem("bb-onboard-seen", "1");
    toast("Welcome aboard 👋", "info", 1400);
  });
}

// ============================================================
// Export / Print / Copy
// ============================================================
els.exportBtn.addEventListener("click", () => {
  if (!conversation.length) {
    toast("Nothing to export yet", "info");
    return;
  }
  const blob = new Blob(
    [JSON.stringify({ exported_at: new Date().toISOString(), messages: conversation }, null, 2)],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `benchbuddy-chat-${Date.now()}.json`;
  a.click();
  toast("Chat exported as JSON", "success");
});

els.printBtn.addEventListener("click", () => window.print());

function copyText(t) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(t).catch(() => {});
  } else {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
}

function copyLastAnswer() {
  if (!lastAnswer) {
    toast("No answer to copy yet", "info");
    return;
  }
  copyText(lastAnswer.answer);
  toast("Last answer copied", "success");
}

els.shortcutBtn.addEventListener("click", openShortcutsModal);

// ============================================================
// Voice input (Web Speech API)
// ============================================================
const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Speech) {
  const rec = new Speech();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  let listening = false;

  rec.onresult = (e) => {
    const t = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
    els.input.value = t;
    els.charCounter.textContent = `${t.length}/500`;
    submitQuery(t);
  };
  rec.onerror = () => toast("Voice input error", "error");
  rec.onend = () => {
    listening = false;
    els.voiceBtn.classList.remove("listening");
  };

  els.voiceBtn.addEventListener("click", () => {
    if (listening) {
      rec.stop();
      return;
    }
    try {
      rec.start();
      listening = true;
      els.voiceBtn.classList.add("listening");
      toast("Listening… speak now", "info", 1600);
    } catch {}
  });
} else {
  els.voiceBtn.title = "Voice input not supported in this browser";
  els.voiceBtn.style.opacity = "0.5";
  els.voiceBtn.addEventListener("click", () =>
    toast("Voice input requires Chrome / Edge", "info")
  );
}

// ============================================================
// Keyboard shortcuts (Vim-ish + classic)
// ============================================================
function initKeyboardShortcuts() {
  let lastG = 0;
  document.addEventListener("keydown", (e) => {
    const isTyping = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);

    // Esc closes modal regardless
    if (e.key === "Escape" && !els.modalBackdrop.hidden) {
      closeModal();
      return;
    }

    if (isTyping) return;  // don't steal keys while typing

    // / focus composer
    if (e.key === "/") {
      e.preventDefault();
      switchTab("chat");
      els.input.focus();
      return;
    }

    // ? show shortcuts
    if (e.key === "?") {
      e.preventDefault();
      openShortcutsModal();
      return;
    }

    // T toggle theme
    if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) {
      toggleTheme();
      return;
    }

    // V voice
    if (e.key.toLowerCase() === "v" && !e.metaKey && !e.ctrlKey) {
      els.voiceBtn.click();
      return;
    }

    // E export
    if (e.key.toLowerCase() === "e" && !e.metaKey && !e.ctrlKey) {
      els.exportBtn.click();
      return;
    }

    // P print
    if (e.key.toLowerCase() === "p" && !e.metaKey && !e.ctrlKey) {
      els.printBtn.click();
      return;
    }

    // Cmd/Ctrl combos
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        switchTab("kb");
        setTimeout(() => els.kbSearch.focus(), 50);
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        els.clearBtn.click();
      } else if (e.key.toLowerCase() === "c" && e.shiftKey) {
        e.preventDefault();
        copyLastAnswer();
      }
      return;
    }

    // G then C/K/A/T/?
    if (e.key.toLowerCase() === "g") {
      lastG = Date.now();
      return;
    }
    if (Date.now() - lastG < 900) {
      const map = { c: "chat", k: "kb", a: "analytics", t: "tickets", "?": "about" };
      const tab = map[e.key.toLowerCase()];
      if (tab) {
        switchTab(tab);
        lastG = 0;
      }
    }
  });
}

// ============================================================
// KB tab
// ============================================================
async function renderKB() {
  if (!faqCache) {
    faqCache = await fetch(API.faqs).then((r) => r.json());
  }
  if (!categoriesCache) {
    categoriesCache = await fetch(API.categories).then((r) => r.json());
  }
  paintKBFilters();
  drawKB(faqCache, els.kbSearch.value);
}

function paintKBFilters() {
  els.kbFilters.innerHTML = "";
  const all = document.createElement("button");
  all.className = "cat-pill" + (activeCategoryFilter == null ? " active" : "");
  all.innerHTML = `All <span class="count">${categoriesCache.total}</span>`;
  all.addEventListener("click", () => {
    activeCategoryFilter = null;
    paintKBFilters();
    drawKB(faqCache || [], els.kbSearch.value);
  });
  els.kbFilters.appendChild(all);
  categoriesCache.categories.forEach((c) => {
    const b = document.createElement("button");
    b.className = "cat-pill" + (activeCategoryFilter === c.name ? " active" : "");
    b.innerHTML = `${escapeHtml(c.name)} <span class="count">${c.count}</span>`;
    b.addEventListener("click", () => {
      activeCategoryFilter = activeCategoryFilter === c.name ? null : c.name;
      paintKBFilters();
      drawKB(faqCache || [], els.kbSearch.value);
    });
    els.kbFilters.appendChild(b);
  });
}

els.kbSearch.addEventListener("input", () => {
  drawKB(faqCache || [], els.kbSearch.value);
});

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const safe = escapeHtml(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(safeQ, "ig"), (m) => `<mark>${m}</mark>`);
}

function drawKB(rows, filterText) {
  const q = (filterText || "").toLowerCase().trim();
  els.kbGrid.innerHTML = "";
  const filtered = rows.filter((r) => {
    if (activeCategoryFilter && r.category !== activeCategoryFilter) return false;
    if (!q) return true;
    return `${r.category} ${r.question} ${r.answer}`.toLowerCase().includes(q);
  });
  if (!filtered.length) {
    els.kbGrid.innerHTML = `<div style="color: var(--text-muted); padding: 30px; text-align:center;">No FAQs match this filter.</div>`;
    return;
  }
  filtered.forEach((r) => {
    const card = document.createElement("div");
    card.className = "kb-card";
    card.innerHTML = `
      <span class="badge badge-category" data-cat="${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>
      <div class="kb-q">${highlight(r.question, q)}</div>
      <div class="kb-a">${highlight(r.answer, q)}</div>`;
    card.addEventListener("click", () => openSourceModal(r.id));
    els.kbGrid.appendChild(card);
  });
}

// ============================================================
// Analytics
// ============================================================
els.refreshAnalytics.addEventListener("click", renderAnalytics);

async function renderAnalytics() {
  const a = await fetch(API.analytics).then((r) => r.json());
  els.metrics.innerHTML = "";
  const metric = (label, value, foot = "") => {
    const m = document.createElement("div");
    m.className = "metric";
    m.innerHTML = `
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${foot ? `<div class="metric-foot">${foot}</div>` : ""}`;
    els.metrics.appendChild(m);
  };
  metric("Total queries", a.total_queries);
  metric("Answered", a.answered, `${pctOf(a.answered, a.total_queries)}%`);
  metric("Escalated", a.escalated, `${pctOf(a.escalated, a.total_queries)}%`);
  metric("Clarified", a.clarified, `${pctOf(a.clarified, a.total_queries)}%`);
  metric("Out of scope", a.out_of_scope, `${pctOf(a.out_of_scope, a.total_queries)}%`);
  metric("Avg confidence", `${a.average_confidence || 0}%`);
  metric("Avg latency", `${Math.round(a.average_latency_ms || 0)} ms`);

  els.catBars.innerHTML = "";
  const max = Math.max(1, ...Object.values(a.by_category || {}));
  Object.entries(a.by_category || {})
    .sort((x, y) => y[1] - x[1])
    .forEach(([cat, n]) => {
      const row = document.createElement("div");
      row.className = "cat-bar";
      row.innerHTML = `
        <span class="badge badge-category" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</span>
        <div class="bar"><div class="bar-fill" style="width: ${(n / max) * 100}%"></div></div>
        <div style="text-align: right; color: var(--text-dim)">${n}</div>`;
      els.catBars.appendChild(row);
    });
  if (!Object.keys(a.by_category || {}).length) {
    els.catBars.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">No queries yet — ask something on the Chat tab.</div>`;
  }

  renderDonut(a);

  els.recentList.innerHTML = "";
  (a.recent || []).forEach((r) => {
    const row = document.createElement("div");
    row.className = "recent-row";
    row.innerHTML = `
      <div class="recent-q" title="${escapeHtml(r.query)}">${escapeHtml(r.query)}</div>
      <div class="recent-meta">
        <span class="badge badge-category" data-cat="${escapeHtml(r.category)}">${escapeHtml(r.category)}</span>
        <span class="badge badge-status" data-status="${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
        <span class="badge">${r.confidence_pct}%</span>
      </div>`;
    els.recentList.appendChild(row);
  });
  if (!(a.recent || []).length) {
    els.recentList.innerHTML = `<div style="color: var(--text-muted); font-size: 13px;">Nothing here yet.</div>`;
  }
}

function renderDonut(a) {
  const total = a.total_queries || 0;
  els.statusDonut.innerHTML = "";
  if (!total) {
    els.statusDonut.innerHTML = `<div style="color: var(--text-muted); font-size:13px;">No data yet.</div>`;
    return;
  }
  const segments = [
    { label: "Answered",   value: a.answered,     color: "#34d399" },
    { label: "Escalated",  value: a.escalated,    color: "#f87171" },
    { label: "Clarified",  value: a.clarified,    color: "#fbbf24" },
    { label: "OutOfScope", value: a.out_of_scope, color: "#94a3b8" },
  ];
  let acc = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (acc / total) * 100;
      acc += s.value;
      const end = (acc / total) * 100;
      return `${s.color} ${start}% ${end}%`;
    })
    .join(", ");
  const donut = document.createElement("div");
  donut.className = "donut";
  donut.style.background = `conic-gradient(${stops || "#94a3b8 0% 100%"})`;
  donut.innerHTML = `<div class="donut-center"><div class="num">${total}</div><div class="label">Total</div></div>`;
  const legend = document.createElement("div");
  legend.className = "donut-legend";
  legend.innerHTML = segments
    .map((s) => `<div><span class="swatch" style="background:${s.color}"></span>${s.label} · ${s.value} (${pctOf(s.value, total)}%)</div>`)
    .join("");
  els.statusDonut.appendChild(donut);
  els.statusDonut.appendChild(legend);
}

function pctOf(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ============================================================
// Tickets
// ============================================================
els.refreshTickets.addEventListener("click", renderTickets);

async function renderTickets() {
  try {
    const data = await fetch(API.escalations).then((r) => r.json());
    els.statT.textContent = data.total || 0;
    els.ticketsList.innerHTML = "";
    if (!data.tickets?.length) {
      els.ticketsList.innerHTML = `<div class="ticket-empty">No escalation tickets yet. Submit one from any escalated answer.</div>`;
      return;
    }
    data.tickets.forEach((t) => {
      const card = document.createElement("div");
      card.className = "ticket-card";
      card.innerHTML = `
        <div class="ticket-id">${escapeHtml(t.ticket_id)}</div>
        <div class="ticket-q">${escapeHtml(t.query)}</div>
        <div class="ticket-meta">
          <span class="badge badge-category" data-cat="${escapeHtml(t.category)}">${escapeHtml(t.category)}</span>
          <span class="badge">${escapeHtml(t.status)}</span>
          <span class="badge">→ ${escapeHtml(t.routed_to)}</span>
          <span class="badge">ETA ${t.eta_hours}h</span>
          <span style="margin-left:auto;">${escapeHtml(t.submitted_at)}</span>
        </div>
        ${t.notes ? `<div style="margin-top:8px; color: var(--text-dim); font-size: 12.5px;">📝 ${escapeHtml(t.notes)}</div>` : ""}`;
      els.ticketsList.appendChild(card);
    });
  } catch (e) {
    els.ticketsList.innerHTML = `<div class="ticket-empty" style="color: var(--bad);">Failed to load tickets: ${e.message}</div>`;
  }
}

// ============================================================
// Boot it
// ============================================================
boot();
