/* Vector Hoops Insights — curated analytics cards from the embedding model.
   Share-first: every card has a deep link + a client-rendered PNG export. */
(function (global) {
  'use strict';

  var VOID = '#1E2022', PAPER = '#F9F6F0', TERRA = '#C17C60',
      GOLD = '#D4AF69', MUTED = '#8b8578';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function load() {
    return fetch('assets/insights.json').then(function (r) {
      if (!r.ok) throw new Error('insights.json ' + r.status);
      return r.json();
    });
  }

  /* ---------- SVG viz renderers (on-page) ---------- */

  function barsSVG(ins) {
    var rows = ins.rows.slice(0, 8);
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var W = 620, rowH = 34, padL = 200, padR = 130;
    var H = rows.length * rowH + 8;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="' + esc(ins.viz_label || 'bar chart') + '">';
    rows.forEach(function (r, i) {
      var y = i * rowH + 8, w = Math.max(3, (r.value / max) * (W - padL - padR));
      var gold = i === 0;
      s += '<text x="0" y="' + (y + 17) + '" class="vh-ins__svglabel">' + esc(r.label) + '</text>';
      s += '<rect x="' + padL + '" y="' + y + '" width="' + w.toFixed(1) + '" height="20" rx="4" fill="' + (gold ? GOLD : TERRA) + '" opacity="' + (gold ? 1 : 0.55 + 0.4 * (1 - i / rows.length)) + '"/>';
      s += '<text x="' + (padL + w + 8) + '" y="' + (y + 16) + '" class="vh-ins__svgval">' + r.value + (r.tag ? ' · ' + esc(r.tag) : '') + '</text>';
    });
    return s + '</svg>';
  }

  function sharesSVG(ins) {
    var rows = ins.rows;
    var W = 620, rowH = 30, padL = 250, padR = 10;
    var H = rows.length * rowH + 30;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="archetype share then vs now">';
    s += '<text x="' + padL + '" y="12" class="vh-ins__svgval" fill="' + MUTED + '">then</text>';
    s += '<text x="' + (padL + 130) + '" y="12" class="vh-ins__svgval">now</text>';
    rows.forEach(function (r, i) {
      var y = 20 + i * rowH;
      var w1 = Math.max(2, r.early * 9), w2 = Math.max(2, r.late * 9);
      var neg = r.delta < 0;
      s += '<text x="0" y="' + (y + 15) + '" class="vh-ins__svglabel">' + esc(r.label) + '</text>';
      s += '<rect x="' + padL + '" y="' + y + '" width="' + w1.toFixed(1) + '" height="9" rx="3" fill="' + MUTED + '"/>';
      s += '<rect x="' + padL + '" y="' + (y + 11) + '" width="' + w2.toFixed(1) + '" height="9" rx="3" fill="' + (neg ? '#b0523c' : TERRA) + '"/>';
      s += '<text x="' + (padL + 250) + '" y="' + (y + 16) + '" class="vh-ins__svgval">' + (r.delta > 0 ? '+' : '') + r.delta + 'pp</text>';
    });
    return s + '</svg>';
  }

  function timelineSVG(ins) {
    var rows = ins.rows;
    var W = 620, rowH = 64;
    var H = rows.length * rowH + 16;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="era twin timelines">';
    rows.forEach(function (r, i) {
      var y = i * rowH + 16, midY = y + 26;
      s += '<text x="0" y="' + (y + 12) + '" class="vh-ins__svglabel">' + esc(r.a) + '</text>';
      s += '<text x="0" y="' + (y + 44) + '" class="vh-ins__svglabel">' + esc(r.b) + '</text>';
      s += '<line x1="300" y1="' + (y + 8) + '" x2="300" y2="' + (y + 48) + '" stroke="' + TERRA + '" stroke-width="2"/>';
      s += '<circle cx="300" cy="' + (y + 8) + '" r="4" fill="' + GOLD + '"/>';
      s += '<circle cx="300" cy="' + (y + 48) + '" r="4" fill="' + GOLD + '"/>';
      s += '<text x="320" y="' + (midY + 5) + '" class="vh-ins__svgval">' + r.gap + 'y apart · sim ' + r.sim + '</text>';
    });
    return s + '</svg>';
  }

  function lineSVG(ins) {
    var rows = ins.rows;
    var W = 620, H = 240, padL = 44, padB = 30, padT = 16;
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) * 1.08;
    function X(i) { return padL + (i / (rows.length - 1)) * (W - padL - 14); }
    function Y(v) { return padT + (1 - v / max) * (H - padT - padB); }
    var pts = rows.map(function (r, i) { return X(i).toFixed(1) + ',' + Y(r.v).toFixed(1); }).join(' ');
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vh-ins__viz" role="img" aria-label="' + esc(ins.viz_label || 'line chart') + '">';
    s += '<polyline points="' + pts + '" fill="none" stroke="' + TERRA + '" stroke-width="3"/>';
    s += '<circle cx="' + X(0) + '" cy="' + Y(rows[0].v) + '" r="5" fill="' + GOLD + '"/>';
    s += '<circle cx="' + X(rows.length - 1) + '" cy="' + Y(rows[rows.length - 1].v) + '" r="5" fill="' + GOLD + '"/>';
    s += '<text x="' + (X(0) - 6) + '" y="' + (Y(rows[0].v) - 10) + '" class="vh-ins__svgval" text-anchor="end">' + rows[0].v + '</text>';
    s += '<text x="' + (X(rows.length - 1) + 8) + '" y="' + (Y(rows[rows.length - 1].v) - 10) + '" class="vh-ins__svgval">' + rows[rows.length - 1].v + '</text>';
    s += '<text x="' + padL + '" y="' + (H - 8) + '" class="vh-ins__svglabel">' + esc(rows[0].s) + '</text>';
    s += '<text x="' + (W - 14) + '" y="' + (H - 8) + '" class="vh-ins__svglabel" text-anchor="end">' + esc(rows[rows.length - 1].s) + '</text>';
    return s + '</svg>';
  }

  var VIZ = { bars: barsSVG, shares: sharesSVG, timeline: timelineSVG, line: lineSVG };

  /* ---------- card + spotlight rendering ---------- */

  function cardHTML(ins, featured) {
    var viz = (VIZ[ins.viz] || barsSVG)(ins);
    return '<article class="vh-ins__card' + (featured ? ' vh-ins__card--featured' : '') + '" id="ins-' + ins.slug + '" data-slug="' + ins.slug + '">' +
      '<div class="vh-ins__kicker">' + esc(ins.kicker) + '</div>' +
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
    var pick = list[dayOfYear(new Date()) % list.length];
    // The spotlight never duplicates a grid card: the grid shows everything else.
    var rest = list.filter(function (ins) { return ins.slug !== pick.slug; });
    var spot = document.getElementById('insights-spotlight');
    if (spot) {
      spot.innerHTML = '<div class="vh-ins__spotlabel">Insight of the day — ' +
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + '</div>' +
        cardHTML(pick, true);
    }
    host.innerHTML = rest.map(function (ins) { return cardHTML(ins, false); }).join('');
    bindShare(data);
    var hash = (location.hash || '').replace('#', '');
    if (hash) highlight(hash);
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
    return location.origin + location.pathname.replace(/[^/]*$/, '') + 'insights.html#' + slug;
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
    if (ins.viz === 'bars') {
      var rows = ins.rows.slice(0, 5);
      var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
      var rh = h / rows.length;
      rows.forEach(function (r, i) {
        var ry = y + i * rh;
        var bw = Math.max(4, (r.value / max) * (w - 260));
        c.font = '400 26px ' + F; c.fillStyle = '#F9F6F0';
        var label = r.label.length > 26 ? r.label.slice(0, 25) + '…' : r.label;
        c.fillText(label, x, ry + rh / 2 + 8);
        c.fillStyle = i === 0 ? GOLD : TERRA;
        var bx = x + 260;
        c.beginPath();
        c.roundRect(bx, ry + rh / 2 - 13, bw, 26, 6);
        c.fill();
        c.fillStyle = MUTED; c.font = '400 24px ' + F;
        c.fillText(String(r.value), bx + bw + 12, ry + rh / 2 + 8);
      });
    } else if (ins.viz === 'shares') {
      var rows2 = ins.rows;
      var rh2 = h / rows2.length;
      rows2.forEach(function (r, i) {
        var ry = y + i * rh2;
        c.font = '400 24px ' + F; c.fillStyle = '#F9F6F0';
        var lb = r.label.length > 30 ? r.label.slice(0, 29) + '…' : r.label;
        c.fillText(lb, x, ry + rh2 / 2 + 8);
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
