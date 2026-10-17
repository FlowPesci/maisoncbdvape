/**
 * src/assets/js/portail-fumee.js — le portail d'âge se dissipe comme une fumée
 *
 * Au clic sur « Oui, j'ai 18 ans ou plus », l'écran sombre ne s'efface pas
 * d'un bloc : il se troue en volutes, des bords dorés montent et s'éteignent,
 * et l'accueil apparaît dessous — avec sa fumée déjà en mouvement.
 *
 * Interrupteur : `site.json → effets.portailFumee` (base.njk ne charge ce
 * fichier que s'il est vrai). Voir CLAUDE.md, « Effets visuels ».
 *
 * ⚠ Ce fichier ne DÉCIDE rien. Le portail lui-même — vérification, mémoire de
 *   session, refus — reste dans le script en ligne de base.njk, empreinté dans
 *   la CSP. Ce script ne fait qu'exposer `window.mcvSortiePortail()`, que le
 *   script en ligne appelle s'il existe. Absent, pas encore chargé, ou en
 *   échec (il renvoie `false`) : le portail retombe sur son simple fondu
 *   d'origine. Il ne peut donc jamais bloquer l'entrée sur le site.
 *
 * Technique : un petit canvas 2D (~160 px de large) agrandi au plein écran —
 * l'agrandissement adoucit les bords, ce qui donne leur flou de fumée. Chaque
 * cellule s'efface quand un seuil qui monte dépasse son bruit : la dissipation
 * part du bas et les dernières volutes s'élèvent avant de disparaître.
 */
(function () {
  window.mcvSortiePortail = function (portail, fin) {
    var cv = null;
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if (!window.requestAnimationFrame) return false;

      var W = window.innerWidth, H = window.innerHeight;
      var cw = 160, ch = Math.max(60, Math.round(cw * H / W));
      cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      cv.className = 'portail-fumee';
      cv.setAttribute('aria-hidden', 'true');
      var ctx = cv.getContext('2d');
      if (!ctx) return false;
      var px = ctx.createImageData(cw, ch), d = px.data;

      /* Bruit fractal précalculé, une valeur par cellule. */
      function h(x, y) { var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
      function n(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        var a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), e = h(ix + 1, iy + 1);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy;
      }
      function fbm(x, y) { return .5 * n(x, y) + .25 * n(x * 2.1, y * 2.1) + .125 * n(x * 4.3, y * 4.3) + .0625 * n(x * 8.7, y * 8.7); }

      /* Le canvas prend la place du fond du portail : même couleur, même opacité. */
      var fond = [26, 23, 20], opaque = 250;
      document.body.appendChild(cv);
      portail.style.background = 'transparent';
      portail.style.backdropFilter = portail.style.webkitBackdropFilter = 'none';

      /* Le contenu du portail (logo, question, boutons) s'élève et se brouille. */
      var contenu = portail.firstElementChild;
      if (contenu && contenu.animate) {
        contenu.animate([
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
          { opacity: 0, transform: 'translateY(-24px)', filter: 'blur(6px)' }
        ], { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      }

      var debut = window.performance.now(), duree = 1500, echelle = 3 / cw;
      function image(t) {
        var p = Math.min(1, (t - debut) / duree);
        var seuil = -.35 + p * 1.75;              // monte de « rien d'effacé » à « tout effacé »
        var monte = p * .9;                       // le motif s'élève pendant la dissipation
        for (var y = 0; y < ch; y++) {
          var bas = 1 - y / ch;                   // 1 en bas de l'écran, 0 en haut
          for (var x = 0; x < cw; x++) {
            var v = fbm(x * echelle * 1.6, (y / ch) * 3 * (ch / cw) * 1.6 + monte) * .75 + (1 - bas) * .45;
            var a = (v - seuil) / .16;            // largeur du bord adouci
            a = a < 0 ? 0 : a > 1 ? 1 : a;
            /* Bord doré : là où la fumée est en train de s'effacer, elle prend la
               lumière, comme les volutes du hero. */
            var bord = a * (1 - a) * 4;
            var i = (y * cw + x) * 4;
            d[i] = fond[0] + (201 - fond[0]) * bord * .55;
            d[i + 1] = fond[1] + (169 - fond[1]) * bord * .55;
            d[i + 2] = fond[2] + (110 - fond[2]) * bord * .55;
            d[i + 3] = a * opaque;
          }
        }
        ctx.putImageData(px, 0, 0);
        if (p < 1) { window.requestAnimationFrame(image); return; }
        cv.remove();
        fin();
      }
      window.requestAnimationFrame(image);
      return true;
    } catch (e) {
      /* Échec en route : on retire ce qu'on a posé, le portail fera son fondu. */
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
      return false;
    }
  };
})();
