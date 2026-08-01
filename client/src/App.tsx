import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileArchive,
  Languages,
  Loader2,
  LogOut,
  Search,
} from "lucide-react";

import {
  api,
  type Language,
  type SchemaItem,
  type Translations,
} from "@/lib/api";
import { LoginView } from "@/components/LoginView";
import { StringRow } from "@/components/StringRow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RTL_LANGS = new Set(["ur"]);

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [schema, setSchema] = useState<SchemaItem[]>([]);
  const [lang, setLang] = useState<string>("");
  const [translations, setTranslations] = useState<Translations>({});
  const [filter, setFilter] = useState("");
  const [untranslatedOnly, setUntranslatedOnly] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");

  const dirtyRef = useRef<Set<string>>(new Set());
  const saveTimer = useRef<number | null>(null);
  const translationsRef = useRef<Translations>({});
  translationsRef.current = translations;

  // ---- session check ----
  useEffect(() => {
    api
      .session()
      .then((s) => setAuthed(s.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  // ---- load schema once authed ----
  const bootstrap = useCallback(async () => {
    const { languages, schema } = await api.schema();
    setLanguages(languages);
    setSchema(schema);
    setLang((cur) => cur || languages[0]?.code || "");
  }, []);

  useEffect(() => {
    if (authed) bootstrap();
  }, [authed, bootstrap]);

  // ---- load translations when language changes ----
  const loadLanguage = useCallback(async (code: string) => {
    const { translations } = await api.translations(code);
    dirtyRef.current.clear();
    setTranslations(translations || {});
    const p = await api.progress();
    setProgress(p.byLanguage[code] || { done: 0, total: p.total });
  }, []);

  useEffect(() => {
    if (lang) loadLanguage(lang);
  }, [lang, loadLanguage]);

  // ---- saving ----
  const flushSave = useCallback(async () => {
    const keys = Array.from(dirtyRef.current);
    if (!keys.length) return;
    const payload: Translations = {};
    for (const k of keys) payload[k] = translationsRef.current[k];
    dirtyRef.current.clear();
    try {
      await api.saveTranslations(lang, payload);
      setSaveStatus("saved");
      const p = await api.progress();
      setProgress(p.byLanguage[lang] || { done: 0, total: p.total });
    } catch (e) {
      if (e instanceof api.UnauthorizedError) setAuthed(false);
      else setSaveStatus("error");
    }
  }, [lang]);

  const queueSave = useCallback(
    (key: string) => {
      dirtyRef.current.add(key);
      setSaveStatus("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, 700);
    },
    [flushSave]
  );

  // ---- change handlers ----
  const onChangeString = useCallback(
    (key: string, value: string) => {
      setTranslations((prev) => ({ ...prev, [key]: value }));
      queueSave(key);
    },
    [queueSave]
  );

  const onChangeArray = useCallback(
    (key: string, idx: number, value: string, length: number) => {
      setTranslations((prev) => {
        const existing = Array.isArray(prev[key])
          ? [...(prev[key] as string[])]
          : new Array(length).fill("");
        existing[idx] = value;
        return { ...prev, [key]: existing };
      });
      queueSave(key);
    },
    [queueSave]
  );

  const getValue = useCallback(
    (key: string) => (translations[key] as string) || "",
    [translations]
  );
  const getArrayValue = useCallback(
    (key: string, idx: number) => {
      const v = translations[key];
      return Array.isArray(v) ? v[idx] || "" : "";
    },
    [translations]
  );

  // ---- filtering ----
  const isFullyTranslated = useCallback(
    (item: SchemaItem) => {
      if (!item.translatable) return true;
      if (item.type === "string") {
        const v = translations[item.key];
        return v != null && String(v).trim() !== "";
      }
      const arr = Array.isArray(translations[item.key])
        ? (translations[item.key] as string[])
        : [];
      return item.items.every((_, i) => arr[i] && arr[i].trim() !== "");
    },
    [translations]
  );

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return schema.filter((item) => {
      if (f) {
        const hay = (
          item.name +
          " " +
          (item.type === "string"
            ? item.value
            : item.items.map((i) => i.value).join(" "))
        ).toLowerCase();
        if (!hay.includes(f)) return false;
      }
      if (untranslatedOnly && isFullyTranslated(item)) return false;
      return true;
    });
  }, [schema, filter, untranslatedOnly, isFullyTranslated]);

  // ---- actions ----
  async function handleLangChange(code: string) {
    await flushSave();
    setLang(code);
  }

  async function openPreview() {
    await flushSave();
    setPreviewText(await api.preview(lang));
    setPreviewOpen(true);
  }

  async function download() {
    await flushSave();
    window.location.href = api.downloadUrl(lang);
  }

  async function downloadAll() {
    await flushSave();
    window.location.href = api.downloadAllUrl();
  }

  async function logout() {
    await api.logout();
    setAuthed(false);
    setTranslations({});
  }

  // ---- render ----
  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authed) {
    return <LoginView onSuccess={() => setAuthed(true)} />;
  }

  const rtl = RTL_LANGS.has(lang);
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Languages className="h-5 w-5 text-primary" />
            PodLP Translation
          </div>

          <Select value={lang} onValueChange={handleLangChange}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name} ({l.native})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SaveIndicator status={saveStatus} />

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openPreview}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="h-4 w-4" /> This
            </Button>
            <Button size="sm" onClick={downloadAll}>
              <FileArchive className="h-4 w-4" /> All (zip)
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress + filters row */}
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 pb-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <Progress value={pct} className="max-w-xs" />
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              {progress.done} / {progress.total} ({pct}%)
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-56 pl-8"
              placeholder="Filter strings…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="untranslated"
              checked={untranslatedOnly}
              onCheckedChange={setUntranslatedOnly}
            />
            <Label htmlFor="untranslated" className="text-muted-foreground">
              Untranslated only
            </Label>
          </div>
        </div>
      </header>

      {/* String list */}
      <main className="mx-auto max-w-4xl space-y-3 px-4 py-6">
        {visible.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            No strings match the current filter.
          </p>
        ) : (
          visible.map((item) => (
            <StringRow
              key={item.key}
              item={item}
              rtl={rtl}
              getValue={getValue}
              getArrayValue={getArrayValue}
              onChangeString={onChangeString}
              onChangeArray={onChangeArray}
            />
          ))
        )}
      </main>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              values-{lang}/strings.xml
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-4 font-mono text-xs">
            {previewText}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1.5 text-sm text-emerald-500">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  return <span className="text-sm text-destructive">Save failed</span>;
}
