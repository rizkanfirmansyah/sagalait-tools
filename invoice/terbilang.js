/* Logika murni Terbilang rupiah (tanpa DOM): baca angka Indonesia, ejaan baku, format Rp, batch, CSV. */
(function (root) {
  'use strict';
  var MAX_DIGITS = 15; // sampai 999.999.999.999.999 (sembilan ratus sembilan puluh sembilan triliun ...)
  var UNIT = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  var SCALES = [[1000000000000n, 'triliun'], [1000000000n, 'miliar'], [1000000n, 'juta'], [1000n, 'ribu']];

  /* ---------- baca angka ----------
     Aturan: bila ada koma, koma = desimal dan titik = ribuan; bila dua pemisah ada, yang paling akhir desimal.
     Hanya titik: banyak titik = ribuan; satu titik diikuti tepat 3 digit dan depannya tidak berawalan 0 = ribuan (12.500), selain itu desimal (12.5).
     Hanya koma: satu koma = desimal; banyak koma = ribuan. Lebih dari 2 digit desimal dibulatkan ke sen (setengah naik). */
  function split(s) {
    var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(','), dec = -1, thou = '';
    var dots = (s.match(/\./g) || []).length, coms = (s.match(/,/g) || []).length;
    if (!dots && !coms) return { int: s, frac: '' };
    if (dots && coms) { dec = Math.max(lastDot, lastCom); thou = lastDot > lastCom ? ',' : '.'; if ((s[dec] === ',' && coms > 1) || (s[dec] === '.' && dots > 1)) return null; }
    else if (coms) { if (coms > 1) thou = ','; else dec = lastCom; }
    else {
      var after = s.length - lastDot - 1, head = s.slice(0, lastDot);
      if (dots > 1) thou = '.'; else if (after === 3 && head !== '' && head[0] !== '0') thou = '.'; else dec = lastDot;
    }
    var ip = dec >= 0 ? s.slice(0, dec) : s, fr = dec >= 0 ? s.slice(dec + 1) : '';
    if (thou) {
      var g = ip.split(thou);
      if (g.some(function (x) { return !/^\d+$/.test(x); })) return null;
      if (g[0].length > 3 || g.slice(1).some(function (x) { return x.length !== 3; })) return null;
      ip = g.join('');
    }
    if ((fr !== '' && !/^\d+$/.test(fr)) || (ip !== '' && !/^\d+$/.test(ip))) return null;
    return { int: ip, frac: fr };
  }
  function parse(str) {
    var s = String(str == null ? '' : str).replace(/[\s ]/g, '').replace(/^([-−+]?)(rp\.?|idr)/i, '$1');
    if (s === '') return { ok: false, error: 'empty' };
    var neg = false;
    if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: 'nan' };
    var p = split(s);
    if (!p || (p.int === '' && p.frac === '')) return { ok: false, error: 'nan' };
    var f = p.frac, total = BigInt(p.int || '0') * 100n + BigInt((f + '00').slice(0, 2)) + (f.length > 2 && f[2] >= '5' ? 1n : 0n);
    var intPart = total / 100n, cents = Number(total % 100n);
    if (String(intPart).length > MAX_DIGITS) return { ok: false, error: 'big' };
    return { ok: true, neg: neg && (intPart > 0n || cents > 0), int: intPart, cents: cents };
  }

  /* ---------- ejaan ---------- */
  function under1000(n) {
    var out = [], h = Math.floor(n / 100), r = n % 100;
    if (h === 1) out.push('seratus'); else if (h > 1) out.push(UNIT[h] + ' ratus');
    if (r < 12) { if (r) out.push(UNIT[r]); }
    else if (r < 20) out.push(UNIT[r - 10] + ' belas');
    else { out.push(UNIT[Math.floor(r / 10)] + ' puluh'); if (r % 10) out.push(UNIT[r % 10]); }
    return out.join(' ');
  }
  function words(n) {
    n = BigInt(n);
    if (n === 0n) return 'nol';
    var parts = [];
    SCALES.forEach(function (sc) {
      var g = n / sc[0]; n = n % sc[0];
      if (g > 0n) parts.push(sc[1] === 'ribu' && g === 1n ? 'seribu' : under1000(Number(g)) + ' ' + sc[1]);
    });
    if (n > 0n) parts.push(under1000(Number(n)));
    return parts.join(' ');
  }
  function applyCase(s, mode) {
    if (mode === 'upper') return s.toUpperCase();
    if (mode === 'title') return s.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    if (mode === 'sentence') return s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }
  /* opts: { rupiah (bawaan true), sen (bawaan true), kapital: 'lower'|'sentence'|'title'|'upper' } */
  function spell(p, opts) {
    opts = opts || {};
    var rp = opts.rupiah !== false, sen = opts.sen !== false;
    var s = (p.neg ? 'minus ' : '') + words(p.int) + (rp ? ' rupiah' : '');
    if (p.cents > 0 && sen) s += ' ' + words(p.cents) + ' sen';
    return applyCase(s, opts.kapital || 'lower');
  }
  function groupInt(i) { return String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function formatRp(p) { return (p.neg ? '-' : '') + 'Rp ' + groupInt(p.int) + (p.cents ? ',' + String(p.cents).padStart(2, '0') : ''); }

  /* ---------- batch ---------- */
  function batch(text, opts) {
    return String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l !== ''; }).map(function (line) {
      var p = parse(line);
      return p.ok ? { input: line, ok: true, format: formatRp(p), words: spell(p, opts) } : { input: line, ok: false, error: p.error };
    });
  }
  function csvField(v) { v = String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCsv(rows) {
    var out = ['angka,format,terbilang'];
    rows.forEach(function (r) { out.push([r.input, r.ok ? r.format : '', r.ok ? r.words : ''].map(csvField).join(',')); });
    return out.join('\r\n') + '\r\n';
  }

  var api = { MAX_DIGITS: MAX_DIGITS, parse: parse, words: words, spell: spell, formatRp: formatRp, batch: batch, toCsv: toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Terbilang = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
