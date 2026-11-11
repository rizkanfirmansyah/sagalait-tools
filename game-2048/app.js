/* Tampilan 2048: papan, ubin beranimasi (transform), kontrol, penyimpanan. Logika ada di engine.js. */
(function () {
  'use strict';
  var E = window.Engine2048, I = window.SagalaI18n;
  var KEY = 'sagalait-2048', MAX_UNDO = 3, DUR = 130;
  var GOAL = { 3: 256, 4: 2048, 5: 4096, 6: 8192 };
  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $('board'), tilesEl = $('tiles'), cellsEl = $('cells'), overEl = $('over');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- penyimpanan ---------- */
  var store = { size: 4, dpad: false, games: {}, best: {} };
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && typeof o === 'object') {
        if ([3, 4, 5, 6].indexOf(o.size) >= 0) store.size = o.size;
        store.dpad = !!o.dpad;
        if (o.games && typeof o.games === 'object') store.games = o.games;
        if (o.best && typeof o.best === 'object') store.best = o.best;
      }
    } catch (e) { /* abaikan: mulai baru */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* mode privat */ } }
  function validGame(g, n) {
    if (!g || !Array.isArray(g.board) || g.board.length !== n * n) return false;
    return g.board.every(function (v) { return v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0); }) &&
      Number.isFinite(g.score) && g.score >= 0 && Number.isFinite(g.moves) && g.moves >= 0;
  }

  /* ---------- keadaan ---------- */
  var n = 4, g = null, undo = [], at = [], over = null; // over: null | 'win' | 'lose'
  function t(k, p) { return I.t(k, p); }
  function fmt(v) { return new Intl.NumberFormat(I.locale).format(v); }
  function best() { return store.best[n] || 0; }

  function fresh() { return { board: E.newGame(n), score: 0, moves: 0, won: false, keep: false }; }

  /* ---------- tampilan ---------- */
  function buildCells() {
    cellsEl.textContent = '';
    for (var i = 0; i < n * n; i++) cellsEl.appendChild(document.createElement('div'));
    boardEl.setAttribute('data-n', String(n));
    boardEl.style.setProperty('--n', String(n));
  }
  function setPos(el, idx) { el.style.setProperty('--c', String(idx % n)); el.style.setProperty('--r', String(Math.floor(idx / n))); }
  function mk(v, idx, cls) {
    var el = document.createElement('div'), inn = document.createElement('div');
    el.className = 't2-tile' + (cls ? ' ' + cls : '');
    inn.className = 't2-in'; inn.textContent = String(v);
    inn.setAttribute('data-v', v > 2048 ? 'super' : String(v));
    inn.setAttribute('data-d', String(Math.min(String(v).length, 5)));
    el.appendChild(inn); setPos(el, idx); tilesEl.appendChild(el); return el;
  }
  function renderAll() {
    tilesEl.textContent = ''; at = new Array(n * n).fill(null);
    g.board.forEach(function (v, i) { if (v) at[i] = mk(v, i); });
    stats();
  }
  function describe() {
    var rows = [], r, c, cells;
    for (r = 0; r < n; r++) {
      cells = [];
      for (c = 0; c < n; c++) cells.push(g.board[r * n + c] || t('empty'));
      rows.push(t('row', { r: r + 1, cells: cells.join(', ') }));
    }
    boardEl.setAttribute('aria-label', t('board', { n: n, score: fmt(g.score), rows: rows.join(' ') }));
  }
  function stats() {
    $('score').textContent = fmt(g.score); $('best').textContent = fmt(best()); $('moves').textContent = fmt(g.moves);
    $('btnUndo').textContent = t('undo', { n: undo.length }); $('btnUndo').disabled = !undo.length;
    $('btnOverUndo').textContent = t('undo', { n: undo.length }); $('btnOverUndo').disabled = !undo.length;
    $('goal').textContent = t('goal', { target: GOAL[n] });
    describe();
  }
  function gain(v) {
    if (reduce.matches || !boardEl.animate || !v) return;
    var s = $('score').parentNode, f = document.createElement('span');
    f.className = 'g2-gain'; f.textContent = '+' + fmt(v); f.setAttribute('aria-hidden', 'true'); s.appendChild(f);
    var a = f.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-18px)' }], { duration: 600, easing: 'ease-out' });
    a.onfinish = function () { f.remove(); };
  }

  /* ---------- gerakan ---------- */
  function showOver(kind, quiet) {
    over = kind;
    $('overT').textContent = t(kind === 'win' ? 'win_t' : 'over_t');
    $('overP').textContent = kind === 'win' ? t('win_p', { target: GOAL[n] }) : t('over_p', { score: fmt(g.score) });
    $('btnKeep').hidden = kind !== 'win'; $('btnOverUndo').hidden = kind === 'win';
    overEl.hidden = false; boardEl.classList.add('is-over');
    if (quiet) return;
    (kind === 'win' ? $('btnKeep') : ($('btnOverUndo').disabled ? $('btnOverNew') : $('btnOverUndo'))).focus();
  }
  function hideOver() { over = null; overEl.hidden = true; boardEl.classList.remove('is-over'); }

  function doMove(dir) {
    if (over) return;
    var res = E.move(g.board, dir);
    if (!res.moved) return;
    undo.push({ board: g.board.slice(), score: g.score, moves: g.moves, won: g.won, keep: g.keep });
    if (undo.length > MAX_UNDO) undo.shift();
    var dur = reduce.matches ? 0 : DUR, next = new Array(n * n).fill(null), gone = [];
    res.moves.forEach(function (m) {
      var el = at[m.from]; if (!el) return;
      setPos(el, m.to);
      if (m.merge) gone.push(el); else next[m.to] = el;
    });
    res.merged.forEach(function (c) { next[c] = mk(res.board[c], c, 'is-merge'); });
    gone.forEach(function (el) { if (dur) setTimeout(function () { el.remove(); }, dur); else el.remove(); });
    var sp = E.spawn(res.board);
    if (sp.index >= 0) next[sp.index] = mk(sp.value, sp.index, 'is-new');
    at = next;
    g.board = sp.board; g.score += res.gained; g.moves++;
    if (g.score > best()) store.best[n] = g.score;
    gain(res.gained); stats(); save2();
    $('live').textContent = t('moved', { dir: t('slide_' + dir), score: fmt(g.score) });
    if (!g.won && !g.keep && E.hasWon(g.board, GOAL[n])) { g.won = true; save2(); showOver('win'); }
    else if (!E.canMove(g.board)) showOver('lose');
  }
  function save2() { store.games[n] = { board: g.board, score: g.score, moves: g.moves, won: g.won, keep: g.keep }; store.size = n; save(); }

  function doUndo() {
    if (!undo.length) return;
    var s = undo.pop();
    g.board = s.board; g.score = s.score; g.moves = s.moves; g.won = s.won; g.keep = s.keep;
    hideOver(); renderAll(); save2(); boardEl.focus();
  }
  function newGame() { g = fresh(); undo = []; hideOver(); renderAll(); save2(); boardEl.focus(); }
  function askNew() {
    if (g.score <= 0) { newGame(); return; }
    $('dlgP').textContent = t('confirm_p', { score: fmt(g.score) });
    $('dlgNew').showModal();
  }
  function setSize(s) {
    if (s === n && g) return;
    n = s; store.size = s;
    var saved = store.games[n];
    g = validGame(saved, n) ? { board: saved.board.slice(), score: saved.score, moves: saved.moves, won: !!saved.won, keep: !!saved.keep } : fresh();
    undo = []; hideOver(); buildCells(); renderAll(); save2();
    document.querySelector('input[name=size][value="' + n + '"]').checked = true;
    if (!E.canMove(g.board)) showOver('lose');
  }

  /* ---------- input ---------- */
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.defaultPrevented || $('dlgNew').open) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') { if (!e.target.closest('button')) { doUndo(); } return; }
    var d = KEYS[e.key];
    if (d) { e.preventDefault(); doMove(d); }
  });
  var sx = 0, sy = 0, sid = null;
  boardEl.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || over) return;
    sid = e.pointerId; sx = e.clientX; sy = e.clientY;
    try { boardEl.setPointerCapture(sid); } catch (x) { /* abaikan */ }
  });
  boardEl.addEventListener('pointerup', function (e) {
    if (e.pointerId !== sid) return; sid = null;
    var dx = e.clientX - sx, dy = e.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy), min = 24;
    if (Math.max(ax, ay) < min) return;
    doMove(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  boardEl.addEventListener('pointercancel', function () { sid = null; });
  $('dpad').addEventListener('click', function (e) { var b = e.target.closest('[data-dir]'); if (b) doMove(b.getAttribute('data-dir')); });

  $('btnUndo').addEventListener('click', doUndo);
  $('btnOverUndo').addEventListener('click', doUndo);
  $('btnNew').addEventListener('click', askNew);
  $('btnOverNew').addEventListener('click', newGame);
  $('btnKeep').addEventListener('click', function () { g.keep = true; hideOver(); save2(); boardEl.focus(); });
  $('dlgNew').addEventListener('close', function () { if ($('dlgNew').returnValue === 'ok') newGame(); });
  $('sizes').addEventListener('change', function (e) { if (e.target.name === 'size') setSize(Number(e.target.value)); });
  $('swDpad').addEventListener('change', function (e) { store.dpad = e.target.checked; $('dpad').hidden = !store.dpad; save(); });

  /* ---------- mulai ---------- */
  I.onReady(function () {
    load();
    $('swDpad').checked = store.dpad; $('dpad').hidden = !store.dpad;
    n = 0; setSize(store.size);
  });
  document.addEventListener('sagalait:lang', function () {
    if (!g) return;
    stats();
    if (over) showOver(over, true);
    if (!$('dlgNew').open) return;
    $('dlgP').textContent = t('confirm_p', { score: fmt(g.score) });
  });
})();
