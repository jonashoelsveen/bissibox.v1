import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Calendar, DollarSign, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

const MUTED = "#6e6e73";
const UNSPECIFIED = "Not specified";
const CONTENT_REVEAL_MS = 1200;

/** Strong white frost, still see-through — no blur. */
const FOG_OVERLAY: CSSProperties = {
  background: "rgba(255, 255, 255, 0.78)",
};

/** Open tracking vs the rest of account (Helvetica’s default is tighter). */
const MODAL_LETTER_SPACING = "0.02em";

/** Entity name in the membership modal. */
const NAME_STYLE = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 500,
  letterSpacing: MODAL_LETTER_SPACING,
  color: "#1d1d1f",
  lineHeight: 1.3,
} as const;

export type MembershipKind = "active" | "inactive" | "pending" | "denied" | "cancelled";

export type MembershipDetail = {
  kind: MembershipKind;
  name: string;
  detail: string;
};

function ActionButton({
  kind,
}: {
  kind: Exclude<MembershipKind, "denied" | "cancelled">;
}) {
  if (kind === "active") {
    return (
      <button
        type="button"
        className="mt-8 h-11 w-full cursor-pointer rounded-[10px] border border-[#FF3B30] bg-transparent text-[15px] text-[#FF3B30] transition-colors hover:bg-[#FF3B30] hover:text-white"
        style={{ fontFamily: HELVETICA_STACK }}
      >
        Cancel membership
      </button>
    );
  }
  if (kind === "inactive") {
    return (
      <button
        type="button"
        className="account-membership-renew mt-8 h-11 w-full cursor-pointer rounded-[10px] border bg-transparent text-[15px] transition-colors"
        style={{ fontFamily: HELVETICA_STACK }}
      >
        Renew membership
      </button>
    );
  }
  return (
    <button
      type="button"
      className="mt-8 h-11 w-full cursor-pointer rounded-[10px] border border-[#6e6e73] bg-transparent text-[15px] text-[#6e6e73] transition-colors hover:bg-[#6e6e73] hover:text-white"
      style={{ fontFamily: HELVETICA_STACK }}
    >
      Cancel request
    </button>
  );
}

function InfoRow({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5" style={{ fontFamily: HELVETICA_STACK }}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#1d1d1f]">
        {icon}
      </span>
      <span className="text-[15px] text-[#1d1d1f]">{label}</span>
    </div>
  );
}

export function MembershipDetailModal({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: MembershipDetail | null;
}) {
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    setContentReady(false);
    const t = window.setTimeout(() => setContentReady(true), CONTENT_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] duration-0"
          style={FOG_OVERLAY}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[16px] bg-white px-8 pb-8 pt-14 shadow-[0_12px_40px_rgba(0,0,0,0.18)] outline-none duration-0 animate-none data-[state=open]:animate-none data-[state=closed]:animate-none"
          style={{ fontFamily: HELVETICA_STACK, letterSpacing: MODAL_LETTER_SPACING }}
        >
          <DialogPrimitive.Close
            className="absolute right-4 top-4 grid h-8 w-8 cursor-pointer place-items-center rounded-md text-[#6e6e73] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f]"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </DialogPrimitive.Close>

          <div
            style={{
              opacity: contentReady ? 1 : 0,
              pointerEvents: contentReady ? "auto" : "none",
              transition: "opacity 450ms ease-out",
            }}
          >
            <DialogPrimitive.Title className="text-center" style={NAME_STYLE}>
              {detail?.name ?? "Membership"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className="mt-2 text-center text-[13px] leading-snug"
              style={{ color: MUTED }}
            >
              {detail?.detail ?? ""}
            </DialogPrimitive.Description>

            <div className="mt-8 flex flex-col gap-3">
              <InfoRow
                icon={<DollarSign className="h-4 w-4" strokeWidth={1.75} />}
                label={UNSPECIFIED}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" strokeWidth={1.75} />}
                label={`Renews at ${UNSPECIFIED}`}
              />
            </div>

            {detail && detail.kind !== "denied" && detail.kind !== "cancelled" ? (
              <ActionButton kind={detail.kind} />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
