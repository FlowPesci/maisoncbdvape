/**
 * scripts/test-ecran-diagnostic.mjs
 *
 * Exécute réellement `src/assets/js/admin-diagnostic.js` dans le vrai HTML
 * généré pour `/admin/diagnostic/`, avec un `fetch` simulé.
 *
 * ─── Pourquoi ────────────────────────────────────────────────────────────
 * `node --check` valide la syntaxe et ne voit rien d'autre. `/admin/commandes/`
 * est resté figé sur « Chargement… » pendant des jours parce qu'une ligne
 * lisait une variable supprimée : une `ReferenceError`, qui n'existe qu'à
 * l'exécution et interrompt silencieusement toute la fonction anonyme. Aucun
 * `verify:` ne pouvait l'attraper. Celui-ci le peut, parce qu'il exécute.
 *
 * Il ne remplace pas l'ouverture de la page dans un navigateur — il ne voit ni
 * couleur ni alignement. Il garantit seulement que l'écran *affiche quelque
 * chose*, dans les quatre situations qui comptent.
 *
 *   node scripts/test-ecran-diagnostic.mjs
 *
 * ⚠ Dépend de `linkedom`, installé hors du dépôt. Le script se déclare
 *   « ignoré » plutôt que d'échouer s'il ne le trouve pas : il ne doit pas
 *   faire tomber une construction pour une dépendance de confort.
 * ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, existsSync } from "node:fs";

const PAGE   = "public/admin/diagnostic/index.html";
const SCRIPT = "src/assets/js/admin-diagnostic.js";

let parseHTML;
try {
  ({ parseHTML } = await import("linkedom"));
} catch {
  console.log("[diagnostic] ⊘ linkedom absent — test ignoré (npm i -D linkedom pour l'activer)");
  process.exit(0);
}

if (!existsSync(PAGE)) {
  console.error(`[diagnostic] ✕ ${PAGE} introuvable — lancer \`npx eleventy\` d'abord`);
  process.exit(1);
}

const html   = readFileSync(PAGE, "utf8");
const source = readFileSync(SCRIPT, "utf8");

const REPONSE_TYPE = {
  variables: [
    { nom: "SITE_URL", role: "Adresses de retour", requis: true, secret: false, present: true,  valeur: "https://maisoncbdvape.fr", longueur: null },
    { nom: "MONETICO_TPE", role: "Paiement par carte", requis: false, secret: false, present: false, valeur: null, longueur: null },
    { nom: "RESEND_API_KEY", role: "Envoi des e-mails", requis: true, secret: true,  present: true,  valeur: null, longueur: 36 },
    // Le cas qui doit alarmer : requise ET absente. C'est exactement la
    // situation qu'on cherchait à voir le 2026-09-12.
    { nom: "GITHUB_OAUTH_CLIENT_SECRET", role: "Connexion", requis: true, secret: true, present: false, valeur: null, longueur: null },
    { nom: "MONETICO_CLE_MAC", role: "Signature", requis: false, secret: true, present: false, valeur: null, longueur: null },
  ],
  bindings: [
    { nom: "ORDERS_KV", role: "Commandes", present: true },
    { nom: "AI", role: "Bons de livraison", present: false },
  ],
  monetico: [
    { at: "2026-09-18T09:00:00.000Z", methode: "POST", issue: "sceau-valide", cdr: 0, codeRetour: "payetest" },
    { at: "2026-09-18T08:00:00.000Z", methode: "POST", issue: "sceau-invalide", cdr: 1, cleMacPresente: false },
    // Refus postérieur au correctif : les trois lectures ont été essayées.
    { at: "2026-09-18T07:30:00.000Z", methode: "POST", issue: "sceau-invalide", cdr: 1, cleMacPresente: true, lecturesEssayees: 3 },
    // Refus antérieur au correctif : une seule lecture, donc non concluant.
    { at: "2026-09-18T07:00:00.000Z", methode: "POST", issue: "sceau-invalide", cdr: 1, cleMacPresente: true },
  ],
};

/** Monte la page, exécute le script, rend la main une fois les micro-tâches vidées. */
async function jouer({ session = true, reponse = REPONSE_TYPE, statut = 200, envoi = null }) {
  const { window, document } = parseHTML(html);

  window.MCV_ADMIN = {
    connecte: () => session,
    oublier: () => Promise.resolve(),
  };
  // Fourni en vrai par `tabacgex.js`, chargé par le gabarit de base. Le
  // contrôle ci-dessous garantit que cette dépendance existe réellement sur
  // la page : la simuler ici sans le vérifier masquerait un écran cassé.
  window.MCV_DATE = { dateHeure: (d) => d.toISOString() };
  const appels = [];
  window.fetch = async (url, opts) => {
    appels.push({ url, methode: opts?.method || "GET" });
    const corps = opts?.method === "POST" ? envoi : reponse;
    return {
      ok: statut >= 200 && statut < 300,
      status: statut,
      json: async () => corps,
    };
  };

  const erreurs = [];
  const fn = new window.Function(
    "window", "document", "fetch", "__erreurs",
    `try { ${source} } catch (e) { __erreurs.push(e); }`
  );
  fn(window, document, window.fetch, erreurs);

  // Laisse les promesses du script se résoudre.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));

  return { window, document, erreurs, appels };
}

