/* ═══════════════════════════════════════════════════════════════════════════
   MaisonCBDVape — JS global
   ───────────────────────────────────────────────────────────────────────────
   Sans framework. Vanilla ES2022. Chargé en defer.
   Modules :
     1. Menu mobile (toggle hamburger)
     2. Animation fade-up au scroll (IntersectionObserver)
     3. Header dynamique (renforce l'ombre au scroll)
     4. Panier localStorage avec badge synchronisé (data-add-to-cart)
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // Dates en français
  //
  // Les créneaux sont stockés en ISO (« 2026-07-27 ») : c'est ce qui se trie
  // et se compare. Mais ce format n'a rien à faire sous les yeux d'un client
  // français. Exposé en global parce que les scripts en ligne des pages
  // (suivi de commande, back-office) en ont besoin et ne peuvent pas importer
  // de module.
  //
  // ⚠ Pendant serveur : functions/_shared/dates.js, pour les e-mails. Les
  //   deux ne peuvent pas partager de fichier — l'un tourne dans un Worker —
  //   mais ils doivent rendre le même texte.
  // ═══════════════════════════════════════════════════════════════════════
  const FUSEAU_BOUTIQUE = 'Europe/Paris';

  function versDate(valeur) {
    if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
    if (typeof valeur === 'number') {
      const n = new Date(valeur);
      return isNaN(n.getTime()) ? null : n;
    }
    const texte = String(valeur || '').trim();
    if (!texte) return null;
    // Une date seule est lue en UTC par le moteur JS : on la ramène à minuit
    // local, sinon un créneau du 27 s'affiche le 26 au soir.
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texte) ? texte + 'T00:00:00' : texte);
    return isNaN(d.getTime()) ? null : d;
  }

  function formateDate(valeur, options, repli) {
    const d = versDate(valeur);
    if (!d) return repli === undefined ? '—' : repli;
    return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_BOUTIQUE, ...options }).format(d);
  }

  window.MCV_DATE = {
    /** « lundi 27 juillet 2026 » — pour ce que lit un client. */
    longue: (v, repli) =>
      formateDate(v, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, repli),
    /** « 27/07/2026 » — pour les tableaux, où la place manque. */
    courte: (v, repli) =>
      formateDate(v, { day: '2-digit', month: '2-digit', year: 'numeric' }, repli),
    /** « 07:30 ». */
    heure: (v, repli) =>
      formateDate(v, { hour: '2-digit', minute: '2-digit' }, repli),
    /** « 27/07/2026 à 07:30 ». */
    dateHeure(v, repli) {
      const d = versDate(v);
      if (!d) return repli === undefined ? '—' : repli;
      return this.courte(d) + ' à ' + this.heure(d);
    },
  };

  // ─── 1. Menu mobile ───────────────────────────────────────────────────────
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const isOpen = !mobileMenu.classList.contains('hidden');
      mobileMenu.classList.toggle('hidden');
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  // ─── 2. Animation fade-up au scroll ───────────────────────────────────────
  const fadeElements = document.querySelectorAll('.fade-up');

  if ('IntersectionObserver' in window && fadeElements.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    fadeElements.forEach((el) => io.observe(el));
  } else {
    // Fallback : tout afficher
    fadeElements.forEach((el) => el.classList.add('visible'));
  }

  // ─── 3. Header renforcé au scroll ─────────────────────────────────────────
  const header = document.querySelector('.glass-header');
  if (header) {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header.style.background = window.scrollY > 50
            ? 'rgba(10,10,15,0.95)'
            : 'rgba(10,10,15,0.85)';
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ─── 4. Panier (localStorage + badge) ─────────────────────────────────────
  const STORAGE_KEY = 'tabacgex_cart_v1';

  const getCart = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  };

  const setCart = (cart) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    updateCartBadge();
  };

  const updateCartBadge = () => {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    document.querySelectorAll('.cart-badge, [data-cart-count]').forEach((badge) => {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = count > 0 ? '' : 'none';
    });
  };

  const addToCart = (productId, qty = 1, variante = null) => {
    const cart = getCart();
    const cartId = variante ? `${productId}--${variante.label}` : productId;
    const existing = cart.find((item) => item.id === cartId);
    if (existing) {
      existing.qty = (existing.qty || 1) + qty;
    } else {
      const item = { id: cartId, qty, addedAt: Date.now() };
      if (variante) {
        item.produitId     = productId;
        item.varianteLabel = variante.label;
        item.variantePrix  = variante.prix;
      }
      cart.push(item);
    }
    setCart(cart);
  };

  // Feedback visuel sur le bouton
  const flashButton = (btn) => {
    const original = btn.innerHTML;
    btn.innerHTML = '✓ Ajouté !';
    // Confirmation dorée : le même vocabulaire que le survol du bouton,
    // pour que l'ajout se lise comme un aboutissement et non comme une alerte.
    btn.style.background = 'var(--gold)';
    btn.style.color = 'var(--dark)';
    btn.style.borderColor = 'var(--gold)';
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.cssText = '';
    }, 1800);
  };

  // Délégation d'événements pour tous les boutons "Ajouter au panier"
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn || btn.disabled) return;

    const productId     = btn.dataset.addToCart;
    const varianteLabel = btn.dataset.varianteLabel || null;
    const variantePrix  = btn.dataset.variantePrix  ? parseFloat(btn.dataset.variantePrix) : null;
    const variante      = varianteLabel ? { label: varianteLabel, prix: variantePrix } : null;
    const qty           = parseInt(document.getElementById('qty-display')?.textContent || '1', 10);
    addToCart(productId, qty || 1, variante);
    flashButton(btn);
  });

  // Initialisation au chargement
  updateCartBadge();

  // ─── 5. Active link tracking (au cas où plusieurs URL match) ──────────────
  // Géré côté template, mais on highlight aussi par fallback JS si besoin.

  // ─── 6. Fiche produit : galerie, couleurs, quantité, onglets, sticky bar ──
  // Tous les modules ne s'activent que si leurs éléments existent (no-op ailleurs).
  initProductDetail();

  function initProductDetail() {
    // Galerie : changement d'image au clic sur une miniature
    const mainImage = document.getElementById('main-image');
    const thumbs    = document.querySelectorAll('.thumb-btn');
    if (mainImage && thumbs.length) {
      thumbs.forEach((btn) => {
        btn.addEventListener('click', () => {
          const newSrc = btn.dataset.src;
          const newAlt = btn.dataset.alt || '';
          if (!newSrc || newSrc === mainImage.src) return;

          thumbs.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          mainImage.classList.add('swapping');
          setTimeout(() => {
            mainImage.src = newSrc;
            mainImage.alt = newAlt;
            const clear = () => mainImage.classList.remove('swapping');
            mainImage.onload = clear;
            if (mainImage.complete) clear();
          }, 200);
        });
      });
    }

    // Sélecteur de variantes (taille CBD / saveur puffs)
    const varianteBtns      = document.querySelectorAll('.variante-btn');
    const prixDisplay       = document.getElementById('prix-display');
    const prixDisplaySticky = document.getElementById('prix-display-sticky');
    const varianteLabelEl   = document.getElementById('variante-label-display');
    const formatEur = (n) => new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }).format(n);

    if (varianteBtns.length) {

      const syncVariante = (btn) => {
        const label = btn.dataset.varianteLabel;
        const prix  = parseFloat(btn.dataset.variantePrix);
        if (varianteLabelEl) varianteLabelEl.textContent = label;
        const prixFormatted = formatEur(prix);
        if (prixDisplay)       prixDisplay.textContent       = prixFormatted;
        if (prixDisplaySticky) prixDisplaySticky.textContent = prixFormatted;
        document.querySelectorAll('[data-add-to-cart]').forEach((cartBtn) => {
          cartBtn.dataset.varianteLabel = label;
          cartBtn.dataset.variantePrix  = prix;
        });
      };

      varianteBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          varianteBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          syncVariante(btn);
        });
      });

      // Initialise sur la première variante au chargement
      syncVariante(varianteBtns[0]);
    }

    // Sélecteur de contenant CBD (2g / 4g / 8g)
    // Les poids et prix proposés viennent des variantes du produit : aucune
    // valeur libre n'est possible, ce qui garantit que le label envoyé au
    // serveur existe toujours dans le catalogue.
    const gramBtns = document.querySelectorAll('.gram-btn');

    if (gramBtns.length) {
      const syncGram = (btn) => {
        const label = btn.dataset.gramLabel;
        const prix  = parseFloat(btn.dataset.gramPrix);
        const prixFormatted = formatEur(prix);
        if (prixDisplay)       prixDisplay.textContent       = prixFormatted;
        if (prixDisplaySticky) prixDisplaySticky.textContent = prixFormatted;
        document.querySelectorAll('[data-add-to-cart]').forEach((cartBtn) => {
          cartBtn.dataset.varianteLabel = label;
          cartBtn.dataset.variantePrix  = prix;
        });
      };

      const selectGram = (btn) => {
        gramBtns.forEach((b) => {
          const actif = b === btn;
          b.classList.toggle('active', actif);
          b.setAttribute('aria-pressed', String(actif));
        });
        syncGram(btn);
      };

      gramBtns.forEach((btn) => {
        if (btn.disabled) return;
        btn.addEventListener('click', () => selectGram(btn));
      });

      // Sélection initiale : le premier contenant disponible
      const premierDispo = [...gramBtns].find((b) => !b.disabled);
      if (premierDispo) selectGram(premierDispo);
    }

    // Sélecteur de couleurs
    const swatches  = document.querySelectorAll('.color-swatch');
    const colorLabel = document.getElementById('color-label');
    if (swatches.length) {
      swatches.forEach((sw) => {
        sw.addEventListener('click', () => {
          swatches.forEach((s) => s.classList.remove('active'));
          sw.classList.add('active');
          if (colorLabel) colorLabel.textContent = sw.dataset.color || '';
        });
      });
    }

    // Stepper quantité
    const qtyDisplay = document.getElementById('qty-display');
    const qtyDec     = document.querySelector('[data-qty-dec]');
    const qtyInc     = document.querySelector('[data-qty-inc]');
    let qty = 1;

    // La quantité n'est plus plafonnée arbitrairement : la seule limite est le
    // stock disponible, celui de la variante sélectionnée le cas échéant.
    // Le serveur revalide de toute façon.
    // Deux modèles de stock cohabitent :
    //  · à l'unité — chaque variante a son propre stock (saveurs de puffs) ;
    //  · au poids  — un vrac unique en grammes au niveau du produit, dans
    //                lequel tous les contenants puisent. Un sachet de 4 g en
    //                retire 4, donc 10 g de vrac = deux sachets de 4 g au plus.
    const stockDispo = () => {
      const bloc  = document.querySelector('[data-stock]');
      const vrac  = Number(bloc?.dataset.stock);
      const btn   = document.querySelector('.gram-btn.active, .variante-btn.active');
      const poids = Number(btn?.dataset.gramPoids);

      if (Number.isFinite(poids) && poids > 0) {
        return Number.isFinite(vrac) ? Math.floor(vrac / poids) : Infinity;
      }
      const s = btn ? Number(btn.dataset.varianteStock) : vrac;
      return Number.isFinite(s) && s > 0 ? s : Infinity;
    };

    /** Unité d'affichage du plafond : « 3 sachets » ou « 3 ». */
    const uniteStock = () =>
      document.querySelector('[data-stock]')?.dataset.stockUnite || '';

    const renderQty = () => {
      if (qtyDisplay) qtyDisplay.textContent = qty;
      const max = stockDispo();
      if (qtyInc) {
        const auMax = qty >= max;
        qtyInc.disabled = auMax;
        qtyInc.style.opacity = auMax ? '.35' : '';
        qtyInc.title = auMax && max !== Infinity
          ? (uniteStock() === 'g'
              ? `Le vrac restant ne permet que ${max} contenant${max > 1 ? 's' : ''}`
              : `Stock disponible : ${max}`)
          : '';
      }
      if (qtyDec) {
        qtyDec.disabled = qty <= 1;
        qtyDec.style.opacity = qty <= 1 ? '.35' : '';
      }
    };

    if (qtyDec && qtyInc && qtyDisplay) {
      qtyDec.addEventListener('click', () => { qty = Math.max(1, qty - 1); renderQty(); });
      qtyInc.addEventListener('click', () => { qty = Math.min(stockDispo(), qty + 1); renderQty(); });
      // Changer de variante peut réduire le stock sous la quantité déjà choisie
      document.querySelectorAll('.gram-btn, .variante-btn').forEach((b) =>
        b.addEventListener('click', () => { qty = Math.max(1, Math.min(qty, stockDispo())); renderQty(); }));
      renderQty();
    }

    // Onglets fiche technique / contenu / avis
    const tabBtns   = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    if (tabBtns.length && tabPanels.length) {
      tabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.tab;
          tabBtns.forEach((b) => b.classList.remove('active'));
          tabPanels.forEach((p) => p.classList.remove('active'));
          btn.classList.add('active');
          const panel = document.getElementById(target);
          if (panel) panel.classList.add('active');
        });
      });
      // Si on arrive sur la page avec #reviews, ouvrir l'onglet correspondant
      if (window.location.hash === '#reviews') {
        const btn = document.querySelector('.tab-btn[data-tab="tab-reviews"]');
        if (btn) btn.click();
      }
    }

    // Barre d'achat sticky mobile : visible uniquement quand la zone d'achat
    // principale est sortie du viewport.
    const stickyBar = document.getElementById('sticky-buy');
    const buyAnchor = document.getElementById('buy-anchor');
    if (stickyBar && buyAnchor && 'IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          stickyBar.classList.toggle('hidden-bar', e.isIntersecting);
        });
      }, { threshold: 0.05 });
      obs.observe(buyAnchor);
    }

    // Bouton Click & Collect : ajoute au panier puis redirige vers /commande/
    const clickCollectBtn = document.getElementById('click-collect-btn');
    if (clickCollectBtn) {
      clickCollectBtn.addEventListener('click', () => {
        const productId = clickCollectBtn.dataset.clickCollect;
        const addBtn = document.querySelector('[data-add-to-cart]');
        const variante = addBtn && addBtn.dataset.varianteLabel
          ? { label: addBtn.dataset.varianteLabel, prix: addBtn.dataset.variantePrix ? parseFloat(addBtn.dataset.variantePrix) : null }
          : null;
        addToCart(productId, qty || 1, variante);
        window.location.href = '/commande/';
      });
    }
  }

  // ─── 7. Drawer filtres mobile (page catégorie) ────────────────────────────
  const filterOpen    = document.getElementById('open-filters');
  const filterClose   = document.getElementById('close-filters');
  const filterApply   = document.getElementById('apply-filters');
  const filterDrawer  = document.getElementById('filter-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');

  const openDrawer = () => {
    if (!filterDrawer) return;
    filterDrawer.classList.remove('hidden-drawer');
    drawerOverlay?.classList.remove('hidden-overlay');
    document.body.style.overflow = 'hidden';
  };
  const closeDrawer = () => {
    if (!filterDrawer) return;
    filterDrawer.classList.add('hidden-drawer');
    drawerOverlay?.classList.add('hidden-overlay');
    document.body.style.overflow = '';
  };
  filterOpen?.addEventListener('click', openDrawer);
  filterClose?.addEventListener('click', closeDrawer);
  filterApply?.addEventListener('click', closeDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);


  // ─── 8. Filtres dynamiques (page catégorie) ───────────────────────────────
  // Lit les checkboxes [data-filter-brand] et les pills [data-filter-price]
  // et toggle visibilité + tri sur la grille .product-card.
  initCategoryFilters();

  function initCategoryFilters() {
    const cards = Array.from(document.querySelectorAll('.product-card[data-marque]'));
    if (!cards.length) return;

    const brandInputs  = document.querySelectorAll('input[type="checkbox"][data-filter-brand]');
    const sortSelect   = document.getElementById('sort-select');
    const toolbarCount = document.querySelector('.toolbar-bar p span:first-of-type');

    const grid = cards[0].parentElement;

    const state = { brands: new Set(), priceMin: -Infinity, priceMax: Infinity };

    const apply = () => {
      let visible = 0;
      cards.forEach((card) => {
        const marque = card.dataset.marque || "";
        const prix   = Number(card.dataset.prix) || 0;
        const matchBrand = state.brands.size === 0 || state.brands.has(marque);
        const matchPrice = prix >= state.priceMin && prix <= state.priceMax;
        const show = matchBrand && matchPrice;
        card.style.display = show ? "" : "none";
        if (show) visible++;
      });
      if (toolbarCount) toolbarCount.textContent = '1–' + visible;
    };

    const applySort = (mode) => {
      const sorted = [...cards].sort((a, b) => {
        const pa = Number(a.dataset.prix) || 0;
        const pb = Number(b.dataset.prix) || 0;
        if (mode === "prix-asc")  return pa - pb;
        if (mode === "prix-desc") return pb - pa;
        return 0;
      });
      sorted.forEach((card) => grid.appendChild(card));
    };

    // ─ Marques ─
    brandInputs.forEach((input) => {
      input.addEventListener("change", () => {
        const marque = input.dataset.filterBrand;
        if (input.checked) state.brands.add(marque);
        else state.brands.delete(marque);
        apply();
      });
    });

    // ─ Double slider prix ─
    const sliderWrap    = document.getElementById('price-slider-wrap');
    const sliderMin     = document.getElementById('price-min');
    const sliderMax     = document.getElementById('price-max');
    const fillEl        = document.getElementById('price-range-fill');
    const dispMin       = document.getElementById('price-display-min');
    const dispMax       = document.getElementById('price-display-max');
    const formatEurSlider = (n) => new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }).format(n);

    if (sliderWrap && sliderMin && sliderMax) {
      const absMin = parseFloat(sliderWrap.dataset.prixMin);
      const absMax = parseFloat(sliderWrap.dataset.prixMax);
      state.priceMin = absMin;
      state.priceMax = absMax;

      const updateSlider = () => {
        let lo = parseFloat(sliderMin.value);
        let hi = parseFloat(sliderMax.value);
        if (lo > hi) { if (document.activeElement === sliderMin) { lo = hi; sliderMin.value = lo; } else { hi = lo; sliderMax.value = hi; } }
        const pct1 = (lo - absMin) / (absMax - absMin) * 100;
        const pct2 = (hi - absMin) / (absMax - absMin) * 100;
        if (fillEl)  { fillEl.style.left = pct1 + '%'; fillEl.style.right = (100 - pct2) + '%'; }
        if (dispMin) dispMin.textContent = formatEurSlider(lo);
        if (dispMax) dispMax.textContent = formatEurSlider(hi);
        state.priceMin = lo;
        state.priceMax = hi;
        apply();
      };

      sliderMin.addEventListener('input', updateSlider);
      sliderMax.addEventListener('input', updateSlider);
      updateSlider(); // init fill
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => applySort(e.target.value));
    }
  }


  // ─── 9. Page panier (/panier/) ─────────────────────────────────────────────
  initCartPage();

  function initCartPage() {
    const itemsContainer = document.getElementById('cart-items');
    if (!itemsContainer) return; // pas sur la page panier

    const emptyEl   = document.getElementById('cart-empty');
    const contentEl = document.getElementById('cart-content');
    const dataEl    = document.getElementById('produits-data');

    let produits = [];
    try { produits = JSON.parse(dataEl?.textContent || '[]'); } catch {}

    const TVA_RATE = 0.20;
    const formatEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

    // Gère les IDs composés "produitId--varianteLabel"
    function findProduct(cartId) {
      const baseId = cartId.includes('--') ? cartId.split('--')[0] : cartId;
      return produits.find((p) => p.id === baseId);
    }

    function rerender() {
      const cart = getCart();
      if (!cart.length) {
        emptyEl?.classList.remove('hidden');
        contentEl?.classList.add('hidden');
        return;
      }
      emptyEl?.classList.add('hidden');
      contentEl?.classList.remove('hidden', 'lg:grid');
      contentEl?.classList.add('grid', 'lg:grid');

      itemsContainer.innerHTML = '';
      let totalTTC = 0;

      cart.forEach((entry) => {
        const p = findProduct(entry.id);
        if (!p) return; // produit retiré du catalogue : on ignore
        const qty       = Math.max(1, entry.qty || 1);
        const unitPrix  = entry.variantePrix != null ? entry.variantePrix : p.prix;
        const lineTotal = unitPrix * qty;
        totalTTC += lineTotal;

        // Affichage du détail variante (ex : "3g" ou "Fraise")
        const varianteLine = entry.varianteLabel
          ? `<span class="text-xs font-mono px-2 py-0.5 rounded-full border border-dark-border text-smoke ml-1">${entry.varianteLabel}</span>`
          : '';

        const row = document.createElement('article');
        row.className = 'cart-item flex gap-4 p-4 rounded-2xl bg-dark-card border border-dark-border';
        row.innerHTML = `
          <a href="/produits/${p.id}/" class="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-dark-bg border border-dark-border">
            <img src="${p.image}" alt="${p.nom}" class="w-full h-full object-cover" loading="lazy"/>
          </a>
          <div class="flex-1 min-w-0 flex flex-col">
            <div class="text-smoke text-xs uppercase tracking-widest mb-1 font-mono">${(p.categorie || '').toUpperCase()} · ${p.marque || ''}</div>
            <h3 class="text-white font-semibold text-sm sm:text-base leading-snug mb-2 flex items-center flex-wrap gap-1">
              <a href="/produits/${p.id}/" class="hover:text-neon-violet transition-colors">${p.nom}</a>${varianteLine}
            </h3>
            <div class="font-display text-xl sm:text-2xl mb-3" style="color:var(--gold);">${formatEur(unitPrix)}</div>
            <div class="mt-auto flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-2">
                <button class="qty-btn" data-cart-dec="${entry.id}" aria-label="Diminuer la quantité">−</button>
                <span class="w-8 text-center font-mono font-bold text-white">${qty}</span>
                <button class="qty-btn" data-cart-inc="${entry.id}" aria-label="Augmenter la quantité">+</button>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-white font-semibold text-sm">${formatEur(lineTotal)}</span>
                <button data-cart-remove="${entry.id}" class="text-smoke hover:text-red-400 transition-colors text-xs flex items-center gap-1" aria-label="Supprimer">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        `;
        itemsContainer.appendChild(row);
      });

      const totalHT = totalTTC / (1 + TVA_RATE);
      const totalTVA = totalTTC - totalHT;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = formatEur(val); };
      setText('cart-total-ht', totalHT);
      setText('cart-total-tva', totalTVA);
      setText('cart-total-ttc', totalTTC);

      // Compteur d'articles
      const total = cart.reduce((s, it) => s + (it.qty || 1), 0);
      const countEl = document.getElementById('cart-count-label');
      if (countEl) countEl.textContent = total + ' article' + (total > 1 ? 's' : '');
    }

    // Bouton "Vider le panier"
    document.getElementById('cart-clear-btn')?.addEventListener('click', () => {
      if (confirm('Vider tout le panier ?')) {
        setCart([]);
        rerender();
        updateCartBadge();
      }
    });

    // Délégation : qty +/-, suppression
    itemsContainer.addEventListener('click', (e) => {
      const dec = e.target.closest('[data-cart-dec]');
      const inc = e.target.closest('[data-cart-inc]');
      const rem = e.target.closest('[data-cart-remove]');
      if (!dec && !inc && !rem) return;

      const cart = getCart();
      const id = (dec || inc || rem).dataset.cartDec || (dec || inc || rem).dataset.cartInc || (dec || inc || rem).dataset.cartRemove;
      const idx = cart.findIndex((it) => it.id === id);
      if (idx === -1) return;

      if (rem) {
        cart.splice(idx, 1);
      } else if (dec) {
        cart[idx].qty = Math.max(1, (cart[idx].qty || 1) - 1);
      } else if (inc) {
        // Plafond : pour un produit vendu au poids, le vrac restant divisé par
        // le poids du contenant ; sinon le stock de la variante ou du produit.
        const p = findProduct(id);
        const lbl = cart[idx].varianteLabel;
        const v = lbl && p?.variantes ? p.variantes.find((x) => x.label === lbl) : null;
        const poids = p?.unitePrix === 'g' && lbl ? parseFloat(String(lbl).replace(',', '.')) : NaN;
        const max = Number.isFinite(poids) && poids > 0
          ? Math.floor(Number(p?.stock) / poids)
          : Number(v ? v.stock : p?.stock);
        cart[idx].qty = Math.min(
          Number.isFinite(max) && max > 0 ? max : Infinity,
          (cart[idx].qty || 1) + 1
        );
      }
      setCart(cart);
      rerender();
    });

    rerender();
  }


  // ─── 10. Page commande (/commande/) ────────────────────────────────────────
  initCheckoutPage();

  function initCheckoutPage() {
    const form = document.getElementById('checkout-form');
    if (!form) return;

    const emptyEl       = document.getElementById('checkout-empty');
    const itemsEl       = document.getElementById('checkout-items');
    const statusEl      = document.getElementById('checkout-status');
    const dataEl        = document.getElementById('produits-data');

    let produits = [];
    try { produits = JSON.parse(dataEl?.textContent || '[]'); } catch {}

    const TVA_RATE = 0.20;
    const formatEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
    const findProduct = (cartId) => {
      const baseId = cartId.includes('--') ? cartId.split('--')[0] : cartId;
      return produits.find((p) => p.id === baseId);
    };

    function buildOrderItems() {
      const cart = getCart();
      return cart.map((entry) => {
        const p = findProduct(entry.id);
        if (!p) return null;
        const unitPrix = entry.variantePrix != null ? entry.variantePrix : p.prix;
        // Sépare l'ID composite "produit--variante" en id de base + varianteLabel
        const baseId = entry.id.includes('--') ? entry.id.split('--')[0] : entry.id;
        return {
          id: baseId,
          nom: p.nom + (entry.varianteLabel ? ' · ' + entry.varianteLabel : ''),
          marque: p.marque, prix: unitPrix,
          qty: Math.max(1, entry.qty || 1), image: p.image,
          varianteLabel: entry.varianteLabel || null,
        };
      }).filter(Boolean);
    }

    // Modes de livraison injectés par le layout depuis src/_data/site.json,
    // c'est-à-dire la même source que la validation serveur. Cette fonction
    // doit rester le miroir exact de computeFraisPort() côté Workers.
    const MODES_LIVRAISON = window.MCV_LIVRAISON?.modes || {};

    /**
     * Mode de livraison en cours.
     *
     * Le champ caché est vide tant que le sélecteur n'a pas rendu la page :
     * on retombe alors sur le PREMIER mode actif de site.json, celui-là même
     * que le sélecteur présélectionne. Écrire un mode en dur ici en ferait un
     * second endroit à corriger le jour où l'ordre change dans les données.
     */
    function modeCourant(valeur) {
      if (valeur) return valeur;
      const premierActif = Object.keys(MODES_LIVRAISON)
        .find((id) => MODES_LIVRAISON[id]?.actif);
      return premierActif || Object.keys(MODES_LIVRAISON)[0] || '';
    }

    function getShippingCost(totalTTC) {
      const mode = modeCourant(document.getElementById('mode-livraison-hidden')?.value);
      const m = MODES_LIVRAISON[mode];
      if (!m || !m.fraisPort) return 0;
      if (m.seuilGratuit !== null && totalTTC >= m.seuilGratuit) return 0;
      return m.fraisPort;
    }

    function renderRecap() {
      const items = buildOrderItems();
      if (!items.length) {
        emptyEl?.classList.remove('hidden');
        form.classList.add('hidden');
        return;
      }
      emptyEl?.classList.add('hidden');
      form.classList.remove('hidden');
      form.classList.add('grid');

      itemsEl.innerHTML = items.map((it) => `
        <div class="flex justify-between gap-3">
          <span class="flex-1 truncate">${it.qty} × ${it.nom}</span>
          <span class="font-mono text-white shrink-0">${formatEur(it.prix * it.qty)}</span>
        </div>
      `).join('');

      const subTTC   = items.reduce((sum, it) => sum + it.prix * it.qty, 0);
      const shipping  = getShippingCost(subTTC);
      const totalTTC  = subTTC + shipping;
      const totalHT   = subTTC / (1 + TVA_RATE);
      const totalTVA  = subTTC - totalHT;

      document.getElementById('checkout-total-ht').textContent  = formatEur(totalHT);
      document.getElementById('checkout-total-tva').textContent = formatEur(totalTVA);
      document.getElementById('checkout-total-ttc').textContent = formatEur(totalTTC);

      // Frais de port — la ligne s'affiche pour tout mode facturé (livraison,
      // point retrait, consigne), pas seulement la livraison à domicile.
      const fraisRow = document.getElementById('frais-port-row');
      const fraisVal = document.getElementById('frais-port-value');
      const mode = modeCourant(document.getElementById('mode-livraison-hidden')?.value);
      const modeFacture = (MODES_LIVRAISON[mode]?.fraisPort || 0) > 0;
      if (fraisRow) {
        fraisRow.classList.toggle('hidden', !modeFacture);
        if (fraisVal) fraisVal.textContent = shipping === 0 ? 'Offerte' : formatEur(shipping);
      }
    }

    // Exposé pour le script de bascule mode dans commande.njk
    window.checkoutUpdateShipping = renderRecap;

    // ─ Date min = aujourd'hui + 1 jour ─
    const dateInput = form.querySelector('input[name="creneauDate"]');
    if (dateInput) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      dateInput.min = tomorrow.toISOString().slice(0, 10);
    }

    // ─ Validation ─
    const showError = (name, msg) => {
      const el = form.querySelector(`[data-error-for="${name}"]`);
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('hidden');
    };
    const clearErrors = () => {
      form.querySelectorAll('.error-msg').forEach((e) => e.classList.add('hidden'));
    };
    const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const isPhone = (v) => /^[0-9 +.\-()]{8,}$/.test(v);

    function validate(formData) {
      clearErrors();
      let ok = true;
      const nom   = (formData.get('nom') || '').trim();
      const email = (formData.get('email') || '').trim();
      const tel   = (formData.get('telephone') || '').trim();
      const cgv   = formData.get('cgv');
      const mode  = modeCourant(formData.get('modeLivraison'));

      if (nom.length < 2) { showError('nom', 'Nom requis (minimum 2 caractères).'); ok = false; }
      if (!isEmail(email)) { showError('email', 'Adresse email invalide.'); ok = false; }
      if (!isPhone(tel)) { showError('telephone', 'Numéro de téléphone invalide.'); ok = false; }

      // Ce que le client doit renseigner dépend du type de saisie du mode
      const saisie = MODES_LIVRAISON[mode]?.saisie || 'creneau';

      if (saisie === 'creneau') {
        const date  = formData.get('creneauDate');
        const heure = formData.get('creneauHeure');
        if (!date) { showError('creneauDate', 'Date de retrait requise.'); ok = false; }
        if (!heure) { showError('creneauHeure', 'Créneau horaire requis.'); ok = false; }

        // Le retrait le jour même est possible, mais pas dans l'immédiat : il
        // faut laisser à la boutique le temps de préparer. Le calendrier
        // n'expose déjà que des créneaux valides — ceci rattrape le cas d'un
        // formulaire resté ouvert le temps que le créneau choisi soit dépassé.
        if (date && heure) {
          const delaiMin = MODES_LIVRAISON['click-and-collect']?.delaiPreparationMinutes ?? 60;
          const [h, mn] = heure.split(':').map(Number);
          const creneau = new Date(date + 'T00:00:00');
          creneau.setHours(h, mn, 0, 0);
          if (creneau.getTime() < Date.now() + delaiMin * 60000) {
            showError('creneauHeure', 'Ce créneau est trop proche. Choisissez-en un plus tard.');
            ok = false;
          }
        }
      } else if (saisie === 'adresse') {
        const adresse = (formData.get('livraisonAdresse') || '').trim();
        const cp      = (formData.get('livraisonCodePostal') || '').trim();
        const ville   = (formData.get('livraisonVille') || '').trim();
        if (!adresse) { showError('livraisonAdresse', 'Adresse requise.'); ok = false; }
        if (!cp) { showError('livraisonCodePostal', 'Code postal requis.'); ok = false; }
        if (!ville) { showError('livraisonVille', 'Ville requise.'); ok = false; }
      } else if (saisie === 'point') {
        if (!(formData.get('pointRetraitId') || '').trim()) {
          showError('pointRetrait', 'Choisissez un point de retrait.'); ok = false;
        }
      }

      if (!cgv) { showError('cgv', 'Acceptation des CGV requise.'); ok = false; }
      return ok;
    }

    // ─ Submit ─
    let submitMode = 'en-magasin';
    form.querySelectorAll('button[type="submit"]').forEach((btn) => {
      btn.addEventListener('click', () => { submitMode = btn.dataset.mode || 'en-magasin'; });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      if (!validate(fd)) return;

      const items = buildOrderItems();
      if (!items.length) return;

      const modeLiv = modeCourant(fd.get('modeLivraison'));
      const saisie  = MODES_LIVRAISON[modeLiv]?.saisie || 'creneau';
      const subTTC  = items.reduce((sum, it) => sum + it.prix * it.qty, 0);
      const shipping = getShippingCost(subTTC);
      const payload = {
        client: {
          nom: fd.get('nom').trim(),
          email: fd.get('email').trim(),
          telephone: fd.get('telephone').trim(),
          notes: (fd.get('notes') || '').trim(),
        },
        items,
        modeLivraison: modeLiv,
        creneauRetrait: saisie === 'creneau' ? {
          date: fd.get('creneauDate'),
          heure: fd.get('creneauHeure'),
        } : null,
        adresseLivraison: saisie === 'adresse' ? {
          adresse: (fd.get('livraisonAdresse') || '').trim(),
          codePostal: (fd.get('livraisonCodePostal') || '').trim(),
          ville: (fd.get('livraisonVille') || '').trim(),
        } : null,
        // Renseigné par le callback du widget transporteur (lots B et C)
        pointRetrait: saisie === 'point' ? {
          transporteur: (fd.get('pointRetraitTransporteur') || '').trim(),
          id:           (fd.get('pointRetraitId') || '').trim(),
          nom:          (fd.get('pointRetraitNom') || '').trim(),
          adresse:      (fd.get('pointRetraitAdresse') || '').trim(),
          cp:           (fd.get('pointRetraitCp') || '').trim(),
          ville:        (fd.get('pointRetraitVille') || '').trim(),
        } : null,
        fraisPort: shipping,
        mode: submitMode,
      };

      const submitBtn = form.querySelector(`button[data-mode="${submitMode}"]`);
      const origLabel = submitBtn?.innerHTML;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Envoi en cours…';
      }
      statusEl?.classList.add('hidden');

      try {
        const endpoint = submitMode === 'monetico' ? '/api/create-payment' : '/api/submit-reservation';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('Erreur ' + res.status));

        if (submitMode === 'monetico' && data.paymentUrl && data.fields) {
          // Monetico Paiement attend un POST de formulaire scellé (pas une
          // simple redirection) : on construit un formulaire caché et on le
          // soumet. Le panier est vidé au retour, pas ici — si le client
          // abandonne le paiement, il retrouve son panier intact.
          const mForm = document.createElement('form');
          mForm.method = 'post';
          mForm.action = data.paymentUrl;
          mForm.style.display = 'none';
          Object.entries(data.fields).forEach(([name, value]) => {
            const input = document.createElement('input');
            input.type  = 'hidden';
            input.name  = name;
            input.value = value;
            mForm.appendChild(input);
          });
          document.body.appendChild(mForm);
          // On mémorise la commande en cours pour vider le panier au retour
          try { sessionStorage.setItem('mcv-pending-order', data.orderId); } catch (_) {}
          mForm.submit();
          return;
        }

        // Click & Collect : on vide le panier et on redirige vers la page de confirmation
        setCart([]);
        window.location.href = '/commande/confirmation/?id=' + encodeURIComponent(data.orderId);
      } catch (err) {
        if (statusEl) {
          statusEl.className = 'p-4 rounded-xl text-sm border border-red-400/30 bg-red-400/10 text-red-300';
          statusEl.textContent = 'Une erreur est survenue : ' + err.message + '. Réessayez ou contactez la boutique.';
          statusEl.classList.remove('hidden');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origLabel;
        }
      }
    });

    renderRecap();
  }


  // ─── 11. Page recherche (/recherche/) ──────────────────────────────────────
  initSearchPage();

  function initSearchPage() {
    const input    = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');
    if (!input || !resultsEl) return;

    const countEl = document.getElementById('search-count');
    const emptyEl = document.getElementById('search-empty');
    const dataEl  = document.getElementById('produits-data');

    let produits = [];
    try { produits = JSON.parse(dataEl?.textContent || '[]'); } catch {}

    const formatEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    function renderCard(p) {
      const safeNom = (p.nom || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      return `
        <article class="product-card flex flex-col" data-marque="${p.marque || ''}" data-prix="${p.prix}">
          <a href="/produits/${p.id}/" class="block relative overflow-hidden shrink-0" style="aspect-ratio:1/1;">
            <img src="${p.image}" alt="${safeNom}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy"/>
          </a>
          <div class="p-5 flex flex-col flex-1">
            <div class="text-smoke text-xs uppercase tracking-widest mb-1 font-mono">${(p.categorie || '').toUpperCase()} · ${p.marque || ''}</div>
            <h3 class="text-white font-semibold text-sm leading-snug mb-3"><a href="/produits/${p.id}/" class="hover:text-neon-violet transition-colors">${safeNom}</a></h3>
            <div class="flex-1"></div>
            <div class="font-display text-2xl mt-auto" style="color:var(--gold);">${formatEur(p.prix)}</div>
          </div>
        </article>`;
    }

    function search(q) {
      const query = norm(q.trim());
      if (!query) {
        // Afficher les 8 premiers bestsellers (ou les 8 premiers produits) en état initial
        const defaults = produits.filter((p) => p.tags && p.tags.includes('bestseller')).slice(0, 8);
        const shown = defaults.length >= 4 ? defaults : produits.slice(0, 8);
        emptyEl?.classList.add('hidden');
        resultsEl.innerHTML = shown.map(renderCard).join('');
        if (countEl) countEl.textContent = 'Nos bestsellers · ' + produits.length + ' produits au catalogue';
        return;
      }

      const matches = produits.filter((p) => {
        const haystack = [
          p.nom, p.marque, p.categorie, p.descriptionCourte,
          (p.tags || []).join(' '), (p.saveurs || []).join(' '),
          ...(Object.values(p.ficheTechnique || {})),
        ].map(norm).join(' ');
        return haystack.includes(query);
      });

      if (!matches.length) {
        resultsEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        if (countEl) countEl.textContent = '0 résultat pour « ' + q + ' »';
        return;
      }
      emptyEl?.classList.add('hidden');
      resultsEl.innerHTML = matches.map(renderCard).join('');
      if (countEl) countEl.textContent = matches.length + ' résultat' + (matches.length > 1 ? 's' : '') + ' pour « ' + q + ' »';
    }

    let timer = null;
    input.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => search(e.target.value), 100);
    });

    // Autofocus uniquement sur desktop (évite l'ouverture du clavier sur mobile)
    if (window.matchMedia('(min-width: 1024px)').matches) {
      input.focus();
    }

    // Si query string ?q=
    const initialQ = new URLSearchParams(window.location.search).get('q');
    if (initialQ) {
      input.value = initialQ;
      search(initialQ);
    } else {
      search('');
    }
  }

})();
