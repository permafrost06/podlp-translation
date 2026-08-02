import { ConvexClient } from "convex/browser";
import { api as convexApi } from "../../convex/_generated/api";

export interface Language {
  code: string;
  name: string;
  native: string;
}

export interface StringItem {
  type: "string";
  name: string;
  key: string;
  value: string;
  cdata: boolean;
  multiline: boolean;
  translatable: boolean;
  /** Source text is an exact match of the reference string list. */
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
  /** Source text is an exact match of the reference string list. */
  matched?: boolean;
}

export type SchemaItem = StringItem | StringArrayItem;

export type TranslationValue = string | string[];
export type Translations = Record<string, TranslationValue>;

export interface ProgressResponse {
  total: number;
  byLanguage: Record<string, { done: number; total: number }>;
}

class UnauthorizedError extends Error {}

// ---------------------------------------------------------------------------
// Convex client + shared-password token handling
// ---------------------------------------------------------------------------
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
if (!CONVEX_URL) {
  // Fail loud in dev; the app cannot talk to the backend without this.
  console.error("VITE_CONVEX_URL is not set. Run `npx convex dev`.");
}

// HTTP Actions live on the *.convex.site origin, not the *.convex.cloud one.
const SITE_URL = CONVEX_URL
  ? CONVEX_URL.replace(/\.convex\.cloud$/, ".convex.site")
  : "";

const client = new ConvexClient(CONVEX_URL);

const TOKEN_KEY = "podlp-auth-token";
function getToken(): string | undefined {
  return localStorage.getItem(TOKEN_KEY) || undefined;
}
function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Wrap a Convex call, translating the backend "unauthorized" error. */
async function guard<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof Error && /unauthorized/i.test(e.message)) {
      throw new UnauthorizedError("unauthorized");
    }
    throw e;
  }
}

export const api = {
  UnauthorizedError,

  async session(): Promise<{ authenticated: boolean }> {
    const token = getToken();
    if (!token) return { authenticated: false };
    return client.action(convexApi.auth.check, { token });
  },

  async login(password: string): Promise<{ ok: boolean }> {
    const res = await client.action(convexApi.auth.login, { password });
    if (!res.ok || !res.token) throw new Error("Incorrect password");
    setToken(res.token);
    return { ok: true };
  },

  async logout(): Promise<void> {
    setToken(null);
  },

  async schema(): Promise<{ languages: Language[]; schema: SchemaItem[] }> {
    return guard(client.query(convexApi.translations.schema, { token: getToken() }));
  },

  async translations(
    lang: string,
  ): Promise<{ lang: string; translations: Translations }> {
    return guard(
      client.query(convexApi.translations.byLang, { token: getToken(), lang }),
    );
  },

  async allTranslations(): Promise<{
    translations: Record<string, Translations>;
  }> {
    return guard(client.query(convexApi.translations.all, { token: getToken() }));
  },

  async saveTranslations(
    lang: string,
    translations: Translations,
  ): Promise<{ ok: boolean; saved: number }> {
    return guard(
      client.mutation(convexApi.translations.save, {
        token: getToken(),
        lang,
        translations,
      }),
    );
  },

  async progress(): Promise<ProgressResponse> {
    return guard(client.query(convexApi.translations.progress, { token: getToken() }));
  },

  async preview(lang: string): Promise<string> {
    const res = await fetch(this.previewUrl(lang));
    if (res.status === 401) throw new UnauthorizedError("unauthorized");
    if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
    return res.text();
  },

  previewUrl(lang: string): string {
    return `${SITE_URL}/preview/${lang}?token=${encodeURIComponent(getToken() || "")}`;
  },

  downloadUrl(lang: string): string {
    return `${SITE_URL}/download/${lang}?token=${encodeURIComponent(getToken() || "")}`;
  },

  downloadAllUrl(): string {
    return `${SITE_URL}/download-all?token=${encodeURIComponent(getToken() || "")}`;
  },
};
