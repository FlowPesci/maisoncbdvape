/**
 * functions/api/avis.js
 * Avis clients — dépôt, lecture publique, modération.
 *
 *   GET  /api/avis?produit=<id>        → avis publiés + note moyenne
 *   POST /api/avis { orderId, email, produitId, auteur, note, commentaire }
 *   GET  /api/avis?etat=attente        → file de modération (admin)
 *   PUT  /api/avis { id, etat }        → publier ou refuser (admin)
 *
 * ─── La règle qui gouverne ce fichier ─────────────────────────────────────
 * Un avis ne peut exister que si la commande qui le porte existe, qu'elle
 * appartient à l'adresse qui écrit, qu'elle a été honorée, et qu'elle
 * contenait bien ce produit. Les quatre conditions sont vérifiées ici et
 * nulle part ailleurs.
 *
 * Ce n'est pas de la prudence excessive : en France, publier un faux avis
 * est une pratique commerciale trompeuse (art. L121-2 du code de la
 * consommation), et présenter un avis comme « vérifié » sans l'avoir
 * vérifié est visé explicitement. La mention n'est légitime que parce que
 * ces contrôles existent.
 *
 * Ce fichier remplace deux avis écrits en dur dans le gabarit, signés de
 * noms inventés et affichés sur les 121 fiches.
 * ─────────────────────────────────────────────────────────────────────────── */

import { ok, bad, parseJson } from "../_shared/http.js";
import { rateLimit, getClientIp } from "../_shared/ratelimit.js";
import { requireGithubUser } from "../_shared/auth.js";
import { getOrder } from "../_shared/orders.js";
import { CATALOG, REFERENCES } from "../_shared/catalog-index.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { avisMerchant } from "../_shared/templates.js";

/**
 * Nom lisible d'un produit, pour l'e-mail de modération.
 *
 * ⚠ Ne PAS lire `CATALOG[id].nom` : les valeurs de `CATALOG` sont des
 *   **nombres** (le prix de fiche), pas des objets. L'écriture ne lève pas —
 *   l'optionnel rend `undefined` — et l'e-mail serait simplement retombé sur
 *   l'identifiant brut sans que rien ne le signale. C'est exactement ce que
 *   j'avais écrit en premier.
 *
 * Le nom vit dans `REFERENCES`. Un produit à saveurs n'y a pas d'entrée nue :
 * ses lignes sont `id::label`. On accepte donc le préfixe à défaut d'exact —
 * le libellé portera alors une saveur en trop, ce qui identifie quand même le
 * produit, et c'est tout ce qu'on demande à un objet d'e-mail.
 */
function nomProduit(id) {
  const exact = REFERENCES.find((r) => r.cle === id);
  if (exact) return exact.nom;
  const prefixe = REFERENCES.find((r) => r.cle.startsWith(id + "::"));
  return prefixe ? prefixe.nom : id;
}

const MAX_AUTEUR = 60;
const MAX_COMMENTAIRE = 1500;

/** Commandes qui donnent droit à un avis : la marchandise est partie. */
const STATUTS_HONORES = new Set(["paid", "ready", "completed", "collected", "shipped"]);

