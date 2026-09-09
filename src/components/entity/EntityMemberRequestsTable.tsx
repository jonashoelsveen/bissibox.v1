import { useMemo, useState } from "react";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import type { EntityGroup } from "@/hooks/useEntityRoster";
import type { EntityMembershipRequest } from "@/hooks/useEntityMembershipRequests";
import { cn } from "@/lib/utils";

const REQUEST_COLUMNS = [
  { key: "name", label: "Name", defaultWidth: 180, minWidth: 120, maxWidth: 360 },
  { key: "surname", label: "Surname", defaultWidth: 132, minWidth: 96, maxWidth: 240 },
  { key: "born", label: "Born", defaultWidth: 112, minWidth: 96, maxWidth: 180 },
  { key: "group", label: "Group", defaultWidth: 160, minWidth: 120, maxWidth: 320 },
] as const;

const NO_GROUP = "";

type Row = {
  id: string;
  name: string;
  surname: string;
  born: string;
  request: EntityMembershipRequest;
};

export function EntityMemberRequestsTable({
  requests,
  groups,
  loading,
  busyIds,
  onDecide,
}: {
  requests: EntityMembershipRequest[];
  groups: EntityGroup[];
  loading: boolean;
  busyIds: Set<string>;
  onDecide: (
    requestId: string,
    action: "accept" | "deny",
    groupId: string | null,
  ) => Promise<unknown>;
}) {
  const [groupById, setGroupById] = useState<Record<string, string>>({});
  const widthConfigs = useMemo(() => columnWidthConfigs([...REQUEST_COLUMNS]), []);
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(
    "entity-member-requests",
    widthConfigs,
  );

  const rows = useMemo<Row[]>(
    () =>
      requests.map((request) => ({
        id: request.id,
        name: request.first_name ?? "",
        surname: request.last_name ?? "",
        born: request.date_of_birth ?? "",
        request,
      })),
    [requests],
  );

  const gridTemplate = `${dataColumnsTemplate} minmax(148px, 1fr)`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {REQUEST_COLUMNS.map((c) => (
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
        {loading && rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No member requests.
          </div>
        ) : (
          rows.map((row, idx) => {
            const busy = busyIds.has(row.id);
            const groupId = groupById[row.id] ?? NO_GROUP;
            return (
              <div
                key={row.id}
                className={cn(
                  "group grid h-8 items-center rounded-md text-[12px] text-ink",
                  idx % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
                  !isResizing && "hover:bg-[#EAEAEC]",
                )}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="truncate px-3">{row.name}</div>
                <div className="truncate px-3">{row.surname}</div>
                <div className="truncate px-3">{row.born}</div>
                <div className="min-w-0 px-1.5">
                  <select
                    value={groupId}
                    disabled={busy}
                    aria-label="Assign group"
                    onChange={(e) =>
                      setGroupById((prev) => ({ ...prev, [row.id]: e.target.value }))
                    }
                    className="h-6 w-full max-w-full cursor-pointer truncate rounded border-0 bg-transparent px-1.5 text-[12px] text-ink outline-none"
                  >
                    <option value={NO_GROUP}>No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-end gap-3 px-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide(row.id, "deny", null)}
                    className="cursor-pointer text-[12px] font-medium text-[#FF3B30] disabled:cursor-default disabled:opacity-40"
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide(row.id, "accept", groupId || null)}
                    className="cursor-pointer text-[12px] font-medium text-[#34C759] disabled:cursor-default disabled:opacity-40"
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
