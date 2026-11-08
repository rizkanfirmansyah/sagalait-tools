/* Inti logika Cron dan systemd timer: fungsi murni, tanpa DOM (dipakai app.js dan uji Node). */
(function (root) {
  'use strict';

  var MON_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var DOW_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DOW_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var MON_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DOW_SD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // urutan pekan Indonesia: Senin sampai Minggu
  var MAXDAY = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  var ALIAS = {
    '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *'
  };

  var FIELDS = [
    { key: 'min', label: 'menit', lo: 0, hi: 59 },
    { key: 'hour', label: 'jam', lo: 0, hi: 23 },
    { key: 'dom', label: 'tanggal', lo: 1, hi: 31 },
    { key: 'mon', label: 'bulan', lo: 1, hi: 12, names: MON_EN, base: 1 },
    { key: 'dow', label: 'hari-minggu', lo: 0, hi: 7, names: DOW_EN, base: 0 }
  ];

  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var range = function (a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; };
  var blank = function (n) { var a = []; for (var i = 0; i < n; i++) a.push(false); return a; };

  /* ------------------------------------------------------------ parser cron */

  var QUARTZ = 'Itu sintaks Quartz/Spring/lainnya, bukan cron Linux standar.';

  function parseField(text, f) {
    var size = f.key === 'dow' ? 7 : f.hi + 1;
    var set = blank(size);
    var where = 'Kolom ' + f.label + ' ("' + text + '"): ';
    var items = text.split(',');
    for (var n = 0; n < items.length; n++) {
      var item = items[n];
      if (item === '') return { error: where + 'ada koma berlebih atau bagian kosong. Tulis daftar seperti 1,15.' };
      if (/[?#]/.test(item) || /^(l|lw|\d+w|\d+l|l-\d+)$/i.test(item)) {
        return { error: where + '"' + item + '" memakai penanda L, W, # atau ?. ' + QUARTZ + ' Ganti dengan angka atau rentang biasa.' };
      }
      var sp = item.split('/');
      if (sp.length > 2) return { error: where + '"' + item + '" punya lebih dari satu "/". Format langkah: */5 atau 10-30/5.' };
      var step = 1, a, b;
      if (sp.length === 2) {
        if (!/^\d+$/.test(sp[1])) return { error: where + 'langkah "' + sp[1] + '" harus berupa angka bulat, mis. */5.' };
        step = parseInt(sp[1], 10);
        if (step < 1) return { error: where + 'langkah harus minimal 1 (0 tidak valid).' };
        if (step > f.hi - f.lo + 1) return { error: where + 'langkah ' + step + ' terlalu besar untuk rentang ' + f.lo + '-' + f.hi + '.' };
      }
      var r = sp[0];
      if (r === '*') {
        a = f.lo; b = f.key === 'dow' ? 6 : f.hi;
      } else if (r.indexOf('-') !== -1) {
        var rp = r.split('-');
        if (rp.length !== 2) return { error: where + 'rentang "' + r + '" tidak valid. Tulis dengan satu tanda minus, mis. 1-5.' };
        a = value(rp[0], f); b = value(rp[1], f);
        if (typeof a === 'string') return { error: where + a };
        if (typeof b === 'string') return { error: where + b };
        if (a > b) return { error: where + 'rentang terbalik "' + r + '" (awal lebih besar dari akhir). Tulis ' + rp[1] + '-' + rp[0] + ' atau pecah jadi dua rentang.' };
      } else {
        if (sp.length === 2) return { error: where + 'langkah "' + item + '" harus dipasang pada * atau rentang, mis. ' + r + '-' + f.hi + '/' + step + '.' };
        a = b = value(r, f);
        if (typeof a === 'string') return { error: where + a };
      }
      for (var v = a; v <= b; v += step) set[f.key === 'dow' ? v % 7 : v] = true;
    }
    return { set: set, star: text.charAt(0) === '*' };
  }

  function value(tok, f) {
    if (/^\d+$/.test(tok)) {
      var v = parseInt(tok, 10);
      if (v < f.lo || v > f.hi) return 'nilai ' + v + ' di luar batas, harus ' + f.lo + ' sampai ' + f.hi + '.';
      return v;
    }
    if (f.names) {
      var i = f.names.indexOf(tok.toLowerCase());
      if (i !== -1) return i + f.base;
    }
    return '"' + tok + '" tidak dikenali' + (f.names ? ' (pakai angka atau nama 3 huruf Inggris, mis. ' + f.names[0] + ')' : ', harus angka') + '.';
  }

  function parseCron(input) {
    var s = String(input).trim();
    if (!s) return { ok: false, error: 'Ekspresi masih kosong. Isi 5 kolom: menit jam tanggal bulan hari-minggu.' };
    var alias = null;
    if (s.charAt(0) === '@') {
      var k = s.toLowerCase();
      if (/\s/.test(k)) return { ok: false, error: 'Alias ' + k.split(/\s+/)[0] + ' tidak boleh diikuti kolom lain. Tulis alias saja, atau 5 kolom biasa.' };
      if (k === '@reboot') return { ok: true, reboot: true, alias: '@reboot' };
      if (!ALIAS[k]) return { ok: false, error: 'Alias "' + s + '" tidak dikenal. Yang didukung: @hourly, @daily, @weekly, @monthly, @yearly, @reboot.' };
      alias = k; s = ALIAS[k];
    }
    var cols = s.split(/\s+/);
    if (cols.length === 6 || cols.length === 7) {
      return { ok: false, error: 'Ekspresi punya ' + cols.length + ' kolom. Cron standar hanya 5 kolom (menit jam tanggal bulan hari-minggu); kolom detik dan/atau tahun adalah sintaks Quartz atau scheduler lain. Jika ini baris /etc/cron.d, kolom ke-6 itu nama pengguna: tulis hanya 5 kolom jadwalnya di sini.' };
    }
    if (cols.length !== 5) return { ok: false, error: 'Ekspresi punya ' + cols.length + ' kolom, butuh tepat 5: menit jam tanggal bulan hari-minggu.' };
    var parsed = [];
    for (var i = 0; i < 5; i++) {
      var p = parseField(cols[i], FIELDS[i]);
      if (p.error) return { ok: false, error: p.error };
      parsed.push(p);
    }
    var mon = [false].concat(parsed[3].set.slice(1));
    var dom = [false].concat(parsed[2].set.slice(1));
    var domStar = parsed[2].star, dowStar = parsed[4].star;
    return {
      ok: true, alias: alias, cols: cols, domStar: domStar, dowStar: dowStar,
      spec: {
        min: parsed[0].set, hour: parsed[1].set, dom: dom, mon: mon, dow: parsed[4].set,
        // Vixie cron: bila tanggal dan hari-minggu sama-sama dibatasi (tidak diawali *), cukup salah satu cocok.
        dayMode: (!domStar && !dowStar) ? 'or' : 'and', years: null
      }
    };
  }

  /* ------------------------------------------------------------ zona waktu dan penghitung */

  var dtfCache = {};
  function dtf(tz) {
    if (!dtfCache[tz]) {
      dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
    }
    return dtfCache[tz];
  }
  // Waktu dinding (jam di dinding) pada zona tz, dinyatakan sebagai ms "UTC palsu".
  function wallOf(ms, tz) {
    var o = {};
    dtf(tz).formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
  }
  function offsetAt(ms, tz) { return wallOf(ms, tz) - Math.floor(ms / 1000) * 1000; }
  // Waktu dinding -> instan. null bila waktu itu tidak ada (celah DST). Bila ganda, ambil yang pertama.
  function wallToInstant(w, tz) {
    var c = [w - offsetAt(w - 86400000, tz), w - offsetAt(w + 86400000, tz)].filter(function (t) { return wallOf(t, tz) === w; });
    if (!c.length) return null;
    return Math.min.apply(null, c);
  }

  function dayOk(spec, wd, dd) {
    var a = spec.dom[dd], b = spec.dow[wd];
    return spec.dayMode === 'or' ? (a || b) : (a && b);
  }
  var YEARS = 100;
  function nextWall(spec, w, limit) {
    while (w <= limit) {
      var d = new Date(w), y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1, dd = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes();
      if (spec.years && !spec.years(y)) { w = Date.UTC(y + 1, 0, 1); continue; }
      if (!spec.mon[mo]) { w = Date.UTC(y, mo, 1); continue; }
      if (!dayOk(spec, d.getUTCDay(), dd)) { w = Date.UTC(y, mo - 1, dd + 1); continue; }
      if (!spec.hour[h]) { w = Date.UTC(y, mo - 1, dd, h + 1); continue; }
      if (!spec.min[mi]) { w += 60000; continue; }
      return w;
    }
    return null;
  }
  // count waktu jalan setelah fromMs (ms epoch), dihitung pada waktu dinding zona tz.
  function nextRuns(spec, fromMs, tz, count) {
    var w = wallOf(fromMs, tz);
    w = w - (w % 60000) + 60000;
    var limit = w + YEARS * 366 * 86400000, out = [];
    while (out.length < count && w <= limit) {
      w = nextWall(spec, w, limit);
      if (w === null) break;
      var t = wallToInstant(w, tz);
      if (t !== null && t > fromMs) out.push(t);
      w += 60000;
    }
    return out;
  }
  // true bila kombinasi tanggal dan bulan yang dipilih tidak pernah ada (mis. 31 Februari).
  function neverDate(spec) {
    if (spec.dayMode === 'or') return false;
    for (var m = 1; m <= 12; m++) {
      if (!spec.mon[m]) continue;
      for (var d = 1; d <= MAXDAY[m]; d++) if (spec.dom[d]) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ penjelasan Indonesia */

  function vals(set, lo) { var r = []; for (var i = lo || 0; i < set.length; i++) if (set[i]) r.push(i); return r; }
  function joinID(a) {
    if (a.length <= 1) return a.join('');
    if (a.length === 2) return a[0] + ' dan ' + a[1];
    return a.slice(0, -1).join(', ') + ', dan ' + a[a.length - 1];
  }
  function stepOf(v, lo, max) {
    if (v.length < 2 || v[0] !== lo) return 0;
    var d = v[1] - v[0];
    if (d < 2) return 0;
    for (var i = 1; i < v.length; i++) if (v[i] - v[i - 1] !== d) return 0;
    return v[v.length - 1] + d > max ? d : 0;
  }
  // Kelompokkan nilai berurutan sesuai urutan "order"; rentang >= 3 jadi "A sampai C".
  function listPhrase(v, order, name) {
    var idx = v.map(function (x) { return order.indexOf(x); }).sort(function (a, b) { return a - b; });
    var runs = [];
    idx.forEach(function (i) {
      var last = runs[runs.length - 1];
      if (last && i === last.e + 1) last.e = i; else runs.push({ s: i, e: i });
    });
    var items = [];
    runs.forEach(function (r) {
      if (r.e - r.s >= 2) items.push(name(order[r.s]) + ' sampai ' + name(order[r.e]));
      else for (var i = r.s; i <= r.e; i++) items.push(name(order[i]));
    });
    return joinID(items);
  }
  var num = function (x) { return String(x); };

  function describe(p) {
    if (p.reboot) {
      return { text: 'Dijalankan sekali setiap kali sistem boot (@reboot).', notes: ['@reboot tidak punya waktu jalan terjadwal: tidak ada daftar waktu berikutnya. Padanan systemd: timer dengan OnBootSec= (mode interval di tab systemd timer).'], reboot: true };
    }
    var s = p.spec, notes = [];
    var mv = vals(s.min), hv = vals(s.hour);
    var minAll = mv.length === 60, hourAll = hv.length === 24, minOne = mv.length === 1, hourOne = hv.length === 1;
    var minStep = stepOf(mv, 0, 59), hourStep = stepOf(hv, 0, 23);
    var hm = function (h, m) { return pad2(h) + ':' + pad2(m); };
    var contiguous = hv[hv.length - 1] - hv[0] === hv.length - 1;
    var T;
    var minPhrase = function () {
      if (minAll) return 'setiap menit';
      if (minStep) return 'setiap ' + minStep + ' menit';
      return 'pada menit ke-' + listPhrase(mv, range(0, 59), num);
    };
    if (minOne && hourOne) {
      T = 'Pukul ' + hm(hv[0], mv[0]);
    } else if (minOne) {
      if (hourAll) T = 'Setiap jam, pada menit ke-' + mv[0];
      else if (hourStep) T = 'Setiap ' + hourStep + ' jam, pada menit ke-' + mv[0];
      else if (contiguous && hv.length >= 3) T = 'Setiap jam pada menit ke-' + mv[0] + ', antara pukul ' + hm(hv[0], mv[0]) + ' dan ' + hm(hv[hv.length - 1], mv[0]);
      else T = 'Pukul ' + joinID(hv.map(function (h) { return hm(h, mv[0]); }));
    } else {
      var P = minPhrase(); P = P.charAt(0).toUpperCase() + P.slice(1);
      if (hourAll) T = P + (minAll || minStep ? '' : ' setiap jam');
      else if (contiguous) T = P + ', antara pukul ' + hm(hv[0], mv[0]) + ' dan ' + hm(hv[hv.length - 1], mv[mv.length - 1]);
      else T = P + ', pada pukul ' + joinID(hv.map(pad2));
    }
    if (minStep && 60 % minStep !== 0) notes.push('Langkah ' + minStep + ' menit tidak habis membagi 60, jadi hitungan diulang dari menit ke-0 setiap jam: menit ' + mv.join(', ') + ', lalu jeda ' + (60 - mv[mv.length - 1]) + ' menit ke jam berikutnya.');
    if (hourStep && 24 % hourStep !== 0) notes.push('Langkah ' + hourStep + ' jam tidak habis membagi 24, jadi hitungan diulang dari pukul 00 setiap hari: pukul ' + hv.map(pad2).join(', ') + '.');

    var domV = vals(s.dom, 1), dowV = vals(s.dow, 0);
    var domAll = domV.length === 31, dowAll = dowV.length === 7, monAll = vals(s.mon, 1).length === 12;
    var domTxt = function () { return 'tanggal ' + listPhrase(domV, range(1, 31), num); };
    var dowTxt = function () { return listPhrase(dowV, DOW_ORDER, function (d) { return DOW_ID[d]; }); };
    var D;
    if (s.dayMode === 'or') {
      if (domAll || dowAll) {
        D = 'setiap hari';
        notes.push('Tanggal dan hari-minggu sama-sama diisi (bukan *), dan salah satunya mencakup semua nilai, jadi job jalan setiap hari. Aturan cron standar: bila keduanya dibatasi, cukup salah satu yang cocok.');
      } else {
        D = 'pada ' + domTxt() + ' atau pada hari ' + dowTxt();
        notes.push('ATURAN OR: tanggal dan hari-minggu sama-sama dibatasi, jadi (aturan cron standar/Vixie) job jalan bila salah satunya cocok, bukan keduanya. Jika maksudnya "keduanya", cron tidak bisa; pakai satu kolom saja dan saring di skrip.');
      }
    } else if (domAll && dowAll) {
      D = 'setiap hari';
    } else if (domAll) {
      D = dowV.length === 1 ? 'setiap hari ' + dowTxt() : (dowTxt().indexOf(' sampai ') === -1 ? 'setiap ' : '') + dowTxt();
    } else if (dowAll) {
      D = 'pada ' + domTxt();
    } else {
      D = 'pada ' + domTxt() + ' dan hari ' + dowTxt();
      notes.push('Salah satu kolom tanggal/hari-minggu diawali *, jadi aturannya AND: keduanya harus cocok sekaligus (bukan salah satu).');
    }
    if (!domAll && domV.some(function (d) { return d >= 29; })) {
      notes.push('Bulan yang tidak punya tanggal tersebut dilewati (tidak digeser ke tanggal terakhir bulan itu).');
    }
    var M = monAll ? '' : 'pada bulan ' + listPhrase(vals(s.mon, 1), range(1, 12), function (m) { return MON_ID[m - 1]; });
    var text = T + ', ' + D + (M ? ', ' + M : '') + '.';
    return { text: text, notes: notes };
  }

  /* ------------------------------------------------------------ cron -> OnCalendar */

  function sdRender(v, lo, hi, noStep) {
    if (v.length === hi - lo + 1) return '*';
    var st = noStep ? 0 : stepOf(v, lo, hi); // tanggal/bulan ditulis daftar: systemd 255 melewatkan kecocokan pada "Fri *-*-01/9"
    if (st && v.length >= 2) return pad2(lo) + '/' + st; // systemd tidak menerima */n, harus awal/n
    var out = [], i = 0;
    while (i < v.length) {
      var j = i;
      while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
      if (j - i >= 2) out.push(pad2(v[i]) + '..' + pad2(v[j]));
      else for (var k = i; k <= j; k++) out.push(pad2(v[k]));
      i = j + 1;
    }
    return out.join(',');
  }
  function toOnCalendar(p) {
    if (p.reboot) return { ok: false, reason: '@reboot tidak punya padanan OnCalendar. Pakai mode interval dengan OnBootSec= (mis. 1min).' };
    var s = p.spec;
    var domV = vals(s.dom, 1), dowV = vals(s.dow, 0);
    var domAll = domV.length === 31, dowAll = dowV.length === 7;
    if (s.dayMode === 'or' && !domAll && !dowAll) {
      return { ok: false, reason: 'Tanggal dan hari-minggu sama-sama dibatasi, jadi cron memakai aturan OR (salah satu cocok). Di OnCalendar, hari dan tanggal selalu AND, jadi tidak ada konversi yang benar. Pisahkan menjadi dua timer: satu untuk tanggal, satu untuk hari-minggu.' };
    }
    if (s.dayMode === 'or') { domV = range(1, 31); dowV = range(0, 6); domAll = dowAll = true; }
    var dowTxt = '';
    if (!dowAll) {
      var pos = DOW_ORDER.filter(function (d) { return dowV.indexOf(d) !== -1; });
      var parts = [], i = 0;
      while (i < pos.length) {
        var j = i;
        while (j + 1 < pos.length && DOW_ORDER.indexOf(pos[j + 1]) === DOW_ORDER.indexOf(pos[j]) + 1) j++;
        if (j - i >= 2) parts.push(DOW_SD[pos[i]] + '..' + DOW_SD[pos[j]]);
        else for (var k = i; k <= j; k++) parts.push(DOW_SD[pos[k]]);
        i = j + 1;
      }
      dowTxt = parts.join(',') + ' ';
    }
    var v = dowTxt + '*-' + sdRender(vals(s.mon, 1), 1, 12, true) + '-' + sdRender(domV, 1, 31, true) + ' ' +
      sdRender(vals(s.hour), 0, 23) + ':' + sdRender(vals(s.min), 0, 59) + ':00';
    return { ok: true, value: v };
  }

  /* ------------------------------------------------------------ parser OnCalendar (bentuk yang didukung) */

  var SD_KW = {
    minutely: '*-*-* *:*:00', hourly: '*-*-* *:00:00', daily: '*-*-* 00:00:00', monthly: '*-*-01 00:00:00', weekly: 'Mon *-*-* 00:00:00',
    yearly: '*-01-01 00:00:00', annually: '*-01-01 00:00:00', quarterly: '*-01,04,07,10-01 00:00:00',
    semiannually: '*-01,07-01 00:00:00', 'semi-annually': '*-01,07-01 00:00:00'
  };
  var SDW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var SDWFULL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  function sdField(text, lo, hi, nameVal) {
    var set = blank(hi + 1), items = text.split(',');
    items.forEach(function (item) {
      if (item === '') throw new Error('bagian kosong pada "' + text + '"');
      var sp = item.split('/');
      if (sp.length > 2) throw new Error('"' + item + '" tidak valid');
      var step = 1;
      if (sp.length === 2) {
        if (!/^\d+$/.test(sp[1]) || +sp[1] < 1) throw new Error('langkah "' + sp[1] + '" tidak valid');
        step = +sp[1];
      }
      var a, b;
      if (sp[0] === '*') {
        if (sp.length === 2) throw new Error('systemd tidak menerima */' + sp[1] + '; tulis ' + (lo < 10 ? '0' : '') + lo + '/' + sp[1] + ' (awal/langkah)');
        a = lo; b = hi;
      }
      else {
        var rp = sp[0].split('..');
        if (rp.length > 2) throw new Error('rentang "' + sp[0] + '" tidak valid');
        var val = function (t) {
          var n = nameVal ? nameVal(t) : (/^\d+$/.test(t) ? +t : NaN);
          if (isNaN(n) || n < lo || n > hi) throw new Error('nilai "' + t + '" tidak valid atau di luar batas ' + lo + '..' + hi);
          return n;
        };
        a = val(rp[0]);
        b = rp.length === 2 ? val(rp[1]) : (sp.length === 2 ? hi : a);
      }
      if (a > b) throw new Error('rentang terbalik pada "' + item + '"');
      for (var x = a; x <= b; x += step) set[x] = true;
    });
    return set;
  }

  // Hasil: {ok:true, spec, normalized} | {ok:false, unsupported:bool, error}
  function parseCalendar(input) {
    var s = String(input).trim();
    if (!s) return { ok: false, error: 'OnCalendar masih kosong.' };
    if (SD_KW[s.toLowerCase()]) s = SD_KW[s.toLowerCase()];
    var toks = s.split(/\s+/), dateTok = null, timeTok = null, dowTok = null;
    try {
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (/^utc$/i.test(t) || /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(t)) return { ok: false, unsupported: true, error: 'Akhiran zona waktu (' + t + ') tidak didukung penghitung ini; hitung dengan systemd-analyze calendar.' };
        if (t.indexOf('~') !== -1) return { ok: false, unsupported: true, error: 'Penanda "~" (hari terakhir bulan) tidak didukung penghitung ini; hitung dengan systemd-analyze calendar.' };
        if (t.indexOf(':') !== -1) { if (timeTok) throw new Error('ada dua bagian jam'); timeTok = t; }
        else if (/^[A-Za-z]/.test(t)) { if (dowTok) throw new Error('ada dua bagian hari'); dowTok = t; }
        else { if (dateTok) throw new Error('ada dua bagian tanggal'); dateTok = t; }
      }
      var dow = blank(7), dowAll = true;
      if (dowTok) {
        dowAll = false;
        var nv = function (t) {
          var l = t.toLowerCase();
          for (var i = 0; i < 7; i++) if (l.length >= 3 && SDWFULL[i].indexOf(l) === 0) return i + 1;
          return NaN;
        };
        var d8 = sdField(dowTok, 1, 7, nv);
        for (var d = 1; d <= 7; d++) if (d8[d]) dow[d % 7] = true;
      } else dow = blank(7).map(function () { return true; });
      var mon = blank(13).map(function (_, i) { return i > 0; }), dom = blank(32).map(function (_, i) { return i > 0; }), years = null;
      if (dateTok) {
        var dp = dateTok.split('-');
        if (dp.length !== 2 && dp.length !== 3) throw new Error('tanggal harus berbentuk Tahun-Bulan-Hari, mis. *-*-01');
        if (dp.length === 3 && dp[0] !== '*') {
          var yset = sdField(dp[0], 1970, 2199);
          years = function (y) { return !!yset[y]; };
        }
        mon = sdField(dp[dp.length - 2], 1, 12);
        dom = sdField(dp[dp.length - 1], 1, 31);
      }
      var hour = blank(24), min = blank(60);
      if (timeTok) {
        if (/\.\d/.test(timeTok.split(':')[2] || '')) return { ok: false, unsupported: true, error: 'Detik pecahan tidak didukung penghitung ini.' };
        var tp = timeTok.split(':');
        if (tp.length !== 2 && tp.length !== 3) throw new Error('jam harus berbentuk Jam:Menit[:Detik]');
        hour = sdField(tp[0], 0, 23); min = sdField(tp[1], 0, 59);
        if (tp.length === 3) {
          var sec = sdField(tp[2], 0, 59), sv = vals(sec);
          if (!(sv.length === 1 && sv[0] === 0)) return { ok: false, unsupported: true, error: 'Detik selain :00 tidak didukung penghitung ini (hanya resolusi menit); hitung dengan systemd-analyze calendar.' };
        }
      } else { hour[0] = true; min[0] = true; }
      return { ok: true, spec: { min: min, hour: hour, dom: dom, mon: mon, dow: dow, dayMode: 'and', years: years }, dowAll: dowAll };
    } catch (e) {
      return { ok: false, error: 'Format OnCalendar tidak valid: ' + e.message + '.' };
    }
  }

  /* ------------------------------------------------------------ pembuat crontab */

  var SHELL_ALL = /^[A-Za-z0-9_\/.,:@%+=-]+$/;
  function shq(s) { return SHELL_ALL.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'"; }
  function safeName(s) { return String(s || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, ''); }

  function buildCrontab(o) {
    var errors = [], warnings = [];
    var cmd = String(o.command || '').trim();
    if (!cmd) errors.push('Perintah masih kosong.');
    if (/[\r\n]/.test(cmd)) errors.push('Perintah harus satu baris; baris crontab tidak bisa multi-baris. Pindahkan ke skrip dan panggil skripnya.');
    if (o.user && !/^[A-Za-z_][A-Za-z0-9_-]*\$?$/.test(o.user)) errors.push('Nama pengguna "' + o.user + '" tidak valid (huruf, angka, _ dan -).');
    if (o.mailto && /\s/.test(o.mailto)) errors.push('MAILTO tidak boleh berisi spasi. Pisahkan beberapa alamat dengan koma tanpa spasi.');
    if (o.output === 'log' && !String(o.logPath || '').trim()) errors.push('Isi jalur berkas log, mis. /var/log/job.log.');
    if (errors.length) return { errors: errors, warnings: warnings };

    var body = cmd;
    if (o.flock) {
      var lock = '/tmp/' + (safeName(o.lockName) || 'job') + '.lock';
      var needsSh = /[|&;<>`$()]/.test(cmd);
      body = 'flock -n ' + lock + ' ' + (needsSh ? 'sh -c ' + shq(cmd) : cmd);
      warnings.push('flock -n: bila job sebelumnya masih berjalan, eksekusi baru dilewati diam-diam (keluar dengan kode 1). Perintah dengan | && ; atau > dibungkus sh -c agar seluruhnya terkunci, bukan hanya perintah pertama.');
    } else if (o.output !== 'default' && /&&|\|\||[;|]/.test(cmd)) {
      body = '( ' + cmd + ' )';
      warnings.push('Perintah majemuk dibungkus ( ... ) agar pengalihan keluaran berlaku untuk semuanya.');
    }
    var redirect = '';
    if (o.output === 'log') {
      redirect = ' >> ' + shq(String(o.logPath).trim()) + ' 2>&1';
      warnings.push('Berkas log akan terus membesar. Atur rotasi dengan logrotate.');
      if (String(o.logPath).trim().charAt(0) !== '/') warnings.push('Jalur log bukan absolut; cron menjalankan dari direktori home, bukan dari tempat Anda mengetik.');
    } else if (o.output === 'null') {
      redirect = ' >/dev/null 2>&1';
      warnings.push('Semua keluaran dan error dibuang. Job yang gagal tidak meninggalkan jejak; pertimbangkan log, bukan /dev/null.');
    }
    var line = o.schedule + ' ' + (o.user ? o.user + ' ' : '') + body + redirect;
    var pc = (line.match(/(?<!\\)%/g) || []).length;
    if (pc) {
      line = line.replace(/(?<!\\)%/g, '\\%');
      warnings.push(pc + ' karakter % otomatis diganti \\%. Di crontab, % tanpa escape berarti baris baru dan memotong perintah.');
    }
    var first = cmd.split(/\s+/)[0];
    if (!/^\//.test(first) && !/^(cd|export|env|exec|\()/.test(first) && !/=/.test(first)) {
      warnings.push('Perintah pertama "' + first + '" bukan jalur absolut. Cron hanya punya PATH minim (biasanya /usr/bin:/bin); pakai jalur lengkap, mis. hasil which ' + first + '.');
    }
    var text = (o.mailto ? 'MAILTO=' + o.mailto + '\n' : '') + line;
    if (o.mailto && o.output === 'null') warnings.push('MAILTO tidak berguna bila keluaran dibuang ke /dev/null (tidak ada yang dikirim).');
    warnings.push(o.user
      ? 'Format /etc/cron.d: simpan sebagai /etc/cron.d/<nama> (nama tanpa titik), pemilik root, izin 644, dan akhiri berkas dengan baris kosong.'
      : 'Format crontab pengguna (crontab -e): tanpa kolom pengguna. Untuk /etc/cron.d isi kolom pengguna.');
    warnings.push('Zona waktu mengikuti server. CRON_TZ hanya ada di sebagian implementasi (mis. cronie), jangan mengandalkannya tanpa dicek.');
    return { errors: errors, warnings: warnings, text: text };
  }

  /* ------------------------------------------------------------ pembuat unit systemd */

  var TS_UNIT = '(?:us|usec|ms|msec|s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks|M|month|months|y|year|years)';
  var TS_RE = new RegExp('^\\s*(?:\\d+(?:\\.\\d+)?\\s*' + TS_UNIT + '?\\s*)+$');
  function isTimespan(s) { return TS_RE.test(s); }

  function buildUnits(o) {
    var errors = [], warnings = [];
    var name = String(o.name || '').trim().replace(/\.(service|timer)$/, '');
    if (!name) errors.push('Nama unit masih kosong. Pakai huruf kecil dan tanda minus, mis. backup-db.');
    else if (!/^[A-Za-z0-9:_.\\@-]+$/.test(name)) errors.push('Nama unit "' + name + '" berisi karakter yang tidak boleh. Pakai huruf, angka, minus, garis bawah atau titik.');
    var exec = String(o.exec || '').trim();
    if (!exec) errors.push('ExecStart masih kosong. Isi perintah dengan jalur absolut, mis. /usr/local/bin/backup.sh.');
    else if (/[\r\n]/.test(exec)) errors.push('ExecStart harus satu baris.');
    else if (!/^[-@:+!]*\//.test(exec)) errors.push('Perintah ExecStart harus diawali jalur absolut (/...). systemd tidak memakai PATH untuk ExecStart.');
    if (o.user && !/^[A-Za-z_][A-Za-z0-9_-]*\$?$/.test(o.user)) errors.push('Nama pengguna "' + o.user + '" tidak valid.');
    if (o.workdir && !/^[\/~]/.test(o.workdir)) errors.push('WorkingDirectory harus jalur absolut (diawali /) atau ~.');
    var cal = null;
    if (o.mode === 'interval') {
      if (!o.bootSec && !o.activeSec) errors.push('Mode interval butuh OnBootSec atau OnUnitActiveSec, mis. 5min dan 1h.');
      [['OnBootSec', o.bootSec], ['OnUnitActiveSec', o.activeSec]].forEach(function (x) {
        if (x[1] && !isTimespan(x[1])) errors.push(x[0] + ' "' + x[1] + '" bukan durasi systemd yang valid. Contoh: 30s, 5min, 1h, 1d 2h.');
      });
      if (!errors.length && o.activeSec && !o.bootSec) warnings.push('Hanya OnUnitActiveSec tanpa OnBootSec: timer tidak punya pemicu pertama, karena service belum pernah aktif. Tambahkan OnBootSec agar timer mulai berjalan.');
    } else {
      if (!String(o.onCalendar || '').trim()) errors.push('OnCalendar masih kosong. Contoh: *-*-* 02:30:00.');
      else {
        cal = parseCalendar(o.onCalendar);
        if (!cal.ok && !cal.unsupported) errors.push(cal.error + ' Periksa dengan: systemd-analyze calendar "..."');
        else if (!cal.ok) warnings.push('OnCalendar ini tidak bisa diverifikasi oleh app: ' + cal.error);
      }
    }
    ['randomDelay', 'accuracy'].forEach(function (k) {
      if (o[k] && !isTimespan(o[k])) errors.push((k === 'randomDelay' ? 'RandomizedDelaySec' : 'AccuracySec') + ' "' + o[k] + '" bukan durasi systemd yang valid. Contoh: 5min.');
    });
    if (errors.length) return { errors: errors, warnings: warnings };

    var desc = String(o.desc || '').replace(/[\r\n]+/g, ' ').trim();
    var execOut = exec.replace(/%/g, '%%');
    if (exec.indexOf('%') !== -1) warnings.push('Karakter % ditulis %% di ExecStart karena systemd memakainya sebagai specifier.');
    if (/[|&;<>`]|\$\(/.test(exec)) warnings.push('ExecStart tidak dijalankan lewat shell: | && ; > dan $( ) tidak bekerja. Bungkus dengan /bin/sh -c \'...\' atau pindahkan ke skrip.');
    if (/\$/.test(exec)) warnings.push('systemd memproses $VAR sendiri; tulis $$ untuk tanda dolar literal.');
    var type = o.type === 'simple' ? 'simple' : 'oneshot';
    if (type === 'simple') warnings.push('Type=simple cocok untuk proses panjang. Untuk tugas berkala yang selesai sendiri, oneshot lebih tepat (timer tahu kapan selesai).');
    if (o.restart && o.restart !== 'no') {
      if (type === 'oneshot') warnings.push('Restart=' + o.restart + ' dengan Type=oneshot baru didukung systemd 244 ke atas; cek systemctl --version di server.');
    }
    var svc = ['[Unit]', 'Description=' + (desc || name), '', '[Service]', 'Type=' + type, 'ExecStart=' + execOut];
    if (o.user) svc.push('User=' + o.user);
    if (o.workdir) svc.push('WorkingDirectory=' + o.workdir);
    if (o.restart && o.restart !== 'no') svc.push('Restart=' + o.restart);
    var tim = ['[Unit]', 'Description=Jadwal untuk ' + (desc || name), '', '[Timer]'];
    if (o.mode === 'interval') {
      if (o.bootSec) tim.push('OnBootSec=' + o.bootSec.trim());
      if (o.activeSec) tim.push('OnUnitActiveSec=' + o.activeSec.trim());
    } else {
      tim.push('OnCalendar=' + o.onCalendar.trim());
      if (o.persistent) tim.push('Persistent=true');
    }
    if (o.randomDelay) tim.push('RandomizedDelaySec=' + o.randomDelay.trim());
    if (o.accuracy) tim.push('AccuracySec=' + o.accuracy.trim());
    else warnings.push('Tanpa AccuracySec, systemd boleh menggeser waktu jalan hingga 1 menit demi menghemat bangun CPU. Isi AccuracySec=1s bila perlu tepat waktu.');
    tim.push('', '[Install]', 'WantedBy=timers.target');
    var cmds = ['sudo cp ' + name + '.service ' + name + '.timer /etc/systemd/system/', 'sudo systemctl daemon-reload', 'sudo systemctl enable --now ' + name + '.timer'];
    if (o.mode !== 'interval') cmds.push('systemd-analyze calendar "' + o.onCalendar.trim() + '"');
    cmds.push('systemctl list-timers', 'journalctl -u ' + name + '.service');
    return { errors: errors, warnings: warnings, name: name, service: svc.join('\n') + '\n', timer: tim.join('\n') + '\n', commands: cmds.join('\n') + '\n' };
  }

  /* ------------------------------------------------------------ pembangun visual */

  function relative(ms, now) {
    var m = Math.round((ms - now) / 60000);
    if (m < 1) return 'sekarang';
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60, parts = [];
    if (d) parts.push(d + ' hari');
    if (h) parts.push(h + ' jam');
    if (mi && parts.length < 2 && !(d && h)) parts.push(mi + ' menit');
    return 'dalam ' + parts.join(' ');
  }

  var api = {
    parseCron: parseCron, describe: describe, nextRuns: nextRuns, neverDate: neverDate,
    toOnCalendar: toOnCalendar, parseCalendar: parseCalendar, buildCrontab: buildCrontab, buildUnits: buildUnits,
    isTimespan: isTimespan, relative: relative, wallOf: wallOf, pad2: pad2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CronCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
