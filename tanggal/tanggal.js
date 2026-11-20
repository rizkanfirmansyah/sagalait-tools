/* Logika murni Kalkulator tanggal: selisih, tambah/kurang, hari kerja, umur, kalender. Tanpa DOM, tanpa zona waktu
   (tanggal diperlakukan sebagai hari kalender murni, dihitung lewat nomor hari UTC). */
(function (root) {
  'use strict';
  var DAY = 86400000;

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function valid(y, m, d) { return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) && y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m); }
  function mk(y, m, d) { return { y: y, m: m, d: d }; }
  /* nomor hari sejak 1970-01-01 (boleh negatif) */
  function toDay(t) { var x = new Date(0); x.setUTCFullYear(t.y, t.m - 1, t.d); return Math.round(x.getTime() / DAY); }
  function fromDay(n) { var x = new Date(n * DAY); return mk(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function iso(t) { return pad(t.y, 4) + '-' + pad(t.m, 2) + '-' + pad(t.d, 2); }

  /* ISO 8601 (YYYY-MM-DD), atau dd/mm/yyyy dan dd-mm-yyyy; mengembalikan null bila tidak sah */
  function parse(s) {
    s = String(s == null ? '' : s).trim(); var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return valid(+m[1], +m[2], +m[3]) ? mk(+m[1], +m[2], +m[3]) : null;
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s))) return valid(+m[3], +m[2], +m[1]) ? mk(+m[3], +m[2], +m[1]) : null;
    return null;
  }
  function cmp(a, b) { return toDay(a) - toDay(b); }

  function addDays(t, n) { return fromDay(toDay(t) + n); }
  /* tambah bulan; bila hari tujuan tidak ada, mundur ke hari terakhir bulan itu (31 Jan + 1 bulan = 28/29 Feb) */
  function addMonths(t, n) {
    var idx = t.y * 12 + (t.m - 1) + n, y = Math.floor(idx / 12), m = idx - y * 12 + 1;
    if (y < 1 || y > 9999) throw new RangeError('tahun di luar 1 sampai 9999');
    return mk(y, m, Math.min(t.d, daysInMonth(y, m)));
  }
  function addYears(t, n) { return addMonths(t, n * 12); }
  /* tahun dan bulan dulu, lalu minggu dan hari; sign +1 atau -1 */
  function add(t, p, sign) {
    sign = sign < 0 ? -1 : 1; p = p || {};
    var r = addMonths(t, sign * ((p.years || 0) * 12 + (p.months || 0)));
    return addDays(r, sign * ((p.weeks || 0) * 7 + (p.days || 0)));
  }

  /* selisih dua tanggal: sign -1 bila a lebih akhir dari b. Bulan penuh = bulan terbesar m dengan addMonths(awal, m) <= akhir. */
  function diff(a, b) {
    var sign = cmp(a, b) > 0 ? -1 : 1, from = sign > 0 ? a : b, to = sign > 0 ? b : a, total = toDay(to) - toDay(from);
    var m = (to.y - from.y) * 12 + (to.m - from.m);
    while (m > 0 && cmp(addMonths(from, m), to) > 0) m--;
    var rest = toDay(to) - toDay(addMonths(from, m));
    return { sign: sign, from: from, to: to, totalDays: total, weeks: Math.floor(total / 7), remDays: total % 7, years: Math.floor(m / 12), months: m % 12, days: rest, totalMonths: m };
  }

  /* ---------- kalender ---------- */
  function weekday(t) { return ((toDay(t) % 7) + 11) % 7; } /* 0 = Minggu; 1970-01-01 = Kamis (4) */
  function dayOfYear(t) { return toDay(t) - toDay(mk(t.y, 1, 1)) + 1; }
  /* minggu ISO 8601: minggu 1 memuat Kamis pertama tahun itu */
  function isoWeek(t) {
    var dn = toDay(t), wd = (weekday(t) + 6) % 7, thu = dn - wd + 3, ty = fromDay(thu).y;
    return { year: ty, week: Math.floor((thu - toDay(mk(ty, 1, 1))) / 7) + 1 };
  }
  function weeksInIsoYear(y) { return isoWeek(mk(y, 12, 28)).week; }
  function info(t) {
    var w = isoWeek(t);
    return { weekday: weekday(t), dayOfYear: dayOfYear(t), daysInYear: isLeap(t.y) ? 366 : 365, isoWeek: w.week, isoYear: w.year, quarter: Math.ceil(t.m / 3), leap: isLeap(t.y), daysInMonth: daysInMonth(t.y, t.m), daysLeftInYear: (isLeap(t.y) ? 366 : 365) - dayOfYear(t) };
  }

  /* ---------- libur dan hari kerja ---------- */
  /* satu baris per hari: "YYYY-MM-DD Nama", penanda [cuti] di depan nama untuk cuti bersama; baris # dan kosong diabaikan */
  function parseHolidays(text) {
    var list = [], errors = [], seen = {};
    String(text == null ? '' : text).split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.trim(); if (!line || line[0] === '#') return;
      var m = /^(\S+)\s*(.*)$/.exec(line), d = m && parse(m[1]);
      if (!d || !/^\d{4}-/.test(m[1])) { errors.push({ line: i + 1, text: raw }); return; }
      var name = m[2].trim(), cuti = false, c = /^\[cuti\]\s*/i.exec(name);
      if (c) { cuti = true; name = name.slice(c[0].length); }
      var key = iso(d); if (seen[key]) { errors.push({ line: i + 1, text: raw, dup: true }); return; }
      seen[key] = true; list.push({ date: d, iso: key, name: name, cuti: cuti });
    });
    list.sort(function (a, b) { return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
    return { list: list, errors: errors };
  }
  function holidayYears(list) { var s = {}; list.forEach(function (h) { s[h.date.y] = true; }); return Object.keys(s).map(Number).sort(); }
  /* peta ISO -> entri libur; includeCuti=false membuang cuti bersama */
  function holidayMap(list, includeCuti) { var m = {}; list.forEach(function (h) { if (includeCuti || !h.cuti) m[h.iso] = h; }); return m; }

  /* opsi: { weekend: [0,6] (hari libur mingguan), holidays: peta dari holidayMap } */
  function isWorkday(t, o) { o = o || {}; var we = o.weekend || [0, 6]; return we.indexOf(weekday(t)) < 0 && !(o.holidays && o.holidays[iso(t)]); }
  /* langkah hari kerja dari a ke b: a tidak dihitung dan b dihitung (kebalikan dari addWorkdays), jadi (a, b] bila a <= b dan [b, a) bila a > b
     (hasil negatif); includeStart ikut menghitung a sendiri */
  function workdaysBetween(a, b, o, includeStart) {
    var da = toDay(a), db = toDay(b), fwd = da <= db, lo = fwd ? da + (includeStart ? 0 : 1) : db, hi = fwd ? db : da - (includeStart ? 0 : 1), n = 0;
    for (var d = lo; d <= hi; d++) if (isWorkday(fromDay(d), o)) n++;
    return fwd ? n : -n;
  }
  /* geser n hari kerja (n bisa negatif); n = 0 mengembalikan tanggal itu sendiri */
  function addWorkdays(t, n, o) {
    var d = toDay(t), step = n < 0 ? -1 : 1, left = Math.abs(n), guard = 0;
    while (left > 0) { d += step; if (isWorkday(fromDay(d), o)) left--; if (++guard > 4000000) throw new RangeError('terlalu jauh'); }
    var r = fromDay(d); if (r.y < 1 || r.y > 9999) throw new RangeError('tahun di luar 1 sampai 9999'); return r;
  }
  /* daftar libur yang jatuh di antara dua tanggal (termasuk kedua ujung) */
  function holidaysBetween(a, b, map) {
    var lo = Math.min(toDay(a), toDay(b)), hi = Math.max(toDay(a), toDay(b)), out = [];
    Object.keys(map).forEach(function (k) { var h = map[k], d = toDay(h.date); if (d >= lo && d <= hi) out.push(h); });
    return out.sort(function (x, y) { return x.iso < y.iso ? -1 : 1; });
  }

  /* ---------- umur ---------- */
  /* ulang tahun 29 Februari dirayakan 28 Februari pada tahun biasa (sama dengan aturan addMonths) */
  function age(birth, ref) {
    if (cmp(birth, ref) > 0) return null;
    var d = diff(birth, ref), next = addYears(birth, d.years + 1), nextDays = toDay(next) - toDay(ref);
    var today = d.months === 0 && d.days === 0 && d.years > 0;
    return { years: d.years, months: d.months, days: d.days, totalDays: d.totalDays, totalMonths: d.totalMonths, weeks: d.weeks, nextBirthday: today ? ref : next, daysToNext: today ? 0 : nextDays, nextAge: today ? d.years : d.years + 1, isBirthday: today, bornWeekday: weekday(birth) };
  }

  /* daftar libur nasional dan cuti bersama 2026 (SKB 3 Menteri). Bisa salah ketik atau berubah; periksa dokumen resmi. */
  var DEFAULT_HOLIDAYS = [
    '2026-01-01 Tahun Baru 2026 Masehi', '2026-01-16 Isra Mikraj Nabi Muhammad SAW', '2026-02-16 [cuti] Cuti bersama Tahun Baru Imlek', '2026-02-17 Tahun Baru Imlek 2577 Kongzili',
    '2026-03-18 [cuti] Cuti bersama Hari Suci Nyepi', '2026-03-19 Hari Suci Nyepi (Tahun Baru Saka 1948)', '2026-03-20 [cuti] Cuti bersama Idul Fitri', '2026-03-21 Idul Fitri 1447 H', '2026-03-22 Idul Fitri 1447 H',
    '2026-03-23 [cuti] Cuti bersama Idul Fitri', '2026-03-24 [cuti] Cuti bersama Idul Fitri', '2026-04-03 Wafat Yesus Kristus', '2026-04-05 Kebangkitan Yesus Kristus (Paskah)', '2026-05-01 Hari Buruh Internasional',
    '2026-05-14 Kenaikan Yesus Kristus', '2026-05-15 [cuti] Cuti bersama Kenaikan Yesus Kristus', '2026-05-27 Idul Adha 1447 H', '2026-05-28 [cuti] Cuti bersama Idul Adha', '2026-05-31 Hari Raya Waisak 2570 BE',
    '2026-06-01 Hari Lahir Pancasila', '2026-06-16 Tahun Baru Islam 1448 H', '2026-08-17 Hari Kemerdekaan Republik Indonesia', '2026-08-25 Maulid Nabi Muhammad SAW', '2026-12-24 [cuti] Cuti bersama Natal', '2026-12-25 Hari Raya Natal'
  ].join('\n');

  var api = { isLeap: isLeap, daysInMonth: daysInMonth, valid: valid, parse: parse, iso: iso, toDay: toDay, fromDay: fromDay, cmp: cmp, addDays: addDays, addMonths: addMonths, addYears: addYears, add: add, diff: diff,
    weekday: weekday, dayOfYear: dayOfYear, isoWeek: isoWeek, weeksInIsoYear: weeksInIsoYear, info: info, parseHolidays: parseHolidays, holidayYears: holidayYears, holidayMap: holidayMap, isWorkday: isWorkday,
    workdaysBetween: workdaysBetween, addWorkdays: addWorkdays, holidaysBetween: holidaysBetween, age: age, DEFAULT_HOLIDAYS: DEFAULT_HOLIDAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TanggalLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
