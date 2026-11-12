/* Tampilan Sudoku: papan 9x9, catatan pensil, urungkan/ulangi, petunjuk, pewaktu, bagikan soal. Logika di engine.js. */
(function () {
  'use strict';
  var E = window.EngineSudoku, I = window.SagalaI18n;
  var KEY = 'sagalait-sudoku', LEVELS = ['easy', 'medium', 'hard', 'expert'];
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }

  /* ---------- penyimpanan ---------- */
  var store = { level: 'easy', auto: true, best: {}, game: null };
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && typeof o === 'object') {
        if (LEVELS.indexOf(o.level) >= 0) store.level = o.level;
        store.auto = o.auto !== false;
        if (o.best && typeof o.best === 'object') store.best = o.best;
        store.game = o.game || null;
      }
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* mode privat */ } }

  /* ---------- keadaan ---------- */
  var g = null, sel = -1, pencil = false, paused = false, past = [], future = [], overKind = null;
  var last = 0, tickId = 0;

  function running() { return g && !g.done && !paused && !document.hidden; }
  function tick() {
    var now = performance.now();
    if (g && last && running()) g.elapsed += now - last;
    last = now;
  }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, c = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (c < 10 ? '0' : '') + c;
  }
  function pack() {
    store.game = { puzzle: E.format(g.puzzle), vals: E.format(g.vals), notes: g.notes, hinted: Object.keys(g.hinted).map(Number), hints: g.hints, elapsed: Math.round(g.elapsed), custom: g.custom, level: g.level, done: g.done };
    save();
  }
  function restore(o) {
    if (!o || typeof o.puzzle !== 'string' || typeof o.vals !== 'string') return null;
    var p = E.parse(o.puzzle), v = E.parse(o.vals);
    if (!p.grid || !v.grid || !Array.isArray(o.notes) || o.notes.length !== 81) return null;
    for (var k = 0; k < 81; k++) {
      if (p.grid[k] && v.grid[k] !== p.grid[k]) return null;
      if (!Number.isInteger(o.notes[k]) || o.notes[k] < 0 || o.notes[k] > 511) return null;
    }
    var sol = E.solve(p.grid); if (!sol) return null;
    var hinted = {}; (o.hinted || []).forEach(function (i) { if (i >= 0 && i < 81 && !p.grid[i]) hinted[i] = 1; });
    return { puzzle: p.grid, sol: sol, vals: v.grid, notes: o.notes.slice(), hinted: hinted, hints: Math.max(0, o.hints | 0), elapsed: Math.max(0, +o.elapsed || 0), custom: !!o.custom, level: LEVELS.indexOf(o.level) >= 0 ? o.level : 'easy', done: !!o.done };
  }
  function startGame(puzzle, sol, level, custom) {
    g = { puzzle: puzzle, sol: sol, vals: puzzle.slice(), notes: new Array(81).fill(0), hinted: {}, hints: 0, elapsed: 0, custom: custom, level: level, done: false };
    past = []; future = []; sel = -1; paused = false; hideOver(); last = performance.now();
    afterChange(); pack();
  }
  function newGame() { var r = E.generate(store.level); startGame(r.puzzle, r.solution, store.level, false); $('board').querySelector('[data-i="40"]').focus(); sel = 40; render(); }

  /* ---------- papan ---------- */
  var cells = [], boardEl = $('board');
  function build() {
    for (var r = 0; r < 9; r++) {
      var row = document.createElement('div'); row.className = 'sd-row9'; row.setAttribute('role', 'row');
      for (var c = 0; c < 9; c++) {
        var i = r * 9 + c, el = document.createElement('div'), v = document.createElement('span'), nt = document.createElement('span');
        el.className = 'sd-c'; el.setAttribute('role', 'gridcell'); el.setAttribute('tabindex', '-1');
        el.setAttribute('data-i', String(i)); el.setAttribute('data-r', String(r)); el.setAttribute('data-c', String(c));
        v.className = 'sd-v9'; nt.className = 'sd-notes'; nt.setAttribute('aria-hidden', 'true');
        for (var d = 1; d <= 9; d++) nt.appendChild(document.createElement('span'));
        el.appendChild(v); el.appendChild(nt); row.appendChild(el); cells.push(el);
      }
      boardEl.appendChild(row);
    }
    var pad = $('pad'), b;
    for (var n = 1; n <= 9; n++) {
      b = document.createElement('button'); b.type = 'button'; b.className = 'sd-key'; b.setAttribute('data-d', String(n));
      b.appendChild(document.createElement('span')); b.appendChild(document.createElement('small')); pad.appendChild(b);
    }
    b = document.createElement('button'); b.type = 'button'; b.className = 'sd-key sd-erase'; b.setAttribute('data-d', '0'); pad.appendChild(b);
  }

  function noteList(m) { var a = []; for (var d = 1; d <= 9; d++) if (m & (1 << (d - 1))) a.push(d); return a; }
  function render() {
    if (!g) return;
    var bad = {}; if (store.auto) E.conflicts(g.vals).forEach(function (k) { bad[k] = 1; });
    var sv = sel >= 0 ? g.vals[sel] : 0, count = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], k;
    var peer = {}; if (sel >= 0) E.PEERS[sel].forEach(function (p) { peer[p] = 1; });
    for (k = 0; k < 81; k++) {
      var el = cells[k], v = g.vals[k], given = !!g.puzzle[k], hint = !!g.hinted[k];
      count[v]++;
      el.classList.toggle('is-given', given); el.classList.toggle('is-hint', hint);
      el.classList.toggle('is-sel', k === sel); el.classList.toggle('is-peer', !!peer[k]);
      el.classList.toggle('is-same', !!sv && v === sv && k !== sel); el.classList.toggle('is-bad', !!bad[k]);
      el.setAttribute('tabindex', k === (sel >= 0 ? sel : 40) ? '0' : '-1');
      el.firstChild.textContent = v ? String(v) : '';
      var spans = el.lastChild.childNodes, m = v ? 0 : g.notes[k];
      for (var d = 0; d < 9; d++) spans[d].textContent = m & (1 << d) ? String(d + 1) : '';
      var pos = t('pos', { r: Math.floor(k / 9) + 1, c: (k % 9) + 1 }), label;
      if (v) label = t(given ? 'c_given' : hint ? 'c_hint' : 'c_val', { pos: pos, v: v }) + (bad[k] ? t('c_bad') : '');
      else label = m ? t('c_notes', { pos: pos, notes: noteList(m).join(', ') }) : t('c_empty', { pos: pos });
      el.setAttribute('aria-label', label);
    }
    var keys = $('pad').childNodes;
    for (k = 0; k < 9; k++) {
      var left = Math.max(0, 9 - count[k + 1]);
      keys[k].firstChild.textContent = String(k + 1); keys[k].lastChild.textContent = String(left);
      keys[k].disabled = left === 0 || g.done; keys[k].setAttribute('aria-label', t('pad', { d: k + 1, n: left }));
    }
    keys[9].textContent = t('erase'); keys[9].setAttribute('aria-label', t('erase_l')); keys[9].disabled = g.done;
    $('hintsUsed').textContent = String(g.hints);
    var bst = g.custom ? null : store.best[g.level];
    $('rec').textContent = bst ? fmtTime(bst) : '–';
    $('btnPencil').setAttribute('aria-pressed', String(pencil));
    $('btnUndo').disabled = !past.length || g.done; $('btnRedo').disabled = !future.length || g.done;
    $('btnHint').disabled = g.done;
    $('btnPause').textContent = t(paused ? 'resume' : 'pause'); $('btnPause').disabled = g.done;
    $('cur').value = E.format(g.puzzle);
    $('lvDesc').textContent = t('lvd_' + store.level);
    boardEl.classList.toggle('is-paused', paused);
    showTime();
  }
  function showTime() { if (g) $('time').textContent = fmtTime(g.elapsed); }
  function afterChange() { render(); }

  /* ---------- lapisan jeda dan selesai ---------- */
  function showOver(kind, quiet) {
    overKind = kind;
    $('overT').textContent = t(kind === 'done' ? 'done_t' : 'paused_t');
    $('overP').textContent = kind === 'done' ? t('done_p', { time: fmtTime(g.elapsed), hints: g.hints }) : t('paused_p');
    var p2 = '';
    if (kind === 'done' && !g.custom) {
      var lvl = t('lv_' + g.level);
      p2 = g.hints > 0 ? t('done_nohint') : (g.newBest ? t('done_new', { level: lvl }) : t('done_rec', { level: lvl, time: fmtTime(store.best[g.level]) }));
    }
    $('overP2').textContent = p2; $('overP2').hidden = !p2;
    $('btnResume').hidden = kind === 'done';
    $('over').hidden = false;
    if (!quiet) (kind === 'done' ? $('btnOverNew') : $('btnResume')).focus();
  }
  function hideOver() { overKind = null; $('over').hidden = true; }
  function setPause(p) {
    tick(); paused = p && !g.done;
    if (paused) showOver('pause'); else { hideOver(); if (sel >= 0) cells[sel].focus(); }
    last = performance.now(); render(); pack();
  }

  /* ---------- aksi ---------- */
  function snap() { return { vals: g.vals.slice(), notes: g.notes.slice(), hinted: Object.assign({}, g.hinted) }; }
  function push() { past.push(snap()); if (past.length > 500) past.shift(); future = []; }
  function apply(s) { g.vals = s.vals; g.notes = s.notes; g.hinted = s.hinted; }
  function undo() { if (!past.length || g.done || paused) return; future.push(snap()); apply(past.pop()); render(); pack(); }
  function redo() { if (!future.length || g.done || paused) return; past.push(snap()); apply(future.pop()); render(); pack(); }
  function editable() { return g && !g.done && !paused && sel >= 0 && !g.puzzle[sel] && !g.hinted[sel]; }

  function finishCheck() {
    if (g.vals.indexOf(0) >= 0 || E.conflicts(g.vals).length) return;
    tick(); g.done = true; g.newBest = false;
    if (!g.custom && g.hints === 0 && (!store.best[g.level] || g.elapsed < store.best[g.level])) { store.best[g.level] = Math.round(g.elapsed); g.newBest = true; }
    render(); pack(); showOver('done');
    $('live').textContent = t('done_t');
  }
  function enter(d) {
    if (!editable()) return;
    if (pencil && d) {
      if (g.vals[sel]) return;
      push(); g.notes[sel] ^= 1 << (d - 1);
    } else {
      push();
      if (!d || g.vals[sel] === d) { if (g.vals[sel]) g.vals[sel] = 0; else g.notes[sel] = 0; }
      else {
        g.vals[sel] = d; g.notes[sel] = 0;
        E.PEERS[sel].forEach(function (p) { g.notes[p] &= ~(1 << (d - 1)); });
      }
    }
    render(); pack(); finishCheck();
  }
  function hint() {
    if (!g || g.done || paused) return;
    var target = -1, k;
    if (sel >= 0 && !g.puzzle[sel] && g.vals[sel] !== g.sol[sel]) target = sel;
    else {
      var open = []; for (k = 0; k < 81; k++) if (g.vals[k] !== g.sol[k]) open.push(k);
      if (!open.length) return;
      target = open[Math.floor(Math.random() * open.length)];
    }
    push(); g.vals[target] = g.sol[target]; g.notes[target] = 0; g.hinted[target] = 1; g.hints++;
    E.PEERS[target].forEach(function (p) { g.notes[p] &= ~(1 << (g.sol[target] - 1)); });
    sel = target; render(); pack(); finishCheck();
  }
  function select(i) { sel = i; render(); cells[i].focus(); }

  /* ---------- input ---------- */
  boardEl.addEventListener('pointerdown', function (e) {
    var c = e.target.closest && e.target.closest('.sd-c');
    if (c && !paused && !g.done) { e.preventDefault(); select(Number(c.getAttribute('data-i'))); }
  });
  $('pad').addEventListener('click', function (e) { var b = e.target.closest('button[data-d]'); if (b) enter(Number(b.getAttribute('data-d'))); });
  $('btnPencil').addEventListener('click', function () { pencil = !pencil; render(); });
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnHint').addEventListener('click', hint);
  $('btnPause').addEventListener('click', function () { setPause(!paused); });
  $('btnResume').addEventListener('click', function () { setPause(false); });
  $('btnOverNew').addEventListener('click', function () { newGame(); });
  $('swAuto').addEventListener('change', function (e) { store.auto = e.target.checked; save(); render(); });
  $('levels').addEventListener('change', function (e) { if (e.target.name === 'level') { store.level = e.target.value; save(); $('lvDesc').textContent = t('lvd_' + store.level); } });

  function progress() {
    if (!g || g.done) return false;
    for (var k = 0; k < 81; k++) if (g.vals[k] !== g.puzzle[k] || g.notes[k]) return true;
    return false;
  }
  $('btnNew').addEventListener('click', function () { if (progress()) $('dlgNew').showModal(); else newGame(); });
  $('dlgNew').addEventListener('close', function () { if ($('dlgNew').returnValue === 'ok') newGame(); });

  var MOVE = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
  document.addEventListener('keydown', function (e) {
    if (!g || e.altKey || e.defaultPrevented || $('dlgNew').open) return;
    var tg = e.target.closest ? e.target.closest('input, select, textarea') : null;
    if (tg && !(tg.type === 'checkbox' && (e.ctrlKey || e.metaKey))) return;
    var k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z' || k === 'Z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === 'y' || k === 'Y') { e.preventDefault(); redo(); }
      return;
    }
    if (paused || g.done) return;
    if (MOVE[k] !== undefined) {
      e.preventDefault();
      if (sel < 0) { select(40); return; }
      var r = Math.floor(sel / 9), c = sel % 9;
      if ((k === 'ArrowLeft' && c === 0) || (k === 'ArrowRight' && c === 8) || (k === 'ArrowUp' && r === 0) || (k === 'ArrowDown' && r === 8)) return;
      select(sel + MOVE[k]);
    } else if (/^[1-9]$/.test(k)) { enter(Number(k)); }
    else if (k === '0' || k === 'Backspace' || k === 'Delete') { e.preventDefault(); enter(0); }
    else if (k === 'p' || k === 'P') { pencil = !pencil; render(); }
    else if ((k === 'h' || k === 'H') && !(e.target.closest && e.target.closest('button'))) { hint(); }
  });
  document.addEventListener('visibilitychange', function () { tick(); if (document.hidden && g) pack(); last = performance.now(); });
  window.addEventListener('pagehide', function () { tick(); if (g) pack(); });

  /* ---------- bagikan dan muat ---------- */
  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
    return new Promise(function (ok, no) { var f = $('cur'); f.select(); try { document.execCommand('copy') ? ok() : no(); } catch (x) { no(x); } });
  }
  $('btnCopy').addEventListener('click', function () {
    var b = $('btnCopy');
    copyText($('cur').value).then(function () { b.textContent = t('common.copied'); setTimeout(function () { b.textContent = t('copy_q'); }, 1400); }, function () { $('cur').select(); });
  });
  $('btnLoad').addEventListener('click', function () {
    var msg = $('loadMsg'), r = E.parse($('load').value);
    msg.classList.remove('is-ok'); msg.classList.add('is-bad');
    if (r.error === 'length') { msg.textContent = t('err_len', { n: r.n }); return; }
    if (r.error === 'char') { msg.textContent = t('err_chr', { n: r.index + 1 }); return; }
    if (E.conflicts(r.grid).length) { msg.textContent = t('err_conf'); return; }
    var n = E.countSolutions(r.grid, 2);
    if (n === 0) { msg.textContent = t('err_none'); return; }
    if (n > 1) { msg.textContent = t('err_multi'); return; }
    startGame(r.grid, E.solve(r.grid), store.level, true);
    msg.classList.remove('is-bad'); msg.classList.add('is-ok'); msg.textContent = t('load_ok'); $('load').value = '';
  });
  $('load').addEventListener('input', function () { $('loadMsg').textContent = ''; });

  /* ---------- mulai ---------- */
  build();
  I.onReady(function () {
    load();
    $('swAuto').checked = store.auto;
    document.querySelector('input[name=level][value="' + store.level + '"]').checked = true;
    var saved = restore(store.game);
    if (saved) { g = saved; last = performance.now(); render(); if (g.done) showOver('done', true); }
    else { var r = E.generate(store.level); startGame(r.puzzle, r.solution, store.level, false); }
    tickId = setInterval(function () { tick(); showTime(); if (g && running() && Math.round(g.elapsed) % 5000 < 600) pack(); }, 500);
  });
  document.addEventListener('sagalait:lang', function () { if (!g) return; render(); if (overKind) showOver(overKind, true); });
})();
