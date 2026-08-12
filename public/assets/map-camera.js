/* One camera for every embedding map on this site.
 *
 * There are five maps here and, before this file, five different contracts. The
 * landing map could be dragged, zoomed and hovered; the Explorer's could only be
 * rotated with the arrow keys; the other three could not be touched at all. The
 * projection maths was copy-pasted between the two 3D ones and had already
 * drifted (`cy` 0.53 against 0.52), and each copy had its own hit test — the
 * landing page's compared distances in normalised -1..1 space, which squashes
 * the hit radius on a canvas twice as wide as it is tall, and the Explorer's
 * still does.
 *
 * A visitor who learns the map on one page should not have to learn it again on
 * the next. So: one projection, one keyboard contract, one set of announcements,
 * one place where a bug in any of them can be fixed.
 *
 * The contract, everywhere:
 *
 *     drag              yaw and pitch          ctrl/cmd + wheel   zoom
 *     arrows            yaw and pitch          + and -            zoom
 *     shift + arrows    coarser                0 or Home          reset
 *     Enter             pick nearest centre    Space              auto-rotation
 *     H or ?            speak the controls     hover              name a point
 *     one finger        drag sideways to turn  two fingers        pinch to zoom
 *     one finger        drag up and down to    two fingers        slide together
 *                       scroll the page                           to tilt
 *
 * A plain wheel is deliberately left alone: these canvases are 360-520px tall
 * and sit high on their pages, and a wheel that zooms instead of scrolling is a
 * trap. Zoom is reachable three other ways.
 *
 * The touch row arrived last, and until it did every one of those ways needed
 * hardware a phone does not have. Measured before it: a one-finger upward drag
 * moved pitch 0.15 and scrolled the page 105px, and a diagonal drag yawed 0.079
 * where the same drag with a mouse yaws 0.63. Under `touch-action: pan-y` the
 * page takes the vertical part of any one-finger gesture, so tilt was not
 * really reachable and the natural way to orbit a 3D scene was the one that
 * worked least. The fix is not `touch-action: none` — that traps a visitor who
 * puts a finger on a 520px canvas and cannot then scroll past it — it is to put
 * tilt and zoom on two fingers, which nothing else competes for.
 *
 * The page keeps its own draw loop and its own idea of what a point is. This
 * owns the camera and the input, and asks the page four questions:
 *
 *     size()      [W, H] in device pixels, re-read every frame
 *     points()    the array currently drawn
 *     label(d)    what to say when one is under the pointer
 *     onPick(d)   what selecting one means on this page
 *
 * Usage inside a draw loop:
 *
 *     cam.tick();                              // advance the auto-rotation
 *     var P = cam.proj(d.x, d.y, d.z);         // [px, py, depth]
 *     cam.hit(d, P[0], P[1]);                  // only for points actually drawn
 *     cam.frameEnd();                          // resolve the hover readout
 *
 * `hit` is called from the page's loop rather than re-projecting everything on
 * every pointermove: the full cloud is 12,966 points, and a hover pass of its
 * own would be a second projection of all of them sixty times a second. Done
 * this way it also cannot disagree with what was painted, because it reads the
 * same numbers.
 */
