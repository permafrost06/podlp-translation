import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
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
  convexApi,
  getToken,
  type Language,
  type ProgressResponse,
  type SchemaItem,
  type Translations,
} from "@/lib/api";
import {
  persistKey,
  readPersisted,
  usePersistentState,
} from "@/lib/use-persistent-state";
import { LoginView } from "@/components/LoginView";
import { TranslationGrid } from "@/components/TranslationGrid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  // ---- live (reactive) queries ----
  // When not authed we pass "skip" so the queries don't run. The token is a
  // reactive arg: on login/logout the subscriptions re-run with the new value.
  const token = authed ? getToken() : undefined;
  const queryArgs = authed && token ? { token } : "skip";
  const schemaData = useQuery(convexApi.translations.schema, queryArgs);
  const allData = useQuery(convexApi.translations.all, queryArgs);
  const progressData = useQuery(convexApi.translations.progress, queryArgs);

  const languages: Language[] = schemaData?.languages ?? [];
  const schema: SchemaItem[] = schemaData?.schema ?? [];
  const progress: ProgressResponse = progressData ?? {
    total: 0,
    byLanguage: {},
  };

  // Locally-editable copy of the translations. It's seeded from the live
  // `all` query and re-merged whenever the server pushes an update, but keeps
  // any not-yet-saved (dirty) keys so in-flight edits aren't clobbered.
  const [allTranslations, setAllTranslations] = useState<
    Record<string, Translations>
  >({});
  const [activeLang, setActiveLang] = usePersistentState<string>(
    persistKey("active-lang"),
    "",
  );
  const [visibleLangs, setVisibleLangs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [showAllLanguages, setShowAllLanguages] = usePersistentState(
    persistKey("show-all-languages"),
    false,
  );
  const [untranslatedOnly, setUntranslatedOnly] = usePersistentState(
    persistKey("untranslated-only"),
    false,
  );
  const [showUntranslatable, setShowUntranslatable] = usePersistentState(
    persistKey("show-untranslatable"),
    false,
  );
  const [matchedOnly] = usePersistentState(
    persistKey("matched-only"),
    false,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");

  const saveTimer = useRef<number | null>(null);
  const allRef = useRef<Record<string, Translations>>({});
  allRef.current = allTranslations;
  const activeRef = useRef<string>("");
  activeRef.current = activeLang;

  // ---- session check ----
  useEffect(() => {
    api
      .session()
      .then((s) => setAuthed(s.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  // ---- restore column visibility + active language once the schema loads ----
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || languages.length === 0) return;
    restoredRef.current = true;

    const codes = new Set(languages.map((l) => l.code));
    // Restore previously visible columns, but only keep languages that still
    // exist; fall back to showing everything on first visit.
    const savedVisible = readPersisted<string[] | null>(
      persistKey("visible-langs"),
      null,
    );
    const restoredVisible =
      savedVisible && savedVisible.length
        ? new Set(savedVisible.filter((c) => codes.has(c)))
        : new Set(codes);
    if (restoredVisible.size === 0)
      for (const c of codes) restoredVisible.add(c);
    setVisibleLangs(restoredVisible);

    // Restore the active language if it's still valid, otherwise pick the first.
    setActiveLang((cur) =>
      cur && codes.has(cur) ? cur : languages[0]?.code || "",
    );
  }, [languages, setActiveLang]);

  // ---- merge live server translations into the editable local copy ----
  // Whenever the reactive `all` query pushes new data (either our own save
  // landing or another translator editing), fold it into local state — but keep
  // any keys we haven't saved yet (tracked in dirtyRef) so live pushes never
  // clobber an in-flight edit.
  const dirtyRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!allData) return;
    const server = allData.translations;
    const dirty = dirtyRef.current;
    const lang = activeRef.current;
    setAllTranslations((prev) => {
      const next: Record<string, Translations> = {};
      for (const code of Object.keys(server)) {
        if (code === lang && dirty.size) {
          // Preserve unsaved edits for the language currently being edited.
          const merged: Translations = { ...server[code] };
          const prevLang = prev[code] || {};
          for (const key of dirty) merged[key] = prevLang[key];
          next[code] = merged;
        } else {
          next[code] = server[code];
        }
      }
      return next;
    });
  }, [allData]);

  // Persist the visible column selection (stored as an array). Skip the empty
  // initial state so we don't clobber the saved value before bootstrap runs.
  useEffect(() => {
    if (visibleLangs.size === 0) return;
    try {
      localStorage.setItem(
        persistKey("visible-langs"),
        JSON.stringify(Array.from(visibleLangs)),
      );
    } catch {
      /* ignore */
    }
  }, [visibleLangs]);

  // ---- saving (writes to active language) ----
  // Progress and the grid update reactively via the live `all`/`progress`
  // queries once the mutation lands — no manual refetch needed.
  const flushSave = useCallback(async () => {
    const keys = Array.from(dirtyRef.current);
    if (!keys.length) return;
    const lang = activeRef.current;
    const langData = allRef.current[lang] || {};
    const payload: Translations = {};
    for (const k of keys) payload[k] = langData[k];
    dirtyRef.current.clear();
    try {
      await api.saveTranslations(lang, payload);
      setSaveStatus("saved");
    } catch (e) {
      if (e instanceof api.UnauthorizedError) setAuthed(false);
      else setSaveStatus("error");
    }
  }, []);

  const queueSave = useCallback(
    (key: string) => {
      dirtyRef.current.add(key);
      setSaveStatus("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, 700);
    },
    [flushSave],
  );

  // ---- change handlers (mutate active language) ----
  const onChangeString = useCallback(
    (key: string, value: string) => {
      const lang = activeRef.current;
      setAllTranslations((prev) => ({
        ...prev,
        [lang]: { ...prev[lang], [key]: value },
      }));
      queueSave(key);
    },
    [queueSave],
  );

  const onChangeArray = useCallback(
    (key: string, idx: number, value: string, length: number) => {
      const lang = activeRef.current;
      setAllTranslations((prev) => {
        const langData = prev[lang] || {};
        const existing = Array.isArray(langData[key])
          ? [...(langData[key] as string[])]
          : new Array(length).fill("");
        existing[idx] = value;
        return { ...prev, [lang]: { ...langData, [key]: existing } };
      });
      queueSave(key);
    },
    [queueSave],
  );

  const handleSetActiveLang = useCallback(
    async (code: string) => {
      await flushSave();
      setActiveLang(code);
      // Make sure the active column is visible.
      setVisibleLangs((prev) => {
        if (prev.has(code)) return prev;
        const next = new Set(prev);
        next.add(code);
        return next;
      });
    },
    [flushSave],
  );

  // ---- filtering ----
  const isFullyTranslated = useCallback(
    (item: SchemaItem, lang: string) => {
      if (!item.translatable) return true;
      const t = allTranslations[lang] || {};
      if (item.type === "string") {
        const v = t[item.key];
        return v != null && String(v).trim() !== "";
      }
      const arr = Array.isArray(t[item.key]) ? (t[item.key] as string[]) : [];
      return item.items.every((_, i) => arr[i] && arr[i].trim() !== "");
    },
    [allTranslations],
  );

  const visibleSchema = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return schema.filter((item) => {
      // The changelog release-notes list is not exposed to translators and its
      // visibility is intentionally not user-toggleable.
      if (item.type === "string-array" && item.name === "changelog")
        return false;
      if (!showUntranslatable && !item.translatable) return false;
      if (matchedOnly && !item.matched) return false;
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
      if (untranslatedOnly && isFullyTranslated(item, activeLang)) return false;
      return true;
    });
  }, [
    schema,
    filter,
    untranslatedOnly,
    showUntranslatable,
    matchedOnly,
    isFullyTranslated,
    activeLang,
  ]);

  const shownLanguages = useMemo(
    () =>
      showAllLanguages
        ? languages.filter((l) => visibleLangs.has(l.code))
        : languages.filter((l) => l.code === activeLang),
    [languages, visibleLangs, showAllLanguages, activeLang],
  );

  // ---- column toggles ----
  function toggleLang(code: string) {
    setVisibleLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        if (code === activeLang) return prev; // don't hide the active column
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  // ---- actions ----
  async function openPreview() {
    await flushSave();
    setPreviewText(await api.preview(activeLang));
    setPreviewOpen(true);
  }
  async function download() {
    await flushSave();
    window.location.href = api.downloadUrl(activeLang);
  }
  async function downloadAll() {
    await flushSave();
    window.location.href = api.downloadAllUrl();
  }
  async function logout() {
    await api.logout();
    setAuthed(false);
    setAllTranslations({});
  }

  // ---- render ----
  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!authed) return <LoginView onSuccess={() => setAuthed(true)} />;

  const activeProg = progress.byLanguage[activeLang] || {
    done: 0,
    total: progress.total,
  };
  const activePct = activeProg.total
    ? Math.round((activeProg.done / activeProg.total) * 100)
    : 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Languages className="h-5 w-5 text-primary" />
            PodLP Translation
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Editing:</span>
            <Select value={activeLang} onValueChange={handleSetActiveLang}>
              <SelectTrigger className="h-8 w-[180px]">
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
            <Badge variant="secondary" className="font-normal">
              {activeProg.done}/{activeProg.total} · {activePct}% ·{" "}
              {activeProg.total - activeProg.done} blank
            </Badge>
          </div>

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

        {/* Column toggles + filters */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t px-4 py-2">
          {showAllLanguages && (
            <>
              {languages.map((l) => {
                const checked = visibleLangs.has(l.code);
                const isActive = l.code === activeLang;
                const p = progress.byLanguage[l.code];
                return (
                  <span
                    key={l.code}
                    className={cnLabel(isActive)}
                    title={isActive ? "Active column (can't hide)" : undefined}
                    onClick={() => {
                      if (!isActive) toggleLang(l.code);
                    }}
                    style={{ cursor: isActive ? "default" : "pointer" }}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={isActive}
                      onCheckedChange={() => {}}
                    />
                    <span>{l.name}</span>
                    {p && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round((p.done / (p.total || 1)) * 100)}% ·{" "}
                        {p.total - p.done} blank
                      </span>
                    )}
                  </span>
                );
              })}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="show-all-languages"
                checked={showAllLanguages}
                onCheckedChange={setShowAllLanguages}
              />
              <Label
                htmlFor="show-all-languages"
                className="text-muted-foreground"
              >
                Show all languages
              </Label>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-56 pl-8"
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
            <div
              className="flex items-center gap-2"
              style={{ display: "none" }}
            >
              <Switch
                id="show-untranslatable"
                checked={showUntranslatable}
                onCheckedChange={setShowUntranslatable}
              />
              <Label
                htmlFor="show-untranslatable"
                className="text-muted-foreground"
              >
                Show untranslatable
              </Label>
            </div>
          </div>
        </div>
      </header>

      {/* Grid */}
      <main className="min-h-0 flex-1 p-4">
        {visibleSchema.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            No strings match the current filter.
          </p>
        ) : (
          <TranslationGrid
            schema={visibleSchema}
            languages={shownLanguages}
            activeLang={activeLang}
            allTranslations={allTranslations}
            onSetActiveLang={handleSetActiveLang}
            onChangeString={onChangeString}
            onChangeArray={onChangeArray}
            showAllLanguages={showAllLanguages}
          />
        )}
      </main>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              values-{activeLang}/strings.xml
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

function cnLabel(active: boolean) {
  return [
    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
    active
      ? "border-primary/40 bg-primary/10 text-foreground"
      : "border-transparent hover:bg-muted",
  ].join(" ");
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
