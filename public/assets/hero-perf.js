(function(){
  var low=false;
  try{
    var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    var save=c&&c.saveData;
    var mem=navigator.deviceMemory||8;
    var cores=navigator.hardwareConcurrency||8;
    low=save||mem<=4||cores<=3||window.innerWidth<360;
  }catch(e){}
  try{ low = low || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch{}
  window.__VH_LOW_END=low; window.VH_PERF={isLowEnd:low};
  if(low) document.documentElement.classList.add('vh-low-end');

  // progress helper for vectors_search_lite
  var progBar=null;
  function ensureProgress(){
    if(low) return null;
    var bg=document.querySelector('.embed-hero__bg'); if(!bg) return null;
    if(document.getElementById('hero-load-progress')) return document.getElementById('hero-load-bar');
    var prog=document.createElement('div'); prog.id='hero-load-progress'; prog.style.cssText='position:absolute;left:12px;right:12px;bottom:12px;height:3px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;z-index:2;';
    prog.innerHTML='<div id="hero-load-bar" style="height:100%;width:0%;background:#F0E442;transition:width .2s;"></div>';
    bg.appendChild(prog); return document.getElementById('hero-load-bar');
  }
  window._vhSetLoadProgress=function(p){
    var bar=progBar||ensureProgress(); if(bar) bar.style.width=Math.min(100,Math.max(0,p*100))+'%';
    if(p>=1) setTimeout(function(){ var pr=document.getElementById('hero-load-progress'); if(pr) pr.remove(); }, 700);
  };
  // monkey patch fetch for search_lite progress
  if(!low){
    var orig=window.fetch;
    window.fetch=function(input,init){
      var url=typeof input==='string'?input:(input&&input.url)||'';
      if(url.indexOf('vectors_search_lite.json')!==-1||url.indexOf('vectors_lite.json')!==-1){
        progBar=ensureProgress();
        return orig(input,init).then(function(resp){
          if(!resp.body || !resp.headers.get('content-length')){ window._vhSetLoadProgress(1); return resp; }
          var reader=resp.body.getReader(); var received=0; var len=parseInt(resp.headers.get('content-length')||'0',10)||0;
          var stream=new ReadableStream({start:function(controller){
            function pump(){ return reader.read().then(function(r){ if(r.done){ window._vhSetLoadProgress(1); controller.close(); return; } received+=r.value.byteLength; if(len) window._vhSetLoadProgress(received/len); controller.enqueue(r.value); return pump(); }); } return pump();
          }}); return new Response(stream,{headers:resp.headers,status:resp.status,statusText:resp.statusText});
        });
      }
      return orig(input,init);
    };
  }
})();
