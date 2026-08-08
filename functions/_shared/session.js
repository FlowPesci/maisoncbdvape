/**
 * functions/_shared/session.js
 * Session d'administration : le navigateur ne porte qu'un identifiant opaque
 * (cookie HttpOnly), jamais le jeton GitHub lui-même.
 *
 * Avant : le jeton GitHub complet vivait dans localStorage, lisible par tout
 * script s'exécutant sur le domaine (voir CLAUDE.md, « chantiers de sécurité
 * ouverts »). Ici, le jeton reste côté serveur dans OAUTH_KV — déjà lié et
 * déjà utilisé pour l'état CSRF de l'échange OAuth (functions/api/auth/) — et
 * le cookie ne sert qu'à retrouver la session.
 *
 * Clé KV   : "sess:<id>"
 * Valeur   : { token, login, creeLe }
 * Cookie   : mcv_admin_session=<id>; HttpOnly; Secure; SameSite=Lax; Path=/
 *
 * Un second cookie, NON HttpOnly, sert uniquement à l'affichage côté client
 * (raccourci-admin.njk, bouton déconnexion) : il ne porte aucun secret, juste
 * "1" tant qu'une session existe.
 */

const COOKIE_SESSION = "mcv_admin_session";
const COOKIE_HINT = "mcv_admin_hint";
const TTL_SECS = 60 * 60 * 24 * 7; // 7 jours, comme une connexion GitHub classique

function serialiseCookie(nom, valeur, { httpOnly, maxAge }) {
  const parts = [`${nom}=${valeur}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  parts.push("Secure");
  parts.push(maxAge != null ? `Max-Age=${maxAge}` : "Max-Age=0");
  return parts.join("; ");
}

function lireCookie(request, nom) {
  const entete = request.headers.get("Cookie") || "";
  const match = entete
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(nom + "="));
  return match ? decodeURIComponent(match.slice(nom.length + 1)) : null;
}

/**
 * Crée une session et renvoie les deux Set-Cookie à poser sur la réponse.
 * @param {KVNamespace} kv
 * @param {{ token: string, login: string }} donnees
 * @returns {Promise<string[]>} valeurs à passer en en-têtes Set-Cookie (une par cookie)
 */
export async function creerSession(kv, { token, login }) {
  const id = crypto.randomUUID();
  await kv.put(
    `sess:${id}`,
    JSON.stringify({ token, login, creeLe: Date.now() }),
    { expirationTtl: TTL_SECS }
  );
  return [
    serialiseCookie(COOKIE_SESSION, id, { httpOnly: true, maxAge: TTL_SECS }),
    serialiseCookie(COOKIE_HINT, "1", { httpOnly: false, maxAge: TTL_SECS }),
  ];
}

/**
 * Résout la session à partir du cookie de la requête.
 * @param {KVNamespace} kv
 * @param {Request} request
 * @returns {Promise<{ token: string, login: string } | null>}
 */
export async function lireSession(kv, request) {
  const id = lireCookie(request, COOKIE_SESSION);
  if (!id || !kv) return null;
  try {
    const stored = await kv.get(`sess:${id}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Détruit la session courante et renvoie les Set-Cookie qui l'expirent.
 * @param {KVNamespace} kv
 * @param {Request} request
 * @returns {Promise<string[]>}
 */
export async function detruireSession(kv, request) {
  const id = lireCookie(request, COOKIE_SESSION);
  if (id && kv) {
    try { await kv.delete(`sess:${id}`); } catch {}
  }
  return [
    serialiseCookie(COOKIE_SESSION, "", { httpOnly: true, maxAge: null }),
    serialiseCookie(COOKIE_HINT, "", { httpOnly: false, maxAge: null }),
  ];
}
