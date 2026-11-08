/* Antarmuka Pemasang PHP. Semua teks ditampilkan lewat textContent; tidak ada data sensitif yang disimpan. */
(function () {
  'use strict';
  var KEY = 'sagalait-php-installer';
  var $ = function (id) { return document.getElementById(id); };
  var st = load();

  function load() {
    var d = PHPI.defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') {
        Object.keys(d).forEach(function (k) {
          if (s[k] === undefined) return;
          if (k === 'pkgs') { if (Array.isArray(s[k])) d.pkgs = s[k].filter(function (x) { return PHPI.PKGS.some(function (p) { return p.id === x; }); }); }
          else if (typeof s[k] === typeof d[k]) d[k] = s[k];
        });
      }
    } catch (e) { /* abaikan */ }
    if (!PHPI.OS.some(function (o) { return o[0] === d.os; })) d.os = 'ubuntu-24.04';
    if (!PHPI.SOURCES.some(function (o) { return o[0] === d.source; })) d.source = 'ondrej';
    if (!PHPI.SERIES.some(function (o) { return o.v === d.ver; })) d.ver = '8.3';
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function init() {
    PHPI.OS.forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; $('os').appendChild(x); });
    PHPI.SOURCES.forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; $('source').appendChild(x); });
    PHPI.SERIES.forEach(function (o) { var s = PHPI.status(o.v), x = el('option', '', 'PHP ' + o.v + ' · ' + ({ active: 'aktif', security: 'keamanan saja', eol: 'EOL' }[s.key])); x.value = o.v; $('ver').appendChild(x); });
    buildPkgs();
    $('os').value = st.os; $('source').value = st.source; $('ver').value = st.ver; $('pin').value = st.pin;
    ['meta', 'yes', 'noRec', 'nonInter', 'hold'].forEach(function (k) { $(k).checked = !!st[k]; });
    $('os').addEventListener('change', function () { st.os = $('os').value; upd(); });
    $('source').addEventListener('change', function () { st.source = $('source').value; upd(); });
    $('ver').addEventListener('change', function () { st.ver = $('ver').value; upd(); });
    $('pin').addEventListener('input', function () { st.pin = $('pin').value; upd(); });
    ['meta', 'yes', 'noRec', 'nonInter', 'hold'].forEach(function (k) { $(k).addEventListener('change', function () { st[k] = $(k).checked; upd(); }); });
    document.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.getAttribute('data-preset'); st.pkgs = p === 'none' ? [] : PHPI.PRESETS[p].slice(); syncPkgs(); upd(); });
    });
    $('btnSample').addEventListener('click', function () { Object.assign(st, PHPI.defaults(), { ver: '8.2', pkgs: ['fpm', 'mysql', 'pgsql', 'gd'] }); syncAll(); upd(); });
    $('btnReset').addEventListener('click', function () { Object.assign(st, PHPI.defaults(), { pkgs: [] }); syncAll(); upd(); });
  }

  function syncAll() {
    $('os').value = st.os; $('source').value = st.source; $('ver').value = st.ver; $('pin').value = st.pin;
    ['meta', 'yes', 'noRec', 'nonInter', 'hold'].forEach(function (k) { $(k).checked = !!st[k]; });
    syncPkgs();
  }

  var boxes = {};
  function buildPkgs() {
    var host = $('pkgs'), groups = [];
    PHPI.PKGS.forEach(function (p) { if (groups.indexOf(p.g) < 0) groups.push(p.g); });
    groups.forEach(function (g) {
      var wrap = el('div', 'pi-group'), grid = el('div', 'pi-grid');
      wrap.appendChild(el('h3', '', g));
      PHPI.PKGS.filter(function (p) { return p.g === g; }).forEach(function (p) {
        var lab = el('label', 'pi-chk'), cb = el('input'), tx = el('span', '', p.label);
        cb.type = 'checkbox'; cb.value = p.id; boxes[p.id] = { cb: cb, lab: lab, tx: tx, base: p.label };
        cb.addEventListener('change', function () {
          var i = st.pkgs.indexOf(p.id);
          if (cb.checked && i < 0) st.pkgs.push(p.id); else if (!cb.checked && i >= 0) st.pkgs.splice(i, 1);
          upd();
        });
        lab.appendChild(cb); lab.appendChild(tx); grid.appendChild(lab);
      });
      wrap.appendChild(grid); host.appendChild(wrap);
    });
    syncPkgs();
  }
  function syncPkgs() {
    var numbered = st.source === 'ondrej';
    PHPI.PKGS.forEach(function (p) {
      var b = boxes[p.id], ok = !numbered || PHPI.available(p, st.ver);
      b.cb.checked = st.pkgs.indexOf(p.id) >= 0; b.cb.disabled = !ok; b.lab.classList.toggle('off', !ok);
      b.tx.textContent = ok ? b.base : b.base + ' (tidak ada untuk PHP ' + st.ver + ')';
    });
  }

  function upd() { save(); render(); }

  function render() {
    var numbered = st.source === 'ondrej';
    $('pVer').hidden = !numbered;
    $('holdRow').hidden = !numbered;
    $('srcHint').textContent = st.source === 'distro' ? 'Versi PHP mengikuti default sistem operasi yang dipilih.' : st.source === 'ondrej-latest' ? 'Nama paket tanpa nomor, tapi memakai repo Ondřej: versinya ikut yang terbaru di sana.' : 'Repo Ondřej Surý menyediakan banyak versi PHP berdampingan untuk Ubuntu dan Debian.';
    syncPkgs();
    var s = PHPI.status(st.ver), b = $('verBadge');
    b.className = 'pi-badge ' + s.key; b.textContent = s.text; b.hidden = !numbered;
    var r = PHPI.build(st), out = $('out');
    $('pinErr').hidden = !(r.errors && r.errors.pin); $('pinErr').textContent = (r.errors && r.errors.pin) || '';
    clear(out);
    if (!r.ok) {
      var e = el('section', 'panel empty'); e.appendChild(el('p', '', 'Belum ada perintah.')); e.appendChild(el('p', 'small', 'Perbaiki isian yang ditandai di sebelah kiri.')); out.appendChild(e); return;
    }
    var p = el('section', 'panel'), hd = el('div', 'panel-head'); hd.appendChild(el('h2', '', 'Langkah pemasangan')); p.appendChild(hd);
    r.steps.forEach(function (stp, i) {
      var row = el('div', 'pi-step'); row.appendChild(el('span', 'pi-n', String(i + 1)));
      var body = el('div'); body.appendChild(el('h3', '', stp.title)); if (stp.desc) body.appendChild(el('p', 'small muted', stp.desc));
      body.appendChild(el('pre', 'src', stp.cmd));
      var bt = el('div', 'pi-btns'), cp = el('button', 'btn', 'Salin'); cp.type = 'button'; cp.addEventListener('click', function () { copy(stp.cmd, cp); }); bt.appendChild(cp); body.appendChild(bt);
      row.appendChild(body); p.appendChild(row);
    });
    var all = r.steps.filter(function (x) { return !x.code; }).map(function (x) { return '# ' + x.title + '\n' + x.cmd; }).join('\n\n');
    var ca = el('button', 'btn btn-primary', 'Salin semua langkah'); ca.type = 'button'; ca.style.height = '44px'; ca.style.marginTop = '20px'; ca.addEventListener('click', function () { copy(all, ca); });
    var dl = el('button', 'btn', 'Unduh sebagai .sh'); dl.type = 'button'; dl.style.height = '44px'; dl.style.marginTop = '20px'; dl.style.marginLeft = '8px';
    dl.addEventListener('click', function () { var a = el('a'); a.href = URL.createObjectURL(new Blob(['#!/usr/bin/env bash\nset -e\n\n' + all + '\n'], { type: 'text/x-shellscript' })); a.download = 'pasang-php.sh'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); });
    p.appendChild(ca); p.appendChild(dl); out.appendChild(p);
    if (r.notes.length) {
      var np = el('section', 'panel'), nh = el('div', 'panel-head'); nh.appendChild(el('h2', '', 'Catatan')); np.appendChild(nh);
      r.notes.forEach(function (n) {
        var d = el('div', 'issue pi-note ' + (n.lv === 'warning' ? 'warning' : 'info')); d.appendChild(el('strong', '', n.title)); d.appendChild(el('p', 'small', n.text)); np.appendChild(d);
      });
      out.appendChild(np);
    }
  }

  function copy(text, btn) {
    function done() { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = 'Tersalin'; clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() { var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal menyalin'; } ta.remove(); }
  }

  init(); render();
  window.PHPIApp = { state: st };
})();
