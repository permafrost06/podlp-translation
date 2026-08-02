import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyToken } from "./auth";
import { LANG_CODES, LANGUAGES } from "./lib/languages";
import { generate } from "./lib/strings";
import { createZip } from "./lib/zip";

const http = httpRouter();

function unauthorized() {
  return new Response("unauthorized", { status: 401 });
}

async function requireAuth(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    undefined;
  return verifyToken(token);
}

// Single language strings.xml (download).
http.route({
  pathPrefix: "/download/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!(await requireAuth(request))) return unauthorized();
    const url = new URL(request.url);
    const lang = url.pathname.replace(/^\/download\//, "");
    if (!LANG_CODES.has(lang)) return new Response("unknown language", { status: 404 });

    const { schema, translations } = await ctx.runQuery(
      internal.translations.forGenerate,
      { lang },
    );
    const xml = generate(schema, translations);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="strings-${lang}.xml"`,
      },
    });
  }),
});

// Preview XML (text) for a language without triggering download.
http.route({
  pathPrefix: "/preview/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!(await requireAuth(request))) return unauthorized();
    const url = new URL(request.url);
    const lang = url.pathname.replace(/^\/preview\//, "");
    if (!LANG_CODES.has(lang)) return new Response("unknown language", { status: 404 });

    const { schema, translations } = await ctx.runQuery(
      internal.translations.forGenerate,
      { lang },
    );
    const xml = generate(schema, translations);
    return new Response(xml, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }),
});

// All languages as a ZIP laid out as values-<code>/strings.xml.
http.route({
  path: "/download-all",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!(await requireAuth(request))) return unauthorized();
    const { schema, byLang } = await ctx.runQuery(
      internal.translations.forGenerateAll,
      {},
    );
    const files = LANGUAGES.map((lang) => ({
      name: `values-${lang.code}/strings.xml`,
      data: generate(schema, byLang[lang.code] || {}),
    }));
    const zip = createZip(files);
    return new Response(zip as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="podlp-translations.zip"',
      },
    });
  }),
});

export default http;
