import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const arrayItem = v.object({
  value: v.string(),
  cdata: v.boolean(),
});

export default defineSchema({
  // Source schema parsed from strings.xml, one document per entry.
  // `order` preserves the original document order for generation.
  schema: defineTable({
    order: v.number(),
    type: v.union(v.literal("string"), v.literal("string-array")),
    name: v.string(),
    key: v.string(),
    translatable: v.boolean(),
    matched: v.boolean(),
    // string only:
    value: v.optional(v.string()),
    cdata: v.optional(v.boolean()),
    multiline: v.optional(v.boolean()),
    // string-array only:
    items: v.optional(v.array(arrayItem)),
  }).index("by_key", ["key"]),

  // Translations, one document per (lang, key).
  // value is a string for <string>, or string[] for <string-array>.
  translations: defineTable({
    lang: v.string(),
    key: v.string(),
    value: v.union(v.string(), v.array(v.string())),
  })
    .index("by_lang", ["lang"])
    .index("by_lang_key", ["lang", "key"]),
});
