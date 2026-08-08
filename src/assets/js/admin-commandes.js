(function() {
  /** Échappe les caractères HTML pour prévenir les injections XSS */
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }


  const statusEl = document.getElementById('orders-status');
  const tableEl  = document.getElementById('orders-table');
  const tbody    = document.getElementById('orders-tbody');
  const filters  = document.getElementById('status-filters');
  // Déconnexion : gérée par la barre d'admin commune (partials/admin-nav.njk).

  /** Session périmée ou révoquée : on l'oublie et on redemande la connexion. */
  function logout() {
    window.MCV_ADMIN.oublier().then(showLogin);
  }

  function showLogin() {
    filters.classList.add('hidden');
    tableEl.classList.add('hidden');
    statusEl.innerHTML = `
      <p class="text-smoke text-sm mb-4">Connexion via GitHub requise pour accéder à la gestion des commandes.</p>
      <a href="/api/auth/login?mode=admin&return=/admin/commandes/" class="btn-neon-green inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-widest">
        Se connecter via GitHub
      </a>`;
    statusEl.classList.remove('hidden');
  }


  // ⚠ Les couleurs doivent rester des hex littéraux : le template ci-dessous
  //   concatène un suffixe d'opacité (`${m.color}22`), ce qu'une var() ne permet pas.
  function statusBadge(status) {
    const map = {
      pending:    { label: 'En attente', color: '#FFA500' },
      paid:       { label: 'Payée',      color: '#39FF14' },
      preparing:  { label: 'En préparation', color: '#BF5FFF' },
      ready:      { label: 'Prête',      color: '#00D4FF' },
      completed:  { label: 'Récupérée',  color: '#8A8A9A' },
      cancelled:  { label: 'Annulée',    color: '#FF5050' },
    };
    const m = map[status] || { label: status, color: '#8A8A9A' };
    return `<span style="background:${m.color}22;color:${m.color};border:1px solid ${m.color}55;" class="text-xs font-mono font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">${m.label}</span>`;
  }
  function formatEur(n) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n); }
  function formatDate(iso) {
    const d = new Date(iso);
    return window.MCV_DATE.dateHeure(d);
  }

  async function loadOrders(status = '') {
    if (!window.MCV_ADMIN.connecte()) return showLogin();
    statusEl.innerHTML = '<p class="text-smoke text-sm">Chargement…</p>';
    statusEl.classList.remove('hidden');
    tableEl.classList.add('hidden');
    filters.classList.add('hidden');

    const url = '/api/list-orders' + (status ? '?status=' + encodeURIComponent(status) : '');
    try {
      const res = await fetch(url);
      if (res.status === 401 || res.status === 403) return logout();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const { orders } = await res.json();

      filters.classList.remove('hidden');
      filters.classList.add('flex');

      if (!orders.length) {
        statusEl.innerHTML = '<p class="text-smoke text-sm">Aucune commande pour ce filtre.</p>';
        return;
      }
      tbody.innerHTML = orders.map((o) => `
        <tr class="border-b border-dark-border hover:bg-white/[0.02] transition-colors">
          <td class="py-3 px-4 font-mono text-xs text-white">${esc(o.orderId)}</td>
          <td class="py-3 px-4 text-smoke text-xs">${formatDate(o.createdAt)}</td>
          <td class="py-3 px-4">
            <div class="text-white">${esc(o.client.nom)}</div>
            <div class="text-smoke text-xs">${esc(o.client.email)}</div>
          </td>
          <td class="py-3 px-4 font-mono text-white">${formatEur(o.totalTTC)}</td>
          <td class="py-3 px-4 text-xs text-smoke">${o.paiement?.methode === 'monetico' ? '💳 Monetico' : '🏪 Magasin'}</td>
          <td class="py-3 px-4">${statusBadge(esc(o.status))}</td>
          <td class="py-3 px-4 text-right">
            <a href="/admin/commande/?id=${encodeURIComponent(o.orderId)}" class="text-neon-violet text-xs hover:underline">Détail →</a>
          </td>
        </tr>`).join('');
      statusEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
    } catch (err) {
      statusEl.innerHTML = `<p class="text-red-400 text-sm">Erreur : ${err.message}</p>`;
    }
  }

  filters?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter-status]');
    if (!btn) return;
    document.querySelectorAll('#status-filters .filter-pill').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    loadOrders(btn.dataset.filterStatus);
  });

  if (token) loadOrders(''); else showLogin();
})();
