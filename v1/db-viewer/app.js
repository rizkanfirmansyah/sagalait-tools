/* Database viewer: hanya melihat data. Tanpa koneksi, tanpa eksekusi SQL. */

/*CORE-START*/
// Inti parser. Tidak menyentuh DOM, dijalankan di Web Worker (Blob URL) atau, bila Worker tidak ada, di halaman.
function parserCore() {
  'use strict';
  var now = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };

  function fail(msg) { var e = new Error(msg); e.user = true; throw e; }
  function lineOf(t, pos) {
    var n = 1;
    for (var i = t.indexOf('\n'); i !== -1 && i < pos; i = t.indexOf('\n', i + 1)) n++;
    return n;
  }
  function firstLine(t) {
    var m = /\S[^\r\n]*/.exec(t.slice(0, 20000));
    var s = m ? m[0] : '';
    return s.length > 80 ? s.slice(0, 80) + '...' : s;
  }

  function decode(bytes, enc) {
    if (enc === 'latin1') {
      var out = [], CH = 16384;
      for (var i = 0; i < bytes.length; i += CH) out.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
      return out.join('');
    }
    return new TextDecoder(enc === 'windows-1252' ? 'windows-1252' : 'utf-8').decode(bytes);
  }

  /* ---------- tipe kolom ---------- */
  var NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  var DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[-+]\d{2}:?\d{2})?)?$/;
  function colType(rows, c) {
    var cnt = 0, num = true, date = true, json = true, jsonChecked = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][c];
      if (v === null || v === '') continue;
      cnt++;
      if (num && !NUM.test(v)) num = false;
      if (date && !DATE.test(v)) date = false;
      if (json) {
        var f = v.charCodeAt(0);
        if (f !== 123 && f !== 91) json = false;
        else if (jsonChecked < 60) { jsonChecked++; try { JSON.parse(v); } catch (e) { json = false; } }
      }
      if (!num && !date && !json) return 'teks';
    }
    if (!cnt) {
      for (var j = 0; j < rows.length; j++) if (rows[j][c] === '') return 'teks';
      return 'NULL semua';
    }
    return num ? 'angka' : date ? 'tanggal' : json ? 'JSON' : 'teks';
  }

  function uniqNames(names) {
    var seen = Object.create(null);
    return names.map(function (nm, k) {
      var s = String(nm == null ? '' : nm).trim();
      if (!s) s = 'kolom ' + (k + 1);
      var base = s, n = 1;
      while (seen[s]) { n++; s = base + '_' + n; }
      seen[s] = 1;
      return s;
    });
  }

  /* ---------- CSV ---------- */
  function parseCsv(t, d, maxRecs, prog) {
    var n = t.length, i = 0, rows = [], dc = d.charCodeAt(0), bad = 0, nextProg = 0;
    while (i < n) {
      var row = [];
      for (;;) {
        var v, k, c;
        if (t.charCodeAt(i) === 34) {
          i++;
          var s = '';
          for (;;) {
            var j = t.indexOf('"', i);
            if (j === -1) { s += t.slice(i); i = n; bad++; break; }
            s += t.slice(i, j);
            if (t.charCodeAt(j + 1) === 34) { s += '"'; i = j + 2; } else { i = j + 1; break; }
          }
          k = i;
          while (k < n && (c = t.charCodeAt(k)) !== dc && c !== 10 && c !== 13) k++;
          if (k > i) s += t.slice(i, k);
          i = k; v = s;
        } else {
          k = i;
          while (k < n && (c = t.charCodeAt(k)) !== dc && c !== 10 && c !== 13) k++;
          v = t.slice(i, k); i = k;
        }
        row.push(v);
        if (i < n && t.charCodeAt(i) === dc) { i++; if (i >= n) { row.push(''); break; } continue; }
        break;
      }
      if (t.charCodeAt(i) === 13) i++;
      if (t.charCodeAt(i) === 10) i++;
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      if (maxRecs && rows.length >= maxRecs) break;
      if (prog && rows.length >= nextProg) { nextProg = rows.length + 5000; prog(i / n); }
    }
    return { rows: rows, bad: bad };
  }
  function detectDelim(t) {
    var sample = t.slice(0, 65536), best = ',', bs = 0;
    [',', ';', '\t', '|'].forEach(function (d) {
      var r = parseCsv(sample, d, 20, null).rows;
      if (!r.length) return;
      var n0 = r[0].length, cons = 0;
      r.forEach(function (row) { if (row.length === n0) cons++; });
      var sc = n0 > 1 ? cons * 100 + n0 : 0;
      if (sc > bs) { bs = sc; best = d; }
    });
    return best;
  }
  function csvTable(t, d, header, name, prog, notes) {
    var r = parseCsv(t, d, 0, prog), rows = r.rows;
    if (r.bad) notes.push('Ada tanda kutip ganda yang tidak ditutup. Sisa teks dibaca sebagai satu nilai; periksa kutip di data.');
    var cols = header ? (rows.shift() || []) : [];
    var w = cols.length, short = 0, long = 0, i;
    for (i = 0; i < rows.length; i++) if (rows[i].length > w) w = rows[i].length;
    for (i = 0; i < rows.length; i++) {
      var L = rows[i].length;
      if (L < w) { if (L < cols.length) short++; while (rows[i].length < w) rows[i].push(''); }
      else if (L > cols.length && header) long++;
    }
    var names = [];
    for (i = 0; i < w; i++) names.push(i < cols.length ? cols[i] : '');
    if (short || long) notes.push('Jumlah kolom tidak seragam: ' + short + ' baris lebih pendek dari judul (diisi kosong), ' + long + ' baris lebih panjang (kolom tambahan diberi nama "kolom N").');
    return { name: name, cols: uniqNames(names), rows: rows };
  }

  /* ---------- JSON dan JSON Lines ---------- */
  function jsonPos(text, e) {
    var m = /line (\d+) column (\d+)/.exec(e.message), p;
    if (m) return { line: +m[1], col: +m[2] };
    m = /position (\d+)/.exec(e.message);
    if (m) {
      p = +m[1];
      var before = text.slice(0, p), ln = before.split('\n').length;
      return { line: ln, col: p - before.lastIndexOf('\n') };
    }
    p = jsonFailAt(text);
    if (p >= 0) {
      var b2 = text.slice(0, p);
      return { line: b2.split('\n').length, col: p - b2.lastIndexOf('\n') };
    }
    return null;
  }
  // Mesin JSON baru tidak menyebut posisi, jadi posisi dicari sendiri (hanya dipanggil saat JSON gagal).
  function jsonFailAt(text) {
    var i = 0, n = text.length, NUMR = /-?\d+(\.\d+)?([eE][-+]?\d+)?|true|false|null/y;
    function ws() { while (i < n && ' \t\n\r'.indexOf(text.charAt(i)) >= 0) i++; }
    function str() {
      i++;
      while (i < n) {
        var c = text.charAt(i);
        if (c === '"') { i++; return true; }
        if (c === '\\') i += 2; else if (c < ' ') return false; else i++;
      }
      return false;
    }
    function val() {
      ws();
      var c = text.charAt(i);
      if (c === '{') {
        i++; ws();
        if (text.charAt(i) === '}') { i++; return true; }
        for (;;) {
          ws();
          if (text.charAt(i) !== '"' || !str()) return false;
          ws();
          if (text.charAt(i) !== ':') return false;
          i++;
          if (!val()) return false;
          ws();
          if (text.charAt(i) === ',') { i++; continue; }
          if (text.charAt(i) === '}') { i++; return true; }
          return false;
        }
      }
      if (c === '[') {
        i++; ws();
        if (text.charAt(i) === ']') { i++; return true; }
        for (;;) {
          if (!val()) return false;
          ws();
          if (text.charAt(i) === ',') { i++; continue; }
          if (text.charAt(i) === ']') { i++; return true; }
          return false;
        }
      }
      if (c === '"') return str();
      NUMR.lastIndex = i;
      if (NUMR.exec(text)) { i = NUMR.lastIndex; return true; }
      return false;
    }
    if (!val()) return Math.min(i, n);
    ws();
    return i < n ? i : -1;
  }
  function jsonLines(text) {
    var lines = text.split(/\r?\n/), out = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try { out.push(JSON.parse(lines[i])); } catch (e) { return { bad: i + 1, msg: e.message }; }
    }
    return { items: out };
  }
  function findArray(o, depth) {
    var keys = Object.keys(o), best = null, k, v;
    for (var a = 0; a < keys.length; a++) {
      k = keys[a]; v = o[k];
      if (Array.isArray(v) && (!best || v.length > best.arr.length)) best = { arr: v, path: k, many: !!best };
      else if (Array.isArray(v) && best) best.many = true;
    }
    if (best) return best;
    if (depth < 2) {
      for (var b = 0; b < keys.length; b++) {
        v = o[keys[b]];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          var f = findArray(v, depth + 1);
          if (f) { f.path = keys[b] + '.' + f.path; return f; }
        }
      }
    }
    return null;
  }
  function jcell(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  }
  function jsonTable(text, name, notes) {
    var data, kind = 'JSON';
    try { data = JSON.parse(text); }
    catch (e) {
      var jl = jsonLines(text);
      if (jl.items && jl.items.length > 1) { data = jl.items; kind = 'JSON Lines'; }
      else {
        var p = jsonPos(text, e);
        var msg = 'Bukan JSON yang valid' + (p ? ' (baris ' + p.line + ', kolom ' + p.col + ')' : '') + ': ' + e.message + '.';
        if (jl.bad) msg += ' Sebagai JSON Lines, baris ' + jl.bad + ' juga gagal.';
        fail(msg + ' Format yang dicoba: JSON dan JSON Lines. Periksa koma, kurung, dan tanda kutip di sekitar baris itu.');
      }
    }
    var arr;
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === 'object') {
      var f = findArray(data, 0);
      if (f) {
        arr = f.arr;
        notes.push('Memakai array pada "' + f.path + '".' + (f.many ? ' Ada beberapa array; yang terpanjang dipakai.' : ''));
      } else arr = [data];
    } else arr = [data];
    var cols = [], idx = Object.create(null), rows = [], i, j, k;
    for (i = 0; i < arr.length; i++) {
      var it = arr[i], row = [];
      if (it && typeof it === 'object' && !Array.isArray(it)) {
        var ks = Object.keys(it);
        for (j = 0; j < ks.length; j++) {
          k = ks[j];
          if (idx[k] === undefined) { idx[k] = cols.length; cols.push(k); }
          row[idx[k]] = jcell(it[k]);
        }
      } else if (Array.isArray(it)) {
        for (j = 0; j < it.length; j++) {
          k = 'kolom ' + (j + 1);
          if (idx[k] === undefined) { idx[k] = cols.length; cols.push(k); }
          row[idx[k]] = jcell(it[j]);
        }
      } else {
        if (idx['nilai'] === undefined) { idx['nilai'] = cols.length; cols.push('nilai'); }
        row[idx['nilai']] = jcell(it);
      }
      rows.push(row);
    }
    for (i = 0; i < rows.length; i++) for (j = 0; j < cols.length; j++) if (rows[i][j] === undefined) rows[i][j] = null;
    notes.push('Bilangan besar di JSON dibaca sebagai angka biasa; digit di atas 15 angka bisa berubah.');
    return { kind: kind, table: { name: name, cols: cols, rows: rows } };
  }

  /* ---------- dump SQL ---------- */
  function readIdentIn(s, pos) {
    var parts = [], c;
    for (;;) {
      c = s.charAt(pos);
      var name;
      if (c === '`' || c === '"') {
        var end = pos + 1, out = '';
        for (;;) {
          var j = s.indexOf(c, end);
          if (j === -1) return null;
          out += s.slice(end, j);
          if (s.charAt(j + 1) === c) { out += c; end = j + 2; } else { end = j + 1; break; }
        }
        name = out; pos = end;
      } else {
        var m = /[A-Za-z0-9_$\u0080-￿]+/y;
        m.lastIndex = pos;
        var r = m.exec(s);
        if (!r) return null;
        name = r[0]; pos = m.lastIndex;
      }
      parts.push(name);
      if (s.charAt(pos) === '.') { pos++; continue; }
      return { name: parts[parts.length - 1], end: pos };
    }
  }

  function parseSql(t, prog, notes) {
    var n = t.length, i = 0, tables = [], byName = Object.create(null), skipped = Object.create(null), cond = 0, nextProg = 0;
    function failAt(pos, msg) {
      fail('Dump SQL rusak di baris ' + lineOf(t, pos) + ': ' + msg + '. Format yang dicoba: dump SQL. Periksa apakah dump terpotong atau tanda kutip tidak berpasangan.');
    }
    function getTable(name) {
      if (!byName[name]) { byName[name] = { name: name, cols: [], ci: Object.create(null), rows: [], fromCreate: false, mism: 0, extra: 0 }; tables.push(byName[name]); }
      return byName[name];
    }
    function wsEnd(c) { return c !== c || c <= 32; }
    function eol(p) { var e = t.indexOf('\n', p); return e === -1 ? n : e + 1; }
    function ws() {
      for (;;) {
        var c = t.charCodeAt(i);
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xFEFF) i++;
        else if (c === 45 && t.charCodeAt(i + 1) === 45 && wsEnd(t.charCodeAt(i + 2))) i = eol(i);
        else if (c === 35) i = eol(i);
        else if (c === 47 && t.charCodeAt(i + 1) === 42) {
          if (t.charCodeAt(i + 2) === 33) cond++;
          var e = t.indexOf('*/', i + 2);
          i = e === -1 ? n : e + 2;
        } else break;
      }
    }
    function skipQuoted(q) {
      i++;
      for (;;) {
        if (i >= n) return;
        var c = t.charCodeAt(i);
        if (c === 92 && q !== 96) { i += 2; continue; }
        if (c === q) { if (t.charCodeAt(i + 1) === q) { i += 2; continue; } i++; return; }
        i++;
      }
    }
    function skipStmt() {
      for (;;) {
        if (i >= n) return;
        var c = t.charCodeAt(i);
        if (c === 59) { i++; return; }
        if (c === 39 || c === 34 || c === 96) { skipQuoted(c); continue; }
        if (c === 45 && t.charCodeAt(i + 1) === 45 && wsEnd(t.charCodeAt(i + 2))) { i = eol(i); continue; }
        if (c === 35) { i = eol(i); continue; }
        if (c === 47 && t.charCodeAt(i + 1) === 42) { var e = t.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
        i++;
      }
    }
    function readStr(q) {
      var start = i;
      i++;
      var out = '', seg = i, c;
      for (;;) {
        while (i < n && (c = t.charCodeAt(i)) !== q && c !== 92) i++;
        if (i >= n) failAt(start, 'string tidak ditutup');
        if (c === q) {
          if (t.charCodeAt(i + 1) === q) { out += t.slice(seg, i) + String.fromCharCode(q); i += 2; seg = i; continue; }
          out += t.slice(seg, i); i++;
          return out;
        }
        out += t.slice(seg, i);
        var e = t.charAt(i + 1), r;
        if (e === '') failAt(start, 'string tidak ditutup');
        switch (e) {
          case '0': r = '\0'; break;
          case 'b': r = '\b'; break;
          case 'n': r = '\n'; break;
          case 'r': r = '\r'; break;
          case 't': r = '\t'; break;
          case 'Z': r = '\x1a'; break;
          case '%': r = '\\%'; break;
          case '_': r = '\\_'; break;
          default: r = e;
        }
        out += r; i += 2; seg = i;
      }
    }
    var INTRO = /_[A-Za-z0-9]+\s*(?=['"])/y;
    function readValue() {
      var c = t.charCodeAt(i);
      if (c === 39 || c === 34) return readStr(c);
      if (c === 95) {
        INTRO.lastIndex = i;
        if (INTRO.test(t)) { i = INTRO.lastIndex; return readStr(t.charCodeAt(i)); }
      } else if (t.charCodeAt(i + 1) === 39 && (c === 78 || c === 110 || c === 88 || c === 120 || c === 66 || c === 98)) {
        i++;
        var s = readStr(39);
        if (c === 88 || c === 120) return '0x' + s.toUpperCase();
        if (c === 66 || c === 98) return '0b' + s;
        return s;
      }
      var st = i, depth = 0;
      while (i < n) {
        c = t.charCodeAt(i);
        if (c === 40) depth++;
        else if (c === 41) { if (depth === 0) break; depth--; }
        else if (c === 44 && depth === 0) break;
        else if (c === 39 || c === 34 || c === 96) { skipQuoted(c); continue; }
        i++;
      }
      var tok = t.slice(st, i).trim();
      if (tok === '') failAt(st, 'nilai kosong di dalam VALUES');
      return /^null$/i.test(tok) ? null : tok;
    }
    function readIdent() {
      var r = readIdentIn(t, i);
      if (!r) failAt(i, 'nama tabel atau kolom tidak terbaca');
      i = r.end;
      return r.name;
    }

    function parseCreate(start) {
      i = start; skipStmt();
      var s = t.slice(start, i);
      var m = /^\s*CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(s);
      var id = m && readIdentIn(s, m[0].length);
      if (!id) { skipped['CREATE TABLE (tidak terbaca)'] = (skipped['CREATE TABLE (tidak terbaca)'] || 0) + 1; return; }
      var p = id.end;
      while (/\s/.test(s.charAt(p))) p++;
      if (s.charAt(p) !== '(') { skipped['CREATE TABLE tanpa daftar kolom'] = (skipped['CREATE TABLE tanpa daftar kolom'] || 0) + 1; return; }
      p++;
      var items = [], depth = 0, cur = '', q = '', c;
      for (; p < s.length; p++) {
        c = s.charAt(p);
        if (q) {
          cur += c;
          if (c === '\\' && q !== '`') { cur += s.charAt(p + 1); p++; }
          else if (c === q) q = '';
          continue;
        }
        if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
        if (c === '(') depth++;
        if (c === ')') { if (depth === 0) break; depth--; }
        if (c === ',' && depth === 0) { items.push(cur); cur = ''; continue; }
        cur += c;
      }
      if (cur.trim()) items.push(cur);
      var names = [];
      items.forEach(function (it) {
        it = it.replace(/^\s+/, '');
        var f = it.charAt(0), nm;
        if (f === '`' || f === '"') { var r = readIdentIn(it, 0); nm = r && r.name; }
        else if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|FULLTEXT|SPATIAL|CHECK|PERIOD)\b/i.test(it)) nm = null;
        else { var mm = /^[^\s(]+/.exec(it); nm = mm && mm[0]; }
        if (nm) names.push(nm);
      });
      var tb = getTable(id.name);
      if (!tb.rows.length) {
        tb.cols = names; tb.ci = Object.create(null);
        names.forEach(function (x, k) { tb.ci[x] = k; });
        tb.fromCreate = true;
      }
    }

    var INS = /(INSERT|REPLACE)\s+(?:(?:LOW_PRIORITY|DELAYED|HIGH_PRIORITY)\s+)?(?:IGNORE\s+)?(?:INTO\s+)?/iy;
    var VAL = /VALUES?\b/iy;
    function parseInsert() {
      var st = i, tb, listCols = null, map = null;
      INS.lastIndex = i;
      var m = INS.exec(t);
      if (!m) { skipStmt(); return; }
      i = INS.lastIndex;
      tb = getTable(readIdent());
      ws();
      if (t.charCodeAt(i) === 40) {
        i++; listCols = [];
        for (;;) {
          ws(); listCols.push(readIdent()); ws();
          var c = t.charCodeAt(i);
          if (c === 44) { i++; continue; }
          if (c === 41) { i++; break; }
          failAt(i, 'daftar kolom INSERT tidak valid');
        }
        map = listCols.map(function (nm) {
          var k = tb.ci[nm];
          if (k === undefined) { k = tb.cols.length; tb.ci[nm] = k; tb.cols.push(nm); }
          return k;
        });
      }
      ws();
      VAL.lastIndex = i;
      if (!VAL.test(t)) { skipped['INSERT tanpa VALUES (SELECT/SET)'] = (skipped['INSERT tanpa VALUES (SELECT/SET)'] || 0) + 1; i = st; skipStmt(); return; }
      i = VAL.lastIndex;
      for (;;) {
        ws();
        if (t.charCodeAt(i) !== 40) failAt(i, 'setelah VALUES diharapkan tanda "("');
        i++;
        var row = [];
        ws();
        if (t.charCodeAt(i) === 41) i++;
        else {
          for (;;) {
            ws(); row.push(readValue()); ws();
            var d = t.charCodeAt(i);
            if (d === 44) { i++; continue; }
            if (d === 41) { i++; break; }
            failAt(i, 'diharapkan koma atau tanda ")" setelah nilai');
          }
        }
        if (map) {
          var full = new Array(tb.cols.length), z;
          for (z = 0; z < full.length; z++) full[z] = null;
          for (z = 0; z < row.length && z < map.length; z++) full[map[z]] = row[z];
          if (row.length !== map.length) tb.mism++;
          tb.rows.push(full);
        } else {
          if (tb.fromCreate && row.length !== tb.cols.length) tb.mism++;
          while (tb.cols.length < row.length) tb.cols.push('kolom ' + (tb.cols.length + 1));
          tb.rows.push(row);
        }
        if (i >= nextProg) { nextProg = i + 200000; prog(i / n); }
        ws();
        if (t.charCodeAt(i) === 44) { i++; continue; }
        break;
      }
      skipStmt();
    }

    var KW = /([A-Za-z]+)(?:\s+([A-Za-z]+))?/y;
    while (true) {
      ws();
      if (i >= n) break;
      if (t.charCodeAt(i) === 59) { i++; continue; }
      var start = i;
      KW.lastIndex = i;
      var k = KW.exec(t), w1 = k ? k[1].toUpperCase() : '', w2 = k && k[2] ? k[2].toUpperCase() : '';
      if (w1 === 'INSERT' || w1 === 'REPLACE') parseInsert();
      else if (w1 === 'CREATE' && (w2 === 'TABLE' || w2 === 'TEMPORARY')) parseCreate(start);
      else {
        var key = !w1 ? '(lainnya)' : (/^(LOCK|UNLOCK|DROP|ALTER|CREATE)$/.test(w1) && w2 ? w1 + ' ' + w2 : w1);
        skipped[key] = (skipped[key] || 0) + 1;
        skipStmt();
      }
      if (i >= nextProg) { nextProg = i + 200000; prog(i / n); }
    }
    if (!tables.length) fail('Dump SQL: tidak ada CREATE TABLE atau INSERT ... VALUES yang bisa dibaca. Baris pertama masukan: "' + firstLine(t) + '". Format yang dicoba: dump SQL.');
    tables.forEach(function (tb) {
      for (var r = 0; r < tb.rows.length; r++) while (tb.rows[r].length < tb.cols.length) tb.rows[r].push(null);
      if (tb.mism) notes.push('Tabel ' + tb.name + ': ' + tb.mism + ' baris punya jumlah nilai berbeda dari daftar kolom (yang kurang diisi NULL).');
      if (!tb.cols.length) tb.cols = ['kolom 1'];
    });
    var ks = Object.keys(skipped);
    if (ks.length || cond) {
      var parts = ks.map(function (x) { return skipped[x] + ' ' + x; });
      if (cond) parts.push(cond + ' komentar kondisional /*! ... */');
      notes.push('Dilewati karena bukan data: ' + parts.join(', ') + '.');
    }
    return tables.map(function (tb) { return { name: tb.name, cols: tb.cols, rows: tb.rows }; });
  }

  /* ---------- keluaran terminal MySQL ---------- */
  function parseMysql(text, notes) {
    var L = text.split(/\r?\n/), tables = [], i = 0, nv = 'NULL';
    var vert = false;
    for (i = 0; i < L.length; i++) if (/^\*{3,}\s*\d+\. row\s*\*{3,}\s*$/.test(L[i])) { vert = true; break; }
    if (vert) {
      var cols = [], idx = Object.create(null), rows = [], row = null, last = -1, firstRowDone = false;
      var close = function () { if (row) { rows.push(row); firstRowDone = true; } row = null; last = -1; };
      for (i = 0; i < L.length; i++) {
        var ln = L[i];
        if (/^\*{3,}\s*\d+\. row\s*\*{3,}\s*$/.test(ln)) { close(); row = []; continue; }
        if (!row) continue;
        if (/^\d+ rows? in set/i.test(ln) || /^Empty set/i.test(ln)) { close(); break; }
        var m = /^\s*(\S(?:.*?\S)?):(?: (.*))?$/.exec(ln);
        if (m && (!firstRowDone || idx[m[1]] !== undefined)) {
          var key = m[1];
          if (idx[key] === undefined) { idx[key] = cols.length; cols.push(key); }
          last = idx[key];
          row[last] = m[2] === undefined ? '' : m[2];
        } else if (last >= 0) row[last] += '\n' + ln;
      }
      close();
      rows.forEach(function (r) { for (var j = 0; j < cols.length; j++) if (r[j] === undefined || r[j] === nv) r[j] = null; });
      if (!cols.length) fail('Keluaran vertikal (\\G) tidak berisi pasangan "kolom: nilai". Format yang dicoba: keluaran terminal MySQL (vertikal).');
      return [{ name: 'Hasil', cols: cols, rows: rows }];
    }
    var cells = function (line, bounds) {
      var ok = true, out = [], k;
      for (k = 0; k < bounds.length; k++) if (line.charAt(bounds[k]) !== '|') { ok = false; break; }
      if (ok) for (k = 0; k + 1 < bounds.length; k++) out.push(line.slice(bounds[k] + 1, bounds[k + 1]).trim());
      else out = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (x) { return x.trim(); });
      return out;
    };
    i = 0;
    while (i < L.length) {
      if (/^\+[-=+]+\+\s*$/.test(L[i]) && L[i + 1] && L[i + 1].charAt(0) === '|' && /^\+[-=+]+\+\s*$/.test(L[i + 2] || '')) {
        var sep = L[i], bounds = [];
        for (var k = 0; k < sep.length; k++) if (sep.charAt(k) === '+') bounds.push(k);
        var cols2 = cells(L[i + 1], bounds), rows2 = [], j = i + 3;
        while (j < L.length && L[j].charAt(0) === '|') {
          var r = cells(L[j], bounds);
          while (r.length < cols2.length) r.push('');
          rows2.push(r.map(function (x) { return x === nv ? null : x; }));
          j++;
        }
        tables.push({ name: 'Hasil', cols: uniqNames(cols2), rows: rows2 });
        i = j + 1;
      } else i++;
    }
    if (!tables.length) fail('Tabel ASCII MySQL tidak terbaca di baris pertama "' + firstLine(text) + '". Format yang dicoba: keluaran terminal MySQL (tabel +---+ dan vertikal \\G). Salin juga garis +---+ di atas dan bawah tabel.');
    if (tables.length > 1) tables.forEach(function (tb, q) { tb.name = 'Hasil ' + (q + 1); });
    return tables;
  }

  /* ---------- deteksi dan jalankan ---------- */
  function detect(t) {
    var k = 0;
    while (k < t.length && t.charCodeAt(k) <= 32) k++;
    var c = t.charAt(k), head = t.slice(k, k + 65536);
    if (c === '[' || c === '{') return 'json';
    if (/(^|\n)\+[-=+]+\+[ \t]*\r?\n\|/.test(head) || /(^|\n)\*{3,}\s*1\. row\s*\*{3,}/.test(head)) return 'mysql';
    if (/(^|\n)\s*(INSERT\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+)?(?:IGNORE\s+)?INTO|REPLACE\s+(?:LOW_PRIORITY\s+|DELAYED\s+)?INTO|CREATE\s+(?:TEMPORARY\s+)?TABLE)\b/i.test(head)) return 'sql';
    if (/^(--\s|\/\*!|LOCK\s+TABLES|DROP\s+TABLE)/i.test(head)) return 'sql';
    return 'csv';
  }
  var DNAME = { ',': 'koma', ';': 'titik koma', '\t': 'tab', '|': 'pipa' };

  function run(m, prog) {
    var t0 = now();
    var text = m.bytes ? decode(m.bytes, m.enc) : m.text;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (!/\S/.test(text)) fail('Masukan masih kosong. Tempel data atau pilih file, lalu tekan Tampilkan.');
    var fmt = m.fmt === 'auto' ? detect(text) : m.fmt, notes = [], tables, label, name = m.name || 'data';
    prog(0.02);
    if (fmt === 'csv') {
      var d = m.delim === 'auto' ? detectDelim(text) : m.delim;
      tables = [csvTable(text, d, m.header, name, prog, notes)];
      label = d === '\t' ? 'TSV (pemisah tab)' : 'CSV (pemisah ' + DNAME[d] + ')';
    } else if (fmt === 'json') {
      var j = jsonTable(text, name, notes);
      tables = [j.table]; label = j.kind;
    } else if (fmt === 'sql') {
      tables = parseSql(text, prog, notes); label = 'Dump SQL';
    } else {
      tables = parseMysql(text, notes);
      label = 'Keluaran terminal MySQL';
    }
    prog(0.95);
    tables.forEach(function (tb) { tb.types = tb.cols.map(function (_, c) { return colType(tb.rows, c); }); });
    return { format: label, tables: tables, notes: notes, parseMs: now() - t0 };
  }
  return { run: run, detect: detect, parseCsv: parseCsv };
}
/*CORE-END*/

