/* --- extracted from play.html (share feedback layer): moved out of the page because the site's CSP is script-src 'self' --- */
/* P0 share/copy feedback insurance (ux-revamp PLAN §6: "feedback in ≤100ms").
 * play-engine.js owns the actual share/copy work; this layer only guarantees
 * the feedback contract, so a share is NEVER silent:
 *   - ≤100ms of a tap the button flips to a working state (if the engine
 *     hasn't confirmed yet), then to "Copied ✓" + a 2s toast on success.
 *   - clipboard denial degrades to a visible select-to-copy panel — a stated
 *     state, never silence, never a blocking prompt() dialog.
 *   - the engine's own confirmations are only echoed (never overwritten).
 * No similarity numbers are added here — the panel shows names + the
 * ledger's own score line, keeping sim values demoted/humble per §5. */
(function(){
  'use strict';
  var IDS = ['share-btn', 'share-text-btn', 'btn-copy-court'];
  var SUCCESS_RE = /copied|shared|link copied/i;
  var FAIL_RE = /fail|try again/i;

  function vhToast(msg, ms){
    try{
      if (window.VHShare && typeof window.VHShare.showToast === 'function'){
        window.VHShare.showToast(msg); return;
      }
    }catch(e){}
    try{
      var t = document.createElement('div');
      t.className = 'vh-toast'; t.setAttribute('role', 'status');
      t.textContent = msg; document.body.appendChild(t);
      requestAnimationFrame(function(){ t.classList.add('is-visible'); });
      setTimeout(function(){ t.classList.remove('is-visible'); setTimeout(function(){ t.remove(); }, 250); }, ms || 2000);
    }catch(e){}
  }

  /* Visible, non-blocking select-to-copy panel for clipboard denial. */
  function selectToCopy(title, text){
    try{
      var old = document.getElementById('vh-p0-copy-panel');
      if (old) old.remove();
      var back = document.createElement('div');
      back.id = 'vh-p0-copy-panel'; back.setAttribute('role', 'dialog');
      back.setAttribute('aria-label', title);
      back.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(26,21,15,.55);display:flex;align-items:center;justify-content:center;padding:20px';
      var card = document.createElement('div');
      card.style.cssText = 'background:#FFFDF6;color:#1A150F;border-radius:16px;padding:18px;max-width:520px;width:100%;font:14px/1.5 system-ui,-apple-system,sans-serif';
      var h = document.createElement('b'); h.textContent = title;
      var p = document.createElement('p');
      p.style.cssText = 'margin:8px 0;font-size:12.5px;opacity:.8';
      p.textContent = 'Copy is blocked in this browser — the text below is selected, long-press or Ctrl/Cmd-C to copy it.';
      var ta = document.createElement('textarea');
      ta.value = text; ta.readOnly = true; ta.setAttribute('aria-label', 'Share text');
      ta.style.cssText = 'width:100%;min-height:150px;box-sizing:border-box;font:12px/1.6 ui-monospace,monospace;border:1px solid #E4DCC8;border-radius:10px;padding:10px;background:#F7F3E8;color:#1A150F';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
      var sel = document.createElement('button');
      sel.type = 'button'; sel.textContent = 'Select all';
      sel.style.cssText = 'flex:1;min-height:44px;border-radius:12px;border:1px solid #1A150F;background:#1A150F;color:#FFFDF6;font-weight:800;cursor:pointer';
      var close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Close';
      close.style.cssText = 'flex:1;min-height:44px;border-radius:12px;border:1px solid #1A150F;background:transparent;color:#1A150F;font-weight:800;cursor:pointer';
      var done = function(){ back.remove(); document.removeEventListener('keydown', esc, true); };
      var esc = function(e){ if (e.key === 'Escape') done(); };
      sel.addEventListener('click', function(){ ta.focus(); ta.select(); });
      close.addEventListener('click', done);
      back.addEventListener('click', function(e){ if (e.target === back) done(); });
      document.addEventListener('keydown', esc, true);
      row.appendChild(sel); row.appendChild(close);
      card.appendChild(h); card.appendChild(p); card.appendChild(ta); card.appendChild(row);
      back.appendChild(card); document.body.appendChild(back);
      ta.focus(); ta.select();
    }catch(e){}
  }

  /* Rebuild the court card text from the rendered board (names + ledger
   * score lines only — no naked similarity numbers). */
  function courtText(){
    try{
      var cards = Array.prototype.slice.call(document.querySelectorAll('#court-grid .court-card'));
      var dayEl = document.getElementById('court-day-label');
      var day = dayEl ? dayEl.textContent.trim() : '';
      var lines = cards.map(function(c, i){
        var name = (c.querySelector('.court-name') || {}).textContent || '';
        var meta = (c.querySelector('.court-meta') || {}).textContent || '';
        return (i + 1) + '. ' + name.trim() + ' — ' + meta.trim();
      });
      var url = location.origin + '/play' + (day ? '?day=' + encodeURIComponent(day.split('·')[0].trim()) : '');
      return 'Daily Court ' + day + ' — 5 puzzles\n' + lines.join('\n') + '\n' + url;
    }catch(e){ return null; }
  }

  function armButton(btn){
    var original = btn.textContent;
    var settled = false;
    var flipTimer = setTimeout(function(){
      if (settled) return;
      try{ if (btn.textContent === original) btn.textContent = '\u2026'; }catch(e){}
    }, 90); // the ≤100ms flip: the tap is visibly acknowledged even if the engine is slow
    var obs = null;
    function done(){ settled = true; clearTimeout(flipTimer); try{ if (obs) obs.disconnect(); }catch(e){} }
    try{
      obs = new MutationObserver(function(){
        if (settled) return;
        var cur;
        try{ cur = btn.textContent; }catch(e){ done(); return; }
        if (cur === original || cur === '\u2026') return;
        done();
        // echo the engine's verdict as a toast; never rewrite its label.
        if (SUCCESS_RE.test(cur)) vhToast('Copied \u2713', 2000);
        else if (FAIL_RE.test(cur)) vhToast(cur, 2600);
      });
      obs.observe(btn, { childList: true, characterData: true, subtree: true });
    }catch(e){}
    // disarm silently after 30s: the engine owns long-lived states.
    setTimeout(done, 30000);
  }

  function clipboardUnavailable(){
    try{
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') return false;
    }catch(e){}
    try{
      if (typeof document.execCommand === 'function') return false;
    }catch(e){}
    return true;
  }

  document.addEventListener('click', function(e){
    var el = (e.target && e.target.closest) ? e.target.closest(IDS.map(function(id){ return '#' + id; }).join(',')) : null;
    if (!el || el.disabled) return;
    armButton(el);
    /* Deterministic denial: no clipboard API at all → skip the engine and
     * show the visible select-to-copy panel instead of its blocking prompt(). */
    if (el.id === 'btn-copy-court' && clipboardUnavailable()){
      try{ e.stopPropagation(); e.preventDefault(); }catch(err){}
      var text = courtText() || ('Daily Court — ' + location.origin + '/play');
      vhToast('Copy unavailable \u2014 select the text below', 2000);
      selectToCopy('Copy your court', text);
    }
  }, true); // capture: runs before the engine's bubble-phase handlers
})();
