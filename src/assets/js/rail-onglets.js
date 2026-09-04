/**
 * assets/js/rail-onglets.js
 * Rend navigables les bandeaux d'onglets qui débordent : molette au survol,
 * et deux flèches qui n'apparaissent que s'il y a vraiment quelque chose à
 * atteindre.
 *
 * ─── Pourquoi ce fichier existe ───────────────────────────────────────────
 * Le bandeau de sous-catégories tient sur une ligne et sa barre de
 * défilement est masquée — elle jurait avec la charte. Mais une souris
 * ordinaire ne défile pas horizontalement : sans barre à glisser, le dernier
 * onglet de la catégorie « vape » était devenu inatteignable, et le défaut
 * est parti en production avant d'être vu par le commerçant.
 *
 * ⚠ Ce script est un confort, pas une béquille. Sans lui, les onglets
 * masqués restent atteignables : au doigt sur mobile, par `Maj + molette`,
 * et par tabulation — le navigateur ramène de lui-même dans le cadre le lien
 * qui reçoit le focus. Une fonctionnalité dont l'échec rend une partie du
 * site inaccessible ne doit pas dépendre de JavaScript.
 *
 * ─── Pourquoi les flèches ne sont pas dans les gabarits ───────────────────
 * Leur présence dépend d'une mesure que seul le navigateur peut faire — le
 * contenu déborde-t-il ? — et qui change quand la fenêtre est redimensionnée.
 * Une flèche écrite en dur s'afficherait là où il n'y a rien à atteindre,
 * et l'on retomberait sur la règle du dépôt : ce qui ressemble à un choix
 * doit en être un.
 * ─────────────────────────────────────────────────────────────────────────── */

(function () {
  const rails = document.querySelectorAll(".rail-onglets");
  if (!rails.length) return;

  /** Marge d'un pixel : voir la note sur le résidu sous-pixel plus bas. */
  const MARGE = 1;

  const deborde = (rail) => rail.scrollWidth - rail.clientWidth > MARGE;

  /**
   * Le fond des flèches doit être celui sur lequel le bandeau est posé,
   * sinon elles apparaissent comme deux pastilles plus claires. Le rail
   * lui-même est transparent : on remonte jusqu'au premier ancêtre
   * réellement peint.
   */
  function fondHerite(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(c)) return c;
    }
    return "";
  }

  function fleche(sens) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rail-fleche rail-fleche--" + (sens < 0 ? "gauche" : "droite");
    b.setAttribute("aria-label", sens < 0 ? "Voir les onglets précédents" : "Voir les onglets suivants");
    b.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      '<path d="' + (sens < 0 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6") + '"/></svg>';
    return b;
  }

  for (const rail of rails) {
    // ── Molette au survol ────────────────────────────────────────────────
    // L'événement n'est capté QUE s'il reste de la course dans le sens
    // demandé. Au bout du rail la molette rend la main, sinon le visiteur
    // dont le curseur passe sur le bandeau verrait la page se figer.
    //
    // ⚠ La marge d'un pixel n'est pas une coquetterie. Mesuré sur la page en
    // ligne : `scrollLeft` plafonne à 101,6 quand `scrollWidth - clientWidth`
    // vaut 102 — un résidu sous-pixel dû au zoom d'affichage. Avec un test
    // `reste > 0`, il restait éternellement 0,4 px à parcourir et la molette
    // ne rendait jamais la main.
    rail.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // geste horizontal : au navigateur
        const course = rail.scrollWidth - rail.clientWidth;
        if (course <= 0) return;
        const pas = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const reste = pas > 0 ? course - rail.scrollLeft : rail.scrollLeft;
        if (reste <= MARGE) return;
        e.preventDefault();
        rail.scrollLeft += pas;
      },
      { passive: false },
    );

    // ── Flèches ──────────────────────────────────────────────────────────
    const cadre = document.createElement("div");
    cadre.className = "rail-cadre";
    rail.parentNode.insertBefore(cadre, rail);
    cadre.appendChild(rail);

    const fond = fondHerite(cadre);
    if (fond) cadre.style.setProperty("--rail-fond", fond);

    const gauche = fleche(-1);
    const droite = fleche(1);
    cadre.append(gauche, droite);

    const doux = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [b, sens] of [[gauche, -1], [droite, 1]]) {
      b.addEventListener("click", () => {
        // Un pas de 80 % de la largeur visible : on avance franchement tout
        // en gardant un onglet commun entre avant et après, pour ne pas
        // perdre le fil.
        rail.scrollBy({ left: sens * rail.clientWidth * 0.8, behavior: doux ? "smooth" : "auto" });
      });
    }

    function majFleches() {
      const actif = deborde(rail);
      const course = rail.scrollWidth - rail.clientWidth;
      gauche.hidden = !actif || rail.scrollLeft <= MARGE;
      droite.hidden = !actif || course - rail.scrollLeft <= MARGE;
    }

    majFleches();
    rail.addEventListener("scroll", majFleches, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(majFleches).observe(rail);
    else window.addEventListener("resize", majFleches);
  }
})();
