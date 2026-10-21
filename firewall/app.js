/* Antarmuka generator firewall. Semua teks pengguna ditampilkan lewat textContent. */
(function () {
  'use strict';
  var KEY = 'sagalait-firewall';
  var st = load();
  var uid = 0;
  var $form = document.getElementById('form'), $result = document.getElementById('result'), $tabs = document.getElementById('tabs');

  /* ---------- penyimpanan (tanpa rahasia; boleh gagal) ---------- */
  function load() {
    var d = FW.defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        d.target = s.target === 'lx' ? 'lx' : 'mt';
        ['mt', 'lx'].forEach(function (k) {
          if (!s[k]) return;
          Object.keys(d[k]).forEach(function (f) {
            var v = s[k][f];
            if (v === undefined || typeof v !== typeof d[k][f]) return;
            if (f === 'pf' || f === 'custom') d[k][f] = Array.isArray(v) ? v.filter(function (r) { return r && typeof r === 'object'; }) : [];
            else if (typeof v === 'object' && v) Object.keys(d[k][f]).forEach(function (g) { if (v[g] !== undefined && typeof v[g] === typeof d[k][f][g]) d[k][f][g] = v[g]; });
            else d[k][f] = v;
          });
        });
      }
    } catch (e) { /* abaikan */ }
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } }

  /* ---------- DOM kecil ---------- */
  function el(tag, props) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else if (k === 'class') n.className = props[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]); else n.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) n.appendChild(arguments[i]);
    return n;
  }
  function onchange(fn) { return function () { fn(); save(); renderResult(); }; }
  function field(label, input, key, hint) {
    var id = 'f' + (++uid), wrap = el('div', { class: 'fw-f' });
    input.id = id;
    wrap.appendChild(el('label', { for: id, text: label }));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('p', { class: 'small muted', text: hint }));
    if (key) {
      input.setAttribute('data-k', key); input.setAttribute('aria-describedby', 'e-' + key);
      wrap.appendChild(el('p', { class: 'fw-err small', id: 'e-' + key, 'data-e': key, hidden: '' }));
    }
    return wrap;
  }
  function text(o, k, key, ph) {
    var i = el('input', { type: 'text', class: 'fw-in', value: o[k] || '', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
    if (ph) i.placeholder = ph;
    i.addEventListener('input', onchange(function () { o[k] = i.value; }));
    return i;
  }
  function area(o, k, ph) {
    var i = el('textarea', { class: 'field fw-area', rows: '3', spellcheck: 'false', autocapitalize: 'off' });
    i.value = o[k] || ''; i.placeholder = ph || '';
    i.addEventListener('input', onchange(function () { o[k] = i.value; }));
    return i;
  }
  function select(o, k, opts, after) {
    var s = el('select', { class: 'fw-in' });
    opts.forEach(function (p) { var op = el('option', { value: p[0], text: p[1] }); if (o[k] === p[0]) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { o[k] = s.value; if (after) after(); save(); renderResult(); });
    return s;
  }
  function chk(o, k, label, after) {
    var i = el('input', { type: 'checkbox' }); i.checked = !!o[k];
    i.addEventListener('change', function () { o[k] = i.checked; if (after) after(); save(); renderResult(); });
    return el('label', { class: 'fw-chk' }, i, el('span', { text: label }));
  }
  function panel(title, hint) {
    var p = el('section', { class: 'panel' }, el('div', { class: 'panel-head' }, el('h2', { text: title })));
    if (hint) p.appendChild(el('p', { class: 'small muted fw-hint', text: hint }));
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]);
    return p;
  }
  function grid() { var g = el('div', { class: 'fw-grid' }); for (var i = 0; i < arguments.length; i++) g.appendChild(arguments[i]); return g; }
  function checks() { var g = el('div', { class: 'fw-checks' }); for (var i = 0; i < arguments.length; i++) g.appendChild(arguments[i]); return g; }
  var PROTO = [['tcp', 'tcp'], ['udp', 'udp'], ['both', 'tcp dan udp']];

  /* daftar berulang: baris punya tombol hapus; tombol tambah; fokus dipindah dengan benar */
  function repeat(list, what, mk, fresh) {
    var box = el('div', { class: 'fw-list' });
    function draw(focusIdx, focusAdd) {
      box.textContent = '';
      list.forEach(function (row, i) {
        var r = el('div', { class: 'fw-row', role: 'group', 'aria-label': what + ' ' + (i + 1) });
        mk(row, i, r);
        r.appendChild(el('button', { type: 'button', class: 'btn btn-sm fw-del', text: 'Hapus', 'aria-label': 'Hapus ' + what + ' ' + (i + 1),
          onclick: function () { list.splice(i, 1); save(); renderForm(); renderResult(); var b = document.querySelector('[data-add="' + what + '"]'); if (b) b.focus(); } }));
        box.appendChild(r);
      });
      box.appendChild(el('button', { type: 'button', class: 'btn btn-sm', text: 'Tambah ' + what, 'data-add': what,
        onclick: function () { list.push(fresh()); save(); renderForm(); renderResult(); var rows = document.querySelectorAll('[aria-label="' + what + ' ' + list.length + '"] input'); if (rows[0]) rows[0].focus(); } }));
    }
    draw();
    return box;
  }
  function pfRow(o, hairpin) {
    return function (row, i, r) {
      var k = (hairpin ? 'mt-pf' : 'lx-pf') + i;
      r.appendChild(field('Nama', text(row, 'name', k + '-name', 'web internal')));
      r.appendChild(field('Protokol', select(row, 'proto', PROTO)));
      r.appendChild(field('Port luar', text(row, 'ext', k + '-ext', '8080 atau 8000-8010')));
      r.appendChild(field('Alamat dalam', text(row, 'ip', k + '-ip', hairpin ? '192.168.88.20' : '192.168.1.20')));
      r.appendChild(field('Port dalam', text(row, 'port', k + '-port', 'kosong = sama')));
      if (hairpin) r.appendChild(chk(row, 'hairpin', 'NAT hairpin'));
    };
  }

  /* ---------- form ---------- */
  /* panduan NAT hairpin: teks tetap, tanpa data pengguna */
  function hairpinGuide() {
    var steps = [
      ['Masalahnya.', 'Dari luar, http://203.0.113.10:8080 sampai ke server 192.168.88.20 lewat port forward. Dari dalam LAN, alamat yang sama sering gagal: router meneruskan paket ke server, tapi server satu subnet dengan klien dan membalas langsung ke klien dengan alamat 192.168.88.20, bukan 203.0.113.10. Klien menolak balasan itu.'],
      ['Solusinya (hairpin).', 'Router membuat dua aturan tambahan: dst-nat untuk permintaan yang datang dari LAN ke IP publik, lalu masquerade supaya server membalas ke router dan bukan langsung ke klien. Alurnya jadi klien, router, server, router, klien.'],
      ['Langkah 1.', 'Pastikan port forward dari luar sudah jalan. Isi nama, protokol, port luar, alamat dalam, dan port dalam.'],
      ['Langkah 2.', 'Isi "Alamat IPv4 publik WAN" dengan satu IP publik tetap, dan "Subnet LAN" di Pengaturan dasar.'],
      ['Langkah 3.', 'Centang "NAT hairpin" pada port forward yang ingin bisa dibuka dari dalam LAN.'],
      ['Langkah 4.', 'Salin skrip, aktifkan Safe Mode di RouterOS, tempel, lalu uji.'],
      ['Langkah 5.', 'Dari komputer di LAN jalankan: curl -I http://203.0.113.10:8080 (ganti dengan IP dan port Anda). Hasil sukses berarti hairpin bekerja.']
    ];
    var ol = el('ol', { class: 'fw-steps' });
    steps.forEach(function (s) { ol.appendChild(el('li', null, el('strong', { text: s[0] + ' ' }), document.createTextNode(s[1]))); });
    var d = el('details', { class: 'fw-hairpin' }, el('summary', { text: 'Apa itu NAT hairpin? Penjelasan dan contoh langkah demi langkah' }), ol,
      el('p', { class: 'small muted', text: 'Alternatif yang lebih sederhana: DNS lokal yang mengarahkan nama domain ke alamat server di LAN, jadi klien tidak perlu lewat IP publik. Alat ini belum mendukung IP publik dinamis maupun akses lewat tunnel.' }),
      el('button', { type: 'button', class: 'btn btn-sm', text: 'Isi contoh hairpin NAT', onclick: hairpinExample }));
    return d;
  }
  function hairpinExample() {
    var m = st.mt;
    st.target = 'mt'; FW.presetMT(m, 'home');
    Object.assign(m, { fwd: true, masq: true, lanSubnet: '192.168.88.0/24', wanIp: '203.0.113.10', mgmt: '192.168.88.0/24',
      pf: [{ name: 'web internal', proto: 'tcp', ext: '8080', ip: '192.168.88.20', port: '80', hairpin: true }] });
    save(); renderForm(); renderResult();
  }
  function formMT() {
    var m = st.mt, f = document.createDocumentFragment();
    f.appendChild(panel('Pengaturan dasar', null,
      grid(field('Versi RouterOS', select(m, 'ver', [['7', 'RouterOS 7'], ['6', 'RouterOS 6']], renderForm)),
        field('Profil awal', select(m, 'profile', [['home', 'Router rumah'], ['router', 'Hanya melindungi router']], function () { FW.presetMT(m, m.profile); renderForm(); }))),
      grid(field('Interface list WAN', text(m, 'wan', 'mt-wan')), field('Interface list LAN', text(m, 'lan', 'mt-lan')),
        field('Subnet LAN', text(m, 'lanSubnet', 'mt-lanSubnet', '192.168.88.0/24')))));
    f.appendChild(panel('Akses manajemen (wajib)', 'Alamat yang boleh mengelola router. Aturan ini selalu menjadi aturan terima pertama. Tanpa isian ini tidak ada aturan yang dihasilkan.',
      field('Alamat yang boleh mengelola perangkat', area(m, 'mgmt', '192.168.88.0/24\n10.10.10.0/24'), 'mt-mgmt', 'Satu atau banyak alamat IPv4 atau CIDR, dipisah koma atau baris baru.'),
      el('p', { class: 'small', text: 'Port manajemen' }),
      checks(chk(m.mport, 'ssh', 'SSH 22'), chk(m.mport, 'winbox', 'Winbox 8291'), chk(m.mport, 'https', 'WebFig HTTPS 443'), chk(m.mport, 'api', 'API 8728'), chk(m.mport, 'apissl', 'API-SSL 8729')),
      el('p', { class: 'fw-err small', 'data-e': 'mt-mport', hidden: '' }),
      field('Port manajemen lain (opsional)', text(m, 'mcustom', 'mt-mcustom', '2222, 8000-8010'))));
    var lanSvc = m.lanMode === 'services' ? checks(chk(m.lanSvc, 'dns', 'DNS 53'), chk(m.lanSvc, 'ntp', 'NTP 123'), chk(m.lanSvc, 'dhcp', 'DHCP 67')) : null;
    f.appendChild(panel('Layanan dan perlindungan', null,
      field('Akses dari LAN ke router', select(m, 'lanMode', [['all', 'Semua layanan'], ['services', 'Hanya layanan terpilih']], renderForm)), lanSvc,
      grid(field('Subnet VPN (opsional, boleh semua akses)', text(m, 'vpnSubnet', 'mt-vpnSubnet', '10.10.10.0/24')),
        field('Port VPN dari WAN (opsional)', text(m, 'vpnPort', 'mt-vpnPort', '51820/udp'))),
      checks(chk(m, 'icmp', 'Izinkan ping (ICMP)'), chk(m, 'brute', 'Lindungi SSH dan Winbox dari brute force'))));
    var fwd = [chk(m, 'fwd', 'Atur chain forward (buang lalu lintas dari WAN)', renderForm)];
    if (m.fwd) {
      fwd.push(chk(m, 'fasttrack', 'Fasttrack (melewati queue dan mangle)'), chk(m, 'masq', 'Masquerade WAN'));
    }
    var fp = panel('Forward dan NAT', null, checks.apply(null, fwd));
    if (m.fwd) {
      fp.appendChild(hairpinGuide());
      fp.appendChild(field('Alamat IPv4 publik WAN (hanya untuk NAT hairpin)', text(m, 'wanIp', 'mt-wanIp', '203.0.113.10')));
      fp.appendChild(el('p', { class: 'small', text: 'Port forward (dst-nat)' }));
      fp.appendChild(repeat(m.pf, 'port forward', pfRow(m, true), function () { return { name: '', proto: 'tcp', ext: '', ip: '', port: '', hairpin: false }; }));
    }
    f.appendChild(fp);
    f.appendChild(panel('Urutan aturan', null, checks(chk(m, 'moveTop', 'Pindahkan aturan ke atas aturan lama (move destination=0)'))));
    return f;
  }
  function formLX() {
    var l = st.lx, f = document.createDocumentFragment();
    f.appendChild(panel('Pengaturan dasar', null,
      grid(field('Firewall', select(l, 'fw', [['nft', 'nftables (disarankan)'], ['ipt', 'iptables-restore (host lama)']], renderForm)),
        field('Profil awal', select(l, 'profile', [['general', 'Server umum'], ['proxmox', 'Proxmox host'], ['web', 'Server web (HTTP/HTTPS)'], ['router', 'Router/NAT Linux']], function () { FW.presetLX(l, l.profile); renderForm(); }))),
      grid(field('Antarmuka WAN', text(l, 'wan', 'lx-wan', 'eth0')), field('Antarmuka LAN', text(l, 'lan', 'lx-lan', 'eth1')))));
    f.appendChild(panel('Akses manajemen (wajib)', 'Alamat yang boleh mengelola server. Aturannya diletakkan sebelum aturan lain. Tanpa isian ini tidak ada aturan yang dihasilkan.',
      field('Alamat yang boleh mengelola perangkat', area(l, 'mgmt', '192.168.1.0/24\n10.10.10.0/24'), 'lx-mgmt', l.fw === 'nft' ? 'IPv4 atau IPv6, alamat atau CIDR, dipisah koma atau baris baru.' : 'IPv4 saja, alamat atau CIDR, dipisah koma atau baris baru.'),
      field('Port manajemen', text(l, 'mports', 'lx-mports', '22, 8006'), null, 'Port TCP yang boleh diakses dari alamat di atas.')));
    var rows = el('div', { class: 'fw-svc' });
    Object.keys(FW.SV).forEach(function (k) {
      var v = FW.SV[k], s = l.svc[k], i = el('input', { type: 'text', class: 'fw-in', value: s.src, placeholder: 'sumber: semua alamat', spellcheck: 'false', autocomplete: 'off', 'data-k': 'lx-svc-' + k, 'aria-label': 'Batasi sumber ' + v[2], 'aria-describedby': 'e-lx-svc-' + k });
      i.addEventListener('input', onchange(function () { s.src = i.value; }));
      rows.appendChild(el('div', { class: 'fw-svc-row' }, chk(s, 'on', v[2] + ' ' + v[0] + '/' + v[1]), i, el('p', { class: 'fw-err small', id: 'e-lx-svc-' + k, 'data-e': 'lx-svc-' + k, hidden: '' })));
    });
    var sp = panel('Layanan yang dibuka', 'Centang layanan yang harus bisa dijangkau. Kolom sumber membatasi alamat yang boleh mengakses (kosong berarti semua alamat).', rows,
      el('p', { class: 'small', text: 'Port kustom' }),
      repeat(l.custom, 'port kustom', function (row, i, r) {
        var k = 'lx-cs' + i;
        r.appendChild(field('Port', text(row, 'port', k + '-port', '8000 atau 8000-8010')));
        r.appendChild(field('Protokol', select(row, 'proto', PROTO)));
        r.appendChild(field('Batasi sumber', text(row, 'src', k + '-src', 'kosong = semua')));
      }, function () { return { port: '', proto: 'tcp', src: '' }; }));
    f.appendChild(sp);
    f.appendChild(panel('Perlindungan dan jaringan', null,
      checks(chk(l, 'icmp', 'Izinkan ping (ICMP dan ICMPv6 echo)'), chk(l, 'sshRate', 'Batasi laju SSH baru per alamat sumber'),
        chk(l, 'lanOpen', 'Terima semua dari antarmuka LAN'), chk(l, 'fwdLan', 'Teruskan LAN ke WAN'), chk(l, 'masq', 'Masquerade WAN')),
      field('Bridge atau container yang dibiarkan meneruskan lalu lintas', text(l, 'bridges', 'lx-bridges', 'docker0, br-*, vmbr*'), null, 'Wajib diisi bila host menjalankan Docker atau VM Proxmox, karena chain forward memblok sisanya.'),
      el('p', { class: 'small', text: 'Port forward (DNAT)' }),
      repeat(l.pf, 'port forward', pfRow(l, false), function () { return { name: '', proto: 'tcp', ext: '', ip: '', port: '', hairpin: false }; })));
    return f;
  }
  function renderForm() {
    $form.textContent = '';
    $form.appendChild(st.target === 'mt' ? formMT() : formLX());
    Array.prototype.forEach.call($tabs.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-t') === st.target;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('btn-primary', on);
    });
  }

  /* ---------- hasil ---------- */
  function copyText(btn, v) {
    var done = function () { btn.textContent = 'Tersalin'; setTimeout(function () { btn.textContent = 'Salin'; }, 1500); };
    var fb = function () { var t = el('textarea', { class: 'vh' }); t.value = v; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal menyalin'; } t.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, fb); else fb();
  }
  function download(name, v) {
    var a = el('a', { download: name, href: URL.createObjectURL(new Blob([v], { type: 'text/plain' })) });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function code(title, body, file, id) {
    var acts = el('div', { class: 'actions' });
    var c = el('button', { type: 'button', class: 'btn btn-sm', text: 'Salin', 'aria-label': 'Salin ' + title.toLowerCase(), onclick: function () { copyText(c, body); } });
    acts.appendChild(c);
    if (file) acts.appendChild(el('button', { type: 'button', class: 'btn btn-sm btn-primary', text: 'Unduh ' + file, onclick: function () { download(file, body); } }));
    var p = el('section', { class: 'panel', 'aria-label': title }, el('div', { class: 'panel-head' }, el('h2', { text: title }), acts),
      el('pre', { class: 'src fw-code', tabindex: '0', text: body }));
    if (id) p.id = id;
    return p;
  }
  function miniCode(body) {
    var c = el('button', { type: 'button', class: 'btn btn-sm', text: 'Salin', 'aria-label': 'Salin perintah', onclick: function () { copyText(c, body); } });
    return el('div', { class: 'fw-mini' }, el('pre', { class: 'src fw-code', tabindex: '0', text: body }), c);
  }
  var LV = { error: ['issue', 'Bahaya'], warning: ['issue warning', 'Perhatian'], info: ['issue info', 'Info'] };
  function card(lv, title, body) {
    return el('div', { class: LV[lv][0], role: lv === 'error' ? 'alert' : null },
      el('div', { class: 'issue-head' }, el('span', { class: 'tag', text: LV[lv][1] }), el('strong', { text: title })), el('p', { class: 'fw-issue-body small', text: body }));
  }
  function renderResult() {
    var r = st.target === 'mt' ? FW.genMT(st.mt) : FW.genLX(st.lx);
    $result.textContent = '';
    /* pesan per kolom */
    Array.prototype.forEach.call(document.querySelectorAll('[data-e]'), function (p) {
      var m = r.errors[p.getAttribute('data-e')];
      p.textContent = m || ''; p.hidden = !m;
      p.classList.toggle('soft', !!(m && r.empty && /mgmt$/.test(p.getAttribute('data-e'))));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (i) {
      if (r.errors[i.getAttribute('data-k')]) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
    });
    if (!r.script) {
      var e = el('div', { class: 'panel empty' }, el('p', { text: r.empty ? 'Belum ada hasil.' : 'Hasil belum bisa dibuat.' }),
        el('p', { class: 'small', text: r.empty ? 'Langkah pertama: isi alamat yang boleh mengelola perangkat. Tanpa itu tidak ada aturan yang dihasilkan, supaya Anda tidak terkunci.' : 'Perbaiki isian yang ditandai di form.' }),
        el('button', { type: 'button', class: 'btn btn-sm', id: 'btnSample2', text: 'Coba dengan contoh', onclick: sample }));
      $result.appendChild(e);
      Object.keys(r.errors).forEach(function (k) { if (!(r.empty && /mgmt$/.test(k))) $result.appendChild(card('warning', 'Isian perlu diperbaiki', r.errors[k])); });
      return;
    }
    var honest = st.target === 'mt'
      ? 'Skrip RouterOS ini belum dijalankan di perangkat RouterOS nyata dan tidak ada alat di sini yang bisa memvalidasinya. Uji dengan Safe Mode di perangkat Anda dan periksa hasilnya sebelum disimpan.'
      : 'Aplikasi ini hanya membuat teks dan tidak menerapkan apa pun ke server. Periksa sintaks dengan ' + (st.lx.fw === 'nft' ? 'nft -c -f' : 'iptables-restore --test') + ' di server Anda (langkah di "Sebelum menerapkan") sebelum menerapkan.';
    var ws = el('div', { class: 'stack', id: 'warnings', role: 'region', 'aria-label': 'Peringatan' }, card('warning', 'Hasil belum diverifikasi di perangkat Anda', honest));
    r.warnings.forEach(function (w) { ws.appendChild(card(w.lv, w.title, w.text)); });
    $result.appendChild(ws);
    $result.appendChild(code('Hasil: ' + r.file, r.script, r.file, 'script'));
    var ol = el('ol', { class: 'fw-steps' });
    r.before.forEach(function (s) { var li = el('li', null, el('span', { text: s.text })); if (s.cmd) li.appendChild(miniCode(s.cmd)); ol.appendChild(li); });
    $result.appendChild(el('section', { class: 'panel', 'aria-label': 'Sebelum menerapkan' }, el('div', { class: 'panel-head' }, el('h2', { text: 'Sebelum menerapkan' })), ol));
    $result.appendChild(el('section', { class: 'panel', 'aria-label': 'Cara membatalkan' }, el('div', { class: 'panel-head' }, el('h2', { text: 'Cara membatalkan' })),
      el('p', { class: 'small muted', text: st.target === 'mt' ? 'Menghapus semua aturan bertanda sagalait-fw. Aturan lama Anda tidak tersentuh.' : 'Menghapus hanya milik generator ini.' }), miniCode(r.undo)));
    $result.appendChild(el('section', { class: 'panel', 'aria-label': 'Cara memeriksa' }, el('div', { class: 'panel-head' }, el('h2', { text: 'Cara memeriksa' })), miniCode(r.check)));
    if (r.notes && r.notes.length) {
      var d = el('dl', { class: 'kv fw-notes' });
      r.notes.forEach(function (n) { d.appendChild(el('dt', { text: n.t })); d.appendChild(el('dd', { text: n.x })); });
      $result.appendChild(el('section', { class: 'panel', 'aria-label': 'Catatan khusus' }, el('div', { class: 'panel-head' }, el('h2', { text: 'Catatan khusus' })), d));
    }
  }

  /* ---------- aksi ---------- */
  function sample() { FW.example(st); save(); renderForm(); renderResult(); }
  document.getElementById('btnSample').addEventListener('click', sample);
  document.getElementById('btnClear').addEventListener('click', function () { var t = st.target; st = FW.defaults(); st.target = t; save(); renderForm(); renderResult(); });
  Array.prototype.forEach.call($tabs.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { st.target = b.getAttribute('data-t'); save(); renderForm(); renderResult(); });
  });
  renderForm(); renderResult();
})();
