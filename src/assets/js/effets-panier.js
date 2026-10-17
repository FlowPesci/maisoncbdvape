/**
 * src/assets/js/effets-panier.js — retour visuel à l'ajout au panier
 *
 * La miniature du produit file en arc vers l'icône du panier, puis la
 * pastille du compteur rebondit.
 *
 * Interrupteur : `site.json → effets.ajoutPanier` (base.njk ne charge ce
 * fichier que s'il est vrai). Voir CLAUDE.md, « Effets visuels ».
 *
 * ⚠ Ce fichier n'AJOUTE rien au panier et ne décide de rien. Il écoute
 *   l'événement `mcv:ajout-panier` que `tabacgex.js` émet APRÈS un ajout
 *   réussi — donc jamais quand l'ajout est refusé (saveur ou format non
 *   choisi). Absent, cassé ou désactivé : le panier fonctionne pareil, et le
 *   bouton affiche toujours « ✓ Ajouté ! ».
 */
(function () {
  if (!window.Element || !window.Element.prototype.animate || !document.addEventListener) return;
  var reduit = false;
  try { reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function boite(el) { return el ? el.getBoundingClientRect() : null; }
  function aLEcran(r) {
    return r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  /* L'en-tête porte plusieurs liens « panier » selon la largeur d'écran :
     on vise celui qui est réellement affiché. */
  function panierAffiche() {
    var liens = document.querySelectorAll('[data-panier-lien]');
    for (var i = 0; i < liens.length; i++) if (aLEcran(boite(liens[i]))) return liens[i];
    return null;
  }

  function imageDuProduit(btn) {
    var carte = btn.closest('.product-card');
    if (carte) return carte.querySelector('img');
    if (btn.closest('#zone-achat, #sticky-buy')) return document.getElementById('main-image');
    return null;
  }

  function rebond(el) {
    el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(.88)' }, { transform: 'scale(1)' }],
      { duration: 480, easing: 'cubic-bezier(.3,.7,.4,1)' }
    );
  }

  /* L'arc vient de deux mouvements superposés : l'enveloppe file à
     l'horizontale en décélérant, la miniature tombe vers l'icône en
     accélérant. Leur somme dessine une courbe — sans calcul de trajectoire. */
  function vol(img, depart, cible, fin) {
    var t = Math.max(44, Math.min(depart.width, depart.height, 120));
    var x0 = depart.left + depart.width / 2 - t / 2, y0 = depart.top + depart.height / 2 - t / 2;
    var dx = cible.left + cible.width / 2 - (x0 + t / 2), dy = cible.top + cible.height / 2 - (y0 + t / 2);

    var env = document.createElement('div');
    env.setAttribute('aria-hidden', 'true');
    env.className = 'vol-panier';
    env.style.cssText = 'left:' + x0 + 'px;top:' + y0 + 'px;width:' + t + 'px;height:' + t + 'px;';
    var mini = document.createElement('img');
    mini.src = img.currentSrc || img.src; mini.alt = '';
    env.appendChild(mini);
    document.body.appendChild(env);

    var duree = 760;
    env.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + dx + 'px)' }],
      { duration: duree, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' });
    var a = mini.animate([
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(' + (dy * .15 - 30) + 'px) scale(.8)', opacity: 1, offset: .3 },
      { transform: 'translateY(' + dy + 'px) scale(.18)', opacity: .7 }
    ], { duration: duree, easing: 'cubic-bezier(.55,0,.8,.6)', fill: 'forwards' });
    a.onfinish = a.oncancel = function () { env.remove(); fin(); };
  }

  document.addEventListener('mcv:ajout-panier', function (e) {
    var btn = e.detail && e.detail.bouton;
    var panier = panierAffiche();
    if (!btn || !panier) return;
    var pastille = panier.querySelector('.cart-badge, [data-cart-count]') || panier;
    var fin = function () { rebond(pastille); };

    var img = imageDuProduit(btn);
    if (reduit || !img) { fin(); return; }   // mouvement réduit : la pastille seule
    /* Depuis la barre d'achat collante (téléphone), la grande photo est
       souvent hors de l'écran : le vol part alors du bouton. */
    var depart = aLEcran(boite(img)) ? boite(img) : boite(btn);
    vol(img, depart, boite(panier), fin);
  });
})();
