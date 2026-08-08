(function () {
  // Ni sur le back-office lui-même, ni dans un iframe.
  if (location.pathname.indexOf('/admin/') === 0 || window.top !== window.self) return;

  if (document.cookie.indexOf('mcv_admin_hint=') === -1) return;

  var lien = document.createElement('a');
  lien.href = '/admin/';
  lien.className = 'raccourci-admin';
  lien.setAttribute('aria-label', 'Ouvrir le back-office');
  lien.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>' +
    '</svg><span>Back-office</span><span class="raccourci-admin-pastille" hidden></span>';
  // Sur une fiche produit, la barre d'achat occupe le bas de l'écran mobile.
  if (document.getElementById('sticky-buy')) lien.classList.add('est-au-dessus-barre');

  document.body.appendChild(lien);

  // Compteur des commandes à traiter : savoir qu'il y a du travail sans avoir
  // à ouvrir le back-office. Silencieux en cas d'échec — un raccourci n'a pas
  // à afficher d'erreur par-dessus la boutique.
  fetch('/api/list-orders')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      var n = (d.orders || []).filter(function (o) {
        return ['pending', 'paid', 'preparing'].indexOf(o.status) !== -1;
      }).length;
      if (!n) return;
      var p = lien.querySelector('.raccourci-admin-pastille');
      p.textContent = n > 99 ? '99+' : n;
      p.hidden = false;
    })
    .catch(function () {});
})();
