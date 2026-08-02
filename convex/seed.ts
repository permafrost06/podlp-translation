import { internalMutation } from "./_generated/server";
import { SCHEMA } from "./lib/schema_data";
import { SEED_TRANSLATIONS } from "./lib/seed_data";

/**
 * Seed (or re-seed) the source schema and initial translations.
 *
 *   pnpm seed          # -> npx convex run seed:run
 *
 * Idempotent: wipes the `schema` table and re-inserts, and upserts the seed
 * translations without clobbering newer edits already present for other keys.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // --- schema table: full replace ---
    const existingSchema = await ctx.db.query("schema").collect();
    for (const doc of existingSchema) await ctx.db.delete(doc._id);

    SCHEMA.forEach((item, order) => {
      if (item.type === "string") {
        ctx.db.insert("schema", {
          order,
          type: "string",
          name: item.name,
          key: item.key,
          translatable: item.translatable,
          matched: !!item.matched,
          value: item.value,
          cdata: item.cdata,
          multiline: item.multiline,
        });
      } else {
        ctx.db.insert("schema", {
          order,
          type: "string-array",
          name: item.name,
          key: item.key,
          translatable: item.translatable,
          matched: !!item.matched,
          items: item.items,
        });
      }
    });

    // --- translations: upsert seed values ---
    let inserted = 0;
    let updated = 0;
    for (const [lang, byKey] of Object.entries(SEED_TRANSLATIONS)) {
      for (const [key, value] of Object.entries(byKey)) {
        if (value === "" || value == null) continue;
        const existing = await ctx.db
          .query("translations")
          .withIndex("by_lang_key", (q) =>
            q.eq("lang", lang).eq("key", key),
          )
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, { value });
          updated++;
        } else {
          await ctx.db.insert("translations", { lang, key, value });
          inserted++;
        }
      }
    }

    return {
      schemaEntries: SCHEMA.length,
      translationsInserted: inserted,
      translationsUpdated: updated,
    };
  },
});
