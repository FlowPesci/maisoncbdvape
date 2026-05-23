/**
 * functions/_shared/auth.js
 * Vérifie un Bearer token GitHub : valide le token via /user,
 * puis contrôle que le login est dans la liste blanche ADMIN_GITHUB_USERS.
 *
 * ADMIN_GITHUB_USERS : logins GitHub autorisés, séparés par virgule.
 * Ex : "FlowPesci,autrelogin"
 * Si absent : seul "FlowPesci" est autorisé (fallback sécurisé).
 */

const GITHUB_API = "https://api.github.com";

export async function requireGithubUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/.exec(auth);
  if (!match) return { error: { status: 401, message: "Token manquant" }, user: null };
  const token = match[1];

  // 1. Vérifier que le token est valide → /user
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "tabacgex-admin" },
  });
  if (!userRes.ok) return { error: { status: 401, message: "Token GitHub invalide" }, user: null };
  const user = await userRes.json();

  // 2. Vérifier que le login est dans la liste blanche
  const rawAllowed = env.ADMIN_GITHUB_USERS || "FlowPesci";
  const allowed = rawAllowed.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(user.login.toLowerCase())) {
    console.warn("[auth] Acces refuse pour :", user.login);
    return { error: { status: 403, message: "Acces refuse" }, user: null };
  }

  return { user: { login: user.login, email: user.email, name: user.name }, error: null };
}
