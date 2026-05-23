/**
 * functions/api/media/delete.js
 * POST { key: "produits/..." } → supprime l'objet R2.
 * Auth GitHub Bearer requis.
 */
import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad, parseJson } from "../../_shared/http.js";

export async function onRequestPost({ request, env }) {
  if (!env.MEDIA) return bad("R2 non configuré", 500);
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const body = await parseJson(request);
  if (!body?.key) return bad("Champ 'key' requis");

  // Sécurité : empêche de quitter le préfixe attendu
  if (body.key.includes("..") || body.key.startsWith("/")) return bad("Clé invalide");

  await env.MEDIA.delete(body.key);
  return ok({ deleted: body.key });
}
