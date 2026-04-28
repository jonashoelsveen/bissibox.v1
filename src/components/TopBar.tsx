import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Entity = { id: string; name: string; entity_type: "team" | "company" | "cooperation" };

const ENTITY_LABEL: Record<Entity["entity_type"], string> = {
  team: "Team",
  company: "Company",
  cooperation: "Cooperation",
};

export function TopBar() {
  const { user, activeEntityId, setActiveEntity } = useAuth();
  const [individualName, setIndividualName] = useState("");
  const [individualAvatar, setIndividualAvatar] = useState<string | null>(null);
  const [individualColor, setIndividualColor] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeEntityName, setActiveEntityName] = useState<string>("");
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Load individual profile + entity list
  const refresh = async () => {
    if (!user) {
      setIndividualName("");
      setIndividualAvatar(null);
      setIndividualColor(null);
      setEntities([]);
      setActiveColor(null);
      return;
    }
    const [{ data: prof }, { data: ents }] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name,last_name,email,avatar_url,top_bar_color")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("teams")
        .select("id,name,entity_type,top_bar_color")
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
    setIndividualColor(prof?.top_bar_color ?? null);

    const list = (ents ?? []) as Array<Entity & { top_bar_color: string | null }>;
    setEntities(list.map((e) => ({ id: e.id, name: e.name, entity_type: e.entity_type })));

    if (activeEntityId) {
      const found = list.find((e) => e.id === activeEntityId);
      setActiveEntityName(found?.name ?? "");
      setActiveColor(found?.top_bar_color ?? null);
    } else {
      setActiveEntityName("");
      setActiveColor(prof?.top_bar_color ?? null);
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
  const bgColor = activeColor || "transparent";
  const avatarUrl = activeEntityId ? null : individualAvatar; // entity logo not yet wired

  return (
    <div
      className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center pl-20 pr-6 md:pl-24"
      style={{ background: bgColor }}
    >
      <div className="relative flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="group flex items-center gap-2.5"
          aria-label="Switch profile"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-medium text-ink ring-1 ring-black/5">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <span className="text-sm font-medium text-ink">{displayName}</span>
          <ChevronDown className="h-4 w-4 text-ink/70 transition group-hover:text-ink" strokeWidth={2.25} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-40 mt-2 w-64 border border-ink/15 bg-card shadow-lg">
              <button
                onClick={() => {
                  setActiveEntity(null);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-secondary ${
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
                  className={`flex w-full items-center justify-between border-t border-hairline/60 px-3 py-2 text-left text-sm transition hover:bg-secondary ${
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
    </div>
  );
}
