/* Ikon kartu Memory: 18 bentuk sederhana pada kotak 24x24, murni data (tanpa DOM, tanpa gambar luar).
   Tiap bentuk: t = 'path' atau 'circle'; fill = diisi warna kartu, selain itu hanya garis; w = tebal garis. */
(function (root) {
  'use strict';
  var P = function (d, fill, w) { return { t: 'path', d: d, fill: !!fill, w: w }; };
  var C = function (cx, cy, r, fill, w) { return { t: 'circle', cx: cx, cy: cy, r: r, fill: !!fill, w: w }; };
  var ICONS = [
    { id: 'heart', s: [P('M12 21s-7.5-4.6-9.5-9.2C1 8 3.4 4.5 7 4.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 3.6 0 6 3.5 4.5 7.3C19.5 16.4 12 21 12 21z', true)] },
    { id: 'star', s: [P('M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7L2.5 9.5l6.6-.8z', true)] },
    { id: 'moon', s: [P('M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z', true)] },
    { id: 'sun', s: [C(12, 12, 4, true), P('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1')] },
    { id: 'cloud', s: [P('M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z', true)] },
    { id: 'bolt', s: [P('M13 2L4.5 13.5H11L10 22l9-12h-6.5z', true)] },
    { id: 'drop', s: [P('M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z', true)] },
    { id: 'leaf', s: [P('M5 19C5 10 10 4.5 20 4c0 10-4.5 15-13 15z'), P('M5 19l8-8')] },
    { id: 'diamond', s: [P('M12 2l8 10-8 10-8-10z', true)] },
    { id: 'triangle', s: [P('M12 3l10 18H2z')] },
    { id: 'hexagon', s: [P('M12 2l8.7 5v10L12 22l-8.7-5V7z')] },
    { id: 'note', s: [P('M9 18V5l10-2v13'), C(6.5, 18, 2.5, true), C(16.5, 16, 2.5, true)] },
    { id: 'bell', s: [P('M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z', true), P('M10 21h4')] },
    { id: 'flag', s: [P('M5 21V3'), P('M5 4h13l-3 4.5 3 4.5H5', true)] },
    { id: 'house', s: [P('M3 11l9-8 9 8v10h-6v-6H9v6H3z')] },
    { id: 'plus', s: [P('M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z', true)] },
    { id: 'smile', s: [C(12, 12, 9), C(9, 10, 1, true), C(15, 10, 1, true), P('M8 14a5 5 0 0 0 8 0')] },
    { id: 'ring', s: [C(12, 12, 7, false, 4)] }
  ];
  var api = { ICONS: ICONS, count: ICONS.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MemoryIcons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
