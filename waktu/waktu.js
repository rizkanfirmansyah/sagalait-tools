/* Logika murni Konverter waktu (tanpa DOM): Unix timestamp, ISO 8601, tanggal lokal, zona Indonesia, dan selisih. */
(function (root) {
  'use strict';
  var MAX_MS = 8.64e15;
  var ZONES = [{ id: 'WIB', tz: 'Asia/Jakarta' }, { id: 'WITA', tz: 'Asia/Makassar' }, { id: 'WIT', tz: 'Asia/Jayapura' }, { id: 'UTC', tz: 'UTC' }];
  var fmtCache = {};

  function dtf(tz) {
    if (!fmtCache[tz]) fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return fmtCache[tz];
  }
  /* selisih zona terhadap UTC (ms) pada saat tertentu */
  function offsetMs(epochMs, tz) {
    if (tz === 'UTC') return 0;
    var o = {}, base = Math.floor(epochMs / 1000) * 1000;
    dtf(tz).formatToParts(new Date(base)).forEach(function (p) { o[p.type] = p.value; });
    var asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
    return asUtc - base;
  }
  function offsetStr(off) {
    if (off === 0) return 'Z';
    var s = off < 0 ? '-' : '+', a = Math.abs(off) / 60000;
    return s + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }
  function daysIn(y, m) { return [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

  /* waktu dinding (tanpa zona) di zona tz menjadi epoch ms */
  function wallToEpoch(y, mo, d, h, mi, s, ms, tz) {
    var guess = Date.UTC(y, mo - 1, d, h, mi, s, ms);
    if (y >= 0 && y < 100) { var dt = new Date(guess); dt.setUTCFullYear(y); guess = dt.getTime(); }
    var t = guess - offsetMs(guess, tz), off2 = offsetMs(t, tz);
    return guess - off2;
  }

  function unitOf(n) { var a = Math.abs(n); return a < 1e11 ? 's' : a < 1e14 ? 'ms' : a < 1e17 ? 'us' : 'ns'; }
  var UNIT_MS = { s: 1000, ms: 1, us: 0.001, ns: 0.000001 };

  /* parse: angka (detik, milidetik, mikrodetik, nanodetik; terdeteksi otomatis), ISO 8601, YYYY-MM-DD [HH:mm[:ss]], dd/mm/yyyy [HH:mm[:ss]].
     Tanggal tanpa zona dibaca di zona `wallTz` (bawaan Asia/Jakarta). */
  function parse(str, wallTz) {
    var s = String(str == null ? '' : str).trim(), tz = wallTz || 'Asia/Jakarta', m;
    if (s === '') return { ok: false, error: 'empty' };
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) {
      var n = Number(s), u = unitOf(n), ms = Math.round(n * UNIT_MS[u]);
      if (!isFinite(ms) || Math.abs(ms) > MAX_MS) return { ok: false, error: 'range' };
      return { ok: true, ms: ms, kind: 'epoch', unit: u };
    }
    var y, mo, d, h = 0, mi = 0, sec = 0, frac = 0, zone = null;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s))) {
      y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0); frac = m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0; zone = m[8] || null;
    } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
      d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); sec = +(m[6] || 0);
    } else return { ok: false, error: 'format' };
    if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo) || h > 23 || mi > 59 || sec > 59) return { ok: false, error: 'date' };
    if (frac === 1000) { frac = 999; }
    var epoch;
    if (zone) {
      var off = 0;
      if (zone.toUpperCase() !== 'Z') {
        var zm = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone), oh = +zm[2], om = +(zm[3] || 0);
        if (oh > 23 || om > 59) return { ok: false, error: 'date' };
        off = (zm[1] === '-' ? -1 : 1) * (oh * 60 + om) * 60000;
      }
      epoch = wallToEpoch(y, mo, d, h, mi, sec, frac, 'UTC') - off;
    } else epoch = wallToEpoch(y, mo, d, h, mi, sec, frac, tz);
    if (!isFinite(epoch) || Math.abs(epoch) > MAX_MS) return { ok: false, error: 'range' };
    return { ok: true, ms: epoch, kind: zone ? 'iso' : 'local', zoned: !!zone };
  }

  /* komponen waktu di zona tz */
  function parts(epochMs, tz) {
    var off = offsetMs(epochMs, tz), d = new Date(epochMs + off), ms = ((epochMs % 1000) + 1000) % 1000;
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: ms, dow: d.getUTCDay(), off: off };
  }
  function pad(n, w) { return String(n).padStart(w, '0'); }
  function iso(epochMs, tz) {
    var p = parts(epochMs, tz);
    return pad(p.y, 4) + '-' + pad(p.mo, 2) + '-' + pad(p.d, 2) + 'T' + pad(p.h, 2) + ':' + pad(p.mi, 2) + ':' + pad(p.s, 2) + '.' + pad(p.ms, 3) + offsetStr(p.off);
  }
  function human(epochMs, tz, locale) {
    var p = parts(epochMs, tz), d = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s));
    return new Intl.DateTimeFormat(locale || 'id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
  }
  function epochSeconds(ms) { return Math.floor(ms / 1000); }
  /* di luar rentang bilangan bulat 32-bit bertanda (batas tahun 2038) */
  function overInt32(ms) { var s = epochSeconds(ms); return s > 2147483647 || s < -2147483648; }

  /* selisih b - a: tanda dan rincian hari, jam, menit, detik, milidetik */
  function diff(a, b) {
    var delta = b - a, abs = Math.abs(delta), d = Math.floor(abs / 86400000), r = abs % 86400000;
    return { delta: delta, sign: delta < 0 ? -1 : delta > 0 ? 1 : 0, days: d, hours: Math.floor(r / 3600000), minutes: Math.floor((r % 3600000) / 60000), seconds: Math.floor((r % 60000) / 1000), ms: r % 1000, totalSeconds: abs / 1000, totalMinutes: abs / 60000, totalHours: abs / 3600000, totalDays: abs / 86400000 };
  }

  var api = { ZONES: ZONES, MAX_MS: MAX_MS, parse: parse, iso: iso, human: human, parts: parts, offsetMs: offsetMs, epochSeconds: epochSeconds, overInt32: overInt32, diff: diff, unitOf: unitOf, daysIn: daysIn, wallToEpoch: wallToEpoch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Waktu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
