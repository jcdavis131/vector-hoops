// Human-Centered v6 — minimal, zero-deps, lifecycle-safe
window.DumbModel = window.DumbModel || {};
window.DumbModel.HumanV6 = (() => {
  const state = { selected: null, peers: [], listeners: [] };
  const Selection = {
    init(opts={}) {
      // read ?id=&daily=&n=&peer=
      const url = new URL(location.href);
      state.selected = url.searchParams.get('id') || url.searchParams.get('daily') || null;
      return state.selected;
    },
    update(id, opts={}) {
      if (!id) return;
      state.selected = id;
      const url = new URL(location.href);
      url.searchParams.set('id', id);
      if (opts.replace) history.replaceState({}, '', url);
      else history.pushState({}, '', url);
      window.dispatchEvent(new CustomEvent('hv6:selection', {detail:{id}}));
    },
    clear() {
      state.selected = null;
      const url = new URL(location.href);
      url.searchParams.delete('id');
      history.pushState({}, '', url);
      window.dispatchEvent(new CustomEvent('hv6:clear'));
    },
    destroy() { state.listeners.forEach(fn=>window.removeEventListener('hv6:selection', fn)); state.listeners=[]; }
  };
  const Share = {
    copy() {
      navigator.clipboard?.writeText(location.href).then(()=>{
        const t=document.getElementById('hv6-share-toast');
        if(t){t.textContent='Link copied — same player, same peers, same map'; t.style.display='block'; setTimeout(()=>t.style.display='none',2200);}
      });
    }
  };
  const Evidence = {
    open(id='hv6-evidence') { document.getElementById(id)?.scrollIntoView({behavior:'smooth', block:'start'}); },
    close() {}
  };
  return { Selection, Share, Evidence, state };
})();
