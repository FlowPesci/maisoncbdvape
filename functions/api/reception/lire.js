/**
 * functions/api/reception/lire.js
 * POST /api/reception/lire — lit un bon de livraison et propose des lignes.
 *
 * Cet endpoint ne touche à AUCUN stock. Il lit, rapproche du catalogue, et
 * rend une proposition que l'écran affiche pour validation. L'écriture n'a
 * lieu qu'à l'appel de /api/reception/valider.
 *
 * Corps attendu :
 *   { empreinte, texte }            pour un PDF avec couche texte
 *   { empreinte, images: [dataURL] } pour un scan ou une photo
 */

import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad, parseJson } from "../../_shared/http.js";
import { lireTexte, lireImages } from "../../_shared/lecture-document.js";
import { apparier, convertirQuantite, normaliser } from "../../_shared/appariement.js";
import { lireAlias } from "../../_shared/stock.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const aImages = Array.isArray(body.images) && body.images.length;
  if (!body.texte && !aImages) return bad("Aucun document à lire");

  // ── Document déjà traité ? On prévient AVANT la lecture ──
  // Inutile de dépenser une requête au modèle, et surtout inutile de laisser
  // Pesci ressaisir un bon qu'il a déjà passé il y a trois semaines.
  if (body.empreinte && env.STOCKS_DB) {
    try {
      const deja = await env.STOCKS_DB
        .prepare("SELECT creeLe, lignes FROM receptions WHERE empreinte = ?1")
        .bind(String(body.empreinte)).first();
      if (deja) {
        return ok({ dejaTraite: true, traiteLe: deja.creeLe, lignesAppliquees: deja.lignes,
                    fournisseur: "", reference: "", lignes: [] });
      }
    } catch (err) {
      console.error("[reception/lire] Contrôle du doublon impossible :", err.message);
    }
  }

  // ── Lecture ──
  let lu;
  try {
    lu = aImages ? await lireImages(env.AI, body.images)
                 : await lireTexte(env.AI, body.texte);
  } catch (err) {
    console.error("[reception/lire] Lecture KO :", err.message);
    return bad("Lecture du document impossible : " + err.message, 502);
  }

  if (!lu.lignes.length) {
    return ok({ fournisseur: lu.fournisseur, reference: lu.reference, lignes: [],
                avertissement: "Aucune ligne d'article reconnue dans ce document." });
  }

  // ── Rapprochement avec le catalogue ──
  let alias = {};
  try {
    if (env.STOCKS_DB) alias = await lireAlias(env.STOCKS_DB);
  } catch (err) {
    // Sans les alias on sait encore travailler, avec moins de certitudes.
    console.error("[reception/lire] Alias illisibles :", err.message);
  }

  const lignes = lu.lignes.map((l) => {
    const m = apparier(l.designation, alias);
    const unite = m.candidats.find((c) => c.cle === m.cle)?.unite
               || m.candidats[0]?.unite || "pcs";
    const q = convertirQuantite(l.quantite, l.unite, unite);

    return {
      designation: l.designation,
      libelleNorme: normaliser(l.designation),
      quantiteBon: l.quantite,
      uniteBon: l.unite,
      prixAchat: l.prixAchat,
      cle: m.cle,
      confiance: m.confiance,
      score: m.score,
      candidats: m.candidats,
      quantite: q.quantite,
      unite: q.unite,
      ambigu: q.ambigu || null,
    };
  });

  return ok({
    fournisseur: lu.fournisseur,
    reference: lu.reference,
    lignes,
    resume: {
      total: lignes.length,
      certaines: lignes.filter((l) => l.confiance === "certain").length,
      probables: lignes.filter((l) => l.confiance === "probable").length,
      incertaines: lignes.filter((l) => l.confiance === "incertain").length,
    },
  });
}
