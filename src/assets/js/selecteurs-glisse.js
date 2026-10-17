/**
 * src/assets/js/selecteurs-glisse.js — un repère doré glisse d'un format (ou
 * d'une saveur) à l'autre, au lieu de sauter
 *
 * Interrupteur : `site.json → effets.selecteursGlisse` (produit-detail.njk ne
 * charge ce fichier que s'il est vrai). Voir CLAUDE.md, « Effets visuels ».
 *
 * ⚠ Ce script ne CHOISIT rien et ne touche à aucun choix. La classe `.active`
 *   reste posée par les scripts de la fiche (syncGram, syncVariante) ; on se
 *   contente de l'OBSERVER et de déplacer le repère dessus. Le prix, le
 *   libellé et l'ajout au panier n'en dépendent pas.
 * ⚠ La classe `.selecteur-glisse` (qui efface le cadre propre du bouton actif
 *   au profit du repère) n'est posée qu'APRÈS que le repère est en place : si
 *   ce script meurt avant, le bouton actif garde son cadre doré d'origine.
 */
(function () {
  if (!window.MutationObserver) return;
  var reduit = false;
  try { reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var boutons = document.querySelectorAll('.gram-btn, .variante-btn');
  var groupes = [];
  for (var i = 0; i < boutons.length; i++) {
    var g = boutons[i].parentNode;
    if (groupes.indexOf(g) === -1) groupes.push(g);
  }

  groupes.forEach(function (groupe) {
    var repere = document.createElement('span');
    repere.className = 'selecteur-repere';
    repere.setAttribute('aria-hidden', 'true');
    var pos = window.getComputedStyle ? window.getComputedStyle(groupe).position : 'static';
    if (pos === 'static') groupe.style.position = 'relative';
    groupe.insertBefore(repere, groupe.firstChild);
    var visible = false;

    function placer() {
      var actif = groupe.querySelector('.gram-btn.active, .variante-btn.active');
      if (!actif) { repere.style.opacity = '0'; visible = false; return; }
      var t = 'translate(' + actif.offsetLeft + 'px,' + actif.offsetTop + 'px)';
      /* Première apparition (saveur choisie pour la première fois) : le
         repère se pose sur place, sans traverser la liste. */
      if (!visible || reduit) {
        repere.style.transition = 'none';
        repere.style.transform = t;
        repere.style.width = actif.offsetWidth + 'px';
        repere.style.height = actif.offsetHeight + 'px';
        void repere.offsetWidth;
        repere.style.transition = '';
      } else {
        repere.style.transform = t;
        repere.style.width = actif.offsetWidth + 'px';
        repere.style.height = actif.offsetHeight + 'px';
      }
      repere.style.opacity = '1';
      visible = true;
    }

    placer();
    groupe.classList.add('selecteur-glisse');
    new window.MutationObserver(placer).observe(groupe, { subtree: true, attributes: true, attributeFilter: ['class'] });
    if (window.ResizeObserver) new window.ResizeObserver(placer).observe(groupe);
    else window.addEventListener('resize', placer);
  });
})();
