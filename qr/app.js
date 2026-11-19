/* Tampilan Pembuat QR. Logika di qr.js. Isi QR, kata sandi, dan logo tidak disimpan atau dikirim; hanya pilihan tampilan yang disimpan. */
(function () {
  'use strict';
  var Q = window.QrLab, I = window.SagalaI18n, KEY = 'sagalait-qr';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var TYPES = ['url', 'text', 'wifi', 'vcard', 'email', 'sms', 'tel', 'wa', 'geo', 'event'];
  /* kunci pembuat isi -> id elemen */
  var FIELDS = {
    text: { text: 'f-text' }, url: { url: 'f-url' }, wifi: { ssid: 'f-ssid', pass: 'f-pass' },
    vcard: { first: 'f-first', last: 'f-last', org: 'f-org', title: 'f-title', tel: 'f-vtel', email: 'f-vemail', url: 'f-vurl', addr: 'f-addr' },
    email: { to: 'f-to', subject: 'f-subject', body: 'f-body' }, sms: { tel: 'f-stel', msg: 'f-smsg' }, tel: { tel: 'f-ttel' }, wa: { tel: 'f-wtel', msg: 'f-wmsg' },
    geo: { lat: 'f-lat', lon: 'f-lon' }, event: { title: 'f-etitle', start: 'f-start', end: 'f-end', place: 'f-place', desc: 'f-desc' }
  };
  var st = { type: 'url', ecc: 'M', size: 512, margin: 4, fg: '#000000', bg: '#ffffff', shape: 'square' };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (TYPES.indexOf(s.type) >= 0) st.type = s.type;
      if (['L', 'M', 'Q', 'H'].indexOf(s.ecc) >= 0) st.ecc = s.ecc;
      if ([256, 512, 1024, 2048].indexOf(s.size) >= 0) st.size = s.size;
      if (s.margin >= 0 && s.margin <= 10 && s.margin % 1 === 0) st.margin = s.margin;
      if (Q.hexOk(s.fg)) st.fg = s.fg;
      if (Q.hexOk(s.bg)) st.bg = s.bg;
      if (s.shape === 'dots') st.shape = 'dots';
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* mode privat */ } }

  var logo = null, cur = null, timer = 0;

  /* ---------- baca isian ---------- */
  function collect(type) {
    var v = {}, map = FIELDS[type], k;
    for (k in map) v[k] = $(map[k]).value;
    if (type === 'wifi') { v.sec = $('f-sec').value; v.hidden = $('f-hidden').checked; }
    if (type === 'vcard') v.name = (String(v.first).trim() + ' ' + String(v.last).trim()).trim();
    if (type === 'event' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.start)) v.tz = new Date(v.start).getTimezoneOffset();
    return v;
  }
  function anyFilled(type) { var map = FIELDS[type]; return Object.keys(map).some(function (k) { return $(map[k]).value.trim() !== ''; }); }
  function fieldKeyFor(type, f) { return f === 'name' ? 'first' : f; }

  /* ---------- gambar ---------- */
  function draw(cv, qr, px, o) {
    cv.width = cv.height = px; var c = cv.getContext('2d'), n = qr.size, mg = o.margin, u = px / (n + 2 * mg);
    c.fillStyle = o.bg; c.fillRect(0, 0, px, px); c.fillStyle = o.fg;
    var box = o.logo ? Q.logoBox(n, o.logo.pct) : null, x, y;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      if (!qr.modules[y][x]) continue;
      if (box && x >= box.from && x < box.to && y >= box.from && y < box.to) continue;
      if (o.shape === 'dots' && !Q.isFinderZone(x, y, n)) { c.beginPath(); c.arc((x + mg + 0.5) * u, (y + mg + 0.5) * u, 0.46 * u, 0, 6.2832); c.fill(); }
      else { var x0 = Math.round((x + mg) * u), y0 = Math.round((y + mg) * u); c.fillRect(x0, y0, Math.round((x + mg + 1) * u) - x0, Math.round((y + mg + 1) * u) - y0); }
    }
    if (box && o.logo.img) {
      var side = box.side * u, iw = o.logo.img.naturalWidth || 256, ih = o.logo.img.naturalHeight || 256, k = Math.min(side / iw, side / ih), w = iw * k, h = ih * k;
      c.drawImage(o.logo.img, (box.x + mg) * u + (side - w) / 2, (box.x + mg) * u + (side - h) / 2, w, h);
    }
  }
  function opts() { return { margin: st.margin, fg: st.fg, bg: st.bg, shape: st.shape, logo: logo ? { img: logo.img, href: logo.data, pct: logo.pct } : null }; }

  /* ---------- tampilkan ---------- */
  function showErrors(type, errs, any) {
    Object.keys(FIELDS[type]).forEach(function (k) { $('e-' + FIELDS[type][k].slice(2)).textContent = ''; });
    var shown = 0;
    errs.forEach(function (e) {
      if (e.code === 'required' && !any) return;
      var id = FIELDS[type][fieldKeyFor(type, e.field)]; if (!id) return;
      var p = $('e-' + id.slice(2)); if (p && !p.textContent) { p.textContent = t('err_' + e.code); shown++; }
    });
    return shown;
  }
  function setState(s) { $('empty').hidden = s !== 'empty' && s !== 'incomplete'; $('empty').textContent = t(s === 'incomplete' ? 'incomplete' : 'empty'); $('bad').hidden = s !== 'bad'; $('out').hidden = s !== 'ok'; }

  function render() {
    var type = st.type, r = Q.build(type, collect(type)), any = anyFilled(type);
    showErrors(type, r.errors, any); cur = null;
    if (!r.text) { setState(any ? 'incomplete' : 'empty'); return; }
    var ecc = logo ? 'H' : st.ecc, qr;
    try { qr = Q.encode(r.text, { ecc: ecc, minVersion: logo ? 5 : 1 }); }
    catch (e) {
      if (e.code !== 'too_long') throw e;
      var mode = Q.pickMode(r.text), n = mode === 'byte' ? new TextEncoder().encode(r.text).length : r.text.length, unit = t(mode === 'byte' ? 'u_byte' : 'u_chars');
      $('bad').textContent = t('e_long', { n: new Intl.NumberFormat(I.locale).format(n), max: new Intl.NumberFormat(I.locale).format(Q.maxChars(mode, ecc)), ecc: ecc, unit: unit }) + (logo ? t('e_long_logo') : '');
      setState('bad'); return;
    }
    cur = { qr: qr, payload: r.text, type: type };
    var cv = $('cv'); draw(cv, qr, 720, opts()); cv.setAttribute('aria-label', t('alt', { type: t('t_' + type) }));
    $('info').textContent = t('info', { v: qr.version, n: qr.size, ecc: qr.ecc, mode: t('mode_' + qr.mode) });
    $('used').textContent = t('used', { used: qr.usedBytes, cap: qr.capacityBytes });
    $('payload').textContent = r.text;
    var w = [], ul = $('warns'); ul.textContent = '';
    r.warnings.forEach(function (c) { w.push(t('w_' + c)); });
    if (type === 'wifi' && $('f-sec').value !== 'nopass') w.push(t('w_wifi'));
    if (st.margin < 4) w.push(t('w_margin'));
    var rd = Q.readability(st.fg, st.bg); if (rd === 'low') w.push(t('w_low')); else if (rd === 'inverted') w.push(t('w_inv'));
    if (qr.version >= 20) w.push(t('w_dense', { n: qr.size }));
    if (logo) w.push(t('w_logo', { pct: Math.round(Q.logoBox(qr.size, logo.pct).covered * 100) }));
    w.forEach(function (x) { ul.appendChild(el('li', null, x)); });
    setState('ok');
  }
  function later() { clearTimeout(timer); timer = setTimeout(render, 120); }

  /* ---------- unduh dan salin ---------- */
  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function pngBlob() {
    return new Promise(function (res, rej) {
      var c = document.createElement('canvas'); draw(c, cur.qr, st.size, opts());
      c.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob kosong')); }, 'image/png');
    });
  }
  function flash(btn, key) { var old = btn.getAttribute('data-i18n'); btn.textContent = t(key); setTimeout(function () { btn.textContent = t(old); }, 1500); }
  $('btnPng').addEventListener('click', function () { if (cur) pngBlob().then(function (b) { download(b, 'qr-' + cur.type + '.png'); }); });
  $('btnSvg').addEventListener('click', function () {
    if (!cur) return;
    var svg = Q.toSvg(cur.qr, { margin: st.margin, fg: st.fg, bg: st.bg, shape: st.shape, logo: logo ? { href: logo.data, pct: logo.pct } : null, title: 'QR Code ' + t('t_' + cur.type) });
    download(new Blob([svg], { type: 'image/svg+xml' }), 'qr-' + cur.type + '.svg');
  });
  $('btnCopyImg').addEventListener('click', function () {
    var b = this; if (!cur) return;
    if (!(navigator.clipboard && window.ClipboardItem)) { flash(b, 'copy_fail'); return; }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]).then(function () { flash(b, 'common.copied'); }, function () { flash(b, 'copy_fail'); });
  });
  $('btnCopyTxt').addEventListener('click', function () {
    var b = this; if (!cur || !navigator.clipboard) return;
    navigator.clipboard.writeText(cur.payload).then(function () { flash(b, 'common.copied'); }, function () { /* ditolak */ });
  });

  /* ---------- jenis isi ---------- */
  function setType(type) {
    st.type = type; save();
    document.querySelectorAll('.qr-chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-type') === type ? 'true' : 'false'); });
    document.querySelectorAll('.qr-fs').forEach(function (f) { f.hidden = f.getAttribute('data-for') !== type; });
    render();
  }
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('.qr-chip'); if (b) setType(b.getAttribute('data-type')); });
  $('forms').addEventListener('input', later); $('forms').addEventListener('change', later);

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  $('btnSample').addEventListener('click', function () {
    var d1 = new Date(); d1.setDate(d1.getDate() + 1); d1.setHours(9, 0, 0, 0); var d2 = new Date(d1); d2.setHours(10, 30);
    var S = {
      url: { 'f-url': 'https://tools.sagalait.cloud' }, text: { 'f-text': 'Halo dari Tools SagalaIT!' },
      wifi: { 'f-ssid': 'Kafe Senja', 'f-pass': 'kopi12345' },
      vcard: { 'f-first': 'Budi', 'f-last': 'Santoso', 'f-org': 'PT Sagala Teknologi', 'f-title': 'Manajer Proyek', 'f-vtel': '+62 812 3456 7890', 'f-vemail': 'budi@contoh.id', 'f-vurl': 'https://contoh.id', 'f-addr': 'Jl. Merdeka No. 1, Jakarta' },
      email: { 'f-to': 'halo@contoh.id', 'f-subject': 'Tanya produk', 'f-body': 'Halo, saya ingin bertanya tentang produk Anda.' },
      sms: { 'f-stel': '+62 812 3456 7890', 'f-smsg': 'Halo, saya tertarik.' }, tel: { 'f-ttel': '+62 21 5551234' },
      wa: { 'f-wtel': '62 812 3456 7890', 'f-wmsg': 'Halo kak, saya mau pesan.' }, geo: { 'f-lat': '-6,175392', 'f-lon': '106,827153' },
      event: { 'f-etitle': 'Rapat mingguan', 'f-start': localStr(d1), 'f-end': localStr(d2), 'f-place': 'Ruang rapat A', 'f-desc': 'Bahas target minggu ini' }
    }[st.type], k;
    for (k in S) $(k).value = S[k];
    render();
  });

  /* ---------- tampilan ---------- */
  function syncEcc() {
    var v = logo ? 'H' : st.ecc;
    document.querySelectorAll('input[name=ecc]').forEach(function (r) { r.checked = r.value === v; r.disabled = !!logo; });
    $('eccLocked').hidden = !logo;
  }
  $('eccSeg').addEventListener('change', function (e) { st.ecc = e.target.value; save(); render(); });
  $('shapeSeg').addEventListener('change', function (e) { st.shape = e.target.value; save(); render(); });
  $('fg').addEventListener('input', function (e) { st.fg = e.target.value; save(); later(); });
  $('bg').addEventListener('input', function (e) { st.bg = e.target.value; save(); later(); });
  $('btnSwap').addEventListener('click', function () { var a = st.fg; st.fg = st.bg; st.bg = a; $('fg').value = st.fg; $('bg').value = st.bg; save(); render(); });
  $('size').addEventListener('change', function (e) { st.size = +e.target.value; save(); });
  $('margin').addEventListener('input', function (e) {
    var n = parseInt(e.target.value, 10); if (isNaN(n)) return;
    st.margin = Math.max(0, Math.min(10, n)); save(); later();
  });
  $('margin').addEventListener('change', function (e) { e.target.value = st.margin; });

  /* ---------- logo ---------- */
  function setLogo(file) {
    $('logoErr').textContent = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { $('logoErr').textContent = t('logo_bad'); return; }
    if (file.size > 10 * 1024 * 1024) { $('logoErr').textContent = t('logo_big'); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var w = im.naturalWidth || 256, h = im.naturalHeight || 256, k = Math.min(1, 256 / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      var data = c.toDataURL('image/png'), img = new Image();
      img.onload = function () {
        logo = { img: img, data: data, name: file.name, pct: +$('logoPct').value };
        $('logoThumb').src = data; $('logoName').textContent = t('logo_name', { name: file.name }); $('logoBox').hidden = false; syncEcc(); render();
      };
      img.src = data;
    };
    im.onerror = function () { URL.revokeObjectURL(url); $('logoErr').textContent = t('logo_bad'); };
    im.src = url;
  }
  $('logoFile').addEventListener('change', function (e) { setLogo(e.target.files[0]); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0]) setLogo(e.dataTransfer.files[0]); });
  $('logoPct').addEventListener('input', function (e) { $('logoPctOut').textContent = e.target.value; if (logo) { logo.pct = +e.target.value; later(); } });
  $('btnLogoDel').addEventListener('click', function () { logo = null; $('logoBox').hidden = true; $('logoThumb').removeAttribute('src'); syncEcc(); render(); });

  I.onReady(function () {
    $('fg').value = st.fg; $('bg').value = st.bg; $('size').value = String(st.size); $('margin').value = st.margin;
    document.querySelector('input[name=shape][value=' + st.shape + ']').checked = true;
    syncEcc(); setType(st.type);
  });
  document.addEventListener('sagalait:lang', function () { if (logo) $('logoName').textContent = t('logo_name', { name: logo.name }); render(); });
})();
