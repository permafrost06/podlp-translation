import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyToken } from "./auth";
import { LANG_CODES, LANGUAGES } from "./lib/languages";
import { generate } from "./lib/strings";
import { createZip } from "./lib/zip";

const http = httpRouter();

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Merge CORS headers into a Response. */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Handler for CORS preflight (OPTIONS) requests. */
const corsPreflight = httpAction(async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
});

function unauthorized() {
  return new Response("unauthorized", { status: 401, headers: CORS_HEADERS });
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
    if (!LANG_CODES.has(lang))
      return withCors(new Response("unknown language", { status: 404 }));

    const { schema, translations } = await ctx.runQuery(
      internal.translations.forGenerate,
      { lang },
    );
    const xml = generate(schema, translations);
    return withCors(
      new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="strings-${lang}.xml"`,
        },
      }),
    );
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
    if (!LANG_CODES.has(lang))
      return withCors(new Response("unknown language", { status: 404 }));

    const { schema, translations } = await ctx.runQuery(
      internal.translations.forGenerate,
      { lang },
    );
    const xml = generate(schema, translations);
    return withCors(
      new Response(xml, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
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
    return withCors(
      new Response(zip as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="podlp-translations.zip"',
        },
      }),
    );
  }),
});

// CORS preflight handlers.
http.route({ pathPrefix: "/download/", method: "OPTIONS", handler: corsPreflight });
http.route({ pathPrefix: "/preview/", method: "OPTIONS", handler: corsPreflight });
http.route({ path: "/download-all", method: "OPTIONS", handler: corsPreflight });

export default http;
