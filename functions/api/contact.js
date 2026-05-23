/**
 * functions/api/contact.js
 * Recoit le formulaire de /contact/, anti-spam honeypot,
 * envoie 1 email au commercant via Resend.
 */
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { ok, bad, parseJson } from "../_shared/http.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "contact", ip, { max: 5, windowSecs: 3600 })) {
    return bad("Trop de messages envoyes. Reessayez dans une heure.", 429);
  }

  let body;
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    body = await parseJson(request);
  } else {
    const fd = await request.formData();
    body = Object.fromEntries(fd.entries());
  }
  if (!body) return bad("Corps invalide");

  if (body["bot-field"]) return ok({ stubbed: true });

  const { nom, email, sujet, message, orderId } = body;
  if (!nom || nom.length < 2) return bad("Nom invalide");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Email invalide");
  if (!sujet || sujet.length > 200) return bad("Sujet requis (200 caracteres max)");
  if (!message || message.length < 10) return bad("Message trop court");
  if (message.length > 5000) return bad("Message trop long (5000 caracteres max)");

  const merchant = merchantEmail(env);
  if (!merchant) return bad("EMAIL_MERCHANT non configure cote serveur", 500);

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = "<h2>Nouveau message de contact</h2>"
    + "<p><strong>De :</strong> " + esc(nom) + " &lt;" + esc(email) + "&gt;</p>"
    + "<p><strong>Sujet :</strong> " + esc(sujet) + "</p>"
    + (orderId ? "<p><strong>Commande :</strong> " + esc(orderId) + "</p>" : "")
    + "<hr/><pre style=\"white-space:pre-wrap;font-family:inherit;\">" + esc(message) + "</pre>";

  const text = "De : " + nom + " <" + email + ">\nSujet : " + sujet + (orderId ? "\nCommande : " + orderId : "") + "\n\n" + message;

  await sendEmail(env, {
    to: merchant,
    subject: "[Contact Tabac Gex] " + sujet,
    html,
    text,
    replyTo: nom + " <" + email + ">",
  });

  return ok({ sent: true });
}
