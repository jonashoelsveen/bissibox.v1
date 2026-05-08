import { BookOpen, CalendarDays, Library } from "lucide-react";

export type MemberSubTab = "calendar" | "diary" | "library";

interface Props {
  name: string;
  subTab: MemberSubTab;
  onSubTabChange: (t: MemberSubTab) => void;
}

export function MemberDataPanel({ name, subTab, onSubTabChange }: Props) {
  return (
    <aside className="flex w-full flex-col gap-3">
      <div className="px-1">
        <div
          className="truncate text-base text-ink"
          style={{ fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          {name}
        </div>
      </div>
      <div className="h-px w-full bg-hairline" />

      <div className="flex items-center gap-1 px-1">
        <IconTab active={subTab === "calendar"} onClick={() => onSubTabChange("calendar")} label="Calendar">
          <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
        <IconTab active={subTab === "diary"} onClick={() => onSubTabChange("diary")} label="Diary">
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
        <IconTab active={subTab === "library"} onClick={() => onSubTabChange("library")} label="Library">
          <Library className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </IconTab>
      </div>
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
