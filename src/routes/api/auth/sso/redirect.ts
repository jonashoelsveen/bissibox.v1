import { createFileRoute } from "@tanstack/react-router";
import {
  readCookieFromHeader,
  sealSsoTransfer,
  unsealSession,
} from "@/lib/auth-cookie.server";
import { getAccountSsoRedeemUrl, getAccountUrlFromRequest } from "@/lib/app-surface";

/** Start cross-domain SSO: cloud origin → short-lived transfer → account origin. */
export const Route = createFileRoute("/api/auth/sso/redirect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const accountLanding = getAccountUrlFromRequest(request);
        const cookie = readCookieFromHeader(request.headers.get("cookie"));
        const sealed = unsealSession(cookie);
        if (!sealed) {
          return Response.redirect(accountLanding, 302);
        }

        // Copy the existing tokens — do not rotate. A refresh here
        // invalidates Cloud's session, so the Cloud tab looks signed out.
        const transfer = sealSsoTransfer({
          refresh_token: sealed.refresh_token,
          user_id: sealed.user_id,
          access_token: sealed.access_token,
          expires_at: sealed.expires_at,
        });
        const accountBase = getAccountUrlFromRequest(request);
        return Response.redirect(getAccountSsoRedeemUrl(transfer, accountBase), 302);
      },
    },
  },
});
