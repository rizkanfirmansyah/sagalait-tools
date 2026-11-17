/* Logika murni Patungan (bagi tagihan), tanpa DOM. Semua uang dalam sen (bilangan bulat); BigInt untuk perkalian besar. */
(function (root) {
  'use strict';
  var MAX_INT_DIGITS = 13, MAX_PEOPLE = 30, MAX_QTY = 999, MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

  /* ---------- parsing angka ---------- */
  function cleanup(str) {
    return String(str == null ? '' : str).replace(/[\s ]/g, '').replace(/^(rp\.?|idr)/i, '');
  }
  /* Aturan (Indonesia): bila ada koma, koma = desimal dan titik = ribuan; bila dua pemisah ada, yang paling akhir desimal.
     Hanya titik: banyak titik = ribuan; satu titik diikuti tepat 3 digit dan bagian depan tidak berawalan 0 = ribuan (12.500), selain itu desimal (12.5, 0.75).
     Hanya koma: satu koma = desimal; banyak koma = ribuan. */
  function splitNumber(s) {
    var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(','), dec = -1, thou = '';
    var dots = (s.match(/\./g) || []).length, coms = (s.match(/,/g) || []).length;
    if (!dots && !coms) return { int: s, frac: '' };
    if (dots && coms) { dec = Math.max(lastDot, lastCom); thou = lastDot > lastCom ? ',' : '.'; if (s[dec] === ',' && coms > 1 || s[dec] === '.' && dots > 1) return null; }
    else if (coms) { if (coms > 1) thou = ','; else dec = lastCom; }
    else {
      var after = s.length - lastDot - 1, head = s.slice(0, lastDot);
      if (dots > 1) thou = '.';
      else if (after === 3 && head !== '' && head[0] !== '0') thou = '.';
      else dec = lastDot;
    }
    var intPart = dec >= 0 ? s.slice(0, dec) : s, frac = dec >= 0 ? s.slice(dec + 1) : '';
    if (thou) {
      var groups = intPart.split(thou);
      if (groups.some(function (g) { return !/^\d+$/.test(g); })) return null;
      if (groups[0].length > 3 || groups.slice(1).some(function (g) { return g.length !== 3; })) return null;
      intPart = groups.join('');
    }
    if (frac !== '' && !/^\d+$/.test(frac)) return null;
    if (intPart !== '' && !/^\d+$/.test(intPart)) return null;
    return { int: intPart, frac: frac };
  }
  function parseMoney(str) {
    var s = cleanup(str);
    if (s === '') return { ok: false, error: 'empty' };
    if (/^[-(]/.test(s)) return { ok: false, error: 'neg' };
    if (!/^[0-9.,]+$/.test(s)) return { ok: false, error: 'nan' };
    var p = splitNumber(s);
    if (!p || (p.int === '' && p.frac === '')) return { ok: false, error: 'nan' };
    var ip = p.int.replace(/^0+(?=\d)/, '') || '0';
    if (ip.length > MAX_INT_DIGITS) return { ok: false, error: 'big' };
    var f = p.frac, cents = Number((f + '00').slice(0, 2)), third = f.length > 2 ? Number(f[2]) : 0;
    var sen = Number(ip) * 100 + cents + (third >= 5 ? 1 : 0);
    return { ok: true, sen: sen };
  }
  function parsePercent(str) {
    var s = String(str == null ? '' : str).replace(/[\s%]/g, '');
    if (s === '') return { ok: false, error: 'empty' };
    if (!/^\d+([.,]\d+)?$/.test(s)) return { ok: false, error: s[0] === '-' ? 'neg' : 'nan' };
    var parts = s.split(/[.,]/), bp = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2)) + ((parts[1] || '')[2] >= '5' ? 1 : 0);
    if (bp > 10000) return { ok: false, error: 'big' };
    return { ok: true, bp: bp };
  }

  /* ---------- aritmetika ---------- */
  function big(n) { return typeof n === 'bigint' ? n : BigInt(n); }
  function divRound(a, b) { return (a * 2n + b) / (b * 2n); } // setengah naik, a >= 0
  /* Metode sisa terbesar: membagi `total` sebanding dengan `weights`; jumlah hasil persis `total`. Seri: indeks lebih awal. */
  function allocate(total, weights) {
    total = big(total); var w = weights.map(big), sum = w.reduce(function (a, b) { return a + b; }, 0n), n = w.length;
    if (!n) return [];
    if (sum === 0n) { w = w.map(function () { return 1n; }); sum = BigInt(n); }
    var out = [], rem = [], used = 0n, i;
    for (i = 0; i < n; i++) { var p = total * w[i], q = p / sum; out.push(q); rem.push({ i: i, r: p % sum }); used += q; }
    var left = Number(total - used);
    rem.sort(function (a, b) { return a.r === b.r ? a.i - b.i : (a.r > b.r ? -1 : 1); });
    for (i = 0; i < left; i++) out[rem[i].i] += 1n;
    return out;
  }
  function ceilTo(v, unit) { return unit > 0n ? ((v + unit - 1n) / unit) * unit : v; }
  function num(b) { if (b > MAX_SAFE) throw new RangeError('jumlah terlalu besar'); return Number(b); }

  /* compute: input { people, items:[{price(sen), qty, who:[idx]}], discount:{type:'none'|'amount'|'percent', value}, svcBp, taxBp, inclusive, taxBase:'subService'|'sub', rounding(rupiah: 0,100,500,1000) } */
  function compute(inp) {
    var n = inp.people;
    if (!Number.isInteger(n) || n < 1 || n > MAX_PEOPLE) throw new RangeError('jumlah orang harus 1 sampai ' + MAX_PEOPLE);
    var items = inp.items || [], ignored = [], shares = [], sub = [], i, k;
    for (i = 0; i < n; i++) { sub.push(0n); }
    items.forEach(function (it, idx) {
      if (!(it.price >= 0) || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) throw new RangeError('item ' + (idx + 1) + ' tidak valid');
      var who = (it.who || []).filter(function (x, j, a) { return Number.isInteger(x) && x >= 0 && x < n && a.indexOf(x) === j; }).sort(function (a, b) { return a - b; });
      if (!who.length) { ignored.push(idx); shares.push(null); return; }
      var line = big(it.price) * BigInt(it.qty), part = allocate(line, who.map(function () { return 1; })), row = {};
      who.forEach(function (p, j) { row[p] = part[j]; sub[p] += part[j]; });
      shares.push(row);
    });
    var SUB = sub.reduce(function (a, b) { return a + b; }, 0n);
    var dsc = inp.discount || { type: 'none' }, D = 0n;
    if (dsc.type === 'amount') D = big(Math.min(Number(dsc.value) || 0, num(SUB)));
    else if (dsc.type === 'percent') D = divRound(SUB * big(dsc.value || 0), 10000n);
    if (D > SUB) D = SUB;
    var dis = allocate(D, sub), net = sub.map(function (s, j) { return s - dis[j]; }), NET = SUB - D;
    var svc = big(inp.svcBp || 0), tax = big(inp.taxBp || 0), S, T, baseSub = inp.taxBase === 'sub';
    var sv, tx;
    if (inp.inclusive) {
      var NET0 = baseSub ? divRound(NET * 10000n, 10000n + svc + tax) : divRound(NET * 100000000n, (10000n + svc) * (10000n + tax));
      S = divRound(NET0 * svc, 10000n); T = NET - NET0 - S;
      if (T < 0n) { T = 0n; S = NET - NET0; }
      sv = allocate(S, net); tx = allocate(T, net);
    } else {
      S = divRound(NET * svc, 10000n); sv = allocate(S, net);
      var baseW = baseSub ? net : net.map(function (x, j) { return x + sv[j]; }), base = baseSub ? NET : NET + S;
      T = divRound(base * tax, 10000n); tx = allocate(T, baseW);
    }
    var total = net.map(function (x, j) { return inp.inclusive ? x : x + sv[j] + tx[j]; });
    var GRAND = inp.inclusive ? NET : NET + S + T, unit = BigInt(Math.max(0, inp.rounding || 0)) * 100n;
    var pay = total.map(function (x) { return x === 0n ? 0n : ceilTo(x, unit); }), PAY = pay.reduce(function (a, b) { return a + b; }, 0n);
    var sumTotal = total.reduce(function (a, b) { return a + b; }, 0n);
    var people = [];
    for (i = 0; i < n; i++) {
      var its = [];
      shares.forEach(function (row, idx) { if (row && row[i] !== undefined) its.push({ item: idx, share: num(row[i]) }); });
      people.push({ sub: num(sub[i]), discount: num(dis[i]), net: num(net[i]), service: num(sv[i]), tax: num(tx[i]), total: num(total[i]), pay: num(pay[i]), items: its });
    }
    return { people: people, ignored: ignored, totals: { sub: num(SUB), discount: num(D), service: num(S), tax: num(T), grand: num(GRAND), pay: num(PAY), extra: num(PAY - GRAND) }, ok: sumTotal === GRAND };
  }

  /* pembayar di kasir menalangi; tiap orang lain wajib menyetor `pay`. Mengembalikan siapa yang masih kurang dan siapa yang kelebihan. */
  function settle(pays, paid, payer) {
    var owes = [], refunds = [], short = 0, over = 0;
    pays.forEach(function (p, i) {
      if (i === payer) return;
      var d = p - (paid[i] || 0);
      if (d > 0) { owes.push({ i: i, amount: d }); short += d; } else if (d < 0) { refunds.push({ i: i, amount: -d }); over += -d; }
    });
    return { owes: owes, refunds: refunds, short: short, over: over };
  }

  function formatMoney(sen, locale) {
    var neg = sen < 0; sen = Math.abs(sen);
    var f = new Intl.NumberFormat(locale || 'id-ID', { minimumFractionDigits: sen % 100 ? 2 : 0, maximumFractionDigits: 2 });
    return (neg ? '-' : '') + 'Rp ' + f.format(sen / 100);
  }

  var api = { MAX_PEOPLE: MAX_PEOPLE, MAX_QTY: MAX_QTY, parseMoney: parseMoney, parsePercent: parsePercent, allocate: allocate, compute: compute, settle: settle, formatMoney: formatMoney };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Bagi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
