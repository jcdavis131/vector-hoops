/* Vector Hoops 3D Embedding Map — concept overlay plugin (home only).
   Loaded ONLY by index.html (after embed-3d.js, before atlas-3d.js).
   It exists so the live / game / map pages never pay for it: the overlay
   (per-point concept colors, the direction arrow, the home-note override)
   is home-only, and embed-3d.js stays under the per-page JS budget without
   it. atlas-3d.js attaches it with handle.attachOverlay(window.Embed3DOverlay);
   the plugin then adds setValueColors / setArrow / setHomeNote to the handle
   and wraps handle.snapshot() with its fields. Without the plugin those
   handle methods do not exist and snapshot() carries no overlay fields.

   One mount per page in practice (index.html); attach() resets the state,
   so a second mount starts clean rather than inheriting the first one's
   colors. The frame loop reads the state through valueColors() / note() /
   drawArrow() — embed-3d.js calls those hooks only when attached.

   Contract: values = Array(n) of predicted z-scores, in point order;
   palette = CSS colors, low→high. Values clip to [-2.5, 2.5] and bin
   across the palette; bins are precomputed once, so the frame loop stays
   a lookup. null clears. Groups still win over value colors; depth alpha
   and selection dimming still apply. The arrow is a direction through the
   cloud center in the current projection's 3D coordinates; it rotates
   with the ball. setHomeNote replaces the home note; null restores the
   default. (The default "Color appears only on your selection and its
   twins" is false while the dots carry concept colors.) */

(function (global) {

  /* ---- state (the fields that used to live on embed-3d state) ---- */
  var valueColors = null; /* {bins: Uint8Array, palette: [css]} */
  var arrow = null; /* {x, y, z} unit vector in projection coords */
  var homeNote = null; /* string | null: home note override */
  var handle = null;

  /* Continuous per-point colors. values.length is the point count: the
     only caller (atlas-3d.js, after the data has loaded) passes Array(n),
     so values.length equals the renderer's n. */
  function setValueColors(values, palette) {
    if (values == null || palette == null || !palette.length) { valueColors = null; return; }
    var n = values.length;
    var bins = new Uint8Array(n), nb = palette.length;
    for (var i = 0; i < n; i++) {
      var v = +values[i];
      if (v !== v) v = 0; /* NaN -> mid */
      if (v < -2.5) v = -2.5; if (v > 2.5) v = 2.5;
      bins[i] = Math.round((v + 2.5) / 5 * (nb - 1));
    }
    valueColors = { bins: bins, palette: palette.slice() };
  }

  /* Direction arrow through the cloud center, in the current projection's
     3D coordinates. The caller passes a unit-ish vector; it is normalized
     here. null clears. */
  function setArrow(vec) {
    if (vec == null) { arrow = null; return; }
    var x = +vec.x || 0, y = +vec.y || 0, z = +vec.z || 0;
    var m = Math.sqrt(x * x + y * y + z * z);
    if (!(m > 0)) { arrow = null; return; }
    arrow = { x: x / m, y: y / m, z: z / m };
  }

  /* Home note override (concept mode); null restores the default. */
  function setHomeNote(text) {
    homeNote = text == null ? null : String(text);
    if (handle && handle.renderNote) handle.renderNote();
  }

  /* The frame loop calls this with its own project3 / ctx / COL, so the
     arrow keeps rotating with the ball. Concept direction arrow, skipped
     edge-on. */
  function drawArrow(project3, ctx, COL) {
    var a = arrow;
    if (!a) return;
    /* Through the cloud center, near the edge both ways; the cloud is
       unit-max-radius normalized, so 0.9 reaches the rim. */
    var p0 = project3(-a.x * 0.9, -a.y * 0.9, -a.z * 0.9);
    var p1 = project3(a.x * 0.9, a.y * 0.9, a.z * 0.9);
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var len = Math.hypot(dx, dy);
    if (len < 14) return; /* edge-on to the viewer: a dot would mislead */
    var ux = dx / len, uy = dy / len;
    ctx.strokeStyle = COL.css.mark;
    ctx.fillStyle = COL.css.mark;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();
    /* arrowhead at the + end */
    var hs = 10, ang = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p1[0] - hs * Math.cos(ang - 0.42), p1[1] - hs * Math.sin(ang - 0.42));
    ctx.lineTo(p1[0] - hs * Math.cos(ang + 0.42), p1[1] - hs * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* A read-only view of the overlay state (merged into snapshot()). */
  function snap() {
    return {
      valueColors: valueColors ? { bins: valueColors.palette.length } : null,
      arrow: arrow ? { x: arrow.x, y: arrow.y, z: arrow.z } : null,
      homeNote: homeNote
    };
  }

  function attach(h) {
    handle = h;
    valueColors = null;
    arrow = null;
    homeNote = null;
    h.setValueColors = setValueColors;
    h.setArrow = setArrow;
    h.setHomeNote = setHomeNote;
    var baseSnapshot = h.snapshot;
    h.snapshot = function () {
      var s = baseSnapshot();
      var os = snap();
      s.valueColors = os.valueColors;
      s.arrow = os.arrow;
      s.homeNote = os.homeNote;
      return s;
    };
  }

  global.Embed3DOverlay = {
    attach: attach,
    /* Read by the embed-3d.js hooks (ov is the attached plugin object). */
    valueColors: function () { return valueColors; },
    note: function () { return homeNote; },
    drawArrow: drawArrow
  };
})(typeof window !== 'undefined' ? window : this);
