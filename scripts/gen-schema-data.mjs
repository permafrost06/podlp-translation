// Build-time generator: parse strings.xml + reference matched keys + existing
// bangla translations into static TS modules the Convex backend can seed from.
//
//   node scripts/gen-schema-data.mjs
//
// Outputs:
//   convex/lib/schema_data.ts   (parsed source schema, ordered)
//   convex/lib/seed_data.ts     (initial translations, e.g. bn)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const STRINGS_FILE = path.join(ROOT, "strings.xml");
const DATA_FILE = path.join(ROOT, "data", "translations.json");
const OUT_SCHEMA = path.join(ROOT, "convex", "lib", "schema_data.ts");
const OUT_SEED = path.join(ROOT, "convex", "lib", "seed_data.ts");

// --- Non-translatable set (mirror of the original lib/strings.js) ---
const NON_TRANSLATABLE = new Set([
  "app_name",
  "website_url",
  "podlp_logo",
  "size_in_gb",
  "size_in_mb",
  "size_in_kb",
  "percentage_format",
  "speed_format",
]);

// --- Matched keys (mirror of the original lib/matched-keys.js) ---
const MATCHED_KEYS = new Set([
  "s:app_name","s:podlp_logo","s:settings","s:about","s:close","s:select","s:exit",
  "s:contact_podlp","s:visit","s:play","s:pause","s:resume","s:podcast_thumbnail",
  "s:number_of_episodes","s:number_of_episodes_truncated","s:load_all_episodes",
  "s:network_error","s:menu","s:today","s:yesterday","s:cancel","s:app_language",
  "s:text_size","s:small","s:medium","s:large","s:subscribe","s:sort","s:season",
  "s:all_episodes","s:season_number","s:go_to_podcast_website","s:search",
  "s:search_podcasts","s:shortcut_search_long","s:shortcut_settings_long",
  "s:shortcut_open_app","s:back","s:unsubscribe","s:subscribed_to_podcast",
  "s:duration","s:publish_date","s:size","s:size_in_gb","s:size_in_mb","s:size_in_kb",
  "s:successfully_subscribed","s:successfully_unsubscribed","s:speed","s:system_default",
  "s:light","s:dark","s:theme","s:now_playing","s:completed","s:mark_as_played",
  "s:mark_as_unplayed","s:categories","s:arts","s:business","s:comedy","s:education",
  "s:fiction","s:government","s:health_and_fitness","s:history","s:kids_and_family",
  "s:leisure","s:music","s:news","s:religion_and_spirituality","s:science",
  "s:society_and_culture","s:sports","s:tv_and_film","s:technology","s:true_crime",
  "s:api_service","s:apple_podcasts","s:podcast_index","s:analytics_enabled",
  "s:analytics_enabled_description","s:import_subscriptions",
  "s:import_subscriptions_description","s:export_subscriptions","s:clear_cache",
  "s:clear_cache_description","s:create_contact_shortcut_description",
  "s:importing_podcasts","s:exporting_podcasts","s:import_complete_title",
  "s:import_complete","s:import_cancelled","s:failed_imports",
  "s:opml_no_subscriptions_to_export","s:export_complete","s:ok","s:error",
  "s:opml_import_label","s:opml_no_file_provided","s:parsing_opml",
  "s:subscribe_activity_label","s:subscribe_no_feed_url","s:subscribing_to_podcast",
  "s:subscribe_success_message","s:subscribe_podcast_not_found","s:subscribe_failed",
  "s:update_available_title","s:update_available_message","s:download",
  "s:permission_denied_install_updates","s:podlp_update","s:downloading_new_version",
  "s:downloading_update","s:update_download_failed_reason",
  "s:download_complete_installing","s:update_installed_successfully","s:whats_new",
  "s:changelog","s:privacy_policy","s:terms_of_service","s:invalid_date_title",
  "s:invalid_date_message","s:adjust","s:ad","s:play_next","s:delete_episode",
  "s:downloaded","s:downloading","s:download_failed","s:could_not_download_episode",
  "s:download_complete","s:episode_ready_to_play","s:episodes_to_retain",
  "s:episodes_to_retain_description","s:unlimited","s:debug_delete_all_downloads",
  "s:debug_trigger_auto_download","s:deleted_all_downloads","s:auto_download_triggered",
  "s:recommended_podcasts","s:recommended","s:browse_category",
  "s:no_recommended_podcasts","s:sleep_timer","s:sleep_timer_off",
  "s:sleep_timer_end_of_episode","s:sleep_timer_minutes","s:sleep_timer_hour",
  "s:episode_artwork","s:podcast_artwork","s:muted","s:storage_default",
]);

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseStringInner(raw) {
  const cdataMatch = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdataMatch) return { value: cdataMatch[1], cdata: true };
  let value = decodeEntities(raw);
  value = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
  return { value, cdata: false };
}

function parse(xml) {
  const items = [];
  const elementRe =
    /<string-array\s+name="([^"]+)"\s*>([\s\S]*?)<\/string-array>|<string\s+name="([^"]+)"\s*>([\s\S]*?)<\/string>/g;
  let m;
  while ((m = elementRe.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      const name = m[1];
      const body = m[2];
      const itemRe = /<item\s*>([\s\S]*?)<\/item>/g;
      const arrItems = [];
      let im;
      while ((im = itemRe.exec(body)) !== null) {
        arrItems.push(parseStringInner(im[1]));
      }
      items.push({
        type: "string-array",
        name,
        key: "a:" + name,
        items: arrItems,
        translatable: !NON_TRANSLATABLE.has(name),
      });
    } else {
      const name = m[3];
      const inner = parseStringInner(m[4]);
      const multiline =
        inner.value.length > 60 ||
        /\r?\n/.test(inner.value) ||
        /<br\s*\/?>/i.test(inner.value);
      items.push({
        type: "string",
        name,
        key: "s:" + name,
        value: inner.value,
        cdata: inner.cdata,
        multiline,
        translatable: !NON_TRANSLATABLE.has(name),
      });
    }
  }
  return items;
}

// --- Parse schema and flag matched rows ---
const xml = fs.readFileSync(STRINGS_FILE, "utf8");
const schema = parse(xml);
for (const item of schema) item.matched = MATCHED_KEYS.has(item.key);

// --- Load existing translations to seed (bn and any others present) ---
let seed = {};
try {
  seed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  seed = {};
}

const header = "// AUTO-GENERATED by scripts/gen-schema-data.mjs. Do not edit by hand.\n";

fs.writeFileSync(
  OUT_SCHEMA,
  header +
    'import type { SchemaItem } from "./strings";\n\n' +
    "export const SCHEMA: SchemaItem[] = " +
    JSON.stringify(schema, null, 2) +
    ";\n",
);

fs.writeFileSync(
  OUT_SEED,
  header +
    'import type { Translations } from "./strings";\n\n' +
    "export const SEED_TRANSLATIONS: Record<string, Translations> = " +
    JSON.stringify(seed, null, 2) +
    ";\n",
);

const stringCount = schema.filter((i) => i.type === "string").length;
const arrayCount = schema.filter((i) => i.type === "string-array").length;
console.log(
  `Wrote ${schema.length} schema entries (${stringCount} strings, ${arrayCount} arrays).`,
);
for (const lang of Object.keys(seed)) {
  console.log(`Seed ${lang}: ${Object.keys(seed[lang]).length} keys.`);
}
