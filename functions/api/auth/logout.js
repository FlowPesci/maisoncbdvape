/**
 * functions/api/auth/logout.js
 * Détruit la session admin : supprime l'entrée OAUTH_KV et expire les deux
 * cookies posés au callback (session HttpOnly + indicateur d'affichage).
 */

import { detruireSession } from "../../_shared/session.js";

export async function onRequestPost({ request, env }) {
  const cookies = await detruireSession(env.OAUTH_KV, request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  cookies.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 204, headers });
}
