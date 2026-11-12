/* Logika murni generator kata sandi (tanpa DOM). Pengacakan hanya lewat crypto.getRandomValues. */
(function (root) {
  'use strict';
  var SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digit: '0123456789',
    symbol: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
  };
  var SIMILAR = 'O0Il1';
  var LIMITS = { minLen: 8, maxLen: 128, minWords: 3, maxWords: 10 };
  var SEPS = { '-': '-', '.': '.', ' ': ' ', '': '' };
  var NUMBER_OPTIONS = 100; // frasa "tambah angka": 0 sampai 99

  /* sumber acak bawaan; bisa disuntik untuk tes: fn(Uint32Array) mengisi array */
  function cryptoFill(arr) {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues tidak tersedia');
    return c.getRandomValues(arr);
  }

  /* Bilangan bulat seragam di [0, n) dengan rejection sampling (tanpa bias modulo). */
  function randomInt(n, fill) {
    if (!Number.isInteger(n) || n < 1 || n > 4294967296) throw new RangeError('batas acak tidak valid: ' + n);
    if (n === 1) return 0;
    fill = fill || cryptoFill;
    var buf = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n;
    for (;;) {
      fill(buf);
      if (buf[0] < limit) return buf[0] % n;
    }
  }
  function pick(list, fill) { return list[randomInt(list.length, fill)]; }

  function alphabet(o) {
    var s = '';
    if (o.lower) s += SETS.lower;
    if (o.upper) s += SETS.upper;
    if (o.digit) s += SETS.digit;
    if (o.symbol) s += SETS.symbol;
    if (o.avoidSimilar) s = s.split('').filter(function (c) { return SIMILAR.indexOf(c) < 0; }).join('');
    return s;
  }
  function classes(o) {
    var r = [];
    ['lower', 'upper', 'digit', 'symbol'].forEach(function (k) {
      if (!o[k]) return;
      var s = SETS[k];
      if (o.avoidSimilar) s = s.split('').filter(function (c) { return SIMILAR.indexOf(c) < 0; }).join('');
      r.push(s);
    });
    return r;
  }

  /* Acak: seragam atas alfabet; diulang bila ada kelas terpilih yang tidak muncul (tetap seragam atas yang memenuhi syarat). */
  function genRandom(o, fill) {
    var len = o.length;
    if (!Number.isInteger(len) || len < LIMITS.minLen || len > LIMITS.maxLen) throw new RangeError('panjang harus ' + LIMITS.minLen + ' sampai ' + LIMITS.maxLen);
    var cls = classes(o), alpha = alphabet(o);
    if (!cls.length) throw new Error('pilih minimal satu jenis karakter');
    for (var tries = 0; tries < 10000; tries++) {
      var out = '', i;
      for (i = 0; i < len; i++) out += alpha.charAt(randomInt(alpha.length, fill));
      if (cls.every(function (s) { for (var k = 0; k < s.length; k++) if (out.indexOf(s.charAt(k)) >= 0) return true; return false; })) return out;
    }
    throw new Error('gagal membuat sandi');
  }

  function genPhrase(o, words, fill) {
    var n = o.words;
    if (!Number.isInteger(n) || n < LIMITS.minWords || n > LIMITS.maxWords) throw new RangeError('jumlah kata harus ' + LIMITS.minWords + ' sampai ' + LIMITS.maxWords);
    if (!Object.prototype.hasOwnProperty.call(SEPS, o.sep)) throw new Error('pemisah tidak valid');
    var parts = [];
    for (var i = 0; i < n; i++) {
      var w = pick(words, fill);
      parts.push(o.capital ? w.charAt(0).toUpperCase() + w.slice(1) : w);
    }
    var s = parts.join(SEPS[o.sep]);
    if (o.number) s += (o.sep === '' ? '' : SEPS[o.sep]) + randomInt(NUMBER_OPTIONS, fill);
    return s;
  }

  function entropyRandom(o) { return o.length * Math.log2(alphabet(o).length); }
  function entropyPhrase(o, listSize) { return o.words * Math.log2(listSize) + (o.number ? Math.log2(NUMBER_OPTIONS) : 0); }

  /* ambang tertulis di UI: <40 lemah, 40 sampai <60 sedang, 60 sampai <80 kuat, >=80 sangat kuat */
  var THRESHOLDS = [40, 60, 80];
  function strength(bits) { return bits < 40 ? 'weak' : bits < 60 ? 'fair' : bits < 80 ? 'strong' : 'very'; }

  /* Rata-rata waktu menebak: separuh ruang tebakan pada `rate` tebakan per detik. */
  function crackTime(bits, rate) {
    rate = rate || 1e10;
    var sec = Math.pow(2, bits - 1) / rate;
    if (sec < 1) return { unit: 'lt1', n: 0 };
    if (sec < 60) return { unit: 's', n: Math.round(sec) };
    if (sec < 3600) return { unit: 'min', n: Math.round(sec / 60) };
    if (sec < 86400) return { unit: 'h', n: Math.round(sec / 3600) };
    if (sec < 86400 * 365) return { unit: 'd', n: Math.round(sec / 86400) };
    var y = sec / (86400 * 365);
    if (y >= 1e12) return { unit: 'over', n: 1e12 };
    return { unit: 'y', n: y < 100 ? Math.round(y) : Math.round(y) };
  }

  var api = { SETS: SETS, SIMILAR: SIMILAR, LIMITS: LIMITS, SEPS: Object.keys(SEPS), THRESHOLDS: THRESHOLDS, randomInt: randomInt, alphabet: alphabet, genRandom: genRandom, genPhrase: genPhrase, entropyRandom: entropyRandom, entropyPhrase: entropyPhrase, strength: strength, crackTime: crackTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Pw = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
