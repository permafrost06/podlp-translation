/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib_languages from "../lib/languages.js";
import type * as lib_schema_data from "../lib/schema_data.js";
import type * as lib_seed_data from "../lib/seed_data.js";
import type * as lib_strings from "../lib/strings.js";
import type * as lib_zip from "../lib/zip.js";
import type * as seed from "../seed.js";
import type * as translations from "../translations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  "lib/languages": typeof lib_languages;
  "lib/schema_data": typeof lib_schema_data;
  "lib/seed_data": typeof lib_seed_data;
  "lib/strings": typeof lib_strings;
  "lib/zip": typeof lib_zip;
  seed: typeof seed;
  translations: typeof translations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