// ═══════════════════════════════════════════════════════════════════════════
// Lecture
// ═══════════════════════════════════════════════════════════════════════════

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);

  // File de modération — réservée au commerçant.
  if (url.searchParams.get("etat")) {
    const auth = await requireGithubUser(request, env);
    if (auth.error) return bad(auth.error.message, auth.error.status);
    if (!env.STOCKS_DB) return bad("Base indisponible", 503);

    const etat = url.searchParams.get("etat");
    if (!["attente", "publie", "refuse"].includes(etat)) return bad("État inconnu");

    const { results = [] } = await env.STOCKS_DB
      .prepare("SELECT * FROM avis WHERE etat = ?1 ORDER BY creeLe DESC LIMIT 100")
      .bind(etat)
      .all();
    return ok({ avis: results });
  }

  // Lecture publique d'un produit.
  const produitId = (url.searchParams.get("produit") || "").trim();
  if (!produitId) return bad("Produit manquant");
  if (!env.STOCKS_DB) return ok({ avis: [], nombre: 0, note: null });

  try {
    const { results = [] } = await env.STOCKS_DB
      .prepare(
        `SELECT auteur, note, commentaire, creeLe FROM avis
          WHERE produitId = ?1 AND etat = 'publie'
          ORDER BY creeLe DESC LIMIT 50`
      )
      .bind(produitId)
      .all();

    // La moyenne est calculée ici et jamais stockée : une note figée en base
    // se désynchronise du jour où un avis est retiré.
    const nombre = results.length;
    const note = nombre
      ? Math.round((results.reduce((s, a) => s + a.note, 0) / nombre) * 10) / 10
      : null;

    const repartition = [1, 2, 3, 4, 5].reduce((acc, n) => {
      acc[n] = results.filter((a) => a.note === n).length;
      return acc;
    }, {});

    return ok({ avis: results, nombre, note, repartition });
  } catch (err) {
    // Table absente avant migration : la fiche produit doit rester lisible.
    console.warn("[avis] Lecture impossible :", err.message);
    return ok({ avis: [], nombre: 0, note: null, repartition: {} });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Dépôt
// ═══════════════════════════════════════════════════════════════════════════

export async function onRequestPost({ request, env }) {
  const ip = getClientIp(request);
  if (await rateLimit(env.ORDERS_KV, "avis", ip, { max: 5, windowSecs: 3600 })) {
    return bad("Trop de dépôts. Réessayez dans une heure.", 429);
  }

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");
  if (!env.STOCKS_DB) return bad("Service indisponible", 503);

  const orderId   = String(body.orderId || "").trim();
  const email     = String(body.email || "").trim().toLowerCase();
  const produitId = String(body.produitId || "").trim();
  const note      = Number(body.note);

  if (!orderId || !email) return bad("Numéro de commande et e-mail requis");
  if (!Number.isInteger(note) || note < 1 || note > 5) return bad("La note doit aller de 1 à 5");
  if (!(produitId in CATALOG)) return bad("Produit inconnu");

  // ── 1. La commande existe-t-elle ? ──
  const order = await getOrder(env.ORDERS_KV, orderId).catch(() => null);
  // Réponse volontairement identique quelle que soit la cause : distinguer
  // « commande inconnue » de « e-mail incorrect » permettrait de deviner
  // quels numéros de commande existent.
  const refus = "Aucune commande ne correspond à ce numéro et à cette adresse.";
  if (!order) return bad(refus, 403);

  // ── 2. Appartient-elle à cette adresse ? ──
  if (String(order.client?.email || "").toLowerCase() !== email) return bad(refus, 403);

  // ── 3. A-t-elle été honorée ? ──
  if (!STATUTS_HONORES.has(order.status)) {
    return bad("Cette commande n'a pas encore été honorée. L'avis sera possible après le retrait.", 409);
  }

  // ── 4. Contenait-elle ce produit ? ──
  const achete = (order.items || []).some((it) => {
    const base = String(it.id || "").includes("--") ? String(it.id).split("--")[0] : String(it.id);
    return base === produitId;
  });
  if (!achete) return bad("Ce produit ne figure pas dans cette commande.", 403);

  // Le nom affiché : ce que le client saisit, sinon son prénom de commande.
  // Jamais l'e-mail, qui n'a rien à faire sur une page publique.
  const auteur = (String(body.auteur || "").trim() || String(order.client?.nom || "Client").trim())
    .slice(0, MAX_AUTEUR);
  const commentaire = String(body.commentaire || "").trim().slice(0, MAX_COMMENTAIRE);

  try {
    const res = await env.STOCKS_DB
      .prepare(
        `INSERT OR IGNORE INTO avis (produitId, orderId, auteur, note, commentaire, etat, creeLe)
         VALUES (?1, ?2, ?3, ?4, ?5, 'attente', ?6)`
      )
      .bind(produitId, orderId, auteur, note, commentaire, Date.now())
      .run();

    if (!res.meta.changes) {
      return bad("Vous avez déjà déposé un avis sur ce produit pour cette commande.", 409);
    }
  } catch (err) {
    console.error("[avis] Dépôt KO :", err.message);
    return bad("Enregistrement impossible. Réessayez plus tard.", 500);
  }

  // ── Prévenir le commerçant ────────────────────────────────────────────────
  //
  // ⚠ Sans ça, un avis déposé n'existait pour PERSONNE. Il dormait en
  //   `etat = 'attente'`, et le seul moyen de le voir était d'ouvrir
  //   `/admin/avis/` en le devinant — alors que le client venait de lire
  //   « votre avis sera publié après vérification » et que la fiche continuait
  //   d'afficher « Aucun avis pour le moment ».
  //
  //   Silencieux des deux côtés : ni le commerçant ni le client ne pouvaient
  //   s'en apercevoir. Et sur une boutique qui démarre, un avis réel est
  //   précisément ce qu'on ne peut pas se permettre de perdre.
  //
  // ⚠ APRÈS l'insertion, jamais avant : prévenir d'un avis qui n'a pas été
  //   enregistré enverrait le commerçant devant une file vide.
  //
  // ⚠ Et l'échec est ABSORBÉ. L'avis est déjà en base ; faire échouer la
  //   requête pour un e-mail non parti afficherait une erreur au client, qui
  //   recommencerait — et se heurterait au « vous avez déjà déposé un avis ».
  //   Le défaut deviendrait pire que celui qu'on corrige.
  try {
    const merchant = merchantEmail(env);
    if (merchant) {
      const siteUrl = env.SITE_URL || "https://maisoncbdvape.fr";
      await sendEmail(env, {
        to: merchant,
        ...avisMerchant(
          {
            produitId,
            produitNom: nomProduit(produitId),
            orderId, auteur, note, commentaire,
          },
          siteUrl
        ),
      });
    }
  } catch (e) {
    console.error("[avis] Notification commercant KO :", e.message);
  }

  // Rien n'est publié tout de suite, et on le dit : laisser croire à une
  // publication immédiate ferait revenir le client vérifier pour rien.
  return ok({ depose: true, enAttente: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// Modération
// ═══════════════════════════════════════════════════════════════════════════

export async function onRequestPut({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);
  if (!env.STOCKS_DB) return bad("Base indisponible", 503);

  const body = await parseJson(request);
  const id = Number(body?.id);
  const etat = String(body?.etat || "");
  if (!Number.isInteger(id)) return bad("Avis manquant");
  if (!["publie", "refuse", "attente"].includes(etat)) return bad("État inconnu");

  const res = await env.STOCKS_DB
    .prepare("UPDATE avis SET etat = ?1, modereLe = ?2 WHERE id = ?3")
    .bind(etat, Date.now(), id)
    .run();

  if (!res.meta.changes) return bad("Avis introuvable", 404);
  return ok({ id, etat });
}
