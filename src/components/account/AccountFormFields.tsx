import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  accountFieldControlStyle,
  accountFieldLabelStyle,
  accountHeaderActionStyle,
  accountSectionTitleStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";
import { parseBirthDateParts } from "@/lib/birth-date";

export function AccountPageTitle({ title }: { title: string }) {
  return (
    <h1 style={accountSectionTitleStyle}>{title}</h1>
  );
}

export function AccountPageHeader({
  title,
  trailing,
  dirty = false,
  saving = false,
  onCancel,
  onSave,
}: {
  title: string;
  trailing?: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onCancel?: () => void;
  onSave?: () => void;
}) {
  const showActions = dirty && onCancel && onSave;
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="min-w-0" style={accountSectionTitleStyle}>
        {title}
      </h1>
      {trailing || showActions ? (
        <div className="flex shrink-0 items-center gap-5">
          {trailing}
          {showActions ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                style={{
                  ...accountHeaderActionStyle,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                style={{
                  ...accountHeaderActionStyle,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                Save
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AccountFieldGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2" style={accountFieldLabelStyle}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function markAccountFieldFocused(el: HTMLElement) {
  document.querySelectorAll(".account-field.is-focused").forEach((node) => {
    if (node !== el) node.classList.remove("is-focused");
  });
  el.classList.add("is-focused");
}

export function AccountTextField({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  readOnly = false,
  placeholder,
  trailing,
  autoFocus = false,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  readOnly?: boolean;
  placeholder?: string;
  trailing?: ReactNode;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.focus({ preventScroll: true });
      markAccountFieldFocused(el);
    }, 0);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  return (
    <AccountFieldGroup label={label}>
      <div className="relative">
        <input
          ref={inputRef}
          type={type}
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onFocus={(e) => markAccountFieldFocused(e.currentTarget)}
          onBlur={(e) => {
            e.currentTarget.classList.remove("is-focused");
            onBlur?.();
          }}
          onPointerDown={(e) => markAccountFieldFocused(e.currentTarget)}
          className={["account-field", readOnly ? "cursor-default" : undefined]
            .filter(Boolean)
            .join(" ")}
          style={{
            ...accountFieldControlStyle,
            paddingRight: trailing ? 40 : 12,
          }}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        ) : null}
      </div>
    </AccountFieldGroup>
  );
}

const selectStyle: CSSProperties = {
  ...accountFieldControlStyle,
  cursor: "pointer",
  // Native menulist so the selected Day/Month/Year label paints. `appearance:
  // none` on Safari/Chrome often leaves the placeholder visible instead.
  appearance: "auto",
  WebkitAppearance: "menulist",
  color: "#1d1d1f",
  WebkitTextFillColor: "#1d1d1f",
};

export function AccountSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  className?: string;
} & Pick<SelectHTMLAttributes<HTMLSelectElement>, "aria-label">) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={["account-field", className].filter(Boolean).join(" ")}
      style={selectStyle}
    >
      {options.map((opt) => (
        <option key={opt.value || "__empty"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function parseBirthDate(iso: string | null) {
  return parseBirthDateParts(iso);
}

function daysInMonth(year: string, month: string) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function buildBirthDate(year: string, month: string, day: string) {
  if (!year || !month || !day) return null;
  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Number(day), maxDay);
  return `${year}-${month.padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

export function AccountBirthDateFields({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const parsedFromValue = parseBirthDate(value);
  const [parts, setParts] = useState(parsedFromValue);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setParts(parseBirthDate(value));
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => {
    const y = String(currentYear - i);
    return { value: y, label: y };
  });
  const maxDay = daysInMonth(parts.year, parts.month);
  const days = Array.from({ length: maxDay }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return { value: d, label: String(i + 1) };
  });

  const setPart = (part: "month" | "day" | "year", next: string) => {
    let nextState = { ...parts, [part]: next };
    const nextMax = daysInMonth(nextState.year, nextState.month);
    if (nextState.day && Number(nextState.day) > nextMax) {
      nextState = { ...nextState, day: String(nextMax).padStart(2, "0") };
    }
    setParts(nextState);
    const iso = buildBirthDate(nextState.year, nextState.month, nextState.day);
    lastEmitted.current = iso;
    onChange(iso);
  };

  return (
    <AccountFieldGroup label="Date of birth">
      <div className="grid grid-cols-3 gap-2">
        <AccountSelect
          ariaLabel="Birth month"
          value={parts.month}
          onChange={(v) => setPart("month", v)}
          options={[{ value: "", label: "Month" }, ...MONTHS]}
        />
        <AccountSelect
          ariaLabel="Birth day"
          value={parts.day}
          onChange={(v) => setPart("day", v)}
          options={[{ value: "", label: "Day" }, ...days]}
        />
        <AccountSelect
          ariaLabel="Birth year"
          value={parts.year}
          onChange={(v) => setPart("year", v)}
          options={[{ value: "", label: "Year" }, ...years]}
        />
      </div>
    </AccountFieldGroup>
  );
}

export function AccountFormSkeleton() {
  return (
    <div className="mt-8 space-y-6" style={{ fontFamily: HELVETICA_STACK }}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="h-9 animate-pulse rounded-[10px] bg-black/[0.04]" />
        <div className="h-9 animate-pulse rounded-[10px] bg-black/[0.04]" />
      </div>
      <div className="h-9 animate-pulse rounded-[10px] bg-black/[0.04]" />
    </div>
  );
}

export function AccountFormError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-8 max-w-xl" style={{ fontFamily: HELVETICA_STACK }}>
      <p className="text-[17px] leading-snug text-[#6e6e73]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4"
          style={{
            fontFamily: HELVETICA_STACK,
            fontSize: 17,
            color: "#0066cc",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
