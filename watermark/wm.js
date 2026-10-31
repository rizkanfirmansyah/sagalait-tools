/* Mesin watermark: menggambar teks berulang atau satu di tengah, plus pembuat ZIP sederhana. Tanpa jaringan. */
(function (root) {
  'use strict';

  var FONTS = { sans: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', serif: 'Georgia, "Times New Roman", Times, serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace' };

  function defaults() {
    return { text: 'SAGALA IT WATERMARK', color: '#808080', opacity: 20, size: 6, angle: -30, gapX: 80, gapY: 60, mode: 'tile', font: 'sans', bold: true, outline: false, format: 'png', quality: 90, maxSide: 0 };
  }

  function contrast(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#ffffff';
    var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000000' : '#ffffff';
  }

  /* Satuan ukuran relatif terhadap sisi pendek gambar, jadi pratinjau dan hasil unduhan identik. */
  function draw(ctx, W, H, o, makeCanvas) {
    var text = String(o.text == null ? '' : o.text).replace(/\r/g, ''), lines = text.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return 0;
    var op = Math.max(0, Math.min(1, o.opacity / 100));
    if (op <= 0) return 0;
    var layer = makeCanvas(W, H), lc = layer.getContext('2d');
    var short = Math.min(W, H), fs = Math.max(6, short * o.size / 100), lh = fs * 1.2;
    lc.font = (o.bold ? '700 ' : '400 ') + fs + 'px ' + (FONTS[o.font] || FONTS.sans);
    lc.textAlign = 'center'; lc.textBaseline = 'middle'; lc.fillStyle = o.color; lc.strokeStyle = contrast(o.color); lc.lineJoin = 'round'; lc.lineWidth = Math.max(1, fs / 10);
    var bw = 0; lines.forEach(function (l) { bw = Math.max(bw, lc.measureText(l).width); });
    var bh = lines.length * lh, count = 0;
    function block(cx, cy) {
      lines.forEach(function (l, i) { var y = cy + (i - (lines.length - 1) / 2) * lh; if (o.outline) lc.strokeText(l, cx, y); lc.fillText(l, cx, y); });
      count++;
    }
    lc.translate(W / 2, H / 2); lc.rotate(o.angle * Math.PI / 180);
    if (o.mode === 'center') block(0, 0);
    else {
      var sx = Math.max(4, bw + fs * o.gapX / 100), sy = Math.max(4, bh + fs * o.gapY / 100), diag = Math.hypot(W, H), rows = Math.ceil(diag / sy) + 1, j, x;
      if ((diag * 2 / sx) * (rows * 2) > 40000) { var k = Math.sqrt((diag * 2 / sx) * (rows * 2) / 40000); sx *= k; sy *= k; rows = Math.ceil(diag / sy) + 1; }
      for (j = -rows; j <= rows; j++) { var off = (j % 2 !== 0) ? sx / 2 : 0; for (x = -diag - sx; x <= diag + sx; x += sx) block(x + off, j * sy); }
    }
    ctx.save(); ctx.globalAlpha = op; ctx.drawImage(layer, 0, 0); ctx.restore();
    return count;
  }

  /* ---------- ZIP tanpa kompresi (store) ---------- */
  var T = null;
  function crc32(u8) {
    if (!T) { T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = T[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, f.data);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name); offset += 30 + name.length + size;
    });
    var csize = 0; central.forEach(function (c) { csize += c.byteLength || c.length; });
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  var API = { FONTS: FONTS, defaults: defaults, draw: draw, contrast: contrast, zipStore: zipStore, crc32: crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WM = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
