"use strict";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let SCHEMA = [];
let LANGUAGES = [];
let currentLang = null;
let translations = {}; // key -> string | string[]
let dirty = {}; // key -> true (pending save)
let saveTimer = null;

const RTL_LANGS = new Set(["ur"]);

// Regex for Android/printf-style format specifiers, e.g. %1$s %2$d %.1f %d %%
const FORMAT_RE = /%(?:\d+\$)?[-+ 0#]?\d*(?:\.\d+)?[a-zA-Z%]/g;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Highlight format specifiers so translators know to keep them.
function renderSource(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(FORMAT_RE, (m) => `<code>${m}</code>`);
}

function getFormatSpecs(text) {
  return (text.match(FORMAT_RE) || []).sort();
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error("unauthorized");
  }
  return res;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function showLogin() {
  $("#app-view").classList.add("hidden");
  $("#login-view").classList.remove("hidden");
  $("#password").focus();
}

function showApp() {
  $("#login-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#login-error");
  errEl.classList.add("hidden");
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: $("#password").value }),
  });
  if (res.ok) {
    $("#password").value = "";
    await init();
  } else {
    errEl.textContent = "Incorrect password.";
    errEl.classList.remove("hidden");
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("POST", "/api/logout");
  showLogin();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  const sessionRes = await fetch("/api/session");
  const session = await sessionRes.json();
  if (!session.authenticated) {
    showLogin();
    return;
  }
  showApp();

  const schemaRes = await api("GET", "/api/schema");
  const data = await schemaRes.json();
  SCHEMA = data.schema;
  LANGUAGES = data.languages;

  // Populate language selector
  const sel = $("#lang-select");
  sel.innerHTML = "";
  for (const l of LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = `${l.name} (${l.native})`;
    sel.appendChild(opt);
  }

  currentLang = LANGUAGES[0].code;
  sel.value = currentLang;
  await loadLanguage(currentLang);
}

async function loadLanguage(lang) {
  currentLang = lang;
  dirty = {};
  const res = await api("GET", `/api/translations/${lang}`);
  const data = await res.json();
  translations = data.translations || {};
  render();
  updateProgress();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  const container = $("#strings-container");
  const filter = $("#filter").value.trim().toLowerCase();
  const untranslatedOnly = $("#untranslated-only").checked;
  const isRtl = RTL_LANGS.has(currentLang);
  container.innerHTML = "";

  for (const item of SCHEMA) {
    // Filtering
    if (filter) {
      const hay = (
        item.name +
        " " +
        (item.type === "string"
          ? item.value
          : item.items.map((i) => i.value).join(" "))
      ).toLowerCase();
      if (!hay.includes(filter)) continue;
    }

    if (untranslatedOnly && isFullyTranslated(item)) continue;

    container.appendChild(renderRow(item, isRtl));
  }

  if (!container.children.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No strings match the current filter.";
    container.appendChild(empty);
  }
}

function isFullyTranslated(item) {
  if (!item.translatable) return true; // never needs work
  if (item.type === "string") {
    const v = translations[item.key];
    return v != null && String(v).trim() !== "";
  }
  const arr = Array.isArray(translations[item.key]) ? translations[item.key] : [];
  return item.items.every((_, i) => arr[i] != null && String(arr[i]).trim() !== "");
}

function renderRow(item, isRtl) {
  const row = document.createElement("div");
  row.className = "string-row";
  if (!item.translatable) row.classList.add("readonly");

  // Head
  const head = document.createElement("div");
  head.className = "string-head";
  const nameEl = document.createElement("span");
  nameEl.className = "string-name";
  nameEl.textContent = item.name;
  head.appendChild(nameEl);

  if (!item.translatable) {
    head.appendChild(badge("do not translate", "fixed"));
  }
  if (item.type === "string-array") {
    head.appendChild(badge("list", ""));
  }
  if (item.type === "string" && item.cdata) {
    head.appendChild(badge("has HTML", "warn"));
  }
  row.appendChild(head);

  if (item.type === "string") {
    renderStringBody(row, item, isRtl);
  } else {
    renderArrayBody(row, item, isRtl);
  }

  return row;
}

function badge(text, kind) {
  const b = document.createElement("span");
  b.className = "badge" + (kind ? " " + kind : "");
  b.textContent = text;
  return b;
}

function renderStringBody(row, item, isRtl) {
  const src = document.createElement("div");
  src.className = "source-text";
  src.innerHTML = renderSource(item.value);
  row.appendChild(src);

  if (!item.translatable) return;

  const field = item.multiline
    ? document.createElement("textarea")
    : document.createElement("input");
  if (item.multiline) {
    field.className = "target-textarea";
  } else {
    field.type = "text";
    field.className = "target-input";
  }
  if (isRtl) field.classList.add("rtl");
  field.value = translations[item.key] || "";
  field.placeholder = "Translation…";

  const hint = document.createElement("div");
  hint.className = "hint";
  row.appendChild(field);
  row.appendChild(hint);

  const check = () => validateFormat(item.value, field.value, hint);
  check();

  field.addEventListener("input", () => {
    translations[item.key] = field.value;
    check();
    queueSave(item.key);
  });
}

