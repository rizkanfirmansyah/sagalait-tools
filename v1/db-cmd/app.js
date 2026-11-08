/* Antarmuka Perintah database. Semua teks ditampilkan lewat textContent. Kata sandi tidak pernah diminta atau disimpan. */
(function () {
  'use strict';
  var KEY = 'sagalait-db-cmd';
  var $ = function (id) { return document.getElementById(id); };
  var st = load();
  var FIELDS = ['host', 'port', 'user', 'db', 'tables', 'file', 'sql', 'sshTarget', 'sshLocal'];
  var BOOLS = ['stamp', 'gz', 'noComments', 'routines', 'noOwner', 'custom', 'fromGz', 'ssh'];

  function load() {
    var d = DBCMD.defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') Object.keys(d).forEach(function (k) { if (s[k] !== undefined && typeof s[k] === typeof d[k]) d[k] = s[k]; });
    } catch (e) { /* abaikan */ }
    if (!DBCMD.ENGINES.some(function (e) { return e[0] === d.engine; })) d.engine = 'mysql';
    if (!DBCMD.TASKS.some(function (t) { return t[0] === d.task; })) d.task = 'connect';
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* abaikan */ } }

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function fillSelects() {
    DBCMD.ENGINES.forEach(function (e) { var o = el('option', '', e[1]); o.value = e[0]; $('engine').appendChild(o); });
    DBCMD.TASKS.forEach(function (t) { var o = el('option', '', t[1]); o.value = t[0]; $('task').appendChild(o); });
  }

  function syncInputs() {
    $('engine').value = st.engine; $('task').value = st.task; $('restoreFmt').value = st.restoreFmt;
    FIELDS.forEach(function (k) { $(k).value = st[k]; });
    BOOLS.forEach(function (k) { $(k).checked = !!st[k]; });
    if (st.ssh) document.querySelector('.dc-ssh').open = true;
  }

  function applyVisibility() {
    var pg = st.engine === 'pg';
    document.querySelectorAll('[data-tasks]').forEach(function (n) {
      var okTask = n.getAttribute('data-tasks').split(' ').indexOf(st.task) >= 0;
      var eng = n.getAttribute('data-eng'), okEng = !eng || (eng === 'pg') === pg;
      n.hidden = !(okTask && okEng);
    });
    var any = [].some.call($('pDetail').querySelectorAll('[data-tasks]'), function (n) { return !n.hidden; });
    $('pDetail').hidden = !any;
    $('port').placeholder = pg ? '5432' : '3306';
    $('lblFile').textContent = /^dump/.test(st.task) ? 'Nama file hasil' : 'Nama file sumber';
    $('lblDb').textContent = pg ? 'Nama database' : 'Nama database';
    $('sshBox').style.opacity = st.ssh ? '1' : '.55';
  }

  function render() {
    applyVisibility();
    var r = DBCMD.build(st), out = $('out');
    clear(out);
    document.querySelectorAll('.dc-err').forEach(function (p) {
      var m = r.errors[p.getAttribute('data-e')]; p.hidden = !m; p.textContent = m || '';
    });
    if (!r.ok) {
      var e = el('section', 'panel empty'); e.appendChild(el('p', '', 'Belum ada perintah.'));
      e.appendChild(el('p', 'small', 'Isi kolom yang ditandai di sebelah kiri, atau coba dengan contoh.'));
      var b = el('button', 'btn btn-sm', 'Coba dengan contoh'); b.type = 'button'; b.style.height = '44px'; b.addEventListener('click', sample); e.appendChild(b);
      out.appendChild(e); return;
    }
    var p = el('section', 'panel'); p.appendChild(el('div', 'panel-head')).appendChild(el('h2', '', r.cmds.length > 1 ? 'Perintah' : 'Perintah'));
    r.cmds.forEach(function (c) {
      var box = el('div', 'dc-cmd'); box.appendChild(el('h3', '', c.label));
      var pre = el('pre', 'src dc-code', c.text); box.appendChild(pre);
      var row = el('div', 'dc-btns'), cp = el('button', 'btn', 'Salin'); cp.type = 'button';
      cp.addEventListener('click', function () { copy(c.text, cp); }); row.appendChild(cp);
      box.appendChild(row); p.appendChild(box);
    });
    if (r.cmds.length > 1) {
      var all = r.cmds.map(function (c) { return c.text; }).join('\n'), ca = el('button', 'btn', 'Salin semua'); ca.type = 'button';
      ca.addEventListener('click', function () { copy(all, ca); }); p.lastChild.querySelector('.dc-btns').appendChild(ca);
    }
    out.appendChild(p);

    var fp = el('section', 'panel'); fp.appendChild(el('div', 'panel-head')).appendChild(el('h2', '', 'Arti tiap bagian'));
    var dl = el('dl', 'kv dc-flags');
    r.flags.forEach(function (f) { dl.appendChild(el('dt', '', f[0])); dl.appendChild(el('dd', '', f[1])); });
    fp.appendChild(dl); out.appendChild(fp);

    if (r.notes.length) {
      var np = el('section', 'panel'); np.appendChild(el('div', 'panel-head')).appendChild(el('h2', '', 'Catatan'));
      r.notes.forEach(function (n) {
        var d = el('div', 'issue dc-issue ' + (n.lv === 'warning' ? 'warning' : 'info'));
        d.appendChild(el('strong', '', n.title)); d.appendChild(el('p', 'small', n.text)); np.appendChild(d);
      });
      out.appendChild(np);
    }
  }

  function copy(text, btn) {
    function done() { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = 'Tersalin'; clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = o; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
    function fb() {
      var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Gagal menyalin'; } ta.remove();
    }
  }

  function sample() {
    Object.assign(st, DBCMD.defaults(), { engine: 'mysql', task: 'dumpStruct', host: '9.9.9.140', user: 'usersql', db: 'itclub', file: 'struktur-itclub.sql' });
    save(); syncInputs(); render();
  }

  function bind() {
    $('engine').addEventListener('change', function () { st.engine = $('engine').value; save(); render(); });
    $('task').addEventListener('change', function () { st.task = $('task').value; save(); render(); });
    $('restoreFmt').addEventListener('change', function () { st.restoreFmt = $('restoreFmt').value; save(); render(); });
    FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { st[k] = $(k).value; save(); render(); }); });
    BOOLS.forEach(function (k) { $(k).addEventListener('change', function () { st[k] = $(k).checked; save(); render(); }); });
    $('btnSample').addEventListener('click', sample);
    $('btnClear').addEventListener('click', function () { Object.assign(st, DBCMD.defaults()); save(); syncInputs(); render(); $('user').focus(); });
  }

  fillSelects(); syncInputs(); bind(); render();
  window.DBCMDApp = { state: st };
})();
