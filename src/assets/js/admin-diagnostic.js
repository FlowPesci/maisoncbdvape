/**
 * src/assets/js/admin-diagnostic.js
 *
 * Écran /admin/diagnostic/ — voir functions/api/diagnostic.js pour le
 * raisonnement. Ici, rien que de l'affichage.
 *
 * ⚠ Ne jamais y ajouter l'affichage d'une valeur secrète, même « tronquée » :
 *   l'API ne les renvoie pas, et c'est délibéré.
 */
(function () {
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  const statusEl   = document.getElementById('diag-status');
  const corpsEl    = document.getElementById('diag-corps');
  const varsEl     = document.getElementById('diag-variables');
  const bindEl     = document.getElementById('diag-bindings');
  const boutonMail = document.getElementById('diag-email');
  const resultMail = document.getElementById('diag-email-resultat');

  const VERT  = '#39FF14';
  const ROUGE = '#FF5050';
  const GRIS  = '#8A8A9A';

  function pastille(texte, couleur) {
    return '<span style="background:' + couleur + '22;color:' + couleur +
      ';border:1px solid ' + couleur + '55;" ' +
      'class="text-xs font-mono font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">' +
      esc(texte) + '</span>';
  }

  function showLogin() {
    corpsEl.classList.add('hidden');
    statusEl.classList.remove('hidden');
    statusEl.innerHTML =
      '<p class="text-smoke text-sm mb-4">Connexion via GitHub requise.</p>' +
      '<a href="/api/auth/login?mode=admin&return=/admin/diagnostic/" ' +
      'class="btn-neon-green inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-widest">' +
      'Se connecter via GitHub</a>';
  }

  /**
   * Une variable absente mais facultative n'est pas une anomalie : MONETICO_TPE
   * était vide, légitimement, pendant toute l'attente du contrat bancaire.
   * L'afficher en rouge aurait appris à ignorer le rouge.
   */
  function ligneVariable(v) {
    let etat;
    if (v.present) {
      etat = pastille('présente', VERT);
      if (v.secret) {
        etat += '<span class="text-smoke text-xs font-mono" style="margin-left:.5rem;">' +
          v.longueur + ' caractères</span>';
      } else if (v.valeur) {
        etat += '<div class="text-smoke text-xs font-mono mt-1" style="word-break:break-all;">' +
          esc(v.valeur) + '</div>';
      }
    } else {
      etat = pastille(v.requis ? 'ABSENTE' : 'non renseignée', v.requis ? ROUGE : GRIS);
    }
    return '<tr class="border-b border-dark-border">' +
      '<td class="py-3 px-4 font-mono text-xs text-white align-top">' + esc(v.nom) +
        (v.secret ? '<span class="text-smoke" style="margin-left:.4rem;" title="Valeur jamais affichée">🔒</span>' : '') +
      '</td>' +
      '<td class="py-3 px-4 align-top">' + etat + '</td>' +
      '<td class="py-3 px-4 text-smoke text-xs align-top">' + esc(v.role) + '</td>' +
      '</tr>';
  }

  function ligneBinding(b) {
    return '<tr class="border-b border-dark-border">' +
      '<td class="py-3 px-4 font-mono text-xs text-white">' + esc(b.nom) + '</td>' +
      '<td class="py-3 px-4">' + pastille(b.present ? 'connectée' : 'ABSENTE', b.present ? VERT : ROUGE) + '</td>' +
      '<td class="py-3 px-4 text-smoke text-xs">' + esc(b.role) + '</td>' +
      '</tr>';
  }

  async function charger() {
    if (!window.MCV_ADMIN.connecte()) return showLogin();
    try {
      const res = await fetch('/api/diagnostic');
      if (res.status === 401 || res.status === 403) {
        return window.MCV_ADMIN.oublier().then(showLogin);
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      varsEl.innerHTML = data.variables.map(ligneVariable).join('');
      bindEl.innerHTML = data.bindings.map(ligneBinding).join('');
      statusEl.classList.add('hidden');
      corpsEl.classList.remove('hidden');
    } catch (err) {
      statusEl.innerHTML = '<p class="text-red-400 text-sm">Erreur : ' + esc(err.message) + '</p>';
    }
  }

  const MESSAGES = {
    envoye: function (d) {
      return { couleur: VERT, texte:
        'Envoyé à ' + d.destinataire + '. Identifiant Resend : ' + (d.id || '—') +
        '. S\'il n\'arrive pas, regarder les indésirables puis le journal du compte Resend.' };
    },
    'non-configure': function (d) { return { couleur: ROUGE, texte: d.message }; },
    'aucun-destinataire': function (d) { return { couleur: ROUGE, texte: d.message }; },
    echec: function (d) {
      return { couleur: ROUGE, texte: (d.cause || 'Échec de l\'envoi.') + ' (' + d.message + ')' };
    },
  };

  boutonMail?.addEventListener('click', async function () {
    boutonMail.disabled = true;
    resultMail.innerHTML = '<span class="text-smoke">Envoi…</span>';
    try {
      const res = await fetch('/api/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'email-test' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || ('HTTP ' + res.status));
      const rendu = (MESSAGES[d.verdict] || function () {
        return { couleur: GRIS, texte: 'Réponse inattendue : ' + JSON.stringify(d) };
      })(d);
      resultMail.innerHTML = '<span style="color:' + rendu.couleur + ';">' + esc(rendu.texte) + '</span>';
    } catch (err) {
      resultMail.innerHTML = '<span style="color:' + ROUGE + ';">Erreur : ' + esc(err.message) + '</span>';
    } finally {
      boutonMail.disabled = false;
    }
  });

  charger();
})();
