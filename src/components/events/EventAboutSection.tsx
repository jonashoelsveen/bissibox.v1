import { useEffect, useRef, useState } from "react";
import { AccountSelect } from "@/components/account/AccountFormFields";
import {
  accountFieldLabelStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";
import { cn } from "@/lib/utils";
import type { EventDraft, EventLocationDraft } from "./event-ui-types";
import { EventLocationPicker } from "./EventLocationPicker";
import {
  EVENT_TICKET_MAX_WIDTH_CLASS,
  TicketBackDescriptionEditor,
} from "./TicketBackDescription";

type Props = {
  draft: EventDraft;
  onChange: (patch: {
    name?: string;
    description?: string;
    startsAt?: string | null;
    location?: EventLocationDraft;
  }) => void;
};

const appleSectionHeaderStyle = {
  fontFamily: HELVETICA_STACK,
  letterSpacing: "-0.022em",
} as const;

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

type TimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: string, month: string) {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

function parseStartsAt(iso: string | null): TimeParts {
  if (!iso) return { year: "", month: "", day: "", hour: "", minute: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { year: "", month: "", day: "", hour: "", minute: "" };
  }
  return {
    year: String(d.getFullYear()),
    month: pad2(d.getMonth() + 1),
    day: pad2(d.getDate()),
    hour: pad2(d.getHours()),
    minute: pad2(d.getMinutes()),
  };
}

function buildStartsAt(parts: TimeParts): string | null {
  const { year, month, day, hour, minute } = parts;
  if (!year || !month || !day) return null;
  const maxDay = daysInMonth(year, month);
  const safeDay = pad2(Math.min(Number(day), maxDay));
  const h = hour || "00";
  const m = minute || "00";
  const local = new Date(`${year}-${month}-${safeDay}T${h}:${m}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

function clampDay(parts: TimeParts): TimeParts {
  if (!parts.year || !parts.month || !parts.day) return parts;
  const max = daysInMonth(parts.year, parts.month);
  if (Number(parts.day) <= max) return parts;
  return { ...parts, day: pad2(max) };
}

function EventTimeFields({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [parts, setParts] = useState<TimeParts>(() => parseStartsAt(value));
  const committedRef = useRef(value);

  // Sync from draft when it changes externally (e.g. load / clear elsewhere).
  useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    setParts(parseStartsAt(value));
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => {
    const y = String(currentYear - 1 + i);
    return { value: y, label: y };
  });
  const maxDay = daysInMonth(parts.year, parts.month);
  const days = Array.from({ length: maxDay }, (_, i) => {
    const d = pad2(i + 1);
    return { value: d, label: String(i + 1) };
  });
  const hours = Array.from({ length: 24 }, (_, i) => {
    const h = pad2(i);
    return { value: h, label: h };
  });
  const minutes = Array.from({ length: 60 }, (_, i) => {
    const m = pad2(i);
    return { value: m, label: m };
  });

  const setPart = (part: keyof TimeParts, next: string) => {
    setParts((prev) => {
      const nextParts = clampDay({ ...prev, [part]: next });
      const iso = buildStartsAt(nextParts);
      committedRef.current = iso;
      onChange(iso);
      return nextParts;
    });
  };

  return (
    <div className="mt-4 space-y-6" style={{ fontFamily: HELVETICA_STACK }}>
      <div>
        <div className="mb-2" style={accountFieldLabelStyle}>
          Date
        </div>
        <div className="grid grid-cols-3 gap-2">
          <AccountSelect
            ariaLabel="Month"
            value={parts.month}
            onChange={(v) => setPart("month", v)}
            options={[{ value: "", label: "Month" }, ...MONTHS]}
          />
          <AccountSelect
            ariaLabel="Day"
            value={parts.day}
            onChange={(v) => setPart("day", v)}
            options={[{ value: "", label: "Day" }, ...days]}
          />
          <AccountSelect
            ariaLabel="Year"
            value={parts.year}
            onChange={(v) => setPart("year", v)}
            options={[{ value: "", label: "Year" }, ...years]}
          />
        </div>
      </div>

      <div>
        <div className="mb-2" style={accountFieldLabelStyle}>
          Time
        </div>
        <div className="grid grid-cols-2 gap-2 sm:max-w-[280px]">
          <AccountSelect
            ariaLabel="Hour"
            value={parts.hour}
            onChange={(v) => setPart("hour", v)}
            options={[{ value: "", label: "Hour" }, ...hours]}
          />
          <AccountSelect
            ariaLabel="Minute"
            value={parts.minute}
            onChange={(v) => setPart("minute", v)}
            options={[{ value: "", label: "Min" }, ...minutes]}
          />
        </div>
      </div>
    </div>
  );
}

export function EventAboutSection({ draft, onChange }: Props) {
  return (
    <div className="w-full pb-16 pt-10 text-left">
      <div className="w-full max-w-[600px] px-8">
        <input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Event name"
          aria-label="Event name"
          className="w-full border-0 bg-transparent text-[40px] font-semibold leading-tight tracking-tight text-ink outline-none placeholder:text-muted-foreground/60"
        />

        <div className="mt-10">
          <h2
            className="text-[28px] font-semibold leading-tight text-ink"
            style={appleSectionHeaderStyle}
          >
            Time
          </h2>
          <EventTimeFields
            value={draft.startsAt}
            onChange={(startsAt) => onChange({ startsAt })}
          />
        </div>

        <div className="mt-10 pt-2">
          <h2
            className="text-[28px] font-semibold leading-tight text-ink"
            style={appleSectionHeaderStyle}
          >
            Location
          </h2>
        </div>
      </div>

      {/* Search stays ~600px; map uses full main width via horizontal padding only. */}
      <div className="mt-3 px-8">
        <EventLocationPicker
          value={draft.location}
          onChange={(location) => onChange({ location })}
        />
      </div>

      <div className="w-full px-8">
        <div className={cn("mt-10 w-full", EVENT_TICKET_MAX_WIDTH_CLASS)}>
          <h2
            className="text-[28px] font-semibold leading-tight text-ink"
            style={appleSectionHeaderStyle}
          >
            Description
          </h2>
          <div className="mt-3">
            <TicketBackDescriptionEditor
              value={draft.description}
              onChange={(description) => onChange({ description })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
