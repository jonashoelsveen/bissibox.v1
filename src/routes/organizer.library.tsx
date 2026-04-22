import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Plus, Copy, Pencil, Globe, Search as SearchIcon, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

type SortKey = "updated_at" | "starts_at" | "title";
type SortDir = "asc" | "desc";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updated_at", label: "Last edited" },
  { key: "starts_at", label: "Event date" },
  { key: "title", label: "Title" },
];

export const Route = createFileRoute("/organizer/library")({
  component: LibraryPage,
  head: () => ({ meta: [{ title: "Event library · Raceline Organizer" }] }),
});

interface OrgEvent {
  id: string;
  title: string;
  organizer: string;
  starts_at: string;
  updated_at: string;
  location: string | null;
  signup_fee: number;
  currency: string;
  race_types: string[];
  featured: boolean;
  published: boolean;
}

function LibraryPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("owner_id", user.id)
      .order("starts_at", { ascending: false });
    setEvents((data as OrgEvent[]) ?? []);
  };

  const duplicate = async (sourceId: string) => {
    if (!user) return;
    setBusy(true);
    try {
      const { data: src } = await supabase.from("events").select("*").eq("id", sourceId).single();
      if (!src) throw new Error("Not found");
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as Record<string, unknown>;
      const insert = {
        ...rest,
        title: `${(rest as { title: string }).title} (copy)`,
        owner_id: user.id,
        featured: false,
      };
      const { data: inserted, error } = await supabase
        .from("events")
        .insert(insert as never)
        .select("id")
        .single();
      if (error) throw error;

      const [{ data: classes }, { data: subs }] = await Promise.all([
        supabase.from("event_classes").select("code,label,sort_order").eq("event_id", sourceId),
        supabase.from("event_subevents").select("name,starts_at,distance_km,bib_from,bib_to,max_participants,class_codes,sort_order,course_path,split_points").eq("event_id", sourceId),
      ]);
      if (classes?.length)
        await supabase.from("event_classes").insert(
          classes.map((c) => ({ ...c, event_id: inserted!.id })) as never
        );
      if (subs?.length)
        await supabase.from("event_subevents").insert(
          subs.map((s) => ({ ...s, event_id: inserted!.id })) as never
        );

      toast.success("Event duplicated.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate.");
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (id: string, next: boolean) => {
    setBusy(true);
    const { error } = await supabase.from("events").update({ published: next } as never).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setEvents((arr) => arr.map((x) => (x.id === id ? { ...x, published: next } : x)));
    toast.success(next ? "Event published." : "Event unpublished.");
  };
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = events;
    if (term) {
      arr = arr.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          e.organizer.toLowerCase().includes(term) ||
          (e.location ?? "").toLowerCase().includes(term) ||
          e.race_types.some((t) => t.toLowerCase().includes(term))
      );
    }
    const sorted = [...arr].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") cmp = a.title.localeCompare(b.title);
      else cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [events, q, sortKey, sortDir]);

  const currentSortLabel = SORT_OPTIONS.find((s) => s.key === sortKey)?.label ?? "Sort";

  if (!user) return <div className="mx-auto max-w-4xl px-6 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="px-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-6 pb-4">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Organizer · Library</p>
          <h1 className="mt-2 text-3xl text-ink md:text-4xl">Your events</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Past and upcoming events. Duplicate to use as a template.
          </p>
        </div>
        <Link
          to="/organizer/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New event
        </Link>
      </header>

      <div className="border-b border-hairline" />

      <div className="mx-auto max-w-5xl pt-6">
        <div className="flex w-full items-center gap-2 pb-4">
          <label className="flex flex-1 items-center gap-3 rounded-full border border-hairline bg-card px-5 py-2.5 ring-soft focus-within:border-primary">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your events…"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="mono text-xs uppercase tracking-widest text-muted-foreground hover:text-ink"
              >
                clear
              </button>
            )}
          </label>
          <div className="relative shrink-0">
            <button
              onClick={() => setSortOpen((o) => !o)}
              aria-label="Sort"
              title={`Sort: ${currentSortLabel} (${sortDir})`}
              className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-2.5 text-xs text-muted-foreground transition hover:text-ink"
            >
              <ArrowUpDown className="h-4 w-4" />
              <span className="hidden sm:inline">{currentSortLabel}</span>
              {sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-hairline bg-card shadow-lg">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        setSortKey(opt.key);
                        setSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-secondary ${
                        sortKey === opt.key ? "text-ink" : "text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.key && <span className="mono text-[9px] uppercase">active</span>}
                    </button>
                  ))}
                  <div className="border-t border-hairline" />
                  <button
                    onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-secondary"
                  >
                    Direction
                    <span className="mono text-[10px] uppercase">{sortDir}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <section>
          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline bg-card/60 p-10 text-center">
              <p className="text-sm text-muted-foreground">No events yet.</p>
              <Link
                to="/organizer/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> Create your first event
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">No events match that search.</p>
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-card">
              {filtered.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-ink">{e.title}</span>
                      <span
                        className={`mono shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${
                          e.published
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.organizer} · {e.location ?? "—"} · {e.race_types.join(", ")}
                    </div>
                  </div>
                  <span className="num w-28 shrink-0 text-right text-sm text-ink">{formatDate(e.starts_at)}</span>
                  <div className="flex w-[230px] shrink-0 items-center justify-end gap-1">
                    <Link
                      to="/organizer/$eventId/edit"
                      params={{ eventId: e.id }}
                      aria-label="Edit"
                      className="rounded-md border border-hairline bg-background p-2 text-muted-foreground transition hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => duplicate(e.id)}
                      disabled={busy}
                      aria-label="Duplicate"
                      className="rounded-md border border-hairline bg-background p-2 text-muted-foreground transition hover:text-ink disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => togglePublish(e.id, !e.published)}
                      disabled={busy}
                      aria-label={e.published ? "Unpublish" : "Publish"}
                      title={e.published ? "Unpublish" : "Publish"}
                      className={`inline-flex w-[120px] items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs transition disabled:opacity-50 ${
                        e.published
                          ? "border-hairline bg-background text-muted-foreground hover:text-ink"
                          : "border-primary bg-card text-primary hover:bg-primary/5"
                      }`}
                    >
                      <Globe className="h-4 w-4" />
                      {e.published ? "Unpublish" : "Publish"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
