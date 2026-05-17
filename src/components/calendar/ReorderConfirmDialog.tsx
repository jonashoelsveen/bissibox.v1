/**
 * Centered confirmation modal shown after a drag-to-reorder gesture in
 * the diary month view or week simple view.
 *
 * Two modes:
 *   - "confirm" — Cancel + Confirm. Used when the new order is valid and
 *     the user must approve before it persists.
 *   - "stravaBlocked" — single OK button. Used when the user tries to
 *     reorder a column that contains at least one Strava-synced session.
 *     Strava sessions cannot be manually reordered.
 *
 * Animation: slides up from the bottom (not from the side).
 * Layout: Cancel sits in the bottom-left corner, Confirm in the bottom-right.
 * Cancel hover is a plain gray (matching other cancel buttons across the
 * platform), not the default yellow accent.
 */

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type ReorderDialogMode = "confirm" | "stravaBlocked";

export function ReorderConfirmDialog({
  open,
  mode = "confirm",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  mode?: ReorderDialogMode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isBlocked = mode === "stravaBlocked";
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
              {isBlocked ? "Synced with Strava" : "Confirm reorder"}
            </AlertDialogPrimitive.Title>
            <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
              {isBlocked
                ? "This session is synced with Strava and cannot be reordered."
                : "Apply the new order to this day?"}
            </AlertDialogPrimitive.Description>
          </div>
          <div
            className={cn(
              "flex flex-row items-center",
              isBlocked ? "justify-end" : "justify-between",
            )}
          >
            {!isBlocked && (
              <AlertDialogPrimitive.Cancel
                onClick={onCancel}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "bg-secondary text-secondary-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Cancel
              </AlertDialogPrimitive.Cancel>
            )}
            <AlertDialogPrimitive.Action
              onClick={isBlocked ? onCancel : onConfirm}
              className={cn(buttonVariants())}
            >
              {isBlocked ? "Ok" : "Confirm"}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
