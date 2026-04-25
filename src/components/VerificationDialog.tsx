import { useEffect, useRef, useState } from "react";
import { X, Mail, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type TargetKind = "event_registration" | "team_membership";

export interface VerificationDialogProps {
  open: boolean;
  onClose: () => void;
  onVerified: (result?: Record<string, unknown>) => void;
  title: string;
  subtitle?: string;
  targetKind: TargetKind;
  targetId: string;
  targetMeta?: Record<string, unknown>;
  defaultEmail?: string | null;
}

type Step = "choose" | "code";

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

export function VerificationDialog({
  open,
  onClose,
  onVerified,
  title,
  subtitle,
  targetKind,
  targetId,
  targetMeta,
  defaultEmail,
}: VerificationDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState(defaultEmail ?? user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [masked, setMasked] = useState<string>("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      setStep("choose");
      setDigits(["", "", "", "", "", ""]);
      setEmail(defaultEmail ?? user?.email ?? "");
      setAttemptId(null);
      setResendIn(0);
    }
  }, [open, defaultEmail, user?.email]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-verification-otp", {
        body: {
          channel: "email",
          destination: email,
          target_kind: targetKind,
          target_id: targetId,
          target_meta: targetMeta ?? {},
        },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const d = data as { attempt_id: string; masked: string };
      setAttemptId(d.attempt_id);
      setMasked(d.masked ?? maskEmail(email));
      setStep("code");
      setResendIn(60);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (e) {
      toast.error((e as Error).message || "Failed to send code");
    } finally {
      setSending(false);
    }
  };

  const submit = async (codeStr?: string) => {
    const code = codeStr ?? digits.join("");
    if (code.length !== 6 || !attemptId) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { attempt_id: attemptId, code },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Verified");
      onVerified();
    } catch (e) {
      toast.error((e as Error).message || "Verification failed");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const onDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      // Paste handling
      const chars = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, idx) => (next[idx] = c));
      setDigits(next);
      const lastIdx = Math.min(chars.length, 6) - 1;
      inputs.current[lastIdx]?.focus();
      if (chars.length === 6) submit(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean[0];
    setDigits(next);
    if (i < 5) inputs.current[i + 1]?.focus();
    if (i === 5 && next.every((d) => d)) submit(next.join(""));
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Verify
            </p>
            <h2 className="mt-0.5 text-lg text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === "choose" && (
          <div className="space-y-5 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Choose how you'd like to receive your 6-digit verification code.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-3 text-center">
                <Mail className="mx-auto h-5 w-5 text-primary" />
                <div className="mt-1.5 text-sm font-medium text-ink">Email</div>
              </div>
              <div className="rounded-lg border border-dashed border-hairline bg-card/40 px-4 py-3 text-center opacity-60">
                <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground" />
                <div className="mt-1.5 text-sm text-muted-foreground">SMS</div>
                <div className="text-[10px] text-muted-foreground">Coming soon</div>
              </div>
            </div>
            <div>
              <label className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={send}
              disabled={sending || !email}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {sending ? "Sending…" : "Send code"}
            </button>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-5 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-ink">{masked}</span>.
              Enter it below to confirm.
            </p>
            <div className="flex justify-between gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={d}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  className="num h-12 w-11 rounded-md border border-hairline bg-background text-center text-xl text-ink outline-none focus:border-primary"
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                disabled={resendIn > 0 || sending}
                onClick={send}
                className="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
              <button
                onClick={() => setStep("choose")}
                className="text-muted-foreground hover:text-ink"
              >
                Use different email
              </button>
            </div>
            <button
              onClick={() => submit()}
              disabled={verifying || digits.some((d) => !d)}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifying ? "Verifying…" : "Verify & continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