(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var fmtN = function (n) { return n.toLocaleString('id-ID'); };
  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' KB';
    return (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var KEY = 'sagalait-db-viewer';
  var MAXMB = 50, OVER = 6;
  var coll = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });
  var NONASCII = /[^\x00-\x7f]/;
  function fold(s) {
    return NONASCII.test(s) ? s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : s.toLowerCase();
  }

  var S = { tables: [], a: 0, file: null, q: '', job: null, jobId: 0, size: 0, format: '', parseMs: 0, notes: [], pending: null };
  var core = null;
  var T = function () { return S.tables[S.a]; };

  /* ---------- pengaturan non-sensitif ---------- */
  function loadSet() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSet() {
    try { localStorage.setItem(KEY, JSON.stringify({ delim: $('delim').value, header: $('header').checked })); } catch (e) { /* abaikan */ }
  }
  (function () {
    var s = loadSet();
    if (typeof s.delim === 'string' && $('delim').querySelector('option[value="' + s.delim.replace(/"/g, '') + '"]')) $('delim').value = s.delim;
    if (typeof s.header === 'boolean') $('header').checked = s.header;
  })();

  /* ---------- pesan ---------- */
  function showMsg(kind, text, buttons) {
    var m = $('msg');
    m.textContent = '';
    if (!kind) return;
    var b = el('div', 'banner ' + kind);
    if (kind === 'bad') b.appendChild(el('span', 'dot', '!'));
    b.appendChild(el('span', '', text));
    (buttons || []).forEach(function (x) {
      var btn = el('button', 'btn btn-sm', x.t);
      btn.type = 'button';
      btn.onclick = x.f;
      b.appendChild(btn);
    });
    m.appendChild(b);
  }
  function setBusy(on) {
    $('prog').hidden = !on;
    $('btnGo').disabled = on;
    if (on) { $('bar').value = 0; $('progTxt').textContent = 'Membaca data...'; }
  }

  /* ---------- parse lewat Web Worker dari Blob URL ---------- */
  function workerSource() {
    var h = function (e) {
      var m = e.data;
      try {
        var res = core.run(m, function (f) { postMessage({ p: f }); });
        postMessage({ done: res });
      } catch (err) { postMessage({ err: err.message, user: !!err.user }); }
    };
    return '"use strict";var core=(' + parserCore.toString() + ')();onmessage=' + h.toString() + ';';
  }
  function makeWorker() {
    var url = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
    var w = new Worker(url);
    w.__url = url;
    return w;
  }
  function endJob() {
    if (S.job) { try { S.job.terminate(); URL.revokeObjectURL(S.job.__url); } catch (e) { /* abaikan */ } S.job = null; }
  }
  function currentInput() {
    var m = {
      fmt: $('fmt').value,
      delim: $('delim').value === 'tab' ? '\t' : $('delim').value,
      header: $('header').checked,
      enc: $('enc').value,
      name: 'data'
    };
    if (S.file) {
      m.bytes = S.file.bytes; m.name = S.file.name.replace(/\.[^.]+$/, '') || 'data'; S.size = S.file.bytes.length;
    } else {
      m.text = $('input').value; S.size = new Blob([m.text]).size;
    }
    return m;
  }
  function go() {
    var m = currentInput();
    if (!S.file && !m.text.trim()) { showMsg('bad', 'Masukan masih kosong. Tempel data atau pilih file, lalu tekan Tampilkan.'); clearResult(); return; }
    if (S.file && isSqlite(S.file)) { sqliteMsg(); return; }
    endJob();
    var id = ++S.jobId;
    showMsg(null);
    setBusy(true);
    var onDone = function (res) { if (id !== S.jobId) return; endJob(); setBusy(false); finish(res); };
    var onErr = function (msg) { if (id !== S.jobId) return; endJob(); setBusy(false); clearResult(); showMsg('bad', msg); };
    var sync = function () {
      setTimeout(function () {
        if (id !== S.jobId) return;
        try { core = core || parserCore(); onDone(core.run(m, function () {})); }
        catch (e) { onErr(e.user ? e.message : 'Gagal membaca data: ' + e.message); }
      }, 30);
    };
    var w;
    try { w = makeWorker(); } catch (e) { sync(); return; }
    S.job = w;
    w.onmessage = function (e) {
      var d = e.data;
      if (d.p !== undefined) { $('bar').value = d.p; $('progTxt').textContent = 'Membaca data... ' + Math.round(d.p * 100) + '%'; }
      else if (d.err) onErr(d.user ? d.err : 'Gagal membaca data: ' + d.err);
      else onDone(d.done);
    };
    w.onerror = function (e) { if (e.preventDefault) e.preventDefault(); endJob(); sync(); };
    w.postMessage(m);
  }

  function colWidth(t, c) {
    var mx = t.cols[c].length, lim = Math.min(t.rows.length, 200);
    for (var i = 0; i < lim; i++) { var v = t.rows[i][c]; if (v !== null && v.length > mx) mx = v.length; }
    return Math.max(90, Math.min(360, mx * 8 + 28));
  }
  function finish(res) {
    S.tables = res.tables.map(function (t) {
      t.hidden = t.cols.map(function () { return false; });
      t.widths = t.cols.map(function (_, c) { return colWidth(t, c); });
      t.sort = null; t.filters = []; t.norm = null; t.view = []; t.active = null; t.keys = null;
      return t;
    });
    S.a = 0; S.format = res.format; S.parseMs = res.parseMs; S.notes = res.notes;
    $('empty').hidden = true;
    $('result').hidden = false;
    renderTabs();
    openTable();
  }
  function clearResult() {
    S.tables = []; S.notes = [];
    $('result').hidden = true;
    $('empty').hidden = false;
  }

  /* ---------- tabel aktif ---------- */
  function visCols(t) {
    var v = [];
    t.cols.forEach(function (_, c) { if (!t.hidden[c]) v.push(c); });
    return v;
  }
  function openTable() {
    var t = T();
    $('vTitle').textContent = t.name;
    fillFilterCols();
    renderColList();
    renderChips();
    $('opNote').textContent = '';
    refresh(true);
  }
  function refresh(rebuildHead) {
    var t = T();
    computeView(t);
    t.active = null;
    $('gw').scrollTop = 0;
    if (rebuildHead) renderHead();
    else updateSortMarks();
    renderBody(true);
    renderSummary();
  }

  function makePred(t, f) {
    var c = f.c, val = f.v, isNum = t.types[c] === 'angka', nv = parseFloat(val), fv = fold(val);
    var eq = function (v) { return v !== null && (v === val || (isNum && nv === nv && parseFloat(v) === nv)); };
    switch (f.op) {
      case 'has': return function (r) { var v = r[c]; return v !== null && fold(v).indexOf(fv) >= 0; };
      case 'eq': return function (r) { return eq(r[c]); };
      case 'ne': return function (r) { return !eq(r[c]); };
      case 'gt': return function (r) { var v = r[c]; if (v === null) return false; return isNum && nv === nv ? parseFloat(v) > nv : coll.compare(v, val) > 0; };
      case 'lt': return function (r) { var v = r[c]; if (v === null) return false; return isNum && nv === nv ? parseFloat(v) < nv : coll.compare(v, val) < 0; };
      case 'empty': return function (r) { return r[c] === ''; };
      default: return function (r) { return r[c] === null; };
    }
  }
  function computeView(t) {
    var rows = t.rows, n = rows.length, q = fold(S.q.trim()), i, idx = [];
    var preds = t.filters.map(function (f) { return makePred(t, f); });
    if (q && !t.norm) {
      t.norm = new Array(n);
      for (i = 0; i < n; i++) t.norm[i] = fold(rows[i].join('\u0001'));
    }
    for (i = 0; i < n; i++) {
      if (q && t.norm[i].indexOf(q) < 0) continue;
      var ok = true;
      for (var p = 0; p < preds.length; p++) if (!preds[p](rows[i])) { ok = false; break; }
      if (ok) idx.push(i);
    }
    if (t.sort) {
      var c = t.sort.c, dir = t.sort.d, type = t.types[c];
      if (type === 'angka') {
        if (!t.keys || t.keys.c !== c) {
          var arr = new Float64Array(n);
          for (i = 0; i < n; i++) { var v0 = rows[i][c]; arr[i] = v0 === null || v0 === '' ? NaN : parseFloat(v0); }
          t.keys = { c: c, arr: arr };
        }
        var ka = t.keys.arr;
        idx.sort(function (a, b) {
          var x = ka[a], y = ka[b], nx = x !== x, ny = y !== y;
          if (nx || ny) return nx === ny ? 0 : (nx ? 1 : -1);
          return dir * (x - y);
        });
      } else {
        var date = type === 'tanggal';
        idx.sort(function (a, b) {
          var x = rows[a][c], y = rows[b][c];
          if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);
          if (date) return x < y ? -dir : x > y ? dir : 0;
          return dir * coll.compare(x, y);
        });
      }
    }
    t.view = idx;
  }

  /* ---------- ringkasan ---------- */
  function renderSummary() {
    var t = T(), box = $('sum');
    box.textContent = '';
    var vc = visCols(t);
    var items = [
      ['Format', S.format],
      ['Baris', fmtN(t.rows.length)],
      ['Kolom', fmtN(t.cols.length)],
      ['Ukuran masukan', fmtBytes(S.size)],
      ['Tabel aktif', t.name],
      ['Waktu parse', S.parseMs < 1000 ? Math.round(S.parseMs) + ' ms' : (S.parseMs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' detik']
    ];
    items.forEach(function (x) {
      var d = el('div', 'si');
      d.appendChild(el('div', 'k', x[0]));
      d.appendChild(el('div', 'v', x[1]));
      box.appendChild(d);
    });
    var nb = $('notes');
    nb.textContent = '';
    nb.hidden = !S.notes.length;
    if (S.notes.length) {
      var h = el('div', 'issue-head');
      h.appendChild(el('span', 'tag', 'Catatan'));
      nb.appendChild(h);
      var ul = el('ul', 'notelist');
      S.notes.forEach(function (x) { ul.appendChild(el('li', '', x)); });
      nb.appendChild(ul);
    }
    $('count').textContent = fmtN(t.view.length) + ' dari ' + fmtN(t.rows.length) + ' baris cocok' + (vc.length < t.cols.length ? ', ' + vc.length + ' dari ' + t.cols.length + ' kolom tampil' : '');
    $('noRows').hidden = t.view.length > 0;
    $('expNote').textContent = 'Ekspor memakai tampilan saat ini: ' + fmtN(t.view.length) + ' baris, ' + vc.length + ' kolom.';
  }

  function renderTabs() {
    var box = $('tabs');
    box.textContent = '';
    box.hidden = S.tables.length < 2;
    S.tables.forEach(function (t, k) {
      var b = el('button', 'btn btn-sm tab', t.name + ' (' + fmtN(t.rows.length) + ')');
      b.type = 'button';
      b.setAttribute('aria-pressed', k === S.a ? 'true' : 'false');
      b.onclick = function () { S.a = k; renderTabs(); openTable(); };
      box.appendChild(b);
    });
  }

  /* ---------- tabel dengan windowing ---------- */
  var rowH = 34, headH = 56, lastRange = '';
  function readMetrics() {
    var cs = getComputedStyle(document.documentElement);
    rowH = parseInt(cs.getPropertyValue('--rowh'), 10) || 34;
    headH = parseInt(cs.getPropertyValue('--headh'), 10) || 56;
  }
  function tableWidth(t) {
    var w = 64;
    visCols(t).forEach(function (c) { w += t.widths[c]; });
    return w;
  }
  function renderHead() {
    var t = T(), tbl = $('grid');
    readMetrics();
    tbl.textContent = '';
    var cg = el('colgroup');
    var rc = el('col'); rc.style.width = '64px'; cg.appendChild(rc);
    var vc = visCols(t);
    vc.forEach(function (c) { var x = el('col'); x.style.width = t.widths[c] + 'px'; x.dataset.c = c; cg.appendChild(x); });
    tbl.appendChild(cg);
    tbl.style.width = tableWidth(t) + 'px';
    var th = el('thead'), tr = el('tr');
    var corner = el('th', 'rn', '#'); corner.scope = 'col';
    tr.appendChild(corner);
    vc.forEach(function (c) {
      var h = el('th'); h.scope = 'col'; h.dataset.c = c;
      var b = el('button', 'hc'); b.type = 'button';
      var nm = el('span', 'nm'); nm.textContent = t.cols[c];
      var ar = el('span', 'ar'); ar.setAttribute('aria-hidden', 'true');
      var top = el('span', 'hrow'); top.appendChild(nm); top.appendChild(ar);
      b.appendChild(top);
      b.appendChild(el('span', 'ty', t.types[c]));
      b.onclick = function () { cycleSort(c); };
      var rz = el('span', 'rz'); rz.tabIndex = 0; rz.setAttribute('role', 'separator'); rz.setAttribute('aria-orientation', 'vertical');
      rz.setAttribute('aria-label', 'Ubah lebar kolom ' + t.cols[c] + ' dengan tombol panah kiri dan kanan');
      attachResize(rz, c);
      h.appendChild(b); h.appendChild(rz);
      tr.appendChild(h);
    });
    th.appendChild(tr); tbl.appendChild(th);
    tbl.appendChild(el('tbody'));
    updateSortMarks();
  }
  function updateSortMarks() {
    var t = T();
    $('grid').querySelectorAll('thead th[data-c]').forEach(function (h) {
      var c = +h.dataset.c, s = t.sort && t.sort.c === c ? t.sort.d : 0;
      h.setAttribute('aria-sort', s === 1 ? 'ascending' : s === -1 ? 'descending' : 'none');
      h.querySelector('.ar').textContent = s === 1 ? '↑' : s === -1 ? '↓' : '';
      h.querySelector('.hc').setAttribute('aria-label', t.cols[c] + ', ' + t.types[c] + ', ' + (s === 1 ? 'urut naik' : s === -1 ? 'urut turun' : 'tanpa urut') + '. Klik untuk mengubah urutan.');
    });
  }
  function cycleSort(c) {
    var t = T();
    if (!t.sort || t.sort.c !== c) t.sort = { c: c, d: 1 };
    else if (t.sort.d === 1) t.sort = { c: c, d: -1 };
    else t.sort = null;
    refresh(false);
  }
  function attachResize(h, c) {
    var set = function (w) {
      var t = T();
      t.widths[c] = Math.max(60, Math.min(900, w));
      var col = $('grid').querySelector('col[data-c="' + c + '"]');
      if (col) col.style.width = t.widths[c] + 'px';
      $('grid').style.width = tableWidth(t) + 'px';
    };
    h.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      var x0 = e.clientX, w0 = T().widths[c];
      h.setPointerCapture(e.pointerId);
      var mv = function (ev) { set(w0 + ev.clientX - x0); };
      var up = function () { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
    });
    h.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { set(T().widths[c] + 16); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { set(T().widths[c] - 16); e.preventDefault(); }
    });
  }

  function cellInto(td, v, q) {
    if (v === null) { td.appendChild(el('span', 'nul', 'NULL')); return; }
    if (v.length > 400) v = v.slice(0, 400);
    if (q) {
      var fv = fold(v);
      if (fv.length === v.length && fv.indexOf(q) >= 0) {
        var pos = 0, p, cnt = 0;
        while (cnt++ < 20 && (p = fv.indexOf(q, pos)) >= 0) {
          if (p > pos) td.appendChild(document.createTextNode(v.slice(pos, p)));
          td.appendChild(el('mark', 'hl', v.slice(p, p + q.length)));
          pos = p + q.length;
        }
        if (pos < v.length) td.appendChild(document.createTextNode(v.slice(pos)));
        return;
      }
    }
    td.textContent = v;
  }
  function renderBody(force) {
    var t = T(), gw = $('gw'), tb = $('grid').tBodies[0];
    if (!t || !tb) return;
    var n = t.view.length, vc = visCols(t), q = fold(S.q.trim());
    var st = gw.scrollTop, ch = gw.clientHeight;
    var first = Math.max(0, Math.floor(st / rowH) - OVER);
    var last = Math.min(n, Math.ceil((st + ch - headH) / rowH) + OVER);
    var key = first + ':' + last + ':' + n;
    if (!force && key === lastRange) return;
    lastRange = key;
    var frag = document.createDocumentFragment();
    var spacer = function (rows) {
      var tr = el('tr', 'sp'), td = el('td'); td.colSpan = vc.length + 1; td.style.height = rows * rowH + 'px';
      tr.appendChild(td); return tr;
    };
    if (first > 0) frag.appendChild(spacer(first));
    for (var p = first; p < last; p++) {
      var ri = t.view[p], row = t.rows[ri], tr = el('tr');
      tr.dataset.r = p;
      var rn = el('td', 'rn'), b = el('button', 'rnb', String(ri + 1));
      b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-label', 'Detail baris ' + (ri + 1));
      rn.appendChild(b); tr.appendChild(rn);
      for (var k = 0; k < vc.length; k++) {
        var c = vc[k], td = el('td');
        td.dataset.c = c;
        if (t.types[c] === 'angka') td.className = 'num';
        if (t.active && t.active.r === p && t.active.c === k) td.classList.add('cur');
        cellInto(td, row[c], q);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    if (last < n) frag.appendChild(spacer(n - last));
    tb.textContent = '';
    tb.appendChild(frag);
  }
  var raf = 0;
  $('gw').addEventListener('scroll', function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; renderBody(false); });
  });
  window.addEventListener('resize', function () {
    if (!S.tables.length) return;
    var oh = rowH;
    readMetrics();
    lastRange = '';
    renderBody(true);
    if (oh !== rowH) renderBody(true);
  });

  function posToCol(t, k) { return visCols(t)[k]; }
  $('grid').addEventListener('click', function (e) {
    var t = T();
    var btn = e.target.closest('button.rnb');
    if (btn) { openRow(+btn.closest('tr').dataset.r); return; }
    var td = e.target.closest('td[data-c]');
    if (!td) return;
    var r = +td.closest('tr').dataset.r, c = +td.dataset.c;
    t.active = { r: r, c: visCols(t).indexOf(c) };
    renderBody(true);
    $('gw').focus({ preventScroll: true });
    openCell(r, c);
  });
  $('gw').addEventListener('keydown', function (e) {
    if (e.target !== this) return;
    var t = T(), n = t.view.length, vc = visCols(t);
    if (!n || !vc.length) return;
    var a = t.active ? { r: t.active.r, c: Math.min(t.active.c, vc.length - 1) } : null;
    var page = Math.max(1, Math.floor(($('gw').clientHeight - headH) / rowH) - 1), k = e.key;
    if (!a) {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp', 'Enter'].indexOf(k) < 0) return;
      a = { r: Math.max(0, Math.floor($('gw').scrollTop / rowH)), c: 0 };
      if (k !== 'Enter') { t.active = a; e.preventDefault(); ensureVisible(); return; }
    }
    if (k === 'ArrowDown') a.r = Math.min(n - 1, a.r + 1);
    else if (k === 'ArrowUp') a.r = Math.max(0, a.r - 1);
    else if (k === 'ArrowRight') a.c = Math.min(vc.length - 1, a.c + 1);
    else if (k === 'ArrowLeft') a.c = Math.max(0, a.c - 1);
    else if (k === 'PageDown') a.r = Math.min(n - 1, a.r + page);
    else if (k === 'PageUp') a.r = Math.max(0, a.r - page);
    else if (k === 'Home') { a.c = 0; if (e.ctrlKey) a.r = 0; }
    else if (k === 'End') { a.c = vc.length - 1; if (e.ctrlKey) a.r = n - 1; }
    else if (k === 'Enter') { e.preventDefault(); t.active = a; if (e.shiftKey) openRow(a.r); else openCell(a.r, vc[a.c]); return; }
    else return;
    e.preventDefault();
    t.active = a;
    ensureVisible();
  });
  function ensureVisible() {
    var t = T(), gw = $('gw'), a = t.active;
    var top = a.r * rowH, st = gw.scrollTop;
    if (top < st) gw.scrollTop = top;
    else if (top + rowH > st + gw.clientHeight - headH) gw.scrollTop = top + rowH - (gw.clientHeight - headH);
    renderBody(true);
    var td = gw.querySelector('td.cur');
    if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---------- filter ---------- */
  var OPS = { has: 'berisi', eq: 'sama dengan', ne: 'tidak sama dengan', gt: 'lebih besar dari', lt: 'lebih kecil dari', empty: 'kosong', 'null': 'NULL' };
  function fillFilterCols() {
    var t = T(), s = $('fCol');
    s.textContent = '';
    t.cols.forEach(function (nm, c) { var o = el('option', '', nm); o.value = c; s.appendChild(o); });
  }
  function renderChips() {
    var t = T(), box = $('chips');
    box.textContent = '';
    t.filters.forEach(function (f, k) {
      var txt = t.cols[f.c] + ' ' + OPS[f.op] + (f.op === 'empty' || f.op === 'null' ? '' : ' "' + f.v + '"');
      var b = el('button', 'chip', txt + ' ×');
      b.type = 'button';
      b.setAttribute('aria-label', 'Hapus filter: ' + txt);
      b.onclick = function () { t.filters.splice(k, 1); renderChips(); refresh(false); };
      box.appendChild(b);
    });
    $('fNum').textContent = t.filters.length ? '(' + t.filters.length + ')' : '';
    $('fClear').hidden = !t.filters.length;
  }
  function syncOp() {
    var op = $('fOp').value;
    $('fVal').hidden = op === 'empty' || op === 'null';
  }
  function addFilter() {
    var t = T(), op = $('fOp').value, v = $('fVal').value;
    if (op !== 'empty' && op !== 'null' && v === '') { $('opNote').textContent = 'Isi nilai filter dulu, lalu tekan Tambah.'; $('fVal').focus(); return; }
    $('opNote').textContent = '';
    t.filters.push({ c: +$('fCol').value, op: op, v: op === 'empty' || op === 'null' ? '' : v });
    $('fVal').value = '';
    renderChips();
    refresh(false);
  }
  $('fOp').onchange = syncOp;
  $('fAdd').onclick = addFilter;
  $('fVal').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFilter(); } });
  $('fClear').onclick = function () { T().filters = []; renderChips(); refresh(false); };

  /* ---------- kolom ---------- */
  function renderColList() {
    var t = T(), box = $('colList');
    box.textContent = '';
    t.cols.forEach(function (nm, c) {
      var l = el('label', 'ck'), i = el('input');
      i.type = 'checkbox'; i.checked = !t.hidden[c];
      i.onchange = function () {
        if (!i.checked && visCols(t).length === 1) { i.checked = true; $('opNote').textContent = 'Minimal satu kolom harus tetap tampil.'; return; }
        $('opNote').textContent = '';
        t.hidden[c] = !i.checked;
        t.active = null;
        renderHead(); renderBody(true); renderSummary();
      };
      l.appendChild(i); l.appendChild(document.createTextNode(' ' + nm));
      box.appendChild(l);
    });
  }
  function setAllCols(show) {
    var t = T();
    t.hidden = t.cols.map(function (_, c) { return show ? false : c !== 0; });
    t.active = null;
    renderColList(); renderHead(); renderBody(true); renderSummary();
  }
  $('colAll').onclick = function () { setAllCols(true); };
  $('colNone').onclick = function () { setAllCols(false); };
  $('colReset').onclick = function () { var t = T(); t.widths = t.cols.map(function (_, c) { return colWidth(t, c); }); renderHead(); renderBody(true); };

  document.querySelectorAll('[data-drawer]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = $(b.dataset.drawer), open = d.hidden;
      d.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && b.dataset.drawer === 'dFilter') syncOp();
    });
  });

  var qTimer = 0;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { S.q = $('q').value; if (S.tables.length) refresh(false); }, 150);
  });

  /* ---------- salin dan unduh ---------- */
  function copyText(text, btn) {
    var old = btn ? btn.textContent : '';
    var done = function () { if (btn) { btn.textContent = 'Tersalin'; setTimeout(function () { btn.textContent = old; }, 1500); } };
    var legacy = function () {
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'vh';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { if (btn) btn.textContent = 'Gagal menyalin'; }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
  }
  function download(name, mime, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function safeName(t, ext) { return (t.name.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '') || 'data') + ext; }
  function tsvCell(v) {
    if (v === null) return '';
    return /[\t\r\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csvCell(v) {
    if (v === null) return '';
    return /[",\r\n]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function viewTable(f) {
    var t = T(), vc = visCols(t), out = [vc.map(function (c) { return f(t.cols[c]); }).join(f === csvCell ? ',' : '\t')];
    for (var i = 0; i < t.view.length; i++) {
      var r = t.rows[t.view[i]], cells = [];
      for (var k = 0; k < vc.length; k++) cells.push(f(r[vc[k]]));
      out.push(cells.join(f === csvCell ? ',' : '\t'));
    }
    return out;
  }
  function jsonVal(t, c, v) {
    if (v === null) return null;
    if (t.types[c] === 'angka') { var x = Number(v); if (isFinite(x) && String(x) === v) return x; }
    return v;
  }
  $('exCsv').onclick = function () {
    var t = T();
    download(safeName(t, '.csv'), 'text/csv;charset=utf-8', ($('bom').checked ? '﻿' : '') + viewTable(csvCell).join('\r\n') + '\r\n');
  };
  $('exJson').onclick = function () {
    var t = T(), vc = visCols(t), out = [];
    for (var i = 0; i < t.view.length; i++) {
      var r = t.rows[t.view[i]], o = {};
      vc.forEach(function (c) { o[t.cols[c]] = jsonVal(t, c, r[c]); });
      out.push(o);
    }
    download(safeName(t, '.json'), 'application/json;charset=utf-8', JSON.stringify(out, null, 2) + '\n');
  };
  $('exTsv').onclick = function () { copyText(viewTable(tsvCell).join('\n'), $('exTsv')); };

  /* ---------- detail sel dan baris ---------- */
  var SERIAL = /^\s*[asO]:\d+:/;
  var cellVal = null;
  function openCell(r, c) {
    var t = T(), v = t.rows[t.view[r]][c], note = $('cdNote'), pre = $('cdPre'), link = $('cdLink');
    cellVal = v;
    $('cdTitle').textContent = 'Kolom ' + t.cols[c] + ', baris ' + (t.view[r] + 1);
    note.textContent = '';
    link.hidden = true;
    if (v === null) {
      pre.textContent = 'NULL';
      note.textContent = 'Nilai ini NULL, bukan string kosong.';
    } else if (v === '') {
      pre.textContent = '';
      note.textContent = 'Nilai ini string kosong, bukan NULL.';
    } else {
      var shown = v, f = v.replace(/^\s+/, '').charAt(0);
      if (f === '{' || f === '[') {
        try { shown = JSON.stringify(JSON.parse(v), null, 2); note.textContent = 'JSON valid, ditampilkan rapi. Tombol salin menyalin nilai aslinya.'; } catch (e) { shown = v; }
      }
      if (SERIAL.test(v)) {
        note.textContent = 'Nilai ini tampak seperti hasil serialize() PHP. Salin nilainya lalu tempel di Serialize Checker; data tidak dikirim lewat URL.';
        link.hidden = false;
      }
      pre.textContent = shown;
    }
    $('cdCopy').disabled = v === null;
    $('cellDlg').showModal();
  }
  $('cdClose').onclick = function () { $('cellDlg').close(); };
  $('cdCopy').onclick = function () { copyText(cellVal, $('cdCopy')); };

  var rowPos = 0;
  function openRow(p) {
    var t = T(), n = t.view.length;
    if (p < 0 || p >= n) return;
    rowPos = p;
    var row = t.rows[t.view[p]], dl = $('rdList');
    $('rdTitle').textContent = 'Baris ' + (t.view[p] + 1) + ' (' + fmtN(p + 1) + ' dari ' + fmtN(n) + ' dalam tampilan)';
    dl.textContent = '';
    t.cols.forEach(function (nm, c) {
      dl.appendChild(el('dt', '', nm));
      var dd = el('dd');
      if (row[c] === null) dd.appendChild(el('span', 'nul', 'NULL'));
      else dd.textContent = row[c].length > 5000 ? row[c].slice(0, 5000) + '... (dipotong, buka sel untuk nilai penuh)' : row[c];
      dl.appendChild(dd);
    });
    $('rdPrev').disabled = p === 0;
    $('rdNext').disabled = p === n - 1;
    if (!$('rowDlg').open) $('rowDlg').showModal();
  }
  $('rdClose').onclick = function () { $('rowDlg').close(); };
  $('rdPrev').onclick = function () { openRow(rowPos - 1); };
  $('rdNext').onclick = function () { openRow(rowPos + 1); };
  $('rdTsv').onclick = function () {
    var t = T(), r = t.rows[t.view[rowPos]];
    copyText(r.map(tsvCell).join('\t'), $('rdTsv'));
  };
  $('rdJson').onclick = function () {
    var t = T(), r = t.rows[t.view[rowPos]], o = {};
    t.cols.forEach(function (nm, c) { o[nm] = jsonVal(t, c, r[c]); });
    copyText(JSON.stringify(o, null, 2), $('rdJson'));
  };

  /* ---------- masukan: file, tempel, contoh ---------- */
  function isSqlite(f) {
    var b = f.bytes, magic = 'SQLite format 3';
    if (b.length >= 15) {
      var ok = true;
      for (var i = 0; i < 15; i++) if (b[i] !== magic.charCodeAt(i)) { ok = false; break; }
      if (ok) return true;
    }
    return /\.sqlite3?$/i.test(f.name) && b.length > 0 && b[0] === 83;
  }
  function sqliteMsg() {
    clearResult();
    showMsg('bad', 'File SQLite belum didukung di versi ini. Ekspor tabelnya ke CSV (sqlite3: .headers on, .mode csv, .output nama.csv) atau ke dump SQL (.dump), lalu buka hasilnya di sini.');
  }
  function setSrcNote() {
    $('srcNote').textContent = S.file ? 'File: ' + S.file.name + ' (' + fmtBytes(S.file.bytes.length) + ')' : '';
    $('btnDetach').hidden = !S.file;
  }
  function readFile(f) {
    showMsg(null);
    f.arrayBuffer().then(function (buf) {
      S.file = { name: f.name, bytes: new Uint8Array(buf) };
      $('input').value = '';
      setSrcNote();
      go();
    }, function () { showMsg('bad', 'File tidak bisa dibaca. Pastikan file masih ada dan boleh dibuka, lalu pilih ulang.'); });
  }
  function takeFile(f) {
    if (!f) return;
    if (/\.sqlite3?$/i.test(f.name)) {
      var rd = new FileReader();
      rd.onload = function () { S.file = { name: f.name, bytes: new Uint8Array(rd.result) }; $('input').value = ''; setSrcNote(); sqliteMsg(); };
      rd.readAsArrayBuffer(f.slice(0, 64));
      return;
    }
    if (f.size > MAXMB * 1048576) {
      showMsg('warn', 'File ' + f.name + ' berukuran ' + fmtBytes(f.size) + ', di atas batas peringatan ' + MAXMB + ' MB. Membukanya bisa memakan banyak memori dan waktu. Lanjutkan?', [
        { t: 'Tetap buka', f: function () { readFile(f); } },
        { t: 'Batal', f: function () { showMsg(null); } }
      ]);
      return;
    }
    readFile(f);
  }
  $('file').addEventListener('change', function () { takeFile(this.files[0]); this.value = ''; });
  $('btnDetach').onclick = function () { S.file = null; setSrcNote(); $('input').focus(); };
  var inPanel = $('inPanel');
  ['dragenter', 'dragover'].forEach(function (n) {
    inPanel.addEventListener(n, function (e) { e.preventDefault(); inPanel.classList.add('drop'); });
  });
  inPanel.addEventListener('dragleave', function (e) { if (!inPanel.contains(e.relatedTarget)) inPanel.classList.remove('drop'); });
  inPanel.addEventListener('drop', function (e) {
    e.preventDefault(); inPanel.classList.remove('drop');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) takeFile(f);
  });
  $('input').addEventListener('input', function () { if (S.file) { S.file = null; setSrcNote(); } });
  $('input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  $('btnGo').onclick = go;
  $('btnCancel').onclick = function () { S.jobId++; endJob(); setBusy(false); showMsg('warn', 'Pembacaan dibatalkan.'); };
  function sample() {
    S.file = null; setSrcNote();
    $('input').value = $('sampleText').textContent.replace(/^\n/, '');
    $('fmt').value = 'auto';
    go();
  }
  $('btnSample').onclick = sample;
  $('btnSample2').onclick = sample;
  $('btnClear').onclick = function () {
    S.jobId++; endJob(); setBusy(false);
    S.file = null; setSrcNote(); S.q = ''; $('q').value = '';
    $('input').value = '';
    showMsg(null); clearResult();
    $('input').focus();
  };
  ['fmt', 'delim', 'header', 'enc'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      saveSet();
      if (S.file || $('input').value.trim()) go();
    });
  });
})();
