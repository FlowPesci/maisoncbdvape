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

  const key = String(body.key);

  // Sécurité : empêche de quitter le préfixe attendu
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    return bad("Clé invalide");
  }

  // Le bucket ne contient pas que des médias de la boutique. La lecture
  // publique (functions/media/[[key]].js) est déjà restreinte à ces deux
  // préfixes ; la suppression, elle, acceptait n'importe quelle clé. Un
  // compte d'administration est nécessaire pour l'atteindre, mais l'écart
  // entre les deux règles est exactement le genre de détail qui devient un
  // problème le jour où un second compte est ajouté.
  const PREFIXES_AUTORISES = ["produits/", "ui/"];
  if (!PREFIXES_AUTORISES.some((p) => key.startsWith(p))) {
    return bad("Suppression hors des dossiers autorisés : " + key, 403);
  }

  await env.MEDIA.delete(key);
  return ok({ deleted: key });
}
