(function () {
  var login    = document.getElementById('admin-login');
  var contenu  = document.getElementById('admin-contenu');

  if (!window.MCV_ADMIN.connecte()) {
    document.getElementById('admin-login-lien').href = window.MCV_ADMIN.lienConnexion('/admin/');
    login.classList.remove('hidden');
    contenu.classList.add('hidden');
    return;
  }

  var poser = function (id, valeur, alerte) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = valeur;
    if (alerte && Number(valeur) > 0) el.classList.add('admin-tuile-alerte');
  };

  // Les compteurs sont indicatifs : un service indisponible laisse un tiret
  // plutôt qu'un chiffre faux ou un écran d'erreur.
  fetch('/api/list-orders').then(function (r) {
    if (r.status === 401 || r.status === 403) { window.MCV_ADMIN.oublier().then(function () { location.reload(); }); return null; }
    return r.ok ? r.json() : null;
  }).then(function (d) {
    if (!d) return;
    var aTraiter = (d.orders || []).filter(function (o) {
      return ['pending', 'paid', 'preparing'].indexOf(o.status) !== -1;
    }).length;
    poser('kpi-commandes', aTraiter);
  }).catch(function () {});

  fetch('/api/stocks')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      poser('kpi-ruptures', d.ruptures, true);
      poser('kpi-faibles', d.faibles);
    }).catch(function () {});

  fetch('/api/reception')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      poser('kpi-receptions', (d.historique || []).length);
    }).catch(function () {});
})();
