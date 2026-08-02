import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { verifyToken } from "./auth";
import { LANGUAGES, LANG_CODES } from "./lib/languages";
import type { SchemaItem, Translations } from "./lib/strings";

async function assertAuth(token: string | undefined) {
  if (!(await verifyToken(token))) {
    throw new Error("unauthorized");
  }
}

/** Reconstruct the ordered SchemaItem[] from the schema table. */
async function loadSchema(ctx: {
  db: { query: (t: "schema") => any };
}): Promise<SchemaItem[]> {
  const rows = await ctx.db.query("schema").collect();
  rows.sort((a: any, b: any) => a.order - b.order);
  return rows.map((r: any) => {
    if (r.type === "string") {
      return {
        type: "string",
        name: r.name,
        key: r.key,
        value: r.value ?? "",
        cdata: !!r.cdata,
        multiline: !!r.multiline,
        translatable: r.translatable,
        matched: r.matched,
      } as SchemaItem;
    }
    return {
      type: "string-array",
      name: r.name,
      key: r.key,
      items: r.items ?? [],
      translatable: r.translatable,
      matched: r.matched,
    } as SchemaItem;
  });
}

/** Build the { [key]: value } map for one language. */
async function loadLangTranslations(
  ctx: { db: { query: (t: "translations") => any } },
  lang: string,
): Promise<Translations> {
  const rows = await ctx.db
    .query("translations")
    .withIndex("by_lang", (q: any) => q.eq("lang", lang))
    .collect();
  const out: Translations = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// --- Schema + language list ---
export const schema = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    await assertAuth(token);
    return { languages: LANGUAGES, schema: await loadSchema(ctx) };
  },
});

// --- All translations (for the grid view) ---
export const all = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    await assertAuth(token);
    const rows = await ctx.db.query("translations").collect();
    const out: Record<string, Translations> = {};
    for (const code of LANG_CODES) out[code] = {};
    for (const r of rows) {
      (out[r.lang] ??= {})[r.key] = r.value;
    }
    return { translations: out };
  },
});

// --- Translations for one language ---
export const byLang = query({
  args: { token: v.optional(v.string()), lang: v.string() },
  handler: async (ctx, { token, lang }) => {
    await assertAuth(token);
    if (!LANG_CODES.has(lang)) throw new Error("unknown language");
    return { lang, translations: await loadLangTranslations(ctx, lang) };
  },
});

// --- Progress summary across all languages ---
export const progress = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    await assertAuth(token);
    const schemaItems = await loadSchema(ctx);
    const translatableStrings = schemaItems.filter(
      (i) => i.translatable && i.type === "string",
    );
    const translatableArrays = schemaItems.filter(
      (i) =>
        i.translatable && i.type === "string-array" && i.name !== "changelog",
    ) as Extract<SchemaItem, { type: "string-array" }>[];

    const totalUnits =
      translatableStrings.length +
      translatableArrays.reduce((n, a) => n + a.items.length, 0);

    const allRows = await ctx.db.query("translations").collect();
    const byLangMap: Record<string, Translations> = {};
    for (const r of allRows) (byLangMap[r.lang] ??= {})[r.key] = r.value;

    const out: Record<string, { done: number; total: number }> = {};
    for (const lang of LANGUAGES) {
      const t = byLangMap[lang.code] || {};
      let done = 0;
      for (const s of translatableStrings) {
        const v0 = t[s.key];
        if (typeof v0 === "string" && v0.trim() !== "") done++;
      }
      for (const a of translatableArrays) {
        const arr = Array.isArray(t[a.key]) ? (t[a.key] as string[]) : [];
        for (let i = 0; i < a.items.length; i++) {
          if (arr[i] && String(arr[i]).trim() !== "") done++;
        }
      }
      out[lang.code] = { done, total: totalUnits };
    }
    return { total: totalUnits, byLanguage: out };
  },
});

// --- Internal helpers for httpActions (download / preview) ---

/** Schema + one language's translations, for XML generation. No auth here;
 *  the httpAction validates the token before calling. */
export const forGenerate = internalQuery({
  args: { lang: v.string() },
  handler: async (ctx, { lang }) => {
    return {
      schema: await loadSchema(ctx),
      translations: await loadLangTranslations(ctx, lang),
    };
  },
});

/** Schema + all languages' translations, for the ZIP download. */
export const forGenerateAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const schemaItems = await loadSchema(ctx);
    const rows = await ctx.db.query("translations").collect();
    const byLang: Record<string, Translations> = {};
    for (const code of LANG_CODES) byLang[code] = {};
    for (const r of rows) (byLang[r.lang] ??= {})[r.key] = r.value;
    return { schema: schemaItems, byLang };
  },
});

// --- Save (merge) translations for a language ---
export const save = mutation({
  args: {
    token: v.optional(v.string()),
    lang: v.string(),
    translations: v.record(
      v.string(),
      v.union(v.string(), v.array(v.string())),
    ),
  },
  handler: async (ctx, { token, lang, translations }) => {
    await assertAuth(token);
    if (!LANG_CODES.has(lang)) throw new Error("unknown language");

    let saved = 0;
    for (const [key, value] of Object.entries(translations)) {
      const existing = await ctx.db
        .query("translations")
        .withIndex("by_lang_key", (q) => q.eq("lang", lang).eq("key", key))
        .unique();

      const isEmpty =
        value === "" ||
        value == null ||
        (Array.isArray(value) && value.every((s) => !s || s.trim() === ""));

      if (isEmpty) {
        // Drop empty values to keep the table tidy.
        if (existing) await ctx.db.delete(existing._id);
        continue;
      }
      if (existing) {
        await ctx.db.patch(existing._id, { value });
      } else {
        await ctx.db.insert("translations", { lang, key, value });
      }
      saved++;
    }
    return { ok: true, saved };
  },
});
