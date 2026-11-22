/* Logika Pembanding teks: tanpa DOM. Algoritma Myers O(ND) tulisan sendiri, dengan tiga penghemat supaya ribuan baris tidak membeku:
   1. awalan dan akhiran yang sama dibuang dulu, 2. baris yang hanya ada di satu sisi dibuang dari pencarian (pasti tidak bisa cocok),
   3. batas selisih MAX_D: bila terlampaui, sisanya dianggap berubah semua dan hasil ditandai approx (tidak dijamin minimal). */
(function (root) {
  'use strict';
  var MAX_D = 3000, MAX_WORD_LINE = 4000;

  function splitLines(text) {
    if (text === '') return [];
    var l = text.split(/\r\n|\r|\n/);
    if (l.length && l[l.length - 1] === '' && /(\r\n|\r|\n)$/.test(text)) l.pop();
    return l;
  }
  /* Kunci pembanding: opsi abaikan spasi (rapatkan dan pangkas) dan abaikan huruf besar. */
  function keyOf(s, o) {
    if (o && o.ignoreSpace) s = s.replace(/\s+/g, ' ').trim();
    if (o && o.ignoreCase) s = s.toLowerCase();
    return s;
  }
  function intern(strs, map) { return strs.map(function (s) { var id = map.get(s); if (id === undefined) { id = map.size; map.set(s, id); } return id; }); }

  /* Myers murni pada dua larik bilangan bulat. Kembalian { matches: [[i, j], ...] menaik, approx }. */
  function myers(a, b, maxD) {
    var n = a.length, m = b.length;
    if (!n || !m) return { matches: [], approx: false };
    var limit = Math.min(n + m, maxD), off = limit + 2, v = new Int32Array(2 * limit + 5), trace = [], d, k, x, y;
    for (d = 0; d <= limit; d++) {
      trace.push(v.slice(off - d - 1, off + d + 2)); /* v sebelum putaran ke-d, diagonal -d-1 sampai d+1 */
      for (k = -d; k <= d; k += 2) {
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1]; else x = v[off + k - 1] + 1;
        y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return { matches: backtrack(trace, a, b, d), approx: false };
      }
    }
    return { matches: [], approx: true };
  }
  function backtrack(trace, a, b, dEnd) {
    var x = a.length, y = b.length, out = [], d, k, snap, prevK, prevX, prevY;
    for (d = dEnd; d >= 0; d--) {
      snap = trace[d]; k = x - y;
      var left = snap[k - 1 + d + 1], right = snap[k + 1 + d + 1];
      prevK = (k === -d || (k !== d && left < right)) ? k + 1 : k - 1;
      prevX = snap[prevK + d + 1]; prevY = prevX - prevK;
      if (d === 0) { prevX = 0; prevY = 0; }
      while (x > prevX && y > prevY) { x--; y--; out.push([x, y]); }
      if (d > 0) { x = prevX; y = prevY; }
    }
    return out.reverse();
  }
  /* Cocokkan dua larik id: buang awalan/akhiran sama dan elemen yang hanya ada di satu sisi, lalu Myers. */
  function lcs(a, b, maxD) {
    var n = a.length, m = b.length, pre = 0, suf = 0, i, j, out = [];
    while (pre < n && pre < m && a[pre] === b[pre]) pre++;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
    for (i = 0; i < pre; i++) out.push([i, i]);
    var ma = a.slice(pre, n - suf), mb = b.slice(pre, m - suf), inB = new Set(mb), inA = new Set(ma), fa = [], ia = [], fb = [], ib = [];
    for (i = 0; i < ma.length; i++) if (inB.has(ma[i])) { fa.push(ma[i]); ia.push(i + pre); }
    for (j = 0; j < mb.length; j++) if (inA.has(mb[j])) { fb.push(mb[j]); ib.push(j + pre); }
    var r = myers(fa, fb, maxD || MAX_D);
    for (i = 0; i < r.matches.length; i++) out.push([ia[r.matches[i][0]], ib[r.matches[i][1]]]);
    for (i = 0; i < suf; i++) out.push([n - suf + i, m - suf + i]);
    return { matches: out, approx: r.approx };
  }

  /* Diff baris. ops: { t: 'eq' | 'del' | 'ins' | 'mod', a, b } berurutan; 'mod' = baris hapus dan baris tambah yang dipasangkan. */
  function diffLines(aLines, bLines, o) {
    var map = new Map(), ia = intern(aLines.map(function (s) { return keyOf(s, o); }), map), ib = intern(bLines.map(function (s) { return keyOf(s, o); }), map);
    var r = lcs(ia, ib, o && o.maxD), ops = [], i = 0, j = 0, p, q;
    function gap(ei, ej) {
      var dels = ei - i, inss = ej - j, pairs = Math.min(dels, inss);
      for (p = 0; p < pairs; p++) ops.push({ t: 'mod', a: i + p, b: j + p });
      for (p = pairs; p < dels; p++) ops.push({ t: 'del', a: i + p });
      for (q = pairs; q < inss; q++) ops.push({ t: 'ins', b: j + q });
    }
    r.matches.forEach(function (mt) { gap(mt[0], mt[1]); ops.push({ t: 'eq', a: mt[0], b: mt[1] }); i = mt[0] + 1; j = mt[1] + 1; });
    gap(aLines.length, bLines.length);
    return { ops: ops, approx: r.approx };
  }
  function stats(ops) {
    var s = { added: 0, removed: 0, same: 0, changed: 0 };
    ops.forEach(function (op) { if (op.t === 'eq') s.same++; else if (op.t === 'del') s.removed++; else if (op.t === 'ins') s.added++; else { s.changed++; s.removed++; s.added++; } });
    return s;
  }

  /* Diff kata: pecah jadi kata, spasi, dan tanda baca. Kembalian { a: [{ text, ch }], b: [...], addedWords, removedWords, approx }. */
  function tokenize(s) { return s.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || []; }
  function tokKey(tk, o) { if (/^\s+$/.test(tk)) return o && o.ignoreSpace ? ' ' : tk; return o && o.ignoreCase ? tk.toLowerCase() : tk; }
  function diffWords(aText, bText, o) {
    var ta = tokenize(aText), tb = tokenize(bText), map = new Map();
    var ia = intern(ta.map(function (x) { return tokKey(x, o); }), map), ib = intern(tb.map(function (x) { return tokKey(x, o); }), map);
    var r = lcs(ia, ib, o && o.maxD), fa = new Array(ta.length).fill(true), fb = new Array(tb.length).fill(true);
    r.matches.forEach(function (mt) { fa[mt[0]] = false; fb[mt[1]] = false; });
    function seg(toks, flags) {
      var out = [];
      toks.forEach(function (tk, i) { var last = out[out.length - 1]; if (last && last.ch === flags[i]) last.text += tk; else out.push({ text: tk, ch: flags[i] }); });
      return out;
    }
    function words(toks, flags) { var c = 0; toks.forEach(function (tk, i) { if (flags[i] && !/^\s+$/.test(tk)) c++; }); return c; }
    /* Gabungan satu kolom: kata hapus, kata tambah, dan kata sama (teks sama diambil dari sisi baru) dalam urutan baca. */
    var u = [], i = 0, j = 0;
    function push(k, text) { var last = u[u.length - 1]; if (last && last.k === k) last.text += text; else u.push({ k: k, text: text }); }
    r.matches.concat([[ta.length, tb.length]]).forEach(function (mt) {
      for (; i < mt[0]; i++) push('del', ta[i]);
      for (; j < mt[1]; j++) push('ins', tb[j]);
      if (mt[0] < ta.length) { push('eq', tb[j]); i++; j++; }
    });
    return { a: seg(ta, fa), b: seg(tb, fb), u: u, removedWords: words(ta, fa), addedWords: words(tb, fb), approx: r.approx };
  }
  /* Untuk baris yang dipasangkan: baris sangat panjang tidak diurai per kata (supaya tidak membeku), seluruhnya ditandai berubah. */
  function inlineWords(aText, bText, o) {
    if (aText.length > MAX_WORD_LINE || bText.length > MAX_WORD_LINE) return { a: [{ text: aText, ch: true }], b: [{ text: bText, ch: true }], u: [{ k: 'del', text: aText }, { k: 'ins', text: bText }], addedWords: 0, removedWords: 0, approx: true };
    return diffWords(aText, bText, o);
  }

  /* Format diff terpadu (unified) dengan konteks 3 baris. Baris yang sama hanya karena opsi abaikan ditulis sebagai hapus + tambah supaya patch tetap tepat. */
  function toPatch(aLines, bLines, ops, o) {
    o = o || {}; var ctx = o.context === undefined ? 3 : o.context, rows = [];
    ops.forEach(function (op) {
      if (op.t === 'eq') { if (aLines[op.a] === bLines[op.b]) rows.push({ c: ' ', s: aLines[op.a], a: op.a, b: op.b }); else { rows.push({ c: '-', s: aLines[op.a], a: op.a }); rows.push({ c: '+', s: bLines[op.b], b: op.b }); } }
      else if (op.t === 'del') rows.push({ c: '-', s: aLines[op.a], a: op.a });
      else if (op.t === 'ins') rows.push({ c: '+', s: bLines[op.b], b: op.b });
      else { rows.push({ c: '-', s: aLines[op.a], a: op.a }); rows.push({ c: '+', s: bLines[op.b], b: op.b }); }
    });
    var chg = []; rows.forEach(function (r, i) { if (r.c !== ' ') chg.push(i); });
    if (!chg.length) return '';
    var hunks = [], cur = null;
    chg.forEach(function (i) {
      var from = Math.max(0, i - ctx), to = Math.min(rows.length - 1, i + ctx);
      if (cur && from <= cur.to + 1) cur.to = to; else { cur = { from: from, to: to }; hunks.push(cur); }
    });
    var out = ['--- ' + (o.nameA || 'a'), '+++ ' + (o.nameB || 'b')];
    hunks.forEach(function (h) {
      var sl = rows.slice(h.from, h.to + 1), ac = 0, bc = 0, aStart = null, bStart = null;
      // posisi awal: baris a/b pertama di hunk, atau posisi sesudah baris sebelumnya bila hunk tidak punya baris di sisi itu
      var ca = 0, cb = 0; rows.slice(0, h.from).forEach(function (r) { if (r.c !== '+') ca++; if (r.c !== '-') cb++; });
      sl.forEach(function (r) { if (r.c !== '+') ac++; if (r.c !== '-') bc++; });
      aStart = ac ? ca + 1 : ca; bStart = bc ? cb + 1 : cb;
      out.push('@@ -' + aStart + ',' + ac + ' +' + bStart + ',' + bc + ' @@');
      sl.forEach(function (r) { out.push(r.c + r.s); });
    });
    return out.join('\n') + '\n';
  }

  var api = { MAX_D: MAX_D, splitLines: splitLines, keyOf: keyOf, myers: myers, lcs: lcs, diffLines: diffLines, stats: stats, tokenize: tokenize, diffWords: diffWords, inlineWords: inlineWords, toPatch: toPatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DiffLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
