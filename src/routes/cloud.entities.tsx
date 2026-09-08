import { createFileRoute } from "@tanstack/react-router";
import { CloudReadMorePage, parseCloudSignInSearch } from "@/components/CloudLandingSection";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import { HELVETICA_STACK, LANDING_DARK_SECTION_BG } from "@/lib/cloud-landing-design";
import { entityFeatureRouteGuard } from "@/lib/entity-route";

export const Route = createFileRoute("/cloud/entities")({
  beforeLoad: () => {
    /** Entities read-more page — Bucket A: currently live, hidden this round. */
    entityFeatureRouteGuard("entityMarketing", "/");
  },
  validateSearch: parseCloudSignInSearch,
  component: CloudEntitiesPage,
  head: () => ({
    meta: [{ title: "Aponna Cloud for entities" }],
  }),
});

function CloudEntitiesPage() {
  return (
    <CloudPageWithFooter
      style={{ fontFamily: HELVETICA_STACK, backgroundColor: LANDING_DARK_SECTION_BG }}
    >
      <CloudReadMorePage
        title="Aponna Cloud for entities"
        illustrationSrc="/aponna-cloud-entities-info.png"
        illustrationWidth={810}
        illustrationHeight={926}
        illustrationScale={0.7}
        onDark
      >
        <p>
        </p>
        <p>
          Aponna Cloud for entities is an intuitive platform for organizing your
          team&apos;s members and plan. Organize your entity in groups and keep an overview of all members.
          The calendar helps the members
          to keep up with and stay prepared for future activities and events. Enable
          sign up to see who&apos;s attending the activity.
        </p>
      </CloudReadMorePage>
    </CloudPageWithFooter>
  );
}
