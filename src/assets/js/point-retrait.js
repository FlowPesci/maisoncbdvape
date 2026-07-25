/* ═══════════════════════════════════════════════════════════════════════════
   point-retrait.js — Sélection d'un point retrait ou d'une consigne
   ───────────────────────────────────────────────────────────────────────────
   Chargé uniquement sur /commande/, avec jQuery et Leaflet, car le widget
   Mondial Relay en dépend. Le reste du site reste en JavaScript natif.

   Le widget écrit dans six champs cachés que le JS de soumission relit :
   #pr-transporteur, #pr-id, #pr-nom, #pr-adresse, #pr-cp, #pr-ville

   Rien de ce qui sort d'ici n'est digne de confiance : le serveur revalide
   intégralement le point choisi dans functions/_shared/valide-livraison.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const zone = document.getElementById('widget-point-retrait');
  if (!zone) return;

  const MODES = (window.MCV_LIVRAISON && window.MCV_LIVRAISON.modes) || {};

  // Champs cachés alimentés par le widget
  const champs = {
    transporteur: document.getElementById('pr-transporteur'),
    id:           document.getElementById('pr-id'),
    nom:          document.getElementById('pr-nom'),
    adresse:      document.getElementById('pr-adresse'),
    cp:           document.getElementById('pr-cp'),
    ville:        document.getElementById('pr-ville'),
  };
  const resume       = document.getElementById('pr-resume');
  const resumeNom    = document.getElementById('pr-resume-nom');
  const resumeAdr    = document.getElementById('pr-resume-adresse');
  const hiddenMode   = document.getElementById('mode-livraison-hidden');

  /** Efface la sélection — appelé au changement de mode. */
  function reset() {
    Object.values(champs).forEach((el) => { if (el) el.value = ''; });
    resume?.classList.add('hidden');
  }

  /** Enregistre le point choisi et l'affiche au client. */
  function selectionner({ transporteur, id, nom, adresse, cp, ville }) {
    champs.transporteur.value = transporteur;
    champs.id.value           = id;
    champs.nom.value          = nom;
    champs.adresse.value      = adresse;
    champs.cp.value           = cp;
    champs.ville.value        = ville;

    if (resumeNom) resumeNom.textContent = nom;
    if (resumeAdr) resumeAdr.textContent = [adresse, cp, ville].filter(Boolean).join(', ');
    resume?.classList.remove('hidden');

    // Efface le message d'erreur éventuel
    document.querySelector('[data-error-for="pointRetrait"]')?.classList.add('hidden');
  }

  /** Message affiché si le widget ne peut pas se charger. */
  function echec(message) {
    zone.innerHTML =
      '<p style="font-size:.8rem;color:#FF8080;line-height:1.6;">' + message +
      '<br/>Choisissez un autre mode de livraison, ou contactez-nous.</p>';
  }

  // ─── Widget Mondial Relay (ParcelShopPicker) ──────────────────────────────
  function initMondialRelay(cfg) {
    // Diagnostic explicite : jQuery absent et plugin absent ont des causes
    // différentes, et le message console doit permettre de trancher sans
    // avoir à instrumenter la page.
    if (typeof window.jQuery === 'undefined') {
      console.error('[point-retrait] jQuery n’est pas chargé');
      echec('Le sélecteur de consignes n’a pas pu être chargé.');
      return;
    }
    if (!window.jQuery.fn.MR_ParcelShopPicker) {
      console.error(
        '[point-retrait] jQuery ' + window.jQuery.fn.jquery +
        ' est chargé mais le plugin Mondial Relay ne s’est pas enregistré — ' +
        'vérifier que le script widget.mondialrelay.com répond bien (chemin « parcelshop-picker », avec tiret)'
      );
      echec('Le sélecteur de consignes n’a pas pu être chargé.');
      return;
    }

    // Le code client doit faire exactement 8 caractères, complété à droite
    const brand = String(cfg.brand || '').padEnd(8, ' ');

    window.jQuery(zone).MR_ParcelShopPicker({
      Target:              '#pr-id',
      TargetDisplayInfoPR: '#pr-infos-widget',
      Brand:               brand,
      Country:             cfg.pays || 'FR',
      PostCode:            cfg.codePostalDefaut || '',
      // APM = consignes automatiques uniquement. Valeur confirmée par la
      // documentation en ligne du widget, plus récente que le PDF V4.1.
      ColLivMod:           cfg.colLivMod || '24R',
      Theme:               cfg.theme || 'mondialrelay',
      NbResults:           String(cfg.nbResultats || 7),
      ShowResultsOnMap:    true,
      DisplayMapInfo:      true,
      Responsive:          true,
      EnableGeolocalisatedSearch: true,

      OnParcelShopSelected: (data) => {
        selectionner({
          transporteur: 'mondial-relay',
          id:      data.ID   || '',
          nom:     data.Nom  || '',
          adresse: [data.Adresse1, data.Adresse2].filter(Boolean).join(' ').trim(),
          cp:      data.CP    || '',
          ville:   data.Ville || '',
        });
      },

      OnNoResultReturned: () => {
        reset();
        console.warn('[point-retrait] Aucune consigne trouvée pour cette recherche');
      },
    });
  }

  // ─── Amorçage ─────────────────────────────────────────────────────────────
  // Le widget dépend du mode sélectionné : chaque mode « point » a son propre
  // transporteur. Aujourd'hui seule la consigne Mondial Relay est configurée ;
  // le point retrait Colissimo viendra avec le lot C.
  let modeInitialise = null;

  function activerSiVisible() {
    const section = document.getElementById('section-point-retrait');
    if (!section || section.classList.contains('hidden')) return;

    const mode = hiddenMode?.value;
    const cfg  = MODES[mode]?.widget;

    if (!cfg) {
      echec('Le sélecteur de ce transporteur n’est pas encore disponible.');
      modeInitialise = null;
      return;
    }

    // Même mode qu'avant : la carte a juste besoin d'être redessinée, sinon
    // Leaflet a calculé ses dimensions sur un conteneur de hauteur nulle.
    if (modeInitialise === mode) {
      if (window.jQuery) window.jQuery(zone).trigger('MR_RebindMap');
      return;
    }

    // Changement de transporteur : on repart d'un conteneur vierge
    zone.innerHTML = '';
    reset();

    if (cfg.type === 'mondial-relay') initMondialRelay(cfg);
    else echec('Transporteur inconnu : ' + cfg.type);

    modeInitialise = mode;
  }

  // Deux déclencheurs sont nécessaires, et ils ne se recouvrent pas :
  //
  //  · l'observateur, pour l'affichage ou le masquage de la section ;
  //  · le clic, parce que les modes « point » PARTAGENT la même section.
  //    Passer de la consigne au point retrait ne change aucune classe :
  //    sans ce second déclencheur, le widget précédent resterait affiché.
  const section = document.getElementById('section-point-retrait');
  if (section) {
    new MutationObserver(activerSiVisible)
      .observe(section, { attributes: true, attributeFilter: ['class'] });
  }

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      reset();
      if (btn.dataset.saisie !== 'point') {
        // On quitte les modes « point » : le prochain retour devra réinitialiser
        modeInitialise = null;
        return;
      }
      // Le hidden vient d'être mis à jour par setMode(), on peut relire le mode
      activerSiVisible();
    });
  });

  activerSiVisible();
})();
