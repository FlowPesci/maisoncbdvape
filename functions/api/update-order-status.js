import { getOrder, updateOrder } from "../_shared/orders.js";
import { requireGithubUser } from "../_shared/auth.js";
import { sendEmail } from "../_shared/email.js";
import { readyClient } from "../_shared/templates.js";
import { restituerCommande } from "../_shared/stock.js";
import { ok, bad, parseJson } from "../_shared/http.js";

const VALID = new Set(["pending", "paid", "preparing", "ready", "completed", "cancelled"]);

export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body) return bad("Corps invalide");

  const { orderId, status, note } = body;
  if (!orderId) return bad("orderId requis");
  if (!VALID.has(status)) return bad("Statut invalide : " + status);

  try {
    const before = await getOrder(env.ORDERS_KV, orderId);
    if (!before) return bad("Commande introuvable", 404);

    const updated = await updateOrder(env.ORDERS_KV, orderId, (o) => { o.status = status; }, {
      actor: auth.user.login || auth.user.email,
      note: note || `Changement par ${auth.user.login}`,
    });

    // ── Annulation : le stock retourne en vente ──
    // restituerCommande traite aussi les commandes déjà payées, dont la
    // réservation est « consommée » — le cas du remboursement. Idempotente :
    // repasser deux fois en « Annulée » ne crédite pas deux fois.
    if (status === "cancelled" && before.status !== "cancelled") {
      try {
        const n = await restituerCommande(env.STOCKS_DB, orderId, auth.user.login || "admin");
        if (n) console.log(`[update-order-status] ${n} ligne(s) de stock rendue(s) — ${orderId}`);
      } catch (e) { console.error("[update-order-status] Relâche stock KO :", e.message); }
    }

    // ── « Prête » : le SEUL statut qui écrit au client ──
    //
    // `preparing` n'envoie rien, volontairement, et ce n'est pas un oubli :
    // la confirmation de commande annonce déjà « nous préparons votre
    // commande, vous recevrez un nouvel email dès qu'elle sera prête ». Un
    // message « en préparation » n'apprendrait rien et casserait la promesse
    // d'un seul e-mail suivant. Aucun statut n'écrit non plus au commerçant :
    // c'est lui qui vient de faire le geste.
    //
    // ⚠ L'issue de l'envoi est ÉCRITE SUR LA COMMANDE, et c'est le cœur de ce
    //   bloc. Elle ne l'était pas : le `catch` ne faisait qu'un
    //   `console.error`, donc un échec de l'e-mail « votre commande est
    //   prête » ne laissait **aucune trace** dans `/admin/commandes/`. Le
    //   commerçant croyait avoir prévenu, le client attendait, et rien ne le
    //   disait — exactement la panne du 2026-09-12, découverte en ne recevant
    //   rien. `submit-reservation.js` le faisait déjà ; ce chemin-ci l'avait
    //   oublié. Constaté le 2026-10-03.
    //
    // ⚠ `{ ...o.emails }` : on FUSIONNE, jamais on écrase. `order.emails`
    //   porte déjà l'issue des envois de la commande initiale (`client`,
    //   `commercant`) ; un remplacement effacerait la trace d'un échec
    //   antérieur au moment même où le commerçant passe la commande en
    //   « Prête ». Un journal qu'une étape suivante efface n'est pas un journal.
    //
    // ⚠ `{ stubbed: true }` ne lève pas d'exception — c'est le cas d'une clé
    //   Resend absente, et c'est celui qui s'est produit. Il est donc
    //   distingué d'un succès, sinon la seule panne réelle passerait pour un
    //   envoi réussi.
    let apres = updated;
    if (status === "ready" && before.status !== "ready") {
      let issue;
      try {
        const tpl = readyClient(updated);
        const r = await sendEmail(env, { to: updated.client.email, ...tpl });
        issue = r?.stubbed ? "non-configure" : "envoye";
      } catch (e) {
        issue = "echec : " + e.message;
        console.error("[update-order-status] Email 'ready' KO :", e.message);
      }
      try {
        apres = await updateOrder(env.ORDERS_KV, orderId,
          (o) => { o.emails = { ...(o.emails || {}), prete: issue }; },
          { actor: "update-order-status", note: "E-mail « prête » : " + issue });
      } catch (e) {
        // L'écriture du témoin ne doit pas faire échouer un changement de
        // statut déjà appliqué : le stock et l'état de la commande sont justes.
        console.error("[update-order-status] Ecriture du suivi e-mail KO :", e.message);
      }
    }
    return ok({ order: apres });
  } catch (err) {
    return bad("Erreur : " + err.message, 500);
  }
}
