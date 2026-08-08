(function () {
  'use strict';

  // ── Desktop : ouverture au survol ──────────────────────────────────────
  const items   = document.querySelectorAll('.nav-item[data-cat]');
  const panneaux = document.querySelectorAll('.mega-panel[data-panel]');
  let fermeture = null;

  function ouvrir(slug) {
    clearTimeout(fermeture);
    panneaux.forEach((p) => {
      const actif = p.dataset.panel === slug;
      p.classList.toggle('is-open', actif);
      p.setAttribute('aria-hidden', String(!actif));
    });
  }
  // Petit délai : traverser un autre onglet en diagonale ne doit pas fermer
  function fermerBientot() {
    clearTimeout(fermeture);
    fermeture = setTimeout(() => {
      panneaux.forEach((p) => { p.classList.remove('is-open'); p.setAttribute('aria-hidden', 'true'); });
    }, 160);
  }

  items.forEach((item) => {
    item.addEventListener('mouseenter', () => ouvrir(item.dataset.cat));
    item.addEventListener('mouseleave', fermerBientot);
    // Accessibilité clavier : le panneau s'ouvre à la tabulation
    item.querySelector('a')?.addEventListener('focus', () => ouvrir(item.dataset.cat));
  });
  panneaux.forEach((p) => {
    p.addEventListener('mouseenter', () => { clearTimeout(fermeture); });
    p.addEventListener('mouseleave', fermerBientot);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerBientot(); });

  // ── Mobile : accordéon ─────────────────────────────────────────────────
  document.querySelectorAll('.mobile-sub-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cible = document.querySelector(`.mobile-sub[data-sub="${btn.dataset.cat}"]`);
      if (!cible) return;
      const ouvert = !cible.classList.contains('hidden');
      cible.classList.toggle('hidden', ouvert);
      btn.setAttribute('aria-expanded', String(!ouvert));
      const svg = btn.querySelector('svg');
      if (svg) svg.style.transform = ouvert ? '' : 'rotate(180deg)';
    });
  });
})();