const echecs = [];
function verifier(nom, condition, detail) {
  if (condition) console.log(`  ✓ ${nom}`);
  else { console.log(`  ✕ ${nom} — ${detail}`); echecs.push(nom); }
}

console.log("\n[diagnostic] Exécution de l'écran /admin/diagnostic/\n");

// ── 0. Les dépendances simulées existent-elles vraiment sur la page ? ─────
// Sans ce contrôle, stubber `window.MCV_DATE` rendrait tous les tests verts
// sur un écran qui planterait dans le navigateur.
{
  console.log("Dépendances de la page");
  for (const script of ["tabacgex.js", "admin-nav.js", "admin-diagnostic.js"]) {
    verifier(script + " est chargé par la page",
      html.includes("/assets/js/" + script),
      "absent du HTML généré — le stub du test masquerait la panne");
  }
}

// ── 1. Cas nominal : connecté, l'API répond ──────────────────────────────
{
  const { document, erreurs } = await jouer({});
  console.log("Connecté, API disponible");
  verifier("aucune erreur à l'exécution", erreurs.length === 0, erreurs.map((e) => e.message).join(" / "));
  const corps = document.getElementById("diag-corps");
  verifier("le tableau est affiché", !corps.classList.contains("hidden"), "#diag-corps est resté masqué");
  verifier("l'écran ne reste pas sur « Chargement… »",
    document.getElementById("diag-status").classList.contains("hidden"),
    "le bandeau de chargement est toujours visible");
  const lignes = document.getElementById("diag-variables").querySelectorAll("tr");
  verifier("une ligne par variable", lignes.length === 5, `${lignes.length} ligne(s)`);

  const texte = document.getElementById("diag-variables").innerHTML;
  verifier("une variable requise absente est signalée en rouge",
    texte.includes("ABSENTE"), "aucune mention « ABSENTE »");
  verifier("une variable facultative absente ne crie pas",
    texte.includes("non renseignée"), "MONETICO_TPE devrait être « non renseignée »");
  verifier("la longueur d'un secret est montrée, jamais sa valeur",
    texte.includes("36 caractères"), "longueur absente");
  verifier("aucune valeur secrète ne fuit dans le HTML",
    !texte.includes("re_") && !/[0-9a-f]{32,}/.test(texte), "une chaîne ressemblant à un secret est présente");
}

// ── 1 bis. Journal Monetico ──────────────────────────────────────────────
{
  const { document } = await jouer({});
  console.log("\nJournal des notifications Monetico");
  const html = document.getElementById("diag-monetico").innerHTML;
  verifier("un sceau refusé est signalé", html.includes("REFUS"), html.slice(0, 150));
  verifier("la clé MAC absente est nommée comme la cause",
    html.includes("ABSENTE"), "le motif le plus fréquent n'est pas explicité");
  verifier("le code-retour de recette est visible",
    html.includes("payetest"), "code-retour absent");
  // ⚠ Un refus d'avant le correctif de décodage et un refus d'après ne
  //   disent pas la même chose. Les confondre relancerait la chasse au
  //   mauvais endroit — c'est ce qui a failli arriver le 2026-09-19.
  verifier("un refus postérieur au correctif écarte le décodage",
    html.includes("le décodage est écarté"), "les trois lectures ne sont pas mentionnées");
  verifier("un refus antérieur est signalé comme non concluant",
    html.includes("ne rien en conclure"), "un ancien refus passe pour un verdict");
}

