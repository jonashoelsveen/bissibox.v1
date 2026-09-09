import { createFileRoute } from "@tanstack/react-router";
import { CloudReadMorePage, parseCloudSignInSearch } from "@/components/CloudLandingSection";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

export const Route = createFileRoute("/cloud/individuals")({
  component: CloudIndividualsPage,
  validateSearch: parseCloudSignInSearch,
  head: () => ({
    meta: [{ title: "Bissibox for individuals" }],
  }),
});

function CloudIndividualsPage() {
  return (
    <CloudPageWithFooter showLegalLinks={false} style={{ fontFamily: HELVETICA_STACK }}>
      <CloudReadMorePage title="Bissibox">
        <p>
          </p>
            <p>
            </p>
                <p>
                Bissibox is an intuitive calendar that helps you organize your every day life. With an overview of future activities you are always prepared. 
                
                </p>
                  <p>

                  </p>
      </CloudReadMorePage>
    </CloudPageWithFooter>
  );
}
