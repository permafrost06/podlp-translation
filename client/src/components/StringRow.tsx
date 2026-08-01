import { AlertTriangle, Lock } from "lucide-react";

import type { SchemaItem } from "@/lib/api";
import { highlightSource, specsMatch, getFormatSpecs } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface StringRowProps {
  item: SchemaItem;
  rtl: boolean;
  getValue: (key: string) => string;
  getArrayValue: (key: string, idx: number) => string;
  onChangeString: (key: string, value: string) => void;
  onChangeArray: (key: string, idx: number, value: string, length: number) => void;
}

function FormatWarning({ source, target }: { source: string; target: string }) {
  if (specsMatch(source, target)) return null;
  const specs = getFormatSpecs(source);
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-500">
      <AlertTriangle className="h-3.5 w-3.5" />
      Placeholders must match exactly: {specs.length ? specs.join(" ") : "(none)"}
    </p>
  );
}

export function StringRow({
  item,
  rtl,
  getValue,
  getArrayValue,
  onChangeString,
  onChangeArray,
}: StringRowProps) {
  return (
    <Card className={cn("p-4", !item.translatable && "opacity-70")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-primary/80">{item.name}</span>
        {!item.translatable && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> do not translate
          </Badge>
        )}
        {item.type === "string-array" && (
          <Badge variant="outline">list</Badge>
        )}
        {item.type === "string" && item.cdata && (
          <Badge variant="warning">has HTML</Badge>
        )}
      </div>

      {item.type === "string" ? (
        <>
          <div className="mb-2 whitespace-pre-wrap break-words rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
            {highlightSource(item.value)}
          </div>
          {item.translatable &&
            (item.multiline ? (
              <Textarea
                dir={rtl ? "rtl" : "ltr"}
                className={cn("min-h-[90px]", rtl && "text-right")}
                placeholder="Translation…"
                value={getValue(item.key)}
                onChange={(e) => onChangeString(item.key, e.target.value)}
              />
            ) : (
              <Input
                dir={rtl ? "rtl" : "ltr"}
                className={cn(rtl && "text-right")}
                placeholder="Translation…"
                value={getValue(item.key)}
                onChange={(e) => onChangeString(item.key, e.target.value)}
              />
            ))}
          {item.translatable && (
            <FormatWarning source={item.value} target={getValue(item.key)} />
          )}
        </>
      ) : (
        <div className="space-y-3">
          {item.items.map((src, idx) => {
            const multiline =
              src.value.length > 60 || /<br\s*\/?>/i.test(src.value);
            const val = getArrayValue(item.key, idx);
            return (
              <div key={idx}>
                <div className="mb-1 text-xs text-muted-foreground">
                  Item {idx + 1}
                </div>
                <div className="mb-2 whitespace-pre-wrap break-words rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
                  {highlightSource(src.value)}
                </div>
                {item.translatable &&
                  (multiline ? (
                    <Textarea
                      dir={rtl ? "rtl" : "ltr"}
                      className={cn("min-h-[80px]", rtl && "text-right")}
                      placeholder="Translation…"
                      value={val}
                      onChange={(e) =>
                        onChangeArray(
                          item.key,
                          idx,
                          e.target.value,
                          item.items.length
                        )
                      }
                    />
                  ) : (
                    <Input
                      dir={rtl ? "rtl" : "ltr"}
                      className={cn(rtl && "text-right")}
                      placeholder="Translation…"
                      value={val}
                      onChange={(e) =>
                        onChangeArray(
                          item.key,
                          idx,
                          e.target.value,
                          item.items.length
                        )
                      }
                    />
                  ))}
                {item.translatable && (
                  <FormatWarning source={src.value} target={val} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
