/* Tampilan Penguji hash dan HMAC. Logika di hash.js. Tidak ada data (teks, berkas, kunci) yang disimpan atau dikirim. */
(function () {
  'use strict';
  var H = window.HashLab, I = window.SagalaI18n, KEY = 'sagalait-hash';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  var MAX_BYTES = 256 * 1024 * 1024, CHUNK = 8 * 1024 * 1024;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function size(n) { return H.ALGOS && formatSize(n); }
  function formatSize(n) { var u = ['B', 'KB', 'MB', 'GB'], i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return new Intl.NumberFormat(I.locale, { maximumFractionDigits: i ? 1 : 0 }).format(n) + ' ' + u[i]; }

  var fmt = 'hex', data = new Uint8Array(0), file = null, loadToken = 0, runToken = 0, results = {}, hmacRes = '';
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && ['hex', 'upper', 'base64'].indexOf(s.fmt) >= 0) fmt = s.fmt; } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ fmt: fmt })); } catch (e) { /* mode privat */ } }
  function hasSubtle() { return !!(window.crypto && window.crypto.subtle); }

  function copy(text, btn, label) {
    var ok = function () { btn.textContent = t('common.copied'); setTimeout(function () { btn.textContent = label(); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { /* ditolak */ });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var src = $(b.getAttribute('data-copy')); copy(src.getAttribute('data-raw') || src.textContent, b, function () { return t('common.copy'); });
  });

  /* ---------- baca berkas bertahap ---------- */
  async function readFile(f, tk) {
    if (f.size > MAX_BYTES) { $('err').textContent = t('e_big', { size: formatSize(f.size), max: formatSize(MAX_BYTES) }); return null; }
    var out = new Uint8Array(f.size), pos = 0, prog = $('prog'); prog.hidden = false;
    try {
      while (pos < f.size) {
        if (tk !== loadToken) { prog.hidden = true; return null; }
        var buf = await f.slice(pos, pos + CHUNK).arrayBuffer(); out.set(new Uint8Array(buf), pos); pos += buf.byteLength;
        var pct = f.size ? Math.floor(pos * 100 / f.size) : 100; $('bar').style.width = pct + '%'; $('progTxt').textContent = t('reading', { pct: pct });
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    } catch (e) { prog.hidden = true; $('err').textContent = t('e_read'); return null; }
    prog.hidden = true; return out;
  }

  /* ---------- hitung ---------- */
  function fmtOut(u8) { return H.format(u8, fmt); }
  async function compute() {
    var tk = ++runToken, bytes = data; $('subtleErr').textContent = hasSubtle() ? '' : t('e_subtle');
    $('stat').textContent = t('hashing');
    var res = {}, i, a;
    for (i = 0; i < H.ALGOS.length; i++) {
      a = H.ALGOS[i];
      try { res[a.id] = (a.id === 'md5' || hasSubtle()) ? await H.digest(a.id, bytes) : null; } catch (e) { res[a.id] = null; }
      if (tk !== runToken) return;
    }
    results = res; $('stat').textContent = t('bytes_n', { n: new Intl.NumberFormat(I.locale).format(bytes.length) });
    renderList(); await computeHmac(tk);
  }
  function renderList() {
    var ul = $('list'); ul.textContent = ''; var ex = H.normalize($('exp').value), matched = null;
    H.ALGOS.forEach(function (a) {
      var u = results[a.id], li = el('li', 'hs-item'), head = el('div', 'hs-ihead');
      head.appendChild(el('strong', null, a.label));
      if (a.weak) head.appendChild(el('span', 'hs-tag', t(a.id === 'md5' ? 'weak_tag' : 'weak_tag1')));
      var row = el('div', 'hs-row'), code = el('code', 'hs-val', u ? fmtOut(u) : '–'); code.id = 'h_' + a.id; if (u) code.setAttribute('data-raw', fmtOut(u));
      var b = el('button', 'btn btn-sm', t('common.copy')); b.type = 'button'; b.setAttribute('data-copy', code.id); b.setAttribute('aria-label', t('common.copy') + ' ' + a.label); b.disabled = !u;
      if (u && ex.ok) { var same = H.equalHex(H.toHex(u), ex.hex); if (same) matched = a.label; var m = el('span', 'hs-match ' + (same ? 'is-ok' : 'is-no'), (same ? '✓ ' : '✗ ') + t(same ? 'match' : 'nomatch')); head.appendChild(m); }
      row.appendChild(code); row.appendChild(b); li.appendChild(head); li.appendChild(row);
      if (a.weak) li.appendChild(el('p', 'small muted', t(a.id === 'md5' ? 'weak_md5' : 'weak_sha1')));
      ul.appendChild(li);
    });
    var msg = $('expMsg'); msg.className = 'small';
    if (!$('exp').value.trim()) msg.textContent = '';
    else if (!ex.ok) { msg.textContent = t('exp_bad'); msg.className = 'small hs-err'; }
    else { var g = H.guessAlgo(ex.hex), gl = g ? H.algo(g).label : null; msg.textContent = (gl ? t('exp_algo', { algo: gl }) + ' ' : '') + (matched ? '' : t('exp_nomatch')); if (!matched) msg.className = 'small hs-err'; }
  }

  async function computeHmac(tk) {
    var kraw = $('key').value, kf = document.querySelector('input[name=kf]:checked').value, ke = $('keyErr'), out = $('hmacOut'); ke.textContent = ''; $('keyWarn').textContent = '';
    var key;
    if (kf === 'hex') { var n = H.normalize(kraw); if (kraw.trim() === '') key = new Uint8Array(0); else if (!n.ok || n.kind !== 'hex') { ke.textContent = t('hmac_key_bad'); out.textContent = '–'; hmacRes = ''; return; } else key = H.fromHex(n.hex); }
    else key = H.utf8(kraw);
    if (!key.length) $('keyWarn').textContent = t('hmac_empty_key');
    var id = $('halgo').value;
    if (id !== 'md5' && !hasSubtle()) { out.textContent = '–'; return; }
    try { var u = await H.hmac(id, key, data); if (tk !== undefined && tk !== runToken) return; out.textContent = fmtOut(u); out.setAttribute('data-raw', fmtOut(u)); hmacRes = out.textContent; }
    catch (e) { out.textContent = '–'; }
  }

  /* ---------- peristiwa ---------- */
  var timer = 0; function later() { clearTimeout(timer); timer = setTimeout(compute, 120); }
  function setText() { data = H.utf8($('txt').value); later(); }
  $('txt').addEventListener('input', setText);
  $('modes').addEventListener('change', function (e) {
    var m = e.target.value; $('boxText').hidden = m !== 'text'; $('boxFile').hidden = m !== 'file'; $('err').textContent = '';
    loadToken++; if (m === 'text') setText(); else { data = new Uint8Array(0); file = null; $('fileInfo').textContent = ''; compute(); }
  });
  async function pick(f) {
    if (!f) return; var tk = ++loadToken; file = f; $('err').textContent = ''; $('fileInfo').textContent = t('file_info', { name: f.name, size: formatSize(f.size) });
    var u = await readFile(f, tk); if (!u || tk !== loadToken) return; data = u; compute();
  }
  $('file').addEventListener('change', function (e) { pick(e.target.files[0]); e.target.value = ''; });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function () { drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
  $('btnCancel').addEventListener('click', function () { loadToken++; $('prog').hidden = true; file = null; $('fileInfo').textContent = ''; data = new Uint8Array(0); compute(); });
  $('fmts').addEventListener('change', function (e) { fmt = e.target.value; save(); renderList(); computeHmac(); });
  $('exp').addEventListener('input', renderList);
  $('key').addEventListener('input', function () { computeHmac(); });
  $('kfmt').addEventListener('change', function () { computeHmac(); });
  $('halgo').addEventListener('change', function () { computeHmac(); });
  function compare() {
    var r = H.compare($('cA').value, $('cB').value), out = $('cRes'); out.className = 'hs-res';
    if (!$('cA').value.trim() || !$('cB').value.trim()) { out.textContent = ''; return; }
    if (!r.ok) { out.textContent = t('cmp_bad', { which: r.which === 'a' ? t('cmp_a') : t('cmp_b') }); out.className += ' is-no'; return; }
    if (r.same) { out.textContent = r.algoA ? t('cmp_same', { algo: H.algo(r.algoA).label }) : t('cmp_same_unk'); out.className += ' is-ok'; return; }
    var a = H.normalize($('cA').value).hex, b = H.normalize($('cB').value).hex;
    out.textContent = a.length !== b.length ? t('cmp_len', { a: a.length, b: b.length }) : t('cmp_diff'); out.className += ' is-no';
  }
  $('cA').addEventListener('input', compare); $('cB').addEventListener('input', compare);
  $('btnSample').addEventListener('click', function () {
    document.querySelector('input[name=mode][value=text]').checked = true; $('boxText').hidden = false; $('boxFile').hidden = true;
    $('txt').value = 'The quick brown fox jumps over the lazy dog'; $('key').value = 'rahasia'; $('exp').value = 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592';
    $('cA').value = 'D7A8FBB3:07D78094:69CA9ABC:B0082E4F:8D5651E4:6D3CDB76:2D02D0BF:37C9E592'; $('cB').value = '1HqLsv7YBwUbXYxMLTuAnCuLEmWBFBd0lSbf2l7GQfs='; setText(); compare();
  });

  function buildAlgo() { var sel = $('halgo'), keep = sel.value || 'sha256'; sel.textContent = ''; H.ALGOS.forEach(function (a) { var o = el('option', null, a.label); o.value = a.id; sel.appendChild(o); }); sel.value = keep; }
  I.onReady(function () { document.querySelector('input[name=fmt][value="' + fmt + '"]').checked = true; buildAlgo(); setText(); });
  document.addEventListener('sagalait:lang', function () { renderList(); compare(); computeHmac(); if (file) $('fileInfo').textContent = t('file_info', { name: file.name, size: formatSize(file.size) }); });
})();
