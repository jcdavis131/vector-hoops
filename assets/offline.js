/* --- extracted from offline.html (retry button and online reload): moved out of the page because the site's CSP is script-src 'self' --- */
/* The service worker precaches this file (sw.js CORE) so the offline page keeps its button. */
(function(){
  var s=document.getElementById('status');
  document.getElementById('retry').addEventListener('click',function(){ s.textContent='Checking the connection…'; location.reload(); });
  window.addEventListener('online',function(){ s.textContent='Back online — reloading.'; setTimeout(function(){ location.reload(); },400); });
})();
