  (function () {
    // ?apercu=1 révèle les modes pas encore ouverts à la vente, pour recette.
    // Le serveur les refuse : aucune commande ne peut aboutir depuis un aperçu.
    const apercu = new URLSearchParams(location.search).get('apercu') === '1';
    if (apercu) {
      document.querySelectorAll('.mode-apercu').forEach((b) => b.classList.remove('hidden'));
      // Symétrique : ce que l'aperçu rend faux doit disparaître. Sans cette
      // ligne, la mention « le règlement s'effectue au retrait » restait
      // affichée sous le bouton CB qu'on venait de révéler — deux phrases
      // contradictoires sur le même écran.
      document.querySelectorAll('.apercu-cache').forEach((b) => b.classList.add('hidden'));
    }

    const boutons = [...document.querySelectorAll('.mode-btn')]
      .filter((b) => apercu || b.dataset.actif === 'true');
    const hiddenMode = document.getElementById('mode-livraison-hidden');
    if (!boutons.length || !hiddenMode) return;

    // Une section de saisie par type : créneau, adresse, point retrait
    const sections = {
      creneau: document.getElementById('section-cc'),
      adresse: document.getElementById('section-livraison'),
      point:   document.getElementById('section-point-retrait'),
    };

    function setMode(mode) {
      hiddenMode.value = mode;
      let saisieActive = null;

      boutons.forEach((btn) => {
        const actif = btn.dataset.mode === mode;
        if (actif) saisieActive = btn.dataset.saisie;

        btn.classList.toggle('mode-active', actif);
        btn.style.border     = actif ? '1px solid var(--gold)' : '1px solid var(--borderl)';
        btn.style.background = actif ? 'rgba(201,169,110,0.06)' : 'transparent';
        btn.setAttribute('aria-pressed', String(actif));

        const icone = btn.querySelector('.mode-icon');
        const svg   = icone && icone.querySelector('svg');
        const label = btn.querySelector('.mode-label');
        if (icone) icone.style.background = actif ? 'rgba(201,169,110,0.15)' : 'rgba(201,169,110,0.08)';
        if (svg)   svg.style.color        = actif ? 'var(--gold)' : 'var(--muted)';
        if (label) label.style.color      = actif ? 'var(--gold)' : 'var(--cream)';
      });

      // N'afficher que la section correspondant au type de saisie du mode
      Object.entries(sections).forEach(([type, el]) => {
        if (el) el.classList.toggle('hidden', type !== saisieActive);
      });

      // ── Le règlement en boutique suppose de venir la chercher ────────────
      // On ne peut pas encaisser au comptoir quelqu'un qui se fait livrer
      // chez lui. Le bouton ne vaut donc que pour le retrait sur place ;
      // `submit-reservation.js` applique la même règle côté serveur, car
      // masquer un bouton n'empêche personne d'appeler l'API.
      const enBoutique = document.getElementById('btn-en-magasin');
      const retrait = saisieActive === 'creneau';
      if (enBoutique) enBoutique.classList.toggle('hidden', !retrait);

      // Ne jamais laisser un tunnel sans issue. Si le paiement en ligne
      // n'est pas encore ouvert et que le retrait vient d'être écarté, il
      // ne resterait aucun bouton et rien pour l'expliquer.
      const cb = document.querySelector('[data-mode="monetico"]');
      const cbVisible = cb && !cb.classList.contains('hidden');
      const impasse = document.getElementById('paiement-impasse');
      if (impasse) impasse.classList.toggle('hidden', retrait || cbVisible);

      if (typeof window.checkoutUpdateShipping === 'function') window.checkoutUpdateShipping();
    }

    boutons.forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
      btn.addEventListener('mouseover', () => {
        if (!btn.classList.contains('mode-active')) btn.style.borderColor = 'rgba(201,169,110,0.4)';
      });
      btn.addEventListener('mouseout', () => {
        if (!btn.classList.contains('mode-active')) btn.style.borderColor = 'var(--borderl)';
      });
    });

    // Premier mode proposé par défaut
    setMode(boutons[0].dataset.mode);
  })();
  
