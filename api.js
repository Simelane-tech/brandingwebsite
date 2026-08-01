// ============================================
// BENTOKS INVESTMENTS - API Helper (v2 Fixed)
// ============================================
(function () {
  // Determine the correct API base URL for wherever this site is hosted.
  // Previously this guessed `http://${host}:3000/api` for any unrecognized
  // host/port — which breaks completely once deployed anywhere but the
  // original localhost:3000 setup (wrong protocol, nothing listening on
  // :3000, and mixed-content blocking on an https site). Fixed to:
  //   1. Use an explicit override from config.js if one is set (for split
  //      hosting, e.g. static frontend on Vercel + API on Render/Railway).
  //   2. Otherwise default to a same-origin relative path ("/api"), which
  //      works automatically on any domain/protocol/port as long as the
  //      Express server (which also serves these static files) is what's
  //      handling the request — no hardcoded host or port needed.
  function getApiBaseUrl() {
    const override = (typeof window !== 'undefined' && window.BENTOKS_API_BASE_URL) ? String(window.BENTOKS_API_BASE_URL).trim() : '';
    if (override) return override.replace(/\/+$/, '') + '/api';
    if (window.location.protocol === 'file:') return 'http://localhost:3000/api';
    return '/api';
  }
  const API_BASE_URL = getApiBaseUrl();

  // =============================================
  // TOAST NOTIFICATIONS
  // =============================================
  function showToast(message, type) {
    type = type || 'success';
    let toast = document.getElementById('bentoks-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bentoks-toast';
      document.body.appendChild(toast);
    }
    const colors = {
      success: 'linear-gradient(135deg,#003399,#0047AB)',
      error:   'linear-gradient(135deg,#CC0000,#B00020)',
      info:    'linear-gradient(135deg,#475569,#334155)',
      warn:    'linear-gradient(135deg,#D97706,#B45309)'
    };
    const icon = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
    toast.style.cssText = `
      position:fixed; top:95px; right:18px; z-index:999999;
      max-width:420px; min-width:280px;
      padding:18px 22px; border-radius:12px;
      color:white; font-family:'DM Sans',Arial,sans-serif;
      font-size:14px; font-weight:500; line-height:1.55;
      box-shadow:0 16px 48px rgba(0,0,0,.22);
      background:${colors[type]||colors.success};
      transform:translateX(450px); opacity:0;
      transition:all .4s cubic-bezier(.2,.9,.3,1.2);
      white-space:pre-wrap; word-wrap:break-word;`;
    toast.innerHTML = `<div style="display:flex; align-items:flex-start; gap:12px;">
      <div style="font-size:20px; line-height:1.2; flex-shrink:0; margin-top:1px;">${icon[type]||''}</div>
      <div style="flex:1;">${message.replace(/\n/g,'<br>')}</div></div>`;
    requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; toast.style.opacity = '1'; });
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.transform = 'translateX(450px)'; toast.style.opacity = '0';
    }, 9000);
  }

  // =============================================
  // BUTTON LOADING STATE
  // =============================================
  function setButtonLoading(button, loading, customLabel) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalContent) button.dataset.originalContent = button.innerHTML;
      button.disabled = true;
      button.style.pointerEvents = 'none';
      button.style.opacity = '.72';
      const label = customLabel || 'Sending...';
      button.innerHTML = `<span style="display:inline-flex; align-items:center; gap:8px;">
        <span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.45);
          border-top-color:#fff;border-radius:50%;animation:bentoksSpin .8s linear infinite;"></span>${label}</span>
        <style>@keyframes bentoksSpin{to{transform:rotate(360deg)}}</style>`;
    } else {
      if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
      }
      button.disabled = false;
      button.style.pointerEvents = '';
      button.style.opacity = '';
    }
  }

  // =============================================
  // FETCH HELPER
  // =============================================
  async function callApi(endpoint, payload, formDescription) {
    let response, result;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (netErr) {
      // Network-level failure (CORS / server not running / no internet)
      const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
      const help1 = !isOnline ? 'You are OFFLINE. Reconnect to the internet first.' :
        'The email server is NOT RUNNING on your computer.';
      const help2 = !isOnline ? '' :
        `\n\n👉 Fix this:\n1. Double-click the file START_EMAIL_SERVER.bat in your website folder\n2. Wait for the black window to show "SERVER RUNNING"\n3. Then refresh this page and try again.`;
      const help3 = `\n\n📞 Still stuck? Call us directly at +268 7632 0436`;
      showToast(`${help1}${help2}${help3}`, 'error');
      return { ok: false };
    }
    try { result = await response.json(); }
    catch (parseErr) {
      showToast(`Server error (HTTP ${response.status}).\nThe server responded but didn't return valid data.\n\nIf this persists, call +268 7632 0436.`, 'error');
      return { ok: false };
    }
    if (response.ok && result && result.success) return { ok: true, data: result };
    // Server returned an error message
    showToast((result && result.message) ||
      `${formDescription} failed (HTTP ${response.status}). Please try again or call +268 7632 0436.`, 'error');
    return { ok: false, data: result };
  }

  // =============================================
  // CONTACT FORM SUBMIT
  // =============================================
  async function submitContactForm(e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = (e && e.target) || document.getElementById('contact-form');
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const name    = document.getElementById('contact-name')    ? document.getElementById('contact-name').value.trim()    : '';
    const email   = document.getElementById('contact-email')   ? document.getElementById('contact-email').value.trim()   : '';
    const phone   = document.getElementById('contact-phone')   ? document.getElementById('contact-phone').value.trim()   : '';
    const service = document.getElementById('contact-service') ? document.getElementById('contact-service').value       : '';
    const message = document.getElementById('contact-message') ? document.getElementById('contact-message').value.trim() : '';
    if (!name || !email || !message) { showToast('Please fill in NAME, EMAIL, and MESSAGE first.', 'warn'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid EMAIL address.', 'warn'); return; }
    setButtonLoading(btn, true, 'Sending message...');
    const r = await callApi('/contact', { name, email, phone, service, message }, 'Contact form');
    setButtonLoading(btn, false);
    if (r.ok) {
      form.classList.add('hidden');
      const ok = document.getElementById('contact-success');
      if (ok) ok.classList.remove('hidden');
      showToast('✅ Message sent successfully!\n\nWe will reply to your email within 24 hours.', 'success');
    }
  }
  window.submitContactForm = submitContactForm;

  // =============================================
  // QUOTE FORM SUBMIT
  // =============================================
  async function submitQuoteForm() {
    const btn = document.querySelector('#quote-step-2 button[onclick="submitQuoteForm()"]') ||
                document.querySelector('#quote-step-2 button:last-child');
    const name     = document.getElementById('quote-name')     ? document.getElementById('quote-name').value.trim()     : '';
    const company  = document.getElementById('quote-company')  ? document.getElementById('quote-company').value.trim()  : '';
    const email    = document.getElementById('quote-email')    ? document.getElementById('quote-email').value.trim()    : '';
    const phone    = document.getElementById('quote-phone')    ? document.getElementById('quote-phone').value.trim()    : '';
    const service  = document.getElementById('quote-service')  ? document.getElementById('quote-service').value         : '';
    const quantity = document.getElementById('quote-quantity') ? document.getElementById('quote-quantity').value.trim() : '';
    const deadline = document.getElementById('quote-deadline') ? document.getElementById('quote-deadline').value.trim() : '';
    const budget   = document.getElementById('quote-budget')   ? document.getElementById('quote-budget').value.trim()   : '';
    const details  = document.getElementById('quote-details')  ? document.getElementById('quote-details').value.trim()  : '';
    if (!name || !email || !phone || !service || !details) {
      showToast('Please fill in all REQUIRED fields:\n\n• Name\n• Email\n• Phone / WhatsApp\n• Service Required\n• Project Description', 'warn');
      if (typeof goToQuoteStep === 'function') goToQuoteStep(2);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid EMAIL address.', 'warn'); return; }
    setButtonLoading(btn, true, 'Submitting request...');
    const r = await callApi('/quote', { name, company, email, phone, service, quantity, deadline, budget, details }, 'Quote request');
    setButtonLoading(btn, false);
    if (r.ok) {
      const ref = (r.data && r.data.reference) || ('BNT-' + Date.now().toString().slice(-6));
      const thankNameEl = document.getElementById('quote-thank-name');
      if (thankNameEl) thankNameEl.textContent = name || 'valued client';
      const refEl = document.getElementById('quote-ref');
      if (refEl) refEl.textContent = ref;
      if (typeof goToQuoteStep === 'function') goToQuoteStep(3);
      showToast(`✅ Quote request submitted!\n\nYour reference: ${ref}\nWe'll email your detailed quote within 24 hours.`, 'success');
    } else if (typeof goToQuoteStep === 'function') {
      goToQuoteStep(2);
    }
  }
  window.submitQuoteForm = submitQuoteForm;

  // =============================================
  // NEWSLETTER SUBSCRIBE
  // =============================================
  async function submitNewsletterSubscribe(e, form) {
    if (e && e.preventDefault) e.preventDefault();
    form = form || (e && e.target);
    if (!form) return;
    const emailInput = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) { showToast('Please enter your email address.', 'warn'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid EMAIL address.', 'warn'); return; }
    setButtonLoading(btn, true, 'Subscribing...');
    const r = await callApi('/subscribe', { email }, 'Newsletter subscription');
    setButtonLoading(btn, false);
    if (r.ok) {
      form.classList.add('hidden');
      const parent = form.parentElement;
      if (parent) {
        let successDiv = parent.querySelector('[id$="success"]') || document.getElementById('newsletter-success');
        if (successDiv) successDiv.classList.remove('hidden');
      }
      showToast('✅ Subscribed successfully!\n\nThank you for joining our newsletter.', 'success');
    }
  }
  window.submitNewsletterSubscribe = submitNewsletterSubscribe;

  // =============================================
  // AUTO-ATTACH TO FOOTER NEWSLETTER FORMS
  // =============================================
  function attachListeners() {
    document.querySelectorAll('footer form, [data-newsletter-form]').forEach(f => {
      if (!f._apiBound) { f._apiBound = true; f.addEventListener('submit', (e) => submitNewsletterSubscribe(e, f)); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attachListeners);
  else attachListeners();
  // Also attach again a bit later for dynamic content
  setTimeout(attachListeners, 1200);
})();
