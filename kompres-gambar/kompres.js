/* Logika murni Kompres gambar (tanpa DOM): dimensi, format ukuran, nama berkas unik, CRC32, dan penulis ZIP "store". */
(function (root) {
  'use strict';
  var FORMATS = { jpeg: { mime: 'image/jpeg', ext: 'jpg', lossy: true }, webp: { mime: 'image/webp', ext: 'webp', lossy: true }, png: { mime: 'image/png', ext: 'png', lossy: false } };
  var MAX_SIDES = [0, 3000, 2000, 1600, 1200, 800]; // 0 = ukuran asli
  var Q_MIN = 40, Q_MAX = 100;

  /* Dimensi baru: sisi terpanjang dibatasi maxSide, rasio dipertahankan, tidak pernah diperbesar. */
  function calcSize(w, h, maxSide) {
    if (!(w > 0) || !(h > 0)) throw new RangeError('dimensi tidak valid');
    var longest = Math.max(w, h);
    if (!maxSide || longest <= maxSide) return { w: w, h: h, scaled: false };
    var k = maxSide / longest;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: true };
  }
  function clampQuality(q) { q = Math.round(Number(q)); if (!isFinite(q)) q = 80; return Math.min(Q_MAX, Math.max(Q_MIN, q)); }

  /* 1024 B = 1 KB. Satu desimal bila perlu. */
  function formatBytes(n, locale) {
    if (!(n >= 0)) return '–';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    var nf = new Intl.NumberFormat(locale || 'en-US', { maximumFractionDigits: i === 0 ? 0 : 1 });
    return nf.format(v) + ' ' + u[i];
  }
  /* Persen hemat: positif = lebih kecil, negatif = lebih besar. */
  function percentSaved(orig, out) { return orig > 0 ? Math.round((1 - out / orig) * 100) : 0; }

  function splitName(name) {
    var base = String(name || 'gambar').replace(/^.*[\\/]/, ''), dot = base.lastIndexOf('.');
    return dot > 0 ? { base: base.slice(0, dot), ext: base.slice(dot + 1) } : { base: base || 'gambar', ext: '' };
  }
  /* nama keluaran: <nama asli>-kompres.<ekstensi format>, karakter tak aman diganti */
  function outName(orig, ext) { return splitName(orig).base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') + '-kompres.' + ext; }
  /* nama unik di dalam satu ZIP: a.jpg, a (2).jpg, a (3).jpg; pembandingan tanpa peka huruf besar */
  function uniqueName(name, used) {
    var p = splitName(name), n = 1, cand = name;
    while (used[cand.toLowerCase()]) { n++; cand = p.base + ' (' + n + ')' + (p.ext ? '.' + p.ext : ''); }
    used[cand.toLowerCase()] = true; return cand;
  }

  /* ---------- ZIP tanpa kompresi (store) ---------- */
  var T = null;
  function crc32(u8) {
    if (!T) { T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = T[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, f.data);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name); offset += 30 + name.length + size;
    });
    var csize = 0; central.forEach(function (c) { csize += c.byteLength !== undefined ? c.byteLength : c.length; });
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }
  /* pembaca ZIP "store" sederhana untuk verifikasi (dan tes): mengembalikan [{name, data, crcOk}] */
  function zipRead(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('bukan ZIP');
    var count = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), out = [];
    for (var k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('direktori pusat rusak');
      var crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), ds = off + 30 + lnl + lel;
      var data = u8.subarray(ds, ds + size);
      out.push({ name: name, data: data, crcOk: crc32(data) === crc });
      p += 46 + nl + el + cl;
    }
    return out;
  }

  var api = { FORMATS: FORMATS, MAX_SIDES: MAX_SIDES, Q_MIN: Q_MIN, Q_MAX: Q_MAX, calcSize: calcSize, clampQuality: clampQuality, formatBytes: formatBytes, percentSaved: percentSaved, splitName: splitName, outName: outName, uniqueName: uniqueName, crc32: crc32, zipStore: zipStore, zipRead: zipRead };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Kompres = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
