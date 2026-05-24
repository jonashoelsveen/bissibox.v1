import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COUNTRIES, COUNTRY_CALLING_CODES } from "@/lib/countries";
import { TIMEZONES, COUNTRY_TO_TIMEZONE, COUNTRY_TO_LANGUAGE, LANGUAGES } from "@/lib/timezones";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export function CreateEntityModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (orgName: string) => void;
}) {
  // Organization
  const [country, setCountry] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [postNumber, setPostNumber] = useState("");
  const [postPlace, setPostPlace] = useState("");
  const [callingCode, setCallingCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("");
  const [language, setLanguage] = useState("en");

  // About you
  const [workEmail, setWorkEmail] = useState("");
  const [personalCallingCode, setPersonalCallingCode] = useState("+1");
  const [personalPhone, setPersonalPhone] = useState("");
  const [verifyVia, setVerifyVia] = useState<"email" | "sms">("email");
  const [marketing, setMarketing] = useState(true);
  const [role, setRole] = useState("admin");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldsReady, setFieldsReady] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Default timezone + language from country selection.
  useEffect(() => {
    if (!country) return;
    const tz = COUNTRY_TO_TIMEZONE[country];
    if (tz) setTimezone(tz);
    const lang = COUNTRY_TO_LANGUAGE[country];
    if (lang) setLanguage(lang);
  }, [country]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldsReady(false);
    const t = setTimeout(() => setFieldsReady(true), 1500);
    timers.current.push(t);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [open]);

  const groupedTz = useMemo(() => {
    const groups: Record<string, Array<typeof TIMEZONES[number]>> = {};
    for (const tz of TIMEZONES) {
      (groups[tz.group] ||= []).push(tz);
    }
    return groups;
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!role) {
      setError("At least one admin role is required to create an entity.");
      return;
    }
    setSubmitting(true);
    // Persistence wired in a follow-up prompt — for now hand the name back.
    onCreated?.(orgName.trim());
    setSubmitting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="create-entity-overlay"
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
            onClick={() => {
              if (!submitting) onClose();
            }}
          />

          <motion.div
            key="create-entity-card"
            layout
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{
              duration: 0.35,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            className="relative flex flex-col"
            style={{
              width: "min(480px, 94vw)",
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
              onSubmit={onSubmit}
              initial={{ opacity: 0 }}
              animate={{ opacity: fieldsReady ? 1 : 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div
                className="space-y-4 overflow-y-auto"
                style={{ padding: "44px 40px 20px" }}
              >
                <Header
                  title="Create Aponna-entity"
                  subtitle="Organize your team."
                />

                <LabeledSelect label="Country" value={country} onChange={setCountry} required>
                  <option value="" disabled>Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </LabeledSelect>

                <LabeledField label="Organization name" value={orgName} onChange={setOrgName} required />
                <LabeledField label="Organization number" value={orgNumber} onChange={setOrgNumber} required />

                <LabeledField label="Address 1" value={address1} onChange={setAddress1} required />
                <LabeledField label="Address 2 (optional)" value={address2} onChange={setAddress2} />

                <div>
                  <FieldLabel>Post number and post place</FieldLabel>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "120px 1fr" }}>
                    <RawInput value={postNumber} onChange={setPostNumber} required />
                    <RawInput value={postPlace} onChange={setPostPlace} required />
                  </div>
                </div>

                <div>
                  <FieldLabel>Phone number</FieldLabel>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "110px 1fr" }}>
                    <RawSelect value={callingCode} onChange={setCallingCode} required>
                      {COUNTRY_CALLING_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </RawSelect>
                    <RawInput type="tel" value={phone} onChange={setPhone} required />
                  </div>
                </div>

                <LabeledField label="Web page" value={website} onChange={setWebsite} type="url" />

                <div>
                  <FieldLabel>Timezone and language</FieldLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <RawSelect value={timezone} onChange={setTimezone} required>
                      <option value="" disabled>Select timezone</option>
                      {Object.entries(groupedTz).map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map((tz) => (
                            <option key={tz.id} value={tz.id}>{tz.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </RawSelect>
                    <RawSelect value={language} onChange={setLanguage} required>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </RawSelect>
                  </div>
                </div>

                <Divider label="About you" />

                <div>
                  <FieldLabel>Role</FieldLabel>
                  <RawSelect value={role} onChange={setRole} required>
                    <option value="admin">Admin</option>
                  </RawSelect>
                  <p
                    style={{
                      marginTop: 6,
                      fontFamily: HELVETICA,
                      fontSize: 12,
                      color: "#86868b",
                      lineHeight: 1.4,
                    }}
                  >
                    At least one admin role is required to create the entity. Roles can be added and managed once the entity is created.
                  </p>
                </div>

                <LabeledField
                  label="Work e-mail address"
                  value={workEmail}
                  onChange={setWorkEmail}
                  type="email"
                  autoComplete="email"
                  required
                />

                <div>
                  <FieldLabel>Phone number</FieldLabel>
                  <div className="grid gap-3" style={{ gridTemplateColumns: "110px 1fr" }}>
                    <RawSelect value={personalCallingCode} onChange={setPersonalCallingCode} required>
                      {COUNTRY_CALLING_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </RawSelect>
                    <RawInput type="tel" value={personalPhone} onChange={setPersonalPhone} autoComplete="tel-national" required />
                  </div>
                </div>

                <div>
                  <FieldLabel>Verification</FieldLabel>
                  <div className="space-y-2">
                    <RadioRow
                      label="Verify with code via e-mail"
                      checked={verifyVia === "email"}
                      onChange={() => setVerifyVia("email")}
                    />
                    <RadioRow
                      label="Verify with code via text message"
                      checked={verifyVia === "sms"}
                      onChange={() => setVerifyVia("sms")}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontFamily: HELVETICA, fontSize: 12, fontWeight: 700,
                      color: "#1d1d1f", marginBottom: 6, letterSpacing: "-0.005em",
                    }}
                  >
                    Announcements
                  </div>
                  <label className="flex items-start gap-2" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={marketing}
                      onChange={(e) => setMarketing(e.target.checked)}
                      style={{ marginTop: 3, accentColor: "#1d1d1f" }}
                    />
                    <span style={{ fontFamily: HELVETICA, fontSize: 12, color: "#86868b", lineHeight: 1.4 }}>
                      Receive Aponna emails and communication including marketing, recomendations and updaes about Aponna software and services.
                    </span>
                  </label>
                </div>


                {error && (
                  <div
                    className="text-[12.5px]"
                    style={{ color: "#c0392b", fontFamily: HELVETICA }}
                  >
                    {error}
                  </div>
                )}
              </div>

              <div
                className="flex items-center justify-between"
                style={{
                  padding: "14px 40px 20px",
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  background: "#ffffff",
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="transition active:scale-[0.99]"
                  style={{
                    background: "#ffffff", color: "#1d1d1f",
                    borderRadius: 12, padding: "11px 22px",
                    fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
                    letterSpacing: "-0.005em",
                    border: "1px solid #1d1d1f",
                    cursor: submitting ? "default" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="transition active:scale-[0.99]"
                  style={{
                    background: "#1d1d1f", color: "#ffffff",
                    borderRadius: 12, padding: "11px 22px",
                    fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
                    letterSpacing: "-0.005em", border: "none",
                    cursor: submitting ? "default" : "pointer",
                    opacity: submitting ? 0.85 : 1,
                  }}
                >
                  Continue
                </button>
              </div>
            </motion.form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4 text-center">
      <h2
        style={{
          fontFamily: HELVETICA, fontSize: 22, fontWeight: 400,
          color: "#1d1d1f", letterSpacing: "-0.01em", lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          marginTop: 6, fontFamily: HELVETICA, fontSize: 13,
          fontWeight: 400, color: "#86868b", letterSpacing: "-0.005em",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="pt-2">
      <div
        style={{
          borderTop: "1px solid rgba(0,0,0,0.08)",
          margin: "4px 0 12px",
        }}
      />
      <div
        style={{
          fontFamily: HELVETICA, fontSize: 13, fontWeight: 600,
          color: "#1d1d1f", letterSpacing: "-0.005em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: HELVETICA, display: "block", fontSize: 12,
        fontWeight: 700, color: "#1d1d1f", marginBottom: 6,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </span>
  );
}

function LabeledField({
  label, value, onChange, type = "text", required, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <RawInput
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
      />
    </label>
  );
}

function LabeledSelect({
  label, value, onChange, required, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <RawSelect value={value} onChange={onChange} required={required}>
        {children}
      </RawSelect>
    </label>
  );
}

function RadioRow({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: "#1d1d1f" }}
      />
      <span style={{ fontFamily: HELVETICA, fontSize: 13, color: "#1d1d1f" }}>
        {label}
      </span>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: HELVETICA,
  width: "100%",
  background: "#ffffff",
  color: "#1d1d1f",
  border: "1px solid #1d1d1f",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
};

function RawInput({
  type = "text", value, onChange, required, autoComplete,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoComplete={autoComplete}
      style={inputStyle}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    />
  );
}

function RawSelect({
  value, onChange, required, children,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      style={{ ...inputStyle, appearance: "auto" }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </select>
  );
}
