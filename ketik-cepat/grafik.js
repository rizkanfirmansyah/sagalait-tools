/* Penggambar grafik garis SVG untuk Ketik cepat: tanpa pustaka. Geometri murni (bisa dites di Node), pembuat node SVG memakai document.
   Warna tidak ada di sini: tiap garis diberi nama kelas, warnanya ditentukan app.css lewat token. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  /* Batas atas sumbu Y yang "bulat": 1, 2, 2.5, 5 atau 10 kali pangkat sepuluh, minimal 10. */
  function niceMax(v) {
    if (!(v > 10)) return 10;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }
  /* Titik (x, y) dalam kotak {l, t, w, h}; n titik tersebar rata dari kiri ke kanan, nilai 0 di dasar kotak. */
  function points(values, box, ymax) {
    var n = values.length;
    return values.map(function (v, i) {
      var x = n === 1 ? box.l + box.w / 2 : box.l + box.w * i / (n - 1);
      var y = box.t + box.h - box.h * Math.max(0, Math.min(ymax, v)) / ymax;
      return [x, y];
    });
  }
  function f(n) { return Math.round(n * 10) / 10; }

  /* o = { w, h, series: [{ cls, values, dots }], marks: [indeks titik yang bergalat], xLabels: [teks tiap titik, atau null], yTitle } */
  function chart(doc, o) {
    var w = o.w || 640, h = o.h || 240, pad = { l: 40, r: 14, t: 12, b: 30 }, box = { l: pad.l, t: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b };
    var all = []; o.series.forEach(function (s) { all = all.concat(s.values); });
    var ymax = niceMax(Math.max.apply(null, all.concat([0]))), i;
    var svg = doc.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('class', 'kc-svg'); svg.setAttribute('role', 'img');
    if (o.label) svg.setAttribute('aria-label', o.label);
    function el(tag, attrs, parent, text) {
      var e = doc.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text; (parent || svg).appendChild(e); return e;
    }
    for (i = 0; i <= 4; i++) {
      var gy = box.t + box.h - box.h * i / 4;
      el('line', { x1: box.l, x2: box.l + box.w, y1: f(gy), y2: f(gy), class: i === 0 ? 'kc-axis' : 'kc-grid' });
      el('text', { x: box.l - 6, y: f(gy + 4), 'text-anchor': 'end', class: 'kc-tick' }, null, String(Math.round(ymax * i / 4 * 10) / 10));
    }
    var n = o.series.length ? o.series[0].values.length : 0;
    if (o.xLabels && n) {
      var step = Math.max(1, Math.ceil(n / 8));
      for (i = 0; i < n; i += step) {
        var px = points(new Array(n).fill(0), box, ymax)[i][0];
        el('text', { x: f(px), y: h - 8, 'text-anchor': 'middle', class: 'kc-tick' }, null, o.xLabels[i]);
      }
    }
    if (o.yTitle) el('text', { x: 4, y: 10, class: 'kc-tick kc-ytitle' }, null, o.yTitle);
    o.series.forEach(function (s) {
      var pts = points(s.values, box, ymax);
      if (pts.length > 1) el('polyline', { class: 'kc-line ' + s.cls, points: pts.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' '), fill: 'none' });
      if (s.dots || pts.length === 1) pts.forEach(function (p) { el('circle', { cx: f(p[0]), cy: f(p[1]), r: 3, class: 'kc-dot ' + s.cls }); });
    });
    (o.marks || []).forEach(function (m) {
      if (m < 0 || m >= n) return;
      var px2 = points(new Array(n).fill(0), box, ymax)[m][0], by = box.t + box.h - 9;
      el('path', { class: 'kc-err', d: 'M' + f(px2 - 3.5) + ' ' + f(by - 3.5) + 'l7 7m0 -7l-7 7' });
    });
    return svg;
  }

  var api = { niceMax: niceMax, points: points, chart: chart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KetikGrafik = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
