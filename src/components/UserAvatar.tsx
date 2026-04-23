import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function UserAvatar() {
  const { user } = useAuth();
  const [letter, setLetter] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    if (!user) {
      setLetter("");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", user.id)
        .maybeSingle();
      if (cancel) return;
      const src =
        (data?.first_name && data.first_name.trim()) ||
        (data?.last_name && data.last_name.trim()) ||
        data?.email ||
        user.email ||
        "?";
      setLetter(src.charAt(0).toUpperCase());
    })();
    return () => {
      cancel = true;
    };
  }, [user]);

  return (
    <div className="fixed right-5 top-5 z-50 md:right-6 md:top-6">
      <Link
        to={user ? "/profile" : "/auth"}
        aria-label="Profile"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
      >
        {user ? letter : "?"}
      </Link>
    </div>
  );
}
