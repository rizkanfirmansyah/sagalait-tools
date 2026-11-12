/* Logika murni Sudoku (tanpa DOM). Grid: array 81 angka, 0 = kosong, baris demi baris. */
(function (root) {
  'use strict';
  var FULL = 0x1FF, POP = [], i, j;
  for (i = 0; i < 512; i++) { var c = 0, x = i; while (x) { c += x & 1; x >>= 1; } POP[i] = c; }
  var ROW = [], COL = [], BOX = [], PEERS = [];
  for (i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9); COL[i] = i % 9; BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  for (i = 0; i < 81; i++) {
    var p = [];
    for (j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    PEERS[i] = p;
  }
  var UNITS = [];
  for (i = 0; i < 9; i++) {
    var r = [], c2 = [], b = [];
    for (j = 0; j < 81; j++) { if (ROW[j] === i) r.push(j); if (COL[j] === i) c2.push(j); if (BOX[j] === i) b.push(j); }
    UNITS.push(r, c2, b);
  }

  /* tingkat: petunjuk (lo..hi) dan teknik yang boleh dipakai agar soal tetap terselesaikan */
  var LEVELS = {
    easy: { lo: 40, hi: 45, tech: 'naked' },
    medium: { lo: 32, hi: 36, tech: 'hidden' },
    hard: { lo: 28, hi: 31, tech: 'unique' },
    expert: { lo: 24, hi: 27, tech: 'unique' }
  };

  /* RNG benih: mulberry32 */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function parse(str) {
    var s = String(str).replace(/\s+/g, '');
    if (s.length !== 81) return { error: 'length', n: s.length };
    var g = [];
    for (var k = 0; k < 81; k++) {
      var ch = s.charAt(k);
      if (ch === '.' || ch === '0') g.push(0);
      else if (ch >= '1' && ch <= '9') g.push(ch.charCodeAt(0) - 48);
      else return { error: 'char', index: k };
    }
    return { grid: g };
  }
  function format(grid) { return grid.map(function (v) { return v || '0'; }).join(''); }

  /* indeks sel yang bentrok (angka sama di baris, kolom, atau kotak yang sama) */
  function conflicts(grid) {
    var bad = [];
    for (var k = 0; k < 81; k++) {
      var v = grid[k]; if (!v) continue;
      var pr = PEERS[k];
      for (var q = 0; q < pr.length; q++) if (grid[pr[q]] === v) { bad.push(k); break; }
    }
    return bad;
  }

  function masks(grid) {
    var rows = [], cols = [], boxes = [], k;
    for (k = 0; k < 9; k++) { rows[k] = 0; cols[k] = 0; boxes[k] = 0; }
    for (k = 0; k < 81; k++) {
      var v = grid[k]; if (!v) continue;
      var bit = 1 << (v - 1);
      if ((rows[ROW[k]] & bit) || (cols[COL[k]] & bit) || (boxes[BOX[k]] & bit)) return null;
      rows[ROW[k]] |= bit; cols[COL[k]] |= bit; boxes[BOX[k]] |= bit;
    }
    return { rows: rows, cols: cols, boxes: boxes };
  }

  /* calon angka tiap sel kosong: array 81 berisi array angka (kosong untuk sel terisi) */
  function candidates(grid) {
    var m = masks(grid), out = [];
    for (var k = 0; k < 81; k++) {
      var a = [];
      if (!grid[k]) {
        var used = m ? (m.rows[ROW[k]] | m.cols[COL[k]] | m.boxes[BOX[k]]) : usedByPeers(grid, k);
        for (var d = 1; d <= 9; d++) if (!(used & (1 << (d - 1)))) a.push(d);
      }
      out.push(a);
    }
    return out;
  }
  function usedByPeers(grid, k) {
    var u = 0, pr = PEERS[k];
    for (var q = 0; q < pr.length; q++) if (grid[pr[q]]) u |= 1 << (grid[pr[q]] - 1);
    return u;
  }

  /* pencacah solusi: berhenti di `limit`. rng (opsional) mengacak urutan angka. */
  function search(grid, limit, rng) {
    var m = masks(grid);
    if (!m) return { count: 0, solution: null };
    var g = grid.slice(), count = 0, solution = null;
    function rec() {
      var best = -1, bestMask = 0, bestN = 10, k;
      for (k = 0; k < 81; k++) {
        if (g[k]) continue;
        var cand = FULL & ~(m.rows[ROW[k]] | m.cols[COL[k]] | m.boxes[BOX[k]]), n = POP[cand];
        if (n < bestN) { best = k; bestMask = cand; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!solution) solution = g.slice(); return count >= limit; }
      if (bestN === 0) return false;
      var digits = [], d;
      for (d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) digits.push(d);
      if (rng) for (d = digits.length - 1; d > 0; d--) { var s = Math.floor(rng() * (d + 1)), t = digits[d]; digits[d] = digits[s]; digits[s] = t; }
      for (var q = 0; q < digits.length; q++) {
        var v = digits[q], bit = 1 << (v - 1);
        g[best] = v; m.rows[ROW[best]] |= bit; m.cols[COL[best]] |= bit; m.boxes[BOX[best]] |= bit;
        var stop = rec();
        g[best] = 0; m.rows[ROW[best]] &= ~bit; m.cols[COL[best]] &= ~bit; m.boxes[BOX[best]] &= ~bit;
        if (stop) return true;
      }
      return false;
    }
    rec();
    return { count: count, solution: solution };
  }
  function solve(grid) { return search(grid, 1).solution; }
  function countSolutions(grid, limit) { return search(grid, limit || 2).count; }

  /* penyelesai logika: angka tunggal (naked), dan opsional angka tersembunyi (hidden). */
  function logicSolvable(grid, hidden) {
    var g = grid.slice(), progress = true, k, d, u;
    while (progress) {
      progress = false;
      var cand = candidates(g);
      for (k = 0; k < 81; k++) if (!g[k] && cand[k].length === 1) { g[k] = cand[k][0]; progress = true; break; }
      if (progress || !hidden) continue;
      outer: for (u = 0; u < UNITS.length; u++) {
        for (d = 1; d <= 9; d++) {
          var spot = -1, n = 0, has = false;
          for (var q = 0; q < 9; q++) {
            var c = UNITS[u][q];
            if (g[c] === d) { has = true; break; }
            if (!g[c] && cand[c].indexOf(d) >= 0) { n++; spot = c; }
          }
          if (!has && n === 1) { g[spot] = d; progress = true; break outer; }
        }
      }
    }
    return g.indexOf(0) < 0;
  }

  function shuffle(a, rng) {
    for (var q = a.length - 1; q > 0; q--) { var s = Math.floor(rng() * (q + 1)), t = a[q]; a[q] = a[s]; a[s] = t; }
    return a;
  }

  /* generate: soal berjawaban unik, jumlah petunjuk dalam rentang tingkat. */
  function generate(level, rng) {
    var L = LEVELS[level];
    if (!L) throw new Error('tingkat tidak valid: ' + level);
    rng = rng || Math.random;
    for (var attempt = 0; attempt < 50; attempt++) {
      var sol = search(new Array(81).fill(0), 1, rng).solution, puz = sol.slice();
      var target = L.lo + Math.floor(rng() * (L.hi - L.lo + 1)), clues = 81;
      var order = shuffle(Array.apply(null, Array(81)).map(function (_, n) { return n; }), rng);
      for (var q = 0; q < 81 && clues > target; q++) {
        var cell = order[q], keep = puz[cell];
        puz[cell] = 0;
        var ok = L.tech === 'naked' ? logicSolvable(puz, false) : L.tech === 'hidden' ? logicSolvable(puz, true) : countSolutions(puz, 2) === 1;
        if (ok) clues--; else puz[cell] = keep;
      }
      if (clues >= L.lo && clues <= L.hi) return { puzzle: puz, solution: sol, clues: clues };
    }
    throw new Error('gagal membuat soal ' + level);
  }

  var api = { LEVELS: LEVELS, seeded: seeded, parse: parse, format: format, conflicts: conflicts, candidates: candidates, solve: solve, countSolutions: countSolutions, logicSolvable: logicSolvable, generate: generate, PEERS: PEERS, ROW: ROW, COL: COL, BOX: BOX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EngineSudoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
