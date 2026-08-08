/**
 * functions/_shared/auth.js
 *
 * Le jeton GitHub n'est plus jamais transmis par le navigateur : il vit côté
 * serveur dans OAUTH_KV, retrouvé via le cookie de session posé au callback
 * OAuth (voir _shared/session.js). Avant, chaque requête admin repassait par
 * l'API GitHub pour revalider un Bearer token lu dans localStorage — lisible
 * par tout script du domaine. Ici, la validation GitHub n'a lieu qu'une fois,
 * à la création de la session ; chaque requête ne fait plus qu'un contrôle
 * local, bon marché, de la liste blanche.
 *
 * ADMIN_GITHUB_USERS : logins GitHub autorisés, séparés par virgule.
 * Ex : "FlowPesci,autrelogin"
 * Si absent : seul "FlowPesci" est autorisé (fallback sécurisé).
 */

import { lireSession } from "./session.js";

const GITHUB_API = "https://api.github.com";

/**
 * Valide un jeton GitHub brut auprès de l'API. N'est appelé qu'une fois, au
 * moment de l'échange OAuth (functions/api/auth/callback.js) — jamais à
 * chaque requête.
 * @param {string} token
 * @returns {Promise<{ login: string, email: string, name: string } | null>}
 */
export async function verifierJetonGithub(token) {
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "tabacgex-admin" },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  return { login: user.login, email: user.email, name: user.name };
}

/** @param {string} login @param {{ ADMIN_GITHUB_USERS?: string }} env */
export function estAutorise(login, env) {
  const rawAllowed = env.ADMIN_GITHUB_USERS || "FlowPesci";
  const allowed = rawAllowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(String(login || "").toLowerCase());
}

export async function requireGithubUser(request, env) {
  const session = await lireSession(env.OAUTH_KV, request);
  if (!session) return { error: { status: 401, message: "Session absente" }, user: null };

  if (!estAutorise(session.login, env)) {
    console.warn("[auth] Acces refuse pour :", session.login);
    return { error: { status: 403, message: "Acces refuse" }, user: null };
  }

  // Defense en profondeur CSRF : le cookie de session part automatiquement
  // avec toute requête same-site, y compris une requête forgée par un autre
  // site. SameSite=Lax bloque déjà le cas fetch/XHR cross-site ; ce contrôle
  // est une seconde barrière pour les méthodes qui modifient l'état.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const site = request.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none") {
      return { error: { status: 403, message: "Origine refusee" }, user: null };
    }
  }

  return { user: { login: session.login }, error: null };
}
