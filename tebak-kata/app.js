/* Tampilan Tebak kata: papan 6x5, papan ketik, kata harian atau acak, statistik harian. Logika di wordle.js. */
(function () {
  'use strict';
  var W = window.Wordle, WW = window.WordleWords, I = window.SagalaI18n, KEY = 'sagalait-tebak-kata';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  var SYM = { c: '✓', p: '~', a: '×' };
  var valid = new Set(WW.ANSWERS.concat(WW.EXTRA));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var store = { mode: 'daily', stats: { played: 0, won: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], lastWin: null }, daily: null, random: null };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!s) return;
      if (s.mode === 'daily' || s.mode === 'random') store.mode = s.mode;
      if (s.stats && Array.isArray(s.stats.dist) && s.stats.dist.length === 6) store.stats = Object.assign(store.stats, s.stats);
      store.daily = s.daily || null; store.random = s.random || null;
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* mode privat */ } }

  var g = null, cur = '', msgTimer = 0;

  function sanitize(arr) { return Array.isArray(arr) ? arr.filter(function (w) { return typeof w === 'string' && /^[a-z]{5}$/.test(w); }).slice(0, W.TRIES) : []; }
  function makeGame(mode) {
    var today = W.todayLocal(), saved, game;
    if (mode === 'daily') {
      var ans = W.dailyAnswer(WW.ANSWERS, today);
      saved = store.daily && store.daily.date === today ? sanitize(store.daily.guesses) : [];
      game = { mode: mode, date: today, answer: ans, guesses: saved };
    } else {
      var ra = store.random && valid.has(store.random.answer) ? store.random.answer : WW.ANSWERS[Math.floor(Math.random() * WW.ANSWERS.length)];
      saved = store.random && store.random.answer === ra ? sanitize(store.random.guesses) : [];
      game = { mode: mode, date: null, answer: ra, guesses: saved };
    }
    game.results = game.guesses.map(function (x) { return W.evaluate(x, game.answer); });
    game.won = game.guesses.length > 0 && game.guesses[game.guesses.length - 1] === game.answer;
    game.done = game.won || game.guesses.length >= W.TRIES;
    return game;
  }
  function persist() {
    if (g.mode === 'daily') store.daily = { date: g.date, guesses: g.guesses };
    else store.random = { answer: g.answer, guesses: g.guesses };
    store.mode = g.mode; save();
  }

  /* ---------- papan ---------- */
  var tiles = [], keys = {};
  function build() {
    var board = $('board'), r, c;
    for (r = 0; r < W.TRIES; r++) {
      var row = document.createElement('div'); row.className = 'tk-row'; row.setAttribute('role', 'row');
      for (c = 0; c < W.LEN; c++) {
        var tl = document.createElement('div'), b = document.createElement('b'), i = document.createElement('i');
        tl.className = 'tk-t'; tl.setAttribute('role', 'gridcell'); tl.setAttribute('data-s', 'e'); i.setAttribute('aria-hidden', 'true');
        tl.appendChild(b); tl.appendChild(i); row.appendChild(tl); tiles.push(tl);
      }
      board.appendChild(row);
    }
    var kb = $('kb');
    ['qwertyuiop', 'asdfghjkl', '*zxcvbnm#'].forEach(function (line) {
      var row = document.createElement('div'); row.className = 'tk-krow';
      line.split('').forEach(function (ch) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'tk-k';
        if (ch === '*') { b.className += ' tk-wide'; b.setAttribute('data-k', 'Enter'); }
        else if (ch === '#') { b.className += ' tk-wide'; b.setAttribute('data-k', 'Backspace'); }
        else { b.setAttribute('data-k', ch); b.textContent = ch; keys[ch] = b; }
        row.appendChild(b);
        if (ch === '*') keys.Enter = b; if (ch === '#') keys.Back = b;
      });
      kb.appendChild(row);
    });
  }

  function render() {
    var r, c, k, st = W.keyStates(g.guesses, g.results);
    for (r = 0; r < W.TRIES; r++) for (c = 0; c < W.LEN; c++) {
      var tl = tiles[r * W.LEN + c], letter = '', state = 'e';
      if (r < g.guesses.length) { letter = g.guesses[r][c]; state = g.results[r][c]; }
      else if (r === g.guesses.length && !g.done) { letter = cur[c] || ''; state = letter ? 't' : 'e'; }
      tl.setAttribute('data-s', state);
      tl.firstChild.textContent = letter.toUpperCase(); tl.lastChild.textContent = SYM[state] || '';
      var sn = state === 'e' || state === 't' ? 's_e' : 's_' + state;
      tl.setAttribute('aria-label', letter ? t('tile_l', { r: r + 1, c: c + 1, letter: letter.toUpperCase(), state: state === 't' ? '' : t(sn) }).replace(/, $/, '') : t('tile', { r: r + 1, c: c + 1, state: t('s_e') }));
    }
    'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function (ch) { keys[ch].setAttribute('data-s', st[ch] || ''); keys[ch].setAttribute('aria-label', ch.toUpperCase() + (st[ch] ? ', ' + t('s_' + st[ch]) : '')); keys[ch].disabled = g.done; });
    keys.Enter.textContent = t('k_enter'); keys.Enter.setAttribute('aria-label', t('k_enter_l')); keys.Enter.disabled = g.done;
    keys.Back.textContent = '⌫'; keys.Back.setAttribute('aria-label', t('k_back_l')); keys.Back.disabled = g.done;
    $('end').hidden = !g.done;
    if (g.done) {
      $('result').textContent = g.won ? t('win', { n: g.guesses.length }) : t('lose', { word: g.answer.toUpperCase() });
      $('btnDaily').hidden = g.mode === 'daily';
      $('btnNew').hidden = false;
    }
    document.querySelector('input[name=mode][value="' + g.mode + '"]').checked = true;
    renderStats();
  }
  function renderStats() {
    var s = store.stats, box = $('stats'); box.textContent = '';
    [['played', s.played], ['winpct', (s.played ? Math.round(100 * s.won / s.played) : 0) + '%'], ['streak', s.streak], ['best', s.best]].forEach(function (p) {
      var d = document.createElement('div'), v = document.createElement('strong'), k = document.createElement('span');
      d.className = 'tk-stat'; v.textContent = String(p[1]); k.textContent = t(p[0]); d.appendChild(v); d.appendChild(k); box.appendChild(d);
    });
    var max = Math.max.apply(null, s.dist.concat([1])), ol = $('dist'); ol.textContent = '';
    s.dist.forEach(function (n, i) {
      var li = document.createElement('li'), l = document.createElement('span'), bar = document.createElement('span'), v = document.createElement('span');
      li.setAttribute('aria-label', t('dist_row', { n: i + 1, c: n }));
      l.textContent = String(i + 1); l.setAttribute('aria-hidden', 'true'); bar.className = 'tk-bar'; bar.setAttribute('aria-hidden', 'true');
      var fill = document.createElement('span'); fill.style.width = Math.max(n ? 8 : 0, Math.round(100 * n / max)) + '%'; bar.appendChild(fill);
      v.textContent = String(n); v.setAttribute('aria-hidden', 'true'); li.appendChild(l); li.appendChild(bar); li.appendChild(v); ol.appendChild(li);
    });
  }

  function say(text, ms) {
    var m = $('msg'); m.textContent = text; clearTimeout(msgTimer);
    if (ms) msgTimer = setTimeout(function () { m.textContent = ''; }, ms);
  }
  function shake() {
    if (reduce.matches) return;
    var row = tiles[g.guesses.length * W.LEN].parentNode; row.classList.remove('is-shake'); void row.offsetWidth; row.classList.add('is-shake');
  }

  function finishStats() {
    if (g.mode !== 'daily') return;
    var s = store.stats; s.played++;
    if (g.won) {
      s.won++; s.dist[g.guesses.length - 1]++;
      s.streak = s.lastWin && W.dayNumber(g.date) - W.dayNumber(s.lastWin) === 1 ? s.streak + 1 : 1;
      s.lastWin = g.date; s.best = Math.max(s.best, s.streak);
    } else s.streak = 0;
  }
  function type(ch) { if (!g.done && cur.length < W.LEN) { cur += ch; render(); } }
  function back() { if (!g.done && cur.length) { cur = cur.slice(0, -1); render(); } }
  function submit() {
    if (g.done) return;
    var v = W.validate(cur, valid);
    if (!v.ok) { say(t(v.reason === 'short' ? 'm_short' : v.reason === 'chars' ? 'm_chars' : 'm_unknown'), 2200); shake(); return; }
    g.guesses.push(v.word); g.results.push(W.evaluate(v.word, g.answer)); cur = '';
    g.won = v.word === g.answer; g.done = g.won || g.guesses.length >= W.TRIES;
    if (g.done) { finishStats(); say('', 0); }
    persist(); render();
  }
  function start(mode, fresh) {
    if (mode === 'random' && fresh) store.random = null;
    g = makeGame(mode); cur = ''; say('', 0);
    if (mode === 'daily' && g.done) say(t('daily_done'), 0);
    persist(); render();
  }

  /* ---------- input ---------- */
  document.addEventListener('keydown', function (e) {
    if (!g || g.done || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    var k = e.key;
    if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); type(k.toLowerCase()); }
    else if (k === 'Backspace') { e.preventDefault(); back(); }
    else if (k === 'Enter') { e.preventDefault(); submit(); }
  });
  $('kb').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    var k = b.getAttribute('data-k');
    if (k === 'Enter') submit(); else if (k === 'Backspace') back(); else type(k);
  });
  $('modes').addEventListener('change', function (e) { start(e.target.value, false); e.target.blur(); });
  $('btnNew').addEventListener('click', function () { start('random', true); });
  $('btnDaily').addEventListener('click', function () { start('daily', false); });
  $('btnShare').addEventListener('click', function () {
    var title = g.mode === 'daily' ? t('share_daily', { date: g.date }) : t('share_random'), b = $('btnShare'), text = W.shareText(title, g.results, g.won);
    var ok = function () { b.textContent = t('common.copied'); setTimeout(function () { b.textContent = t('share'); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { say(text, 0); });
    else say(text, 0);
  });

  build();
  I.onReady(function () { load(); start(store.mode, false); });
  document.addEventListener('sagalait:lang', function () { if (g) { render(); if (g.mode === 'daily' && g.done) say(t('daily_done'), 0); $('btnShare').textContent = t('share'); } });
})();
