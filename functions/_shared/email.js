/**
 * functions/_shared/email.js
 * Resend via fetch() — pas de SDK Node necessaire dans Cloudflare Workers.
 * Si RESEND_API_KEY absent : log + no-op.
 */

const RESEND_API = "https://api.resend.com/emails";

export async function sendEmail(env, { to, subject, html, text, from, replyTo }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY absent — email non envoye. To:", to, "—", subject);
    return { stubbed: true };
  }
  const fromAddr = from || env.EMAIL_FROM || "VapeLab <noreply@vapelab.fr>";

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddr,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[email] Resend a echoue :", res.status, err);
    throw new Error("Echec envoi email : " + res.status);
  }
  return await res.json();
}

export const merchantEmail = (env) => {
  const raw = env.EMAIL_MERCHANT || null;
  if (!raw) return null;
  const addresses = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return addresses.length === 1 ? addresses[0] : addresses;
};
