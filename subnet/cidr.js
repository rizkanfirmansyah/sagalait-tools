/* Logika murni kalkulator subnet IPv4 (tanpa DOM). Alamat disimpan sebagai bilangan 32-bit tak bertanda. */
(function (root) {
  'use strict';
  var ALL = 0xFFFFFFFF;

  function ipToInt(str) {
    var s = String(str == null ? '' : str).trim(), m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return { ok: false, error: 'format' };
    var n = 0, i;
    for (i = 1; i <= 4; i++) {
      if (m[i].length > 1 && m[i][0] === '0') return { ok: false, error: 'octal' }; // 010 bisa terbaca oktal
      if (+m[i] > 255) return { ok: false, error: 'octet' };
      n = n * 256 + Number(m[i]);
    }
    return { ok: true, n: n >>> 0 };
  }
  function intToIp(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function prefixMask(p) { return p === 0 ? 0 : (ALL << (32 - p)) >>> 0; }
  /* netmask harus kontigu (1 lalu 0); mengembalikan prefiks atau -1 */
  function maskToPrefix(mask) {
    var inv = (~mask) >>> 0;
    if ((inv & (inv + 1)) !== 0 && inv !== ALL) return -1; // inv harus 2^k - 1
    var p = 32, x = inv;
    while (x) { x >>>= 1; p--; }
    return p;
  }

  /* masukan: "a.b.c.d/24", "a.b.c.d/255.255.255.0", "a.b.c.d 255.255.255.0", atau IP saja (/32) */
  function parseInput(str) {
    var s = String(str == null ? '' : str).trim().replace(/\s*\/\s*/g, '/');
    if (s === '') return { ok: false, error: 'empty' };
    var ipPart, rest = '';
    var slash = s.indexOf('/');
    if (slash >= 0) { ipPart = s.slice(0, slash); rest = s.slice(slash + 1); }
    else { var parts = s.split(/\s+/); ipPart = parts[0]; rest = parts.slice(1).join(' '); if (parts.length > 2) return { ok: false, error: 'format' }; }
    var ip = ipToInt(ipPart); if (!ip.ok) return ip;
    if (slash >= 0 && rest === '') return { ok: false, error: 'prefix' };
    if (rest === '') return { ok: true, ip: ip.n, prefix: 32, bare: true };
    if (/^\d{1,2}$/.test(rest)) {
      if (rest.length > 1 && rest[0] === '0') return { ok: false, error: 'prefix' };
      var p = Number(rest); if (p > 32) return { ok: false, error: 'prefix' };
      return { ok: true, ip: ip.n, prefix: p };
    }
    var m = ipToInt(rest);
    if (!m.ok) return { ok: false, error: m.error === 'format' ? 'prefix' : m.error };
    var pp = maskToPrefix(m.n);
    if (pp < 0) return { ok: false, error: 'mask' };
    return { ok: true, ip: ip.n, prefix: pp };
  }

  var TYPES = [ // [awal, panjang prefiks, kode]
    ['0.0.0.0', 8, 'this'], ['10.0.0.0', 8, 'private'], ['100.64.0.0', 10, 'shared'], ['127.0.0.0', 8, 'loopback'], ['169.254.0.0', 16, 'linklocal'],
    ['172.16.0.0', 12, 'private'], ['192.0.2.0', 24, 'doc'], ['192.168.0.0', 16, 'private'], ['198.51.100.0', 24, 'doc'], ['203.0.113.0', 24, 'doc'],
    ['224.0.0.0', 4, 'multicast'], ['240.0.0.0', 4, 'reserved']
  ].map(function (r) { return { net: ipToInt(r[0]).n, p: r[1], code: r[2] }; });
  function typeOf(n) {
    for (var i = 0; i < TYPES.length; i++) if (((n & prefixMask(TYPES[i].p)) >>> 0) === TYPES[i].net) return TYPES[i].code;
    return 'public';
  }
  function classOf(n) { var a = n >>> 24; return a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D' : 'E'; }

  function calc(ip, prefix) {
    var mask = prefixMask(prefix), network = (ip & mask) >>> 0, wildcard = (~mask) >>> 0, broadcast = (network | wildcard) >>> 0, hosts, first, last;
    if (prefix === 32) { hosts = 1; first = last = network; }
    else if (prefix === 31) { hosts = 2; first = network; last = broadcast; }
    else { hosts = Math.pow(2, 32 - prefix) - 2; first = network + 1; last = broadcast - 1; }
    return { ip: ip, prefix: prefix, netmask: mask, wildcard: wildcard, network: network, broadcast: broadcast, hasBroadcast: prefix < 31, first: first, last: last, hosts: hosts, size: Math.pow(2, 32 - prefix), isNetwork: ip === network, klass: classOf(network), type: typeOf(network) };
  }

  /* 32 bit sebagai 4 oktet biner; `netBits` bit pertama adalah bagian jaringan */
  function binaryOctets(n, netBits) {
    var out = [], b = 0;
    for (var o = 0; o < 4; o++) {
      var s = '', bits = ((n >>> (24 - 8 * o)) & 255).toString(2).padStart(8, '0'), cells = [];
      for (var i = 0; i < 8; i++, b++) cells.push({ bit: bits[i], net: b < netBits });
      out.push(cells); s = null;
    }
    return out;
  }

  /* bagi jaringan: jumlah subnet = 2^(newPrefix - prefix); hanya `limit` pertama yang dikembalikan */
  function split(network, prefix, newPrefix, limit) {
    limit = limit || 256;
    if (!Number.isInteger(newPrefix) || newPrefix < prefix || newPrefix > 32) return { ok: false, error: 'prefix' };
    var total = Math.pow(2, newPrefix - prefix), step = Math.pow(2, 32 - newPrefix), base = (network & prefixMask(prefix)) >>> 0, list = [], n = Math.min(total, limit);
    for (var i = 0; i < n; i++) list.push((base + i * step) >>> 0);
    return { ok: true, total: total, shown: n, newPrefix: newPrefix, networks: list };
  }
  function prefixForCount(prefix, count) {
    if (!Number.isInteger(count) || count < 1) return -1;
    var bits = Math.ceil(Math.log2(count)); return prefix + bits > 32 ? -1 : prefix + bits;
  }
  function contains(network, prefix, ip) { return ((ip & prefixMask(prefix)) >>> 0) === ((network & prefixMask(prefix)) >>> 0); }
  function range(c) { var net = (c.ip & prefixMask(c.prefix)) >>> 0; return [net, (net | (~prefixMask(c.prefix) >>> 0)) >>> 0]; }
  /* hubungan dua CIDR: 'same' | 'a-in-b' | 'b-in-a' | 'overlap' | 'disjoint' (CIDR bersarang atau terpisah; 'overlap' tak terjadi pada CIDR) */
  function relation(a, b) {
    var ra = range(a), rb = range(b);
    if (ra[0] === rb[0] && ra[1] === rb[1]) return 'same';
    if (ra[0] >= rb[0] && ra[1] <= rb[1]) return 'a-in-b';
    if (rb[0] >= ra[0] && rb[1] <= ra[1]) return 'b-in-a';
    if (ra[0] <= rb[1] && rb[0] <= ra[1]) return 'overlap';
    return 'disjoint';
  }
  /* ringkas (supernetting): buang yang sudah tercakup, gabung dua saudara bersebelahan, ulangi */
  function summarize(list) {
    var items = list.map(function (c) { return { net: (c.ip & prefixMask(c.prefix)) >>> 0, p: c.prefix }; });
    var changed = true, i;
    while (changed) {
      changed = false;
      items.sort(function (a, b) { return a.net - b.net || a.p - b.p; });
      var out = [];
      for (i = 0; i < items.length; i++) {
        var it = items[i], prev = out[out.length - 1];
        if (prev && contains(prev.net, prev.p, it.net) && it.p >= prev.p) { changed = true; continue; }
        if (prev && prev.p === it.p && prev.p > 0 && (prev.net ^ it.net) >>> 0 === Math.pow(2, 32 - prev.p) && (prev.net & prefixMask(prev.p - 1)) >>> 0 === prev.net) {
          prev.p -= 1; changed = true; continue;
        }
        out.push({ net: it.net, p: it.p });
      }
      items = out;
    }
    return items.map(function (x) { return { ip: x.net, prefix: x.p }; });
  }
  function toCsv(networks, prefix) {
    var out = ['cidr,network,first,last,broadcast,hosts'];
    networks.forEach(function (n) { var c = calc(n, prefix); out.push([intToIp(n) + '/' + prefix, intToIp(c.network), intToIp(c.first), intToIp(c.last), c.hasBroadcast ? intToIp(c.broadcast) : '', c.hosts].join(',')); });
    return out.join('\r\n') + '\r\n';
  }

  var api = { ipToInt: ipToInt, intToIp: intToIp, prefixMask: prefixMask, maskToPrefix: maskToPrefix, parseInput: parseInput, calc: calc, binaryOctets: binaryOctets, split: split, prefixForCount: prefixForCount, contains: contains, relation: relation, summarize: summarize, toCsv: toCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Cidr = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
