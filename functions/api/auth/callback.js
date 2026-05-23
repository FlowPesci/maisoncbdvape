/**
 * functions/api/auth/callback.js
 * Callback OAuth GitHub.
 *  - decap : renvoie HTML qui postMessage au parent
 *  - admin : redirect vers la page d'origine avec #token=... dans l'URL
 */

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

  if (stateData.mode === "admin") {
    // Securite open-redirect : on n'accepte que des chemins relatifs.
    let ret = stateData.return || "/admin/commandes/";
    if (ret.startsWith("http") || ret.startsWith("//") || !ret.startsWith("/")) {
      console.warn("[auth/callback] Return URL externe rejetee :", ret);
      ret = "/admin/commandes/";
    }
    const siteUrl = env.SITE_URL || (url.protocol + "//" + url.host);
    return Response.redirect(siteUrl + ret + "#token=" + encodeURIComponent(token), 302);
  }

  // Mode Decap : handshake 3 etapes
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

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
}
