import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Entity = { id: string; name: string; entity_type: "team" | "company" | "cooperation" };

const ENTITY_LABEL: Record<Entity["entity_type"], string> = {
  team: "Team",
  company: "Company",
  cooperation: "Cooperation",
};

/**
 * Leftmost fixed tab in the universal tab bar. Hosts the profile/entity
 * switcher dropdown. Width matches the page-side menu width (220px).
 */
export function ProfileTab() {
  const { user, activeEntityId, setActiveEntity } = useAuth();
  const router = useRouterState();
  const path = router.location.pathname;
  const isProfileActive =
    path.startsWith("/profile") ||
    path.startsWith("/u/") ||
    path.startsWith("/t/") ||
    path.startsWith("/c/");
  const [individualName, setIndividualName] = useState("");
  const [individualAvatar, setIndividualAvatar] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeEntityName, setActiveEntityName] = useState<string>("");
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    if (!user) {
      setIndividualName("");
      setIndividualAvatar(null);
      setEntities([]);
      return;
    }
    const [{ data: prof }, { data: ents }] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name,last_name,email,avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("teams")
        .select("id,name,entity_type")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    const name =
      [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
      prof?.email ||
      user.email ||
      "Individual";
    setIndividualName(name);
    setIndividualAvatar(prof?.avatar_url ?? null);

    const list = (ents ?? []) as Entity[];
    setEntities(list.map((e) => ({ id: e.id, name: e.name, entity_type: e.entity_type })));

    if (activeEntityId) {
      const found = list.find((e) => e.id === activeEntityId);
      setActiveEntityName(found?.name ?? "");
    } else {
      setActiveEntityName("");
    }
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("topbar-color-changed", onChange);
    return () => window.removeEventListener("topbar-color-changed", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeEntityId]);

  if (!user) return null;

  const displayName = activeEntityId ? activeEntityName || "…" : individualName;
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();
  const avatarUrl = activeEntityId ? null : individualAvatar;

  return (
    <div
      className="-mb-px relative shrink-0 select-none"
      style={{ width: 220 }}
    >
      <div className="flex h-[42px] items-center gap-2 border-b-2 border-transparent pr-2">
        <Link
          to="/profile"
          aria-label="Open profile"
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium transition-all ${
            isProfileActive
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-ink hover:bg-secondary/80"
          }`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="group flex h-8 min-w-0 flex-1 items-center justify-between pl-1 pr-1 text-left"
          aria-label="Switch profile"
        >
          <span className="truncate text-sm font-medium text-ink">{displayName}</span>
          <ChevronDown
            className="ml-1 h-4 w-4 shrink-0 text-ink/70 transition group-hover:text-ink"
            strokeWidth={2.25}
          />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-0 w-full border border-ink/15 bg-card shadow-lg">
            <button
              onClick={() => {
                setActiveEntity(null);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm transition hover:bg-secondary ${
                !activeEntityId ? "bg-secondary/60 text-ink" : "text-ink"
              }`}
            >
              <span className="truncate">{individualName || "Individual"}</span>
              <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Personal
              </span>
            </button>
            {entities.length > 0 && <div className="h-px w-full bg-hairline" />}
            {entities.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setActiveEntity(e.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between border-t border-hairline/60 px-2 py-2 text-left text-sm transition hover:bg-secondary ${
                  activeEntityId === e.id ? "bg-secondary/60 text-ink" : "text-ink"
                }`}
              >
                <span className="truncate">{e.name}</span>
                <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  {ENTITY_LABEL[e.entity_type]}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
