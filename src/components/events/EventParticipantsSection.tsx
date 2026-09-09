/**
 * Event Participants — organizer search + subevent filter + Overview-style table.
 * Participant data is event-scoped and never shares state with entity members.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Search, X } from "lucide-react";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import { cn } from "@/lib/utils";
import { EventParticipantModal } from "./EventParticipantModal";
import {
  DEFAULT_SUBEVENT_COLOR,
  type EventDraft,
  type EventParticipantDraft,
  type EventSubeventDraft,
} from "./event-ui-types";

const SELECTION_PURPLE = "#AF52DE";
const SELECTION_GAP_SHADOW = "inset 0 0.5px 0 0 rgba(255,255,255,0.28)";

const PARTICIPANT_COLUMNS = [
  { key: "name", label: "Name", defaultWidth: 180, minWidth: 120, maxWidth: 360 },
  { key: "surname", label: "Surname", defaultWidth: 132, minWidth: 96, maxWidth: 240 },
  { key: "born", label: "Born", defaultWidth: 112, minWidth: 96, maxWidth: 180 },
  { key: "subevent", label: "Subevent", defaultWidth: 160, minWidth: 96, maxWidth: 320 },
] as const;

const ALL_FILTER = "all";

function FolderIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <path
        d="M1.5 3.25C1.5 2.56 2.06 2 2.75 2h3.05l1.2 1.2h6.25c.69 0 1.25.56 1.25 1.25v7.3c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V3.25Z"
        fill={color}
      />
      <path
        d="M1.5 4.75h13v6.05c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.75Z"
        fill={color}
        opacity={0.82}
      />
    </svg>
  );
}

function OverviewUserIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <circle cx="8" cy="3.85" r="3.1" fill={color} />
      <path
        d="M3.15 13.35A4.85 4.85 0 0 1 12.85 13.35L12.85 14H3.15v-.65Z"
        fill={color}
      />
    </svg>
  );
}

function rowSelectionClass(isSelected: boolean, rowIndex: number): string {
  if (isSelected) return "overflow-hidden rounded-md text-white";
  return cn(
    "rounded-md text-ink",
    rowIndex % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
  );
}

type Props = {
  draft: EventDraft;
  onChange: (patch: { participants: EventParticipantDraft[] }) => void;
};

export function EventParticipantsSection({ draft, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [subeventFilter, setSubeventFilter] = useState<string>(ALL_FILTER);
  const [editing, setEditing] = useState<EventParticipantDraft | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectionAnchorRef = useRef<string | null>(null);

  const widthConfigs = useMemo(
    () => columnWidthConfigs([...PARTICIPANT_COLUMNS]),
    [],
  );
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(
    "event-participants",
    widthConfigs,
  );
  const gridTemplate = `${dataColumnsTemplate} ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px`;

  const subevents = useMemo(
    () => [...draft.subevents].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft.subevents],
  );
  const subeventById = useMemo(() => {
    const map = new Map<string, EventSubeventDraft>();
    for (const s of subevents) map.set(s.id, s);
    return map;
  }, [subevents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return draft.participants.filter((p) => {
      if (subeventFilter !== ALL_FILTER && p.subeventId !== subeventFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [p.name, p.surname, p.email, p.phone, p.born]
        .join(" ")
        .toLowerCase();
      const sub = p.subeventId ? subeventById.get(p.subeventId) : null;
      const subName = (sub?.name ?? "").toLowerCase();
      return hay.includes(q) || subName.includes(q);
    });
  }, [draft.participants, query, subeventFilter, subeventById]);

  const orderedIds = useMemo(() => filtered.map((p) => p.id), [filtered]);

  useEffect(() => {
    const live = new Set(orderedIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [orderedIds]);

  useEffect(() => {
    if (selected.size === 0) return;
    const clear = () => {
      selectedRef.current = new Set();
      selectionAnchorRef.current = null;
      setSelected(new Set());
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-event-participant-row]")) return;
      if (target.closest("[data-event-participant-keep-selection]")) return;
      if (
        target.closest(
          '[role="dialog"], [data-radix-popper-content-wrapper], .mac-menu',
        )
      ) {
        return;
      }
      clear();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected.size]);

  const selectionGapAbove = useMemo(() => {
    const gaps = new Set<string>();
    for (let i = 1; i < filtered.length; i++) {
      if (selected.has(filtered[i - 1].id) && selected.has(filtered[i].id)) {
        gaps.add(filtered[i].id);
      }
    }
    return gaps;
  }, [filtered, selected]);

  const applyFinderSelect = (id: string, shiftKey: boolean) => {
    if (shiftKey && selectionAnchorRef.current) {
      const from = orderedIds.indexOf(selectionAnchorRef.current);
      const to = orderedIds.indexOf(id);
      if (from >= 0 && to >= 0) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const next = new Set(orderedIds.slice(lo, hi + 1));
        selectedRef.current = next;
        setSelected(next);
        return;
      }
    }
    const next = new Set([id]);
    selectedRef.current = next;
    selectionAnchorRef.current = id;
    setSelected(next);
  };

  const saveParticipant = (row: EventParticipantDraft) => {
    onChange({
      participants: draft.participants.map((p) => (p.id === row.id ? row : p)),
    });
    setEditing(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div
        data-event-participant-keep-selection
        className="flex flex-none flex-col gap-3 px-6 pb-3 pt-6"
      >
        <AppleSearchField query={query} onQueryChange={setQuery} />
        <SubeventFilterDropdown
          value={subeventFilter}
          onChange={setSubeventFilter}
          subevents={subevents}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {PARTICIPANT_COLUMNS.map((c) => (
            <div
              key={c.key}
              className={cn(
                "relative flex min-w-0 items-stretch border-r border-hairline",
                !isResizing && "hover:bg-secondary/40",
              )}
            >
              <div className="pointer-events-none flex min-w-0 flex-1 items-center px-3 text-left font-normal">
                <span className="truncate">{c.label}</span>
              </div>
              <ColumnResizeHandle
                label={c.label}
                onResizeStart={(event) => startResize(c.key, event)}
              />
            </div>
          ))}
          <div />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {filtered.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              {draft.participants.length === 0
                ? "No participants signed up yet."
                : "No matching participants."}
            </div>
          ) : (
            filtered.map((row, rowIndex) => {
              const isSelected = selected.has(row.id);
              const sub = row.subeventId
                ? subeventById.get(row.subeventId)
                : null;
              return (
                <div
                  key={row.id}
                  data-event-participant-row
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (e.shiftKey) {
                      applyFinderSelect(row.id, true);
                      return;
                    }
                    if (!selectedRef.current.has(row.id)) {
                      applyFinderSelect(row.id, false);
                    }
                  }}
                  className={cn(
                    "group mb-px grid h-[22px] cursor-default select-none items-center text-[12px]",
                    rowSelectionClass(isSelected, rowIndex),
                    !isResizing && "transition-colors duration-75",
                    isSelected
                      ? "hover:brightness-[0.96]"
                      : "hover:bg-[#EAEAEC]",
                  )}
                  style={{
                    gridTemplateColumns: gridTemplate,
                    ...(isSelected
                      ? {
                          backgroundColor: SELECTION_PURPLE,
                          boxShadow: selectionGapAbove.has(row.id)
                            ? SELECTION_GAP_SHADOW
                            : undefined,
                        }
                      : {}),
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1 truncate px-3">
                    <OverviewUserIcon
                      color={isSelected ? "#FFFFFF" : "#AEAEB2"}
                    />
                    <span className="truncate">{row.name || "—"}</span>
                  </div>
                  <div className="truncate px-3">{row.surname || "—"}</div>
                  <div className="truncate px-3">{row.born || "—"}</div>
                  <div className="flex min-w-0 items-center gap-1.5 truncate px-3">
                    {sub ? (
                      <>
                        <FolderIcon
                          color={sub.color || DEFAULT_SUBEVENT_COLOR}
                        />
                        <span className="truncate">{sub.name || "Untitled"}</span>
                      </>
                    ) : (
                      <span className="truncate text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                  </div>
                  <div className="flex h-full max-h-[22px] items-center justify-center overflow-hidden">
                    <button
                      type="button"
                      aria-label={`Edit ${row.name} ${row.surname}`.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(row);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        "grid h-[22px] w-[22px] cursor-pointer place-items-center",
                        isSelected
                          ? "text-white/90 hover:text-white"
                          : "text-muted-foreground hover:text-ink",
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <EventParticipantModal
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing}
        subevents={subevents}
        onSave={saveParticipant}
      />
    </div>
  );
}

function AppleSearchField({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative w-full max-w-[420px]">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8E8E93]"
        strokeWidth={2}
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search"
        aria-label="Search participants"
        className={cn(
          "h-11 w-full rounded-[10px] border-0 bg-[#F2F2F7] pl-10 pr-10 text-[17px] text-ink",
          "placeholder:text-[#8E8E93] outline-none",
          "focus:bg-[#EBEBF0] focus:ring-0",
        )}
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[#C7C7CC] text-white hover:bg-[#AEAEB2]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

function SubeventFilterDropdown({
  value,
  onChange,
  subevents,
}: {
  value: string;
  onChange: (v: string) => void;
  subevents: EventSubeventDraft[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSub =
    value === ALL_FILTER ? null : subevents.find((s) => s.id === value) ?? null;

  return (
    <div ref={rootRef} className="relative w-full max-w-[420px]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-[10px] border-0 bg-[#F2F2F7] px-3.5 text-left text-[17px] text-ink",
          "transition-colors hover:bg-[#EBEBF0]",
          open && "bg-[#EBEBF0]",
        )}
      >
        {selectedSub ? (
          <FolderIcon color={selectedSub.color || DEFAULT_SUBEVENT_COLOR} />
        ) : (
          <FolderIcon color="#AEAEB2" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {selectedSub ? selectedSub.name || "Untitled" : "All"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-full overflow-hidden rounded-[10px] border border-black/8 bg-white/95 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        >
          <FilterOption
            selected={value === ALL_FILTER}
            label="All"
            color="#AEAEB2"
            onSelect={() => {
              onChange(ALL_FILTER);
              setOpen(false);
            }}
          />
          {subevents.map((s) => (
            <FilterOption
              key={s.id}
              selected={value === s.id}
              label={s.name || "Untitled"}
              color={s.color || DEFAULT_SUBEVENT_COLOR}
              onSelect={() => {
                onChange(s.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterOption({
  selected,
  label,
  color,
  onSelect,
}: {
  selected: boolean;
  label: string;
  color: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px]",
        selected ? "bg-[#007AFF]/12 text-ink" : "text-ink hover:bg-black/[0.04]",
      )}
    >
      <FolderIcon color={color} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
