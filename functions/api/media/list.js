/**
 * functions/api/media/list.js
 * GET ?folder=produits → liste les objets R2 dans ce préfixe.
 * Auth GitHub Bearer requis.
 */
import { requireGithubUser } from "../../_shared/auth.js";
import { ok, bad } from "../../_shared/http.js";

export async function onRequestGet({ request, env }) {
  if (!env.MEDIA) return bad("R2 non configuré", 500);
  const auth = await requireGithubUser(request, env);
  if (auth.error) return bad(auth.error.message, auth.error.status);

  const url = new URL(request.url);
  const folder = (url.searchParams.get("folder") || "produits").replace(/[^a-z0-9-]/g, "");
  const cursor = url.searchParams.get("cursor") || undefined;

  const result = await env.MEDIA.list({
    prefix: folder + "/",
    limit: 1000,
    cursor,
  });

  const files = result.objects.map((obj) => ({
    key: obj.key,
    url: `/media/${obj.key}`,
    name: obj.key.split("/").pop(),
    size: obj.size,
    uploaded: obj.uploaded,
    contentType: obj.httpMetadata?.contentType || "",
  }));

  return ok({
    files,
    truncated: result.truncated || false,
    cursor: result.cursor || null,
  });
}
