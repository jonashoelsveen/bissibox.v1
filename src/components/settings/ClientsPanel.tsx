import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

type Access = "view" | "edit";

interface ClientRow {
  id: string;
  owner_id: string;
  owner_email: string | null;
  status: "pending" | "accepted";
  calendar_access: Access;
  diary_access: Access;
  photos_access: Access;
  display_name?: string | null;
}

export function ClientsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_coaches")
      .select("id, owner_id, status, calendar_access, diary_access, photos_access")
      .eq("coach_user_id", user.id)
      .eq("status", "accepted")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Omit<ClientRow, "owner_email" | "display_name">[];
    const ids = list.map((r) => r.owner_id);
    const nameMap = new Map<string, { name: string; email: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      for (const p of (profs ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>) {
        const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        nameMap.set(p.id, { name: n, email: p.email });
      }
    }
    const enriched: ClientRow[] = list.map((r) => {
      const info = nameMap.get(r.owner_id);
      return {
        ...r,
        owner_email: info?.email ?? null,
        display_name: info?.name || null,
      };
    });
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user_coaches:coach:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_coaches",
        },
        (payload) => {
          // React to any row touching this coach (insert/update/delete).
          // We don't use a server-side filter because Supabase realtime
          // filters are limited and can miss UPDATEs when the unchanged
          // columns aren't replicated; instead we re-load whenever any
          // row that affects this coach changes.
          const newRow = (payload.new ?? {}) as { coach_user_id?: string };
          const oldRow = (payload.old ?? {}) as { coach_user_id?: string };
          if (newRow.coach_user_id === user.id || oldRow.coach_user_id === user.id) {
            load();
          }
        },
      )
      .subscribe();
    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // Lightweight polling fallback in case the realtime channel is dropped.
    const poll = window.setInterval(() => load(), 15000);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);


  const selected = selectedId ? rows.find((r) => r.id === selectedId) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-ink">Clients</h3>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          People who have accepted you as their coach. The access levels below are set by each
          client and show what you can do in their{" "}
          <strong className="font-semibold text-ink">Calendar</strong>,{" "}
          <strong className="font-semibold text-ink">Diary</strong> and{" "}
          <strong className="font-semibold text-ink">Photos</strong>. You can't change these — only
          the client can.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary/40">
              <th
                className="sticky left-0 z-10 min-w-[220px] border-b border-r border-hairline bg-secondary/40 px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                rowSpan={2}
              >
                Client
              </th>
              <th colSpan={2} className="border-b border-r border-hairline px-4 py-2 text-center text-xs font-medium text-ink">
                Calendar
              </th>
              <th colSpan={2} className="border-b border-r border-hairline px-4 py-2 text-center text-xs font-medium text-ink">
                Diary
              </th>
              <th colSpan={2} className="border-b border-hairline px-4 py-2 text-center text-xs font-medium text-ink">
                Photos
              </th>
            </tr>
            <tr className="bg-secondary/20">
              {(["Calendar", "Diary", "Photos"] as const).map((col, i) => (
                <SubHeaderPair key={col} last={i === 2} />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No clients yet. When someone invites you as their coach and you accept, they
                  appear here.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => {
                const displayName = r.display_name || r.owner_email || "Unnamed client";
                return (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="sticky left-0 z-10 border-r border-hairline bg-background px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedId(r.id)}
                          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
                          aria-label="View client info"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-sm text-ink">{displayName}</span>
                      </div>
                    </td>
                    <ReadOnlyPair value={r.calendar_access} />
                    <ReadOnlyPair value={r.diary_access} />
                    <ReadOnlyPair value={r.photos_access} last />
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {selected && (
        <ClientInfoModal
          name={selected.display_name || selected.owner_email || "Client"}
          email={selected.owner_email}
          calendar={selected.calendar_access}
          diary={selected.diary_access}
          photos={selected.photos_access}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function SubHeaderPair({ last }: { last?: boolean }) {
  return (
    <>
      <th className="border-b border-r border-hairline px-3 py-2 text-center text-[11px] font-normal text-muted-foreground">
        View
      </th>
      <th
        className={`border-b ${last ? "" : "border-r"} border-hairline px-3 py-2 text-center text-[11px] font-normal text-muted-foreground`}
      >
        Edit
      </th>
    </>
  );
}

function ReadOnlyPair({ value, last }: { value: Access; last?: boolean }) {
  return (
    <>
      <ReadOnlyCell active={value === "view"} />
      <ReadOnlyCell active={value === "edit"} last={last} />
    </>
  );
}

function ReadOnlyCell({ active, last }: { active: boolean; last?: boolean }) {
  return (
    <td
      className={`${last ? "" : "border-r"} border-hairline p-0`}
      style={{ width: 72, height: 56 }}
    >
      <div
        className={`flex h-full w-full items-center justify-center ${
          active ? "bg-ink text-background" : "bg-background"
        }`}
      >
        {active && <Check className="h-4 w-4" strokeWidth={2.5} />}
      </div>
    </td>
  );
}

function ClientInfoModal({
  name,
  email,
  calendar,
  diary,
  photos,
  onClose,
}: {
  name: string;
  email: string | null;
  calendar: Access;
  diary: Access;
  photos: Access;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 space-y-1">
            <h3 className="truncate text-lg font-semibold text-ink">{name}</h3>
            {email && <div className="truncate text-sm text-muted-foreground">{email}</div>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <AccessRow label="Calendar" value={calendar} />
          <AccessRow label="Diary" value={diary} />
          <AccessRow label="Photos" value={photos} />
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          Access levels are set by the client and can't be changed here.
        </p>
      </div>
    </div>
  );
}

function AccessRow({ label, value }: { label: string; value: Access }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
