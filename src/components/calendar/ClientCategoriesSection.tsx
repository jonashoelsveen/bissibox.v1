/**
 * ClientCategoriesSection — left-rail section shown to a coach when they
 * are viewing a client's calendar on /clients.
 *
 * Lists the client's personal calendar categories so the coach always sees
 * the full set, regardless of the access level (view or edit) the client
 * has granted. The section header shows the client's display name (same
 * slot the "Me" header occupies in the individual calendar's side-nav).
 * Toggling a row hides/shows that category's events in the grid by
 * updating the local `hiddenColors` set exposed by the parent.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface ClientCategory {
  id: string;
  name: string;
  color: string;
}

export function ClientCategoriesSection({
  clientUserId,
  displayName,
  hiddenColors,
  onToggleHidden,
}: {
  clientUserId: string;
  displayName: string;
  hiddenColors: Set<string>;
  onToggleHidden: (color: string) => void;
}) {
  const { user } = useAuth();
  const [cats, setCats] = useState<ClientCategory[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data: rows } = await supabase
        .from("calendar_categories")
        .select("id, name, color, sort_order, pinned")
        .eq("user_id", clientUserId)
        .is("team_id", null)
        .eq("kind", "calendar")
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setCats(
        (rows ?? []).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          color: r.color as string,
        })),
      );
    };

    void load();

    const ch = supabase
      .channel(`client-cats:${clientUserId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_categories",
          filter: `user_id=eq.${clientUserId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [user, clientUserId]);

  return (
    <div className="flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm transition hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-90" : ""
            }`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{displayName}</span>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{
          height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: open ? 0.18 : 0.12, ease: "easeOut", delay: open ? 0.04 : 0 },
        }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
          {cats.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              No categories yet.
            </div>
          ) : (
            cats.map((c) => {
              const key = c.color.toLowerCase();
              const hidden = hiddenColors.has(key);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggleHidden(key)}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-secondary/60 ${
                    hidden ? "text-muted-foreground" : "text-ink"
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-hairline"
                    style={{ background: c.color, opacity: hidden ? 0.35 : 1 }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
