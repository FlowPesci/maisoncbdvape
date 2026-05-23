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
      },
      fontFamily: {
        'display': ['"Cormorant Garamond"', 'Georgia', 'serif'],
        'body':    ['"DM Sans"', 'system-ui', 'sans-serif'],
        'mono':    ['"Space Mono"', 'monospace'],
      },
      borderColor: {
        'mcv-border':  'rgba(201,169,110,0.22)',
        'mcv-borderl': 'rgba(201,169,110,0.13)',
      },
    },
  },
  plugins: [],
};
