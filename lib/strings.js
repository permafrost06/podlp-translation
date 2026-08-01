"use strict";

/**
 * Parsing and generation of Android strings.xml.
 *
 * We keep this dependency-free and tailored to the specific shape of the
 * PodLP strings.xml (flat <resources> with <string> and <string-array>).
 *
 * Each parsed item is one of:
 *   { type: "string", name, key, value, cdata, multiline, translatable }
 *   { type: "string-array", name, key, items: [{ value, cdata }], translatable }
 *
 * Storage keys are namespaced ("s:<name>" for strings, "a:<name>" for arrays)
 * because the source can contain a <string> and a <string-array> with the same
 * name (e.g. "changelog").
 *
 * `value` is the *inner text* of the element with XML entities decoded, so it
 * is the human-readable source text the translator sees. When the original was
 * wrapped in CDATA, we store the raw CDATA payload (which may contain literal
 * HTML like <b>..</b>) and set cdata=true.
 */

const fs = require("fs");

// ---------------------------------------------------------------------------
// Non-translatable strings: brand names, URLs, and pure format strings.
// These are shown to translators read-only (for context) and copied verbatim
// into every generated language file.
// ---------------------------------------------------------------------------
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

function decodeEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Extract the inner content of a <string> element, distinguishing CDATA from
// plain (entity-encoded) text.
function parseStringInner(raw) {
  const cdataMatch = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdataMatch) {
    return { value: cdataMatch[1], cdata: true };
  }
  // Plain text: Android also allows \' and \" escaping. Convert \' -> ' for
  // display, we re-escape on generation.
  let value = decodeEntities(raw);
  value = value.replace(/\\'/g, "'").replace(/\\"/g, '"');
  return { value, cdata: false };
}

function parse(xml) {
  const items = [];

  // Match <string-array ...>...</string-array> and <string ...>...</string>
  const elementRe =
    /<string-array\s+name="([^"]+)"\s*>([\s\S]*?)<\/string-array>|<string\s+name="([^"]+)"\s*>([\s\S]*?)<\/string>/g;

  let m;
  while ((m = elementRe.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      // string-array
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
      // string
      const name = m[3];
      const inner = parseStringInner(m[4]);
      const multiline =
        inner.value.length > 60 || /\r?\n/.test(inner.value) || /<br\s*\/?>/i.test(inner.value);
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

function parseFile(path) {
  const xml = fs.readFileSync(path, "utf8");
  return parse(xml);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

// Escape text for placement inside a plain (non-CDATA) <string> element.
function escapePlain(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Android requires apostrophes and quotes to be escaped in plain strings.
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

// Render a single value as it should appear inside <string> or <item>.
// If the source used CDATA (contains HTML markup), keep CDATA so markup is
// preserved verbatim. Otherwise emit escaped plain text.
function renderValue(value, cdata) {
  if (cdata) {
    return `<![CDATA[${value}]]>`;
  }
  return escapePlain(value);
}

/**
 * Build a strings.xml for a language.
 * @param {Array} schema  parsed source schema (defines order/structure)
 * @param {Object} translations  map key -> translated value
 *        For string-array, translations["a:name"] is an array of strings.
 */
function generate(schema, translations) {
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"];

  for (const item of schema) {
    if (item.type === "string") {
      let value;
      let cdata = item.cdata;
      const t = translations && translations[item.key];
      if (item.translatable && typeof t === "string" && t !== "") {
        value = t;
        // Preserve the original CDATA-ness. If the source was CDATA (had
        // markup), keep CDATA. Otherwise plain.
      } else {
        // Fall back to the English source (also used for non-translatable).
        value = item.value;
      }
      lines.push(
        `    <string name="${item.name}">${renderValue(value, cdata)}</string>`
      );
    } else if (item.type === "string-array") {
      lines.push(`    <string-array name="${item.name}">`);
      const provided =
        item.translatable && translations && Array.isArray(translations[item.key])
          ? translations[item.key]
          : null;
      item.items.forEach((srcItem, idx) => {
        const value =
          provided && provided[idx] != null && provided[idx] !== ""
            ? provided[idx]
            : srcItem.value;
        lines.push(`        <item>${renderValue(value, srcItem.cdata)}</item>`);
      });
      lines.push(`    </string-array>`);
    }
  }

  lines.push("</resources>");
  return lines.join("\n") + "\n";
}

module.exports = {
  parse,
  parseFile,
  generate,
  NON_TRANSLATABLE,
  escapePlain,
};
