import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Thin colored strip at the very top of the page. The profile/entity switcher
 * lives in the universal tab bar (see ProfileTab); this bar only provides
 * the brand color background.
 */
export function TopBar() {
  const { user, activeEntityId } = useAuth();
  const [activeColor, setActiveColor] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) {
      setActiveColor(null);
      return;
    }
    if (activeEntityId) {
      const { data } = await supabase
        .from("teams")
        .select("top_bar_color")
        .eq("id", activeEntityId)
        .maybeSingle();
      setActiveColor(data?.top_bar_color ?? null);
    } else {
      const { data } = await supabase
        .from("profiles")
        .select("top_bar_color")
        .eq("id", user.id)
        .maybeSingle();
      setActiveColor(data?.top_bar_color ?? null);
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

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-14"
      style={{ background: activeColor || "transparent" }}
    />
  );
}
