/**
 * YearCalendarView — full year view orchestrator.
 *
 * Wraps the editable title (H1, double-click to rename), a settings gear,
 * the YearGrid, and the dual-state YearRightPanel side-by-side.
 */

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Undo2, Redo2 } from "lucide-react";
import { useYearStore, type CellKey } from "./yearStore";
import { YearGrid } from "./YearGrid";
import { YearRightPanel, type LayerVisibility } from "./YearRightPanel";

export function YearCalendarView({ calId, defaultTitle }: { calId: string; defaultTitle: string }) {
  const { data, meta, upsertCell, fillRange, setMeta, undo, redo, canUndo, canRedo } =
    useYearStore(calId, defaultTitle);
  const [selected, setSelected] = useState<CellKey | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meta.title);

  const [visibility, setVisibility] = useState<LayerVisibility>({
    events: true,
    meetings: true,
    trainings: true,
    groups: {},
  });

  const commitTitle = () => {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (v && v !== meta.title) setMeta({ ...meta, title: v });
    else setTitleDraft(meta.title);
  };

  return (
    <div className="mt-3 flex flex-col">
      {/* Header — inline-editable title + gear */}
      <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setEditingTitle(false);
                setTitleDraft(meta.title);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-xl font-semibold text-ink outline-none focus:border-primary"
          />
        ) : (
          <h1
            onDoubleClick={() => {
              setTitleDraft(meta.title);
              setEditingTitle(true);
            }}
            className="cursor-text truncate text-xl font-semibold text-ink"
            title="Double-click to rename"
          >
            {meta.title}
          </h1>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{meta.year}</span>
          <button
            aria-label="Calendar settings"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-[60vh] gap-0">
        <div className="min-w-0 flex-1">
          <YearGrid
            calId={calId}
            year={meta.year}
            data={data}
            selected={selected}
            onSelect={setSelected}
            onCommitText={(k, text) => upsertCell(k, { text })}
            onFill={fillRange}
          />
        </div>
        <YearRightPanel
          calId={calId}
          year={meta.year}
          selected={selected}
          data={data}
          onPatchCell={(k, patch) => upsertCell(k, patch)}
          onJumpToDay={(month, day) => {
            // Selecting via mini-cal selects the upper session of that day
            setSelected({ year: meta.year, month, day, session: 0 });
          }}
          visibility={visibility}
          setVisibility={setVisibility}
          groups={[]}
        />
      </div>
    </div>
  );
}
