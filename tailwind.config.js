/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{njk,html,js,md}",
    "./admin/**/*.{html,njk}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette luxury MaisonCBDVape
        'mcv-dark':       '#0E0C09',
        'mcv-dark2':      '#161410',
        'mcv-dark3':      '#1E1B15',
        'mcv-dark4':      '#252018',
        'mcv-cream':      '#F5F0E8',
        'mcv-gold':       '#C9A96E',
        'mcv-gold-light': '#E8D5A3',
        'mcv-muted':      '#8A8070',
        'mcv-text':       '#D8D0C4',
        'mcv-green':      '#4A7C59',

        // ─── Noms hérités de l'ancien site ────────────────────────────
        // 300 usages répartis sur une vingtaine de pages écrivent encore
        // `text-smoke`, `bg-dark-card`, `btn-neon-green`… Ces jetons
        // n'existaient plus dans la configuration : Tailwind ne générait
        // AUCUNE règle pour eux, et les éléments concernés s'affichaient
        // sans style — cartes sans fond, boutons d'action sans habillage.
        //
        // Les redéclarer ici les fait pointer vers la charte actuelle en
        // une fois, sans repasser sur chaque fichier. Les renommer un jour
        // reste souhaitable, mais c'est un travail de forme : tant que ces
        // alias existent, l'apparence est juste.
        'smoke':       '#8A8070',            // texte discret  (--muted)
        'dark-bg':     '#1A1714',            // fond de page   (--dark)
        'dark-card':   '#221E1A',            // fond de carte  (--dark2)
        'dark-border': 'rgba(201,169,110,0.13)',
        'neon-green':  '#C9A96E',            // accent principal → or
        'neon-violet': '#E8D5A3',            // accent secondaire → or clair
        'neon-blue':   '#E8D5A3',
      },
      fontFamily: {
        // ⚠ Ne pas réécrire le nom de la police ici. La classe `font-display`
        // est posée sur 76 éléments, et les attributs style="" en utilisent
        // 63 autres : deux endroits pour une même décision, qui ont divergé
        // le jour où l'un des deux a changé. Les deux pointent désormais sur
        // --font-titre, déclarée une seule fois dans tailwind/input.css.
        'display': ['var(--font-titre)'],
        'body':    ['"DM Sans"', 'system-ui', 'sans-serif'],
        'mono':    ['"Space Mono"', 'monospace'],
      },
      borderColor: {
        'mcv-border':  'rgba(201,169,110,0.22)',
        'mcv-borderl': 'rgba(201,169,110,0.13)',
        'dark-border': 'rgba(201,169,110,0.13)',
      },
    },
  },
  plugins: [],
};
