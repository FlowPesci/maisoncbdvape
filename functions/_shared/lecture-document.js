/**
 * functions/_shared/lecture-document.js
 * Lire les lignes d'un bon de livraison avec Workers AI.
 *
 * Deux chemins, choisis par le navigateur selon le document :
 *   · texte — le PDF a une couche texte, extraite par pdf.js. Un petit modèle
 *             suffit à structurer ce texte en lignes.
 *   · image — le PDF est un scan (ou une photo). Les pages arrivent en JPEG et
 *             c'est un modèle multimodal qui lit.
 *
 * Le modèle ne rend jamais de phrase à ré-analyser : la sortie est contrainte
 * par un schéma JSON. C'est ce qui évite la couche de parsing de texte libre,
 * qui est toujours la pièce qui casse.
 *
 * Coût (offre gratuite : 10 000 neurones/jour, remise à zéro à 00 h 00 UTC) :
 *   texte ≈ 35 neurones la page, image ≈ 120. Soit largement plus de bons de
 *   livraison par jour qu'une boutique n'en reçoit par mois.
 * ─────────────────────────────────────────────────────────────────────────── */

// @ts-check

/** Petit et très bon marché : 4 625 neurones/M de jetons en entrée. */
const MODELE_TEXTE = "@cf/qwen/qwen3-30b-a3b-fp8";

/** Multimodal, lit correctement un tableau scanné. */
const MODELE_IMAGE = "@cf/google/gemma-3-12b-it";

/**
 * Schéma imposé à la sortie du modèle.
 * `quantite` est une chaîne à dessein : les bons écrivent « 0,5 », « 1.5 »,
 * « 12 » — on veut le texte tel quel et on convertit nous-mêmes, plutôt que
 * de laisser le modèle arrondir.
 */
const SCHEMA = {
  type: "object",
  properties: {
    fournisseur: { type: "string" },
    reference:   { type: "string" },
    lignes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          designation: { type: "string" },
          quantite:    { type: "string" },
          unite:       { type: "string" },
          prixAchat:   { type: "string" },
        },
        required: ["designation", "quantite"],
      },
    },
  },
  required: ["lignes"],
};

const CONSIGNE = `Tu lis un bon de livraison ou une facture fournisseur d'un magasin français de CBD et de vape.

Extrais UNIQUEMENT les lignes d'articles livrés. Pour chacune :
- designation : le libellé du produit tel qu'écrit, sans le modifier ni le corriger
- quantite : le nombre livré, tel qu'écrit (garde la virgule décimale)
- unite : l'unité si elle est indiquée (g, kg, pcs, sachets…), sinon une chaîne vide
- prixAchat : le prix unitaire HT si présent, sinon une chaîne vide

Règles :
- N'invente aucune ligne. Si le document est illisible, renvoie une liste vide.
- Ignore les totaux, sous-totaux, TVA, frais de port, remises et mentions légales.
- Ignore les en-têtes de colonnes.
- Une ligne par article, même si le document la répartit sur deux lignes visuelles.
- Renseigne fournisseur et reference (numéro du bon) si tu les vois, sinon chaîne vide.`;

/** Le binding AI manquant doit se voir tout de suite, pas au premier appel. */
function exigeAI(ai) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("Lecture indisponible : le binding AI n'est pas configuré");
  }
}

/**
 * Le modèle peut renvoyer l'objet directement, ou une chaîne JSON, selon le
 * modèle et la version. On accepte les deux plutôt que de casser sur un
 * détail de forme.
 */
function extraireJson(reponse) {
  const brut = reponse?.response ?? reponse;
  if (brut && typeof brut === "object" && Array.isArray(brut.lignes)) return brut;

  const texte = typeof brut === "string" ? brut : JSON.stringify(brut ?? "");
  const debut = texte.indexOf("{");
  const fin   = texte.lastIndexOf("}");
  if (debut === -1 || fin <= debut) throw new Error("Réponse du modèle illisible");
  return JSON.parse(texte.slice(debut, fin + 1));
}

/** Nettoie ce que rend le modèle avant que quoi que ce soit d'autre y touche. */
function assainir(donnees) {
  const lignes = (donnees.lignes || [])
    .map((l) => ({
      designation: String(l.designation || "").trim().slice(0, 200),
      quantite:    String(l.quantite ?? "").trim().slice(0, 20),
      unite:       String(l.unite || "").trim().slice(0, 20),
      prixAchat:   String(l.prixAchat || "").trim().slice(0, 20),
    }))
    .filter((l) => l.designation && l.quantite);

  return {
    fournisseur: String(donnees.fournisseur || "").trim().slice(0, 120),
    reference:   String(donnees.reference || "").trim().slice(0, 60),
    lignes,
  };
}

/** Lecture d'un texte déjà extrait du PDF côté navigateur. */
export async function lireTexte(ai, texte) {
  exigeAI(ai);
  const contenu = String(texte || "").slice(0, 24000);
  if (contenu.trim().length < 20) return { fournisseur: "", reference: "", lignes: [] };

  const reponse = await ai.run(MODELE_TEXTE, {
    messages: [
      { role: "system", content: CONSIGNE },
      { role: "user", content: "Bon de livraison :\n\n" + contenu },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
    max_tokens: 2048,
  });

  return assainir(extraireJson(reponse));
}

/**
 * Lecture de pages scannées.
 *
 * Les pages sont traitées une par une : une seule requête portant cinq images
 * dégrade nettement la lecture, et un échec ferait perdre tout le document.
 * Les résultats sont concaténés dans l'ordre des pages.
 *
 * @param {Array<string>} images  Data URLs JPEG, une par page
 */
export async function lireImages(ai, images) {
  exigeAI(ai);
  const pages = (images || []).slice(0, 8);   // garde-fou : un bon n'a pas 40 pages
  if (!pages.length) return { fournisseur: "", reference: "", lignes: [] };

  const cumul = { fournisseur: "", reference: "", lignes: [] };

  for (const image of pages) {
    const reponse = await ai.run(MODELE_IMAGE, {
      messages: [
        { role: "system", content: CONSIGNE },
        {
          role: "user",
          content: [
            { type: "text", text: "Lis les lignes d'articles de cette page." },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: SCHEMA },
      max_tokens: 2048,
    });

    const page = assainir(extraireJson(reponse));
    if (!cumul.fournisseur) cumul.fournisseur = page.fournisseur;
    if (!cumul.reference)   cumul.reference   = page.reference;
    cumul.lignes.push(...page.lignes);
  }

  return cumul;
}
