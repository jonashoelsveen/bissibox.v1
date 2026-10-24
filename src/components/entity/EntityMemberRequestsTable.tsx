import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import type { EntityGroup } from "@/hooks/useEntityRoster";
import type { EntityMembershipRequest } from "@/hooks/useEntityMembershipRequests";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";
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
    action: "accept" | "deny" | "cancel",
    groupId: string | null,
  ) => Promise<{ ok: boolean } | void>;
}) {
  const [groupById, setGroupById] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const gridTemplate = `${dataColumnsTemplate} minmax(176px, 1fr)`;
  const deleting = deleteTarget ? busyIds.has(deleteTarget.id) : false;

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleteError(null);
    const result = await onDecide(deleteTarget.id, "cancel", null);
    if (result?.ok) {
      setDeleteTarget(null);
      return;
    }
    setDeleteError("Could not delete this request.");
  };

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
                    aria-label="Delete request"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(row);
                    }}
                    className="grid h-6 w-6 cursor-pointer place-items-center text-[#FF3B30] disabled:cursor-default disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
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
      <DeleteRequestModal
        open={deleteTarget != null}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function DeleteRequestModal({
  open,
  deleting,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  deleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/40 duration-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white px-5 pb-5 pt-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] outline-none duration-0"
          style={{ fontFamily: HELVETICA_STACK }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="text-[15px] font-medium leading-snug text-ink">
            Delete this request?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-[13px] leading-snug text-ink">
            Are you sure you want to delete this request? The member will see that their request
            has been cancelled.
          </DialogPrimitive.Description>
          {error ? <p className="mt-2 text-[13px] text-[#FF3B30]">{error}</p> : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
              className="h-8 cursor-pointer rounded-[10px] bg-[#1d1d1f] px-3.5 text-[13px] text-white transition-colors hover:bg-black disabled:cursor-default disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirm}
              className="h-8 cursor-pointer rounded-[10px] bg-[#FF3B30] px-3.5 text-[13px] text-white transition-colors hover:bg-[#E0352B] disabled:cursor-default disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
