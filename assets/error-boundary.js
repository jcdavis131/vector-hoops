/* error-boundary.js — production grade for 100M DAU
 * Handles: window.onerror + unhandledrejection -> vh.errors (max 50, local only)
 *         offline toast, fallback cards for VHMtnn/InsightEngine, Retry 1s/2s/4s
 *         respects prefers-reduced-motion, no external telemetry
 */
(function(){
  'use strict';
  var LS_ERRORS = 'vh.errors';
  var MAX_ERRORS = 50;

  function safeNow(){ try{ return new Date().toISOString(); }catch(e){ return String(Date.now()); } }

  function getErrors(){
    try{
      var raw = localStorage.getItem(LS_ERRORS);
      if(!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
  }

  function setErrors(arr){
    try{
      localStorage.setItem(LS_ERRORS, JSON.stringify(arr.slice(-MAX_ERRORS)));
    }catch(e){
      // quota full -> drop oldest half and retry
      try{
        var trimmed = arr.slice(-Math.floor(MAX_ERRORS*0.6));
        localStorage.setItem(LS_ERRORS, JSON.stringify(trimmed));
      }catch(e2){
        try{ localStorage.removeItem(LS_ERRORS); }catch(e3){}
      }
    }
  }

  function logError(entry){
    try{
      var errors = getErrors();
      errors.push({
        ts: safeNow(),
        type: entry.type || 'error',
        message: (entry.message||'').slice(0, 500),
        source: (entry.source||'').slice(0, 300),
        lineno: entry.lineno || 0,
        colno: entry.colno || 0,
        stack: (entry.stack||'').slice(0, 800),
        url: (location.href||'').slice(0, 300),
        userAgent: (navigator.userAgent||'').slice(0, 200)
      });
      setErrors(errors);
      if(window.console && console.warn) console.warn('[vh.errors logged]', entry.message);
    }catch(e){}
  }

  function showOfflineToast(){
    if(document.getElementById('vh-offline-toast')) return;
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      // still show but no animation
    }
    var t = document.createElement('div');
    t.id='vh-offline-toast';
    t.setAttribute('role','status');
    t.setAttribute('aria-live','polite');
    t.style.cssText='position:fixed; top:calc(12px + env(safe-area-inset-top)); left:50%; transform:translateX(-50%); background:#1A150F; color:#FFFEF7; border:2.2px solid #F0E442; border-radius:999px; padding:8px 14px; font-family:ui-monospace,monospace; font-size:11px; z-index:90; box-shadow:4px 4px 0 #1A150F; max-width:90vw; text-align:center;';
    t.textContent='Offline — cached 12,966 seasons still playable. Daily + Lab work offline.';
    document.body.appendChild(t);
    setTimeout(function(){ try{ t.style.opacity='0'; t.style.transition='opacity .4s'; }catch(e){} setTimeout(function(){ try{t.remove();}catch(e){} }, 400); }, 4000);
  }

  function showFallbackCard(containerId, title, msg, retryFn){
    var container = document.getElementById(containerId);
    if(!container){
      // try generic fallback area
      container = document.querySelector('.main') || document.querySelector('.sections') || document.body;
    }
    if(!container) return;
    var existing = document.getElementById('vh-fallback-'+containerId);
    if(existing) existing.remove();
    var div = document.createElement('div');
    div.id='vh-fallback-'+containerId;
    div.setAttribute('role','alert');
    div.style.cssText='margin:10px 0; background:#FFFEF7; color:#1A150F; border:2.2px solid #1A150F; border-radius:14px; box-shadow:4px 4px 0 #1A150F; padding:14px 16px; font-family:ui-monospace,monospace; font-size:12px; line-height:1.5;';
    div.innerHTML='<div style="font-weight:900; font-size:13px; margin-bottom:4px;">'+title+'</div><div style="opacity:.9; margin-bottom:8px;">'+msg+'</div><div style="display:flex; gap:8px; flex-wrap:wrap"><button id="vh-retry-'+containerId+'" style="min-height:44px; border:2.2px solid #1A150F; background:#F0E442; border-radius:999px; font-weight:900; padding:0 14px; cursor:pointer; box-shadow:2px 2px 0 #1A150F;">Retry (1s/2s/4s)</button><a href="/offline.html" style="min-height:44px; display:inline-flex; align-items:center; border:2.2px solid #1A150F; background:#fff; color:#1A150F; border-radius:999px; padding:0 14px; font-weight:900; text-decoration:none; box-shadow:2px 2px 0 #1A150F;">Offline mode →</a></div>';
    if(container.firstChild) container.insertBefore(div, container.firstChild);
    else container.appendChild(div);
    var btn = document.getElementById('vh-retry-'+containerId);
    if(btn && retryFn){
      var attempts=0;
      var delays=[1000,2000,4000];
      btn.addEventListener('click', function(){
        btn.disabled=true;
        btn.textContent='Retrying…';
        var delay = delays[Math.min(attempts, delays.length-1)];
        setTimeout(function(){
          attempts++;
          Promise.resolve().then(retryFn).then(function(ok){
            if(ok){
              div.remove();
            } else {
              btn.disabled=false;
              btn.textContent = attempts < 3 ? 'Retry ('+delays[attempts]/1000+'s)' : 'Retry again';
              if(attempts>=3){
                btn.textContent='Retry';
              }
            }
          }).catch(function(e){
            logError({type:'retry-fail', message:String(e), stack:e && e.stack, source:containerId});
            btn.disabled=false;
            btn.textContent='Retry';
          });
        }, delay);
      });
    }
  }

  // Global handlers
  window.addEventListener('error', function(ev){
    // resource errors vs js errors
    var target = ev.target;
    var isResource = target && (target.src || target.href) && target.tagName !== 'HTML';
    if(isResource){
      logError({
        type:'resource',
        message: 'Failed to load ' + (target.src || target.href || target.tagName),
        source: target.src || target.href,
        lineno: 0,
        stack: ''
      });
      if((target.src||'').indexOf('mtnn_embeddings')!==-1 || (target.src||'').indexOf('vectors')!==-1){
        try{ window.dispatchEvent(new CustomEvent('vh:vectors-failed')); }catch(e){}
        showFallbackCard('sky-demo','Sky took longer to load','12,966 seasons map is 617KB lite-first + 2.5MB embeddings. Check connection — cache still works offline.', function(){
          location.reload();
          return false;
        });
      }
      return;
    }
    // js error
    logError({
      type:'js',
      message: ev.message || (ev.error && ev.error.message) || 'Unknown error',
      source: ev.filename || '',
      lineno: ev.lineno,
      colno: ev.colno,
      stack: ev.error && ev.error.stack
    });
  }, true);

  window.onerror = function(msg, source, lineno, colno, error){
    logError({
      type:'onerror',
      message: String(msg),
      source: source||'',
      lineno: lineno,
      colno: colno,
      stack: error && error.stack
    });
    return false;
  };

  window.addEventListener('unhandledrejection', function(ev){
    var reason = ev.reason;
    var msg = (reason && reason.message) ? reason.message : String(reason);
    logError({
      type:'unhandledrejection',
      message: msg,
      source: '',
      stack: reason && reason.stack,
      lineno: 0
    });
    // don't prevent default, but log
  });

  function handleOnlineOffline(){
    window.addEventListener('offline', function(){
      showOfflineToast();
      logError({type:'offline', message:'navigator offline', source:location.href});
    });
    window.addEventListener('online', function(){
      var t = document.getElementById('vh-offline-toast');
      if(t) t.remove();
      var el = document.getElementById('vectors-error');
      if(el) el.remove();
    });
    if(!navigator.onLine){
      setTimeout(showOfflineToast, 800);
    }
  }

  function handleVHCustomFailures(){
    window.addEventListener('vh:mtnn-failed', function(){
      showFallbackCard('daily-guesses','Embeddings failed to load','48-d MTNN 2.5MB embeddings took too long. Daily cosine still works offline from cache if previously visited. Retrying 1s/2s/4s.', function(){
        if(window.VHMtnn && VHMtnn.load){
          return new Promise(function(res){
            var tries=0;
            function attempt(){
              VHMtnn.load(function(cache){
                if(cache){ res(true); location.reload(); }
                else if(tries<2){ tries++; setTimeout(attempt, [1000,2000,4000][tries]); }
                else res(false);
              });
            }
            attempt();
          });
        }
        location.reload();
        return Promise.resolve(false);
      });
      logError({type:'mtnn-failed', message:'VHMtnn.load final failure after retries'});
    });
    window.addEventListener('vh:insight-failed', function(e){
      var detail = e.detail || {};
      showFallbackCard('sky-demo','Insight engine slow','Era context + skill DNA loading. Fallback text active — 12,966 seasons era-honest sky still visible.', function(){
        location.reload();
        return false;
      });
      logError({type:'insight-failed', message: detail.message || 'InsightEngine init failed'});
    });
    window.addEventListener('vh:vectors-failed', function(){
      showFallbackCard('sky-demo','Sky map delayed','vectors_lite 617KB failed — showing fallback 12,966 seasons as sky text. Retry loads from cache.', function(){
        location.reload();
        return false;
      });
    });
  }

  function init(){
    handleOnlineOffline();
    handleVHCustomFailures();

    // Ensure aria-live fallback for no-js already covered via <noscript>
    // Add reduced-motion class
    try{
      if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        document.documentElement.classList.add('vh-reduced-motion');
      }
    }catch(e){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.VHErrorBoundary = {
    log: logError,
    getErrors: getErrors,
    clear: function(){ try{ localStorage.removeItem(LS_ERRORS);}catch(e){} },
    showFallback: showFallbackCard,
    showOfflineToast: showOfflineToast
  };
})();
