/* Roda acak: layar, penyimpanan, dan penghubung antara mesin dan penyaji. */
(function () {
  'use strict';
  var E = Roda.engine;
  var KEY = 'sagalait-roda-acak';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  var SAMPLE_LIST = 'Warung Sate Pak Eko\nBakso Mang Ujang\nNasi Padang Sederhana\nMie Ayam Tumini\nSop Buntut Bu Rini\nGudeg Yu Djum\nSoto Betawi\nAyam Geprek Mbak Sari\nPecel Lele Cak Ron';
  var SAMPLE_POTS = '# Pot 1\nElang FC\nHarimau SC\nRajawali United\nBanteng Jaya\n# Pot 2\nKomodo FC\nMacan Tutul\nBadak Perkasa\nCenderawasih SC\n# Pot 3\nWalet Putih\nKasuari FC\nAnoa United\nTapir SC\n# Pot 4\nOrangutan FC\nMaleo SC\nPenyu Hijau\nRusa Timur';
  var VERBS = { roda: ['Putar', 'memutar'], bola: ['Kocok', 'mengocok'], kartu: ['Nyalakan', 'menyalakan'] };

  var st = { text: '', goal: 'urut', view: 'roda', speed: 'normal', remove: true, tick: false, gCount: 4, gNames: [], gFill: 'bergilir',
    seed: '', saved: {}, screen: 'setup', session: null, plan: null, planStep: 0 };
  var sess = null, src = null, presenter = null, p1 = null, p2 = null, busy = false, run = 0, actx = null, pending = null;

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
      if (o.gCount >= 2 && o.gCount <= 16) st.gCount = o.gCount | 0;
      if (Array.isArray(o.gNames)) st.gNames = o.gNames.map(String).slice(0, 16);
      if (o.saved && typeof o.saved === 'object') st.saved = o.saved;
      if (o.session && o.session.all) { sess = E.Session.fromJSON(o.session, newSource()); }
      if (o.plan && o.plan.steps && o.plan.groups && o.plan.pots) { st.plan = o.plan; st.planStep = Math.max(0, Math.min(o.planStep | 0, o.plan.steps.length)); }
    } catch (e) { /* data rusak: mulai bersih */ }
    if (!Roda.presenters[st.view]) st.view = 'roda';
    if (['satu', 'urut', 'grup'].indexOf(st.goal) < 0) st.goal = 'urut';
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

  function groupNames() {
    var out = [];
    for (var i = 0; i < st.gCount; i++) out.push((st.gNames[i] || '').trim() || 'Grup ' + String.fromCharCode(65 + i));
    return out;
  }
  function renderGroupNames() {
    var box = $('gNames'); clear(box);
    for (var i = 0; i < st.gCount; i++) {
      (function (i) {
        var inp = h('input', 'field-sm'); inp.type = 'text'; inp.maxLength = 30; inp.value = st.gNames[i] || ''; inp.placeholder = 'Grup ' + String.fromCharCode(65 + i);
        inp.setAttribute('aria-label', 'Nama grup ' + (i + 1)); inp.style.fontSize = '16px'; inp.style.height = '44px'; inp.style.width = '100%';
        inp.addEventListener('input', function () { st.gNames[i] = inp.value; save(); });
        box.appendChild(inp);
      })(i);
    }
  }

  function syncControls() {
    $('list').value = st.text;
    document.querySelectorAll('input[name=goal]').forEach(function (r) { r.checked = r.value === st.goal; });
    document.querySelectorAll('input[name=view]').forEach(function (r) { r.checked = r.value === st.view; });
    document.querySelectorAll('input[name=speed]').forEach(function (r) { r.checked = r.value === st.speed; });
    $('swRemove').checked = st.remove; $('swTick').checked = st.tick; $('seed').value = st.seed;
    $('gCount').value = st.gCount; $('gFill').value = st.gFill;
    renderGroupNames(); renderSaved(); renderSetupInfo();
  }

  function renderSetupInfo() {
    var grup = st.goal === 'grup';
    $('grpOpts').hidden = !grup;
    $('rowRemove').hidden = st.goal !== 'urut';
    var warn = $('listWarn'); clear(warn);
    function note(text, cls, extra) { var d = h('div', 'issue ' + (cls || 'warning')); d.appendChild(h('p', '', text)); if (extra) d.appendChild(extra); warn.appendChild(d); }
    if (grup) {
      var pp = E.parsePots(st.text), n = 0;
      pp.pots.forEach(function (p) { n += p.items.length; });
      $('count').textContent = n + ' peserta, ' + pp.pots.length + ' pot';
      if (pp.over) note('Hanya ' + E.MAX_ITEMS + ' peserta pertama yang dipakai.');
      if (n && n < st.gCount) note('Peserta (' + n + ') lebih sedikit dari jumlah grup (' + st.gCount + '). Kurangi jumlah grup atau tambah peserta.');
      else if (n) {
        try { var w = E.groupPlan(pp.pots, { G: st.gCount, fill: st.gFill }, E.seededSource('cek')).warnings; w.forEach(function (t) { note(t, 'info'); }); } catch (e) { /* diabaikan di sini */ }
      }
      $('listHint').textContent = 'Satu peserta per baris. Mulai pot dengan baris judul berawalan # (misalnya # Pot 1).';
      $('btnDedupe').hidden = true;
      return;
    }
    $('btnDedupe').hidden = false;
    var hint = $('listHint'); clear(hint);
    hint.appendChild(document.createTextNode('Tulis satu pilihan per baris. Tambah '));
    hint.appendChild(h('code', '', 'x3'));
    hint.appendChild(document.createTextNode(' di belakang nama agar peluangnya tiga kali lipat.'));
    var p = E.parseList(st.text);
    $('count').textContent = p.items.length + ' pilihan';
    if (p.over) note('Hanya ' + E.MAX_ITEMS + ' pilihan pertama yang dipakai. Kurangi daftar agar semuanya ikut.');
    if (p.duplicates.length) note('Ada nama yang sama: ' + p.duplicates.slice(0, 5).join(', ') + (p.duplicates.length > 5 ? ', ...' : '') + '. Tiap baris tetap dihitung sebagai pilihan sendiri. Klik Hapus duplikat bila tidak diinginkan.');
  }

  function renderSaved() {
    var sel = $('savedSel'), names = Object.keys(st.saved); clear(sel);
    if (!names.length) { var o = h('option', '', '(belum ada)'); o.value = ''; sel.appendChild(o); return; }
    names.forEach(function (n) { var o = h('option', '', n); o.value = n; sel.appendChild(o); });
  }

  function setupEvents() {
    $('list').addEventListener('input', function () { st.text = $('list').value; renderSetupInfo(); save(); });
    document.querySelectorAll('input[name=goal],input[name=view],input[name=speed]').forEach(function (r) {
      r.addEventListener('change', function () { st[r.name] = r.value; if (r.name === 'goal') renderSetupInfo(); save(); });
    });
    $('swRemove').addEventListener('change', function () { st.remove = $('swRemove').checked; save(); });
    $('swTick').addEventListener('change', function () { st.tick = $('swTick').checked; if (st.tick) ensureAudio(); save(); });
    $('seed').addEventListener('input', function () { st.seed = $('seed').value.trim(); save(); });
    $('btnSeedNew').addEventListener('click', function () {
      var b = new Uint32Array(2); crypto.getRandomValues(b); st.seed = (b[0].toString(36) + b[1].toString(36)).slice(0, 10); $('seed').value = st.seed; save();
    });
    $('btnSeedCopy').addEventListener('click', function () { if (st.seed) copy(st.seed, $('btnSeedCopy')); });
    $('gCount').addEventListener('change', function () {
      var n = Math.max(2, Math.min(16, parseInt($('gCount').value, 10) || 2)); st.gCount = n; $('gCount').value = n; renderGroupNames(); renderSetupInfo(); save();
    });
    $('gFill').addEventListener('change', function () { st.gFill = $('gFill').value; renderSetupInfo(); save(); });
    $('btnSample').addEventListener('click', function () { st.text = st.goal === 'grup' ? SAMPLE_POTS : SAMPLE_LIST; $('list').value = st.text; renderSetupInfo(); save(); });
    $('btnClear').addEventListener('click', function () { st.text = ''; $('list').value = ''; renderSetupInfo(); save(); $('list').focus(); });
    $('btnDedupe').addEventListener('click', function () {
      var items = E.dedupe(E.parseList(st.text).items);
      st.text = items.map(function (i) { return i.label + (i.weight > 1 ? ' x' + i.weight : ''); }).join('\n'); $('list').value = st.text; renderSetupInfo(); save();
    });
    $('btnSave').addEventListener('click', function () {
      var n = $('saveName').value.trim(), m = $('saveMsg');
      if (!n) { m.textContent = 'Isi nama daftar dulu.'; return; }
      if (!st.text.trim()) { m.textContent = 'Daftar masih kosong, belum ada yang disimpan.'; return; }
      st.saved[n] = st.text; renderSaved(); $('savedSel').value = n; m.textContent = 'Daftar "' + n + '" tersimpan di browser ini.'; save();
    });
    $('btnLoad').addEventListener('click', function () {
      var n = $('savedSel').value; if (!n || !(n in st.saved)) { $('saveMsg').textContent = 'Belum ada daftar tersimpan.'; return; }
      st.text = st.saved[n]; $('list').value = st.text; renderSetupInfo(); $('saveMsg').textContent = 'Daftar "' + n + '" dimuat.'; save();
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
    $('btnFsExit').addEventListener('click', function () { setFs(false); exitApiFs(); });
    $('btnGFsExit').addEventListener('click', function () { setFs(false); exitApiFs(); });
    $('btnSpin').addEventListener('click', spin);
    $('btnSkip').addEventListener('click', function () { if (presenter) presenter.skip(); });
    $('btnNext').addEventListener('click', nextGroup);
    $('btnGSkip').addEventListener('click', function () { if (p1) p1.skip(); if (p2) p2.skip(); });
    $('btnGCopy').addEventListener('click', function () { copy(E.formatGroups(st.plan), $('btnGCopy')); });
    $('btnGTxt').addEventListener('click', function () { download('undian-grup.txt', new Blob([E.formatGroups(st.plan) + '\n'], { type: 'text/plain;charset=utf-8' })); });
    $('btnGPng').addEventListener('click', savePng);
    $('btnGAgain').addEventListener('click', function () { if (!busy) newPlan(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) setFs(false); });
  }

  // ---------- navigasi layar ----------
  function start() {
    var w = $('listWarn');
    function fail(t) { clear(w); var d = h('div', 'issue warning'); d.appendChild(h('p', '', t)); w.appendChild(d); w.scrollIntoView({ block: 'nearest' }); }
    src = newSource();
    if (st.goal === 'grup') {
      var pp = E.parsePots(st.text), n = 0;
      pp.pots.forEach(function (p) { n += p.items.length; });
      if (!n) return fail('Daftar peserta masih kosong. Tulis satu peserta per baris, atau klik Coba dengan contoh.');
      if (n < st.gCount) return fail('Peserta (' + n + ') lebih sedikit dari jumlah grup (' + st.gCount + '). Kurangi jumlah grup atau tambah peserta.');
      st.plan = null; sess = null; newPlan(pp.pots, true);
      st.screen = 'group';
    } else {
      var pl = E.parseList(st.text);
      if (!pl.items.length) return fail('Daftar masih kosong. Tulis satu pilihan per baris, atau klik Coba dengan contoh.');
      sess = new E.Session(pl.items, src); st.plan = null; st.screen = 'stage';
    }
    save(); showScreen();
  }

  function goScreen(s) {
    if (busy) return;
    if (s === 'stage' && !sess) return;
    if (s === 'group' && !st.plan) return;
    st.screen = s; save(); showScreen();
  }

  function destroyPresenters() {
    run++; busy = false;
    [presenter, p1, p2].forEach(function (p) { if (p) p.destroy(); });
    presenter = p1 = p2 = null;
    clear($('stageView')); clear($('g1view')); clear($('g2view'));
  }

  function showScreen() {
    destroyPresenters();
    var s = st.screen;
    $('screenSetup').hidden = s !== 'setup'; $('screenStage').hidden = s !== 'stage'; $('screenGroup').hidden = s !== 'group';
    $('stageActions').hidden = s === 'setup';
    $('stepSetup').setAttribute('aria-current', s === 'setup' ? 'step' : 'false');
    $('stepStage').setAttribute('aria-current', s === 'setup' ? 'false' : 'step');
    $('stepStage').disabled = !(sess || st.plan);
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
    $('btnSpin').textContent = v[0];
    presenter = P.create($('stageView'), { onActivate: spin, hubLabel: v[0] });
    refreshDisplay(); renderResults(); updateStageText();
    $('btnSpin').disabled = !sess.remaining.length;
  }

  function updateStageText() {
    var v = VERBS[st.view] || VERBS.roda, n = sess.all.length;
    if (!sess.remaining.length && st.goal === 'urut') {
      $('lead').textContent = 'Semua pilihan sudah keluar.'; $('stageCap').textContent = 'Semua pilihan sudah keluar. Reset semua untuk mulai lagi.'; return;
    }
    $('lead').textContent = (st.goal === 'urut' ? 'Putaran ' + (sess.results.length + 1) + ' dari ' + n + '. ' : '') + 'Spasi untuk ' + v[1] + '.';
    $('stageCap').textContent = st.goal === 'urut' ? (st.remove ? 'Pemenang keluar dari ' + (st.view === 'bola' ? 'tabung' : 'roda') + ' · tersisa ' + sess.remaining.length + ' dari ' + n : 'Pemenang tetap di daftar') : n + ' pilihan';
  }

  function setBusy(b) {
    busy = b;
    $('btnSpin').disabled = b || !sess.remaining.length; $('btnSkip').disabled = !b;
    $('btnBack').disabled = b; $('stepSetup').disabled = b;
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

  function renderResults() {
    var box = $('resPanel'); clear(box);
    var last = sess.results.length ? sess.results[sess.results.length - 1] : null, n = sess.all.length;
    var tag = h('div', 'small muted', 'Terpilih'); box.appendChild(tag);
    var big = h('p', 'out-big'), m = h('mark', '', last ? last.item.label : 'Belum ada'); big.appendChild(m); box.appendChild(big);
    if (st.goal === 'satu') {
      var hd = h('div', 'res-h'); hd.appendChild(h('b', '', 'Riwayat')); hd.appendChild(h('span', 'muted', '5 terakhir')); box.appendChild(hd);
      var ul = h('ul', 'res-list');
      var rec = sess.results.slice(-5).reverse();
      if (!rec.length) ul.appendChild(h('li', 'muted', 'Belum ada riwayat.'));
      rec.forEach(function (r, i) { var li = h('li'); li.appendChild(h('span', '', r.item.label)); ul.appendChild(li); });
      box.appendChild(ul);
      var bt = h('div', 'res-btns'), c = h('button', 'btn', 'Hapus riwayat'); c.type = 'button';
      c.addEventListener('click', function () { if (busy) return; sess.results = []; renderResults(); save(); });
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
    ol.style.listStyle = 'none'; box.appendChild(ol);
    var where = st.view === 'bola' ? 'Masih di tabung' : st.view === 'kartu' ? 'Belum terpilih' : 'Masih di roda';
    box.appendChild(h('div', 'res-h', '')).appendChild(h('b', '', where));
    var chips = h('div', 'chips');
    sess.remaining.forEach(function (i) { chips.appendChild(h('span', 'chip', i.label)); });
    box.appendChild(chips);
    var bt2 = h('div', 'res-btns');
    function btn(t, fn) { var b = h('button', 'btn', t); b.type = 'button'; b.addEventListener('click', function () { if (!busy) fn(b); }); bt2.appendChild(b); return b; }
    btn('Batalkan terakhir', function () { if (sess.undo()) { refreshDisplay(); renderResults(); updateStageText(); $('btnSpin').disabled = false; save(); announce('Pilihan terakhir dibatalkan.'); } });
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
    var plan = E.groupPlan(pots, { G: st.gCount, fill: st.gFill, names: groupNames() }, src);
    plan.pots = pots; st.plan = plan; st.planStep = 0;
    save();
    if (!silent) { showScreen(); announce('Undian diacak ulang.'); }
  }

  function labelOf(id) {
    var out = id;
    st.plan.pots.forEach(function (p) { p.items.forEach(function (i) { if (i.id === id) out = i.label; }); });
    return out;
  }

  function buildGroup() {
    var plan = st.plan, P = Roda.presenters[st.view];
    p1 = P.create($('g1view'), { onActivate: nextGroup, hubLabel: 'Undi', maxSize: 300 });
    p2 = null;
    $('g2box').hidden = false;
    $('lead').textContent = { bergilir: 'Bergilir', penuh: 'Isi penuh dulu', diundi: 'Grup ikut diundi' }[plan.fill] + ' · ' + plan.groups.length + ' grup · ' + plan.pots.length + ' pot · spasi untuk undi berikutnya.';
    if (plan.fill === 'diundi') p2 = P.create($('g2view'), { onActivate: nextGroup, hubLabel: 'Undi', maxSize: 240 });
    groupIdle(); renderPots(); renderBoard(null);
  }

  function groupIdle() {
    var plan = st.plan, done = st.planStep >= plan.steps.length;
    $('btnNext').disabled = done; $('btnNext').textContent = done ? 'Undian selesai' : 'Undi berikutnya (Spasi)';
    $('finalBtns').hidden = !done; $('btnGSkip').disabled = true;
    $('btnBack').disabled = false; $('stepSetup').disabled = false;
    var step = plan.steps[st.planStep];
    if (step) {
      $('g1h').textContent = 'Langkah 1 · Peserta dari ' + step.potName;
      p1.setItems(step.candidates.map(function (id) { return { id: id, label: labelOf(id), weight: 1 }; }));
      if (p2) { $('g2h').textContent = 'Langkah 2 · Grup tujuan'; p2.setItems(step.groupCandidates.map(function (g) { return { id: 'g' + g, label: plan.groups[g].name, weight: 1 }; })); }
      else { $('g2h').textContent = 'Langkah 2 · Grup tujuan'; staticBoxes(-1); }
      $('gCap').textContent = 'Undian ' + (st.planStep + 1) + ' dari ' + plan.steps.length;
    } else {
      $('g1h').textContent = 'Undian selesai'; clear($('g1view')); clear($('g2view')); $('g2h').textContent = ''; $('g2box').hidden = true;
      if (p1) { p1.destroy(); p1 = null; } if (p2) { p2.destroy(); p2 = null; }
      $('gCap').textContent = 'Semua ' + plan.steps.length + ' peserta sudah dapat grup.';
    }
  }

  function staticBoxes(on) {
    var box = $('g2view'); clear(box);
    var row = h('div', 'gboxes');
    st.plan.groups.forEach(function (g, i) { row.appendChild(h('div', 'gbox' + (i === on ? ' on' : ''), g.name.replace(/^Grup\s+/i, ''))); });
    row.setAttribute('role', 'img'); row.setAttribute('aria-label', on >= 0 ? 'Grup tujuan: ' + st.plan.groups[on].name : 'Daftar grup');
    box.appendChild(row);
  }

  function renderPots() {
    var plan = st.plan, box = $('potPanel'), out = {}, nowId = pending ? pending.person.id : null;
    clear(box);
    for (var i = 0; i < st.planStep; i++) out[plan.steps[i].person.id] = 1;
    plan.pots.forEach(function (p) {
      box.appendChild(h('h3', '', p.name));
      var ul = h('ul');
      p.items.forEach(function (it) { ul.appendChild(h('li', out[it.id] ? 'out' : it.id === nowId ? 'now' : '', it.label)); });
      box.appendChild(ul);
    });
  }

  function renderBoard(pend) {
    var plan = st.plan, box = $('board'); clear(box);
    plan.groups.forEach(function (g, gi) {
      var card = h('div', 'gcard' + (pend && pend.groupIndex === gi ? ' active' : '')), ol = h('ol');
      card.appendChild(h('h3', '', g.name));
      var shown = [];
      for (var i = 0; i < st.planStep; i++) if (plan.steps[i].groupIndex === gi) shown.push(plan.steps[i].person.label);
      for (var k = 0; k < plan.caps[gi]; k++) {
        var li = h('li'), n = h('span', 'n', String(k + 1));
        li.appendChild(n);
        if (k < shown.length) li.appendChild(h('span', '', shown[k]));
        else if (k === shown.length && pend && pend.groupIndex === gi) { li.className = 'pend'; li.appendChild(h('span', 'slot', pend.person.label + '?')); }
        else { li.className = 'empty'; li.appendChild(h('span', 'dots')); }
        ol.appendChild(li);
      }
      card.appendChild(ol); box.appendChild(card);
    });
  }

  function nextGroup() {
    if (busy || st.screen !== 'group') return;
    var plan = st.plan, step = plan.steps[st.planStep];
    if (!step) return;
    if (st.tick) ensureAudio();
    var my = ++run; busy = true; pending = null;
    $('btnNext').disabled = true; $('btnGSkip').disabled = false; $('btnBack').disabled = true; $('stepSetup').disabled = true;
    var opts = { speed: st.speed, reducedMotion: reduced(), sound: st.tick ? sound : null };
    p1.setItems(step.candidates.map(function (id) { return { id: id, label: labelOf(id), weight: 1 }; }));
    p1.spin(step.winnerIndex, opts).then(function (landed) {
      if (my !== run) return null;
      if (landed !== step.winnerIndex) console.error('Roda acak: penyaji langkah 1 berhenti di ' + landed + ', mesin ' + step.winnerIndex + '. Memakai hasil mesin.');
      pending = step; renderPots();
      if (!p2) { staticBoxes(step.groupIndex); renderBoard(step); return null; }
      p2.setItems(step.groupCandidates.map(function (g) { return { id: 'g' + g, label: plan.groups[g].name, weight: 1 }; }));
      var wi = step.groupCandidates.indexOf(step.groupIndex);
      return p2.spin(wi, opts).then(function (l2) {
        if (my === run && l2 !== wi) console.error('Roda acak: penyaji langkah 2 berhenti di ' + l2 + ', mesin ' + wi + '. Memakai hasil mesin.');
        renderBoard(step);
      });
    }).then(function () {
      if (my !== run) return;
      sound.done();
      st.planStep++; pending = null; busy = false;
      renderPots(); renderBoard(null); save(); groupIdle();
      announce(step.person.label + ' masuk ' + plan.groups[step.groupIndex].name + '.' + (st.planStep >= plan.steps.length ? ' Undian selesai.' : ''));
    });
  }

  function savePng() {
    var plan = st.plan, c = Roda.colors(), cols = Math.min(plan.groups.length, 4), cw = 260, pad = 24, rowsN = Math.ceil(plan.groups.length / cols);
    var maxCap = Math.max.apply(null, plan.caps), ch = 56 + maxCap * 28 + 16;
    var W = pad + cols * (cw + pad), H = 64 + rowsN * (ch + pad), cv = document.createElement('canvas'), ctx;
    cv.width = W; cv.height = H; ctx = cv.getContext('2d');
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = c.ink; ctx.font = '800 26px Inter, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillText('Undian grup', pad, 40);
    plan.groups.forEach(function (g, gi) {
      var x = pad + (gi % cols) * (cw + pad), y = 64 + Math.floor(gi / cols) * (ch + pad);
      ctx.fillStyle = c.panel; ctx.strokeStyle = c.lineStrong; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, cw, ch, 14) : ctx.rect(x, y, cw, ch); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.ink; ctx.font = '700 18px Inter, system-ui, sans-serif'; ctx.fillText(g.name, x + 16, y + 32);
      ctx.font = '15px Inter, system-ui, sans-serif';
      g.members.forEach(function (m, i) {
        ctx.fillStyle = c.muted; ctx.fillText(String(i + 1), x + 16, y + 62 + i * 28);
        ctx.fillStyle = c.ink; ctx.fillText(m.label.length > 26 ? m.label.slice(0, 25) + '…' : m.label, x + 40, y + 62 + i * 28);
      });
    });
    cv.toBlob(function (b) { if (b) download('undian-grup.png', b); });
  }

  // ---------- layar penuh dan keyboard ----------
  function setFs(on) { document.body.classList.toggle('fs', on); window.dispatchEvent(new Event('resize')); }
  function exitApiFs() { try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* abaikan */ } }
  function toggleFs() {
    var on = !document.body.classList.contains('fs');
    setFs(on);
    try { if (on && document.documentElement.requestFullscreen) { var p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(function () { /* ditolak: kelas CSS tetap berlaku */ }); } } catch (e) { /* abaikan */ }
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && document.body.classList.contains('fs')) { setFs(false); return; }
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || $('ballDlg').open) return;
    if (e.code === 'Space') {
      if (st.screen === 'stage') { e.preventDefault(); spin(); }
      else if (st.screen === 'group') { e.preventDefault(); nextGroup(); }
    }
  }

  // ---------- mulai ----------
  load();
  buildViews();
  setupEvents();
  showScreen();
  window.RodaApp = { state: st, get session() { return sess; }, get presenter() { return presenter; }, get busy() { return busy; } };
})();
