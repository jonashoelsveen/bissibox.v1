import { Info, Square, Ticket, Users } from "lucide-react";
import { EVENT_SECTIONS, type EventSection } from "./event-ui-types";

function sideRowClass(active: boolean) {
  return (
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors " +
    (active ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/70")
  );
}

function SectionIcon({ section }: { section: EventSection }) {
  const className = "h-3.5 w-3.5 shrink-0";
  switch (section) {
    case "about":
      // Tourist-office style info mark (circle + i).
      return <Info className={className} strokeWidth={2} />;
    case "subevents":
      return <Square className={className} strokeWidth={2} />;
    case "tickets":
      return <Ticket className={className} strokeWidth={2} />;
    case "participants":
      // Same glyph as activity-type ⋯ menu “Access”.
      return <Users className={className} strokeWidth={2} />;
  }
}

export function EventEditSideNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: EventSection;
  onSectionChange: (section: EventSection) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-1.5">
      <nav className="min-h-0 flex-1 overflow-y-auto pb-4 pt-1 [scrollbar-width:thin]">
        {EVENT_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => onSectionChange(section.key)}
            className={
              sideRowClass(activeSection === section.key) +
              (section.gapAfter ? " mb-3" : "")
            }
          >
            <SectionIcon section={section.key} />
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
