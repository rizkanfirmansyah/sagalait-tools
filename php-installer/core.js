/* Pembuat perintah pemasangan PHP untuk Ubuntu dan Debian (apt). Logika murni, tanpa DOM; jalan di browser dan Node. */
(function (root) {
  'use strict';

  /* Tanggal dukungan dari php.net/supported-versions.php (aktif sampai, keamanan sampai). Periksa situs resminya untuk pembaruan. */
  var SERIES = [
    { v: '8.5', active: '2027-12-31', security: '2029-12-31' },
    { v: '8.4', active: '2026-12-31', security: '2028-12-31' },
    { v: '8.3', active: '2025-12-31', security: '2027-12-31' },
    { v: '8.2', active: '2024-12-31', security: '2026-12-31' },
    { v: '8.1', active: '2023-11-25', security: '2025-12-31' },
    { v: '8.0', active: '2022-11-26', security: '2023-11-26' },
    { v: '7.4', active: '2021-11-28', security: '2022-11-28' },
    { v: '7.3', active: '2020-12-06', security: '2021-12-06' },
    { v: '7.2', active: '2019-11-30', security: '2020-11-30' },
    { v: '7.1', active: '2018-12-01', security: '2019-12-01' },
    { v: '7.0', active: '2017-12-03', security: '2018-12-03' },
    { v: '5.6', active: '2016-12-31', security: '2018-12-31' }
  ];
  var OS = [
    ['ubuntu-24.04', 'Ubuntu 24.04 LTS', 'ubuntu', '8.3'],
    ['ubuntu-22.04', 'Ubuntu 22.04 LTS', 'ubuntu', '8.1'],
    ['ubuntu-20.04', 'Ubuntu 20.04 LTS', 'ubuntu', '7.4'],
    ['debian-13', 'Debian 13 (trixie)', 'debian', '8.4'],
    ['debian-12', 'Debian 12 (bookworm)', 'debian', '8.2'],
    ['debian-11', 'Debian 11 (bullseye)', 'debian', '7.4']
  ];
  var SOURCES = [
    ['ondrej', 'Repo Ondřej Surý, pilih versi (php8.2-fpm, ...)'],
    ['ondrej-latest', 'Repo Ondřej Surý, tanpa nomor (php-fpm, ...), ikut versi terbaru di repo'],
    ['distro', 'Repo bawaan distro, tanpa nomor (php-fpm, ...), versi default OS']
  ];
  /* min/max: rentang seri PHP (angka) tempat paket ada. pecl: paket PECL yang versinya tidak sama dengan PHP. */
  var PKGS = [
    { id: 'fpm', g: 'Server', label: 'FPM (untuk Nginx atau Apache proxy_fcgi)' },
    { id: 'apache', g: 'Server', label: 'Modul Apache (libapache2-mod-php)' },
    { id: 'cgi', g: 'Server', label: 'CGI' },
    { id: 'mysql', g: 'Database', label: 'MySQL / MariaDB (mysqli, pdo_mysql)' },
    { id: 'pgsql', g: 'Database', label: 'PostgreSQL (pgsql, pdo_pgsql)' },
    { id: 'sqlite3', g: 'Database', label: 'SQLite3' },
    { id: 'mongodb', g: 'Database', label: 'MongoDB', pecl: 1 },
    { id: 'redis', g: 'Cache', label: 'Redis', pecl: 1 },
    { id: 'memcached', g: 'Cache', label: 'Memcached', pecl: 1 },
    { id: 'apcu', g: 'Cache', label: 'APCu', pecl: 1 },
    { id: 'opcache', g: 'Cache', label: 'OPcache', max: 8.04, gone: 'OPcache sudah bawaan di PHP 8.5, jadi tidak ada paket php8.5-opcache terpisah.' },
    { id: 'gd', g: 'Umum', label: 'GD (gambar)' },
    { id: 'imagick', g: 'Umum', label: 'Imagick', pecl: 1 },
    { id: 'curl', g: 'Umum', label: 'cURL' },
    { id: 'mbstring', g: 'Umum', label: 'mbstring' },
    { id: 'xml', g: 'Umum', label: 'XML (dom, simplexml, xmlreader)' },
    { id: 'zip', g: 'Umum', label: 'Zip' },
    { id: 'intl', g: 'Umum', label: 'intl' },
    { id: 'bcmath', g: 'Umum', label: 'BCMath' },
    { id: 'gmp', g: 'Umum', label: 'GMP' },
    { id: 'soap', g: 'Umum', label: 'SOAP' },
    { id: 'ldap', g: 'Umum', label: 'LDAP' },
    { id: 'imap', g: 'Umum', label: 'IMAP' },
    { id: 'readline', g: 'Umum', label: 'Readline' },
    { id: 'tidy', g: 'Umum', label: 'Tidy' },
    { id: 'yaml', g: 'Umum', label: 'YAML', pecl: 1 },
    { id: 'ssh2', g: 'Umum', label: 'SSH2', pecl: 1 },
    { id: 'json', g: 'Lawas', label: 'JSON (hanya PHP sebelum 8.0)', max: 7.04 },
    { id: 'mcrypt', g: 'Lawas', label: 'mcrypt (hanya PHP 7.1 ke bawah)', max: 7.01 },
    { id: 'xmlrpc', g: 'Lawas', label: 'XML-RPC (hanya PHP 7.4 ke bawah)', max: 7.04 },
    { id: 'xdebug', g: 'Pengembangan', label: 'Xdebug', pecl: 1 },
    { id: 'dev', g: 'Pengembangan', label: 'Header pengembangan (phpize, php-config)' }
  ];
  var PRESETS = {
    laravel: ['fpm', 'mysql', 'pgsql', 'sqlite3', 'mbstring', 'xml', 'curl', 'zip', 'bcmath', 'intl', 'gd', 'redis', 'opcache'],
    wordpress: ['fpm', 'mysql', 'gd', 'curl', 'mbstring', 'xml', 'zip', 'intl', 'imagick', 'opcache'],
    minimal: ['fpm']
  };

  function num(v) { var p = String(v).split('.'); return +p[0] + +p[1] / 100; }
  function status(seriesV, today) {
    var s = SERIES.filter(function (x) { return x.v === seriesV; })[0];
    if (!s) return { key: 'unknown', text: 'tidak dikenal' };
    var d = (today || new Date()).toISOString().slice(0, 10);
    if (d <= s.active) return { key: 'active', text: 'Dukungan aktif sampai ' + s.active };
    if (d <= s.security) return { key: 'security', text: 'Hanya perbaikan keamanan sampai ' + s.security };
    return { key: 'eol', text: 'Sudah berakhir (EOL) sejak ' + s.security };
  }
  function available(pk, seriesV) {
    if (!seriesV) return true;
    var n = num(seriesV);
    return !(pk.max && n > pk.max + 1e-9) && !(pk.min && n < pk.min - 1e-9);
  }

  function defaults() {
    return { os: 'ubuntu-24.04', source: 'ondrej', ver: '8.3', pin: '', pkgs: ['fpm', 'mysql', 'pgsql', 'gd'], meta: true, yes: true, noRec: false, nonInter: false, hold: false };
  }

  function shq(s) { return /^[A-Za-z0-9_@%+=:,.\/*-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function wrap(prefix, items) {
    var one = prefix + ' ' + items.join(' ');
    if (one.length <= 96) return one;
    var lines = [], cur = [];
    items.forEach(function (it) { cur.push(it); if (cur.join(' ').length > 60) { lines.push(cur.join(' ')); cur = []; } });
    if (cur.length) lines.push(cur.join(' '));
    return prefix + ' \\\n    ' + lines.join(' \\\n    ');
  }

  function build(raw) {
    var s = Object.assign(defaults(), raw), os = OS.filter(function (o) { return o[0] === s.os; })[0] || OS[0];
    var fam = os[2], distroVer = os[3], errors = {}, notes = [], steps = [];
    var numbered = s.source === 'ondrej', ondrej = s.source !== 'distro';
    if (numbered && !SERIES.some(function (x) { return x.v === s.ver; })) errors.ver = 'Pilih versi PHP dari daftar.';
    var pin = String(s.pin || '').trim();
    if (!numbered) pin = ''; // kunci rilis hanya berlaku di mode pilih versi
    if (pin) {
      if (!/^\d+\.\d+\.\d+$/.test(pin)) errors.pin = 'Tulis nomor rilis lengkap, mis. ' + s.ver + '.12.';
      else if (pin.indexOf(s.ver + '.') !== 0) errors.pin = 'Rilis harus berawalan ' + s.ver + '. (mis. ' + s.ver + '.12), sesuai versi yang dipilih.';
    }
    if (Object.keys(errors).length) return { ok: false, errors: errors, steps: [], notes: [], pkgs: [] };

    var ver = numbered ? s.ver : null;
    var picked = PKGS.filter(function (p) { return s.pkgs.indexOf(p.id) >= 0 && (!numbered || available(p, ver)); });
    var skipped = PKGS.filter(function (p) { return s.pkgs.indexOf(p.id) >= 0 && numbered && !available(p, ver); });

    function name(id) {
      if (id === 'apache') return numbered ? 'libapache2-mod-php' + ver : 'libapache2-mod-php';
      return (numbered ? 'php' + ver + '-' : 'php-') + id;
    }
    var core = [], pecl = [];
    var head = s.meta ? (numbered ? 'php' + ver : 'php') : name('cli');
    core.push(head);
    picked.forEach(function (p) { (p.pecl ? pecl : core).push(name(p.id)); });
    if (numbered && !core.some(function (c) { return c === name('cli'); }) && !s.meta) core.unshift(name('cli'));
    var all = core.concat(pecl);
    var pinned = all.map(function (n) {
      if (!pin) return n;
      return pecl.indexOf(n) >= 0 ? n : n + '=' + pin + '*';
    });

    /* 1. repo */
    if (ondrej) {
      if (fam === 'ubuntu') {
        steps.push({ title: 'Tambah repo PHP Ondřej Surý (Ubuntu)', desc: 'PPA ini menyediakan banyak versi PHP berdampingan. Cukup dilakukan sekali per server.',
          cmd: 'sudo apt update\nsudo apt install -y software-properties-common ca-certificates lsb-release apt-transport-https\nsudo LC_ALL=C.UTF-8 add-apt-repository -y ppa:ondrej/php\nsudo apt update' });
        notes.push({ lv: 'info', title: 'Bila add-apt-repository gagal karena locale', text: 'Awalan LC_ALL=C.UTF-8 mencegah galat encoding. Setelah repo ditambah, cek isinya dengan: apt-cache policy php' + (ver || '') + '-cli' });
      } else {
        steps.push({ title: 'Tambah repo PHP Sury (Debian)', desc: 'Repo resmi packages.sury.org milik Ondřej Surý untuk Debian. Kuncinya dipasang lewat paket keyring.',
          cmd: 'sudo apt update\nsudo apt install -y lsb-release ca-certificates curl\nsudo curl -sSLo /tmp/debsuryorg-archive-keyring.deb https://packages.sury.org/debsuryorg-archive-keyring.deb\nsudo dpkg -i /tmp/debsuryorg-archive-keyring.deb\nsudo sh -c \'echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list\'\nsudo apt update' });
      }
    } else {
      steps.push({ title: 'Perbarui daftar paket', desc: 'Repo bawaan distro dipakai apa adanya, jadi tidak ada repo yang ditambahkan.', cmd: 'sudo apt update' });
    }

    /* 2. pasang */
    var pre = 'sudo' + (s.nonInter ? ' DEBIAN_FRONTEND=noninteractive' : '') + ' apt install' + (s.yes ? ' -y' : '') + (s.noRec ? ' --no-install-recommends' : '');
    steps.push({ title: 'Pasang PHP dan paketnya', desc: numbered ? 'Versi ' + ver + (pin ? ', dikunci ke rilis ' + pin : ', rilis terbaru di repo') + '.' : (ondrej ? 'Tanpa nomor: apt memilih versi PHP terbaru yang ada di repo Ondřej.' : 'Tanpa nomor: apt memasang versi PHP default OS ini (' + distroVer + ').'), cmd: wrap(pre, pinned.map(shq)) });
    if (pin && s.hold) steps[steps.length - 1].cmd += '\n\n# Cegah apt upgrade menaikkan rilis PHP ini\n' + wrap('sudo apt-mark hold', core.map(shq));

    /* 3. layanan + verifikasi */
    var svcVer = numbered ? ver : (ondrej ? null : distroVer);
    var hasFpm = picked.some(function (p) { return p.id === 'fpm'; });
    var hasApache = picked.some(function (p) { return p.id === 'apache'; });
    var v = [];
    if (hasFpm) {
      var svc = svcVer ? 'php' + svcVer + '-fpm' : 'php*-fpm';
      v.push('# Jalankan FPM dan aktifkan saat boot');
      v.push(svcVer ? 'sudo systemctl enable --now ' + svc : 'sudo systemctl enable --now "$(systemctl list-unit-files --no-legend \'php*-fpm.service\' | awk \'{print $1}\' | head -n1)"');
      v.push(svcVer ? 'sudo systemctl status ' + svc + ' --no-pager' : 'systemctl list-units \'php*-fpm*\' --no-pager');
      if (svcVer) v.push('sudo php-fpm' + svcVer + ' -t');
      v.push('');
    }
    v.push('# Cek versi dan ekstensi yang aktif');
    v.push(numbered ? 'php' + ver + ' -v' : 'php -v');
    var mods = picked.filter(function (p) { return ['mysql', 'pgsql', 'sqlite3', 'gd', 'curl', 'mbstring', 'intl', 'zip', 'redis', 'imagick', 'bcmath', 'mongodb', 'xdebug', 'gmp', 'ldap', 'soap'].indexOf(p.id) >= 0; }).map(function (p) { return p.id; });
    if (mods.length) v.push((numbered ? 'php' + ver : 'php') + ' -m | grep -i -E ' + shq(mods.map(function (m) { return m === 'mysql' ? 'mysqli|pdo_mysql' : m === 'pgsql' ? 'pgsql' : m; }).join('|')));
    steps.push({ title: 'Jalankan layanan dan periksa', desc: null, cmd: v.join('\n') });

    /* 4. opsional */
    var opt = [];
    if (numbered) { opt.push('# Jadikan versi ini PHP default di terminal (php, bukan php' + ver + ')'); opt.push('sudo update-alternatives --set php /usr/bin/php' + ver); opt.push('php -v'); }
    if (hasApache && numbered) { if (opt.length) opt.push(''); opt.push('# Apache: pindah ke modul PHP ' + ver + ' lalu muat ulang'); opt.push('sudo a2dismod "php*" 2>/dev/null; sudo a2enmod php' + ver); opt.push('sudo systemctl restart apache2'); }
    if (hasFpm) {
      if (opt.length) opt.push('');
      opt.push('# Apache + FPM (tanpa modul PHP)');
      opt.push('sudo a2enmod proxy_fcgi setenvif' + (svcVer ? '\nsudo a2enconf php' + svcVer + '-fpm' : ''));
      opt.push('sudo systemctl reload apache2');
    }
    if (opt.length) steps.push({ title: 'Opsional: versi default dan Apache', desc: 'Berguna bila ada lebih dari satu versi PHP di server.', cmd: opt.join('\n') });
    if (hasFpm) {
      var sock = svcVer ? '/run/php/php' + svcVer + '-fpm.sock' : '/run/php/php-fpm.sock';
      steps.push({ title: 'Opsional: hubungkan Nginx ke FPM', desc: 'Tempel di blok server { } Nginx, lalu sudo nginx -t dan sudo systemctl reload nginx.', cmd: 'location ~ \\.php$ {\n    include snippets/fastcgi-php.conf;\n    fastcgi_pass unix:' + sock + ';\n}', code: true });
    }

    /* 5. hapus */
    var rm = [];
    rm.push(numbered ? "sudo apt purge 'php" + ver + "*'" : (ondrej ? "sudo apt purge 'php*'" : "sudo apt purge 'php*'"));
    rm.push('sudo apt autoremove --purge');
    if (ondrej) rm.push(fam === 'ubuntu' ? 'sudo add-apt-repository --remove ppa:ondrej/php' : 'sudo rm /etc/apt/sources.list.d/php.list');
    steps.push({ title: 'Cara menghapus', desc: 'Menghapus paket PHP ' + (numbered ? ver : '') + ' beserta konfigurasinya' + (ondrej ? ' dan repo Ondřej' : '') + '. Cadangkan /etc/php lebih dulu bila ada pengaturan sendiri.', cmd: rm.join('\n') });

    /* catatan */
    if (numbered) {
      var st = status(ver);
      if (st.key === 'eol') notes.push({ lv: 'warning', title: 'PHP ' + ver + ' sudah EOL', text: st.text + '. Tidak ada perbaikan keamanan dari tim PHP. Pakai hanya untuk aplikasi lawas yang belum bisa dipindah.' });
      else if (st.key === 'security') notes.push({ lv: 'info', title: 'PHP ' + ver + ' hanya menerima perbaikan keamanan', text: st.text + '. Rencanakan pindah ke versi yang masih aktif.' });
      if (num(ver) < 8 && fam === 'ubuntu' && os[0] === 'ubuntu-24.04') notes.push({ lv: 'warning', title: 'PHP ' + ver + ' di Ubuntu 24.04', text: 'Versi PHP lawas mungkin tidak tersedia atau tidak terpelihara untuk rilis OS ini. Cek dengan: apt-cache policy php' + ver + '-cli' });
      notes.push({ lv: 'info', title: 'Beberapa versi berdampingan', text: 'Dengan nomor versi, php' + ver + ' dan versi lain bisa terpasang bersamaan. Tiap versi punya layanan FPM dan soket sendiri.' });
    }
    if (!numbered) notes.push({ lv: 'info', title: 'Tanpa nomor versi', text: ondrej ? 'php, php-fpm, dan lainnya mengikuti versi terbaru di repo Ondřej, jadi upgrade berikutnya bisa menaikkan versi PHP. Untuk versi tetap, pakai mode "pilih versi".' : 'Versi PHP mengikuti default distro (' + distroVer + ' untuk ' + os[1] + '). Cek yang sebenarnya dengan: apt-cache policy php' });
    if (ondrej && !numbered) notes.push({ lv: 'info', title: 'Soket FPM', text: 'Paket php-fpm menyediakan tautan /run/php/php-fpm.sock yang menunjuk ke versi aktif.' });
    if (s.meta && hasFpm && !hasApache) notes.push({ lv: 'warning', title: 'Metapaket bisa menarik Apache', text: 'Paket ' + head + ' bergantung pada modul Apache, FPM, atau CGI. Bila apt memilih modul Apache, apache2 ikut terpasang. Matikan opsi "Tulis seperti metapaket" untuk memakai ' + name('cli') + ' saja.' });
    if (pecl.length) notes.push({ lv: 'info', title: 'Paket PECL', text: 'Paket ' + pecl.join(', ') + ' punya nomor versi sendiri, jadi tidak ikut dikunci ke rilis PHP.' });
    skipped.forEach(function (p) { notes.push({ lv: 'info', title: p.label + ' dilewati', text: p.gone || 'Paket ini tidak ada untuk PHP ' + ver + ' dan tidak dimasukkan ke perintah.' }); });
    if (pin) notes.push({ lv: 'info', title: 'Mengunci rilis ' + pin, text: 'Akhiran =' + pin + '* memilih rilis yang diawali nomor itu. Lihat rilis yang tersedia: apt-cache madison php' + ver + '-cli. Bila tidak ada, apt menolak dengan "Version not found".' });
    notes.push({ lv: 'info', title: 'Perintah belum dijalankan di server Anda', text: 'Nama paket dan repo dibuat dari isian dan pengetahuan umum tentang paket Debian/Ubuntu. Periksa dengan apt-cache policy sebelum memakainya di produksi.' });

    return { ok: true, errors: {}, steps: steps, notes: notes, pkgs: all, status: numbered ? status(ver) : null };
  }

  var API = { SERIES: SERIES, OS: OS, SOURCES: SOURCES, PKGS: PKGS, PRESETS: PRESETS, defaults: defaults, build: build, status: status, available: available };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PHPI = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
