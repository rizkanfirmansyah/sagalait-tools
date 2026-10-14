/* Penyaji roda (canvas). Irisan sebanding dengan bobot; hasil dibaca dari sudut akhir. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;

  function create(container, options) {
    options = options || {};
    var canvas = document.createElement('canvas');
    canvas.className = 'wheel-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Roda pilihan');
    if (options.fill) container.style.position = 'relative';
    container.appendChild(canvas);
    var items = [], bounds = [], colorIdx = [], theta = 0, highlight = -1, raf = 0, finish = null, disposed = false;

    function layout() {
      var total = 0, acc = 0, i;
      items.forEach(function (it) { total += it.weight || 1; });
      bounds = [];
      for (i = 0; i < items.length; i++) { var w = (items[i].weight || 1) / total * TAU; bounds.push([acc, acc + w]); acc += w; }
      colorIdx = items.map(function (_, k) { return k % 8; });
      var n = items.length;
      if (n > 1 && colorIdx[n - 1] === colorIdx[0]) colorIdx[n - 1] = [1, 2, 3, 4, 5, 6, 7].filter(function (c) { return c !== colorIdx[n - 2]; })[3 % 6];
    }

    function indexAt(th) {
      var phi = (((-th) % TAU) + TAU) % TAU;
      for (var i = 0; i < bounds.length; i++) if (phi >= bounds[i][0] && phi < bounds[i][1]) return i;
      return bounds.length - 1;
    }

    function fit(ctx, text, maxW) {
      if (ctx.measureText(text).width <= maxW) return text;
      while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
      return text + '…';
    }

    function draw() {
      if (disposed) return;
      var size = options.fill ? Math.max(160, Math.min(container.clientWidth || 320, container.clientHeight || 320, options.maxSize || 900)) : Roda.fitSize(container, options.maxSize || 560), dpr = window.devicePixelRatio || 1, c = Roda.colors();
      if (canvas.width !== Math.round(size * dpr) || canvas.height !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
      canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      if (options.fill) { canvas.style.position = 'absolute'; canvas.style.left = Math.max(0, ((container.clientWidth || size) - size) / 2) + 'px'; canvas.style.top = Math.max(0, ((container.clientHeight || size) - size) / 2) + 'px'; }
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      var cx = size / 2, cy = size / 2 + 8, R = size / 2 - 18, n = items.length, i;
      if (!n) { ctx.fillStyle = c.muted; ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Daftar kosong', cx, cy); return; }
      for (i = 0; i < n; i++) {
        var a0 = -Math.PI / 2 + theta + bounds[i][0], a1 = -Math.PI / 2 + theta + bounds[i][1];
        var win = i === highlight;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
        ctx.globalAlpha = highlight >= 0 && !win ? 0.35 : 1;
        ctx.fillStyle = win ? c.mark : c.wheel[colorIdx[i]];
        ctx.fill();
        ctx.globalAlpha = 1;
        if (n > 1) { ctx.lineWidth = 1.5; ctx.strokeStyle = c.panel; ctx.stroke(); }
        if (n <= 40) {
          var span = bounds[i][1] - bounds[i][0], fs = Math.min(18, span * R * 0.5);
          if (fs >= 9) {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 2 + theta + (bounds[i][0] + bounds[i][1]) / 2);
            ctx.font = '600 ' + fs + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            ctx.fillStyle = win ? c.onMark : c.wheelInk;
            ctx.globalAlpha = highlight >= 0 && !win ? 0.5 : 1;
            ctx.fillText(fit(ctx, items[i].label, R * 0.66), R - 12, 0);
            ctx.restore();
          }
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = c.ink; ctx.stroke();
      // hub
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(26, R * 0.14), 0, TAU); ctx.fillStyle = c.panel; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.ink; ctx.stroke();
      ctx.fillStyle = c.ink; ctx.font = '700 ' + Math.max(11, R * 0.065) + 'px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(options.hubLabel || 'Putar', cx, cy);
      // penunjuk tetap di atas
      ctx.beginPath(); ctx.moveTo(cx - 13, cy - R - 14); ctx.lineTo(cx + 13, cy - R - 14); ctx.lineTo(cx, cy - R + 8); ctx.closePath();
      ctx.fillStyle = c.accent; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c.panel; ctx.stroke();
    }

    function setItems(list) { items = list.slice(); highlight = -1; layout(); draw(); }

    function spin(winnerIndex, o) {
      o = o || {};
      if (finish) finish(true);
      highlight = -1;
      var b = bounds[winnerIndex], phi = b[0] + (b[1] - b[0]) * (0.2 + 0.6 * Math.random());
      var turns = { cepat: 3, normal: 5, dramatis: 8 }[o.speed] || 5, th0 = theta;
      var thF = -phi + TAU * Math.ceil((th0 + TAU * turns + phi) / TAU);
      var dur = Roda.durations[o.speed] || 4000, t0 = performance.now(), lastIdx = indexAt(th0);
      return new Promise(function (resolve) {
        function end(skipped) {
          cancelAnimationFrame(raf); finish = null; theta = thF;
          var landed = indexAt(theta); highlight = landed; draw(); resolve(landed);
        }
        finish = end;
        if (o.reducedMotion) { end(true); return; }
        (function frame(now) {
          if (disposed) return;
          var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 4);
          theta = th0 + (thF - th0) * e;
          var idx = indexAt(theta);
          if (idx !== lastIdx) { lastIdx = idx; if (o.sound && o.sound.tick) o.sound.tick(); }
          draw();
          if (t >= 1) end(false); else raf = requestAnimationFrame(frame);
        })(t0);
      });
    }

    canvas.addEventListener('click', function () { if (options.onActivate) options.onActivate(); });
    window.addEventListener('resize', draw);
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    if (ro) ro.observe(container);
    var mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return {
      setItems: setItems, spin: spin, skip: function () { if (finish) finish(true); },
      destroy: function () { disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', draw); if (ro) ro.disconnect(); mo.disconnect(); canvas.remove(); },
      stats: function () { return { theta: theta, highlight: highlight }; }
    };
  }

  function thumb(svg, ns) {
    var cx = 28, cy = 28, r = 22, n = 6;
    for (var i = 0; i < n; i++) {
      var a0 = i / n * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / n * Math.PI * 2 - Math.PI / 2;
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M' + cx + ' ' + cy + ' L' + (cx + r * Math.cos(a0)).toFixed(1) + ' ' + (cy + r * Math.sin(a0)).toFixed(1) +
        ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r * Math.cos(a1)).toFixed(1) + ' ' + (cy + r * Math.sin(a1)).toFixed(1) + ' Z');
      p.setAttribute('class', 'tw' + (i + 1));
      svg.appendChild(p);
    }
  }

  Roda.presenters.roda = { label: 'Roda', create: create, thumb: thumb };
})();
