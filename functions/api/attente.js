/**
 * functions/api/attente.js
 * Se faire prévenir du retour en stock d'un produit.
 *
 * POST /api/attente  { id, varianteLabel? , email }
 *
 * ─── Ce que cette page résout ─────────────────────────────────────────────
 * Une rupture est une vente perdue en silence : le client repart sans que
 * personne ne l'apprenne. Ces inscriptions disent au commerçant ce que ses
 * clients attendent vraiment — donc quoi recommander en priorité, information
 * qu'aucun autre écran ne lui donne.
 *
 * ⚠ La fiche produit affichait déjà « Me prévenir lors du retour en stock »
 *   sur un bouton désactivé. Une promesse que le site ne tenait pas. C'est
 *   ce point d'entrée qui la rend vraie.
 * ─────────────────────────────────────────────────────────────────────────── */

import { ok, bad, parseJson } from "../_shared/http.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";
import { resoudreStock, CATALOG } from "../_shared/catalog-index.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  // Une adresse par produit suffit : au-delà, c'est du remplissage.
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "attente", ip, { max: 10, windowSecs: 3600 })) {
    return bad("Trop de demandes. Réessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return bad("Adresse e-mail invalide");
  if (email.length > 254) return bad("Adresse e-mail trop longue");

  // La clé est reconstruite depuis le catalogue serveur, jamais reprise du
  // client : sans ça, n'importe quelle chaîne deviendrait une ligne en base.
  const id = String(body.id || "").trim();
  if (!id) return bad("Produit manquant");
  const op = resoudreStock(id, body.varianteLabel || null);
  if (!(op.cle in CATALOG) && !CATALOG[id]) {
    // `resoudreStock` retombe sur l'identifiant brut quand il ne connaît pas
    // la variante ; on refuse plutôt que d'enregistrer une clé fantôme.
    return bad("Produit inconnu");
  }

  if (!env.STOCKS_DB) return bad("Service indisponible", 503);

  try {
    // INSERT OR IGNORE : se réinscrire ne crée pas de doublon et ne renvoie
    // rien. La réponse est identique dans les deux cas — dire « vous étiez
    // déjà inscrit » révélerait à un tiers qu'une adresse attend ce produit.
    await env.STOCKS_DB
      .prepare("INSERT OR IGNORE INTO attentes (cle, email, creeLe, prevenuLe) VALUES (?1, ?2, ?3, NULL)")
      .bind(op.cle, email, Date.now())
      .run();
  } catch (err) {
    console.error("[attente] Enregistrement KO :", err.message);
    return bad("Enregistrement impossible. Réessayez plus tard.", 500);
  }

  return ok({ inscrit: true });
}
