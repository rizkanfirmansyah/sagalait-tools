/* Roda acak: logika murni (tanpa DOM saat dimuat). Jalan di browser dan Node. */
(function (root) {
  'use strict';
  var Roda = root.Roda = root.Roda || {};
  var MAX_ITEMS = 200;

  // ---------- sumber acak ----------
  function cryptoSource() {
    var c = root.crypto && root.crypto.getRandomValues ? root.crypto : require('node:crypto').webcrypto;
    var buf = new Uint32Array(1);
    return { seeded: false, u32: function () { c.getRandomValues(buf); return buf[0]; } };
  }

  function hashSeed(str) { // cyrb128
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762, i, k;
    for (i = 0; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  function seededSource(seed) { // xoshiro128**
    var s = hashSeed(String(seed));
    function rotl(x, k) { return (x << k) | (x >>> (32 - k)); }
    return {
      seeded: true,
      u32: function () {
        var r = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0, t = s[1] << 9;
        s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
        return r;
      }
    };
  }

  // bilangan bulat 0..n-1 tanpa bias modulo (rejection sampling)
  function randInt(src, n) {
    if (n <= 1) return 0;
    var limit = Math.floor(4294967296 / n) * n, v;
    do { v = src.u32(); } while (v >= limit);
    return v % n;
  }

  function pickWeighted(src, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var r = randInt(src, total);
    for (i = 0; i < weights.length; i++) { if (r < weights[i]) return i; r -= weights[i]; }
    return weights.length - 1;
  }

  // ---------- parsing ----------
  function clampW(n) { return Math.max(1, Math.min(100, n | 0)); }
  function key(label) { return label.toLowerCase(); }

  function parseLine(t) {
    var m = /^(.*\S)\s+x(\d{1,4})$/i.exec(t);
    return m ? { label: m[1], weight: clampW(parseInt(m[2], 10)) } : { label: t, weight: 1 };
  }

  function parseList(text) {
    var lines = String(text).split(/\r\n|\r|\n/), items = [], seen = {}, dups = [], over = false, n = 0;
    lines.forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      if (items.length >= MAX_ITEMS) { over = true; return; }
      var p = parseLine(t);
      items.push({ id: 'i' + (++n), label: p.label, weight: p.weight });
      var k = key(p.label);
      if (seen[k] === 1) dups.push(p.label);
      seen[k] = (seen[k] || 0) + 1;
    });
    return { items: items, duplicates: dups, over: over };
  }

  function dedupe(items) {
    var seen = {};
    return items.filter(function (it) { var k = key(it.label); if (seen[k]) return false; seen[k] = 1; return true; });
  }

  // daftar peserta dengan pot: baris "# Nama pot" memulai pot baru
  function parsePots(text) {
    var pots = [], cur = null, n = 0, over = false, total = 0;
    String(text).split(/\r\n|\r|\n/).forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      if (t.charAt(0) === '#') { cur = { name: t.replace(/^#+\s*/, '') || 'Pot ' + (pots.length + 1), items: [] }; pots.push(cur); return; }
      if (total >= MAX_ITEMS) { over = true; return; }
      if (!cur) { cur = { name: 'Pot 1', items: [] }; pots.push(cur); }
      cur.items.push({ id: 'p' + (++n), label: parseLine(t).label, weight: 1 });
      total++;
    });
    return { pots: pots.filter(function (p) { return p.items.length; }), over: over };
  }

  // ---------- sesi pilih satu / berurutan ----------
  function Session(items, src) {
    this.all = items.slice();
    this.remaining = items.slice();
    this.results = []; // { item, removed }
    this.src = src;
  }
  Session.prototype.pick = function () {
    if (!this.remaining.length) return null;
    var idx = pickWeighted(this.src, this.remaining.map(function (i) { return i.weight; }));
    return { item: this.remaining[idx], index: idx };
  };
  Session.prototype.commit = function (p, remove) {
    this.results.push({ item: p.item, removed: !!remove });
    if (remove) this.remaining = this.remaining.filter(function (i) { return i.id !== p.item.id; });
  };
  Session.prototype.draw = function (remove) {
    var p = this.pick();
    if (p) this.commit(p, remove);
    return p;
  };
  Session.prototype.undo = function () {
    var r = this.results.pop();
    if (!r) return null;
    if (r.removed) {
      var keep = {};
      this.remaining.forEach(function (i) { keep[i.id] = 1; });
      keep[r.item.id] = 1;
      this.remaining = this.all.filter(function (i) { return keep[i.id]; });
    }
    return r.item;
  };
  Session.prototype.reset = function () { this.remaining = this.all.slice(); this.results = []; };
  Session.prototype.toJSON = function () {
    return { all: this.all, remaining: this.remaining.map(function (i) { return i.id; }),
      results: this.results.map(function (r) { return { id: r.item.id, removed: r.removed }; }) };
  };
  Session.fromJSON = function (o, src) {
    var s = new Session(o.all, src), by = {};
    o.all.forEach(function (i) { by[i.id] = i; });
    s.remaining = o.remaining.filter(function (id) { return by[id]; }).map(function (id) { return by[id]; });
    s.results = o.results.filter(function (r) { return by[r.id]; }).map(function (r) { return { item: by[r.id], removed: r.removed }; });
    return s;
  };

  // ---------- undian grup ----------
  // Seluruh undian dihitung di muka; UI hanya menyingkapnya langkah demi langkah.
  function groupPlan(pots, o, src) {
    var G = o.G, N = 0, p, g;
    pots.forEach(function (x) { N += x.items.length; });
    if (G < 2 || G > 16) throw new Error('Jumlah grup harus 2 sampai 16.');
    if (N < G) throw new Error('Peserta (' + N + ') lebih sedikit dari jumlah grup (' + G + ').');
    var base = Math.floor(N / G), extra = N % G, caps = [], groups = [], potCount = [];
    for (g = 0; g < G; g++) {
      caps.push(base + (g < extra ? 1 : 0));
      groups.push({ name: (o.names && o.names[g]) || 'Grup ' + String.fromCharCode(65 + g), members: [] });
      potCount.push(pots.map(function () { return 0; }));
    }
    var rem = pots.map(function (x) { return x.items.slice(); });
    var aligned = pots.length > 1 && pots.every(function (x) { return x.items.length === G; });
    var steps = [], cursor = 0, fill = o.fill || 'bergilir';

    function room(gi) { return groups[gi].members.length < caps[gi]; }
    function drawPerson(pi) {
      var arr = rem[pi], idx = randInt(src, arr.length), cand = arr.map(function (i) { return i.id; });
      return { person: arr.splice(idx, 1)[0], idx: idx, cand: cand };
    }
    function record(pi, d, gi, gcand) {
      groups[gi].members.push({ id: d.person.id, label: d.person.label, pot: pots[pi].name });
      potCount[gi][pi]++;
      steps.push({ potIndex: pi, potName: pots[pi].name, candidates: d.cand, winnerIndex: d.idx,
        person: d.person, groupIndex: gi, groupCandidates: gcand || null });
    }

    if (fill === 'penuh' && aligned) {
      // grup diisi penuh satu per satu, tiap slot dari pot berbeda
      for (g = 0; g < G; g++) for (p = 0; p < pots.length; p++) record(p, drawPerson(p), g);
    } else {
      for (p = 0; p < pots.length; p++) {
        for (var k = pots[p].items.length; k > 0; k--) {
          var d = drawPerson(p), gi = -1, gcand = null, j;
          if (fill === 'bergilir') {
            for (j = 0; j < G; j++) { var c = (cursor + j) % G; if (room(c)) { gi = c; break; } }
            cursor = gi + 1;
          } else if (fill === 'penuh') {
            for (j = 0; j < G; j++) if (room(j)) { gi = j; break; }
          } else { // diundi: grup tujuan ikut diundi
            var open = [], min = Infinity;
            for (j = 0; j < G; j++) if (room(j)) { open.push(j); if (potCount[j][p] < min) min = potCount[j][p]; }
            gcand = open.filter(function (x) { return potCount[x][p] === min; });
            gi = gcand[randInt(src, gcand.length)];
          }
          record(p, d, gi, gcand);
        }
      }
    }

    var warnings = [];
    if (pots.length > 1 && !aligned) warnings.push('Ukuran pot tidak sama dengan jumlah grup (' + G + '): aturan satu peserta per pot per grup tidak berlaku, sisanya dibagi ke grup yang masih punya tempat.');
    if (extra) warnings.push('Peserta ' + N + ' tidak habis dibagi ' + G + ' grup: ukuran grup berbeda satu.');
    return { groups: groups, steps: steps, caps: caps, warnings: warnings, aligned: aligned, fill: fill };
  }

  function formatGroups(plan) {
    return plan.groups.map(function (g) {
      return g.name + '\n' + g.members.map(function (m, i) { return (i + 1) + '. ' + m.label; }).join('\n');
    }).join('\n\n');
  }
  function formatResults(session) {
    return session.results.map(function (r, i) { return (i + 1) + '. ' + r.item.label; }).join('\n');
  }

  // ---------- warna kanvas dari token CSS (hanya dipanggil di browser) ----------
  function colors() {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    var wheel = [];
    for (var i = 1; i <= 8; i++) wheel.push(v('--wheel-' + i));
    return { wheel: wheel, wheelInk: v('--wheel-ink'), onMark: v('--wheel-on-mark'), panel: v('--panel'), line: v('--line'),
      lineStrong: v('--line-strong'), ink: v('--ink'), muted: v('--muted'), mark: v('--mark'), accent: v('--accent'),
      ok: v('--ok'), okT: v('--ok-t'), body: v('--body'), well: v('--well'), bg: v('--bg') };
  }

  // lebar kanvas: mengikuti wadah, dibatasi maxSize, dan di layar penuh dibatasi tinggi layar (rasio = tinggi/lebar)
  function fitSize(container, maxSize, ratio) {
    var w = container.clientWidth || 320, cap = maxSize;
    if (document.body.classList.contains('fs')) cap = Math.min(cap, (window.innerHeight - 160) / (ratio || 1));
    return Math.max(180, Math.min(w, cap));
  }

  var DURATIONS = { cepat: 1500, normal: 4000, dramatis: 7000 };

  Roda.engine = { MAX_ITEMS: MAX_ITEMS, cryptoSource: cryptoSource, seededSource: seededSource, randInt: randInt,
    pickWeighted: pickWeighted, parseList: parseList, dedupe: dedupe, parsePots: parsePots, Session: Session,
    groupPlan: groupPlan, formatGroups: formatGroups, formatResults: formatResults };
  Roda.colors = colors;
  Roda.fitSize = fitSize;
  Roda.durations = DURATIONS;
  Roda.presenters = Roda.presenters || {};
  if (typeof module !== 'undefined' && module.exports) module.exports = Roda;
})(typeof globalThis !== 'undefined' ? globalThis : this);
