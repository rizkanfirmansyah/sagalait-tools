/* Roda acak: layar, penyimpanan, dan penghubung antara mesin dan penyaji. */
(function () {
  'use strict';
  var E = Roda.engine;
  var KEY = 'sagalait-roda-acak';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  var SAMPLE_LIST = 'Warung Sate Pak Eko\nBakso Mang Ujang\nNasi Padang Sederhana\nMie Ayam Tumini\nSop Buntut Bu Rini\nGudeg Yu Djum\nSoto Betawi\nAyam Geprek Mbak Sari\nPecel Lele Cak Ron';
  var SAMPLE_POTS = '# Pot 1\nElang FC\nHarimau SC\nRajawali United\nBanteng Jaya\n# Pot 2\nKomodo FC\nMacan Tutul\nBadak Perkasa\nCenderawasih SC\n# Pot 3\nWalet Putih\nKasuari FC\nAnoa United\nTapir SC\n# Pot 4\nOrangutan FC\nMaleo SC\nPenyu Hijau\nRusa Timur';
  var SAMPLE_PEOPLE = SAMPLE_POTS.split('\n').filter(function (l) { return l.charAt(0) !== '#'; }).join('\n');
  var FILL_DESC = { bergilir: 'Peserta dibagi bergiliran: A, B, C, lalu kembali ke A.', penuh: 'Satu grup diisi sampai penuh, baru grup berikutnya.', diundi: 'Peserta diundi dulu, lalu grup tujuannya ikut diundi.' };
  var VERBS = { roda: ['Putar', 'memutar'], bola: ['Kocok', 'mengocok'], kartu: ['Nyalakan', 'menyalakan'] };
  var FILLS = { bergilir: 'bergilir', penuh: 'satu grup dulu', diundi: 'grup ikut diundi' };

  var st = { text: '', goal: 'urut', view: 'roda', speed: 'normal', remove: true, tick: false, gList: ['Grup A', 'Grup B'], usePots: false, pots: [{ name: 'Pot 1', text: '' }], gFill: 'bergilir',
    seed: '', saved: {}, screen: 'setup', session: null, plan: null, planStep: 0 };
  var sess = null, src = null, presenter = null, p1 = null, p2 = null, busy = false, run = 0, actx = null, pending = null;
  var skipping = false, flyAnim = null, idleId = null, pngUrl = null, pngBlob = null;

  // ukuran kanvas: di layar penuh boleh sampai 1000px dan hanya dibatasi tinggi layar (menggantikan batas bawaan di engine.js)
  Roda.fitSize = function (container, maxSize, ratio) {
    var w = container.clientWidth || 320, cap = maxSize;
    if (document.body.classList.contains('fs')) cap = Math.min(1000, (window.innerHeight - 190) / (ratio || 1));
    return Math.max(180, Math.min(w, cap));
  };

  // ---------- util ----------
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function announce(t) { var l = $('live'); l.textContent = ''; setTimeout(function () { l.textContent = t; }, 30); }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function newSource() { return st.seed ? E.seededSource(st.seed) : E.cryptoSource(); }
  function flash(btn, text) { var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = text; clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = o; }, 1500); }
  function copy(text, btn) {
    function done() { flash(btn, 'Tersalin'); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() {
      var ta = h('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { flash(btn, 'Gagal menyalin'); }
      ta.remove();
    }
  }
  function download(name, blob) { var a = h('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function gcol(i) { return 'var(--wheel-' + ((i % 8) + 1) + ')'; }
  function shortName(n) { return n.replace(/^Grup\s+/i, ''); }

  // ---------- nama grup, pot, dan data pengaturan ----------
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 30); }
  function defaultName(i) { return 'Grup ' + (i < 26 ? String.fromCharCode(65 + i) : i + 1); }
  function nextName() {
    var used = {}; st.gList.forEach(function (n) { used[n.toLowerCase()] = 1; });
    for (var i = 0; i < 200; i++) { var n = defaultName(i); if (!used[n.toLowerCase()]) return n; }
    return 'Grup';
  }
  function hasHash(t) { return /^\s*#/m.test(String(t)); }
  function stripHash(t) { return String(t).split(/\r\n|\r|\n/).filter(function (l) { return !/^\s*#/.test(l); }).join('\n'); }
  function potNameOf(p, i) { return String(p.name || '').replace(/^\s*#+\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Pot ' + (i + 1); }
  function potsToText() { return st.pots.map(function (p, i) { return '# ' + potNameOf(p, i) + '\n' + stripHash(p.text); }).join('\n'); }
  function potsFromText(t) {
    var pp = E.parsePots(t);
    st.pots = pp.pots.map(function (p) { return { name: p.name, text: p.items.map(function (i) { return i.label; }).join('\n') }; });
    if (!st.pots.length) st.pots = [{ name: 'Pot 1', text: '' }];
    st.usePots = true;
  }
  // adaptor: apa pun bentuk isian, mesin selalu menerima daftar pot yang sama seperti sebelumnya
  function parsedPeople() { return st.usePots ? E.parsePots(potsToText()) : E.parsePots(stripHash(st.text)); }
  function peopleCount(pp) { var n = 0; pp.pots.forEach(function (p) { n += p.items.length; }); return n; }
  function currentText() { return st.goal === 'grup' && st.usePots ? potsToText() : st.text; }
  function setText(t) {
    if (st.goal === 'grup' && hasHash(t)) { potsFromText(t); return; }
    st.text = t; if (st.goal === 'grup') st.usePots = false;
  }

  // ---------- penyimpanan ----------
  function save() {
    try {
      st.session = sess ? sess.toJSON() : null;
      localStorage.setItem(KEY, JSON.stringify(Object.assign({ v: 1 }, st)));
    } catch (e) { /* mode privat: abaikan */ }
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY));
      if (!o || o.v !== 1) return;
      ['text', 'goal', 'view', 'speed', 'seed', 'gFill', 'screen'].forEach(function (k) { if (typeof o[k] === 'string') st[k] = o[k]; });
      ['remove', 'tick'].forEach(function (k) { if (typeof o[k] === 'boolean') st[k] = o[k]; });
      // grup: daftar baru, atau migrasi dari jumlah dan nama lama
      if (Array.isArray(o.gList)) {
        var seen = {}; st.gList = [];
        o.gList.forEach(function (n) { n = cleanName(n); if (n && !seen[n.toLowerCase()] && st.gList.length < 16) { seen[n.toLowerCase()] = 1; st.gList.push(n); } });
      } else if (o.gCount >= 2 && o.gCount <= 16) {
        st.gList = [];
        for (var i = 0; i < o.gCount; i++) {
          var nm = cleanName(Array.isArray(o.gNames) ? o.gNames[i] : ''), dn = defaultName(i);
          if (!nm || st.gList.indexOf(nm) >= 0) nm = dn;
          st.gList.push(nm);
        }
      }
      // pot: blok baru, atau migrasi dari teks berawalan #
      if (Array.isArray(o.pots)) {
        st.pots = o.pots.map(function (p) { return { name: String((p && p.name) || '').slice(0, 30), text: String((p && p.text) || '') }; }).slice(0, 20);
        st.usePots = o.usePots === true && st.pots.length > 0;
      } else if (st.goal === 'grup' && hasHash(st.text)) { potsFromText(st.text); }
      if (o.saved && typeof o.saved === 'object') st.saved = o.saved;
      if (o.session && o.session.all) { sess = E.Session.fromJSON(o.session, newSource()); }
      if (o.plan && o.plan.steps && o.plan.groups && o.plan.pots) { st.plan = o.plan; st.planStep = Math.max(0, Math.min(o.planStep | 0, o.plan.steps.length)); }
    } catch (e) { /* data rusak: mulai bersih */ }
    if (!Roda.presenters[st.view]) st.view = 'roda';
    if (['satu', 'urut', 'grup'].indexOf(st.goal) < 0) st.goal = 'urut';
    if (['bergilir', 'penuh', 'diundi'].indexOf(st.gFill) < 0) st.gFill = 'bergilir';
    if (!Array.isArray(st.pots) || !st.pots.length) { st.pots = [{ name: 'Pot 1', text: '' }]; st.usePots = false; }
    if (st.screen === 'stage' && !sess) st.screen = 'setup';
    if (st.screen === 'group' && !st.plan) st.screen = 'setup';
  }

  // ---------- layar Siapkan ----------
  function buildViews() {
    var box = $('views');
    Object.keys(Roda.presenters).forEach(function (k) {
      var P = Roda.presenters[k], lab = h('label', 'choice'), inp = h('input');
      inp.type = 'radio'; inp.name = 'view'; inp.value = k;
      var b = h('span', 'box'), svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 56 56'); svg.setAttribute('aria-hidden', 'true');
      P.thumb(svg, NS);
      b.appendChild(svg); b.appendChild(h('span', '', P.label));
      lab.appendChild(inp); lab.appendChild(b); box.appendChild(lab);
    });
  }

  function groupNames() { return st.gList.slice(); }

  function gmsg(t) { $('gMsg').textContent = t; }

  function renderGroupList(flashIdx) {
    var ul = $('gList'); clear(ul);
    st.gList.forEach(function (name, i) {
      var li = h('li', 'g-row' + (i === flashIdx ? ' flash' : '')), dot = h('span', 'g-dot'), inp = h('input', 'gname'), del = h('button', 'g-x', '\u00d7');
      dot.style.background = gcol(i); dot.setAttribute('aria-hidden', 'true');
      inp.type = 'text'; inp.value = name; inp.maxLength = 30; inp.setAttribute('aria-label', 'Nama grup ' + (i + 1) + ', ubah langsung'); inp.autocomplete = 'off';
      inp.addEventListener('focus', function () { inp.select(); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = st.gList[i]; inp.blur(); }
      });
      inp.addEventListener('blur', function () {
        var v = cleanName(inp.value);
        if (!v) { inp.value = st.gList[i]; return; }
        if (v.toLowerCase() === st.gList[i].toLowerCase() && v === st.gList[i]) return;
        for (var k = 0; k < st.gList.length; k++) if (k !== i && st.gList[k].toLowerCase() === v.toLowerCase()) { inp.value = st.gList[i]; gmsg('Nama "' + v + '" sudah dipakai grup lain.'); return; }
        st.gList[i] = v; inp.value = v; del.setAttribute('aria-label', 'Hapus ' + v); gmsg(''); save(); renderSetupInfo();
      });
      del.type = 'button'; del.setAttribute('aria-label', 'Hapus ' + name);
      del.addEventListener('click', function () { st.gList.splice(i, 1); gmsg(''); renderGroupList(); renderSetupInfo(); save(); $('gInput').focus(); });
      li.appendChild(dot); li.appendChild(inp); li.appendChild(del); ul.appendChild(li);
    });
    $('gInput').placeholder = nextName();
    $('gCountTxt').textContent = st.gList.length + ' grup';
    if (st.gList.length < 2) gmsg('Tambahkan minimal 2 grup.');
    else if ($('gMsg').textContent === 'Tambahkan minimal 2 grup.') gmsg('');
  }

  function addGroup() {
    var inp = $('gInput'), v = cleanName(inp.value) || nextName();
    if (st.gList.length >= 16) { gmsg('Paling banyak 16 grup.'); inp.focus(); return; }
    for (var k = 0; k < st.gList.length; k++) if (st.gList[k].toLowerCase() === v.toLowerCase()) { gmsg('Nama "' + v + '" sudah dipakai grup lain.'); inp.focus(); return; }
    st.gList.push(v); inp.value = ''; gmsg('');
    renderGroupList(st.gList.length - 1); renderSetupInfo(); save(); inp.focus();
  }

  function renderPotBlocks(focusIdx) {
    var box = $('potBlocks'); clear(box);
    st.pots.forEach(function (p, i) {
      var blk = h('div', 'pot-blk' + (i === focusIdx ? ' flash' : '')), head = h('div', 'pot-head'), name = h('input', 'field-sm pname'), del = h('button', 'g-x', '\u00d7'), ta = h('textarea', 'field pot-ta');
      name.type = 'text'; name.value = p.name; name.maxLength = 30; name.placeholder = 'Pot ' + (i + 1); name.setAttribute('aria-label', 'Nama pot ' + (i + 1)); name.autocomplete = 'off';
      name.addEventListener('input', function () { st.pots[i].name = name.value; del.setAttribute('aria-label', 'Hapus ' + potNameOf(st.pots[i], i)); renderSetupInfo(); save(); });
      del.type = 'button'; del.setAttribute('aria-label', 'Hapus ' + potNameOf(p, i)); del.disabled = st.pots.length < 2;
      del.addEventListener('click', function () { st.pots.splice(i, 1); renderPotBlocks(); renderSetupInfo(); save(); $('btnAddPot').focus(); });
      ta.value = p.text; ta.spellcheck = false; ta.placeholder = 'Satu nama per baris'; ta.rows = 5; ta.setAttribute('aria-label', 'Peserta ' + potNameOf(p, i)); ta.autocomplete = 'off';
      ta.addEventListener('input', function () { st.pots[i].text = ta.value; renderSetupInfo(); save(); });
      head.appendChild(name); head.appendChild(del); blk.appendChild(head); blk.appendChild(ta); box.appendChild(blk);
    });
  }

  function addPot() {
    if (st.pots.length >= 20) return;
    var n = st.pots.length + 1, used = {};
    st.pots.forEach(function (p, i) { used[potNameOf(p, i).toLowerCase()] = 1; });
    while (used['pot ' + n]) n++;
    st.pots.push({ name: 'Pot ' + n, text: '' });
    renderPotBlocks(st.pots.length - 1); renderSetupInfo(); save();
    var tas = document.querySelectorAll('#potBlocks textarea'); if (tas.length) tas[tas.length - 1].focus();
  }

  function setPots(on) {
    $('mergeAsk').hidden = true;
    if (on) {
      st.pots = [{ name: 'Pot 1', text: st.text }]; st.usePots = true;
    } else {
      var filled = st.pots.filter(function (p) { return stripHash(p.text).trim(); });
      if (filled.length > 1 && !setPots.confirmed) {
        $('swPots').checked = true;
        $('mergeTxt').textContent = 'Ada ' + filled.length + ' pot yang terisi. Gabungkan semuanya jadi satu daftar peserta?';
        $('mergeAsk').hidden = false; $('btnMerge').focus(); return;
      }
      st.text = st.pots.map(function (p) { return stripHash(p.text).trim(); }).filter(Boolean).join('\n'); st.usePots = false;
    }
    setPots.confirmed = false;
    $('list').value = st.text; renderPotBlocks(); renderSetupInfo(); save();
  }

  function syncControls() {
    $('list').value = st.text;
    document.querySelectorAll('input[name=goal]').forEach(function (r) { r.checked = r.value === st.goal; });
    document.querySelectorAll('input[name=view]').forEach(function (r) { r.checked = r.value === st.view; });
    document.querySelectorAll('input[name=speed]').forEach(function (r) { r.checked = r.value === st.speed; });
    document.querySelectorAll('input[name=fill]').forEach(function (r) { r.checked = r.value === st.gFill; });
    $('swRemove').checked = st.remove; $('swTick').checked = st.tick; $('seed').value = st.seed;
    renderGroupList(); renderPotBlocks(); renderSaved(); renderSetupInfo();
  }

  function summaryText(n, pots) {
    var viewName = { roda: 'roda', bola: 'tabung', kartu: 'kartu' }[st.view];
    if (st.goal === 'grup') {
      var G = st.gList.length;
      if (!n) return 'Belum ada peserta.';
      if (G < 2) return n + ' peserta. Tambahkan minimal 2 grup.';
      var lo = Math.floor(n / G), hi = Math.ceil(n / G);
      return n + ' peserta, ' + G + ' grup: ' + (lo === hi ? lo : lo + ' sampai ' + hi) + ' per grup' + (pots > 1 ? ', ' + pots + ' pot' : '') + ', ' + FILLS[st.gFill] + '.';
    }
    if (!n) return 'Belum ada pilihan.';
    if (st.goal === 'satu') return n + ' pilihan, satu jawaban besar.';
    return n + ' pilihan, pemenang ' + (st.remove ? 'keluar dari ' : 'tetap di ') + viewName + '.';
  }

  function renderSetupInfo() {
    var grup = st.goal === 'grup', G = st.gList.length;
    $('grpPanel').hidden = !grup; $('rowPots').hidden = !grup;
    $('flatBox').hidden = grup && st.usePots; $('potBox').hidden = !(grup && st.usePots);
    $('rowRemove').hidden = st.goal !== 'urut'; $('swPots').checked = st.usePots;
    $('listTitle').textContent = grup ? 'Peserta' : 'Daftar pilihan';
    $('btnDedupe').hidden = grup;
    $('fillDesc').textContent = FILL_DESC[st.gFill];
    $('gCountTxt').textContent = G + ' grup';
    var warn = $('listWarn'); clear(warn);
    function note(text, cls, tip, btn) {
      var d = h('div', 'issue ' + (cls || 'warning')); d.appendChild(h('p', '', text)); if (tip) d.appendChild(h('p', 'small muted', tip));
      if (btn) { var b = h('button', 'btn btn-sm', btn[0]); b.type = 'button'; b.style.height = '44px'; b.style.marginTop = '8px'; b.addEventListener('click', btn[1]); d.appendChild(b); }
      warn.appendChild(d);
    }
    var hint = $('listHint'); clear(hint);
    $('startWhy').textContent = '';
    if (grup) {
      var pp = parsedPeople(), n = peopleCount(pp), sizes = pp.pots.map(function (p) { return p.items.length; });
      $('count').textContent = n + ' peserta' + (st.usePots ? ', ' + pp.pots.length + ' pot' : '');
      $('startSum').textContent = summaryText(n, st.usePots ? pp.pots.length : 1);
      if (pp.over) note('Hanya ' + E.MAX_ITEMS + ' peserta pertama yang dipakai.', 'warning', 'Kurangi daftar agar semuanya ikut.');
      if (!st.usePots && hasHash(st.text)) note('Ada baris berawalan # di teks ini. Baris itu dianggap judul pot.', 'info', 'Mau dipecah jadi pot?', ['Pakai pot dari teks ini', function () { potsFromText(st.text); renderPotBlocks(); renderSetupInfo(); save(); }]);
      if (n && G >= 2 && n < G) note('Peserta (' + n + ') lebih sedikit dari jumlah grup (' + G + ').', 'warning', 'Hapus beberapa grup atau tambah peserta.');
      else if (n && G >= 2) {
        try {
          E.groupPlan(pp.pots, { G: G, fill: st.gFill }, E.seededSource('cek')).warnings.forEach(function (t) {
            var tip = '';
            if (/Ukuran pot/.test(t)) {
              var same = sizes.length > 1 && sizes.every(function (x) { return x === sizes[0]; });
              tip = same && sizes[0] >= 2 && sizes[0] <= 16 ? 'Buat ' + sizes[0] + ' grup supaya tiap grup mendapat satu peserta dari tiap pot.' : 'Samakan jumlah peserta tiap pot dengan jumlah grup bila ingin satu per pot.';
            }
            note(t, /Ukuran pot/.test(t) ? 'warning' : 'info', tip);
          });
        } catch (e) { /* diabaikan di sini */ }
      }
      hint.appendChild(document.createTextNode(st.usePots ? 'Satu nama per baris di tiap pot.' : 'Satu nama per baris.'));
      return;
    }
    hint.appendChild(document.createTextNode('Satu nama per baris. Tambah '));
    hint.appendChild(h('code', '', 'x3'));
    hint.appendChild(document.createTextNode(' di belakang nama agar peluangnya tiga kali lipat.'));
    var p = E.parseList(st.text);
    $('count').textContent = p.items.length + ' pilihan';
    $('startSum').textContent = summaryText(p.items.length);
    if (p.over) note('Hanya ' + E.MAX_ITEMS + ' pilihan pertama yang dipakai.', 'warning', 'Kurangi daftar agar semuanya ikut.');
    if (p.duplicates.length) note('Ada nama yang sama: ' + p.duplicates.slice(0, 5).join(', ') + (p.duplicates.length > 5 ? ', ...' : '') + '.', 'warning', 'Tiap baris tetap dihitung sebagai pilihan sendiri. Klik Hapus duplikat bila tidak diinginkan.');
  }

  function renderSaved() {
    var sel = $('savedSel'), names = Object.keys(st.saved); clear(sel);
    if (!names.length) { var o = h('option', '', '(belum ada)'); o.value = ''; sel.appendChild(o); return; }
    names.forEach(function (n) { var o = h('option', '', n); o.value = n; sel.appendChild(o); });
  }

  function setupEvents() {
    $('list').addEventListener('input', function () { st.text = $('list').value; renderSetupInfo(); save(); });
    document.querySelectorAll('input[name=goal],input[name=view],input[name=speed],input[name=fill]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.name === 'fill') st.gFill = r.value; else st[r.name] = r.value; renderSetupInfo(); save(); });
    });
    $('swRemove').addEventListener('change', function () { st.remove = $('swRemove').checked; renderSetupInfo(); save(); });
    $('swTick').addEventListener('change', function () { st.tick = $('swTick').checked; if (st.tick) ensureAudio(); save(); });
    $('swPots').addEventListener('change', function () { setPots($('swPots').checked); });
    $('btnMerge').addEventListener('click', function () { setPots.confirmed = true; setPots(false); $('swPots').focus(); });
    $('btnMergeNo').addEventListener('click', function () { $('mergeAsk').hidden = true; $('swPots').checked = true; $('swPots').focus(); });
    $('btnAddPot').addEventListener('click', addPot);
    $('btnAddGrp').addEventListener('click', addGroup);
    $('gInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } });
    $('seed').addEventListener('input', function () { st.seed = $('seed').value.trim(); save(); });
    $('btnSeedNew').addEventListener('click', function () {
      var b = new Uint32Array(2); crypto.getRandomValues(b); st.seed = (b[0].toString(36) + b[1].toString(36)).slice(0, 10); $('seed').value = st.seed; save();
    });
    $('btnSeedCopy').addEventListener('click', function () { if (st.seed) copy(st.seed, $('btnSeedCopy')); });
    $('btnSample').addEventListener('click', function () {
      if (st.goal === 'grup') {
        if (st.gList.length === 2 && st.gList[0] === 'Grup A' && st.gList[1] === 'Grup B') st.gList = ['Grup A', 'Grup B', 'Grup C', 'Grup D'];
        if (st.usePots) potsFromText(SAMPLE_POTS); else st.text = SAMPLE_PEOPLE;
        renderGroupList(); renderPotBlocks();
      } else st.text = SAMPLE_LIST;
      $('list').value = st.text; renderSetupInfo(); save();
    });
    $('btnClear').addEventListener('click', function () {
      st.text = ''; $('list').value = '';
      if (st.goal === 'grup' && st.usePots) { st.pots = [{ name: 'Pot 1', text: '' }]; renderPotBlocks(); }
      renderSetupInfo(); save(); (st.usePots && st.goal === 'grup' ? document.querySelector('#potBlocks textarea') : $('list')).focus();
    });
    $('btnDedupe').addEventListener('click', function () {
      var items = E.dedupe(E.parseList(st.text).items);
      st.text = items.map(function (i) { return i.label + (i.weight > 1 ? ' x' + i.weight : ''); }).join('\n'); $('list').value = st.text; renderSetupInfo(); save();
    });
    $('btnSave').addEventListener('click', function () {
      var n = $('saveName').value.trim(), m = $('saveMsg');
      if (!n) { m.textContent = 'Isi nama daftar dulu.'; $('saveName').focus(); return; }
      if (!currentText().trim()) { m.textContent = 'Daftar masih kosong, belum ada yang disimpan.'; return; }
      st.saved[n] = currentText(); renderSaved(); $('savedSel').value = n; m.textContent = 'Daftar "' + n + '" tersimpan di browser ini.'; save();
    });
    $('btnLoad').addEventListener('click', function () {
      var n = $('savedSel').value; if (!n || !(n in st.saved)) { $('saveMsg').textContent = 'Belum ada daftar tersimpan.'; return; }
      setText(st.saved[n]); $('list').value = st.text; renderPotBlocks(); renderSetupInfo(); $('saveMsg').textContent = 'Daftar "' + n + '" dimuat.'; save();
    });
    $('btnDelSaved').addEventListener('click', function () {
      var n = $('savedSel').value; if (!n) return; delete st.saved[n]; renderSaved(); $('saveMsg').textContent = 'Daftar "' + n + '" dihapus.'; save();
    });
    $('ballRemove').addEventListener('click', function () { $('ballDlg').close('remove'); });
    $('ballKeep').addEventListener('click', function () { $('ballDlg').close('keep'); });
    $('btnStart').addEventListener('click', start);
    $('stepSetup').addEventListener('click', function () { goScreen('setup'); });
    $('stepStage').addEventListener('click', function () { goScreen(st.goal === 'grup' ? 'group' : 'stage'); });
    $('btnBack').addEventListener('click', function () { goScreen('setup'); });
    $('btnFull').addEventListener('click', toggleFs);
    $('btnFsExit').addEventListener('click', exitFs);
    $('btnGFsExit').addEventListener('click', exitFs);
    $('btnSpin').addEventListener('click', spin);
    $('btnSkip').addEventListener('click', function () { if (presenter) presenter.skip(); });
    $('btnNext').addEventListener('click', nextGroup);
    $('btnGSkip').addEventListener('click', skipGroup);
    $('btnGUndo').addEventListener('click', undoGroup);
    $('btnGUndoDone').addEventListener('click', undoGroup);
    $('btnGCopy').addEventListener('click', function () { copy(E.formatGroups(st.plan), $('btnGCopy')); });
    $('btnGTxt').addEventListener('click', function () { download('undian-grup.txt', new Blob([E.formatGroups(st.plan) + '\n'], { type: 'text/plain;charset=utf-8' })); });
    $('btnGPng').addEventListener('click', previewPng);
    $('btnGAgain').addEventListener('click', function () { if (!busy) newPlan(); });
    $('btnGNew').addEventListener('click', function () { goScreen('setup'); });
    $('pngSave').addEventListener('click', function () { if (pngBlob) download('undian-grup.png', pngBlob); });
    $('pngClose').addEventListener('click', function () { $('pngDlg').close(); });
    $('pngDlg').addEventListener('close', function () { if (pngUrl) URL.revokeObjectURL(pngUrl); pngUrl = null; pngBlob = null; $('pngImg').removeAttribute('src'); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) setFs(false); });
    ['mousemove', 'pointerdown', 'touchstart', 'keydown', 'focusin'].forEach(function (ev) { document.addEventListener(ev, poke, { passive: true }); });
  }

  // ---------- navigasi layar ----------
  function start() {
    var w = $('listWarn');
    function fail(t, field) {
      clear(w); var d = h('div', 'issue warning'); d.appendChild(h('p', '', t)); w.appendChild(d);
      $('startWhy').textContent = t; if (field) field.focus();
    }
    src = newSource();
    if (st.goal === 'grup') {
      if (!st.usePots && hasHash(st.text)) { potsFromText(st.text); renderPotBlocks(); }
      var pp = parsedPeople(), n = peopleCount(pp), G = st.gList.length;
      if (G < 2) return fail('Tambahkan minimal 2 grup.', $('gInput'));
      if (!n) return fail('Daftar peserta masih kosong. Tulis satu nama per baris, atau klik Coba dengan contoh.', st.usePots ? document.querySelector('#potBlocks textarea') : $('list'));
      if (n < G) return fail('Peserta (' + n + ') lebih sedikit dari jumlah grup (' + G + '). Hapus beberapa grup atau tambah peserta.', st.usePots ? document.querySelector('#potBlocks textarea') : $('list'));
      st.plan = null; sess = null; newPlan(pp.pots, true);
      st.screen = 'group';
    } else {
      var pl = E.parseList(st.text);
      if (!pl.items.length) return fail('Daftar masih kosong. Tulis satu nama per baris, atau klik Coba dengan contoh.', $('list'));
      sess = new E.Session(pl.items, src); st.plan = null; st.screen = 'stage';
    }
    save(); showScreen();
  }

  function goScreen(s) {
    if (busy) return;
    if (s === 'stage' && !sess) return;
    if (s === 'group' && !st.plan) return;
    if (document.body.classList.contains('fs')) exitFs();
    st.screen = s; save(); showScreen();
  }

  function destroyPresenters() {
    run++; busy = false; pending = null;
    [presenter, p1, p2].forEach(function (p) { if (p) p.destroy(); });
    presenter = p1 = p2 = null;
    clear($('stageView')); clear($('g1view')); clear($('g2view'));
  }

  function showScreen() {
    destroyPresenters();
    var s = st.screen;
    $('screenSetup').hidden = s !== 'setup'; $('screenStage').hidden = s !== 'stage'; $('screenGroup').hidden = s !== 'group';
    $('main').classList.toggle('wide', s === 'group'); document.querySelector('header.top').classList.toggle('wide', s === 'group');
    $('stageActions').hidden = s === 'setup'; $('startBar').hidden = s !== 'setup';
    $('stepSetup').setAttribute('aria-current', s === 'setup' ? 'step' : 'false');
    $('stepStage').setAttribute('aria-current', s === 'setup' ? 'false' : 'step');
    $('stepStage').disabled = !(sess || st.plan);
    $('stepSetup').disabled = false; $('btnBack').disabled = false;
    try { window.scrollTo(0, 0); } catch (e) { /* abaikan */ }
    if (s === 'setup') { $('lead').textContent = 'Atur dulu pilihan dan caranya, lalu mulai undian.'; syncControls(); return; }
    if (s === 'stage') buildStage(); else buildGroup();
  }

  // ---------- suara ----------
  function ensureAudio() {
    try {
      if (!actx) { var C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  function tone(f, t, d, v, type) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  }
  var sound = {
    tick: function () { if (st.tick && actx) { try { tone(1800, actx.currentTime, 0.03, 0.06, 'square'); } catch (e) { /* abaikan */ } } },
    done: function () { if (st.tick && actx) { try { var t = actx.currentTime; tone(660, t, 0.25, 0.15); tone(880, t + 0.18, 0.4, 0.15); } catch (e) { /* abaikan */ } } }
  };

  // ---------- panggung: pilih satu dan berurutan ----------
  function display() {
    var P = Roda.presenters[st.view];
    if (P.showsChosen) {
      var done = {};
      sess.results.forEach(function (r, i) { if (r.removed) done[r.item.id] = i + 1; });
      return sess.all.map(function (it) { return { id: it.id, label: it.label, weight: it.weight, done: done[it.id] || 0 }; });
    }
    return sess.remaining;
  }
  function refreshDisplay() { if (presenter) presenter.setItems(display()); }

  function buildStage() {
    var P = Roda.presenters[st.view], v = VERBS[st.view] || VERBS.roda;
    $('stageView').classList.toggle('kv', st.view === 'kartu');
    presenter = P.create($('stageView'), { onActivate: spin, hubLabel: v[0] });
    refreshDisplay(); renderResults(); updateStageText();
    $('btnSpin').disabled = !sess.remaining.length; $('btnSkip').disabled = true;
  }

  function updateStageText() {
    var v = VERBS[st.view] || VERBS.roda, n = sess.all.length, left = sess.remaining.length;
    $('btnSpin').textContent = v[0] + (sess.results.length ? ' lagi' : '');
    $('sProg').hidden = st.goal !== 'urut';
    if (st.goal === 'urut') {
      $('sProgTxt').textContent = 'Tersisa ' + left + ' dari ' + n;
      $('sProgBar').style.width = ((n - left) / n * 100).toFixed(1) + '%';
    }
    if (!left && st.goal === 'urut') {
      $('lead').textContent = 'Semua pilihan sudah keluar.'; $('stageCap').textContent = 'Semua pilihan sudah keluar. Reset semua untuk mulai lagi.'; return;
    }
    $('lead').textContent = (st.goal === 'urut' ? 'Putaran ' + (sess.results.length + 1) + ' dari ' + n + '. ' : '') + 'Spasi untuk ' + v[1] + '.';
    $('stageCap').textContent = st.goal === 'urut' ? (st.remove ? 'Pemenang keluar dari ' + (st.view === 'bola' ? 'tabung' : 'roda') + ' · tersisa ' + left + ' dari ' + n : 'Pemenang tetap di daftar') : n + ' pilihan';
  }

  function setBusy(b) {
    busy = b;
    $('btnSpin').disabled = b || !sess.remaining.length; $('btnSkip').disabled = !b;
    $('btnBack').disabled = b; $('stepSetup').disabled = b;
    poke();
  }

  function spin() {
    if (busy || st.screen !== 'stage' || !presenter) return;
    if (!sess.remaining.length) { announce('Semua pilihan sudah keluar.'); return; }
    if (st.tick) ensureAudio();
    var my = ++run;
    setBusy(true);
    refreshDisplay();
    var p = sess.pick(), d = display(), wi = -1;
    d.forEach(function (x, i) { if (x.id === p.item.id) wi = i; });
    presenter.spin(wi, { speed: st.speed, reducedMotion: reduced(), sound: st.tick ? sound : null }).then(function (landed) {
      if (my !== run) return;
      var li = d[landed];
      if (!li || li.id !== p.item.id) console.error('Roda acak: penyaji berhenti di "' + (li && li.label) + '", hasil mesin "' + p.item.label + '". Memakai hasil mesin.');
      return finishDraw(p, landed).then(function () { if (my === run) setBusy(false); });
    });
  }

  function finishDraw(p, landed) {
    var after = function (remove) {
      sess.commit(p, remove);
      sound.done();
      renderResults(); updateStageText(); save();
      announce('Terpilih: ' + p.item.label + (sess.remaining.length ? '' : '. Semua pilihan sudah keluar.'));
    };
    if (st.view === 'bola') {
      return popup(landed + 1, p.item.label, st.goal === 'urut' && st.remove).then(function (remove) { after(remove); });
    }
    after(st.goal === 'urut' && st.remove);
    return Promise.resolve();
  }

  function popup(num, label, twoChoices) {
    return new Promise(function (resolve) {
      var dlg = $('ballDlg');
      $('ballNum').textContent = num; $('ballName').textContent = label;
      $('ballRemove').hidden = !twoChoices; $('ballKeep').textContent = twoChoices ? 'Biarkan di tabung' : 'Tutup';
      dlg.returnValue = '';
      function onClose() { dlg.removeEventListener('close', onClose); resolve(dlg.returnValue === 'remove'); }
      dlg.addEventListener('close', onClose);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      (twoChoices ? $('ballRemove') : $('ballKeep')).focus();
    });
  }

  function undoStage() {
    if (busy || !sess || !sess.undo()) return;
    refreshDisplay(); renderResults(); updateStageText(); $('btnSpin').disabled = false; save(); announce('Pilihan terakhir dibatalkan.');
  }

  function renderResults() {
    var box = $('resPanel'); clear(box);
    var last = sess.results.length ? sess.results[sess.results.length - 1] : null, n = sess.all.length;
    box.appendChild(h('div', 'small muted', 'Terpilih'));
    var big = h('p', 'out-big'), m = h('mark', '', last ? last.item.label : 'Belum ada'); big.appendChild(m); box.appendChild(big);
    if (st.goal === 'satu') {
      var hd = h('div', 'res-h'); hd.appendChild(h('b', '', 'Riwayat')); hd.appendChild(h('span', 'muted', '5 terakhir')); box.appendChild(hd);
      var ul = h('ul', 'res-list');
      var rec = sess.results.slice(-5).reverse();
      if (!rec.length) ul.appendChild(h('li', 'muted', 'Belum ada riwayat.'));
      rec.forEach(function (r) { var li = h('li'); li.appendChild(h('span', '', r.item.label)); ul.appendChild(li); });
      box.appendChild(ul);
      var bt = h('div', 'res-btns'), c = h('button', 'btn', 'Hapus riwayat'); c.type = 'button';
      c.addEventListener('click', function () { if (busy) return; sess.results = []; renderResults(); updateStageText(); save(); });
      bt.appendChild(c); box.appendChild(bt);
      return;
    }
    var hd2 = h('div', 'res-h'); hd2.appendChild(h('b', '', 'Daftar hasil')); hd2.appendChild(h('span', 'muted', 'Tersisa ' + sess.remaining.length + ' dari ' + n)); box.appendChild(hd2);
    var ol = h('ol', 'res-list');
    if (!sess.results.length) ol.appendChild(h('li', 'muted', 'Hasil akan muncul di sini.'));
    sess.results.forEach(function (r, i) {
      var li = h('li', i === sess.results.length - 1 ? 'new' : ''), nn = h('span', 'n', String(i + 1));
      li.appendChild(nn); li.appendChild(h('span', '', r.item.label));
      if (i === sess.results.length - 1) li.appendChild(h('span', 'tagnew', 'baru'));
      ol.appendChild(li);
    });
    ol.style.listStyle = 'none';
    box.appendChild(ol);
    var where = st.view === 'bola' ? 'Masih di tabung' : st.view === 'kartu' ? 'Belum terpilih' : 'Masih di roda';
    box.appendChild(h('div', 'res-h', '')).appendChild(h('b', '', where));
    var chips = h('div', 'chips');
    sess.remaining.forEach(function (i) { chips.appendChild(h('span', 'chip', i.label)); });
    box.appendChild(chips);
    var bt2 = h('div', 'res-btns');
    function btn(t, fn) { var b = h('button', 'btn', t); b.type = 'button'; b.addEventListener('click', function () { if (!busy) fn(b); }); bt2.appendChild(b); return b; }
    btn('Batalkan terakhir', undoStage);
    btn('Salin hasil', function (b) { copy(E.formatResults(sess), b); });
    btn('Reset semua', function () {
      if (st.seed) sess.src = E.seededSource(st.seed);
      sess.reset(); refreshDisplay(); renderResults(); updateStageText(); $('btnSpin').disabled = false; save(); announce('Semua pilihan dikembalikan.');
    });
    box.appendChild(bt2);
  }

  // ---------- undian grup ----------
  function newPlan(pots, silent) {
    pots = pots || st.plan.pots;
    if (!src) src = newSource();
    var plan = E.groupPlan(pots, { G: st.gList.length, fill: st.gFill, names: groupNames() }, src);
    plan.pots = pots; st.plan = plan; st.planStep = 0;
    save();
    if (!silent) { showScreen(); announce('Undian diacak ulang.'); }
  }

  function labelOf(id) {
    var out = id;
    st.plan.pots.forEach(function (p) { p.items.forEach(function (i) { if (i.id === id) out = i.label; }); });
    return out;
  }

  function isDone() { return !!st.plan && st.planStep >= st.plan.steps.length; }

  function makePresenters() {
    p1 = Roda.presenters[st.view].create($('g1view'), { fill: true, onActivate: nextGroup, hubLabel: 'Undi' });
    p2 = Roda.presenters.kartu.create($('g2view'), { skin: 'petak' });
  }

  function buildGroup() {
    var plan = st.plan;
    $('lead').textContent = { bergilir: 'Bergilir', penuh: 'Isi penuh dulu', diundi: 'Grup ikut diundi' }[plan.fill] + ' · ' + plan.groups.length + ' grup · ' + plan.pots.length + ' pot.';
    $('board').classList.toggle('many', plan.groups.length > 8);
    $('doneGrid').classList.toggle('many', plan.groups.length > 8);
    $('g1view').classList.toggle('kv', st.view === 'kartu');
    if (!isDone()) makePresenters();
    groupIdle(); renderPots(); renderBoard(null, -1);
  }

  function groupItems2(step) {
    return st.plan.groups.map(function (g, i) {
      return { id: 'g' + i, label: shortName(g.name), title: g.name, c: i, weight: 1, off: step.groupCandidates ? step.groupCandidates.indexOf(i) < 0 : false };
    });
  }

  function groupIdle() {
    var plan = st.plan, done = isDone(), N = plan.steps.length;
    $('screenGroup').classList.toggle('finished', done);
    $('gLive').hidden = done; $('gDone').hidden = !done; $('gCtl').hidden = done;
    $('gProgTxt').textContent = done ? 'Undian selesai' : 'Undian ' + (st.planStep + 1) + ' dari ' + N;
    $('gProgBar').style.width = (st.planStep / N * 100).toFixed(1) + '%';
    $('btnGSkip').disabled = true; $('btnGUndo').disabled = st.planStep === 0;
    $('btnBack').disabled = false; $('stepSetup').disabled = false; $('btnNext').disabled = false;
    $('potSum').textContent = done ? N + ' peserta sudah dapat grup' : 'Pot · ' + st.planStep + ' dari ' + N + ' sudah keluar';
    if (done) {
      if (p1) { p1.destroy(); p1 = null; } if (p2) { p2.destroy(); p2 = null; }
      clear($('g1view')); clear($('g2view'));
      $('doneTxt').textContent = 'Undian selesai. Semua ' + N + ' peserta sudah dapat grup.';
      renderDone(); return;
    }
    if (!p1) makePresenters();
    var step = plan.steps[st.planStep];
    $('g1h').textContent = 'Langkah 1 · Peserta dari ' + step.potName;
    $('g2h').textContent = 'Langkah 2 · Grup tujuan';
    $('gWho').textContent = ''; $('gWho').appendChild(h('mark', '', '…'));
    p1.setItems(step.candidates.map(function (id) { return { id: id, label: labelOf(id), weight: 1 }; }));
    p2.setItems(groupItems2(step));
  }

  function renderPots() {
    var plan = st.plan, box = $('potPanel'), out = {}, nowId = pending ? pending.person.id : null;
    clear(box);
    for (var i = 0; i < st.planStep; i++) out[plan.steps[i].person.id] = 1;
    plan.pots.forEach(function (p) {
      box.appendChild(h('h3', '', p.name));
      var ul = h('ul');
      p.items.forEach(function (it) {
        var li = h('li', out[it.id] ? 'out' : it.id === nowId ? 'now' : '', it.label);
        li.title = it.label; if (it.label.length > 22) li.tabIndex = 0;
        ul.appendChild(li);
      });
      box.appendChild(ul);
    });
  }

  // kartu satu grup; members = daftar {label, pot}
  function groupCard(gi, members, cap, opt) {
    opt = opt || {};
    var g = st.plan.groups[gi], card = h('div', 'gcard' + (opt.active ? ' active' : '')), hd = h('h3'), ol = h('ol');
    card.style.setProperty('--gc', gcol(gi));
    hd.appendChild(h('span', 'letter', shortName(g.name).slice(0, 3))); hd.appendChild(h('span', '', g.name));
    card.appendChild(hd);
    for (var k = 0; k < cap; k++) {
      var li = h('li'), n = h('span', 'n', String(k + 1)); li.appendChild(n);
      if (k < members.length) {
        var nm = h('span', 'nm', members[k].label); nm.title = members[k].label; li.appendChild(nm);
        if (members[k].pot && st.plan.pots.length > 1) li.appendChild(h('span', 'pt', members[k].pot));
        if (opt.flashIdx === k) li.className = 'flash';
      } else if (k === members.length && opt.pend) { li.className = 'pend'; li.appendChild(h('span', 'slot', opt.pend.person.label + '?')); }
      else { li.className = 'empty'; li.appendChild(h('span', 'dots')); }
      ol.appendChild(li);
    }
    card.appendChild(ol);
    return card;
  }

  function membersOf(gi, upto) {
    var out = [];
    for (var i = 0; i < upto; i++) if (st.plan.steps[i].groupIndex === gi) out.push({ label: st.plan.steps[i].person.label, pot: st.plan.steps[i].potName });
    return out;
  }

  function renderBoard(pend, flashStep) {
    var plan = st.plan, box = $('board'); clear(box);
    plan.groups.forEach(function (g, gi) {
      var mem = membersOf(gi, st.planStep), fi = -1;
      if (flashStep >= 0 && plan.steps[flashStep] && plan.steps[flashStep].groupIndex === gi) fi = mem.length - 1;
      box.appendChild(groupCard(gi, mem, plan.caps[gi], { active: pend && pend.groupIndex === gi, pend: pend && pend.groupIndex === gi ? pend : null, flashIdx: fi }));
    });
  }

  function renderDone() {
    var plan = st.plan, box = $('doneGrid'); clear(box);
    plan.groups.forEach(function (g, gi) {
      var c = groupCard(gi, g.members.map(function (m) { return { label: m.label, pot: m.pot }; }), g.members.length, {});
      c.classList.add('sweep'); c.style.setProperty('--i', gi); box.appendChild(c);
    });
  }

  function skipGroup() { skipping = true; if (p1) p1.skip(); if (p2) p2.skip(); if (flyAnim) flyAnim.finish(); }

  function fly(from, label, toEl) {
    return new Promise(function (resolve) {
      if (reduced() || skipping || !from || !toEl) return resolve();
      var a = from.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      if (!b.width || !a.width) return resolve();
      var el = h('div', 'fly', label);
      el.style.left = a.left + 'px'; el.style.top = a.top + 'px'; el.style.fontSize = getComputedStyle(from).fontSize;
      document.body.appendChild(el);
      var dx = b.left - a.left, dy = b.top - a.top;
      try {
        flyAnim = el.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.5)' }], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
        flyAnim.onfinish = flyAnim.oncancel = function () { el.remove(); flyAnim = null; resolve(); };
      } catch (e) { el.remove(); resolve(); }
    });
  }

  function nextGroup() {
    if (busy || st.screen !== 'group') return;
    var plan = st.plan, step = plan.steps[st.planStep];
    if (!step || !p1) return;
    if (st.tick) ensureAudio();
    var my = ++run; busy = true; pending = null; skipping = false;
    $('btnNext').disabled = true; $('btnGSkip').disabled = false; $('btnGUndo').disabled = true; $('btnBack').disabled = true; $('stepSetup').disabled = true;
    poke();
    var opts = function () { return { speed: st.speed, reducedMotion: reduced() || skipping, sound: st.tick ? sound : null }; };
    $('gWho').textContent = ''; $('gWho').appendChild(h('mark', '', '…'));
    p1.setItems(step.candidates.map(function (id) { return { id: id, label: labelOf(id), weight: 1 }; }));
    p2.setItems(groupItems2(step));
    p1.spin(step.winnerIndex, opts()).then(function (landed) {
      if (my !== run) return null;
      if (landed !== step.winnerIndex) console.error('Roda acak: penyaji langkah 1 berhenti di ' + landed + ', mesin ' + step.winnerIndex + '. Memakai hasil mesin.');
      pending = step; renderPots();
      $('gWho').textContent = ''; $('gWho').appendChild(h('mark', '', step.person.label));
      announce('Terpilih: ' + step.person.label);
      var o2 = opts(); if (!step.groupCandidates) o2.reducedMotion = true;
      return p2.spin(step.groupIndex, o2);
    }).then(function (l2) {
      if (my !== run) return null;
      if (l2 !== step.groupIndex) console.error('Roda acak: penyaji langkah 2 berhenti di ' + l2 + ', mesin ' + step.groupIndex + '. Memakai hasil mesin.');
      renderBoard(step, -1);
      var slot = document.querySelector('#board .gcard.active li.pend .slot');
      return fly($('gWho').firstChild, step.person.label, slot);
    }).then(function () {
      if (my !== run) return;
      sound.done();
      var idx = st.planStep;
      st.planStep++; pending = null; busy = false;
      renderPots(); renderBoard(null, idx); save(); groupIdle();
      announce(step.person.label + ' masuk ' + plan.groups[step.groupIndex].name + '.' + (isDone() ? ' Undian selesai.' : ''));
      poke();
    });
  }

  function undoGroup() {
    if (busy || !st.plan || st.planStep === 0) return;
    destroyPresenters();
    st.planStep--; save(); showScreen();
    announce('Undian terakhir dibatalkan: peserta kembali ke pot.');
  }

  function buildPngCanvas() {
    var plan = st.plan, c = Roda.colors(), cols = Math.min(plan.groups.length, 4), cw = 260, pad = 24, rowsN = Math.ceil(plan.groups.length / cols);
    var maxCap = Math.max.apply(null, plan.caps), ch = 56 + maxCap * 28 + 16;
    var W = pad + cols * (cw + pad), H = 64 + rowsN * (ch + pad), cv = document.createElement('canvas'), ctx;
    cv.width = W; cv.height = H; ctx = cv.getContext('2d');
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c.ink; ctx.font = '800 26px Inter, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Hasil undian grup', pad, 40);
    plan.groups.forEach(function (g, gi) {
      var x = pad + (gi % cols) * (cw + pad), y = 64 + Math.floor(gi / cols) * (ch + pad);
      ctx.fillStyle = c.panel; ctx.strokeStyle = c.lineStrong; ctx.lineWidth = 1.5;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, cw, ch, 14); else ctx.rect(x, y, cw, ch); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.wheel[gi % 8]; ctx.fillRect(x + 1, y + 1, cw - 2, 6);
      ctx.fillStyle = c.ink; ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.fillText(g.name, x + 16, y + 34);
      ctx.font = '15px Inter, system-ui, sans-serif';
      g.members.forEach(function (m, i) {
        ctx.fillStyle = c.muted; ctx.fillText(String(i + 1), x + 16, y + 64 + i * 28);
        ctx.fillStyle = c.ink; ctx.fillText(m.label.length > 26 ? m.label.slice(0, 25) + '…' : m.label, x + 40, y + 64 + i * 28);
      });
    });
    return cv;
  }

  function previewPng() {
    buildPngCanvas().toBlob(function (b) {
      if (!b) return;
      pngBlob = b; pngUrl = URL.createObjectURL(b); $('pngImg').src = pngUrl;
      var d = $('pngDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      $('pngSave').focus();
    });
  }

  // ---------- layar penuh dan keyboard ----------
  function poke() {
    clearTimeout(idleId);
    document.body.classList.remove('idle');
    if (!document.body.classList.contains('fs')) return;
    idleId = setTimeout(function () {
      if (isDone() && st.screen === 'group') return;
      if (document.querySelector('.stage-ctl :focus-visible')) return poke();
      document.body.classList.add('idle');
    }, 3000);
  }
  function activeScreen() { return st.screen === 'group' ? $('screenGroup') : $('screenStage'); }
  function setFs(on) { document.body.classList.toggle('fs', on); window.dispatchEvent(new Event('resize')); poke(); }
  function exitApiFs() { try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* abaikan */ } }
  function exitFs() { setFs(false); exitApiFs(); }
  function toggleFs() {
    if (st.screen === 'setup') return;
    if (document.body.classList.contains('fs')) { exitFs(); return; }
    setFs(true);
    try { var el = activeScreen(); if (el.requestFullscreen) { var p = el.requestFullscreen(); if (p && p.catch) p.catch(function () { /* ditolak: kelas CSS tetap berlaku */ }); } } catch (e) { /* abaikan */ }
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && document.body.classList.contains('fs') && !$('ballDlg').open && !$('pngDlg').open) { exitFs(); return; }
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || $('ballDlg').open || $('pngDlg').open) return;
    if (e.code === 'Space') {
      if (tag === 'BUTTON') return;
      if (st.screen === 'stage') { e.preventDefault(); spin(); }
      else if (st.screen === 'group') { e.preventDefault(); nextGroup(); }
    } else if (e.key === 'f' || e.key === 'F') { if (st.screen !== 'setup') toggleFs(); }
    else if (e.key === 'z' || e.key === 'Z') { if (st.screen === 'stage') undoStage(); else if (st.screen === 'group') undoGroup(); }
  }

  // ---------- mulai ----------
  load();
  buildViews();
  setupEvents();
  showScreen();
  window.RodaApp = { state: st, get session() { return sess; }, get presenter() { return presenter; }, get busy() { return busy; } };
})();