(function () {
  'use strict';

  var CAMS = [];

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function el(x) { return typeof x === 'string' ? document.getElementById(x) : (x || null); }

  var KEYS = 'ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Home Enter Space H';
  var HELP = 'Map keys: left and right arrows turn it, up and down tilt it, hold shift to ' +
             'move further. Plus and minus zoom, 0 resets the view, space starts and stops ' +
             'the automatic rotation, and Enter selects the point nearest the middle.';

  function attach(cv, o) {
    if (!cv || !o || typeof o.size !== 'function') return null;

    var cam = {
      canvas: cv,
      yaw: o.yaw || 0,
      pitch: 0,
      zoom: 1,
      spin: o.spin !== false,
      /* the auto-rotation yields to whoever is steering: off under the pointer,
         off during a drag, and off for a beat after a key, then back on. Without
         it a still cursor over a turning cloud re-picks a new nearest point
         every few frames and the readout flickers forever. */
      hoverPause: false,
      drag: null,
      moved: 0,
      userAt: -1e9,
      ptr: null,
      ptrDirty: false,
      hoverD: null
    };

    var rate = o.rate || 0.006;
    var cyFrac = typeof o.cy === 'number' ? o.cy : 0.53;
    var scFrac = typeof o.sc === 'number' ? o.sc : 0.42;
    var reach = typeof o.reach === 'number' ? o.reach : 22;
    var hoverIdle = o.hoverIdle || '';
    var oriT = 0, hb = null, hbd = 1e9;

    cam.reduce = !!(window.matchMedia &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (cam.reduce) cam.spin = false;

    function live() { return el(o.live); }
    function status() { return el(o.status); }
    function hoverEl() { return el(o.hover); }

    /* blank-then-set: selecting the same point twice is a real thing to do, and
       a live region whose text does not change announces nothing the second time */
    cam.say = function (msg) {
      var lv = live();
      if (!lv || !msg) return;
      if (lv.textContent === msg) lv.textContent = '';
      lv.textContent = msg;
    };

    /* the page's own W/H are usually script-scoped and unreachable from
       Runtime.evaluate; scripts/smoke_map.py needs them to aim a real click */
    cam.size = o.size;

    cam.deg = function () { return Math.round(((cam.yaw * 180 / Math.PI) % 360 + 360) % 360); };

    /* Rotation happens about this point. It was the origin, and the data's
       centroid is not there, so the cloud did not spin in place — it orbited.
       Measured across a full turn on a 689px canvas, the centroid's horizontal
       offset ran -1, +45, +69, +53, +2, -51, -69, -47: a 138px sinusoid, a
       fifth of the canvas, swinging side to side forever. Reading it at one
       angle just says "off centre" and misses that it is moving.

       cam.fit fills this in from the data. Zero until then, so a page that
       never fits behaves exactly as before. Hit testing calls proj too, so it
       follows automatically. */
    cam.ctr = [0, 0, 0];

    cam.proj = function (x, y, z) {
      var s = o.size(), W = s[0], H = s[1];
      x -= cam.ctr[0]; y -= cam.ctr[1]; z -= cam.ctr[2];
      var ct = Math.cos(cam.yaw), st = Math.sin(cam.yaw);
      var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      var x1 = x * ct - z * st, z1 = x * st + z * ct;
      var y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var dep = (z2 + 1) * 0.5 + 0.12;
      var sc = Math.min(W, H) * scFrac * cam.zoom;
      return [W * 0.5 + x1 * sc * dep, H * cyFrac + y1 * sc * dep * 0.86, dep];
    };

    cam.tick = function () {
      hb = null; hbd = 1e9;
      if (cam.spin && !cam.hoverPause && !cam.drag &&
          (typeof performance === 'undefined' || performance.now() - cam.userAt > 2500)) {
        cam.yaw += rate;
      }
    };

    cam.hit = function (d, px, py) {
      if (!cam.ptr) return;
      var dx = px - cam.ptr[0], dy = py - cam.ptr[1], q = dx * dx + dy * dy;
      if (q < hbd) { hbd = q; hb = d; }
    };

    cam.frameEnd = function () {
      if (!cam.ptrDirty) return;
      cam.ptrDirty = false;
      var s = o.size(), scale = Math.max(1, s[0] / Math.max(1, cv.clientWidth || s[0]));
      var lim = reach * scale;
      var near = (hb && hbd < lim * lim) ? hb : null;
      if (near === cam.hoverD) return;
      cam.hoverD = near;
      cv.classList.toggle('overdot', !!near);
      var h = hoverEl();
      if (h) h.textContent = near ? o.label(near) : hoverIdle;
      if (typeof o.onHover === 'function') o.onHover(near);
    };

    cam.showOri = function (announce) {
      var st = status();
      if (st) {
        st.textContent = 'yaw ' + cam.deg() + '° · pitch ' +
          Math.round(cam.pitch * 180 / Math.PI) + '° · zoom ' + cam.zoom.toFixed(1) + '×';
      }
      if (!announce) return;
      /* debounced: a held arrow key would otherwise queue one announcement per
         repeat, and a live region read forty times is one nobody leaves on */
      clearTimeout(oriT);
      oriT = setTimeout(function () {
        cam.say('Map turned to ' + cam.deg() + ' degrees, zoom ' + cam.zoom.toFixed(1) + ' times.');
      }, 500);
    };

    cam.setZoom = function (v, announce) {
      cam.zoom = clamp(v, 0.55, 3);
      cam.showOri(announce);
    };

    /* settable after attach: /players builds its pause button in a later script,
       so it hands the camera a repaint function then rather than looking the
       button up by an id that is not in the markup for a gate to find. */
    cam.onSpin = typeof o.onSpin === 'function' ? o.onSpin : null;
    cam.setSpin = function (on, announce) {
      cam.spin = !!on;
      if (cam.onSpin) cam.onSpin(cam.spin);
      if (announce) cam.say(cam.spin ? 'Rotation resumed.' : 'Rotation paused.');
    };

    /* Frame the data, not the cube it is drawn in.

       Measured on the landing page at zoom 1: the cloud was 170x188 inside a
       689x440 canvas — a quarter of the width, under half the height, the rest
       dark — and 140x155 of 361x360 on a phone. `proj` scales by
       min(W,H) * scFrac * zoom, so a point at the edge of the normalised cube
       lands 185px from centre on desktop, a 370px span. The cloud measures 170.
       The data does not reach the edge of the cube, so a view built around the
       cube wastes most of the frame on the control this whole site is about.

       A 97th percentile, not a max: one stray point at the corner makes a
       max-based fit no better than no fit at all.
       min() of the two axes, never max: filling the width would need 3.45x here
       and setZoom clamps at 3, and overshooting the height would push points
       off the top. The canvas is wider than the data is; that is aspect ratio,
       not something to solve by cropping. */
    cam.home = 1;
    /* `explicit` is for a map that draws one slice at a time. /trends shows a
       single season and steps through thirty, so fitting what is on screen
       would reframe the view at every step and the animation would breathe.
       It passes the union of all seasons once instead, and the framing then
       holds for the whole run. */
    cam.fit = function (frac, explicit) {
      var pts = explicit || (typeof o.points === 'function' && o.points()) || [];
      var s = o.size(), W = s[0], H = s[1];
      if (!pts.length || !W || !H) return false;
      /* The map turns. A cloud's projected extent depends on the angle you
         measure it from, so fitting to the current yaw fits one frame of a
         moving object: measured at yaw 0 the extents are rx 52.8 / ry 46.2, and
         six seconds of auto-rotation later the same cloud reads rx 70.3 / ry
         66.4. Fitting the first pair asks for k 3.85, the cloud then grows past
         the frame as it turns, and a painted-pixel check reads the clipping as
         a perfect 100% fill.

         So measure at several yaws and keep the widest. The fit then holds at
         every angle the rotation passes through rather than at the one it
         happened to start from. */
      var asc = function (a, b) { return a - b; };
      var q = function (a) { return a[Math.min(a.length - 1, Math.floor(a.length * 0.995))]; };

      /* median per axis, not mean: a handful of far points drag a mean and the
         cloud would orbit a place no player is. Set before the extents are
         measured — they are measured through proj, which reads this. */
      var cx = [], cy2 = [], cz = [];
      for (var m = 0; m < pts.length; m++) {
        var pm = pts[m];
        if (!pm || typeof pm.x !== 'number' || typeof pm.y !== 'number') continue;
        cx.push(pm.x); cy2.push(pm.y); cz.push(typeof pm.z === 'number' ? pm.z : 0);
      }
      if (cx.length >= 8) {
        cx.sort(asc); cy2.sort(asc); cz.sort(asc);
        var mid = function (a) { return a[a.length >> 1]; };
        cam.ctr = [mid(cx), mid(cy2), mid(cz)];
      }

      var yaw0 = cam.yaw, rx = 0, ry = 0, sampled = 0;
      var ANGLES = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
      for (var a = 0; a < ANGLES.length; a++) {
        cam.yaw = yaw0 + ANGLES[a];
        var xs = [], ys = [];
        for (var i = 0; i < pts.length; i++) {
          var d = pts[i];
          if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
          var P = cam.proj(d.x, d.y, d.z);
          xs.push(Math.abs(P[0] - W * 0.5));
          ys.push(Math.abs(P[1] - H * cyFrac));
        }
        if (xs.length < 8) { cam.yaw = yaw0; return false; }
        xs.sort(asc); ys.sort(asc);
        rx = Math.max(rx, q(xs)); ry = Math.max(ry, q(ys));
        sampled = xs.length;
      }
      cam.yaw = yaw0;
      if (!sampled) return false;
      if (rx < 2 && ry < 2) return false;
      /* proj scales linearly with zoom, so divide the measured extents back to
         what they would be at zoom 1 and set an absolute zoom. Multiplying the
         current zoom instead made fit() compound on itself: called twice it ran
         to the 3.0 clamp, pushed the cloud past the canvas edge, and the
         painted-pixel check read that as "100% of height" — a clipped cloud
         looks exactly like a perfectly framed one from the outside. */
      var z = cam.zoom || 1;
      var rx1 = rx / z, ry1 = ry / z;
      var want = typeof frac === 'number' ? frac : 0.92;
      var hy = H * Math.min(cyFrac, 1 - cyFrac);
      var k = Math.min(rx1 >= 1 ? (W * 0.5 * want) / rx1 : 1e9,
                       ry1 >= 1 ? (hy * want) / ry1 : 1e9);
      if (!isFinite(k) || k <= 0) return false;
      cam.lastFit = {W: W, H: H, n: sampled, rx: rx, ry: ry,
                     rx1: rx1, ry1: ry1, z: z, k: k};
      cam.setZoom(k, false);
      cam.home = cam.zoom;   /* 0 and Home return here, not to a zoom that framed nothing */
      return true;
    };

    cam.reset = function (announce) {
      cam.yaw = 0; cam.pitch = 0; cam.setZoom(cam.home || 1, false);
      if (announce) cam.say('View reset.');
      cam.showOri(false);
    };

    function devPtr(e) {
      var r = cv.getBoundingClientRect(), s = o.size();
      if (!r.width || !r.height) return null;
      return [(e.clientX - r.left) / r.width * s[0], (e.clientY - r.top) / r.height * s[1]];
    }

    cam.nearest = function (px, py) {
      var pts = o.points() || [], best = null, bd = 1e9;
      for (var i = 0; i < pts.length; i++) {
        var P = cam.proj(pts[i].x, pts[i].y, pts[i].z);
        var dx = P[0] - px, dy = P[1] - py, q = dx * dx + dy * dy;
        if (q < bd) { bd = q; best = pts[i]; }
      }
      var s = o.size(), scale = Math.max(1, s[0] / Math.max(1, cv.clientWidth || s[0]));
      var lim = (reach + 2) * scale;
      return (best && bd < lim * lim) ? best : null;
    };

    cam.pick = function (d, miss) {
      if (!d) { cam.say(miss || 'No point within reach.'); return false; }
      o.onPick(d);
      return true;
    };

    // ── pointer ────────────────────────────────────────────────────────────
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      cam.drag = [e.clientX, e.clientY]; cam.moved = 0;
      cv.classList.add('grabbing');
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener('pointermove', function (e) {
      cam.ptr = devPtr(e); cam.ptrDirty = true;
      if (!cam.drag) return;
      var dx = e.clientX - cam.drag[0], dy = e.clientY - cam.drag[1];
      cam.moved += Math.abs(dx) + Math.abs(dy);
      cam.yaw += dx * 0.007;
      cam.pitch = clamp(cam.pitch - dy * 0.005, -0.85, 0.85);
      cam.drag = [e.clientX, e.clientY];
      cam.showOri(false);
    });
    function endDrag(e) {
      if (!cam.drag) return;
      cam.drag = null; cv.classList.remove('grabbing');
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.addEventListener('pointerenter', function () { cam.hoverPause = true; });
    cv.addEventListener('pointerleave', function () {
      cam.hoverPause = false; cam.ptr = null; cam.ptrDirty = true;
    });
    cv.addEventListener('click', function (e) {
      if (cam.moved > 6) { cam.moved = 0; return; }   /* that was a rotate, not a pick */
      var p = devPtr(e);
      if (p) cam.pick(cam.nearest(p[0], p[1]), 'Nothing within reach of that point.');
    });
    cv.addEventListener('wheel', function (e) {
      /* plain wheel keeps scrolling the page. Ctrl or cmd zooms the map, and
         preventDefault there is what stops browser page-zoom firing alongside. */
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      cam.userAt = performance.now();
      cam.setZoom(cam.zoom * Math.exp(-e.deltaY * 0.0016), true);
    }, { passive: false });

    /* Two fingers pinch to zoom.
       Zoom had four ways in and not one of them worked on a phone: ctrl+wheel
       wants a wheel, plus, minus and 0 want a keyboard. A touch visitor could
       turn the map and pick a point on it and could never get closer to one,
       on the control this whole site is built around.

       Touch events rather than a second pointer. Under `touch-action: pan-y`
       the browser cancels pointers as soon as it decides a gesture is a pan, so
       a pinch assembled from pointerdown pairs loses one of them part-way
       through; touchstart still reports both. preventDefault is what stops the
       browser page-zooming on top of the map's own zoom. One finger is left
       alone so the page still scrolls past a canvas 360-520px tall. */
    var pinch = null;
    function spread(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function midY(t) { return (t[0].clientY + t[1].clientY) / 2; }
    cv.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinch = { d0: spread(e.touches), z0: cam.zoom, m0: midY(e.touches), p0: cam.pitch };
      /* the first finger had already started a rotate, and a pinch is not one.
         `moved` also keeps the click that follows from being read as a pick. */
      cam.drag = null; cam.moved = 99; cv.classList.remove('grabbing');
    }, { passive: false });
    cv.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      cam.userAt = performance.now();
      var d = spread(e.touches);
      /* below about 8px apart the ratio is noise, not a gesture */
      if (pinch.d0 > 8) cam.setZoom(pinch.z0 * (d / pinch.d0), false);
      /* Two fingers sliding up and down together tilt it. Measured before this
         existed: a one-finger upward drag moved pitch 0.15 and scrolled the page
         105px, and a diagonal one yawed 0.079 where the same drag with a mouse
         yaws 0.63 — under `touch-action: pan-y` the page takes the vertical
         part and the map gets what is left. So tilt was not really reachable by
         touch at all, and the natural way to orbit a 3D scene was the gesture
         that worked least.

         Two fingers are already ours: the preventDefault above means nothing
         competes for them. Sliding them together moves the midpoint without
         changing the distance, so tilt and zoom stay separate in one gesture,
         which is the same split Google, Apple and Mapbox use. */
      cam.pitch = clamp(pinch.p0 - (midY(e.touches) - pinch.m0) * 0.005, -0.85, 0.85);
      cam.showOri(true);
    }, { passive: false });
    function endPinch(e) {
      if (pinch && e.touches.length < 2) { pinch = null; cam.userAt = performance.now(); }
    }
    cv.addEventListener('touchend', endPinch);
    cv.addEventListener('touchcancel', endPinch);

    // ── keyboard ───────────────────────────────────────────────────────────
    if (!cv.hasAttribute('tabindex')) cv.tabIndex = 0;
    cv.setAttribute('aria-keyshortcuts', KEYS);
    cv.addEventListener('focus', function () {
      cam.say('Embedding map focused. Arrow keys turn it, plus and minus zoom, ' +
              'Enter selects. Press H for the full list.');
    });
    cv.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key, step = e.shiftKey ? 0.32 : 0.11, hit = true, steer = true;
      if (k === 'ArrowLeft') cam.yaw -= step;
      else if (k === 'ArrowRight') cam.yaw += step;
      else if (k === 'ArrowUp') cam.pitch = clamp(cam.pitch + step * 0.6, -0.85, 0.85);
      else if (k === 'ArrowDown') cam.pitch = clamp(cam.pitch - step * 0.6, -0.85, 0.85);
      else if (k === '+' || k === '=') cam.setZoom(cam.zoom * 1.2, true);
      else if (k === '-' || k === '_') cam.setZoom(cam.zoom / 1.2, true);
      else if (k === '0' || k === 'Home') { cam.reset(false); cam.say('View reset.'); }
      else if (k === ' ' || k === 'Spacebar') { steer = false; cam.setSpin(!cam.spin, true); }
      else if (k === 'Enter') {
        steer = false;
        var s = o.size();
        cam.pick(cam.nearest(s[0] * 0.5, s[1] * cyFrac), 'No point near the middle of the map.');
      } else if (k === 'h' || k === 'H' || k === '?') { steer = false; cam.say(HELP); }
      else hit = false;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      if (steer) { cam.userAt = performance.now(); cam.showOri(true); }
    });

    cam.showOri(false);
    if (cam.onSpin) cam.onSpin(cam.spin);
    CAMS.push(cam);
    return cam;
  }

  /* `cams` is how scripts/smoke_map.py reads the camera back after driving it
     with real mouse and key events. State that a test cannot read is state a
     test cannot assert on, which is how a green run comes to mean nothing. */
  window.VHMapCamera = { attach: attach, cams: CAMS, HELP: HELP };
})();
