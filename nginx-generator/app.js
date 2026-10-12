/* Nginx generator: antarmuka. Semua data ditampilkan lewat textContent / createElement. */
(function () {
  'use strict';
  var KEY = 'sagalait-nginx-generator';
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var DEFAULTS = {
    mode: 'static', names: '', https: false, http2: true, hsts: false, port: '80', ipv6: true, logs: true, sec: true,
    auth: false, authUser: 'admin', ipOn: false, ips: '', limit: false, rate: '10', burst: '20',
    realIp: false, realFrom: '', realHdr: 'X-Forwarded-For',
    root: '', index: 'index.html', spa: false, gzip: true, cache: false, cacheDur: '30d',
    sockType: 'unix', sock: '/run/php/php8.3-fpm.sock', laravel: false, maxBody: '',
    fwdHost: true, fwdHdr: true, http11: true, ws: false, autoRedirect: true, timeout: '',
    samples: '/\n/api/users?id=1\n/tools.json',
    kind: 'http2https', newDomain: '', code: '301',
    locs: [{ path: '/', target: '' }]
  };
  var SAMPLES = {
    static: { names: 'contoh.com www.contoh.com', root: '/var/www/contoh', spa: true, cache: true, https: true },
    proxy: { names: 'app.contoh.com', https: true, ws: true, maxBody: '50m', locs: [{ path: '/', target: 'http://127.0.0.1:3000' }, { path: '/api/', target: 'http://127.0.0.1:8080/' }] },
    php: { names: 'situs.contoh.com', root: '/var/www/situs/public', laravel: true, https: true, maxBody: '20m' },
    redirect: { names: 'www.contoh.com', kind: 'www2non', https: true }
  };
  var state = clone(DEFAULTS);
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- baca/tulis form ---------- */
  var fields = Array.prototype.slice.call(document.querySelectorAll('[data-k]'));
  function readForm() {
    fields.forEach(function (f) { state[f.getAttribute('data-k')] = f.type === 'checkbox' ? f.checked : f.value; });
  }
  function writeForm() {
    fields.forEach(function (f) { var v = state[f.getAttribute('data-k')]; if (f.type === 'checkbox') f.checked = !!v; else f.value = v; });
    renderLocs();
  }
  function merge(src) {
    var s = clone(DEFAULTS);
    if (src && typeof src === 'object') {
      Object.keys(DEFAULTS).forEach(function (k) {
        if (k === 'locs') {
          if (Array.isArray(src.locs)) s.locs = src.locs.slice(0, 20).filter(function (l) { return l && typeof l.path === 'string' && typeof l.target === 'string'; }).map(function (l) { return { path: l.path, target: l.target }; });
          if (!s.locs.length) s.locs = clone(DEFAULTS.locs);
        } else if (typeof src[k] === typeof DEFAULTS[k]) s[k] = src[k];
      });
    }
    return s;
  }

  /* ---------- location (dapat ditambah/dihapus) ---------- */
  function renderLocs() {
    var box = $('locs'); box.textContent = '';
    state.locs.forEach(function (l, i) {
      var w = el('div', 'loc');
      var head = el('div', 'head'); head.appendChild(el('span', '', 'Location ' + (i + 1)));
      if (state.locs.length > 1) {
        var rm = el('button', 'btn btn-sm', 'Hapus'); rm.type = 'button'; rm.setAttribute('aria-label', 'Hapus location ' + (i + 1));
        rm.addEventListener('click', function () { state.locs.splice(i, 1); renderLocs(); update(); });
        head.appendChild(rm);
      }
      w.appendChild(head);
      [['path', 'Path location', '/api/'], ['target', 'Tujuan (proxy_pass)', 'http://127.0.0.1:3000']].forEach(function (c) {
        var id = 'loc' + i + c[0];
        var lb = el('label', 'lbl', c[1]); lb.htmlFor = id; w.appendChild(lb);
        var inp = el('input', 'in'); inp.id = id; inp.type = 'text'; inp.value = l[c[0]]; inp.placeholder = c[2];
        inp.spellcheck = false; inp.setAttribute('autocapitalize', 'none');
        inp.addEventListener('input', function () { l[c[0]] = inp.value; update(); });
        w.appendChild(inp);
      });
      box.appendChild(w);
    });
  }
  $('addLoc').addEventListener('click', function () {
    if (state.locs.length >= 20) return;
    state.locs.push({ path: '', target: '' }); renderLocs(); update();
    var last = document.getElementById('loc' + (state.locs.length - 1) + 'path'); if (last) last.focus();
  });

  /* ---------- keluaran ---------- */
  var last = null;
  function pushIssue(box, i, err) {
    var d = el('div', 'issue' + (err ? '' : ' ' + i.level));
    var h = el('div', 'issue-head');
    h.appendChild(el('span', 'tag', err ? 'Perlu diperbaiki' : i.tag));
    if (!err && i.where) h.appendChild(el('span', 'where', i.where));
    d.appendChild(h);
    if (err) d.appendChild(el('p', '', i));
    else { d.appendChild(el('div', 'ttl', i.title)); d.appendChild(el('p', '', i.text)); }
    box.appendChild(d);
  }
  function renderMaps(res) {
    var panel = $('mapPanel');
    panel.hidden = state.mode !== 'proxy' || !res.previews.length;
    var box = $('maps'); box.textContent = '';
    if (panel.hidden) return;
    var samples = state.samples.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12);
    res.previews.forEach(function (p) {
      box.appendChild(el('div', 'tbl-cap', 'location ' + p.loc + '  →  ' + p.target));
      var wrap = el('div', 'tbl-wrap'), t = el('table', 'tbl');
      var hr = el('tr'); ['Permintaan', 'URL yang diterima backend'].forEach(function (x) { hr.appendChild(el('th', '', x)); });
      var th = el('thead'); th.appendChild(hr); t.appendChild(th);
      var tb = el('tbody');
      samples.forEach(function (sp) {
        var r = NgCore.mapUrl(p.loc, p.target, sp), tr = el('tr');
        tr.appendChild(el('td', 'm', sp.charAt(0) === '/' ? sp : '/' + sp));
        var td = el('td', r.status === 'ok' ? 'm' : 'bad', r.status === 'ok' ? r.url : r.note);
        if (r.status === 'ok') td.title = r.note;
        tr.appendChild(td); tb.appendChild(tr);
      });
      t.appendChild(tb); wrap.appendChild(t); box.appendChild(wrap);
    });
  }
  function render() {
    var res = NgCore.build(state); last = res;
    var empty = !!res.empty;
    $('empty').hidden = !empty; $('out').hidden = empty;
    if (empty) return;
    var eb = $('errors'); eb.textContent = '';
    var bad = res.errors && res.errors.length;
    $('good').hidden = !!bad;
    if (bad) { res.errors.forEach(function (m) { pushIssue(eb, m, true); }); return; }
    var ib = $('issues'); ib.textContent = '';
    res.issues.forEach(function (i) { pushIssue(ib, i, false); });
    renderMaps(res);
    $('confTitle').textContent = res.filename;
    $('conf').textContent = res.conf;
    $('inst').textContent = res.install;
  }

  /* ---------- simpan: hash URL + localStorage (tanpa rahasia) ---------- */
  function encode(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function decode(h) {
    h = h.replace(/-/g, '+').replace(/_/g, '/'); while (h.length % 4) h += '=';
    return JSON.parse(decodeURIComponent(escape(atob(h))));
  }
  function persist() {
    var enc = encode(state);
    try { history.replaceState(null, '', '#' + enc); } catch (e) { /* abaikan */ }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* mode privat */ }
  }
  function load() {
    var src = null;
    try { if (location.hash.length > 1) src = decode(location.hash.slice(1)); } catch (e) { src = null; }
    if (!src) { try { src = JSON.parse(localStorage.getItem(KEY)); } catch (e) { src = null; } }
    return merge(src);
  }

  function update() { readForm(); applyAll(); render(); persist(); }
  function applyAll() {
    document.querySelectorAll('[data-mode],[data-kind],[data-kind-not],[data-sub],[data-notsub]').forEach(function (e) { e.hidden = false; });
    var s = state, nohttps = s.mode === 'redirect' && s.kind === 'http2https';
    function hide(e) { e.hidden = true; }
    document.querySelectorAll('[data-mode]').forEach(function (e) { if (e.getAttribute('data-mode').split(' ').indexOf(s.mode) < 0) hide(e); });
    document.querySelectorAll('[data-kind]').forEach(function (e) { if (e.getAttribute('data-kind').split(' ').indexOf(s.kind) < 0) hide(e); });
    document.querySelectorAll('[data-kind-not]').forEach(function (e) { if (nohttps) hide(e); });
    document.querySelectorAll('[data-sub]').forEach(function (e) { if (!s[e.getAttribute('data-sub')]) hide(e); });
    document.querySelectorAll('[data-notsub]').forEach(function (e) { if (s[e.getAttribute('data-notsub')]) hide(e); });
    $('dirTitle').textContent = s.mode === 'php' ? 'PHP-FPM' : 'Situs statis';
  }

  /* ---------- salin / unduh ---------- */
  function copy(text, btn) {
    var old = btn.textContent;
    function done() { btn.textContent = 'Tersalin'; setTimeout(function () { btn.textContent = old; }, 1500); }
    function fallback() {
      var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal, salin manual'; }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  $('btnCopy').addEventListener('click', function () { if (last && last.conf) copy(last.conf, this); });
  $('btnCopyInst').addEventListener('click', function () { if (last && last.install) copy(last.install, this); });
  $('btnDownload').addEventListener('click', function () {
    if (!last || !last.conf) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([last.conf], { type: 'text/plain' }));
    a.download = last.filename; a.click(); URL.revokeObjectURL(a.href);
  });

  /* ---------- peristiwa ---------- */
  $('form').addEventListener('input', function (e) { if (e.target.hasAttribute('data-k')) update(); });
  $('form').addEventListener('change', function (e) {
    if (e.target.id === 'sockType') {
      var cur = $('sock').value;
      if (cur === '/run/php/php8.3-fpm.sock' || cur === '127.0.0.1:9000') $('sock').value = e.target.value === 'tcp' ? '127.0.0.1:9000' : '/run/php/php8.3-fpm.sock';
    }
    if (e.target.hasAttribute('data-k')) update();
  });
  $('samples').addEventListener('input', update);
  $('btnSample').addEventListener('click', function () {
    var m = state.mode; state = merge(Object.assign({}, state, SAMPLES[m], { mode: m })); writeForm(); update();
  });
  $('btnReset').addEventListener('click', function () { state = clone(DEFAULTS); writeForm(); update(); });

  state = load(); writeForm(); applyAll(); render();
})();
