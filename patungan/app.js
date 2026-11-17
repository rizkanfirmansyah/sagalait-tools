/* Tampilan Patungan. Logika hitung ada di bagi.js (semua uang dalam sen). Data hanya di browser ini. */
(function () {
  'use strict';
  var B = window.Bagi, I = window.SagalaI18n, KEY = 'sagalait-patungan';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function money(sen) { return B.formatMoney(sen, I.locale); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var st, nextId = 1;
  function fresh() {
    var a = nextId++, b = nextId++;
    return { people: [{ id: a, name: '', paid: '' }, { id: b, name: '', paid: '' }], items: [{ id: nextId++, name: '', price: '', qty: '1', who: [a, b] }], dtype: 'none', dval: '', svc: '0', tax: '11', incl: false, base: 'subService', round: 0, payer: a };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s.people) && s.people.length && Array.isArray(s.items)) {
        st = fresh(); var ids = [];
        st.people = s.people.slice(0, B.MAX_PEOPLE).map(function (p) { var id = nextId++; ids.push(id); return { id: id, name: String(p.name || '').slice(0, 40), paid: String(p.paid || '').slice(0, 20) }; });
        st.items = s.items.slice(0, 200).map(function (it) {
          return { id: nextId++, name: String(it.name || '').slice(0, 60), price: String(it.price || '').slice(0, 20), qty: String(it.qty || '1').slice(0, 4), who: (Array.isArray(it.whoIdx) ? it.whoIdx : []).filter(function (i) { return i >= 0 && i < ids.length; }).map(function (i) { return ids[i]; }) };
        });
        if (['none', 'amount', 'percent'].indexOf(s.dtype) >= 0) st.dtype = s.dtype;
        st.dval = String(s.dval || ''); st.svc = String(s.svc || '0'); st.tax = String(s.tax == null ? '11' : s.tax); st.incl = !!s.incl;
        st.base = s.base === 'sub' ? 'sub' : 'subService'; st.round = [0, 100, 500, 1000].indexOf(s.round) >= 0 ? s.round : 0;
        st.payer = ids[Number.isInteger(s.payerIdx) && s.payerIdx >= 0 && s.payerIdx < ids.length ? s.payerIdx : 0];
        return;
      }
    } catch (e) { /* abaikan */ }
    st = fresh();
  }
  function save() {
    try {
      var ids = st.people.map(function (p) { return p.id; });
      localStorage.setItem(KEY, JSON.stringify({
        people: st.people.map(function (p) { return { name: p.name, paid: p.paid }; }),
        items: st.items.map(function (it) { return { name: it.name, price: it.price, qty: it.qty, whoIdx: it.who.map(function (w) { return ids.indexOf(w); }).filter(function (i) { return i >= 0; }) }; }),
        dtype: st.dtype, dval: st.dval, svc: st.svc, tax: st.tax, incl: st.incl, base: st.base, round: st.round, payerIdx: Math.max(0, ids.indexOf(st.payer))
      }));
    } catch (e) { /* mode privat */ }
  }

  function pidx(id) { for (var i = 0; i < st.people.length; i++) if (st.people[i].id === id) return i; return -1; }
  function pname(p, i) { return p.name.trim() || t('person_n', { n: i + 1 }); }

  /* ---------- form orang dan item ---------- */
  function buildPeople() {
    var box = $('people'); box.textContent = '';
    st.people.forEach(function (p, i) {
      var row = el('div', 'pt-prow'), inp = el('input', 'field-sm pt-in');
      inp.value = p.name; inp.placeholder = t('person_n', { n: i + 1 }); inp.setAttribute('aria-label', t('name_l', { n: i + 1 })); inp.setAttribute('data-pid', p.id); inp.autocomplete = 'off'; inp.maxLength = 40;
      var rm = el('button', 'btn pt-rm', '×'); rm.type = 'button'; rm.setAttribute('data-rmp', p.id); rm.setAttribute('aria-label', t('rm_person_l', { name: pname(p, i) })); rm.disabled = st.people.length <= 1;
      row.appendChild(inp); row.appendChild(rm); box.appendChild(row);
    });
    $('btnAddP').disabled = st.people.length >= B.MAX_PEOPLE; $('pMax').hidden = st.people.length < B.MAX_PEOPLE; $('pMax').textContent = t('max_people', { n: B.MAX_PEOPLE });
  }
  function chip(label, pressed, attrs) {
    var b = el('button', 'ui-chip pt-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', String(pressed));
    Object.keys(attrs).forEach(function (k) { b.setAttribute(k, attrs[k]); }); return b;
  }
  function buildItems() {
    var box = $('items'); box.textContent = '';
    st.items.forEach(function (it, n) {
      var card = el('div', 'pt-item'), head = el('div', 'pt-ihead');
      head.appendChild(el('strong', null, t('item_n', { n: n + 1 })));
      var rm = el('button', 'btn pt-rm', '×'); rm.type = 'button'; rm.setAttribute('data-rmi', it.id); rm.setAttribute('aria-label', t('rm_item_l', { n: n + 1 })); head.appendChild(rm);
      var f1 = el('div', 'pt-f'), nm = el('input', 'field-sm pt-in'); nm.value = it.name; nm.setAttribute('data-f', 'name'); nm.setAttribute('data-iid', it.id); nm.setAttribute('aria-label', t('item_name')); nm.placeholder = t('item_name'); nm.autocomplete = 'off'; nm.maxLength = 60; f1.appendChild(nm);
      var row = el('div', 'pt-two'), f2 = el('div', 'pt-f'), f3 = el('div', 'pt-f');
      var l2 = el('label', 'pt-lbl', t('item_price')), pr = el('input', 'field-sm pt-in'); pr.id = 'pr' + it.id; l2.htmlFor = pr.id; pr.value = it.price; pr.setAttribute('inputmode', 'decimal'); pr.setAttribute('data-f', 'price'); pr.setAttribute('data-iid', it.id); pr.autocomplete = 'off'; pr.placeholder = '0';
      var er = el('p', 'small pt-err'); er.id = 'pe' + it.id; er.setAttribute('role', 'alert'); f2.appendChild(l2); f2.appendChild(pr); f2.appendChild(er);
      var l3 = el('label', 'pt-lbl', t('item_qty')), qy = el('input', 'field-sm pt-in'); qy.id = 'qy' + it.id; l3.htmlFor = qy.id; qy.type = 'number'; qy.min = '1'; qy.max = String(B.MAX_QTY); qy.value = it.qty; qy.setAttribute('inputmode', 'numeric'); qy.setAttribute('data-f', 'qty'); qy.setAttribute('data-iid', it.id); f3.appendChild(l3); f3.appendChild(qy);
      row.appendChild(f2); row.appendChild(f3);
      var who = el('div', 'pt-who'); who.setAttribute('role', 'group'); who.setAttribute('aria-label', t('item_who'));
      who.appendChild(el('span', 'pt-lbl', t('item_who')));
      var chips = el('div', 'pt-chips');
      chips.appendChild(chip(t('all'), it.who.length === st.people.length, { 'data-all': it.id }));
      st.people.forEach(function (p, i) { chips.appendChild(chip(pname(p, i), it.who.indexOf(p.id) >= 0, { 'data-w': it.id + ':' + p.id, 'data-pid': p.id })); });
      who.appendChild(chips);
      var wn = el('p', 'small pt-err'); wn.id = 'wn' + it.id; who.appendChild(wn);
      card.appendChild(head); card.appendChild(f1); card.appendChild(row); card.appendChild(who); box.appendChild(card);
    });
    $('itemsEmpty').hidden = st.items.length > 0;
  }
  function findItem(id) { for (var i = 0; i < st.items.length; i++) if (st.items[i].id === Number(id)) return st.items[i]; return null; }

  /* ---------- hitung dan tampilkan ---------- */
  var last = null;
  function errText(code) { return code === 'big' ? t('price_big') : t('price_err'); }
  function compute() {
    var items = [], errs = {};
    st.items.forEach(function (it) {
      var raw = it.price.trim(); if (raw === '') { return; }
      var pr = B.parseMoney(raw);
      if (!pr.ok) { errs['pe' + it.id] = errText(pr.error); return; }
      var qty = Math.round(Number(it.qty)); if (!(qty >= 1)) qty = 1; if (qty > B.MAX_QTY) qty = B.MAX_QTY;
      var who = it.who.map(pidx).filter(function (i) { return i >= 0; });
      if (!who.length) errs['wn' + it.id] = t('who_none');
      items.push({ price: pr.sen, qty: qty, who: who, ref: it });
    });
    var d = { type: 'none' };
    if (st.dtype !== 'none' && st.dval.trim() !== '') {
      if (st.dtype === 'amount') { var m = B.parseMoney(st.dval); if (m.ok) d = { type: 'amount', value: m.sen }; else errs.dErr = t('num_err'); }
      else { var pp = B.parsePercent(st.dval); if (pp.ok) d = { type: 'percent', value: pp.bp }; else errs.dErr = t('pct_err'); }
    }
    var svc = B.parsePercent(st.svc || '0'), tax = B.parsePercent(st.tax || '0');
    if (!svc.ok) errs.svcErr = t('pct_err'); if (!tax.ok) errs.taxErr = t('pct_err');
    var inp = { people: st.people.length, items: items.map(function (x) { return { price: x.price, qty: x.qty, who: x.who }; }), discount: d, svcBp: svc.ok ? svc.bp : 0, taxBp: tax.ok ? tax.bp : 0, inclusive: st.incl, taxBase: st.base, rounding: st.round };
    var res = null;
    try { res = B.compute(inp); } catch (e) { res = null; errs.dErr = errs.dErr || t('price_big'); }
    return { inp: inp, res: res, map: items, errs: errs };
  }

  function setErr(id, text) { var e = $(id); if (e) { e.textContent = text || ''; } }
  function refresh() {
    var c = compute(); last = c;
    st.items.forEach(function (it) { setErr('pe' + it.id, c.errs['pe' + it.id]); setErr('wn' + it.id, c.errs['wn' + it.id]); });
    setErr('dErr', c.errs.dErr); setErr('svcErr', c.errs.svcErr); setErr('taxErr', c.errs.taxErr);
    renderResult(c); save();
  }
  function row(k, v, cls) { var r = el('div', 'pt-line' + (cls ? ' ' + cls : '')); r.appendChild(el('span', null, k)); r.appendChild(el('span', 'pt-amt', v)); return r; }
  function renderResult(c) {
    var res = c.res, has = res && c.inp.items.some(function (x) { return x.who.length; });
    $('resEmpty').hidden = !!has; $('resBox').hidden = !has; $('match').textContent = '';
    if (!has) return;
    var T = res.totals, box = $('totals'); box.textContent = '';
    box.appendChild(row(t('total_bill'), money(T.grand), 'pt-big'));
    box.appendChild(row(t('sub'), money(T.sub)));
    if (T.discount) box.appendChild(row(t('discount'), '−' + money(T.discount)));
    if (T.service) box.appendChild(row(t('service'), money(T.service)));
    if (T.tax) box.appendChild(row(t('taxl'), money(T.tax)));
    if (st.round) { box.appendChild(row(t('total_pay'), money(T.pay))); box.appendChild(row(t('extra'), money(T.extra))); }
    $('match').textContent = (res.ok ? '✓ ' + t('match_ok') : '✗ ' + t('match_bad'));
    var ig = $('ignored'); ig.hidden = !res.ignored.length; ig.textContent = t('ignored_n', { n: res.ignored.length });
    var cards = $('cards'); cards.textContent = '';
    res.people.forEach(function (p, i) {
      var card = el('div', 'pt-card'), head = el('div', 'pt-chead');
      head.appendChild(el('strong', null, pname(st.people[i], i))); head.appendChild(el('span', 'pt-ctot', money(st.round ? p.pay : p.total)));
      card.appendChild(head);
      if (!p.items.length) { card.appendChild(el('p', 'small muted', '–')); cards.appendChild(card); return; }
      var ul = el('ul', 'pt-lines');
      p.items.forEach(function (x) { var src = c.map[x.item].ref, idx = st.items.indexOf(src); var li = el('li', 'pt-line small'); li.appendChild(el('span', null, (src.name.trim() || t('item_n', { n: idx + 1 })) + (Number(src.qty) > 1 ? ' ×' + src.qty : ''))); li.appendChild(el('span', 'pt-amt', money(x.share))); ul.appendChild(li); });
      if (p.discount) { var d1 = el('li', 'pt-line small'); d1.appendChild(el('span', null, t('discount'))); d1.appendChild(el('span', 'pt-amt', '−' + money(p.discount))); ul.appendChild(d1); }
      if (p.service) { var d2 = el('li', 'pt-line small'); d2.appendChild(el('span', null, t('service'))); d2.appendChild(el('span', 'pt-amt', money(p.service))); ul.appendChild(d2); }
      if (p.tax) { var d3 = el('li', 'pt-line small'); d3.appendChild(el('span', null, t('taxl'))); d3.appendChild(el('span', 'pt-amt', money(p.tax))); ul.appendChild(d3); }
      card.appendChild(ul);
      if (st.round) { var rr = row(t('total'), money(p.total), 'small muted'); card.appendChild(rr); }
      cards.appendChild(card);
    });
    renderPaid(res);
  }
  function renderPaid(res) {
    var sel = $('payer'), keep = st.payer; sel.textContent = '';
    st.people.forEach(function (p, i) { var o = el('option', null, pname(p, i)); o.value = String(p.id); sel.appendChild(o); });
    if (pidx(keep) < 0) st.payer = st.people[0].id; sel.value = String(st.payer);
    var pays = res.people.map(function (p) { return p.pay; }), paidSen = st.people.map(function (p) { var m = B.parseMoney(p.paid); return m.ok ? m.sen : 0; });
    var s = B.settle(pays, paidSen, pidx(st.payer)), box = $('paid');
    if (box.getAttribute('data-n') !== st.people.map(function (p) { return p.id; }).join(',') + '|' + st.payer) {
      box.textContent = ''; box.setAttribute('data-n', st.people.map(function (p) { return p.id; }).join(',') + '|' + st.payer);
      st.people.forEach(function (p, i) {
        var r = el('div', 'pt-pd');
        r.appendChild(el('span', 'pt-pn', pname(p, i)));
        if (p.id === st.payer) { r.appendChild(el('span', 'small muted', '(' + t('payer').toLowerCase() + ')')); box.appendChild(r); return; }
        var inp = el('input', 'field-sm pt-in'); inp.value = p.paid; inp.setAttribute('inputmode', 'decimal'); inp.setAttribute('data-paid', p.id); inp.setAttribute('aria-label', t('paid_l', { name: pname(p, i) })); inp.autocomplete = 'off';
        var b = el('button', 'btn pt-fill', t('fill')); b.type = 'button'; b.setAttribute('data-fill', p.id);
        var s2 = el('span', 'small pt-st'); s2.setAttribute('data-st', p.id);
        r.appendChild(inp); r.appendChild(b); r.appendChild(s2); box.appendChild(r);
      });
    }
    st.people.forEach(function (p, i) {
      var pn = box.querySelectorAll('.pt-pn')[i]; if (pn) pn.textContent = pname(p, i);
      var sp = box.querySelector('[data-st="' + p.id + '"]'); if (!sp) return;
      var d = pays[i] - paidSen[i];
      sp.textContent = d > 0 ? t('short', { amount: money(d) }) : d < 0 ? t('over', { amount: money(-d) }) : t('settled');
      sp.className = 'small pt-st' + (d > 0 ? ' pt-short' : d < 0 ? ' pt-over' : ' pt-ok');
    });
    var g = $('group'); g.textContent = s.short ? t('group_short', { amount: money(s.short) }) : s.over ? t('group_over', { amount: money(s.over) }) : t('group_ok');
    var ul = $('settle'); ul.textContent = ''; var pn2 = function (i) { return pname(st.people[i], i); };
    s.owes.forEach(function (o) { ul.appendChild(el('li', 'small', t('owes', { from: pn2(o.i), amount: money(o.amount), to: pn2(pidx(st.payer)) }))); });
    s.refunds.forEach(function (o) { ul.appendChild(el('li', 'small', t('refund', { from: pn2(o.i), amount: money(o.amount), to: pn2(pidx(st.payer)) }))); });
  }

  /* ---------- ringkasan teks ---------- */
  function summary() {
    var c = last, res = c && c.res; if (!res) return '';
    var T = res.totals, lines = [t('sum_title', { total: money(T.grand) })], fees = [];
    if (T.discount) fees.push(t('discount') + ' −' + money(T.discount)); if (T.service) fees.push(t('service') + ' ' + money(T.service)); if (T.tax) fees.push(t('taxl') + ' ' + money(T.tax));
    if (fees.length) lines.push(t('sum_fees', { list: fees.join(', ') }));
    lines.push('');
    res.people.forEach(function (p, i) { if (p.items.length) lines.push(t('sum_pay', { name: pname(st.people[i], i), amount: money(st.round ? p.pay : p.total) })); });
    if (st.round && T.extra) { lines.push(''); lines.push(t('sum_round', { amount: money(T.extra) })); }
    return lines.join('\n');
  }
  $('btnCopy').addEventListener('click', function () {
    var b = $('btnCopy'), txt = summary(), ok = function () { b.textContent = t('common.copied'); setTimeout(function () { b.textContent = t('copy'); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { /* ditolak */ });
  });
  $('btnDl').addEventListener('click', function () {
    var u = URL.createObjectURL(new Blob([summary() + '\n'], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
    a.href = u; a.download = 'patungan.txt'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
  });

  /* ---------- peristiwa ---------- */
  function addPerson() { if (st.people.length >= B.MAX_PEOPLE) return; var id = nextId++; st.people.push({ id: id, name: '', paid: '' }); st.items.forEach(function (it) { if (it.who.length === st.people.length - 1) it.who.push(id); }); buildPeople(); buildItems(); refresh(); }
  function addItem(focus) { var id = nextId++; st.items.push({ id: id, name: '', price: '', qty: '1', who: st.people.map(function (p) { return p.id; }) }); buildItems(); refresh(); if (focus) { var n = document.querySelector('#items [data-iid="' + id + '"][data-f=name]'); if (n) n.focus(); } }
  $('btnAddP').addEventListener('click', addPerson);
  $('btnAddI').addEventListener('click', function () { addItem(true); });
  $('people').addEventListener('input', function (e) {
    var id = e.target.getAttribute('data-pid'); if (!id) return;
    var i = pidx(Number(id)); st.people[i].name = e.target.value;
    document.querySelectorAll('.pt-chip[data-pid="' + id + '"]').forEach(function (c) { c.textContent = pname(st.people[i], i); });
    var rm = document.querySelector('[data-rmp="' + id + '"]'); if (rm) rm.setAttribute('aria-label', t('rm_person_l', { name: pname(st.people[i], i) }));
    refresh();
  });
  $('people').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rmp]'); if (!b || st.people.length <= 1) return;
    var id = Number(b.getAttribute('data-rmp')); st.people = st.people.filter(function (p) { return p.id !== id; });
    st.items.forEach(function (it) { it.who = it.who.filter(function (w) { return w !== id; }); });
    buildPeople(); buildItems(); refresh();
  });
  $('items').addEventListener('input', function (e) {
    var id = e.target.getAttribute('data-iid'), f = e.target.getAttribute('data-f'); if (!id) return;
    var it = findItem(id); if (!it) return; it[f] = e.target.value; refresh();
  });
  $('items').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.getAttribute('data-f') === 'price') { e.preventDefault(); addItem(true); } });
  $('items').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rmi]');
    if (rm) { var id = Number(rm.getAttribute('data-rmi')); st.items = st.items.filter(function (x) { return x.id !== id; }); buildItems(); refresh(); return; }
    var all = e.target.closest('[data-all]');
    if (all) { var it = findItem(all.getAttribute('data-all')); it.who = st.people.map(function (p) { return p.id; }); buildItems(); refresh(); return; }
    var w = e.target.closest('[data-w]');
    if (w) { var pr = w.getAttribute('data-w').split(':'), it2 = findItem(pr[0]), pid = Number(pr[1]), k = it2.who.indexOf(pid); if (k >= 0) it2.who.splice(k, 1); else it2.who.push(pid); buildItems(); refresh(); }
  });
  $('dtype').addEventListener('change', function (e) { st.dtype = e.target.value; $('boxDisc').hidden = st.dtype === 'none'; refresh(); });
  $('dval').addEventListener('input', function (e) { st.dval = e.target.value; refresh(); });
  $('svc').addEventListener('input', function (e) { st.svc = e.target.value; refresh(); });
  $('tax').addEventListener('input', function (e) { st.tax = e.target.value; refresh(); });
  $('incl').addEventListener('change', function (e) { st.incl = e.target.checked; refresh(); });
  $('base').addEventListener('change', function (e) { st.base = e.target.value; refresh(); });
  $('round').addEventListener('change', function (e) { st.round = Number(e.target.value); refresh(); });
  $('payer').addEventListener('change', function (e) { st.payer = Number(e.target.value); $('paid').setAttribute('data-n', ''); refresh(); });
  $('paid').addEventListener('input', function (e) { var id = e.target.getAttribute('data-paid'); if (!id) return; st.people[pidx(Number(id))].paid = e.target.value; refresh(); });
  $('paid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fill]'); if (!b || !last || !last.res) return;
    var i = pidx(Number(b.getAttribute('data-fill'))), v = last.res.people[i].pay, s = String(Math.floor(v / 100)) + (v % 100 ? ',' + String(v % 100).padStart(2, '0') : '');
    st.people[i].paid = s; var inp = $('paid').querySelector('[data-paid="' + st.people[i].id + '"]'); if (inp) inp.value = s; refresh();
  });
  function fillSample() {
    st = fresh(); var ids = [st.people[0].id, st.people[1].id]; var c = nextId++; st.people.push({ id: c, name: '', paid: '' }); ids.push(c);
    st.people[0].name = t('ex_p1'); st.people[1].name = t('ex_p2'); st.people[2].name = t('ex_p3');
    var mk = function (n, p, q, who) { return { id: nextId++, name: t(n), price: p, qty: String(q), who: who.map(function (i) { return ids[i]; }) }; };
    st.items = [mk('ex_i1', '28.000', 1, [0]), mk('ex_i2', '22.500', 1, [0, 1]), mk('ex_i3', '35.500,50', 1, [1]), mk('ex_i4', '8.500', 2, [1, 2]), mk('ex_i5', '31.250', 1, [0, 1, 2])];
    st.svc = '5'; st.tax = '11'; st.round = 1000; st.payer = ids[0]; all();
  }
  function all() { toUi(); buildPeople(); buildItems(); $('paid').setAttribute('data-n', ''); refresh(); }
  $('btnSample').addEventListener('click', fillSample);
  $('btnNew').addEventListener('click', function () { $('dlgNew').showModal(); });
  $('dlgNew').addEventListener('close', function () { if ($('dlgNew').returnValue === 'ok') { st = fresh(); all(); } });

  function buildRound() {
    var sel = $('round'); sel.textContent = '';
    [0, 100, 500, 1000].forEach(function (v) { var o = el('option', null, v ? t('r_n', { n: new Intl.NumberFormat(I.locale).format(v) }) : t('r_none')); o.value = String(v); sel.appendChild(o); });
    sel.value = String(st.round);
  }
  function toUi() {
    document.querySelector('input[name=dtype][value="' + st.dtype + '"]').checked = true; $('boxDisc').hidden = st.dtype === 'none';
    $('dval').value = st.dval; $('svc').value = st.svc; $('tax').value = st.tax; $('incl').checked = st.incl; $('base').value = st.base; buildRound();
  }
  I.onReady(function () { load(); all(); });
  document.addEventListener('sagalait:lang', function () { if (!st) return; buildRound(); buildPeople(); buildItems(); $('paid').setAttribute('data-n', ''); refresh(); });
})();
