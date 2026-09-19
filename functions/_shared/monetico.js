/**
 * functions/_shared/monetico.js
 * Intégration Monetico Paiement (Crédit Mutuel / CIC — Euro Information)
 * Runtime : Cloudflare Pages Functions (WebCrypto, pas de Node crypto)
 *
 * ┌─ Interface « Aller » ────────────────────────────────────────────────────┐
 * │ On construit un formulaire HTML scellé (champ MAC) que le navigateur du  │
 * │ client POSTe vers paiement.cgi. Pas d'appel API serveur→serveur.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ┌─ Interface « Retour » ───────────────────────────────────────────────────┐
 * │ Monetico POSTe (serveur→serveur, form-urlencoded) le résultat sur notre  │
 * │ URL de retour. On vérifie le sceau puis on répond « version=2\ncdr=0\n ».│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Variables d'environnement requises :
 *   MONETICO_ENV      "test" | "production"
 *   MONETICO_TPE      n° de TPE virtuel (7 caractères alphanumériques)
 *   MONETICO_SOCIETE  code société (fourni à la création du contrat)
 *   MONETICO_CLE_MAC  clé de sécurité, 40 caractères hexadécimaux — SECRET
 *
 * Référence : Monetico Paiement — Documentation Technique v2.0 (février 2025)
 *             + kit d'exemple officiel V4.0 (p.monetico-services.com)
 */

export const MONETICO_VERSION = "3.0";

