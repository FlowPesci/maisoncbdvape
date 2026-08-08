/* ═══════════════════════════════════════════════════════════════════
   Filtres catégorie — dual price slider + brand checkboxes + collapse
   ═══════════════════════════════════════════════════════════════════ */
(function () {

  /* ─── Refs ─────────────────────────────────────────────────────── */
  const sidebar      = document.getElementById('filters-sidebar');
  const panel        = document.getElementById('filters-panel');
  const toggleBtn    = document.getElementById('toggle-filters');
  const toggleIcon   = document.getElementById('toggle-filters-icon');
  const toggleLabel  = document.getElementById('toggle-filters-label');
  const productsCol  = sidebar ? sidebar.nextElementSibling : null;

  /* ─── Collapse / expand sidebar ────────────────────────────────── */
  let filtersOpen = true;
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      filtersOpen = !filtersOpen;
      if (filtersOpen) {
        panel.style.maxHeight = '2000px';
        panel.style.opacity   = '1';
        sidebar.style.width   = '240px';
        toggleIcon.style.transform = 'rotate(0deg)';
        toggleLabel.textContent    = 'Masquer';
      } else {
        panel.style.maxHeight = '0';
        panel.style.opacity   = '0';
        sidebar.style.width   = '0';
        toggleIcon.style.transform = 'rotate(180deg)';
        toggleLabel.textContent    = 'Filtres';
      }
    });
  }

  /* ─── Dual price slider ─────────────────────────────────────────── */
  const wrap     = document.getElementById('price-slider-wrap');
  const minInput = document.getElementById('price-min');
  const maxInput = document.getElementById('price-max');
  const fill     = document.getElementById('price-range-fill');
  const dispMin  = document.getElementById('price-display-min');
  const dispMax  = document.getElementById('price-display-max');

  function fmtPrice(v) {
    return parseFloat(v).toFixed(2).replace('.', ',') + ' €';
  }

  function updateSlider() {
    if (!wrap || !fill) return;
    const pMin  = parseFloat(wrap.dataset.prixMin);
    const pMax  = parseFloat(wrap.dataset.prixMax);
    const vMin  = parseFloat(minInput.value);
    const vMax  = parseFloat(maxInput.value);
    const range = pMax - pMin || 1;

    const leftPct  = ((vMin - pMin) / range) * 100;
    const rightPct = ((vMax - pMin) / range) * 100;

    fill.style.left  = leftPct  + '%';
    fill.style.width = (rightPct - leftPct) + '%';

    if (dispMin) dispMin.textContent = fmtPrice(vMin);
    if (dispMax) dispMax.textContent = fmtPrice(vMax);

    applyFilters();
  }

  if (minInput) {
    minInput.addEventListener('input', function () {
      const gap = parseFloat(minInput.step) || 0.5;
      if (parseFloat(this.value) >= parseFloat(maxInput.value) - gap) {
        this.value = parseFloat(maxInput.value) - gap;
      }
      updateSlider();
    });
  }
  if (maxInput) {
    maxInput.addEventListener('input', function () {
      const gap = parseFloat(maxInput.step) || 0.5;
      if (parseFloat(this.value) <= parseFloat(minInput.value) + gap) {
        this.value = parseFloat(minInput.value) + gap;
      }
      updateSlider();
    });
  }
  if (wrap) updateSlider(); /* initial paint */

  /* ─── Brand checkboxes ──────────────────────────────────────────── */
  const brandChecks = document.querySelectorAll('[data-filter-brand]');
  brandChecks.forEach(cb => cb.addEventListener('change', applyFilters));

  /* ─── Sort select ───────────────────────────────────────────────── */
  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.addEventListener('change', applyFilters);

  /* ─── Apply all filters ─────────────────────────────────────────── */
  function applyFilters() {
    const cards = document.querySelectorAll('[data-product-id]');
    if (!cards.length) return;

    const activeBrands = Array.from(brandChecks)
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.filterBrand.toLowerCase());

    const vMin = minInput ? parseFloat(minInput.value) : -Infinity;
    const vMax = maxInput ? parseFloat(maxInput.value) :  Infinity;

    let visible = [];
    cards.forEach(card => {
      const brand = (card.dataset.marque || '').toLowerCase();
      const price = parseFloat(card.dataset.prix || '0');
      const brandOk = activeBrands.length === 0 || activeBrands.includes(brand);
      const priceOk = price >= vMin && price <= vMax;
      const show    = brandOk && priceOk;
      card.style.display = show ? '' : 'none';
      if (show) visible.push({ card, price });
    });

    /* Sort */
    if (sortSel && visible.length > 0) {
      const grid = visible[0].card.parentElement;
      if (sortSel.value === 'prix-asc')  visible.sort((a, b) => a.price - b.price);
      if (sortSel.value === 'prix-desc') visible.sort((a, b) => b.price - a.price);
      visible.forEach(({ card }) => grid.appendChild(card));
    }
  }

  /* ─── Reset button ──────────────────────────────────────────────── */
  const resetBtn = document.getElementById('reset-filters');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      brandChecks.forEach(cb => { cb.checked = false; });
      if (minInput && wrap) { minInput.value = wrap.dataset.prixMin; }
      if (maxInput && wrap) { maxInput.value = wrap.dataset.prixMax; }
      updateSlider();
      applyFilters();
    });
  }

  /* ─── Mobile drawer ─────────────────────────────────────────────── */
  const openBtn    = document.getElementById('open-filters');
  const closeBtn   = document.getElementById('close-filters');
  const overlay    = document.getElementById('drawer-overlay');
  const drawer     = document.getElementById('filter-drawer');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.remove('hidden-drawer');
    overlay.classList.remove('hidden-overlay');
    drawer.style.transform = 'translateX(0)';
    overlay.style.opacity  = '1';
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.style.transform = 'translateX(-100%)';
    overlay.style.opacity  = '0';
    setTimeout(() => {
      drawer.classList.add('hidden-drawer');
      overlay.classList.add('hidden-overlay');
    }, 300);
    document.body.style.overflow = '';
  }

  if (openBtn)  openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (overlay)  overlay.addEventListener('click', closeDrawer);

  /* ─── Fade-up observer ──────────────────────────────────────────── */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

})();
