/**
 * DayNoteButton + NotePanel.
 *
 * The button is the small "sticky note" affordance shown inside a day cell
 * in the diary's monthly view. Notes are persisted via Supabase
 * (`diary_day_notes`). Three kinds of notes can exist for a single day:
 *
 *   1. The member's own note          → gray side-line, header `Note dd.mm.yy`
 *   2. The current viewer's note       → blue side-line (when viewer is a
 *                                        leader / active follower), header
 *                                        `Note dd.mm.yy · <viewer name>`
 *   3. Other leader / follower notes  → blue side-line, read-only,
 *                                        header `Note dd.mm.yy · <author name>`
 *
 * Panels render below the icon, laid out horizontally so multiple leader
 * notes appear next to one another.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { StickyNote } from "lucide-react";
import { useDiaryDayNote, type AuthoredNote } from "@/hooks/useDiaryDayNote";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { ViewerRole } from "@/hooks/useViewerRole";

interface DayNoteButtonProps {
  calId: string;
  date: Date;
  variant: "week" | "month";
  anchorSelector?: string;
  memberId?: string;
  viewerRole?: ViewerRole;
}

const PANEL_W = 280;
const PANEL_GAP = 4;

function dayLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}.${String(date.getFullYear() % 100).padStart(2, "0")}`;
}

/** Lookup the current viewer's display name, used in the header of their note. */
function useViewerName(): string {
  const { user } = useAuth();
  const [name, setName] = useState<string>("");
  useEffect(() => {
    if (!user) {
      setName("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setName(`${data?.first_name ?? ""} ${data?.last_name ?? ""}`.trim());
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);
  return name;
}

export function DayNoteButton({
  calId: _calId,
  date,
  variant,
  anchorSelector = "[data-day-anchor]",
  memberId,
  viewerRole = "owner",
}: DayNoteButtonProps) {
  const effectiveMemberId = memberId ?? "";
  const { memberNote, viewerNote, leaderNotes, isOwner, canEdit, saveViewerNote } =
    useDiaryDayNote(effectiveMemberId, date, viewerRole);
  const viewerName = useViewerName();

  // Editing state per panel (member panel only owner can edit; viewer panel
  // editable for non-owner annotators).
  const [editingMember, setEditingMember] = useState(false);
  const [editingViewer, setEditingViewer] = useState(false);
  const [open, setOpen] = useState(false); // hover/preview open
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);
  const anchorElRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const hasMemberNote = !!memberNote.trim();
  const hasViewerNote = !!viewerNote.trim();
  const hasAnyNote = hasMemberNote || hasViewerNote || leaderNotes.length > 0;

  const cancelClose = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (!editingMember && !editingViewer) setOpen(false);
    }, 120);
  };

  const refreshRect = () => {
    const anchor = btnRef.current?.closest(anchorSelector) as HTMLElement | null;
    if (anchor) {
      anchorElRef.current = anchor;
      setAnchorRect(anchor.getBoundingClientRect());
    } else if (btnRef.current) {
      setAnchorRect(btnRef.current.getBoundingClientRect());
    }
  };

  // Hover the icon → open in preview mode (only if there's something to preview).
  useEffect(() => {
    if (!hasAnyNote) return;
    const btn = btnRef.current;
    if (!btn) return;
    anchorElRef.current = btn;
    const onEnter = () => {
      cancelClose();
      setOpen(true);
      refreshRect();
    };
    btn.addEventListener("mouseenter", onEnter);
    return () => btn.removeEventListener("mouseenter", onEnter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnyNote, anchorSelector]);

  // Close when leaving both anchor and any open panel.
  useEffect(() => {
    if (!open || editingMember || editingViewer) return;
    const onMove = (e: MouseEvent) => {
      const inside = (el: Element | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const pad = 6;
        return (
          e.clientX >= r.left - pad &&
          e.clientX <= r.right + pad &&
          e.clientY >= r.top - pad &&
          e.clientY <= r.bottom + pad
        );
      };
      const anchor = anchorElRef.current;
      const panels = Array.from(document.querySelectorAll('[data-note-panel="1"]'));
      if (!inside(anchor) && !panels.some(inside)) scheduleClose();
      else cancelClose();
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [open, editingMember, editingViewer]);

  // Close panels on outside click while editing.
  useEffect(() => {
    if (!editingMember && !editingViewer) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      const inside = (sel: string) => !!(t as HTMLElement | null)?.closest(sel);
      if (!inside('[data-note-panel="1"]') && !inside("[data-day-note-btn]")) {
        setEditingMember(false);
        setEditingViewer(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [editingMember, editingViewer]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshRect();
    setOpen(true);
    if (isOwner) setEditingMember(true);
    else if (canEdit) setEditingViewer(true);
  };

  const positionClass =
    variant === "week"
      ? "absolute left-1 top-1/2 -translate-y-1/2 flex flex-row items-center gap-0.5"
      : "absolute left-1 bottom-1 flex flex-row items-center gap-0.5";

  const hasOtherNotes = leaderNotes.length > 0 || hasViewerNote;

  // Build the panel list (top-down). Member's own note is ALWAYS on top
  // when present. Owner-as-viewer also gets a member edit slot when opening.
  const panelItems = useMemo(() => {
    type Item = {
      key: string;
      tone: "gray" | "leader";
      header: string;
      value: string;
      mode: "preview" | "edit";
      onSave: (text: string) => void;
      onRequestEdit?: () => void;
    };
    const items: Item[] = [];
    const baseHeader = `Note ${dayLabel(date)}`;

    // 1. Member panel
    if (hasMemberNote || (isOwner && (editingMember || open))) {
      items.push({
        key: "member",
        tone: "gray",
        header: baseHeader,
        value: memberNote,
        mode: isOwner && editingMember ? "edit" : "preview",
        onSave: isOwner ? (text) => void saveViewerNote(text) : () => {},
        onRequestEdit: isOwner ? () => setEditingMember(true) : undefined,
      });
    }

    // 2. Current viewer's own note (when not the owner). Always rendered for
    //    leader/active-follower so they can compose even when no notes exist.
    if (!isOwner && canEdit) {
      items.push({
        key: "viewer",
        tone: "leader",
        header: viewerName || "Notat",
        value: viewerNote,
        mode: editingViewer ? "edit" : "preview",
        onSave: (text) => void saveViewerNote(text),
        onRequestEdit: () => setEditingViewer(true),
      });
    }

    // 3. Other leader / follower notes (read-only).
    for (const n of leaderNotes) {
      items.push({
        key: `leader-${n.authorId}`,
        tone: "leader",
        header: n.authorName || "Notat",
        value: n.body,
        mode: "preview",
        onSave: () => {},
      });
    }
    return items;
  }, [
    date,
    hasMemberNote,
    isOwner,
    editingMember,
    open,
    memberNote,
    saveViewerNote,
    canEdit,
    editingViewer,
    viewerName,
    viewerNote,
    leaderNotes,
  ]);

  const showPanels =
    (open || editingMember || editingViewer) && panelItems.length > 0 && !!anchorRect;

  // Icon visibility:
  // - Owner: gray icon always shown; black icon only if others have written.
  // - Leader/active-follower: black icon always shown; gray only if member wrote.
  const memberIconVisible = isOwner || hasMemberNote;
  const otherIconVisible = isOwner ? hasOtherNotes : true;

  // Container position for the stack of panels.
  const margin = 8;
  let stackLeft = anchorRect?.left ?? 0;
  if (anchorRect && stackLeft + PANEL_W > window.innerWidth - margin) {
    stackLeft = Math.max(margin, window.innerWidth - PANEL_W - margin);
  }
  const stackTop = anchorRect?.bottom ?? 0;
  const stackMaxH = anchorRect ? Math.max(120, window.innerHeight - stackTop - margin) : 400;

  return (
    <>
      <div ref={btnRef} className={positionClass} data-day-note-btn="1">
        {memberIconVisible && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              refreshRect();
              setOpen(true);
              if (isOwner) setEditingMember(true);
              else if (canEdit) setEditingViewer(true);
            }}
            aria-label={hasAnyNote ? "Vis dagsnotater" : "Legg til dagsnotat"}
            title={hasAnyNote ? "Vis dagsnotater" : "Legg til dagsnotat"}
            className={[
              "z-[3] grid h-5 w-5 place-items-center rounded transition-colors",
              hasMemberNote
                ? "opacity-100"
                : "opacity-0 group-hover/daynote-anchor:opacity-100",
              "text-muted-foreground/45 hover:text-muted-foreground",
            ].join(" ")}
          >
            <StickyNote className="h-3 w-3" strokeWidth={2.25} />
          </button>
        )}
        {otherIconVisible && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              refreshRect();
              setOpen(true);
              if (canEdit && !isOwner) setEditingViewer(true);
            }}
            aria-label="Vis notater fra andre"
            title="Notater fra andre"
            className={[
              "z-[3] grid h-5 w-5 place-items-center rounded transition-colors",
              hasOtherNotes
                ? "opacity-100"
                : "opacity-0 group-hover/daynote-anchor:opacity-100",
              "text-ink/80 hover:text-ink",
            ].join(" ")}
          >
            <StickyNote className="h-3 w-3" strokeWidth={2.25} />
          </button>
        )}
      </div>
      {showPanels &&
        createPortal(
          <div
            data-note-panel-stack="1"
            className="fixed z-50 flex flex-col"
            style={{
              top: stackTop,
              left: stackLeft,
              width: PANEL_W,
              maxHeight: stackMaxH,
              overflowY: "auto",
              gap: PANEL_GAP,
            }}
            onMouseEnter={() => {
              cancelClose();
              setOpen(true);
            }}
            onMouseLeave={() => scheduleClose()}
          >
            {panelItems.map((p, idx) => (
              <NotePanel
                key={p.key}
                inline
                attached={idx > 0}
                headerLabel={p.header}
                initialValue={p.value}
                mode={p.mode}
                tone={p.tone}
                closeOnEnter={false}
                closeOnOutsideClick={false}
                onSave={p.onSave}
                onClose={() => {
                  if (p.key === "member") setEditingMember(false);
                  else if (p.key === "viewer") setEditingViewer(false);
                  setOpen(false);
                }}
                onRequestEdit={p.onRequestEdit}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ============================================================
 * NotePanel — reusable note popover (read-only preview / editable)
 * ============================================================ */

export interface NotePanelProps {
  anchorRect?: DOMRect;
  headerLabel?: string;
  initialValue: string;
  mode: "preview" | "edit";
  defaultBodyHeight?: number;
  panelWidth?: number;
  placement?: "below-anchor-left" | "right-of-anchor-top";
  closeOnEnter?: boolean;
  closeOnOutsideClick?: boolean;
  showFooter?: boolean;
  /** When true, render inline (no portal, no fixed positioning). */
  inline?: boolean;
  /** When true, this panel is stacked beneath another — drop top border + radius. */
  attached?: boolean;
  /** Side-line tone. "gray" = member; "leader" = brand primary blue. */
  tone?: "gray" | "leader";
  onSave: (text: string) => void;
  onClose: () => void;
  onRequestEdit?: () => void;
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
}

export function NotePanel({
  anchorRect,
  headerLabel,
  initialValue,
  mode,
  defaultBodyHeight,
  panelWidth = 280,
  placement = "below-anchor-left",
  closeOnEnter = true,
  closeOnOutsideClick = true,
  showFooter = true,
  inline = false,
  attached = false,
  tone = "gray",
  onSave,
  onClose,
  onRequestEdit,
  onPanelMouseEnter,
  onPanelMouseLeave,
}: NotePanelProps) {
  const effectiveBodyHeight = defaultBodyHeight ?? (inline ? 80 : 240);
  const [val, setVal] = useState(initialValue);
  const ref = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [extra, setExtra] = useState(0);
  const [footerHidden, setFooterHidden] = useState(false);
  const isEdit = mode === "edit";

  useEffect(() => {
    if (mode === "preview") setVal(initialValue);
  }, [initialValue, mode]);

  useEffect(() => {
    if (!isEdit) return;
    const ta = taRef.current;
    if (!ta) return;
    const len = ta.value.length;
    requestAnimationFrame(() => {
      ta.focus();
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, [isEdit]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.max(effectiveBodyHeight + extra, ta.scrollHeight);
    ta.style.height = next + "px";
  }, [val, extra, effectiveBodyHeight]);

  useEffect(() => {
    if (!isEdit) return;
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutsideClick) return;
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onSave(val);
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSave(val);
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (closeOnEnter) {
          e.preventDefault();
          onSave(val);
          onClose();
        } else {
          e.preventDefault();
          onSave(val);
          setFooterHidden(true);
          taRef.current?.blur();
        }
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [val, isEdit, onSave, onClose, closeOnEnter, closeOnOutsideClick]);

  const onDragStart = (e: React.MouseEvent) => {
    if (!isEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startExtra = extra;
    const move = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      setExtra(Math.max(0, startExtra + dy));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const margin = 8;
  let style: CSSProperties;
  if (inline) {
    style = { width: "100%" };
  } else {
    const ar = anchorRect!;
    let left: number;
    let top: number;
    let transformOrigin = "top left";
    if (placement === "right-of-anchor-top") {
      left = ar.right + 6;
      top = ar.top;
      if (left + panelWidth > window.innerWidth - margin) {
        left = Math.max(margin, ar.left - panelWidth - 6);
        transformOrigin = "top right";
      }
    } else {
      left = ar.left;
      top = ar.bottom;
      if (left + panelWidth > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - panelWidth - margin);
      }
    }
    style = { top, left, width: panelWidth, transformOrigin };
  }

  // Use the raw token value: --primary is `oklch(...)` already, so it must
  // be substituted directly, not wrapped in `hsl(...)` (which yields invalid color).
  const sideLineColor = tone === "leader" ? "var(--primary)" : "#9CA3AF";

  const content = (
    <motion.div
      ref={ref}
      data-note-panel="1"
      data-note-tone={tone}
      className={inline ? "relative" : "fixed z-50"}
      style={style}
      initial={{ opacity: 0, scaleY: 0.6, y: -4 }}
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={{ opacity: 0, scaleY: 0.6, y: -4 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      onMouseEnter={onPanelMouseEnter}
      onMouseLeave={onPanelMouseLeave}
      onClick={(e) => {
        if (!isEdit && onRequestEdit) {
          e.stopPropagation();
          onRequestEdit();
        }
      }}
    >
      <div
        className={[
          "relative overflow-hidden border-x border-b border-ink/15 bg-card shadow-lg rounded-b-md",
          attached ? "" : "border-t rounded-t-md",
        ].join(" ")}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: sideLineColor }}
        />
        {headerLabel ? (
          <div className="flex items-center justify-between border-b border-hairline pl-4 pr-3 py-1.5">
            <span
              className="text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{
                color:
                  tone === "leader"
                    ? "var(--primary)"
                    : "hsl(var(--muted-foreground))",
              }}
            >
              {headerLabel}
            </span>
          </div>
        ) : null}
        <div className="pl-4 pr-3 py-2">
          {isEdit ? (
            <textarea
              ref={taRef}
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                if (footerHidden) setFooterHidden(false);
              }}
              onFocus={() => {
                if (footerHidden) setFooterHidden(false);
              }}
              placeholder="Skriv notat…"
              className="block w-full resize-none bg-transparent text-[12px] leading-snug text-ink outline-none placeholder:text-muted-foreground/60"
              style={{ minHeight: effectiveBodyHeight + extra }}
            />
          ) : (
            <div
              className="block w-full whitespace-pre-wrap text-[12px] leading-snug text-ink"
              style={{
                minHeight: inline ? undefined : effectiveBodyHeight,
                cursor: onRequestEdit ? "text" : "default",
              }}
            >
              {initialValue || (
                <span className="text-muted-foreground/60">Skriv notat…</span>
              )}
            </div>
          )}
        </div>
        {isEdit && showFooter && !footerHidden && (
          <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
            <span className="mono tabular-nums">⏎ for å lagre</span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                onSave(val);
                setFooterHidden(true);
                taRef.current?.blur();
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              {initialValue ? "Lagre" : "Legg til"}
            </button>
          </div>
        )}
        {isEdit && (
          <div
            onMouseDown={onDragStart}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-secondary/60"
            aria-hidden
          />
        )}
      </div>
    </motion.div>
  );

  return inline ? content : createPortal(content, document.body);
}
