import { X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

const MUTED = "#6e6e73";

const TITLE_STYLE = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 400,
  color: "#1d1d1f",
  lineHeight: 1.3,
} as const;

export function DeleteEntityProfileModal({
  open,
  name,
  deleting = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  name: string;
  deleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 duration-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white px-8 pb-8 pt-14 shadow-[0_12px_40px_rgba(0,0,0,0.18)] outline-none duration-0 animate-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          style={{ fontFamily: HELVETICA_STACK }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Close
            className="absolute right-4 top-4 grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[#6e6e73] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f]"
            aria-label="Close"
            disabled={deleting}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </DialogPrimitive.Close>

          <DialogPrimitive.Title className="text-center" style={TITLE_STYLE}>
            {`Are you sure you want to delete "${name}"?`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            className="mt-2 text-center text-[13px] leading-snug"
            style={{ color: MUTED }}
          >
            Deleting the entity will automatically cancel all membership
            subscriptions and remove all members from the entity.
          </DialogPrimitive.Description>

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              disabled={deleting}
              onClick={() => onOpenChange(false)}
              className="h-11 cursor-pointer rounded-[10px] border border-[#6e6e73] bg-transparent px-5 text-[15px] text-[#6e6e73] transition-colors hover:bg-[#6e6e73] hover:text-white disabled:cursor-default disabled:opacity-50"
              style={{ fontFamily: HELVETICA_STACK }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirm}
              className="h-11 cursor-pointer rounded-[10px] border border-[#FF3B30] bg-transparent px-5 text-[15px] text-[#FF3B30] transition-colors hover:bg-[#FF3B30] hover:text-white disabled:cursor-default disabled:opacity-50"
              style={{ fontFamily: HELVETICA_STACK }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
