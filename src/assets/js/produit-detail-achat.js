/**
 * Inscription au retour en stock.
 *
 * Volontairement autonome : ce formulaire est la dernière chance de ne pas
 * perdre la visite, il ne doit dépendre d'aucun autre script de la page.
 */
(function () {
  var form = document.getElementById('attente-form');
  if (!form) return;
  var champ   = document.getElementById('attente-email');
  var message = document.getElementById('attente-message');
  var bouton  = form.querySelector('button[type="submit"]');

  function dire(texte, estErreur) {
    message.textContent = texte;
    message.classList.toggle('est-erreur', !!estErreur);
    message.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (champ.value || '').trim();
    if (!email) return;

    bouton.disabled = true;
    var libelle = bouton.textContent;
    bouton.textContent = 'Envoi…';

    fetch('/api/attente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: form.dataset.produit, email: email }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Enregistrement impossible');
        // Le formulaire disparaît : le laisser ouvert inviterait à
        // s'inscrire deux fois, sans effet et sans le dire.
        form.querySelector('.attente-champs').hidden = true;
        dire('C’est noté. Vous serez prévenu dès le retour de ce produit.', false);
      })
      .catch(function (err) {
        dire(err.message, true);
        bouton.disabled = false;
        bouton.textContent = libelle;
      });
  });
})();
