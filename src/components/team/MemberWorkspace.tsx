import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Library } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniCalendar, type DateRange } from "@/components/calendar/MiniCalendar";
import { YearCalendarView } from "@/components/calendar/YearCalendarView";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import type { CategoryKey } from "@/components/calendar/CalendarSideNav";
import { MemberLibraryMain, type LibraryView, type Album } from "./MemberLibrary";
import { useViewerRole } from "@/hooks/useViewerRole";

export type MemberSubTab = "calendar" | "diary" | "library";

interface Props {
  userId: string;
  name: string;
}

export function MemberWorkspace({ userId, name }: Props) {
  const [subTab, setSubTab] = useState<MemberSubTab>("calendar");
  const viewerRole = useViewerRole(userId);

  /* shared calendar/diary state */
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [calViewMode, setCalViewMode] = useState<ViewMode>("month");
  const [diaryViewMode, setDiaryViewMode] = useState<ViewMode>("week");

  /* library state */
  const [libView, setLibView] = useState<LibraryView>({ type: "all" });
  const [albums, setAlbums] = useState<Album[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("media_albums")
        .select("id,name,pinned,sort_order")
        .is("team_id", null)
        .eq("user_id", userId)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      if (!cancelled) setAlbums((data ?? []) as Album[]);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const visibleCategories = useMemo<Set<CategoryKey>>(
    () => new Set<CategoryKey>(["ind:training"]),
    [],
  );

  const viewMode = subTab === "diary" ? diaryViewMode : calViewMode;
  const setViewMode = (v: ViewMode) => {
    if (subTab === "diary") setDiaryViewMode(v === "day" ? "week" : v);
    else setCalViewMode(v);
  };

  return (
    <div className="grid h-full gap-6 overflow-hidden pt-4 md:grid-cols-[1fr_240px]">
      <div className="min-w-0 md:h-full md:overflow-y-auto">
        {subTab === "library" ? (
          <MemberLibraryMain userId={userId} albums={albums} view={libView} />
        ) : (
          <YearCalendarView
            calId={subTab === "diary" ? `diary:${userId}` : `user:${userId}`}
            defaultTitle={subTab === "diary" ? "Diary" : "Calendar"}
            seat="individual"
            appKind={subTab}
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r ?? { start: d, end: d });
            }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            visibleCategories={visibleCategories}
            memberId={userId}
            viewerRole={viewerRole}
          />
        )}
      </div>

      <aside className="md:h-full md:overflow-y-auto md:pl-1">
        <nav className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
          <div className="px-1">
            <div className="truncate text-base font-semibold text-ink">{name}</div>
          </div>
          <div className="h-px w-full bg-hairline" />

          <div className="flex items-center gap-1 px-1">
            <IconTab active={subTab === "calendar"} onClick={() => setSubTab("calendar")} label="Calendar">
              <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </IconTab>
            <IconTab active={subTab === "diary"} onClick={() => setSubTab("diary")} label="Diary">
              <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </IconTab>
            <IconTab active={subTab === "library"} onClick={() => setSubTab("library")} label="Library">
              <Library className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </IconTab>
          </div>

          {subTab !== "library" ? (
            <div className="rounded-lg border border-hairline bg-card">
              <MiniCalendar
                selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
                onSelectRange={(r) => {
                  setCurrentDate(r.start);
                  setCurrentRange(r);
                }}
                viewMode={viewMode}
              />
            </div>
          ) : (
            <LibraryNav albums={albums} view={libView} onChange={setLibView} />
          )}
        </nav>
      </aside>
    </div>
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

function LibraryNav({
  albums,
  view,
  onChange,
}: {
  albums: Album[];
  view: LibraryView;
  onChange: (v: LibraryView) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="-ml-1 flex flex-col gap-0.5">
      <NavBtn active={view.type === "all"} onClick={() => onChange({ type: "all" })}>
        All
      </NavBtn>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-md px-3 py-1.5 text-left text-xs text-muted-foreground transition hover:text-ink"
      >
        <span>Folders</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
          <NavBtn small active={view.type === "album" && view.id === null} onClick={() => onChange({ type: "album", id: null })}>
            Unsorted
          </NavBtn>
          {albums.map((a) => (
            <NavBtn
              key={a.id}
              small
              active={view.type === "album" && view.id === a.id}
              onClick={() => onChange({ type: "album", id: a.id })}
            >
              {a.name}
            </NavBtn>
          ))}
          {albums.length === 0 && (
            <span className="px-3 py-1 text-[11px] text-muted-foreground">No folders</span>
          )}
        </div>
      )}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-left transition ${
        small ? "text-xs" : "text-sm"
      } ${active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:bg-secondary/60 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
