import { AlertTriangle, Lock, Pencil } from "lucide-react";

import type { Language, SchemaItem, Translations } from "@/lib/api";
import { getFormatSpecs, highlightSource, specsMatch } from "@/lib/format";
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
          {schema.map((item, i) => (
            <Row
              key={item.key}
              item={item}
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
  item,
  rowIndex,
  languages,
  activeLang,
  allTranslations,
  onChangeString,
  onChangeArray,
}: {
  item: SchemaItem;
  rowIndex: number;
  languages: Language[];
  activeLang: string;
  allTranslations: Record<string, Translations>;
  onChangeString: TranslationGridProps["onChangeString"];
  onChangeArray: TranslationGridProps["onChangeArray"];
}) {
  const isArray = item.type === "string-array";
  const alt = rowIndex % 2 === 1;
  // Opaque backgrounds so sticky columns cover scrolled content.
  const pinnedBg = alt ? "row-cell-alt" : "row-cell";
  const activeBg = alt ? "row-cell-active-alt" : "row-cell-active";

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
            {item.name}
          </span>
          <div className="flex flex-wrap gap-1">
            {!item.translatable && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lock className="h-2.5 w-2.5" /> fixed
              </Badge>
            )}
            {isArray && (
              <Badge variant="outline" className="text-[10px]">
                list
              </Badge>
            )}
            {item.type === "string" && item.cdata && (
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
        {item.type === "string" ? (
          <SourceText value={item.value} />
        ) : (
          <div className="space-y-8">
            {item.items.map((src, idx) => (
              <SourceText key={idx} value={src.value} />
            ))}
          </div>
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
            {!item.translatable ? (
              <span className="text-xs italic text-muted-foreground">
                (not translated)
              </span>
            ) : item.type === "string" ? (
              <StringCell
                value={valueOf(t, item.key)}
                source={item.value}
                multiline={item.multiline}
                editable={active}
                rtl={rtl}
                onChange={(v) => onChangeString(item.key, v)}
              />
            ) : (
              <div className="space-y-8">
                {item.items.map((src, idx) => {
                  const multiline =
                    src.value.length > 60 || /<br\s*\/?>/i.test(src.value);
                  return (
                    <StringCell
                      key={idx}
                      value={arrValueOf(t, item.key, idx)}
                      source={src.value}
                      multiline={multiline}
                      editable={active}
                      rtl={rtl}
                      onChange={(v) =>
                        onChangeArray(item.key, idx, v, item.items.length)
                      }
                    />
                  );
                })}
              </div>
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
}: {
  value: string;
  source: string;
  multiline: boolean;
  editable: boolean;
  rtl: boolean;
  onChange: (value: string) => void;
}) {
  const rich = isRich(source);

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
    </div>
  );
}
