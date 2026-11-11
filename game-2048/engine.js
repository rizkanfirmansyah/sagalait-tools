/* Logika murni 2048 (tanpa DOM). Papan: array n*n, baris demi baris, 0 = kosong. */
(function (root) {
  'use strict';
  var DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  function empty(n) { return new Array(n * n).fill(0); }
  function size(board) { return Math.round(Math.sqrt(board.length)); }

  /* Garis (baris/kolom) sebagai daftar indeks, urut dari sisi tujuan gerakan. */
  function lines(n, dir) {
    var out = [], i, j, line;
    for (i = 0; i < n; i++) {
      line = [];
      for (j = 0; j < n; j++) {
        if (dir === 'left') line.push(i * n + j);
        else if (dir === 'right') line.push(i * n + (n - 1 - j));
        else if (dir === 'up') line.push(j * n + i);
        else line.push((n - 1 - j) * n + i);
      }
      out.push(line);
    }
    return out;
  }

  /* move: murni. Mengembalikan { board, gained, moved, moves, merged }.
     moves: [{ from, to, value, merge }] untuk animasi; merged: indeks sel hasil gabungan. */
  function move(board, dir) {
    if (!DIRS[dir]) throw new Error('arah tidak valid: ' + dir);
    var n = size(board), next = board.slice(), gained = 0, moves = [], merged = [], moved = false;
    lines(n, dir).forEach(function (idx) {
      var tiles = [], k;
      for (k = 0; k < n; k++) if (board[idx[k]]) tiles.push({ from: idx[k], value: board[idx[k]] });
      var out = [], t = 0;
      while (t < tiles.length) {
        if (t + 1 < tiles.length && tiles[t].value === tiles[t + 1].value) {
          var v = tiles[t].value * 2;
          out.push({ value: v, srcs: [tiles[t].from, tiles[t + 1].from], merge: true });
          gained += v; t += 2;
        } else { out.push({ value: tiles[t].value, srcs: [tiles[t].from], merge: false }); t += 1; }
      }
      for (k = 0; k < n; k++) {
        var cell = idx[k], o = out[k];
        next[cell] = o ? o.value : 0;
        if (o) {
          o.srcs.forEach(function (s) { moves.push({ from: s, to: cell, value: board[s], merge: o.merge }); if (s !== cell) moved = true; });
          if (o.merge) { merged.push(cell); moved = true; }
        }
      }
    });
    return { board: moved ? next : board.slice(), gained: moved ? gained : 0, moved: moved, moves: moves, merged: merged };
  }

  function emptyCells(board) { var r = []; for (var i = 0; i < board.length; i++) if (!board[i]) r.push(i); return r; }

  /* spawn: 90% ubin 2, 10% ubin 4 di sel kosong acak. rng() di [0,1) bisa disuntik. */
  function spawn(board, rng) {
    rng = rng || Math.random;
    var cells = emptyCells(board);
    if (!cells.length) return { board: board.slice(), index: -1, value: 0 };
    var idx = cells[Math.min(cells.length - 1, Math.floor(rng() * cells.length))];
    var value = rng() < 0.9 ? 2 : 4, b = board.slice();
    b[idx] = value;
    return { board: b, index: idx, value: value };
  }

  function newGame(n, rng) {
    var b = empty(n);
    b = spawn(b, rng).board;
    return spawn(b, rng).board;
  }

  function canMove(board) {
    if (emptyCells(board).length) return true;
    var n = size(board), i, j;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      var v = board[i * n + j];
      if (j + 1 < n && board[i * n + j + 1] === v) return true;
      if (i + 1 < n && board[(i + 1) * n + j] === v) return true;
    }
    return false;
  }

  function maxTile(board) { var m = 0; for (var i = 0; i < board.length; i++) if (board[i] > m) m = board[i]; return m; }
  function hasWon(board, target) { return maxTile(board) >= (target || 2048); }
  function sum(board) { var s = 0; for (var i = 0; i < board.length; i++) s += board[i]; return s; }

  /* Mulai dari satu ubin 2 atau 4 di awal. */
  var api = { move: move, spawn: spawn, newGame: newGame, canMove: canMove, hasWon: hasWon, maxTile: maxTile, sum: sum, emptyCells: emptyCells, empty: empty, size: size, DIRS: Object.keys(DIRS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Engine2048 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
