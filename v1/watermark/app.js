/* Antarmuka Watermark. Gambar hanya diproses di memori browser; tidak diunggah dan tidak disimpan.
   Hanya pengaturan tampilan (teks, warna, opasitas, dst.) yang diingat di browser. */
(function () {
  'use strict';
  var KEY = 'sagalait-watermark', PREVIEW = 1600, MAX_MP = 80;
  var $ = function (id) { return document.getElementById(id); };
  var st = load(), files = [], cur = -1, raf = 0, saveT = null, uid = 0;
  var SWATCH = [['#808080', 'Abu-abu'], ['#000000', 'Hitam'], ['#c0392b', 'Merah'], ['#1f4e9e', 'Biru'], ['#ffffff', 'Putih']];

  function load() {
    var d = WM.defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') Object.keys(d).forEach(function (k) { if (typeof s[k] === typeof d[k]) d[k] = s[k]; });
    } catch (e) { /* abaikan */ }
    if (!/^#[0-9a-f]{6}$/i.test(d.color)) d.color = '#808080';
    if (['tile', 'center'].indexOf(d.mode) < 0) d.mode = 'tile';
    if (['png', 'jpeg', 'webp'].indexOf(d.format) < 0) d.format = 'png';
    return d;
  }
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } }, 200); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function msg(t) { $('msg').textContent = t || ''; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function kb(n) { return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------- kontrol ---------- */
  function sync() {
    $('text').value = st.text; $('color').value = st.color; $('hex').value = st.color; $('mode').value = st.mode; $('font').value = st.font;
    $('bold').checked = st.bold; $('outline').checked = st.outline; $('format').value = st.format; $('maxSide').value = String(st.maxSide); $('quality').value = st.quality;
    ['opacity', 'size', 'angle', 'gapX', 'gapY'].forEach(function (k) { $(k).value = st[k]; });
    labels();
  }
  function labels() {
    $('vOpacity').textContent = st.opacity + '%'; $('vSize').textContent = String(st.size).replace('.', ',') + '%'; $('vAngle').textContent = st.angle + '°';
    $('vGapX').textContent = st.gapX + '%'; $('vGapY').textContent = st.gapY + '%'; $('vQ').textContent = st.quality;
    $('rowGapX').hidden = $('rowGapY').hidden = st.mode === 'center'; $('rowQ').hidden = st.format === 'png';
    document.querySelectorAll('.wm-sw button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.c.toLowerCase() === st.color.toLowerCase())); });
    var empty = !String(st.text).trim();
    $('btnDl').disabled = cur < 0 || empty; $('btnZip').disabled = empty;
    if (empty && cur >= 0) msg('Teks kosong: tidak ada watermark. Tulis teks dulu supaya bisa diunduh.'); else if ($('msg').textContent.indexOf('Teks kosong') === 0) msg('');
  }
  function bind() {
    var sw = document.querySelector('.wm-sw');
    SWATCH.forEach(function (c) { var b = el('button'); b.type = 'button'; b.dataset.c = c[0]; b.style.background = c[0]; b.setAttribute('aria-label', c[1]); b.title = c[1]; b.addEventListener('click', function () { st.color = c[0]; sync(); changed(); }); sw.appendChild(b); });
    $('text').addEventListener('input', function () { st.text = $('text').value; labels(); changed(); });
    $('color').addEventListener('input', function () { st.color = $('color').value; $('hex').value = st.color; labels(); changed(); });
    $('hex').addEventListener('input', function () { var v = $('hex').value.trim(); if (v && v.charAt(0) !== '#') v = '#' + v; var ok = /^#[0-9a-f]{6}$/i.test(v); $('hex').setAttribute('aria-invalid', String(!ok)); if (ok) { st.color = v.toLowerCase(); $('color').value = st.color; labels(); changed(); } });
    ['mode', 'font', 'format'].forEach(function (k) { $(k).addEventListener('change', function () { st[k] = $(k).value; labels(); changed(); }); });
    $('maxSide').addEventListener('change', function () { st.maxSide = Number($('maxSide').value); save(); });
    ['bold', 'outline'].forEach(function (k) { $(k).addEventListener('change', function () { st[k] = $(k).checked; changed(); }); });
    ['opacity', 'size', 'angle', 'gapX', 'gapY', 'quality'].forEach(function (k) { $(k).addEventListener('input', function () { st[k] = Number($(k).value); labels(); changed(); }); });
    document.querySelectorAll('.wm-quick button').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.t;
        if (t === '{tgl}') { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; t = 'HANYA UNTUK VERIFIKASI\n' + p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear(); }
        st.text = t; sync(); changed(); $('text').focus();
      });
    });
    $('btnReset').addEventListener('click', function () { var f = st.format, m = st.maxSide; st = WM.defaults(); st.format = f; st.maxSide = m; sync(); changed(); });
    $('file').addEventListener('change', function (e) { addFiles([].slice.call(e.target.files)); e.target.value = ''; });
    $('btnDl').addEventListener('click', downloadOne); $('btnZip').addEventListener('click', downloadAll);
    var v = $('view');
    ['dragenter', 'dragover'].forEach(function (ev) { v.addEventListener(ev, function (e) { e.preventDefault(); v.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { v.addEventListener(ev, function (e) { e.preventDefault(); v.classList.remove('drag'); }); });
    v.addEventListener('drop', function (e) { addFiles([].slice.call(e.dataTransfer.files)); });
    document.addEventListener('paste', function (e) { var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []).filter(function (f) { return /^image\//.test(f.type); }); if (fs.length) { e.preventDefault(); addFiles(fs); } });
    window.addEventListener('resize', function () { schedule(); });
    new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function changed() { save(); schedule(); }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }

  /* ---------- gambar ---------- */
  function decode(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; });
  }
  function addFiles(list) {
    var imgs = list.filter(function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name); });
    if (!imgs.length) { msg('Pilih berkas gambar (JPG, PNG, WebP).'); return; }
    msg(''); var bad = [];
    imgs.reduce(function (p, f) {
      return p.then(function () {
        return decode(f).then(function (bmp) {
          var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
          if (w * h > MAX_MP * 1e6) { bad.push(f.name + ' terlalu besar (' + w + '×' + h + ')'); return; }
          var th = mk(96, 96), tc = th.getContext('2d'), s = Math.max(96 / w, 96 / h); tc.fillStyle = '#ffffff'; tc.fillRect(0, 0, 96, 96); tc.drawImage(bmp, (96 - w * s) / 2, (96 - h * s) / 2, w * s, h * s);
          files.push({ id: ++uid, name: f.name, size: f.size, bmp: bmp, w: w, h: h, thumb: th.toDataURL('image/jpeg', 0.7) });
          cur = files.length - 1;
        }).catch(function () { bad.push(f.name + ' tidak bisa dibaca browser (HEIC perlu diubah ke JPG atau PNG dulu)'); });
      });
    }, Promise.resolve()).then(function () { if (bad.length) msg(bad.join('. ') + '.'); thumbs(); labels(); schedule(); });
  }
  function thumbs() {
    var box = $('thumbs'); while (box.firstChild) box.removeChild(box.firstChild);
    box.hidden = files.length < 2; $('btnZip').hidden = files.length < 2;
    files.forEach(function (f, i) {
      var b = el('button', 'wm-th'), im = el('img'), x = el('span', 'x', '×'); b.type = 'button'; im.src = f.thumb; im.alt = f.name; b.title = f.name; b.setAttribute('aria-current', String(i === cur)); b.setAttribute('aria-label', 'Pilih ' + f.name);
      b.appendChild(im); x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Hapus ' + f.name); x.title = 'Hapus'; b.appendChild(x);
      b.addEventListener('click', function (e) {
        if (e.target === x) { files.splice(i, 1); if (cur >= files.length) cur = files.length - 1; thumbs(); labels(); schedule(); return; }
        cur = i; thumbs(); schedule();
      });
      box.appendChild(b);
    });
  }

  /* ---------- pratinjau ---------- */
  function render() {
    var cv = $('cv'), ctx = cv.getContext('2d');
    if (cur < 0) {
      cv.width = 1200; cv.height = 757; ctx.fillStyle = css('--well') || '#eee'; ctx.fillRect(0, 0, 1200, 757);
      ctx.fillStyle = css('--line-strong') || '#ccc'; ctx.fillRect(60, 80, 220, 280); [[330, 110, 560], [330, 190, 420], [330, 270, 500], [330, 350, 380], [60, 470, 800], [60, 550, 640]].forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], 34); });
      WM.draw(ctx, 1200, 757, st, mk); $('empty').hidden = false;
      $('info').textContent = 'Belum ada gambar. Ini kanvas contoh untuk melihat watermark.'; return;
    }
    var f = files[cur], s = Math.min(1, PREVIEW / Math.max(f.w, f.h)), w = Math.max(1, Math.round(f.w * s)), h = Math.max(1, Math.round(f.h * s));
    cv.width = w; cv.height = h; ctx.drawImage(f.bmp, 0, 0, w, h); WM.draw(ctx, w, h, st, mk); $('empty').hidden = true;
    $('info').textContent = f.name + ' · ' + f.w + '×' + f.h + ' px · ' + kb(f.size) + (files.length > 1 ? ' · ' + (cur + 1) + ' dari ' + files.length : '');
  }

  /* ---------- ekspor ---------- */
  var MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  function exportBlob(f) {
    var s = st.maxSide ? Math.min(1, st.maxSide / Math.max(f.w, f.h)) : 1, w = Math.max(1, Math.round(f.w * s)), h = Math.max(1, Math.round(f.h * s)), c = mk(w, h), ctx = c.getContext('2d');
    if (st.format !== 'png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(f.bmp, 0, 0, w, h); WM.draw(ctx, w, h, st, mk);
    return toBlob(c, MIME[st.format], st.quality / 100);
  }
  /* toBlob kadang tidak kembali di tab yang tidak dirender; bila lewat 2 detik pakai toDataURL yang sinkron */
  function toBlob(c, mime, q) {
    return new Promise(function (res, rej) {
      var done = false;
      function viaUrl() {
        if (done) return; done = true;
        try { var u = c.toDataURL(mime, q), bin = atob(u.split(',')[1]), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); res(new Blob([arr], { type: u.slice(5, u.indexOf(';')) })); } catch (e) { rej(e); }
      }
      var t = setTimeout(viaUrl, 2000);
      try { c.toBlob(function (b) { if (done) return; clearTimeout(t); done = true; if (b) res(b); else { done = false; viaUrl(); } }, mime, q); } catch (e) { clearTimeout(t); viaUrl(); }
    });
  }
  function outName(f, used) {
    var ext = st.format === 'jpeg' ? 'jpg' : st.format, base = f.name.replace(/\.[^.]+$/, '').replace(/[^\w.\- ]+/g, '_') || 'gambar', n = base + '-watermark.' + ext, i = 2;
    while (used && used[n]) n = base + '-watermark-' + (i++) + '.' + ext; if (used) used[n] = 1; return n;
  }
  function save2(blob, name) { var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }
  function downloadOne() {
    if (cur < 0) return; var f = files[cur]; msg('Menyiapkan…'); $('btnDl').disabled = true;
    exportBlob(f).then(function (b) { if (st.format === 'webp' && b.type !== 'image/webp') msg('Browser ini tidak bisa membuat WebP; hasilnya PNG.'); else msg(''); save2(b, outName(f, null).replace(/\.\w+$/, b.type === 'image/jpeg' ? '.jpg' : b.type === 'image/webp' ? '.webp' : '.png')); })
      .catch(function () { msg('Gagal membuat gambar. Coba kecilkan "Sisi terpanjang".'); }).then(labels);
  }
  function downloadAll() {
    msg('Menyiapkan ' + files.length + ' gambar…'); $('btnZip').disabled = true; var used = {}, out = [];
    files.reduce(function (p, f) { return p.then(function () { return exportBlob(f).then(function (b) { return b.arrayBuffer().then(function (ab) { out.push({ name: outName(f, used), data: new Uint8Array(ab) }); }); }); }); }, Promise.resolve())
      .then(function () { save2(WM.zipStore(out), 'watermark.zip'); msg(''); }).catch(function () { msg('Gagal membuat ZIP. Coba kurangi jumlah atau ukuran gambar.'); }).then(labels);
  }

  sync(); bind(); schedule();
  window.WMApp = { get state() { return st; }, get files() { return files; } };
})();
