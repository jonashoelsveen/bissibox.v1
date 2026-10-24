import { createFileRoute } from "@tanstack/react-router";
import { CloudReadMorePage } from "@/components/CloudLandingSection";
import { CloudPageWithFooter } from "@/components/CloudFooter";
import { accountRouteGuard } from "@/lib/account-route";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ context }) => accountRouteGuard({ context }),
  component: AccountReadMorePage,
  head: () => ({
    meta: [
      { title: "Account" },
      {
        name: "description",
        content: "Your identity across the Bissibox platform.",
      },
    ],
  }),
});

function AccountReadMorePage() {
  return (
    <CloudPageWithFooter showLegalLinks={false} style={{ fontFamily: HELVETICA_STACK }}>
      <CloudReadMorePage title="Bissibox-account">
        <p>
          Bissibox-account is your key to the Bissibox platform. Here, you can
          create a username and manage your email and password.
        </p>
      </CloudReadMorePage>
    </CloudPageWithFooter>
  );
}
