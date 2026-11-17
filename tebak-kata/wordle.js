/* Logika murni Tebak kata (Wordle bahasa Indonesia), tanpa DOM. */
(function (root) {
  'use strict';
  var LEN = 5, TRIES = 6, EPOCH = Date.UTC(2026, 0, 1), SEED = 20261117;
  var RANK = { a: 0, p: 1, c: 2 };

  /* Penilaian per huruf: 'c' tepat, 'p' ada di posisi lain, 'a' tidak ada.
     Dua lintasan: yang tepat dihitung dulu, lalu 'p' hanya sebanyak sisa huruf di kata jawaban. */
  function evaluate(guess, answer) {
    if (guess.length !== answer.length) throw new RangeError('panjang kata berbeda');
    var res = [], left = {}, i, ch;
    for (i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) res[i] = 'c';
      else { res[i] = 'a'; left[answer[i]] = (left[answer[i]] || 0) + 1; }
    }
    for (i = 0; i < guess.length; i++) {
      if (res[i] === 'c') continue;
      ch = guess[i];
      if (left[ch] > 0) { res[i] = 'p'; left[ch]--; }
    }
    return res;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* urutan acak tetap (permutasi) supaya kata harian tidak berurutan abjad */
  function permutation(n) {
    var rng = mulberry32(SEED), p = [], i, j, t;
    for (i = 0; i < n; i++) p.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
    return p;
  }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) throw new RangeError('tanggal harus YYYY-MM-DD');
    var y = +m[1], mo = +m[2], d = +m[3], u = Date.UTC(y, mo - 1, d), c = new Date(u);
    if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) throw new RangeError('tanggal tidak ada');
    return u;
  }
  function dayNumber(dateStr) { return Math.round((parseDate(dateStr) - EPOCH) / 86400000); }
  function dailyAnswer(answers, dateStr) {
    var n = answers.length, idx = ((dayNumber(dateStr) % n) + n) % n;
    return answers[permutation(n)[idx]];
  }
  function todayLocal(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function normalize(w) { return String(w == null ? '' : w).trim().toLowerCase(); }
  /* kata sah: tepat 5 huruf a-z dan ada di daftar */
  function validate(word, validSet) {
    var w = normalize(word);
    if (w.length < LEN) return { ok: false, reason: 'short' };
    if (w.length > LEN) return { ok: false, reason: 'long' };
    if (!/^[a-z]+$/.test(w)) return { ok: false, reason: 'chars' };
    if (!validSet.has(w)) return { ok: false, reason: 'unknown' };
    return { ok: true, word: w };
  }

  /* status terbaik tiap huruf untuk papan ketik: c > p > a */
  function keyStates(guesses, results) {
    var st = {};
    guesses.forEach(function (g, i) {
      for (var k = 0; k < g.length; k++) {
        var cur = st[g[k]], nx = results[i][k];
        if (cur === undefined || RANK[nx] > RANK[cur]) st[g[k]] = nx;
      }
    });
    return st;
  }

  var EMOJI = { c: '🟩', p: '🟨', a: '⬛' };
  function shareText(title, results, won, tries) {
    var head = title + ' ' + (won ? results.length : 'X') + '/' + (tries || TRIES);
    return head + '\n\n' + results.map(function (r) { return r.map(function (x) { return EMOJI[x]; }).join(''); }).join('\n');
  }

  var api = { LEN: LEN, TRIES: TRIES, evaluate: evaluate, permutation: permutation, dayNumber: dayNumber, dailyAnswer: dailyAnswer, todayLocal: todayLocal, normalize: normalize, validate: validate, keyStates: keyStates, shareText: shareText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Wordle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
