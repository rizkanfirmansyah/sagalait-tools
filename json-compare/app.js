/* Antarmuka Pembanding JSON. Semua teks ditampilkan lewat textContent. Isi JSON tidak pernah disimpan atau dikirim; hanya opsi yang diingat. */
(function () {
  'use strict';
  var KEY = 'sagalait-json-compare', PAGE = 300;
  var $ = function (id) { return document.getElementById(id); };
  var opt = loadOpt(), filter = 'all', query = '', shown = PAGE, last = null, timer = null;

  function loadOpt() {
    var d = JC.defaults();
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') Object.keys(d).forEach(function (k) { if (typeof s[k] === typeof d[k]) d[k] = s[k]; }); } catch (e) { /* abaikan */ }
    if (['index', 'key', 'unordered'].indexOf(d.arrayMode) < 0) d.arrayMode = 'index';
    return d;
  }
  function saveOpt() { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch (e) { /* abaikan */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function kb(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1).replace('.', ',') + ' KB'; }
  function count(v) { var n = 0; (function w(x) { if (Array.isArray(x)) x.forEach(w); else if (x && typeof x === 'object') { Object.keys(x).forEach(function (k) { n++; w(x[k]); }); } })(v); return n; }

  var SAMPLE_A = '{\n  "status": "ok",\n  "page": 1,\n  "total": 3,\n  "data": [\n    { "id": 101, "name": "Ani", "role": "admin", "active": true, "score": 9.5 },\n    { "id": 102, "name": "Budi", "role": "user", "active": true, "score": 7 },\n    { "id": 103, "name": "Cici", "role": "user", "active": false, "score": 8.2 }\n  ],\n  "meta": { "version": "1.4.0", "cached": false }\n}';
  var SAMPLE_B = '{\n  "status": "ok",\n  "page": "1",\n  "total": 4,\n  "data": [\n    { "id": 101, "name": "Ani", "role": "owner", "active": true, "score": 9.5 },\n    { "id": 102, "name": "Budi", "role": "user", "active": false, "score": 7.5 },\n    { "id": 103, "name": "Cici", "role": "user", "active": false, "score": 8.2, "email": "cici@contoh.id" },\n    { "id": 104, "name": "Dedi", "role": "user", "active": true, "score": 6 }\n  ],\n  "meta": { "version": "1.5.0" }\n}';

  function side(id) {
    var t = $('t' + id), r = JC.parse(t.value), s = $('s' + id), e = $('e' + id);
    clear(e); e.hidden = true; s.textContent = '';
    if (r.empty) return { empty: true };
    if (r.error) {
      e.hidden = false;
      e.appendChild(el('p', '', 'JSON tidak valid' + (r.line ? ' di baris ' + r.line + (r.col ? ', kolom ' + r.col : '') : '') + '.'));
      e.appendChild(el('p', 'small', r.error));
      if (r.hint) e.appendChild(el('p', 'small', r.hint));
      return { error: true };
    }
    s.textContent = 'valid · ' + kb(r.bytes) + ' · ' + count(r.value) + ' key';
    return { value: r.value, text: t.value };
  }

  function run() {
    var a = side('a'), b = side('b');
    if (a.empty || b.empty || a.error || b.error) { last = null; renderEmpty(a, b); return; }
    last = { res: JC.compare(a.value, b.value, opt), a: a, b: b };
    shown = PAGE; render();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 250); }

  function renderEmpty(a, b) {
    var out = $('result'); clear(out);
    var p = el('section', 'panel empty');
    if ((a.error || b.error)) p.appendChild(el('p', '', 'Perbaiki JSON yang ditandai merah dulu.'));
    else { p.appendChild(el('p', '', 'Tempel JSON di kedua sisi untuk mulai membandingkan.')); p.appendChild(el('p', 'small', 'Cocok untuk memeriksa response API sebelum dan sesudah perubahan.')); var bt = el('button', 'btn', 'Coba dengan contoh'); bt.type = 'button'; bt.addEventListener('click', sample); p.appendChild(bt); }
    out.appendChild(p);
  }

  var KIND_ORDER = ['added', 'removed', 'changed', 'type', 'length'];
  function render() {
    var out = $('result'), r = last.res; clear(out);
    $('rowKey').hidden = opt.arrayMode !== 'key';
    var total = r.diffs.length;
    if (r.same) {
      var bn = el('div', 'banner ok'); bn.appendChild(el('span', 'dot', '✓')); bn.appendChild(el('span', '', 'Kedua JSON sama'));
      var asi = el('span', 'aside', r.equal + ' nilai dibandingkan' + (r.skipped ? ', ' + r.skipped + ' diabaikan' : '')); bn.appendChild(asi); out.appendChild(bn);
      if (last.a.text.replace(/\s+/g, '') !== last.b.text.replace(/\s+/g, '')) out.appendChild(el('p', 'small muted jc-warn', 'Teks aslinya berbeda, tetapi hanya pada format, spasi, atau urutan key. Nilainya sama.'));
      appendNotes(out, r); return;
    }
    var bn2 = el('div', 'banner bad'); bn2.appendChild(el('span', 'dot', '!')); bn2.appendChild(el('span', '', total + ' perbedaan ditemukan'));
    bn2.appendChild(el('span', 'aside', r.equal + ' nilai sama' + (r.skipped ? ' · ' + r.skipped + ' diabaikan' : ''))); out.appendChild(bn2);

    var sum = el('div', 'jc-sum'); sum.setAttribute('role', 'group'); sum.setAttribute('aria-label', 'Saring jenis perbedaan');
    function chip(key, label, n) {
      var c = el('button', 'jc-chip'); c.type = 'button'; c.setAttribute('aria-pressed', String(filter === key)); c.disabled = !n && key !== 'all';
      c.appendChild(document.createTextNode(label)); c.appendChild(el('b', '', String(n)));
      c.addEventListener('click', function () { filter = filter === key && key !== 'all' ? 'all' : key; shown = PAGE; render(); });
      sum.appendChild(c);
    }
    chip('all', 'Semua', total);
    KIND_ORDER.forEach(function (k) { chip(k, JC.KINDS[k], r.counts[k]); });
    out.appendChild(sum);

    var bar = el('div', 'jc-bar'), q = el('input', 'field-sm'); q.type = 'search'; q.placeholder = 'Cari path atau nilai'; q.value = query; q.setAttribute('aria-label', 'Cari di hasil');
    q.addEventListener('input', function () { query = q.value; shown = PAGE; renderList(); });
    var btns = el('div', 'btns'), cs = el('button', 'btn', 'Salin ringkasan'), dj = el('button', 'btn', 'Unduh laporan .json');
    cs.type = 'button'; dj.type = 'button';
    cs.addEventListener('click', function () { copy(summaryText(r), cs); });
    dj.addEventListener('click', function () { download('perbedaan-json.json', JSON.stringify(report(r), null, 2)); });
    btns.appendChild(cs); btns.appendChild(dj); bar.appendChild(q); bar.appendChild(btns); out.appendChild(bar);

    var list = el('div', 'jc-list'); list.id = 'list'; out.appendChild(list);
    var more = el('div'); more.id = 'more'; out.appendChild(more);
    appendNotes(out, r);
    renderList();
  }

  function appendNotes(out, r) {
    var ns = r.notes.slice();
    if (JC.bigNumbers(last.a.text) || JC.bigNumbers(last.b.text)) ns.push('Ada angka bulat lebih dari 15 digit. JavaScript membulatkannya, jadi dua angka yang beda di belakang bisa terbaca sama. Bila itu ID besar, simpan sebagai teks di JSON.');
    ns.forEach(function (t) { var d = el('div', 'issue info jc-warn'); d.appendChild(el('p', 'small', t)); out.appendChild(d); });
  }

  function fmtVal(v) {
    if (v === undefined) return '';
    var s = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : JSON.stringify(v);
    return s;
  }
  function valCell(title, v) {
    var c = el('div', 'jc-v'); c.appendChild(el('h4', '', title));
    var s = fmtVal(v), full = s.length > 300, pre = el('pre', '', full ? s.slice(0, 300) + '…' : s); c.appendChild(pre);
    var meta = JC.describe(v); if (meta && (typeof v === 'object' && v !== null)) c.appendChild(el('p', 'meta', meta));
    if (full) { var b = el('button', 'jc-more', 'Tampilkan semua (' + s.length + ' karakter)'); b.type = 'button'; var open = false; b.addEventListener('click', function () { open = !open; pre.textContent = open ? s : s.slice(0, 300) + '…'; b.textContent = open ? 'Ringkas' : 'Tampilkan semua (' + s.length + ' karakter)'; }); c.appendChild(b); }
    return c;
  }
  function visible() {
    var q = query.trim().toLowerCase();
    return last.res.diffs.filter(function (d) {
      if (filter !== 'all' && d.kind !== filter) return false;
      if (!q) return true;
      return d.path.toLowerCase().indexOf(q) >= 0 || fmtVal(d.before).toLowerCase().indexOf(q) >= 0 || fmtVal(d.after).toLowerCase().indexOf(q) >= 0;
    });
  }
  function renderList() {
    var list = $('list'), more = $('more'); if (!list) return;
    clear(list); clear(more);
    var rows = visible();
    if (!rows.length) { list.appendChild(el('p', 'muted', 'Tidak ada perbedaan yang cocok dengan saringan.')); return; }
    rows.slice(0, shown).forEach(function (d) {
      var row = el('div', 'jc-row ' + d.kind), head = el('div', 'jc-head');
      head.appendChild(el('span', 'jc-tag', JC.KINDS[d.kind])); head.appendChild(el('span', 'jc-path', d.path));
      if (d.note) head.appendChild(el('span', 'jc-note', d.note));
      row.appendChild(head);
      var vals = el('div', 'jc-vals' + (d.kind === 'added' || d.kind === 'removed' ? ' one' : ''));
      if (d.kind !== 'added') vals.appendChild(valCell(d.kind === 'length' ? 'Panjang sebelum' : 'Sebelum', d.before));
      if (d.kind !== 'removed') vals.appendChild(valCell(d.kind === 'length' ? 'Panjang sesudah' : 'Sesudah', d.after));
      row.appendChild(vals); list.appendChild(row);
    });
    if (rows.length > shown) {
      var b = el('button', 'btn', 'Tampilkan ' + Math.min(PAGE, rows.length - shown) + ' lagi (' + (rows.length - shown) + ' tersisa)'); b.type = 'button'; b.style.marginTop = '12px';
      b.addEventListener('click', function () { shown += PAGE; renderList(); }); more.appendChild(b);
    }
  }

  function brief(v) { var s = fmtVal(v); s = s.replace(/\s*\n\s*/g, ' '); return s.length > 80 ? s.slice(0, 80) + '…' : s; }
  function summaryText(r) {
    var head = r.diffs.length + ' perbedaan: ' + KIND_ORDER.filter(function (k) { return r.counts[k]; }).map(function (k) { return r.counts[k] + ' ' + JC.KINDS[k].toLowerCase(); }).join(', ');
    return head + '\n\n' + r.diffs.map(function (d) {
      var body = d.kind === 'added' ? '+ ' + brief(d.after) : d.kind === 'removed' ? '- ' + brief(d.before) : brief(d.before) + ' → ' + brief(d.after);
      return '[' + JC.KINDS[d.kind] + '] ' + d.path + ': ' + body + (d.note ? ' (' + d.note + ')' : '');
    }).join('\n');
  }
  function report(r) {
    return { ringkasan: { total: r.diffs.length, ditambah: r.counts.added, dihapus: r.counts.removed, nilai_berubah: r.counts.changed, tipe_beda: r.counts.type, panjang_beda: r.counts.length, nilai_sama: r.equal },
      perbedaan: r.diffs.map(function (d) { return { path: d.path, jenis: JC.KINDS[d.kind], sebelum: d.before === undefined ? null : d.before, sesudah: d.after === undefined ? null : d.after, catatan: d.note || undefined }; }) };
  }
  function copy(text, btn) {
    function done() { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = 'Tersalin'; clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() { var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal menyalin'; } ta.remove(); }
  }
  function download(name, text) { var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }

  function pretty(id) { var r = JC.parse($('t' + id).value); if (r.value !== undefined) { $('t' + id).value = JSON.stringify(r.value, null, 2); run(); } }
  function sample() { $('ta').value = SAMPLE_A; $('tb').value = SAMPLE_B; $('opts').open = false; opt.arrayMode = 'key'; opt.arrayKey = 'id'; syncOpts(); saveOpt(); run(); }
  function syncOpts() {
    $('arrayMode').value = opt.arrayMode; $('arrayKey').value = opt.arrayKey; $('tolerance').value = opt.tolerance; $('ignore').value = opt.ignore; $('trim').checked = opt.trim; $('loose').checked = opt.loose;
    $('rowKey').hidden = opt.arrayMode !== 'key';
  }
  function readFile(file, id) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { $('e' + id).hidden = false; $('e' + id).textContent = 'File lebih dari 50 MB. Pakai potongan yang lebih kecil.'; return; }
    file.arrayBuffer().then(function (buf) { $('t' + id).value = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''); run(); });
  }

  function init() {
    syncOpts();
    ['ta', 'tb'].forEach(function (id) { $(id).addEventListener('input', schedule); });
    $('fa').addEventListener('change', function (e) { readFile(e.target.files[0], 'a'); e.target.value = ''; });
    $('fb').addEventListener('change', function (e) { readFile(e.target.files[0], 'b'); e.target.value = ''; });
    $('fmtA').addEventListener('click', function () { pretty('a'); });
    $('fmtB').addEventListener('click', function () { pretty('b'); });
    $('btnSample').addEventListener('click', sample);
    $('btnSwap').addEventListener('click', function () { var t = $('ta').value; $('ta').value = $('tb').value; $('tb').value = t; run(); });
    $('btnClear').addEventListener('click', function () { $('ta').value = ''; $('tb').value = ''; filter = 'all'; query = ''; run(); $('ta').focus(); });
    [['arrayMode', 'change'], ['arrayKey', 'input'], ['tolerance', 'input'], ['ignore', 'input']].forEach(function (p) { $(p[0]).addEventListener(p[1], function () { opt[p[0]] = $(p[0]).value; saveOpt(); schedule(); }); });
    ['trim', 'loose'].forEach(function (k) { $(k).addEventListener('change', function () { opt[k] = $(k).checked; saveOpt(); schedule(); }); });
    run();
  }
  init();
  window.JCApp = { get last() { return last; } };
})();
