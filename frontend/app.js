/**
 * app.js — PlagiarismIQ Frontend Logic
 * =====================================
 * Handles:
 *   - Input mode switching (text / file)
 *   - Drag-and-drop & file selection
 *   - API calls to Flask backend
 *   - Rendering results (gauge, stats, terms, table)
 *   - Tab navigation & table filtering
 */

"use strict";

// ─── Config ──────────────────────────────────────────────────────────────────
// Empty string = relative URL — works both locally and behind nginx proxy
const API_BASE = "";

// ─── State ───────────────────────────────────────────────────────────────────
let currentMode = "text";          // "text" | "file"
let fileA = null;
let fileB = null;
let lastResult = null;
let tableFilter = "all";
let allTableRows = [];

// ─── Mode Toggle ─────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;

  document.getElementById("mode-text").classList.toggle("active", mode === "text");
  document.getElementById("mode-file").classList.toggle("active", mode === "file");

  for (const id of ["a", "b"]) {
    const textarea = document.getElementById(`text-${id}`);
    const dropZone = document.getElementById(`drop-${id}`);

    if (mode === "text") {
      textarea.style.display = "block";
      dropZone.classList.remove("active-mode");
    } else {
      textarea.style.display = "none";
      dropZone.classList.add("active-mode");
    }
  }
}

// ─── Word / Char Meta ────────────────────────────────────────────────────────
function updateMeta(id) {
  const text = document.getElementById(`text-${id}`).value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  document.getElementById(`doc-meta-${id}`).textContent =
    `${words.toLocaleString()} words · ${chars.toLocaleString()} chars`;
}

function clearPanel(id) {
  document.getElementById(`text-${id}`).value = "";
  updateMeta(id);
  if (id === "a") fileA = null;
  else fileB = null;
  const fn = document.getElementById(`file-name-${id}`);
  if (fn) { fn.textContent = "No file selected"; fn.classList.add("hidden"); }
}

function copyPanel(id) {
  const text = document.getElementById(`text-${id}`).value;
  if (text) navigator.clipboard.writeText(text).catch(() => {});
}

// ─── File Handling ────────────────────────────────────────────────────────────
function handleFileSelect(event, id) {
  const file = event.target.files[0];
  if (file) loadFile(file, id);
}

function handleDragOver(event, id) {
  event.preventDefault();
  document.getElementById(`drop-${id}`).classList.add("drag-over");
}

function handleDragLeave(event, id) {
  document.getElementById(`drop-${id}`).classList.remove("drag-over");
}

function handleDrop(event, id) {
  event.preventDefault();
  document.getElementById(`drop-${id}`).classList.remove("drag-over");
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file, id);
}

function loadFile(file, id) {
  if (id === "a") fileA = file;
  else fileB = file;

  const fnEl = document.getElementById(`file-name-${id}`);
  fnEl.textContent = `📎 ${file.name}`;
  fnEl.classList.remove("hidden");

  // Also populate the textarea for meta display
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    document.getElementById(`text-${id}`).value = text;
    updateMeta(id);
  };
  reader.readAsText(file);
}

// ─── Main Analysis ────────────────────────────────────────────────────────────
async function runAnalysis() {
  hideError();

  const btn = document.getElementById("analyze-btn");
  btn.classList.add("loading");
  btn.disabled = true;

  try {
    let result;

    if (currentMode === "file" && (fileA || fileB)) {
      result = await analyzeFiles();
    } else {
      result = await analyzeText();
    }

    if (result.error) {
      showError(result.error);
      return;
    }

    lastResult = result;
    renderResults(result);

  } catch (err) {
    showError(`Connection error: ${err.message}. Make sure the Flask API is running on port 5000.`);
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

async function analyzeText() {
  const textA = document.getElementById("text-a").value.trim();
  const textB = document.getElementById("text-b").value.trim();

  if (!textA || !textB) {
    throw new Error("Please provide text in both panels.");
  }

  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text_a: textA, text_b: textB }),
  });

  return res.json();
}

async function analyzeFiles() {
  const fA = fileA || (document.getElementById("file-a").files[0]);
  const fB = fileB || (document.getElementById("file-b").files[0]);

  // Fallback: use textarea text if files not set but text was pasted
  const textA = document.getElementById("text-a").value.trim();
  const textB = document.getElementById("text-b").value.trim();

  if (!fA && !fB) {
    // Fall back to text
    if (!textA || !textB) throw new Error("Please upload both files or paste text.");
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text_a: textA, text_b: textB }),
    });
    return res.json();
  }

  const form = new FormData();
  if (fA) form.append("file_a", fA);
  else form.append("file_a", new Blob([textA], { type: "text/plain" }), "doc_a.txt");
  if (fB) form.append("file_b", fB);
  else form.append("file_b", new Blob([textB], { type: "text/plain" }), "doc_b.txt");

  const res = await fetch(`${API_BASE}/api/analyze-files`, {
    method: "POST",
    body: form,
  });

  return res.json();
}

