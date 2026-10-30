/* Antarmuka Generator dokumentasi API. Semua teks ditampilkan lewat textContent.
   Hanya info API, server, dan opsi yang diingat di browser; isi endpoint dan contoh JSON tidak disimpan (pakai "Simpan proyek"). */
(function () {
  'use strict';
  var A = APIDOC, KEY = 'sagalait-api-docs', st = A.defaults(), fmt = 'yaml', timer = null, last = null;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function opt(sel, v, label) { var o = el('option', '', label); o.value = v; sel.appendChild(o); return o; }
  function field(label, input, id) { var f = el('div', 'ad-f'), l = el('label', '', label); if (id) { input.id = id; l.setAttribute('for', id); } f.appendChild(l); f.appendChild(input); return f; }
  var uidc = 0; function nid(p) { return p + (++uidc); }
  function text(v, ph, cls) { var i = el('input', 'field-sm ad-in' + (cls ? ' ' + cls : '')); i.type = 'text'; i.value = v || ''; if (ph) i.placeholder = ph; i.autocomplete = 'off'; i.spellcheck = false; return i; }

  /* ---------- penyimpanan ringan ---------- */
  function saveLight() { try { localStorage.setItem(KEY, JSON.stringify({ ver: st.ver, info: st.info, servers: st.servers, auth: st.auth, apiKeyName: st.apiKeyName, components: st.components, examples: st.examples })); } catch (e) { /* abaikan */ } }
  function loadLight() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY)); if (!s || typeof s !== 'object') return;
      if (A.VERSIONS.some(function (v) { return v[0] === s.ver; })) st.ver = s.ver;
      if (s.info && typeof s.info === 'object') ['title', 'version', 'description'].forEach(function (k) { if (typeof s.info[k] === 'string') st.info[k] = s.info[k]; });
      if (Array.isArray(s.servers) && s.servers.length) st.servers = s.servers.slice(0, 10).map(function (x) { return { url: String((x && x.url) || ''), description: String((x && x.description) || '') }; });
      if (['none', 'bearer', 'apikey', 'basic'].indexOf(s.auth) >= 0) st.auth = s.auth;
      if (typeof s.apiKeyName === 'string') st.apiKeyName = s.apiKeyName;
      if (typeof s.components === 'boolean') st.components = s.components;
      if (typeof s.examples === 'boolean') st.examples = s.examples;
    } catch (e) { /* abaikan */ }
  }

  /* ---------- contoh JSON -> node ---------- */
  function analyze(o) {
    var s = (o.sample || '').trim();
    if (!s) { o.node = null; o.err = ''; return; }
    try { o.node = A.carry(o.node, A.infer(JSON.parse(s))); o.err = ''; }
    catch (e) { o.err = String(e.message || e); }
  }
  function hydrate() { st.endpoints.forEach(function (e) { analyze(e.body); e.responses.forEach(analyze); }); }

  /* ---------- tabel skema ---------- */
  var LEAF = ['string', 'integer', 'number', 'boolean', 'null'];
  function schemaTable(root, ro, onChange) {
    var wrap = el('div', 'sc-wrap'), tb = el('table', 'sc'), head = el('tr');
    ['Nama', 'Tipe', 'Wajib', 'Boleh null', 'Deskripsi', 'Contoh'].forEach(function (h) { head.appendChild(el('th', '', h)); });
    var th = el('thead'); th.appendChild(head); tb.appendChild(th);
    var body = el('tbody'); tb.appendChild(body); wrap.appendChild(tb);
    function row(node, name, depth, prop, isItem) {
      var tr = el('tr'), c1 = el('td', 'nm'), pad = el('span'); pad.style.display = 'inline-block'; pad.style.width = depth * 16 + 'px'; c1.appendChild(pad);
      c1.appendChild(document.createTextNode(name)); tr.appendChild(c1);
      var c2 = el('td');
      if (node.type === 'object' || node.type === 'array') c2.textContent = node.type + (node.type === 'array' ? ' of ' + (node.items.empty ? '?' : node.items.type) : '');
      else if (ro) c2.textContent = node.type + (node.format ? ' (' + node.format + ')' : '');
      else {
        var sel = el('select'); sel.setAttribute('aria-label', 'Tipe ' + name); LEAF.forEach(function (t) { opt(sel, t, t); }); sel.value = node.type;
        sel.addEventListener('change', function () { node.type = sel.value; node.userType = true; if (node.type !== 'integer' && node.type !== 'number') node.format = ''; if (node.type === 'null') node.nullable = true; onChange(true); });
        c2.appendChild(sel); if (node.format) c2.appendChild(el('span', 'small muted', ' ' + node.format));
      }
      tr.appendChild(c2);
      var c3 = el('td', 'c');
      if (prop) {
        if (ro) c3.appendChild(el('span', 'rq ' + (prop.required ? 'y' : 'n'), prop.required ? 'Wajib' : 'Opsional'));
        else { var cb = el('input'); cb.type = 'checkbox'; cb.checked = prop.required; cb.setAttribute('aria-label', 'Wajib: ' + name); cb.addEventListener('change', function () { prop.required = cb.checked; onChange(false); }); c3.appendChild(cb); }
      } else c3.textContent = '–';
      tr.appendChild(c3);
      var c4 = el('td', 'c');
      if (ro) c4.textContent = node.nullable ? 'ya' : '–';
      else { var cn = el('input'); cn.type = 'checkbox'; cn.checked = node.nullable; cn.disabled = node.type === 'null'; cn.setAttribute('aria-label', 'Boleh null: ' + name); cn.addEventListener('change', function () { node.nullable = cn.checked; onChange(false); }); c4.appendChild(cn); }
      tr.appendChild(c4);
      var c5 = el('td'), holder = prop || node;
      if (ro) c5.textContent = holder.desc || '';
      else { var di = el('input'); di.type = 'text'; di.value = holder.desc || ''; di.placeholder = 'Penjelasan singkat'; di.setAttribute('aria-label', 'Deskripsi ' + name); di.addEventListener('input', function () { holder.desc = di.value; onChange(false); }); c5.appendChild(di); }
      tr.appendChild(c5);
      var ex = node.example === undefined ? '' : JSON.stringify(node.example), c6 = el('td', 'ex', ex); c6.title = ex; tr.appendChild(c6);
      body.appendChild(tr);
      if (node.type === 'object') node.props.forEach(function (p) { row(p.node, p.name, depth + 1, p, false); });
      else if (node.type === 'array') { if (node.items.empty) { var er = el('tr'), ec = el('td', 'small muted', 'Array kosong di contoh. Isi minimal satu item agar bentuknya terbaca.'); ec.colSpan = 6; er.appendChild(ec); body.appendChild(er); } else row(node.items, '[ ] item', depth + 1, null, true); }
    }
    row(root, root.type === 'object' || root.type === 'array' ? '(isi)' : '(nilai)', 0, null, false);
    return wrap;
  }

  /* blok contoh JSON + tabel skema */
  function sampleBlock(o, label, ph, ro) {
    var box = el('div'), ta = el('textarea', 'field sample'), err = el('p', 'ad-err'), tbl = el('div'), tools = el('div', 'rs-quick');
    ta.value = o.sample || ''; ta.spellcheck = false; ta.placeholder = ph; ta.setAttribute('aria-label', label); err.hidden = true;
    var fm = el('button', 'btn btn-sm', 'Rapikan JSON'); fm.type = 'button';
    function draw() { clear(tbl); err.hidden = !o.err; err.textContent = o.err ? 'Bukan JSON valid: ' + o.err : ''; if (o.node) tbl.appendChild(schemaTable(o.node, false, function (struct) { if (struct) draw(); refresh(); })); }
    var t = null;
    ta.addEventListener('input', function () { o.sample = ta.value; clearTimeout(t); t = setTimeout(function () { analyze(o); draw(); refresh(); }, 300); });
    fm.addEventListener('click', function () { try { ta.value = JSON.stringify(JSON.parse(ta.value), null, 2); o.sample = ta.value; analyze(o); draw(); refresh(); } catch (e) { analyze(o); draw(); } });
    tools.appendChild(fm);
    box.appendChild(ta); box.appendChild(tools); box.appendChild(err); box.appendChild(tbl); draw();
    return box;
  }

  /* ---------- server ---------- */
  function renderServers() {
    var box = $('servers'); clear(box);
    st.servers.forEach(function (s, i) {
      var row = el('div', 'ad-row'), u = text(s.url, 'https://api.contoh.id/v1'), d = text(s.description, 'Produksi'), x = el('button', 'ad-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Hapus server ' + (i + 1));
      u.addEventListener('input', function () { s.url = u.value; saveLight(); refresh(); }); d.addEventListener('input', function () { s.description = d.value; saveLight(); refresh(); });
      x.addEventListener('click', function () { st.servers.splice(i, 1); saveLight(); renderServers(); refresh(); });
      row.appendChild(field('URL server', u)); row.appendChild(field('Keterangan', d)); row.appendChild(x); box.appendChild(row);
    });
  }

  /* ---------- endpoint ---------- */
  var QUICK = ['200', '201', '204', '400', '401', '404', '500'];
  function epCard(e, open) {
    var d = el('details', 'ep'); if (open) d.open = true;
    var sm = el('summary'), mth = el('span', 'mth ' + e.method, e.method), pth = el('span', 'ep-path', e.path || '/'), sum = el('span', 'ep-sum', e.summary || '');
    sm.appendChild(mth); sm.appendChild(pth); sm.appendChild(sum); d.appendChild(sm);
    var b = el('div', 'ep-body');
    var g = el('div', 'ad-grid2');
    var ms = el('select', 'field-sm ad-in'); A.METHODS.forEach(function (m) { opt(ms, m, m.toUpperCase()); }); ms.value = e.method;
    ms.addEventListener('change', function () { e.method = ms.value; mth.className = 'mth ' + e.method; mth.textContent = e.method; refresh(); });
    var pi = text(e.path, '/users/{id}', 'mono');
    pi.addEventListener('input', function () { e.path = pi.value; pth.textContent = e.path || '/'; refresh(); });
    pi.addEventListener('change', function () { var add = false; A.pathParams(e.path).forEach(function (n) { if (!e.params.some(function (p) { return p.in === 'path' && p.name === n; })) { e.params.push({ name: n, in: 'path', type: 'string', required: true, description: '', example: '' }); add = true; } }); if (add) { renderEndpoints(e.id); refresh(); } });
    g.appendChild(field('Method', ms)); g.appendChild(field('Path (parameter ditulis {id})', pi));
    var si = text(e.summary, 'Daftar pengguna'); si.addEventListener('input', function () { e.summary = si.value; sum.textContent = e.summary; refresh(); });
    var ti = text(e.tag, 'Pengguna'); ti.addEventListener('input', function () { e.tag = ti.value; refresh(); });
    g.appendChild(field('Ringkasan', si)); g.appendChild(field('Tag (pengelompokan)', ti)); b.appendChild(g);
    var de = el('textarea', 'field ad-ta'); de.value = e.description || ''; de.placeholder = 'Penjelasan lebih panjang (opsional)'; de.addEventListener('input', function () { e.description = de.value; refresh(); });
    b.appendChild(field('Deskripsi', de));
    var au = el('label', 'ad-chk'), ac = el('input'); ac.type = 'checkbox'; ac.checked = e.auth !== false; ac.addEventListener('change', function () { e.auth = ac.checked; refresh(); });
    au.appendChild(ac); au.appendChild(document.createTextNode(' Butuh autentikasi (sesuai pengaturan di atas)')); b.appendChild(au);

    /* parameter */
    var h1 = el('h3', '', 'Parameter'); h1.appendChild(el('span', 'small muted', 'path, query, header')); b.appendChild(h1);
    var pbox = el('div');
    function drawParams() {
      clear(pbox);
      e.params.forEach(function (p, i) {
        var row = el('div', 'ad-row pr'), nm = text(p.name, 'page'), inn = el('select', 'field-sm ad-in'), ty = el('select', 'field-sm ad-in'), rq = el('label', 'ad-chk'), rc = el('input'), x = el('button', 'ad-x', '×');
        ['query', 'path', 'header'].forEach(function (v) { opt(inn, v, v); }); inn.value = p.in; ['string', 'integer', 'number', 'boolean', 'array'].forEach(function (v) { opt(ty, v, v); }); ty.value = p.type;
        rc.type = 'checkbox'; rc.checked = p.in === 'path' ? true : !!p.required; rc.disabled = p.in === 'path'; rq.appendChild(rc); rq.appendChild(document.createTextNode(' Wajib'));
        x.type = 'button'; x.setAttribute('aria-label', 'Hapus parameter ' + (p.name || i + 1));
        nm.addEventListener('input', function () { p.name = nm.value; refresh(); }); inn.addEventListener('change', function () { p.in = inn.value; if (p.in === 'path') p.required = true; drawParams(); refresh(); });
        ty.addEventListener('change', function () { p.type = ty.value; refresh(); }); rc.addEventListener('change', function () { p.required = rc.checked; refresh(); });
        x.addEventListener('click', function () { e.params.splice(i, 1); drawParams(); refresh(); });
        row.appendChild(field('Nama', nm)); row.appendChild(field('Lokasi', inn)); row.appendChild(field('Tipe', ty)); row.appendChild(rq); row.appendChild(x);
        var r2 = el('div', 'ad-row'), ds = text(p.description, 'Nomor halaman'), ex = text(p.example, '1'), spacer = el('span');
        ds.addEventListener('input', function () { p.description = ds.value; refresh(); }); ex.addEventListener('input', function () { p.example = ex.value; refresh(); });
        r2.appendChild(field('Deskripsi', ds)); r2.appendChild(field('Contoh nilai', ex)); r2.appendChild(spacer);
        pbox.appendChild(row); pbox.appendChild(r2);
      });
    }
    drawParams(); b.appendChild(pbox);
    var ap = el('button', 'btn btn-sm ad-btn', 'Tambah parameter'); ap.type = 'button'; ap.addEventListener('click', function () { e.params.push({ name: '', in: 'query', type: 'string', required: false, description: '', example: '' }); drawParams(); refresh(); var ins = pbox.querySelectorAll('.ad-row.pr input[type=text]'); if (ins.length) ins[ins.length - 2 < 0 ? 0 : ins.length - 1].focus(); });
    b.appendChild(ap);

    /* request body */
    var h2 = el('h3', '', 'Request body'); b.appendChild(h2);
    var bo = el('label', 'ad-chk'), bc = el('input'); bc.type = 'checkbox'; bc.checked = !!e.body.on; bo.appendChild(bc); bo.appendChild(document.createTextNode(' Punya request body')); b.appendChild(bo);
    var bbox = el('div');
    function drawBody() {
      clear(bbox); if (!e.body.on) return;
      var g2 = el('div', 'ad-grid2'), ct = el('select', 'field-sm ad-in'); ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'].forEach(function (v) { opt(ct, v, v); }); ct.value = e.body.type;
      ct.addEventListener('change', function () { e.body.type = ct.value; refresh(); });
      var bd = text(e.body.desc, 'Data pengguna baru'); bd.addEventListener('input', function () { e.body.desc = bd.value; refresh(); });
      g2.appendChild(field('Tipe konten', ct)); g2.appendChild(field('Keterangan', bd)); bbox.appendChild(g2);
      bbox.appendChild(el('p', 'small muted', 'Tempel contoh request. Tandai tiap field Wajib atau Opsional di tabel. Field yang nilainya null dimulai sebagai opsional.'));
      bbox.appendChild(sampleBlock(e.body, 'Contoh request body (JSON)', '{\n  "name": "Budi",\n  "email": "budi@contoh.id"\n}', false));
    }
    bc.addEventListener('change', function () { e.body.on = bc.checked; drawBody(); refresh(); });
    drawBody(); b.appendChild(bbox);

    /* response */
    var h3 = el('h3', '', 'Response'); b.appendChild(h3);
    var rbox = el('div');
    function drawResp() {
      clear(rbox);
      e.responses.forEach(function (r, i) {
        var blk = el('div', 'rs-blk'), hd = el('div', 'rs-head'), cd = text(r.code, '200'), ds = text(r.desc, 'Berhasil'), x = el('button', 'ad-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Hapus respons ' + r.code);
        cd.addEventListener('input', function () { r.code = cd.value; refresh(); }); ds.addEventListener('input', function () { r.desc = ds.value; refresh(); });
        x.addEventListener('click', function () { e.responses.splice(i, 1); drawResp(); refresh(); });
        hd.appendChild(field('Kode', cd)); hd.appendChild(field('Keterangan', ds)); hd.appendChild(x); blk.appendChild(hd);
        blk.appendChild(sampleBlock(r, 'Contoh response ' + r.code + ' (JSON)', 'Kosongkan bila tanpa isi (mis. 204)', false)); rbox.appendChild(blk);
      });
    }
    drawResp(); b.appendChild(rbox);
    var q = el('div', 'rs-quick'); q.appendChild(el('span', 'small muted', 'Tambah respons:'));
    QUICK.forEach(function (c) { var bt = el('button', 'btn btn-sm', c); bt.type = 'button'; bt.addEventListener('click', function () { if (e.responses.some(function (r) { return String(r.code) === c; })) return; e.responses.push(/^[45]/.test(c) ? A.errorResponse(c) : A.newResponse(c)); analyze(e.responses[e.responses.length - 1]); drawResp(); refresh(); }); q.appendChild(bt); });
    b.appendChild(q);
    var rm = el('button', 'btn ad-btn', 'Hapus endpoint ini'); rm.type = 'button'; rm.addEventListener('click', function () { st.endpoints = st.endpoints.filter(function (x) { return x !== e; }); renderEndpoints(); refresh(); $('addEp').focus(); });
    b.appendChild(rm);
    d.appendChild(b);
    return d;
  }
  function renderEndpoints(openId) {
    var box = $('endpoints'); clear(box);
    $('epCount').textContent = st.endpoints.length + ' endpoint';
    if (!st.endpoints.length) box.appendChild(el('p', 'muted', 'Belum ada endpoint. Klik Tambah endpoint, atau Coba dengan contoh.'));
    st.endpoints.forEach(function (e) { box.appendChild(epCard(e, e.id === openId)); });
  }

  /* ---------- hasil ---------- */
  function slug(s) { return String(s || 'api').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'api'; }
  function refresh() { clearTimeout(timer); timer = setTimeout(render, 150); }
  function render() {
    last = A.build(st);
    var out = fmt === 'yaml' ? A.toYaml(last.doc) + '\n' : JSON.stringify(last.doc, null, 2) + '\n';
    $('code').textContent = out; last.text = out;
    $('tabYaml').setAttribute('aria-selected', String(fmt === 'yaml')); $('tabJson').setAttribute('aria-selected', String(fmt === 'json'));
    var errs = last.issues.filter(function (i) { return i.lv === 'error'; }).length;
    $('outInfo').textContent = 'OpenAPI ' + st.ver + ' · ' + out.length + ' karakter';
    $('btnDl').disabled = !last.ok; $('btnDl').title = last.ok ? '' : 'Perbaiki ' + errs + ' galat di bawah dulu';
    var ip = $('issuePanel'), ib = $('issues'); clear(ib); ip.hidden = !last.issues.length;
    var order = { error: 0, warn: 1, info: 2 };
    last.issues.slice().sort(function (a, b) { return order[a.lv] - order[b.lv]; }).forEach(function (i) { var d = el('div', 'is ' + i.lv); d.appendChild(el('b', '', { error: 'Galat', warn: 'Peringatan', info: 'Info' }[i.lv])); d.appendChild(document.createTextNode(i.msg)); ib.appendChild(d); });
    $('verHint').textContent = st.ver === '3.0.3' ? 'Memakai nullable dan example (gaya OpenAPI 3.0).' : st.ver === '3.2.0' ? 'Skema memakai JSON Schema 2020-12 (type null, examples). 3.2.0 mencakup semua fitur 3.1.' : 'Skema memakai JSON Schema 2020-12 (type null, examples).';
    $('rowKeyName').hidden = st.auth !== 'apikey';
    preview();
  }
  function preview() {
    var box = $('preview'); clear(box);
    var paths = last.doc.paths || {}, tags = {};
    Object.keys(paths).forEach(function (p) { Object.keys(paths[p]).forEach(function (m) { var op = paths[p][m], t = (op.tags && op.tags[0]) || 'Tanpa tag'; (tags[t] = tags[t] || []).push({ p: p, m: m, op: op }); }); });
    if (!Object.keys(tags).length) { box.appendChild(el('p', 'muted', 'Pratinjau muncul setelah ada endpoint.')); return; }
    Object.keys(tags).forEach(function (t) {
      box.appendChild(el('div', 'pv-tag', t));
      tags[t].forEach(function (x) {
        var d = el('div', 'pv-op'), h = el('h4'); h.appendChild(el('span', 'mth ' + x.m, x.m)); h.appendChild(el('span', 'ep-path', x.p)); d.appendChild(h);
        if (x.op.summary) d.appendChild(el('p', '', x.op.summary));
        if (x.op.parameters) { d.appendChild(el('h5', '', 'Parameter')); x.op.parameters.forEach(function (pr) { d.appendChild(el('p', '', pr.in + ' · ' + pr.name + ' (' + pr.schema.type + ') · ' + (pr.required ? 'wajib' : 'opsional') + (pr.description ? ' · ' + pr.description : ''))); }); }
        if (x.op.requestBody) { d.appendChild(el('h5', '', 'Request body')); var node = nodeFor(x.op.requestBody.content); if (node) d.appendChild(schemaTable(node, true, function () {})); }
        d.appendChild(el('h5', '', 'Response'));
        Object.keys(x.op.responses).forEach(function (c) { var r = x.op.responses[c]; d.appendChild(el('p', '', c + ' · ' + r.description)); var n = r.content && nodeFor(r.content); if (n) d.appendChild(schemaTable(n, true, function () {})); });
        box.appendChild(d);
      });
    });
  }
  /* node untuk pratinjau: cari kembali dari sumbernya lewat contoh yang sama */
  function nodeFor(content) {
    var k = Object.keys(content)[0], ex = content[k].example; if (ex === undefined) return null;
    var key = JSON.stringify(ex), found = null;
    st.endpoints.forEach(function (e) { [e.body].concat(e.responses).forEach(function (o) { if (!found && o.node && o.sample) { try { if (JSON.stringify(JSON.parse(o.sample)) === key) found = o.node; } catch (x) { /* abaikan */ } } }); });
    return found;
  }

  function copy(textv, btn) {
    function done() { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = 'Tersalin'; clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(textv).then(done, fb); else fb();
    function fb() { var ta = el('textarea'); ta.value = textv; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (x) { btn.textContent = 'Gagal menyalin'; } ta.remove(); }
  }
  function download(name, textv, type) { var a = el('a'); a.href = URL.createObjectURL(new Blob([textv], { type: type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }

  /* ---------- proyek ---------- */
  function projectJson() {
    var o = JSON.parse(JSON.stringify(st)); o.endpoints.forEach(function (e) { delete e.body.node; e.responses.forEach(function (r) { delete r.node; }); });
    return JSON.stringify({ format: 'sagalait-api-docs', v: 1, state: o }, null, 2);
  }
  function loadProject(textv) {
    var o; try { o = JSON.parse(textv); } catch (e) { alert0('File proyek bukan JSON yang valid.'); return; }
    if (!o || o.format !== 'sagalait-api-docs' || !o.state) { alert0('File ini bukan proyek dari alat ini.'); return; }
    var s = o.state, d = A.defaults();
    ['ver', 'auth', 'apiKeyName'].forEach(function (k) { if (typeof s[k] === 'string') d[k] = s[k]; });
    if (!A.VERSIONS.some(function (v) { return v[0] === d.ver; })) d.ver = '3.2.0';
    ['components', 'examples'].forEach(function (k) { if (typeof s[k] === 'boolean') d[k] = s[k]; });
    if (s.info) ['title', 'version', 'description'].forEach(function (k) { if (typeof s.info[k] === 'string') d.info[k] = s.info[k]; });
    if (Array.isArray(s.servers)) d.servers = s.servers.map(function (x) { return { url: String((x && x.url) || ''), description: String((x && x.description) || '') }; });
    d.endpoints = (Array.isArray(s.endpoints) ? s.endpoints : []).slice(0, 200).map(function (e) {
      var n = A.newEndpoint(String(e.method || 'get'), String(e.path || '/')); n.summary = String(e.summary || ''); n.description = String(e.description || ''); n.tag = String(e.tag || ''); n.auth = e.auth !== false;
      n.params = (Array.isArray(e.params) ? e.params : []).map(function (p) { return { name: String(p.name || ''), in: ['query', 'path', 'header'].indexOf(p.in) >= 0 ? p.in : 'query', type: String(p.type || 'string'), required: !!p.required, description: String(p.description || ''), example: String(p.example == null ? '' : p.example) }; });
      if (e.body) n.body = { on: !!e.body.on, type: String(e.body.type || 'application/json'), desc: String(e.body.desc || ''), sample: String(e.body.sample || ''), node: null, err: '' };
      n.responses = (Array.isArray(e.responses) ? e.responses : []).map(function (r) { var x = A.newResponse(String(r.code || '200'), String(r.sample || '')); x.desc = String(r.desc || ''); x.shared = String(r.shared || ''); return x; });
      return n;
    });
    st = d; hydrate(); fillForm(); renderEndpoints(); render();
  }
  function alert0(msg) { var d = el('div', 'is error', msg); $('issues').appendChild(d); $('issuePanel').hidden = false; }

  /* ---------- form tingkat atas ---------- */
  function fillForm() {
    $('ver').value = st.ver; $('title').value = st.info.title; $('apiver').value = st.info.version; $('desc').value = st.info.description;
    $('auth').value = st.auth; $('keyName').value = st.apiKeyName; $('optComp').checked = st.components; $('optEx').checked = st.examples;
    renderServers();
  }
  function init() {
    A.VERSIONS.forEach(function (v) { opt($('ver'), v[0], v[1]); });
    loadLight(); fillForm();
    $('ver').addEventListener('change', function () { st.ver = $('ver').value; saveLight(); refresh(); });
    $('title').addEventListener('input', function () { st.info.title = $('title').value; saveLight(); refresh(); });
    $('apiver').addEventListener('input', function () { st.info.version = $('apiver').value; saveLight(); refresh(); });
    $('desc').addEventListener('input', function () { st.info.description = $('desc').value; saveLight(); refresh(); });
    $('auth').addEventListener('change', function () { st.auth = $('auth').value; saveLight(); refresh(); });
    $('keyName').addEventListener('input', function () { st.apiKeyName = $('keyName').value; saveLight(); refresh(); });
    $('optComp').addEventListener('change', function () { st.components = $('optComp').checked; saveLight(); refresh(); });
    $('optEx').addEventListener('change', function () { st.examples = $('optEx').checked; saveLight(); refresh(); });
    $('addServer').addEventListener('click', function () { st.servers.push({ url: '', description: '' }); renderServers(); var ins = $('servers').querySelectorAll('input'); if (ins.length) ins[ins.length - 2].focus(); });
    $('addEp').addEventListener('click', function () { var e = A.newEndpoint('get', '/'); st.endpoints.push(e); renderEndpoints(e.id); refresh(); var d = $('endpoints').lastChild; if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest' }); });
    $('btnSample').addEventListener('click', function () { var ex = A.example(); st = ex; hydrate(); saveLight(); fillForm(); renderEndpoints(st.endpoints[0] && st.endpoints[0].id); render(); });
    $('btnClear').addEventListener('click', function () { var d = A.defaults(); d.ver = st.ver; d.auth = st.auth; st = d; fillForm(); renderEndpoints(); saveLight(); render(); $('title').focus(); });
    $('fileProj').addEventListener('change', function (ev) { var f = ev.target.files[0]; ev.target.value = ''; if (!f) return; f.text().then(loadProject); });
    $('tabYaml').addEventListener('click', function () { fmt = 'yaml'; render(); });
    $('tabJson').addEventListener('click', function () { fmt = 'json'; render(); });
    $('btnCopy').addEventListener('click', function () { copy(last.text, $('btnCopy')); });
    $('btnDl').addEventListener('click', function () { if (!last.ok) return; download(slug(st.info.title) + '-openapi.' + (fmt === 'yaml' ? 'yaml' : 'json'), last.text, fmt === 'yaml' ? 'application/yaml' : 'application/json'); });
    $('btnProj').addEventListener('click', function () { download(slug(st.info.title) + '-proyek.json', projectJson(), 'application/json'); });
    renderEndpoints(); render();
  }
  init();
  window.ADApp = { get state() { return st; }, get last() { return last; } };
})();
