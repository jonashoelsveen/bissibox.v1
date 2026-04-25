import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link as LinkIcon, Pencil, Check, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Tab {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface WebsiteConfig {
  url: string | null;
  canEdit: boolean;
  onSave?: (url: string | null) => Promise<void> | void;
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
  website,
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
  website?: WebsiteConfig;
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

        <nav className="mt-5 flex items-center justify-between gap-4 border-b border-hairline">
          <div className="flex">
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
          </div>
          {website && <WebsiteBox website={website} />}
        </nav>

        <div className="py-6">{children}</div>
      </div>
    </div>
  );
}

function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function WebsiteBox({ website }: { website: WebsiteConfig }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(website.url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(website.url ?? "");
  }, [website.url]);

  if (editing && website.canEdit) {
    return (
      <div className="mb-2 flex items-center gap-1 rounded-full border border-hairline bg-card pl-3 pr-1 py-1">
        <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 200))}
          placeholder="example.com"
          className="w-44 bg-transparent text-xs text-ink outline-none placeholder:text-muted-foreground"
        />
        <button
          disabled={saving}
          onClick={async () => {
            if (!website.onSave) return;
            setSaving(true);
            try {
              await website.onSave(normalizeUrl(draft));
              setEditing(false);
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-primary hover:bg-secondary"
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => {
            setDraft(website.url ?? "");
            setEditing(false);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (!website.url) {
    if (!website.canEdit) return null;
    return (
      <button
        onClick={() => setEditing(true)}
        className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline px-3 py-1.5 text-xs text-muted-foreground hover:text-ink"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        Add website
      </button>
    );
  }

  return (
    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-3 py-1.5 text-xs">
      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
      <a
        href={website.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink hover:underline"
      >
        {displayHost(website.url)}
      </a>
      {website.canEdit && (
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit website"
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-ink"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
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
