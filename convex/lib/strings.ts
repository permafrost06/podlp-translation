/**
 * Generation of Android strings.xml from a parsed schema + translations.
 *
 * Parsing of the source strings.xml happens at build time (see
 * scripts/gen-schema-data.mjs which produces convex/lib/schema_data.ts).
 * The Convex runtime only needs generation, which is dependency-free.
 */

export interface StringItem {
  type: "string";
  name: string;
  key: string;
  value: string;
  cdata: boolean;
  multiline: boolean;
  translatable: boolean;
  matched?: boolean;
}

export interface ArrayItemSource {
  value: string;
  cdata: boolean;
}

export interface StringArrayItem {
  type: "string-array";
  name: string;
  key: string;
  items: ArrayItemSource[];
  translatable: boolean;
  matched?: boolean;
}

export type SchemaItem = StringItem | StringArrayItem;

export type TranslationValue = string | string[];
export type Translations = Record<string, TranslationValue>;

// Escape text for placement inside a plain (non-CDATA) <string> element.
function escapePlain(text: string): string {
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
function renderValue(value: string, cdata: boolean): string {
  if (cdata) {
    return `<![CDATA[${value}]]>`;
  }
  return escapePlain(value);
}

/**
 * Build a strings.xml for a language.
 * @param schema        parsed source schema (defines order/structure)
 * @param translations  map key -> translated value.
 *                      For string-array, translations["a:name"] is an array.
 */
export function generate(
  schema: SchemaItem[],
  translations: Translations | undefined,
): string {
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"];

  for (const item of schema) {
    if (item.type === "string") {
      let value: string;
      const cdata = item.cdata;
      const t = translations && translations[item.key];
      if (item.translatable && typeof t === "string" && t !== "") {
        value = t;
      } else {
        // Fall back to the English source (also used for non-translatable).
        value = item.value;
      }
      lines.push(
        `    <string name="${item.name}">${renderValue(value, cdata)}</string>`,
      );
    } else {
      lines.push(`    <string-array name="${item.name}">`);
      const provided =
        item.translatable &&
        translations &&
        Array.isArray(translations[item.key])
          ? (translations[item.key] as string[])
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
