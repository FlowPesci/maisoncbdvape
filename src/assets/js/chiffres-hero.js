/**
 * src/assets/js/chiffres-hero.js — les chiffres du hero (109+, 4,4★, 48h)
 * défilent jusqu'à leur valeur à l'arrivée
 *
 * Interrupteur : `site.json → effets.chiffresHero` (index.njk ne pose
 * `data-compteur` et ne charge ce fichier que s'il est vrai).
 *
 * ⚠ Les VRAIS chiffres sont dans le HTML, rendus côté serveur — c'est eux que
 *   lisent Google, les lecteurs d'écran, et le visiteur si ce script ne tourne
 *   pas. Le script les part de zéro puis les REMET exactement tels quels à la
 *   fin (texte d'origine recopié, jamais reformaté) : « 4,4★ » ne peut pas
 *   finir en « 4,40★ » ni le nombre de références s'écarter du catalogue.
 * ⚠ Si le portail d'âge est affiché, l'animation attend qu'on le franchisse :
 *   sinon elle se jouerait derrière, pour personne.
 */
(function () {
  var cibles = document.querySelectorAll('[data-compteur]');
  if (!cibles.length || !window.requestAnimationFrame) return;
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}

  var items = [];
  for (var i = 0; i < cibles.length; i++) {
    var el = cibles[i], texte = el.textContent.trim();
    var m = texte.match(/^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!m) continue;
    var dec = (m[2].split(/[.,]/)[1] || '').length;
    items.push({ el: el, texte: texte, avant: m[1], apres: m[3], valeur: parseFloat(m[2].replace(',', '.')), dec: dec, virgule: m[2].indexOf(',') !== -1 });
  }
  if (!items.length) return;

  function ecrire(it, v) {
    var s = v.toFixed(it.dec);
    if (it.virgule) s = s.replace('.', ',');
    it.el.textContent = it.avant + s + it.apres;
  }
  /* Point de départ posé tout de suite : la colonne du hero est encore
     invisible (fondu d'entrée à .4 s), on ne voit donc jamais « 109+ »
     sauter à « 0+ ». */
  items.forEach(function (it) { ecrire(it, 0); });

  function lancer() {
    var debut = window.performance.now(), duree = 1600;
    function image(t) {
      var p = Math.min(1, (t - debut) / duree), e = 1 - Math.pow(1 - p, 3);
      items.forEach(function (it, k) {
        /* Léger décalage entre les trois : ils ne finissent pas au même instant. */
        var pk = Math.min(1, Math.max(0, (e * 1.15) - k * .075));
        if (p >= 1) it.el.textContent = it.texte; else ecrire(it, it.valeur * pk);
      });
      if (p < 1) window.requestAnimationFrame(image);
    }
    window.requestAnimationFrame(image);
  }

  var portail = document.getElementById('age-gate');
  var oui = document.getElementById('age-gate-yes');
  if (portail && oui && window.getComputedStyle && window.getComputedStyle(portail).display !== 'none') {
    oui.addEventListener('click', function () { setTimeout(lancer, 900); });
  } else {
    setTimeout(lancer, 1100);   // après le fondu d'entrée de la colonne
  }
})();
