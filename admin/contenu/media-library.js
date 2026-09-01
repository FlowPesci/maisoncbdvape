(function() {
    // L'authentification passe par le cookie de session posé au callback
    // OAuth (functions/api/auth/callback.js, mode=decap) : ces appels n'ont
    // plus besoin de porter le jeton GitHub eux-mêmes. Voir
    // functions/_shared/session.js.

    // ─── Filigrane ──────────────────────────────────────────────────────────
    //
    // Il est cuit dans le fichier AVANT l'envoi vers R2, ici, dans le
    // navigateur. Deux raisons de le faire à cet endroit et pas ailleurs :
    //
    //   Un filigrane posé en CSS par-dessus l'image ne protège rien — le
    //   fichier stocké reste intact, et l'onglet réseau le livre en un clic.
    //   Seul le fichier lui-même vaut protection.
    //
    //   Et les Workers Cloudflare ne savent pas composer une image sans
    //   passer par un service payant. Le navigateur, lui, a déjà un canvas.
    //
    // ⚠ Le texte est « maisoncbdvape.fr », pas « © MaisonCBDVape ». La
    // nuance n'est pas cosmétique : les visuels du catalogue viennent de
    // l'ancien site vitrine et, pour partie, des fiches fournisseurs. Une
    // adresse dit « cette annonce vient de cette boutique » — ce qui est
    // vrai. Un symbole de copyright revendiquerait la paternité des
    // photographies, ce qui ne l'est pas.
    //
    // Discret et en coin, volontairement : sur une photo produit, un
    // filigrane qui gêne la lecture de l'article coûte des ventes, et
    // Google Shopping refuse les images à surimpression envahissante.

    const FILIGRANE_TEXTE = 'maisoncbdvape.fr';

    /** Les SVG sont des tracés, pas des photos : rien à marquer. */
    const filigranable = (type) => /^image\/(jpeg|png|webp)$/.test(type);

    function chargerImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
        img.src = url;
      });
    }

    async function filigraner(file) {
      if (!filigranable(file.type)) return file;

      let img;
      try {
        img = await chargerImage(file);
      } catch {
        // Un filigrane raté ne doit jamais empêcher une mise en ligne :
        // le commerçant perdrait sa photo pour un ornement.
        return file;
      }

      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Taille relative à l'image : un corps fixe serait illisible sur une
      // photo de 2000 px et écraserait une vignette de 400 px.
      const corps = Math.max(11, Math.round(c.width * 0.028));
      const marge = Math.round(c.width * 0.025);

      ctx.font = `500 ${corps}px 'DM Sans', system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      // Ombre portée sombre sous un texte clair : c'est ce qui rend le
      // filigrane lisible aussi bien sur un packshot blanc que sur une
      // photo d'ambiance sombre, sans avoir à choisir.
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.round(corps * 0.5);
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(FILIGRANE_TEXTE, c.width - marge, c.height - marge);

      // On conserve le type d'origine : convertir un PNG à fond transparent
      // en JPEG lui donnerait un fond noir.
      const type = file.type === 'image/png' ? 'image/png' : file.type;
      const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
      if (!blob) return file;

      return new File([blob], file.name, { type, lastModified: Date.now() });
    }

    async function uploadFile(fichierOrigine) {
      const file = await filigraner(fichierOrigine);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'produits');
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || ('HTTP ' + res.status));
      }
      return await res.json(); // { key, url, name, size, contentType }
    }

    async function listFiles() {
      const res = await fetch('/api/media/list?folder=produits');
      if (!res.ok) throw new Error('Liste indisponible');
      const { files } = await res.json();
      return files;
    }

    async function deleteFile(key) {
      const res = await fetch('/api/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error('Suppression échouée');
    }

    // ─── Plugin custom Decap ───────────────────────────────────────────
    // Doc : https://decapcms.org/docs/custom-media-library/
    const r2MediaLibrary = {
      name: 'cloudflare-r2',

      init: ({ options = {}, handleInsert }) => ({
        enableStandalone: () => true,

        show: async ({ allowMultiple = false, value, config = {} } = {}) => {
          // Fenêtre modale custom : liste + upload + sélection
          const modal = document.createElement('div');
          modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;';
          modal.innerHTML = `
            <div style="background:#12121A;border:1px solid #1E1E2E;border-radius:16px;max-width:900px;width:100%;max-height:80vh;display:flex;flex-direction:column;color:#fff;font-family:system-ui,sans-serif;overflow:hidden;">
              <div style="padding:20px 24px;border-bottom:1px solid #1E1E2E;display:flex;justify-content:space-between;align-items:center;">
                <h2 style="margin:0;font-size:18px;">Bibliothèque images (Cloudflare R2)</h2>
                <button id="r2-close" style="background:none;border:none;color:#8A8A9A;font-size:28px;cursor:pointer;line-height:1;">×</button>
              </div>
              <div style="padding:16px 24px;border-bottom:1px solid #1E1E2E;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                <label style="cursor:pointer;background:linear-gradient(135deg,#39FF14,#00C853);color:#0A0A0F;padding:8px 16px;border-radius:8px;font-weight:bold;font-size:13px;">
                  <input type="file" id="r2-upload" accept="image/jpeg,image/png,image/webp,image/svg+xml" style="display:none;" ${allowMultiple ? 'multiple' : ''}/>
                  ⬆ Uploader une image
                </label>
                <span id="r2-status" style="color:#8A8A9A;font-size:13px;"></span>
              </div>
              <div id="r2-grid" style="padding:16px 24px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;flex:1;">
                <p style="color:#8A8A9A;text-align:center;grid-column:1/-1;">Chargement…</p>
              </div>
            </div>`;
          document.body.appendChild(modal);

          const grid = modal.querySelector('#r2-grid');
          const statusEl = modal.querySelector('#r2-status');
          const closeBtn = modal.querySelector('#r2-close');
          const uploadInput = modal.querySelector('#r2-upload');

          const close = () => modal.remove();
          closeBtn.addEventListener('click', close);
          modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

          async function refresh() {
            grid.innerHTML = '<p style="color:#8A8A9A;text-align:center;grid-column:1/-1;">Chargement…</p>';
            try {
              const files = await listFiles();
              if (!files.length) {
                grid.innerHTML = '<p style="color:#8A8A9A;text-align:center;grid-column:1/-1;">Aucune image. Cliquez "Uploader une image" pour commencer.</p>';
                return;
              }
              grid.innerHTML = '';
              files.forEach((f) => {
                const card = document.createElement('div');
                card.style.cssText = 'background:#0A0A0F;border:1px solid #1E1E2E;border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .2s;display:flex;flex-direction:column;';
                card.innerHTML = `
                  <div style="aspect-ratio:1;background:#0A0A0F;">
                    <img src="${f.url}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>
                  </div>
                  <div style="padding:6px 8px;font-size:11px;color:#fff;word-break:break-all;line-height:1.3;">${f.name}</div>
                  <button data-del="${f.key}" style="background:none;border:none;color:#FF5050;padding:4px;cursor:pointer;font-size:11px;border-top:1px solid #1E1E2E;">Supprimer</button>
                `;
                card.addEventListener('mouseenter', () => card.style.borderColor = '#BF5FFF');
                card.addEventListener('mouseleave', () => card.style.borderColor = '#1E1E2E');
                card.addEventListener('click', (e) => {
                  if (e.target.dataset.del) return; // bouton suppression géré ailleurs
                  // Insère l'URL dans Decap
                  handleInsert(f.url);
                  close();
                });
                grid.appendChild(card);
              });

              // Boutons supprimer
              grid.querySelectorAll('[data-del]').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                  e.stopPropagation();
                  if (!confirm('Supprimer cette image ?')) return;
                  try {
                    statusEl.textContent = 'Suppression…';
                    await deleteFile(btn.dataset.del);
                    statusEl.textContent = '✓ Supprimée';
                    refresh();
                  } catch (err) {
                    statusEl.textContent = '✗ ' + err.message;
                  }
                });
              });
            } catch (err) {
              grid.innerHTML = `<p style="color:#FF5050;text-align:center;grid-column:1/-1;">Erreur : ${err.message}</p>`;
            }
          }

          uploadInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            for (const f of files) {
              statusEl.textContent = `Upload de ${f.name}…`;
              try {
                await uploadFile(f);
                statusEl.textContent = `✓ ${f.name} uploadé`;
              } catch (err) {
                statusEl.textContent = `✗ ${err.message}`;
                break;
              }
            }
            uploadInput.value = '';
            refresh();
          });

          refresh();
        },
      }),
    };

    // Patiente que le CMS soit chargé
    function registerWhenReady() {
      if (window.CMS && typeof window.CMS.registerMediaLibrary === 'function') {
        window.CMS.registerMediaLibrary(r2MediaLibrary);
        ajouterLiensBackOffice();
      } else {
        setTimeout(registerWhenReady, 200);
      }
    }

    /**
     * L'éditeur de contenu occupe tout l'écran : sans ces liens, on y reste
     * coincé et il faut retaper l'adresse pour revenir aux stocks ou aux
     * commandes. Ils apparaissent dans la barre latérale de Decap.
     */
    function ajouterLiensBackOffice() {
      if (typeof window.CMS.registerAdditionalLink !== 'function') return;
      [
        { id: 'tableau-de-bord', title: '← Tableau de bord', data: '/admin/' },
        { id: 'commandes',       title: 'Commandes',         data: '/admin/commandes/' },
        { id: 'stocks',          title: 'Stocks',            data: '/admin/stocks/' },
        { id: 'reception',       title: 'Réception',         data: '/admin/reception/' },
        { id: 'boutique',        title: 'Voir la boutique',  data: '/' },
      ].forEach(function (lien) {
        try { window.CMS.registerAdditionalLink(lien); } catch (e) {}
      });
    }

    registerWhenReady();
  })();
