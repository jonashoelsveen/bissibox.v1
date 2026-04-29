/**
 * YearRightPanel — dual-state side panel.
 *
 *   State A (no cell selected): macro browsing
 *     - mini month-picker (jumps the grid focus)
 *     - layer toggles (Events / Meetings / Trainings)
 *
 *   State B (cell selected): edit panel
 *     - magnified live preview
 *     - typography (B / I / U)
 *     - 8-color group palette + custom HEX
 *     - description textarea
 *     - location & course tabs (placeholders, full map modal arrives next)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Italic,
  MapPin,
  Plus,
  Route,
  Underline,
} from "lucide-react";
import { GROUP_COLOR_PALETTE } from "@/components/GroupColorPicker";
import type { CellData, CellKey, CalendarLayer } from "./yearStore";
import { makeCellId } from "./yearStore";

export interface LayerVisibility {
  events: boolean;
  meetings: boolean;
  trainings: boolean;
  groups: Record<string, boolean>; // groupId -> visible
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export interface YearRightPanelProps {
  calId: string;
  year: number;
  selected: CellKey | null;
  data: Record<string, CellData>;
  onPatchCell: (k: CellKey, patch: Partial<CellData>) => void;
  onJumpToDay: (month: number, day: number) => void;
  visibility: LayerVisibility;
  setVisibility: (next: LayerVisibility) => void;
  groups: { id: string; name: string }[];
}

type PanelMode = "browse" | "edit";

export function YearRightPanel(props: YearRightPanelProps) {
  // Tab is fully manual. Default to "browse"; user toggles to "edit".
  // Selecting a cell does NOT automatically switch tabs.
  const [mode, setMode] = useState<PanelMode>("browse");

  const canEdit = !!props.selected;

  // If user is on edit but selection clears, fall back to browse.
  useEffect(() => {
    if (mode === "edit" && !props.selected) setMode("browse");
  }, [mode, props.selected]);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col gap-3 border-l border-hairline bg-card/40 p-3">
      {/* Two-tab manual switch */}
      <div className="grid grid-cols-2 gap-1 rounded-md border border-hairline bg-background p-0.5">
        <button
          onClick={() => setMode("browse")}
          className={`rounded-sm py-1 text-[11px] font-medium transition ${
            mode === "browse"
              ? "bg-secondary text-ink"
              : "text-muted-foreground hover:text-ink"
          }`}
        >
          Browse
        </button>
        <button
          onClick={() => canEdit && setMode("edit")}
          disabled={!canEdit}
          title={canEdit ? "Edit selected cell" : "Select a cell to edit"}
          className={`rounded-sm py-1 text-[11px] font-medium transition ${
            mode === "edit"
              ? "bg-secondary text-ink"
              : "text-muted-foreground hover:text-ink"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Edit
        </button>
      </div>

      {mode === "edit" && props.selected ? (
        <EditPanel {...props} />
      ) : (
        <BrowsePanel {...props} />
      )}
    </aside>
  );
}

/* -------------------- State A -------------------- */

function BrowsePanel(props: YearRightPanelProps) {
  const { year, onJumpToDay, visibility, setVisibility, groups } = props;
  const [selected, setSelected] = useState<{ m: number; d: number } | null>(() => {
    const t = new Date();
    return t.getFullYear() === year ? { m: t.getMonth(), d: t.getDate() } : null;
  });

  return (
    <div className="flex flex-col gap-4">
      <MiniYearGrid
        year={year}
        selected={selected}
        onPick={(m, d) => {
          setSelected({ m, d });
          onJumpToDay(m, d);
        }}
      />

      <div className="flex flex-col gap-1">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Layers
        </p>
        <LayerRow
          label="Events"
          visible={visibility.events}
          onToggle={() => setVisibility({ ...visibility, events: !visibility.events })}
        />
        <LayerRow
          label="Meetings"
          visible={visibility.meetings}
          onToggle={() => setVisibility({ ...visibility, meetings: !visibility.meetings })}
        />
        <LayerRow
          label="Trainings"
          visible={visibility.trainings}
          onToggle={() => setVisibility({ ...visibility, trainings: !visibility.trainings })}
        />
        {groups.length > 0 && (
          <div
            className={`ml-5 mt-1 flex flex-col gap-0.5 border-l border-hairline pl-2 ${
              visibility.trainings ? "" : "opacity-40 pointer-events-none"
            }`}
          >
            {groups.map((g) => (
              <LayerRow
                key={g.id}
                label={g.name}
                small
                visible={!!visibility.groups[g.id]}
                onToggle={() =>
                  setVisibility({
                    ...visibility,
                    groups: { ...visibility.groups, [g.id]: !visibility.groups[g.id] },
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LayerRow({
  label,
  visible,
  onToggle,
  small,
}: {
  label: string;
  visible: boolean;
  onToggle: () => void;
  small?: boolean;
}) {
  return (
    <div
      className={`group flex items-center justify-between rounded-md px-2 py-1 hover:bg-secondary/50 ${
        small ? "text-[11px]" : "text-xs"
      }`}
    >
      <span className={visible ? "text-ink" : "text-muted-foreground/70 line-through"}>
        {label}
      </span>
      <button
        onClick={onToggle}
        aria-label={visible ? "Hide" : "Show"}
        className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:text-ink"
      >
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function MiniMonthCalendar({
  year,
  month,
  selected,
  onMonthChange,
  onPick,
}: {
  year: number;
  month: number;
  selected: { m: number; d: number } | null;
  onMonthChange: (m: number) => void;
  onPick: (month: number, day: number) => void;
}) {
  const today = new Date();
  const isToday = (m: number, d: number) =>
    today.getFullYear() === year && today.getMonth() === m && today.getDate() === d;

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: ({ d: number; we: boolean } | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      const dow = new Date(year, month, d).getDay();
      return { d, we: dow === 0 || dow === 6 };
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div className="rounded-lg border border-hairline bg-background p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onMonthChange((month + 11) % 12)}
          aria-label="Previous month"
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-[13px] font-semibold tracking-tight text-ink">
          {MONTH_LABELS_FULL[month]} {year}
        </div>
        <button
          onClick={() => onMonthChange((month + 1) % 12)}
          aria-label="Next month"
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={i}
            className="grid h-6 place-items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {rows.flat().map((c, i) => {
          if (!c) return <div key={i} className="h-9" />;
          const td = isToday(month, c.d);
          const isSel = selected?.m === month && selected?.d === c.d;
          return (
            <div key={i} className="grid place-items-center">
              <button
                onClick={() => onPick(month, c.d)}
                className={`grid h-9 w-9 place-items-center rounded-full text-[13px] font-medium transition ${
                  isSel
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : td
                      ? "bg-primary/15 text-ink ring-1 ring-primary/40"
                      : c.we
                        ? "text-muted-foreground hover:bg-secondary"
                        : "text-ink hover:bg-secondary"
                }`}
              >
                {c.d}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_LABELS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];


/* -------------------- State B -------------------- */

function EditPanel(props: YearRightPanelProps) {
  const { calId, selected, data, onPatchCell } = props;
  const k = selected!;
  const id = makeCellId(calId, k);
  const cell: CellData = data[id] ?? { id, text: "" };

  // Local mirror for snappy typing
  const [text, setText] = useState(cell.text);
  const [desc, setDesc] = useState(cell.description ?? "");
  const [showCustom, setShowCustom] = useState(false);
  const [customHex, setCustomHex] = useState(cell.color ?? "#1960C4");
  const idRef = useRef(id);

  useEffect(() => {
    if (idRef.current !== id) {
      idRef.current = id;
      setText(cell.text);
      setDesc(cell.description ?? "");
    }
  }, [id, cell.text, cell.description]);

  const dateLabel = useMemo(() => {
    const d = new Date(k.year, k.month, k.day);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }, [k]);

  const palette = GROUP_COLOR_PALETTE;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {dateLabel} · Session {k.session + 1}
        </span>
      </div>

      {/* Live preview cell */}
      <div
        className="rounded-md border border-hairline bg-background p-3 shadow-sm"
        style={{
          backgroundColor: cell.color ? cell.color + "1A" : undefined,
          borderColor: cell.color ?? undefined,
        }}
      >
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onPatchCell(k, { text: e.target.value });
          }}
          placeholder="Cell content"
          className={`w-full bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground/50 ${
            cell.bold ? "font-bold" : "font-medium"
          } ${cell.italic ? "italic" : ""} ${cell.underline ? "underline" : ""}`}
          style={{ color: cell.color ?? undefined }}
        />
      </div>

      {/* Typography */}
      <div className="flex items-center gap-1">
        <ToggleBtn
          active={!!cell.bold}
          onClick={() => onPatchCell(k, { bold: !cell.bold })}
          label="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToggleBtn>
        <ToggleBtn
          active={!!cell.italic}
          onClick={() => onPatchCell(k, { italic: !cell.italic })}
          label="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToggleBtn>
        <ToggleBtn
          active={!!cell.underline}
          onClick={() => onPatchCell(k, { underline: !cell.underline })}
          label="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </ToggleBtn>
      </div>

      {/* Color palette */}
      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Color
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onPatchCell(k, { color: undefined })}
            title="None"
            className={`h-6 w-6 rounded border border-hairline ${!cell.color ? "ring-2 ring-primary" : ""}`}
            style={{
              backgroundImage:
                "linear-gradient(135deg, transparent 45%, rgba(120,120,120,0.6) 45%, rgba(120,120,120,0.6) 55%, transparent 55%)",
            }}
          />
          {palette.map((c) => (
            <button
              key={c.value}
              onClick={() => onPatchCell(k, { color: c.value })}
              title={c.name}
              className={`h-6 w-6 rounded border border-black/10 transition hover:scale-110 ${
                cell.color?.toLowerCase() === c.value.toLowerCase()
                  ? "ring-2 ring-primary ring-offset-1"
                  : ""
              }`}
              style={{ background: c.value }}
            />
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="rounded border border-hairline px-2 py-1 text-[10px] text-muted-foreground hover:text-ink"
          >
            Custom
          </button>
        </div>
        {showCustom && (
          <div className="flex items-center gap-2 rounded border border-hairline bg-background p-2">
            <input
              type="color"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0"
            />
            <input
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              className="flex-1 rounded border border-hairline bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-ink"
            />
            <button
              onClick={() => {
                onPatchCell(k, { color: customHex.toUpperCase() });
                setShowCustom(false);
              }}
              className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:opacity-90"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Details
        </p>
        <textarea
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            onPatchCell(k, { description: e.target.value });
          }}
          rows={4}
          placeholder="Add a description…"
          className="w-full resize-y rounded-md border border-hairline bg-background px-2 py-1.5 text-xs text-ink outline-none placeholder:text-muted-foreground/50 focus:border-primary"
        />
      </div>

      {/* Location */}
      <SelectorRow
        icon={<MapPin className="h-3.5 w-3.5" />}
        label="Location"
        valueLabel={cell.locationId ? "Selected location" : "None"}
        onAddNew={() => {
          /* hook into Map modal — handled by parent container in next iteration */
          window.dispatchEvent(new CustomEvent("calendar:new-location"));
        }}
      />

      {/* Course */}
      <SelectorRow
        icon={<Route className="h-3.5 w-3.5" />}
        label="Course"
        valueLabel={cell.courseId ? "Selected course" : "None"}
        onAddNew={() => {
          window.dispatchEvent(new CustomEvent("calendar:new-course"));
        }}
      />
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-7 w-7 place-items-center rounded border transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-hairline bg-card text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SelectorRow({
  icon,
  label,
  valueLabel,
  onAddNew,
}: {
  icon: React.ReactNode;
  label: string;
  valueLabel: string;
  onAddNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-1">
        <button className="flex flex-1 items-center gap-2 rounded-md border border-hairline bg-background px-2 py-1.5 text-left text-xs text-ink hover:border-primary">
          <span className="text-muted-foreground">{icon}</span>
          <span className="flex-1 truncate">{valueLabel}</span>
        </button>
        <button
          onClick={onAddNew}
          aria-label={`New ${label}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-hairline bg-background text-muted-foreground hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
