  document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.cat-tab');
    const items = document.querySelectorAll('.product-item');
    const noResults = document.getElementById('no-results');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const cat = tab.dataset.cat;

        // Style des onglets
        tabs.forEach(function (t) {
          t.style.background = 'transparent';
          t.style.border = '1px solid var(--borderl)';
          t.style.color = 'var(--muted)';
          t.classList.remove('active');
        });
        tab.style.background = 'rgba(201,169,110,0.12)';
        tab.style.border = '1px solid var(--gold)';
        tab.style.color = 'var(--gold)';
        tab.classList.add('active');

        // Filtrage
        let visible = 0;
        items.forEach(function (item) {
          if (cat === 'all' || item.dataset.cat === cat) {
            item.style.display = '';
            visible++;
          } else {
            item.style.display = 'none';
          }
        });

        noResults.classList.toggle('hidden', visible > 0);
      });
    });
  });
