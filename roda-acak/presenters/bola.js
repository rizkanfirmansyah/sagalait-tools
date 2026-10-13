/* Penyaji bola undian (canvas). Fisika lingkaran sederhana sampai 40 bola; di atasnya (atau bila laju
   bingkai jatuh di bawah 30 fps selama 1 detik) beralih ke gerak buatan tanpa tumbukan. */
(function () {
  'use strict';
  var PHYS_MAX = 40;

  function create(container, options) {
    options = options || {};
    var canvas = document.createElement('canvas'), cap = document.createElement('p');
    canvas.className = 'ball-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Tabung bola undian');
    cap.className = 'small muted ball-note';
    container.appendChild(cap); container.appendChild(canvas);
    var items = [], balls = [], W = 320, H = 300, cx = 0, cy = 0, R = 100, rr = 10, mode = 'fisika', degraded = false;
    var raf = 0, finish = null, disposed = false, exitBall = null, fps = 60, lastNow = 0, accT = 0, accN = 0, tArt = 0;

    function geometry() {
      W = Math.round(Roda.fitSize(container, options.maxSize || 600, 0.92)); H = Math.round(W * 0.92);
      R = Math.min(W * 0.4, H * 0.4); cx = W / 2; cy = H * 0.44;
      rr = Math.max(3, Math.min(R * 0.16, R * Math.sqrt(0.42 / Math.max(1, items.length))));
    }
    function funnelY() { return cy + R + R * 0.22; }

    function setupBalls() {
      geometry();
      mode = items.length > PHYS_MAX || degraded ? 'buatan' : 'fisika';
      balls = items.map(function (it, i) {
        var a = Math.random() * Math.PI * 2, d = R * 0.75 * Math.sqrt(Math.random());
        return { i: i, x: cx + d * Math.cos(a), y: cy + d * Math.sin(a), vx: 0, vy: 0, c: i % 8,
          rho: R * (0.15 + 0.7 * Math.random()), ang: Math.random() * 6.283, w: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.6) };
      });
      exitBall = null;
      if (mode === 'fisika') { for (var s = 0; s < 120; s++) step(1 / 60, 0.2); }
      else placeArtificial(0);
    }

    function placeArtificial(t) {
      balls.forEach(function (b) {
        if (b === exitBall) return;
        var a = b.ang + b.w * t, rho = Math.min(b.rho, R - rr - 2);
        b.x = cx + rho * Math.cos(a); b.y = cy + rho * Math.sin(a);
      });
    }

    function step(dt, stir) {
      var g = R * 4.5, n = balls.length, i, j;
      for (i = 0; i < n; i++) {
        var b = balls[i];
        if (b === exitBall) continue;
        b.vy += g * dt;
        if (stir > 0 && Math.random() < stir * dt * 6) { b.vy -= R * (3 + Math.random() * 5); b.vx += (Math.random() - 0.5) * R * 6; }
        b.vx *= 0.995; b.vy *= 0.995;
        b.x += b.vx * dt; b.y += b.vy * dt;
        var dx = b.x - cx, dy = b.y - cy, d = Math.sqrt(dx * dx + dy * dy), lim = R - rr;
        if (d > lim) {
          var nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          b.x = cx + nx * lim; b.y = cy + ny * lim;
          if (vn > 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
        }
      }
      for (i = 0; i < n; i++) {
        if (balls[i] === exitBall) continue;
        for (j = i + 1; j < n; j++) {
          if (balls[j] === exitBall) continue;
          var p = balls[i], q = balls[j], ddx = q.x - p.x, ddy = q.y - p.y, dd = Math.sqrt(ddx * ddx + ddy * ddy), min = rr * 2;
          if (dd > 0 && dd < min) {
            var ux = ddx / dd, uy = ddy / dd, ov = (min - dd) / 2;
            p.x -= ux * ov; p.y -= uy * ov; q.x += ux * ov; q.y += uy * ov;
            var rv = (q.vx - p.vx) * ux + (q.vy - p.vy) * uy;
            if (rv < 0) { p.vx += rv * ux * 0.9; p.vy += rv * uy * 0.9; q.vx -= rv * ux * 0.9; q.vy -= rv * uy * 0.9; }
          }
        }
      }
    }

    function draw() {
      if (disposed) return;
      var dpr = window.devicePixelRatio || 1, c = Roda.colors();
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // corong
      var fw = Math.max(rr * 2.6, R * 0.2), fy = cy + R - 2;
      ctx.fillStyle = c.well; ctx.strokeStyle = c.lineStrong; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(cx - fw / 2, fy, fw, R * 0.32); ctx.fill(); ctx.stroke();
      // tabung
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = c.panel; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = c.lineStrong; ctx.stroke();
      balls.forEach(function (b) { if (b !== exitBall) drawBall(ctx, b, c, false); });
      if (exitBall) drawBall(ctx, exitBall, c, true);
    }

    function drawBall(ctx, b, c, hot) {
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = hot ? c.mark : c.wheel[b.c]; ctx.fill();
      ctx.lineWidth = hot ? 3 : 1.2; ctx.strokeStyle = c.ink; ctx.stroke();
      if (rr >= 8) {
        ctx.fillStyle = hot ? c.onMark : c.wheelInk; ctx.font = '700 ' + Math.max(9, rr * 0.9) + 'px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.i + 1), b.x, b.y + 1);
      }
    }

    function setItems(list) {
      items = list.slice(); cap.textContent = items.length + ' bola · bola bernomor, nama muncul saat terpilih';
      setupBalls(); draw();
    }

    function spin(winnerIndex, o) {
      o = o || {};
      if (finish) finish();
      var win = balls[winnerIndex], dur = Roda.durations[o.speed] || 4000, mixT = dur * 0.65, t0 = performance.now(), last = t0;
      var sx = 0, sy = 0, ex = cx, ey = funnelY(), exiting = false;
      exitBall = null;
      if (mode === 'buatan') { balls.forEach(function (b) { b.ang += b.w * tArt; }); tArt = 0; }
      return new Promise(function (resolve) {
        function end() {
          cancelAnimationFrame(raf); finish = null;
          exitBall = win; win.x = ex; win.y = ey; draw();
          resolve(exitBall.i);
        }
        finish = end;
        if (o.reducedMotion) { end(); return; }
        (function frame(now) {
          if (disposed) return;
          var el = now - t0, dt = Math.min(0.05, (now - last) / 1000); last = now;
          accT += dt; accN++;
          if (accT >= 1) { fps = accN / accT; accT = 0; accN = 0; if (fps < 30 && mode === 'fisika') degrade(); }
          if (!exiting && el >= mixT) { exiting = true; exitBall = win; sx = win.x; sy = win.y; }
          if (mode === 'fisika') {
            var stir = exiting ? 0.15 : Math.max(0.3, 1 - el / mixT);
            step(dt / 2, stir); step(dt / 2, stir);
            if (o.sound && o.sound.tick && Math.random() < dt * 8 && !exiting) o.sound.tick();
          } else { tArt += dt; placeArtificial(tArt); }
          if (exiting) {
            var k = Math.min(1, (el - mixT) / (dur - mixT)), e = k * k * (3 - 2 * k);
            win.x = sx + (ex - sx) * e; win.y = sy + (ey - sy) * e;
            if (k >= 1) { end(); return; }
          }
          draw();
          raf = requestAnimationFrame(frame);
        })(t0);
      });
    }

    function degrade() {
      degraded = true; mode = 'buatan';
      balls.forEach(function (b) {
        var dx = b.x - cx, dy = b.y - cy;
        b.rho = Math.sqrt(dx * dx + dy * dy); b.ang = Math.atan2(dy, dx) - b.w * tArt;
      });
    }

    canvas.addEventListener('click', function () { if (options.onActivate) options.onActivate(); });
    var onWin = function () { if (!finish) { setupBalls(); draw(); } };
    window.addEventListener('resize', onWin);
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { if (!finish) { setupBalls(); draw(); } }) : null;
    if (ro) ro.observe(container);
    var mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return {
      setItems: setItems, spin: spin, skip: function () { if (finish) finish(); },
      destroy: function () { disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', onWin); if (ro) ro.disconnect(); mo.disconnect(); canvas.remove(); cap.remove(); },
      stats: function () { return { mode: mode, fps: Math.round(fps), degraded: degraded }; }
    };
  }

  function thumb(svg, ns) {
    [[18, 20, 'tw1'], [36, 18, 'tw2'], [27, 34, 'tw3'], [44, 34, 'tw4'], [12, 38, 'tw5']].forEach(function (p) {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 8); c.setAttribute('class', p[2]); svg.appendChild(c);
    });
  }

  Roda.presenters.bola = { label: 'Bola undian', create: create, thumb: thumb };
})();
