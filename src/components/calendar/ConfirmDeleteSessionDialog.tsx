/**
 * ConfirmDeleteSessionDialog — shared "Delete this session?" confirmation
 * used by both the SessionDetailsModal trash icon and the DiaryPopoverEditor
 * (edit-panel) trash icon. Cancel is left-aligned with a neutral hover state;
 * Delete is right-aligned in destructive color.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmDeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmDeleteSessionDialog({
  open,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteSessionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[300]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this session?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The session and its details will be permanently removed from your diary.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between sm:space-x-0">
          <AlertDialogCancel className="mt-0 border-hairline bg-card text-muted-foreground hover:bg-card hover:text-ink">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
