/* Pembuat perintah koneksi database (MySQL, MariaDB, PostgreSQL). Logika murni, tanpa DOM; jalan di browser dan Node.
   Tidak pernah menerima atau menyusun kata sandi: klien selalu menanyakannya lewat prompt. */
(function (root) {
  'use strict';

  var TASKS = [
    ['connect', 'Masuk ke database (interaktif)'],
    ['query', 'Jalankan satu query'],
    ['runfile', 'Jalankan file .sql'],
    ['listDb', 'Lihat daftar database'],
    ['listTables', 'Lihat daftar tabel'],
    ['createDb', 'Buat database baru'],
    ['dumpStruct', 'Dump struktur saja (tanpa data)'],
    ['dumpData', 'Dump data saja'],
    ['dumpFull', 'Dump lengkap (struktur + data)'],
    ['dumpAll', 'Dump semua database'],
    ['restore', 'Pulihkan dari file dump']
  ];
  var ENGINES = [['mysql', 'MySQL'], ['mariadb', 'MariaDB'], ['pg', 'PostgreSQL']];
  var NEED_DB = { listTables: 1, dumpStruct: 1, dumpData: 1, dumpFull: 1, restore: 1, runfile: 0, query: 0, connect: 0, createDb: 1 };

  function defaults() {
    return { engine: 'mysql', task: 'connect', host: '', port: '', user: '', db: '', tables: '', file: '', sql: '', stamp: false, gz: false,
      noComments: true, routines: true, noOwner: true, custom: false, fromGz: false, restoreFmt: 'plain', ssh: false, sshTarget: '', sshLocal: '' };
  }

  /* kutip untuk shell: aman bila hanya karakter biasa, selain itu pakai kutip tunggal */
  function shq(s) {
    s = String(s);
    if (s === '') return "''";
    if (/^[A-Za-z0-9_@%+=:,.\/-]+$/.test(s)) return s;
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  function tok(parts) { return parts.map(function (t) { return t && t.raw != null ? t.raw : shq(t); }).join(' '); }
  function R(s) { return { raw: s }; }

  function validate(s, need) {
    var e = {};
    if (/[\r\n\0]/.test(s.host + s.user + s.db + s.file)) e.host = 'Isian tidak boleh berisi baris baru.';
    if (s.host && !/^[A-Za-z0-9._:\-]+$/.test(s.host)) e.host = 'Host hanya boleh huruf, angka, titik, titik dua, dan strip. Contoh: 9.9.9.140 atau db.contoh.local.';
    if (s.port !== '' && !(/^\d+$/.test(String(s.port)) && +s.port >= 1 && +s.port <= 65535)) e.port = 'Port harus angka 1 sampai 65535.';
    if (!String(s.user).trim() && need.user) e.user = 'Isi nama pengguna database.';
    if (!String(s.db).trim() && need.db) e.db = 'Isi nama database.';
    if (need.file && !String(s.file).trim()) e.file = 'Isi nama file.';
    if (need.sql && !String(s.sql).trim()) e.sql = 'Tulis query yang akan dijalankan.';
    if (s.stamp && /["$`\\]/.test(s.file)) e.file = 'Nama file dengan tanggal tidak boleh memuat tanda kutip ganda, $, ` atau garis miring terbalik.';
    var t = String(s.tables || '').split(/[\s,]+/).filter(Boolean);
    t.forEach(function (x) { if (/[\r\n\0]/.test(x)) e.tables = 'Nama tabel tidak valid.'; });
    if (s.ssh) {
      if (!/^[^\s@]+@[A-Za-z0-9._\-]+$|^[A-Za-z0-9._\-]+$/.test(String(s.sshTarget).trim())) e.sshTarget = 'Tulis tujuan SSH, mis. admin@bastion.contoh.local.';
      if (s.sshLocal !== '' && !(/^\d+$/.test(String(s.sshLocal)) && +s.sshLocal >= 1 && +s.sshLocal <= 65535)) e.sshLocal = 'Port lokal harus angka 1 sampai 65535.';
    }
    return e;
  }

  function stampName(s, ext, gz) {
    var f = s.file.trim();
    if (!f) return '';
    if (gz && !/\.gz$/i.test(f)) f += '.gz';
    if (!s.stamp) return f;
    var m = f.match(/(\.sql\.gz|\.sql|\.dump|\.gz)$/i), e = m ? m[0] : '', base = m ? f.slice(0, -e.length) : f;
    return R('"' + base + '-$(date +%F)' + e + '"');
  }

  function build(raw) {
    var s = Object.assign(defaults(), raw), my = s.engine !== 'pg', t = s.task, flags = [], notes = [], cmds = [];
    var need = { user: t !== 'dumpAll' || true, db: !!NEED_DB[t], file: false, sql: t === 'query' };
    if (t === 'runfile' || t === 'restore') need.file = true;
    if (/^dump/.test(t) && t !== 'connect') need.file = true;
    if (t === 'runfile' && my) need.db = true;
    var err = validate(s, need);
    if (Object.keys(err).length) return { ok: false, errors: err, cmds: [], flags: [], notes: [] };

    var host = s.host.trim(), port = String(s.port).trim(), user = s.user.trim(), db = s.db.trim();
    var tables = String(s.tables || '').split(/[\s,]+/).filter(Boolean);
    var ext = s.gz ? '.sql.gz' : '.sql';

    /* tunnel SSH: klien tersambung ke port lokal */
    if (s.ssh) {
      var rp = port || (my ? '3306' : '5432'), lp = String(s.sshLocal).trim() || (my ? '3307' : '5433');
      cmds.push({ label: '1. Buka tunnel SSH (biarkan jalan di terminal ini, atau tambah -f untuk latar belakang)', text: tok(['ssh', '-N', '-L', lp + ':' + (host || '127.0.0.1') + ':' + rp, s.sshTarget.trim()]) });
      flags.push(['-N', 'hanya membuat tunnel, tidak membuka shell di server']);
      flags.push(['-L ' + lp + ':' + (host || '127.0.0.1') + ':' + rp, 'port ' + lp + ' di komputer ini diteruskan ke ' + (host || '127.0.0.1') + ':' + rp + ' lewat server SSH']);
      host = '127.0.0.1'; port = lp;
    }

    var bin, dumpBin;
    if (s.engine === 'mysql') { bin = 'mysql'; dumpBin = 'mysqldump'; }
    else if (s.engine === 'mariadb') { bin = 'mariadb'; dumpBin = 'mariadb-dump'; }
    var conn = [];
    function connFlags(hostFlag, portFlag, userFlag) {
      if (host) { conn.push(hostFlag, host); flags.push([hostFlag, 'alamat server database']); }
      if (port) { conn.push(portFlag, port); flags.push([portFlag, 'port server' + (my ? ' (huruf besar P)' : '')]); }
      conn.push(userFlag, user); flags.push([userFlag, 'nama pengguna database']);
    }
    var main = [], out = '';

    if (my) {
      connFlags('-h', '-P', '-u');
      var pw = ['-p']; flags.push(['-p', 'minta kata sandi lewat prompt. Jangan tulis sandi di belakangnya (-pSANDI), karena terbaca di riwayat dan daftar proses.']);
      var dbTok = db ? [db] : [];
      switch (t) {
        case 'connect': main = [bin].concat(conn, pw, dbTok); if (db) flags.push(['nama database', 'database yang langsung dipakai setelah masuk']); break;
        case 'query': main = [bin].concat(conn, pw, ['-e', s.sql.trim()], dbTok); flags.push(['-e', 'jalankan query ini lalu keluar']); break;
        case 'listDb': main = [bin].concat(conn, pw, ['-e', 'SHOW DATABASES;']); flags.push(['-e', 'jalankan query ini lalu keluar']); break;
        case 'listTables': main = [bin].concat(conn, pw, ['-e', 'SHOW TABLES;', db]); break;
        case 'createDb': main = [bin].concat(conn, pw, ['-e', 'CREATE DATABASE `' + db.replace(/`/g, '') + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;']); flags.push(['CHARACTER SET utf8mb4', 'dukungan penuh Unicode, termasuk emoji']); break;
        case 'runfile':
          main = [bin].concat(conn, pw, [db, R('<'), s.file.trim()]); flags.push(['< file', 'isi file dikirim sebagai perintah ke database']); break;
        case 'restore':
          if (s.fromGz) main = [R('gunzip -c'), s.file.trim(), R('|'), bin].concat(conn, pw, [db]);
          else main = [bin].concat(conn, pw, [db, R('<'), s.file.trim()]);
          flags.push([s.fromGz ? 'gunzip -c file | …' : '< file', s.fromGz ? 'buka file .gz lalu kirim isinya ke database' : 'isi file dikirim sebagai perintah ke database']);
          notes.push({ lv: 'warning', title: 'Pulihkan menimpa data', text: 'Tabel yang sama di database "' + db + '" akan diganti isinya. Pulihkan dulu ke database cadangan bila ragu, dan buat dump baru sebelum menimpa.' });
          break;
        default: { // dump*
          var d = [dumpBin].concat(conn, pw);
          if (t === 'dumpAll') { d.push('--all-databases'); flags.push(['--all-databases', 'semua database sekaligus']); }
          if (t === 'dumpStruct') { d.push('--no-data'); flags.push(['--no-data', 'struktur saja, tanpa isi tabel']); }
          if (t === 'dumpData') { d.push('--no-create-info'); flags.push(['--no-create-info', 'isi tabel saja, tanpa CREATE TABLE']); }
          if (t === 'dumpFull' || t === 'dumpAll') { d.push('--single-transaction'); flags.push(['--single-transaction', 'salinan konsisten untuk tabel InnoDB tanpa mengunci tabel']); }
          if (s.noComments) { d.push('--skip-comments'); flags.push(['--skip-comments', 'tanpa baris komentar di file, jadi mudah dibandingkan (diff)']); }
          if (s.routines && t !== 'dumpData') { d.push('--routines', '--triggers'); flags.push(['--routines', 'sertakan stored procedure dan function'], ['--triggers', 'sertakan trigger']); }
          if (t === 'dumpFull' || t === 'dumpAll') { d.push('--events'); flags.push(['--events', 'sertakan event scheduler']); }
          if (t !== 'dumpAll') { d.push(db); if (tables.length) { d = d.concat(tables); flags.push(['nama tabel', 'hanya tabel ini yang di-dump']); } }
          out = stampName(s, ext, s.gz);
          main = d.concat(s.gz ? [R('|'), R('gzip'), R('>'), out] : [R('>'), out]);
          flags.push([s.gz ? '| gzip > file' : '> file', s.gz ? 'hasil dikompres lalu disimpan ke file' : 'hasil disimpan ke file (bukan ke layar)']);
          if (t === 'dumpAll') notes.push({ lv: 'info', title: 'Butuh hak akses luas', text: 'Dump semua database biasanya perlu pengguna dengan hak SELECT dan SHOW VIEW di semua database.' });
        }
      }
      if (s.engine === 'mariadb') notes.push({ lv: 'info', title: 'Nama program MariaDB', text: 'MariaDB 10.5 ke atas memakai "mariadb" dan "mariadb-dump". Di versi lama atau bila perintah tidak ditemukan, ganti dengan "mysql" dan "mysqldump".' });
      if (host === 'localhost') notes.push({ lv: 'info', title: 'localhost memakai socket', text: 'Host "localhost" membuat klien MySQL memakai socket Unix dan mengabaikan port. Pakai 127.0.0.1 untuk memaksa koneksi TCP.' });
    } else {
      var base = function (cmd) {
        var a = [cmd];
        if (host) { a.push('-h', host); flags.push(['-h', 'alamat server database']); }
        if (port) { a.push('-p', port); flags.push(['-p', 'port server (huruf kecil p, bukan sandi)']); }
        a.push('-U', user); flags.push(['-U', 'nama pengguna database (huruf besar U)']);
        return a;
      };
      switch (t) {
        case 'connect': main = base('psql'); if (db) { main.push('-d', db); flags.push(['-d', 'database yang dipakai']); } break;
        case 'query': main = base('psql'); if (db) main.push('-d', db); main.push('-c', s.sql.trim()); flags.push(['-c', 'jalankan perintah ini lalu keluar']); break;
        case 'listDb': main = base('psql'); main.push('-l'); flags.push(['-l', 'tampilkan daftar database']); break;
        case 'listTables': main = base('psql'); main.push('-d', db, '-c', '\\dt'); flags.push(['\\dt', 'perintah psql untuk daftar tabel']); break;
        case 'createDb': main = base('createdb'); main.push('--encoding=UTF8', db); flags.push(['--encoding=UTF8', 'karakter Unicode']); break;
        case 'runfile': main = base('psql'); if (db) main.push('-d', db); main.push('-f', s.file.trim()); flags.push(['-f', 'jalankan perintah dari file']); break;
        case 'restore':
          if (s.restoreFmt === 'custom') { main = base('pg_restore'); main.push('-d', db, '--no-owner', s.file.trim()); flags.push(['pg_restore', 'untuk file dump format custom (-Fc)'], ['--no-owner', 'abaikan pemilik objek di file, pakai pengguna ini']); }
          else if (s.fromGz) { main = [R('gunzip -c'), s.file.trim(), R('|')].concat(base('psql'), ['-d', db]); flags.push(['gunzip -c file | psql', 'buka file .gz lalu kirim ke psql']); }
          else { main = base('psql'); main.push('-d', db, '-f', s.file.trim()); flags.push(['-f', 'jalankan perintah dari file']); }
          notes.push({ lv: 'warning', title: 'Pulihkan menimpa data', text: 'Objek yang sama di database "' + db + '" bisa gagal dibuat atau tertimpa. Buat database kosong dulu (tugas "Buat database baru") dan pulihkan ke sana bila ragu.' });
          break;
        default: {
          if (t === 'dumpAll') { main = base('pg_dumpall'); flags.push(['pg_dumpall', 'semua database beserta role']); notes.push({ lv: 'info', title: 'Butuh superuser', text: 'pg_dumpall membaca role dan semua database, jadi biasanya perlu pengguna superuser.' }); }
          else {
            main = base('pg_dump'); main.push('-d', db); flags.push(['-d', 'database yang di-dump']);
            if (t === 'dumpStruct') { main.push('--schema-only'); flags.push(['--schema-only', 'struktur saja, tanpa isi tabel']); }
            if (t === 'dumpData') { main.push('--data-only'); flags.push(['--data-only', 'isi tabel saja']); }
            if (s.noOwner) { main.push('--no-owner'); flags.push(['--no-owner', 'tanpa perintah pemilik objek, lebih mudah dipulihkan di server lain']); }
            tables.forEach(function (x) { main.push('-t', x); }); if (tables.length) flags.push(['-t', 'hanya tabel ini']);
            if (s.custom && t === 'dumpFull') { main.push('-Fc'); flags.push(['-Fc', 'format custom terkompresi, pulihkan dengan pg_restore']); }
          }
          out = stampName(s, ext, s.gz && !(s.custom && t === 'dumpFull'));
          if (s.gz && !(s.custom && t === 'dumpFull')) { main = main.concat([R('|'), R('gzip'), R('>'), out]); flags.push(['| gzip > file', 'hasil dikompres lalu disimpan ke file']); }
          else { main = main.concat([R('-f'), out]); flags.push(['-f', 'simpan hasil ke file']); }
        }
      }
      notes.push({ lv: 'info', title: 'Kata sandi PostgreSQL', text: 'psql dan pg_dump menanyakan sandi lewat prompt. Untuk skrip otomatis pakai berkas ~/.pgpass (izin 600), bukan variabel PGPASSWORD di riwayat shell.' });
    }

    var label = cmds.length ? '2. Jalankan perintahnya' : 'Perintah';
    cmds.push({ label: label, text: tok(main) });
    if (my) notes.push({ lv: 'info', title: 'Kata sandi MySQL/MariaDB', text: 'Untuk skrip otomatis simpan kredensial di ~/.my.cnf (izin 600) pada bagian [client], bukan di baris perintah.' });
    if (s.ssh) notes.push({ lv: 'info', title: 'Dua terminal', text: 'Biarkan perintah tunnel tetap berjalan, lalu jalankan perintah kedua di terminal lain. Tutup tunnel dengan Ctrl+C.' });
    if (out && !(out && out.raw)) { /* nama file biasa */ }
    return { ok: true, errors: {}, cmds: cmds, flags: dedupe(flags), notes: notes };
  }

  function dedupe(f) { var seen = {}; return f.filter(function (x) { var k = x[0]; if (seen[k]) return false; seen[k] = 1; return true; }); }

  var API = { TASKS: TASKS, ENGINES: ENGINES, defaults: defaults, build: build, shq: shq };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.DBCMD = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
