/**
 * functions/media/[[key]].js
 * GET /media/<key> => renvoie l'objet R2 public correspondant.
 * Lecture publique, cache fort CDN.
 */
export async function onRequestGet({ params, env }) {
  if (!env.MEDIA) return new Response("R2 non configure", { status: 500 });

  const keyParts = params.key;
  const key = Array.isArray(keyParts) ? keyParts.join("/") : String(keyParts || "");
  if (!key) return new Response("Cle manquante", { status: 400 });

  // Protection path-traversal
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    return new Response("Cle invalide", { status: 400 });
  }
  const ALLOWED_PREFIXES = ["produits/", "ui/"];
  if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
    return new Response("Acces non autorise", { status: 403 });
  }

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Image introuvable", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Source", "r2");

  return new Response(obj.body, { headers });
}
