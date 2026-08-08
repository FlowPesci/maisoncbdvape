(function () {
  /**
   * `mcv_admin_hint` est un cookie non-HttpOnly, sans valeur secrète : il ne
   * sert qu'à savoir qu'une session existe côté serveur, pour afficher le
   * bouton de déconnexion. Le jeton lui-même n'est jamais accessible ici.
   */
  function connecte() {
    return document.cookie.indexOf('mcv_admin_hint=') !== -1;
  }

  function oublier() {
    return fetch('/api/auth/logout', { method: 'POST' }).catch(function () {});
  }

  window.MCV_ADMIN = {
    connecte: connecte,
    oublier: oublier,
    lienConnexion: function (retour) {
      return '/api/auth/login?mode=admin&return=' + encodeURIComponent(retour || location.pathname);
    },
  };

  var sortie = document.getElementById('admin-deconnexion');
  if (sortie && connecte()) {
    sortie.hidden = false;
    sortie.addEventListener('click', function () { oublier().then(function () { location.reload(); }); });
  }
})();
