import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownToLine, Check, X } from "lucide-react";
import type { ImportedSession } from "@/lib/calendarImportParse";
import { getAccountAccessToken } from "@/lib/account-profile-client";
import { toast } from "sonner";

const GREEN = "#22c55e";
const RED = "#ef4444";

type Props = {
  calId: string;
  /** Non-null while preview sessions are on the grid. */
  pendingSessions: ImportedSession[] | null;
  onPreview: (sessions: ImportedSession[]) => void;
  onCleared: () => void;
  /** Called after a successful confirm so the store can record undo + reload. */
  onConfirmed?: (result: { ids: string[]; sessions: ImportedSession[] }) => void;
  disabled?: boolean;
};

/** Match account API calls: cookie + Bearer from Supabase session. */
async function importAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  const accessToken = await getAccountAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

export function CalendarImportButton({
  calId,
  pendingSessions,
  onPreview,
  onCleared,
  onConfirmed,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [portalPos, setPortalPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const previewActive = (pendingSessions?.length ?? 0) > 0;

  // Keep the check/undo stack fixed to the import slot, above the calendar grid.
  useLayoutEffect(() => {
    if (!previewActive) {
      setPortalPos(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPortalPos({ top: r.top, left: r.left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [previewActive]);

  const openPicker = useCallback(() => {
    if (busy || disabled || previewActive) return;
    inputRef.current?.click();
  }, [busy, disabled, previewActive]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/calendar/import-preview", {
          method: "POST",
          credentials: "include",
          headers: await importAuthHeaders(),
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as {
          sessions?: ImportedSession[];
          skipped?: number;
          warnings?: string[];
          error?: string;
        };
        if (!res.ok) {
          toast.error(data.error || "Import failed");
          return;
        }
        const sessions = data.sessions ?? [];
        if (!sessions.length) {
          toast.error("No sessions found in that file.");
          return;
        }
        onPreview(sessions);
        const warn = data.warnings?.filter(Boolean) ?? [];
        if (warn.length) toast.message(warn[0]);
        else toast.success(`${sessions.length} sessions ready to import`);
      } catch {
        toast.error("Import failed");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onPreview],
  );

  const handleConfirm = useCallback(async () => {
    if (!pendingSessions?.length || busy) return;
    setBusy(true);
    try {
      const sessionsToSave = pendingSessions;
      const res = await fetch("/api/calendar/import-confirm", {
        method: "POST",
        credentials: "include",
        headers: await importAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          calId,
          sessions: sessionsToSave,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        inserted?: number;
        skippedDuplicates?: number;
        ids?: string[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "Could not save imported sessions");
        return;
      }
      const inserted = data.inserted ?? 0;
      const ids = data.ids ?? [];
      if (inserted === 0 || ids.length === 0) {
        toast.error("No sessions were saved");
        return;
      }
      // Confirm inserts in payload order; pair ids with the sessions we sent.
      const savedSessions = sessionsToSave.slice(0, ids.length);
      toast.success(
        inserted === 1 ? "Added 1 session" : `Added ${inserted} sessions`,
      );
      onConfirmed?.({ ids, sessions: savedSessions });
      onCleared();
    } catch {
      toast.error("Could not save imported sessions");
    } finally {
      setBusy(false);
    }
  }, [busy, calId, onCleared, onConfirmed, pendingSessions]);

  const handleUndo = useCallback(() => {
    if (busy) return;
    onCleared();
    toast.message("Import discarded");
  }, [busy, onCleared]);

  const btnBase =
    "grid h-8 w-8 place-items-center rounded-md border border-hairline bg-background/90 shadow-sm backdrop-blur transition-colors hover:bg-secondary disabled:opacity-50";

  if (previewActive) {
    const controls =
      portalPos && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-auto fixed z-[250] flex flex-col gap-1"
              style={{ top: portalPos.top, left: portalPos.left }}
            >
              <button
                type="button"
                aria-label="Confirm import"
                disabled={busy || disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleConfirm();
                }}
                className={btnBase}
                style={{ color: GREEN }}
              >
                <Check className="h-4 w-4" strokeWidth={2.5} color={GREEN} />
              </button>
              <button
                type="button"
                aria-label="Undo import"
                disabled={busy || disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleUndo();
                }}
                className={btnBase}
                style={{ color: RED }}
              >
                <X className="h-4 w-4" strokeWidth={2.5} color={RED} />
              </button>
            </div>,
            document.body,
          )
        : null;

    return (
      <>
        {/* Invisible anchor keeps layout slot; controls render in a body portal. */}
        <div ref={anchorRef} className="h-8 w-8 shrink-0" aria-hidden />
        {controls}
      </>
    );
  }

  return (
    <div className="pointer-events-auto relative">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
        }}
      />
      <button
        type="button"
        aria-label="Import calendar file"
        disabled={busy || disabled}
        onClick={(e) => {
          e.stopPropagation();
          openPicker();
        }}
        className={`${btnBase} text-ink`}
      >
        <ArrowDownToLine className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
      </button>
    </div>
  );
}
