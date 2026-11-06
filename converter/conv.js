/* Inti Konverter: semua format dibaca menjadi satu nilai JS lalu ditulis ke format tujuan.
   Format: json, table, object, serialize, array, csv, excel. Tanpa DOM, bisa dites di Node. */
(function (root) {
  'use strict';

  function mk() { return Object.create(null); } // objek tanpa prototype: key "__proto__" aman
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function fail(msg) { throw new Error(msg); }

  /* ---------- JSON ---------- */
  function parseJson(s) {
    try { return JSON.parse(s); } catch (e) { return fail('JSON tidak valid: ' + e.message); }
  }
  function emitJson(v, o) { return JSON.stringify(v, null, o && o.minify ? 0 : 2); }

  /* ---------- PHP serialize ---------- */
  function parseSerialize(text) {
    var b = new TextEncoder().encode(text.trim()), dec = new TextDecoder('utf-8'), p = 0;
    function err(m) { fail('serialize tidak valid di byte ' + p + ': ' + m); }
    function until(ch) {
      var s = p; while (p < b.length && b[p] !== ch) p++;
      if (p >= b.length) err('tidak menemukan "' + String.fromCharCode(ch) + '"');
      var r = dec.decode(b.subarray(s, p)); p++; return r;
    }
    function expect(ch) { if (b[p] !== ch.charCodeAt(0)) err('seharusnya "' + ch + '"'); p++; }
    function str() { // setelah "s:" atau "O:": len:"...":
      var n = parseInt(until(58), 10); expect('"');
      if (!(n >= 0) || p + n > b.length || b[p + n] !== 34) err('panjang string ' + n + ' tidak cocok dengan isinya');
      var r = dec.decode(b.subarray(p, p + n)); p += n + 1; return r;
    }
    function val() {
      var t = String.fromCharCode(b[p]); if (b[p] === undefined) err('data berhenti mendadak');
      if (t === 'N') { p++; expect(';'); return null; }
      p++; expect(':');
      if (t === 'b') return until(59) === '1';
      if (t === 'i') { var i = Number(until(59)); if (isNaN(i)) err('angka bulat salah'); return i; }
      if (t === 'd') { var d = until(59); return d === 'INF' ? Infinity : d === '-INF' ? -Infinity : d === 'NAN' ? NaN : Number(d); }
      if (t === 's') { var s = str(); expect(';'); return s; }
      if (t === 'a' || t === 'O') {
        var cls = null;
        if (t === 'O') { cls = str(); expect(':'); }
        var n = parseInt(until(58), 10); expect('{');
        var keys = [], vals = [];
        for (var k = 0; k < n; k++) { keys.push(val()); vals.push(val()); }
        expect('}');
        return build(keys, vals, t === 'O');
      }
      return err('tipe "' + t + '" belum didukung (referensi r/R atau objek custom)');
    }
    function build(keys, vals, isObject) {
      var seq = !isObject && keys.every(function (k, i) { return k === i; });
      if (seq) return vals;
      var o = mk();
      keys.forEach(function (k, i) { o[String(k).replace(/^\0[^\0]*\0/, '')] = vals[i]; }); // buang awalan private/protected
      return o;
    }
    var r = val();
    if (p < b.length) err('masih ada sisa data setelah nilai selesai');
    return r;
  }

  function emitSerialize(v) {
    var enc = new TextEncoder();
    function s(x) { return 's:' + enc.encode(x).length + ':"' + x + '";'; }
    function w(x) {
      if (x === null || x === undefined) return 'N;';
      if (typeof x === 'boolean') return 'b:' + (x ? 1 : 0) + ';';
      if (typeof x === 'number') {
        if (Number.isInteger(x) && Math.abs(x) <= 9007199254740991) return 'i:' + x + ';';
        return 'd:' + (isNaN(x) ? 'NAN' : x === Infinity ? 'INF' : x === -Infinity ? '-INF' : String(x)) + ';';
      }
      if (typeof x === 'string') return s(x);
      if (Array.isArray(x)) return 'a:' + x.length + ':{' + x.map(function (e, i) { return 'i:' + i + ';' + w(e); }).join('') + '}';
      var ks = Object.keys(x);
      return 'a:' + ks.length + ':{' + ks.map(function (k) { return (/^(0|-?[1-9]\d{0,14})$/.test(k) ? 'i:' + k + ';' : s(k)) + w(x[k]); }).join('') + '}';
    }
    return w(v);
  }

  /* ---------- PHP array / object (kode sumber) ---------- */
  function parsePhp(src) {
    var p = 0, n = src.length;
    function err(m) { fail('PHP tidak valid di karakter ' + p + ': ' + m); }
    function ws() {
      for (;;) {
        while (p < n && /\s/.test(src[p])) p++;
        if (src.startsWith('//', p) || src[p] === '#') { while (p < n && src[p] !== '\n') p++; }
        else if (src.startsWith('/*', p)) { var e = src.indexOf('*/', p + 2); p = e < 0 ? n : e + 2; }
        else return;
      }
    }
    function word() { var m = /^[A-Za-z_\\][A-Za-z0-9_\\]*(::[A-Za-z_]\w*)?/.exec(src.slice(p, p + 80)); return m ? m[0] : ''; }
    function sq() { // '...'
      var out = ''; p++;
      while (p < n && src[p] !== "'") { if (src[p] === '\\' && (src[p + 1] === "'" || src[p + 1] === '\\')) p++; out += src[p++]; }
      if (p >= n) err("string ' tidak ditutup"); p++; return out;
    }
    function dq() { // "..." tanpa interpolasi variabel
      var out = '', m = { n: '\n', r: '\r', t: '\t', v: '\v', e: '\x1b', f: '\f', '\\': '\\', '$': '$', '"': '"' }; p++;
      while (p < n && src[p] !== '"') {
        if (src[p] === '\\') {
          var c = src[p + 1], h;
          if (c in m) { out += m[c]; p += 2; }
          else if (c === 'x' && (h = /^[0-9a-fA-F]{1,2}/.exec(src.slice(p + 2, p + 4)))) { out += String.fromCharCode(parseInt(h[0], 16)); p += 2 + h[0].length; }
          else if (c === 'u' && src[p + 2] === '{' && (h = /^\{([0-9a-fA-F]+)\}/.exec(src.slice(p + 2, p + 14)))) { out += String.fromCodePoint(parseInt(h[1], 16)); p += 2 + h[0].length; }
          else { out += '\\'; p++; }
        } else out += src[p++];
      }
      if (p >= n) err('string " tidak ditutup'); p++; return out;
    }
    function items(close) {
      var keys = [], vals = [], next = 0;
      for (;;) {
        ws();
        if (src[p] === close) { p++; break; }
        if (p >= n) err('tanda "' + close + '" tidak ditemukan');
        var a = val(), k = null;
        ws();
        if (src.startsWith('=>', p)) { p += 2; k = a; a = val(); ws(); }
        if (k === null) k = next;
        if (typeof k === 'boolean') k = k ? 1 : 0;
        if (typeof k === 'string' && /^(0|-?[1-9]\d*)$/.test(k)) k = Number(k);
        if (typeof k === 'number' && Number.isInteger(k) && k >= next) next = k + 1;
        keys.push(k); vals.push(a);
        if (src[p] === ',') p++; else if (src[p] !== close) err(p >= n ? 'tanda "' + close + '" tidak ditemukan' : 'seharusnya "," atau "' + close + '"');
      }
      if (keys.every(function (k, i) { return k === i; })) return vals;
      var o = mk(); keys.forEach(function (k, i) { o[String(k)] = vals[i]; }); return o;
    }
    function val() {
      ws();
      var c = src[p], w;
      if (c === undefined) err('data berhenti mendadak');
      if (c === '[') { p++; return items(']'); }
      if (c === "'") return sq();
      if (c === '"') return dq();
      if (c === '(') { // cast (object) / (array)
        var m = /^\(\s*(object|array)\s*\)/i.exec(src.slice(p, p + 20));
        if (m) { p += m[0].length; return val(); }
        err('tanda "(" tidak dikenal');
      }
      var num = /^[+-]?(0[xX][0-9a-fA-F]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?)/.exec(src.slice(p, p + 40));
      if (num && /[\d.+-]/.test(c)) { p += num[0].length; return Number(num[0].replace(/_/g, '')); }
      w = word();
      if (!w) err('token tidak dikenal "' + c + '"');
      var lw = w.toLowerCase();
      if (lw === 'true') { p += 4; return true; }
      if (lw === 'false') { p += 5; return false; }
      if (lw === 'null') { p += 4; return null; }
      if (lw === 'array') { p += 5; ws(); if (src[p] !== '(') err('seharusnya "("'); p++; return items(')'); }
      if (/::__set_state$/i.test(lw)) { p += w.length; ws(); if (src[p] !== '(') err('seharusnya "("'); p++; var r = val(); ws(); if (src[p] === ')') p++; return r; }
      return err('kata "' + w + '" tidak didukung');
    }
    src = src.replace(/^\s*<\?php/i, ''); n = src.length;
    ws();
    var m0 = /^return\b/i.exec(src.slice(p, p + 7)); if (m0) p += m0[0].length;
    ws();
    if (src[p] === '$') { var asg = /^\$[A-Za-z_][A-Za-z0-9_]*\s*=/.exec(src.slice(p, p + 80)); if (!asg) err('variabel tanpa "="'); p += asg[0].length; }
    var r = val(); ws();
    if (src[p] === ';') { p++; ws(); }
    if (src.startsWith('?>', p)) p = n;
    if (p < n) err('masih ada sisa kode setelah nilai selesai');
    return r;
  }

  function phpStr(s) {
    if (/[\x00-\x1f\x7f]/.test(s)) {
      return '"' + s.replace(/[\\"$]/g, '\\$&').replace(/[\x00-\x1f\x7f]/g, function (c) {
        return { '\n': '\\n', '\r': '\\r', '\t': '\\t' }[c] || '\\x' + ('0' + c.charCodeAt(0).toString(16)).slice(-2);
      }) + '"';
    }
    return "'" + s.replace(/[\\']/g, '\\$&') + "'";
  }
  function emitPhp(v, o) {
    var asObject = !!(o && o.asObject);
    function w(x, ind) {
      if (x === null || x === undefined) return 'null';
      if (typeof x === 'boolean') return x ? 'true' : 'false';
      if (typeof x === 'number') return isFinite(x) ? String(x) : isNaN(x) ? 'NAN' : x > 0 ? 'INF' : '-INF';
      if (typeof x === 'string') return phpStr(x);
      var pad = ind + '    ', list = Array.isArray(x), ks = list ? x : Object.keys(x), pre = !list && asObject ? '(object) ' : '';
      if (!ks.length) return pre + '[]';
      return pre + '[\n' + ks.map(function (e, i) { return pad + (list ? w(e, pad) : phpStr(e) + ' => ' + w(x[e], pad)) + ','; }).join('\n') + '\n' + ind + ']';
    }
    return w(v, '');
  }

  /* ---------- CSV / TSV ---------- */
  function guessDelim(text) {
    var line = text.split(/\r?\n/, 1)[0], best = ',', max = 0;
    [',', ';', '\t'].forEach(function (d) {
      var c = 0, q = false;
      for (var i = 0; i < line.length; i++) { if (line[i] === '"') q = !q; else if (!q && line[i] === d) c++; }
      if (c > max) { max = c; best = d; }
    });
    return best;
  }
  function parseRows(text, delim) {
    text = text.replace(/^\uFEFF/, '');
    var rows = [], row = [], f = '', q = false, i = 0, n = text.length, started = false;
    for (; i < n; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
      } else if (c === '"' && f === '') { q = true; started = true; }
      else if (c === delim) { row.push(f); f = ''; started = true; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = ''; started = false;
      } else { f += c; started = true; }
    }
    if (q) fail('CSV tidak valid: tanda kutip tidak ditutup');
    if (started || f !== '' || row.length) { row.push(f); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(function (x) { return x === ''; })) rows.pop();
    return rows;
  }
  function cast(s) {
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s) && s.replace(/^-|\..*|[eE].*/g, '').length <= 15) return Number(s);
    return s;
  }
  /* opsi: delim ('auto' | ',' | ';' | '\t'), header (bool), types (bool) */
  function parseTable(text, o) {
    o = o || {};
    var d = o.delim && o.delim !== 'auto' ? o.delim : guessDelim(text), rows = parseRows(text, d);
    if (o.types) rows = rows.map(function (r) { return r.map(cast); });
    if (!o.header) return rows;
    if (!rows.length) return [];
    var seen = {}, head = rows[0].map(function (h, i) {
      var name = String(h) === '' ? 'kolom ' + (i + 1) : String(h), base = name, k = 2;
      while (seen[name]) name = base + '_' + k++;
      seen[name] = 1; return name;
    });
    return rows.slice(1).map(function (r) {
      var ob = mk();
      r.forEach(function (x, i) { ob[i < head.length ? head[i] : 'kolom ' + (i + 1)] = x; });
      head.forEach(function (h) { if (!(h in ob)) ob[h] = ''; });
      return ob;
    });
  }

  /* nilai -> { head: [..] | null, rows: [[..]] }; sel berisi skalar, struktur bersarang jadi teks JSON */
  function cell(x) { return x !== null && typeof x === 'object' ? JSON.stringify(x) : x === undefined ? null : x; }
  function toRows(v) {
    if (Array.isArray(v)) {
      if (v.length && v.every(isObj)) {
        var head = [];
        v.forEach(function (o) { Object.keys(o).forEach(function (k) { if (head.indexOf(k) < 0) head.push(k); }); });
        return { head: head, rows: v.map(function (o) { return head.map(function (k) { return k in o ? cell(o[k]) : null; }); }) };
      }
      if (v.length && v.every(Array.isArray)) return { head: null, rows: v.map(function (r) { return r.map(cell); }) };
      return { head: ['nilai'], rows: v.map(function (x) { return [cell(x)]; }) };
    }
    if (isObj(v)) return { head: ['kunci', 'nilai'], rows: Object.keys(v).map(function (k) { return [k, cell(v[k])]; }) };
    return { head: ['nilai'], rows: [[cell(v)]] };
  }
  function str(x) { return x === null ? '' : String(x); }
  function emitCsv(v, o) {
    var d = (o && o.delim) || ',', t = toRows(v), all = t.head ? [t.head].concat(t.rows) : t.rows;
    return all.map(function (r) {
      return r.map(function (x) {
        var s = str(x);
        return s.indexOf(d) >= 0 || /["\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(d);
    }).join('\n');
  }

  /* ---------- Excel (.xlsx) ---------- */
  var T = null;
  function crc32(u8) {
    if (!T) { T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = T[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) { // tanpa kompresi; cukup untuk xlsx
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data), size = data.length;
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, data);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name); offset += 30 + name.length + size;
    });
    var csize = 0; central.forEach(function (c) { csize += c.byteLength || c.length; });
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function colName(i) { var s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }
  function xml(s) { return String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function emitXlsx(v) {
    var t = toRows(v), all = t.head ? [t.head].concat(t.rows) : t.rows;
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      all.map(function (r, ri) {
        return '<row r="' + (ri + 1) + '">' + r.map(function (x, ci) {
          var ref = colName(ci) + (ri + 1);
          if (x === null || x === '') return '';
          if (typeof x === 'number' && isFinite(x)) return '<c r="' + ref + '"><v>' + x + '</v></c>';
          if (typeof x === 'boolean') return '<c r="' + ref + '" t="b"><v>' + (x ? 1 : 0) + '</v></c>';
          return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xml(x) + '</t></is></c>';
        }).join('') + '</row>';
      }).join('') + '</sheetData></worksheet>';
    var H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zipStore([
      { name: '[Content_Types].xml', text: H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: '_rels/.rels', text: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: H + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/worksheets/sheet1.xml', text: sheet }
    ]);
  }

  /* baca .xlsx (ArrayBuffer) -> baris teks; sheet pertama saja. Butuh DecompressionStream (browser modern). */
  async function readXlsx(buf) {
    var u = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder('utf-8'), e = u.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) fail('Bukan berkas .xlsx yang valid');
    var count = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), ents = {};
    for (var i = 0; i < count; i++) {
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      ents[dec.decode(u.subarray(p + 46, p + 46 + nl))] = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    async function read(name) {
      var en = ents[name]; if (!en) return null;
      var o = en.off, start = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true), data = u.subarray(start, start + en.csize);
      if (en.method === 0) return dec.decode(data);
      if (en.method !== 8) fail('Metode kompresi xlsx tidak didukung');
      if (typeof DecompressionStream === 'undefined') fail('Browser ini belum bisa membuka .xlsx; simpan sebagai CSV dulu');
      var ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(ds).arrayBuffer());
    }
    var sheetName = Object.keys(ents).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); }).sort(function (a, b) { return parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10); })[0];
    if (!sheetName) fail('Sheet tidak ditemukan di berkas xlsx');
    var parse = function (s) { return new DOMParser().parseFromString(s, 'application/xml'); };
    var NS = '*', shared = [], ss = await read('xl/sharedStrings.xml');
    if (ss) Array.prototype.forEach.call(parse(ss).getElementsByTagNameNS(NS, 'si'), function (si) {
      shared.push(Array.prototype.map.call(si.getElementsByTagNameNS(NS, 't'), function (t) { return t.textContent; }).join(''));
    });
    var rows = [];
    Array.prototype.forEach.call(parse(await read(sheetName)).getElementsByTagNameNS(NS, 'row'), function (r) {
      var ri = Number(r.getAttribute('r')) - 1, arr = [], auto = 0;
      Array.prototype.forEach.call(r.getElementsByTagNameNS(NS, 'c'), function (c) {
        var ref = c.getAttribute('r'), ci = auto;
        if (ref) { var m = /^[A-Z]+/.exec(ref)[0]; ci = 0; for (var k = 0; k < m.length; k++) ci = ci * 26 + m.charCodeAt(k) - 64; ci--; }
        auto = ci + 1;
        var t = c.getAttribute('t'), vEl = c.getElementsByTagNameNS(NS, 'v')[0], v = vEl ? vEl.textContent : '';
        if (t === 's') v = shared[Number(v)] || '';
        else if (t === 'inlineStr') v = Array.prototype.map.call(c.getElementsByTagNameNS(NS, 't'), function (x) { return x.textContent; }).join('');
        else if (t === 'b') v = v === '1' ? 'true' : 'false';
        arr[ci] = v;
      });
      for (var j = 0; j < arr.length; j++) if (arr[j] === undefined) arr[j] = '';
      rows[ri >= 0 ? ri : rows.length] = arr;
    });
    for (var j = 0; j < rows.length; j++) if (!rows[j]) rows[j] = [];
    return rows;
  }
  function rowsToTsv(rows) { return emitCsv(rows, { delim: '\t' }); }

  /* ---------- registri ---------- */
  var FORMATS = {
    json: { label: 'JSON' },
    table: { label: 'Tabel (UI)' },
    object: { label: 'Object PHP (stdClass)' },
    serialize: { label: 'Serialize PHP' },
    array: { label: 'Array PHP' },
    csv: { label: 'CSV' },
    excel: { label: 'Excel (.xlsx)' }
  };
  /* sumber: tabel dan excel dibaca sebagai tempelan dari Excel/Sheets (dipisah tab) */
  function parse(fmt, text, o) {
    o = o || {};
    if (!String(text).trim()) fail('Isi dulu data sumbernya');
    switch (fmt) {
      case 'json': return parseJson(text);
      case 'serialize': return parseSerialize(text);
      case 'array': case 'object': return parsePhp(text);
      case 'csv': return parseTable(text, o);
      default: return parseTable(text, { delim: '\t', header: o.header, types: o.types });
    }
  }
  /* tujuan teks: json, array, object, serialize, csv. Tabel dan excel dikerjakan UI lewat toRows / emitXlsx. */
  function emit(fmt, v, o) {
    switch (fmt) {
      case 'json': return emitJson(v, o);
      case 'serialize': return emitSerialize(v);
      case 'array': return emitPhp(v, { asObject: false });
      case 'object': return emitPhp(v, { asObject: true });
      case 'csv': return emitCsv(v, o);
      default: return fail('Format teks tidak dikenal: ' + fmt);
    }
  }

  var API = { FORMATS: FORMATS, parse: parse, emit: emit, toRows: toRows, emitXlsx: emitXlsx, readXlsx: readXlsx, rowsToTsv: rowsToTsv, parseSerialize: parseSerialize, emitSerialize: emitSerialize, parsePhp: parsePhp, emitPhp: emitPhp, parseTable: parseTable, emitCsv: emitCsv, emitJson: emitJson };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Conv = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
