/**
 * functions/api/stocks.js
 * Inventaire — lecture et ajustement, réservés au commerçant authentifié.
 *
 * GET  /api/stocks              → inventaire complet
 * POST /api/stocks  { cle, dispo }  → fixe le stock d'une référence
 *
 * Ces deux endpoints sont aussi le point d'entrée prévu pour une future
 * synchronisation automatisée : un import de caisse appellera le même POST
 * en passant motif="sync", ce qui le distinguera d'une saisie manuelle dans
 * le journal des mouvements.
 */

import { requireGithubUser } from "../_shared/auth.js";
import { listerStocks, ajusterStock } from "../_shared/stock.js";
import { ok, bad, parseJson } from "../_shared/http.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  if (!env.STOCKS_DB) return bad("Base de stocks non configurée (binding STOCKS_DB)", 503);

  try {
    const lignes = await listerStocks(env.STOCKS_DB);
    return ok({
      stocks: lignes,
      total: lignes.length,
      ruptures: lignes.filter((l) => l.dispo <= 0).length,
      faibles:  lignes.filter((l) => l.dispo > 0 && l.dispo <= 3).length,
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
