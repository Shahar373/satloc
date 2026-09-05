// Runs before the application bundle (classic script, allowed by the CSP). If the bundle fails to
// load or throws during start-up, the error is shown on screen instead of a blank window.
(function () {
  var shown = false;
  function show(message) {
    if (shown) return;
    shown = true;
    var el = document.getElementById('boot');
    if (!el) return;
    el.className = 'boot boot--error';
    el.textContent = 'SatLoc could not start.\n\n' + message + '\n\nPress Ctrl+Shift+I for details, and report this at github.com/Shahar373/satloc.';
  }
  window.addEventListener('error', function (event) {
    var err = event.error;
    show(err && err.stack ? err.stack : event.message || String(err));
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    show(reason && reason.stack ? reason.stack : String(reason));
  });
  window.addEventListener('securitypolicyviolation', function (event) {
    show('Content Security Policy blocked ' + event.violatedDirective + ' for ' + (event.blockedURI || 'inline code') + '.');
  });
  // The React app removes the placeholder on mount; if it never does, say so after a while.
  setTimeout(function () {
    var el = document.getElementById('boot');
    if (el && !shown) show('The application bundle did not run within 20 seconds.');
  }, 20000);
})();
