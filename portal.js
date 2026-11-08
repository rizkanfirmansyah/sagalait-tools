/* Portal Tools SagalaIT v2. Data dari tools.json; semua teks ke DOM lewat textContent/createElement. */
(function () {
  'use strict';
  var DATA_URL = 'tools.json', FAV_KEY = 'sagalait-favorites';
  var KNOWN = ['php', 'teks', 'waktu', 'server', 'db', 'dev', 'harian'];
  var NS = 'http://www.w3.org/2000/svg';
  var state = { tools: [], groups: [], favs: [], sel: 0, results: [], q: '', opener: null };
  var $ = function (id) { return document.getElementById(id); };
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function svg(tag, attrs) { var n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
  function iconSearch(size) {
    var s = svg('svg', { width: size, height: size, viewBox: '-12 -12 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'aria-hidden': 'true' });
    s.appendChild(svg('circle', { cx: '-2', cy: '-2', r: '7' })); s.appendChild(svg('path', { d: 'M3.5 3.5 L9.5 9.5' })); return s;
  }
  function iconStar() {
    var s = svg('svg', { viewBox: '-12 -12 24 24', 'aria-hidden': 'true' });
    s.appendChild(svg('polygon', { points: '0,-10 2.59,-3.56 9.51,-3.09 4.18,1.36 5.88,8.09 0,4.4 -5.88,8.09 -4.18,1.36 -9.51,-3.09 -2.59,-3.56' })); return s;
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function safeHref(p) { return /^\s*(javascript|data|vbscript):/i.test(p || '') ? '#' : p; }
  function gKey(g, i) { return KNOWN.indexOf(g.id) >= 0 ? g.id : KNOWN[i % KNOWN.length]; }

  /* ---------- favorit ---------- */
  function loadFavs() {
    try { var raw = localStorage.getItem(FAV_KEY); if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) return a; } } catch (e) { /* abaikan */ }
    return state.tools.filter(function (t) { return t.favorite; }).map(function (t) { return t.id; });
  }
  function saveFavs() { try { localStorage.setItem(FAV_KEY, JSON.stringify(state.favs)); } catch (e) { /* abaikan */ } }
  function toggleFav(id) {
    var i = state.favs.indexOf(id); if (i < 0) state.favs.push(id); else state.favs.splice(i, 1);
    saveFavs(); renderPanels(id);
  }

  /* ---------- panel ---------- */
  function tile(t) { return h('span', 'ui-tile', t.icon || t.name.charAt(0)); }
  function shortName(t) { return t.short || String(t.name).split(/\s+/)[0]; }
  function item(t) {
    var fav = state.favs.indexOf(t.id) >= 0;
    var li = h('li', 'p-item'), a = h('a', 'p-row'), tx = h('span', 'p-text');
    a.href = safeHref(t.path); a.setAttribute('aria-label', t.name);
    var tl = tile(t); tl.setAttribute('aria-hidden', 'true');
    tx.appendChild(h('span', 'p-name', t.name)); tx.appendChild(h('span', 'p-desc', t.description || '')); tx.appendChild(h('span', 'p-short', shortName(t)));
    a.appendChild(tl); a.appendChild(tx); li.appendChild(a);
    var b = h('button', 'p-star'); b.type = 'button'; b.setAttribute('data-id', t.id); b.setAttribute('aria-pressed', String(fav));
    b.setAttribute('aria-label', (fav ? 'Hapus dari favorit: ' : 'Tambah ke favorit: ') + t.name); b.appendChild(iconStar());
    li.appendChild(b); return li;
  }
  function panel(id, name, key, tools, extra) {
    var s = h('section', 'p-panel' + (extra ? ' ' + extra : '')), hd = h('h2', 'p-head'), dot = h('span', 'ui-dot'), ul = h('ul', 'p-list');
    if (id) s.id = id;
    dot.setAttribute('data-g', key); dot.setAttribute('aria-hidden', 'true');
    hd.appendChild(dot); hd.appendChild(document.createTextNode(name));
    tools.forEach(function (t) { ul.appendChild(item(t)); });
    s.appendChild(hd); s.appendChild(ul); return s;
  }
  function renderPanels(focusId) {
    var box = $('panels'); clear(box);
    var favT = state.tools.filter(function (t) { return state.favs.indexOf(t.id) >= 0; });
    if (favT.length) box.appendChild(panel(null, 'Favorit', 'fav', favT, 'p-fav'));
    var known = {}, other = [];
    state.groups.forEach(function (g, i) { known[g.id] = { g: g, i: i, tools: [] }; });
    state.tools.forEach(function (t) { (known[t.group] || { tools: other }).tools.push(t); });
    state.groups.forEach(function (g, i) { var e = known[g.id]; if (e.tools.length) box.appendChild(panel('grup-' + g.id, g.name, gKey(g, i), e.tools)); });
    if (other.length) box.appendChild(panel('grup-lainnya', 'Lainnya', 'fav', other));
    if (focusId) { var b = box.querySelector('.p-star[data-id="' + focusId.replace(/"/g, '') + '"]'); if (b) b.focus(); }
  }

  /* ---------- pencarian ---------- */
  function groupName(t) { for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === t.group) return state.groups[i].name; return ''; }
  function groupKeyOf(t) { for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === t.group) return gKey(state.groups[i], i); return 'fav'; }
  function search(q) {
    var terms = norm(q).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return state.tools.map(function (t) { return { t: t, r: 0 }; });
    var out = [];
    state.tools.forEach(function (t, i) {
      var name = norm(t.name), hay = norm([t.name, t.description, (t.tags || []).join(' '), groupName(t)].join(' '));
      if (!terms.every(function (x) { return hay.indexOf(x) >= 0; })) return;
      var r = name.indexOf(terms[0]) === 0 ? 0 : terms.every(function (x) { return name.indexOf(x) >= 0; }) ? 1 : 2;
      out.push({ t: t, r: r, i: i });
    });
    return out.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
  }
  /* sorot kecocokan: petakan teks ternormalisasi kembali ke teks asli supaya diakritik tidak menggeser indeks */
  function marked(parent, text, terms) {
    var n = '', map = [];
    for (var i = 0; i < text.length; i++) { var c = norm(text[i]); for (var k = 0; k < c.length; k++) { n += c[k]; map.push(i); } }
    var hit = new Array(text.length + 1).fill(false);
    terms.forEach(function (t) { var at = n.indexOf(t); while (at >= 0 && t) { for (var j = at; j < at + t.length; j++) hit[map[j]] = true; at = n.indexOf(t, at + t.length); } });
    var cur = '', on = false;
    function flush() { if (!cur) return; if (on) parent.appendChild(h('mark', 'hl', cur)); else parent.appendChild(document.createTextNode(cur)); cur = ''; }
    for (var p = 0; p < text.length; p++) { if (hit[p] !== on) { flush(); on = hit[p]; } cur += text[p]; }
    flush();
  }
  function cols() { var g = getComputedStyle($('srchList')).gridTemplateColumns; return g && g !== 'none' ? g.split(' ').length : 1; }
  function renderResults() {
    var q = $('q').value, terms = norm(q).trim().split(/\s+/).filter(Boolean), list = $('srchList'), res = search(q);
    state.q = q; state.results = res; if (state.sel >= res.length) state.sel = 0;
    clear(list); $('srch').classList.toggle('has-q', !!q.trim());
    $('srchCount').textContent = q.trim() ? res.length + ' hasil' : 'Semua tool (' + state.tools.length + ')';
    if (!res.length) {
      var e = h('li', 'srch-empty'); e.setAttribute('role', 'presentation');
      e.appendChild(h('p', '', 'Tidak ada tool untuk “' + q.trim() + '”'));
      var b = h('button', 'btn btn-sm', 'Hapus pencarian'); b.type = 'button';
      b.addEventListener('click', function () { $('q').value = ''; state.sel = 0; renderResults(); $('q').focus(); });
      e.appendChild(b); list.appendChild(e); $('q').removeAttribute('aria-activedescendant'); return;
    }
    res.forEach(function (r, i) {
      var t = r.t, li = h('li'), a = h('a', 'srch-opt'), tx = h('span', 'p-text'), nm = h('span', 'p-name'), ds = h('span', 'p-desc'), tl = tile(t), dot = h('span', 'ui-dot');
      li.setAttribute('role', 'presentation'); a.id = 'opt-' + i; a.setAttribute('role', 'option'); a.tabIndex = -1; a.href = safeHref(t.path); a.setAttribute('aria-selected', String(i === state.sel));
      a.setAttribute('data-i', i); tl.setAttribute('aria-hidden', 'true'); dot.setAttribute('data-g', groupKeyOf(t)); dot.setAttribute('aria-hidden', 'true'); dot.title = groupName(t);
      marked(nm, t.name, terms); marked(ds, t.description || '', terms);
      tx.appendChild(nm); tx.appendChild(ds); a.appendChild(tl); a.appendChild(tx); a.appendChild(dot); li.appendChild(a); list.appendChild(li);
    });
    $('q').setAttribute('aria-activedescendant', 'opt-' + state.sel);
  }
  function select(i, scroll) {
    var opts = $('srchList').querySelectorAll('[role=option]'); if (!opts.length) return;
    i = Math.max(0, Math.min(opts.length - 1, i)); state.sel = i;
    opts.forEach(function (o, k) { o.setAttribute('aria-selected', String(k === i)); });
    $('q').setAttribute('aria-activedescendant', 'opt-' + i);
    if (scroll !== false) opts[i].scrollIntoView({ block: 'nearest' });
  }
  function openSearch() {
    if (!state.tools.length) return;
    var d = $('srch');
    if (!d.hidden) { $('q').focus(); $('q').select(); return; }
    state.opener = document.activeElement; state.sel = 0; $('q').value = '';
    d.hidden = false; document.body.classList.add('srch-open'); renderResults(); $('q').focus();
  }
  function closeSearch() {
    var d = $('srch'); if (d.hidden) return;
    d.hidden = true; document.body.classList.remove('srch-open');
    if (state.opener && state.opener.focus) state.opener.focus();
  }
  function go(i) { var r = state.results[i]; if (r) location.href = safeHref(r.t.path); }

  /* ---------- peristiwa ---------- */
  $('panels').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.p-star'); if (b) toggleFav(b.getAttribute('data-id')); });
  $('btnSearch').addEventListener('click', openSearch); $('mBar').addEventListener('click', openSearch);
  $('btnCancel').addEventListener('click', closeSearch);
  $('srch').addEventListener('mousedown', function (e) { if (e.target === $('srch')) { e.preventDefault(); closeSearch(); } });
  $('q').addEventListener('input', function () { state.sel = 0; renderResults(); });
  $('srchList').addEventListener('mousemove', function (e) { var o = e.target.closest && e.target.closest('[role=option]'); if (o && Number(o.getAttribute('data-i')) !== state.sel) select(Number(o.getAttribute('data-i')), false); });
  $('srchList').addEventListener('click', function (e) { var o = e.target.closest && e.target.closest('[role=option]'); if (o) closeSearch(); });
  $('srch').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
    if (e.key === 'Tab') { // fokus terjebak di dialog: kolom isian dan tombol Batal
      var f = [$('q'), $('btnCancel')].filter(function (x) { return x.offsetParent !== null; }), i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); return;
    }
    var c = cols(), n = state.results.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); select(state.sel + c > n - 1 && state.sel < n - 1 && c > 1 ? n - 1 : state.sel + c); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(state.sel - c); }
    else if (e.key === 'ArrowRight' && c > 1) { e.preventDefault(); select(state.sel + 1); }
    else if (e.key === 'ArrowLeft' && c > 1) { e.preventDefault(); select(state.sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(state.sel); }
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable), open = !$('srch').hidden, mod = e.ctrlKey || e.metaKey;
    var k = (e.key || '').toLowerCase();
    if (mod && !e.altKey && !e.shiftKey && (k === 'f' || k === 'k')) {
      if (k === 'f' && typing && !open) return; // kolom isian lain: biarkan pencarian bawaan browser
      e.preventDefault(); openSearch(); return;
    }
    if (k === '/' && !typing && !mod && !e.altKey && !open) { e.preventDefault(); openSearch(); }
  });
  window.addEventListener('pageshow', function () { if (!$('srch').hidden) closeSearch(); });

  /* ---------- mulai ---------- */
  function setup(data) {
    if (!data || !Array.isArray(data.tools)) throw new Error('Format tools.json salah: harus punya array "tools".');
    var site = data.site || {};
    state.tools = data.tools.filter(function (t) { return !t.hidden; }); state.groups = data.groups || [];
    if (site.title) document.title = site.title;
    $('footL').textContent = (site.footer || 'sagalait.cloud') + ' · semua berjalan di browser';
    $('mBarText').textContent = 'Cari dari ' + state.tools.length + ' tool';
    state.favs = loadFavs(); renderPanels();
  }
  function fail(err) {
    var box = $('panels'); clear(box);
    var p = h('div', 'panel p-fail'); p.appendChild(h('h2', '', 'Tidak bisa memuat ' + DATA_URL)); p.appendChild(h('p', '', String(err && err.message ? err.message : err)));
    if (location.protocol === 'file:') p.appendChild(h('p', 'small muted', 'Halaman dibuka langsung dari file, dan browser memblokir pembacaan JSON dengan cara itu. Jalankan server lokal, misalnya python3 -m http.server 8000.'));
    var b = h('button', 'btn', 'Coba lagi'); b.type = 'button'; b.addEventListener('click', load); p.appendChild(b); box.appendChild(p);
  }
  function load() {
    fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('Server menjawab ' + r.status + ' untuk ' + DATA_URL + '.'); return r.json(); }).then(setup).catch(fail);
  }
  var kd = $('kbdMain'); kd.textContent = isMac ? '⌘ F' : 'Ctrl F';
  $('hintKey').textContent = isMac ? '⌘ F' : 'Ctrl F';
  $('btnSearch').insertBefore(iconSearch(18), $('btnSearch').firstChild); $('mBar').insertBefore(iconSearch(20), $('mBar').firstChild); $('srchIcon').appendChild(iconSearch(22));
  load();
  window.__portal = { state: state, open: openSearch, close: closeSearch };
})();
