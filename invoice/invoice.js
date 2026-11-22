/* Logika Kwitansi dan invoice: tanpa DOM. Semua uang dihitung sebagai bilangan bulat sen (BigInt), jadi tidak ada galat pecahan.
   Pembulatan selalu setengah naik menjauhi nol (0,5 sen jadi 1 sen, -0,5 sen jadi -1 sen). Terbilang memakai salinan terbilang.js di folder ini. */
(function (root) {
  'use strict';
  var T = (typeof module !== 'undefined' && module.exports) ? require('./terbilang.js') : root.Terbilang;
  var MAX_ITEMS = 50, MAX_QTY = 999999999n, MAX_RP = 999999999999999n; /* qty dalam seperseribu; batas total 15 digit rupiah (batas Terbilang) */
  var abs = function (n) { return n < 0n ? -n : n; };

  /* Bagi dengan pembulatan setengah menjauhi nol. */
  function roundDiv(n, d) { var s = n < 0n ? -1n : 1n, a = abs(n); return s * ((a * 2n + d) / (2n * d)); }
  /* Uang: kembalian { ok, sen } atau { ok: false, error }. Memakai pembaca angka Terbilang (12.500,50 / 12500.5 / Rp 1.000). */
  function parseMoney(str) {
    var p = T.parse(str); if (!p.ok) return { ok: false, error: p.error };
    var sen = p.int * 100n + BigInt(p.cents); return { ok: true, sen: p.neg ? -sen : sen };
  }
  /* Jumlah barang: angka dengan titik atau koma desimal, maksimal 3 desimal, tanpa pemisah ribuan. Kembalian dalam seperseribu. */
  function parseQty(str) {
    var s = String(str == null ? '' : str).trim();
    if (s === '') return { ok: false, error: 'empty' };
    var m = /^(\d{1,6})(?:[.,](\d{1,3}))?$/.exec(s); if (!m) return { ok: false, error: 'nan' };
    var milli = BigInt(m[1]) * 1000n + BigInt(((m[2] || '') + '000').slice(0, 3));
    return milli > MAX_QTY ? { ok: false, error: 'big' } : { ok: true, milli: milli };
  }
  /* Persen dengan maksimal 2 desimal, 0 sampai 100. Kembalian dalam basis poin (persen x 100). */
  function parseRate(str) {
    var s = String(str == null ? '' : str).trim().replace('%', '').trim();
    if (s === '') return { ok: true, bp: 0n };
    var m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(s); if (!m) return { ok: false, error: 'nan' };
    var bp = BigInt(m[1]) * 100n + BigInt(((m[2] || '') + '00').slice(0, 2));
    return bp > 10000n ? { ok: false, error: 'big' } : { ok: true, bp: bp };
  }
  /* Baris kosong = tanpa deskripsi dan tanpa harga; jumlah bawaan "1" saja tidak membuat baris dianggap terisi. */
  function isBlank(it) { return !String(it.desc || '').trim() && !String(it.price || '').trim(); }

  /* doc: { items: [{desc, qty, price}], discount: {type: 'pct'|'amt', value}, tax: {rate, mode: 'excl'|'incl'}, roundRp }
     Kembalian { errors: [{ k, i }], warnings: [kunci], lines: [{ i, sen }], subtotal, discount, base, tax, rounding, total, taxRateBp, ok }. */
  function compute(doc) {
    var errors = [], warns = [], lines = [], sub = 0n, i;
    var items = (doc.items || []).slice(0, MAX_ITEMS);
    for (i = 0; i < items.length; i++) {
      var it = items[i]; if (isBlank(it)) continue;
      var q = parseQty(it.qty), p = parseMoney(it.price);
      if (!q.ok) { errors.push({ k: 'qty', i: i }); continue; }
      if (!p.ok) { errors.push({ k: 'price', i: i }); continue; }
      var sen = roundDiv(q.milli * p.sen, 1000n);
      if (abs(sen) > MAX_RP * 100n) { errors.push({ k: 'big', i: i }); continue; }
      lines.push({ i: i, sen: sen }); sub += sen;
    }
    var d = doc.discount || { type: 'pct', value: '' }, disc = 0n, dv = String(d.value == null ? '' : d.value).trim();
    if (dv !== '') {
      if (d.type === 'amt') { var dm = parseMoney(dv); if (!dm.ok || dm.sen < 0n) errors.push({ k: 'discount' }); else disc = dm.sen; }
      else { var dr = parseRate(dv); if (!dr.ok) errors.push({ k: 'discount' }); else disc = roundDiv(sub * dr.bp, 10000n); }
    }
    var cap = sub > 0n ? sub : 0n; if (disc > cap) { disc = cap; warns.push('disc_clamped'); }
    var base = sub - disc, tx = doc.tax || { rate: '', mode: 'excl' }, rr = parseRate(tx.rate), bp = 0n;
    if (!rr.ok) errors.push({ k: 'tax' }); else bp = rr.bp;
    var tax, total0, dpp = base;
    if (tx.mode === 'incl') { dpp = roundDiv(base * 10000n, 10000n + bp); tax = base - dpp; total0 = base; }
    else { tax = roundDiv(base * bp, 10000n); total0 = base + tax; }
    var total = total0, rounding = 0n;
    if (doc.roundRp) { total = roundDiv(total0, 100n) * 100n; rounding = total - total0; }
    if (abs(total) > MAX_RP * 100n) errors.push({ k: 'total_big' });
    return { errors: errors, warnings: warns, lines: lines, subtotal: sub, discount: disc, base: dpp, tax: tax, rounding: rounding, total: total, taxRateBp: bp, ok: errors.length === 0 };
  }

  /* ---------- tampilan angka ---------- */
  function toP(sen) { var a = abs(sen); return { neg: sen < 0n, int: a / 100n, cents: Number(a % 100n) }; }
  function fmt(sen) { return T.formatRp(toP(sen)); }
  function fmtQty(milli) { var i = milli / 1000n, f = Number(milli % 1000n); return String(i).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + String(f).padStart(3, '0').replace(/0+$/, '') : ''); }
  function fmtRate(bp) { var i = bp / 100n, f = Number(bp % 100n); return String(i) + (f ? ',' + String(f).padStart(2, '0').replace(/0$/, '') : ''); }
  function words(sen) { return T.spell(toP(sen), { kapital: 'sentence' }); }

  var api = { MAX_ITEMS: MAX_ITEMS, roundDiv: roundDiv, parseMoney: parseMoney, parseQty: parseQty, parseRate: parseRate, isBlank: isBlank, compute: compute, fmt: fmt, fmtQty: fmtQty, fmtRate: fmtRate, words: words };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InvoiceLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
