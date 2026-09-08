import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AccountFieldEditButton } from "@/components/account/AccountFieldEditButton";
import { AccountEmailOtpModal } from "@/components/account/AccountEmailOtpModal";
import {
  AccountFieldGroup,
  AccountTextField,
} from "@/components/account/AccountFormFields";
import { NEW_PASSWORD_MATCHES_CURRENT } from "@/lib/account-password-messages";
import {
  accountFieldControlStyle,
  accountHeaderActionStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";

export function AccountPasswordChangePanel({
  onChangePassword,
}: {
  onChangePassword: (
    current: string,
    next: string,
    extra?: { code: string; attempt_id: string },
  ) => Promise<{
    error?: string;
    pending?: boolean;
    masked?: string;
    attempt_id?: string;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [masked, setMasked] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [resendIn, setResendIn] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setOpen(false);
    setOtpOpen(false);
    setAttemptId(null);
    setDigits(["", "", "", "", "", ""]);
    setOtpError(null);
  };

  const startVerify = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error(NEW_PASSWORD_MATCHES_CURRENT);
      return;
    }

    setSaving(true);
    setOtpError(null);
    const result = await onChangePassword(currentPassword, newPassword);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.pending) {
      setMasked(result.masked ?? "");
      setAttemptId(result.attempt_id ?? null);
      setDigits(["", "", "", "", "", ""]);
      setResendIn(60);
      setOtpOpen(true);
      return;
    }

    toast.success("Password updated.");
    reset();
  };

  const verifyCode = async (codeStr?: string) => {
    const code = codeStr ?? digits.join("");
    if (code.length !== 6 || verifying || !attemptId) return;
    setVerifying(true);
    setOtpError(null);
    const result = await onChangePassword(currentPassword, newPassword, {
      code,
      attempt_id: attemptId,
    });
    setVerifying(false);

    if (result.error) {
      setOtpError(result.error);
      setDigits(["", "", "", "", "", ""]);
      return;
    }

    setOtpOpen(false);
    toast.success("Password updated.");
    reset();
  };

  if (!open) {
    return (
      <AccountFieldGroup label="Password">
        <div
          className="relative flex items-center"
          style={{ ...accountFieldControlStyle, paddingRight: 40 }}
        >
          <span className="tracking-widest text-[#6e6e73]">••••••••••••</span>
          <div className="absolute inset-y-0 right-1.5 flex items-center">
            <AccountFieldEditButton
              ariaLabel="Change password"
              onClick={() => setOpen(true)}
            />
          </div>
        </div>
      </AccountFieldGroup>
    );
  }

  return (
    <div className="space-y-6" style={{ fontFamily: HELVETICA_STACK }}>
      <AccountTextField
        label="Current password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={currentPassword}
        onChange={setCurrentPassword}
      />
      <AccountTextField
        label="New password"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
      />
      <div>
        <AccountTextField
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />
        <p className="mt-2 text-[15px] leading-snug text-[#6e6e73]">
          Enter your current password, then choose a new one. For your security, you must
          verify your identity before changing your password.
        </p>
      </div>
      <div className="flex items-center justify-end gap-5">
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          style={{
            ...accountHeaderActionStyle,
            color: "#6e6e73",
            opacity: saving ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void startVerify()}
          disabled={saving}
          style={{
            ...accountHeaderActionStyle,
            opacity: saving ? 0.5 : 1,
          }}
        >
          Verify
        </button>
      </div>

      <AccountEmailOtpModal
        open={otpOpen}
        email={masked}
        digits={digits}
        setDigits={setDigits}
        onVerify={(code) => void verifyCode(code)}
        onResend={() => void startVerify()}
        onClose={() => {
          if (!verifying) setOtpOpen(false);
        }}
        resendIn={resendIn}
        sending={saving}
        verifying={verifying}
        error={otpError}
      />
    </div>
  );
}
