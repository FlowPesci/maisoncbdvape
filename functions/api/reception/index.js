/**
 * functions/api/reception/index.js
 * GET /api/reception — de quoi faire vivre l'écran de réception.
 *
 * Renvoie le catalogue réceptionnable (pour l'autocomplétion de la saisie
 * manuelle) et l'historique des derniers bons traités.
 */

import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad } from "../../_shared/http.js";
import { REFERENCES } from "../../_shared/catalog-index.js";
import { listerReceptions } from "../../_shared/stock.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  let historique = [];
  try {
    if (env.STOCKS_DB) historique = await listerReceptions(env.STOCKS_DB, 15);
  } catch (err) {
    console.error("[reception] Historique illisible :", err.message);
  }

  return ok({
    references: REFERENCES.map((r) => ({
      cle: r.cle, nom: r.nom, marque: r.marque, categorie: r.categorie, unite: r.unite,
    })),
    historique,
    lectureDisponible: Boolean(env.AI),
  });
}
