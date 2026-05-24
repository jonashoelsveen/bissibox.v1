import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

type Role = "athlete" | "coach" | "photographer";

const ROLE_LABEL: Record<Role, string> = {
  athlete: "Athlete",
  coach: "Coach",
  photographer: "Photographer",
};

const ROLE_HEADING: Record<Role, string> = {
  athlete: "Aponna Athlete Role Confirmation",
  coach: "Aponna Coach Role Confirmation",
  photographer: "Aponna Photographer Role Confirmation",
};

const ROLE_BODY: Record<Role, React.ReactNode> = {
  photographer: (
    <>
      By checking this box, you agree to the terms and conditions of the Aponna Photographer Program.
      You understand that your role as an Aponna Photographer is strictly limited to sports-related
      photography intended to benefit the client. You agree to operate entirely within the Aponna
      platform, which includes processing all bookings and payments through the Aponna ecosystem.
      Accepting external payments or bypassing the platform for client engagements is strictly
      prohibited.
      <br />
      <br />
      You acknowledge that you have read, understood, and agree to be bound by the full{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ color: "#1d1d1f", textDecoration: "underline" }}
      >
        Agreements
      </a>{" "}
      governing this role.
    </>
  ),
  athlete: (
    <>
      By checking this box, you agree to the terms and conditions of the Aponna Athlete Program.
      You agree to operate entirely within the Aponna platform for all athlete-related activities,
      bookings, and engagements.
      <br />
      <br />
      You acknowledge that you have read, understood, and agree to be bound by the full{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ color: "#1d1d1f", textDecoration: "underline" }}
      >
        Agreements
      </a>{" "}
      governing this role.
    </>
  ),
  coach: (
    <>
      By checking this box, you agree to the terms and conditions of the Aponna Coach Program.
      You agree to operate entirely within the Aponna platform for all coaching engagements,
      bookings, and payments. Accepting external payments or bypassing the platform is strictly
      prohibited.
      <br />
      <br />
      You acknowledge that you have read, understood, and agree to be bound by the full{" "}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ color: "#1d1d1f", textDecoration: "underline" }}
      >
        Agreements
      </a>{" "}
      governing this role.
    </>
  ),
};

export function GetRoleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [role, setRole] = useState<Role>("athlete");
  const [agreed, setAgreed] = useState(false);
  const [fieldsReady, setFieldsReady] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!open) return;
    setFieldsReady(false);
    setAgreed(false);
    const t = setTimeout(() => setFieldsReady(true), 1500);
    timers.current.push(t);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="get-role-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto"
          style={{
            paddingTop: "min(10vh, 110px)",
            paddingBottom: "min(10vh, 110px)",
            fontFamily: HELVETICA,
          }}
        >
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ background: "rgba(0,0,0,0.28)" }}
            onClick={onClose}
          />

          <motion.div
            key="get-role-card"
            layout
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative flex flex-col"
            style={{
              width: "min(760px, 94vw)",
              maxHeight: "88vh",
              background: "#ffffff",
              borderRadius: 18,
              boxShadow:
                "0 30px 60px -20px rgba(0,0,0,0.25), 0 12px 24px -12px rgba(0,0,0,0.18)",
              overflow: "hidden",
              transformOrigin: "top center",
            }}
          >
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0 }}
              animate={{ opacity: fieldsReady ? 1 : 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div
                className="space-y-5 overflow-y-auto"
                style={{ padding: "44px 48px 24px" }}
              >
                <div className="text-center">
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
                    Get a role
                  </h2>
                </div>

                <div>
                  <span
                    style={{
                      fontFamily: HELVETICA,
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#1d1d1f",
                      marginBottom: 6,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    Choose role
                  </span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    required
                    style={{
                      fontFamily: HELVETICA,
                      width: "100%",
                      background: "#ffffff",
                      color: "#1d1d1f",
                      border: "1px solid #1d1d1f",
                      borderRadius: 10,
                      padding: "10px 12px",
                      fontSize: 14,
                      outline: "none",
                      appearance: "auto",
                    }}
                  >
                    <option value="athlete">{ROLE_LABEL.athlete}</option>
                    <option value="coach">{ROLE_LABEL.coach}</option>
                    <option value="photographer">{ROLE_LABEL.photographer}</option>
                  </select>
                  <p
                    style={{
                      marginTop: 6,
                      fontFamily: HELVETICA,
                      fontSize: 12,
                      color: "#86868b",
                      lineHeight: 1.4,
                    }}
                  >
                    One role can be accesses at a time.
                  </p>
                </div>

                <div style={{ paddingTop: 8 }}>
                  <div
                    style={{
                      fontFamily: HELVETICA,
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#1d1d1f",
                      marginBottom: 10,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {ROLE_HEADING[role]}
                  </div>

                  <label
                    className="flex items-start gap-3"
                    style={{
                      cursor: "pointer",
                      background: "#fafafa",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      style={{ marginTop: 4, accentColor: "#1d1d1f" }}
                    />
                    <span
                      style={{
                        fontFamily: HELVETICA,
                        fontSize: 13,
                        color: "#1d1d1f",
                        lineHeight: 1.55,
                      }}
                    >
                      {ROLE_BODY[role]}
                    </span>
                  </label>
                </div>
              </div>

              <div
                className="flex items-center justify-between"
                style={{
                  padding: "14px 48px 20px",
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  background: "#ffffff",
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="transition active:scale-[0.99]"
                  style={{
                    background: "#ffffff",
                    color: "#1d1d1f",
                    borderRadius: 12,
                    padding: "11px 22px",
                    fontFamily: HELVETICA,
                    fontSize: 14,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    border: "1px solid #1d1d1f",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!agreed}
                  className="transition active:scale-[0.99]"
                  style={{
                    background: "#1d1d1f",
                    color: "#ffffff",
                    borderRadius: 12,
                    padding: "11px 22px",
                    fontFamily: HELVETICA,
                    fontSize: 14,
                    fontWeight: 500,
                    letterSpacing: "-0.005em",
                    border: "none",
                    cursor: agreed ? "pointer" : "not-allowed",
                    opacity: agreed ? 1 : 0.5,
                  }}
                >
                  Become an Aponna {ROLE_LABEL[role]}
                </button>
              </div>
            </motion.form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
