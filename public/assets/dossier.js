/* Vector Hoops — assets/dossier.js
 * Shared OKF dossier addressing + markdown rendering, used by the Players
 * surface (players-directory.js, player-dossier.js, players-skills.js).
 *
 * Pure functions + one fetch helper only — no DOM/modal-stack code lives
 * here. Consumers read window.VHDossier synchronously during their own
 * init, so load this script before them.
 */
(function (global) {
  'use strict';

  var GITHUB_REPO = 'jcdavis131/vector-hoops';
  var GITHUB_BRANCH = 'main';

  // Slug rule shared with pipeline/build_wiki.py (OKF page filenames):
  // accent-fold, lowercase, non-alphanumerics collapse to single hyphens.
  function playerSlug(name) {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function dossierPath(slug) {
    return 'knowledge/players/' + slug + '.md';
  }

  function dossierGithubUrl(slug) {
    return 'https://github.com/' + GITHUB_REPO + '/blob/' +
      GITHUB_BRANCH + '/knowledge/players/' + slug + '.md';
  }

  // Same-origin fetch of the raw OKF markdown; rejects on non-2xx so
  // callers can fall back to "view source on GitHub".
  function fetchDossierMarkdown(slug) {
    return fetch(dossierPath(slug)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    });
  }

  function stripFrontmatter(md) {
    if (md.slice(0, 3) === '---') {
      var end = md.indexOf('\n---', 3);
      if (end !== -1) return md.slice(end + 4).replace(/^\s+/, '');
    }
    return md;
  }

  // [[slug|Display]] -> Display ; [[slug]] -> "slug with spaces"
  function wikilinksToPlainText(md) {
    return md.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
             .replace(/\[\[([^\]]+)\]\]/g, function (m, slug) {
               return slug.replace(/-/g, ' ');
             });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mdInline(s) {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

  function mdToSimpleHtml(md) {
    var lines = md.split('\n');
    var html = '';
    lines.forEach(function (raw) {
      var line = raw.replace(/\r$/, '');
      if (/^<!--/.test(line.trim())) return; // okf:auto marker comments
      if (/^##\s+/.test(line)) {
        html += '<h4 class="vh-dossier__h4">' + mdInline(line.replace(/^##\s+/, '')) + '</h4>';
      } else if (/^#\s+/.test(line)) {
        html += '<h3 class="vh-dossier__h">' + mdInline(line.replace(/^#\s+/, '')) + '</h3>';
      } else if (/^\|\s*-+\s*\|/.test(line)) {
        // markdown table separator row — skip
      } else if (/^\|/.test(line)) {
        var cells = line.split('|').slice(1, -1).map(function (c) { return mdInline(c.trim()); });
        html += '<div class="vh-dossier__row">' + cells.join(' &middot; ') + '</div>';
      } else if (/^-\s+/.test(line)) {
        html += '<div class="vh-dossier__bullet">' + mdInline(line.replace(/^-\s+/, '')) + '</div>';
      } else if (line.trim() === '') {
        /* skip blank lines */
      } else {
        html += '<p class="vh-dossier__p">' + mdInline(line) + '</p>';
      }
    });
    return html;
  }

  function renderDossierMarkdown(raw) {
    return mdToSimpleHtml(wikilinksToPlainText(stripFrontmatter(raw)));
  }

  global.VHDossier = {
    GITHUB_REPO: GITHUB_REPO,
    GITHUB_BRANCH: GITHUB_BRANCH,
    playerSlug: playerSlug,
    dossierPath: dossierPath,
    dossierGithubUrl: dossierGithubUrl,
    fetchDossierMarkdown: fetchDossierMarkdown,
    stripFrontmatter: stripFrontmatter,
    wikilinksToPlainText: wikilinksToPlainText,
    escapeHtml: escapeHtml,
    mdInline: mdInline,
    mdToSimpleHtml: mdToSimpleHtml,
    renderDossierMarkdown: renderDossierMarkdown
  };
})(window);
