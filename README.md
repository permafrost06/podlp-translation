# PodLP Translation Tool

A small password-gated web app that lets translators (who don't touch code)
translate the PodLP Android `strings.xml` into Indian languages, and lets you
generate valid Android `strings.xml` files from their submissions.

## Target languages

Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Gujarati, Odia, Urdu.
(Edit `lib/languages.js` to add/remove.)

## Features

- **Password gate** — single shared password (`TRANSLATOR_PASSWORD`).
- **Text field for single-line, textarea for multiline** strings, including
  every item in the `changelog` string-array.
- **Source shown for reference**, with `%1$s` / `%d`-style placeholders
  highlighted and validated (warns if a translation drops/adds a placeholder).
- **HTML-bearing strings** (CDATA, e.g. `about_text`) are preserved verbatim —
  the tool keeps the markup and re-wraps output in CDATA.
- **Non-translatable strings** (brand names, URLs, pure format strings like
  `%.1fGB`) are shown read-only and copied through unchanged.
- **Autosave** to a JSON file; nothing is lost on refresh.
- **RTL editing** for Urdu.
- **Download** one language's `strings.xml`, or **all** as a ZIP laid out as
  `values-<code>/strings.xml` ready to drop into `app/src/main/res/`.

## Stack

- **Backend**: Node + Express (`server.js`) — auth, JSON persistence, XML/ZIP
  generation. No build step.
- **Frontend**: React + TypeScript + Vite + Tailwind + **shadcn/ui** in
  `client/`. Built to `client/dist`, which the server serves as static assets
  (with an SPA fallback). If `client/dist` is missing, the server falls back to
  the legacy static `public/` folder.

## Run locally

Build the frontend once, then run the server:

```sh
cp .env.example .env               # then edit the password/secret
npm install                        # server deps
(cd client && npm install && npm run build)
node server.js                     # http://localhost:3000
```

### Frontend dev mode (hot reload)

Run the API and the Vite dev server side by side. Vite proxies `/api` to the
backend on port 3000:

```sh
node server.js                     # terminal 1 — API on :3000
cd client && npm run dev           # terminal 2 — UI on :5173
```

Open http://localhost:5173 during development.

Environment variables (see `.env.example`):

| Var                   | Meaning                                    | Default              |
| --------------------- | ------------------------------------------ | -------------------- |
| `TRANSLATOR_PASSWORD` | Shared password for translators            | `podlp` (dev only)   |
| `SESSION_SECRET`      | HMAC secret for the auth cookie            | random per boot      |
| `PORT`                | HTTP port                                  | `3000`               |
| `STRINGS_FILE`        | Path to source `strings.xml`               | `./strings.xml`      |
| `DATA_FILE`           | Where submissions are persisted            | `./data/translations.json` |

## Run with Docker

```sh
cp .env.example .env      # set TRANSLATOR_PASSWORD and SESSION_SECRET
docker compose up --build
```

Translations persist in `./data/translations.json` (mounted volume).

## How output is generated

The source `strings.xml` defines the structure and order. For each language the
app emits every `<string>` / `<string-array>`:

- translatable entries use the submitted translation (falling back to English
  if not yet translated);
- non-translatable and untranslated entries fall back to the English source, so
  the generated file is always complete and valid;
- entries whose source used CDATA are re-wrapped in CDATA; plain strings are
  entity-escaped and apostrophes/quotes are `\`-escaped per Android rules.

Note: the source has both a `<string name="changelog">` and a
`<string-array name="changelog">`. Storage keys are namespaced (`s:` for
strings, `a:` for arrays) so they never collide.

Drop the ZIP contents into `app/src/main/res/` and the `values-<code>/` folders
line up with Android's locale qualifiers.
