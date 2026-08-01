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
