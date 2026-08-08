  (function () {
    // ?apercu=1 révèle les modes pas encore ouverts à la vente, pour recette.
    // Le serveur les refuse : aucune commande ne peut aboutir depuis un aperçu.
    const apercu = new URLSearchParams(location.search).get('apercu') === '1';
    if (apercu) {
      document.querySelectorAll('.mode-apercu').forEach((b) => b.classList.remove('hidden'));
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
  
