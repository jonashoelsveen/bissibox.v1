import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

const HELVETICA = HELVETICA_STACK;

export function AccountEmailOtpModal({
  open,
  email,
  digits,
  setDigits,
  onVerify,
  onResend,
  onClose,
  resendIn,
  sending,
  verifying,
  error,
}: {
  open: boolean;
  email: string;
  digits: string[];
  setDigits: (d: string[]) => void;
  onVerify: (code?: string) => void;
  onResend: () => void;
  onClose: () => void;
  resendIn: number;
  sending: boolean;
  verifying: boolean;
  error: string | null;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputsRef.current[0]?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const handleDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, idx) => {
        next[idx] = c;
      });
      setDigits(next);
      const lastIdx = Math.min(chars.length, 6) - 1;
      inputsRef.current[lastIdx]?.focus();
      if (chars.length === 6) onVerify(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean[0];
    setDigits(next);
    if (i < 5) inputsRef.current[i + 1]?.focus();
    if (i === 5 && next.every((d) => d)) onVerify(next.join(""));
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto"
      style={{
        paddingTop: "min(10vh, 110px)",
        paddingBottom: "min(10vh, 110px)",
        fontFamily: HELVETICA,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.28)" }}
        onClick={verifying ? undefined : onClose}
      />
      <div
        className="relative flex flex-col"
        style={{
          width: "min(480px, 94vw)",
          background: "#ffffff",
          borderRadius: 18,
          boxShadow:
            "0 30px 60px -20px rgba(0,0,0,0.25), 0 12px 24px -12px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "44px 40px 32px" }}>
          <div className="mb-6 text-center">
            <h2
              style={{
                fontFamily: HELVETICA,
                fontSize: 22,
                fontWeight: 400,
                color: "#1d1d1f",
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
              }}
            >
              Verify your email
            </h2>
            <p
              style={{
                marginTop: 6,
                fontFamily: HELVETICA,
                fontSize: 13,
                fontWeight: 400,
                color: "#86868b",
                letterSpacing: "-0.005em",
              }}
            >
              We&apos;ve sent a 6-digit code to {email}. Enter it below.
            </p>
          </div>

          <div className="flex justify-between gap-2">
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
                disabled={verifying}
                className="account-field signin-field"
                style={{
                  fontFamily: HELVETICA,
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
            <p className="mt-3.5 text-center text-[13px]" style={{ color: "#ff3b30" }}>
              {error}
            </p>
          ) : null}

          <div
            className="flex items-center justify-between"
            style={{
              marginTop: 18,
              fontFamily: HELVETICA,
              fontSize: 12,
              color: "#86868b",
            }}
          >
            <button
              type="button"
              disabled={resendIn > 0 || sending}
              onClick={onResend}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: resendIn > 0 || sending ? "default" : "pointer",
                color: resendIn > 0 || sending ? "#86868b" : "#1d1d1f",
                fontFamily: HELVETICA,
                fontSize: 12,
                textDecoration: resendIn > 0 || sending ? "none" : "underline",
              }}
            >
              {sending ? "Sending…" : resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
            <span>Check your spam folder if you can&apos;t find the email.</span>
          </div>

          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={onClose}
              disabled={verifying}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: verifying ? "default" : "pointer",
                color: "#ff3b30",
                fontFamily: HELVETICA,
                fontSize: 15,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                opacity: verifying ? 0.45 : 1,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
