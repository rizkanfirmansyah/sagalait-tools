/* Logika Cek kontras warna: tanpa DOM. Rumus WCAG 2.x:
   luminans relatif L = 0.2126 R + 0.7152 G + 0.0722 B (kanal sRGB dilinearkan), rasio = (L terang + 0.05) / (L gelap + 0.05).
   Rasio tidak dibulatkan saat dibandingkan dengan ambang (4.499 gagal); tampilan dibulatkan ke 2 desimal tanpa pernah menampilkan ambang yang belum tercapai. */
(function (root) {
  'use strict';
  var NAMES = { black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', aqua: '00ffff', magenta: 'ff00ff', fuchsia: 'ff00ff', silver: 'c0c0c0', gray: '808080', grey: '808080', maroon: '800000', olive: '808000', green: '008000', purple: '800080', teal: '008080', navy: '000080', orange: 'ffa500' };
  var LEVELS = { aaNormal: 4.5, aaLarge: 3, aaaNormal: 7, aaaLarge: 4.5, ui: 3 };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function num(tok) { return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(tok) ? parseFloat(tok) : NaN; }
  /* Satu kanal: angka 0 sampai 255 atau persen 0 sampai 100. null bila tidak sah atau di luar rentang. */
  function channel(tok) {
    var pct = /%$/.test(tok), v = num(pct ? tok.slice(0, -1) : tok);
    if (isNaN(v)) return null;
    if (pct) return v < 0 || v > 100 ? null : Math.round(v * 2.55);
    return v < 0 || v > 255 ? null : Math.round(v);
  }
  function alphaOf(tok) {
    if (tok === undefined) return 1;
    var pct = /%$/.test(tok), v = num(pct ? tok.slice(0, -1) : tok);
    if (isNaN(v)) return null;
    v = pct ? v / 100 : v; return v < 0 || v > 1 ? null : v;
  }
  function hueOf(tok) {
    var m = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg|turn|grad|rad)?$/.exec(tok); if (!m) return null;
    var v = parseFloat(m[1]), u = m[2] || 'deg'; if (u === 'turn') v *= 360; else if (u === 'grad') v *= 0.9; else if (u === 'rad') v *= 180 / Math.PI;
    return ((v % 360) + 360) % 360;
  }
  function pctOf(tok) { if (!/%$/.test(tok)) return null; var v = num(tok.slice(0, -1)); return isNaN(v) || v < 0 || v > 100 ? null : v / 100; }

  /* Kembalian { r, g, b, a } (0 sampai 255, a 0 sampai 1) atau null. */
  function parseColor(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim().toLowerCase(); if (!s || s.length > 64) return null;
    if (NAMES[s]) s = '#' + NAMES[s];
    var m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s), h, a;
    if (m) {
      h = m[1]; if (h.length <= 4) h = h.replace(/./g, function (c) { return c + c; });
      a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: a };
    }
    m = /^(rgb|hsl)a?\(([^)]*)\)$/.exec(s); if (!m) return null;
    var t = m[2].split(/[\s,\/]+/).filter(Boolean); if (t.length < 3 || t.length > 4) return null;
    a = alphaOf(t[3]); if (a === null) return null;
    if (m[1] === 'rgb') { var r = channel(t[0]), g = channel(t[1]), b = channel(t[2]); if (r === null || g === null || b === null) return null; return { r: r, g: g, b: b, a: a }; }
    var hh = hueOf(t[0]), ss = pctOf(t[1]), ll = pctOf(t[2]); if (hh === null || ss === null || ll === null) return null;
    var c = hslToRgb(hh, ss, ll); c.a = a; return c;
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  function rgbToHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: h, s: s, l: l };
  }
  function hex2(n) { var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
  function toHex(c) { return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b); }
  function toRgbStr(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }
  function toHslStr(c) { var h = rgbToHsl(c); return 'hsl(' + Math.round(h.h) + ', ' + Math.round(h.s * 100) + '%, ' + Math.round(h.l * 100) + '%)'; }

  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function luminance(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  function over(top, under) {
    var a = top.a === undefined ? 1 : top.a; if (a >= 1) return { r: top.r, g: top.g, b: top.b, a: 1 };
    return { r: Math.round(top.r * a + under.r * (1 - a)), g: Math.round(top.g * a + under.g * (1 - a)), b: Math.round(top.b * a + under.b * (1 - a)), a: 1 };
  }
  var WHITE = { r: 255, g: 255, b: 255, a: 1 };
  /* Warna efektif: latar transparan jatuh di atas putih, teks transparan di atas latar efektif. */
  function effective(fg, bg) { var b = over(bg, WHITE); return { fg: over(fg, b), bg: b }; }
  function ratioOpaque(a, b) { var l1 = luminance(a), l2 = luminance(b); if (l1 < l2) { var t = l1; l1 = l2; l2 = t; } return (l1 + 0.05) / (l2 + 0.05); }
  function ratio(fg, bg) { var e = effective(fg, bg); return ratioOpaque(e.fg, e.bg); }
  /* Dibulatkan ke 2 desimal seperti alat lain, kecuali pembulatan itu akan menaikkan angka tepat ke ambang yang sebenarnya tidak tercapai (4.496 tampil 4.49, bukan 4.5). */
  function fmtRatio(r) {
    var v = Math.round(r * 100) / 100;
    if (v > r) [3, 4.5, 7].forEach(function (t) { if (r < t && v >= t) v = Math.floor(r * 100 + 1e-9) / 100; });
    return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0$/, '');
  }
  function levels(r) { return { aaNormal: r >= LEVELS.aaNormal, aaLarge: r >= LEVELS.aaLarge, aaaNormal: r >= LEVELS.aaaNormal, aaaLarge: r >= LEVELS.aaaLarge, ui: r >= LEVELS.ui }; }

  /* Warna terdekat (geser kecerahan HSL, rona dan kejenuhan tetap) pada 'moving' yang mencapai rasio target terhadap 'fixed'.
     Kembalian { color, ratio, dl } atau null bila tidak ada warna dengan rona itu yang bisa lulus. Hasil sudah dibulatkan ke 8 bit dan diperiksa ulang. */
  function nearest(fixed, moving, target) {
    var hsl = rgbToHsl(moving), best = null;
    [-1, 1].forEach(function (dir) {
      for (var step = 0; step <= 1000; step++) {
        var l = hsl.l + dir * step / 1000; if (l < 0 || l > 1) break;
        var c = hslToRgb(hsl.h, hsl.s, l), r = ratioOpaque(c, fixed);
        if (r >= target) { if (!best || step / 1000 < best.dl) best = { color: c, ratio: r, dl: step / 1000 }; break; }
      }
    });
    return best;
  }
  /* Saran untuk satu ambang: ubah teks (latar tetap) dan ubah latar (teks tetap). */
  function suggest(fg, bg, target) {
    var e = effective(fg, bg);
    return { fg: nearest(e.bg, e.fg, target), bg: nearest(e.fg, e.bg, target) };
  }

  var api = { LEVELS: LEVELS, parseColor: parseColor, hslToRgb: hslToRgb, rgbToHsl: rgbToHsl, toHex: toHex, toRgbStr: toRgbStr, toHslStr: toHslStr, luminance: luminance, effective: effective, ratio: ratio, fmtRatio: fmtRatio, levels: levels, nearest: nearest, suggest: suggest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KontrasLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
