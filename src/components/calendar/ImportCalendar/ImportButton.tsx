// ImportButton — orchestrates the Import Calendar flow.
//
// Shows an "Import" button. On click opens a modal with steps:
//   source → library | loading → preview (floating card)
//
// Preview state is pushed into <PreviewOverlayProvider> so the calendar
// grid can render ghost events + dim existing events. Save commits
// filtered events through onCommit (which calls upsertEvent in the store).

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarEvent, IndividualCategory } from "../yearStore";
import { SourcePickerStep } from "./SourcePickerStep";
import { LibraryPickerStep } from "./LibraryPickerStep";
import { PreviewStep, type InternalCategoryOption } from "./PreviewStep";
import { usePreviewOverlay } from "./PreviewOverlayContext";
import { MIN_CONFIDENCE, PREVIEW_PALETTE, type ImportStep, type ParsedImport } from "./types";
import { normalizeImportedLocalISO, fromISOLocal, toISOLocal } from "../dateUtils";
import {
  CAT_TRAINING_COLOR,
  CAT_SCHOOL_COLOR,
  CAT_WORK_COLOR,
} from "../MonthGridType1";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Admin (entity) category colors — kept in sync with MonthGridType1 / CalendarSideNav.
const CAT_MEETING_COLOR = "#E63337";
const CAT_EVENT_COLOR = "#F09B0A";
const CAT_RACE_COLOR = "#26B270";

const INDIVIDUAL_INTERNAL: InternalCategoryOption[] = [
  { value: "training", label: "Training", color: CAT_TRAINING_COLOR },
  { value: "school", label: "School", color: CAT_SCHOOL_COLOR },
  { value: "work", label: "Work", color: CAT_WORK_COLOR },
  { value: "else", label: "Else", color: "#94A3B8" },
];
const ADMIN_INTERNAL: InternalCategoryOption[] = [
  { value: "meeting", label: "Meeting", color: CAT_MEETING_COLOR },
  { value: "event", label: "Event", color: CAT_EVENT_COLOR },
  { value: "race", label: "Race", color: CAT_RACE_COLOR },
];

/** Heuristic: best internal category for a file-category id. Returns "" when
 *  no reasonable internal match is found (so the UI can render a gray dot). */
function suggestInternal(catId: string, options: InternalCategoryOption[]): string {
  const id = catId.toLowerCase();
  const matchers: Record<string, RegExp> = {
    training: /(training|trening|practice|workout|run|ski|gym)/,
    school: /(school|skole|class|exam|study|lecture)/,
    work: /(work|jobb|office|shift|business|corporate)/,
    meeting: /(meeting|møte|standup|sync|call|conference)/,
    event: /(event|arrangement|gathering|party|celebration)/,
    race: /(race|løp|match|game|competition|cup|tournament)/,
  };
  for (const opt of options) {
    const re = matchers[opt.value];
    if (re && re.test(id)) return opt.value;
  }
  return "";
}

