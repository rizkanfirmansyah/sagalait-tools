/* Tampilan Kalkulator subnet. Logika murni di cidr.js. Tidak ada data yang disimpan atau dikirim. */
(function () {
  'use strict';
  var C = window.Cidr, I = window.SagalaI18n;
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function num(n) { return new Intl.NumberFormat(I.locale).format(n); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var ERR = { empty: 'e_empty', format: 'e_format', octet: 'e_octet', octal: 'e_octal', prefix: 'e_prefix', mask: 'e_mask' };
  var ip = C.intToIp, cur = null, tab = 'calc', lastCsv = '';

  function copy(text, btn, label) {
    var ok = function () { btn.textContent = t('common.copied'); setTimeout(function () { btn.textContent = label(); }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { /* ditolak */ });
  }
  function download(name, text, type) {
    var u = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
  }

  /* ---------- hitung ---------- */
  function addRow(dl, k, v) { var d = el('div'); d.appendChild(el('dt', null, k)); var dd = el('dd'); dd.appendChild(el('code', 'sn-code', v)); d.appendChild(dd); dl.appendChild(d); }
  function binLine(label, n, netBits) {
    var line = el('div', 'sn-bline'); line.appendChild(el('span', 'sn-blabel', label));
    var box = el('span', 'sn-bits'); box.setAttribute('aria-label', ip(n));
    C.binaryOctets(n, netBits).forEach(function (oct, i) {
      var o = el('span', 'sn-oct'); o.setAttribute('aria-hidden', 'true');
      oct.forEach(function (c) { o.appendChild(el('span', c.net ? 'sn-n' : 'sn-h', c.bit)); });
      box.appendChild(o); if (i < 3) box.appendChild(el('span', 'sn-dot', '.'));
    });
    line.appendChild(box); return line;
  }
  function summaryText(c) {
    var rows = [[t('r_ip'), ip(c.ip)], [t('r_net'), ip(c.network) + '/' + c.prefix], [t('r_mask'), ip(c.netmask)], [t('r_wild'), ip(c.wildcard)],
      [t('r_bc'), c.hasBroadcast ? ip(c.broadcast) : t('r_nobc', { p: c.prefix })], [t('r_first'), ip(c.first)], [t('r_last'), ip(c.last)], [t('r_hosts'), num(c.hosts)], [t('r_class'), t('cl_' + c.klass)], [t('r_type'), t('ty_' + c.type)]];
    return rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
  }
  function renderCalc() {
    var c = cur.c, dl = $('kv'); dl.textContent = '';
    addRow(dl, t('r_ip'), ip(c.ip)); addRow(dl, t('r_net'), ip(c.network) + '/' + c.prefix); addRow(dl, t('r_mask'), ip(c.netmask) + '  (/' + c.prefix + ')'); addRow(dl, t('r_wild'), ip(c.wildcard));
    addRow(dl, t('r_bc'), c.hasBroadcast ? ip(c.broadcast) : t('r_nobc', { p: c.prefix })); addRow(dl, t('r_first'), ip(c.first)); addRow(dl, t('r_last'), ip(c.last));
    addRow(dl, t('r_hosts'), num(c.hosts)); addRow(dl, t('r_size'), num(c.size)); addRow(dl, t('r_class'), t('cl_' + c.klass)); addRow(dl, t('r_type'), t('ty_' + c.type));
    var nn = $('notNet'); nn.hidden = c.isNetwork || cur.p.bare; if (!nn.hidden) nn.textContent = t('not_net', { ip: ip(c.ip), net: ip(c.network), p: c.prefix });
    $('special').textContent = c.prefix === 31 ? t('p31') : c.prefix === 32 ? t('p32') : '';
    var bin = $('bin'); bin.textContent = '';
    bin.appendChild(binLine(t('bin_ip'), c.ip, c.prefix)); bin.appendChild(binLine(t('bin_mask'), c.netmask, c.prefix)); bin.appendChild(binLine(t('bin_net'), c.network, c.prefix));
  }

  /* ---------- bagi ---------- */
  function fillPrefixes() {
    var sel = $('newp'), keep = sel.value, p = cur.c.prefix; sel.textContent = '';
    for (var i = p; i <= 32; i++) { var o = el('option', null, '/' + i); o.value = String(i); sel.appendChild(o); }
    sel.value = keep && Number(keep) >= p ? keep : String(Math.min(32, p + 1));
  }
  function renderSplit() {
    var by = document.querySelector('input[name=by]:checked').value, np, err = $('splitErr'), c = cur.c;
    $('boxPrefix').hidden = by !== 'prefix'; $('boxCount').hidden = by !== 'count'; err.textContent = '';
    if (by === 'prefix') np = Number($('newp').value);
    else { var n = Math.round(Number($('cnt').value)); np = C.prefixForCount(c.prefix, n); if (np < 0) { err.textContent = t('too_many'); $('rows').textContent = ''; $('splitStat').textContent = ''; lastCsv = ''; return; } $('cntNote').textContent = t('count_note', { n: num(Math.pow(2, np - c.prefix)), p: np }); }
    var s = C.split(c.network, c.prefix, np, 256), tb = $('rows'); tb.textContent = '';
    if (!s.ok) { err.textContent = t('e_prefix'); return; }
    $('splitStat').textContent = s.total > s.shown ? t('split_total', { total: num(s.total), shown: num(s.shown) }) : t('split_all', { total: num(s.total) });
    s.networks.forEach(function (n) {
      var x = C.calc(n, np), tr = el('tr');
      [ip(n) + '/' + np, ip(x.first) + (x.first === x.last ? '' : ' – ' + ip(x.last)), x.hasBroadcast ? ip(x.broadcast) : '–', num(x.hosts)].forEach(function (v, i) { tr.appendChild(el('td', i < 3 ? 'sn-mono' : '', v)); });
      tb.appendChild(tr);
    });
    lastCsv = C.toCsv(s.networks, np);
  }

  /* ---------- periksa ---------- */
  function renderCheck() {
    var r = $('chkIpRes'), v = $('chkIp').value.trim();
    if (!v) r.textContent = '';
    else { var i = C.ipToInt(v); if (!i.ok) r.textContent = t(ERR[i.error] || 'e_format'); else r.textContent = t(C.contains(cur.c.network, cur.c.prefix, i.n) ? 'chk_in' : 'chk_out', { ip: ip(i.n), net: ip(cur.c.network), p: cur.c.prefix }); }
    var a = $('relA').value.trim(), b = $('relB').value.trim(), rr = $('relRes');
    if (!a || !b) { rr.textContent = ''; return; }
    var pa = C.parseInput(a), pb = C.parseInput(b);
    if (!pa.ok) rr.textContent = 'A: ' + t(ERR[pa.error]); else if (!pb.ok) rr.textContent = 'B: ' + t(ERR[pb.error]); else rr.textContent = t('rel_' + C.relation(pa, pb));
  }

  /* ---------- ringkas (tidak bergantung pada alamat utama) ---------- */
  function renderSum() {
    var lines = $('sumIn').value.split(/\r?\n/), good = [], bad = $('sumBad'); bad.textContent = '';
    lines.forEach(function (l, i) { var s = l.trim(); if (!s) return; var p = C.parseInput(s); if (p.ok && !p.bare) good.push(p); else if (p.ok && p.bare) good.push(p); else bad.appendChild(el('li', null, t('sum_bad', { n: i + 1, text: s }))); });
    var out = C.summarize(good).map(function (c) { return ip(c.ip) + '/' + c.prefix; });
    $('sumOut').textContent = out.join('\n'); $('sumStat').textContent = good.length ? t('sum_stat', { a: num(good.length), b: num(out.length) }) : t('sum_empty');
    $('btnSumCopy').disabled = !out.length;
  }

  /* ---------- umum ---------- */
  function show() {
    $('pCalc').hidden = !(cur && tab === 'calc'); $('pSplit').hidden = !(cur && tab === 'split'); $('pCheck').hidden = !(cur && tab === 'check'); $('pSum').hidden = tab !== 'sum';
    $('empty').hidden = !!cur || tab === 'sum';
  }
  function update() {
    var raw = $('inp').value, err = $('err');
    if (raw.trim() === '') { cur = null; err.textContent = ''; show(); return; }
    var p = C.parseInput(raw);
    if (!p.ok) { cur = null; err.textContent = t(ERR[p.error] || 'e_format'); show(); return; }
    err.textContent = ''; cur = { p: p, c: C.calc(p.ip, p.prefix) }; show();
    renderCalc(); fillPrefixes(); renderSplit(); renderCheck();
  }
  $('inp').addEventListener('input', update);
  $('tabs').addEventListener('change', function (e) { tab = e.target.value; show(); });
  $('by').addEventListener('change', function () { if (cur) renderSplit(); });
  $('newp').addEventListener('change', function () { if (cur) renderSplit(); });
  $('cnt').addEventListener('input', function () { if (cur) renderSplit(); });
  ['chkIp', 'relA', 'relB'].forEach(function (id) { $(id).addEventListener('input', function () { if (cur || id !== 'chkIp') renderCheck2(); }); });
  function renderCheck2() { if (cur) renderCheck(); else { var rr = $('relRes'); var a = $('relA').value.trim(), b = $('relB').value.trim(); if (a && b) { var pa = C.parseInput(a), pb = C.parseInput(b); rr.textContent = !pa.ok ? 'A: ' + t(ERR[pa.error]) : !pb.ok ? 'B: ' + t(ERR[pb.error]) : t('rel_' + C.relation(pa, pb)); } else rr.textContent = ''; } }
  $('sumIn').addEventListener('input', renderSum);
  document.querySelector('.sn-ex').addEventListener('click', function (e) { var b = e.target.closest('[data-ex]'); if (b) { $('inp').value = b.getAttribute('data-ex'); update(); } });
  $('btnSample').addEventListener('click', function () {
    $('inp').value = '192.168.88.0/24'; $('chkIp').value = '192.168.88.200'; $('relA').value = '192.168.0.0/24'; $('relB').value = '192.168.0.0/16';
    $('sumIn').value = '192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24\n10.0.0.0/8\n10.1.0.0/16'; update(); renderSum();
  });
  $('btnCopyAll').addEventListener('click', function () { if (cur) copy(summaryText(cur.c), $('btnCopyAll'), function () { return t('copy_all'); }); });
  $('btnCsvCopy').addEventListener('click', function () { if (lastCsv) copy(lastCsv, $('btnCsvCopy'), function () { return t('csv_copy'); }); });
  $('btnCsvDl').addEventListener('click', function () { if (lastCsv) download('subnet.csv', lastCsv, 'text/csv;charset=utf-8'); });
  $('btnSumCopy').addEventListener('click', function () { copy($('sumOut').textContent, $('btnSumCopy'), function () { return t('sum_copy'); }); });

  I.onReady(function () { update(); renderSum(); });
  document.addEventListener('sagalait:lang', function () { update(); renderSum(); });
})();
