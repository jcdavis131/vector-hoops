/* Greatest Playoff Runs — renders the four leaderboards from assets/playoff-runs.json
   Two-way edition: the headline number is the all-around score
   (offense + defense + net rating), not raw per-100 scoring. */
(function (global) {
  'use strict';

  var HEADS = {
    individuals: { title: 'Individual runs', sub: 'Ten-plus playoff games. All-around score: per-100 scoring and shooting efficiency, plus defensive impact (DBPM) and a share of team net rating — with a bonus for each round won and the title.' },
    duos: { title: 'Duos', sub: 'The two best two-way teammates on each ranked team run — both real rotation players (40+ regular-season games, 12+ playoff games).' },
    trios: { title: 'Trios', sub: 'The three best two-way teammates of each run. Two-way cores, not lineups.' },
    teams: { title: 'Team runs', sub: 'The most dominant postseasons of the last 30 years, ranked by playoff net rating, then wins. Minimum two series won.' }
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function signed(x, digits) {
    var v = Number(x);
    return (v >= 0 ? '+' : '') + v.toFixed(digits == null ? 1 : digits);
  }

  function champBadge(r) {
    return r.champion ? '<span class="vh-runs__champ">🏆 Champions</span>' : '';
  }

  // Deep link into the Players directory, pre-filled search (?q= support
  // in assets/players-directory.js) so every run connects to the atlas.
  function plink(name) {
    return '<a class="vh-runs__plink" href="/players?q=' +
      encodeURIComponent(name) + '">' + esc(name) + '</a>';
  }

  // No bar: board scores cluster within a few points of each other, so a
  // max-normalized bar rendered every run at ~95% length and implied gaps
  // that aren't in the numbers. The score itself is the signal.
  function barRow(rank, names, meta, score, badge) {
    return '<article class="vh-runs__row">' +
      '<div class="vh-runs__rank">' + rank + '</div>' +
      '<div><h3 class="vh-runs__names">' + names + badge + '</h3>' +
      '<p class="vh-runs__meta">' + meta + '</p>' +
      '<p class="vh-runs__pts"><b>' + score.toFixed(1) + '</b> all-around score</p></div>' +
      '</article>';
  }

  /* "Share this board": every leaderboard is a shareable, debatable unit.
     Web Share API where available, clipboard fallback otherwise — the same
     honest-share pattern as the page-level button, but per board. */
  var SHARE_TEXT = {
    individuals: 'Greatest Playoff Runs — Individuals',
    duos: 'Greatest Playoff Runs — Duos',
    trios: 'Greatest Playoff Runs — Trios',
    teams: 'Greatest Playoff Runs — Team runs'
  };

  function bindBoardShare() {
    document.querySelectorAll('.vh-runs__boardshare').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-board');
        var url = location.origin + location.pathname + '#board-' + key;
        var title = SHARE_TEXT[key] + ' — Vector Hoops';
        function done() {
          btn.textContent = 'Link copied';
          setTimeout(function () { btn.textContent = 'Share this board'; }, 1600);
        }
        if (navigator.share) {
          navigator.share({ title: title, url: url }).catch(function () {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, done);
        } else { done(); }
      });
    });
  }

  function renderBoard(el, key, rows) {
    var head = HEADS[key];
    var html = '<div class="vh-runs__boardhead"><h2>' + esc(head.title) + '</h2><p>' + esc(head.sub) + '</p>' +
      '<button class="btn vh-runs__boardshare" data-board="' + key + '" type="button">Share this board</button></div>';
    html += rows.map(function (r, i) {
      var rank = i + 1;
      if (key === 'individuals') {
        return barRow(rank, plink(r.player),
          '<b>' + esc(r.season) + '</b> · ' + esc(r.team) + ' · ' + esc(r.wl) + ' in ' + r.gp + ' games' +
          ' · ' + r.pts100.toFixed(1) + ' pts/100 · ' + signed(r.dbpm) + ' DBPM · team ' + signed(r.team_netrtg),
          r.score, champBadge(r));
      }
      if (key === 'teams') {
        return barRow(rank, esc(r.team),
          '<b>' + esc(r.season) + '</b> · ' + esc(r.wl) + ' · path ' + esc(r.path) +
          ' · ' + signed(r.netrtg) + ' net rating · led by ' + plink(r.top_scorer),
          r.score, champBadge(r));
      }
      return barRow(rank, r.players.map(plink).join(' <span aria-hidden="true">·</span> '),
        '<b>' + esc(r.team) + '</b> · ' + esc(r.season) + ' · ' + esc(r.wl) +
        ' · ' + signed(r.dbpm_sum) + ' DBPM · team ' + signed(r.team_netrtg),
        r.score, champBadge(r));
    }).join('');
    el.innerHTML = html;
  }

  function render(data) {
    ['individuals', 'duos', 'trios', 'teams'].forEach(function (key) {
      var el = document.getElementById('board-' + key);
      if (el && data.rankings[key]) renderBoard(el, key, data.rankings[key]);
    });
    bindBoardShare();
  }

  function fail() {
    ['individuals', 'duos', 'trios', 'teams'].forEach(function (key) {
      var el = document.getElementById('board-' + key);
      if (el) el.innerHTML = '<p class="vh-runs__err">Rankings failed to load. Check your connection and reload.</p>';
    });
  }

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.vh-runs__tab'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          t.classList.remove('is-active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('is-active');
        tab.setAttribute('aria-selected', 'true');
        var key = tab.getAttribute('data-board');
        ['individuals', 'duos', 'trios', 'teams'].forEach(function (k) {
          document.getElementById('board-' + k).classList.toggle('is-active', k === key);
        });
        var map = { individuals: 0, duos: 1, trios: 2, teams: 3 };
        if (global.history && global.history.replaceState) {
          global.history.replaceState(null, '', '#board-' + key);
        }
      });
    });
    var hash = (global.location.hash || '').replace('#board-', '');
    if (['duos', 'trios', 'teams'].indexOf(hash) >= 0) {
      var t = document.querySelector('.vh-runs__tab[data-board="' + hash + '"]');
      if (t) t.click();
    }
  }

  function init() {
    initTabs();
    fetch('assets/playoff-runs.json?v=ac8f47f4', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
