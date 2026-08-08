(function () {
  var statusEl = document.getElementById('avis-status');
  var panel    = document.getElementById('avis-panel');
  var liste    = document.getElementById('avis-liste');
  var etat     = 'attente';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  function showLogin() {
    panel.classList.add('hidden');
    statusEl.innerHTML =
      '<p class="text-smoke text-sm mb-4">Connexion requise.</p>' +
      '<a href="/api/auth/login?mode=admin&return=/admin/avis/" class="btn-neon-green inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-widest">Se connecter via GitHub</a>';
    statusEl.classList.remove('hidden');
  }

  function etoiles(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += (i <= n ? '★' : '☆');
    return out;
  }

  function carte(a) {
    // Les actions proposées dépendent de l'état : republier un avis déjà
    // publié n'a pas de sens, et l'afficher inviterait à cliquer pour rien.
    var actions = '';
    if (a.etat !== 'publie') actions += '<button data-publier="' + a.id + '" class="btn-gold px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider">Publier</button>';
    if (a.etat !== 'refuse') actions += '<button data-refuser="' + a.id + '" class="btn-outline-violet px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider">Refuser</button>';

    return '<div class="rounded-xl border border-dark-border bg-dark-card p-5">' +
      '<div class="flex items-start justify-between gap-4 flex-wrap mb-2">' +
        '<div class="min-w-0">' +
          '<div class="text-white text-sm font-semibold">' + esc(a.auteur) + '</div>' +
          '<div class="text-smoke text-xs font-mono">' + esc(a.produitId) + ' · commande ' + esc(a.orderId) + '</div>' +
        '</div>' +
        '<div class="text-right shrink-0">' +
          '<div style="color:var(--gold);font-size:1.05rem;letter-spacing:.1em;">' + etoiles(a.note) + '</div>' +
          '<div class="text-smoke text-xs">' + window.MCV_DATE.courte(a.creeLe) + '</div>' +
        '</div>' +
      '</div>' +
      (a.commentaire ? '<p class="text-smoke text-sm leading-relaxed my-3">' + esc(a.commentaire) + '</p>' : '') +
      '<div class="flex items-center gap-2 flex-wrap mt-3">' + actions + '</div>' +
    '</div>';
  }

  function charger() {
    if (!window.MCV_ADMIN.connecte()) return showLogin();
    fetch('/api/avis?etat=' + etat)
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { window.MCV_ADMIN.oublier().then(showLogin); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;
        liste.innerHTML = (d.avis || []).length
          ? d.avis.map(carte).join('')
          : '<p class="text-smoke text-sm py-10 text-center">Aucun avis dans cette file.</p>';
        statusEl.classList.add('hidden');
        panel.classList.remove('hidden');
      })
      .catch(function (e) {
        statusEl.innerHTML = '<p class="text-red-300 text-sm">' + esc(e.message) + '</p>';
        statusEl.classList.remove('hidden');
      });
  }

  function moderer(id, nouvelEtat, bouton) {
    bouton.disabled = true;
    fetch('/api/avis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), etat: nouvelEtat }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j.error || 'Action refusée');
        charger();
      })
      .catch(function (e) { alert(e.message); bouton.disabled = false; });
  }

  liste.addEventListener('click', function (e) {
    var pub = e.target.closest('[data-publier]');
    if (pub) return moderer(pub.dataset.publier, 'publie', pub);
    var ref = e.target.closest('[data-refuser]');
    if (ref) return moderer(ref.dataset.refuser, 'refuse', ref);
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-etat]'), function (b) {
    b.addEventListener('click', function () {
      etat = b.dataset.etat;
      Array.prototype.forEach.call(document.querySelectorAll('[data-etat]'), function (x) {
        x.classList.toggle('is-active', x === b);
      });
      charger();
    });
  });

  charger();
})();
