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
}

export type SchemaItem = StringItem | StringArrayItem;

export type TranslationValue = string | string[];
export type Translations = Record<string, TranslationValue>;

export interface ProgressResponse {
  total: number;
  byLanguage: Record<string, { done: number; total: number }>;
}

class UnauthorizedError extends Error {}

async function request<T>(
  method: string,
  url: string,
  body?: unknown
): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) throw new UnauthorizedError("unauthorized");
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  UnauthorizedError,

  async session(): Promise<{ authenticated: boolean }> {
    return request("GET", "/api/session");
  },

  async login(password: string): Promise<{ ok: boolean }> {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error("Incorrect password");
    return res.json();
  },

  async logout(): Promise<void> {
    await request("POST", "/api/logout");
  },

  async schema(): Promise<{ languages: Language[]; schema: SchemaItem[] }> {
    return request("GET", "/api/schema");
  },

  async translations(
    lang: string
  ): Promise<{ lang: string; translations: Translations }> {
    return request("GET", `/api/translations/${lang}`);
  },

  async saveTranslations(
    lang: string,
    translations: Translations
  ): Promise<{ ok: boolean; saved: number }> {
    return request("PUT", `/api/translations/${lang}`, { translations });
  },

  async progress(): Promise<ProgressResponse> {
    return request("GET", "/api/progress");
  },

  async preview(lang: string): Promise<string> {
    return request("GET", `/api/preview/${lang}`);
  },

  downloadUrl(lang: string): string {
    return `/api/download/${lang}`;
  },

  downloadAllUrl(): string {
    return `/api/download-all`;
  },
};
