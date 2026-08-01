import { useState } from "react";
import { AlertTriangle, Lock, Pencil } from "lucide-react";

import type { Language, SchemaItem, Translations } from "@/lib/api";
import {
  applyFormat,
  defaultArgsFor,
  getFormatArgs,
  getFormatSpecs,
  hasFormatArgs,
  highlightSource,
  specsMatch,
  type FormatArg,
} from "@/lib/format";
import { isRich, renderHtml } from "@/lib/html";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Source text: formatted markup for rich strings, highlighted code otherwise. */
function SourceText({ value }: { value: string }) {
  if (isRich(value)) {
    return (
      <div className="whitespace-pre-wrap break-words text-muted-foreground [&_a]:text-primary [&_a]:underline">
        {renderHtml(value)}
      </div>
    );
  }
  return (
    <div className="whitespace-pre-wrap break-words text-muted-foreground">
      {highlightSource(value)}
    </div>
  );
}

const RTL_LANGS = new Set(["ur"]);

/** App language codes are already valid BCP-47 primary subtags. */
function localeFor(code: string): string {
  return code;
}

/** Editable sample-value inputs, one per positional format argument. */
function ArgInputs({
  args,
  values,
  onChange,
}: {
  args: FormatArg[];
  values: Record<number, string>;
  onChange: (position: number, value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-dashed pt-2">
      {args.map((arg) => (
        <label
          key={arg.position}
          className="flex items-center gap-2 text-[11px] text-muted-foreground"
        >
          <code className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 font-mono text-amber-500">
            {arg.raw}
          </code>
          <Input
            className="h-7 bg-background text-xs"
            placeholder={CONVERSION_HINT[arg.conversion] ?? "value"}
            value={values[arg.position] ?? ""}
            onChange={(e) => onChange(arg.position, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

const CONVERSION_HINT: Record<string, string> = {
  s: "text…",
  d: "number…",
  i: "number…",
  f: "decimal…",
  e: "decimal…",
  g: "decimal…",
  x: "hex number…",
  o: "octal number…",
  c: "character…",
  b: "true / false",
};

/** Live preview of a format string with sample values substituted in. */
function FormatPreview({
  text,
  values,
  locale,
  rich,
  rtl,
}: {
  text: string;
  values: Record<number, string>;
  locale: string;
  rich: boolean;
  rtl?: boolean;
}) {
  const preview = applyFormat(text, values, locale);
  return (
    <div className="mt-2 rounded-md border bg-muted/40 px-2 py-1.5">
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Preview
      </div>
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={cn(
          "whitespace-pre-wrap break-words text-xs",
          rtl && "text-right",
          rich && "[&_a]:text-primary [&_a]:underline",
        )}
      >
        {rich ? renderHtml(preview) : preview}
      </div>
    </div>
  );
}

interface TranslationGridProps {
  schema: SchemaItem[];
  languages: Language[]; // visible languages, in order
  activeLang: string;
  allTranslations: Record<string, Translations>;
  onSetActiveLang: (code: string) => void;
  onChangeString: (key: string, value: string) => void;
  onChangeArray: (
    key: string,
    idx: number,
    value: string,
    length: number,
  ) => void;
}

function valueOf(t: Translations | undefined, key: string): string {
  const v = t?.[key];
  return typeof v === "string" ? v : "";
}
function arrValueOf(
  t: Translations | undefined,
  key: string,
  idx: number,
): string {
  const v = t?.[key];
  return Array.isArray(v) ? v[idx] || "" : "";
}

/**
 * A single grid row. Plain strings map to one row; each string-array item
 * becomes its own row so the grid stays flat and tidy.
 */
type GridRow =
  | {
      kind: "string";
      key: string; // storage key ("s:name")
      name: string;
      source: string;
      cdata: boolean;
      multiline: boolean;
      translatable: boolean;
    }
  | {
      kind: "array-item";
      key: string; // storage key ("a:name")
      name: string; // display name, e.g. "changelog [2]"
      index: number; // item index within the array
      length: number; // total items in the array
      source: string;
      multiline: boolean;
      translatable: boolean;
      firstOfGroup: boolean;
      groupSize: number;
    };

function flattenSchema(schema: SchemaItem[]): GridRow[] {
  const rows: GridRow[] = [];
  for (const item of schema) {
    if (item.type === "string") {
      rows.push({
        kind: "string",
        key: item.key,
        name: item.name,
        source: item.value,
        cdata: item.cdata,
        multiline: item.multiline,
        translatable: item.translatable,
      });
    } else {
      item.items.forEach((src, idx) => {
        rows.push({
          kind: "array-item",
          key: item.key,
          name: `${item.name} [${idx + 1}]`,
          index: idx,
          length: item.items.length,
          source: src.value,
          multiline: src.value.length > 60 || /<br\s*\/?>/i.test(src.value),
          translatable: item.translatable,
          firstOfGroup: idx === 0,
          groupSize: item.items.length,
        });
      });
    }
  }
  return rows;
}

export function TranslationGrid({
  schema,
  languages,
  activeLang,
  allTranslations,
  onSetActiveLang,
  onChangeString,
  onChangeArray,
}: TranslationGridProps) {
  return (
    <div className="h-full overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="grid-head-cell sticky left-0 top-0 z-40 min-w-[180px] border-b border-r px-3 py-2 text-left font-medium">
              String
            </th>
            <th className="grid-head-cell sticky left-[180px] top-0 z-40 min-w-[240px] border-b border-r px-3 py-2 text-left font-medium">
              English
            </th>
            {languages.map((l) => {
              const active = l.code === activeLang;
              return (
                <th
                  key={l.code}
                  onClick={() => onSetActiveLang(l.code)}
                  className={cn(
                    "grid-head-cell sticky top-0 z-30 min-w-[240px] cursor-pointer border-b border-r px-3 py-2 text-left font-medium",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:brightness-110",
                  )}
                  title={
                    active
                      ? "Editing this language"
                      : "Click to edit this language"
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {active && <Pencil className="h-3.5 w-3.5 text-primary" />}
                    <span>{l.name}</span>
                    <span className="font-normal text-muted-foreground">
                      {l.native}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {flattenSchema(schema).map((row, i) => (
            <Row
              key={row.kind === "array-item" ? `${row.key}:${row.index}` : row.key}
              row={row}
              rowIndex={i}
              languages={languages}
              activeLang={activeLang}
              allTranslations={allTranslations}
              onChangeString={onChangeString}
              onChangeArray={onChangeArray}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  rowIndex,
  languages,
  activeLang,
  allTranslations,
  onChangeString,
  onChangeArray,
}: {
  row: GridRow;
  rowIndex: number;
  languages: Language[];
  activeLang: string;
  allTranslations: Record<string, Translations>;
  onChangeString: TranslationGridProps["onChangeString"];
  onChangeArray: TranslationGridProps["onChangeArray"];
}) {
  const alt = rowIndex % 2 === 1;
  // Opaque backgrounds so sticky columns cover scrolled content.
  const pinnedBg = alt ? "row-cell-alt" : "row-cell";
  const activeBg = alt ? "row-cell-active-alt" : "row-cell-active";

  const isArrayItem = row.kind === "array-item";
  const isCdataString = row.kind === "string" && row.cdata;

  // Sample values for the source's format arguments, shared between the
  // English preview and the active translation preview.
  const formatArgs = getFormatArgs(row.source);
  const [argValues, setArgValues] = useState<Record<number, string>>(() =>
    defaultArgsFor(row.key, row.source),
  );
  const setArg = (position: number, value: string) =>
    setArgValues((prev) => ({ ...prev, [position]: value }));
  const sourceRich = isRich(row.source);

  function currentValue(t: Translations | undefined): string {
    return isArrayItem ? arrValueOf(t, row.key, row.index) : valueOf(t, row.key);
  }
  function change(value: string) {
    if (isArrayItem) onChangeArray(row.key, row.index, value, row.length);
    else onChangeString(row.key, value);
  }

  return (
    <tr className="align-top">
      {/* Name column (sticky) */}
      <td
        className={cn(
          "sticky left-0 z-20 min-w-[180px] border-b border-r px-3 py-2 align-top",
          pinnedBg,
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="break-all font-mono text-xs text-primary/80">
            {row.name}
          </span>
          <div className="flex flex-wrap gap-1">
            {!row.translatable && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" /> fixed
              </Badge>
            )}
            {isArrayItem && (
              <Badge variant="outline" className="text-[10px]">
                list
              </Badge>
            )}
            {isCdataString && (
              <Badge variant="warning" className="text-[10px]">
                HTML
              </Badge>
            )}
          </div>
        </div>
      </td>

      {/* English source column (sticky) */}
      <td
        className={cn(
          "sticky left-[180px] z-20 min-w-[240px] border-b border-r px-3 py-2 align-top",
          pinnedBg,
        )}
      >
        <SourceText value={row.source} />
        {formatArgs.length > 0 && (
          <>
            <ArgInputs
              args={formatArgs}
              values={argValues}
              onChange={setArg}
            />
            <FormatPreview
              text={row.source}
              values={argValues}
              locale={localeFor("en")}
              rich={sourceRich}
            />
          </>
        )}
      </td>

      {/* Language columns */}
      {languages.map((l) => {
        const active = l.code === activeLang;
        const rtl = RTL_LANGS.has(l.code);
        const t = allTranslations[l.code];
        return (
          <td
            key={l.code}
            className={cn(
              "min-w-[240px] border-b border-r px-3 py-2 align-top",
              active ? activeBg : pinnedBg,
            )}
          >
            {!row.translatable ? (
              <span className="text-xs italic text-muted-foreground">
                (not translated)
              </span>
            ) : (
              <StringCell
                value={currentValue(t)}
                source={row.source}
                multiline={row.multiline}
                editable={active}
                rtl={rtl}
                onChange={change}
                argValues={active ? argValues : undefined}
                locale={localeFor(l.code)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

function StringCell({
  value,
  source,
  multiline,
  editable,
  rtl,
  onChange,
  argValues,
  locale,
}: {
  value: string;
  source: string;
  multiline: boolean;
  editable: boolean;
  rtl: boolean;
  onChange: (value: string) => void;
  /** Shared sample arg values (only provided for the active cell). */
  argValues?: Record<number, string>;
  locale: string;
}) {
  const rich = isRich(source);
  const showPreview =
    editable && argValues !== undefined && hasFormatArgs(source) && !!value.trim();

  const preview = showPreview ? (
    <FormatPreview
      text={value}
      values={argValues}
      locale={locale}
      rich={rich}
      rtl={rtl}
    />
  ) : null;

  if (!editable) {
    if (!value)
      return (
        <span className="text-xs italic text-muted-foreground/60">empty</span>
      );
    return (
      <div
        dir={rtl ? "rtl" : "ltr"}
        className={cn(
          "whitespace-pre-wrap break-words",
          rtl && "text-right",
          rich && "[&_a]:text-primary [&_a]:underline"
        )}
      >
        {rich ? renderHtml(value) : value}
      </div>
    );
  }

  const mismatch = !specsMatch(source, value);

  if (rich) {
    return (
      <div>
        <RichTextEditor value={value} rtl={rtl} onChange={onChange} />
        {mismatch && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            Keep: {getFormatSpecs(source).join(" ") || "(none)"}
          </p>
        )}
        {preview}
      </div>
    );
  }

  return (
    <div>
      {multiline ? (
        <Textarea
          dir={rtl ? "rtl" : "ltr"}
          className={cn("min-h-[64px] bg-background", rtl && "text-right")}
          placeholder="Translation…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          dir={rtl ? "rtl" : "ltr"}
          className={cn("bg-background", rtl && "text-right")}
          placeholder="Translation…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {mismatch && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Keep: {getFormatSpecs(source).join(" ") || "(none)"}
        </p>
      )}
      {preview}
    </div>
  );
}
