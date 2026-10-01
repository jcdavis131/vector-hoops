/* Vector Hoops — assets/player-dossier.js
 *
 * Data-driven player dossier renderer. Loads assets/dossiers.json
 * (built by pipeline/build_dossiers.py from the house embedding model
 * + derived research assets) and renders a career dossier into the
 * existing dossier modal body. Returns false when no data dossier
 * exists so callers can fall back to the markdown wiki path.
 *
 * No DOM/modal-stack code here — the host page owns the modal.
 */
(function (global) {
  'use strict';

  var URL = 'assets/dossiers.json';
  var cache = null;   // resolves to {meta, dossiers}
  var META = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slug(name) {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var TRAIT_SHORT = {
    'three-point volume': '3PT volume',
    'three-point accuracy': '3PT accuracy'
  };
  function trait(i) {
    var t = META.traits[i] || ('trait ' + i);
    return TRAIT_SHORT[t] || t;
  }
  function arch(i) { return META.clusters[i] || ('archetype ' + i); }

  function load() {
    if (!cache) {
      cache = fetch(URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
      cache.catch(function () { cache = null; });
    }
    return cache;
  }

  function h4(t) { return '<h4 class="vh-dossier__h4">' + esc(t) + '</h4>'; }

  function fingerprintBars(fp) {
    var rows = fp.map(function (v, i) {
      var mag = Math.min(100, Math.abs(v) / 3 * 100);
      var side = v >= 0 ? 'right' : 'left';
      var fill = v >= 0
        ? 'background:rgba(224,118,46,.8)'
        : 'background:rgba(130,150,170,.55)';
      var bar = '<span class="vh-dos__track"><span class="vh-dos__mid"></span>' +
        '<span class="vh-dos__fill vh-dos__fill--' + side + '" style="' + fill +
        ';width:' + mag.toFixed(1) + '%"></span></span>';
      return '<div class="vh-dos__trait"><span class="vh-dos__label">' + esc(trait(i)) +
        '</span>' + bar + '<span class="vh-dos__val">' +
        (v >= 0 ? '+' : '') + v.toFixed(1) + '</span></div>';
    }).join('');
    return '<div class="vh-dos__traits">' + rows + '</div>' +
      '<p class="vh-dos__note">Minutes-weighted 14-d style vector vs league average ' +
      '(z-scores). Orange = above average.</p>';
  }

  function twinsSection(tw) {
    if (!tw) {
      return '<p class="vh-dos__note">No era twin charted yet — twin pool covers ' +
        'careers with 4+ seasons.</p>';
    }
    var t = tw.t;
    var html = '<div class="vh-dos__twin"><div class="vh-dos__twin-name">' +
      esc(t.n) + ' <span class="vh-dos__dim">' + esc(t.s) + '</span></div>' +
      '<div class="vh-dos__twin-sim">similarity ' + t.sim.toFixed(3) + '</div></div>';
    if (tw.why) {
      var w = tw.why;
      if (w.sh && w.sh.length) {
        html += '<div class="vh-dos__bullet">' +
          esc(w.sh.slice(0, 3).join('; ')) + '.</div>';
      }
      if (w.d) {
        html += '<div class="vh-dos__bullet">Differs most on ' + esc(w.d) + '.</div>';
      }
      if (w.th) {
        html += '<p class="vh-dos__note">Thin match — found in the full embedding ' +
          'space; treat as directional, not a claim of sameness.</p>';
      }
    }
    if (tw.t5 && tw.t5.length > 1) {
      html += '<div class="vh-dos__top5">' + tw.t5.slice(1).map(function (c) {
        return '<div class="vh-dos__row2"><span>' + esc(c.n) +
          ' <span class="vh-dos__dim">' + esc(c.s) + '</span></span>' +
          '<span class="vh-dos__dim">' + c.sim.toFixed(3) + '</span></div>';
      }).join('') + '</div>';
    }
    return html;
  }

  function render(d) {
    var html = '';
    var meta = d.sp[0] + ' \u2192 ' + d.sp[1] + ' \u00b7 ' +
      d.ns + ' season' + (d.ns === 1 ? '' : 's') +
      (d.pos.length ? ' \u00b7 ' + d.pos.join('/') : '') +
      (d.tm.length ? ' \u00b7 ' + d.tm.join('/') : '');
    html += '<p class="vh-dos__meta">' + esc(meta) + '</p>';
    if (d.hn) {
      var hb = [];
      if (d.hn.asg) hb.push(d.hn.asg + '\u00d7 All-Star');
      if (d.hn.nba) hb.push(d.hn.nba + '\u00d7 All-NBA');
      if (d.hn.fmvp) hb.push(d.hn.fmvp + '\u00d7 Finals MVP');
      if (hb.length) html += '<p class="vh-dos__honors">' + esc(hb.join(' \u00b7 ')) + '</p>';
    }

    html += h4('The fingerprint');
    html += fingerprintBars(d.fp);
    html += '<p class="vh-dos__note">Signature traits: <b>' +
      esc(d.fh.map(trait).join(', ')) + '</b> \u00b7 quietest: ' +
      esc(d.fl.map(trait).join(', ')) + '.</p>';

    html += h4('Archetype');
    html += '<p class="vh-dos__p">Now: <b>' + esc(arch(d.an)) + '</b></p>';
    if (d.ap.length > 1) {
      html += '<p class="vh-dos__note">' + esc(d.ap.map(arch).join(' \u2192 ')) + '</p>';
    }

    html += h4('Era twin');
    html += twinsSection(d.tw);

    html += h4('How his game changed');
    if (d.mu.length || d.md.length) {
      if (d.mu.length) {
        html += '<div class="vh-dos__bullet">\u2191 ' + esc(d.mu.map(trait).join(' \u00b7 ')) +
          ' <span class="vh-dos__dim">(' + esc(d.sp[0]) + ' \u2192 ' + esc(d.sp[1]) + ')</span></div>';
      }
      if (d.md.length) {
        html += '<div class="vh-dos__bullet">\u2193 ' + esc(d.md.map(trait).join(' \u00b7 ')) + '</div>';
      }
    } else {
      html += '<p class="vh-dos__note">Steady profile — no trait moved more than ' +
        'half a standard deviation across his charted career.</p>';
    }

    html += h4('The neighborhood');
    html += '<div class="vh-dos__top5">' + d.nb.map(function (n) {
      return '<div class="vh-dos__row2"><span>' + esc(n.n) +
        ' <span class="vh-dos__dim">' + esc(n.s) + '</span></span>' +
        '<span class="vh-dos__dim">' + n.sim.toFixed(3) + '</span></div>';
    }).join('') + '</div>';
    html += '<p class="vh-dos__note">Five nearest player-seasons to his signature ' +
      'season (' + esc(d.ss) + ') in the 14-d style space.</p>';

    html += h4('On the map');
    html += '<p class="vh-dos__note">' + esc(d.mr.join(' \u00b7 ')) + '.</p>';

    html += '<p class="vh-dos__prov">Built from the house embedding model ' +
      '(MTNN v5, 14-d serving vectors) plus derived research \u2014 era twins, ' +
      'career trails, archetypes, honors. ' +
      '<a href="methods.html#dossier">How it\u2019s made \u2192</a></p>';
    return html;
  }

  var CSS = '.vh-dos__meta{opacity:.85;margin:0 0 4px}' +
    '.vh-dos__honors{color:#e0762e;font-weight:600;margin:0 0 8px;font-size:13px}' +
    '.vh-dos__traits{display:grid;gap:3px;margin:6px 0}' +
    '.vh-dos__trait{display:grid;grid-template-columns:130px 1fr 44px;gap:8px;align-items:center;font-size:12px}' +
    '.vh-dos__label{opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.vh-dos__track{position:relative;height:8px;background:rgba(128,128,128,.14);border-radius:4px}' +
    '.vh-dos__mid{position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(128,128,128,.5)}' +
    '.vh-dos__fill{position:absolute;top:0;bottom:0;border-radius:4px}' +
    '.vh-dos__fill--right{left:50%}.vh-dos__fill--left{right:50%}' +
    '.vh-dos__val{opacity:.7;text-align:right;font-variant-numeric:tabular-nums}' +
    '.vh-dos__note{opacity:.65;font-size:12px;line-height:1.5;margin:6px 0}' +
    '.vh-dos__bullet{font-size:13px;margin:4px 0;padding-left:14px;position:relative}' +
    '.vh-dos__bullet:before{content:"\\2013";position:absolute;left:0;opacity:.5}' +
    '.vh-dos__dim{opacity:.55;font-size:12px}' +
    '.vh-dos__twin{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:6px 0}' +
    '.vh-dos__twin-name{font-weight:700;font-size:15px}' +
    '.vh-dos__twin-sim{opacity:.7;font-size:12px;font-variant-numeric:tabular-nums}' +
    '.vh-dos__top5{display:grid;gap:2px;margin:6px 0}' +
    '.vh-dos__row2{display:flex;justify-content:space-between;gap:8px;font-size:13px}' +
    '.vh-dos__prov{opacity:.55;font-size:11.5px;border-top:1px solid rgba(128,128,128,.25);' +
    'padding-top:8px;margin-top:10px}' +
    '.vh-dos__prov a{color:inherit}' +
    '@media(max-width:520px){.vh-dos__trait{grid-template-columns:104px 1fr 40px}}' +
    /* keep the modal title + close reachable while the long dossier scrolls */
    '#dossier-modal>div:first-child{position:sticky;top:-14px;z-index:3;' +
    'background:var(--surface,#fff);padding:10px 0;margin-top:-4px}';

  function injectCss() {
    if (document.getElementById('vh-dos-css')) return;
    var st = document.createElement('style');
    st.id = 'vh-dos-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  global.VHPlayerDossier = {
    renderInto: function (bodyEl, name) {
      injectCss();
      return load().then(function (all) {
        META = all._meta;
        var d = all.dossiers[slug(name)];
        if (!d) return false;
        bodyEl.innerHTML = render(d);
        return true;
      }, function () { return false; });
    }
  };
})(window);
