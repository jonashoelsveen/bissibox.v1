import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Search,
  Plus,
  Briefcase,
} from "lucide-react";

type PreviousItem = {
  id: string;
  kind: "note" | "file" | "media";
  title: string;
  updated_at: string;
};

export type PreviousNewKind = "meeting" | "note" | "files" | "media";

export function PreviousPage({
  onOpenNote,
  onOpenTab,
  onCreate,
  showMeetingOption,
}: {
  onOpenNote: (id: string) => void;
  onOpenTab: (tab: "files" | "media") => void;
  onCreate: (kind: PreviousNewKind) => void;
  showMeetingOption?: boolean;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const [items, setItems] = useState<PreviousItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const load = useCallback(async () => {
    if (!user) return;
    let teamId: string | null = null;
    if (isTeamMode) {
      const q = activeEntityId
        ? supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle()
        : supabase
            .from("teams")
            .select("id")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
      const { data } = await q;
      teamId = data?.id ?? null;
    }
    const scope = <T,>(q: T): T =>
      (isTeamMode && teamId
        ? (q as any).eq("team_id", teamId)
        : (q as any).is("team_id", null).eq("user_id", user.id)) as T;

    const [{ data: notes }, { data: files }, { data: media }] = await Promise.all([
      scope(
        supabase
          .from("notes")
          .select("id,title,updated_at")
          .order("updated_at", { ascending: false })
          .limit(20),
      ),
      scope(
        supabase
          .from("files")
          .select("id,name,created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
      scope(
        supabase
          .from("media_items")
          .select("id,storage_path,created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ),
    ]);

    const merged: PreviousItem[] = [
      ...((notes ?? []) as any[]).map((n) => ({
        id: n.id,
        kind: "note" as const,
        title: n.title || "Untitled note",
        updated_at: n.updated_at,
      })),
      ...((files ?? []) as any[]).map((f) => ({
        id: f.id,
        kind: "file" as const,
        title: f.name || "Untitled file",
        updated_at: f.created_at,
      })),
      ...((media ?? []) as any[]).map((m) => ({
        id: m.id,
        kind: "media" as const,
        title: (m.storage_path as string).split("/").pop() || "Media",
        updated_at: m.created_at,
      })),
    ]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 30);

    setItems(merged);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.title.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="pt-4">
      {/* Search + Plus header */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recent…"
            className="h-10 w-full rounded-full border border-hairline bg-card pl-9 pr-3 text-sm text-ink outline-none transition focus:border-primary"
          />
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Create new"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 w-44 origin-top-right overflow-hidden rounded-xl border border-hairline bg-popover p-1 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
            >
              {showMeetingOption && (
                <DropdownItem
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  label="Meeting"
                  onClick={() => {
                    setMenuOpen(false);
                    onCreate("meeting");
                  }}
                />
              )}
              <DropdownItem
                icon={<StickyNote className="h-3.5 w-3.5" />}
                label="Note"
                onClick={() => {
                  setMenuOpen(false);
                  onCreate("note");
                }}
              />
              <DropdownItem
                icon={<FolderClosed className="h-3.5 w-3.5" />}
                label="Files"
                onClick={() => {
                  setMenuOpen(false);
                  onCreate("files");
                }}
              />
              <DropdownItem
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                label="Media"
                onClick={() => {
                  setMenuOpen(false);
                  onCreate("media");
                }}
              />
            </div>
          )}
        </div>
      </div>

      {filtered === null ? (
        <div className="px-2 py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-2 py-16 text-center text-sm text-muted-foreground">
          {items && items.length === 0
            ? "No items yet. Create your first note, file or album."
            : "No matches."}
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recently edited
          </h2>
          <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
            {filtered.map((it) => {
              const Icon =
                it.kind === "note" ? StickyNote : it.kind === "file" ? FolderClosed : ImageIcon;
              return (
                <li key={`${it.kind}:${it.id}`}>
                  <button
                    onClick={() => {
                      if (it.kind === "note") onOpenNote(it.id);
                      else if (it.kind === "file") onOpenTab("files");
                      else onOpenTab("media");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-secondary/60"
                  >
                    <Icon
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={2.25}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">{it.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground mono">
                      {new Date(it.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function DropdownItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-secondary"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
