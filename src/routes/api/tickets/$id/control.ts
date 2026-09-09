import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { buildTicketControlPayload } from "@/lib/ticket-control.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

type TicketRow = {
  id: string;
  status: string;
  paid: boolean;
};

/**
 * GET /api/tickets/:id/control
 *
 * Returns a time-locked visual control payload for conductor inspection.
 * - Real tickets: must be status=active and paid=true.
 * - Missing ticket row: draft/preview fallback (Tickets tab Inspection).
 */
export const Route = createFileRoute("/api/tickets/$id/control")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const started = performance.now();
        const ticketId = String(params.id ?? "").trim();
        if (!ticketId) {
          return json({ error: "Missing ticket id" }, 400);
        }

        const admin = await getSupabaseAdminOrNull();
        if (admin) {
          // Table may be ahead of generated Database types until types are regenerated.
          const { data, error } = await (admin as unknown as {
            from: (t: string) => {
              select: (cols: string) => {
                eq: (col: string, val: string) => {
                  maybeSingle: () => Promise<{
                    data: TicketRow | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          })
            .from("tickets")
            .select("id, status, paid")
            .eq("id", ticketId)
            .maybeSingle();

          if (
            error &&
            !/relation .*tickets.* does not exist|Could not find the table/i.test(
              error.message,
            )
          ) {
            console.error("[ticket-control] lookup failed:", error.message);
            return json({ error: "Ticket lookup failed" }, 503);
          }

          if (data) {
            if (data.status !== "active" || data.paid !== true) {
              return json(
                { error: "Ticket is not active and paid", code: "ticket_inactive" },
                403,
              );
            }
          }
          // No row → draft/preview fallback below.
        }

        const payload = buildTicketControlPayload(ticketId);
        const elapsed = performance.now() - started;
        if (elapsed > 40) {
          console.warn(`[ticket-control] slow ${elapsed.toFixed(1)}ms for ${ticketId}`);
        }

        return json(payload);
      },
    },
  },
});
