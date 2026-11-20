/* Tampilan Memory cards. Aturan permainan di engine.js, bentuk ikon di ikon.js. Yang disimpan hanya ukuran papan dan rekor. */
(function () {
  'use strict';
  var E = window.MemoryEngine, ICONS = window.MemoryIcons.ICONS, I = window.SagalaI18n, KEY = 'sagalait-memory', NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var size = '4x4', best = {};
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (E.SIZES[s.size]) size = s.size;
      if (s.best && typeof s.best === 'object') Object.keys(E.SIZES).forEach(function (k) { var r = s.best[k]; if (r && r.moves >= 1 && r.ms >= 0) best[k] = { moves: r.moves | 0, ms: r.ms | 0 }; });
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ size: size, best: best })); } catch (e) { /* mode privat */ } }

  var game, startedAt = 0, ms = 0, tick = 0, pending = 0, els = [];
  function nameOf(sym) { return t('ik_' + sym); }

  /* ---------- gambar ikon ---------- */
  function svgIcon(sym) {
    var sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('aria-hidden', 'true'); sv.setAttribute('focusable', 'false');
    ICONS[sym].s.forEach(function (sh) {
      var n = document.createElementNS(NS, sh.t);
      if (sh.t === 'path') n.setAttribute('d', sh.d); else { n.setAttribute('cx', sh.cx); n.setAttribute('cy', sh.cy); n.setAttribute('r', sh.r); }
      n.setAttribute('fill', sh.fill ? 'currentColor' : 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', sh.w || 2); n.setAttribute('stroke-linejoin', 'round'); n.setAttribute('stroke-linecap', 'round');
      sv.appendChild(n);
    });
    return sv;
  }

  /* ---------- papan ---------- */
  function label(i) {
    var c = game.cards[i], cfg = E.SIZES[size], p = { n: i + 1, r: Math.floor(i / cfg.cols) + 1, c: (i % cfg.cols) + 1 };
    if (c.state === 'down') return t('card_down', p);
    p.name = nameOf(c.sym); return t(c.state === 'matched' ? 'card_matched' : 'card_up', p);
  }
  function paint(i) {
    var b = els[i], c = game.cards[i]; b.classList.toggle('is-up', c.state === 'up'); b.classList.toggle('is-matched', c.state === 'matched');
    b.setAttribute('aria-label', label(i)); b.setAttribute('aria-pressed', c.state === 'down' ? 'false' : 'true');
  }
  function build() {
    var cfg = E.SIZES[size], board = $('board'); board.textContent = ''; els = [];
    board.style.setProperty('--cols', cfg.cols); board.setAttribute('aria-label', t('board_label', { size: size.replace('x', '×') }));
    game.cards.forEach(function (c, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mc-card mc-c' + (c.sym % 6); b.setAttribute('data-i', i); b.setAttribute('data-sym', c.sym); b.tabIndex = i === 0 ? 0 : -1;
      var inn = document.createElement('span'); inn.className = 'mc-in';
      var back = document.createElement('span'); back.className = 'mc-face mc-back';
      var front = document.createElement('span'); front.className = 'mc-face mc-front'; front.appendChild(svgIcon(c.sym));
      inn.appendChild(back); inn.appendChild(front); b.appendChild(inn); board.appendChild(b); els.push(b); paint(i);
    });
  }

  /* ---------- status ---------- */
  function showBest() { var r = best[size]; $('sBest').textContent = r ? t('best_v', { moves: r.moves, time: E.formatTime(r.ms) }) : t('best_none'); }
  function showStats() { $('sMoves').textContent = game.moves; $('sPairs').textContent = game.matched + '/' + game.pairs; $('sTime').textContent = E.formatTime(ms); }
  function stopTimer() { clearInterval(tick); tick = 0; }
  function startTimer() { startedAt = Date.now() - ms; tick = setInterval(function () { ms = Date.now() - startedAt; $('sTime').textContent = E.formatTime(ms); }, 250); }
  function say(msg) { $('live').textContent = ''; setTimeout(function () { $('live').textContent = msg; }, 30); }

  function newGame() {
    clearTimeout(pending); pending = 0; stopTimer(); ms = 0; startedAt = 0;
    game = E.create(E.SIZES[size].pairs); $('win').hidden = true; build(); showStats(); showBest(); $('live').textContent = '';
  }

  function closeMismatch() {
    clearTimeout(pending); pending = 0;
    E.resolve(game).forEach(paint);
  }
  function flipCard(i) {
    if (game.won) return;
    if (game.open.length === 2) closeMismatch(); /* klik berikutnya langsung menutup pasangan salah, tanpa menunggu */
    var r = E.flip(game, i); if (r.type === 'ignored') return;
    if (!startedAt) startTimer();
    paint(i);
    if (r.type === 'mismatch') { say(t('live_miss')); pending = setTimeout(closeMismatch, reduce ? 600 : 900); }
    else if (r.type === 'match') {
      r.pair.forEach(paint); showStats();
      if (r.won) win(); else say(t('live_match', { name: nameOf(r.sym) }));
    }
    showStats();
  }
  function win() {
    stopTimer(); ms = Date.now() - startedAt; showStats();
    var rec = E.better(best[size], game.moves, ms); if (rec) { best[size] = { moves: game.moves, ms: ms }; save(); showBest(); }
    $('winText').textContent = t('win_text', { moves: game.moves, time: E.formatTime(ms) }); $('winRec').textContent = rec ? t('win_record', { size: size.replace('x', '×') }) : '';
    $('win').hidden = false; say(t('live_win', { moves: game.moves, time: E.formatTime(ms) }));
    $('btnAgain').focus();
  }

  /* ---------- peristiwa ---------- */
  $('board').addEventListener('click', function (e) { var b = e.target.closest('.mc-card'); if (b) flipCard(+b.getAttribute('data-i')); });
  $('board').addEventListener('keydown', function (e) {
    var b = e.target.closest('.mc-card'); if (!b) return;
    var i = +b.getAttribute('data-i'), cols = E.SIZES[size].cols, n = els.length, to = -1;
    if (e.key === 'ArrowRight') to = Math.min(n - 1, i + 1); else if (e.key === 'ArrowLeft') to = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') to = i + cols < n ? i + cols : i; else if (e.key === 'ArrowUp') to = i - cols >= 0 ? i - cols : i;
    else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = n - 1; else return;
    e.preventDefault(); els.forEach(function (x, k) { x.tabIndex = k === to ? 0 : -1; }); els[to].focus();
  });
  $('board').addEventListener('focusin', function (e) { var b = e.target.closest('.mc-card'); if (b) els.forEach(function (x) { x.tabIndex = x === b ? 0 : -1; }); });
  $('sizes').addEventListener('change', function (e) { size = e.target.value; save(); newGame(); });
  $('btnNew').addEventListener('click', newGame);
  $('btnAgain').addEventListener('click', function () { newGame(); els[0].focus(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && tick) { stopTimer(); ms = Date.now() - startedAt; } else if (!document.hidden && startedAt && !game.won && !tick) startTimer(); });

  I.onReady(function () { document.querySelector('input[name=size][value="' + size + '"]').checked = true; newGame(); });
  document.addEventListener('sagalait:lang', function () {
    if (!game) return; $('board').setAttribute('aria-label', t('board_label', { size: size.replace('x', '×') })); els.forEach(function (_, i) { paint(i); }); showBest();
    if (game.won) { $('winText').textContent = t('win_text', { moves: game.moves, time: E.formatTime(ms) }); }
  });
})();
