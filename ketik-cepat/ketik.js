/* Logika Ketik cepat: tanpa DOM, waktu selalu disuntik (milidetik) supaya bisa dites di Node.
   Rumus (juga dijelaskan di UI):
   - WPM   = (karakter benar / 5) / menit. Karakter benar = huruf yang cocok pada posisinya di teks akhir, ditambah spasi sesudah kata yang benar utuh.
   - Raw   = (semua ketikan karakter / 5) / menit, termasuk yang salah dan yang sudah dihapus.
   - Akurasi = ketikan benar / seluruh ketikan, dihitung per ketikan: kesalahan yang dikoreksi tetap menurunkan akurasi. Backspace bukan ketikan.
   - Konsistensi = 100 x (1 - simpangan baku / rata-rata) dari WPM tiap detik, dibatasi 0 sampai 100. */
(function (root) {
  'use strict';

  var TIME = [15, 30, 60, 120], WORDS = [10, 25, 50, 100];
  var MAX_EXTRA = 19, HISTORY_MAX = 100;
  var DEFAULTS = {
    mode: 'time', time: 30, words: 25, punct: false, nums: false, lang: null,
    stopOnError: false, blind: false, noBack: false, size: 3, align: 'center', sound: false, caret: 'smooth', live: 'full'
  };

  /* ---------- acak ---------- */
  function seedRng(seed) { /* mulberry32, supaya "ulangi tes yang sama" dan tes bisa deterministik */
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- pembuat kata ---------- */
  function numWord(rng) { var n = 1 + Math.floor(rng() * 4), s = ''; for (var i = 0; i < n; i++) s += Math.floor(rng() * 10); return s; }
  function makeWords(list, count, o) {
    o = o || {}; var rng = o.rng || Math.random, out = [], prev = '';
    for (var i = 0; i < count; i++) {
      var w;
      if (o.numbers && rng() < 0.12) w = numWord(rng);
      else { w = list[Math.floor(rng() * list.length)]; if (list.length > 1 && w === prev) w = list[Math.floor(rng() * list.length)]; }
      prev = w; out.push(w);
    }
    if (o.punct) decorate(out, rng);
    return out;
  }
  function decorate(out, rng) {
    var start = true, len = 0, ends = ['.', '.', '.', '?', '!'], n = out.length;
    for (var i = 0; i < n; i++) {
      var w = out[i]; len++;
      if (start && !/^\d/.test(w)) w = w.charAt(0).toUpperCase() + w.slice(1);
      start = false;
      if (i === n - 1 || (len >= 4 && rng() < 0.2)) { w += ends[Math.floor(rng() * ends.length)]; start = true; len = 0; }
      else if (rng() < 0.1) w += ',';
      else if (rng() < 0.03) w += ':';
      else if (rng() < 0.03) w = '"' + w + '"';
      out[i] = w;
    }
  }

  /* ---------- tes dengan teks sasaran ---------- */
  function create(words, o) {
    o = o || {};
    return {
      words: words.slice(), typed: [''], idx: 0, start: null, last: null, end: null, done: false, ok: 0, bad: 0, sec: [],
      o: { mode: o.mode === 'words' ? 'words' : 'time', durationMs: o.durationMs || 30000, stopOnError: !!o.stopOnError, noBack: !!o.noBack }
    };
  }
  function extend(s, more) { for (var i = 0; i < more.length; i++) s.words.push(more[i]); }
  function record(s, t, good) {
    if (good) s.ok++; else s.bad++;
    var k = Math.max(0, Math.floor((t - s.start) / 1000)), b = s.sec[k];
    if (!b) { for (var j = s.sec.length; j <= k; j++) s.sec[j] = { ok: 0, bad: 0 }; b = s.sec[k]; }
    if (good) b.ok++; else b.bad++;
  }
  function finish(s, t) { s.done = true; s.end = t; }
  function expired(s, t) { return s.o.mode === 'time' && s.start !== null && t - s.start >= s.o.durationMs; }
  /* Kembalian: 'ok' | 'bad' | 'ignored' | 'finish' (tes selesai oleh ketikan ini) | 'done' (tes sudah selesai atau waktu habis). */
  function type(s, ch, t) {
    if (s.done) return 'done';
    if (expired(s, t)) { finish(s, s.start + s.o.durationMs); return 'done'; }
    var word = s.words[s.idx], cur = s.typed[s.idx], last = s.idx === s.words.length - 1;
    if (ch === ' ') {
      if (cur === '') return 'ignored';
      var complete = cur === word;
      if (s.start === null) s.start = t;
      record(s, t, complete); s.last = t;
      if (s.o.stopOnError && !complete) return 'ignored';
      if (last) { if (s.o.mode === 'words') { finish(s, t); return 'finish'; } return 'ignored'; }
      s.idx++; if (s.typed[s.idx] === undefined) s.typed[s.idx] = '';
      return complete ? 'ok' : 'bad';
    }
    if (ch.length !== 1 && !/^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(ch)) return 'ignored';
    var good = cur.length < word.length && word.charAt(cur.length) === ch;
    if (s.start === null) s.start = t;
    s.last = t; record(s, t, good);
    if (s.o.stopOnError && !good) return 'ignored';
    if (cur.length >= word.length + MAX_EXTRA) return 'ignored';
    s.typed[s.idx] = cur + ch;
    if (s.o.mode === 'words' && last && s.typed[s.idx] === word) { finish(s, t); return 'finish'; }
    return good ? 'ok' : 'bad';
  }
  /* Backspace tidak dihitung sebagai ketikan. ctrl = hapus seluruh isian kata aktif. Kalau kata aktif kosong, mundur ke kata sebelumnya
     (kecuali "tanpa mundur"); isian kata sebelumnya dibiarkan utuh. */
  function back(s, ctrl) {
    if (s.done) return 'done';
    var cur = s.typed[s.idx];
    if (cur.length) { s.typed[s.idx] = ctrl ? '' : cur.slice(0, -1); return 'del'; }
    if (s.idx > 0 && !s.o.noBack) { s.idx--; return 'prev'; }
    return 'ignored';
  }
  function shiftStart(s, ms) { if (s.start !== null) s.start += ms; if (s.last !== null) s.last += ms; }

  function counts(s) {
    var c = { correct: 0, wrong: 0, extra: 0, missed: 0 };
    for (var i = 0; i <= s.idx && i < s.words.length; i++) {
      var w = s.words[i], ty = s.typed[i] || '';
      for (var j = 0; j < ty.length; j++) { if (j >= w.length) c.extra++; else if (ty.charAt(j) === w.charAt(j)) c.correct++; else c.wrong++; }
      if (i < s.idx) { c.missed += Math.max(0, w.length - ty.length); if (ty === w) c.correct++; }
    }
    return c;
  }
  function consistency(vals) {
    var n = vals.length; if (!n) return 0;
    var m = 0, i; for (i = 0; i < n; i++) m += vals[i]; m /= n; if (m <= 0) return 0;
    var v = 0; for (i = 0; i < n; i++) v += (vals[i] - m) * (vals[i] - m);
    var c = 100 * (1 - Math.sqrt(v / n) / m);
    return Math.max(0, Math.min(100, c));
  }
  function series(s, elapsed) {
    var out = [], n = Math.ceil(elapsed / 1000);
    for (var k = 0; k < n; k++) {
      var len = Math.min(1000, elapsed - k * 1000) / 1000;
      if (len < 0.5 && k > 0) continue;
      var b = s.sec[k] || { ok: 0, bad: 0 };
      out.push({ s: k + 1, wpm: b.ok / len * 12, raw: (b.ok + b.bad) / len * 12, err: b.bad });
    }
    return out;
  }
  /* now = jam saat ini (dipakai untuk tampilan hidup sebelum tes selesai). */
  function result(s, now) {
    var endT = s.end !== null ? s.end : (now !== undefined ? now : s.last);
    var el = s.start === null ? 0 : Math.max(0, endT - s.start);
    if (s.o.mode === 'time' && el > s.o.durationMs) el = s.o.durationMs;
    var c = counts(s), mins = el / 60000, tot = s.ok + s.bad, ser = series(s, el);
    return {
      wpm: mins > 0 ? c.correct / 5 / mins : 0, raw: mins > 0 ? tot / 5 / mins : 0,
      acc: tot ? s.ok / tot * 100 : 100, consistency: consistency(ser.map(function (x) { return x.wpm; })),
      chars: c, keys: { ok: s.ok, bad: s.bad }, ms: el, series: ser
    };
  }

  /* ---------- mode zen ---------- */
  function zenCreate() { return { text: '', start: null, last: null, done: false }; }
  function zenToken(z) { var m = /\S*$/.exec(z.text); return m ? m[0] : ''; }
  function zenType(z, ch, t) {
    if (z.done) return 'done';
    if (ch !== ' ' && ch.length !== 1 && !/^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(ch)) return 'ignored';
    if (ch === ' ' && (z.text === '' || /\s$/.test(z.text))) return 'ignored';
    if (z.start === null) z.start = t;
    z.last = t; z.text += ch; return 'ok';
  }
  function zenBack(z, ctrl) {
    if (z.done || !z.text.length) return 'ignored';
    z.text = ctrl ? z.text.replace(/\s*\S*$/, '') : z.text.slice(0, -1); return 'del';
  }
  function zenFinish(z, t) { z.done = true; z.last = t; }
  function zenResult(z) {
    var w = z.text.split(/\s+/).filter(Boolean).length;
    return { words: w, chars: Array.from(z.text).length, ms: z.start === null ? 0 : Math.max(0, z.last - z.start) };
  }

  /* ---------- penyimpanan ---------- */
  function recordKey(mode, amount, lang, punct, nums) { return mode + '|' + amount + '|' + lang + '|' + (punct ? 1 : 0) + '|' + (nums ? 1 : 0); }
  function emptyStore() { return { format: 'sagalait-ketik-cepat', version: 1, settings: Object.assign({}, DEFAULTS), records: {}, history: [] }; }
  function isNum(x, lo, hi) { return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi; }
  var ENUM = { mode: ['time', 'words'], align: ['center', 'left'], caret: ['off', 'smooth', 'fast'], live: ['none', 'time', 'full'] };
  /* Pengaturan: nilai tak dikenal diganti bawaan (dipakai saat memuat data lokal). */
  function cleanSettings(o) {
    var s = Object.assign({}, DEFAULTS); if (!o || typeof o !== 'object') return s;
    ['mode', 'align', 'caret', 'live'].forEach(function (k) { if (ENUM[k].indexOf(o[k]) >= 0) s[k] = o[k]; });
    if (TIME.indexOf(o.time) >= 0) s.time = o.time;
    if (WORDS.indexOf(o.words) >= 0) s.words = o.words;
    if (o.lang === 'id' || o.lang === 'en') s.lang = o.lang;
    if (isNum(o.size, 1, 5) && o.size % 1 === 0) s.size = o.size;
    ['punct', 'nums', 'stopOnError', 'blind', 'noBack', 'sound'].forEach(function (k) { if (typeof o[k] === 'boolean') s[k] = o[k]; });
    return s;
  }
  function settingsValid(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    for (var k in o) { if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) return false; }
    var c = cleanSettings(o);
    for (var key in o) { if (o[key] !== c[key] && !(o[key] === null && key === 'lang')) return false; }
    return true;
  }
  /* Impor ketat: kembalikan data bersih, atau null bila apa pun tidak sah. Data lama tidak disentuh di sini. */
  function sanitizeStore(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (o.format !== 'sagalait-ketik-cepat' || o.version !== 1) return null;
    if (!settingsValid(o.settings)) return null;
    if (!o.records || typeof o.records !== 'object' || Array.isArray(o.records)) return null;
    if (!Array.isArray(o.history) || o.history.length > 5000) return null;
    var out = emptyStore(), keys = Object.keys(o.records), i;
    out.settings = cleanSettings(o.settings);
    if (keys.length > 500) return null;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i], r = o.records[k];
      if (!/^(time|words)\|\d{1,3}\|(id|en)\|[01]\|[01]$/.test(k) || !r || typeof r !== 'object') return null;
      if (!isNum(r.wpm, 0, 1000) || !isNum(r.acc, 0, 100) || !isNum(r.at, 0, 8.64e15)) return null;
      out.records[k] = { wpm: r.wpm, acc: r.acc, at: r.at };
    }
    for (i = 0; i < o.history.length; i++) {
      var h = o.history[i];
      if (!h || typeof h !== 'object' || ENUM.mode.indexOf(h.mode) < 0 || !(h.lang === 'id' || h.lang === 'en')) return null;
      if (!isNum(h.amount, 1, 999) || !isNum(h.at, 0, 8.64e15) || !isNum(h.wpm, 0, 1000) || !isNum(h.raw, 0, 1000) || !isNum(h.acc, 0, 100) || !isNum(h.cons, 0, 100) || !isNum(h.ms, 0, 864e5)) return null;
      if (typeof h.punct !== 'boolean' || typeof h.nums !== 'boolean') return null;
      out.history.push({ at: h.at, mode: h.mode, amount: h.amount, lang: h.lang, punct: h.punct, nums: h.nums, wpm: h.wpm, raw: h.raw, acc: h.acc, cons: h.cons, ms: h.ms });
    }
    out.history = out.history.slice(-HISTORY_MAX);
    return out;
  }
  /* Catat satu hasil. Kembalian: true bila memecahkan rekor kombinasi itu. */
  function addResult(store, e) {
    var key = recordKey(e.mode, e.amount, e.lang, e.punct, e.nums), old = store.records[key], isRec = !old || e.wpm > old.wpm;
    if (isRec) store.records[key] = { wpm: e.wpm, acc: e.acc, at: e.at };
    store.history.push({ at: e.at, mode: e.mode, amount: e.amount, lang: e.lang, punct: !!e.punct, nums: !!e.nums, wpm: e.wpm, raw: e.raw, acc: e.acc, cons: e.cons, ms: e.ms });
    if (store.history.length > HISTORY_MAX) store.history = store.history.slice(-HISTORY_MAX);
    return isRec;
  }
  function avg(a) { if (!a.length) return 0; var t = 0; a.forEach(function (x) { t += x.wpm; }); return t / a.length; }
  function summarize(history) {
    var ms = 0; history.forEach(function (h) { ms += h.ms; });
    return { tests: history.length, ms: ms, avg10: avg(history.slice(-10)), avg100: avg(history.slice(-100)) };
  }

  var api = {
    TIME: TIME, WORDS: WORDS, DEFAULTS: DEFAULTS, MAX_EXTRA: MAX_EXTRA, HISTORY_MAX: HISTORY_MAX,
    seedRng: seedRng, makeWords: makeWords, create: create, extend: extend, type: type, back: back, shiftStart: shiftStart, finish: finish,
    counts: counts, consistency: consistency, result: result,
    zenCreate: zenCreate, zenToken: zenToken, zenType: zenType, zenBack: zenBack, zenFinish: zenFinish, zenResult: zenResult,
    recordKey: recordKey, emptyStore: emptyStore, cleanSettings: cleanSettings, sanitizeStore: sanitizeStore, addResult: addResult, summarize: summarize
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Ketik = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
