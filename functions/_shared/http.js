/**
 * functions/_shared/http.js
 * Helpers pour les Pages Functions Cloudflare (Web Fetch API).
 */

const COMMON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...COMMON_HEADERS, ...extraHeaders },
  });
}

export const ok  = (payload) => jsonResponse(200, payload);
export const bad = (message, status = 400) => jsonResponse(status, { error: message });

export async function parseJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

export function redirect(url) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "no-store" },
  });
}

/** Format Eur depuis n'importe quel runtime JS. */
export const formatEur = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
