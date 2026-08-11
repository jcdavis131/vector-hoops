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
 *     two fingers       pinch to zoom          one finger         scroll the page
 *
 * A plain wheel is deliberately left alone: these canvases are 360-520px tall
 * and sit high on their pages, and a wheel that zooms instead of scrolling is a
 * trap. Zoom is reachable three other ways.
 *
 * Pinch was the last of them to arrive, and until it did every one of those
 * three needed hardware a phone does not have — a wheel or a keyboard. Touch
 * visitors could turn the map and pick points on it and could never get closer
 * to one.
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

    cam.proj = function (x, y, z) {
      var s = o.size(), W = s[0], H = s[1];
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

    cam.reset = function (announce) {
      cam.yaw = 0; cam.pitch = 0; cam.setZoom(1, false);
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
    cv.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      pinch = { d0: spread(e.touches), z0: cam.zoom };
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
      if (pinch.d0 > 8) cam.setZoom(pinch.z0 * (d / pinch.d0), true);
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
