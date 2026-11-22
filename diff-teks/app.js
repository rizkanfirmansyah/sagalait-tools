/* Tampilan Pembanding teks. Algoritma di diff.js. Teks yang ditempel tidak pernah disimpan atau dikirim; yang tersimpan hanya pilihan opsi. */
(function () {
  'use strict';
  var D = window.DiffLab, I = window.SagalaI18n, KEY = 'sagalait-diff-teks', CHUNK = 600;
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function pl(key, n) { return t(key + (new Intl.PluralRules(I.locale).select(n) === 'one' ? '_one' : '_other'), { n: n }); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var O = { ignoreCase: false, ignoreSpace: false, hide: true, gran: 'line', view: window.matchMedia && matchMedia('(max-width: 700px)').matches ? 'uni' : 'side' };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      ['ignoreCase', 'ignoreSpace', 'hide'].forEach(function (k) { if (typeof s[k] === 'boolean') O[k] = s[k]; });
      if (s.gran === 'line' || s.gran === 'word') O.gran = s.gran;
      if (s.view === 'side' || s.view === 'uni') O.view = s.view;
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(O)); } catch (e) { /* mode privat */ } }

  var out = $('out'), cur = null, rows = [], shown = 0, navIdx = -1, timer = 0;

  function toast(msg) {
    var old = document.querySelector('.ui-toast'); if (old) old.remove();
    var n = el('div', 'ui-toast', msg); n.setAttribute('role', 'status'); document.body.appendChild(n); setTimeout(function () { n.remove(); }, 2200);
  }
  function opts() { return { ignoreCase: O.ignoreCase, ignoreSpace: O.ignoreSpace }; }

  /* ---------- sel teks dengan penanda kata (<del> dan <ins>) ---------- */
  function fillSegs(td, segs, tag) {
    segs.forEach(function (sg) { if (sg.ch) td.appendChild(el(tag, 'df-w', sg.text)); else td.appendChild(document.createTextNode(sg.text)); });
  }
  function mark(sym, label) { var td = el('td', 'df-m'); td.appendChild(el('span', 'vh', label)); var s2 = el('span', '', sym); s2.setAttribute('aria-hidden', 'true'); td.appendChild(s2); return td; }
  function num(n) { return el('td', 'df-n', n === undefined ? '' : String(n)); }
  function lineCell(text, segs, tag) { var td = el('td', 'df-c'); if (segs) fillSegs(td, segs, tag); else td.textContent = text; return td; }
  function blank(cls) { return el('td', cls); }

  function sideRow(r) {
    var tr = el('tr', 'df-r df-' + r.k), op = r.op, a = cur.aL, b = cur.bL;
    if (r.k === 'eq') { tr.appendChild(mark('', t('mk_same'))); tr.appendChild(num(op.a + 1)); tr.appendChild(lineCell(a[op.a])); tr.appendChild(mark('', t('mk_same'))); tr.appendChild(num(op.b + 1)); tr.appendChild(lineCell(b[op.b])); }
    else if (r.k === 'del') { tr.appendChild(mark('−', t('mk_del'))); tr.appendChild(num(op.a + 1)); tr.appendChild(lineCell(a[op.a])); tr.appendChild(blank('df-m df-blank')); tr.appendChild(blank('df-n df-blank')); tr.appendChild(blank('df-c df-blank')); }
    else if (r.k === 'ins') { tr.appendChild(blank('df-m df-blank')); tr.appendChild(blank('df-n df-blank')); tr.appendChild(blank('df-c df-blank')); tr.appendChild(mark('+', t('mk_add'))); tr.appendChild(num(op.b + 1)); tr.appendChild(lineCell(b[op.b])); }
    else { var w = D.inlineWords(a[op.a], b[op.b], opts()); tr.appendChild(mark('−', t('mk_del'))); tr.appendChild(num(op.a + 1)); tr.appendChild(lineCell('', w.a, 'del')); tr.appendChild(mark('+', t('mk_add'))); tr.appendChild(num(op.b + 1)); tr.appendChild(lineCell('', w.b, 'ins')); }
    return [tr];
  }
  function uniRow(r) {
    var op = r.op, a = cur.aL, b = cur.bL, tr, tr2;
    if (r.k === 'eq') { tr = el('tr', 'df-r df-eq'); tr.appendChild(num(op.a + 1)); tr.appendChild(num(op.b + 1)); tr.appendChild(mark('', t('mk_same'))); tr.appendChild(lineCell(b[op.b])); return [tr]; }
    if (r.k === 'del') { tr = el('tr', 'df-r df-del'); tr.appendChild(num(op.a + 1)); tr.appendChild(num()); tr.appendChild(mark('−', t('mk_del'))); tr.appendChild(lineCell(a[op.a])); return [tr]; }
    if (r.k === 'ins') { tr = el('tr', 'df-r df-ins'); tr.appendChild(num()); tr.appendChild(num(op.b + 1)); tr.appendChild(mark('+', t('mk_add'))); tr.appendChild(lineCell(b[op.b])); return [tr]; }
    var w = D.inlineWords(a[op.a], b[op.b], opts());
    tr = el('tr', 'df-r df-del'); tr.appendChild(num(op.a + 1)); tr.appendChild(num()); tr.appendChild(mark('−', t('mk_del'))); tr.appendChild(lineCell('', w.a, 'del'));
    tr2 = el('tr', 'df-r df-ins'); tr2.appendChild(num()); tr2.appendChild(num(op.b + 1)); tr2.appendChild(mark('+', t('mk_add'))); tr2.appendChild(lineCell('', w.b, 'ins'));
    return [tr, tr2];
  }
  function gapRow(r) {
    var tr = el('tr', 'df-r df-gap'), td = el('td'); td.colSpan = O.view === 'side' ? 6 : 4;
    var b = el('button', 'btn btn-sm df-gapbtn'); b.type = 'button'; b.appendChild(el('span', '', '⋯ ' + pl('gap', r.n) + ' · ')); b.appendChild(el('strong', '', t('gap_show')));
    b.addEventListener('click', function () {
      var frag = document.createDocumentFragment();
      r.ops.forEach(function (op) { (O.view === 'side' ? sideRow : uniRow)({ k: 'eq', op: op }).forEach(function (x) { frag.appendChild(x); }); });
      tr.parentNode.insertBefore(frag, tr); tr.remove(); out.focus({ preventScroll: true });
    });
    td.appendChild(b); tr.appendChild(td); return [tr];
  }

  /* ---------- baris yang ditampilkan: ringkas baris sama yang panjang ---------- */
  function buildRows(ops) {
    var ctx = 3, rs = [], i = 0, n = ops.length;
    while (i < n) {
      var op = ops[i];
      if (op.t !== 'eq') { rs.push({ k: op.t, op: op }); i++; continue; }
      var j = i; while (j < n && ops[j].t === 'eq') j++;
      var run = ops.slice(i, j), head = i > 0 ? ctx : 0, tail = j < n ? ctx : 0;
      if (!O.hide || run.length <= head + tail + 1) run.forEach(function (o) { rs.push({ k: 'eq', op: o }); });
      else {
        run.slice(0, head).forEach(function (o) { rs.push({ k: 'eq', op: o }); });
        rs.push({ k: 'gap', ops: run.slice(head, run.length - tail), n: run.length - head - tail });
        run.slice(run.length - tail).forEach(function (o) { rs.push({ k: 'eq', op: o }); });
      }
      i = j;
    }
    var prevChg = false; rs.forEach(function (r) { var c = r.k === 'del' || r.k === 'ins' || r.k === 'mod'; r.first = c && !prevChg; prevChg = c; });
    return rs;
  }
  var tbody = null;
  function newTable() {
    var tb = el('table', 'df-tbl df-' + O.view), cap = el('caption', 'vh', t('out_label')); tb.appendChild(cap);
    var cg = el('colgroup'); (O.view === 'side' ? ['m', 'n', 'c', 'm', 'n', 'c'] : ['n', 'n', 'm', 'c']).forEach(function (k) { cg.appendChild(el('col', 'df-col-' + k)); }); tb.appendChild(cg);
    var head = el('thead', 'vh'), tr = el('tr');
    (O.view === 'side' ? ['th_mark', 'th_na', 'th_ta', 'th_mark', 'th_nb', 'th_tb'] : ['th_na', 'th_nb', 'th_mark', 'th_text']).forEach(function (k) { var th = el('th', '', t(k)); th.scope = 'col'; tr.appendChild(th); });
    head.appendChild(tr); tb.appendChild(head); tbody = el('tbody'); tb.appendChild(tbody); out.appendChild(tb);
  }
  function renderMore() {
    var end = Math.min(rows.length, shown + CHUNK), frag = document.createDocumentFragment();
    for (var i = shown; i < end; i++) {
      var r = rows[i], trs = r.k === 'gap' ? gapRow(r) : (O.view === 'side' ? sideRow(r) : uniRow(r));
      if (r.first) trs[0].setAttribute('data-chg', '1');
      trs.forEach(function (x) { frag.appendChild(x); });
    }
    tbody.appendChild(frag); shown = end;
    var left = rows.length - shown; $('btnMore').hidden = left <= 0; if (left > 0) $('btnMore').textContent = t('more', { n: left });
  }

  /* ---------- mode kata ---------- */
  function renderWords(w) {
    var wrap = el('div', 'df-wpanes' + (O.view === 'uni' ? ' df-wuni' : ''));
    function pane(title, fn) { var p = el('div', 'df-pane'); p.appendChild(el('h3', 'df-ph', title)); var tx = el('p', 'df-ptxt'); fn(tx); p.appendChild(tx); wrap.appendChild(p); }
    if (O.view === 'side') {
      pane(t('a_l'), function (tx) { fillSegs(tx, w.a, 'del'); });
      pane(t('b_l'), function (tx) { fillSegs(tx, w.b, 'ins'); });
    } else {
      pane(t('pane_u'), function (tx) { w.u.forEach(function (sg) { if (sg.k === 'eq') tx.appendChild(document.createTextNode(sg.text)); else tx.appendChild(el(sg.k === 'del' ? 'del' : 'ins', 'df-w', sg.text)); }); });
    }
    out.appendChild(wrap);
    wrap.querySelectorAll('.df-ptxt').forEach(function (tx) {
      var was = false; Array.prototype.forEach.call(tx.childNodes, function (c) { var ch = c.nodeType === 1; if (ch && !was) c.setAttribute('data-chg', '1'); was = ch; });
    });
  }

  /* ---------- hitung dan tampilkan ---------- */
  function chip(text, cls) { return el('span', 'df-chip ' + cls, text); }
  function showStats(list) { var box = $('stats'); box.textContent = ''; list.forEach(function (c) { box.appendChild(chip(c[0], c[1])); }); }
  function showEmpty(key) { $('empty').hidden = false; $('empty').textContent = t(key); }
  function counts() {
    var A = $('ta').value, B = $('tb').value;
    $('cntA').textContent = t('cnt', { l: D.splitLines(A).length, c: Array.from(A).length }); $('cntB').textContent = t('cnt', { l: D.splitLines(B).length, c: Array.from(B).length });
  }
  function compute() {
    clearTimeout(timer); counts();
    var A = $('ta').value, B = $('tb').value;
    out.textContent = ''; $('empty').hidden = true; $('approx').hidden = true; $('btnMore').hidden = true; rows = []; shown = 0; navIdx = -1; cur = null;
    $('lblHide').hidden = O.gran === 'word';
    if (A === '' && B === '') { showStats([]); showEmpty('eq_empty'); return; }
    var o = opts(), aL = D.splitLines(A), bL = D.splitLines(B);
    if (O.gran === 'word') {
      var w = D.diffWords(A, B, o); cur = { aL: aL, bL: bL };
      showStats([['+' + w.addedWords + ' ' + pl('u_word', w.addedWords) + ' ' + t('st_add'), 'df-c-add'], ['−' + w.removedWords + ' ' + pl('u_word', w.removedWords) + ' ' + t('st_rem'), 'df-c-del']]);
      $('approx').hidden = !w.approx;
      if (w.u.every(function (x) { return x.k === 'eq'; })) { showEmpty(A === B ? 'eq_same' : 'eq_opts'); return; }
      renderWords(w); return;
    }
    var r = D.diffLines(aL, bL, o), st = D.stats(r.ops); cur = { aL: aL, bL: bL, ops: r.ops };
    var list = [['+' + st.added + ' ' + pl('u_line', st.added) + ' ' + t('st_add'), 'df-c-add'], ['−' + st.removed + ' ' + pl('u_line', st.removed) + ' ' + t('st_rem'), 'df-c-del'], [st.same + ' ' + pl('u_line', st.same) + ' ' + t('st_same'), 'df-c-same']];
    if (st.changed) list.push([st.changed + ' ' + pl('u_line', st.changed) + ' ' + t('st_chg'), 'df-c-chg']);
    showStats(list); $('approx').hidden = !r.approx;
    if (!st.added && !st.removed) { showEmpty(r.ops.every(function (op) { return aL[op.a] === bL[op.b]; }) ? 'eq_same' : 'eq_opts'); return; }
    rows = buildRows(r.ops); newTable(); renderMore();
  }
  function later() { clearTimeout(timer); timer = setTimeout(compute, 150); }

  /* ---------- navigasi antar perbedaan ---------- */
  function chgs() { return out.querySelectorAll('[data-chg]'); }
  function go(dir) {
    var list = chgs(); if (!list.length) return;
    var idx = navIdx + dir;
    if (idx >= list.length && shown < rows.length) { renderMore(); list = chgs(); }
    if (idx < 0) idx = list.length - 1; if (idx >= list.length) idx = 0;
    navIdx = idx; var e = list[idx];
    e.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    e.setAttribute('tabindex', '-1'); e.focus({ preventScroll: true }); e.classList.add('df-flash'); setTimeout(function () { e.classList.remove('df-flash'); }, 1000);
  }
  $('btnPrev').addEventListener('click', function () { go(-1); });
  $('btnNext').addEventListener('click', function () { go(1); });
  $('btnMore').addEventListener('click', renderMore);

  /* ---------- salin sebagai diff ---------- */
  $('btnPatch').addEventListener('click', function () {
    var aL = D.splitLines($('ta').value), bL = D.splitLines($('tb').value), r = D.diffLines(aL, bL, opts()), p = D.toPatch(aL, bL, r.ops, { nameA: 'asli', nameB: 'baru' });
    if (!p) { toast(t('no_diff_copy')); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(function () { toast(t('copy_ok')); }, function () { toast(t('copy_fail')); });
  });

  /* ---------- masukan dan opsi ---------- */
  $('ta').addEventListener('input', later); $('tb').addEventListener('input', later);
  $('btnSample').addEventListener('click', function () { $('ta').value = t('sample_a'); $('tb').value = t('sample_b'); compute(); toast(t('toast_ok')); });
  $('btnSwap').addEventListener('click', function () { var x = $('ta').value; $('ta').value = $('tb').value; $('tb').value = x; compute(); });
  $('btnClear').addEventListener('click', function () { $('ta').value = ''; $('tb').value = ''; compute(); $('ta').focus(); });
  function bind(id, key) { $(id).addEventListener('change', function () { O[key] = $(id).checked; save(); compute(); }); }
  bind('oCase', 'ignoreCase'); bind('oSpace', 'ignoreSpace'); bind('oHide', 'hide');
  document.querySelectorAll('input[name=gran]').forEach(function (x) { x.addEventListener('change', function () { if (x.checked) { O.gran = x.value; save(); compute(); } }); });
  document.querySelectorAll('input[name=view]').forEach(function (x) { x.addEventListener('change', function () { if (x.checked) { O.view = x.value; save(); compute(); } }); });

  I.onReady(function () {
    $('oCase').checked = O.ignoreCase; $('oSpace').checked = O.ignoreSpace; $('oHide').checked = O.hide;
    document.querySelector('input[name=gran][value=' + O.gran + ']').checked = true; document.querySelector('input[name=view][value=' + O.view + ']').checked = true;
    compute();
  });
  document.addEventListener('sagalait:lang', compute);
})();
