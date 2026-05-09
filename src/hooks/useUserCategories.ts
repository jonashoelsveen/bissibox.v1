import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  pinned: boolean;
  hidden: boolean;
  sort_order: number;
  is_default: boolean;
  default_key: string | null;
}

export function useUserCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoaded(true);
      return;
    }
    const { data } = await supabase
      .from("calendar_categories")
      .select("id,name,color,pinned,hidden,sort_order,is_default,default_key")
      .eq("user_id", user.id)
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    setCategories((data ?? []) as UserCategory[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const ch = supabase
      .channel(`calendar-categories-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, user]);

  const create = useCallback(
    async (name: string, color: string): Promise<UserCategory | null> => {
      if (!user) return null;
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1);
      const { data, error } = await supabase
        .from("calendar_categories")
        .insert({
          user_id: user.id,
          name,
          color,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();
      if (error) return null;
      return data as UserCategory;
    },
    [user, categories],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<UserCategory, "name" | "color" | "pinned" | "hidden">>) => {
      await supabase.from("calendar_categories").update(patch).eq("id", id);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await supabase.from("calendar_categories").delete().eq("id", id);
  }, []);

  const reorder = useCallback(async (next: UserCategory[]) => {
    setCategories(next);
    await Promise.all(
      next.map((c, idx) =>
        supabase.from("calendar_categories").update({ sort_order: idx }).eq("id", c.id),
      ),
    );
  }, []);

  return { categories, loaded, create, update, remove, reorder, refetch: load };
}
