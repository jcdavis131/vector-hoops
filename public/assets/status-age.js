/* status-age.js — says so when the status snapshot is older than its builder's limit.
 *
 * scripts/build_status.py defines MAX_SNAPSHOT_AGE_HOURS = 48 and says a snapshot
 * older than that "means the pipeline stopped running, not that everything is
 * fine". The page is a static file, so the schedule sentence in its footer is
 * only claimed here, and only while the snapshot is inside that limit.
 * The age is read from the "Snapshot <ISO> UTC" note the builder writes into
 * the role=status banner. Nothing is fetched.
 */
(function () {
  'use strict';

  var LIMIT_HOURS = 48; // equals MAX_SNAPSHOT_AGE_HOURS in scripts/build_status.py (tests/status_age.test.mjs)

  // snapshot ISO string, now in ms -> null (within the limit) or a sentence.
  function ageSentence(iso, nowMs) {
    var t = typeof iso === 'string' ? Date.parse(iso.trim()) : NaN;
    if (!isFinite(t) || !isFinite(nowMs)) {
      return 'The age of this snapshot is unknown, so the figures below may be out of date.';
    }
    var hours = (nowMs - t) / 3600000;
    if (hours <= LIMIT_HOURS) return null;
    var days = (hours / 24).toFixed(1);
    return 'This snapshot is ' + days + ' days old, past the ' + LIMIT_HOURS +
      '-hour limit. The scheduled regeneration appears to have stopped, so the figures below are last known, not current.';
  }

  // The wiring, as a function of (document, nowMs) so a test can run it on a stub.
  function apply(doc, nowMs) {
    var banner = doc.querySelector('[role="status"]');
    if (!banner) return;
    var note = banner.querySelector('.st__note');
    var m = note && /Snapshot\s+(\S+)\s+UTC/.exec(note.textContent);
    var sentence = ageSentence(m ? m[1] : null, nowMs);
    if (sentence) {
      // the note's own container if there is a note, else the banner's inner div, else the banner
      var host = (note && note.parentNode) || banner.querySelector('div') || banner;
      var span = doc.createElement('span');
      span.className = 'st__note';
      span.textContent = sentence;
      host.appendChild(doc.createElement('br'));
      host.appendChild(span);
      return;
    }
    var foot = doc.querySelector('.st__foot');
    if (foot) foot.appendChild(doc.createTextNode(' The underlying checks re-run on a schedule.'));
  }

  function boot() { apply(document, Date.now()); }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ageSentence: ageSentence, apply: apply, LIMIT_HOURS: LIMIT_HOURS };
  }
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
