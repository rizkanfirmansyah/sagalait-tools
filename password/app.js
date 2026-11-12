/* Tampilan generator kata sandi. Logika di pw.js, daftar kata di kata.js. Sandi tidak disimpan, hanya pengaturan. */
(function () {
  'use strict';
  var P = window.Pw, W = window.PW_WORDS, I = window.SagalaI18n, KEY = 'sagalait-password';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  var DEF = { mode: 'random', length: 20, lower: true, upper: true, digit: true, symbol: true, similar: false, count: 1, words: 4, sep: '-', capital: false, number: false };
  var o = Object.assign({}, DEF), results = [], timers = [];

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s || typeof s !== 'object') return;
      if (s.mode === 'random' || s.mode === 'phrase') o.mode = s.mode;
      if (Number.isInteger(s.length)) o.length = clamp(s.length, P.LIMITS.minLen, P.LIMITS.maxLen);
      if (Number.isInteger(s.words)) o.words = clamp(s.words, P.LIMITS.minWords, P.LIMITS.maxWords);
      if ([1, 5, 10].indexOf(s.count) >= 0) o.count = s.count;
      if (P.SEPS.indexOf(s.sep) >= 0) o.sep = s.sep;
      ['lower', 'upper', 'digit', 'symbol', 'similar', 'capital', 'number'].forEach(function (k) { if (typeof s[k] === 'boolean') o[k] = s[k]; });
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* mode privat */ } }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function toUi() {
    document.querySelector('input[name=mode][value="' + o.mode + '"]').checked = true;
    document.querySelector('input[name=count][value="' + o.count + '"]').checked = true;
    $('len').value = $('lenN').value = o.length; $('lenV').textContent = o.length;
    $('words').value = $('wordsN').value = o.words; $('wordsV').textContent = o.words;
    $('oLower').checked = o.lower; $('oUpper').checked = o.upper; $('oDigit').checked = o.digit; $('oSymbol').checked = o.symbol; $('oSimilar').checked = o.similar;
    $('sep').value = o.sep; $('oCapital').checked = o.capital; $('oNumber').checked = o.number;
    $('boxRandom').hidden = o.mode !== 'random'; $('boxPhrase').hidden = o.mode !== 'phrase';
  }

  function generate() {
    results = [];
    var ok = o.mode === 'phrase' || o.lower || o.upper || o.digit || o.symbol;
    $('list').hidden = !ok; $('info').hidden = !ok; $('empty').hidden = ok; $('btnGen').disabled = !ok;
    if (!ok) return;
    for (var i = 0; i < o.count; i++) results.push(o.mode === 'random' ? P.genRandom(o) : P.genPhrase(o, W));
    render();
  }

  function fmt(n, opt) { return new Intl.NumberFormat(I.locale, opt).format(n); }
  function render() {
    $('listNote').textContent = t('list_note', { n: fmt(W.length), bits: fmt(Math.log2(W.length)) });
    if ($('empty').hidden === false) return;
    var list = $('list'); list.textContent = '';
    results.forEach(function (pw, idx) {
      var row = document.createElement('div'), val = document.createElement('code'), b = document.createElement('button');
      row.className = 'pw-item'; val.className = 'pw-val';
      for (var i = 0; i < pw.length; i++) {
        var ch = pw.charAt(i), s = document.createElement('span');
        s.className = /[0-9]/.test(ch) ? 'pw-d' : /[A-Za-z]/.test(ch) ? '' : 'pw-s';
        s.textContent = ch; val.appendChild(s);
      }
      b.type = 'button'; b.className = 'btn pw-copy'; b.textContent = t('common.copy');
      b.setAttribute('aria-label', t('copy_n', { n: idx + 1 })); b.setAttribute('data-i', String(idx));
      row.appendChild(val); row.appendChild(b); list.appendChild(row);
    });
    var bits = o.mode === 'random' ? P.entropyRandom(o) : P.entropyPhrase(o, W.length), lv = P.strength(bits), ct = P.crackTime(bits);
    $('sLabel').textContent = t('s_' + lv); $('sBits').textContent = t('bits', { bits: fmt(bits, { maximumFractionDigits: 1 }) });
    $('info').setAttribute('data-level', lv);
    $('meter').style.width = Math.min(100, Math.max(4, bits)) + '%';
    var n = ct.n >= 1000 ? fmt(ct.n, { notation: 'compact' }) : fmt(ct.n);
    $('crack').textContent = t('crack', { t: t('ct_' + ct.unit, { n: n }) });
  }

  function copyText(s, src) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
    return new Promise(function (ok, no) {
      var ta = document.createElement('textarea'); ta.value = s; ta.setAttribute('readonly', ''); ta.className = 'vh';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); } finally { ta.remove(); }
    });
  }
  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    copyText(results[Number(b.getAttribute('data-i'))]).then(function () {
      b.textContent = t('common.copied'); $('live').textContent = t('common.copied');
      setTimeout(function () { if (b.isConnected) b.textContent = t('common.copy'); }, 1400);
    }, function () { /* clipboard ditolak: sandi tetap terlihat dan bisa disalin manual */ });
  });

  /* ---------- kontrol ---------- */
  function setLen(v) { o.length = clamp(v, P.LIMITS.minLen, P.LIMITS.maxLen); $('len').value = $('lenN').value = o.length; $('lenV').textContent = o.length; save(); generate(); }
  function setWords(v) { o.words = clamp(v, P.LIMITS.minWords, P.LIMITS.maxWords); $('words').value = $('wordsN').value = o.words; $('wordsV').textContent = o.words; save(); generate(); }
  $('len').addEventListener('input', function (e) { setLen(Number(e.target.value)); });
  $('lenN').addEventListener('input', function (e) { var v = Number(e.target.value); if (Number.isInteger(v) && v >= P.LIMITS.minLen && v <= P.LIMITS.maxLen) setLen(v); });
  $('lenN').addEventListener('change', function (e) { setLen(Math.round(Number(e.target.value)) || DEF.length); });
  $('words').addEventListener('input', function (e) { setWords(Number(e.target.value)); });
  $('wordsN').addEventListener('input', function (e) { var v = Number(e.target.value); if (Number.isInteger(v) && v >= P.LIMITS.minWords && v <= P.LIMITS.maxWords) setWords(v); });
  $('wordsN').addEventListener('change', function (e) { setWords(Math.round(Number(e.target.value)) || DEF.words); });
  $('modes').addEventListener('change', function (e) { o.mode = e.target.value; $('boxRandom').hidden = o.mode !== 'random'; $('boxPhrase').hidden = o.mode !== 'phrase'; save(); generate(); });
  $('counts').addEventListener('change', function (e) { o.count = Number(e.target.value); save(); generate(); });
  [['oLower', 'lower'], ['oUpper', 'upper'], ['oDigit', 'digit'], ['oSymbol', 'symbol'], ['oSimilar', 'similar'], ['oCapital', 'capital'], ['oNumber', 'number']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (e) { o[p[1]] = e.target.checked; save(); generate(); });
  });
  $('sep').addEventListener('change', function (e) { o.sep = e.target.value; save(); generate(); });
  $('btnGen').addEventListener('click', generate);
  $('btnReset').addEventListener('click', function () { o = Object.assign({}, DEF); save(); toUi(); generate(); });

  I.onReady(function () { load(); toUi(); generate(); });
  document.addEventListener('sagalait:lang', function () { if (results.length) render(); });
})();