// ── 1 ter. Journal vide : l'absence est une information ──────────────────
{
  const { document } = await jouer({ reponse: { ...REPONSE_TYPE, monetico: [] } });
  console.log("\nJournal Monetico vide");
  const html = document.getElementById("diag-monetico").innerHTML;
  verifier("l'écran ne reste pas muet",
    html.includes("Aucun appel"), "un tableau vide n'apprend rien");
  verifier("il oriente vers l'URL enregistrée chez la banque",
    html.includes("back-office Monetico"), "aucune piste donnée");
  // ⚠ Le journal démarre à sa mise en service : un vide n'accuse la banque
  //   que si elle a testé depuis. L'écran ne doit pas conclure à sa place.
  verifier("il ne conclut pas au-delà de ce qu'il sait",
    html.includes("après"), "l'absence est présentée comme une preuve");
}

// ── 2. Session absente ───────────────────────────────────────────────────
{
  const { document, erreurs, appels } = await jouer({ session: false });
  console.log("\nNon connecté");
  verifier("aucune erreur", erreurs.length === 0, erreurs.map((e) => e.message).join(" / "));
  verifier("l'invitation à se connecter est proposée",
    document.getElementById("diag-status").innerHTML.includes("/api/auth/login"),
    "pas de lien de connexion");
  verifier("aucun appel à l'API n'est tenté", appels.length === 0, JSON.stringify(appels));
}

// ── 3. L'API échoue ──────────────────────────────────────────────────────
{
  const { document, erreurs } = await jouer({ statut: 500, reponse: {} });
  console.log("\nL'API répond 500");
  verifier("aucune erreur non rattrapée", erreurs.length === 0, erreurs.map((e) => e.message).join(" / "));
  verifier("l'échec est écrit à l'écran",
    document.getElementById("diag-status").innerHTML.includes("Erreur"),
    "l'écran resterait muet");
}

// ── 4. Le bouton d'e-mail de test, dans ses quatre verdicts ──────────────
{
  console.log("\nBouton « envoyer un e-mail de test »");
  const cas = [
    // ⚠ L'attendu impose le mot « Accepté » et non « Envoyé » : Resend répond
    //   200 à la prise en charge, pas à la remise. Un succès annoncé trop fort
    //   est ce qui a fait croire, le 2026-09-12, qu'un message rebondi était
    //   parti.
    ["envoye", { verdict: "envoye", destinataire: "x@y.fr", id: "abc" }, "Accepté par Resend"],
    // ⚠ L'attendu ne contient pas d'apostrophe : `esc()` produit bien
    //   `&#x27;`, mais relire `innerHTML` restitue le caractère littéral —
    //   comme dans un navigateur. Attendre l'entité ferait échouer un code
    //   correct.
    ["non-configure",      { verdict: "non-configure", message: "RESEND_API_KEY n'atteint pas le serveur." }, "RESEND_API_KEY"],
    // ⚠ L'attendu porte sur la phrase de RESEND, pas sur notre interprétation :
    //   c'est elle qui désigne la correction quand un code recouvre plusieurs
    //   causes, et c'est elle qui avait été jetée jusqu'au 2026-09-12.
    ["echec", {
      verdict: "echec",
      message: "Echec envoi email : 403 — The maisoncbdvape.fr domain is not verified.",
      cause: "Resend refuse l'envoi.",
      expediteur: "MaisonCBDVape <noreply@maisoncbdvape.fr>",
      destinataire: "x@y.fr",
    }, "domain is not verified"],
    ["aucun-destinataire", { verdict: "aucun-destinataire", message: "EMAIL_MERCHANT est vide" }, "EMAIL_MERCHANT"],
  ];
  for (const [nom, corps, attendu] of cas) {
    const { document, erreurs } = await jouer({ envoi: corps });
    document.getElementById("diag-email").click();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const rendu = document.getElementById("diag-email-resultat").innerHTML;
    verifier(`verdict « ${nom} » expliqué`,
      erreurs.length === 0 && rendu.includes(attendu),
      `rendu = ${rendu.slice(0, 120)}`);
  }
}

console.log("");
if (echecs.length) {
  console.error(`[diagnostic] ✕ ${echecs.length} contrôle(s) en échec`);
  process.exit(1);
}
console.log("[diagnostic] ✓ l'écran affiche quelque chose dans tous les cas testés\n");