// ─── Render Results ───────────────────────────────────────────────────────────
function renderResults(r) {
  // Show section
  const section = document.getElementById("results-section");
  section.classList.add("visible");
  section.scrollIntoView({ behavior: "smooth", block: "start" });

  const pct = r.similarity_percent;

  // ── Gauge ──
  animateGauge(pct);

  // ── Verdict ──
  const { verdict, color } = getVerdict(pct);
  document.getElementById("verdict-text").textContent = verdict;
  document.getElementById("verdict-text").style.color = color;
  document.getElementById("score-subtext").textContent =
    `${pct.toFixed(2)}% content overlap detected between the two documents.`;

  // ── Pills ──
  const pillsEl = document.getElementById("score-pills");
  pillsEl.innerHTML = `
    <span class="pill pill-blue">📄 ${r.tokens_a.toLocaleString()} tokens A</span>
    <span class="pill pill-violet">📄 ${r.tokens_b.toLocaleString()} tokens B</span>
    <span class="pill pill-green">🔗 ${r.shared_terms} shared terms</span>
  `;

  // ── Cosine cards ──
  document.getElementById("cosine-raw").textContent = r.raw_cosine.toFixed(6);
  document.getElementById("cosine-angle").textContent = `${r.cosine_angle_degrees.toFixed(2)}°`;
  document.getElementById("angle-interp").textContent =
    `θ = ${r.cosine_angle_degrees.toFixed(2)}° → ${pct.toFixed(2)}% similar`;

  // ── Stats ──
  document.getElementById("stat-tokens-a").textContent = r.tokens_a.toLocaleString();
  document.getElementById("stat-tokens-b").textContent = r.tokens_b.toLocaleString();
  const vocab = (r.unique_terms_a + r.unique_terms_b - r.shared_terms);
  document.getElementById("stat-vocab").textContent = vocab.toLocaleString();
  document.getElementById("stat-shared").textContent = r.shared_terms.toLocaleString();

  // ── Top Terms ──
  renderTermsGrid(r.top_overlapping_terms);

  // ── TF-IDF Table ──
  allTableRows = r.all_term_weights;
  renderTable(allTableRows);

  // ── Math live values ──
  computeLiveValues(r);
}

// ─── SVG Gauge Animation ──────────────────────────────────────────────────────
function animateGauge(pct) {
  const circumference = 2 * Math.PI * 65; // ≈ 408.41
  const fill = document.getElementById("gauge-fill");
  const gaugePct = document.getElementById("gauge-pct");

  // Color based on severity
  const color = gaugeColor(pct);
  fill.style.stroke = color;

  // Animate offset
  const offset = circumference * (1 - pct / 100);
  fill.style.strokeDasharray = `${circumference}`;
  fill.style.strokeDashoffset = `${circumference}`; // start at 0

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.strokeDashoffset = offset;
    });
  });

  // Animate counter
  animateCounter(gaugePct, 0, pct, 1400, (v) => `${v.toFixed(1)}%`);
}

function gaugeColor(pct) {
  if (pct >= 80) return "#ef4444";
  if (pct >= 60) return "#f59e0b";
  if (pct >= 40) return "#f59e0b";
  if (pct >= 20) return "#4f8ef7";
  return "#10b981";
}

