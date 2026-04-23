import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Target =
  | { kind: "user"; userId: string; role: "athlete" | "photographer" }
  | { kind: "team"; teamId: string }
  | { kind: "company"; companyId: string };

export function FollowButton({ target }: { target: Target }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (target.kind === "user") {
        const { data } = await supabase
          .from("user_follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("target_user_id", target.userId)
          .eq("target_role", target.role)
          .maybeSingle();
        setFollowing(!!data);
      } else if (target.kind === "team") {
        const { data } = await supabase
          .from("team_follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("team_id", target.teamId)
          .maybeSingle();
        setFollowing(!!data);
      } else {
        const { data } = await supabase
          .from("company_follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("company_id", target.companyId)
          .maybeSingle();
        setFollowing(!!data);
      }
    })();
  }, [user, target]);

  const toggle = async () => {
    if (!user) {
      nav({ to: "/auth", search: { redirect: window.location.pathname } as never });
      return;
    }
    setBusy(true);
    try {
      if (target.kind === "user") {
        if (following) {
          await supabase
            .from("user_follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("target_user_id", target.userId)
            .eq("target_role", target.role);
        } else {
          await supabase.from("user_follows").insert({
            follower_id: user.id,
            target_user_id: target.userId,
            target_role: target.role,
          });
        }
      } else if (target.kind === "team") {
        if (following) {
          await supabase
            .from("team_follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("team_id", target.teamId);
        } else {
          await supabase
            .from("team_follows")
            .insert({ follower_id: user.id, team_id: target.teamId });
        }
      } else {
        if (following) {
          await supabase
            .from("company_follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("company_id", target.companyId);
        } else {
          await supabase
            .from("company_follows")
            .insert({ follower_id: user.id, company_id: target.companyId });
        }
      }
      setFollowing((f) => !f);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        following
          ? "border border-hairline bg-card text-ink hover:bg-secondary"
          : "bg-ink text-background hover:opacity-90"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
