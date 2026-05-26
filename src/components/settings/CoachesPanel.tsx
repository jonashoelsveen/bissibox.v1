import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Plus, Pencil, Check, ChevronLeft, Trash2, X } from "lucide-react";

type Access = "view" | "edit";

interface CoachRow {
  id: string;
  coach_email: string;
  coach_user_id: string | null;
  status: "pending" | "accepted";
  calendar_access: Access;
  diary_access: Access;
  photos_access: Access;
  // resolved display info
  display_name?: string | null;
}

export interface CoachesPanelHandle {
  isDirty: () => boolean;
  save: () => Promise<boolean>;
}

interface Props {
  onDirtyChange?: (dirty: boolean) => void;
}

export const CoachesPanel = forwardRef<CoachesPanelHandle, Props>(function CoachesPanel(
  { onDirtyChange },
  ref,
) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [baseline, setBaseline] = useState<string>("[]");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null);
  const saveVersionRef = useRef(0);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_coaches")
      .select(
        "id, coach_email, coach_user_id, status, calendar_access, diary_access, photos_access",
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as CoachRow[];

    // Resolve coach display names for accepted rows
    const ids = list.map((r) => r.coach_user_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", ids);
      const nameMap = new Map<string, string>();
      for (const p of profs ?? []) {
        const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        nameMap.set(p.id, n);
      }
      for (const r of list) {
        if (r.coach_user_id) r.display_name = nameMap.get(r.coach_user_id) || null;
      }
    }
    setRows(list);
    setBaseline(JSON.stringify(list.map(serialize)));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-refresh when the coach accepts elsewhere:
  // 1) realtime updates to this owner's user_coaches rows
  // 2) window focus / tab visible (covers offline acceptance)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user_coaches:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_coaches",
          filter: `owner_id=eq.${user.id}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    const onFocus = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!rows.length) return;
    setSelectedCoachId((current) =>
      current && rows.some((row) => row.id === current) ? current : null,
    );
  }, [rows]);

  const serialize = (r: CoachRow) =>
    `${r.id}:${r.calendar_access}:${r.diary_access}:${r.photos_access}`;

  const currentDirtyKey = useMemo(() => JSON.stringify(rows.map(serialize)), [rows]);
  const isDirty = currentDirtyKey !== baseline;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    isDirty: () => isDirty,
    save: async () => {
      if (!user) return false;
      const baselineParsed: string[] = JSON.parse(baseline);
      const baseMap = new Map(
        baselineParsed.map((s) => {
          const [id, c, d, p] = s.split(":");
          return [id, { c, d, p }];
        }),
      );
      const changed = rows.filter((r) => {
        const b = baseMap.get(r.id);
        return !b || b.c !== r.calendar_access || b.d !== r.diary_access || b.p !== r.photos_access;
      });
      if (!changed.length) return true;
      for (const r of changed) {
        const { error } = await supabase
          .from("user_coaches")
          .update({
            calendar_access: r.calendar_access,
            diary_access: r.diary_access,
            photos_access: r.photos_access,
          })
          .eq("id", r.id);
        if (error) {
          toast.error(error.message);
          return false;
        }
      }
      setBaseline(JSON.stringify(rows.map(serialize)));
      return true;
    },
  }));

  const setAccess = async (rowId: string, col: "calendar" | "diary" | "photos", value: Access) => {
    if (!user) return;

    const previousRows = rows;
    const currentRow = previousRows.find((r) => r.id === rowId);
    if (!currentRow) return;

    const key = `${col}_access` as "calendar_access" | "diary_access" | "photos_access";
    if (currentRow[key] === value) return;

    const nextRows = previousRows.map((r) =>
      r.id === rowId
        ? {
            ...r,
            [key]: value,
          }
        : r,
    );

    setRows(nextRows);

    const saveVersion = ++saveVersionRef.current;
    const updates =
      key === "calendar_access"
        ? { calendar_access: value }
        : key === "diary_access"
          ? { diary_access: value }
          : { photos_access: value };

    const { error } = await supabase
      .from("user_coaches")
      .update(updates)
      .eq("id", rowId)
      .eq("owner_id", user.id);

    if (error) {
      setRows(previousRows);
      toast.error(error.message);
      return;
    }

    if (saveVersionRef.current === saveVersion) {
      setBaseline(JSON.stringify(nextRows.map(serialize)));
    }
  };

  const sendInvitation = async () => {
    if (!user) return;
    const email = addEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email.");
      return;
    }
    if (email === (user.email || "").toLowerCase()) {
      toast.error("You cannot invite yourself as a coach.");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("coach-invite", {
      body: { coach_email: email },
    });
    setAdding(false);
    let errMsg: string | null = null;
    if (error) {
      // FunctionsHttpError exposes a Response on `context`
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          errMsg = body?.error || body?.message || null;
        } catch {
          /* ignore */
        }
      }
      errMsg = errMsg || error.message;
    } else if (!data?.ok) {
      errMsg = data?.error || "Could not send invitation.";
    }
    if (errMsg) {
      toast.error(errMsg);
      return;
    }
    toast.success(`Invitation sent to ${email}.`);
    setAddEmail("");
    setAddOpen(false);
    await load();
  };

  const deleteCoach = async (id: string) => {
    if (!confirm("Remove this coach?")) return;
    const { error } = await supabase.from("user_coaches").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Coach removed.");
    setSelectedCoachId(null);
    await load();
  };

  const selectedCoach = selectedCoachId ? rows.find((r) => r.id === selectedCoachId) : null;

  if (selectedCoach) {
    const displayName =
      selectedCoach.status === "pending"
        ? selectedCoach.coach_email
        : selectedCoach.display_name || selectedCoach.coach_email;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedCoachId(null)}
            className="rounded-md p-1 text-muted-foreground transition hover:text-ink"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base text-muted-foreground">
            Coaches <span className="mx-1">·</span>{" "}
            <span className="font-semibold text-ink">{displayName}</span>
          </h2>
        </div>

        <div className="rounded-xl border border-hairline bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-ink">{displayName}</h3>
              <div className="text-sm text-muted-foreground">{selectedCoach.coach_email}</div>
              {selectedCoach.status === "pending" && (
                <div className="text-xs text-muted-foreground">Invitation pending</div>
              )}
            </div>
            <button
              onClick={() => deleteCoach(selectedCoach.id)}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              aria-label="Delete coach"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-ink">Coaches</h3>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Manage your coaches and determine their access to your data. You can choose access level
          "View" or "Edit". "View" means the coach can only view your calendar, diary and photos
          page, without editing. "Edit" means the coach can add sessions to your{" "}
          <strong className="font-semibold text-ink">Calendar</strong>, add day-comments to and
          session-comments to <strong className="font-semibold text-ink">Diary</strong>. They are
          not able to edit any content in <strong className="font-semibold text-ink">Photos</strong>
          .
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-xs font-medium text-background transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add coach
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary/40">
              <th
                className="sticky left-0 z-10 min-w-[220px] border-b border-r border-hairline bg-secondary/40 px-4 py-3 text-left text-xs font-medium text-muted-foreground"
                rowSpan={2}
              >
                Coach
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-hairline px-4 py-2 text-center text-xs font-medium text-ink"
              >
                Calendar
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-hairline px-4 py-2 text-center text-xs font-medium text-ink"
              >
                Diary
              </th>
              <th
                colSpan={2}
                className="border-b border-hairline px-4 py-2 text-center text-xs font-medium text-ink"
              >
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
                  No coaches yet. Click "Add coach" to invite one.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => {
                const isPending = r.status === "pending";
                const displayName = isPending ? r.coach_email : r.display_name || r.coach_email;
                return (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="sticky left-0 z-10 border-r border-hairline bg-background px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedCoachId(r.id)}
                          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
                          aria-label="Edit coach"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={
                            isPending ? "text-sm text-muted-foreground" : "text-sm text-ink"
                          }
                        >
                          {displayName}
                          {isPending && (
                            <span className="ml-2 text-xs text-muted-foreground">(pending)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <AccessCellPair
                      value={r.calendar_access}
                      onChange={(v) => setAccess(r.id, "calendar", v)}
                      disabled={isPending}
                    />
                    <AccessCellPair
                      value={r.diary_access}
                      onChange={(v) => setAccess(r.id, "diary", v)}
                      disabled={isPending}
                    />
                    <AccessCellPair
                      value={r.photos_access}
                      onChange={(v) => setAccess(r.id, "photos", v)}
                      disabled={isPending}
                      last
                    />
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddCoachModal
          email={addEmail}
          setEmail={setAddEmail}
          onCancel={() => {
            setAddOpen(false);
            setAddEmail("");
          }}
          onSend={sendInvitation}
          sending={adding}
        />
      )}
    </div>
  );
});

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

function AccessCellPair({
  value,
  onChange,
  disabled,
  last,
}: {
  value: Access;
  onChange: (v: Access) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <>
      <AccessCell active={value === "view"} disabled={disabled} onClick={() => onChange("view")} />
      <AccessCell
        active={value === "edit"}
        disabled={disabled}
        onClick={() => onChange("edit")}
        last={last}
      />
    </>
  );
}

function AccessCell({
  active,
  onClick,
  disabled,
  last,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <td
      className={`${last ? "" : "border-r"} border-hairline p-0`}
      style={{ width: 72, height: 56 }}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`flex h-full w-full items-center justify-center transition ${
          active ? "bg-ink text-background" : "bg-background hover:bg-secondary/40"
        } ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
      >
        {active && <Check className="h-4 w-4" strokeWidth={2.5} />}
      </button>
    </td>
  );
}

function AddCoachModal({
  email,
  setEmail,
  onCancel,
  onSend,
  sending,
}: {
  email: string;
  setEmail: (v: string) => void;
  onCancel: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-hairline bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Add coach</h2>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground transition hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@example.com"
            autoFocus
            className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none transition focus:border-ink"
          />
        </div>
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onCancel}
            className="rounded-md border border-hairline px-4 py-2 text-xs font-medium text-muted-foreground transition hover:border-ink hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={sending}
            className="rounded-md bg-ink px-4 py-2 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
