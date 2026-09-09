const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

/** Display name + mailbox. Override with RESEND_FROM_EMAIL (e.g. in .env / secrets). */
export const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL")?.trim() || "Bissibox <noreply@bissibox.com>";

export async function sendEmail({
  to,
  from,
  subject,
  html,
  text,
}: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${body}`);
}
