import { createFileRoute } from "@tanstack/react-router";
import {
  buildCookieHeader,
  buildSessionPayload,
  sealSession,
  unsealSsoTransfer,
} from "@/lib/auth-cookie.server";
import { getAccountUrlFromRequest } from "@/lib/app-surface";

/** Complete cross-domain SSO — sets `bissibox_session` on the account host. */
export const Route = createFileRoute("/api/auth/sso/redeem")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const landing = getAccountUrlFromRequest(request);
        const url = new URL(request.url);
        const transferToken = url.searchParams.get("t");
        const transfer = unsealSsoTransfer(transferToken);
        if (!transfer) {
          return Response.redirect(landing, 302);
        }

        const requestHost = url.host;
        const sessionCookie = sealSession(
          buildSessionPayload({
            userId: transfer.user_id,
            refreshToken: transfer.refresh_token,
            accessToken: transfer.access_token,
            expiresAt: transfer.expires_at,
          }),
        );

        const destination = new URL("/me", `${url.protocol}//${requestHost}`).toString();
        return new Response(null, {
          status: 302,
          headers: {
            Location: destination,
            "Set-Cookie": buildCookieHeader(sessionCookie, { requestHost }),
          },
        });
      },
    },
  },
});
