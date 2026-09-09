import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { getAccountAccessToken } from "@/lib/account-profile-client";
import { useAuth } from "@/lib/auth";
import { getAccountUrl } from "@/lib/app-surface";
import { otpVerifyFailureFromPayload, applyOtpBoxInput, focusOtpBox, focusOtpFirstBox } from "@/lib/otpAttempts";
import { VerificationCodeExpiredPanel } from "@/components/account/VerificationCodeExpiredPanel";
import { markAccountFieldFocused } from "@/components/account/AccountFormFields";
import {
  accountNavSignOutStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";

const MUTED = "#6e6e73";

const TITLE_STYLE = {
  fontFamily: HELVETICA_STACK,
  fontSize: 17,
  fontWeight: 600,
  color: "#1d1d1f",
  lineHeight: 1.3,
  letterSpacing: "-0.01em",
} as const;

const CANCEL_BTN =
  "h-11 cursor-pointer rounded-[10px] border border-[#6e6e73] bg-white px-5 text-[15px] text-[#6e6e73] transition-colors hover:bg-[#f0f0f0] disabled:cursor-default disabled:opacity-50";
const CONTINUE_BTN =
  "h-11 cursor-pointer rounded-[10px] border border-[#1d1d1f] bg-[#1d1d1f] px-5 text-[15px] text-white transition-colors hover:bg-black disabled:cursor-default disabled:opacity-50";
const CONFIRM_BTN =
  "h-11 cursor-pointer rounded-[10px] border border-[#FF3B30] bg-transparent px-5 text-[15px] text-[#FF3B30] transition-colors hover:bg-[#FF3B30] hover:text-white disabled:cursor-default disabled:opacity-50";

type Step = "warn" | "code" | "expired";

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

export function AccountDeleteAccount() {
  const { signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("warn");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masked, setMasked] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const resendTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resendTimer.current) window.clearInterval(resendTimer.current);
    },
    [],
  );

  const busy = sending || deleting;

  useEffect(() => {
    if (step !== "code" || deleting || digits.some((d) => d)) return;
    const t = window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
    return () => window.clearTimeout(t);
  }, [step, deleting, digits, error, attemptId]);

  const reset = () => {
    setStep("warn");
    setSending(false);
    setDeleting(false);
    setError(null);
    setMasked("");
    setAttemptId(null);
    setDigits(["", "", "", "", "", ""]);
    setResendIn(0);
    if (resendTimer.current) window.clearInterval(resendTimer.current);
    resendTimer.current = null;
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    reset();
  };

  const startResendCountdown = () => {
    setResendIn(60);
    if (resendTimer.current) window.clearInterval(resendTimer.current);
    resendTimer.current = window.setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) {
          if (resendTimer.current) window.clearInterval(resendTimer.current);
          resendTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const authHeaders = async () => {
    const accessToken = await getAccountAccessToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  };

  const sendCode = async () => {
    setSending(true);
    setError(null);
    try {
      const accessToken = await getAccountAccessToken();
      const dest = (user?.email ?? "").trim().toLowerCase();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      if (!dest.includes("@")) {
        setError("This account has no email address.");
        return false;
      }
      if (!accessToken || !user?.id || !supabaseUrl || !supabaseAnonKey) {
        setError("Could not send verification code");
        return false;
      }

      // Same edge function + payload shape as signup verification.
      const res = await fetch(`${supabaseUrl}/functions/v1/send-verification-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          channel: "email",
          destination: dest,
          target_kind: "account_deletion",
          target_id: user.id,
          target_meta: {},
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        attempt_id?: string;
        masked?: string;
      };
      if (!res.ok || payload.error || !payload.attempt_id) {
        setError(payload.error ?? "Could not send verification code");
        return false;
      }
      setMasked(payload.masked ?? maskEmail(dest));
      setAttemptId(payload.attempt_id);
      setDigits(["", "", "", "", "", ""]);
      setError(null);
      startResendCountdown();
      return true;
    } catch {
      setError("Could not send verification code");
      return false;
    } finally {
      setSending(false);
    }
  };

  const continueToCode = async () => {
    const ok = await sendCode();
    if (!ok) return;
    setStep("code");
    window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
  };

  const resendExpired = async () => {
    const ok = await sendCode();
    if (!ok) return;
    setStep("code");
    window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
  };

  const confirmDelete = async () => {
    const code = digits.join("");
    if (code.length !== 6 || !attemptId || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "include",
        headers: await authHeaders(),
        body: JSON.stringify({ code, attempt_id: attemptId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        remaining?: number;
      };
      if (!res.ok) {
        const leaked = /lovable|service_role|environment variable/i.test(body.error ?? "");
        if (leaked) {
          setError("Your account could not be deleted.");
          setDigits(["", "", "", "", "", ""]);
          setDeleting(false);
          window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
          return;
        }
        const failure = otpVerifyFailureFromPayload(body);
        setDeleting(false);
        setDigits(["", "", "", "", "", ""]);
        if (failure.expired) {
          setError(null);
          setStep("expired");
          return;
        }
        setError(failure.message || "Your account could not be deleted.");
        window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
        return;
      }
      await signOut();
      window.location.replace(getAccountUrl());
    } catch {
      setError("Your account could not be deleted.");
      setDeleting(false);
      toast.error("Your account could not be deleted.");
    }
  };

  const handleDigit = (i: number, v: string) => {
    const result = applyOtpBoxInput({ index: i, value: v, digits });
    setDigits(result.digits);
    focusOtpBox(inputsRef.current, result.focusIndex);
  };

  const complete = digits.every((d) => d);

  return (
    <div className="mt-16 border-t border-black/[0.08] pt-8">
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        style={{
          ...accountNavSignOutStyle,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        Delete account
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              style={{ fontFamily: HELVETICA_STACK }}
            >
              <div className="absolute inset-0 bg-black/50" />
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-account-title"
                aria-describedby="delete-account-desc"
                className="relative z-10 w-[min(92vw,420px)] rounded-[16px] bg-white px-8 pb-8 pt-10 shadow-[0_12px_40px_rgba(0,0,0,0.18)] outline-none"
              >
                {step === "warn" ? (
                  <>
                    <h2
                      id="delete-account-title"
                      className="text-center"
                      style={{ ...TITLE_STYLE, fontSize: 20 }}
                    >
                      Delete Aponna-account
                    </h2>
                    <div
                      id="delete-account-desc"
                      className="mt-3 space-y-3 text-center text-[13px] leading-snug"
                      style={{ color: MUTED }}
                    >
                      <p>
                        This permanently deletes your Aponna-account and all data
                        associated with it, including your profile and all
                        activities in your calendar.
                      </p>
                      <p>
                        To continue, we&apos;ll send a verification code to the
                        email adress on this account.
                      </p>
                    </div>
                    {error ? (
                      <p className="mt-4 text-center text-[13px] leading-snug" style={{ color: "#FF3B30" }}>
                        {error}
                      </p>
                    ) : null}
                    <div className="mt-8 flex items-center justify-between gap-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        className={CANCEL_BTN}
                        style={{ fontFamily: HELVETICA_STACK }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void continueToCode()}
                        className={CONTINUE_BTN}
                        style={{ fontFamily: HELVETICA_STACK }}
                      >
                        {sending ? "Sending…" : "Continue"}
                      </button>
                    </div>
                  </>
                ) : step === "expired" ? (
                  <VerificationCodeExpiredPanel
                    compactTitle
                    titleStyle={TITLE_STYLE}
                    error={error}
                    footer={
                      <div className="mt-7 flex items-center justify-between">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={close}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            color: "#ff3b30",
                            fontFamily: HELVETICA_STACK,
                            fontSize: 15,
                            fontWeight: 400,
                            letterSpacing: "-0.01em",
                            opacity: busy ? 0.45 : 1,
                            cursor: busy ? "default" : "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resendExpired()}
                          className="transition active:scale-[0.99]"
                          style={{
                            background: "#1d1d1f",
                            color: "#ffffff",
                            borderRadius: 12,
                            padding: "12px 18px",
                            fontFamily: HELVETICA_STACK,
                            fontSize: 15,
                            fontWeight: 500,
                            letterSpacing: "-0.005em",
                            border: "none",
                            cursor: busy ? "default" : "pointer",
                            opacity: busy ? 0.7 : 1,
                          }}
                        >
                          {sending ? "Sending…" : "Resend"}
                        </button>
                      </div>
                    }
                  />
                ) : (
                  <>
                    <h2 id="delete-account-title" className="text-center" style={TITLE_STYLE}>
                      Enter verification code
                    </h2>
                    <p
                      id="delete-account-desc"
                      className="mt-3 text-center text-[13px] leading-snug"
                      style={{ color: MUTED }}
                    >
                      We sent a 6-digit code to {masked || "your email"}. Enter it
                      below, then confirm to permanently delete your Aponna-account.
                    </p>
                    <div className="mt-6 flex justify-between gap-2">
                      {digits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            inputsRef.current[i] = el;
                          }}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={d}
                          onChange={(e) => handleDigit(i, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace" && !digits[i] && i > 0) {
                              inputsRef.current[i - 1]?.focus();
                            }
                          }}
                          disabled={deleting}
                          onFocus={(e) => markAccountFieldFocused(e.currentTarget)}
                          onPointerDown={(e) => markAccountFieldFocused(e.currentTarget)}
                          aria-label={`Digit ${i + 1}`}
                          className="account-field signin-field"
                          style={{
                            fontFamily: HELVETICA_STACK,
                            width: 48,
                            height: 56,
                            borderRadius: 10,
                            border: "1px solid #1d1d1f",
                            background: "#ffffff",
                            color: "#1d1d1f",
                            fontSize: 22,
                            textAlign: "center",
                            outline: "none",
                          }}
                        />
                      ))}
                    </div>
                    {error ? (
                      <p className="mt-3.5 text-center text-[13px]" style={{ color: "#FF3B30" }}>
                        {error}
                      </p>
                    ) : null}
                    <div
                      className="mt-4 flex items-center justify-between text-[12px]"
                      style={{ color: MUTED }}
                    >
                      <button
                        type="button"
                        disabled={resendIn > 0 || sending || deleting}
                        onClick={() => void sendCode()}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: resendIn > 0 || sending || deleting ? "default" : "pointer",
                          color: resendIn > 0 || sending || deleting ? MUTED : "#1d1d1f",
                          fontFamily: HELVETICA_STACK,
                          fontSize: 12,
                          textDecoration: resendIn > 0 || sending || deleting ? "none" : "underline",
                        }}
                      >
                        {sending
                          ? "Sending…"
                          : resendIn > 0
                            ? `Resend in ${resendIn}s`
                            : "Resend code"}
                      </button>
                      <span>Check your spam folder if you can&apos;t find the email.</span>
                    </div>
                    <div className="mt-8 flex items-center justify-between gap-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={close}
                        className={CANCEL_BTN}
                        style={{ fontFamily: HELVETICA_STACK }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || !complete}
                        onClick={() => void confirmDelete()}
                        className={CONFIRM_BTN}
                        style={{ fontFamily: HELVETICA_STACK }}
                      >
                        {deleting ? "Deleting…" : "Confirm"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
