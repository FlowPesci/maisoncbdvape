/**
 * functions/api/stocks.js
 * Inventaire — lecture et ajustement, réservés au commerçant authentifié.
 *
 * GET  /api/stocks                        → inventaire complet
 * POST /api/stocks  { cle, dispo }        → fixe le stock d'une référence
 * POST /api/stocks  { ajustements: [ … ] } → fixe un inventaire entier
 *
 * Les deux formes du POST se distinguent par la présence de `ajustements`.
 * La forme groupée existe pour la saisie d'inventaire, où 121 requêtes
 * successives laisseraient un état à moitié écrit en cas de coupure.
 *
 * Ces deux endpoints sont aussi le point d'entrée prévu pour une future
 * synchronisation automatisée : un import de caisse appellera le même POST
 * en passant motif="sync", ce qui le distinguera d'une saisie manuelle dans
 * le journal des mouvements.
 */

import { requireGithubUser } from "../_shared/auth.js";
import { listerStocks, ajusterStock, ajusterStocks } from "../_shared/stock.js";
import { ok, bad, parseJson, jsonResponse } from "../_shared/http.js";
import { prevenirAttentes, listerAttentes } from "../_shared/attentes.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  if (!env.STOCKS_DB) return bad("Base de stocks non configurée (binding STOCKS_DB)", 503);

  try {
    const lignes = await listerStocks(env.STOCKS_DB);

    // Ce que les clients réclament. Silencieux si la table n'existe pas
    // encore : l'inventaire doit rester consultable avant la migration.
    let attentes = [];
    try { attentes = await listerAttentes(env.STOCKS_DB); }
    catch (e) { console.warn("[stocks] Attentes indisponibles :", e.message); }

    return ok({
      stocks: lignes,
      attentes,
      total: lignes.length,
      ruptures: lignes.filter((l) => l.dispo <= 0).length,
      // `faible` est calculé par ligne, en tenant compte de son unité : un
      // seuil unique alerterait trop tard sur les fleurs au gramme.
      faibles:  lignes.filter((l) => l.faible).length,
    });
  } catch (err) {
    return bad("Lecture des stocks impossible : " + err.message, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  if (!env.STOCKS_DB) return bad("Base de stocks non configurée (binding STOCKS_DB)", 503);

  const body = await parseJson(request);

  // Forme groupée — saisie d'inventaire.
  if (Array.isArray(body?.ajustements)) {
    try {
      const r = await ajusterStocks(env.STOCKS_DB, body.ajustements, {
        auteur: auth.user.login || auth.user.email,
        motif:  body.motif === "sync" ? "sync" : "inventaire",
      });
      // 409 plutôt que 400 : la demande est bien formée, c'est l'état de la
      // page qui a divergé de celui de la base. L'écran sait alors qu'il doit
      // se recharger plutôt qu'inviter à corriger une saisie.
      if (!r.ok) return jsonResponse(r.inconnues ? 409 : 400, { error: r.erreur, inconnues: r.inconnues });

      // Une saisie d'inventaire peut faire repasser une référence au-dessus
      // de zéro : ceux qui l'attendaient méritent d'être prévenus, au même
      // titre que si elle était revenue par un bon de livraison.
      const prevenus = await prevenirAttentes(env, body.ajustements.map((a) => a?.cle).filter(Boolean));
      return ok({ ...r, prevenus });
    } catch (err) {
      return bad("Enregistrement groupé impossible : " + err.message, 500);
    }
  }

  if (!body?.cle) return bad("Référence manquante");

  const n = Number(body.dispo);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return bad("La quantité doit être un entier positif ou nul");
  }

  try {
    const r = await ajusterStock(env.STOCKS_DB, String(body.cle), n, {
      auteur: auth.user.login || auth.user.email,
      motif:  body.motif === "sync" ? "sync" : "ajustement",
    });
    if (!r.ok) return bad(r.erreur, 404);
    return ok(r);
  } catch (err) {
    return bad("Ajustement impossible : " + err.message, 500);
  }
}
