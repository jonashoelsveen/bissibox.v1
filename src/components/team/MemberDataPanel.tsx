import { useState } from "react";
import { BookOpen, CalendarDays, Library } from "lucide-react";
import { MiniCalendar, type DateRange } from "@/components/calendar/MiniCalendar";

type SubTab = "calendar" | "diary" | "library";

interface Props {
  name: string;
}

export function MemberDataPanel({ name }: Props) {
  const [tab, setTab] = useState<SubTab>("calendar");
  const today = new Date();
  const [range, setRange] = useState<DateRange>({ start: today, end: today });

  return (
    <aside className="flex w-full flex-col gap-3">
      <div className="px-1">
        <div
          className="truncate text-lg text-ink"
          style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          {name}
        </div>
      </div>
      <div className="h-px w-full bg-hairline" />

      <div className="flex items-center gap-1 px-1">
        <IconTab active={tab === "calendar"} onClick={() => setTab("calendar")} label="Calendar">
          <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
        <IconTab active={tab === "diary"} onClick={() => setTab("diary")} label="Diary">
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
        <IconTab active={tab === "library"} onClick={() => setTab("library")} label="Library">
          <Library className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
      </div>

      {tab === "calendar" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-hairline bg-card">
            <MiniCalendar
              selectedRange={range}
              onSelectRange={(r) => setRange(r)}
            />
          </div>
          <div className="rounded-md border border-hairline bg-card px-3 py-2 text-xs text-muted-foreground">
            Only the <span className="text-ink">Training</span> category is shown to group leaders.
          </div>
        </div>
      )}

      {tab === "diary" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-hairline bg-card">
            <MiniCalendar
              selectedRange={range}
              onSelectRange={(r) => setRange(r)}
            />
          </div>
          <div className="flex flex-col gap-0.5 pb-4">
            <div className="px-3 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
              Categories
            </div>
            <CategoryStub label="Training" depth={0} />
            <CategoryStub label="Endurance" depth={1} />
            <CategoryStub label="Running" depth={2} />
            <CategoryStub label="Cycling" depth={2} />
            <CategoryStub label="Other" depth={2} />
            <CategoryStub label="Strength" depth={1} />
            <CategoryStub label="Core" depth={2} />
            <CategoryStub label="Max" depth={2} />
            <CategoryStub label="Stretch" depth={1} />
          </div>
        </div>
      )}

      {tab === "library" && (
        <div className="rounded-md border border-hairline bg-card px-3 py-3 text-xs text-muted-foreground">
          Media library (read-only) — coming next.
        </div>
      )}
    </aside>
  );
}

function IconTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-transparent transition ${
        active ? "text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryStub({ label, depth }: { label: string; depth: number }) {
  return (
    <div
      className="flex items-center gap-1.5 py-1 pl-2 pr-2 text-xs text-ink"
      style={{ marginLeft: depth * 12 }}
    >
      <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-hairline" />
      <span>{label}</span>
    </div>
  );
}