/** URL de la page de paiement selon l'environnement. */
export function paiementUrl(env) {
  const isTest = (env.MONETICO_ENV || "test").toLowerCase() !== "production";
  return isTest
    ? "https://p.monetico-services.com/test/paiement.cgi"
    : "https://p.monetico-services.com/paiement.cgi";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Dérivation de la clé MAC
 *
 * La clé fournie par la banque est une chaîne de 40 caractères hexadécimaux
 * en « représentation externe ». Elle doit être convertie en « représentation
 * opérationnelle » : 20 octets binaires. L'algorithme ci-dessous est celui
 * publié par Euro Information (identique dans tous les kits PHP/Java/.NET).
 * ──────────────────────────────────────────────────────────────────────────── */
function usableKeyBytes(cleMac) {
  const key = String(cleMac || "").trim();
  if (key.length !== 40) {
    throw new Error("MONETICO_CLE_MAC doit faire exactement 40 caractères hexadécimaux");
  }

  let hexStrKey  = key.substring(0, 38);
  const hexFinal = key.substring(38, 40) + "00";

  const cca0 = hexFinal.charCodeAt(0);
  if (cca0 > 70 && cca0 < 97) {
    // Caractère entre 'G' et '`' → décalage de 23
    hexStrKey += String.fromCharCode(cca0 - 23) + hexFinal.substring(1, 2);
  } else if (hexFinal.substring(1, 2) === "M") {
    hexStrKey += hexFinal.substring(0, 1) + "0";
  } else {
    hexStrKey += hexFinal.substring(0, 2);
  }

  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hexStrKey.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** HMAC-SHA1 (RFC 2104) → hexadécimal minuscule. */
async function hmacSha1Hex(cleMac, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    usableKeyBytes(cleMac),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Chaîne à sceller — interface « Aller »
 *
 * Ordre imposé par Monetico (champs vides = chaîne vide, séparateur « * ») :
 *   TPE * date * montant * reference * texte-libre * version * lgue * societe
 *       * mail * nbrech * dateech1 * montantech1 * dateech2 * montantech2
 *       * dateech3 * montantech3 * dateech4 * montantech4 * options
 * ──────────────────────────────────────────────────────────────────────────── */
function chaineAller(f) {
  return [
    f.TPE,
    f.date,
    f.montant,
    f.reference,
    f["texte-libre"] || "",
    f.version,
    f.lgue,
    f.societe,
    f.mail || "",
    f.nbrech || "",
    f.dateech1 || "",
    f.montantech1 || "",
    f.dateech2 || "",
    f.montantech2 || "",
    f.dateech3 || "",
    f.montantech3 || "",
    f.dateech4 || "",
    f.montantech4 || "",
    f.options || "",
  ].join("*");
}

/**
 * Date au format attendu par Monetico : JJ/MM/AAAA:HH:MM:SS, heure de Paris.
 * Les Workers tournent en UTC — on convertit explicitement.
 */
export function moneticoDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${parts.day}/${parts.month}/${parts.year}:${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Référence de commande acceptée par Monetico.
 * Contrainte pratique : 12 caractères alphanumériques max pour rester lisible
 * sur le relevé bancaire. On dérive la référence de l'orderId interne
 * (ex. « MCV-202607251115-K7QM » → « 07251115K7QM »). Le préfixe n'entre
 * pas dans ces douze caractères : la bascule de « TG- » vers « MCV- » n'a
 * donc rien changé aux références déjà transmises à la banque.
 */
export function moneticoReference(orderId) {
  const clean = String(orderId).replace(/[^A-Za-z0-9]/g, "");
  return clean.slice(-12).toUpperCase();
}

/**
 * Montant Monetico : « 49.90EUR » (point décimal, 2 décimales, devise ISO).
 * On passe par les centimes entiers pour éviter les dérives de virgule
 * flottante (0.1 + 0.2, 1.005.toFixed(2) → « 1.00 », etc.).
 */
export function moneticoMontant(totalTTC, devise = "EUR") {
  const cents = Math.round((Number(totalTTC) + Number.EPSILON) * 100);
  return (cents / 100).toFixed(2) + devise;
}

/**
 * Construit les champs du formulaire « Aller », sceau MAC inclus.
 *
 * @returns {{ url: string, fields: Record<string,string> }}
 *          À POSTer tel quel vers `url` depuis le navigateur du client.
 */
export async function buildPaymentForm(env, {
  montant, reference, mail, texteLibre = "", urlRetourOk, urlRetourErr, lgue = "FR",
}) {
  const { MONETICO_TPE: TPE, MONETICO_SOCIETE: societe, MONETICO_CLE_MAC: cle } = env;
  if (!TPE || !societe || !cle) {
    throw new Error("Configuration Monetico incomplète (MONETICO_TPE / MONETICO_SOCIETE / MONETICO_CLE_MAC)");
  }

  const fields = {
    version:   MONETICO_VERSION,
    TPE,
    date:      moneticoDate(),
    montant,
    reference,
    lgue,
    societe,
    "texte-libre": texteLibre,
    mail:      mail || "",
  };

  fields.MAC = await hmacSha1Hex(cle, chaineAller(fields));

  // Les URLs de retour ne participent pas au sceau mais sont transmises.
  if (urlRetourOk)  fields.url_retour_ok  = urlRetourOk;
  if (urlRetourErr) fields.url_retour_err = urlRetourErr;

  return { url: paiementUrl(env), fields };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Interface « Retour » — validation du sceau
 *
 * La chaîne à sceller est construite à partir de TOUS les champs POSTés
 * (hors MAC), triés par ordre alphabétique, au format « nom=valeur »,
 * joints par « * ». C'est la méthode de calcul en vigueur depuis la v2.0
 * de la documentation.
 * ──────────────────────────────────────────────────────────────────────────── */
function chaineRetour(params) {
  return Object.keys(params)
    .filter((k) => k !== "MAC")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("*");
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3 bis. Trois lectures possibles du même corps POSTé
 *
 * ⚠ Le décodage du corps n'est pas neutre pour le sceau.
 *
 * Monetico signe la chaîne AVANT de l'encoder pour le transport. Nous, nous
 * la reconstruisons APRÈS décodage — et les deux ne coïncident pas toujours.
 * Le cas connu est le champ `authentification`, du base64, qui contient des
 * « + » : dans un corps `application/x-www-form-urlencoded`, un « + » non
 * échappé se décode en ESPACE. `request.formData()` et `URLSearchParams`
 * appliquent cette règle — correctement du point de vue de la norme, et à
 * tort du point de vue du sceau, qui a été calculé sur le « + ».
 *
 * Le symptôme est un sceau refusé sur CHAQUE notification, avec une clé
 * pourtant valide : exactement ce qu'affichait le journal le 2026-09-19.
 *
 * Plutôt que de parier sur une lecture, on les essaie toutes et on retient
 * celle dont le sceau correspond. Ce n'est pas un assouplissement : les trois
 * sont des reconstructions fidèles des mêmes octets reçus, et il faut
 * toujours connaître la clé pour produire un sceau valide. En prime, la
 * variante retenue est journalisée — elle documente le comportement réel de
 * la plateforme au lieu de le supposer.
 * ──────────────────────────────────────────────────────────────────────────── */
function lecturesDuCorps(raw) {
  const lectures = [];

  // A — décodage standard : « + » devient une espace.
  try {
    const p = {};
    for (const [k, v] of new URLSearchParams(raw)) p[k] = v;
    lectures.push({ variante: "standard", params: p });
  } catch { /* corps illisible sous cette forme */ }

  const paires = String(raw || "").split("&").filter(Boolean).map((m) => {
    const i = m.indexOf("=");
    return i === -1 ? [m, ""] : [m.slice(0, i), m.slice(i + 1)];
  });

  // B — pourcent-décodage seul : « + » préservé. C'est la lecture qui
  //     correspond au base64 tel que Monetico l'a signé.
  try {
    const p = {};
    for (const [k, v] of paires) p[decodeURIComponent(k)] = decodeURIComponent(v);
    lectures.push({ variante: "plus-preserve", params: p });
  } catch { /* séquence %XX invalide */ }

  // C — aucune transformation : les valeurs telles qu'elles voyagent.
  {
    const p = {};
    for (const [k, v] of paires) p[k] = v;
    lectures.push({ variante: "brut", params: p });
  }

  return lectures;
}

/**
 * Vérifie le sceau d'une notification Monetico.
 * @param {object} env
 * @param {Record<string,string>} params - champs POSTés (MAC inclus)
 * @returns {Promise<boolean>}
 */
export async function verifyRetourMac(env, params) {
  const recu = String(params.MAC || "").toLowerCase();
  if (recu.length !== 40) return false;
  const calcule = await hmacSha1Hex(env.MONETICO_CLE_MAC, chaineRetour(params));
  // Comparaison à temps constant
  if (calcule.length !== recu.length) return false;
  let diff = 0;
  for (let i = 0; i < calcule.length; i++) diff |= calcule.charCodeAt(i) ^ recu.charCodeAt(i);
  return diff === 0;
}

/**
 * Valide une notification à partir du CORPS BRUT de la requête.
 *
 * À préférer à `verifyRetourMac` : c'est le seul point d'entrée qui maîtrise
 * le décodage, et le décodage fait partie du sceau (voir `lecturesDuCorps`).
 *
 * @param {object} env
 * @param {string} raw - corps POSTé, non décodé
 * @returns {Promise<{ valide: boolean, params: object, variante: string|null,
 *                     variantesEssayees: string[] }>}
 */
export async function verifierNotification(env, raw) {
  const lectures = lecturesDuCorps(raw);
  for (const { variante, params } of lectures) {
    if (await verifyRetourMac(env, params)) {
      return { valide: true, params, variante, variantesEssayees: lectures.map((l) => l.variante) };
    }
  }
  // Aucune ne correspond : on rend la lecture standard pour que l'appelant
  // puisse journaliser la référence et le code-retour, sans rien en croire.
  const repli = lectures[0] || { params: {} };
  return {
    valide: false,
    params: repli.params,
    variante: null,
    variantesEssayees: lectures.map((l) => l.variante),
  };
}

/**
 * Le code-retour indique-t-il un paiement accepté ?
 *  - « paiement »  : accepté en production
 *  - « payetest »  : accepté en environnement de test (sandbox)
 *  - « annulation »: refusé
 *  - « attente_partenaire » : en attente d'une validation externe
 */
export function isPaiementAccepte(codeRetour) {
  const c = String(codeRetour || "").toLowerCase();
  return c === "paiement" || c === "payetest" || /^paiement_pf\d$/.test(c);
}

/**
 * Accusé de réception attendu par Monetico (30 s max pour répondre).
 * cdr=0 → sceau validé et notification traitée. cdr=1 → problème.
 */
export function ackResponse(ok = true) {
  return new Response(`version=2\ncdr=${ok ? 0 : 1}\n`, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