function animateCounter(el, from, to, duration, format) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4); // ease-out quart
    el.textContent = format(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Verdict ─────────────────────────────────────────────────────────────────
function getVerdict(pct) {
  if (pct >= 85) return { verdict: "🚨 Highly Plagiarised", color: "#ef4444" };
  if (pct >= 65) return { verdict: "⚠️  Significant Overlap",  color: "#f59e0b" };
  if (pct >= 40) return { verdict: "📋 Moderate Similarity",  color: "#f59e0b" };
  if (pct >= 15) return { verdict: "✅ Minor Overlap",         color: "#4f8ef7" };
  return           { verdict: "🌟 Largely Original",          color: "#10b981" };
}

// ─── Top Terms Grid ───────────────────────────────────────────────────────────
function renderTermsGrid(terms) {
  const grid = document.getElementById("terms-grid");
  if (!terms || terms.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);padding:20px">No overlapping terms found.</p>`;
    return;
  }

  const maxScore = terms[0].joint_score || 1;

  grid.innerHTML = terms.map((t) => {
    const barA = ((t.score_a / maxScore) * 100).toFixed(1);
    const barB = ((t.score_b / maxScore) * 100).toFixed(1);

    return `
      <div class="term-card">
        <div class="term-word">${escHtml(t.term)}</div>
        <div class="term-bar-wrap">
          <div class="term-bar-row">
            <span style="color:var(--accent-blue);font-weight:600">A</span>
            <div class="term-bar-bg">
              <div class="term-bar-fill bar-a" style="width:0%" data-target="${barA}%"></div>
            </div>
            <span class="term-val">${t.score_a.toFixed(4)}</span>
          </div>
          <div class="term-bar-row">
            <span style="color:var(--accent-violet);font-weight:600">B</span>
            <div class="term-bar-bg">
              <div class="term-bar-fill bar-b" style="width:0%" data-target="${barB}%"></div>
            </div>
            <span class="term-val">${t.score_b.toFixed(4)}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Animate bars after next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      grid.querySelectorAll(".term-bar-fill").forEach((bar) => {
        bar.style.transition = "width .8s ease";
        bar.style.width = bar.dataset.target;
      });
    });
  });
}

// ─── TF-IDF Table ────────────────────────────────────────────────────────────
function renderTable(rows) {
  const tbody = document.getElementById("tfidf-tbody");
  const searchVal = document.getElementById("table-search-input").value.toLowerCase();

  const filtered = rows.filter((r) => {
    const matchesFilter =
      tableFilter === "all" ||
      (tableFilter === "shared" && r.shared) ||
      (tableFilter === "unique" && !r.shared);
    const matchesSearch = !searchVal || r.term.includes(searchVal);
    return matchesFilter && matchesSearch;
  });

  tbody.innerHTML = filtered.map((r) => `
    <tr>
      <td class="mono ${r.shared ? "term-shared" : r.weight_a > 0 ? "term-unique-a" : "term-unique-b"}">
        ${escHtml(r.term)}
      </td>
      <td class="mono">${r.weight_a > 0 ? r.weight_a.toFixed(6) : "—"}</td>
      <td class="mono">${r.weight_b > 0 ? r.weight_b.toFixed(6) : "—"}</td>
      <td>
        <span class="pill ${r.shared ? "badge-shared pill-green" : "badge-unique"}" style="font-size:.72rem;padding:3px 10px">
          ${r.shared ? "✓ Shared" : "Unique"}
        </span>
      </td>
    </tr>
  `).join("");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">No matching terms found.</td></tr>`;
  }
}

function filterTable() { renderTable(allTableRows); }

function setFilter(f) {
  tableFilter = f;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  document.getElementById(`chip-${f}`).classList.add("active");
  renderTable(allTableRows);
}

// ─── Math Live Values ─────────────────────────────────────────────────────────
function computeLiveValues(r) {
  // Reconstruct dot product and magnitudes from known values:
  // cos(θ) = dot / (|A| * |B|)  =>  dot = cos * |A| * |B|
  // We store raw_cosine and can back-calculate
  const terms = r.all_term_weights;
  let dot = 0, magA = 0, magB = 0;
  terms.forEach(t => {
    dot  += t.weight_a * t.weight_b;
    magA += t.weight_a ** 2;
    magB += t.weight_b ** 2;
  });
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  document.getElementById("lv-dot").textContent    = dot.toFixed(6);
  document.getElementById("lv-mag-a").textContent  = magA.toFixed(6);
  document.getElementById("lv-mag-b").textContent  = magB.toFixed(6);
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.toggle("active", b.id === `tab-btn-${name}`);
    b.setAttribute("aria-selected", b.id === `tab-btn-${name}`);
  });
  document.querySelectorAll(".tab-content").forEach(c => {
    c.classList.toggle("active", c.id === `tab-${name}`);
  });
}

// ─── Error Handling ───────────────────────────────────────────────────────────
function showError(msg) {
  const banner = document.getElementById("error-banner");
  document.getElementById("error-msg").textContent = msg;
  banner.classList.add("visible");
}

function hideError() {
  document.getElementById("error-banner").classList.remove("visible");
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Keyboard shortcut: Ctrl+Enter to analyse ────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runAnalysis();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
setMode("text");
