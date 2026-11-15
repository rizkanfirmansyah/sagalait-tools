/* Tampilan Kompres gambar: semua diproses di browser lewat kanvas; gambar tidak diunggah. Logika murni di kompres.js. */
(function () {
  'use strict';
  var K = window.Kompres, I = window.SagalaI18n, KEY = 'sagalait-kompres';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function bytes(n) { return K.formatBytes(n, I.locale); }
  function num(n) { return new Intl.NumberFormat(I.locale).format(n); }

  var st = { fmt: 'jpeg', q: 80, side: 0 }, items = [], nextId = 1, selId = null, token = 0, timer = 0, busy = false;
  var EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!s) return;
      if (K.FORMATS[s.fmt]) st.fmt = s.fmt;
      if (Number.isFinite(s.q)) st.q = K.clampQuality(s.q);
      if (K.MAX_SIDES.indexOf(s.side) >= 0) st.side = s.side;
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* mode privat */ } }
  function key() { return st.fmt + '|' + st.q + '|' + st.side; }

  /* ---------- pengaturan ---------- */
  function buildSides() {
    var sel = $('side'), cur = String(st.side); sel.textContent = '';
    K.MAX_SIDES.forEach(function (v) {
      var o = document.createElement('option'); o.value = String(v); o.textContent = v ? t('side_n', { n: num(v) }) : t('side_orig'); sel.appendChild(o);
    });
    sel.value = cur;
  }
  function toUi() {
    document.querySelector('input[name=fmt][value="' + st.fmt + '"]').checked = true;
    $('q').value = st.q; $('qV').textContent = st.q;
    var png = st.fmt === 'png';
    $('boxQ').hidden = png; $('qPng').hidden = !png; $('side').value = String(st.side);
  }
  function changed() { save(); clearTimeout(timer); timer = setTimeout(processAll, 250); }
  $('fmts').addEventListener('change', function (e) { st.fmt = e.target.value; toUi(); changed(); });
  $('q').addEventListener('input', function (e) { st.q = K.clampQuality(e.target.value); $('qV').textContent = st.q; changed(); });
  $('side').addEventListener('change', function (e) { st.side = Number(e.target.value); changed(); });

  /* ---------- pemrosesan ---------- */
  function toBlob(canvas, mime, q) {
    return new Promise(function (res, rej) {
      var done = false, to = setTimeout(function () {
        if (done) return; done = true;
        try { res(dataUrlToBlob(canvas.toDataURL(mime, q))); } catch (e) { rej(e); }
      }, 2000);
      canvas.toBlob(function (b) { if (done) return; done = true; clearTimeout(to); b ? res(b) : rej(new Error('toBlob kosong')); }, mime, q);
    });
  }
  function dataUrlToBlob(u) {
    var p = u.split(','), mime = /:(.*?);/.exec(p[0])[1], bin = atob(p[1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }
  function decode(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
  }
  function freeOut(it) { if (it.url) { URL.revokeObjectURL(it.url); it.url = null; } }

  async function process(it, tk) {
    it.status = 'busy'; renderList();
    var k = key(), fmt = K.FORMATS[st.fmt];
    try {
      var bmp = await decode(it.file);
      if (tk !== token) { bmp.close && bmp.close(); return; }
      it.w = bmp.width; it.h = bmp.height;
      var sz = K.calcSize(bmp.width, bmp.height, st.side), c = document.createElement('canvas');
      c.width = sz.w; c.height = sz.h;
      var g = c.getContext('2d');
      if (fmt.mime === 'image/jpeg') { g.fillStyle = 'white'; g.fillRect(0, 0, sz.w, sz.h); } // JPEG tanpa transparansi
      g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, sz.w, sz.h); bmp.close && bmp.close();
      var blob = await toBlob(c, fmt.mime, fmt.lossy ? st.q / 100 : undefined);
      if (tk !== token) return;
      freeOut(it);
      it.out = blob; it.ow = sz.w; it.oh = sz.h; it.scaled = sz.scaled; it.url = URL.createObjectURL(blob);
      it.fallback = blob.type !== fmt.mime ? blob.type : null; it.key = k; it.status = 'ok';
    } catch (e) { it.status = 'err'; it.key = k; }
  }
  async function processAll() {
    var tk = ++token;
    busy = true;
    for (var i = 0; i < items.length; i++) {
      if (tk !== token) return;
      if (items[i].key !== key() || items[i].status === 'queued') await process(items[i], tk);
      render();
    }
    if (tk === token) {
      busy = false; render();
      var ok = items.filter(function (x) { return x.status === 'ok'; }).length;
      if (ok) $('live').textContent = t('done', { n: ok });
    }
  }

  /* ---------- tambah berkas ---------- */
  function addFiles(files) {
    var add = Array.prototype.filter.call(files, function (f) { return f && /^image\//.test(f.type); });
    add.forEach(function (f) { items.push({ id: nextId++, file: f, name: f.name || 'gambar.png', origSize: f.size, status: 'queued', key: null, useOrig: false, origUrl: null, url: null }); });
    if (add.length) { if (selId === null) selId = items[items.length - add.length].id; processAll(); }
  }
  $('file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer) addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', function (e) {
    if (e.target.closest && e.target.closest('input[type=text], textarea')) return;
    var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); }
  });

  /* ---------- hasil ---------- */
  function effective(it) { return it.useOrig ? it.file : it.out; }
  function effName(it) { return it.useOrig ? it.name : K.outName(it.name, EXT[it.out.type] || K.FORMATS[st.fmt].ext); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function renderList() {
    var ul = $('list'); ul.textContent = '';
    items.forEach(function (it) {
      var li = el('li', 'kg-item' + (it.id === selId ? ' is-sel' : '')), th = el('div', 'kg-th'), body = el('div', 'kg-body');
      if (it.status === 'ok' && it.url) { var im = el('img'); im.src = it.url; im.alt = ''; th.appendChild(im); }
      body.appendChild(el('div', 'kg-name', it.name));
      var meta = el('div', 'kg-meta small');
      if (it.status === 'busy' || it.status === 'queued') meta.textContent = t('busy');
      else if (it.status === 'err') { meta.textContent = t('err'); meta.className += ' kg-bad'; }
      else {
        var out = effective(it), pct = K.percentSaved(it.origSize, out.size);
        meta.appendChild(el('span', null, t('info', { orig: bytes(it.origSize), out: bytes(out.size) })));
        meta.appendChild(el('strong', 'kg-pct' + (pct < 0 ? ' kg-neg' : ''), pct >= 0 ? t('saved', { pct: num(pct) }) : t('grew', { pct: num(-pct) })));
        body.appendChild(meta);
        var dm = el('div', 'kg-meta small muted', it.useOrig ? t('dims', { w: num(it.w), h: num(it.h) }) : t('dims', { w: num(it.ow), h: num(it.oh) }) + (it.scaled ? ' · ' + t('scaled', { w: num(it.w), h: num(it.h) }) : ''));
        body.appendChild(dm);
        if (it.useOrig) body.appendChild(el('div', 'kg-note small', t('orig_used')));
        else if (it.out.size > it.origSize) body.appendChild(el('div', 'kg-warn small', t('bigger')));
        if (it.fallback && !it.useOrig) body.appendChild(el('div', 'kg-warn small', t('fallback', { fmt: K.FORMATS[st.fmt].ext.toUpperCase(), real: (EXT[it.fallback] || it.fallback).toUpperCase() })));
      }
      if (it.status !== 'ok') body.appendChild(meta);
      var act = el('div', 'kg-act');
      if (it.status === 'ok') {
        var cb = el('button', 'btn btn-sm', t('cmp_h')); cb.type = 'button'; cb.setAttribute('data-act', 'sel'); cb.setAttribute('data-id', it.id); cb.setAttribute('aria-label', t('preview_l', { name: it.name })); cb.setAttribute('aria-pressed', String(it.id === selId)); act.appendChild(cb);
        if (it.useOrig || it.out.size > it.origSize) { var ob = el('button', 'btn btn-sm', t(it.useOrig ? 'use_new' : 'use_orig')); ob.type = 'button'; ob.setAttribute('data-act', 'orig'); ob.setAttribute('data-id', it.id); act.appendChild(ob); }
        var dl = el('button', 'btn btn-sm', t('dl')); dl.type = 'button'; dl.setAttribute('data-act', 'dl'); dl.setAttribute('data-id', it.id); act.appendChild(dl);
      }
      var rb = el('button', 'btn btn-sm kg-rm', t('remove')); rb.type = 'button'; rb.setAttribute('data-act', 'rm'); rb.setAttribute('data-id', it.id); rb.setAttribute('aria-label', t('remove_l', { name: it.name })); act.appendChild(rb);
      body.appendChild(act);
      li.appendChild(th); li.appendChild(body); ul.appendChild(li);
    });
  }
  function renderSum() {
    var ok = items.filter(function (x) { return x.status === 'ok'; }), sum = $('sum');
    if (!ok.length) { sum.textContent = ''; return; }
    var o = 0, n = 0; ok.forEach(function (x) { o += x.origSize; n += effective(x).size; });
    var pct = K.percentSaved(o, n), count = t(ok.length === 1 ? 'cnt_one' : 'cnt_other', { n: num(ok.length) });
    sum.textContent = pct >= 0 ? t('sum_save', { count: count, orig: bytes(o), out: bytes(n), pct: num(pct) }) : t('sum_grow', { count: count, orig: bytes(o), out: bytes(n), pct: num(-pct) });
  }
  function renderCompare() {
    var it = items.filter(function (x) { return x.id === selId; })[0], has = it && it.status === 'ok';
    $('cmpBox').hidden = !has; $('cmpHint').hidden = !!has;
    if (!has) return;
    if (!it.origUrl) it.origUrl = URL.createObjectURL(it.file);
    $('imgBefore').src = it.origUrl; $('imgAfter').src = it.useOrig ? it.origUrl : it.url;
    $('cmp').style.aspectRatio = it.w + ' / ' + it.h;
  }
  function render() {
    $('empty').hidden = items.length > 0; $('resBox').hidden = !items.length;
    renderList(); renderSum(); renderCompare();
    $('btnZip').disabled = !items.some(function (x) { return x.status === 'ok'; });
  }

  function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function removeItem(it) {
    freeOut(it); if (it.origUrl) URL.revokeObjectURL(it.origUrl);
    items = items.filter(function (x) { return x !== it; });
    if (selId === it.id) { var nx = items.filter(function (x) { return x.status === 'ok'; })[0]; selId = nx ? nx.id : null; }
  }
  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var it = find(Number(b.getAttribute('data-id'))), act = b.getAttribute('data-act'); if (!it) return;
    if (act === 'sel') { selId = it.id; render(); }
    else if (act === 'orig') { it.useOrig = !it.useOrig; render(); }
    else if (act === 'dl') download(effective(it), effName(it));
    else if (act === 'rm') { removeItem(it); render(); }
  });
  $('btnClear').addEventListener('click', function () { token++; items.slice().forEach(removeItem); selId = null; render(); });
  $('btnZip').addEventListener('click', async function () {
    var used = {}, files = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i]; if (it.status !== 'ok') continue;
      files.push({ name: K.uniqueName(effName(it), used), data: new Uint8Array(await effective(it).arrayBuffer()) });
    }
    if (files.length) download(K.zipStore(files), 'kompres-gambar.zip');
  });
  $('cmpRange').addEventListener('input', function (e) { $('cmp').style.setProperty('--p', e.target.value + '%'); });

  /* contoh: gambar sintetis berwarna dari token tema */
  $('btnSample').addEventListener('click', function () {
    var cs = getComputedStyle(document.documentElement), cols = ['--accent', '--mark', '--ok', '--err', '--g-php', '--g-teks'].map(function (v) { return cs.getPropertyValue(v).trim(); });
    var c = document.createElement('canvas'); c.width = 2400; c.height = 1600; var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 2400, 1600); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[5]); g.fillStyle = gr; g.fillRect(0, 0, 2400, 1600);
    for (var i = 0; i < 700; i++) { g.globalAlpha = 0.25 + Math.random() * 0.5; g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(Math.random() * 2400, Math.random() * 1600, 8 + Math.random() * 90, 0, 6.2832); g.fill(); }
    g.globalAlpha = 1;
    c.toBlob(function (b) { if (b) addFiles([new File([b], 'contoh.png', { type: 'image/png' })]); }, 'image/png');
  });

  I.onReady(function () { load(); buildSides(); toUi(); $('cmpRange').dispatchEvent(new Event('input')); render(); });
  document.addEventListener('sagalait:lang', function () { buildSides(); render(); });
  window.addEventListener('pagehide', function () { items.forEach(function (it) { freeOut(it); if (it.origUrl) URL.revokeObjectURL(it.origUrl); }); });
})();
