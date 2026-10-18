/* Vector Hoops Insights — two labeled series: From the model (computed from
   the served vectors) and From the ledger (salary/tax/ticket findings from named
   public sources). Share-first: every card has a deep link + a PNG export. */
(function (global) {
  'use strict';

  var VOID = '#1E2022', PAPER = '#F9F6F0', TERRA = '#C17C60',
      GOLD = '#D4AF69', MUTED = '#8b8578';

  /* Theme-safe palette: read CSS custom properties at render time so SVG
     charts follow the active theme (dark/light) instead of hardcoded colors. */
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fb) {
      var s = cs.getPropertyValue(name).trim();
      return s || fb;
    }
    return {
      void: v('--void', VOID),
      paper: v('--fg', PAPER),
      terra: v('--accent', TERRA),
      gold: v('--gold', GOLD),
      muted: v('--fg-3', MUTED)
    };
  }

  /* Kicker -> theme class for color-coded card grouping.
     Kickers are a controlled topic vocabulary (see insights.json). */
  var KICKER_THEMES = {
    'Cap spike': 'money', 'Dead money': 'money', 'Contracts': 'money',
    'Sacrifice': 'money', 'Payroll': 'money', 'Tickets': 'money',
    'Tax': 'money', 'Meta': 'entity',
    'Money layer': 'money', 'Money': 'money', 'Overpaid': 'money',
    'Underpaid': 'money', '2016 cap spike': 'money',
    'Tax Burden': 'money', 'Repeater Tax': 'money', 'Second Apron': 'money',
    'Entity grounding': 'entity'
  };
  function kickerTheme(kicker) {
    return KICKER_THEMES[kicker] || 'default';
  }

  /* Card numbers, filled by render() from JSON order. */
  var NUM_BY_SLUG = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    return fetch('assets/insights.json?v=4ffe6eff').then(function (r) {
      if (!r.ok) throw new Error('insights.json ' + r.status);
      return r.json();
    });
  }

  /* ---------- SVG viz renderers (on-page) ---------- */

  /* The viz panel is always the dark void (#1E2022) in BOTH themes, so chart
     fills use fixed on-void colors — never theme tokens. (The old code took
     --gold from the theme; in the paper theme that is marker-black #1A1A1A,
     which made the lead bar invisible on the void panel.) */
  var VIZ_PAPER = '#F9F6F0';

  /* Canvas-measured text fitting: labels/tags are truncated to a measured
     budget, so no SVG text can ever run past the viewBox edge. */
  var _mctx = null;
  function measureText(t, font) {
    try {
      if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
      _mctx.font = font;
      return _mctx.measureText(t).width * 1.05 + 1;
    } catch (e) { return String(t).length * 6.8; }
  }
  var F_LABEL = '400 13px Archivo, Inter, sans-serif';
  var F_TAG = '400 12px Archivo, Inter, sans-serif';
  var F_VAL = '700 13px Archivo, Inter, sans-serif';
  function fitText(t, maxW, font) {
    t = String(t);
    if (measureText(t, font) <= maxW) return t;
    var lo = 0, hi = t.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (measureText(t.slice(0, mid) + '…', font) <= maxW) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? t.slice(0, lo) + '…' : '';
  }

  /* A row renders only with a real label and a finite value — never blank. */
  function validRow(r) {
    return r && typeof r.label === 'string' && r.label.trim() !== '' &&
      typeof r.value === 'number' && isFinite(r.value);
  }

  function barsSVG(ins) {
    var rows = ins.rows.filter(validRow);
    if (!rows.length) return '';
    var W = 620, rowH = 46, barH = 13, barY = 21;
    var H = rows.length * rowH + 6;
    var vals = rows.map(function (r) { return r.value; });
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="' + esc(ins.viz_label || 'bar chart') + '">';

    /* Geometry: bars span the full plot width from a true zero baseline.
       Diverging data maps [min(0,min), max(0,max)] onto [0, W] so the zero
       spine sits where the data puts it — never off-canvas. */
    var diverging = min < 0;
    var lo = diverging ? Math.min(0, min) : 0;
    var hi = diverging ? Math.max(0, max) : (max || 1);
    var span = (hi - lo) || 1;
    function X(v) { return ((v - lo) / span) * W; }
    var zeroX = X(0);

    /* Per-row value placement, decided before tags so the tag budget can
       reserve room when a value falls back to the label line:
       1) inside the bar at its far end (dark text on the fill),
       2) just outside the bar end,
       3) the label line, right-aligned — always inside the viewBox. */
    function planValue(r, bx, bw) {
      var str = String(r.value);
      var vw = measureText(str, F_VAL);
      var end = bx + bw;
      if (r.value >= 0) {
        if (bw >= vw + 16) return { str: str, x: end - 7, anchor: 'end', cls: 'vh-ins__svgval vh-ins__svgval--in', onLabel: false };
        if (end + 7 + vw <= W) return { str: str, x: end + 7, anchor: 'start', cls: 'vh-ins__svgval', onLabel: false };
      } else {
        if (bw >= vw + 16) return { str: str, x: bx + 7, anchor: 'start', cls: 'vh-ins__svgval vh-ins__svgval--in', onLabel: false };
        if (bx - 7 - vw >= 0) return { str: str, x: bx - 7, anchor: 'end', cls: 'vh-ins__svgval', onLabel: false };
      }
      return { str: str, x: W, anchor: 'end', cls: 'vh-ins__svgval', onLabel: true, vw: vw };
    }

    var plans = rows.map(function (r) {
      var bx = X(Math.min(0, r.value)), bw = Math.max(3, Math.abs(X(r.value) - zeroX));
      if (r.value < 0) bx = zeroX - bw;
      return { bx: bx, bw: bw, v: planValue(r, bx, bw) };
    });

    rows.forEach(function (r, i) {
      var y = i * rowH + 4, p = plans[i];
      /* Label line: label first, tag fitted into whatever room remains. */
      var label = fitText(r.label, W - 70, F_LABEL);
      var lw = measureText(label, F_LABEL);
      var reserve = p.v.onLabel ? p.v.vw + 12 : 0;
      var tag = r.tag ? fitText(r.tag, W - lw - 12 - reserve, F_TAG) : '';
      s += '<text x="0" y="' + (y + 13) + '" class="vh-ins__svglabel">' + esc(label) + '</text>';
      if (tag) s += '<text x="' + (lw + 10).toFixed(1) + '" y="' + (y + 13) + '" class="vh-ins__svgtag">' + esc(tag) + '</text>';
      /* Full-width track (the zero-baseline scale), then the bar itself. */
      s += '<rect x="0" y="' + (y + barY) + '" width="' + W + '" height="' + barH + '" rx="4" fill="' + VIZ_PAPER + '" opacity="0.06"/>';
      var fill = diverging ? (r.value < 0 ? TERRA : GOLD) : (i === 0 ? GOLD : TERRA);
      s += '<rect x="' + p.bx.toFixed(1) + '" y="' + (y + barY) + '" width="' + p.bw.toFixed(1) + '" height="' + barH + '" rx="4" fill="' + fill + '"/>';
      var vy = p.v.onLabel ? y + 13 : y + barY + 11;
      s += '<text x="' + p.v.x.toFixed(1) + '" y="' + vy + '" class="' + p.v.cls + '" text-anchor="' + p.v.anchor + '">' + esc(p.v.str) + '</text>';
    });

    /* Zero spine last, on top: a clearly visible axis for diverging cards,
       and the baseline edge for plain bar cards. */
    s += '<line x1="' + zeroX.toFixed(1) + '" y1="2" x2="' + zeroX.toFixed(1) + '" y2="' + (H - 2) + '" stroke="' + VIZ_PAPER + '" stroke-width="' + (diverging ? 1.5 : 1) + '" opacity="' + (diverging ? 0.55 : 0.3) + '"/>';
    return s + '</svg>';
  }

  function sharesSVG(ins) {
    var rows = ins.rows.filter(function (r) {
      return r && typeof r.label === 'string' && r.label.trim() !== '' &&
        isFinite(r.early) && isFinite(r.late) && isFinite(r.delta);
    });
    if (!rows.length) return '';
    var W = 620, rowH = 48, headH = 22;
    var H = headH + rows.length * rowH + 4;
    /* Label line above full-width bars (the barsSVG pattern): the label gets
       the whole plot width minus the delta's reserved gutter, so real
       archetype names render whole. The old layout fitted labels into a
       240-unit side column and ellipsized the two longest names. Bars scale
       to the full plot — the widest share spans it, like barsSVG's scale. */
    var maxShare = Math.max.apply(null, rows.map(function (r) { return Math.max(r.early, r.late); })) || 1;
    var k = W / maxShare;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="archetype share then vs now">';
    s += '<rect x="0" y="3" width="10" height="9" rx="2" fill="' + MUTED + '"/>';
    s += '<text x="15" y="12" class="vh-ins__svgval">then</text>';
    s += '<rect x="58" y="3" width="10" height="9" rx="2" fill="' + TERRA + '"/>';
    s += '<text x="73" y="12" class="vh-ins__svgval">now</text>';
    rows.forEach(function (r, i) {
      var y = headH + i * rowH;
      var w1 = Math.max(2, r.early * k), w2 = Math.max(2, r.late * k);
      var neg = r.delta < 0;
      var dstr = (r.delta > 0 ? '+' : '') + r.delta + 'pp';
      var label = fitText(r.label, W - measureText(dstr, F_VAL) - 12, F_LABEL);
      s += '<text x="0" y="' + (y + 13) + '" class="vh-ins__svglabel">' + esc(label) + '</text>';
      s += '<text x="' + W + '" y="' + (y + 13) + '" class="vh-ins__svgval" text-anchor="end">' + dstr + '</text>';
      s += '<rect x="0" y="' + (y + 20) + '" width="' + W + '" height="9" rx="3" fill="' + VIZ_PAPER + '" opacity="0.06"/>';
      s += '<rect x="0" y="' + (y + 31) + '" width="' + W + '" height="9" rx="3" fill="' + VIZ_PAPER + '" opacity="0.06"/>';
      s += '<rect x="0" y="' + (y + 20) + '" width="' + w1.toFixed(1) + '" height="9" rx="3" fill="' + MUTED + '"/>';
      s += '<rect x="0" y="' + (y + 31) + '" width="' + w2.toFixed(1) + '" height="9" rx="3" fill="' + (neg ? '#D96A52' : TERRA) + '"/>';
    });
    return s + '</svg>';
  }

  function timelineSVG(ins) {
    var P = palette();
    var rows = ins.rows;
    var W = 620, rowH = 64;
    var H = rows.length * rowH + 16;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="era twin timelines">';
    rows.forEach(function (r, i) {
      var y = i * rowH + 16, midY = y + 26;
      s += '<text x="0" y="' + (y + 12) + '" class="vh-ins__svglabel">' + esc(r.a) + '</text>';
      s += '<text x="0" y="' + (y + 44) + '" class="vh-ins__svglabel">' + esc(r.b) + '</text>';
      s += '<line x1="300" y1="' + (y + 8) + '" x2="300" y2="' + (y + 48) + '" stroke="' + P.terra + '" stroke-width="2"/>';
      s += '<circle cx="300" cy="' + (y + 8) + '" r="4" fill="' + P.gold + '"/>';
      s += '<circle cx="300" cy="' + (y + 48) + '" r="4" fill="' + P.gold + '"/>';
      s += '<text x="320" y="' + (midY + 5) + '" class="vh-ins__svgval">' + r.gap + 'y apart · sim ' + r.sim + '</text>';
    });
    return s + '</svg>';
  }

  function lineSVG(ins) {
    var P = palette();
    var rows = ins.rows;
    var W = 620, H = 240, padL = 44, padB = 30, padT = 16;
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) * 1.08;
    function X(i) { return padL + (i / (rows.length - 1)) * (W - padL - 14); }
    function Y(v) { return padT + (1 - v / max) * (H - padT - padB); }
    var pts = rows.map(function (r, i) { return X(i).toFixed(1) + ',' + Y(r.v).toFixed(1); }).join(' ');
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="' + esc(ins.viz_label || 'line chart') + '">';
    s += '<polyline points="' + pts + '" fill="none" stroke="' + P.terra + '" stroke-width="3"/>';
    s += '<circle cx="' + X(0) + '" cy="' + Y(rows[0].v) + '" r="5" fill="' + P.gold + '"/>';
    s += '<circle cx="' + X(rows.length - 1) + '" cy="' + Y(rows[rows.length - 1].v) + '" r="5" fill="' + P.gold + '"/>';
    s += '<text x="' + (X(0) - 6) + '" y="' + (Y(rows[0].v) - 10) + '" class="vh-ins__svgval" text-anchor="end">' + rows[0].v + '</text>';
    s += '<text x="' + W + '" y="' + (Y(rows[rows.length - 1].v) - 10) + '" class="vh-ins__svgval" text-anchor="end">' + rows[rows.length - 1].v + '</text>';
    s += '<text x="' + padL + '" y="' + (H - 8) + '" class="vh-ins__svglabel">' + esc(rows[0].s) + '</text>';
    s += '<text x="' + (W - 14) + '" y="' + (H - 8) + '" class="vh-ins__svglabel" text-anchor="end">' + esc(rows[rows.length - 1].s) + '</text>';
    return s + '</svg>';
  }

  var VIZ = { bars: barsSVG, shares: sharesSVG, timeline: timelineSVG, line: lineSVG, seasons: seasonsSVG };

  /* Multi-season cheapest-vs-priciest comparison: one group per season, two
     bars each (gold = cheapest wins, terra = priciest). Rows carry
     {s, cheap:{label,v,note}, pricey:{label,v,note}}. */
  function seasonsSVG(ins) {
    var rows = (ins.rows || []).filter(function (r) {
      return r && typeof r.s === 'string' &&
        r.cheap && typeof r.cheap.label === 'string' && typeof r.cheap.v === 'number' && isFinite(r.cheap.v) &&
        r.pricey && typeof r.pricey.label === 'string' && typeof r.pricey.v === 'number' && isFinite(r.pricey.v);
    });
    if (!rows.length) return '';
    var W = 620, headH = 34, groupH = 96, barH = 13, barGap = 28;
    var H = headH + rows.length * groupH + 6;
    var maxV = Math.max.apply(null, rows.map(function (r) { return r.pricey.v; })) * 1.06 || 1;
    function X(v) { return (v / maxV) * W; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="' +
      esc(ins.viz_label || 'season comparison chart') + '">';
    /* Legend: gold = cheapest wins, terra = priciest wins. */
    s += '<rect x="0" y="8" width="12" height="12" rx="3" fill="' + GOLD + '"/>' +
      '<text x="18" y="18" class="vh-ins__svgtag">cheapest wins</text>' +
      '<rect x="152" y="8" width="12" height="12" rx="3" fill="' + TERRA + '"/>' +
      '<text x="170" y="18" class="vh-ins__svgtag">priciest wins</text>';
    rows.forEach(function (r, i) {
      var gy = headH + i * groupH;
      s += '<text x="0" y="' + (gy + 15) + '" class="vh-ins__svglabel">' + esc(r.s) + '</text>';
      [['cheap', GOLD, gy + 24], ['pricey', TERRA, gy + 24 + barGap]].forEach(function (t) {
        var d = r[t[0]], by = t[2];
        var bw = Math.max(3, X(d.v));
        var lbl = fitText(d.label + ' \u00b7 $' + d.v + 'M/win' + (d.note ? ' (' + d.note + ')' : ''), W - 8, F_TAG);
        s += '<text x="0" y="' + (by - 5) + '" class="vh-ins__svgtag">' + esc(lbl) + '</text>';
        s += '<rect x="0" y="' + by + '" width="' + W + '" height="' + barH + '" rx="4" fill="' + VIZ_PAPER + '" opacity="0.06"/>';
        s += '<rect x="0" y="' + by + '" width="' + bw.toFixed(1) + '" height="' + barH + '" rx="4" fill="' + t[1] + '"/>';
      });
    });
    return s + '</svg>';
  }

  /* ---------- card + spotlight rendering ---------- */

  function cardHTML(ins, featured) {
    var viz = (VIZ[ins.viz] || barsSVG)(ins);
    var num = NUM_BY_SLUG[ins.slug];
    return '<article class="vh-ins__card' + (featured ? ' vh-ins__card--featured' : '') + '" id="ins-' + ins.slug + '" data-slug="' + ins.slug + '" data-theme="' + kickerTheme(ins.kicker) + '">' +
      '<div class="vh-ins__kicker vh-ins__kicker--' + kickerTheme(ins.kicker) + '">' +
      (num ? '<span class="vh-ins__num">№' + num + '</span>' : '') + esc(ins.kicker) + '</div>' +
      '<h2 class="vh-ins__title">' + esc(ins.title) + '</h2>' +
      (ins.tldr ? '<p class="vh-ins__tldr"><span>tl;dr</span>' + esc(ins.tldr) + '</p>' : '') +
      '<p class="vh-ins__lede">' + esc(ins.lede) + '</p>' +
      '<div class="vh-ins__stat"><span class="vh-ins__statnum">' + esc(ins.stat) + '</span>' +
      '<span class="vh-ins__statlabel">' + esc(ins.stat_label) + '</span></div>' +
      '<div class="vh-ins__vizwrap">' + viz + '</div>' +
      (ins.examples ? '<p class="vh-ins__examples"><span>Last of the breed</span>' +
        ins.examples.map(function (e) { return esc(e.label); }).join(' · ') + '</p>' : '') +
      '<p class="vh-ins__foot">' + esc(ins.foot) + '</p>' +
      '<div class="vh-ins__share">' +
      '<button class="btn vh-ins__copy" data-slug="' + ins.slug + '" type="button">Copy link</button>' +
      '<button class="btn btn-accent vh-ins__png" data-slug="' + ins.slug + '" type="button">Save PNG</button>' +
      '</div></article>';
  }

  function dayOfYear(d) {
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  }

  function render(data) {
    var list = data.insights;
    var host = document.getElementById('insights-list');
    if (!host) return;
    /* Live count: the header stat always matches the data, never hardcoded. */
    var countEl = document.getElementById('insights-count');
    if (countEl) countEl.textContent = list.length;
    var pick = list[dayOfYear(new Date()) % list.length];
    // The spotlight never duplicates a grid card: the grid shows everything else.
    var rest = list.filter(function (ins) { return ins.slug !== pick.slug; });
    var spot = document.getElementById('insights-spotlight');
    if (spot) {
      spot.innerHTML = '<div class="vh-ins__spotlabel">Insight of the day — ' +
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + '</div>' +
        cardHTML(pick, true);
    }
    var lastSeries = null;
    /* Card numbers (№1..№27) are the card's position in insights.json —
       the home "Fresh from the lab" doors reference them. */
    NUM_BY_SLUG = {};
    list.forEach(function (ins, i) { NUM_BY_SLUG[ins.slug] = i + 1; });    host.innerHTML = rest.map(function (ins) {
      var head = '';
      if (ins.series && ins.series !== lastSeries) { lastSeries = ins.series; head = seriesHead(ins.series); }
      return head + cardHTML(ins, false);
    }).join('');
    bindShare(data);
    var hash = (location.hash || '').replace('#', '');
    if (hash) highlight(hash);
  }

  function seriesHead(series) {
    if (series === 'ledger') return '<div class="vh-ins__series"><h2 class="vh-ins__series-title">From the ledger</h2><p class="vh-ins__series-sub">Salary, tax and ticket findings assembled from named public sources — source, sample and window printed on every card.</p></div>';
    return '<div class="vh-ins__series"><h2 class="vh-ins__series-title">From the model</h2><p class="vh-ins__series-sub">Computed from the served 64-d MTNN vectors — nothing hand-written, nothing invented.</p></div>';
  }

  function highlight(slug) {
    var el = document.getElementById('ins-' + slug);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('vh-ins__flash');
    setTimeout(function () { el.classList.remove('vh-ins__flash'); }, 2200);
  }

  /* ---------- sharing ---------- */

  function pageURL(slug) {
    return location.origin + '/insights/' + slug;
  }

  function bindShare(data) {
    var bySlug = {};
    data.insights.forEach(function (i) { bySlug[i.slug] = i; });
    document.querySelectorAll('.vh-ins__copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = pageURL(btn.getAttribute('data-slug'));
        function done() {
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = 'Copy link'; }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
        } else { fallbackCopy(url); done(); }
      });
    });
    document.querySelectorAll('.vh-ins__png').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ins = bySlug[btn.getAttribute('data-slug')];
        btn.textContent = 'Rendering…';
        setTimeout(function () {
          try {
            var url = drawCardPNG(ins);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'vector-hoops-' + ins.slug + '.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (e) { /* no-op: canvas unavailable */ }
          btn.textContent = 'Save PNG';
        }, 30);
      });
    });
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    ta.remove();
  }

  /* ---------- client PNG export (1080 x 1350, dark feed treatment) ---------- */

  function drawCardPNG(ins) {
    var W = 1080, H = 1350;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var F = '"Archivo","Inter",system-ui,-apple-system,"Segoe UI",sans-serif';
    c.fillStyle = VOID;
    c.fillRect(0, 0, W, H);
    c.fillStyle = TERRA;
    c.fillRect(0, 0, W, 14);
    c.textBaseline = 'alphabetic';

    function text(str, x, y, size, color, weight, maxW) {
      c.font = (weight || 400) + ' ' + size + 'px ' + F;
      c.fillStyle = color;
      if (maxW) {
        var w = c.measureText(str).width;
        if (w > maxW) { c.save(); c.translate(x, 0); c.scale(maxW / w, 1); c.fillText(str, 0, y); c.restore(); return; }
      }
      c.fillText(str, x, y);
    }
    function wrap(str, x, y, size, color, weight, maxW, lh, maxLines) {
      c.font = (weight || 400) + ' ' + size + 'px ' + F;
      var words = str.split(' '), lines = [], cur = '';
      words.forEach(function (w) {
        var t = (cur + ' ' + w).trim();
        if (c.measureText(t).width <= maxW) cur = t;
        else { lines.push(cur); cur = w; }
      });
      lines.push(cur);
      lines.slice(0, maxLines || 4).forEach(function (ln, i) {
        c.fillStyle = color;
        c.fillText(ln, x, y + i * lh);
      });
      return y + Math.min(lines.length, maxLines || 4) * lh;
    }

    text(ins.kicker.toUpperCase(), 72, 110, 34, TERRA, 700);
    var sy = 250;
    text(ins.stat, 68, sy, 150, GOLD, 800, W - 140);
    wrap(ins.stat_label, 74, sy + 52, 30, MUTED, 400, W - 148, 40, 2);
    var ty = wrap(ins.title, 72, sy + 170, 62, PAPER, 700, W - 144, 76, 3);
    var vy = ty + 40;
    var vend = drawVizPNG(c, ins, 72, vy, W - 144, 420, F);
    // footer
    c.fillStyle = TERRA;
    c.fillRect(72, H - 150, W - 144, 3);
    text('VECTOR HOOPS', 72, H - 96, 30, PAPER, 700);
    text('hoops.dumbmodel.com/insights.html#' + ins.slug, 72, H - 52, 26, MUTED, 400);
    return cv.toDataURL('image/png');
  }

  function drawVizPNG(c, ins, x, y, w, h, F) {
    c.save();
    /* Draw a row label whole: squeeze horizontally to fit maxW rather than
       truncating with an ellipsis — the same no-truncated-labels rule the
       on-page renderers follow. Caller sets font + fillStyle first. */
    function fitLabel(str, lx, ly, maxW) {
      var lw = c.measureText(str).width;
      if (lw <= maxW) { c.fillText(str, lx, ly); return; }
      c.save(); c.translate(lx, 0); c.scale(maxW / lw, 1); c.fillText(str, 0, ly); c.restore();
    }
    if (ins.viz === 'bars') {
      var rows = ins.rows.slice(0, 5);
      var bvals = rows.map(function (r) { return r.value; });
      var bmax = Math.max.apply(null, bvals), bmin = Math.min.apply(null, bvals);
      var rh = h / rows.length;
      if (bmin >= 0) {
        rows.forEach(function (r, i) {
          var ry = y + i * rh;
          var bw = Math.max(4, (r.value / bmax) * (w - 260));
          c.font = '400 26px ' + F; c.fillStyle = '#F9F6F0';
          fitLabel(r.label, x, ry + rh / 2 + 8, 248);
          c.fillStyle = i === 0 ? GOLD : TERRA;
          var bx = x + 260;
          c.beginPath();
          c.roundRect(bx, ry + rh / 2 - 13, bw, 26, 6);
          c.fill();
          /* Value inside the bar end when it fits there, else just outside —
             but never past the viz's right edge. */
          var vs = String(r.value);
          c.font = '700 24px ' + F;
          var vw = c.measureText(vs).width;
          if (bw >= vw + 24) {
            c.fillStyle = '#1E2022';
            c.fillText(vs, bx + bw - vw - 10, ry + rh / 2 + 8);
          } else {
            c.fillStyle = MUTED;
            c.fillText(vs, bx + bw + 12, ry + rh / 2 + 8);
          }
        });
      } else {
        // Diverging bars around a zero axis (e.g. playoff deltas that go negative).
        var dspan = bmax - bmin, dplot = w - 260 - 60;
        var dzero = x + 260 + ((0 - bmin) / dspan) * dplot;
        c.strokeStyle = MUTED; c.lineWidth = 1;
        c.beginPath(); c.moveTo(dzero, y); c.lineTo(dzero, y + h); c.stroke();
        rows.forEach(function (r, i) {
          var dry = y + i * rh;
          var dbw = Math.max(4, (Math.abs(r.value) / dspan) * dplot);
          var dbx = r.value < 0 ? dzero - dbw : dzero;
          c.font = '400 26px ' + F; c.fillStyle = '#F9F6F0';
          fitLabel(r.label, x, dry + rh / 2 + 8, 248);
          c.fillStyle = r.value < 0 ? TERRA : GOLD;
          c.beginPath();
          c.roundRect(dbx, dry + rh / 2 - 13, dbw, 26, 6);
          c.fill();
          /* Value adjacent to its own bar end: inside when it fits, else
             outside on the bar's side of the spine — never across it. */
          var dvs = String(r.value);
          c.font = '700 24px ' + F;
          var dvw = c.measureText(dvs).width;
          c.fillStyle = MUTED;
          if (dbw >= dvw + 24) {
            c.fillStyle = '#1E2022';
            c.fillText(dvs, r.value < 0 ? dbx + 10 : dbx + dbw - dvw - 10, dry + rh / 2 + 8);
          } else if (r.value < 0) {
            c.fillText(dvs, dbx - dvw - 12, dry + rh / 2 + 8);
          } else {
            c.fillText(dvs, dbx + dbw + 12, dry + rh / 2 + 8);
          }
        });
      }
    } else if (ins.viz === 'shares') {
      var rows2 = ins.rows;
      var rh2 = h / rows2.length;
      rows2.forEach(function (r, i) {
        var ry = y + i * rh2;
        c.font = '400 24px ' + F; c.fillStyle = '#F9F6F0';
        fitLabel(r.label, x, ry + rh2 / 2 + 8, 318);
        var bx = x + 330, bw1 = Math.max(3, r.early * 14), bw2 = Math.max(3, r.late * 14);
        c.fillStyle = MUTED; c.fillRect(bx, ry + rh2 / 2 - 16, bw1, 12);
        c.fillStyle = r.delta < 0 ? '#b0523c' : TERRA;
        c.fillRect(bx, ry + rh2 / 2 + 2, bw2, 12);
        c.fillStyle = MUTED; c.font = '400 22px ' + F;
        c.fillText((r.delta > 0 ? '+' : '') + r.delta + 'pp', bx + 200, ry + rh2 / 2 + 10);
      });
    } else if (ins.viz === 'timeline') {
      var rows3 = ins.rows;
      var rh3 = h / rows3.length;
      rows3.forEach(function (r, i) {
        var ry = y + i * rh3;
        c.font = '400 28px ' + F; c.fillStyle = '#F9F6F0';
        c.fillText(r.a, x, ry + 34);
        c.fillText(r.b, x, ry + 72);
        var lx = x + 420;
        c.strokeStyle = TERRA; c.lineWidth = 3;
        c.beginPath(); c.moveTo(lx, ry + 26); c.lineTo(lx, ry + 64); c.stroke();
        c.fillStyle = GOLD;
        c.beginPath(); c.arc(lx, ry + 26, 7, 0, 7); c.fill();
        c.beginPath(); c.arc(lx, ry + 64, 7, 0, 7); c.fill();
        c.fillStyle = MUTED; c.font = '400 24px ' + F;
        c.fillText(r.gap + 'y · ' + r.sim, lx + 24, ry + 52);
      });
    } else if (ins.viz === 'line') {
      var rows4 = ins.rows;
      var max4 = Math.max.apply(null, rows4.map(function (r) { return r.v; })) * 1.1;
      function X(i) { return x + (i / (rows4.length - 1)) * w; }
      function Y(v) { return y + h - (v / max4) * h; }
      c.strokeStyle = TERRA; c.lineWidth = 5;
      c.beginPath();
      rows4.forEach(function (r, i) { i ? c.lineTo(X(i), Y(r.v)) : c.moveTo(X(i), Y(r.v)); });
      c.stroke();
      c.fillStyle = GOLD;
      [[0], [rows4.length - 1]].forEach(function (ii) {
        var i = ii[0];
        c.beginPath(); c.arc(X(i), Y(rows4[i].v), 10, 0, 7); c.fill();
      });
      c.font = '700 30px ' + F; c.fillStyle = PAPER;
      c.fillText(rows4[0].v + '', X(0) - 10, Y(rows4[0].v) - 18);
      var lv = rows4[rows4.length - 1].v + '';
      c.fillText(lv, X(rows4.length - 1) - c.measureText(lv).width + 10, Y(rows4[rows4.length - 1].v) - 18);
      c.font = '400 24px ' + F; c.fillStyle = MUTED;
      c.fillText(rows4[0].s, X(0), y + h + 34);
      var ls = rows4[rows4.length - 1].s;
      c.fillText(ls, X(rows4.length - 1) - c.measureText(ls).width, y + h + 34);
    } else if (ins.viz === 'seasons') {
      /* Multi-season cheapest-vs-priciest: season label, then a gold
         (cheapest) and terra (priciest) bar per season. */
      var rows5 = (ins.rows || []).filter(function (r) { return r && r.cheap && r.pricey; });
      var rh5 = rows5.length ? h / rows5.length : h;
      var max5 = rows5.length ?
        Math.max.apply(null, rows5.map(function (r) { return r.pricey.v; })) * 1.06 : 1;
      rows5.forEach(function (r, i) {
        var ry = y + i * rh5;
        c.font = '700 26px ' + F; c.fillStyle = '#F9F6F0';
        c.fillText(r.s, x, ry + 32);
        [['cheap', GOLD], ['pricey', TERRA]].forEach(function (t, j) {
          var d = r[t[0]];
          var bwy = ry + 46 + j * 46;
          c.font = '400 22px ' + F; c.fillStyle = '#F9F6F0';
          fitLabel(d.label + ' \u00b7 $' + d.v + 'M/win', x, bwy + 19, 300);
          c.fillStyle = t[1];
          c.beginPath();
          c.roundRect(x + 320, bwy, Math.max(4, (d.v / max5) * (w - 320)), 24, 6);
          c.fill();
        });
      });
    }
    c.restore();
    return y + h;
  }

  /* ---------- boot ---------- */

  function boot() {
    load().then(render).catch(function () {
      var host = document.getElementById('insights-list');
      if (host) host.innerHTML = '<p class="vh-ins__error">Could not load insights right now — check your connection and reload.</p>';
    });
    window.addEventListener('hashchange', function () {
      highlight((location.hash || '').replace('#', ''));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  global.VHInsights = { pageURL: pageURL };
})(window);
