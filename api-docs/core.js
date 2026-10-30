/* Pembuat dokumentasi API (OpenAPI 3.x) dari contoh request dan response. Logika murni, tanpa DOM. */
(function (root) {
  'use strict';

  var VERSIONS = [['3.2.0', 'OpenAPI 3.2.0 (terbaru)'], ['3.1.1', 'OpenAPI 3.1.1'], ['3.0.3', 'OpenAPI 3.0.3 (dipakai banyak alat lama)']];
  var METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  var TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null'];
  var ERROR_SAMPLE = '{\n  "error": {\n    "code": "VALIDATION_ERROR",\n    "message": "Data yang dikirim tidak valid"\n  }\n}';
  var STATUS_TEXT = { 200: 'Berhasil', 201: 'Berhasil dibuat', 204: 'Berhasil tanpa isi', 400: 'Permintaan tidak valid', 401: 'Belum login atau token salah', 403: 'Tidak punya akses', 404: 'Data tidak ditemukan', 409: 'Konflik data', 422: 'Data gagal divalidasi', 500: 'Kesalahan di server' };

  /* ---------- inferensi skema dari contoh JSON ---------- */
  function guessFormat(s) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return 'date-time';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'date';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return 'uuid';
    if (/^https?:\/\/\S+$/.test(s)) return 'uri';
    return '';
  }
  function infer(v) {
    if (v === null) return { type: 'string', nullable: true, nullOnly: true, desc: '', example: null };
    if (Array.isArray(v)) {
      var n = { type: 'array', nullable: false, desc: '', items: null };
      v.forEach(function (e) { var x = infer(e); n.items = n.items ? mergeNodes(n.items, x) : x; });
      if (!n.items) n.items = { type: 'string', nullable: false, desc: '', example: undefined, empty: true };
      return n;
    }
    switch (typeof v) {
      case 'string': return { type: 'string', nullable: false, desc: '', format: guessFormat(v), example: v };
      case 'boolean': return { type: 'boolean', nullable: false, desc: '', example: v };
      case 'number': return { type: Number.isInteger(v) ? 'integer' : 'number', nullable: false, desc: '', format: Number.isInteger(v) ? (Math.abs(v) > 2147483647 ? 'int64' : '') : '', example: v };
      default: {
        var o = { type: 'object', nullable: false, desc: '', props: [] };
        Object.keys(v).forEach(function (k) { var c = infer(v[k]); o.props.push({ name: k, required: v[k] !== null, desc: '', node: c }); });
        return o;
      }
    }
  }
  function mergeNodes(a, b) {
    if (a.nullOnly) { b.nullable = true; return b; }
    if (b.nullOnly) { a.nullable = true; return a; }
    if (a.type !== b.type) {
      if ((a.type === 'integer' && b.type === 'number') || (a.type === 'number' && b.type === 'integer')) { a.type = 'number'; a.format = ''; return a; }
      a.mixed = true; return a;
    }
    a.nullable = a.nullable || b.nullable;
    if (a.type === 'object') {
      var byName = {}; a.props.forEach(function (p) { byName[p.name] = p; });
      var seen = {};
      b.props.forEach(function (p) { seen[p.name] = 1; if (byName[p.name]) { byName[p.name].node = mergeNodes(byName[p.name].node, p.node); byName[p.name].required = byName[p.name].required && p.required; } else a.props.push({ name: p.name, required: false, desc: '', node: p.node }); });
      a.props.forEach(function (p) { if (!seen[p.name] && byName[p.name] === p && b.props.length >= 0) { if (!b.props.some(function (q) { return q.name === p.name; })) p.required = false; } });
    } else if (a.type === 'array') { if (a.items.empty) a.items = b.items; else if (!b.items.empty) a.items = mergeNodes(a.items, b.items); }
    else if (a.format !== b.format) a.format = '';
    return a;
  }
  /* pertahankan pengaturan pengguna (wajib, deskripsi, tipe, null) saat contoh diubah */
  function carry(oldN, newN) {
    if (!oldN || !newN) return newN;
    if (oldN.type === newN.type || (oldN.type !== 'object' && oldN.type !== 'array' && newN.type !== 'object' && newN.type !== 'array')) {
      newN.desc = oldN.desc; if (oldN.userType && newN.type !== 'object' && newN.type !== 'array') { newN.type = oldN.type; newN.userType = true; }
      newN.nullable = oldN.nullable || newN.nullable;
    }
    if (oldN.type === 'object' && newN.type === 'object') {
      newN.props.forEach(function (p) { var o = oldN.props.filter(function (q) { return q.name === p.name; })[0]; if (o) { p.required = o.required; p.desc = o.desc; p.node = carry(o.node, p.node); } });
    } else if (oldN.type === 'array' && newN.type === 'array') newN.items = carry(oldN.items, newN.items);
    return newN;
  }

  /* ---------- node -> objek skema OpenAPI ---------- */
  function schemaOf(n, ver, o) {
    var is31 = ver !== '3.0.3', s = {}, t = n.type;
    if (t === 'null') { if (is31) s.type = 'null'; else { s.type = 'string'; s.nullable = true; } }
    else if (is31) s.type = n.nullable ? [t, 'null'] : t;
    else { s.type = t; if (n.nullable) s.nullable = true; }
    if (n.format) s.format = n.format;
    if (n.desc) s.description = n.desc;
    if (t === 'object') {
      s.properties = {}; var req = [];
      n.props.forEach(function (p) { s.properties[p.name] = schemaOf(Object.assign({}, p.node, { desc: p.desc || p.node.desc }), ver, o); if (p.required) req.push(p.name); });
      if (req.length) s.required = req;
    } else if (t === 'array') s.items = n.items.empty ? {} : schemaOf(n.items, ver, o);
    else if (o.examples && n.example !== undefined && n.example !== null) { if (is31) s.examples = [n.example]; else s.example = n.example; }
    return s;
  }
  function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; return JSON.stringify(v); }

  /* ---------- penamaan ---------- */
  function words(s) { return String(s).replace(/\{([^}]+)\}/g, ' by $1 ').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean); }
  function pascal(s) { return words(s).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(''); }
  function camel(s) { var p = pascal(s); return p.charAt(0).toLowerCase() + p.slice(1); }

  function defaults() {
    return { ver: '3.2.0', info: { title: '', version: '1.0.0', description: '' }, servers: [{ url: '', description: '' }], auth: 'bearer', apiKeyName: 'X-API-Key', components: true, examples: true, errors: false, endpoints: [] };
  }
  var uidN = 0; function uid() { return 'e' + (++uidN) + Date.now().toString(36); }
  function newEndpoint(method, path) { return { id: uid(), method: method || 'get', path: path || '/', summary: '', description: '', tag: '', auth: true, params: [], body: { on: false, type: 'application/json', desc: '', sample: '', node: null, err: '' }, responses: [newResponse('200')] }; }
  function newResponse(code, sample) { return { code: code, desc: STATUS_TEXT[code] || '', sample: sample || '', node: null, err: '', shared: '' }; }
  function errorResponse(code) { var r = newResponse(code, ERROR_SAMPLE); r.shared = 'Error'; return r; }

  function pathParams(path) { var out = [], re = /\{([^}/]+)\}/g, m; while ((m = re.exec(path))) out.push(m[1]); return out; }

  /* ---------- susun dokumen ---------- */
  function build(st) {
    var ver = st.ver, issues = [], doc = { openapi: ver };
    function issue(lv, msg) { issues.push({ lv: lv, msg: msg }); }
    var info = { title: (st.info.title || '').trim(), version: (st.info.version || '').trim() };
    if (!info.title) issue('error', 'Judul API wajib diisi (info.title).');
    if (!info.version) issue('error', 'Versi API wajib diisi (info.version), mis. 1.0.0.');
    if ((st.info.description || '').trim()) info.description = st.info.description.trim();
    doc.info = info;
    var servers = (st.servers || []).filter(function (s) { return (s.url || '').trim(); }).map(function (s) { var o = { url: s.url.trim() }; if ((s.description || '').trim()) o.description = s.description.trim(); return o; });
    servers.forEach(function (s) { if (!/^(https?:\/\/|\/)/.test(s.url)) issue('warn', 'URL server "' + s.url + '" sebaiknya diawali http://, https://, atau /.'); });
    if (servers.length) doc.servers = servers;

    var opts = { examples: !!st.examples }, comps = {}, byCanon = {}, usedOp = {}, paths = {}, tagSet = [], seenOps = {};
    function registerSchema(name, node, shared) {
      var sc = schemaOf(node, ver, opts), key = canon(sc);
      if (shared && comps[shared] && canon(comps[shared]) !== key) shared = '';
      if (shared) { comps[shared] = comps[shared] || sc; byCanon[key] = shared; return { $ref: '#/components/schemas/' + shared }; }
      if (byCanon[key]) return { $ref: '#/components/schemas/' + byCanon[key] };
      var nm = name, i = 2; while (comps[nm] && canon(comps[nm]) !== key) nm = name + (i++);
      comps[nm] = sc; byCanon[key] = nm; return { $ref: '#/components/schemas/' + nm };
    }
    function body(node, name, shared) { return st.components ? registerSchema(name, node, shared) : schemaOf(node, ver, opts); }

    (st.endpoints || []).forEach(function (e, idx) {
      var label = (e.method || 'get').toUpperCase() + ' ' + (e.path || '(tanpa path)');
      var path = (e.path || '').trim(), method = (e.method || 'get').toLowerCase();
      if (!path || path.charAt(0) !== '/') { issue('error', label + ': path harus diawali "/".'); return; }
      if (!/^[\x21-\x7e]+$/.test(path) || /[?#]/.test(path)) { issue('error', label + ': path tidak boleh memuat spasi, ? atau #. Query string ditulis sebagai parameter.'); return; }
      var key = method + ' ' + path.replace(/\{[^}]+\}/g, '{}');
      if (seenOps[key]) { issue('error', label + ': kombinasi method dan path sudah dipakai di endpoint lain.'); return; }
      seenOps[key] = 1;
      var op = {}, base = e.summary || (method + ' ' + path), opId = camel(base) || ('op' + idx), n = 2, id0 = opId;
      while (usedOp[opId]) opId = id0 + (n++); usedOp[opId] = 1;
      if (e.tag && e.tag.trim()) { op.tags = [e.tag.trim()]; if (tagSet.indexOf(e.tag.trim()) < 0) tagSet.push(e.tag.trim()); }
      if (e.summary && e.summary.trim()) op.summary = e.summary.trim(); else issue('info', label + ': ringkasan (summary) kosong, dokumen jadi kurang jelas.');
      if (e.description && e.description.trim()) op.description = e.description.trim();
      op.operationId = opId;

      /* parameter: yang ada di path wajib dideklarasikan */
      var params = (e.params || []).filter(function (p) { return (p.name || '').trim(); }).map(function (p) { return Object.assign({}, p, { name: p.name.trim() }); });
      pathParams(path).forEach(function (pn) { if (!params.some(function (p) { return p.in === 'path' && p.name === pn; })) { params.unshift({ name: pn, in: 'path', type: 'string', required: true, description: '', example: '' }); issue('info', label + ': parameter path {' + pn + '} ditambahkan otomatis (wajib, string).'); } });
      var seenP = {};
      params.forEach(function (p) {
        var k = p.in + ':' + p.name; if (seenP[k]) { issue('error', label + ': parameter "' + p.name + '" (' + p.in + ') ganda.'); return; } seenP[k] = 1;
        if (p.in === 'path' && pathParams(path).indexOf(p.name) < 0) issue('error', label + ': parameter path "' + p.name + '" tidak ada di path sebagai {' + p.name + '}.');
      });
      var plist = [];
      params.forEach(function (p) {
        if (p.in === 'path' && pathParams(path).indexOf(p.name) < 0) return;
        var o = { name: p.name, in: p.in, required: p.in === 'path' ? true : !!p.required };
        if ((p.description || '').trim()) o.description = p.description.trim();
        var t = TYPES.indexOf(p.type) >= 0 && p.type !== 'object' && p.type !== 'null' ? p.type : 'string', sch = { type: t };
        if (t === 'array') sch.items = { type: 'string' };
        o.schema = sch;
        if (String(p.example || '') !== '') { var ex = p.example; if (t === 'integer' || t === 'number') ex = Number(ex); else if (t === 'boolean') ex = String(ex) === 'true'; o.example = ex; }
        plist.push(o);
      });
      if (plist.length) op.parameters = plist;

      /* request body */
      if (e.body && e.body.on) {
        if (e.body.err) issue('error', label + ': contoh request body bukan JSON valid. ' + e.body.err);
        else if (!e.body.node) issue('error', label + ': isi contoh request body, atau matikan "Punya request body".');
        else {
          if (method === 'get' || method === 'head') issue('warn', label + ': GET/HEAD dengan request body tidak lazim dan sering diabaikan server. Pakai parameter query.');
          var media = { schema: body(e.body.node, pascal(opId) + 'Request') }, sample = null; try { sample = JSON.parse(e.body.sample); } catch (x) { /* sudah ditandai */ }
          if (sample !== null) media.example = sample;
          op.requestBody = {};
          if (e.body.desc && e.body.desc.trim()) op.requestBody.description = e.body.desc.trim();
          op.requestBody.required = true; op.requestBody.content = {};
          op.requestBody.content[e.body.type || 'application/json'] = media;
        }
      }

      /* response */
      var rs = {}, seenC = {};
      (e.responses || []).forEach(function (r) {
        var code = String(r.code || '').trim().toUpperCase().replace(/^DEFAULT$/, 'default');
        if (!/^([1-5][0-9]{2}|[1-5]XX|default)$/.test(code)) { issue('error', label + ': kode respons "' + r.code + '" tidak valid. Pakai 200, 404, 2XX, atau default.'); return; }
        if (seenC[code]) { issue('error', label + ': kode respons ' + code + ' ganda.'); return; } seenC[code] = 1;
        var o = { description: (r.desc || '').trim() || STATUS_TEXT[code] || 'Respons' };
        if ((r.sample || '').trim()) {
          if (r.err) issue('error', label + ' (' + code + '): contoh response bukan JSON valid. ' + r.err);
          else if (r.node) {
            if (code === '204') issue('warn', label + ': respons 204 seharusnya tanpa isi.');
            var sm = null; try { sm = JSON.parse(r.sample); } catch (x) { /* sudah ditandai */ }
            var med = { schema: body(r.node, pascal(opId) + 'Response' + (/^2/.test(code) && Object.keys(rs).filter(function (k) { return /^2/.test(k); }).length === 0 ? '' : code), r.shared) }; if (sm !== null) med.example = sm;
            o.content = { 'application/json': med };
          }
        }
        rs[code] = o;
      });
      if (!Object.keys(rs).length) { issue('error', label + ': minimal satu respons wajib (mis. 200).'); rs['200'] = { description: 'Berhasil' }; }
      else if (!Object.keys(rs).some(function (c) { return /^2|default/i.test(c); })) issue('warn', label + ': tidak ada respons sukses (2xx).');
      op.responses = rs;
      if (st.auth !== 'none' && e.auth === false) op.security = [];
      if (!paths[path]) paths[path] = {};
      paths[path][method] = op;
    });
    if (!(st.endpoints || []).length) issue('warn', 'Belum ada endpoint. Tambahkan satu, atau klik "Coba dengan contoh".');
    doc.paths = paths;
    var c = {};
    if (Object.keys(comps).length) c.schemas = comps;
    if (st.auth !== 'none') {
      c.securitySchemes = {};
      if (st.auth === 'bearer') c.securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' };
      if (st.auth === 'basic') c.securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
      if (st.auth === 'apikey') c.securitySchemes.apiKeyAuth = { type: 'apiKey', in: 'header', name: (st.apiKeyName || 'X-API-Key').trim() || 'X-API-Key' };
      var sk = Object.keys(c.securitySchemes)[0], sec = {}; sec[sk] = []; doc.security = [sec];
    }
    if (Object.keys(c).length) doc.components = c;
    if (tagSet.length) doc.tags = tagSet.map(function (t) { return { name: t }; });
    /* urutan kunci tingkat atas yang lazim */
    var order = ['openapi', 'info', 'servers', 'tags', 'paths', 'components', 'security'], out = {};
    order.forEach(function (k) { if (doc[k] !== undefined) out[k] = doc[k]; });
    return { doc: out, issues: issues, ok: !issues.some(function (i) { return i.lv === 'error'; }) };
  }

  /* ---------- YAML ---------- */
  var RESERVED = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
  function ys(s) {
    s = String(s);
    if (s === '') return "''";
    if (/^[A-Za-z_\/][A-Za-z0-9_\-.\/ ]*$/.test(s) && !RESERVED.test(s) && !/\s$/.test(s) && !/: |#/.test(s)) return s;
    return JSON.stringify(s);
  }
  function yscalar(v) { return v === null ? 'null' : typeof v === 'string' ? ys(v) : String(v); }
  function toYaml(v, ind) {
    ind = ind || 0; var pad = new Array(ind + 1).join(' '), lines = [];
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      v.forEach(function (e) {
        if (e && typeof e === 'object' && (Array.isArray(e) ? e.length : Object.keys(e).length)) { var sub = toYaml(e, ind + 2).split('\n'); lines.push(pad + '- ' + sub[0].trim()); sub.slice(1).forEach(function (l) { lines.push(l); }); }
        else lines.push(pad + '- ' + (Array.isArray(e) ? '[]' : e && typeof e === 'object' ? '{}' : yscalar(e)));
      });
      return lines.join('\n');
    }
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    keys.forEach(function (k) {
      var x = v[k], kk = /^[A-Za-z_$][A-Za-z0-9_$\-]*$/.test(k) && !RESERVED.test(k) ? k : JSON.stringify(k);
      if (x && typeof x === 'object' && (Array.isArray(x) ? x.length : Object.keys(x).length)) {
        if (Array.isArray(x)) lines.push(pad + kk + ':\n' + toYaml(x, ind + 2)); else lines.push(pad + kk + ':\n' + toYaml(x, ind + 2));
      } else lines.push(pad + kk + ': ' + (Array.isArray(x) ? '[]' : x && typeof x === 'object' ? '{}' : yscalar(x)));
    });
    return lines.join('\n');
  }

  /* ---------- contoh bawaan ---------- */
  function example() {
    var st = defaults();
    st.info = { title: 'API Pengguna', version: '1.0.0', description: 'Contoh API untuk mengelola data pengguna.' };
    st.servers = [{ url: 'https://api.contoh.id/v1', description: 'Produksi' }, { url: 'https://staging.contoh.id/v1', description: 'Staging' }];
    st.errors = false;
    var list = newEndpoint('get', '/users'); list.summary = 'Daftar pengguna'; list.tag = 'Pengguna';
    list.params = [{ name: 'page', in: 'query', type: 'integer', required: false, description: 'Nomor halaman', example: '1' }, { name: 'q', in: 'query', type: 'string', required: false, description: 'Kata kunci nama atau email', example: 'ani' }];
    list.responses = [newResponse('200', '{\n  "data": [\n    { "id": 101, "name": "Ani", "email": "ani@contoh.id", "role": "admin", "created_at": "2026-01-15T08:30:00Z", "phone": null }\n  ],\n  "page": 1,\n  "total": 1\n}'), errorResponse('401')];
    var create = newEndpoint('post', '/users'); create.summary = 'Buat pengguna'; create.tag = 'Pengguna';
    create.body = { on: true, type: 'application/json', desc: 'Data pengguna baru', sample: '{\n  "name": "Budi",\n  "email": "budi@contoh.id",\n  "role": "user",\n  "phone": "0812345678"\n}', node: null, err: '' };
    create.responses = [newResponse('201', '{\n  "id": 102,\n  "name": "Budi",\n  "email": "budi@contoh.id",\n  "role": "user",\n  "created_at": "2026-02-01T10:00:00Z"\n}'), errorResponse('400'), errorResponse('401')];
    var get = newEndpoint('get', '/users/{id}'); get.summary = 'Detail pengguna'; get.tag = 'Pengguna';
    get.params = [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'ID pengguna', example: '101' }];
    get.responses = [newResponse('200', '{\n  "id": 101,\n  "name": "Ani",\n  "email": "ani@contoh.id",\n  "role": "admin",\n  "created_at": "2026-01-15T08:30:00Z",\n  "phone": null\n}'), errorResponse('404')];
    var del = newEndpoint('delete', '/users/{id}'); del.summary = 'Hapus pengguna'; del.tag = 'Pengguna';
    del.params = [{ name: 'id', in: 'path', type: 'integer', required: true, description: 'ID pengguna', example: '101' }];
    del.responses = [newResponse('204', ''), errorResponse('404')];
    var login = newEndpoint('post', '/auth/login'); login.summary = 'Masuk dan ambil token'; login.tag = 'Autentikasi'; login.auth = false;
    login.body = { on: true, type: 'application/json', desc: '', sample: '{\n  "email": "ani@contoh.id",\n  "password": "rahasia123"\n}', node: null, err: '' };
    login.responses = [newResponse('200', '{\n  "token": "eyJhbGciOiJIUzI1NiJ9.contoh.tanda",\n  "expires_in": 3600\n}'), errorResponse('401')];
    st.endpoints = [list, create, get, del, login];
    return st;
  }

  var API = { VERSIONS: VERSIONS, METHODS: METHODS, TYPES: TYPES, STATUS_TEXT: STATUS_TEXT, ERROR_SAMPLE: ERROR_SAMPLE, defaults: defaults, newEndpoint: newEndpoint, newResponse: newResponse, errorResponse: errorResponse, infer: infer, carry: carry,
    schemaOf: schemaOf, build: build, toYaml: toYaml, example: example, pathParams: pathParams, camel: camel, pascal: pascal };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.APIDOC = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
