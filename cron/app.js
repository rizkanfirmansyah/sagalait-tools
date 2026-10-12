/* UI Cron dan systemd timer. Semua teks ditampilkan lewat textContent/createElement. */
(function () {
  'use strict';
  var C = window.CronCore;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'sagalait-cron';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

  /* ---------- penyimpanan (hanya zona waktu, non-sensitif) ---------- */
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function saveStore(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) { /* mode privat: abaikan */ } }

  /* ---------- zona waktu ---------- */
  var zoneOk = function (z) { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };
  var browserTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
  var tzSel = $('tz');
  [['Asia/Jakarta', 'Asia/Jakarta (WIB)'], ['UTC', 'UTC']].forEach(function (z) {
    var o = el('option', '', z[1]); o.value = z[0]; tzSel.appendChild(o);
  });
  if (browserTz && browserTz !== 'UTC' && browserTz !== 'Asia/Jakarta' && zoneOk(browserTz)) {
    var bo = el('option', '', 'Zona browser (' + browserTz + ')'); bo.value = browserTz; tzSel.appendChild(bo);
  }
  var saved = loadStore().tz;
  if (saved && Array.prototype.some.call(tzSel.options, function (o) { return o.value === saved; })) tzSel.value = saved;
  var tz = function () { return tzSel.value; };

  function fmtWhen(ms, zone) {
    var f = new Intl.DateTimeFormat('id-ID', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o.weekday + ', ' + o.day + ' ' + o.month + ' ' + o.year + ' ' + o.hour + ':' + o.minute;
  }

  function renderRunList(box, runs, noteEl) {
    clear(box);
    var ul = el('ol', 'runs'), now = Date.now();
    runs.forEach(function (ms) {
      var li = el('li');
      li.appendChild(el('span', 'when', fmtWhen(ms, tz())));
      li.appendChild(el('span', 'rel', C.relative(ms, now)));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (noteEl) noteEl.textContent = 'zona ' + tz();
  }

  /* ---------- salin dan unduh ---------- */
  function copyText(btn, text) {
    var label = btn.dataset.label || btn.textContent;
    btn.dataset.label = label;
    var done = function () { btn.textContent = 'Tersalin'; setTimeout(function () { btn.textContent = label; }, 1500); };
    var fallback = function () {
      var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal, salin manual'; setTimeout(function () { btn.textContent = label; }, 2000); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function codeBlock(parent, text, copyLabel, dlName, dlLabel) {
    var pre = el('pre', 'src out', text); pre.tabIndex = 0;
    parent.appendChild(pre);
    var act = el('div', 'actions');
    var b = el('button', 'btn btn-sm', copyLabel || 'Salin'); b.type = 'button';
    b.addEventListener('click', function () { copyText(b, text); });
    act.appendChild(b);
    if (dlName) {
      var d = el('button', 'btn btn-sm btn-primary', dlLabel || 'Unduh'); d.type = 'button';
      d.addEventListener('click', function () { download(dlName, text); });
      act.appendChild(d);
    }
    parent.appendChild(act);
    return act;
  }
  function noteList(items) {
    var ul = el('ul', 'notes');
    items.forEach(function (n) {
      var li = el('li', n.cls || '', n.text);
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------- tab ---------- */
  var tabs = { cron: [$('tabCron'), $('paneCron')], sd: [$('tabSd'), $('paneSd')] };
  function showTab(name, focus) {
    Object.keys(tabs).forEach(function (k) {
      var on = k === name;
      tabs[k][0].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[k][0].tabIndex = on ? 0 : -1;
      tabs[k][0].classList.toggle('btn-primary', on);
      tabs[k][1].hidden = !on;
    });
    if (focus) tabs[name][0].focus();
    if (name === 'sd') renderSd();
  }
  Object.keys(tabs).forEach(function (k) {
    tabs[k][0].addEventListener('click', function () { showTab(k); });
  });
  document.querySelector('.tabs').addEventListener('keydown', function (e) {
    var order = ['cron', 'sd'], cur = tabs.cron[0].getAttribute('aria-selected') === 'true' ? 0 : 1, nxt = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') nxt = (cur + 1) % 2;
    else if (e.key === 'Home') nxt = 0; else if (e.key === 'End') nxt = 1;
    if (nxt === null) return;
    e.preventDefault(); showTab(order[nxt], true);
  });

  /* =====================================================================
     Tab 1: Cron
     ===================================================================== */
  var exprIn = $('expr'), curParsed = null;
  var normExpr = function () { return exprIn.value.trim().replace(/\s+/g, ' '); };

  function renderCron() {
    var text = exprIn.value;
    if (!text.trim()) {
      curParsed = null; $('cronOut').hidden = true; $('cronEmpty').hidden = false;
      return;
    }
    $('cronEmpty').hidden = true; $('cronOut').hidden = false;
    var p = C.parseCron(text); curParsed = p.ok ? p : null;
    var b = $('cronBanner'); clear(b);
    b.className = 'banner ' + (p.ok ? 'ok' : 'bad');
    b.appendChild(el('span', 'dot', p.ok ? '✓' : '!'));
    b.appendChild(el('span', '', p.ok ? 'Ekspresi valid' : p.error));
    if (p.ok && p.alias && !p.reboot) b.appendChild(el('span', 'aside', p.alias + ' sama dengan ' + p.cols.join(' ')));
    ['expPanel', 'runPanel', 'ocPanel'].forEach(function (id) { $(id).hidden = !p.ok; });
    if (!p.ok) return;

    var d = C.describe(p);
    $('expText').textContent = d.text;
    var nl = $('expNotes'); clear(nl);
    d.notes.forEach(function (n) { nl.appendChild(el('li', /^ATURAN OR/.test(n) ? 'key' : '', n)); });
    nl.hidden = !d.notes.length;
    renderRuns();
    renderOc(p);
  }

  function renderRuns() {
    var box = $('runs');
    if (!curParsed) return;
    if (curParsed.reboot) { $('runPanel').hidden = true; return; }
    $('runPanel').hidden = false;
    var runs = C.nextRuns(curParsed.spec, Date.now(), tz(), 10);
    if (!runs.length) {
      clear(box);
      $('runTz').textContent = '';
      box.appendChild(noteList([{ cls: 'warn', text: C.neverDate(curParsed.spec)
        ? 'Job ini tidak akan pernah jalan: tanggal yang dipilih tidak ada di bulan yang dipilih (mis. 31 Februari). Cron tidak memindahkannya ke tanggal lain.'
        : 'Tidak ada waktu jalan dalam 100 tahun ke depan.' }]));
      return;
    }
    renderRunList(box, runs, $('runTz'));
    if (runs.length < 10) box.appendChild(el('p', 'small muted mt', 'Hanya ' + runs.length + ' waktu jalan dalam 100 tahun ke depan (tanggal ini jarang ada, mis. 29 Februari).'));
  }

  function renderOc(p) {
    var box = clear($('ocBody'));
    var o = C.toOnCalendar(p);
    if (!o.ok) { box.appendChild(noteList([{ cls: 'warn', text: o.reason }])); return; }
    var pre = el('pre', 'src out', 'OnCalendar=' + o.value); pre.tabIndex = 0; box.appendChild(pre);
    var act = el('div', 'actions');
    var cb = el('button', 'btn btn-sm', 'Salin nilai'); cb.type = 'button';
    cb.addEventListener('click', function () { copyText(cb, o.value); });
    var use = el('button', 'btn btn-sm btn-primary', 'Pakai di systemd timer'); use.type = 'button';
    use.addEventListener('click', function () {
      document.querySelector('input[name="smode"][value="calendar"]').checked = true;
      $('sCal').value = o.value; $('fromCronMsg').textContent = 'Diisi dari ' + normExpr() + '.';
      applyMode(); showTab('sd'); $('sCal').focus();
    });
    act.appendChild(cb); act.appendChild(use); box.appendChild(act);
    box.appendChild(el('p', 'small muted mt', 'Bentuk kalender systemd memakai zona waktu server. Nilai ini diperiksa lawan systemd-analyze calendar di mesin pengembangan, bukan di server Anda.'));
  }

  /* ---------- pembangun visual ---------- */
  var bmode = $('bmode');
  function showBuilderFields() {
    document.querySelectorAll('[data-b]').forEach(function (n) {
      n.hidden = n.dataset.b.split(' ').indexOf(bmode.value) === -1;
    });
  }
  function intIn(id, lo, hi) {
    var v = $(id).value.trim();
    if (!/^\d+$/.test(v)) return null;
    v = parseInt(v, 10);
    return v < lo || v > hi ? null : v;
  }
  function timeParts() {
    var m = /^(\d{1,2}):(\d{2})/.exec($('bTime').value);
    return m ? { h: +m[1], m: +m[2] } : null;
  }
  function buildFromMenu() {
    var mode = bmode.value, t = timeParts(), e = null;
    if (mode === 'every') { var n = intIn('bN', 1, 59); if (n !== null) e = '*/' + n + ' * * * *'; }
    else if (mode === 'hourly') { var mi = intIn('bMin', 0, 59); if (mi !== null) e = mi + ' * * * *'; }
    else if (mode === 'daily' && t) e = t.m + ' ' + t.h + ' * * *';
    else if (mode === 'weekly' && t) e = t.m + ' ' + t.h + ' * * ' + $('bDow').value;
    else if (mode === 'monthly' && t) { var dm = intIn('bDom', 1, 31); if (dm !== null) e = t.m + ' ' + t.h + ' ' + dm + ' * *'; }
    if (e !== null) { exprIn.value = e; renderCron(); renderCrontab(); }
  }
  function syncMenu() {
    var s = normExpr(), m;
    var set = function (mode) { bmode.value = mode; showBuilderFields(); };
    var tm = function (h, mi) { $('bTime').value = C.pad2(+h) + ':' + C.pad2(+mi); };
    if ((m = /^\*\/(\d{1,2}) \* \* \* \*$/.exec(s)) && +m[1] >= 1 && +m[1] <= 59) { $('bN').value = m[1]; return set('every'); }
    if ((m = /^(\d{1,2}) \* \* \* \*$/.exec(s)) && +m[1] <= 59) { $('bMin').value = m[1]; return set('hourly'); }
    if ((m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(s)) && +m[1] <= 59 && +m[2] <= 23) { tm(m[2], m[1]); return set('daily'); }
    if ((m = /^(\d{1,2}) (\d{1,2}) \* \* ([0-7])$/.exec(s)) && +m[1] <= 59 && +m[2] <= 23) { tm(m[2], m[1]); $('bDow').value = String(+m[3] % 7); return set('weekly'); }
    if ((m = /^(\d{1,2}) (\d{1,2}) (\d{1,2}) \* \*$/.exec(s)) && +m[1] <= 59 && +m[2] <= 23 && +m[3] >= 1 && +m[3] <= 31) { tm(m[2], m[1]); $('bDom').value = m[3]; return set('monthly'); }
    set('custom');
  }
  bmode.addEventListener('change', function () { showBuilderFields(); buildFromMenu(); });
  // Hanya 'input': 'change' ikut terpicu saat blur dan merender ulang blok hasil di tengah klik tombol Salin.
  ['bN', 'bMin', 'bTime', 'bDow', 'bDom'].forEach(function (id) { $(id).addEventListener('input', buildFromMenu); });
  exprIn.addEventListener('input', function () { syncMenu(); renderCron(); renderCrontab(); });

  /* ---------- pembuat baris crontab ---------- */
  var cIds = ['cCmd', 'cUser', 'cMail', 'cOut', 'cLog', 'cFlock', 'cLock'];
  function renderCrontab() {
    $('cLogWrap').hidden = $('cOut').value !== 'log';
    $('cLockWrap').hidden = !$('cFlock').checked;
    var box = clear($('cOutWrap'));
    box.className = 'cwarn';
    if (!curParsed) { box.appendChild(el('p', 'small muted', 'Isi ekspresi cron yang valid dulu; baris crontab dibuat dari ekspresi itu.')); return; }
    if (!$('cCmd').value.trim()) { box.appendChild(el('p', 'small muted', 'Isi perintah untuk menghasilkan baris crontab.')); return; }
    var r = C.buildCrontab({
      schedule: normExpr(), command: $('cCmd').value, user: $('cUser').value.trim(), mailto: $('cMail').value.trim(),
      output: $('cOut').value, logPath: $('cLog').value, flock: $('cFlock').checked, lockName: $('cLock').value
    });
    if (r.errors.length) { box.appendChild(noteList(r.errors.map(function (t) { return { cls: 'warn', text: t }; }))); return; }
    codeBlock(box, r.text + '\n', 'Salin', 'crontab.txt', 'Unduh .txt');
    box.appendChild(noteList(r.warnings.map(function (t) { return { text: t }; })));
  }
  cIds.forEach(function (id) { $(id).addEventListener('input', renderCrontab); });

  /* ---------- contoh ---------- */
  var EX = {
    mysql: { e: '30 2 * * *', cmd: '/usr/bin/mysqldump --defaults-extra-file=/root/.my.cnf --single-transaction appdb | gzip > /var/backups/appdb-$(date +\\%F).sql.gz', out: 'log', log: '/var/log/backup-mysql.log', flock: true, lock: 'backup-mysql' },
    log: { e: '0 4 * * 0', cmd: "/usr/bin/find /var/log/myapp -name '*.log' -mtime +14 -delete", out: 'log', log: '/var/log/bersihkan-log.log', flock: false, lock: '' },
    artisan: { e: '* * * * *', cmd: 'cd /var/www/app && /usr/bin/php artisan schedule:run', out: 'null', log: '', flock: true, lock: 'artisan-schedule' },
    cert: { e: '17 3 * * *', cmd: '/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"', out: 'default', log: '', flock: true, lock: 'certbot' }
  };
  function loadExample(x) {
    exprIn.value = x.e; $('cCmd').value = x.cmd; $('cOut').value = x.out; $('cLog').value = x.log;
    $('cFlock').checked = x.flock; $('cLock').value = x.lock; $('cUser').value = ''; $('cMail').value = '';
    syncMenu(); renderCron(); renderCrontab();
  }
  $('examples').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ex]');
    if (b) loadExample(EX[b.dataset.ex]);
  });
  $('btnCronSample').addEventListener('click', function () { exprIn.value = '*/15 9-17 * * 1-5'; syncMenu(); renderCron(); renderCrontab(); });

  /* =====================================================================
     Tab 2: systemd timer
     ===================================================================== */
  var sdIds = ['sName', 'sDesc', 'sExec', 'sUser', 'sDir', 'sType', 'sRestart', 'sCal', 'sBoot', 'sActive', 'sPersist', 'sRand', 'sAcc'];
  var lastUnits = null;
  var modeVal = function () { return document.querySelector('input[name="smode"]:checked').value; };
  function applyMode() {
    var cal = modeVal() === 'calendar';
    $('sCalWrap').hidden = !cal; $('sIntWrap').hidden = cal; $('sPersistWrap').hidden = !cal;
  }

  function renderSd() {
    var empty = !$('sName').value.trim() && !$('sExec').value.trim();
    $('sdEmpty').hidden = !empty; $('sdOut').hidden = empty;
    if (empty) return;
    var r = C.buildUnits({
      name: $('sName').value, desc: $('sDesc').value, exec: $('sExec').value, user: $('sUser').value.trim(), workdir: $('sDir').value.trim(),
      type: $('sType').value, restart: $('sRestart').value, mode: modeVal(), onCalendar: $('sCal').value,
      bootSec: $('sBoot').value.trim(), activeSec: $('sActive').value.trim(), persistent: $('sPersist').checked,
      randomDelay: $('sRand').value.trim(), accuracy: $('sAcc').value.trim()
    });
    var box = clear($('sdIssues'));
    r.errors.forEach(function (t) {
      var a = el('article', 'issue'), h = el('div', 'issue-head');
      h.appendChild(el('span', 'tag', 'Perbaiki')); a.appendChild(h); a.appendChild(el('p', '', t)); box.appendChild(a);
    });
    r.warnings.forEach(function (t) {
      var a = el('article', 'issue warning'), h = el('div', 'issue-head');
      h.appendChild(el('span', 'tag', 'Perhatian')); a.appendChild(h); a.appendChild(el('p', '', t)); box.appendChild(a);
    });
    $('sdFiles').hidden = r.errors.length > 0;
    if (r.errors.length) { lastUnits = null; return; }
    lastUnits = r;
    $('svcTitle').textContent = r.name + '.service'; $('timTitle').textContent = r.name + '.timer';
    $('svcPre').textContent = r.service; $('timPre').textContent = r.timer; $('cmdPre').textContent = r.commands;
    document.querySelector('[data-dl="svc"]').textContent = 'Unduh .service';
    document.querySelector('[data-dl="tim"]').textContent = 'Unduh .timer';
    renderSdRuns();
  }
  function renderSdRuns() {
    if (!lastUnits) return;
    var box = clear($('sdRuns'));
    var cal = modeVal() === 'calendar';
    $('sdRunPanel').hidden = false;
    if (!cal) {
      $('sdRunTz').textContent = '';
      box.appendChild(noteList([{ text: 'Mode interval: timer pertama jalan OnBootSec setelah boot, lalu diulang OnUnitActiveSec setelah service terakhir aktif. Tidak ada daftar waktu kalender.' }]));
      return;
    }
    var p = C.parseCalendar($('sCal').value);
    if (!p.ok) { $('sdRunTz').textContent = ''; box.appendChild(noteList([{ cls: 'warn', text: 'Waktu jalan tidak dihitung: ' + p.error }])); return; }
    var runs = C.nextRuns(p.spec, Date.now(), tz(), 5);
    if (!runs.length) { $('sdRunTz').textContent = ''; box.appendChild(noteList([{ cls: 'warn', text: 'Tidak ada waktu jalan dalam 100 tahun ke depan (tanggal yang tidak pernah ada?).' }])); return; }
    renderRunList(box, runs, $('sdRunTz'));
    box.appendChild(el('p', 'small muted mt', 'Dihitung pada zona waktu ' + tz() + '. OnCalendar mengikuti zona waktu server (timedatectl); samakan pilihan zona di kanan atas. Tanpa Persistent dan RandomizedDelaySec; jitter dan AccuracySec tidak diperhitungkan.'));
  }
  sdIds.forEach(function (id) { $(id).addEventListener('input', renderSd); });
  document.querySelectorAll('input[name="smode"]').forEach(function (r) { r.addEventListener('change', function () { applyMode(); renderSd(); }); });

  $('btnFromCron').addEventListener('click', function () {
    var msg = $('fromCronMsg'), p = C.parseCron(exprIn.value);
    if (!exprIn.value.trim()) { msg.textContent = 'Tab Cron belum berisi ekspresi.'; return; }
    if (!p.ok) { msg.textContent = 'Ekspresi di tab Cron belum valid: ' + p.error; return; }
    var o = C.toOnCalendar(p);
    if (!o.ok) { msg.textContent = o.reason; return; }
    $('sCal').value = o.value; msg.textContent = 'Diisi dari ' + normExpr() + '.'; renderSd();
  });
  $('btnSdSample').addEventListener('click', function () {
    $('sName').value = 'backup-db'; $('sDesc').value = 'Backup database harian'; $('sExec').value = '/usr/local/bin/backup-db.sh';
    $('sUser').value = 'root'; $('sDir').value = ''; $('sType').value = 'oneshot'; $('sRestart').value = 'no';
    document.querySelector('input[name="smode"][value="calendar"]').checked = true; $('sCal').value = '*-*-* 02:30:00';
    $('sPersist').checked = true; $('sRand').value = '5min'; $('sAcc').value = '';
    applyMode(); renderSd();
  });
  document.querySelector('#paneSd').addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]'), d = e.target.closest('[data-dl]');
    if (c) copyText(c, $(c.dataset.copy).textContent);
    if (d && lastUnits) {
      var svc = d.dataset.dl === 'svc';
      download(lastUnits.name + (svc ? '.service' : '.timer'), svc ? lastUnits.service : lastUnits.timer);
    }
  });

  /* ---------- zona waktu dan penyegaran ---------- */
  tzSel.addEventListener('change', function () { saveStore({ tz: tz() }); renderRuns(); renderSdRuns(); });
  setInterval(function () { if (!document.hidden) { renderRuns(); renderSdRuns(); } }, 30000);

  showBuilderFields(); applyMode(); renderCron(); renderCrontab();
})();
