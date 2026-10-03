/**
 * src/_data/build.js
 * Horodatage de la construction, affiché dans le back-office.
 *
 * ─── Pourquoi ce fichier existe ──────────────────────────────────────────────
 * Le commerçant a demandé le 2026-10-03 : « si j'enchaîne plusieurs
 * modifications de fiches, comment être sûr qu'elles sont toutes passées ? »
 *
 * La réponse rassurante est que rien ne se perd : le contenu vit dans Git, et
 * chaque construction récupère `main` à son SOMMET. La dernière construction
 * contient donc déjà toutes les modifications antérieures — une construction
 * intermédiaire sautée n'emporte aucune fiche avec elle.
 *
 * ⚠ Mais le danger réel est l'inverse, et il a déjà coûté deux jours.
 *   Si une seule fiche introduit une donnée qu'un `verify:` refuse, cette
 *   donnée RESTE dans le dépôt : toutes les constructions suivantes échouent
 *   aussi, y compris celles déclenchées par des fiches correctes. Ce n'est pas
 *   « un déploiement perdu », c'est `main` cassé — et qui le reste.
 *   (2026-09-26 : cinq refus d'affilée. 2026-09-29 : dix.)
 *
 *   Pendant ce temps le site NE TOMBE PAS : Cloudflare continue de servir le
 *   dernier déploiement réussi. Rien n'alerte, tout a l'air normal, et le
 *   commerçant peut modifier dix fiches en croyant les publier.
 *
 * D'où cet horodatage. Il ne garantit rien — il rend l'échec VISIBLE : si le
 * commerçant enregistre une fiche et que cette date ne bouge pas quelques
 * minutes plus tard, la construction a échoué. C'est le seul signal qui ne
 * demande ni d'ouvrir le tableau de bord Cloudflare, ni d'y penser.
 *
 * ⚠ Rendu CÔTÉ SERVEUR, jamais en JavaScript. Ce projet a déjà payé deux fois
 *   un affichage juste uniquement parce qu'un script tournait
 *   (`admin-commandes`, `categorie-menu`) : un témoin de santé qui dépend d'un
 *   script est muet précisément le jour où quelque chose ne va pas.
 *
 * ⚠ Rien n'est commité : ce fichier produit une valeur à chaque construction,
 *   elle vit dans `public/`, qui n'est pas versionné. C'est exactement ce qui
 *   interdit à `og:generer` d'entrer dans `npm run build` — ici le problème ne
 *   se pose pas, aucun binaire n'est écrit.
 */

export default function () {
  const maintenant = new Date();

  // Europe/Paris explicitement : l'image de construction Cloudflare tourne en
  // UTC, et une heure de publication décalée de deux heures ferait douter le
  // commerçant au lieu de le rassurer.
  const horodatage = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "long",
    timeStyle: "short",
  }).format(maintenant);

  // Cloudflare Pages expose le commit construit. Absent en local, et c'est
  // normal — d'où le repli plutôt qu'une chaîne vide qui laisserait un trou
  // dans la page.
  const sha = process.env.CF_PAGES_COMMIT_SHA || "";

  return {
    horodatage,
    iso: maintenant.toISOString(),
    commit: sha ? sha.slice(0, 7) : "local",
  };
}
