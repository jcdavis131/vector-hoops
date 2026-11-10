/* Vector Hoops 3D Embedding Map — guess-rings plugin (game only).
   Loaded ONLY by map-guess.html (after embed-3d.js, before map-hunt.js).
   It exists so the live / home pages never pay for it: guess rings are
   game-only, and embed-3d.js stays under the per-page JS budget without
   them. map-hunt.js attaches it with handle.attachRings(window.Embed3DRings);
   the plugin then adds overlay(rings) to the handle and wraps
   handle.snapshot() with its fields. Without the plugin there is no
   overlay() method and snapshot() carries no rings field. A mount-time
   overlay option is still honored: embed-3d.js holds it as a pending
   overlay and the plugin applies it on attach.

   Contract: rings = [{id, kind, r, color}]; [] clears. kind is
   'warm' | 'cold' | 'exact' | 'guess'; 'guess' is the neutral ring (a
   first guess, or one at the same distance): a dashed --void-ink ring.
   An unknown kind is drawn as 'guess', never as a warmer/colder claim.
   r is the ring radius in px (<= 0 falls back to 10); color overrides
   the kind color. The frame loop reads the rings through drawRings(),
   which embed-3d.js calls with its own screen coords, index, dot
   drawer, canvas context, current colours and colour resolver — so the
   rings keep tracking the ball and the current theme. */

(function (global) {

  /* ---- state (the fields that used to live on embed-3d state) ---- */
  var rings = null; /* [{id, kind, r, color}] */
  var handle = null;
  var env = null; /* {getCOL: function(){ return COL; }, resolveColor: fn} */

  /* Guess rings: [{id, kind:'warm'|'cold'|'exact'|'guess', r:px, color}]; [] clears. */
  function overlay(ringsIn) {
    rings = (ringsIn || []).filter(function (r) { return r && r.id != null; }).map(function (r) {
      var kind = r.kind === 'warm' || r.kind === 'cold' || r.kind === 'exact' || r.kind === 'guess' ? r.kind : 'guess';
      return { id: r.id, kind: kind, r: +r.r > 0 ? +r.r : 10, color: r.color || null };
    });
    if (handle && handle.renderLegend) handle.renderLegend();
  }

  function ringColor(r, COL, resolveColor) {
    if (r.color) return resolveColor(r.color, COL.css.mark);
    return r.kind === 'exact' ? COL.css.mark : r.kind === 'cold' ? COL.css.voidInk2
      : r.kind === 'guess' ? COL.css.voidInk : COL.css.terra;
  }

  /* Drawn by the frame loop (via the embed-3d.js hook) with its own
     screen coords and drawing context. c = {sx, sy, sz, idToIdx, dot,
     ctx, COL, resolveColor}. */
  function drawRings(c) {
    if (!rings || !rings.length) return;
    var ctx = c.ctx;
    ctx.lineWidth = 2;
    rings.forEach(function (r) {
      var j = c.idToIdx.get(r.id);
      if (j === undefined) return;
      var col = ringColor(r, c.COL, c.resolveColor);
      ctx.strokeStyle = col;
      var dashed = r.kind === 'guess' && typeof ctx.setLineDash === 'function';
      if (dashed) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(c.sx[j], c.sy[j], r.r * (0.6 + 0.4 * c.sz[j]), 0, 6.2832);
      ctx.stroke();
      if (dashed) ctx.setLineDash([]);
      if (r.kind === 'exact') { ctx.fillStyle = col; c.dot(c.sx[j], c.sy[j], 3 + c.sz[j] * 2.5, false); }
    });
  }

  /* A read-only view of the rings state (merged into snapshot()). */
  function snap() {
    var COL = env ? env.getCOL() : null;
    return {
      rings: (rings || []).map(function (r) {
        return { id: r.id, kind: r.kind, r: r.r, color: COL ? ringColor(r, COL, env.resolveColor) : r.color };
      })
    };
  }

  function attach(h, e) {
    handle = h;
    env = e;
    rings = [];
    h.overlay = overlay;
    var baseSnapshot = h.snapshot;
    h.snapshot = function () {
      var s = baseSnapshot();
      var os = snap();
      s.rings = os.rings;
      return s;
    };
  }

  global.Embed3DRings = {
    attach: attach,
    /* Read by the embed-3d.js hooks (rg is the attached plugin object). */
    rings: function () { return rings || []; },
    drawRings: drawRings
  };
})(typeof window !== 'undefined' ? window : this);
