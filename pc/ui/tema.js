/* Il tema prima di disegnare qualsiasi cosa, così la pagina non lampeggia di bianco. */
(function () {
  'use strict';
  let tema = 'auto';
  try { tema = localStorage.getItem('wisper-tema') || 'auto'; } catch (e) { /* senza memoria: automatico */ }
  document.documentElement.setAttribute('data-tema', tema);
})();
