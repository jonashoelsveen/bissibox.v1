/**
 * Centered confirmation modal shown after a session in the calendar week
 * view is drag-and-dropped onto a new time slot. Mirrors the Notion-style
 * UX: the session "snaps" into the new slot, then this dialog asks the
 * user to confirm the new time.
 *
 * Layout: Cancel sits in the bottom-left corner, Confirm in the bottom-right.
 */

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function MoveSessionConfirmDialog({
  open,
  sessionName,
  newTimeLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  sessionName: string;
  newTimeLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <AlertDialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
          )}
        >
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <AlertDialogPrimitive.Title className="text-lg font-semibold">
              Confirm new time for "{sessionName}"
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
              Move this session to <span className="font-medium text-foreground">{newTimeLabel}</span>?
            </AlertDialogPrimitive.Description>
          </div>
          <div className="flex flex-row items-center justify-between">
            <AlertDialogPrimitive.Cancel
              onClick={onCancel}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "bg-secondary text-secondary-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Cancel
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              onClick={onConfirm}
              className={cn(buttonVariants())}
            >
              Confirm
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
