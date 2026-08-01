import React from "react";

/**
 * Helpers for the small subset of inline HTML used in the PodLP strings.xml:
 *   <b> <i> <u> <a href="..."> <br />
 *
 * strings.xml stores this markup as the string value (inside CDATA, or
 * entity-escaped for plain strings — the backend handles that). In the UI we:
 *   - detect which strings carry markup,
 *   - render that markup as formatted text (source + read-only cells),
 *   - edit it with Tiptap and normalize Tiptap's HTML back to the strings.xml
 *     dialect (<strong>-><b>, <em>-><i>, paragraph breaks -> <br />).
 */

const MARKUP_RE = /<\/?(?:b|i|u|a|br|strong|em)\b|<br\s*\/?>/i;

export function isRich(text: string): boolean {
  return MARKUP_RE.test(text);
}

// ---------------------------------------------------------------------------
// Rendering markup safely as React nodes (allow-listed tags only).
// ---------------------------------------------------------------------------
function renderNode(node: ChildNode, key: number): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).map((c, i) => renderNode(c, i));

  switch (tag) {
    case "b":
    case "strong":
      return <strong key={key}>{children}</strong>;
    case "i":
    case "em":
      return <em key={key}>{children}</em>;
    case "u":
      return <u key={key}>{children}</u>;
    case "br":
      return <br key={key} />;
    case "a": {
      const href = el.getAttribute("href") || undefined;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
          onClick={(e) => e.preventDefault()}
        >
          {children}
        </a>
      );
    }
    case "p":
    case "span":
      return <React.Fragment key={key}>{children}</React.Fragment>;
    default:
      // Unknown tag: render its text content only.
      return <React.Fragment key={key}>{children}</React.Fragment>;
  }
}

/** Render strings.xml-style markup as formatted React nodes. */
export function renderHtml(html: string): React.ReactNode {
  if (typeof document === "undefined") return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  return Array.from(container.childNodes).map((c, i) => renderNode(c, i));
}

// ---------------------------------------------------------------------------
// Tiptap <-> strings.xml conversions.
// ---------------------------------------------------------------------------

/**
 * strings.xml markup -> HTML that Tiptap can load.
 * Converts <b>/<i> to <strong>/<em> and <br> to paragraph breaks so Tiptap's
 * schema (paragraph-based) round-trips cleanly.
 */
export function toEditorHtml(value: string): string {
  if (!value) return "";
  let h = value
    .replace(/<b\b/gi, "<strong")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i\b/gi, "<em")
    .replace(/<\/i>/gi, "</em>");
  // Split on <br> into paragraphs.
  const parts = h.split(/<br\s*\/?>/i);
  h = parts.map((p) => `<p>${p}</p>`).join("");
  return h;
}

/**
 * Tiptap HTML -> strings.xml markup.
 * Converts <strong>/<em> back to <b>/<i>, joins paragraphs with <br />, and
 * strips anything outside the allow-list.
 */
export function fromEditorHtml(html: string): string {
  if (typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;

  // Serialize each top-level paragraph, joined by <br />.
  const blocks = Array.from(container.childNodes).map((n) =>
    serializeNode(n).trim()
  );
  // Drop trailing empty blocks (Tiptap often leaves an empty <p>).
  while (blocks.length && blocks[blocks.length - 1] === "") blocks.pop();
  return blocks.join("<br />");
}

function serializeNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Raw text. The backend re-escapes for plain strings and keeps CDATA
    // verbatim, so we must emit literal (unescaped) tags with raw text.
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(serializeNode).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `<b>${inner}</b>`;
    case "em":
    case "i":
      return `<i>${inner}</i>`;
    case "u":
      return `<u>${inner}</u>`;
    case "br":
      return "<br />";
    case "a": {
      const href = el.getAttribute("href") || "";
      return `<a href="${href.replace(/"/g, "&quot;")}">${inner}</a>`;
    }
    case "p":
      return inner; // paragraph boundaries handled by the caller
    default:
      return inner;
  }
}
