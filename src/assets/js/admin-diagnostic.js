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
  const moneticoEl = document.getElementById('diag-monetico');
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

  /**
   * Journal Monetico. Chaque `issue` désigne une cause différente, et le
   * libellé doit conduire à l'endroit où l'on corrige — pas décrire l'état.
   */
  const ISSUES = {
    'sceau-valide':          { texte: 'Sceau validé',      couleur: VERT },
    'controle-joignabilite': { texte: 'Test de l\'URL (GET)', couleur: GRIS },
    'sceau-invalide':        { texte: 'Sceau REFUSÉ',      couleur: ROUGE },
    'corps-illisible':       { texte: 'Requête illisible', couleur: ROUGE },
  };

  function rendreMonetico(journal) {
    if (!journal || !journal.length) {
      // ⚠ Ne pas conclure à la place du lecteur : le journal démarre à sa mise
      //   en service, donc un vide n'accuse la banque que si elle a testé
      //   DEPUIS. Écrire « elle ne nous joint pas » ferait chercher au mauvais
      //   endroit sur la foi d'une absence qui ne prouve rien.
      moneticoEl.innerHTML =
        '<p class="text-smoke text-sm p-6">Aucun appel enregistré depuis la mise '
        + 'en service de ce journal. Si la banque a testé <strong>après</strong> '
        + 'cette date et que rien n\'apparaît ici, c\'est qu\'elle n\'atteint pas '
        + 'cette adresse — vérifier alors l\'URL enregistrée dans le back-office '
        + 'Monetico, caractère par caractère.</p>';
      return;
    }
    const lignes = journal.map(function (e) {
      const i = ISSUES[e.issue] || { texte: e.issue, couleur: GRIS };
      let note = '';
      if (e.issue === 'sceau-invalide') {
        if (!e.cleMacPresente) {
          note = 'MONETICO_CLE_MAC est ABSENTE — c\'est la cause.';
        } else if (e.lecturesEssayees) {
          // Entrée produite par le code qui essaie les trois lectures du
          // corps : le décodage ne peut plus expliquer l'échec.
          note = 'Les ' + e.lecturesEssayees + ' lectures du corps ont échoué : '
            + 'le décodage est écarté. Reste la valeur de la clé ou le code société.';
        } else {
          // ⚠ Entrée antérieure au correctif du 2026-09-19 : une seule lecture
          //   avait été tentée. Ne rien conclure de cet échec-là.
          note = 'Refus antérieur au correctif de décodage — ne rien en conclure, '
            + 'rejouer un paiement de test.';
        }
      } else if (e.codeRetour) {
        note = 'code-retour : ' + e.codeRetour;
      }
      // Les noms de champs reçus : publics, et indispensables pour comparer
      // notre chaîne à celle de Monetico. Aucune valeur n'est affichée.
      const champs = e.champs
        ? '<div class="font-mono mt-1" style="color:#8A8A9A;font-size:.68rem;word-break:break-all;">'
          + 'champs reçus : ' + esc(e.champs) + '</div>'
        : '';
      return '<tr class="border-b border-dark-border">' +
        '<td class="py-3 px-4 text-smoke text-xs whitespace-nowrap align-top">' +
          esc(window.MCV_DATE.dateHeure(new Date(e.at))) + '</td>' +
        '<td class="py-3 px-4 align-top">' + pastille(i.texte, i.couleur) + '</td>' +
        '<td class="py-3 px-4 font-mono text-xs text-smoke align-top">cdr=' +
          (e.cdr == null ? '—' : e.cdr) + '</td>' +
        '<td class="py-3 px-4 text-smoke text-xs align-top">' + esc(note) + champs + '</td>' +
        '</tr>';
    }).join('');
    moneticoEl.innerHTML = '<table class="w-full text-sm"><tbody>' + lignes + '</tbody></table>';
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
      rendreMonetico(data.monetico);
      statusEl.classList.add('hidden');
      corpsEl.classList.remove('hidden');
    } catch (err) {
      statusEl.innerHTML = '<p class="text-red-400 text-sm">Erreur : ' + esc(err.message) + '</p>';
    }
  }

  const MESSAGES = {
    // ⚠ « Accepté », pas « envoyé ». Resend répond 200 dès qu'il prend le
    //   message en charge ; la remise a lieu après, et peut échouer (rebond)
    //   sans que rien ne revienne ici. Le 2026-09-12, le tout premier test a
    //   été accepté puis a rebondi — et l'écran affichait « Envoyé » en vert.
    //   Ne pas retoucher cette formulation pour la rendre plus rassurante.
    envoye: function (d) {
      return {
        couleur: VERT,
        texte: 'Accepté par Resend pour ' + d.destinataire + '.',
        detail: 'Identifiant : ' + (d.id || '—'),
        contexte: 'Accepté n\'est pas remis : la remise se joue ensuite. '
          + 'Vérifier l\'arrivée réelle, et en cas d\'absence le journal Resend '
          + '(resend.com/emails), qui indique « Delivered » ou « Bounced ».',
      };
    },
    'non-configure': function (d) { return { couleur: ROUGE, texte: d.message }; },
    'aucun-destinataire': function (d) { return { couleur: ROUGE, texte: d.message }; },
    // La phrase renvoyée par Resend est affichée telle quelle, sous notre
    // interprétation — c'est elle qui désigne la bonne correction quand un
    // même code HTTP recouvre plusieurs causes.
    echec: function (d) {
      return {
        couleur: ROUGE,
        texte: (d.cause || 'Échec de l\'envoi.'),
        detail: d.message,
        contexte: d.expediteur
          ? 'De : ' + d.expediteur + '  →  ' + d.destinataire
          : null,
      };
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
      let html = '<span style="color:' + rendu.couleur + ';">' + esc(rendu.texte) + '</span>';
      if (rendu.detail) {
        html += '<div class="font-mono text-xs mt-2" style="color:#C9C9D4;word-break:break-word;">' +
          esc(rendu.detail) + '</div>';
      }
      if (rendu.contexte) {
        html += '<div class="font-mono text-xs mt-1 text-smoke">' + esc(rendu.contexte) + '</div>';
      }
      resultMail.innerHTML = html;
    } catch (err) {
      resultMail.innerHTML = '<span style="color:' + ROUGE + ';">Erreur : ' + esc(err.message) + '</span>';
    } finally {
      boutonMail.disabled = false;
    }
  });

  charger();
})();
