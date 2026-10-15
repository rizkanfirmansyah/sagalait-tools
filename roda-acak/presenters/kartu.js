/* Penyaji kartu menyala (DOM). Kartu persegi panjang landscape; jumlah kolom, tinggi kartu, dan huruf
   dihitung dari ukuran wadah supaya seluruh kisi muat tanpa menggulir (sampai sekitar 40 kartu).
   Lebih banyak dari itu kisi menggulir dengan baris utuh, dan kartu yang menyala diikuti ke tengah. */
(function () {
  'use strict';
  var GAP = 8;

  function create(container, options) {
    options = options || {};
    var petak = options.skin === 'petak';
    var wrap = document.createElement('div'), view = document.createElement('div'), list = document.createElement('ul'), bar = document.createElement('div'), fill = document.createElement('div');
    wrap.className = 'kartu-wrap' + (petak ? ' petak' : '') + (options.fill ? ' fill' : '');
    view.className = 'kartu-view'; list.className = 'kartu-grid'; list.setAttribute('role', 'list');
    bar.className = 'kartu-bar'; bar.setAttribute('aria-hidden', 'true'); fill.className = 'kartu-fill'; bar.appendChild(fill);
    view.appendChild(list); wrap.appendChild(view); if (!petak) wrap.appendChild(bar); container.appendChild(wrap);
    var items = [], cards = [], raf = 0, finish = null, lamp = -1, disposed = false, geom = null, scrollRaf = 0;

    // pilih jumlah kolom (1..6) sehingga kartu mendekati rasio 3:1 dan tinggi 52-72px (36px di layar sempit)
    function layout() {
      if (petak || disposed) return;
      var W = Math.max(120, container.clientWidth - 12), H = (container.clientHeight || 0) - (bar.offsetHeight + 14) - 12;
      if (!options.fill && !(container.clientHeight > 0)) H = 9999;
      var n = items.length || 1, narrow = window.innerWidth < 600, minH = narrow ? 36 : 52, maxH = 72, minW = narrow ? 60 : 88, best = null;
      for (var c = 1; c <= 6; c++) {
        var rows = Math.ceil(n / c), cw = (W - (c - 1) * GAP) / c, ch = (H - (rows - 1) * GAP) / rows;
        if (cw < minW || ch < minH) continue;
        var h = Math.min(maxH, ch), score = Math.min(h, maxH) * 10 - Math.abs(cw / h - 3);
        if (!best || score > best.score) best = { cols: c, h: h, score: score, scroll: false };
      }
      if (!best) { // tidak muat: kolom sebanyak mungkin, tinggi minimum, kisi menggulir dengan baris utuh
        var cols = Math.max(1, Math.min(6, Math.floor((W + GAP) / (minW + GAP))));
        best = { cols: cols, h: minH, scroll: true };
      }
      var rowsAll = Math.ceil(n / best.cols), pitch = best.h + GAP, visRows = rowsAll;
      if (best.scroll) visRows = Math.max(1, Math.floor((H + GAP) / pitch));
      best.visRows = Math.min(visRows, rowsAll); best.pitch = pitch; best.rowsAll = rowsAll;
      geom = best;
      list.style.gridTemplateColumns = 'repeat(' + best.cols + ', minmax(0, 1fr))';
      list.style.gridAutoRows = best.h + 'px';
      list.style.gap = GAP + 'px';
      var cw2 = (W - (best.cols - 1) * GAP) / best.cols, maxLen = 4;
      items.forEach(function (it) { maxLen = Math.max(maxLen, Math.min(28, String(it.label).length)); });
      var fitPx = (cw2 - 30) / (maxLen * 0.56);
      list.style.fontSize = Math.round(Math.max(narrow ? 13 : 20, Math.min(32, best.h * 0.42, fitPx))) + 'px';
      view.style.height = best.scroll ? (best.visRows * pitch - GAP + 12) + 'px' : '';
      view.classList.toggle('scrolls', best.scroll);
    }

    function paint(trail) {
      cards.forEach(function (el, i) {
        el.classList.toggle('lit', i === lamp);
        el.classList.toggle('trail1', !!trail && i === trail[0] && i !== lamp);
        el.classList.toggle('trail2', !!trail && i === trail[1] && i !== lamp && i !== trail[0]);
      });
    }

    // gulir ke baris utuh yang menaruh kartu di tengah (hanya bila kisi menggulir)
    function follow(idx, instant) {
      if (!geom || !geom.scroll || idx < 0) return;
      var row = Math.floor(idx / geom.cols), max = (geom.rowsAll - geom.visRows) * geom.pitch;
      var target = Math.max(0, Math.min(max, Math.round(row - (geom.visRows - 1) / 2) * geom.pitch));
      cancelAnimationFrame(scrollRaf);
      if (instant || reducedMotion()) { view.scrollTop = target; return; }
      (function step() {
        var d = target - view.scrollTop;
        if (Math.abs(d) < 1) { view.scrollTop = target; return; }
        view.scrollTop += d * 0.3; scrollRaf = requestAnimationFrame(step);
      })();
    }
    function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

    function setItems(list_) {
      items = list_.slice(); list.textContent = ''; cards = []; lamp = -1; fill.style.width = '0%';
      items.forEach(function (it, i) {
        var li = document.createElement('li'), t = document.createElement('span'), l = document.createElement('span');
        li.className = 'kartu' + (it.done ? ' done' : '') + (it.off ? ' off' : ''); li.dataset.i = i;
        if (it.c != null) li.style.setProperty('--gc', 'var(--wheel-' + ((it.c % 8) + 1) + ')');
        li.title = it.title || it.label;
        t.className = 'kartu-tag'; t.textContent = it.done ? '✓ #' + it.done : '';
        l.className = 'kartu-label'; l.textContent = it.label;
        li.appendChild(t); li.appendChild(l); list.appendChild(li); cards.push(li);
      });
      layout();
      view.scrollTop = 0;
    }

    function spin(winnerIndex, o) {
      o = o || {};
      if (finish) finish();
      var elig = [], i;
      items.forEach(function (it, k) { if (!it.done && !it.off) elig.push(k); });
      var E = elig.length, posW = elig.indexOf(winnerIndex), s0 = Math.floor(Math.random() * E);
      var cycles = { cepat: 2, normal: 3, dramatis: 5 }[o.speed] || 3;
      var L = cycles * E + (((posW - s0) % E) + E) % E;
      while (L < 8) L += E;
      var dur = Roda.durations[o.speed] || 4000, w = [], sum = 0, times = [];
      for (i = 0; i <= L; i++) { w.push(1 + 8 * Math.pow(i / L, 3)); sum += w[i]; }
      var acc = 0;
      for (i = 0; i <= L; i++) { times.push(acc / sum * dur); acc += w[i]; }
      var t0 = performance.now(), k = 0, prev = [];
      return new Promise(function (resolve) {
        function end() {
          cancelAnimationFrame(raf); finish = null;
          lamp = elig[(s0 + L) % E]; paint(null); fill.style.width = '100%';
          cards[lamp].classList.add('win');
          cards[lamp].querySelector('.kartu-tag').textContent = 'Terpilih';
          follow(lamp, true);
          resolve(lamp);
        }
        finish = end;
        if (o.reducedMotion) { end(); return; }
        (function frame(now) {
          if (disposed) return;
          var el = now - t0;
          while (k < L && times[k + 1] <= el) k++;
          if (el >= dur || k >= L) { end(); return; }
          var cur = elig[(s0 + k) % E];
          if (cur !== lamp) {
            prev = [lamp, prev[0]].filter(function (x) { return x >= 0; });
            lamp = cur; paint(prev); follow(lamp, false); if (o.sound && o.sound.tick) o.sound.tick();
          }
          fill.style.width = (k / L * 100).toFixed(1) + '%';
          raf = requestAnimationFrame(frame);
        })(t0);
      });
    }

    list.addEventListener('click', function () { if (options.onActivate) options.onActivate(); });
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { layout(); }) : null;
    if (ro) ro.observe(container);
    return {
      setItems: setItems, spin: spin, skip: function () { if (finish) finish(); },
      destroy: function () { disposed = true; cancelAnimationFrame(raf); cancelAnimationFrame(scrollRaf); if (ro) ro.disconnect(); wrap.remove(); },
      stats: function () { return { lamp: lamp, geom: geom && { cols: geom.cols, h: Math.round(geom.h), scroll: geom.scroll, rows: geom.rowsAll } }; }
    };
  }

  function thumb(svg, ns) {
    [[8, 'k0'], [22, 'k1'], [36, 'k2']].forEach(function (p) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', p[0]); r.setAttribute('y', 10); r.setAttribute('width', 12); r.setAttribute('height', 36); r.setAttribute('rx', 3);
      r.setAttribute('class', 'tk ' + p[1]); svg.appendChild(r);
    });
  }

  Roda.presenters.kartu = { label: 'Kartu menyala', create: create, thumb: thumb, showsChosen: true };
})();
