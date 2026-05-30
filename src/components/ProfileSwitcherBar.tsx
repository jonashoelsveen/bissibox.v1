/**
 * ProfileSwitcherBar — leftmost slot in the global top tab bar.
 * Renders only the avatar (ProfileMenuButton) within the rail width.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ProfileMenuButton } from "@/components/ProfileMenuButton";

type Entity = { id: string; name: string; entity_type: "team" | "company" | "cooperation" };

const RAIL_WIDTH = 256;

export function ProfileSwitcherBar() {
  const { user } = useAuth();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [, setIndividualName] = useState("");
  const [, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: ents }] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name,last_name,email")
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
      setEntities((ents ?? []) as Entity[]);
    })();
  }, [user]);

  if (!user) return null;

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      style={{ width: RAIL_WIDTH, height: 38, marginBottom: -1, paddingBottom: 1 }}
    >
      <div className="flex items-center gap-1 pl-2">
        <ProfileMenuButton hideChangeProfile align="left" />
      </div>
    </div>
  );
}
