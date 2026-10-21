/* viz.html gallery logic — one demo per viz-lib primitive, real data only.
 * No dependencies beyond viz-lib. Every demo lazy-loads its data on scroll;
 * every section gets copy-link + PNG snapshot. Deep links: ?p=<id> (network,
 * flow, drift highlight), ?a=<id>&b=<id> (matchup), ?c=<slug> (trajectory).
 */
(function () {
  'use strict';

  var DEMO_URL = '/assets/viz_demo.json';
  var UNIQ_URL = '/assets/era_uniqueness.json';
  var TRAILS_URL = '/assets/trails_featured.json';

  var demoP = null, uniqP = null, trailsP = null;
  function demo() {
    if (!demoP) demoP = VHL.getJSON(DEMO_URL);
    return demoP;
  }
  function uniq() {
    if (!uniqP) uniqP = VHL.getJSON(UNIQ_URL);
    return uniqP;
  }
  function trails() {
    if (!trailsP) trailsP = VHL.getJSON(TRAILS_URL);
    return trailsP;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function nm(d, id) {
    var e = d.names[String(id)];
    return e ? { name: VHL.pretty(e.name), season: e.season, decade: e.decade } : { name: 'id ' + id, season: '', decade: '' };
  }
  function fail(el, what) {
    el.innerHTML = VHL.errorHTML(what);
  }

  var qp = VHL.params();
  function featuredDefault(d, key, idx) {
    var q = qp.get(key);
    if (q && byId(d.featured, q)) return Number(q);
    return d.featured[idx].id;
  }

  /* ---------- shared player picker ---------- */

  function picker(el, d, current, onPick) {
    el.innerHTML = '';
    d.featured.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = VHL.pretty(f.name) + ' ' + VHL.shortSeason(f.season);
      b.setAttribute('aria-pressed', String(f.id === current));
      b.setAttribute('data-pid', String(f.id));
      b.addEventListener('click', function () {
        onPick(f.id);
      });
      el.appendChild(b);
    });
  }
  function syncPicker(el, current) {
    Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-pid') === String(current)));
    });
  }

  /* ---------- network demo ---------- */

  var netPid = null, netSvg = null;
  function renderNetwork(pid) {
    netPid = pid;
    var el = document.getElementById('demo-network');
    demo().then(function (d) {
      var f = byId(d.featured, pid);
      if (!f) return;
      var nodes = f.peers.map(function (p) {
        var e = nm(d, p.id);
        return { id: String(p.id), label: e.name, sub: VHL.shortSeason(e.season) + ' · ' + p.sim.toFixed(3) };
      });
      var edges = f.peers.map(function (p) { return { to: String(p.id), w: p.sim }; });
      var svg = VHL.net.render({
        center: { label: VHL.pretty(f.name), sub: VHL.shortSeason(f.season) + ' · ' + f.decade },
        nodes: nodes,
        edges: edges,
        simRange: [0.5, 1],
        size: [620, 320],
        label: 'twin network of ' + VHL.pretty(f.name) + ' ' + f.season
      });
      netSvg = VHL.mount(el, svg, { aspect: '620/320' });
      VHL.bindNodes(netSvg, function (id) {
        var e = nm(d, id);
        setStatus('net-status', e.name + ' ' + e.season + ' — tap a featured player above to re-center the ring.');
      });
      VHL.setParams({ p: pid });
      setStatus('net-status', 'Edge width \u2237 cosine similarity. Twin Centrality #' + f.centrality_rank +
        ' (' + f.centrality + ' of 12,966 top-10 neighbor sets).');
    }).catch(function () { fail(el, 'the demo twin data'); });
  }

  /* ---------- flow demo (same player) ---------- */

  function renderFlow(pid) {
    var el = document.getElementById('demo-flow');
    demo().then(function (d) {
      var f = byId(d.featured, pid);
      if (!f) return;
      var tot = f.top3.reduce(function (a, t) { return a + Math.abs(t.z); }, 0) || 1;
      var nodes = [
        { id: 'era', stage: 0, lines: [f.decade], value: 1 },
        { id: 'arch', stage: 1, lines: wrapLines(f.archetype), value: 1 },
      ];
      var links = [{ from: 'era', to: 'arch', value: 1 }];
      f.top3.forEach(function (t, i) {
        var id = 'stat' + i;
        var lbl = t.label.length > 16 ? t.label.slice(0, 15) + '\u2026' : t.label;
        nodes.push({ id: id, stage: 2, lines: [lbl, (t.z > 0 ? '+' : '') + t.z.toFixed(2) + '\u03c3'], value: Math.abs(t.z) / tot });
        links.push({ from: 'arch', to: id, value: Math.abs(t.z) / tot });
      });
      if (f.era_twin) {
        var tw = f.era_twin;
        nodes.push({
          id: 'twin', stage: 3, color: VHL.colors().gold,
          lines: [VHL.pretty(tw.name).split(' ').slice(-1)[0], VHL.shortSeason(tw.season)], value: 1,
          sub: 'sim ' + Number(tw.similarity).toFixed(3)
        });
        f.top3.forEach(function (t, i) {
          links.push({ from: 'stat' + i, to: 'twin', value: Math.abs(t.z) / tot, color: VHL.colors().gold });
        });
      } else {
        nodes.push({ id: 'twin', stage: 3, lines: ['No era twin', 'charted'], value: 1, color: 'none', dashed: true });
      }
      var svg = VHL.flow.render({
        stages: ['Era', 'Archetype', 'Stat signature', 'Era twin'],
        nodes: nodes, links: links, size: [620, 330],
        label: 'stat flow of ' + VHL.pretty(f.name) + ' ' + f.season
      });
      var svgEl = VHL.mount(el, svg, { aspect: '620/330' });
      VHL.wireShare(document.getElementById('sec-flow'), function () { return svgEl; }, 'stat-flow');
      setStatus('flow-status', 'Flow widths \u2237 |z-score| share of the three defining stats in the 14-dim era-honest style vector.');
    }).catch(function () { fail(el, 'the demo twin data'); });
  }

  function wrapLines(name) {
    var parts = String(name).split(' + ');
    if (parts.length === 2) return parts;
    var words = String(name).split(' '), mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  /* ---------- bars demo: era-uniqueness leaderboard ---------- */

  function renderBars() {
    var el = document.getElementById('demo-bars');
    uniq().then(function (u) {
      var rows = u.top.slice(0, 12).map(function (t) {
        var e = u.names[String(t.id)];
        return {
          label: VHL.pretty(e.name),
          tag: VHL.shortSeason(e.season) + ' · ' + e.decade,
          value: t.score
        };
      });
      var svg = VHL.bars.render({
        rows: rows, unit: 'pts', size: [620, 40 + rows.length * 46],
        label: 'strangest player-seasons by era-uniqueness'
      });
      var svgEl = VHL.mount(el, svg, { aspect: '620/' + (40 + rows.length * 46) });
      VHL.wireShare(document.getElementById('sec-bars'), function () { return svgEl; }, 'era-uniqueness');
    }).catch(function () { fail(el, 'the era-uniqueness data'); });
  }

  /* ---------- drift demo: era drift map ---------- */

  function renderDrift(pid) {
    var el = document.getElementById('demo-drift');
    Promise.all([uniq(), demo()]).then(function (res) {
      var u = res[0], d = res[1];
      var lanes = u.decades.map(function (dec, di) {
        var scores = [];
        for (var i = 0; i < u.n; i++) {
          if (u.decades_of[i] === String(di)) scores.push({ id: i, label: '', score: u.scores[i] });
        }
        return { label: dec, scores: scores, highlightId: pid };
      });
      // label the highlighted season
      var f = byId(d.featured, pid);
      var hlabel = f ? VHL.pretty(f.name) + ' ' + VHL.shortSeason(f.season) : '';
      lanes.forEach(function (lane) {
        lane.scores.forEach(function (s) {
          if (String(s.id) === String(pid)) s.label = hlabel;
        });
      });
      var svg = VHL.drift.render({
        lanes: lanes, bins: 12, size: [640, 44 + lanes.length * 62 + 34],
        label: 'era drift map: uniqueness distributions by decade'
      });
      var svgEl = VHL.mount(el, svg, { aspect: '640/' + (44 + lanes.length * 62 + 34) });
      VHL.wireShare(document.getElementById('sec-drift'), function () { return svgEl; }, 'era-drift');
    }).catch(function () { fail(el, 'the era-uniqueness data'); });
  }

  /* ---------- matchup demo ---------- */

  function pairSim(d, a, b) {
    return d.pairwise[a + '|' + b] != null ? d.pairwise[a + '|' + b] : d.pairwise[b + '|' + a];
  }
  function renderMatchup(a, b) {
    var el = document.getElementById('demo-matchup');
    demo().then(function (d) {
      var fa = byId(d.featured, a), fb = byId(d.featured, b);
      if (!fa || !fb) return;
      function side(f) {
        return {
          id: f.id,
          label: VHL.pretty(f.name),
          sub: VHL.shortSeason(f.season) + ' · ' + f.decade,
          nodes: f.peers.map(function (p) {
            var e = nm(d, p.id);
            return { id: String(p.id), label: e.name, sub: VHL.shortSeason(e.season) + ' · ' + p.sim.toFixed(3) };
          }),
          edges: f.peers.map(function (p) { return { to: String(p.id), w: p.sim }; })
        };
      }
      var html = VHL.matchup.render({
        a: side(fa), b: side(fb), simAB: pairSim(d, a, b), size: [620, 300],
        label: 'twin matchup: ' + VHL.pretty(fa.name) + ' vs ' + VHL.pretty(fb.name)
      });
      el.innerHTML = html;
      var svgs = el.querySelectorAll('svg');
      VHL.bindNodes(svgs[0], function () {});
      VHL.bindNodes(svgs[1], function () {});
      VHL.wireShare(document.getElementById('sec-matchup'), function () { return svgs[0]; }, 'matchup');
      VHL.setParams({ a: a, b: b });
      setStatus('matchup-status', VHL.pretty(fa.name) + ' ' + VHL.shortSeason(fa.season) + ' vs ' +
        VHL.pretty(fb.name) + ' ' + VHL.shortSeason(fb.season) +
        ' — gold nodes are twins of both. Pick any two featured players above.');
    }).catch(function () { fail(el, 'the demo twin data'); });
  }

  /* ---------- trajectory demo ---------- */

  var trajBound = null;
  function renderTraj(slug) {
    var el = document.getElementById('demo-traj');
    trails().then(function (t) {
      var c = t.careers[slug] || t.careers[Object.keys(t.careers)[0]];
      var seasons = c.seasons.map(function (s, i) {
        return { label: s, x: c.pts[i][0], y: c.pts[i][1] };
      });
      var r = VHL.traj.render({
        display: c.display, seasons: seasons, deltas: c.deltas,
        label: 'career trajectory of ' + c.display
      });
      el.innerHTML = r.html;
      r.bind(el);
      var slugNow = Object.keys(t.careers).filter(function (k) { return t.careers[k] === c; })[0];
      VHL.wireShare(document.getElementById('sec-traj'), function () { return el.querySelector('svg'); }, 'career-' + slugNow);
      VHL.setParams({ c: slugNow });
    }).catch(function () { fail(el, 'the career trail data'); });
  }

  function setStatus(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

  /* ---------- boot ---------- */

  var loaded = {};
  function boot() {
    demo().then(function (d) {
      var pid = featuredDefault(d, 'p', 0);
      window.__vhlPid = pid;
      // network + flow share one picker
      var pickEl = document.getElementById('demo-pick');
      picker(pickEl, d, pid, function (id) {
        window.__vhlPid = id;
        syncPicker(pickEl, id);
        if (loaded.network) renderNetwork(id);
        if (loaded.flow) renderFlow(id);
        if (loaded.drift) renderDrift(id);
      });
      VHL.lazy(document.getElementById('demo-network'), function () {
        renderNetwork(window.__vhlPid); loaded.network = true;
      }, 620 / 320);
      VHL.lazy(document.getElementById('demo-flow'), function () {
        renderFlow(window.__vhlPid); loaded.flow = true;
      }, 620 / 330);
      VHL.lazy(document.getElementById('demo-bars'), renderBars, 620 / 592);
      VHL.lazy(document.getElementById('demo-drift'), function () {
        renderDrift(window.__vhlPid); loaded.drift = true;
      }, 640 / 372);
      VHL.wireShare(document.getElementById('sec-network'), function () { return netSvg; }, 'twin-network');

      // matchup pickers (default: LeBron vs Dirk — 2 shared twins)
      var a = featuredDefault(d, 'a', 2), b = featuredDefault(d, 'b', 5);
      window.__vhlA = a; window.__vhlB = b;
      var pa = document.getElementById('demo-pick-a'), pb = document.getElementById('demo-pick-b');
      picker(pa, d, a, function (id) {
        window.__vhlA = id; syncPicker(pa, id);
        if (loaded.matchup) renderMatchup(id, window.__vhlB);
      });
      picker(pb, d, b, function (id) {
        window.__vhlB = id; syncPicker(pb, id);
        if (loaded.matchup) renderMatchup(window.__vhlA, id);
      });
      VHL.lazy(document.getElementById('demo-matchup'), function () {
        renderMatchup(window.__vhlA, window.__vhlB); loaded.matchup = true;
      }, 16 / 10);

      // trajectory picker
      trails().then(function (t) {
        var slugs = Object.keys(t.careers);
        var cs = qp.get('c') && t.careers[qp.get('c')] ? qp.get('c') : slugs[0];
        window.__vhlC = cs;
        var pc = document.getElementById('demo-pick-c');
        pc.innerHTML = '';
        slugs.forEach(function (slug) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = t.careers[slug].display;
          btn.setAttribute('aria-pressed', String(slug === cs));
          btn.addEventListener('click', function () {
            window.__vhlC = slug;
            Array.prototype.forEach.call(pc.querySelectorAll('button'), function (x) {
              x.setAttribute('aria-pressed', String(x === btn));
            });
            if (loaded.traj) renderTraj(slug);
          });
          pc.appendChild(btn);
        });
        VHL.lazy(document.getElementById('demo-traj'), function () {
          renderTraj(window.__vhlC); loaded.traj = true;
        }, 640 / 460);
      }).catch(function () { fail(document.getElementById('demo-traj'), 'the career trail data'); });
    }).catch(function () {
      ['demo-network', 'demo-flow', 'demo-matchup'].forEach(function (id) {
        fail(document.getElementById(id), 'the demo twin data');
      });
      fail(document.getElementById('demo-bars'), 'the era-uniqueness data');
      fail(document.getElementById('demo-drift'), 'the era-uniqueness data');
      fail(document.getElementById('demo-traj'), 'the career trail data');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
