"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const strings = require("./lib/strings");
const LANGUAGES = require("./lib/languages");
const MATCHED_KEYS = require("./lib/matched-keys");
const { createZip } = require("./lib/zip");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || "3000", 10);
const PASSWORD = process.env.TRANSLATOR_PASSWORD || "podlp";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const STRINGS_FILE =
  process.env.STRINGS_FILE || path.join(__dirname, "strings.xml");
const DATA_FILE =
  process.env.DATA_FILE || path.join(__dirname, "data", "translations.json");

const LANG_CODES = new Set(LANGUAGES.map((l) => l.code));

// ---------------------------------------------------------------------------
// Load source schema
// ---------------------------------------------------------------------------
const SCHEMA = strings.parseFile(STRINGS_FILE);

// Flag rows whose English source is an exact match of the reference string list
// (see lib/matched-keys.js). Surfaced in the grid with a "matched" badge.
for (const item of SCHEMA) {
  item.matched = MATCHED_KEYS.has(item.key);
}

// ---------------------------------------------------------------------------
// Data persistence: { [langCode]: { [key]: value | string[] } }
// ---------------------------------------------------------------------------
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let DATA = loadData();

// ---------------------------------------------------------------------------
// Auth: signed cookie token
// ---------------------------------------------------------------------------
function makeToken() {
  const payload = "ok";
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (payload !== "ok" || !sig) return false;
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (verifyToken(req.cookies.auth)) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// --- Auth endpoints ---
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  const ok =
    typeof password === "string" &&
    password.length === PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(PASSWORD));
  if (!ok) return res.status(401).json({ error: "Incorrect password" });
  res.cookie("auth", makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("auth");
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  res.json({ authenticated: verifyToken(req.cookies.auth) });
});

// --- Data endpoints (auth required) ---

// Schema + language list.
app.get("/api/schema", requireAuth, (req, res) => {
  res.json({ languages: LANGUAGES, schema: SCHEMA });
});

// Get translations for all languages at once (for the grid view).
app.get("/api/translations", requireAuth, (req, res) => {
  const all = {};
  for (const code of LANG_CODES) all[code] = DATA[code] || {};
  res.json({ translations: all });
});

// Get translations for a language.
app.get("/api/translations/:lang", requireAuth, (req, res) => {
  const lang = req.params.lang;
  if (!LANG_CODES.has(lang)) return res.status(404).json({ error: "unknown language" });
  res.json({ lang, translations: DATA[lang] || {} });
});

// Save (merge) translations for a language.
app.put("/api/translations/:lang", requireAuth, (req, res) => {
  const lang = req.params.lang;
  if (!LANG_CODES.has(lang)) return res.status(404).json({ error: "unknown language" });
  const incoming = (req.body && req.body.translations) || {};
  DATA[lang] = { ...(DATA[lang] || {}), ...incoming };
  // Drop empty values to keep the file tidy.
  for (const k of Object.keys(DATA[lang])) {
    const v = DATA[lang][k];
    if (v === "" || v === null || v === undefined) delete DATA[lang][k];
  }
  saveData(DATA);
  res.json({ ok: true, saved: Object.keys(DATA[lang]).length });
});

// Progress summary across all languages.
app.get("/api/progress", requireAuth, (req, res) => {
  const translatableStrings = SCHEMA.filter((i) => i.translatable && i.type === "string");
  const translatableArrays = SCHEMA.filter(
    (i) => i.translatable && i.type === "string-array" && i.name !== "changelog"
  );
  const totalUnits =
    translatableStrings.length +
    translatableArrays.reduce((n, a) => n + a.items.length, 0);

  const out = {};
  for (const lang of LANGUAGES) {
    const t = DATA[lang.code] || {};
    let done = 0;
    for (const s of translatableStrings) {
      if (t[s.key] && String(t[s.key]).trim() !== "") done++;
    }
    for (const a of translatableArrays) {
      const arr = Array.isArray(t[a.key]) ? t[a.key] : [];
      for (let i = 0; i < a.items.length; i++) {
        if (arr[i] && String(arr[i]).trim() !== "") done++;
      }
    }
    out[lang.code] = { done, total: totalUnits };
  }
  res.json({ total: totalUnits, byLanguage: out });
});

// --- Generation / download ---

// Single language strings.xml
app.get("/api/download/:lang", requireAuth, (req, res) => {
  const lang = req.params.lang;
  if (!LANG_CODES.has(lang)) return res.status(404).send("unknown language");
  const xml = strings.generate(SCHEMA, DATA[lang] || {});
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="strings-${lang}.xml"`
  );
  res.send(xml);
});

// All languages as a ZIP laid out as values-<code>/strings.xml
app.get("/api/download-all", requireAuth, (req, res) => {
  const files = LANGUAGES.map((lang) => ({
    name: `values-${lang.code}/strings.xml`,
    data: strings.generate(SCHEMA, DATA[lang.code] || {}),
  }));
  const zip = createZip(files);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="podlp-translations.zip"'
  );
  res.send(zip);
});

// Preview XML (text) for a language without triggering download.
app.get("/api/preview/:lang", requireAuth, (req, res) => {
  const lang = req.params.lang;
  if (!LANG_CODES.has(lang)) return res.status(404).send("unknown language");
  const xml = strings.generate(SCHEMA, DATA[lang] || {});
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(xml);
});

// --- Static frontend ---
// Prefer the built React/shadcn client; fall back to the legacy static folder.
const CLIENT_DIST = path.join(__dirname, "client", "dist");
const STATIC_DIR = fs.existsSync(path.join(CLIENT_DIST, "index.html"))
  ? CLIENT_DIST
  : path.join(__dirname, "public");
app.use(express.static(STATIC_DIR));

// SPA fallback: serve index.html for any non-API GET route.
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const indexFile = path.join(STATIC_DIR, "index.html");
  if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
  next();
});

app.listen(PORT, () => {
  console.log(`PodLP translation tool listening on http://localhost:${PORT}`);
  console.log(`Loaded ${SCHEMA.length} source entries from ${STRINGS_FILE}`);
  console.log(`Serving frontend from ${STATIC_DIR}`);
  if (!process.env.TRANSLATOR_PASSWORD) {
    console.warn("WARNING: TRANSLATOR_PASSWORD not set; using default 'podlp'.");
  }
});
