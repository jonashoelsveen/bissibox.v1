import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}

function CompanyPage() {
  const { companyId } = Route.useParams();
  const router = useRouter();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, kind, website, logo_url")
        .eq("id", companyId)
        .maybeSingle();
      if (!data) setNotFound(true);
      else setCompany(data as PublicCompany);
    })();
  }, [companyId]);

  return (
    <div className="px-4 md:px-6">
      <div className="mx-auto max-w-2xl pt-6 pr-14">
        <button
          onClick={() => router.history.back()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-card text-ink hover:bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {notFound && (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-card/40 py-14 text-center text-sm text-muted-foreground">
            Company not found.
          </div>
        )}

        {company && (
          <div className="mt-6 rounded-2xl border border-hairline bg-card p-6 md:p-8">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                {company.logo_url ? (
                  <img src={company.logo_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <Building2 className="h-6 w-6 text-ink" />
                )}
              </span>
              <div>
                <h1 className="text-2xl font-bold text-ink">{company.name}</h1>
                <div className="text-xs text-muted-foreground capitalize">{company.kind} company</div>
              </div>
            </div>
            {company.website && (
              <div className="mt-6 grid gap-3 text-sm">
                <div className="flex justify-between border-b border-hairline pb-2">
                  <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Website
                  </span>
                  <a href={company.website} target="_blank" rel="noreferrer" className="text-ink underline">
                    {company.website}
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
