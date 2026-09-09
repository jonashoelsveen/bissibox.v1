import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_SUBEVENT_COLOR } from "./event-ui-types";

export type TicketControlVisualRules = {
  primaryColor: string;
  secondaryColor: string;
  animationType: string;
  animationSpeedSeconds: string;
  dailyControlWord: string;
  dailyIconIdentifier: string;
};

export type TicketControlPayload = {
  ticketId: string;
  controlTimestamp: string;
  visualRules: TicketControlVisualRules;
  verificationHash: string;
};

export type TicketControlSubeventTab = {
  name: string;
  color: string;
};

type Props = {
  payload: TicketControlPayload;
  className?: string;
  /** Fill a fixed stub slot without growing the ticket. */
  compact?: boolean;
  /** Subevent tab shown on the control surface (name + colour). */
  subevent?: TicketControlSubeventTab | null;
};

/** Conductor-facing control surface — colors + word from the daily sitewide rules. */
export function TicketControlVisual({
  payload,
  className,
  compact,
  subevent,
}: Props) {
  const { visualRules: rules, controlTimestamp, verificationHash } = payload;
  const uid = useId().replace(/:/g, "");
  const speed = Number.parseFloat(rules.animationSpeedSeconds) || 2.5;
  const subColor = subevent?.color || DEFAULT_SUBEVENT_COLOR;
  const subName = subevent?.name?.trim() || "No subevent";

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-xl shadow-inner",
        compact ? "h-full w-full" : "aspect-[4/5] w-full max-w-[220px]",
        className,
      )}
      style={{
        background: `linear-gradient(145deg, ${rules.primaryColor}, ${rules.secondaryColor})`,
      }}
      data-animation-type={rules.animationType}
      aria-label={`Control ${rules.dailyControlWord}`}
    >
      <style>{`
        @keyframes ticket-control-pulse-${uid} {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.08); }
        }
        @keyframes ticket-control-sweep-${uid} {
          0% { transform: translateX(-120%) rotate(12deg); }
          100% { transform: translateX(120%) rotate(12deg); }
        }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 55%)",
          animation: `ticket-control-pulse-${uid} ${speed}s ease-in-out infinite`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-8 left-0 w-1/3 bg-white/25 blur-md"
        style={{
          animation: `ticket-control-sweep-${uid} ${speed * 1.15}s linear infinite`,
        }}
      />

      {/* Subevent tab — name + colour */}
      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-black/25",
          compact ? "px-2 py-1" : "px-3 py-1.5",
        )}
      >
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-white/35"
          style={{ background: subColor }}
        />
        <span className="min-w-0 truncate text-[10px] font-semibold text-white">
          {subName}
        </span>
      </div>

      <div
        className={cn(
          "relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center text-center text-white",
          compact ? "gap-1 px-2 py-1.5" : "gap-3 px-4 py-6",
        )}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/85">
          Control
        </p>
        <p
          className={cn(
            "font-bold tracking-[0.12em] drop-shadow-sm",
            compact ? "text-[18px] leading-tight" : "text-[28px]",
          )}
        >
          {rules.dailyControlWord}
        </p>
        <div
          className={cn(
            "grid place-items-center rounded-full border border-white/40 bg-white/15 font-semibold",
            compact ? "h-6 w-6 text-[8px]" : "mt-1 h-10 w-10 text-[11px]",
          )}
          title={rules.dailyIconIdentifier}
        >
          {rules.dailyIconIdentifier.replace(/^icon_/, "").slice(0, 4).toUpperCase()}
        </div>
      </div>

      {/* Control numbers — always reserved, high contrast */}
      <div
        className={cn(
          "relative z-10 shrink-0 space-y-0.5 border-t border-white/25 bg-black/45 text-left font-mono leading-snug text-white",
          compact ? "px-2 py-1.5 text-[9px]" : "px-3 py-2 text-[10px]",
        )}
      >
        <p className="truncate tabular-nums">{controlTimestamp}</p>
        <p className="truncate tabular-nums" title={verificationHash}>
          {compact ? verificationHash.slice(0, 20) : verificationHash.slice(0, 28)}…
        </p>
      </div>
    </div>
  );
}

export async function fetchTicketControl(
  ticketId: string,
  signal?: AbortSignal,
): Promise<TicketControlPayload> {
  const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/control`, {
    method: "GET",
    credentials: "same-origin",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let message = `Control failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as TicketControlPayload;
}

export function useTicketControl(ticketId: string | null, enabled: boolean) {
  const [payload, setPayload] = useState<TicketControlPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ticketId) {
      setPayload(null);
      setError(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void fetchTicketControl(ticketId, ac.signal)
      .then((data) => {
        if (!ac.signal.aborted) {
          setPayload(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setPayload(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : "Control failed");
      });
    return () => ac.abort();
  }, [ticketId, enabled]);

  return { payload, error, loading };
}
