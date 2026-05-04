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
import { PreviewStep } from "./PreviewStep";
import { usePreviewOverlay } from "./PreviewOverlayContext";
import { MIN_CONFIDENCE, PREVIEW_PALETTE, type ImportStep, type ParsedImport } from "./types";
import {
  CAT_TRAINING_COLOR,
  CAT_SCHOOL_COLOR,
  CAT_WORK_COLOR,
} from "../MonthGridType1";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function inferCategory(catId: string): IndividualCategory {
  const id = catId.toLowerCase();
  if (/(training|trening|practice|workout|run|ski|race|football|game|match)/.test(id))
    return "training";
  if (/(school|skole|class|exam|study)/.test(id)) return "school";
  if (/(work|jobb|meeting|office)/.test(id)) return "work";
  return "else";
}
function colorForCategory(cat: IndividualCategory): string | null {
  if (cat === "training") return CAT_TRAINING_COLOR;
  if (cat === "school") return CAT_SCHOOL_COLOR;
  if (cat === "work") return CAT_WORK_COLOR;
  return null;
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
}: {
  onCommit: (
    patch: Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("source");
  const [data, setData] = useState<ParsedImport | null>(null);
  const [saving, setSaving] = useState(false);
  const overlay = usePreviewOverlay();
  const stepRef = useRef(step);
  stepRef.current = step;

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
      // Strict accuracy gate: only show events with reasoning_confidence >= 80.
      const highConfEvents = (raw?.events ?? []).filter(
        (e) => typeof e.reasoning_confidence === "number" && e.reasoning_confidence >= MIN_CONFIDENCE,
      );
      if (!highConfEvents.length) {
        toast.error("No high-confidence events could be extracted from this file.");
        setStep("source");
        return;
      }
      // Recompute category counts after filtering.
      const counts = new Map<string, number>();
      for (const ev of highConfEvents) counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
      const detected_categories = (raw.detected_categories ?? [])
        .filter((c) => (counts.get(c.id) ?? 0) > 0)
        .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
      const parsed: ParsedImport = {
        total_events_found: highConfEvents.length,
        detected_categories,
        events: highConfEvents,
        past_status: raw.past_status,
        past_events_count: raw.past_events_count,
        future_events_count: raw.future_events_count,
      };
      const colors: Record<string, string> = {};
      parsed.detected_categories.forEach((c, i) => {
        colors[c.id] = PREVIEW_PALETTE[i % PREVIEW_PALETTE.length];
      });
      setData(parsed);
      overlay.begin(parsed.events, parsed.detected_categories, colors);
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
      const toSave = data.events.filter((e) => visible.has(e.category));
      for (const ev of toSave) {
        const startMs = Date.parse(ev.start_time);
        if (!Number.isFinite(startMs)) continue;
        const endMs = ev.end_time && Number.isFinite(Date.parse(ev.end_time))
          ? Date.parse(ev.end_time)
          : startMs + 60 * 60 * 1000;
        const startISO = new Date(startMs).toISOString().slice(0, 19);
        const endISO = new Date(endMs).toISOString().slice(0, 19);
        const cat = inferCategory(ev.category);
        onCommit({
          title: ev.title,
          startISO,
          endISO,
          allDay: false,
          color: colorForCategory(cat),
          category: cat,
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

      {open && (
        // While in preview, render as a floating non-blocking card so the
        // background calendar (with green ghost events) remains visible.
        <div
          className={
            step === "preview"
              ? "pointer-events-none fixed inset-0 z-50 flex items-start justify-end p-6"
              : "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          }
          onClick={(e) => {
            if (step !== "preview" && e.target === e.currentTarget) close();
          }}
        >
          <div
            className={`pointer-events-auto rounded-lg border border-hairline bg-card p-5 shadow-xl ${
              step === "preview" ? "w-[340px]" : "w-full max-w-xl"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">
                {step === "preview" ? "Review imported events" : "Import calendar"}
              </h2>
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

            {step === "preview" && data && (
              <PreviewStep
                data={data}
                visible={overlay.visibleCategoryIds}
                categoryColors={overlay.categoryColors}
                saving={saving}
                onToggle={(id) => {
                  const next = new Set(overlay.visibleCategoryIds);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  overlay.setVisibleCategories(next);
                }}
                onSave={handleSave}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
