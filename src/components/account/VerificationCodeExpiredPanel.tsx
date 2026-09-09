import type { CSSProperties, ReactNode } from "react";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

const TITLE: CSSProperties = {
  fontFamily: HELVETICA_STACK,
  fontSize: 22,
  fontWeight: 400,
  color: "#1d1d1f",
  letterSpacing: "-0.01em",
  lineHeight: 1.2,
};

const BODY: CSSProperties = {
  marginTop: 6,
  fontFamily: HELVETICA_STACK,
  fontSize: 13,
  fontWeight: 400,
  color: "#86868b",
  letterSpacing: "-0.005em",
};

export function VerificationCodeExpiredPanel({
  footer,
  titleStyle,
  compactTitle,
  error,
}: {
  footer: ReactNode;
  titleStyle?: CSSProperties;
  compactTitle?: boolean;
  error?: string | null;
}) {
  return (
    <>
      <div className={compactTitle ? "text-center" : "mb-6 text-center"}>
        <h2 style={{ ...TITLE, ...titleStyle }}>Verification code expired</h2>
        <p style={BODY}>Click &quot;Resend&quot; for new code.</p>
        {error ? (
          <p
            style={{
              ...BODY,
              marginTop: 10,
              color: "#ff3b30",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>
      {footer}
    </>
  );
}
