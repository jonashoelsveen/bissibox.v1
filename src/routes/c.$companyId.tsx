import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Image as ImageIcon, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileShell, MediaGrid } from "@/components/ProfileShell";
import { FollowButton } from "@/components/FollowButton";

export const Route = createFileRoute("/c/$companyId")({
  component: CompanyPage,
  head: () => ({ meta: [{ title: "Company · Raceline" }] }),
});

interface PublicCompany {
  id: string;
  name: string;
  kind: "timing" | "production";
  website: string | null;
  logo_url: string | null;
  description: string | null;
  cover_media_id: string | null;
}

function CompanyPage() {
  const { companyId } = Route.useParams();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"about" | "media">("about");
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [followers, setFollowers] = useState(0);
  const [media, setMedia] = useState<{ id: string; storage_path: string; media_type: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, kind, website, logo_url, description, cover_media_id")
        .eq("id", companyId)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        return;
      }
      const c = data as PublicCompany;
      setCompany(c);

      if (c.cover_media_id) {
        const { data: m } = await supabase
          .from("media_items")
          .select("storage_path")
          .eq("id", c.cover_media_id)
          .maybeSingle();
        if (m) setCoverPath(m.storage_path);
      }

      const { count } = await supabase
        .from("company_follows")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      setFollowers(count ?? 0);
    })();
  }, [companyId]);

  if (notFound) {
    return (
      <div className="px-6 pt-20 text-center text-sm text-muted-foreground">Company not found.</div>
    );
  }
  if (!company) return null;

  return (
    <ProfileShell
      coverPath={coverPath}
      fallbackInitial={company.name[0]?.toUpperCase() ?? "C"}
      eyebrow={`${company.kind} company`}
      title={company.name}
      subtitle={<span>{followers.toLocaleString()} followers</span>}
      actions={<FollowButton target={{ kind: "company", companyId }} />}
      tabs={[
        { key: "about", label: "About", icon: <Info className="h-3.5 w-3.5" /> },
        { key: "media", label: "Media", icon: <ImageIcon className="h-3.5 w-3.5" /> },
      ]}
      activeTab={tab}
      onTabChange={(k) => setTab(k as typeof tab)}
    >
      {tab === "about" && (
        <div className="rounded-2xl border border-hairline bg-card p-6 md:p-8">
          {company.description ? (
            <p className="whitespace-pre-wrap text-sm text-ink">{company.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          )}
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-primary underline-offset-2 hover:underline"
            >
              {company.website}
            </a>
          )}
        </div>
      )}

      {tab === "media" && <MediaGrid items={media} />}
    </ProfileShell>
  );
}
