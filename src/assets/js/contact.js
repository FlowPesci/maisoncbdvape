(function() {
  const form = document.getElementById('contact-form');
  const statusEl = document.getElementById('contact-status');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.classList.add('hidden');
    const submitBtn = form.querySelector('button[type="submit"]');
    const orig = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi…';

    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));

      statusEl.className = 'p-4 rounded-xl text-sm border border-neon-green/30 bg-neon-green/10 text-neon-green';
      statusEl.textContent = '✓ Message envoyé ! Nous vous répondrons sous 24 h ouvrées.';
      statusEl.classList.remove('hidden');
      form.reset();
    } catch (err) {
      statusEl.className = 'p-4 rounded-xl text-sm border border-red-400/30 bg-red-400/10 text-red-300';
      statusEl.textContent = 'Erreur : ' + err.message + '. Réessayez ou écrivez à contact@maisoncbdvape.fr.';
      statusEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = orig;
    }
  });
})();
