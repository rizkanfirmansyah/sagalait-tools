/* Penyaji kartu menyala (DOM). Lampu bergerak mengikuti urutan baca, melambat, lalu berhenti. */
(function () {
  'use strict';

  function create(container, options) {
    var wrap = document.createElement('div'), list = document.createElement('ul'), bar = document.createElement('div'), fill = document.createElement('div'), note = document.createElement('p');
    wrap.className = 'kartu-wrap' + (options && options.skin ? ' ' + options.skin : '') + (options && options.fill ? ' fill' : ''); list.className = 'kartu-grid'; list.setAttribute('role', 'list');
    bar.className = 'kartu-bar'; bar.setAttribute('aria-hidden', 'true'); fill.className = 'kartu-fill'; bar.appendChild(fill);
    note.className = 'small muted kartu-note';
    wrap.appendChild(list); wrap.appendChild(bar); wrap.appendChild(note); container.appendChild(wrap);
    var items = [], cards = [], raf = 0, finish = null, lamp = -1, disposed = false;

    function paint(trail) {
      cards.forEach(function (el, i) {
        el.classList.toggle('lit', i === lamp);
        el.classList.toggle('trail1', trail && i === trail[0] && i !== lamp);
        el.classList.toggle('trail2', trail && i === trail[1] && i !== lamp && i !== trail[0]);
      });
    }

    function setItems(list_) {
      items = list_.slice(); list.textContent = ''; cards = []; lamp = -1; fill.style.width = '0%'; note.textContent = '';
      items.forEach(function (it, i) {
        var li = document.createElement('li'), t = document.createElement('span'), l = document.createElement('span');
        li.className = 'kartu' + (it.done ? ' done' : '') + (it.off ? ' off' : ''); li.dataset.i = i;
        if (it.c != null) li.style.setProperty('--gc', 'var(--wheel-' + ((it.c % 8) + 1) + ')');
        if (it.title) li.title = it.title;
        t.className = 'kartu-tag';
        t.textContent = it.done ? '✓ Terpilih #' + it.done : '';
        l.className = 'kartu-label'; l.textContent = it.label;
        li.appendChild(t); li.appendChild(l); list.appendChild(li); cards.push(li);
      });
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
          lamp = elig[(s0 + L) % E]; paint(null); fill.style.width = '100%'; note.textContent = '';
          cards[lamp].classList.add('win');
          var tag = cards[lamp].querySelector('.kartu-tag'); tag.textContent = 'Terpilih';
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
            lamp = cur; paint(prev); if (o.sound && o.sound.tick) o.sound.tick();
          }
          fill.style.width = (k / L * 100).toFixed(1) + '%';
          note.textContent = k / L > 0.75 ? 'Melambat…' : 'Lampu bergerak…';
          raf = requestAnimationFrame(frame);
        })(t0);
      });
    }

    list.addEventListener('click', function () { if (options && options.onActivate) options.onActivate(); });
    return {
      setItems: setItems, spin: spin, skip: function () { if (finish) finish(); },
      destroy: function () { disposed = true; cancelAnimationFrame(raf); wrap.remove(); },
      stats: function () { return { lamp: lamp }; }
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
