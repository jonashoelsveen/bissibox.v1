import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown } from "lucide-react";
import type { EntityGroup } from "@/hooks/useEntityRoster";
import { cn } from "@/lib/utils";

function NativeSelect({
  value,
  onChange,
  children,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-[10px] border-0 bg-muted/70 px-3 pr-8 text-sm text-ink outline-none focus:bg-muted"
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
        aria-hidden
      />
    </div>
  );
}

export function DeleteGroupMembersDialog({
  open,
  group,
  otherGroups,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  group: EntityGroup | null;
  otherGroups: EntityGroup[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (toGroupId: string | null) => Promise<boolean>;
}) {
  const [placement, setPlacement] = useState<"" | "unassigned" | "move">("");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlacement("");
    setTargetGroupId("");
    setBusy(false);
  }, [open, group?.id]);

  const canDelete =
    placement === "unassigned" || (placement === "move" && !!targetGroupId);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[70] w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-hairline bg-white p-6 shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight text-ink">
            Delete “{group?.name ?? "group"}”?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This group will be removed. All members in it will be preserved. Choose
            how they should be assigned after the group is deleted.
          </DialogPrimitive.Description>

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="entity-delete-group-placement" className="mb-1.5 block text-xs font-medium text-ink/80">
                Members
              </label>
              <NativeSelect
                id="entity-delete-group-placement"
                value={placement}
                onChange={(v) => {
                  setPlacement(v as "" | "unassigned" | "move");
                  if (v !== "move") setTargetGroupId("");
                }}
              >
                <option value="" disabled>
                  Choose an option
                </option>
                <option value="unassigned">Not assigned to any group</option>
                <option value="move">Preserve, move to another group</option>
              </NativeSelect>
            </div>

            {placement === "move" ? (
              <div>
                <label htmlFor="entity-delete-group-target" className="mb-1.5 block text-xs font-medium text-ink/80">
                  Move members to
                </label>
                <NativeSelect
                  id="entity-delete-group-target"
                  value={targetGroupId}
                  onChange={setTargetGroupId}
                >
                  <option value="" disabled>
                    {otherGroups.length === 0 ? "No other groups" : "Select a group"}
                  </option>
                  {otherGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-md border border-hairline bg-white px-3 text-xs text-ink hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canDelete || busy}
              onClick={() => {
                if (!canDelete || busy) return;
                setBusy(true);
                void onConfirm(placement === "move" ? targetGroupId : null).then((ok) => {
                  if (!ok) setBusy(false);
                });
              }}
              className="h-8 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
