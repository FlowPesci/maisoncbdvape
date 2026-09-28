/**
 * functions/api/delete-order.js
 * Suppression définitive d'une commande, depuis /admin/commandes/.
 *
 * ─── Pourquoi ce fichier existe ───────────────────────────────────────────
 * Avant le lancement, le back-office accumulait des dizaines de commandes de
 * recette — toutes à l'adresse du développeur, aucune vente réelle. Le
 * commerçant ne peut pas travailler dans un écran où les vraies commandes se
 * noient dans les fausses.
 *
 * ⚠ SUPPRIMER UNE COMMANDE NE SUFFIT PAS : IL FAUT RENDRE SON STOCK.
 *
 * C'est le point qui rend ce fichier moins trivial qu'il n'y paraît. Une
 * commande « En attente » détient une réservation `active` dans la table
 * `reservations` : une unité retirée de `dispo` et mise de côté. Effacer
 * l'entrée KV sans toucher à cette ligne laisserait **du stock bloqué pour
 * toujours**, sans plus aucune commande pour expliquer pourquoi — et les
 * réservations ne se purgent qu'au fil de l'eau, à la commande suivante.
 * Sur une boutique qui n'a pas encore de trafic, « pour toujours » est à
 * prendre au pied de la lettre.
 *
 * Le danger est d'autant plus concret que ce ménage précède la saisie des
 * stocks réels : on saisirait des quantités justes sur des lignes déjà
 * amputées, et l'écart ne se verrait qu'à la première vente refusée.
 *
 * D'où l'ordre imposé ici : **rendre le stock, PUIS effacer**. Jamais
 * l'inverse — si la suppression passait d'abord et que la restitution
 * échouait, plus rien ne permettrait de retrouver ce qu'il fallait rendre.
 *
 * `restituerCommande()` (`_shared/stock.js`) fait les trois gestes que ce
 * projet exige de toute variation de stock — `dispo + qty`, changement
 * d'état, **et l'insertion dans `mouvements`** — et elle est idempotente.
 * On la réutilise plutôt que de réécrire la règle ici : une règle écrite à
 * deux endroits finit toujours par diverger.
 *
 * ⚠ La ligne de `mouvements` SURVIT à la suppression, volontairement. Le
 * journal des mouvements est ce qui permet d'expliquer un écart d'inventaire ;
 * un stock qui bouge sans trace est exactement ce qu'il existe pour empêcher.
 * La commande disparaît, la trace de ce qu'elle a fait au stock reste.
 *
 * ⚠ Et la suppression elle-même est journalisée dans `cmd:suppressions`, avec
 * qui, quand, quel montant et quel statut. Une suppression définitive sans
 * trace serait le seul geste du back-office dont on ne pourrait pas rendre
 * compte.
 * ─────────────────────────────────────────────────────────────────────────── */

import { getOrder } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { restituerCommande } from "../_shared/stock.js";
import { ok, bad, parseJson } from "../_shared/http.js";

/** Nombre de suppressions conservées dans le journal. */
const JOURNAL_MAX = 200;

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { orderId, confirmation } = body;
  if (!orderId) return bad("orderId requis");

  // ⚠ Garde-fou volontairement redondant avec la confirmation du navigateur.
  // Celle-ci vit dans une page que n'importe quel script peut contourner ;
  // l'API, elle, ne supprime rien sans que l'appelant ait répété le numéro.
  // Un appel accidentel — un bouton mal câblé, un double clic — ne peut donc
  // pas effacer une commande.
  if (confirmation !== orderId) {
    return bad("Confirmation absente : renvoyer le numéro de commande exact", 400);
  }

  const order = await getOrder(env.ORDERS_KV, orderId);
  if (!order) return bad("Commande introuvable", 404);

  const auteur = auth.user.login || auth.user.email || "admin";

  // ── 1. Rendre le stock AVANT d'effacer ───────────────────────────────────
  // Si cette étape échoue, on s'arrête : mieux vaut une commande de test qui
  // traîne qu'une unité de stock bloquée sans explication.
  let lignesRendues = 0;
  if (env.STOCKS_DB) {
    try {
      lignesRendues = await restituerCommande(env.STOCKS_DB, orderId, auteur);
    } catch (err) {
      return bad(
        "Stock non rendu, suppression annulée : " + err.message +
        " — la commande est intacte, réessayer.",
        500,
      );
    }
  }

  // ── 2. Journaliser la suppression ────────────────────────────────────────
  // Avant l'effacement, pour qu'un échec d'écriture du journal empêche la
  // suppression plutôt que de la laisser sans trace.
  try {
    const brut = await env.ORDERS_KV.get("cmd:suppressions");
    const journal = brut ? JSON.parse(brut) : [];
    journal.unshift({
      at: new Date().toISOString(),
      orderId,
      par: auteur,
      statut: order.status,
      montant: order.totalAPayer ?? order.totalTTC ?? null,
      email: order.client?.email || null,
      lignesStockRendues: lignesRendues,
    });
    await env.ORDERS_KV.put("cmd:suppressions", JSON.stringify(journal.slice(0, JOURNAL_MAX)));
  } catch (err) {
    return bad("Journal de suppression non écrit, suppression annulée : " + err.message, 500);
  }

  // ── 3. Effacer ───────────────────────────────────────────────────────────
  // La correspondance `mtc:<référence>` que pose create-payment.js doit partir
  // avec : elle pointerait sinon vers une commande inexistante, et une
  // notification Monetico tardive chercherait une clé morte.
  const reference = order.paiement?.moneticoRef;
  if (reference) {
    try { await env.ORDERS_KV.delete("mtc:" + reference); }
    catch (e) { console.error("[delete-order] mtc: non effacé —", e.message); }
  }

  await env.ORDERS_KV.delete(orderId);

  return ok({ supprime: orderId, lignesStockRendues: lignesRendues });
}
