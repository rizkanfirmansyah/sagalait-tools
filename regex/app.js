/* Tampilan penguji regex. Pencocokan dijalankan di worker.js dengan batas waktu 1,5 detik. */
(function () {
  'use strict';
  var Rx = window.Rx, I = window.SagalaI18n, KEY = 'sagalait-regex', TIMEOUT = 1500;
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function fmt(n) { return new Intl.NumberFormat(I.locale).format(n); }

  var EX = {
    email: { pat: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'g', text: 'ani@example.com\nbukan-email@\nbudi.santoso+tag@mail.example.co.id' },
    url: { pat: '(https?)://([\\w.-]+)(/[^\\s]*)?', flags: 'g', text: 'Buka https://tools.sagalait.cloud/regex/ atau http://localhost:8000.' },
    date: { pat: '(?<hari>\\d{2})/(?<bulan>\\d{2})/(?<tahun>\\d{4})', flags: 'g', text: '15/11/2026 dan 01/12/2026' },
    ip: { pat: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g', text: 'gateway 192.168.1.1, dns 8.8.8.8, bukan 999.1' }
  };

  var st = { mode: 'match', flags: { g: true, i: false, m: false, s: false, u: false, y: false } };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      if (['match', 'replace', 'split'].indexOf(s.mode) >= 0) st.mode = s.mode;
      if (s.flags) Object.keys(st.flags).forEach(function (f) { if (typeof s.flags[f] === 'boolean') st.flags[f] = s.flags[f]; });
    } catch (e) { /* abaikan */ }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* mode privat */ } }
  function flagStr() { return Object.keys(st.flags).filter(function (f) { return st.flags[f]; }).join(''); }

  /* ---------- worker ---------- */
  var worker = null, pending = null, seq = 0, noWorker = false, last = null;
  function kill() { if (worker) { worker.terminate(); worker = null; } if (pending) { clearTimeout(pending.timer); pending = null; } }
  function ensure() {
    if (worker || noWorker) return;
    try {
      worker = new Worker('worker.js');
      worker.onmessage = function (e) {
        if (!pending || e.data.id !== pending.id) return;
        clearTimeout(pending.timer); var req = pending.req, t0 = pending.t0; pending = null;
        show(req, e.data.res, performance.now() - t0);
      };
      worker.onerror = function () { kill(); noWorker = true; schedule(); };
    } catch (e) { noWorker = true; worker = null; }
  }
  function request(req) {
    kill();
    if (noWorker || typeof Worker === 'undefined') { var t0 = performance.now(); show(req, Rx.run(req), performance.now() - t0, true); return; }
    ensure();
    if (noWorker) { request(req); return; }
    var id = ++seq;
    pending = { id: id, req: req, t0: performance.now(), timer: setTimeout(function () { kill(); show(req, { ok: false, slow: true }, TIMEOUT); }, TIMEOUT) };
    worker.postMessage(Object.assign({ id: id }, req));
  }

  var timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 120); }
  function run() {
    var pat = $('pat').value, text = $('txt').value;
    if (!pat) { kill(); last = null; view('empty'); return; }
    request({ op: st.mode, pattern: pat, flags: flagStr(), text: text, repl: $('repl').value });
  }

  /* ---------- tampilan ---------- */
  function view(kind) {
    $('empty').hidden = kind !== 'empty'; $('out').hidden = kind !== 'out';
    if (kind === 'empty') { $('warn').hidden = true; $('stat').textContent = ''; }
  }
  function pluralKey(p, n) { return p + (n === 1 ? '_one' : '_other'); }

  function renderHl(segs) {
    var pre = $('hl'); pre.textContent = '';
    if (!segs.some(function (s) { return s.m; })) { pre.textContent = $('txt').value || ''; if (!$('txt').value) pre.textContent = t('nomatch_hl'); return; }
    var frag = document.createDocumentFragment();
    segs.forEach(function (s) {
      if (!s.m) { frag.appendChild(document.createTextNode(s.t)); return; }
      var m = document.createElement('mark');
      m.className = 'rx-m' + (s.g ? ' rx-g' + (((s.g - 1) % 6) + 1) : '');
      if (s.g) m.title = t('grp', { n: s.g });
      m.textContent = s.t; frag.appendChild(m);
    });
    pre.appendChild(frag);
  }
  function codeOrEmpty(s) {
    var c = document.createElement(s === '' ? 'em' : 'code'); c.textContent = s === '' ? t('emptym') : s; if (s !== '') c.className = 'rx-code'; return c;
  }
  function renderMatches(ms) {
    var ol = $('list'); ol.textContent = ''; var frag = document.createDocumentFragment();
    ms.forEach(function (m, i) {
      var li = document.createElement('li'), head = document.createElement('div'), meta = document.createElement('span');
      head.className = 'rx-mh'; meta.className = 'small muted'; meta.textContent = '#' + (i + 1) + ' · ' + t('pos', { a: m.index, b: m.end });
      head.appendChild(meta); head.appendChild(codeOrEmpty(m.text)); li.appendChild(head);
      if (m.groups.length || m.named.length) {
        var dl = document.createElement('dl'); dl.className = 'rx-gl';
        m.groups.forEach(function (g) { add(dl, t('grp', { n: g.i }), g.value, g.i); });
        m.named.forEach(function (g) { add(dl, g.name, g.value, 0); });
        li.appendChild(dl);
      }
      frag.appendChild(li);
    });
    ol.appendChild(frag);
    function add(dl, name, value, n) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name; if (n) dt.className = 'rx-gk rx-g' + (((n - 1) % 6) + 1);
      if (value === null) { var em = document.createElement('em'); em.textContent = t('nogrp'); dd.appendChild(em); } else dd.appendChild(codeOrEmpty(value));
      dl.appendChild(dt); dl.appendChild(dd);
    }
  }
  function renderParts(parts) {
    var ol = $('list'); ol.textContent = ''; var frag = document.createDocumentFragment();
    parts.forEach(function (p, i) {
      var li = document.createElement('li'), head = document.createElement('div'), meta = document.createElement('span');
      head.className = 'rx-mh'; meta.className = 'small muted'; meta.textContent = '#' + (i + 1);
      head.appendChild(meta); head.appendChild(codeOrEmpty(p === undefined ? '' : p)); li.appendChild(head); frag.appendChild(li);
    });
    ol.appendChild(frag);
  }

  function show(req, res, ms, inline) {
    last = { req: req, res: res, ms: ms };
    var warn = $('warn'), stat = $('stat');
    warn.hidden = true; warn.className = 'banner bad rx-warn';
    if (res.slow) { view('out'); $('boxHl').hidden = $('boxRes').hidden = $('boxList').hidden = true; warn.textContent = t('slow'); warn.hidden = false; stat.textContent = ''; return; }
    if (!res.ok) { view('out'); $('boxHl').hidden = $('boxRes').hidden = $('boxList').hidden = true; warn.textContent = t('err', { msg: res.error }); warn.hidden = false; stat.textContent = ''; return; }
    view('out');
    if (inline) { warn.textContent = t('noworker'); warn.hidden = false; warn.className = 'banner rx-warn'; }
    var line;
    if (res.op === 'match') {
      var n = res.matches.length;
      line = n === 0 ? t('c_none') : t(pluralKey('c', n), { n: fmt(n) });
      if (res.truncated) line += ' ' + t('trunc', { max: fmt(Rx.MAX) });
      $('boxHl').hidden = false; $('boxRes').hidden = true; $('boxList').hidden = !n;
      $('listH').textContent = t('list_h'); renderHl(res.segs); renderMatches(res.matches);
    } else if (res.op === 'replace') {
      line = t(pluralKey('r', res.count), { n: fmt(res.count) });
      if (res.truncated) line += ' ' + t('trunc', { max: fmt(Rx.MAX) });
      $('boxHl').hidden = true; $('boxList').hidden = true; $('boxRes').hidden = false;
      $('resH').textContent = t('out_h'); $('res').textContent = res.result;
    } else {
      line = t(pluralKey('s', res.total), { n: fmt(res.total) });
      if (res.truncated) line += ' ' + t('trunc', { max: fmt(Rx.MAX) });
      $('boxHl').hidden = true; $('boxRes').hidden = true; $('boxList').hidden = false;
      $('listH').textContent = t('parts_h'); renderParts(res.parts);
    }
    stat.textContent = line + ' · ' + t('ms', { ms: fmt(Math.max(1, Math.round(ms))) });
  }

  /* ---------- kontrol ---------- */
  function toUi() {
    document.querySelector('input[name=mode][value="' + st.mode + '"]').checked = true;
    $('boxRepl').hidden = st.mode !== 'replace';
    document.querySelectorAll('.rx-flag').forEach(function (b) { b.setAttribute('aria-pressed', String(!!st.flags[b.getAttribute('data-f')])); });
  }
  $('pat').addEventListener('input', schedule); $('txt').addEventListener('input', schedule); $('repl').addEventListener('input', schedule);
  $('modes').addEventListener('change', function (e) { st.mode = e.target.value; toUi(); save(); run(); });
  document.querySelector('.rx-flags').addEventListener('click', function (e) {
    var b = e.target.closest('.rx-flag'); if (!b) return;
    var f = b.getAttribute('data-f'); st.flags[f] = !st.flags[f]; toUi(); save(); run();
  });
  function sample(key) {
    var ex = EX[key || 'date'];
    $('pat').value = ex.pat; $('txt').value = ex.text;
    Object.keys(st.flags).forEach(function (f) { st.flags[f] = ex.flags.indexOf(f) >= 0; });
    st.mode = 'match'; toUi(); save(); run();
  }
  $('btnSample').addEventListener('click', function () { sample('date'); });
  $('btnSample2').addEventListener('click', function () { sample('date'); });
  document.querySelector('.rx-ex').addEventListener('click', function (e) { var b = e.target.closest('[data-ex]'); if (b) sample(b.getAttribute('data-ex')); });
  $('btnClear').addEventListener('click', function () { $('pat').value = ''; $('txt').value = ''; $('repl').value = ''; run(); $('pat').focus(); });
  $('btnCopy').addEventListener('click', function () {
    var b = $('btnCopy'), s = $('res').textContent;
    var done = function () { b.textContent = t('common.copied'); setTimeout(function () { b.textContent = t('common.copy'); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function () { /* ditolak */ });
  });

  I.onReady(function () { load(); toUi(); run(); });
  document.addEventListener('sagalait:lang', function () { if (last) show(last.req, last.res, last.ms); });
  window.addEventListener('pagehide', kill);
})();
