/* Antarmuka Pembuat tanda tangan. Goresan hanya ada di memori; yang diingat hanya pengaturan. */
(function () {
  'use strict';
  var KEY = 'sagalait-signature', I = window.SagalaI18n;
  var $ = function (id) { return document.getElementById(id); };
  var st = load(), strokes = [], redo = [], cur = null, cv = $('cv'), ctx = cv.getContext('2d'), cssW = 0, cssH = 0;
  var BG = { white: '#ffffff', blue: Sig.BLUE };

  function load() {
    var d = Sig.defaults();
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') Object.keys(d).forEach(function (k) { if (typeof s[k] === typeof d[k]) d[k] = s[k]; }); } catch (e) { /* abaikan */ }
    if (['png', 'jpeg'].indexOf(d.format) < 0) d.format = 'png';
    if ([1, 2, 3].indexOf(d.scale) < 0) d.scale = 2;
    if (!/^#[0-9a-f]{6}$/i.test(d.ink)) d.ink = '#000000';
    if (!/^#[0-9a-f]{6}$/i.test(d.bgColor)) d.bgColor = '#ffffff';
    if (['transparent', 'white', 'blue', 'custom'].indexOf(d.bg) < 0) d.bg = 'transparent';
    d.width = Math.min(12, Math.max(1, d.width));
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } }
  function msg(t) { $('msg').textContent = t || ''; }

  /* warna latar yang berlaku; JPG tidak punya transparansi, jadi jadi putih */
  function bgColor() {
    if (st.bg === 'custom') return st.bgColor;
    if (st.bg === 'transparent') return st.format === 'jpeg' ? '#ffffff' : null;
    return BG[st.bg];
  }

  function fit() {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    cssW = r.width; cssH = r.height;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }
  function paint() {
    ctx.clearRect(0, 0, cssW, cssH);
    Sig.render(ctx, strokes, { color: st.ink, width: st.width });
  }
  function padBg() {
    var c = bgColor(), pad = $('pad');
    pad.classList.toggle('checker', !c);
    pad.style.backgroundColor = c || '';
  }

  /* gambar hasil unduhan ke kanvas baru */
  function output() {
    var b = Sig.bounds(strokes, st.width), k = st.scale, x0 = 0, y0 = 0, w = cssW, h = cssH;
    if (!b) return null;
    if (st.crop) { var m = 12 + st.width; x0 = Math.floor(b.x0 - m); y0 = Math.floor(b.y0 - m); w = Math.ceil(b.x1 + m) - x0; h = Math.ceil(b.y1 + m) - y0; }
    var c = document.createElement('canvas'), g = c.getContext('2d'), col = bgColor();
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    if (col) { g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); }
    Sig.render(g, strokes, { color: st.ink, width: st.width, scale: k, ox: -x0, oy: -y0 });
    return c;
  }
  function preview() {
    var c = output(), pv = $('prev'), box = $('prevBox'), col = bgColor();
    pv.hidden = !c; box.classList.toggle('checker', !col);
    $('btnDl').disabled = !c; $('info').textContent = '';
    if (!c) return;
    pv.width = c.width; pv.height = c.height; pv.getContext('2d').drawImage(c, 0, 0);
    pv.style.backgroundColor = '';
    $('info').textContent = c.width + ' × ' + c.height + ' px';
  }

  function refresh() {
    $('hint').hidden = strokes.length > 0 || !!cur;
    $('btnUndo').disabled = !strokes.length; $('btnRedo').disabled = !redo.length; $('btnClear').disabled = !strokes.length;
    preview();
  }
  function syncUi() {
    document.querySelectorAll('[data-ink]').forEach(function (b) { b.style.backgroundColor = b.dataset.ink; b.setAttribute('aria-pressed', String(b.dataset.ink === st.ink)); });
    var preset = document.querySelector('[data-ink="' + st.ink + '"]');
    $('inkPick').classList.toggle('on', !preset); $('ink').value = st.ink;
    $('width').value = st.width; $('vWidth').textContent = st.width + ' px';
    document.querySelectorAll('[data-bg]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.bg === st.bg)); });
    $('bgPick').classList.toggle('on', st.bg === 'custom'); $('bgColor').value = st.bgColor;
    document.querySelectorAll('[data-fmt]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fmt === st.format)); });
    $('scale').value = String(st.scale); $('crop').checked = st.crop;
    $('bgNote').textContent = st.format === 'jpeg' && st.bg === 'transparent' ? I.t('jpg_note') : '';
    padBg(); $('btnDl').textContent = I.t('download', { fmt: st.format === 'jpeg' ? 'JPG' : 'PNG' }); msg('');
  }
  function set(patch, repaint) { Object.keys(patch).forEach(function (k) { st[k] = patch[k]; }); save(); syncUi(); if (repaint) paint(); refresh(); }

  /* menggambar */
  function pt(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cssW / r.width), (e.clientY - r.top) * (cssH / r.height)]; }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    cur = [pt(e)]; strokes.push(cur); redo = []; paint(); $('hint').hidden = true;
  });
  cv.addEventListener('pointermove', function (e) {
    if (!cur) return;
    (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(function (ev) {
      var p = pt(ev), l = cur[cur.length - 1];
      if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) >= 1) cur.push(p);
    });
    paint();
  });
  function end() { if (!cur) return; cur = null; refresh(); }
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  $('btnUndo').addEventListener('click', function () { if (strokes.length) { redo.push(strokes.pop()); paint(); refresh(); } });
  $('btnRedo').addEventListener('click', function () { if (redo.length) { strokes.push(redo.pop()); paint(); refresh(); } });
  $('btnClear').addEventListener('click', function () { strokes = []; redo = []; paint(); refresh(); });
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || /input|select|textarea/i.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); $('btnUndo').click(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); $('btnRedo').click(); }
  });

  /* pengaturan */
  document.querySelectorAll('[data-ink]').forEach(function (b) { b.addEventListener('click', function () { set({ ink: b.dataset.ink }, true); }); });
  $('ink').addEventListener('input', function (e) { set({ ink: e.target.value }, true); });
  $('width').addEventListener('input', function (e) { set({ width: Number(e.target.value) }, true); });
  document.querySelectorAll('[data-bg]').forEach(function (b) { b.addEventListener('click', function () { set({ bg: b.dataset.bg }); }); });
  $('bgColor').addEventListener('input', function (e) { set({ bg: 'custom', bgColor: e.target.value }); });
  document.querySelectorAll('[data-fmt]').forEach(function (b) { b.addEventListener('click', function () { set({ format: b.dataset.fmt }); }); });
  $('scale').addEventListener('change', function (e) { set({ scale: Number(e.target.value) }); });
  $('crop').addEventListener('change', function (e) { set({ crop: e.target.checked }); });

  /* unduh; toBlob kadang tidak kembali di tab yang tidak dirender, jadi ada cadangan toDataURL */
  function toBlob(c, mime, q) {
    return new Promise(function (res, rej) {
      var done = false;
      function viaUrl() {
        if (done) return; done = true;
        try { var u = c.toDataURL(mime, q), bin = atob(u.split(',')[1]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); res(new Blob([arr], { type: mime })); } catch (e) { rej(e); }
      }
      var t = setTimeout(viaUrl, 2000);
      try { c.toBlob(function (b) { if (done) return; clearTimeout(t); done = true; if (b) res(b); else { done = false; viaUrl(); } }, mime, q); } catch (e) { clearTimeout(t); viaUrl(); }
    });
  }
  $('btnDl').addEventListener('click', function () {
    var c = output(); if (!c) return;
    var mime = st.format === 'jpeg' ? 'image/jpeg' : 'image/png', ext = st.format === 'jpeg' ? 'jpg' : 'png';
    msg(I.t('busy'));
    toBlob(c, mime, 0.95).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = I.t('filename') + '.' + ext;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); msg('');
    }).catch(function () { msg(I.t('fail')); });
  });

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(cv); else window.addEventListener('resize', fit);
  I.onReady(function () { syncUi(); fit(); refresh(); });
  document.addEventListener('sagalait:lang', syncUi);
  window.__sg = { strokes: function () { return strokes; }, output: output, state: function () { return st; } };
})();
