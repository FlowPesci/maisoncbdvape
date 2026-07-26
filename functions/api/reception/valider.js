/**
 * functions/api/reception/valider.js
 * POST /api/reception/valider — applique une réception au stock.
 *
 * Seule voie d'entrée de marchandise. Ce qui est appliqué est ce que le
 * commerçant a validé à l'écran, pas ce que le modèle avait proposé : les
 * lignes arrivent ici après correction, et chaque clé est revérifiée contre
 * le catalogue serveur avant d'être écrite.
 *
 * Corps attendu :
 *   {
 *     empreinte, fournisseur, reference,
 *     lignes: [{ cle, quantite, libelleNorme?, designation? }]
 *   }
 */

import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad, parseJson } from "../../_shared/http.js";
import { entrerStock, memoriserAlias } from "../../_shared/stock.js";
import { REFERENCES } from "../../_shared/catalog-index.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);
  if (!env.STOCKS_DB) return bad("Base de stocks non configurée (binding STOCKS_DB)", 503);

  const body = await parseJson(request);
  if (!body || !Array.isArray(body.lignes) || !body.lignes.length) {
    return bad("Aucune ligne à réceptionner");
  }

  // ── Contrôle serveur ──
  // Le client peut envoyer n'importe quoi : on n'accepte que des références
  // réellement présentes au catalogue, et des quantités entières positives.
  const connues = new Map(REFERENCES.map((r) => [r.cle, r]));
  const entrees = [];
  const aliasAMemoriser = [];

  for (const l of body.lignes) {
    const cle = String(l.cle || "").trim();
    const ref = connues.get(cle);
    if (!ref) return bad("Référence inconnue : " + (cle || "(vide)"));

    const q = Math.trunc(Number(l.quantite));
    if (!Number.isFinite(q) || q <= 0) {
      return bad(`Quantité invalide pour « ${ref.nom} »`);
    }
    // Une saisie à trois chiffres de trop passerait sans bruit et fausserait
    // le stock pour des mois. Mieux vaut refuser et faire ressaisir.
    if (q > 1_000_000) return bad(`Quantité irréaliste pour « ${ref.nom} » : ${q}`);

    entrees.push({ cle, quantite: q, libelle: ref.nom });

    // On ne mémorise que ce qui vient d'un document : une saisie manuelle
    // sans libellé fournisseur n'a rien à apprendre au système.
    if (l.libelleNorme) {
      aliasAMemoriser.push({ libelle: String(l.libelleNorme), cle,
                             brut: String(l.designation || l.libelleNorme) });
    }
  }

  const fournisseur = String(body.fournisseur || "").trim().slice(0, 120) || null;
  const reference   = String(body.reference || "").trim().slice(0, 60) || null;

  let resultat;
  try {
    resultat = await entrerStock(env.STOCKS_DB, entrees, {
      empreinte: body.empreinte ? String(body.empreinte) : null,
      fournisseur,
      reference,
      auteur: auth.user.login || auth.user.email || "admin",
    });
  } catch (err) {
    console.error("[reception/valider] Entrée de stock KO :", err.message);
    return bad("Entrée de stock impossible : " + err.message, 500);
  }

  if (!resultat.ok) {
    return bad(resultat.erreur, resultat.dejaTraite ? 409 : 400);
  }

  // La mémoire des libellés n'est pas critique : si elle échoue, la
  // marchandise est déjà entrée et c'est ce qui compte.
  let memorises = 0;
  try {
    const r = await memoriserAlias(env.STOCKS_DB, aliasAMemoriser, { fournisseur });
    memorises = r.memorises;
  } catch (err) {
    console.error("[reception/valider] Mémorisation des alias KO :", err.message);
  }

  return ok({ appliquees: resultat.appliquees, memorises });
}
