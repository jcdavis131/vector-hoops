/* hero-perf.js — performance watchdog + skeleton + LOD for 10M DAU
 * - Detects saveData, deviceMemory, hardwareConcurrency, reducedMotion
 * - Switches city-intro to lite: fewer points, smaller nebula, no shadows
 * - Shows shimmer skeleton until vectors_lite loaded
 * - Odometer flip for viral counts
 * Solo personal project, free-tier only
 */
(function(){
  var isLowEnd = false;
  try{
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var saveData = conn && conn.saveData;
    var mem = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 4;
    isLowEnd = saveData || mem <=4 || cores <=3 || window.innerWidth < 400;
  }catch(e){}
  var prefersReduced = false;
  try{ prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}

  // expose flag for city-intro.js
  window.VH_PERF = {isLowEnd:isLowEnd, prefersReduced:prefersReduced};

  function initSkeleton(){
    var hero = document.getElementById('city-intro');
    if(!hero) return;
    var sk = document.createElement('div');
    sk.id='hero-skeleton';
    sk.style.cssText='position:absolute; inset:0; z-index:1; background:linear-gradient(90deg, #0a0c14 25%, #151827 37%, #0a0c14 63%); background-size:400% 100%; animation:skeletonShimmer 1.4s ease infinite; display:grid; place-items:center; color:#fff; font-family:var(--mono); font-size:11px;';
    sk.innerHTML='<div style="text-align:center;"><div style="width:48px; height:48px; border:3px solid #F0E442; border-top-color:transparent; border-radius:50%; margin:0 auto 10px; animation:spin 0.9s linear infinite;"></div>Loading 12,966 seasons…</div><style>@keyframes skeletonShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}} @keyframes spin{to{transform:rotate(360deg)}}</style>';
    var bg = hero.querySelector('.embed-hero__bg');
    if(bg) bg.prepend(sk);

    // hide skeleton when nebula + points ready
    var hide = function(){
      var el = document.getElementById('hero-skeleton');
      if(el){ el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(function(){ el.remove(); }, 400); }
    };
    // listen for custom event from city-intro
    window.addEventListener('vh:city-ready', hide, {once:true});
    // fallback after 4s
    setTimeout(hide, 4000);

    // progress for vectors_lite fetch
    if(!isLowEnd){
      var prog = document.createElement('div');
      prog.id='hero-load-progress';
      prog.style.cssText='position:absolute; left:12px; right:12px; bottom:12px; height:4px; background:rgba(255,255,255,.15); border-radius:999px; overflow:hidden; z-index:2;';
      prog.innerHTML='<div id="hero-load-bar" style="height:100%; width:0%; background:#F0E442; transition:width .2s;"></div>';
      bg && bg.appendChild(prog);
      window._vhSetLoadProgress = function(p){
        var bar = document.getElementById('hero-load-bar');
        if(bar) bar.style.width = Math.min(100, Math.max(0, p*100)) + '%';
        if(p>=1) setTimeout(function(){ var pr=document.getElementById('hero-load-progress'); if(pr) pr.remove(); }, 600);
      };
    }
  }

  function initOdometer(){
    // flip animation for viral counts when they change
    function flip(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.style.transition='transform .3s cubic-bezier(.22,1,.36,1)';
      el.style.display='inline-block';
      el.style.transform='translateY(-6px) scale(1.1)';
      setTimeout(function(){ el.style.transform='translateY(0) scale(1)'; }, 320);
    }
    var lastToday = null, lastNow = null;
    setInterval(function(){
      var t = document.getElementById('viral-today-count');
      var n = document.getElementById('viral-now-count');
      if(t && t.textContent!==lastToday){ flip('viral-today-count'); lastToday=t.textContent; }
      if(n && n.textContent!==lastNow){ flip('viral-now-count'); lastNow=n.textContent; }
    }, 1800);
  }

  function patchVectorsFetch(){
    // monkey patch fetch for vectors_lite to track progress
    if(isLowEnd) return;
    var origFetch = window.fetch;
    window.fetch = function(input, init){
      var url = typeof input==='string' ? input : (input && input.url) || '';
      if(url.indexOf('vectors_lite.json')!==-1 && window._vhSetLoadProgress){
        // try to use response body reader for progress if possible - fallback
        return origFetch(input, init).then(function(resp){
          if(!resp.body) { window._vhSetLoadProgress(1); return resp; }
          var reader = resp.body.getReader();
          var received=0;
          var len = parseInt(resp.headers.get('content-length')||'631000',10);
          var stream = new ReadableStream({
            start:function(controller){
              function pump(){
                return reader.read().then(function(result){
                  if(result.done){ window._vhSetLoadProgress(1); controller.close(); return; }
                  received+=result.value.byteLength;
                  if(len) window._vhSetLoadProgress(received/len);
                  controller.enqueue(result.value);
                  return pump();
                });
              }
              return pump();
            }
          });
          return new Response(stream, {headers: resp.headers, status: resp.status, statusText: resp.statusText});
        });
      }
      return origFetch(input, init);
    };
  }

  function init(){
    initSkeleton();
    initOdometer();
    patchVectorsFetch();
    // low-end flag adds class
    if(isLowEnd) document.documentElement.classList.add('vh-low-end');
    if(prefersReduced) document.documentElement.classList.add('vh-reduced-motion');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
