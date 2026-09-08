import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AccountFieldEditButton } from "@/components/account/AccountFieldEditButton";
import { AccountEmailOtpModal } from "@/components/account/AccountEmailOtpModal";
import {
  AccountFieldGroup,
  AccountTextField,
  markAccountFieldFocused,
} from "@/components/account/AccountFormFields";
import { getAccountAccessToken } from "@/lib/account-profile-client";
import { supabase } from "@/integrations/supabase/client";
import {
  accountFieldControlStyle,
  accountHeaderActionStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";

const EMAIL_TAKEN_MESSAGE = "Email is already registered. Please use another email.";

export function AccountEmailChangePanel({
  email,
  onChanged,
}: {
  email: string;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [masked, setMasked] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const newEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = newEmailRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.focus({ preventScroll: true });
      markAccountFieldFocused(el);
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const sendCode = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setSending(true);
    setOtpError(null);
    setEmailTaken(false);
    try {
      const accessToken = await getAccountAccessToken();
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch("/api/account/email", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        masked?: string;
        attempt_id?: string;
      };
      if (!res.ok) {
        if (data.code === "email_taken" || data.error === EMAIL_TAKEN_MESSAGE) {
          setEmailTaken(true);
          toast.error(EMAIL_TAKEN_MESSAGE);
          return;
        }
        toast.error(
          /lovable|api[_ ]?key|not configured/i.test(data.error ?? "")
            ? "Could not send verification code"
            : (data.error ?? "Could not send verification code"),
        );
        return;
      }
      setMasked(data.masked ?? trimmed);
      setAttemptId(data.attempt_id ?? null);
      setDigits(["", "", "", "", "", ""]);
      setResendIn(60);
      setOtpOpen(true);
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (codeStr?: string) => {
    const code = codeStr ?? digits.join("");
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    setOtpError(null);
    try {
      const accessToken = await getAccountAccessToken();
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch("/api/account/email", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          code,
          ...(attemptId ? { attempt_id: attemptId } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string; code?: string; ok?: boolean };
      if (!res.ok) {
        if (data.code === "email_taken" || data.error === EMAIL_TAKEN_MESSAGE) {
          setOtpOpen(false);
          setEmailTaken(true);
          toast.error(EMAIL_TAKEN_MESSAGE);
          return;
        }
        setOtpError(data.error ?? "Verification failed");
        setDigits(["", "", "", "", "", ""]);
        return;
      }
      setOtpOpen(false);
      setEditing(false);
      setNewEmail("");
      setAttemptId(null);
      toast.success("Email successfully changed.");
      await supabase.auth.refreshSession();
      await onChanged();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <AccountTextField
        label={editing ? "Current email" : "Email"}
        value={email}
        readOnly
        trailing={
          editing ? undefined : (
            <AccountFieldEditButton
              ariaLabel="Edit email"
              onClick={() => {
                setEditing(true);
                setNewEmail("");
                setEmailTaken(false);
              }}
            />
          )
        }
      />

      {editing ? (
        <AccountFieldGroup label="New email">
          <div className="relative">
            <input
              ref={newEmailRef}
              type="email"
              value={newEmail}
              autoComplete="email"
              autoFocus
              placeholder="name@example.com"
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (emailTaken) setEmailTaken(false);
              }}
              onFocus={(e) => markAccountFieldFocused(e.currentTarget)}
              onBlur={(e) => {
                e.currentTarget.classList.remove("is-focused");
              }}
              onPointerDown={(e) => markAccountFieldFocused(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void sendCode();
              }}
              className="account-field"
              style={{
                ...accountFieldControlStyle,
                paddingRight: 160,
              }}
            />
            <div className="absolute inset-y-0 right-3 flex items-center gap-5">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setNewEmail("");
                  setEmailTaken(false);
                }}
                disabled={sending}
                style={{
                  ...accountHeaderActionStyle,
                  fontSize: 17,
                  color: "#6e6e73",
                  opacity: sending ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={sending}
                style={{
                  ...accountHeaderActionStyle,
                  fontSize: 17,
                  opacity: sending ? 0.5 : 1,
                }}
              >
                Verify
              </button>
            </div>
          </div>
          {emailTaken ? (
            <p
              className="mt-1.5 text-[13px] leading-snug"
              style={{ fontFamily: HELVETICA_STACK, color: "#6e6e73" }}
            >
              {EMAIL_TAKEN_MESSAGE}
            </p>
          ) : null}
        </AccountFieldGroup>
      ) : null}

      <AccountEmailOtpModal
        open={otpOpen}
        email={masked || newEmail}
        digits={digits}
        setDigits={setDigits}
        onVerify={(code) => void verifyCode(code)}
        onResend={() => void sendCode()}
        onClose={() => {
          if (!verifying) setOtpOpen(false);
        }}
        resendIn={resendIn}
        sending={sending}
        verifying={verifying}
        error={otpError}
      />
    </div>
  );
}
