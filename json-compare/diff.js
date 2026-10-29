/* Pembanding JSON: logika murni, tanpa DOM. Jalan di browser dan Node. */
(function (root) {
  'use strict';

  var KINDS = { added: 'Ditambah', removed: 'Dihapus', changed: 'Nilai berubah', type: 'Tipe beda', length: 'Panjang beda' };

  function defaults() {
    return { arrayMode: 'index', arrayKey: 'id', ignore: '', tolerance: '', trim: false, loose: false };
  }
  function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }
  var TYPE_ID = { null: 'null', array: 'array', object: 'object', string: 'string', number: 'angka', boolean: 'boolean' };

  function pathKey(p, k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? p + '.' + k : p + '[' + JSON.stringify(k) + ']'; }
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function size(v) { return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; }

  function ignoreMatcher(text) {
    var pats = String(text || '').split(/[\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean), res = [];
    pats.forEach(function (p) {
      if (/[.\[$]/.test(p)) {
        var s = p.replace(/^\$\.?/, '').replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\[\*\]/g, '\\[[^\\]]*\\]').replace(/\*/g, '[^.\\[\\]]*');
        res.push({ re: new RegExp('^' + s + '$') });
      } else res.push({ key: p });
    });
    return function (path, key) {
      var plain = path.replace(/^\$\.?/, '');
      return res.some(function (r) { return r.key !== undefined ? r.key === key : r.re.test(plain); });
    };
  }

  function compare(a, b, o) {
    o = Object.assign(defaults(), o);
    var diffs = [], equal = 0, skipped = 0, ign = ignoreMatcher(o.ignore), tol = o.tolerance === '' || o.tolerance == null ? 0 : Math.abs(Number(o.tolerance)) || 0;
    function push(path, kind, before, after, note) { diffs.push({ path: path, kind: kind, before: before, after: after, note: note || '' }); }

    function prim(x, y, path) {
      var tx = typeOf(x), ty = typeOf(y);
      if (tx === ty) {
        if (tx === 'number') {
          if (x === y || (tol && Math.abs(x - y) <= tol)) { equal++; return; }
        } else if (tx === 'string') {
          if (x === y || (o.trim && x.trim() === y.trim())) { equal++; return; }
        } else if (x === y) { equal++; return; }
        push(path, 'changed', x, y, tx === 'number' ? 'selisih ' + (y - x) : tx === 'string' ? stringNote(x, y) : '');
        return;
      }
      if (o.loose && ((tx === 'number' && ty === 'string' && String(x) === y.trim()) || (tx === 'string' && ty === 'number' && String(y) === x.trim()))) { equal++; return; }
      push(path, 'type', x, y, TYPE_ID[tx] + ' → ' + TYPE_ID[ty]);
    }
    function stringNote(x, y) {
      if (x.toLowerCase() === y.toLowerCase()) return 'hanya beda huruf besar/kecil';
      if (x.trim() === y.trim()) return 'hanya beda spasi di ujung';
      return 'panjang ' + x.length + ' → ' + y.length;
    }

    function node(x, y, path, key) {
      if (path !== '$' && ign(path, key)) { skipped++; return; }
      var tx = typeOf(x), ty = typeOf(y);
      if (tx !== ty) { prim(x, y, path); return; }
      if (tx === 'object') {
        var ks = Object.keys(x), kb = Object.keys(y), seen = {};
        ks.forEach(function (k) {
          seen[k] = 1; var p = pathKey(path, k);
          if (!Object.prototype.hasOwnProperty.call(y, k)) { if (!ign(p, k)) push(p, 'removed', x[k], undefined); else skipped++; }
          else node(x[k], y[k], p, k);
        });
        kb.forEach(function (k) { if (!seen[k]) { var p = pathKey(path, k); if (!ign(p, k)) push(p, 'added', undefined, y[k]); else skipped++; } });
      } else if (tx === 'array') arrays(x, y, path);
      else prim(x, y, path);
    }

    function arrays(x, y, path) {
      if (x.length !== y.length) push(path, 'length', x.length, y.length, (y.length > x.length ? '+' : '') + (y.length - x.length) + ' item');
      var mode = o.arrayMode;
      if (mode === 'key') {
        var k = o.arrayKey, ok = function (arr) { return arr.every(function (e) { return e && typeof e === 'object' && !Array.isArray(e) && e[k] !== undefined && e[k] !== null && typeof e[k] !== 'object'; }); };
        if (x.length && y.length && ok(x) && ok(y)) {
          var idx = {}; y.forEach(function (e, i) { var id = String(e[k]); (idx[id] = idx[id] || []).push(i); });
          var used = {};
          x.forEach(function (e, i) {
            var id = String(e[k]), list = idx[id], p = path + '[' + k + '=' + id + ']';
            if (list && list.length) { var j = list.shift(); used[j] = 1; node(e, y[j], p, null); }
            else push(p, 'removed', e, undefined);
          });
          y.forEach(function (e, j) { if (!used[j]) push(path + '[' + k + '=' + e[k] + ']', 'added', undefined, e); });
          return;
        }
        arrNote(path, 'Elemen array tidak semuanya objek dengan key "' + k + '", jadi dicocokkan berdasarkan urutan.');
      }
      if (mode === 'unordered') {
        var cnt = {}; y.forEach(function (e, j) { var c = canon(e); (cnt[c] = cnt[c] || []).push(j); });
        var usedY = {};
        x.forEach(function (e, i) { var c = canon(e), l = cnt[c]; if (l && l.length) { usedY[l.shift()] = 1; equal++; } else push(path + '[' + i + ']', 'removed', e, undefined); });
        y.forEach(function (e, j) { if (!usedY[j]) push(path + '[' + j + ']', 'added', undefined, e); });
        return;
      }
      var n = Math.min(x.length, y.length), i;
      for (i = 0; i < n; i++) node(x[i], y[i], path + '[' + i + ']', null);
      for (i = n; i < x.length; i++) push(path + '[' + i + ']', 'removed', x[i], undefined);
      for (i = n; i < y.length; i++) push(path + '[' + i + ']', 'added', undefined, y[i]);
    }
    var notes = [];
    function arrNote(p, t) { if (notes.indexOf(t) < 0) notes.push(t); }

    node(a, b, '$', null);
    var counts = { added: 0, removed: 0, changed: 0, type: 0, length: 0 };
    diffs.forEach(function (d) { counts[d.kind]++; });
    return { diffs: diffs, counts: counts, equal: equal, skipped: skipped, same: diffs.length === 0, notes: notes };
  }

  function describe(v) {
    if (v === undefined) return '';
    var t = typeOf(v);
    if (t === 'array') return 'array · ' + v.length + ' item';
    if (t === 'object') return 'object · ' + Object.keys(v).length + ' key';
    return TYPE_ID[t];
  }

  /* posisi galat JSON.parse -> {line, col, pos, msg}; mengembalikan null bila valid */
  function parse(text) {
    var t = String(text).replace(/^﻿/, '');
    if (!t.trim()) return { empty: true };
    try { return { value: JSON.parse(t), bytes: new TextEncoder().encode(t).length }; }
    catch (e) {
      var m = /position (\d+)/.exec(e.message), line = null, col = null, pos = m ? +m[1] : null;
      if (pos === null) { var lc = /line (\d+) column (\d+)/.exec(e.message); if (lc) { line = +lc[1]; col = +lc[2]; } }
      else { var before = t.slice(0, pos).split('\n'); line = before.length; col = before[before.length - 1].length + 1; }
      var hint = '';
      if (/,\s*[}\]]/.test(t)) hint = 'Ada koma sebelum } atau ]. JSON tidak mengizinkan koma di akhir.';
      else if (/'[^']*'\s*:/.test(t)) hint = 'Key memakai tanda kutip tunggal. JSON hanya menerima kutip ganda (").';
      else if (/\/\/|\/\*/.test(t)) hint = 'Ada komentar. JSON tidak mengizinkan komentar.';
      else if (/(^|[{,]\s*)[A-Za-z_]\w*\s*:/.test(t)) hint = 'Ada key tanpa tanda kutip. Key harus diapit kutip ganda.';
      return { error: e.message, line: line, col: col, hint: hint };
    }
  }

  /* angka bulat > 15 digit kehilangan ketelitian di JavaScript */
  function bigNumbers(text) { return /(?:^|[^\w."])-?\d{16,}(?=[,\s\]}]|$)/.test(String(text)); }

  var API = { KINDS: KINDS, defaults: defaults, compare: compare, parse: parse, describe: describe, typeOf: typeOf, bigNumbers: bigNumbers, canon: canon };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.JC = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