function colorForInternal(value: string, options: InternalCategoryOption[]): string | null {
  const opt = options.find((o) => o.value === value);
  if (!opt) return null;
  if (opt.value === "else") return null;
  return opt.color;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

export function ImportButton({
  onCommit,
  seat = "individual",
}: {
  onCommit: (
    patch: Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">,
  ) => void;
  seat?: "individual" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("source");
  const [data, setData] = useState<ParsedImport | null>(null);
  const [saving, setSaving] = useState(false);
  const overlay = usePreviewOverlay();
  const stepRef = useRef(step);
  stepRef.current = step;

  const internalOptions = seat === "admin" ? ADMIN_INTERNAL : INDIVIDUAL_INTERNAL;

  // Clear overlay on close.
  useEffect(() => {
    if (!open) overlay.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setStep("source");
    setData(null);
    overlay.clear();
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const parseFile = async (name: string, mime: string, bytes: Uint8Array) => {
    if (bytes.byteLength > MAX_FILE_BYTES) {
      toast.error("File too large (max 10 MB).");
      return;
    }
    setStep("loading");
    try {
      const { data: res, error } = await supabase.functions.invoke("parse-calendar-file", {
        body: { fileName: name, mimeType: mime, base64: bytesToBase64(bytes) },
      });
      if (error) throw error;
      const raw = res as ParsedImport;
      const highConfEvents = (raw?.events ?? []).filter(
        (e) => typeof e.reasoning_confidence === "number" && e.reasoning_confidence >= MIN_CONFIDENCE,
      );
      if (!highConfEvents.length) {
        toast.error("No high-confidence events could be extracted from this file.");
        setStep("source");
        return;
      }
      // Merge similar categories — e.g. "Business meeting" + "meeting" → "Meeting".
      // Group key is a normalized token derived from category name (lowercase,
      // strip punctuation, drop generic qualifiers, take the most meaningful word).
      const QUALIFIERS = new Set([
        "business", "internal", "external", "weekly", "daily", "morning", "evening",
        "the", "a", "an", "of", "and", "with", "for", "to", "my", "our",
      ]);
      const normalizeKey = (raw: string): { key: string; label: string } => {
        const cleaned = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
        const tokens = cleaned.split(/\s+/).filter((t) => t && !QUALIFIERS.has(t));
        const root = tokens[tokens.length - 1] ?? cleaned ?? raw.toLowerCase();
        const label = root ? root.charAt(0).toUpperCase() + root.slice(1) : raw;
        return { key: root || raw.toLowerCase(), label };
      };
      const groupByKey = new Map<string, { id: string; name: string; count: number }>();
      const remap = new Map<string, string>(); // original cat id → group id
      for (const c of raw.detected_categories ?? []) {
        const { key, label } = normalizeKey(c.name || c.id);
        remap.set(c.id, key);
        const existing = groupByKey.get(key);
        if (existing) existing.count = existing.count; // recompute below
        else groupByKey.set(key, { id: key, name: label, count: 0 });
      }
      const remappedEvents = highConfEvents.map((e) => ({
        ...e,
        category: remap.get(e.category) ?? e.category,
      }));
      const counts = new Map<string, number>();
      for (const ev of remappedEvents) counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
      // Ensure any uncategorized event still gets a group entry.
      for (const ev of remappedEvents) {
        if (!groupByKey.has(ev.category)) {
          const label = ev.category.charAt(0).toUpperCase() + ev.category.slice(1);
          groupByKey.set(ev.category, { id: ev.category, name: label, count: 0 });
        }
      }
      const detected_categories = Array.from(groupByKey.values())
        .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
        .filter((c) => c.count > 0);
      const parsed: ParsedImport = {
        total_events_found: remappedEvents.length,
        detected_categories,
        events: remappedEvents,
        past_status: raw.past_status,
        past_events_count: raw.past_events_count,
        future_events_count: raw.future_events_count,
      };
      const colors: Record<string, string> = {};
      const initialMappings: Record<string, string> = {};
      const internalColorsMap: Record<string, string> = {};
      for (const opt of internalOptions) internalColorsMap[opt.value] = opt.color;
      parsed.detected_categories.forEach((c, i) => {
        colors[c.id] = PREVIEW_PALETTE[i % PREVIEW_PALETTE.length];
        initialMappings[c.id] = suggestInternal(c.id + " " + c.name, internalOptions);
      });
      setData(parsed);
      overlay.begin(parsed.events, parsed.detected_categories, colors, initialMappings, internalColorsMap);
      setStep("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to parse file";
      toast.error(msg);
      setStep("source");
    }
  };

  const handleSave = () => {
    if (!data) return;
    setSaving(true);
    try {
      const visible = overlay.visibleCategoryIds;
      const mappings = overlay.categoryMappings;
      const toSave = data.events.filter((e) => visible.has(e.category));
      for (const ev of toSave) {
        const startISO = normalizeImportedLocalISO(ev.start_time);
        if (!startISO) continue;
        const endISO = normalizeImportedLocalISO(ev.end_time ?? "")
          ?? toISOLocal(new Date(fromISOLocal(startISO).getTime() + 60 * 60 * 1000));
        const internal = mappings[ev.category] ?? internalOptions[0].value;
        const color = colorForInternal(internal, internalOptions);
        const category =
          seat === "admin"
            ? ("else" as IndividualCategory) // admin events don't use IndividualCategory tag
            : (internal as IndividualCategory);
        onCommit({
          title: ev.title,
          startISO,
          endISO,
          allDay: false,
          color,
          category,
          description: ev.description,
        });
      }
      toast.success(`Successfully imported ${toSave.length} events to the calendar!`);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 flex items-center gap-1.5 rounded-md border border-hairline bg-card px-2.5 py-1.5 text-xs text-ink hover:bg-secondary"
        title="Import calendar from file"
      >
        <Download className="h-3.5 w-3.5" /> Import
      </button>

      {open && step !== "preview" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="pointer-events-auto w-full max-w-xl rounded-lg border border-hairline bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Import calendar</h2>
              <button onClick={close} className="text-muted-foreground hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === "source" && (
              <>
                <SourcePickerStep
                  onPickDevice={async (file) => {
                    const buf = new Uint8Array(await file.arrayBuffer());
                    void parseFile(file.name, file.type, buf);
                  }}
                  onPickLibrary={() => setStep("library")}
                />
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={close}
                    className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {step === "library" && (
              <>
                <LibraryPickerStep
                  onPick={({ name, mime, bytes }) => void parseFile(name, mime, bytes)}
                />
                <div className="mt-4 flex justify-between">
                  <button
                    onClick={() => setStep("source")}
                    className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
                  >
                    Back
                  </button>
                  <button
                    onClick={close}
                    className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {step === "loading" && (
              <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Extracting schedule data from the file…
              </div>
            )}
          </div>
        </div>
      )}

      {open && step === "preview" && data && (
        <PreviewStep
          data={data}
          visible={overlay.visibleCategoryIds}
          categoryColors={overlay.categoryColors}
          saving={saving}
          internalOptions={internalOptions}
          mappings={overlay.categoryMappings}
          onMappingChange={(id, val) => overlay.setCategoryMapping(id, val)}
          onClose={close}
          onToggle={(id) => {
            const next = new Set(overlay.visibleCategoryIds);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            overlay.setVisibleCategories(next);
          }}
          onSave={handleSave}
        />
      )}
    </>
  );
}
