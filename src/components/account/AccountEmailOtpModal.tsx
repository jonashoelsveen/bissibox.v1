import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { VerificationCodeExpiredPanel } from "@/components/account/VerificationCodeExpiredPanel";
import { markAccountFieldFocused } from "@/components/account/AccountFormFields";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";
import { applyOtpBoxInput, focusOtpBox, focusOtpFirstBox } from "@/lib/otpAttempts";

const HELVETICA = HELVETICA_STACK;

const CANCEL_STYLE = {
  background: "transparent",
  border: "none",
  padding: 0,
  color: "#ff3b30",
  fontFamily: HELVETICA,
  fontSize: 15,
  fontWeight: 400,
  letterSpacing: "-0.01em",
} as const;

const RESEND_BTN_STYLE = {
  background: "#1d1d1f",
  color: "#ffffff",
  borderRadius: 12,
  padding: "12px 18px",
  fontFamily: HELVETICA,
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: "-0.005em",
  border: "none",
} as const;

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
  expired = false,
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
  expired?: boolean;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digitsEmpty = digits.every((d) => !d);

  useEffect(() => {
    if (!open || expired || verifying || !digitsEmpty) return;
    const t = window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
    return () => window.clearTimeout(t);
  }, [open, expired, verifying, digitsEmpty, error]);

  const handleDigit = (i: number, v: string) => {
    const result = applyOtpBoxInput({ index: i, value: v, digits });
    setDigits(result.digits);
    focusOtpBox(inputsRef.current, result.focusIndex);
    if (result.complete) onVerify(result.digits.join(""));
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
        onClick={verifying || sending ? undefined : onClose}
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
          {expired ? (
            <VerificationCodeExpiredPanel
              error={error}
              footer={
                <div className="mt-7 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={sending}
                    style={{ ...CANCEL_STYLE, opacity: sending ? 0.45 : 1, cursor: sending ? "default" : "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onResend}
                    disabled={sending}
                    className="transition active:scale-[0.99]"
                    style={{ ...RESEND_BTN_STYLE, cursor: sending ? "default" : "pointer", opacity: sending ? 0.7 : 1 }}
                  >
                    {sending ? "Sending…" : "Resend"}
                  </button>
                </div>
              }
            />
          ) : (
            <>
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
                    onFocus={(e) => markAccountFieldFocused(e.currentTarget)}
                    onPointerDown={(e) => markAccountFieldFocused(e.currentTarget)}
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
                    ...CANCEL_STYLE,
                    cursor: verifying ? "default" : "pointer",
                    opacity: verifying ? 0.45 : 1,
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
