/* --- extracted from offline.html (inline block) (pure move; no behavior change) --- */
(function(){
  var s=document.getElementById('status');
  document.getElementById('retry').addEventListener('click',function(){ s.textContent='Checking the connection…'; location.reload(); });
  window.addEventListener('online',function(){ s.textContent='Back online — reloading.'; setTimeout(function(){ location.reload(); },400); });
})();