function renderArrayBody(row, item, isRtl) {
  const arr = Array.isArray(translations[item.key])
    ? translations[item.key].slice()
    : [];

  item.items.forEach((srcItem, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "array-item";

    const label = document.createElement("div");
    label.className = "array-item-label";
    label.textContent = `Item ${idx + 1}`;
    wrap.appendChild(label);

    const src = document.createElement("div");
    src.className = "source-text";
    src.innerHTML = renderSource(srcItem.value);
    wrap.appendChild(src);

    if (item.translatable) {
      const multiline = srcItem.value.length > 60 || /<br\s*\/?>/i.test(srcItem.value);
      const field = multiline
        ? document.createElement("textarea")
        : document.createElement("input");
      if (multiline) field.className = "target-textarea";
      else {
        field.type = "text";
        field.className = "target-input";
      }
      if (isRtl) field.classList.add("rtl");
      field.value = arr[idx] || "";
      field.placeholder = "Translation…";

      const hint = document.createElement("div");
      hint.className = "hint";

      const check = () => validateFormat(srcItem.value, field.value, hint);
      check();

      field.addEventListener("input", () => {
        if (!Array.isArray(translations[item.key])) {
          translations[item.key] = new Array(item.items.length).fill("");
        }
        translations[item.key][idx] = field.value;
        check();
        queueSave(item.key);
      });

      wrap.appendChild(field);
      wrap.appendChild(hint);
    }

    row.appendChild(wrap);
  });
}

function validateFormat(source, target, hintEl) {
  if (!target || !target.trim()) {
    hintEl.textContent = "";
    hintEl.className = "hint";
    return;
  }
  const s = getFormatSpecs(source);
  const t = getFormatSpecs(target);
  if (JSON.stringify(s) !== JSON.stringify(t)) {
    hintEl.className = "hint warn";
    hintEl.textContent =
      "⚠ Placeholders must match the source exactly: " +
      (s.length ? s.join(" ") : "(none)");
  } else {
    hintEl.className = "hint";
    hintEl.textContent = "";
  }
}

// ---------------------------------------------------------------------------
// Saving (debounced)
// ---------------------------------------------------------------------------
function queueSave(key) {
  dirty[key] = true;
  setSaveStatus("saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 800);
}

async function flushSave() {
  const keys = Object.keys(dirty);
  if (!keys.length) return;
  const payload = {};
  for (const n of keys) payload[n] = translations[n];
  dirty = {};
  try {
    await api("PUT", `/api/translations/${currentLang}`, { translations: payload });
    setSaveStatus("saved");
    updateProgress();
  } catch (e) {
    setSaveStatus("error");
  }
}

function setSaveStatus(state) {
  const el = $("#save-status");
  el.className = "save-status " + state;
  el.textContent =
    state === "saving"
      ? "Saving…"
      : state === "saved"
      ? "Saved ✓"
      : state === "error"
      ? "Save failed"
      : "";
}

// Save on unload just in case.
window.addEventListener("beforeunload", () => {
  if (Object.keys(dirty).length) {
    const payload = {};
    for (const n of Object.keys(dirty)) payload[n] = translations[n];
    navigator.sendBeacon(
      `/api/translations/${currentLang}`,
      new Blob([JSON.stringify({ translations: payload })], {
        type: "application/json",
      })
    );
  }
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
async function updateProgress() {
  try {
    const res = await api("GET", "/api/progress");
    const data = await res.json();
    const p = data.byLanguage[currentLang];
    if (p) {
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      $("#progress-pill").textContent = `${p.done} / ${p.total} (${pct}%)`;
    }
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
$("#lang-select").addEventListener("change", async (e) => {
  await flushSave();
  await loadLanguage(e.target.value);
});

$("#filter").addEventListener("input", render);
$("#untranslated-only").addEventListener("change", render);

$("#download-btn").addEventListener("click", async () => {
  await flushSave();
  window.location = `/api/download/${currentLang}`;
});

$("#download-all-btn").addEventListener("click", async () => {
  await flushSave();
  window.location = `/api/download-all`;
});

$("#preview-btn").addEventListener("click", async () => {
  await flushSave();
  const res = await api("GET", `/api/preview/${currentLang}`);
  const text = await res.text();
  $("#preview-title").textContent = `values-${currentLang}/strings.xml`;
  $("#preview-content").textContent = text;
  $("#preview-modal").classList.remove("hidden");
});

$("#preview-close").addEventListener("click", () => {
  $("#preview-modal").classList.add("hidden");
});
$("#preview-modal").addEventListener("click", (e) => {
  if (e.target === $("#preview-modal")) $("#preview-modal").classList.add("hidden");
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();
