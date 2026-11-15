/* Logika murni penguji regex (tanpa DOM, aman dipakai di Web Worker). */
(function (root) {
  'use strict';
  var MAX = 5000;

  function compile(pattern, flags) {
    flags = flags || '';
    try { return new RegExp(pattern, flags.indexOf('d') < 0 ? flags + 'd' : flags); }
    catch (e) { if (flags.indexOf('d') >= 0) throw e; return new RegExp(pattern, flags); } // tanpa dukungan flag d
  }
  function advance(text, i, unicode) {
    if (unicode && i + 1 < text.length) {
      var a = text.charCodeAt(i), b = text.charCodeAt(i + 1);
      if (a >= 0xD800 && a <= 0xDBFF && b >= 0xDC00 && b <= 0xDFFF) return i + 2;
    }
    return i + 1;
  }
  function mk(m) {
    var groups = [], k;
    for (k = 1; k < m.length; k++) {
      var ix = m.indices && m.indices[k];
      groups.push({ i: k, value: m[k] === undefined ? null : m[k], start: ix ? ix[0] : null, end: ix ? ix[1] : null });
    }
    var named = [];
    if (m.groups) Object.keys(m.groups).forEach(function (n) { named.push({ name: n, value: m.groups[n] === undefined ? null : m.groups[n] }); });
    return { index: m.index, end: m.index + m[0].length, text: m[0], groups: groups, named: named };
  }

  /* semua kecocokan; kecocokan kosong tidak membuat loop tak hingga; maksimum MAX */
  function execAll(re, text) {
    var out = [], truncated = false, m;
    re.lastIndex = 0;
    if (!re.global && !re.sticky) { m = re.exec(text); if (m) out.push(mk(m)); return { matches: out, truncated: false }; }
    if (!re.global) { m = re.exec(text); if (m) out.push(mk(m)); return { matches: out, truncated: false }; }
    while ((m = re.exec(text)) !== null) {
      if (out.length >= MAX) { truncated = true; break; }
      out.push(mk(m));
      if (m[0] === '') re.lastIndex = advance(text, re.lastIndex, re.unicode);
    }
    return { matches: out, truncated: truncated };
  }

  /* potongan teks untuk sorotan: plain, atau match dengan nomor grup terdalam (0 = di luar grup) */
  function segments(text, matches) {
    var segs = [], pos = 0;
    function plain(to) { if (to > pos) segs.push({ t: text.slice(pos, to), m: false, g: 0 }); pos = to; }
    matches.forEach(function (m) {
      if (m.end === m.index) return;       // kecocokan kosong tidak disorot
      if (m.index < pos) return;
      plain(m.index);
      var len = m.end - m.index, cover = new Array(len).fill(0), j;
      m.groups.forEach(function (g) {
        if (g.start == null || g.end <= g.start) return;
        for (j = g.start - m.index; j < g.end - m.index; j++) if (j >= 0 && j < len) cover[j] = g.i;
      });
      var s = 0;
      for (j = 1; j <= len; j++) {
        if (j === len || cover[j] !== cover[s]) { segs.push({ t: text.slice(m.index + s, m.index + j), m: true, g: cover[s] }); s = j; }
      }
      pos = m.end;
    });
    plain(text.length);
    return segs;
  }

  function run(req) {
    try {
      var re = compile(req.pattern, req.flags), r;
      if (req.op === 'match') {
        r = execAll(re, req.text);
        return { ok: true, op: 'match', matches: r.matches, truncated: r.truncated, segs: segments(req.text, r.matches) };
      }
      if (req.op === 'replace') {
        r = execAll(re, req.text);
        re.lastIndex = 0;
        return { ok: true, op: 'replace', result: req.text.replace(re, req.repl || ''), count: r.matches.length, truncated: r.truncated };
      }
      if (req.op === 'split') {
        re.lastIndex = 0;
        var parts = req.text.split(re);
        var cut = parts.length > MAX;
        return { ok: true, op: 'split', parts: cut ? parts.slice(0, MAX) : parts, total: parts.length, truncated: cut };
      }
      return { ok: false, error: 'op tidak dikenal' };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  var api = { MAX: MAX, compile: compile, execAll: execAll, segments: segments, run: run };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Rx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
