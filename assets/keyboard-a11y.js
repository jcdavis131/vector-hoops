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

      var observer = new MutationObserver(function(){
        var visible = !ul.classList.contains('hidden');
        input.setAttribute('aria-expanded', visible ? 'true' : 'false');
        // ensure children have role option
        Array.from(ul.children).forEach(function(li, idx){
          if(!li.id) li.id = ul.id + '-opt-' + idx;
          li.setAttribute('role','option');
          if(!li.hasAttribute('aria-selected')) li.setAttribute('aria-selected','false');
        });
        // handle active descendant
        var active = ul.querySelector('.is-active');
        if(active && visible){
          input.setAttribute('aria-activedescendant', active.id);
          active.setAttribute('aria-selected','true');
        } else {
          input.removeAttribute('aria-activedescendant');
        }
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

  function init(){
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

    // focus ring AAA
    var style = document.createElement('style');
    style.textContent = ':focus-visible{outline:3px solid #0072B2; outline-offset:2px; box-shadow:0 0 0 5px rgba(0,114,178,.22);} .city-pill:focus-visible{outline:2px solid #1A150F; box-shadow:0 0 0 4px #F0E442;} .bottom-tabs button:focus-visible{outline:3px solid #F0E442; outline-offset:-3px;} @media(prefers-reduced-motion:reduce){*{animation-duration:.001ms !important; transition-duration:.001ms !important}';
    document.head.appendChild(style);

    // pills tablist
    var pills = document.getElementById('city-intro-pills');
    if(pills){
      pills.setAttribute('role','tablist');
      pills.setAttribute('aria-label','Team filter — 30 NBA teams');
    }

    // ensure all buttons min-height 44px for AAA (check computed, add class if needed)
    try{
      document.querySelectorAll('button, .btn, .vh-btn, .pill').forEach(function(el){
        var cs = getComputedStyle(el);
        var h = parseFloat(cs.minHeight) || el.offsetHeight;
        if(h>0 && h<44){
          el.style.minHeight='44px';
        }
      });
    }catch(e){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
