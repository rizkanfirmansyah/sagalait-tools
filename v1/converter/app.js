/* Antarmuka Konverter data. Semua teks ke DOM lewat textContent. Data tidak disimpan atau dikirim ke mana pun. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAXROWS = 500, TEXT = ['json', 'object', 'serialize', 'array', 'csv'], TABULAR = ['csv', 'table', 'excel'];
  var EXT = { json: 'json', array: 'php', object: 'php', serialize: 'txt', csv: 'csv', table: 'csv', excel: 'xlsx' };
  var HINT = {
    json: '', csv: 'Tanpa judul kolom, hasilnya array dari array.',
    table: 'Tempel langsung dari Excel atau Google Sheets (kolom dipisah tab).',
    excel: 'Tempel dari Excel atau Google Sheets, atau buka berkas .xlsx (sheet pertama).',
    array: 'Contoh: [\'nama\' => \'Ani\'] atau array(...). Boleh diawali $x = atau return, dan diakhiri titik koma.',
    object: 'Sama seperti array PHP; awalan (object) dan stdClass::__set_state() dikenali.',
    serialize: 'Hasil serialize() PHP, misalnya a:1:{s:4:"nama";s:3:"Ani";}. Object menjadi array biasa.'
  };
  var OUTHINT = {
    json: '', csv: 'Array berisi object menjadi baris, key menjadi judul kolom. Isi bersarang ditulis sebagai JSON.',
    table: 'Menampilkan sampai ' + MAXROWS + ' baris. Salin menghasilkan teks yang bisa ditempel ke Excel.',
    excel: 'Berkas .xlsx berisi satu sheet. Angka dan true/false disimpan sebagai tipe aslinya.',
    array: 'Sintaks array pendek PHP.', object: 'Object memakai (object) [...], daftar tetap array.',
    serialize: 'Hasil siap untuk unserialize().'
  };
  var SAMPLE = [
    { id: 101, nama: 'Ani Wijaya', aktif: true, skor: 9.5, kota: 'Jakarta' },
    { id: 102, nama: 'Budi "Bud" Santoso', aktif: false, skor: 7, kota: 'Bandung, Jawa Barat' },
    { id: 103, nama: 'Cici', aktif: true, skor: 8.25, kota: null }
  ];
  var current = null, timer = 0;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fill(sel, def) {
    Object.keys(Conv.FORMATS).forEach(function (k) { var o = el('option', '', Conv.FORMATS[k].label); o.value = k; sel.appendChild(o); });
    sel.value = def;
  }
  function opts() { return { delim: $('delim').value, header: $('header').checked, types: $('types').checked }; }
  function download(blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }
  function tsv(v) { var t = Conv.toRows(v); return Conv.rowsToTsv(t.head ? [t.head].concat(t.rows) : t.rows); }

  function showErr(msg) { var e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
  function note(n) { return n === 1 ? '1 baris' : n + ' baris'; }

  function renderTable(box, v) {
    var t = Conv.toRows(v), table = el('table');
    if (t.head) {
      var tr = el('tr'); t.head.forEach(function (h) { tr.appendChild(el('th', '', h)); });
      table.appendChild(el('thead')).appendChild(tr);
    }
    var tb = el('tbody');
    t.rows.slice(0, MAXROWS).forEach(function (r) {
      var row = el('tr');
      r.forEach(function (x) {
        var td = el('td', typeof x === 'number' ? 'num' : x === null ? 'nil' : '', x === null ? '' : String(x));
        row.appendChild(td);
      });
      tb.appendChild(row);
    });
    table.appendChild(tb); box.appendChild(table);
    if (t.rows.length > MAXROWS) box.appendChild(el('p', 'cv-more', 'Menampilkan ' + MAXROWS + ' dari ' + t.rows.length + ' baris. Salin atau unduh untuk data lengkap.'));
    return t.rows.length;
  }

  function run() {
    var from = $('from').value, to = $('to').value, box = $('outBox'), text = $('src').value;
    clear(box); current = null; showErr(''); $('outInfo').textContent = ''; $('srcInfo').textContent = '';
    $('btnCopy').disabled = $('btnDown').disabled = $('btnSwap').disabled = true;
    if (!text.trim()) { box.appendChild(el('p', 'cv-empty', 'Hasil akan muncul di sini setelah data sumber diisi.')); return; }
    try {
      var v = Conv.parse(from, text, opts()), out;
      $('srcInfo').textContent = Array.isArray(v) ? v.length + ' item' : v !== null && typeof v === 'object' ? Object.keys(v).length + ' key' : 'nilai tunggal';
      if (to === 'table' || to === 'excel') {
        var n = renderTable(box, v); $('outInfo').textContent = note(n);
        current = { v: v, to: to, text: tsv(v) };
      } else {
        out = Conv.emit(to, v, { minify: $('minify').checked, delim: $('delimOut').value });
        var pre = el('pre', '', out); box.appendChild(pre);
        $('outInfo').textContent = out.length.toLocaleString('id-ID') + ' karakter';
        current = { v: v, to: to, text: out };
      }
      $('btnCopy').disabled = $('btnDown').disabled = $('btnSwap').disabled = false;
    } catch (e) {
      showErr(e.message); box.appendChild(el('p', 'cv-empty', 'Belum bisa dikonversi. Periksa pesan galat di panel sumber.'));
    }
  }
  function later() { clearTimeout(timer); timer = setTimeout(run, 120); }

  function syncUi() {
    var from = $('from').value, to = $('to').value, tab = TABULAR.indexOf(from) >= 0;
    $('oDelim').hidden = from !== 'csv'; $('oHeader').hidden = $('oTypes').hidden = !tab;
    $('oMinify').hidden = to !== 'json'; $('oDelimOut').hidden = to !== 'csv';
    $('srcHint').textContent = HINT[from] || ''; $('outHint').textContent = OUTHINT[to] || '';
    $('btnDown').textContent = to === 'excel' ? 'Unduh .xlsx' : 'Unduh .' + EXT[to];
    $('btnCopy').textContent = to === 'table' || to === 'excel' ? 'Salin untuk Excel' : 'Salin';
  }

  function sampleText(from) {
    if (from === 'table' || from === 'excel') return tsv(SAMPLE);
    return Conv.emit(from === 'object' ? 'object' : from, SAMPLE, { delim: ',' });
  }

  function loadFile(f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var done = function (text, fmt) { if (fmt) $('from').value = fmt; $('src').value = text; syncUi(); run(); };
    if (ext === 'xlsx') {
      f.arrayBuffer().then(Conv.readXlsx).then(function (rows) { $('header').checked = true; done(Conv.rowsToTsv(rows), 'excel'); })
        .catch(function (e) { showErr(e.message); });
      return;
    }
    f.text().then(function (t) { done(t, { json: 'json', csv: 'csv', tsv: 'table', php: 'array' }[ext]); });
  }

  $('from').addEventListener('change', function () { syncUi(); run(); });
  $('to').addEventListener('change', function () { syncUi(); run(); });
  ['delim', 'header', 'types', 'minify', 'delimOut'].forEach(function (id) { $(id).addEventListener('change', run); });
  $('src').addEventListener('input', later);
  $('file').addEventListener('change', function (e) { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; });
  $('btnSample').addEventListener('click', function () { $('src').value = sampleText($('from').value); $('header').checked = true; run(); });
  $('btnClear').addEventListener('click', function () { $('src').value = ''; run(); $('src').focus(); });
  $('btnCopy').addEventListener('click', function () {
    if (!current) return;
    var b = $('btnCopy'), old = b.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(current.text) : Promise.reject()).then(function () { b.textContent = 'Tersalin'; })
      .catch(function () { b.textContent = 'Gagal menyalin'; }).then(function () { setTimeout(function () { b.textContent = old; }, 1500); });
  });
  $('btnDown').addEventListener('click', function () {
    if (!current) return;
    if (current.to === 'excel') download(Conv.emitXlsx(current.v), 'hasil.xlsx');
    else download(new Blob([current.text], { type: 'text/plain;charset=utf-8' }), 'hasil.' + EXT[current.to]);
  });
  $('btnSwap').addEventListener('click', function () {
    if (!current) return;
    var prev = $('from').value, to = current.to;
    $('src').value = current.text; $('from').value = to === 'excel' ? 'table' : to; $('to').value = prev;
    $('header').checked = !!Conv.toRows(current.v).head; $('delim').value = 'auto';
    syncUi(); run();
  });

  fill($('from'), 'json'); fill($('to'), 'array');
  syncUi(); run();
  window.__cv = { run: run, state: function () { return current; } };
})();
