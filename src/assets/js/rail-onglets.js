/**
 * assets/js/rail-onglets.js
 * La molette fait défiler les bandeaux d'onglets qui débordent.
 *
 * ─── Pourquoi ce fichier existe ───────────────────────────────────────────
 * Le bandeau de sous-catégories tient sur une ligne et sa barre de
 * défilement est masquée — elle jurait avec la charte. Mais une souris
 * ordinaire ne défile pas horizontalement : sans barre à glisser, le dernier
 * onglet de la catégorie « vape » devenait inatteignable. Le défaut est
 * parti en production avant d'être vu par le commerçant.
 *
 * Survoler le bandeau et tourner la molette le fait donc défiler.
 *
 * ⚠ Ce script est un confort, pas une béquille. Sans lui, les onglets
 * masqués restent atteignables : au doigt sur mobile, par `Maj + molette`,
 * et par tabulation — le navigateur ramène de lui-même dans le cadre le lien
 * qui reçoit le focus. Une fonctionnalité dont l'échec rend une partie du
 * site inaccessible ne doit pas dépendre de JavaScript.
 *
 * ─── La politesse qui fait la différence ──────────────────────────────────
 * Détourner la molette est agaçant si c'est fait sans nuance : le visiteur
 * qui fait défiler la page et dont le curseur passe au-dessus du bandeau
 * verrait la page se figer.
 *
 * L'événement n'est donc capté QUE s'il reste de la course dans le sens
 * demandé. Arrivé au bout du rail, la molette rend la main à la page, et le
 * défilement vertical reprend comme si de rien n'était.
 *
 * ⚠ La tolérance d'un pixel n'est pas une coquetterie. Mesuré sur la page en
 * ligne : `scrollLeft` plafonne à 101,6 quand `scrollWidth - clientWidth`
 * vaut 102 — un résidu sous-pixel dû au zoom d'affichage. Avec un test
 * `reste > 0`, il restait éternellement 0,4 px à parcourir : la molette ne
 * rendait jamais la main, et la page se figeait dès que le curseur passait
 * sur le bandeau. Exactement le défaut que ce script devait éviter.
 * ─────────────────────────────────────────────────────────────────────────── */

(function () {
  const rails = document.querySelectorAll(".rail-onglets");
  if (!rails.length) return;

  for (const rail of rails) {
    rail.addEventListener(
      "wheel",
      (e) => {
        // Une molette horizontale (ou un trackpad) sait déjà faire : on
        // n'intervient que sur le geste vertical.
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

        const course = rail.scrollWidth - rail.clientWidth;
        if (course <= 0) return; // rien ne dépasse, rien à faire

        // deltaMode 1 = défilement par lignes (Firefox), 0 = par pixels.
        const pas = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;

        const reste = pas > 0
          ? course - rail.scrollLeft   // il reste à droite
          : rail.scrollLeft;           // il reste à gauche
        if (reste <= 1) return;        // bout atteint : la page reprend la main

        e.preventDefault();
        rail.scrollLeft += pas;
      },
      { passive: false },
    );
  }
})();
