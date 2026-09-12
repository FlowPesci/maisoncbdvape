/**
 * functions/api/diagnostic.js
 *
 * ─── Pourquoi cet écran existe ──────────────────────────────────────────────
 * Une variable d'environnement absente ne provoque aucune erreur. Le code la
 * lit, obtient `undefined`, et continue. `_shared/email.js` en est l'exemple
 * exact : sans `RESEND_API_KEY`, il journalise et renvoie `{ stubbed: true }`
 * — la commande aboutit, le client ne reçoit rien, et rien nulle part ne le
 * dit. Le 2026-09-12, le commerçant a découvert le silence en ne recevant
 * aucun e-mail ; il a fallu une demi-journée pour établir *quelles* valeurs
 * atteignaient réellement le serveur.
 *
 * Le tableau de bord Cloudflare ne répond pas à cette question. Il montre ce
 * qui a été *saisi*, pas ce que le Worker *reçoit* — et la distinction est
 * précisément ce qui se perd quand la configuration vit à la fois dans
 * `wrangler.toml` et dans l'interface.
 *
 * Cet endpoint répond depuis l'intérieur du Worker, donc sans intermédiaire.
 *
 * ⚠ Il ne renvoie JAMAIS la valeur d'un secret — seulement sa présence et sa
 *   longueur. La longueur suffit à trancher les cas réels (une clé MAC
 *   Monetico fait 40 caractères hexadécimaux ; 38 ou 41 signale une coupure
 *   au copier-coller) sans qu'un vol du fichier de journal ne donne rien.
 *
 * Protégé par `requireGithubUser` : la liste des variables présentes est en
 * soi un renseignement utile à un attaquant.
 * ───────────────────────────────────────────────────────────────────────── */

import { requireGithubUser } from "../_shared/auth.js";
import { sendEmail, merchantEmail } from "../_shared/email.js";
import { ok, bad, parseJson } from "../_shared/http.js";

/**
 * Ce que le serveur doit trouver pour fonctionner.
 *
 * `secret` : la valeur ne sort jamais, même à un administrateur connecté.
 * `requis` : son absence casse une fonctionnalité, et l'écran l'affiche en
 *            rouge. Les autres sont signalées sans alarmer.
 * `role`   : ce qui cesse de marcher sans elle — pour que le message soit
 *            lisible par le commerçant, pas seulement par un développeur.
 */
const ATTENDUES = [
  { nom: "SITE_URL",               requis: true,  role: "Adresses de retour (OAuth GitHub, paiement)" },
  { nom: "EMAIL_FROM",             requis: true,  role: "Expéditeur des e-mails" },
  { nom: "EMAIL_REPLY_TO",         requis: false, role: "Adresse de réponse" },
  { nom: "EMAIL_MERCHANT",         requis: true,  role: "Destinataire des avis de commande" },
  { nom: "GITHUB_OAUTH_CLIENT_ID", requis: true,  role: "Connexion au back-office" },
  { nom: "GITHUB_REPO",            requis: true,  role: "Éditeur de fiches produits" },
  { nom: "ADMIN_GITHUB_USERS",     requis: true,  role: "Liste des comptes autorisés" },
  { nom: "MONETICO_ENV",           requis: true,  role: "Plateforme de paiement visée (test / production)" },
  { nom: "MONETICO_TPE",           requis: false, role: "Paiement par carte" },
  { nom: "MONETICO_SOCIETE",       requis: false, role: "Paiement par carte" },

  { nom: "RESEND_API_KEY",             requis: true,  secret: true, role: "Envoi de TOUS les e-mails" },
  { nom: "GITHUB_OAUTH_CLIENT_SECRET", requis: true,  secret: true, role: "Connexion au back-office" },
  { nom: "MONETICO_CLE_MAC",           requis: false, secret: true, role: "Signature des paiements par carte" },
];

/** Bindings de ressources : présents ou non, il n'y a rien à en dire d'autre. */
const BINDINGS = [
  { nom: "ORDERS_KV",  role: "Commandes" },
  { nom: "OAUTH_KV",   role: "Sessions d'administration" },
  { nom: "STOCKS_DB",  role: "Stocks" },
  { nom: "MEDIA",      role: "Photos produits" },
  { nom: "AI",         role: "Lecture des bons de livraison" },
];

