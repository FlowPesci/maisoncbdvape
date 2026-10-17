/**
 * src/assets/js/transitions-pages.js — la photo d'une carte produit devient
 * celle de la fiche (et l'inverse au retour)
 *
 * Le fondu entre TOUTES les pages est du CSS pur : `@view-transition` posé
 * dans `head.njk` quand `site.json → effets.transitionsPages` est vrai. Ce
 * script n'ajoute qu'une chose : il nomme la bonne image des deux côtés pour
 * que le navigateur la fasse glisser au lieu de la fondre.
 *
 * ⚠ Chargé SANS `defer`, dans le <head> : l'événement `pagereveal` part avant
 *   le premier affichage de la nouvelle page. Un script différé arriverait
 *   trop tard et ne le verrait jamais. Le fichier est minuscule et en cache
 *   d'un an (empreinte `?v=`) : il ne coûte rien au rendu.
 *
 * ⚠ Un nom de transition doit être UNIQUE dans la page, sinon le navigateur
 *   abandonne la transition. C'est pourquoi aucun nom n'est écrit dans les
 *   gabarits : une même fiche peut paraître deux fois sur l'accueil
 *   (bestsellers, nouveautés). On ne nomme qu'UNE image, celle du clic, au
 *   moment du départ — et on retire le nom aussitôt capturé.
 *
 * Navigateurs sans ces événements (Firefox, Safari ancien) : rien ne se passe
 * ici, la navigation reste normale ou garde le simple fondu CSS.
 */
(function () {
  if (typeof window.PageSwapEvent === 'undefined' && typeof window.PageRevealEvent === 'undefined') return;

  var NOM = 'produit-image';
  var CLE = 'mcv_vt';

  function chemin(url) { try { return new URL(url, window.location.href).pathname; } catch (e) { return ''; } }
  function idFiche(url) { var m = chemin(url).match(/^\/produits\/([^/]+)\/?$/); return m ? m[1] : null; }
  function memoriser(v) {
    try { if (v) window.sessionStorage.setItem(CLE, JSON.stringify(v)); else window.sessionStorage.removeItem(CLE); } catch (e) {}
  }
  function relire() { try { return JSON.parse(window.sessionStorage.getItem(CLE)); } catch (e) { return null; } }
  /* Une image hors de l'écran ne doit pas « voler » depuis nulle part : dans
     ce cas on ne nomme rien, et la page fait un simple fondu. */
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < window.innerHeight && r.left < window.innerWidth;
  }

  var dernierLien = null;
  document.addEventListener('click', function (e) {
    dernierLien = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
  }, true);

  /* ─── Page qu'on quitte ──────────────────────────────────────────────── */
  window.addEventListener('pageswap', function (e) {
    memoriser(null);
    if (!e.viewTransition || !e.activation || !e.activation.entry) return;
    var cible = e.activation.entry.url, img = null, sens = null, id = null;

    if (idFiche(cible)) {
      /* Aller : la photo de la carte cliquée — et seulement si c'est bien
         elle qui mène à cette fiche (un lien de menu n'a pas de photo). */
      id = idFiche(cible);
      if (dernierLien && idFiche(dernierLien.href) === id) {
        var carte = dernierLien.closest('.product-card');
        img = carte ? carte.querySelector('img') : dernierLien.querySelector('img');
      }
      sens = 'aller';
    } else if (idFiche(window.location.href)) {
      /* Retour d'une fiche vers une liste : la grande photo repart vers sa carte. */
      id = idFiche(window.location.href);
      img = document.getElementById('main-image');
      sens = 'retour';
    }
    if (!img || !visible(img)) return;

    img.style.viewTransitionName = NOM;
    memoriser({ sens: sens, id: id, vers: chemin(cible) });
    var nettoyer = function () { img.style.viewTransitionName = ''; };
    e.viewTransition.finished.then(nettoyer, nettoyer);
  });

  /* ─── Page qui arrive ────────────────────────────────────────────────── */
  window.addEventListener('pagereveal', function (e) {
    var s = relire(); memoriser(null);
    if (!e.viewTransition || !s || s.vers !== window.location.pathname) return;

    var img = null;
    if (s.sens === 'aller') {
      img = document.getElementById('main-image');
    } else {
      var cartes = document.querySelectorAll('.product-card[data-product-id="' + String(s.id).replace(/"/g, '') + '"] img');
      for (var i = 0; i < cartes.length && !img; i++) if (visible(cartes[i])) img = cartes[i];
    }
    /* Pas d'image d'arrivée (carte hors écran au retour…) : celle de départ
       s'efface simplement. Rien n'est cassé. */
    if (!img) return;

    img.style.viewTransitionName = NOM;
    var nettoyer = function () { img.style.viewTransitionName = ''; };
    e.viewTransition.ready.then(nettoyer, nettoyer);
  });

  /* Retour par le bouton « précédent » depuis le cache du navigateur : la
     page revient telle qu'on l'a quittée, nom compris. On l'efface. */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var nommees = document.querySelectorAll('img[style*="view-transition-name"]');
    for (var i = 0; i < nommees.length; i++) nommees[i].style.viewTransitionName = '';
  });
})();
