/**
 * functions/api/media/upload.js
 * POST multipart : recoit un fichier, l'enregistre dans R2 (binding env.MEDIA),
 * retourne l'URL publique. Auth GitHub Bearer requis.
 * R2 key = "produits/<timestamp>-<slug>.<ext>"
 */
import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad } from "../../_shared/http.js";

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  // image/svg+xml retire : les SVG peuvent contenir du JavaScript (risque XSS)
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function slugifyFilename(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function onRequestPost({ request, env }) {
  if (!env.MEDIA) return bad("R2 non configure cote serveur", 500);

  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  let formData;
  try { formData = await request.formData(); }
  catch { return bad("Multipart attendu"); }

  const file = formData.get("file");
  if (!file || typeof file === "string") return bad("Champ 'file' manquant");
  if (!ALLOWED_TYPES.has(file.type)) return bad("Type non autorise : " + file.type);
  if (file.size > MAX_BYTES) return bad("Fichier trop volumineux (max " + (MAX_BYTES / 1024 / 1024) + " MB)");

  const folder = (formData.get("folder") || "produits").toString().replace(/[^a-z0-9-]/g, "");
  const baseName = slugifyFilename(file.name || "image");
  const key = folder + "/" + Date.now() + "-" + baseName;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return ok({
    key,
    url: "/media/" + key,
    name: file.name,
    size: file.size,
    type: file.type,
  });
}
