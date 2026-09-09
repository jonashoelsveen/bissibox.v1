import { useMemo, type ReactNode } from "react";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import { cn } from "@/lib/utils";

export type EntitySimpleColumn = {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
};

export function EntitySimpleDataTable<Row extends { id: string }>({
  tableId,
  columns,
  rows,
  loading = false,
  emptyText,
  getCell,
  renderRowEnd,
}: {
  tableId: string;
  columns: readonly EntitySimpleColumn[];
  rows: Row[];
  loading?: boolean;
  emptyText: string;
  getCell: (row: Row, key: string) => ReactNode;
  renderRowEnd?: (row: Row) => ReactNode;
}) {
  const widthConfigs = useMemo(() => columnWidthConfigs([...columns]), [columns]);
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(
    tableId,
    widthConfigs,
  );
  const gridTemplate = renderRowEnd
    ? `${dataColumnsTemplate} ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px minmax(0, 1fr)`
    : `${dataColumnsTemplate} minmax(0, 1fr)`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => (
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
        {renderRowEnd ? <div /> : null}
        <div />
      </div>
      <div className="min-h-0 flex-1 cursor-default overflow-y-auto px-3">
        {loading && rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.id}
              className={cn(
                "group grid h-[22px] cursor-default select-none items-center rounded-md text-[12px] text-ink",
                idx % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
                !isResizing && "hover:bg-[#EAEAEC]",
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {columns.map((c) => (
                <div key={c.key} className="flex min-w-0 cursor-default items-center truncate px-3">
                  {getCell(row, c.key)}
                </div>
              ))}
              {renderRowEnd ? (
                <div className="flex h-full cursor-default items-center justify-center">
                  {renderRowEnd(row)}
                </div>
              ) : null}
              <div />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
