/* Tampilan Terbilang rupiah. Logika di terbilang.js. Riwayat hanya di memori; pengaturan disimpan di localStorage. */
(function () {
  'use strict';
  var T = window.Terbilang, I = window.SagalaI18n, KEY = 'sagalait-terbilang';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  var opts = { kapital: 'sentence', rupiah: true, sen: true }, hist = [], rows = [];

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!s) return;
      if (['lower', 'sentence', 'title', 'upper'].indexOf(s.kapital) >= 0) opts.kapital = s.kapital;
      if (typeof s.rupiah === 'boolean') opts.rupiah = s.rupiah;
      if (typeof s.sen === 'boolean') opts.sen = s.sen;
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* mode privat */ } }
  function toUi() { document.querySelector('input[name=kap][value="' + opts.kapital + '"]').checked = true; $('swRp').checked = opts.rupiah; $('swSen').checked = opts.sen; }

  function copy(text, btn, label) {
    var ok = function () { btn.textContent = t('common.copied'); setTimeout(function () { btn.textContent = label(); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { /* ditolak */ });
  }

  /* ---------- satu angka ---------- */
  var cur = null;
  function update() {
    var raw = $('num').value, err = $('err');
    if (raw.trim() === '') { cur = null; err.textContent = ''; $('empty').hidden = false; $('out').hidden = true; return; }
    var p = T.parse(raw);
    if (!p.ok) { cur = null; err.textContent = p.error === 'big' ? t('err_big') : t('err_nan'); $('empty').hidden = false; $('out').hidden = true; return; }
    err.textContent = ''; cur = { p: p, words: T.spell(p, opts), fmt: T.formatRp(p), raw: raw };
    $('words').textContent = cur.words; $('fmt').textContent = cur.fmt; $('empty').hidden = true; $('out').hidden = false;
  }
  function remember() {
    if (!cur) return;
    if (hist.length && hist[0].fmt === cur.fmt && hist[0].words === cur.words) return;
    hist.unshift({ fmt: cur.fmt, words: cur.words, raw: cur.raw }); hist = hist.slice(0, 10); renderHist();
  }
  function renderHist() {
    var ul = $('hist'); ul.textContent = ''; $('histEmpty').hidden = hist.length > 0; $('btnHClear').disabled = !hist.length;
    hist.forEach(function (h) {
      var li = document.createElement('li'), b = document.createElement('button'), w = document.createElement('span');
      b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = t('hist_use', { fmt: h.fmt }); b.setAttribute('data-raw', h.raw);
      w.className = 'small'; w.textContent = h.words; w.lang = 'id'; li.appendChild(b); li.appendChild(w); ul.appendChild(li);
    });
  }
  $('num').addEventListener('input', update);
  $('num').addEventListener('change', remember);
  $('num').addEventListener('keydown', function (e) { if (e.key === 'Enter') remember(); });
  $('cases').addEventListener('change', function (e) { opts.kapital = e.target.value; save(); update(); batchRun(); });
  $('swRp').addEventListener('change', function (e) { opts.rupiah = e.target.checked; save(); update(); batchRun(); });
  $('swSen').addEventListener('change', function (e) { opts.sen = e.target.checked; save(); update(); batchRun(); });
  $('btnCopyW').addEventListener('click', function () { if (cur) { copy(cur.words, $('btnCopyW'), function () { return t('common.copy'); }); remember(); } });
  $('btnCopyF').addEventListener('click', function () { if (cur) { copy(cur.fmt, $('btnCopyF'), function () { return t('common.copy'); }); remember(); } });
  $('btnSample').addEventListener('click', function () { $('num').value = '1.250.000,50'; update(); remember(); $('batch').value = '1000\n2.500.000\n12,5\nabc'; batchRun(); });
  $('hist').addEventListener('click', function (e) { var b = e.target.closest('[data-raw]'); if (b) { $('num').value = b.getAttribute('data-raw'); update(); $('num').focus(); } });
  $('btnHClear').addEventListener('click', function () { hist = []; renderHist(); });

  /* ---------- batch ---------- */
  function batchRun() {
    rows = T.batch($('batch').value, opts);
    var tb = $('brows'); tb.textContent = ''; $('bwrap').hidden = !rows.length; $('btnBCopy').disabled = $('btnBCsv').disabled = !rows.length;
    rows.forEach(function (r) {
      var tr = document.createElement('tr'), a = document.createElement('td'), f = document.createElement('td'), w = document.createElement('td');
      a.textContent = r.input; a.className = 'tb-mono';
      if (r.ok) { f.textContent = r.format; f.className = 'tb-mono'; w.textContent = r.words; w.lang = 'id'; }
      else { f.textContent = '–'; w.textContent = t('batch_bad'); w.className = 'tb-bad'; }
      tr.appendChild(a); tr.appendChild(f); tr.appendChild(w); tb.appendChild(tr);
    });
  }
  $('batch').addEventListener('input', batchRun);
  $('btnBCopy').addEventListener('click', function () {
    var tsv = rows.map(function (r) { return [r.input, r.ok ? r.format : '', r.ok ? r.words : ''].join('\t'); }).join('\n');
    copy(tsv, $('btnBCopy'), function () { return t('batch_copy'); });
  });
  $('btnBCsv').addEventListener('click', function () {
    var u = URL.createObjectURL(new Blob(['﻿' + T.toCsv(rows)], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = u; a.download = 'terbilang.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
  });

  I.onReady(function () { load(); toUi(); update(); batchRun(); renderHist(); });
  document.addEventListener('sagalait:lang', function () { update(); batchRun(); renderHist(); });
})();
