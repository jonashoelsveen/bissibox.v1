import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

export type TableColumnWidthConfig = {
  key: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

const STORAGE_PREFIX = "cloud:entity-table:";
const RESIZE_OVERLAY_ID = "cloud-table-column-resize-overlay";

/** Fixed width for the edit / pending column in entity tables. */
export const ENTITY_TABLE_EDIT_COLUMN_WIDTH = 32;
/** Edit button is h-6 w-6 (24px), centered in the edit column. */
export const ENTITY_TABLE_EDIT_ICON_SIZE = 24;

/** Left inset where the centered edit icon starts — align Pending text here. */
export function entityTableEditIconInset(
  columnWidth = ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  iconSize = ENTITY_TABLE_EDIT_ICON_SIZE,
) {
  return (columnWidth - iconSize) / 2;
}

const DEFAULT_WIDTH = 140;
const DEFAULT_MIN = 72;
const DEFAULT_MAX = 420;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function loadWidths(
  storageKey: string,
  configs: TableColumnWidthConfig[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const config of configs) {
    result[config.key] = config.defaultWidth;
  }
  if (typeof window === "undefined") return result;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const config of configs) {
      const value = parsed[config.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        result[config.key] = clamp(value, config.minWidth, config.maxWidth);
      }
    }
  } catch {
    // Ignore invalid persisted state.
  }

  return result;
}

function showResizeOverlay() {
  if (typeof document === "undefined") return;
  if (document.getElementById(RESIZE_OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = RESIZE_OVERLAY_ID;
  overlay.setAttribute("aria-hidden", "true");
  overlay.className = "fixed inset-0 z-[9999] touch-none";
  overlay.style.cursor = "col-resize";
  document.body.appendChild(overlay);
  document.body.style.userSelect = "none";
}

function hideResizeOverlay() {
  if (typeof document === "undefined") return;
  document.getElementById(RESIZE_OVERLAY_ID)?.remove();
  document.body.style.userSelect = "";
}

export function columnWidthConfigs(
  columns: {
    key: string | number | symbol;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
  }[],
): TableColumnWidthConfig[] {
  return columns.map((column) => ({
    key: String(column.key),
    defaultWidth: column.defaultWidth ?? DEFAULT_WIDTH,
    minWidth: column.minWidth ?? DEFAULT_MIN,
    maxWidth: column.maxWidth ?? DEFAULT_MAX,
  }));
}

export function useTableColumnWidths(tableId: string, configs: TableColumnWidthConfig[]) {
  const storageKey = `${STORAGE_PREFIX}${tableId}`;

  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadWidths(storageKey, configs),
  );
  const [isResizing, setIsResizing] = useState(false);

  const persist = useCallback(
    (next: Record<string, number>) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore quota / private mode errors.
      }
    },
    [storageKey],
  );

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const resize = resizingRef.current;
      if (!resize) return;

      const config = configs.find((item) => item.key === resize.key);
      if (!config) return;

      const delta = event.clientX - resize.startX;
      const nextWidth = clamp(resize.startWidth + delta, config.minWidth, config.maxWidth);
      setWidths((prev) => ({ ...prev, [resize.key]: nextWidth }));
    };

    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      hideResizeOverlay();
      setIsResizing(false);
      persist(widthsRef.current);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      hideResizeOverlay();
      setIsResizing(false);
    };
  }, [configs, persist]);

  const startResize = useCallback(
    (key: string, event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const config = configs.find((item) => item.key === key);
      if (!config) return;

      resizingRef.current = {
        key,
        startX: event.clientX,
        startWidth: widthsRef.current[key] ?? config.defaultWidth,
      };
      showResizeOverlay();
      setIsResizing(true);
    },
    [configs],
  );

  const dataColumnsTemplate = useMemo(
    () =>
      configs
        .map((config) => `${widths[config.key] ?? config.defaultWidth}px`)
        .join(" "),
    [configs, widths],
  );

  return { widths, isResizing, startResize, dataColumnsTemplate };
}

export function ColumnResizeHandle({
  label,
  onResizeStart,
}: {
  label: string;
  onResizeStart: (event: ReactMouseEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      className="absolute right-0 top-0 z-20 h-full w-3 translate-x-1/2 cursor-col-resize touch-none"
      onMouseDown={onResizeStart}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
