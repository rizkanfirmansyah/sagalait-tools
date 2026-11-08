/* Mesin generator firewall: fungsi murni (tanpa DOM) supaya bisa diuji di Node.
   Tidak ada permintaan jaringan; semua keluaran berupa teks. */
(function (root) {
  'use strict';

  /* ---------- validasi alamat dan port ---------- */
  var V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  function p4(s) {
    if (!V4.test(s)) return null;
    return s.split('.').reduce(function (a, o) { return (a << 8n) | BigInt(o); }, 0n);
  }
  function p6(s) {
    if (s.indexOf(':') < 0 || !/^[0-9a-fA-F:.]+$/.test(s)) return null;
    var m = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) {
      var v = p4(m[1]); if (v === null) return null;
      s = s.slice(0, -m[1].length) + (v >> 16n).toString(16) + ':' + (v & 0xffffn).toString(16);
    }
    var parts = s.split('::'); if (parts.length > 2) return null;
    var g = function (x) { return x === '' ? [] : x.split(':'); };
    var a = g(parts[0]), b = parts.length === 2 ? g(parts[1]) : [];
    if (!a.concat(b).every(function (h) { return /^[0-9a-fA-F]{1,4}$/.test(h); })) return null;
    if (parts.length === 1 ? a.length !== 8 : a.length + b.length > 7) return null;
    var full = a.concat(new Array(8 - a.length - b.length).fill('0'), b);
    return full.reduce(function (acc, h) { return (acc << 16n) | BigInt('0x' + h); }, 0n);
  }
  function fmt(v, fam) {
    if (fam === 4) return [24n, 16n, 8n, 0n].map(function (sh) { return String((v >> sh) & 255n); }).join('.');
    var o = []; for (var i = 7n; i >= 0n; i--) o.push(((v >> (i * 16n)) & 0xffffn).toString(16)); return o.join(':');
  }
  /* Satu alamat atau CIDR -> objek, atau null bila tidak valid. Bit host dinormalkan. */
  function cidr(tok) {
    var i = tok.indexOf('/'), a = i < 0 ? tok : tok.slice(0, i), pr = i < 0 ? null : tok.slice(i + 1);
    var fam = 4, bits = 32, v = p4(a);
    if (v === null) { v = p6(a); fam = 6; bits = 128; }
    if (v === null) return null;
    var pl = bits;
    if (pr !== null) { if (!/^\d{1,3}$/.test(pr)) return null; pl = +pr; if (pl > bits) return null; }
    var all = (1n << BigInt(bits)) - 1n, host = (1n << BigInt(bits - pl)) - 1n, lo = v & (all ^ host);
    var text = pr === null || v === lo ? tok.toLowerCase() : fmt(lo, fam) + '/' + pl;
    return { fam: fam, pl: pl, lo: lo, hi: lo | host, text: text, isHost: pl === bits };
  }
  function addrs(text) {
    var r = { v4: [], v6: [], all: [], bad: [] };
    (text || '').split(/[\s,;]+/).filter(Boolean).forEach(function (t) {
      var c = cidr(t);
      if (!c) r.bad.push(t); else { r.all.push(c); (c.fam === 4 ? r.v4 : r.v6).push(c.text); }
    });
    return r;
  }
  function overlap(a, b) { return a.fam === b.fam && a.lo <= b.hi && b.lo <= a.hi; }
  function port(s) {
    s = String(s == null ? '' : s).trim();
    var m = /^(\d{1,5})$/.exec(s);
    if (m) { var n = +m[1]; return n >= 1 && n <= 65535 ? { lo: n, hi: n, t: String(n) } : null; }
    m = /^(\d{1,5})-(\d{1,5})$/.exec(s);
    if (m) { var x = +m[1], y = +m[2]; return x >= 1 && y <= 65535 && x < y ? { lo: x, hi: y, t: x + '-' + y } : null; }
    return null;
  }
  function ports(text) {
    var r = { ok: [], bad: [] };
    (text || '').split(/[\s,;]+/).filter(Boolean).forEach(function (t) { var p = port(t); if (p) r.ok.push(p); else r.bad.push(t); });
    return r;
  }
  var NAME = /^[A-Za-z0-9_.-]{1,32}$/;      // antarmuka atau list: tidak boleh ada kutip, spasi, tanda $ atau ]
  var LABEL = /^[A-Za-z0-9_. -]{0,32}$/;    // keterangan bebas yang masuk ke comment
  var IFACE = /^[A-Za-z0-9_.:-]{1,15}\*?$/; // nama antarmuka Linux, boleh berakhiran *
  function protos(p) { return p === 'both' ? ['tcp', 'udp'] : [p === 'udp' ? 'udp' : 'tcp']; }
  function wide(c) { return c.pl === 0; }

  /* ---------- keadaan awal dan preset ---------- */
  var SV = {
    ssh: [22, 'tcp', 'SSH'], http: [80, 'tcp', 'HTTP'], https: [443, 'tcp', 'HTTPS'],
    wg: [51820, 'udp', 'WireGuard'], pve: [8006, 'tcp', 'Proxmox'], graf: [3000, 'tcp', 'Grafana'],
    prom: [9090, 'tcp', 'Prometheus'], nodeexp: [9100, 'tcp', 'node exporter']
  };
  function blankSvc() { var o = {}; Object.keys(SV).forEach(function (k) { o[k] = { on: false, src: '' }; }); return o; }
  function defaults() {
    return {
      target: 'mt',
      mt: {
        ver: '7', profile: 'home', wan: 'WAN', lan: 'LAN', lanSubnet: '192.168.88.0/24', mgmt: '',
        mport: { ssh: true, winbox: true, https: false, api: false, apissl: false }, mcustom: '',
        lanMode: 'all', lanSvc: { dns: true, ntp: true, dhcp: true }, vpnSubnet: '', vpnPort: '',
        icmp: true, brute: true, fwd: true, fasttrack: true, masq: true, moveTop: true, wanIp: '', pf: []
      },
      lx: {
        fw: 'nft', profile: 'general', wan: '', lan: '', mgmt: '', mports: '22', svc: blankSvc(), custom: [],
        icmp: true, sshRate: true, lanOpen: false, fwdLan: false, masq: false, bridges: '', pf: []
      }
    };
  }
  var PRESET_MT = {
    home: { fwd: true, fasttrack: true, masq: true },
    router: { fwd: false, fasttrack: false, masq: false }
  };
  function presetMT(m, name) {
    m.profile = name; Object.assign(m, PRESET_MT[name]);
    if (name === 'router') m.pf = [];
  }
  function presetLX(l, name) {
    l.profile = name; l.svc = blankSvc(); l.svc.ssh.on = true; l.mports = '22';
    l.lanOpen = l.fwdLan = l.masq = false; l.bridges = '';
    if (name === 'proxmox') { l.svc.pve.on = true; l.mports = '22, 8006'; l.bridges = 'vmbr*'; }
    if (name === 'web') { l.svc.http.on = true; l.svc.https.on = true; }
    if (name === 'router') { l.lanOpen = l.fwdLan = l.masq = true; }
  }
  function example(st) {
    if (st.target === 'mt') {
      Object.assign(st.mt, {
        mgmt: '192.168.88.0/24, 10.10.10.0/24', vpnSubnet: '10.10.10.0/24', wanIp: '203.0.113.10',
        pf: [{ name: 'web internal', proto: 'tcp', ext: '8080', ip: '192.168.88.20', port: '80', hairpin: true }]
      });
    } else {
      presetLX(st.lx, 'router');
      Object.assign(st.lx, { wan: 'eth0', lan: 'eth1', mgmt: '192.168.1.0/24, 10.10.10.0/24, fd00:10::/64' });
      st.lx.svc.wg.on = true; st.lx.svc.graf.on = true; st.lx.svc.graf.src = '192.168.1.0/24';
      st.lx.pf = [{ name: 'web', proto: 'tcp', ext: '8080', ip: '192.168.1.20', port: '80', hairpin: false }];
    }
  }

  /* ---------- bantuan umum ---------- */
  function Ctx() { this.E = {}; this.W = []; }
  Ctx.prototype.err = function (k, m) { if (!this.E[k]) this.E[k] = m; };
  Ctx.prototype.warn = function (lv, title, text) { this.W.push({ lv: lv, title: title, text: text }); };
  var EMPTY_MGMT = 'Isi alamat yang boleh mengelola perangkat, mis. 192.168.88.0/24. Tanpa isian ini tidak ada aturan yang dihasilkan, supaya Anda tidak terkunci dari perangkat.';

  function checkMgmt(cx, text, key, v6ok, lanCidr) {
    var a = addrs(text);
    if (!a.all.length && !a.bad.length) { cx.err(key, EMPTY_MGMT); cx.empty = true; return a; }
    if (a.bad.length) cx.err(key, 'Tidak valid: ' + a.bad.join(', ') + '. Pakai alamat IP atau CIDR, mis. 192.168.88.0/24 atau 10.0.0.5, dipisah koma atau baris baru.');
    else if (a.v6.length && !v6ok) cx.err(key, 'Bagian ini hanya mendukung IPv4. Hapus alamat IPv6 (' + a.v6.join(', ') + ') atau pakai nftables untuk IPv6.');
    if (a.all.some(wide)) cx.warn('error', 'Alamat manajemen terbuka untuk seluruh internet', 'Ada entri dengan prefiks /0. Port manajemen bisa dijangkau siapa saja. Ganti dengan alamat atau subnet yang Anda pakai (LAN, VPN).');
    else if (a.all.length && a.all.every(function (c) { return c.isHost; }))
      cx.warn('warning', 'Hanya host tunggal yang boleh mengelola', 'Bila alamat IP Anda berganti (DHCP, ganti jaringan) Anda terkunci. Tambahkan subnet LAN atau VPN sebagai jalur cadangan.');
    if (lanCidr && a.all.length && !a.all.some(function (c) { return overlap(c, lanCidr); }))
      cx.warn('warning', 'Alamat manajemen tidak mencakup subnet LAN', 'Pastikan Anda mengelola dari salah satu alamat yang terdaftar. Alamat Anda saat ini tidak bisa dideteksi dari halaman ini.');
    return a;
  }

  function parseForwards(cx, list, kp, needLanIp) {
    var out = [];
    list.forEach(function (f, i) {
      var k = kp + i, ok = true, ext = port(f.ext), ip = cidr((f.ip || '').trim()), inp = (f.port || '').trim() ? port(f.port) : null;
      if (!LABEL.test(f.name || '')) { cx.err(k + '-name', 'Nama hanya boleh huruf, angka, spasi, titik, garis bawah, dan tanda hubung (maks. 32).'); ok = false; }
      if (!ext) { cx.err(k + '-ext', 'Port luar harus 1-65535 atau rentang seperti 8000-8010.'); ok = false; }
      if (!ip || !ip.isHost || (needLanIp && ip.fam !== 4)) { cx.err(k + '-ip', needLanIp ? 'Alamat dalam harus satu alamat IPv4, mis. 192.168.88.20.' : 'Alamat dalam harus satu alamat IP, mis. 192.168.1.20.'); ok = false; }
      if ((f.port || '').trim() && !inp) { cx.err(k + '-port', 'Port dalam harus 1-65535 (satu port).'); ok = false; }
      else if (inp && inp.lo !== inp.hi) { cx.err(k + '-port', 'Port dalam harus satu port.'); ok = false; }
      else if (ext && ext.lo !== ext.hi && inp) { cx.err(k + '-port', 'Port luar berupa rentang: kosongkan port dalam agar port tetap sama.'); ok = false; }
      if (ok) out.push({ name: (f.name || '').trim() || 'forward ' + (i + 1), protos: protos(f.proto), ext: ext, ip: ip.text, fam: ip.fam, port: inp, hairpin: !!f.hairpin });
    });
    return out;
  }

  /* ---------- MikroTik ---------- */
  var MP = { ssh: [22, 'SSH'], winbox: [8291, 'Winbox'], https: [443, 'WebFig HTTPS'], api: [8728, 'API'], apissl: [8729, 'API-SSL'] };
  var MT_BEFORE = [
    { text: 'Buka koneksi cadangan ke router yang tidak lewat jalur yang sedang Anda ubah, mis. Winbox via MAC address atau konsol serial.' },
    { text: 'Lihat aturan yang sudah ada. Periksa duplikat dan aturan drop lama yang bisa bertabrakan dengan aturan baru.', cmd: '/ip firewall filter print\n/ip firewall nat print' },
    { text: 'Buat cadangan konfigurasi dan salin berkasnya keluar dari router.', cmd: '/export file=sebelum-firewall\n/system backup save name=sebelum-firewall' },
    { text: 'Aktifkan Safe Mode (Winbox: tombol Safe Mode; terminal: Ctrl+X), lalu tempel skrip. Uji akses dari perangkat lain atau sesi kedua. Bila yakin, keluar dari Safe Mode (Ctrl+X lagi) untuk menyimpan. Bila koneksi terputus, perubahan dibatalkan otomatis.' }
  ];
  function genMT(s) {
    var cx = new Ctx(), L = [], n = { filter: 0, nat: 0, addr: 0 };
    var wan = (s.wan || '').trim(), lan = (s.lan || '').trim();
    if (!NAME.test(wan)) cx.err('mt-wan', 'Nama interface list WAN harus 1-32 karakter: huruf, angka, titik, garis bawah, tanda hubung.');
    if (!NAME.test(lan)) cx.err('mt-lan', 'Nama interface list LAN harus 1-32 karakter: huruf, angka, titik, garis bawah, tanda hubung.');
    if (wan && wan === lan) cx.err('mt-lan', 'WAN dan LAN tidak boleh memakai nama list yang sama.');
    var ls = null;
    if ((s.lanSubnet || '').trim()) { ls = cidr(s.lanSubnet.trim()); if (!ls || ls.fam !== 4) cx.err('mt-lanSubnet', 'Subnet LAN harus CIDR IPv4, mis. 192.168.88.0/24.'); }
    var mg = checkMgmt(cx, s.mgmt, 'mt-mgmt', false, ls);
    var mp = [];
    Object.keys(MP).forEach(function (k) { if (s.mport[k]) mp.push(MP[k][0]); });
    var cp = ports(s.mcustom);
    if (cp.bad.length) cx.err('mt-mcustom', 'Port tidak valid: ' + cp.bad.join(', ') + '. Pakai 1-65535 atau rentang, dipisah koma.');
    cp.ok.forEach(function (p) { mp.push(p.t); });
    mp = mp.filter(function (v, i) { return mp.indexOf(v) === i; });
    if (!mp.length && !cp.bad.length) cx.err('mt-mport', 'Pilih minimal satu port manajemen (mis. SSH 22 atau Winbox 8291).');
    if (mp.length > 15) cx.err('mt-mcustom', 'Terlalu banyak port manajemen (maks. 15 dalam satu aturan).');
    var vpn = null;
    if ((s.vpnSubnet || '').trim()) { vpn = cidr(s.vpnSubnet.trim()); if (!vpn || vpn.fam !== 4) cx.err('mt-vpnSubnet', 'Subnet VPN harus CIDR IPv4, mis. 10.10.10.0/24.'); }
    var vp = null;
    if ((s.vpnPort || '').trim()) {
      var m = /^(\d{1,5})(?:\/(tcp|udp))?$/.exec(s.vpnPort.trim());
      vp = m && port(m[1]) ? { p: port(m[1]).t, proto: m[2] || 'udp' } : null;
      if (!vp) cx.err('mt-vpnPort', 'Pakai format port atau port/protokol, mis. 51820/udp.');
    }
    var fw = s.fwd ? parseForwards(cx, s.pf, 'mt-pf', true) : [];
    if (s.fwd && s.pf.length === fw.length && fw.some(function (f) { return f.hairpin; })) {
      if (!ls) cx.err('mt-lanSubnet', 'NAT hairpin butuh subnet LAN. Isi subnet LAN.');
      if (!(s.wanIp || '').trim() || !cidr(s.wanIp.trim()) || cidr(s.wanIp.trim()).fam !== 4 || !cidr(s.wanIp.trim()).isHost) cx.err('mt-wanIp', 'NAT hairpin butuh alamat IPv4 publik WAN (satu alamat), mis. 203.0.113.10.');
    }
    if (!s.fwd && s.pf.length) cx.warn('info', 'Port forward diabaikan', 'Chain forward dimatikan, jadi port forward tidak dihasilkan. Nyalakan "Atur chain forward" untuk memakainya.');
    if (cx.empty || Object.keys(cx.E).length) return { errors: cx.E, warnings: cx.W, empty: !!cx.empty, script: null };

    var C = 'sagalait-fw';
    function q(t) { return '"' + C + ': ' + t + '"'; }
    function F(chain, attrs, t) { n.filter++; L.push('/ip firewall filter add chain=' + chain + ' ' + attrs + ' comment=' + q(t)); }
    function N(attrs, t) { n.nat++; L.push('/ip firewall nat add ' + attrs + ' comment=' + q(t)); }
    function sec(t) { L.push('', '# ' + t); }
    var v7 = s.ver === '7';
    L.push('# Generator firewall SagalaIT, RouterOS ' + s.ver,
      '# PERHATIAN: skrip ini BELUM dijalankan di perangkat RouterOS nyata. Uji dengan Safe Mode.',
      '# Semua aturan bertanda comment="' + C + ': ..." supaya mudah dihapus sekaligus.');

    sec('Daftar alamat manajemen');
    mg.all.forEach(function (c) { n.addr++; L.push('/ip firewall address-list add list=sagalait-fw-mgmt address=' + c.text + ' comment=' + q('alamat manajemen')); });

    sec('Chain input (urutan penting: manajemen sebelum drop)');
    F('input', 'connection-state=established,related,untracked action=accept', 'terima koneksi yang sudah ada');
    F('input', 'connection-state=invalid action=drop', 'buang paket invalid');
    if (s.icmp) F('input', 'protocol=icmp action=accept', 'terima ping (ICMP)');
    F('input', 'protocol=tcp dst-port=' + mp.join(',') + ' src-address-list=sagalait-fw-mgmt action=accept', 'terima manajemen dari alamat yang diizinkan');
    if (s.lanMode === 'all') F('input', 'in-interface-list=' + lan + ' action=accept', 'terima semua dari LAN');
    else {
      if (s.lanSvc.dns) { F('input', 'in-interface-list=' + lan + ' protocol=udp dst-port=53 action=accept', 'DNS dari LAN (udp)'); F('input', 'in-interface-list=' + lan + ' protocol=tcp dst-port=53 action=accept', 'DNS dari LAN (tcp)'); }
      if (s.lanSvc.ntp) F('input', 'in-interface-list=' + lan + ' protocol=udp dst-port=123 action=accept', 'NTP dari LAN');
      if (s.lanSvc.dhcp) F('input', 'in-interface-list=' + lan + ' protocol=udp dst-port=67 action=accept', 'DHCP server untuk LAN');
    }
    if (vpn) F('input', 'src-address=' + vpn.text + ' action=accept', 'terima dari subnet VPN');
    if (vp) F('input', 'in-interface-list=' + wan + ' protocol=' + vp.proto + ' dst-port=' + vp.p + ' action=accept', 'port VPN dari WAN');
    if (s.brute) {
      var bp = []; if (s.mport.ssh) bp.push('22'); if (s.mport.winbox) bp.push('8291');
      if (bp.length) {
        var b = 'protocol=tcp dst-port=' + bp.join(',');
        F('input', b + ' src-address-list=sagalait-fw-blacklist action=drop', 'buang pelaku brute force (blacklist)');
        F('input', b + ' connection-state=new src-address-list=sagalait-fw-bf3 action=add-src-to-address-list address-list=sagalait-fw-blacklist address-list-timeout=1d', 'brute force tahap 3 ke blacklist 1 hari');
        F('input', b + ' connection-state=new src-address-list=sagalait-fw-bf2 action=add-src-to-address-list address-list=sagalait-fw-bf3 address-list-timeout=1m', 'brute force tahap 2');
        F('input', b + ' connection-state=new src-address-list=sagalait-fw-bf1 action=add-src-to-address-list address-list=sagalait-fw-bf2 address-list-timeout=1m', 'brute force tahap 1');
        F('input', b + ' connection-state=new action=add-src-to-address-list address-list=sagalait-fw-bf1 address-list-timeout=1m', 'brute force tahap awal');
      } else cx.warn('info', 'Perlindungan brute force tidak dihasilkan', 'Perlindungan ini hanya untuk port SSH (22) dan Winbox (8291). Aktifkan salah satunya di port manajemen.');
    }
    F('input', 'in-interface-list=!' + lan + ' action=drop', 'buang semua yang masuk dari luar LAN');

    if (s.fwd) {
      sec('Chain forward');
      if (s.fasttrack) F('forward', 'connection-state=established,related action=fasttrack-connection', 'fasttrack koneksi yang sudah ada');
      F('forward', 'connection-state=established,related,untracked action=accept', 'terima koneksi yang sudah ada');
      F('forward', 'connection-state=invalid action=drop', 'buang paket invalid');
      F('forward', 'in-interface-list=' + lan + ' out-interface-list=' + wan + ' action=accept', 'terima LAN ke WAN');
      if (fw.length) F('forward', 'connection-nat-state=dstnat action=accept', 'terima port forward (dst-nat)');
      F('forward', 'in-interface-list=' + wan + ' action=drop', 'buang sisanya dari WAN');
    }
    if (s.masq || fw.length) {
      sec('NAT');
      if (s.masq) N('chain=srcnat action=masquerade out-interface-list=' + wan, 'masquerade WAN');
      fw.forEach(function (f) {
        f.protos.forEach(function (pr) {
          var to = ' to-addresses=' + f.ip + (f.port ? ' to-ports=' + f.port.t : '');
          N('chain=dstnat action=dst-nat protocol=' + pr + ' dst-port=' + f.ext.t + ' in-interface-list=' + wan + to, 'forward ' + f.name + ' (' + pr + ')');
          if (f.hairpin) {
            N('chain=dstnat action=dst-nat protocol=' + pr + ' dst-port=' + f.ext.t + ' in-interface-list=' + lan + ' dst-address=' + s.wanIp.trim() + to, 'hairpin ' + f.name + ' (' + pr + ')');
            N('chain=srcnat action=masquerade protocol=' + pr + ' src-address=' + ls.text + ' dst-address=' + f.ip + (f.port ? ' dst-port=' + f.port.t : ' dst-port=' + f.ext.t) + ' out-interface-list=' + lan, 'hairpin masquerade ' + f.name + ' (' + pr + ')');
          }
        });
      });
    }
    if (s.moveTop) {
      sec('Pindahkan aturan ke atas aturan lama (urutan relatif aturan ini tetap)');
      L.push('/ip firewall filter move [find where comment~"' + C + '" chain=input] destination=0');
      if (s.fwd) L.push('/ip firewall filter move [find where comment~"' + C + '" chain=forward] destination=0');
    }
    L.push('');

    /* peringatan */
    if (s.lanMode !== 'all' && !(ls && mg.all.some(function (c) { return overlap(c, ls); })))
      cx.warn('error', 'Winbox dari LAN akan diblokir', 'Mode LAN terbatas hanya membuka layanan yang dipilih. Karena alamat manajemen tidak mencakup subnet LAN, Anda tidak bisa mengelola router dari LAN. Tambahkan subnet LAN ke alamat manajemen.');
    if (s.mport.api) cx.warn('warning', 'API (8728) tidak terenkripsi', 'Pakai API-SSL (8729) bila memungkinkan.');
    if (mg.all.some(function (c) { return c.pl < 8 && c.pl > 0; })) cx.warn('warning', 'Alamat manajemen sangat luas', 'Prefiks di bawah /8 mencakup banyak alamat. Persempit ke subnet yang benar-benar Anda pakai.');
    cx.warn('warning', 'IPv6 tidak dicakup', 'Skrip ini hanya mengatur /ip firewall (IPv4). Bila IPv6 aktif di router, atur /ipv6 firewall secara terpisah; tanpa itu lalu lintas IPv6 tidak terlindungi.');
    cx.warn('warning', 'Aturan harus berada di atas aturan drop lama', 'Aturan yang menerima harus di atas aturan drop yang sudah ada, kalau tidak tidak pernah dipakai.' + (s.moveTop ? ' Skrip memindahkan aturannya ke posisi paling atas (move destination=0).' : ' Pemindahan otomatis dimatikan: pindahkan sendiri atau hapus aturan lama yang bentrok.') + ' Cek dengan /ip firewall filter print dan hapus duplikat.');
    cx.warn('info', 'Menjalankan ulang membuat duplikat', 'Skrip memakai add. Sebelum menjalankan ulang, jalankan dulu blok "Cara membatalkan".');
    if (s.fwd && s.fasttrack) cx.warn('info', 'Fasttrack melewati queue dan mangle', 'Koneksi yang di-fasttrack tidak diproses oleh Simple Queue, mangle, dan beberapa fitur lain. Matikan fasttrack bila Anda memakai queue.');
    if (fw.length) cx.warn('warning', 'Port forward membuka layanan ke internet', 'Pastikan layanan di ' + fw.map(function (f) { return f.ip; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + ' memakai autentikasi kuat dan selalu diperbarui.');
    if (!v7) cx.warn('info', 'RouterOS 6', 'Fasttrack butuh RouterOS 6.29 atau lebih baru. Sintaks selain itu sama dengan v7; skrip belum diperiksa pada v6 nyata. Aturan dipindahkan dengan move, bukan place-before.');

    return {
      errors: {}, warnings: cx.W, script: L.join('\n'), counts: n, file: 'firewall-sagalait.rsc',
      before: MT_BEFORE,
      undo: '/ip firewall filter remove [find where comment~"' + C + '"]\n/ip firewall nat remove [find where comment~"' + C + '"]\n/ip firewall address-list remove [find where list~"' + C + '"]',
      check: '/ip firewall filter print where comment~"' + C + '"\n/ip firewall nat print where comment~"' + C + '"\n/ip firewall address-list print where list~"' + C + '"\n/ip firewall connection print count-only',
      notes: []
    };
  }

  /* ---------- Linux ---------- */
  function setOf(a) { return a.length === 1 ? a[0] : '{ ' + a.join(', ') + ' }'; }
  function genLX(s) {
    var cx = new Ctx(), nft = s.fw === 'nft';
    var wan = (s.wan || '').trim(), lan = (s.lan || '').trim();
    if (wan && !IFACE.test(wan)) cx.err('lx-wan', 'Nama antarmuka WAN tidak valid (maks. 15 karakter, tanpa spasi atau kutip), mis. eth0.');
    if (lan && !IFACE.test(lan)) cx.err('lx-lan', 'Nama antarmuka LAN tidak valid (maks. 15 karakter, tanpa spasi atau kutip), mis. eth1.');
    var mg = checkMgmt(cx, s.mgmt, 'lx-mgmt', nft, null);
    var mp = ports(s.mports);
    if (mp.bad.length) cx.err('lx-mports', 'Port tidak valid: ' + mp.bad.join(', ') + '. Pakai 1-65535 atau rentang, dipisah koma.');
    else if (!mp.ok.length) cx.err('lx-mports', 'Isi minimal satu port manajemen, mis. 22.');
    else if (mp.ok.length > 15) cx.err('lx-mports', 'Maksimal 15 port manajemen.');
    var br = (s.bridges || '').split(/[\s,;]+/).filter(Boolean);
    if (br.some(function (b) { return !IFACE.test(b); })) cx.err('lx-bridges', 'Nama antarmuka tidak valid. Pisahkan dengan koma, boleh berakhiran *, mis. docker0, br-*.');
    var fwdNeedWan = s.fwdLan || s.masq;
    if (fwdNeedWan && !wan) cx.err('lx-wan', 'Isi antarmuka WAN (dibutuhkan untuk NAT dan forward LAN ke WAN).');
    if ((s.fwdLan || s.lanOpen) && !lan) cx.err('lx-lan', 'Isi antarmuka LAN (dibutuhkan untuk opsi LAN yang dipilih).');
    /* layanan */
    var svc = [];
    function srcOf(text, k) {
      var a = addrs(text);
      if (a.bad.length) cx.err(k, 'Tidak valid: ' + a.bad.join(', ') + '. Pakai alamat IP atau CIDR.');
      else if (a.v6.length && !nft) cx.err(k, 'iptables di sini hanya IPv4. Hapus alamat IPv6 atau pakai nftables.');
      return a;
    }
    Object.keys(SV).forEach(function (k) {
      if (s.svc[k] && s.svc[k].on) svc.push({ key: k, name: SV[k][2], p: port(SV[k][0]), protos: [SV[k][1]], src: srcOf(s.svc[k].src, 'lx-svc-' + k) });
    });
    s.custom.forEach(function (c, i) {
      var p = port(c.port), k = 'lx-cs' + i;
      if (!p) cx.err(k + '-port', 'Port harus 1-65535 atau rentang seperti 8000-8010.');
      var src = srcOf(c.src, k + '-src');
      if (p) svc.push({ key: 'custom', name: 'kustom ' + p.t, p: p, protos: protos(c.proto), src: src });
    });
    var fw = parseForwards(cx, s.pf, 'lx-pf', false);
    if (s.pf.length && !wan) cx.err('lx-wan', 'Port forward butuh nama antarmuka WAN.');
    if (!nft && fw.some(function (f) { return f.fam !== 4; })) cx.err('lx-pf0-ip', 'iptables di sini hanya IPv4. Pakai alamat dalam IPv4 atau nftables.');
    if (cx.empty || Object.keys(cx.E).length) return { errors: cx.E, warnings: cx.W, empty: !!cx.empty, script: null };

    var mpt = mp.ok.map(function (p) { return p.t; });
    var needNat = s.masq || fw.length > 0;
    var T = 'sagalait_fw', out = [], ind = '    ';
    var file = nft ? 'sagalait-fw.nft' : 'sagalait-fw.rules';
    var undo, before, notes = [];

    if (nft) {
      var pf4 = function (a) { return a.v4.length ? 'ip saddr ' + setOf(a.v4) + ' ' : null; };
      var pf6 = function (a) { return a.v6.length ? 'ip6 saddr ' + setOf(a.v6) + ' ' : null; };
      var pfx = function (a) { var r = [pf4(a), pf6(a)].filter(Boolean); return r.length ? r : ['']; };
      var pr = function (p) { return p.lo === p.hi ? String(p.lo) : p.t; };
      out.push('# Generator firewall SagalaIT: nftables (hanya mengubah tabel inet ' + T + ')',
        '# Berkas ini TIDAK memakai "flush ruleset", jadi aturan Docker, fail2ban, dan tabel lain tidak tersentuh.',
        'table inet ' + T, 'delete table inet ' + T, '',
        'table inet ' + T + ' {', '  chain input {', ind + 'type filter hook input priority 0; policy drop;',
        ind + 'ct state established,related accept', ind + 'ct state invalid drop', ind + 'iifname "lo" accept',
        ind + '# manajemen dari alamat yang diizinkan (lebih dulu dari aturan lain)');
      pfx(mg).forEach(function (p) { out.push(ind + p + 'tcp dport ' + setOf(mpt) + ' accept'); });
      if (s.lanOpen) out.push(ind + '# semua dari LAN', ind + 'iifname "' + lan + '" accept');
      out.push(ind + '# ICMPv6 yang dibutuhkan (neighbor discovery dll) dan ICMP error',
        ind + 'icmpv6 type { destination-unreachable, packet-too-big, time-exceeded, parameter-problem, nd-router-solicit, nd-router-advert, nd-neighbor-solicit, nd-neighbor-advert } accept',
        ind + 'icmp type { destination-unreachable, time-exceeded, parameter-problem } accept');
      if (s.icmp) out.push(ind + 'icmp type echo-request limit rate 10/second accept', ind + 'icmpv6 type echo-request limit rate 10/second accept');
      if (svc.length) out.push(ind + '# layanan yang dibuka');
      svc.forEach(function (v) {
        v.protos.forEach(function (proto) {
          pfx(v.src).forEach(function (p) {
            if (s.sshRate && v.key === 'ssh') {
              var fams = p === '' ? ['ip', 'ip6'] : [p.indexOf('ip6') === 0 ? 'ip6' : 'ip'];
              fams.forEach(function (f) { out.push(ind + p + 'tcp dport ' + pr(v.p) + ' ct state new meter sagalait_ssh_' + f + ' { ' + f + ' saddr limit rate over 6/minute burst 5 packets } drop'); });
            }
            out.push(ind + p + proto + ' dport ' + pr(v.p) + ' accept');
          });
        });
      });
      out.push('  }', '', '  chain forward {', ind + 'type filter hook forward priority 0; policy drop;', ind + 'ct state established,related accept', ind + 'ct state invalid drop');
      if (br.length) out.push(ind + '# bridge/container yang dibiarkan meneruskan lalu lintas', ind + 'iifname ' + setOf(br.map(function (b) { return '"' + b + '"'; })) + ' accept', ind + 'oifname ' + setOf(br.map(function (b) { return '"' + b + '"'; })) + ' ct state established,related accept');
      if (s.fwdLan) out.push(ind + 'iifname "' + lan + '" oifname "' + wan + '" accept');
      if (fw.length) out.push(ind + 'ct status dnat accept');
      out.push('  }');
      if (fw.length) {
        out.push('', '  chain prerouting {', ind + 'type nat hook prerouting priority -100; policy accept;');
        fw.forEach(function (f) {
          f.protos.forEach(function (proto) {
            out.push(ind + 'iifname "' + wan + '" ' + proto + ' dport ' + f.ext.t + ' dnat ' + (f.fam === 4 ? 'ip to ' + f.ip : 'ip6 to [' + f.ip + ']') + (f.port ? ':' + f.port.t : '') + ' comment "' + f.name + '"');
          });
        });
        out.push('  }');
      }
      if (s.masq) out.push('', '  chain postrouting {', ind + 'type nat hook postrouting priority 100; policy accept;', ind + 'oifname "' + wan + '" masquerade', '  }');
      out.push('}');
      undo = 'sudo nft delete table inet ' + T;
      before = [
        { text: 'Simpan hasil sebagai /root/sagalait-fw.nft, dan pastikan Anda punya sesi cadangan (konsol atau sesi SSH kedua) yang tetap terbuka.' },
        { text: 'Cadangkan aturan yang berjalan sekarang.', cmd: 'sudo nft list ruleset > /root/nft-sebelum.nft' },
        { text: 'Periksa sintaks. Mode periksa tidak mengubah sistem.', cmd: 'sudo nft -c -f /root/sagalait-fw.nft' },
        { text: 'Terapkan dengan pembatalan otomatis: bila dalam 120 detik Anda tidak membatalkan timernya, tabel sagalait_fw dihapus (hanya tabel itu; aturan lain tidak tersentuh).', cmd: "sudo systemd-run --on-active=120 --unit=sagalait-fw-rollback \\\n    /bin/sh -c 'nft delete table inet " + T + "'\nsudo nft -f /root/sagalait-fw.nft" },
        { text: 'Dari sesi LAIN, uji bahwa akses manajemen masih jalan (ssh baru). Hanya bila aman, batalkan pembatalan otomatis.', cmd: 'sudo systemctl stop sagalait-fw-rollback.timer' },
        { text: 'Agar permanen setelah reboot: simpan sebagai berkas terpisah dan muat dari konfigurasi nftables. Hati-hati: /etc/nftables.conf bawaan Debian dan Ubuntu berisi "flush ruleset" yang menghapus aturan Docker saat layanan dimuat ulang.', cmd: 'sudo install -m 600 /root/sagalait-fw.nft /etc/nftables.d/sagalait-fw.nft   # buat folder bila belum ada\n# tambahkan baris ini di /etc/nftables.conf:  include "/etc/nftables.d/*.nft"\nsudo systemctl enable nftables' }
      ];
    } else {
      var P = function (p) { return p.lo === p.hi ? String(p.lo) : p.lo + ':' + p.hi; };
      var src4 = function (a) { return a.v4.length ? a.v4.map(function (x) { return '-s ' + x + ' '; }) : ['']; };
      var I = function (b) { return b.replace(/\*$/, '+'); };
      out.push('# Generator firewall SagalaIT: iptables-restore --noflush (hanya IPv4)',
        '# Tidak menyentuh aturan Docker/fail2ban: memakai chain sendiri SAGALAIT_IN, SAGALAIT_FWD, dst.',
        '*filter', ':SAGALAIT_IN - [0:0]', ':SAGALAIT_FWD - [0:0]',
        '-A SAGALAIT_IN -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT',
        '-A SAGALAIT_IN -m conntrack --ctstate INVALID -j DROP', '-A SAGALAIT_IN -i lo -j ACCEPT',
        '# manajemen dari alamat yang diizinkan (lebih dulu dari aturan lain)');
      src4(mg).forEach(function (p) { out.push('-A SAGALAIT_IN ' + p + '-p tcp -m multiport --dports ' + mp.ok.map(P).join(',') + ' -j ACCEPT'); });
      if (s.lanOpen) out.push('-A SAGALAIT_IN -i ' + I(lan) + ' -j ACCEPT');
      out.push('-A SAGALAIT_IN -p icmp -m icmp --icmp-type destination-unreachable -j ACCEPT', '-A SAGALAIT_IN -p icmp -m icmp --icmp-type time-exceeded -j ACCEPT');
      if (s.icmp) out.push('-A SAGALAIT_IN -p icmp -m icmp --icmp-type echo-request -m limit --limit 10/second -j ACCEPT');
      svc.forEach(function (v) {
        v.protos.forEach(function (proto) {
          src4(v.src).forEach(function (p) {
            if (s.sshRate && v.key === 'ssh') out.push('-A SAGALAIT_IN ' + p + '-p tcp --dport ' + P(v.p) + ' -m conntrack --ctstate NEW -m hashlimit --hashlimit-name sagalait_ssh --hashlimit-mode srcip --hashlimit-above 6/minute --hashlimit-burst 5 -j DROP');
            out.push('-A SAGALAIT_IN ' + p + '-p ' + proto + ' --dport ' + P(v.p) + ' -j ACCEPT');
          });
        });
      });
      out.push('-A SAGALAIT_IN -j DROP', '-I INPUT 1 -j SAGALAIT_IN',
        '-A SAGALAIT_FWD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT', '-A SAGALAIT_FWD -m conntrack --ctstate INVALID -j DROP');
      br.forEach(function (b) { out.push('-A SAGALAIT_FWD -i ' + I(b) + ' -j ACCEPT', '-A SAGALAIT_FWD -o ' + I(b) + ' -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'); });
      if (s.fwdLan) out.push('-A SAGALAIT_FWD -i ' + I(lan) + ' -o ' + I(wan) + ' -j ACCEPT');
      if (fw.length) out.push('-A SAGALAIT_FWD -m conntrack --ctstate DNAT -j ACCEPT');
      out.push('-A SAGALAIT_FWD -j DROP', '-I FORWARD 1 -j SAGALAIT_FWD', 'COMMIT');
      if (needNat) {
        out.push('*nat');
        if (fw.length) out.push(':SAGALAIT_PRE - [0:0]');
        if (s.masq) out.push(':SAGALAIT_POST - [0:0]');
        fw.forEach(function (f) {
          f.protos.forEach(function (proto) { out.push('-A SAGALAIT_PRE -i ' + I(wan) + ' -p ' + proto + ' --dport ' + P(f.ext) + ' -j DNAT --to-destination ' + f.ip + (f.port ? ':' + f.port.t : '')); });
        });
        if (s.masq) out.push('-A SAGALAIT_POST -o ' + I(wan) + ' -j MASQUERADE');
        if (fw.length) out.push('-I PREROUTING 1 -j SAGALAIT_PRE');
        if (s.masq) out.push('-I POSTROUTING 1 -j SAGALAIT_POST');
        out.push('COMMIT');
      }
      var u = ['iptables -D INPUT -j SAGALAIT_IN', 'iptables -F SAGALAIT_IN', 'iptables -X SAGALAIT_IN', 'iptables -D FORWARD -j SAGALAIT_FWD', 'iptables -F SAGALAIT_FWD', 'iptables -X SAGALAIT_FWD'];
      if (fw.length) u.push('iptables -t nat -D PREROUTING -j SAGALAIT_PRE', 'iptables -t nat -F SAGALAIT_PRE', 'iptables -t nat -X SAGALAIT_PRE');
      if (s.masq) u.push('iptables -t nat -D POSTROUTING -j SAGALAIT_POST', 'iptables -t nat -F SAGALAIT_POST', 'iptables -t nat -X SAGALAIT_POST');
      undo = u.map(function (x) { return 'sudo ' + x; }).join('\n');
      before = [
        { text: 'Simpan hasil sebagai /root/sagalait-fw.rules, dan pastikan Anda punya sesi cadangan (konsol atau sesi SSH kedua) yang tetap terbuka.' },
        { text: 'Cadangkan aturan yang berjalan sekarang, dan pastikan belum ada chain SAGALAIT (menjalankan dua kali membuat jump ganda).', cmd: 'sudo iptables-save > /root/iptables-sebelum.rules\nsudo iptables -S | grep SAGALAIT' },
        { text: 'Periksa sintaks. Mode --test tidak mengubah sistem.', cmd: 'sudo iptables-restore --test --noflush /root/sagalait-fw.rules' },
        { text: 'Terapkan dengan pembatalan otomatis: bila dalam 120 detik Anda tidak membatalkan timernya, chain SAGALAIT dilepas dan dihapus (aturan lain tidak tersentuh).', cmd: "sudo systemd-run --on-active=120 --unit=sagalait-fw-rollback \\\n    /bin/sh -c '" + u.join('; ') + "'\nsudo iptables-restore --noflush /root/sagalait-fw.rules" },
        { text: 'Dari sesi LAIN, uji bahwa akses manajemen masih jalan (ssh baru). Hanya bila aman, batalkan pembatalan otomatis.', cmd: 'sudo systemctl stop sagalait-fw-rollback.timer' },
        { text: 'Agar permanen setelah reboot, simpan lewat paket iptables-persistent atau netfilter-persistent. Itu menyimpan SELURUH aturan saat ini (termasuk milik Docker), jadi periksa dulu isinya.', cmd: 'sudo iptables-save | grep -c SAGALAIT   # harus lebih dari 0\nsudo netfilter-persistent save' }
      ];
    }
    notes = [
      { t: 'Docker', x: 'Docker mengelola aturan firewall sendiri. Jangan memakai "flush ruleset" (menghapus aturan Docker). Hasil ini memakai tabel atau chain sendiri. Karena forward diblok, tambahkan bridge Docker (docker0, br-*) di kolom bridge/container agar lalu lintas container tetap jalan.' },
      { t: 'Proxmox', x: 'Proxmox punya firewall bawaan (pve-firewall). Pakai salah satu, jangan keduanya tanpa sadar: dua firewall yang saling menimpa sulit dilacak. Untuk VM lewat bridge, isi vmbr* di kolom bridge/container.' },
      { t: 'fail2ban dan layanan lain', x: 'fail2ban dan layanan lain yang menambah aturan iptables bisa berada di urutan yang berbeda dengan aturan di sini. Periksa urutannya dengan "sudo nft list ruleset" atau "sudo iptables -S".' }
    ];
    /* peringatan */
    ['pve', 'graf', 'prom', 'nodeexp'].forEach(function (k) {
      if (s.svc[k].on && !addrs(s.svc[k].src).all.length) cx.warn('warning', SV[k][2] + ' (' + SV[k][0] + ') terbuka untuk semua alamat', 'Layanan ini biasanya hanya untuk jaringan internal. Isi kolom sumber dengan subnet yang boleh mengakses.');
    });
    if (s.svc.ssh.on && !s.sshRate && !addrs(s.svc.ssh.src).all.length) cx.warn('info', 'SSH terbuka tanpa pembatasan laju', 'Nyalakan batasan laju SSH atau batasi sumbernya.');
    if (!nft) cx.warn('warning', 'iptables: hanya IPv4', 'File ini tidak mengatur IPv6. Bila host punya IPv6, lalu lintas IPv6 tidak terlindungi. Pakai nftables untuk IPv4 dan IPv6 sekaligus.');
    if (s.fwdLan || needNat) cx.warn('info', 'IP forwarding harus aktif', 'NAT dan forward butuh net.ipv4.ip_forward=1. Cek dengan: sysctl net.ipv4.ip_forward');
    if (s.pf.length && !fw.length) cx.warn('info', 'Port forward tidak dihasilkan', 'Perbaiki isian port forward yang salah.');
    cx.warn('info', 'Pastikan alamat Anda ada di daftar manajemen', 'Alamat IP Anda saat ini tidak bisa dideteksi dari halaman ini. Di server, "echo $SSH_CONNECTION" menampilkan alamat sumber sesi SSH Anda.');
    return { errors: {}, warnings: cx.W, script: out.join('\n') + '\n', file: file, before: before, undo: undo,
      check: nft ? 'sudo nft list ruleset\nsudo ss -tulpn\n# dari mesin LAIN:\nnc -vz <alamat-server> 22' : 'sudo iptables -S SAGALAIT_IN\nsudo iptables -S SAGALAIT_FWD\nsudo ss -tulpn\n# dari mesin LAIN:\nnc -vz <alamat-server> 22',
      notes: notes, counts: { rules: out.filter(function (l) { return l && l[0] !== '#' && /dport|saddr|accept|drop|-A |-I |masquerade/.test(l); }).length } };
  }

  var API = { cidr: cidr, addrs: addrs, port: port, ports: ports, defaults: defaults, presetMT: presetMT, presetLX: presetLX, example: example, genMT: genMT, genLX: genLX, SV: SV, MP: MP };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.FW = API;
})(typeof window !== 'undefined' ? window : globalThis);
