/**
 * functions/api/auth/callback.js
 * Callback OAuth GitHub.
 *  - decap : renvoie HTML qui postMessage au parent (Decap gère son propre
 *    jeton, dans son propre localStorage — hors de notre contrôle). On pose
 *    en plus, en best-effort, notre cookie de session : c'est ce qui évite
 *    une seconde connexion pour ouvrir /admin/stocks/ juste après.
 *  - admin : crée la session côté serveur, pose le cookie, redirige vers la
 *    page d'origine. Le jeton ne transite plus jamais par l'URL.
 */

import { verifierJetonGithub, estAutorise } from "../../_shared/auth.js";
import { creerSession } from "../../_shared/session.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return new Response("Parametres manquants", { status: 400 });

  // Verification CSRF obligatoire via le state stocke en KV.
  if (!env.OAUTH_KV) return new Response("OAUTH_KV non configure — verification CSRF impossible", { status: 500 });

  const stored = await env.OAUTH_KV.get("state:" + state);
  if (!stored) {
    console.warn("[auth/callback] State OAuth invalide ou expire :", state);
    return new Response("Session OAuth expiree ou invalide. Veuillez recommencer.", { status: 400 });
  }
  let stateData = { mode: "decap", return: "/admin/commandes/" };
  try { stateData = JSON.parse(stored); } catch {}
  await env.OAUTH_KV.delete("state:" + state);

  // Echange code => access_token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) return new Response("Echange token echoue", { status: 502 });
  const data = await tokenRes.json();
  if (data.error || !data.access_token) {
    return new Response("Erreur OAuth : " + (data.error_description || data.error || "inconnue"), { status: 400 });
  }

  const token = data.access_token;
  const siteOrigin = env.SITE_URL
    ? new URL(env.SITE_URL).origin
    : (url.protocol + "//" + url.host);
  const siteUrl = env.SITE_URL || (url.protocol + "//" + url.host);

  if (stateData.mode === "admin") {
    const user = await verifierJetonGithub(token);
    if (!user || !estAutorise(user.login, env)) {
      console.warn("[auth/callback] Acces admin refuse pour :", user && user.login);
      return new Response("Acces refuse : ce compte GitHub n'est pas autorise.", { status: 403 });
    }

    // Securite open-redirect : on n'accepte que des chemins relatifs.
    let ret = stateData.return || "/admin/commandes/";
    if (ret.startsWith("http") || ret.startsWith("//") || !ret.startsWith("/")) {
      console.warn("[auth/callback] Return URL externe rejetee :", ret);
      ret = "/admin/commandes/";
    }

    const cookies = await creerSession(env.OAUTH_KV, { token, login: user.login });
    const headers = new Headers({ Location: siteUrl + ret, "Cache-Control": "no-store" });
    cookies.forEach((c) => headers.append("Set-Cookie", c));
    return new Response(null, { status: 302, headers });
  }

  // Mode Decap : handshake 3 etapes. On tente en plus une session interne —
  // en best-effort, sans jamais bloquer Decap si ce compte n'a pas accès à
  // nos propres écrans.
  let cookiesDecap = [];
  try {
    const user = await verifierJetonGithub(token);
    if (user && estAutorise(user.login, env)) {
      cookiesDecap = await creerSession(env.OAUTH_KV, { token, login: user.login });
    }
  } catch (e) {
    console.warn("[auth/callback] Session interne non creee (mode decap) :", e);
  }

  const tokenJson = JSON.stringify(token);
  const originJson = JSON.stringify(siteOrigin);
  const html = "<!doctype html><html><head><meta charset=\"utf-8\"/><title>Auth OK</title></head><body><script>(function(){"
    + "var token=" + tokenJson + ";"
    + "var allowedOrigin=" + originJson + ";"
    + "var sent=false;"
    + "function sendAuth(targetOrigin){"
    + "if(sent)return;sent=true;"
    + "window.removeEventListener('message',onMessage,false);"
    + "var payload=JSON.stringify({token:token,provider:'github'});"
    + "window.opener.postMessage('authorization:github:success:'+payload,targetOrigin);"
    + "setTimeout(function(){window.close();},500);"
    + "}"
    + "function onMessage(event){"
    + "if(event.origin!==allowedOrigin)return;"
    + "sendAuth(event.origin);"
    + "}"
    + "if(window.opener){"
    + "window.addEventListener('message',onMessage,false);"
    + "window.opener.postMessage('authorizing:github',allowedOrigin);"
    + "setTimeout(function(){sendAuth(allowedOrigin);},5000);"
    + "}else{"
    + "document.body.innerText='Authentification reussie. Vous pouvez fermer cet onglet.';"
    + "}"
    + "})();</script></body></html>";

  const headers = new Headers({ "Content-Type": "text/html", "Cache-Control": "no-store" });
  cookiesDecap.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(html, { status: 200, headers });
}
