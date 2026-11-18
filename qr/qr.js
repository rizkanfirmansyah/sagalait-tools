/* Logika murni Pembuat QR: pengode QR Code Model 2 (versi 1-40, ECC L/M/Q/H, mode angka/alfanumerik/byte),
   pembuat isi (tautan, WiFi, kontak, dll), dan penggambar SVG. Tanpa DOM, tanpa dependensi. */
(function (root) {
  'use strict';

  var ECC = { L: 0, M: 1, Q: 2, H: 3 };
  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  /* per versi (indeks 1..40): kode koreksi per blok dan jumlah blok */
  var ECC_PER_BLOCK = {
    L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  var NUM_BLOCKS = {
    L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  function utf8(str) { return Array.prototype.slice.call(new TextEncoder().encode(str)); }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var na = Math.floor(ver / 7) + 2; r -= (25 * na - 10) * na - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver, ecc) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * NUM_BLOCKS[ecc][ver]; }
  function ccBits(mode, ver) { var i = ver <= 9 ? 0 : ver <= 26 ? 1 : 2; return ({ num: [10, 12, 14], alnum: [9, 11, 13], byte: [8, 16, 16] })[mode][i]; }
  var MODE_IND = { num: 1, alnum: 2, byte: 4 };

  function pickMode(str) {
    if (/^[0-9]*$/.test(str)) return 'num';
    for (var i = 0; i < str.length; i++) if (ALNUM.indexOf(str[i]) < 0) return 'byte';
    return 'alnum';
  }
  function bitsFor(mode, str, bytes, ver) {
    var n = mode === 'byte' ? bytes.length : str.length, body;
    if (mode === 'num') body = Math.floor(n / 3) * 10 + (n % 3 ? (n % 3) * 3 + 1 : 0);
    else if (mode === 'alnum') body = Math.floor(n / 2) * 11 + (n % 2) * 6;
    else body = n * 8;
    return 4 + ccBits(mode, ver) + body;
  }
  function pushBits(arr, val, len) { for (var i = len - 1; i >= 0; i--) arr.push((val >>> i) & 1); }

  /* ---------- Reed-Solomon GF(256) ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function gmul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function rsDivisor(deg) {
    var r = [], i, j; for (i = 0; i < deg; i++) r.push(0); r[deg - 1] = 1;
    var root = 1;
    for (i = 0; i < deg; i++) {
      for (j = 0; j < deg; j++) { r[j] = gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = gmul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift(); res.push(0);
      div.forEach(function (c, i) { res[i] ^= gmul(c, f); });
    });
    return res;
  }

  /* ---------- tata letak ---------- */
  function alignPositions(ver) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, r = [6];
    for (var p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
    return r;
  }
  function Grid(ver) {
    this.ver = ver; this.size = ver * 4 + 17;
    this.m = []; this.fn = [];
    for (var i = 0; i < this.size; i++) { this.m.push(new Array(this.size).fill(0)); this.fn.push(new Array(this.size).fill(false)); }
  }
  Grid.prototype.set = function (x, y, dark) { this.m[y][x] = dark ? 1 : 0; this.fn[y][x] = true; };
  Grid.prototype.drawFunction = function () {
    var s = this.size, i, j, self = this;
    for (i = 0; i < s; i++) { this.set(6, i, i % 2 === 0); this.set(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < s && y >= 0 && y < s) self.set(x, y, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(s - 4, 3); finder(3, s - 4);
    var ap = alignPositions(this.ver);
    for (i = 0; i < ap.length; i++) for (j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) this.set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    this.drawFormat('L', 0);
    if (this.ver >= 7) {
      var rem = this.ver; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var bits = (this.ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var b = ((bits >>> i) & 1) === 1, a = s - 11 + (i % 3), c = Math.floor(i / 3);
        this.set(a, c, b); this.set(c, a, b);
      }
    }
  };
  Grid.prototype.drawFormat = function (ecc, mask) {
    var data = (FORMAT_BITS[ecc] << 3) | mask, rem = data, i, s = this.size;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412, b = function (k) { return ((bits >>> k) & 1) === 1; };
    for (i = 0; i <= 5; i++) this.set(8, i, b(i));
    this.set(8, 7, b(6)); this.set(8, 8, b(7)); this.set(7, 8, b(8));
    for (i = 9; i < 15; i++) this.set(14 - i, 8, b(i));
    for (i = 0; i < 8; i++) this.set(s - 1 - i, 8, b(i));
    for (i = 8; i < 15; i++) this.set(8, s - 15 + i, b(i));
    this.set(8, s - 8, true);
  };
  Grid.prototype.place = function (codewords) {
    var s = this.size, bit = 0, total = codewords.length * 8;
    for (var right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var v = 0; v < s; v++) for (var j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - v : v;
        if (!this.fn[y][x] && bit < total) { this.m[y][x] = (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1; bit++; }
      }
    }
  };
  var MASKS = [
    function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];
  Grid.prototype.applyMask = function (k) {
    for (var y = 0; y < this.size; y++) for (var x = 0; x < this.size; x++) if (!this.fn[y][x] && MASKS[k](x, y)) this.m[y][x] ^= 1;
  };
  /* skor penalti standar: run 5+, blok 2x2, pola 1:1:3:1:1 + 4 terang, proporsi gelap */
  function penalty(m) {
    var s = m.length, p = 0, x, y, run, dark = 0, line, i;
    var pa = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pb = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    function scan(get) {
      for (var a = 0; a < s; a++) {
        run = 1;
        for (var b = 1; b < s; b++) { if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
        line = []; for (i = 0; i < 4; i++) line.push(0); for (i = 0; i < s; i++) line.push(get(a, i)); for (i = 0; i < 4; i++) line.push(0);
        for (i = 0; i + 11 <= line.length; i++) {
          var ma = true, mb = true;
          for (var k = 0; k < 11; k++) { if (line[i + k] !== pa[k]) ma = false; if (line[i + k] !== pb[k]) mb = false; }
          if (ma) p += 40; if (mb) p += 40;
        }
      }
    }
    scan(function (a, b) { return m[a][b]; }); scan(function (a, b) { return m[b][a]; });
    for (y = 0; y < s - 1; y++) for (x = 0; x < s - 1; x++) { var c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    for (y = 0; y < s; y++) for (x = 0; x < s; x++) dark += m[y][x];
    p += (Math.ceil(Math.abs(dark * 20 - s * s * 10) / (s * s)) - 1) * 10;
    return p;
  }

  function interleave(data, ver, ecc) {
    var nb = NUM_BLOCKS[ecc][ver], el = ECC_PER_BLOCK[ecc][ver], raw = Math.floor(rawModules(ver) / 8);
    var shorts = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], rs = rsDivisor(el), k = 0, i, j;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - el + (i < shorts ? 0 : 1)); k += dat.length;
      var e = rsRemainder(dat, rs); if (i < shorts) dat.push(0);
      blocks.push(dat.concat(e));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (b, bi) { if (i !== shortLen - el || bi >= shorts) out.push(b[i]); });
    return out;
  }

  /* ---------- API utama ---------- */
  /* encode(text, { ecc: 'L'|'M'|'Q'|'H', minVersion, mask: 0..7 | undefined, mode: otomatis })
     hasil: { version, size, modules[y][x] 0/1, ecc, mask, mode, bytes, capacityBytes } atau melempar RangeError('too_long') */
  function encode(text, opt) {
    opt = opt || {};
    var ecc = opt.ecc || 'M', str = String(text), mode = opt.mode || pickMode(str), bytes = mode === 'byte' ? utf8(str) : null;
    if (!ECC.hasOwnProperty(ecc)) throw new RangeError('ecc');
    var ver, minV = opt.minVersion || 1, cap;
    for (ver = minV; ver <= 40; ver++) { cap = dataCodewords(ver, ecc) * 8; if (bitsFor(mode, str, bytes, ver) <= cap) break; }
    if (ver > 40) { var e = new RangeError('too_long'); e.code = 'too_long'; throw e; }
    var bits = [], i;
    pushBits(bits, MODE_IND[mode], 4);
    pushBits(bits, mode === 'byte' ? bytes.length : str.length, ccBits(mode, ver));
    if (mode === 'num') {
      for (i = 0; i < str.length; i += 3) { var g = str.substr(i, 3); pushBits(bits, parseInt(g, 10), g.length * 3 + 1); }
    } else if (mode === 'alnum') {
      for (i = 0; i + 1 < str.length; i += 2) pushBits(bits, ALNUM.indexOf(str[i]) * 45 + ALNUM.indexOf(str[i + 1]), 11);
      if (str.length % 2) pushBits(bits, ALNUM.indexOf(str[str.length - 1]), 6);
    } else bytes.forEach(function (b) { pushBits(bits, b, 8); });
    cap = dataCodewords(ver, ecc) * 8;
    var used = Math.ceil(bits.length / 8);
    pushBits(bits, 0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) pushBits(bits, pad, 8);
    var cw = []; for (i = 0; i < bits.length; i += 8) { var v = 0; for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; cw.push(v); }
    var all = interleave(cw, ver, ecc), g = new Grid(ver);
    g.drawFunction(); g.place(all);
    var mask = opt.mask, best = Infinity, k;
    if (mask === undefined || mask === null) {
      for (k = 0; k < 8; k++) {
        g.applyMask(k); g.drawFormat(ecc, k);
        var pen = penalty(g.m);
        if (pen < best) { best = pen; mask = k; }
        g.applyMask(k);
      }
    }
    g.applyMask(mask); g.drawFormat(ecc, mask);
    return { version: ver, size: g.size, modules: g.m, ecc: ecc, mask: mask, mode: mode, count: mode === 'byte' ? bytes.length : str.length, capacityBytes: cap / 8, usedBytes: used, isFunction: g.fn };
  }

  /* jumlah karakter maksimum untuk mode dan tingkat ECC tertentu (versi 40): angka, alfanumerik, atau byte */
  function maxChars(mode, ecc) {
    var cap = dataCodewords(40, ecc) * 8, lo = 0, hi = 9000;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1, bits = 4 + ccBits(mode, 40) + (mode === 'num' ? Math.floor(mid / 3) * 10 + (mid % 3 ? (mid % 3) * 3 + 1 : 0) : mode === 'alnum' ? Math.floor(mid / 2) * 11 + (mid % 2) * 6 : mid * 8);
      if (bits <= cap) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function maxBytes(ecc) { return maxChars('byte', ecc); }

  /* ---------- pembuat isi ---------- */
  function escWifi(s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); }
  function escVc(s) { return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1'); }
  function digits(s) { return String(s).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function icsUtc(local, tzOffsetMin) { /* local "YYYY-MM-DDTHH:mm" + offset menit browser -> UTC */
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local); if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + (tzOffsetMin || 0) * 60000, d = new Date(t);
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
  }
  function urlOk(s) { try { var u = new URL(s); return /^(https?|ftp):$/.test(u.protocol) && !!u.hostname && /\./.test(u.hostname) || u.hostname === 'localhost'; } catch (e) { return false; } }

  /* build(type, fields) -> { text, errors: [{field, code}], warnings: [code] }; text '' bila belum ada isi */
  function build(type, f) {
    f = f || {}; var errors = [], warnings = [], text = '', s = function (k) { return String(f[k] == null ? '' : f[k]).trim(); };
    function need(k) { if (!s(k)) { errors.push({ field: k, code: 'required' }); return false; } return true; }
    switch (type) {
      case 'text': text = String(f.text == null ? '' : f.text); if (!text) errors.push({ field: 'text', code: 'required' }); break;
      case 'url':
        if (!need('url')) break;
        var u = s('url'); if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        if (!urlOk(u)) { errors.push({ field: 'url', code: 'url' }); break; }
        if (/\s/.test(u)) u = u.replace(/\s/g, function (c) { return encodeURIComponent(c); });
        text = u; if (/^http:/i.test(u)) warnings.push('http'); break;
      case 'wifi':
        if (!need('ssid')) break;
        var sec = f.sec || 'WPA';
        if (sec !== 'nopass' && !s('pass')) { errors.push({ field: 'pass', code: 'required' }); break; }
        text = 'WIFI:T:' + (sec === 'nopass' ? 'nopass' : sec) + ';S:' + escWifi(f.ssid) + ';' + (sec === 'nopass' ? '' : 'P:' + escWifi(f.pass) + ';') + (f.hidden ? 'H:true;' : '') + ';'; break;
      case 'vcard':
        if (!s('name') && !s('org')) { errors.push({ field: 'name', code: 'required' }); break; }
        var lines = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + escVc(s('last')) + ';' + escVc(s('first')) + ';;;', 'FN:' + escVc(s('name') || s('org'))];
        if (s('org')) lines.push('ORG:' + escVc(s('org')));
        if (s('title')) lines.push('TITLE:' + escVc(s('title')));
        if (s('tel')) lines.push('TEL;TYPE=CELL:' + digits(s('tel')));
        if (s('email')) lines.push('EMAIL:' + escVc(s('email')));
        if (s('url')) lines.push('URL:' + escVc(s('url')));
        if (s('addr')) lines.push('ADR:;;' + escVc(s('addr')) + ';;;;');
        lines.push('END:VCARD'); text = lines.join('\r\n'); break;
      case 'email':
        if (!need('to')) break; if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s('to'))) { errors.push({ field: 'to', code: 'email' }); break; }
        text = 'mailto:' + s('to') + (s('subject') || s('body') ? '?' + [s('subject') && 'subject=' + encodeURIComponent(s('subject')), s('body') && 'body=' + encodeURIComponent(String(f.body))].filter(Boolean).join('&') : ''); break;
      case 'sms':
        if (!need('tel')) break; if (digits(s('tel')).replace('+', '').length < 5) { errors.push({ field: 'tel', code: 'tel' }); break; }
        text = 'SMSTO:' + digits(s('tel')) + ':' + String(f.msg == null ? '' : f.msg); break;
      case 'tel':
        if (!need('tel')) break; if (digits(s('tel')).replace('+', '').length < 5) { errors.push({ field: 'tel', code: 'tel' }); break; }
        text = 'tel:' + digits(s('tel')); break;
      case 'wa':
        if (!need('tel')) break; var d = digits(s('tel')).replace('+', '');
        if (d.length < 8 || d.length > 15) { errors.push({ field: 'tel', code: 'tel' }); break; }
        if (d[0] === '0') { errors.push({ field: 'tel', code: 'wa_zero' }); break; }
        text = 'https://wa.me/' + d + (s('msg') ? '?text=' + encodeURIComponent(String(f.msg)) : ''); break;
      case 'geo':
        var la = parseCoord(f.lat), lo = parseCoord(f.lon);
        if (!s('lat')) errors.push({ field: 'lat', code: 'required' }); else if (la === null || la < -90 || la > 90) errors.push({ field: 'lat', code: 'lat' });
        if (!s('lon')) errors.push({ field: 'lon', code: 'required' }); else if (lo === null || lo < -180 || lo > 180) errors.push({ field: 'lon', code: 'lon' });
        if (!errors.length) text = 'geo:' + la + ',' + lo; break;
      case 'event':
        if (!need('title')) break; var a = icsUtc(s('start'), f.tz), b = icsUtc(s('end'), f.tz);
        if (!s('start')) { errors.push({ field: 'start', code: 'required' }); break; }
        if (!a) { errors.push({ field: 'start', code: 'date' }); break; }
        if (s('end') && !b) { errors.push({ field: 'end', code: 'date' }); break; }
        if (b && b < a) { errors.push({ field: 'end', code: 'before' }); break; }
        text = ['BEGIN:VEVENT', 'SUMMARY:' + escVc(s('title')), 'DTSTART:' + a].concat(b ? ['DTEND:' + b] : [], s('place') ? ['LOCATION:' + escVc(s('place'))] : [], s('desc') ? ['DESCRIPTION:' + escVc(s('desc'))] : [], ['END:VEVENT']).join('\r\n'); break;
      default: throw new RangeError('tipe tidak dikenal');
    }
    if (errors.length) text = '';
    return { text: text, errors: errors, warnings: warnings };
  }
  function parseCoord(v) {
    var s = String(v == null ? '' : v).trim().replace(',', '.'); if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 1e6) / 1e6;
  }

  /* ---------- kontras warna (WCAG) dan pemeriksa keterbacaan ---------- */
  function lum(hex) {
    var h = String(hex).replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    var c = [0, 2, 4].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /* 'ok' | 'low' (kontras < 3) | 'inverted' (modul lebih terang dari latar) */
  function readability(fg, bg) { if (lum(fg) > lum(bg)) return 'inverted'; return contrast(fg, bg) < 3 ? 'low' : 'ok'; }

  /* ---------- geometri logo ---------- */
  /* kotak logo di tengah dalam satuan modul: sisi logo = pct% lebar, ditambah ruang 1 modul di tiap sisi */
  function logoBox(size, pct) {
    var side = Math.max(1, Math.round(size * pct / 100)); if ((size - side) % 2) side += 1;
    var pad = 1, from = (size - side) / 2 - pad;
    return { from: from, to: size - from, side: side, pad: pad, x: (size - side) / 2, covered: Math.pow(side + 2 * pad, 2) / (size * size) };
  }
  function isFinderZone(x, y, n) { return (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8); }

  /* ---------- SVG ---------- */
  function hexOk(c) { return /^#[0-9a-fA-F]{6}$/.test(c); }
  /* opsi: { margin, fg, bg, shape:'square'|'dots', logo:{href, pct}|null, title } */
  function toSvg(qr, opt) {
    opt = opt || {}; var n = qr.size, mg = opt.margin == null ? 4 : opt.margin, fg = hexOk(opt.fg) ? opt.fg : '#000000', bg = hexOk(opt.bg) ? opt.bg : '#ffffff';
    var dim = n + mg * 2, box = opt.logo ? logoBox(n, opt.logo.pct) : null, path = [], x, y;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      if (!qr.modules[y][x]) continue;
      if (box && x >= box.from && x < box.to && y >= box.from && y < box.to) continue;
      if (opt.shape === 'dots' && !isFinderZone(x, y, n)) { var cx = x + mg + 0.5, cy = y + mg + 0.5, r = 0.46; path.push('M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0z'); }
      else path.push('M' + (x + mg) + ' ' + (y + mg) + 'h1v1h-1z');
    }
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="' + (opt.shape === 'dots' ? 'geometricPrecision' : 'crispEdges') + '">' +
      '<title>' + esc(opt.title || 'QR Code') + '</title><rect width="' + dim + '" height="' + dim + '" fill="' + bg + '"/><path fill="' + fg + '" d="' + path.join('') + '"/>';
    if (box && opt.logo.href) s += '<image x="' + (box.x + mg) + '" y="' + (box.x + mg) + '" width="' + box.side + '" height="' + box.side + '" preserveAspectRatio="xMidYMid meet" href="' + esc(opt.logo.href) + '"/>';
    return s + '</svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var api = { encode: encode, build: build, toSvg: toSvg, logoBox: logoBox, isFinderZone: isFinderZone, readability: readability, contrast: contrast, maxBytes: maxBytes, maxChars: maxChars, pickMode: pickMode, dataCodewords: dataCodewords, alignPositions: alignPositions, hexOk: hexOk, ECC: ECC, ALNUM: ALNUM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QrLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
