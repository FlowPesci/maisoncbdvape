    var newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) newsletterForm.addEventListener('submit', handleNewsletter);

    async function handleNewsletter(e) {
      e.preventDefault();
      var form = document.getElementById('newsletter-form');
      var btn  = document.getElementById('newsletter-btn');
      var errEl= document.getElementById('newsletter-error');
      var email= document.getElementById('newsletter-email').value.trim();
      errEl.classList.add('hidden');
      btn.disabled = true; btn.textContent = '…';
      try {
        var res  = await fetch('/api/newsletter', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
        var data = await res.json().catch(function(){ return {}; });
        if (!res.ok) throw new Error(data.error || 'Erreur réseau');
        form.style.display = 'none';
        document.getElementById(data.already ? 'newsletter-already' : 'newsletter-success').classList.remove('hidden');
      } catch(err) {
        errEl.textContent = err.message; errEl.classList.remove('hidden');
        btn.disabled = false; btn.textContent = "S'inscrire";
      }
    }
    
