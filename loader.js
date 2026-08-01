// ============================================
// BENTOKS INVESTMENTS — SITE LOADER
// ============================================
// Hides #site-loader once the page is actually ready — fonts loaded AND
// every resource (images, the map iframe, Tailwind's CDN stylesheet, etc.)
// finished — so nothing shifts or "pops in" after reveal. Two safety nets:
//   - MIN_MS: never flash the loader on and immediately off on a fast
//     connection; it reads as broken rather than reassuring.
//   - MAX_MS: never leave a visitor stuck looking at the loader forever if
//     one slow resource (e.g. the contact page's map) stalls — reveal the
//     page anyway once this fires.
(function () {
  var loader = document.getElementById('site-loader');
  if (!loader) return;

  var MIN_MS = 550;
  var MAX_MS = 5000;
  var start = Date.now();

  function hide() {
    if (loader.dataset.hidden === 'true') return;
    var wait = Math.max(0, MIN_MS - (Date.now() - start));
    setTimeout(function () {
      loader.dataset.hidden = 'true';
      loader.setAttribute('aria-hidden', 'true');
      // Fully remove after the fade so it can never sit invisibly on top
      // of the page intercepting clicks/taps.
      setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 600);
    }, wait);
  }

  var fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready.catch(function () {})
    : Promise.resolve();

  var windowReady = new Promise(function (resolve) {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

  var safetyTimeout = new Promise(function (resolve) {
    setTimeout(resolve, MAX_MS);
  });

  Promise.race([
    Promise.all([fontsReady, windowReady]),
    safetyTimeout
  ]).then(hide);
})();
