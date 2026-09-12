/**
 * functions/_shared/email.js
 * Resend via fetch() — pas de SDK Node necessaire dans Cloudflare Workers.
 * Si RESEND_API_KEY absent : log + no-op.
 */

const RESEND_API = "https://api.resend.com/emails";

/**
 * Extrait la phrase utile d'une erreur Resend.
 *
 * Le corps est du JSON du type
 *   { "statusCode": 403, "name": "validation_error", "message": "…" }
 * mais une panne d'infrastructure peut renvoyer du HTML : on retombe alors
 * sur le texte brut, tronqué, plutôt que d'échouer à analyser une erreur.
 */
function resumeErreur(brut) {
  try {
    const o = JSON.parse(brut);
    if (o && typeof o.message === "string") return o.message.slice(0, 300);
  } catch { /* pas du JSON : on garde le texte */ }
  return String(brut).replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function sendEmail(env, { to, subject, html, text, from, replyTo }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY absent — email non envoye. To:", to, "—", subject);
    return { stubbed: true };
  }
  const fromAddr = from || env.EMAIL_FROM || "MaisonCBDVape <noreply@maisoncbdvape.fr>";

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
    // ⚠ Le corps de la réponse fait partie de l'erreur, il n'est pas un détail.
    //
    // Cette ligne ne relayait que le code HTTP. Le 2026-09-12, un 403 a
    // renvoyé à deux causes possibles — domaine non vérifié, ou destinataire
    // interdit tant qu'aucun domaine ne l'est — qui se corrigent à des
    // endroits différents. Resend, lui, dit laquelle en toutes lettres dans
    // sa réponse, et cette phrase était jetée.
    //
    // Resend n'y renvoie jamais la clé envoyée ; remonter ce texte n'expose
    // rien. On le tronque parce qu'il finit dans `order.emails`, stocké en KV
    // et affiché dans une infobulle.
    throw new Error("Echec envoi email : " + res.status + " — " + resumeErreur(err));
  }
  return await res.json();
}

export const merchantEmail = (env) => {
  const raw = env.EMAIL_MERCHANT || null;
  if (!raw) return null;
  const addresses = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return addresses.length === 1 ? addresses[0] : addresses;
};
