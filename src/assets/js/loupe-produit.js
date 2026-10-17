/**
 * src/assets/js/loupe-produit.js — loupe sur la photo principale de la fiche
 *
 * Ordinateur : au survol, la photo s'agrandit sous la souris, qui la parcourt.
 * Téléphone  : toucher deux fois zoome à l'endroit touché, le doigt promène la
 *              loupe, toucher deux fois encore revient à la normale.
 *
 * Interrupteur : `site.json → effets.loupeProduit` (produit-detail.njk ne
 * charge ce fichier que s'il est vrai). Voir CLAUDE.md, « Effets visuels ».
 *
 * ⚠ C'est un outil, pas un décor : la photo n'est jamais altérée, seulement
 *   agrandie. Elle est restituée telle quelle dès qu'on sort.
 * ⚠ Un changement de photo (miniature, saveur) remplace `src` de la même
 *   image : la loupe suit sans rien savoir de la galerie.
 * ⚠ Le zoom se fait par `transform` sur l'image : quitter la loupe le retire
 *   TOUJOURS — sinon la transition de page (transitions-pages.js) partirait
 *   d'une photo agrandie.
 */
(function () {
  var cadre = document.getElementById('main-image-wrap');
  var img = document.getElementById('main-image');
  if (!cadre || !img || !window.matchMedia) return;

  var ZOOM = 2.2;
  var reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var souris = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  img.style.transition = reduit ? 'none' : 'transform .28s cubic-bezier(.2,.7,.3,1)';

  function viser(cx, cy) {
    var r = cadre.getBoundingClientRect();
    var x = Math.max(0, Math.min(100, (cx - r.left) / r.width * 100));
    var y = Math.max(0, Math.min(100, (cy - r.top) / r.height * 100));
    img.style.transformOrigin = x + '% ' + y + '%';
  }
  function zoomer(oui) {
    img.style.transform = oui ? 'scale(' + ZOOM + ')' : '';
    cadre.classList.toggle('loupe-active', oui);
    if (!oui) img.style.transformOrigin = '';
  }

  if (souris) {
    cadre.classList.add('loupe-souris');
    cadre.addEventListener('mouseenter', function (e) {
      if (e.target.closest && e.target.closest('button')) return;
      viser(e.clientX, e.clientY); zoomer(true);
    });
    cadre.addEventListener('mousemove', function (e) {
      /* Sur le bouton « favoris », la loupe s'efface : on doit pouvoir cliquer. */
      if (e.target.closest && e.target.closest('button')) { zoomer(false); return; }
      if (!cadre.classList.contains('loupe-active')) zoomer(true);
      viser(e.clientX, e.clientY);
    });
    cadre.addEventListener('mouseleave', function () { zoomer(false); });
    return;
  }

  /* ─── Écran tactile : double toucher ──────────────────────────────────── */
  /* `manipulation` désactive le zoom natif du navigateur au double toucher :
     sinon il agrandirait toute la page en même temps que la loupe. */
  cadre.style.touchAction = 'manipulation';
  var dernier = 0, lx = 0, ly = 0, zoome = false;

  var indice = document.createElement('span');
  indice.className = 'loupe-indice';
  indice.setAttribute('aria-hidden', 'true');
  indice.textContent = 'Toucher deux fois pour zoomer';
  cadre.appendChild(indice);
  var cacherIndice = function () { indice.classList.add('loupe-indice-off'); };
  setTimeout(cacherIndice, 4000);

  cadre.addEventListener('touchend', function (e) {
    if (e.target.closest && e.target.closest('button')) return;
    var t = e.changedTouches[0], maintenant = Date.now();
    var double = maintenant - dernier < 320 && Math.abs(t.clientX - lx) < 30 && Math.abs(t.clientY - ly) < 30;
    dernier = double ? 0 : maintenant; lx = t.clientX; ly = t.clientY;
    if (!double) return;
    e.preventDefault();
    cacherIndice();
    zoome = !zoome;
    if (zoome) viser(t.clientX, t.clientY);
    zoomer(zoome);
    /* Zoomée, la photo capte le doigt pour être explorée ; sinon la page
       défile normalement. */
    cadre.style.touchAction = zoome ? 'none' : 'manipulation';
  });
  cadre.addEventListener('touchmove', function (e) {
    if (!zoome) return;
    e.preventDefault();
    var t = e.touches[0];
    viser(t.clientX, t.clientY);
  }, { passive: false });
})();
