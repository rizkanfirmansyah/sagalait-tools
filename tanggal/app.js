/* Tampilan Kalkulator tanggal. Logika di tanggal.js. Tanggal yang dimasukkan (termasuk tanggal lahir) tidak disimpan;
   hanya mode, pengaturan hari kerja, dan daftar libur buatan pengguna yang disimpan di browser ini. */
(function () {
  'use strict';
  var T = window.TanggalLab, I = window.SagalaI18n, KEY = 'sagalait-tanggal';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var TABS = ['diff', 'add', 'age', 'info'];
  var st = { tab: 'diff', cuti: true, weekend: 'sat-sun', inc: false, hol: null };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (TABS.indexOf(s.tab) >= 0) st.tab = s.tab;
      if (s.cuti === false) st.cuti = false;
      if (s.weekend === 'sun') st.weekend = 'sun';
      if (s.inc === true) st.inc = true;
      if (typeof s.hol === 'string' && s.hol.length < 100000) st.hol = s.hol;
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* mode privat */ } }

  /* ---------- format ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function utc(d) { var x = new Date(0); x.setUTCFullYear(d.y, d.m - 1, d.d); return x; }
  function fmtLong(d) { return new Intl.DateTimeFormat(I.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(d)); }
  function fmtShort(d) { return new Intl.DateTimeFormat(I.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(utc(d)); }
  function wdName(d) { return new Intl.DateTimeFormat(I.locale, { weekday: 'long', timeZone: 'UTC' }).format(utc(d)); }
  function fmtDmy(d) { return pad(d.d) + '/' + pad(d.m) + '/' + String(d.y).padStart(4, '0'); }
  function num(n) { return new Intl.NumberFormat(I.locale).format(n); }
  function unit(n, k) { return t('u_' + k + '_' + new Intl.PluralRules(I.locale).select(n), { n: num(n) }); }
  function ymd(y, m, d) {
    var p = []; if (y) p.push(unit(y, 'year')); if (m) p.push(unit(m, 'month')); if (d) p.push(unit(d, 'day'));
    return p.length ? p.join(', ') : t('same_day');
  }
  function today() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }

  /* ---------- libur ---------- */
  var hol = { list: [], errors: [] };
  function holText() { return st.hol != null ? st.hol : T.DEFAULT_HOLIDAYS; }
  function ctx() {
    return { weekend: st.weekend === 'sun' ? [0] : [0, 6], holidays: T.holidayMap(hol.list, st.cuti) };
  }
  function renderHolInfo() {
    hol = T.parseHolidays($('hol').value);
    var ul = $('holErr'); ul.textContent = '';
    hol.errors.forEach(function (e) { ul.appendChild(el('li', null, t(e.dup ? 's_dup' : 's_err', { line: e.line, text: e.text.trim().slice(0, 60) }))); });
    var nat = hol.list.filter(function (h) { return !h.cuti; }).length, cu = hol.list.length - nat;
    $('holCount').textContent = hol.list.length ? t('s_count', { n: hol.list.length, nat: nat, cuti: cu, years: T.holidayYears(hol.list).join(', ') }) : t('s_none');
  }
  function coverage(dates) {
    var have = T.holidayYears(hol.list), lo = Math.min.apply(null, dates.map(function (d) { return d.y; })), hi = Math.max.apply(null, dates.map(function (d) { return d.y; })), miss = [];
    for (var y = lo; y <= hi && miss.length < 6; y++) if (have.indexOf(y) < 0) miss.push(y);
    return miss.length ? t('cover', { years: miss.join(', ') + (hi - lo >= 6 ? '…' : '') }) : null;
  }

  /* ---------- baca isian ---------- */
  function readDate(id) {
    var v = $(id).value, p = $('e-' + id); p.textContent = '';
    if (!v) return { empty: true };
    var d = T.parse(v); if (!d) { p.textContent = t('err_date'); return { bad: true }; }
    return { d: d };
  }
  function readInt(id, max) {
    var raw = $(id).value.trim(), p = $('e-' + id); p.textContent = '';
    if (raw === '') return 0;
    if (!/^\d+$/.test(raw) || +raw > max) { p.textContent = t('err_num', { max: num(max) }); return null; }
    return +raw;
  }

  /* ---------- keluaran ---------- */
  var textOut = '';
  function show(big, rows, notes, holidays) {
    $('empty').hidden = true; $('res').hidden = false; $('big').textContent = big;
    var kv = $('kv'); kv.textContent = ''; var lines = [big];
    rows.forEach(function (r) { var d = el('div'); d.appendChild(el('span', 'tg-k', r[0])); d.appendChild(el('span', 'tg-v', r[1])); kv.appendChild(d); lines.push(r[0] + ': ' + r[1]); });
    var ul = $('notes'); ul.textContent = ''; notes.forEach(function (n) { ul.appendChild(el('li', null, n)); });
    var det = $('holDet'); det.hidden = !holidays || !holidays.length; $('holList').textContent = '';
    if (holidays && holidays.length) {
      $('holSum').textContent = t('hol_list') + ' (' + holidays.length + ')';
      holidays.forEach(function (h) { $('holList').appendChild(el('li', null, fmtShort(h.date) + ': ' + h.name + (h.cuti ? ' (' + t('cuti_tag') + ')' : ''))); });
    }
    textOut = lines.join('\n');
  }
  function hide() { $('res').hidden = true; $('empty').hidden = false; textOut = ''; }

  function renderDiff() {
    var a = readDate('a'), b = readDate('b');
    if (!a.d || !b.d) return hide();
    var r = T.diff(a.d, b.d), c = ctx(), wd = T.workdaysBetween(a.d, b.d, c, $('inc').checked);
    var hs = T.holidaysBetween(a.d, b.d, c.holidays), notes = [], cv = coverage([a.d, b.d]);
    if (r.sign < 0) notes.push(t('r_back')); if (cv) notes.push(cv);
    var rows = [[t('r_total'), unit(r.totalDays, 'day')], [t('r_weeks'), r.weeks ? unit(r.weeks, 'week') + (r.remDays ? ', ' + unit(r.remDays, 'day') : '') : unit(r.remDays, 'day')],
      [t('r_months'), unit(r.totalMonths, 'month')], [t('r_work'), r.sign < 0 ? t('r_work_back', { n: unit(Math.abs(wd), 'day') }) : unit(wd, 'day')], [t('r_hol'), hs.length ? t('r_hol_n', { n: hs.length }) : t('r_hol_none')]];
    show(ymd(r.years, r.months, r.days), rows, notes, hs);
  }

  function renderAdd() {
    var b = readDate('base'), kind = document.querySelector('input[name=kind]:checked').value, sign = document.querySelector('input[name=dir]:checked').value === 'sub' ? -1 : 1;
    var y, m, w, d, n;
    if (kind === 'cal') { y = readInt('n-years', 9999); m = readInt('n-months', 120000); w = readInt('n-weeks', 500000); d = readInt('n-days', 3000000); } else n = readInt('n-work', 1000000);
    if (!b.d || y === null || m === null || w === null || d === null || n === null) return hide();
    var res, notes = [], rows = [], c = ctx(), skipped = null;
    try {
      if (kind === 'cal') {
        res = T.add(b.d, { years: y, months: m, weeks: w, days: d }, sign);
        var mm = sign * (y * 12 + m);
        if (mm) { var mon = T.addMonths(b.d, mm); if (mon.d !== b.d.d) notes.push(t('r_clamp', { d: b.d.d, r: mon.d })); }
      } else {
        res = T.addWorkdays(b.d, sign * n, c);
        var span = T.holidaysBetween(b.d, res, c.holidays); skipped = span;
        var cv = coverage([b.d, res]); if (cv) notes.push(cv);
        if (span.length) notes.push(t('r_skipped', { n: span.length }));
      }
    } catch (e) { $('e-' + (kind === 'cal' ? 'n-days' : 'n-work')).textContent = t('err_range'); return hide(); }
    var info = T.info(res);
    rows.push([t('r_iso'), T.iso(res)], [t('r_dmy'), fmtDmy(res)], [t('r_wd'), wdName(res)], [t('n_doy'), t('r_doy', { n: info.dayOfYear })], [t('n_week'), t('n_week_v', { w: info.isoWeek, y: info.isoYear })]);
    show(fmtLong(res), rows, notes, skipped);
  }

  function renderAge() {
    var b = readDate('birth'), r = readDate('ref');
    if (!b.d || !r.d) return hide();
    var g = T.age(b.d, r.d); if (!g) { $('e-birth').textContent = t('err_future'); return hide(); }
    var rows = [[t('g_days'), unit(g.totalDays, 'day')], [t('r_months'), unit(g.totalMonths, 'month')], [t('r_weeks'), g.weeks ? unit(g.weeks, 'week') + (g.totalDays % 7 ? ', ' + unit(g.totalDays % 7, 'day') : '') : unit(g.totalDays % 7, 'day')], [t('g_born'), wdName(b.d)]];
    rows.push([t('g_next'), g.isBirthday ? t('g_today', { n: g.years }) : fmtLong(g.nextBirthday) + ' (' + unit(g.daysToNext, 'day') + ')']);
    var notes = []; if (b.d.m === 2 && b.d.d === 29) notes.push(t('g_leap'));
    show(ymd(g.years, g.months, g.days), rows, notes, null);
  }

  function renderInfo() {
    var d = readDate('idate'); if (!d.d) return hide();
    var i = T.info(d.d), c = ctx(), key = T.iso(d.d), h = c.holidays[key], work = T.isWorkday(d.d, c), status;
    if (h) status = t('st_hol', { name: h.name + (h.cuti ? ' (' + t('cuti_tag') + ')' : '') }); else status = t(work ? 'st_work' : 'st_weekend');
    var notes = [], cv = coverage([d.d]); if (cv) notes.push(cv);
    show(fmtLong(d.d), [[t('n_status'), status], [t('n_doy'), t('n_doy_v', { d: i.dayOfYear, t: i.daysInYear, l: i.daysLeftInYear })], [t('n_week'), t('n_week_v', { w: i.isoWeek, y: i.isoYear })],
      [t('n_quarter'), 'Q' + i.quarter], [t('n_leap'), t(i.leap ? 'yes' : 'no')], [t('n_dim'), unit(i.daysInMonth, 'day')], [t('r_iso'), key], [t('r_dmy'), fmtDmy(d.d)]], notes, null);
  }
  function render() { ({ diff: renderDiff, add: renderAdd, age: renderAge, info: renderInfo })[st.tab](); }

  /* ---------- peristiwa ---------- */
  function setTab(tab) {
    st.tab = tab; save();
    document.querySelectorAll('.tg-tab').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-tab') === tab ? 'true' : 'false'); });
    document.querySelectorAll('.tg-pane').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== tab; });
    render();
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('.tg-tab'); if (b) setTab(b.getAttribute('data-tab')); });
  document.querySelectorAll('.tg-pane').forEach(function (p) { p.addEventListener('input', render); p.addEventListener('change', render); });
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-today]'); if (!b) return; $(b.getAttribute('data-today')).value = today(); render(); });
  $('btnSwap').addEventListener('click', function () { var v = $('a').value; $('a').value = $('b').value; $('b').value = v; render(); });
  $('inc').addEventListener('change', function () { st.inc = $('inc').checked; save(); });
  $('kindSeg').addEventListener('change', function () { var w = document.querySelector('input[name=kind]:checked').value === 'work'; $('numsCal').hidden = w; $('numsWork').hidden = !w; });

  $('weekend').addEventListener('change', function () { st.weekend = $('weekend').value; save(); render(); });
  $('cuti').addEventListener('change', function () { st.cuti = $('cuti').checked; save(); render(); });
  $('hol').addEventListener('input', function () { var v = $('hol').value; st.hol = v === T.DEFAULT_HOLIDAYS ? null : v; save(); renderHolInfo(); render(); });
  $('btnReset').addEventListener('click', function () { st.hol = null; $('hol').value = T.DEFAULT_HOLIDAYS; save(); renderHolInfo(); render(); });

  $('btnCopy').addEventListener('click', function () {
    var b = this; if (!textOut || !navigator.clipboard) return;
    navigator.clipboard.writeText(textOut).then(function () { b.textContent = t('common.copied'); setTimeout(function () { b.textContent = t('copy_res'); }, 1400); }, function () { /* ditolak */ });
  });
  $('btnSample').addEventListener('click', function () {
    var n = T.parse(today()), set = function (id, v) { $(id).value = v; };
    if (st.tab === 'diff') { set('a', T.iso(T.addDays(n, -100))); set('b', T.iso(n)); }
    else if (st.tab === 'add') { set('base', T.iso(n)); set('n-years', ''); set('n-months', '1'); set('n-weeks', ''); set('n-days', '10'); }
    else if (st.tab === 'age') { set('birth', '1995-08-17'); set('ref', T.iso(n)); }
    else set('idate', T.iso(n));
    render();
  });

  I.onReady(function () {
    $('weekend').value = st.weekend; $('cuti').checked = st.cuti; $('inc').checked = st.inc; $('hol').value = holText();
    ['b', 'base', 'ref', 'idate'].forEach(function (id) { $(id).value = today(); });
    renderHolInfo(); setTab(st.tab);
  });
  document.addEventListener('sagalait:lang', function () { renderHolInfo(); render(); });
})();
