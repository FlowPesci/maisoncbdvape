/**
 * functions/api/auth/login.js
 * Demarre l'OAuth GitHub. Deux modes :
 *  - mode=decap (defaut) : Decap CMS ouvre cette URL en popup, attend postMessage au callback.
 *    scope "repo,read:user" (Decap a besoin de repo pour lire/ecrire le contenu).
 *  - mode=admin&return=/admin/commandes/ : redirect vers la page d'origine avec #token=...
 *    scope "read:user" uniquement (on ne fait que verifier l'identite du collaborateur).
 */

const SCOPE_DECAP = "repo,read:user";
const SCOPE_ADMIN = "read:user";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) return new Response("GITHUB_OAUTH_CLIENT_ID manquant", { status: 500 });

  const mode = url.searchParams.get("mode") || "decap";
  const ret  = url.searchParams.get("return") || "/admin/commandes/";

  const state = crypto.randomUUID();
  const stateData = JSON.stringify({ mode, return: ret });
  if (env.OAUTH_KV) {
    await env.OAUTH_KV.put("state:" + state, stateData, { expirationTtl: 600 });
  }

  const scope = mode === "admin" ? SCOPE_ADMIN : SCOPE_DECAP;
  const siteUrl = env.SITE_URL || (url.protocol + "//" + url.host);
  const redirectUri = siteUrl + "/api/auth/callback";

  const ghUrl = new URL("https://github.com/login/oauth/authorize");
  ghUrl.searchParams.set("client_id", clientId);
  ghUrl.searchParams.set("redirect_uri", redirectUri);
  ghUrl.searchParams.set("scope", scope);
  ghUrl.searchParams.set("state", state);
  return Response.redirect(ghUrl.toString(), 302);
}
