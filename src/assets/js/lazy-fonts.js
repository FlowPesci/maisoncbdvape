/**
 * Bascule la feuille de polices Google Fonts de `media="print"` vers `all`
 * dès qu'elle est chargée — chargement non bloquant du rendu initial. Ancien
 * onload="this.media='all'" en dur : la CSP ne permet plus de gestionnaire
 * inline (voir CLAUDE.md, chantiers de sécurité).
 */
(function () {
  var link = document.getElementById('lazy-fonts');
  if (!link) return;
  if (link.sheet) { link.media = 'all'; return; } // déjà en cache
  link.addEventListener('load', function () { link.media = 'all'; }, { once: true });
})();
