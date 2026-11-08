/* Inti Pembuat tanda tangan: goresan disimpan sebagai titik (vektor), jadi hasil tajam di ukuran berapa pun.
   Goresan = array titik [x, y]. Tanpa DOM; render menerima konteks kanvas apa pun. */
(function (root) {
  'use strict';

  function defaults() {
    return { ink: '#000000', width: 3, bg: 'transparent', bgColor: '#ffffff', format: 'png', scale: 2, crop: true };
  }
  var BLUE = '#1d4ed8'; // latar biru bawaan

  /* kotak pembatas semua goresan (tebal garis ikut dihitung); null bila kosong */
  function bounds(strokes, width) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, h = width / 2;
    strokes.forEach(function (s) { s.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }); });
    return x0 === Infinity ? null : { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
  }

  /* gambar semua goresan; o = { color, width, scale, ox, oy } (ox, oy = geser dalam satuan goresan) */
  function render(ctx, strokes, o) {
    var k = o.scale || 1, ox = o.ox || 0, oy = o.oy || 0;
    function X(p) { return (p[0] + ox) * k; }
    function Y(p) { return (p[1] + oy) * k; }
    ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = o.width * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach(function (s) {
      if (!s.length) return;
      ctx.beginPath();
      if (s.length < 3) { // titik atau garis pendek
        if (s.length === 1 || (s[0][0] === s[1][0] && s[0][1] === s[1][1])) { ctx.arc(X(s[0]), Y(s[0]), o.width * k / 2, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.moveTo(X(s[0]), Y(s[0])); ctx.lineTo(X(s[1]), Y(s[1])); ctx.stroke(); return;
      }
      ctx.moveTo(X(s[0]), Y(s[0]));
      for (var i = 1; i < s.length - 1; i++) ctx.quadraticCurveTo(X(s[i]), Y(s[i]), (X(s[i]) + X(s[i + 1])) / 2, (Y(s[i]) + Y(s[i + 1])) / 2);
      ctx.lineTo(X(s[s.length - 1]), Y(s[s.length - 1]));
      ctx.stroke();
    });
  }

  var API = { defaults: defaults, BLUE: BLUE, bounds: bounds, render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Sig = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
