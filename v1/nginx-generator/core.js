/* Nginx generator: inti (tanpa DOM) supaya bisa diuji di Node.
   Pemetaan URL mengikuti dokumentasi ngx_http_proxy_module (proxy_pass). */
(function (root) {
  'use strict';

  /* ---------- pemetaan URL proxy_pass ---------- */

  // "http://host:port/uri" -> bagian-bagiannya. uri === null bila tujuan tidak punya bagian URI.
  function parseTarget(t) {
    t = (t || '').trim();
    var m = /^(https?):\/\/([^\/\s?#;]+)(\/[^\s?#;]*)?$/.exec(t);
    if (!m) return null;
    var hostport = m[2], host = hostport;
    var b = /^\[(.*)\](?::\d+)?$/.exec(hostport);
    if (b) host = b[1]; else host = hostport.replace(/:\d+$/, '');
    return { raw: t, scheme: m[1], hostport: hostport, host: host, uri: m[3] === undefined ? null : m[3], hasVar: t.indexOf('$') >= 0 };
  }

  // "/api/", "= /x", "^~ /static/", "~ ^/ws", "@name"
  function parseLoc(s) {
    s = (s || '').trim();
    if (s.charAt(0) === '@') return { mod: '@', path: s, kind: 'named' };
    var m = /^(=|\^~|~\*|~)\s+(\S.*)$/.exec(s);
    if (m) return { mod: m[1], path: m[2], kind: (m[1] === '~' || m[1] === '~*') ? 'regex' : 'prefix' };
    return { mod: '', path: s, kind: 'prefix' };
  }

  // Hasil: { status: 'ok' | 'nomatch' | 'unsure' | 'error', url, note }
  function mapUrl(locStr, targetStr, reqPath) {
    var loc = parseLoc(locStr), tg = parseTarget(targetStr);
    if (!tg || !loc.path) return { status: 'error', note: 'Location atau tujuan belum valid.' };
    if (reqPath.charAt(0) !== '/') reqPath = '/' + reqPath;
    var qi = reqPath.indexOf('?');
    var path = qi < 0 ? reqPath : reqPath.slice(0, qi);
    var query = qi < 0 ? '' : reqPath.slice(qi);
    if (loc.kind !== 'prefix')
      return { status: 'unsure', note: 'Location regex atau bernama: aturan penggantian berbeda, hasil tidak dihitung. Periksa dengan nginx -t dan curl.' };
    if (tg.hasVar)
      return { status: 'unsure', note: 'proxy_pass berisi variabel: URI yang diteruskan mengikuti nilai variabel, hasil tidak dihitung.' };
    if (path.indexOf(loc.path) !== 0) return { status: 'nomatch', note: 'Tidak cocok dengan location ini.' };
    if (tg.uri === null) return { status: 'ok', url: reqPath, note: 'Tujuan tanpa URI: path asli diteruskan utuh.' };
    return { status: 'ok', url: tg.uri + path.slice(loc.path.length) + query, note: 'Bagian "' + loc.path + '" diganti "' + tg.uri + '", sisanya disambung langsung.' };
  }

  // Peringatan untuk satu location. s: state form.
  function proxyIssues(locStr, tg, s) {
    var out = [], loc = parseLoc(locStr), where = 'location ' + locStr;
    function add(level, tag, title, text) { out.push({ level: level, tag: tag, title: title, text: text, where: where }); }
    if (tg.uri !== null && loc.kind === 'prefix') {
      var lend = loc.path.slice(-1) === '/', uend = tg.uri.slice(-1) === '/';
      if (lend && !uend) {
        var ex = mapUrl(locStr, tg.raw, '/tools.json');
        add('warning', 'Garis miring', 'Location berakhir "/" tetapi tujuan tidak',
          'Path disambung tanpa pemisah. Contoh: permintaan /tools.json menjadi ' + (ex.url || '?') + '. Tambahkan "/" di akhir tujuan (' + tg.raw + '/) atau pakai tujuan tanpa path.');
      } else if (!lend && uend) {
        var ex2 = mapUrl(locStr, tg.raw, loc.path + '/x');
        add('warning', 'Garis miring ganda', 'Location tanpa "/" di akhir tetapi tujuan berakhir "/"',
          'Permintaan ' + loc.path + '/x menjadi ' + (ex2.url || '?') + ' (garis miring ganda). Samakan keduanya: pakai "/" di kedua sisi, atau di keduanya tidak.');
      } else if (!uend && tg.uri !== '') {
        add('info', 'Path tujuan', 'Tujuan berpath tanpa "/" penutup',
          'Sudah konsisten dengan location tanpa "/", tetapi permintaan ke path tepat "' + loc.path + '" menjadi ' + tg.uri + '. Pastikan itu yang diinginkan.');
      }
    }
    if (tg.uri !== null && loc.kind !== 'prefix')
      add('info', 'Regex', 'Location regex/bernama dengan tujuan berpath', 'nginx menolak proxy_pass berpath pada location regex atau bernama (nginx -t gagal).');
    if (!s.fwdHost)
      add('warning', 'Header Host', 'Host tidak diteruskan',
        'nginx akan mengirim Host = ' + tg.hostport + ' ke backend. Bila backend memakai virtual host atau membuat URL absolut dari Host, hasilnya salah. Aktifkan "Teruskan Host".');
    if (tg.uri !== null && !s.autoRedirect)
      add('warning', 'Redirect', 'Redirect backend bisa membocorkan path internal',
        'Backend yang mengirim Location: ' + tg.raw + '... akan terlihat apa adanya oleh klien. Aktifkan proxy_redirect otomatis.');
    if (tg.host.toLowerCase() === 'localhost')
      add('warning', 'localhost', 'proxy_pass ke localhost',
        'localhost bisa diselesaikan ke ::1 (IPv6) padahal backend hanya mendengarkan IPv4, sehingga muncul 502. Pakai 127.0.0.1.');
    if (s.ws && !s.http11)
      add('warning', 'WebSocket', 'WebSocket aktif tanpa HTTP/1.1',
        'Upgrade hanya bekerja lewat HTTP/1.1; nginx memakai HTTP/1.0 ke backend secara bawaan. Aktifkan "HTTP/1.1 ke backend".');
    return out;
  }

  /* ---------- validasi kecil ---------- */
  var SAFE = /^[^\s;{}"'\\$]+$/;          // jalur, nama berkas
  function ipOk(v) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(v);
    if (m) return m.slice(1, 5).every(function (o) { return +o <= 255; }) && (m[5] === undefined || +m[5] <= 32);
    return /^[0-9a-fA-F:]*:[0-9a-fA-F:]*(?:\/\d{1,3})?$/.test(v) && (v.match(/:/g) || []).length >= 2;
  }
  function list(v) { return (v || '').split(/[\s,;]+/).filter(Boolean); }

  /* ---------- pembuat konfigurasi ---------- */
  function build(s) {
    var errors = [], issues = [], pre = [], blocks = [];
    var names = list(s.names);
    if (!names.length) return { empty: true };
    names.forEach(function (n) {
      if (!/^(\*\.)?[A-Za-z0-9._-]+(\.\*)?$/.test(n)) errors.push('server_name "' + n + '" tidak valid. Pakai huruf, angka, titik, minus; tanda * hanya di awal ("*.contoh.com") atau akhir.');
    });
    var first = names[0].replace(/^\*\./, '');
    var slug = first.replace(/[^A-Za-z0-9.-]/g, '_').toLowerCase();
    var mode = s.mode, ssl = !!s.https && !(mode === 'redirect' && s.kind === 'http2https');
    var simple = mode !== 'redirect';

    function need(v, label) {
      if (!v || !v.trim()) { errors.push(label + ' belum diisi.'); return false; }
      if (!SAFE.test(v.trim())) { errors.push(label + ' mengandung karakter yang tidak diizinkan (spasi, ; { } kutip, \\ atau $).'); return false; }
      return true;
    }
    function size(v, label) {
      if (v && !/^\d+[kKmMgG]?$/.test(v.trim())) errors.push(label + ' harus angka dengan satuan opsional, misalnya 50m.');
    }
    if (!ssl && !(mode === 'redirect' && s.kind === 'http2https')) {
      var p = +s.port;
      if (!(p >= 1 && p <= 65535) || String(s.port).trim() !== String(p)) errors.push('Port harus angka 1 sampai 65535.');
    }

    /* baris listen */
    function listen(port, withSsl) {
      var tail = withSsl ? ' ssl' + (s.http2 ? ' http2' : '') : '';
      var l = ['listen ' + port + tail + ';'];
      if (s.ipv6) l.push('listen [::]:' + port + tail + ';');
      return l;
    }
    var acme = ['location /.well-known/acme-challenge/ {', '    root /var/www/certbot;', '}'];

    /* bagian server-level yang dipakai bersama */
    var common = [];
    if (ssl) {
      var certDir = '/etc/letsencrypt/live/' + first;
      common.push('ssl_certificate ' + certDir + '/fullchain.pem;', 'ssl_certificate_key ' + certDir + '/privkey.pem;', 'ssl_protocols TLSv1.2 TLSv1.3;');
      if (/^\*\./.test(names[0])) issues.push({ level: 'info', tag: 'Wildcard', title: 'Sertifikat wildcard', text: 'Sertifikat untuk *.' + first + ' memerlukan tantangan DNS-01 (certbot --manual atau plugin DNS), bukan --nginx.', where: 'HTTPS' });
    }
    if (s.realIp) {
      var froms = list(s.realFrom);
      if (!froms.length) errors.push('real_ip: isi minimal satu alamat proxy tepercaya (set_real_ip_from).');
      froms.forEach(function (f) { if (!ipOk(f)) errors.push('set_real_ip_from "' + f + '" bukan IP atau CIDR yang valid.'); else common.push('set_real_ip_from ' + f + ';'); });
      common.push('real_ip_header ' + (['X-Forwarded-For', 'X-Real-IP'].indexOf(s.realHdr) >= 0 ? s.realHdr : 'X-Forwarded-For') + ';');
    }
    if (s.logs) common.push('access_log /var/log/nginx/' + slug + '.access.log;', 'error_log /var/log/nginx/' + slug + '.error.log;');
    if (simple) {
      if (s.sec) common.push('add_header X-Content-Type-Options "nosniff" always;', 'add_header X-Frame-Options "SAMEORIGIN" always;', 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
      if (s.hsts && ssl) {
        common.push('add_header Strict-Transport-Security "max-age=31536000" always;');
        issues.push({ level: 'warning', tag: 'HSTS', title: 'HSTS sulit dibatalkan', text: 'Browser akan menolak HTTP untuk ' + first + ' selama 1 tahun setelah kunjungan pertama. Aktifkan hanya bila HTTPS sudah stabil dan sertifikat diperpanjang otomatis.', where: 'Opsi umum' });
      }
      if (s.hsts && !ssl) errors.push('HSTS memerlukan HTTPS aktif.');
      if (s.limit) {
        var rate = +s.rate, burst = +s.burst;
        if (!(rate >= 1)) errors.push('Batas laju harus angka minimal 1 permintaan per detik.');
        else {
          if (!(burst >= 0)) errors.push('Burst harus angka 0 atau lebih.');
          pre.push('limit_req_zone $binary_remote_addr zone=' + slug.replace(/\./g, '_') + '_req:10m rate=' + Math.floor(rate) + 'r/s;');
          common.push('limit_req zone=' + slug.replace(/\./g, '_') + '_req burst=' + Math.floor(burst >= 0 ? burst : 0) + ' nodelay;');
        }
      }
      if (s.auth) {
        common.push('auth_basic "Area terbatas";', 'auth_basic_user_file /etc/nginx/.htpasswd-' + slug + ';');
        if (!/^[A-Za-z0-9._-]+$/.test(s.authUser || '')) errors.push('Nama pengguna basic auth hanya boleh huruf, angka, titik, garis bawah, minus.');
      }
      if (s.ipOn) {
        var ips = list(s.ips);
        if (!ips.length) errors.push('Pembatasan IP: isi minimal satu IP atau CIDR yang diizinkan, atau semua akses akan ditolak.');
        ips.forEach(function (i) { if (!ipOk(i)) errors.push('IP "' + i + '" tidak valid.'); else common.push('allow ' + i + ';'); });
        common.push('deny all;');
        if (s.auth) issues.push({ level: 'info', tag: 'Auth + IP', title: 'Basic auth dan pembatasan IP bersamaan', text: 'Keduanya harus lolos. Tambahkan "satisfy any;" secara manual bila cukup salah satu.', where: 'Opsi umum' });
      }
    }

    /* tubuh server per mode */
    var body = [], redirTarget = null, previews = [], curlPath = '/';
    if (mode === 'static') {
      need(s.root, 'Root');
      if (!list(s.index).length || !list(s.index).every(function (x) { return SAFE.test(x); })) errors.push('Index belum diisi atau berisi karakter yang tidak diizinkan.');
      body.push('root ' + (s.root || '').trim() + ';', 'index ' + list(s.index).join(' ') + ';');
      if (s.gzip) body.push('gzip on;', 'gzip_vary on;', 'gzip_min_length 1024;', 'gzip_types text/plain text/css text/xml application/json application/javascript application/xml image/svg+xml;');
      body.push('', 'location / {', '    try_files $uri $uri/ ' + (s.spa ? '/index.html' : '=404') + ';', '}');
      body.push('', 'location ~ /\\.(?!well-known) {', '    deny all;', '}');
      if (s.cache) {
        var dur = ['7d', '30d', '365d'].indexOf(s.cacheDur) >= 0 ? s.cacheDur : '30d';
        body.push('', 'location ~* \\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|avif|woff2?)$ {', '    expires ' + dur + ';', '}');
      }
    } else if (mode === 'proxy') {
      var locs = (s.locs || []).filter(function (l) { return l.path.trim() || l.target.trim(); });
      if (!locs.length) errors.push('Tambahkan minimal satu location beserta tujuannya.');
      size(s.maxBody, 'client_max_body_size');
      if (s.timeout && !(+s.timeout >= 1)) errors.push('proxy_read_timeout harus angka detik minimal 1.');
      var seen = {};
      locs.forEach(function (l, i) {
        var tag = 'Location ' + (i + 1);
        var lp = l.path.trim(), loc = parseLoc(lp), tg = parseTarget(l.target);
        if (!lp || /[;{}"'\r\n]/.test(lp) || (loc.kind === 'prefix' && /\s/.test(loc.path))) { errors.push(tag + ': path location kosong atau berisi karakter tidak diizinkan.'); return; }
        if (!tg) { errors.push(tag + ': tujuan harus berbentuk http://host:port atau http://host:port/path/ (tanpa spasi, query, atau titik koma).'); return; }
        if (seen[lp]) errors.push(tag + ': path "' + lp + '" sudah dipakai location lain; nginx menolak location kembar.');
        seen[lp] = 1;
        if (tg.uri !== null && loc.kind !== 'prefix') errors.push(tag + ': nginx menolak proxy_pass berpath pada location regex atau bernama. Hapus path dari tujuan.');
        issues = issues.concat(proxyIssues(lp, tg, s));
        var b = ['', 'location ' + lp + ' {', '    proxy_pass ' + tg.raw + ';'];
        if (s.http11) b.push('    proxy_http_version 1.1;');
        if (s.fwdHost) b.push('    proxy_set_header Host $host;');
        if (s.fwdHdr) b.push('    proxy_set_header X-Real-IP $remote_addr;', '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', '    proxy_set_header X-Forwarded-Proto $scheme;');
        if (s.ws) b.push('    proxy_set_header Upgrade $http_upgrade;', '    proxy_set_header Connection "upgrade";');
        if (s.timeout) b.push('    proxy_read_timeout ' + Math.floor(+s.timeout) + 's;');
        if (s.autoRedirect && tg.uri !== null && loc.kind === 'prefix') b.push('    proxy_redirect ' + tg.raw + ' ' + loc.path + ';');
        b.push('}');
        body = body.concat(b);
        previews.push({ loc: lp, target: tg.raw });
        if (i === 0 && loc.kind === 'prefix') curlPath = loc.path;
      });
      if (s.maxBody) body = ['client_max_body_size ' + s.maxBody.trim() + ';'].concat(body);
      else issues.push({ level: 'info', tag: 'Unggah', title: 'client_max_body_size bawaan 1 MB', text: 'Bila backend menerima unggahan berkas, isi batas ukuran (misalnya 50m); jika tidak, permintaan besar ditolak dengan 413.', where: 'Reverse proxy' });
      if (body[0] === '') body.shift();
    } else if (mode === 'php') {
      need(s.root, 'Root');
      size(s.maxBody, 'client_max_body_size');
      var sock = (s.sock || '').trim(), pass;
      if (s.sockType === 'tcp') {
        if (!/^[A-Za-z0-9.\-]+:\d{1,5}$/.test(sock)) errors.push('Alamat PHP-FPM harus berbentuk host:port, misalnya 127.0.0.1:9000.');
        pass = sock;
      } else {
        if (!SAFE.test(sock) || sock.charAt(0) !== '/') errors.push('Jalur soket PHP-FPM harus jalur absolut, misalnya /run/php/php8.3-fpm.sock.');
        pass = 'unix:' + sock;
      }
      body.push('root ' + (s.root || '').trim() + ';', 'index index.php index.html;');
      if (s.maxBody) body.push('client_max_body_size ' + s.maxBody.trim() + ';');
      body.push('', 'location / {', '    try_files $uri $uri/ ' + (s.laravel ? '/index.php?$query_string' : '=404') + ';', '}');
      body.push('', 'location ~ \\.php$ {', '    try_files $uri =404;', '    include fastcgi_params;', '    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;', '    fastcgi_pass ' + pass + ';', '}');
      body.push('', 'location ~ /\\.(?:ht|git) {', '    deny all;', '}');
      if (s.laravel && !/\/public\/?$/.test((s.root || '').trim()))
        issues.push({ level: 'warning', tag: 'Laravel', title: 'Root Laravel harus menunjuk ke folder public', text: 'Root saat ini bukan .../public. Bila root menunjuk ke akar proyek, berkas .env dan kode sumber bisa terunduh.', where: 'PHP-FPM' });
      if (!s.maxBody) issues.push({ level: 'info', tag: 'Unggah', title: 'client_max_body_size bawaan 1 MB', text: 'Samakan dengan upload_max_filesize dan post_max_size di php.ini bila aplikasi menerima unggahan.', where: 'PHP-FPM' });
      issues.push({ level: 'info', tag: 'Versi PHP', title: 'Samakan soket dengan versi PHP terpasang', text: 'Cek nama soket dengan ls /run/php/ di server.', where: 'PHP-FPM' });
    } else if (mode === 'redirect') {
      var code = s.code === '302' ? 302 : 301, target;
      redirTarget = null;
      if (s.kind === 'http2https') target = 'https://$host$request_uri';
      else {
        var h;
        if (s.kind === 'www2non') { if (!/^www\./.test(names[0])) errors.push('Untuk www ke non-www, server_name harus diawali "www." (contoh www.' + first + ').'); h = names[0].replace(/^www\./, ''); }
        else if (s.kind === 'non2www') { if (/^www\./.test(names[0])) errors.push('Untuk non-www ke www, server_name sebaiknya tanpa "www." di awal.'); h = 'www.' + names[0]; }
        else { h = (s.newDomain || '').trim(); if (!/^[A-Za-z0-9.-]+$/.test(h)) errors.push('Domain baru belum diisi atau tidak valid.'); }
        target = (ssl ? 'https' : '$scheme') + '://' + h + '$request_uri';
        if (s.kind === 'www2non' || s.kind === 'non2www') issues.push({ level: 'info', tag: 'Cakupan', title: 'Hanya ' + names.join(', ') + ' yang dialihkan', text: 'Blok untuk domain tujuan (' + h + ') harus ada sendiri; berkas ini hanya menangani pengalihannya.', where: 'Pengalihan' });
      }
      redirTarget = target;
      body.push('return ' + (s.kind === 'http2https' ? 301 : code) + ' ' + target + ';');
      if (s.kind !== 'http2https' && code === 302) issues.push({ level: 'info', tag: '302', title: 'Pengalihan sementara', text: 'Browser dan mesin pencari tidak menyimpan 302 secara permanen. Pakai 301 bila domain lama memang sudah pindah.', where: 'Pengalihan' });
      curlPath = '/contoh?x=1';
    }

    if (errors.length) return { errors: errors, issues: [] };

    /* rakit berkas */
    var ind = function (a) { return a.map(function (x) { return x ? '    ' + x : ''; }); };
    var out = ['# Dibuat oleh Nginx generator (Tools SagalaIT). Periksa dengan: sudo nginx -t', ''];
    pre.forEach(function (x) { out.push(x); });
    if (pre.length) out.push('');
    function server(listenL, inner) { return ['server {'].concat(ind(listenL), ind(['server_name ' + names.join(' ') + ';', ''].concat(inner)), ['}']); }
    var main, gap = common.length ? [''] : [];
    if (mode === 'redirect' && s.kind === 'http2https') {
      main = server(listen('80', false), common.concat(gap, acme, ['', 'location / {', '    return 301 https://$host$request_uri;', '}']));
    } else if (ssl) {
      var to = mode === 'redirect' ? redirTarget : 'https://$host$request_uri';
      main = server(listen('443', true), common.concat(gap, body)).concat([''], server(listen('80', false), acme.concat(['', 'location / {', '    return 301 ' + to + ';', '}'])));
    } else {
      main = server(listen(String(+s.port), false), common.concat(gap, body));
    }
    out = out.concat(main);
    var conf = out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
    return { errors: [], issues: issues, conf: conf, slug: slug, filename: slug + '.conf', previews: previews, ssl: ssl, names: names, curlPath: curlPath, first: first,
      install: install({ slug: slug, first: first, names: names, ssl: ssl, auth: simple && s.auth, authUser: s.authUser, root: s.root, mode: mode, port: s.port, curlPath: curlPath }) };
  }

  function install(o) {
    var f = '/etc/nginx/sites-available/' + o.slug + '.conf';
    var a = [];
    a.push('# 1. simpan konfigurasi ke berkas (tempel isi, atau unggah hasil Unduh)', 'sudo nano ' + f, '');
    a.push('# 2. aktifkan situs', 'sudo ln -s ' + f + ' /etc/nginx/sites-enabled/', '');
    var n = 3;
    if (o.ssl) {
      a.push('# ' + (n++) + '. sertifikat. Berkas ini merujuk sertifikat Let\'s Encrypt, jadi nginx -t gagal sebelum sertifikat ada.',
        '#    Terbitkan lebih dulu (port 80 harus bebas selama proses):',
        'sudo mkdir -p /var/www/certbot',
        'sudo certbot certonly --standalone -d ' + o.names.join(' -d '),
        '#    Alternatif: pasang dulu versi HTTP saja, lalu biarkan certbot menambah blok ssl sendiri:',
        '#    sudo certbot --nginx -d ' + o.names.join(' -d '), '');
    }
    if (o.auth) a.push('# ' + (n++) + '. berkas kata sandi basic auth (kata sandi diketik di terminal, tidak disimpan di halaman ini)', 'sudo apt install apache2-utils', 'sudo htpasswd -c /etc/nginx/.htpasswd-' + o.slug + ' ' + (/^[A-Za-z0-9._-]+$/.test(o.authUser || '') ? o.authUser : 'admin'), '');
    a.push('# ' + (n++) + '. periksa sintaks, lalu muat ulang', 'sudo nginx -t', 'sudo systemctl reload nginx', '');
    a.push('# ' + n + '. periksa hasil', 'curl -I ' + (o.ssl ? 'https' : 'http') + '://' + o.first + (o.curlPath || '/'));
    if (o.ssl) a.push('curl -I http://' + o.first + '/');
    return a.join('\n') + '\n';
  }

  root.NgCore = { parseTarget: parseTarget, parseLoc: parseLoc, mapUrl: mapUrl, proxyIssues: proxyIssues, build: build, ipOk: ipOk };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NgCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
