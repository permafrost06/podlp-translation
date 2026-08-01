import React from "react";

// Android/printf-style format specifiers, e.g. %1$s %2$d %.1f %d %%
export const FORMAT_RE = /%(?:\d+\$)?[-+ 0#]?\d*(?:\.\d+)?[a-zA-Z%]/g;

export function getFormatSpecs(text: string): string[] {
  return (text.match(FORMAT_RE) || []).sort();
}

export function specsMatch(source: string, target: string): boolean {
  if (!target.trim()) return true;
  const s = getFormatSpecs(source);
  const t = getFormatSpecs(target);
  return JSON.stringify(s) === JSON.stringify(t);
}

// ---------------------------------------------------------------------------
// Placeholder arguments: parse specifiers into distinct positional arguments
// and substitute user-supplied sample values (locale-aware) for a preview.
// ---------------------------------------------------------------------------

export interface FormatArg {
  /** 1-based argument position (explicit "%2$s" or implicit order). */
  position: number;
  /** Conversion letter, lower-cased: s, d, f, x, e, g, c, b, ... */
  conversion: string;
  /** The raw specifier as written, e.g. "%1$s" or "%.1f". */
  raw: string;
  /** A short human label for the input, e.g. "%1$s (text)". */
  label: string;
  /** Number of decimals for float conversions (from ".1f" etc.). */
  precision?: number;
}

const CONVERSION_KIND: Record<string, string> = {
  s: "text",
  d: "number",
  i: "number",
  f: "decimal",
  e: "decimal",
  g: "decimal",
  x: "hex",
  o: "octal",
  c: "char",
  b: "boolean",
};

// Parse a single specifier ("%1$s", "%.1f", "%d") into its parts.
const SPEC_PARTS_RE =
  /^%(?:(\d+)\$)?[-+ 0#]?\d*(?:\.(\d+))?([a-zA-Z])$/;

/**
 * Extract the distinct positional arguments a string expects, in argument
 * order. Repeated references to the same position collapse into one arg.
 * Literal "%%" is ignored (it is an escaped percent, not an argument).
 */
export function getFormatArgs(text: string): FormatArg[] {
  const matches = text.match(FORMAT_RE) || [];
  const byPosition = new Map<number, FormatArg>();
  let implicit = 0;
  for (const raw of matches) {
    if (raw === "%%") continue;
    const m = SPEC_PARTS_RE.exec(raw);
    if (!m) continue;
    const conversion = m[3].toLowerCase();
    const explicit = m[1] ? parseInt(m[1], 10) : undefined;
    const position = explicit ?? ++implicit;
    if (byPosition.has(position)) continue;
    const kind = CONVERSION_KIND[conversion] ?? conversion;
    byPosition.set(position, {
      position,
      conversion,
      raw,
      label: `${raw} (${kind})`,
      precision: m[2] ? parseInt(m[2], 10) : undefined,
    });
  }
  return [...byPosition.values()].sort((a, b) => a.position - b.position);
}

/** Whether a string has any real (non-"%%") format arguments. */
export function hasFormatArgs(text: string): boolean {
  return getFormatArgs(text).length > 0;
}

// Native numbering system per language script, so integer/decimal previews use
// the script's own digits (e.g. Hindi "१०" instead of "10").
const NUMBERING_SYSTEM: Record<string, string> = {
  hi: "deva", // Devanagari
  mr: "deva",
  ta: "tamldec", // Tamil (decimal)
  te: "telu", // Telugu
  ml: "mlym", // Malayalam
  kn: "knda", // Kannada
  gu: "gujr", // Gujarati
  or: "orya", // Odia
  ur: "arabext", // Urdu (Eastern Arabic-Indic)
};

/** Locale tag with the script's native numbering system requested. */
function numericLocale(locale: string): string {
  const base = locale.split("-")[0];
  const nu = NUMBERING_SYSTEM[base];
  return nu ? `${locale}-u-nu-${nu}` : locale;
}

/**
 * Format a single raw sample value for a given specifier using the supplied
 * BCP-47 locale (so numbers use the script's native digits/grouping).
 * Returns the raw value unchanged when it can't be interpreted.
 */
function formatValue(arg: FormatArg, rawValue: string, locale: string): string {
  const value = rawValue;
  if (value === "") return arg.raw; // keep placeholder visible when empty
  const numLocale = numericLocale(locale);
  switch (arg.conversion) {
    case "d":
    case "i": {
      const n = Number(value.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return value;
      return new Intl.NumberFormat(numLocale, {
        maximumFractionDigits: 0,
      }).format(Math.trunc(n));
    }
    case "f":
    case "e":
    case "g": {
      const n = Number(value.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return value;
      const digits = arg.precision ?? undefined;
      return new Intl.NumberFormat(numLocale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits ?? 20,
      }).format(n);
    }
    case "x": {
      const n = Number(value.replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? Math.trunc(n).toString(16) : value;
    }
    case "o": {
      const n = Number(value.replace(/[,\s]/g, ""));
      return Number.isFinite(n) ? Math.trunc(n).toString(8) : value;
    }
    default:
      return value;
  }
}

/**
 * Substitute sample values into a format string, producing preview text.
 * `values` is keyed by argument position (1-based). Missing/blank values keep
 * their placeholder so the preview still reads clearly. `%%` becomes `%`.
 */
export function applyFormat(
  text: string,
  values: Record<number, string>,
  locale: string,
): string {
  const args = getFormatArgs(text);
  let implicit = 0;
  return text.replace(FORMAT_RE, (raw) => {
    if (raw === "%%") return "%";
    const m = SPEC_PARTS_RE.exec(raw);
    if (!m) return raw;
    const explicit = m[1] ? parseInt(m[1], 10) : undefined;
    const position = explicit ?? ++implicit;
    const arg = args.find((a) => a.position === position);
    if (!arg) return raw;
    return formatValue(arg, values[position] ?? "", locale);
  });
}

// ---------------------------------------------------------------------------
// Default sample values.
//
// Meaningful defaults so the preview reads naturally the moment a row appears.
// Keyed by storage key ("s:<name>" / "a:<name>"), then by 1-based argument
// position. Translators can override any of these in the inputs. Values that
// are never translatable at runtime (version, hash, email, English episode
// names, error text) are given representative English samples.
// ---------------------------------------------------------------------------
const DEFAULT_ARGS: Record<string, Record<number, string>> = {
  "s:about_text": { 1: "1.3", 2: "594d3b9", 3: "support@podlp.com" },
  "s:number_of_episodes": { 1: "42" },
  "s:number_of_episodes_truncated": { 1: "99" },
  "s:season_number": { 1: "2" },
  "s:size_in_gb": { 1: "1.5" },
  "s:size_in_mb": { 1: "250" },
  "s:size_in_kb": { 1: "512" },
  "s:import_complete": { 1: "8", 2: "10" },
  "s:export_complete": { 1: "10" },
  "s:subscribe_success_message": { 1: "The Daily" },
  "s:update_download_failed_reason": { 1: "No network" },
  "s:invalid_date_message": { 1: "1 Jan 2020" },
  "s:could_not_download_episode": { 1: "The Daily" },
  "s:episode_ready_to_play": { 1: "The Daily" },
  "s:episodes_to_retain_description": { 1: "5" },
  "s:browse_category": { 1: "News" },
  "s:sleep_timer_minutes": { 1: "30" },
  "s:percentage_format": { 1: "75" },
  "s:speed_format": { 1: "1.5" },
};

/**
 * Default sample values for a string key, keyed by argument position. Falls
 * back to type-based generics for any positions not explicitly listed so a
 * preview is always populated. Returns a fresh object each call.
 */
export function defaultArgsFor(key: string, source: string): Record<number, string> {
  const explicit = DEFAULT_ARGS[key] ?? {};
  const out: Record<number, string> = {};
  for (const arg of getFormatArgs(source)) {
    out[arg.position] = explicit[arg.position] ?? genericDefault(arg);
  }
  return out;
}

/** A reasonable generic sample value for a specifier when none is specified. */
function genericDefault(arg: FormatArg): string {
  switch (arg.conversion) {
    case "d":
    case "i":
      return "42";
    case "f":
    case "e":
    case "g":
      return "3.5";
    case "x":
      return "2a";
    case "o":
      return "52";
    case "b":
      return "true";
    case "c":
      return "A";
    default:
      return "Text";
  }
}

/**
 * Render source text with format specifiers highlighted as inline chips.
 */
export function highlightSource(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(FORMAT_RE.source, "g");
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <code
        key={`f${i++}`}
        className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-[0.85em] text-amber-500"
      >
        {match[0]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
