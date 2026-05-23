/**
 * functions/_shared/ratelimit.js
 * Rate limiting basé sur KV (ORDERS_KV).
 *
 * Clé KV : "rl:<namespace>:<identifier>"
 * Valeur  : { count: N, windowStart: <timestamp ms> }
 *
 * Usage :
 *   import { rateLimit } from "../_shared/ratelimit.js";
 *   const limited = await rateLimit(env.ORDERS_KV, "contact", clientIp, { max: 5, windowSecs: 60 });
 *   if (limited) return bad("Trop de requêtes. Réessayez dans quelques minutes.", 429);
 */

/**
 * @param {KVNamespace} kv
 * @param {string} namespace  - ex: "contact", "reservation", "track"
 * @param {string} identifier - ex: IP ou email
 * @param {{ max: number, windowSecs: number }} opts
 * @returns {Promise<boolean>} true si la requête doit être bloquée
 */
export async function rateLimit(kv, namespace, identifier, { max, windowSecs }) {
  if (!kv || !identifier) return false; // Pas de KV ou pas d'IP → ne pas bloquer

  const key = `rl:${namespace}:${identifier}`;
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  let entry = { count: 0, windowStart: now };
  try {
    const stored = await kv.get(key);
    if (stored) entry = JSON.parse(stored);
  } catch {}

  // Si la fenêtre est expirée, on repart à zéro
  if (now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count += 1;

  // Sauvegarde (TTL = durée fenêtre + 60s de marge)
  try {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: windowSecs + 60 });
  } catch {}

  return entry.count > max;
}

/**
 * Extrait l'IP du client depuis les headers Cloudflare.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
