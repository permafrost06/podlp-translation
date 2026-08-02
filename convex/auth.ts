import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Single shared-password auth (mirrors the original Express behavior).
 *
 * There are no per-user accounts. A correct password yields a stateless
 * HMAC-signed token that the client stores and passes to protected
 * queries/mutations/httpActions, where `verifyToken` re-validates it.
 *
 * Env vars (set in the Convex dashboard):
 *   TRANSLATOR_PASSWORD  shared password (default "podlp")
 *   SESSION_SECRET       HMAC signing key (falls back to a fixed dev value)
 */

const PAYLOAD = "ok";

function getSecret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-session-secret";
}

function getPassword(): string {
  return process.env.TRANSLATOR_PASSWORD || "podlp";
}

async function hmac(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeToken(): Promise<string> {
  return `${PAYLOAD}.${await hmac(PAYLOAD)}`;
}

/** Validate a token produced by makeToken(). Safe to call anywhere. */
export async function verifyToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (payload !== PAYLOAD || !sig) return false;
  const expected = await hmac(PAYLOAD);
  return timingSafeEqual(sig, expected);
}

/** Exchange a password for a session token. */
export const login = action({
  args: { password: v.string() },
  handler: async (_ctx, { password }) => {
    const expected = getPassword();
    const ok =
      password.length === expected.length &&
      timingSafeEqual(password, expected);
    if (!ok) return { ok: false as const };
    return { ok: true as const, token: await makeToken() };
  },
});

/** Check whether a token is still valid (for boot-time session restore). */
export const check = action({
  args: { token: v.optional(v.string()) },
  handler: async (_ctx, { token }) => {
    return { authenticated: await verifyToken(token) };
  },
});