function etatVariables(env) {
  return ATTENDUES.map((v) => {
    const brute = env[v.nom];
    const present = typeof brute === "string" && brute.trim() !== "";
    return {
      nom: v.nom,
      role: v.role,
      requis: !!v.requis,
      secret: !!v.secret,
      present,
      // La valeur en clair n'est renvoyée que pour ce qui est déjà public :
      // ces chaînes figurent dans wrangler.toml, versionné dans le dépôt.
      valeur: present && !v.secret ? brute : null,
      longueur: present && v.secret ? brute.length : null,
    };
  });
}

export async function onRequestGet({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  return ok({
    variables: etatVariables(env),
    bindings: BINDINGS.map((b) => ({ ...b, present: !!env[b.nom] })),
  });
}

/**
 * Envoi d'un e-mail de test, à la demande.
 *
 * C'est le seul moyen de distinguer « clé absente » de « clé refusée » : les
 * deux produisent le même silence côté client. Resend répond 401 sur une clé
 * révoquée, 403 sur un domaine d'envoi non vérifié — deux causes qui se
 * corrigent à des endroits différents, et que la réponse ci-dessous nomme.
 *
 * Le message part vers l'adresse du commerçant (`EMAIL_MERCHANT`), jamais
 * vers une adresse fournie par la requête : un endpoint qui expédie du
 * courrier vers une adresse arbitraire est un relais ouvert.
 */
export async function onRequestPost({ request, env }) {
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body || body.action !== "email-test") return bad("Action inconnue");

  const destinataire = merchantEmail(env);
  if (!destinataire) {
    return ok({
      verdict: "aucun-destinataire",
      message: "EMAIL_MERCHANT est vide : le serveur ne sait pas à qui écrire.",
    });
  }

  const quand = new Date().toISOString();
  try {
    const r = await sendEmail(env, {
      to: destinataire,
      replyTo: env.EMAIL_REPLY_TO || undefined,
      subject: "MaisonCBDVape — e-mail de test",
      text:
        "Cet e-mail confirme que le site sait envoyer du courrier.\n\n" +
        "Demandé depuis /admin/diagnostic/ par " + auth.user.login + "\n" +
        "Le " + quand + "\n",
      html:
        "<p>Cet e-mail confirme que le site sait envoyer du courrier.</p>" +
        "<p style=\"color:#666;font-size:13px\">Demandé depuis /admin/diagnostic/ par " +
        auth.user.login + "<br>Le " + quand + "</p>",
    });

    if (r && r.stubbed) {
      return ok({
        verdict: "non-configure",
        destinataire,
        message:
          "RESEND_API_KEY n'atteint pas le serveur. La saisir dans Cloudflare " +
          "Pages → Settings → Variables and secrets, en type Secret, puis " +
          "redéployer : un secret ajouté ne s'applique qu'au déploiement suivant.",
      });
    }
    return ok({ verdict: "envoye", destinataire, id: r?.id || null, quand });
  } catch (e) {
    // `sendEmail` relaie « Echec envoi email : <code> — <phrase de Resend> ».
    //
    // ⚠ La phrase de Resend prime sur toute interprétation écrite ici. Un même
    //   code couvre plusieurs causes — un 403 a signifié tantôt « domaine non
    //   vérifié », tantôt « tant qu'aucun domaine ne l'est, vous ne pouvez
    //   écrire qu'à votre propre adresse » — et deviner à partir du code seul
    //   envoie chercher au mauvais endroit. Les lignes ci-dessous ne font
    //   qu'orienter ; elles ne remplacent jamais le message d'origine.
    const message = String(e.message || e);
    let cause = null;
    if (message.includes("401")) cause = "Clé Resend refusée : révoquée ou régénérée. En créer une nouvelle et la ressaisir dans Cloudflare, puis redéployer.";
    if (message.includes("403")) cause = "Resend accepte la clé mais refuse cet envoi — trois causes possibles, la phrase ci-dessous dit laquelle : (1) le domaine d'envoi n'est pas vérifié, (2) aucun ne l'est et seule votre propre adresse est permise, (3) la clé est restreinte à un AUTRE domaine — cas fréquent avec une clé héritée de vapelab.fr. Le (3) se lit dans resend.com/api-keys, les deux autres dans resend.com/domains.";
    if (message.includes("422")) cause = "Adresse d'expéditeur ou de destinataire refusée. Vérifier EMAIL_FROM.";
    if (message.includes("429")) cause = "Quota Resend atteint.";
    return ok({
      verdict: "echec",
      destinataire,
      expediteur: env.EMAIL_FROM || null,
      message,
      cause,
    });
  }
}
