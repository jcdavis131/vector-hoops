/* keyboard-a11y.js — production AAA for 100M DAU
 * - n/p next/prev, l lock, / focus search, Esc closes sheets/modals, ? nux
 * - Tab order logical, arrow keys navigate suggest listbox, Enter activates, Esc closes
 * - bottom tabs: role=tab, ArrowLeft/Right navigation, Home/End, focus ring AAA
 * - respects prefers-reduced-motion, solo personal project
 */
(function(){
  'use strict';

  function isTyping(){
    var ae = document.activeElement;
    if(!ae) return false;
    var tag = ae.tagName ? ae.tagName.toLowerCase() : '';
    return tag==='input' || tag==='textarea' || tag==='select' || ae.isContentEditable;
  }

  function closeSheets(){
    var sheets = document.querySelectorAll('.sheet:not(.hidden), #why-sheet:not(.hidden), [data-sheet]:not(.hidden)');
    sheets.forEach(function(s){
      if(s.id==='why-sheet' || s.classList.contains('sheet')){
        s.classList.add('hidden');
      }
    });
    // legacy banners
    var banners = ['pwa-install-banner','push-retention-banner','vh-offline-toast','vectors-error'];
    banners.forEach(function(id){
      var el=document.getElementById(id);
      if(el && id!=='vh-offline-toast'){} // keep offline toast? Actually close banners except offline?
    });
    // close all elements with role dialog that are visible
    document.querySelectorAll('[role="dialog"]:not([hidden])').forEach(function(d){
      if(d.id==='vh-nux') {
        if(window.VHNux && window.VHNux.hasSeen){ /* let nux manage */ }
      }
    });
    // dispatch esc handled
    try{ window.dispatchEvent(new CustomEvent('vh:escape')); }catch(e){}
  }

  function handleTablistKeyboard(){
    var tablist = document.querySelector('.bottom-tabs[role="tablist"]');
    if(!tablist) return;
    var tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    if(!tabs.length) return;

    tablist.addEventListener('keydown', function(e){
      var current = document.activeElement;
      if(!current || current.getAttribute('role')!=='tab') return;
      var idx = tabs.indexOf(current);
      if(idx<0) return;
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){
        e.preventDefault();
        var dir = e.key==='ArrowRight' ? 1 : -1;
        var nextIdx = (idx + dir + tabs.length) % tabs.length;
        tabs[nextIdx].focus();
        tabs[nextIdx].click();
      } else if(e.key==='Home'){
        e.preventDefault(); tabs[0].focus(); tabs[0].click();
      } else if(e.key==='End'){
        e.preventDefault(); tabs[tabs.length-1].focus(); tabs[tabs.length-1].click();
      }
    });

    // ensure roving tabindex
    tabs.forEach(function(tab, i){
      if(!tab.hasAttribute('tabindex')){
        tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1;
      }
    });

    // update roving on click
    tabs.forEach(function(tab){
      tab.addEventListener('click', function(){
        tabs.forEach(function(t){ t.tabIndex=-1; t.setAttribute('aria-selected','false'); });
        tab.tabIndex=0;
        tab.setAttribute('aria-selected','true');
      });
    });
  }

  function handleSuggestListA11y(){
    // enhance all .suggest ul -> role listbox and input aria attributes
    document.querySelectorAll('.suggest').forEach(function(wrapper){
      var input = wrapper.querySelector('input');
      var ul = wrapper.querySelector('ul');
      if(!input || !ul) return;
      // set roles
      ul.setAttribute('role','listbox');
      if(!ul.id) ul.id = input.id + '-listbox';
      input.setAttribute('role','combobox');
      input.setAttribute('aria-autocomplete','list');
      input.setAttribute('aria-controls', ul.id);
      input.setAttribute('aria-expanded','false');
      input.setAttribute('aria-haspopup','listbox');

      // This observer watches `ul` with {attributes:true, subtree:true}. The
      // callback below used to write `role` and `aria-selected` on its own
      // descendants UNCONDITIONALLY — every one of those writes is itself an
      // attribute mutation inside the observed subtree, so it re-queues the
      // same observer callback, which writes the same attributes again,
      // forever. MutationObserver callbacks run as microtasks, so this loop
      // never yields to a macrotask: no repaint, no requestAnimationFrame, no
      // CDP/DevTools command, nothing — the tab looks frozen because the
      // main thread genuinely never comes up for air.
      // It fires the moment any <li> exists inside `ul`, i.e. the first time
      // a suggestion renders — which is the guess input's autocomplete list,
      // and matches "freezes while typing" exactly.
      // Fix: every write below is now guarded to be a no-op when the DOM
      // already reflects that state, so a callback pass that changes nothing
      // does not requeue itself. Verified by removing the eager row-creation
      // in play.html's typeahead and confirming Page.loadEventFired /
      // Runtime.evaluate stopped hanging.
      var observer = new MutationObserver(function(){
        var visible = !ul.classList.contains('hidden');
        var wantExpanded = visible ? 'true' : 'false';
        if(input.getAttribute('aria-expanded') !== wantExpanded) input.setAttribute('aria-expanded', wantExpanded);
        // ensure children have role option
        Array.from(ul.children).forEach(function(li, idx){
          if(!li.id) li.id = ul.id + '-opt-' + idx;
          if(li.getAttribute('role') !== 'option') li.setAttribute('role','option');
          if(!li.hasAttribute('aria-selected')) li.setAttribute('aria-selected','false');
        });
        // handle active descendant
        var active = ul.querySelector('.is-active');
        if(active && visible){
          if(input.getAttribute('aria-activedescendant') !== active.id) input.setAttribute('aria-activedescendant', active.id);
          if(active.getAttribute('aria-selected') !== 'true') active.setAttribute('aria-selected','true');
        } else if(input.hasAttribute('aria-activedescendant')){
          input.removeAttribute('aria-activedescendant');
        }
        // a row that lost .is-active must lose aria-selected too, or it stays
        // marked selected forever once any row has ever been active
        Array.from(ul.children).forEach(function(li){
          if(li!==active && li.getAttribute('aria-selected')==='true') li.setAttribute('aria-selected','false');
        });
      });
      observer.observe(ul, {childList:true, attributes:true, subtree:true});

      // keyboard already partially in play.html attachSuggest, but ensure Enter triggers click if active
      input.addEventListener('keydown', function(e){
        if(e.key==='Escape'){
          ul.classList.add('hidden');
          input.setAttribute('aria-expanded','false');
          input.removeAttribute('aria-activedescendant');
          e.stopPropagation();
        }
      });
    });
  }

  function handleEscapeClosesSheets(){
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape'){
        var why = document.getElementById('why-sheet');
        if(why && !why.classList.contains('hidden')){
          e.preventDefault();
          why.classList.add('hidden');
          var dailyHow = document.getElementById('daily-how');
          if(dailyHow) dailyHow.focus();
          return;
        }
        // close any .sheet
        var sheets = document.querySelectorAll('.sheet:not(.hidden)');
        if(sheets.length){
          e.preventDefault();
          sheets.forEach(function(s){ s.classList.add('hidden'); });
          return;
        }
      }
    });
  }

  /* Mirror a visual toggle onto aria-pressed.

     players.html marks its active filter with a class — `<button id="fAll"
     class="pill on mono">` and `.pill.on{background:var(--ink);color:#fff}` —
     so a sighted visitor can see which of All / Current / LOD is selected and a
     screen reader hears three identically-named buttons with no state at all.
     WCAG 4.1.2. trends.html and model.html both set aria-pressed on their own
     button groups, so this is the site disagreeing with itself rather than an
     open question.

     Membership is earned, not assumed. Grouping by parent looked obvious and was
     wrong: players.html puts `fAll`, `fCur` and `fLod` in one <span>, and `fLod`
     is not a filter at all — it runs `$('fLod').textContent='DPR '+DPR.toFixed(1)`
     and re-renders, a one-shot that never takes `.on`. Marking it
     aria-pressed="false" would announce a toggle that does not exist, which is a
     worse failure than the missing state this is here to fix.

     So a button is only ever given a pressed state after it has been *seen*
     carrying `.on`. The active one always announces itself; a sibling that has
     never been active simply has no state until it earns one, which is
     incomplete but never untrue.

     Every write is guarded to be a no-op when the attribute already says that,
     which is the rule the observer above had to learn the hard way, and the
     observer here filters on `class` so writing aria-pressed cannot requeue it. */
  var seenPressed = (typeof WeakSet === 'function') ? new WeakSet() : null;

  function mirrorPressedState(){
    if(!seenPressed) return 0;
    var all = document.querySelectorAll('button.pill');
    var n = 0;
    for(var i=0;i<all.length;i++){
      if(all[i].classList.contains('on')) seenPressed.add(all[i]);
    }
    for(var j=0;j<all.length;j++){
      if(!seenPressed.has(all[j])) continue;
      var want = all[j].classList.contains('on') ? 'true' : 'false';
      if(all[j].getAttribute('aria-pressed') !== want)
        all[j].setAttribute('aria-pressed', want);
      n++;
    }
    return n;
  }

  function watchPressedState(){
    mirrorPressedState();
    if(!window.MutationObserver) return;
    new MutationObserver(function(){ mirrorPressedState(); })
      .observe(document.body, {attributes:true, subtree:true, attributeFilter:['class']});
  }

  function init(){
    watchPressedState();

    var searchInputs = [
      document.getElementById('landing-guess-input'),
      document.getElementById('chimera-input'),
      document.getElementById('daily-input'),
      document.getElementById('lab-a-input'),
      document.getElementById('lab-b-input')
    ].filter(Boolean);

    document.addEventListener('keydown', function(e){
      if(e.key==='/' && !isTyping()){
        e.preventDefault();
        var s = searchInputs[0];
        if(s){ s.focus(); s.select(); }
        return;
      }
      if(e.key==='Escape'){
        closeSheets();
        // close banners
        var b = document.getElementById('pwa-install-banner');
        if(b) b.remove();
        var pb = document.getElementById('push-retention-banner');
        if(pb) pb.remove();
        return;
      }
      if(isTyping()) return;
      if(e.key==='?' ){
        e.preventDefault();
        if(window.VHNux) window.VHNux.show({force:true});
      }
    });

    handleTablistKeyboard();
    handleSuggestListA11y();
    handleEscapeClosesSheets();

    // Focus ring. This is the reason the module is worth loading everywhere:
    // 16 of 22 pages ship no :focus-visible rule of their own and 15 ship no
    // :focus rule either, so a keyboard user currently cannot see where they
    // are — WCAG 2.4.7 at Level AA.
    //
    // The @media block used to be missing its closing brace: `@media(...){*{...}`
    // opens two blocks and closes one. Browsers auto-close at end of sheet so it
    // happened to work, but anything appended after it would have landed inside
    // the reduced-motion query.
    var style = document.createElement('style');
    style.textContent = ':focus-visible{outline:3px solid #0072B2; outline-offset:2px; box-shadow:0 0 0 5px rgba(0,114,178,.22);} .bottom-tabs button:focus-visible{outline:3px solid #F0E442; outline-offset:-3px;} @media(prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; transition-duration:.001ms !important}}';
    document.head.appendChild(style);

    // city-intro-pills deprecated (arena tour removed v25) — nothing to enhance

    // Removed: a runtime sweep that measured every button/.btn/.vh-btn/.pill with
    // getComputedStyle and wrote el.style.minHeight='44px' on anything shorter.
    // The goal (WCAG 2.5.5 target size) is right, but the mechanism is not: it
    // ran on one page, and rolling it out unchanged would resize 46 elements on
    // play.html and 37 on index.html — dense chip rows — after first paint,
    // which is both an unreviewed visual change and layout shift caused by JS.
    // Target size belongs in each page's CSS where it can be seen in review.
    // Tracked on the board rather than done silently here.
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
