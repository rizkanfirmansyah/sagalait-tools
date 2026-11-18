/* Logika murni Penguji hash dan HMAC (tanpa DOM). SHA lewat crypto.subtle; MD5 ditulis sendiri (tidak aman untuk keamanan). */
(function (root) {
  'use strict';
  var ALGOS = [
    { id: 'md5', label: 'MD5', hexLen: 32, block: 64, weak: true },
    { id: 'sha1', label: 'SHA-1', hexLen: 40, block: 64, subtle: 'SHA-1', weak: true },
    { id: 'sha256', label: 'SHA-256', hexLen: 64, block: 64, subtle: 'SHA-256' },
    { id: 'sha384', label: 'SHA-384', hexLen: 96, block: 128, subtle: 'SHA-384' },
    { id: 'sha512', label: 'SHA-512', hexLen: 128, block: 128, subtle: 'SHA-512' }
  ];
  function algo(id) { for (var i = 0; i < ALGOS.length; i++) if (ALGOS[i].id === id) return ALGOS[i]; throw new Error('algoritma tidak dikenal: ' + id); }
  function subtle() {
    var c = root.crypto; if (!c || !c.subtle) throw new Error('crypto.subtle tidak tersedia (butuh HTTPS atau localhost)');
    return c.subtle;
  }

  /* ---------- MD5 (RFC 1321) ---------- */
  var S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var K = []; for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  function md5(u8) {
    var len = u8.length, padLen = ((len + 8) >> 6 << 6) + 64, buf = new Uint8Array(padLen), dv = new DataView(buf.buffer), j;
    buf.set(u8); buf[len] = 0x80;
    dv.setUint32(padLen - 8, (len << 3) >>> 0, true); dv.setUint32(padLen - 4, Math.floor(len / 536870912), true);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476, M = new Uint32Array(16);
    for (var off = 0; off < padLen; off += 64) {
      for (j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
      var A = a0, B = b0, C = c0, D = d0;
      for (j = 0; j < 64; j++) {
        var F, g;
        if (j < 16) { F = (B & C) | (~B & D); g = j; }
        else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
        else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * j) % 16; }
        F = (F + A + K[j] + M[g]) >>> 0; A = D; D = C; C = B;
        B = (B + ((F << S[j]) | (F >>> (32 - S[j])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    var out = new Uint8Array(16), od = new DataView(out.buffer);
    od.setUint32(0, a0, true); od.setUint32(4, b0, true); od.setUint32(8, c0, true); od.setUint32(12, d0, true);
    return out;
  }

  function toHex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
  function toBase64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function fromHex(h) { var n = h.length / 2, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function format(u8, mode) { return mode === 'base64' ? toBase64(u8) : mode === 'upper' ? toHex(u8).toUpperCase() : toHex(u8); }

  /* ---------- digest dan HMAC ---------- */
  function digest(id, data) {
    var a = algo(id);
    if (id === 'md5') return Promise.resolve(md5(data));
    return subtle().digest(a.subtle, data).then(function (b) { return new Uint8Array(b); });
  }
  function hmac(id, key, data) {
    var a = algo(id);
    if (id === 'md5') {
      var k = key.length > a.block ? md5(key) : key, ip = new Uint8Array(a.block + data.length), op = new Uint8Array(a.block + 16), i;
      for (i = 0; i < a.block; i++) { var kb = i < k.length ? k[i] : 0; ip[i] = kb ^ 0x36; op[i] = kb ^ 0x5c; }
      ip.set(data, a.block); op.set(md5(ip), a.block);
      return Promise.resolve(md5(op));
    }
    var s = subtle();
    return s.importKey('raw', key.length ? key : new Uint8Array(1), { name: 'HMAC', hash: a.subtle }, false, ['sign']).then(function (ck) {
      if (!key.length) return s.importKey('raw', new Uint8Array(a.block), { name: 'HMAC', hash: a.subtle }, false, ['sign']).then(function (zk) { return s.sign('HMAC', zk, data); });
      return s.sign('HMAC', ck, data);
    }).then(function (b) { return new Uint8Array(b); });
  }

  /* ---------- bandingkan ---------- */
  /* Menormalkan hash yang ditempel: buang spasi, titik dua, awalan 0x; huruf kecil. Base64 dikenali bila bukan hex. */
  function normalize(s) {
    var t = String(s == null ? '' : s).trim();
    if (t === '') return { ok: false, error: 'empty' };
    var hex = t.replace(/[\s:]/g, '').replace(/^0x/i, '');
    if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) return { ok: true, hex: hex.toLowerCase(), kind: 'hex' };
    var b = t.replace(/\s/g, '');
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(b) && b.length % 4 === 0) {
      try { var bin = atob(b), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return { ok: true, hex: toHex(u), kind: 'base64' }; } catch (e) { /* jatuh ke galat */ }
    }
    return { ok: false, error: 'format' };
  }
  function guessAlgo(hex) { for (var i = 0; i < ALGOS.length; i++) if (ALGOS[i].hexLen === hex.length) return ALGOS[i].id; return null; }
  /* perbandingan waktu tetap pada panjang sama */
  function equalHex(a, b) {
    if (a.length !== b.length) return false;
    var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }
  function compare(a, b) {
    var x = normalize(a), y = normalize(b);
    if (!x.ok) return { ok: false, which: 'a', error: x.error };
    if (!y.ok) return { ok: false, which: 'b', error: y.error };
    return { ok: true, same: equalHex(x.hex, y.hex), algoA: guessAlgo(x.hex), algoB: guessAlgo(y.hex) };
  }

  var api = { ALGOS: ALGOS, algo: algo, md5: md5, digest: digest, hmac: hmac, toHex: toHex, toBase64: toBase64, fromHex: fromHex, utf8: utf8, format: format, normalize: normalize, guessAlgo: guessAlgo, equalHex: equalHex, compare: compare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HashLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
