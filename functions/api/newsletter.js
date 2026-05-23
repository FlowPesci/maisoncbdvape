/**
 * functions/api/newsletter.js
 * POST { email } => inscrit a la newsletter (KV) + email de bienvenue.
 * Cle KV : "newsletter:<email>"
 */
import { ok, bad, parseJson } from "../_shared/http.js";
import { sendEmail } from "../_shared/email.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  // Rate limiting : 5 inscriptions par heure par IP.
  // Protege l'enumeration d'emails (already vs subscribed) et le spam KV/Resend.
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "newsletter", ip, { max: 5, windowSecs: 3600 })) {
    return bad("Trop de tentatives. Reessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return bad("Email invalide");
  if (email.length > 254) return bad("Email trop long");

  if (!env.ORDERS_KV) return bad("Stockage non configure", 500);

  const key = "newsletter:" + email;

  const existing = await env.ORDERS_KV.get(key);
  if (existing) return ok({ already: true });

  await env.ORDERS_KV.put(key, JSON.stringify({
    email,
    subscribedAt: new Date().toISOString(),
  }));

  try {
    await sendEmail(env, {
      to: email,
      subject: "Bienvenue chez Tabac Gex !",
      html: "<div style=\"font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a2e;\">"
        + "<h2 style=\"color:#39FF14;font-size:1.5rem;margin-bottom:0.5rem;\">Inscription confirmee</h2>"
        + "<p>Bienvenue ! Vous recevrez desormais nos bons plans, nouveautes et offres exclusives en avant-premiere.</p>"
        + "<p style=\"margin-top:1.5rem;font-size:0.8rem;color:#888;\">Tabac Gex &middot; 48 Rue de Geneve, 01170 Gex<br>"
        + "Pour vous desinscrire, repondez a cet email avec \"Desinscription\".</p></div>",
      text: "Bienvenue chez Tabac Gex ! Vous etes bien inscrit(e) a notre newsletter.",
    });
  } catch {
    // L'inscription est enregistree meme si l'email echoue
  }

  return ok({ subscribed: true });
}
