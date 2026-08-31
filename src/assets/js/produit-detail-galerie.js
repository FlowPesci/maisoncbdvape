/**
 * Avis clients — affichage et dépôt.
 *
 * Tout est chargé depuis /api/avis : la page est statique, les avis ne le
 * sont pas. Une fiche construite ce matin doit montrer l'avis déposé cet
 * après-midi.
 *
 * ⚠ Ce bloc a remplacé deux avis écrits en dur dans le gabarit. Ne jamais
 *   réintroduire d'avis en clair ici : voir functions/api/avis.js.
 */
(function () {
  var zone = document.getElementById('avis-zone');
  if (!zone) return;
  var produitId = zone.dataset.produit;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  function etoiles(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span class="' + (i <= n ? 'star-filled' : 'star-empty') + '">★</span>';
    return out;
  }

  function carte(a) {
    var initiales = (a.auteur || '?').trim().split(/\s+/).map(function (m) { return m[0]; })
      .join('').slice(0, 2).toUpperCase();
    return '<div class="review-card p-5">' +
      '<div class="flex items-start justify-between mb-3 gap-3">' +
        '<div class="flex items-center gap-3">' +
          '<div class="avis-initiales">' + esc(initiales) + '</div>' +
          '<div>' +
            '<div style="color:var(--cream);font-weight:600;font-size:.875rem;">' + esc(a.auteur) + '</div>' +
            '<div style="color:var(--muted);font-size:.7rem;">Achat vérifié' +
              (a.creeLe ? ' · ' + window.MCV_DATE.courte(a.creeLe) : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex gap-0.5 text-sm shrink-0">' + etoiles(a.note) + '</div>' +
      '</div>' +
      (a.commentaire ? '<p style="color:var(--muted);font-size:.875rem;line-height:1.65;">'
        + esc(a.commentaire) + '</p>' : '') +
    '</div>';
  }

  function synthese(d) {
    if (!d.nombre) return '';
    var barres = [5, 4, 3, 2, 1].map(function (n) {
      var c = (d.repartition && d.repartition[n]) || 0;
      var pct = d.nombre ? Math.round((c / d.nombre) * 100) : 0;
      return '<div class="flex items-center gap-3">' +
        '<span style="color:var(--muted);font-size:.75rem;width:1rem;">' + n + '★</span>' +
        '<div class="rating-bar-track flex-1"><div class="rating-bar-fill" style="width:' + pct + '%;"></div></div>' +
        '<span style="color:var(--muted);font-size:.75rem;width:2rem;text-align:right;">' + c + '</span>' +
      '</div>';
    }).join('');

    return '<div class="grid sm:grid-cols-2 gap-8 mb-8">' +
      '<div class="flex flex-col items-center justify-center py-6 text-center" style="border:1px solid var(--borderl);background:var(--dark);border-radius:2px;">' +
        '<div style="font-family:var(--font-titre);font-size:4.5rem;font-weight:300;color:var(--gold);margin-bottom:.25rem;">' + d.note + '</div>' +
        '<div class="flex gap-1 mb-2 text-2xl">' + etoiles(Math.round(d.note)) + '</div>' +
        '<div style="color:var(--muted);font-size:.7rem;">' +
          d.nombre + ' avis vérifié' + (d.nombre > 1 ? 's' : '') +
        '</div>' +
      '</div>' +
      '<div class="space-y-2.5">' + barres + '</div>' +
    '</div>';
  }

  var formulaire =
    '<details class="avis-depot">' +
      '<summary>Vous avez acheté ce produit ? Déposer un avis</summary>' +
      '<form id="avis-form">' +
        '<p class="avis-depot-aide">Votre numéro de commande et votre e-mail servent uniquement à vérifier l’achat. Ils ne sont jamais publiés.</p>' +
        '<div class="avis-grille">' +
          '<label>Numéro de commande<input name="orderId" required placeholder="MCV-..."/></label>' +
          '<label>E-mail de la commande<input name="email" type="email" required placeholder="vous@exemple.fr"/></label>' +
          '<label>Nom affiché<input name="auteur" maxlength="60" placeholder="Mathieu B."/></label>' +
          '<label>Note<select name="note" required>' +
            '<option value="">—</option>' +
            '<option value="5">5 ★</option><option value="4">4 ★</option>' +
            '<option value="3">3 ★</option><option value="2">2 ★</option>' +
            '<option value="1">1 ★</option>' +
          '</select></label>' +
        '</div>' +
        '<label class="avis-large">Votre avis<textarea name="commentaire" rows="4" maxlength="1500" placeholder="Ce que vous en pensez…"></textarea></label>' +
        '<button type="submit" class="btn-gold avis-envoi">Envoyer</button>' +
        '<p id="avis-retour" class="avis-message" hidden></p>' +
      '</form>' +
    '</details>';

  function brancherFormulaire() {
    var form = document.getElementById('avis-form');
    if (!form) return;
    var retour = document.getElementById('avis-retour');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bouton = form.querySelector('button[type="submit"]');
      var d = Object.fromEntries(new FormData(form).entries());
      d.produitId = produitId;
      d.note = parseInt(d.note, 10);

      bouton.disabled = true;
      var libelle = bouton.textContent;
      bouton.textContent = 'Envoi…';

      fetch('/api/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.j.error || 'Envoi impossible');
          form.innerHTML = '<p class="avis-message">Merci. Votre avis sera publié après vérification.</p>';
        })
        .catch(function (err) {
          retour.textContent = err.message;
          retour.classList.add('est-erreur');
          retour.hidden = false;
          bouton.disabled = false;
          bouton.textContent = libelle;
        });
    });
  }

  fetch('/api/avis?produit=' + encodeURIComponent(produitId))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      // L'en-tête et l'onglet reprennent le même chiffre : une seule source.
      var resume = document.getElementById('avis-resume');
      var compte = document.getElementById('avis-compte');
      if (d.nombre && resume) {
        resume.innerHTML = '<div class="flex items-center gap-0.5 text-lg">' + etoiles(Math.round(d.note)) + '</div>' +
          '<span style="color:var(--cream);font-weight:600;font-size:.875rem;">' + d.note + '</span>' +
          '<a href="#reviews" class="avis-lien">' + d.nombre + ' avis vérifié' + (d.nombre > 1 ? 's' : '') + '</a>';
        resume.hidden = false;
      }
      if (d.nombre && compte) compte.textContent = ' (' + d.nombre + ')';

      var liste = (d.avis || []).map(carte).join('');
      zone.innerHTML = synthese(d) +
        (liste
          ? '<div class="space-y-4">' + liste + '</div>'
          : '<p class="avis-vide">Aucun avis pour le moment. Soyez le premier à donner le vôtre.</p>') +
        formulaire;
      brancherFormulaire();
    })
    .catch(function () {
      // Un service d'avis indisponible ne doit pas laisser un « Chargement… »
      // figé : on retire la section plutôt que d'afficher une panne.
      zone.innerHTML = formulaire;
      brancherFormulaire();
    });
})();
