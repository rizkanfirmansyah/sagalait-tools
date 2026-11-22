/* Tampilan Kwitansi dan invoice. Hitungan di invoice.js, terbilang di terbilang.js (salinan). Draf tersimpan di browser ini saja. */
(function () {
  'use strict';
  var V = window.InvoiceLab, I = window.SagalaI18n, KEY = 'sagalait-invoice';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function today() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function fresh() {
    return { type: 'invoice', no: '', date: today(), due: '', from: { name: '', addr: '', contact: '', tax: '' }, to: { name: '', addr: '' }, purpose: '',
      items: [{ desc: '', qty: '1', price: '' }], discount: { type: 'pct', value: '' }, tax: { rate: '' }, incl: false, round: false, notes: '', pay: '', place: '', signer: '' };
  }
  var doc = fresh();
  function str(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      if (s.type === 'receipt') doc.type = 'receipt';
      ['no', 'date', 'due', 'purpose', 'notes', 'pay', 'place', 'signer'].forEach(function (k) { if (typeof s[k] === 'string') doc[k] = str(s[k], 400); });
      ['name', 'addr', 'contact', 'tax'].forEach(function (k) { if (s.from) doc.from[k] = str(s.from[k], 300); });
      ['name', 'addr'].forEach(function (k) { if (s.to) doc.to[k] = str(s.to[k], 300); });
      if (Array.isArray(s.items) && s.items.length) doc.items = s.items.slice(0, V.MAX_ITEMS).map(function (x) { return { desc: str(x && x.desc, 300), qty: str(x && x.qty, 20), price: str(x && x.price, 30) }; });
      if (s.discount) { doc.discount.type = s.discount.type === 'amt' ? 'amt' : 'pct'; doc.discount.value = str(s.discount.value, 20); }
      if (s.tax) doc.tax.rate = str(s.tax.rate, 7);
      doc.incl = s.incl === true; doc.round = s.round === true;
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) { /* mode privat */ } }

  function toast(msg) {
    var old = document.querySelector('.ui-toast'); if (old) old.remove();
    var n = el('div', 'ui-toast', msg); n.setAttribute('role', 'status'); document.body.appendChild(n); setTimeout(function () { n.remove(); }, 2200);
  }
  function getPath(k) { var p = k.split('.'); return p.length === 2 ? doc[p[0]][p[1]] : doc[k]; }
  function setPath(k, v) { var p = k.split('.'); if (p.length === 2) doc[p[0]][p[1]] = v; else doc[k] = v; }

  /* ---------- butir ---------- */
  function rowEl(i) {
    var it = doc.items[i], row = el('div', 'iv-row'), n = i + 1;
    function inp(cls, key, val, mode, lbl) {
      var d = el('div', 'iv-rf ' + cls), l = el('label', 'iv-rl', t(lbl)), x = el('input', 'field-sm iv-in'); x.type = 'text'; x.value = val; x.setAttribute('autocomplete', 'off'); if (mode) x.inputMode = mode;
      x.setAttribute('aria-label', t('i_row', { n: n }) + ': ' + t(lbl)); x.maxLength = key === 'desc' ? 300 : 30; x.setAttribute('data-row', i); x.setAttribute('data-f', key);
      x.addEventListener('input', function () { doc.items[+x.getAttribute('data-row')][key] = x.value; save(); render(); });
      d.appendChild(l); d.appendChild(x); return d;
    }
    row.appendChild(inp('iv-rdesc', 'desc', it.desc, '', 'i_desc')); row.appendChild(inp('iv-rqty', 'qty', it.qty, 'decimal', 'i_qty')); row.appendChild(inp('iv-rprice', 'price', it.price, 'decimal', 'i_price'));
    var tot = el('div', 'iv-rtot'); tot.appendChild(el('span', 'iv-rl', t('i_total'))); tot.appendChild(el('strong', '', '')); tot.id = 'rt' + i; row.appendChild(tot);
    var del = el('button', 'btn btn-sm iv-del', '×'); del.type = 'button'; del.setAttribute('aria-label', t('i_del', { n: n }));
    del.addEventListener('click', function () { doc.items.splice(i, 1); if (!doc.items.length) doc.items.push({ desc: '', qty: '1', price: '' }); save(); buildRows(); render(); var f = $('rows').querySelector('input'); if (f) f.focus(); });
    row.appendChild(del); return row;
  }
  function buildRows() {
    var box = $('rows'); box.textContent = ''; doc.items.forEach(function (_, i) { box.appendChild(rowEl(i)); });
    var full = doc.items.length >= V.MAX_ITEMS; $('btnAdd').disabled = full; $('maxNote').hidden = !full; $('maxNote').textContent = t('i_max', { n: V.MAX_ITEMS });
  }
  $('btnAdd').addEventListener('click', function () { doc.items.push({ desc: '', qty: '1', price: '' }); save(); buildRows(); render(); var ins = $('rows').querySelectorAll('.iv-rdesc input'); ins[ins.length - 1].focus(); });

  /* ---------- pratinjau ---------- */
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
    return new Intl.DateTimeFormat(I.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(+m[1], +m[2] - 1, +m[3]));
  }
  function block(cls, lines) { var d = el('div', cls); lines.forEach(function (l, i) { if (l) d.appendChild(el(i === 0 ? 'strong' : 'div', i === 0 ? '' : 'iv-line', l)); }); return d; }
  function kv(parent, k, v, cls) { var r = el('div', 'iv-kv' + (cls ? ' ' + cls : '')); r.appendChild(el('span', '', k)); r.appendChild(el('span', '', v)); parent.appendChild(r); }
  function sheet(c) {
    var sh = $('sheet'); sh.textContent = ''; var rcp = doc.type === 'receipt', un = t('unnamed');
    var head = el('header', 'iv-sh');
    var from = el('div', 'iv-from'); from.appendChild(el('strong', 'iv-fname', doc.from.name || un)); if (doc.from.addr) from.appendChild(el('div', 'iv-pre', doc.from.addr)); if (doc.from.contact) from.appendChild(el('div', '', doc.from.contact)); if (doc.from.tax) from.appendChild(el('div', '', t('p_npwp') + ': ' + doc.from.tax));
    var meta = el('div', 'iv-meta'); meta.appendChild(el('h3', 'iv-title', t(rcp ? 'p_receipt' : 'p_invoice')));
    if (doc.no) kv(meta, t('p_no'), doc.no); if (fmtDate(doc.date)) kv(meta, t('p_date'), fmtDate(doc.date)); if (!rcp && fmtDate(doc.due)) kv(meta, t('p_due'), fmtDate(doc.due));
    head.appendChild(from); head.appendChild(meta); sh.appendChild(head);
    if (rcp) {
      var rc = el('div', 'iv-rcp'); kv(rc, t('r_from'), doc.to.name || un, 'iv-kv-l'); if (doc.to.addr) kv(rc, '', doc.to.addr);
      var sum = el('div', 'iv-sumbox'); sum.appendChild(el('span', 'iv-k', t('r_sum'))); sum.appendChild(el('strong', 'iv-big', V.fmt(c.total))); sum.appendChild(el('em', 'iv-words', c.ok ? V.words(c.total) + '.' : '')); rc.appendChild(sum);
      kv(rc, t('r_for'), doc.purpose || un, 'iv-kv-l'); sh.appendChild(rc);
    } else {
      sh.appendChild(el('div', 'iv-toh', t('p_to'))); var to = block('iv-to', [doc.to.name || un, doc.to.addr]); to.lastChild && to.lastChild.classList.add('iv-pre'); sh.appendChild(to);
    }
    if (!rcp || c.lines.length) {
      if (rcp) sh.appendChild(el('div', 'iv-toh', t('r_details')));
      var tb = el('table', 'iv-tbl'), th = el('tr');
      [['th_no', 'iv-c-no'], ['i_desc', ''], ['i_qty', 'iv-c-q'], ['i_price', 'iv-c-p'], ['i_total', 'iv-c-p']].forEach(function (h) { var x = el('th', h[1], t(h[0])); x.scope = 'col'; th.appendChild(x); });
      var thead = el('thead'); thead.appendChild(th); tb.appendChild(thead); var tbody = el('tbody');
      if (!c.lines.length) { var er = el('tr'), td = el('td', 'iv-empty', t('empty_items')); td.colSpan = 5; er.appendChild(td); tbody.appendChild(er); }
      c.lines.forEach(function (l, k) {
        var it = doc.items[l.i], q = V.parseQty(it.qty), p = V.parseMoney(it.price), tr = el('tr');
        [String(k + 1), it.desc, V.fmtQty(q.milli), V.fmt(p.sen), V.fmt(l.sen)].forEach(function (v, j) { tr.appendChild(el('td', j === 0 ? 'iv-c-no' : j === 1 ? 'iv-pre' : 'iv-c-p' + (j === 2 ? ' iv-c-q' : ''), v)); });
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody); sh.appendChild(tb);
    }
    var tot = el('div', 'iv-tot'); var rate = V.fmtRate(c.taxRateBp);
    kv(tot, t('s_sub'), V.fmt(c.subtotal));
    if (c.discount !== 0n) kv(tot, doc.discount.type === 'pct' ? t('s_disc_pct', { n: V.fmtRate(V.parseRate(doc.discount.value).bp || 0n) }) : t('s_disc'), '-' + V.fmt(c.discount));
    if (c.taxRateBp !== 0n) { if (doc.incl) kv(tot, t('s_base'), V.fmt(c.base)); kv(tot, t(doc.incl ? 's_tax_incl' : 's_tax', { n: rate }), V.fmt(c.tax)); }
    if (c.rounding !== 0n) kv(tot, t('s_round'), (c.rounding < 0n ? '-' : '') + V.fmt(c.rounding < 0n ? -c.rounding : c.rounding));
    kv(tot, t('s_total'), V.fmt(c.total), 'iv-grand'); sh.appendChild(tot);
    if (!rcp && c.ok) { var w = el('p', 'iv-wordsline'); w.appendChild(el('strong', '', t('words_l') + ': ')); w.appendChild(document.createTextNode(V.words(c.total) + '. ')); w.appendChild(el('span', 'iv-wn', t('words_note'))); sh.appendChild(w); }
    if (doc.notes) { var nb = el('div', 'iv-note'); nb.appendChild(el('strong', '', t('p_notes'))); nb.appendChild(el('div', 'iv-pre', doc.notes)); sh.appendChild(nb); }
    if (doc.pay) { var pb = el('div', 'iv-note'); pb.appendChild(el('strong', '', t('p_pay'))); pb.appendChild(el('div', 'iv-pre', doc.pay)); sh.appendChild(pb); }
    var sg = el('div', 'iv-sign'); var place = [doc.place, fmtDate(doc.date)].filter(Boolean).join(', ');
    if (place) sg.appendChild(el('div', '', place)); if (!rcp) sg.appendChild(el('div', 'iv-hormat', t('p_sign'))); sg.appendChild(el('div', 'iv-sigline')); sg.appendChild(el('strong', '', doc.signer || doc.from.name || ''));
    sh.appendChild(sg);
  }

  /* ---------- hitung dan galat ---------- */
  var cur = null;
  function render() {
    var rcp = doc.type === 'receipt', c = V.compute({ items: doc.items, discount: doc.discount, tax: { rate: doc.tax.rate, mode: doc.incl ? 'incl' : 'excl' }, roundRp: doc.round }); cur = c;
    $('dueWrap').hidden = rcp; $('purposeWrap').hidden = !rcp;
    $('liveTotal').textContent = V.fmt(c.total);
    var byLine = {}; c.errors.forEach(function (e) { if (e.i !== undefined) byLine[e.i] = e.k; });
    $('rows').querySelectorAll('.iv-row').forEach(function (row, i) {
      var ok = byLine[i] === undefined;
      row.querySelectorAll('input').forEach(function (x) { var f = x.getAttribute('data-f'); x.setAttribute('aria-invalid', String(!ok && ((byLine[i] === 'qty' && f === 'qty') || (byLine[i] !== 'qty' && f === 'price')))); });
      var line = c.lines.filter(function (l) { return l.i === i; })[0]; row.querySelector('.iv-rtot strong').textContent = line ? V.fmt(line.sen) : '-';
    });
    $('discount.value').setAttribute('aria-invalid', String(c.errors.some(function (e) { return e.k === 'discount'; }))); $('tax.rate').setAttribute('aria-invalid', String(c.errors.some(function (e) { return e.k === 'tax'; })));
    var ul = $('errList'); ul.textContent = ''; c.errors.forEach(function (e) { ul.appendChild(el('li', '', t('e_' + e.k, { n: e.i + 1 }))); }); $('errBox').hidden = !c.errors.length;
    $('warnLine').hidden = !c.warnings.length; $('warnLine').textContent = c.warnings.length ? t('w_disc') : '';
    sheet(c);
  }

  /* ---------- peristiwa ---------- */
  document.querySelectorAll('[data-k]').forEach(function (x) { x.addEventListener('input', function () { setPath(x.getAttribute('data-k'), x.value); save(); render(); }); });
  document.querySelectorAll('input[name=type]').forEach(function (x) { x.addEventListener('change', function () { if (x.checked) { doc.type = x.value; save(); render(); } }); });
  document.querySelectorAll('input[name=dtype]').forEach(function (x) { x.addEventListener('change', function () { if (x.checked) { doc.discount.type = x.value; save(); render(); } }); });
  $('oIncl').addEventListener('change', function () { doc.incl = $('oIncl').checked; save(); render(); });
  $('oRound').addEventListener('change', function () { doc.round = $('oRound').checked; save(); render(); });
  $('chPpn').addEventListener('click', function () { doc.tax.rate = '11'; $('tax.rate').value = '11'; save(); render(); });
  function fillForm() {
    document.querySelectorAll('[data-k]').forEach(function (x) { x.value = getPath(x.getAttribute('data-k')) || ''; });
    document.querySelector('input[name=type][value=' + doc.type + ']').checked = true; document.querySelector('input[name=dtype][value=' + doc.discount.type + ']').checked = true;
    $('oIncl').checked = doc.incl; $('oRound').checked = doc.round;
  }
  $('btnSample').addEventListener('click', function () {
    var rcp = doc.type === 'receipt'; doc = fresh(); doc.type = rcp ? 'receipt' : 'invoice';
    doc.no = t('sm_no'); doc.from = { name: t('sm_from'), addr: t('sm_addr'), contact: t('sm_contact'), tax: '' }; doc.to = { name: t('sm_to'), addr: t('sm_toaddr') }; doc.purpose = t('sm_purpose');
    doc.items = [{ desc: t('sm_i1'), qty: '1', price: '3.500.000' }, { desc: t('sm_i2'), qty: '2', price: '175.000' }, { desc: t('sm_i3'), qty: '2,5', price: '250.000' }];
    doc.tax.rate = '11'; doc.discount = { type: 'pct', value: '5' }; doc.notes = t('sm_notes'); doc.pay = t('sm_pay'); doc.place = t('sm_place'); doc.signer = t('sm_signer');
    save(); fillForm(); buildRows(); render(); toast(t('sample_ok'));
  });
  $('btnClear').addEventListener('click', function () { $('dlgClear').showModal(); $('clearNo').focus(); });
  $('clearNo').addEventListener('click', function () { $('dlgClear').close(); });
  $('clearYes').addEventListener('click', function () {
    $('dlgClear').close(); doc = fresh(); try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ } fillForm(); buildRows(); render(); toast(t('cleared'));
  });
  var oldTitle = document.title;
  $('btnPrint').addEventListener('click', function () {
    if (!cur || !cur.ok) { toast(t('e_print')); return; }
    oldTitle = document.title; document.title = [t(doc.type === 'receipt' ? 'p_receipt' : 'p_invoice'), doc.no].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]/g, '-'); window.print();
  });
  window.addEventListener('afterprint', function () { document.title = oldTitle; });

  I.onReady(function () { fillForm(); buildRows(); render(); });
  document.addEventListener('sagalait:lang', function () { buildRows(); render(); });
})();
