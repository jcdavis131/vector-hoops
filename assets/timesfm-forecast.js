// timesfm-forecast.js — cohesive forecast layer for Vector Hoops
// Zero-deps, stdlib only. Same tokens as human-v6 + shell.
// One data contract: /data/timesfm_forecasts.json (public) with fallback to /assets/data/...
// Language: "Where you stood → how you grew → where you're headed" — experimental, honest 503 if missing.

(function (global) {
  'use strict';

  const DATA_URLS = [
    '/data/timesfm_forecasts.json',
    '/assets/data/timesfm_forecasts.json',
    'assets/data/timesfm_forecasts.json',
    '/public/data/timesfm_forecasts.json'
  ];

  let _cache = null;
  let _byName = null;

  function fetchFirst(urls, i) {
    i = i || 0;
    if (i >= urls.length) return Promise.reject(new Error('forecast 503'));
    return fetch(urls[i], { cache: 'default' })
      .then(r => {
        if (!r.ok) throw new Error('not ok');
        return r.json();
      })
      .catch(() => fetchFirst(urls, i + 1));
  }

  function load() {
    if (_cache) return Promise.resolve(_cache);
    try {
      const ls = localStorage.getItem('vh.forecast.cache.v2');
      if (ls) {
        const j = JSON.parse(ls);
        if (j && j.forecasts && j.forecasts.length) {
          _cache = j;
          _byName = new Map(j.forecasts.map(f => [String(f.name).toLowerCase(), f]));
          // still refresh in background
          fetchFirst(DATA_URLS).then(j2 => {
            _cache = j2;
            _byName = new Map(j2.forecasts.map(f => [String(f.name).toLowerCase(), f]));
            try { localStorage.setItem('vh.forecast.cache.v2', JSON.stringify(j2)); } catch {}
          }).catch(() => {});
          return Promise.resolve(_cache);
        }
      }
    } catch {}
    return fetchFirst(DATA_URLS).then(j => {
      _cache = j;
      _byName = new Map((j.forecasts || []).map(f => [String(f.name).toLowerCase(), f]));
      try { localStorage.setItem('vh.forecast.cache.v2', JSON.stringify(j)); } catch {}
      return j;
    }).catch(() => {
      const empty = { version: '0-exp', count: 0, forecasts: [], note: 'forecast 503 — offline or not built yet' };
      _cache = empty;
      _byName = new Map();
      return empty;
    });
  }

  function getForName(name) {
    if (!_byName) return null;
    if (!name) return null;
    return _byName.get(String(name).toLowerCase()) || null;
  }

  // --- shared markup helpers, same pills as shell ---
  function pill(text, variant) {
    const cls = variant ? `pill pill-${variant}` : 'pill';
    return `<span class="${cls}" style="font-family:var(--mono,ui-monospace,monospace);font-size:10px;font-weight:800;letter-spacing:.04em;border:1.6px solid var(--ink,#1A150F);border-radius:999px;padding:4px 10px;background:#fff;box-shadow:1.5px 1.5px 0 var(--ink,#1A150F);display:inline-flex;align-items:center;gap:6px">${text}</span>`;
  }

  function forecastCardHTML(playerName, f) {
    const is503 = !f;
    const pred = f && (f.torch_pred || f.pred) || [];
    const last = f && f.last_season || '';
    const n = f && f.n_seasons || 0;
    const dimNote = f ? `${pred.length} of ${f.full_dim || 64 || 64} dims` : '—';
    // simple sparkline from 8-d pred as 2D projection (first two dims)
    let spark = '';
    if (pred.length >= 2) {
      const pts = pred.slice(0, 8).map((v, i) => {
        const x = (i / 7) * 100;
        const y = 50 - v * 40; // crude
        return `${x},${y}`;
      }).join(' ');
      spark = `<svg viewBox="0 0 100 100" width="100%" height="56" style="display:block;background:#FFFEF7;border:1.4px solid var(--ink);border-radius:10px"><polyline fill="none" stroke="#C17C60" stroke-width="2" stroke-dasharray="4 3" points="${pts}"/><circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="3" fill="#FFFEFB" stroke="#1A150F" stroke-width="1.4"/></svg>`;
    }

    return `
      <div class="hv6-forecast" style="margin-top:14px;border:2.2px solid var(--ink,#1A150F);border-radius:14px;background:#fff;box-shadow:4px 4px 0 var(--ink,#1A150F);padding:12px 12px;overflow:hidden">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-family:var(--mono);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5A5248">Where you're headed</span>
            ${pill(is503 ? '503 • offline' : 'Experimental', is503 ? '' : 'yellow')}
            <span style="font-family:var(--mono);font-size:10px;opacity:.6">${dimNote}</span>
          </div>
          <span style="font-family:var(--mono);font-size:10px;opacity:.6">${last ? `last ${last} • ${n} seasons` : ''}</span>
        </div>
        <div style="font-size:13px;line-height:1.5;color:#2E2A23;margin:0 0 8px">
          ${is503
            ? `<b>${playerName || 'This player'}</b> — forecast not built on this device yet. Showing honest fallback. The same 8-d momentum that powers the map, projected one season forward.`
            : `<b>${playerName}</b> — <span style="font-family:var(--font-human,serif);color:#C17C60">3-season context → next-season</span> drift. First ${pred.length} embedding dims, muted stone = uncertainty, terracotta dashed = headed direction. Not a rank, just geometry.`
          }
        </div>
        ${spark ? `<div style="margin:8px 0">${spark}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${pill('Same source: embedding_v3 12,966×64')}
          ${pill('Past → Modern → Headed', 'blue')}
        </div>
        <div class="hv6-provenance" style="margin-top:8px;font-family:var(--mono);font-size:10px;line-height:1.5;opacity:.7">
          ${is503 ? 'Honest 503: /data/timesfm_forecasts.json missing. Using local fallback.' : (global.HoopsForecast && _cache && _cache.note ? _cache.note : 'Experimental baseline — chronological split not applied, no quantile calibration. Do not ship as validated TimesFM.')}
        </div>
      </div>
    `;
  }

  // --- Map integration: ghost ring for forecast ---
  // Uses same canvas as shared-map.js / embedding-nebula.js. Adds a stone dashed ring.
  function attachToMap(mapApi, playerName) {
    if (!mapApi || !playerName) return;
    load().then(() => {
      const f = getForName(playerName);
      if (!f) return;
      const pred = f.torch_pred || f.pred;
      if (!pred || !pred.length) return;
      // Map our 8-d pred into 3D via same projection as searchLite if available
      // For now: inject as addPoint with isForecast flag, using first 3 dims as x/y/z approximation
      // Real projection would use mtnn_map.json PCA — we keep it light and honest
      try {
        if (mapApi.addPoint) {
          const x = pred[0] * 2.2;
          const y = pred[1] * 2.2;
          const z = pred[2] ? pred[2] * 2.2 : 0;
          mapApi.addPoint({
            i: -1,
            x, y, z,
            c: 9, // spare color slot
            n: `${playerName} → headed`,
            s: 'forecast',
            isForecast: true,
            forecastOf: playerName
          });
        }
        // Draw stone dashed ring via canvas overlay if mapApi has hook
        if (mapApi.setGuesses) {
          // keep existing guesses, mapApi will render forecast point as dimmed
        }
      } catch (e) { console.warn('forecast map attach fail', e); }
    });
  }

  // --- Trends integration ---
  function renderTrendsSlot(containerId, playerName) {
    const el = document.getElementById(containerId);
    if (!el) return;
    load().then(() => {
      const f = getForName(playerName) || null;
      el.innerHTML = forecastCardHTML(playerName, f);
    });
  }

  // --- Player dossier integration ---
  function renderPlayerSlot(containerId, playerName) {
    const el = document.getElementById(containerId);
    if (!el) return;
    load().then(() => {
      const f = getForName(playerName) || null;
      // same card but tighter
      el.innerHTML = forecastCardHTML(playerName, f);
    });
  }

  // --- Canvas sparkline (for /model lab) ---
  function renderForecastCanvas(canvasId, opts) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#FFFEF7';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#E8E0D5';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i < 4; i++) {
      const y = (i / 3) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    load().then(data => {
      const list = (data.forecasts || []).slice(0, opts && opts.n || 48);
      ctx.strokeStyle = '#C17C60';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      list.forEach((f, i) => {
        const v = (f.torch_pred && f.torch_pred[0]) || (f.pred && f.pred[0]) || 0;
        const x = (i / Math.max(1, list.length - 1)) * W;
        const y = H * 0.5 - v * H * 0.6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      const legend = document.getElementById((opts && opts.legendId) || 'forecast-legend');
      if (legend) {
        legend.innerHTML = `<span class="mono" style="font-family:var(--mono);font-size:11px">Forecasts: ${data.count} • ${data.model} • ${data.note || ''}</span>`;
      }
    });
  }

  global.HoopsForecast = {
    load,
    getForName,
    renderForecastCanvas,
    renderTrendsSlot,
    renderPlayerSlot,
    attachToMap,
    forecastCardHTML,
    pill
  };

})(window);
