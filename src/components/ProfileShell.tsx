import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
}

export function ProfileShell({
  coverPath,
  fallbackInitial,
  eyebrow,
  title,
  subtitle,
  actions,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  coverPath: string | null;
  fallbackInitial: string;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (k: string) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!coverPath) {
      setCoverUrl(null);
      return;
    }
    void supabase.storage
      .from("media")
      .createSignedUrl(coverPath, 3600)
      .then(({ data }) => {
        if (active) setCoverUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [coverPath]);

  return (
    <div>
      {/* Cover */}
      <div className="relative h-[340px] w-full overflow-hidden md:h-[400px]">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 via-secondary to-background">
            <span className="text-7xl font-black uppercase text-ink/30">{fallbackInitial}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-background" />

        <button
          onClick={() => router.history.back()}
          className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 md:px-10 md:pb-8">
          <p className="mono text-[10px] uppercase tracking-[0.25em] text-white/80">{eyebrow}</p>
          <h1 className="mt-1 text-4xl font-black leading-tight text-white drop-shadow md:text-6xl">
            {title}
          </h1>
          {subtitle && <div className="mt-2 text-sm text-white/85">{subtitle}</div>}
        </div>
      </div>

      <div className="px-6 md:px-10">
        {actions && <div className="mt-4 flex items-center gap-2">{actions}</div>}

        <nav className="mt-5 flex border-b border-hairline">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
                activeTab === t.key
                  ? "border-primary text-ink"
                  : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="py-6">{children}</div>
      </div>
    </div>
  );
}

export function MediaGrid({ items }: { items: Array<{ id: string; storage_path: string; media_type: string }> }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const it of items) {
        const { data } = await supabase.storage.from("media").createSignedUrl(it.storage_path, 3600);
        if (data?.signedUrl) next[it.id] = data.signedUrl;
      }
      if (active) setUrls(next);
    })();
    return () => {
      active = false;
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-16 text-center text-sm text-muted-foreground">
        No content yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.id} className="aspect-square overflow-hidden rounded-sm bg-secondary">
          {it.media_type === "photo" ? (
            urls[it.id] && <img src={urls[it.id]} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={urls[it.id]} className="h-full w-full object-cover" muted />
          )}
        </div>
      ))}
    </div>
  );
}
