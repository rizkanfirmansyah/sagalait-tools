/* Logika murni Memory cards: ukuran papan, pengocokan Fisher-Yates dengan RNG yang bisa disuntik, aturan membalik kartu,
   deteksi menang, dan perbandingan rekor. Tanpa DOM. */
(function (root) {
  'use strict';
  var SIZES = { '4x4': { rows: 4, cols: 4, pairs: 8 }, '4x5': { rows: 4, cols: 5, pairs: 10 }, '6x6': { rows: 6, cols: 6, pairs: 18 } };

  /* Fisher-Yates: salinan baru, rng() harus mengembalikan bilangan di [0, 1) */
  function shuffle(arr, rng) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function create(pairs, rng) {
    if (!(pairs >= 1) || pairs % 1) throw new RangeError('jumlah pasangan harus bilangan bulat positif');
    var syms = []; for (var i = 0; i < pairs; i++) syms.push(i, i);
    return { pairs: pairs, cards: shuffle(syms, rng || Math.random).map(function (s, k) { return { id: k, sym: s, state: 'down' }; }), moves: 0, matched: 0, open: [], won: false };
  }
  /* balik kartu i. Hasil: {type:'ignored'} | {type:'first'} | {type:'match', won} | {type:'mismatch'}.
     Dua kartu tak cocok tetap terbuka sampai resolve() dipanggil; selama itu balikan baru diabaikan. */
  function flip(st, i) {
    var c = st.cards[i];
    if (st.won || !c || c.state !== 'down' || st.open.length >= 2) return { type: 'ignored' };
    c.state = 'up'; st.open.push(i);
    if (st.open.length === 1) return { type: 'first', index: i };
    var a = st.cards[st.open[0]], b = c; st.moves++;
    if (a.sym === b.sym) {
      a.state = b.state = 'matched'; var pair = st.open.slice(); st.open = []; st.matched++;
      if (st.matched === st.pairs) st.won = true;
      return { type: 'match', pair: pair, sym: a.sym, won: st.won };
    }
    return { type: 'mismatch', pair: st.open.slice() };
  }
  /* tutup lagi dua kartu tak cocok; mengembalikan indeksnya, atau [] bila tidak ada */
  function resolve(st) {
    if (st.open.length !== 2) return [];
    var o = st.open.slice(); o.forEach(function (k) { st.cards[k].state = 'down'; }); st.open = []; return o;
  }
  /* rekor lebih baik: langkah lebih sedikit, bila sama waktu lebih singkat */
  function better(rec, moves, ms) { return !rec || moves < rec.moves || (moves === rec.moves && ms < rec.ms); }
  function formatTime(ms) { var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }

  var api = { SIZES: SIZES, shuffle: shuffle, create: create, flip: flip, resolve: resolve, better: better, formatTime: formatTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MemoryEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
