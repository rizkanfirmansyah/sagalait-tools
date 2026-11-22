/* Tampilan Ketik cepat. Aturan dan rumus di ketik.js, penggambar grafik di grafik.js, daftar kata di kata-id.js dan kata-en.js.
   Yang disimpan di browser ini: pengaturan, rekor per kombinasi, dan 100 tes terakhir. Tidak ada yang dikirim ke mana pun. */
(function () {
  'use strict';
  var K = window.Ketik, G = window.KetikGrafik, I = window.SagalaI18n, KEY = 'sagalait-ketik-cepat';
  var LISTS = { id: window.KATA_ID, en: window.KATA_EN };
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function now() { return performance.now(); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = $('kcRoot'), inp = $('kcIn'), inner = $('kcInner'), stage = $('kcStage'), html = document.documentElement;

  /* ---------- penyimpanan ---------- */
  var store;
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      var ok = K.sanitizeStore(raw); if (ok) return ok;
      var e = K.emptyStore(); if (raw && typeof raw === 'object') e.settings = K.cleanSettings(raw.settings); return e;
    } catch (err) { return K.emptyStore(); }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (err) { /* mode privat */ } }
  store = load();
  var S = store.settings;
  function uiLang() { return I.lang === 'en' ? 'en' : 'id'; }
  function wlang() { return S.lang || uiLang(); }

  /* ---------- keadaan tes ---------- */
  var state = null, zen = null, spec = null, wEls = [], running = false, paused = false, pausedAt = 0, timer = 0, composing = false, view = 'test', lastResult = null;

  function toast(msg) {
    var old = document.querySelector('.ui-toast'); if (old) old.remove();
    var n = el('div', 'ui-toast', msg); n.setAttribute('role', 'status'); document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 2400);
  }
  function announce(msg) { var a = $('kcAnn'); a.textContent = ''; setTimeout(function () { a.textContent = msg; }, 30); }

  /* ---------- pembuatan tes ---------- */
  function listFor() { return LISTS[wlang()]; }
  function genWords(n) { return K.makeWords(listFor(), n, { punct: S.punct, numbers: S.nums, rng: spec.rng }); }
  function newTest(same) {
    stopTimer(); running = false; paused = false; lastResult = null; setFocusMode(false);
    showView('test');
    if (S.mode === 'zen') {
      state = null; zen = K.zenCreate(); spec = spec || {};
      renderZen(); updateLive(); mirror(); $('kcTarget').textContent = ''; return;
    }
    zen = null;
    if (!same || !spec || !spec.words) {
      var seed = (Math.random() * 4294967296) >>> 0; spec = { rng: K.seedRng(seed), words: null };
      spec.words = genWords(S.mode === 'time' ? 100 : S.words);
    }
    state = K.create(spec.words, { mode: S.mode, durationMs: S.time * 1000, stopOnError: S.stopOnError, noBack: S.noBack });
    renderWords(); updateLive(); mirror();
    $('kcTarget').textContent = spec.words.slice(0, 60).join(' ');
  }

  /* ---------- gambar kata ---------- */
  var caret = el('span', 'kc-caret'); caret.setAttribute('aria-hidden', 'true');
  function renderWords() {
    inner.textContent = ''; wEls = [];
    var frag = document.createDocumentFragment();
    state.words.forEach(function (w, i) { var s = el('span', 'kc-w'); s.setAttribute('data-i', i); for (var j = 0; j < w.length; j++) s.appendChild(el('span', 'kc-l', w.charAt(j))); wEls.push(s); frag.appendChild(s); frag.appendChild(document.createTextNode(' ')); });
    inner.appendChild(frag); inner.appendChild(caret); inner.style.transform = '';
    for (var i = 0; i < 3 && i < wEls.length; i++) updateWord(i);
    placeCaret();
  }
  function appendWords(more) {
    K.extend(state, more); spec.words = spec.words.concat(more);
    var start = wEls.length;
    more.forEach(function (w, k) { var s = el('span', 'kc-w'); s.setAttribute('data-i', start + k); for (var j = 0; j < w.length; j++) s.appendChild(el('span', 'kc-l', w.charAt(j))); wEls.push(s); inner.insertBefore(s, caret); inner.insertBefore(document.createTextNode(' '), caret); });
  }
  function updateWord(i) {
    var w = state.words[i], ty = state.typed[i] || '', e = wEls[i]; if (!e) return;
    var done = i < state.idx, blind = S.blind;
    while (e.children.length > w.length) e.removeChild(e.lastChild);
    for (var j = 0; j < w.length; j++) {
      var c = e.children[j], cls = 'kc-l';
      if (j < ty.length) cls += blind ? ' typed' : (ty.charAt(j) === w.charAt(j) ? ' ok' : ' bad');
      else if (done && !blind) cls += ' miss';
      if (c.className !== cls) c.className = cls;
    }
    for (var k = w.length; k < ty.length; k++) {
      var x = e.children[k]; if (!x) { x = el('span', 'kc-l', ty.charAt(k)); e.appendChild(x); }
      x.className = 'kc-l ' + (blind ? 'typed' : 'extra'); x.textContent = ty.charAt(k);
    }
    e.classList.toggle('kc-wbad', done && !blind && ty !== w);
  }
  function placeCaret() {
    var e, left, top, lh;
    if (zen) { e = inner.querySelector('.kc-zend'); if (!e) return; left = e.offsetLeft; top = e.offsetTop; lh = e.offsetHeight || 1; setCaret(left, top, lh); scrollTo(top, lh); return; }
    if (!state) return;
    e = wEls[state.idx]; if (!e) return;
    var ty = state.typed[state.idx] || '', w = state.words[state.idx], idx = ty.length, ch;
    if (idx < e.children.length) { ch = e.children[idx]; left = ch.offsetLeft; } else { ch = e.children[e.children.length - 1]; left = ch ? ch.offsetLeft + ch.offsetWidth : e.offsetLeft; }
    lh = e.offsetHeight; top = e.offsetTop; setCaret(left, top, lh); scrollTo(top, lh);
    void w;
  }
  function setCaret(left, top, lh) {
    var h = caret.offsetHeight || lh * 0.7;
    caret.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top + (lh - h) / 2) + 'px)';
  }
  function scrollTo(top, lh) {
    var row = Math.round(top / lh), shift = Math.max(0, row - 1) * lh; inner.style.transform = shift ? 'translateY(' + (-shift) + 'px)' : '';
  }
  function renderZen() {
    inner.textContent = ''; wEls = [];
    var txt = el('span', 'kc-zt', zen.text); inner.appendChild(txt);
    var end = el('span', 'kc-zend', '​'); inner.appendChild(end); inner.appendChild(caret);
    if (!zen.text) { var ph = el('span', 'kc-ph', t('zen_ph')); ph.id = 'kcPh'; inner.insertBefore(ph, txt); }
    placeCaret();
  }

  /* ---------- masukan ---------- */
  function activeTyped() { return zen ? K.zenToken(zen) : (state ? state.typed[state.idx] || '' : ''); }
  function mirror() { inp.value = ' ' + activeTyped(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* abaikan */ } }
  var ac = null;
  function click() {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 700 + Math.random() * 120;
      g.gain.setValueAtTime(0.04, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.05);
    } catch (e) { /* tanpa audio */ }
  }
  function beginRun() {
    if (!focusOn) setFocusMode(true); /* mouse yang bergerak mematikan mode fokus, ketikan berikutnya menyalakannya lagi */
    if (running) return;
    running = true; startTimer();
  }
  function doType(ch) {
    if (view !== 'test' || paused) return;
    if (zen) {
      var zr = K.zenType(zen, ch, now()); if (zr === 'ignored' || zr === 'done') return;
      beginRun(); renderZen(); updateLive(); click(); return;
    }
    if (!state || state.done) return;
    var before = state.idx, r = K.type(state, ch, now());
    if (r === 'done') { finishTest(); return; }
    if (r === 'ignored' && state.start === null) return;
    if (state.start !== null) beginRun();
    updateWord(before); if (state.idx !== before) updateWord(state.idx);
    if (S.mode === 'time' && state.idx > state.words.length - 40) appendWords(genWords(50));
    placeCaret(); updateLive(); click();
    if (r === 'finish') finishTest();
  }
  function doBack(ctrl) {
    if (view !== 'test' || paused) return;
    if (zen) { if (K.zenBack(zen, ctrl) === 'del') { renderZen(); updateLive(); } return; }
    if (!state || state.done) return;
    var before = state.idx, r = K.back(state, ctrl); if (r === 'ignored') return;
    updateWord(before); if (state.idx !== before) updateWord(state.idx);
    placeCaret();
  }
  function handleInput() {
    var v = inp.value, cur = activeTyped();
    if (v.length === 0) doBack(false);
    else {
      var nv = v.charAt(0) === ' ' ? v.slice(1) : v;
      if (nv.length >= cur.length && nv.indexOf(cur) === 0) Array.from(nv.slice(cur.length)).forEach(doType);
      else if (cur.length > nv.length && cur.indexOf(nv) === 0) for (var i = 0, n = Array.from(cur).length - Array.from(nv).length; i < n; i++) doBack(false);
    }
    if (!composing) mirror();
  }
  inp.addEventListener('beforeinput', function (e) { if (/^(insertFromPaste|insertFromDrop|insertLineBreak|insertParagraph|historyUndo|historyRedo)/.test(e.inputType)) e.preventDefault(); });
  inp.addEventListener('input', function () { if (!composing) handleInput(); });
  inp.addEventListener('compositionstart', function () { composing = true; });
  inp.addEventListener('compositionend', function () { composing = false; handleInput(); });
  inp.addEventListener('paste', function (e) { e.preventDefault(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); $('btnRestart').focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey && zen && running) finishZen(); return; }
    if (e.key === 'Backspace' && (e.ctrlKey || e.altKey || e.metaKey)) { e.preventDefault(); doBack(true); mirror(); return; }
    if (/^(Arrow(Left|Right|Up|Down)|Home|End|Delete|PageUp|PageDown)$/.test(e.key)) e.preventDefault();
  });
  inp.addEventListener('focus', function () { stage.classList.remove('kc-unfocus'); if (matchMedia('(hover: none)').matches) stage.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); });
  inp.addEventListener('blur', function () { if (view === 'test') stage.classList.add('kc-unfocus'); });
  stage.addEventListener('click', function () { if (!paused) inp.focus(); });

  /* ---------- jam dan angka hidup ---------- */
  function startTimer() { stopTimer(); timer = setInterval(tick, 100); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }
  function tick() {
    if (!running || paused) return;
    if (state && S.mode === 'time' && state.start !== null && now() - state.start >= state.o.durationMs) { K.finish(state, state.start + state.o.durationMs); finishTest(); return; }
    updateLive();
  }
  function fmtSec(ms) { return Math.max(0, Math.ceil(ms / 1000)); }
  function updateLive() {
    var main = $('lvMain'), w = $('lvWpm'), a = $('lvAcc'), show = S.live;
    main.hidden = show === 'none'; w.hidden = a.hidden = show !== 'full' || !!zen;
    if (zen) { var zr = K.zenResult(zen); main.textContent = t('live_secs', { n: Math.floor((zen.start === null ? 0 : now() - zen.start) / 1000) }) + ' · ' + zr.words; return; }
    if (!state) return;
    if (S.mode === 'time') main.textContent = t('live_secs', { n: fmtSec(state.o.durationMs - (state.start === null ? 0 : Math.min(state.o.durationMs, now() - state.start))) });
    else main.textContent = t('live_words', { n: Math.min(state.idx, state.words.length), total: state.words.length });
    var r = K.result(state, now()), el1 = state.start === null ? 0 : now() - state.start;
    w.textContent = t('live_wpm', { n: el1 >= 1000 ? Math.round(r.wpm) : 0 });
    a.textContent = S.blind ? '' : t('live_acc', { n: Math.round(r.acc) }); a.hidden = a.hidden || S.blind;
  }

  /* ---------- mode fokus ---------- */
  var focusOn = false, mx = -1, my = -1;
  function setFocusMode(on) { focusOn = on; html.classList.toggle('kc-focus', on); }
  document.addEventListener('mousemove', function (e) {
    if (mx < 0) { mx = e.clientX; my = e.clientY; return; }
    if (Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) > 4) { mx = e.clientX; my = e.clientY; if (focusOn) setFocusMode(false); }
  });

  /* ---------- selesai dan hasil ---------- */
  function modeText() { return S.mode === 'time' ? t('m_time_v', { n: S.time }) : S.mode === 'words' ? t('m_words_v', { n: S.words }) : t('m_zen_v'); }
  function langText() { return t(wlang() === 'id' ? 'lang_id' : 'lang_en'); }
  function finishZen() {
    stopTimer(); K.zenFinish(zen, now()); running = false; setFocusMode(false);
    var r = K.zenResult(zen); lastResult = { zen: true, r: r };
    showResult(); announce(t('ann_zen', { words: r.words, chars: r.chars }));
  }
  function finishTest() {
    stopTimer(); running = false; setFocusMode(false);
    var r = K.result(state), isRec = false;
    var e = { at: Date.now(), mode: S.mode, amount: S.mode === 'time' ? S.time : S.words, lang: wlang(), punct: S.punct, nums: S.nums, wpm: Math.round(r.wpm * 100) / 100, raw: Math.round(r.raw * 100) / 100, acc: Math.round(r.acc * 100) / 100, cons: Math.round(r.consistency * 100) / 100, ms: Math.round(r.ms) };
    if (r.ms > 0) { isRec = K.addResult(store, e); persist(); }
    lastResult = { zen: false, r: r, e: e, rec: isRec && r.ms > 0 };
    showResult(); announce(t('ann_done', { wpm: Math.round(r.wpm), acc: Math.round(r.acc) }));
  }
  function showResult(keepFocus) {
    var L = lastResult, z = L.zen, r = L.r;
    showView('res');
    ['rBoxWpm', 'rBoxAcc', 'rFig', 'rgRaw', 'rgCons', 'rgChars', 'rgLang'].forEach(function (id) { $(id).hidden = z; });
    ['rBoxWords', 'rBoxChars', 'rZNote'].forEach(function (id) { $(id).hidden = !z; });
    $('btnAgain').hidden = z; $('rRec').hidden = z || !L.rec;
    $('rMode').textContent = modeText(); $('rTime').textContent = t('secs_v', { n: Math.round(r.ms / 100) / 10 });
    if (z) { $('rZWords').textContent = r.words; $('rZChars').textContent = r.chars; }
    else {
      $('rWpm').textContent = Math.round(r.wpm); $('rAcc').textContent = Math.round(r.acc) + '%';
      $('rRaw').textContent = Math.round(r.raw); $('rCons').textContent = Math.round(r.consistency) + '%';
      $('rChars').textContent = r.chars.correct + ' / ' + r.chars.wrong + ' / ' + r.chars.extra + ' / ' + r.chars.missed + ' ';
      $('rLang').textContent = langText();
      drawResultChart(r);
    }
    if (!keepFocus) $('btnNext').focus();
  }
  function drawResultChart(r) {
    var box = $('rChart'); box.textContent = ''; var tb = $('rTbody'); tb.textContent = '';
    var ser = r.series;
    if (!ser.length) { $('rAlt').textContent = t('chart_none'); return; }
    var svg = G.chart(document, { w: 640, h: 240, label: t('chart_label'), xLabels: ser.map(function (x) { return String(x.s); }),
      series: [{ cls: 'kc-s-raw', values: ser.map(function (x) { return x.raw; }) }, { cls: 'kc-s-wpm', values: ser.map(function (x) { return x.wpm; }), dots: ser.length < 4 }],
      marks: ser.map(function (x, i) { return x.err > 0 ? i : -1; }).filter(function (i) { return i >= 0; }) });
    box.appendChild(svg);
    var errs = ser.filter(function (x) { return x.err > 0; }).length;
    $('rAlt').textContent = t('chart_alt', { wpm: Math.round(r.wpm), raw: Math.round(r.raw), errs: errs });
    ser.forEach(function (x) { var tr = el('tr'); [x.s, Math.round(x.wpm), Math.round(x.raw), x.err].forEach(function (v) { tr.appendChild(el('td', '', String(v))); }); tb.appendChild(tr); });
  }
  function shareText() {
    var L = lastResult; if (!L) return '';
    if (L.zen) return t('share_zen', { words: L.r.words, chars: L.r.chars, secs: Math.round(L.r.ms / 100) / 10 });
    return t('share', { wpm: Math.round(L.r.wpm), acc: Math.round(L.r.acc), mode: t(S.mode === 'time' ? 'sm_time' : 'sm_words'), n: S.mode === 'time' ? S.time : S.words, lang: wlang() });
  }
  function download(blob, name) { var u = URL.createObjectURL(blob), a = el('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); }
  function tok(n) { return getComputedStyle(html).getPropertyValue(n).trim(); }
  function drawImage() {
    var L = lastResult; if (!L || L.zen) return;
    var W = 1200, H = 630, cv = el('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d'), font = getComputedStyle(document.body).fontFamily;
    c.fillStyle = tok('--panel'); c.fillRect(0, 0, W, H);
    c.fillStyle = tok('--muted'); c.font = '600 30px ' + font; c.fillText('ketik-cepat', 60, 80);
    c.fillStyle = tok('--ink'); c.font = '800 150px ' + font; c.fillText(String(Math.round(L.r.wpm)), 60, 240);
    c.font = '600 32px ' + font; c.fillStyle = tok('--muted'); c.fillText('wpm', 70, 285);
    c.fillStyle = tok('--ink'); c.font = '800 110px ' + font; c.fillText(Math.round(L.r.acc) + '%', 520, 240);
    c.font = '600 32px ' + font; c.fillStyle = tok('--muted'); c.fillText(t('r_acc').toLowerCase(), 530, 285);
    c.fillText(modeText() + ' · ' + langText() + (L.rec ? ' · ' + t('record') : ''), 60, 340);
    var ser = L.r.series, box = { l: 60, t: 380, w: W - 120, h: 200 };
    if (ser.length) {
      var ymax = G.niceMax(Math.max.apply(null, ser.map(function (x) { return Math.max(x.wpm, x.raw); })));
      [['raw', '--muted'], ['wpm', '--accent']].forEach(function (p) {
        var pts = G.points(ser.map(function (x) { return x[p[0]]; }), box, ymax); c.strokeStyle = tok(p[1]); c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath();
        pts.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke();
      });
    }
    cv.toBlob(function (b) { if (b) { download(b, 'ketik-cepat-hasil.png'); toast(t('toast_dl')); } }, 'image/png');
  }
  $('btnNext').addEventListener('click', function () { newTest(false); inp.focus(); });
  $('btnAgain').addEventListener('click', function () { newTest(true); inp.focus(); });
  $('btnCopy').addEventListener('click', function () {
    var s = shareText();
    (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { toast(t('toast_copy')); }, function () { toast(t('toast_copy_fail')); });
  });
  $('btnDl').addEventListener('click', function () { if (lastResult && lastResult.zen) { download(new Blob([shareText()], { type: 'text/plain' }), 'ketik-cepat-hasil.txt'); toast(t('toast_dl')); } else drawImage(); });
  $('btnRestart').addEventListener('click', function () { newTest(false); inp.focus(); });

  /* ---------- tampilan ---------- */
  function showView(v) {
    view = v;
    $('viewTest').hidden = v !== 'test'; $('viewRes').hidden = v !== 'res'; $('viewStats').hidden = v !== 'stats';
    $('tabTest').setAttribute('aria-pressed', v !== 'stats' ? 'true' : 'false'); $('tabStats').setAttribute('aria-pressed', v === 'stats' ? 'true' : 'false');
    if (v === 'test') { stage.classList.toggle('kc-unfocus', document.activeElement !== inp); placeCaret(); }
  }
  $('tabTest').addEventListener('click', function () { if (view === 'stats') { if (lastResult) showView('res'); else { showView('test'); } } });
  $('tabStats').addEventListener('click', function () { if (running) return; if (view !== 'stats') { showView('stats'); renderStats(); } });

  /* ---------- pengaturan ---------- */
  function applyUI() {
    root.setAttribute('data-size', S.size); root.setAttribute('data-align', S.align); root.setAttribute('data-caret', reduce ? 'off' : S.caret);
    document.querySelector('input[name=mode][value="' + S.mode + '"]').checked = true;
    var vals = S.mode === 'words' ? K.WORDS : K.TIME, inputs = document.querySelectorAll('input[name=amt]');
    inputs.forEach(function (x, i) { x.value = vals[i]; x.nextElementSibling.textContent = vals[i]; x.checked = vals[i] === (S.mode === 'words' ? S.words : S.time); });
    $('segAmt').hidden = S.mode === 'zen'; $('segAmt').setAttribute('aria-label', t(S.mode === 'words' ? 'amt_words_l' : 'amt_time_l'));
    $('chPunct').setAttribute('aria-pressed', S.punct); $('chNums').setAttribute('aria-pressed', S.nums);
    $('chPunct').hidden = $('chNums').hidden = S.mode === 'zen';
    document.querySelector('input[name=wl][value="' + wlang() + '"]').checked = true;
    $('segLang').hidden = S.mode === 'zen';
    $('oStop').checked = S.stopOnError; $('oBlind').checked = S.blind; $('oNoback').checked = S.noBack; $('oSound').checked = S.sound;
    $('oSize').value = S.size; $('oAlign').value = S.align; $('oCaret').value = S.caret; $('oLive').value = S.live;
  }
  function change(fn, restart) { fn(); store.settings = S; persist(); applyUI(); if (restart) newTest(false); else { refreshWords(); updateLive(); } }
  function refreshWords() { if (state) for (var i = 0; i < wEls.length; i++) updateWord(i); placeCaret(); }
  document.querySelectorAll('input[name=mode]').forEach(function (x) { x.addEventListener('change', function () { change(function () { S.mode = x.value; }, true); if (view === 'stats') showView('test'); }); });
  document.querySelectorAll('input[name=amt]').forEach(function (x) { x.addEventListener('change', function () { change(function () { if (S.mode === 'words') S.words = +x.value; else S.time = +x.value; }, true); }); });
  document.querySelectorAll('input[name=wl]').forEach(function (x) { x.addEventListener('change', function () { change(function () { S.lang = x.value; }, true); }); });
  $('chPunct').addEventListener('click', function () { change(function () { S.punct = !S.punct; }, true); });
  $('chNums').addEventListener('click', function () { change(function () { S.nums = !S.nums; }, true); });
  $('oStop').addEventListener('change', function () { change(function () { S.stopOnError = $('oStop').checked; }, true); });
  $('oNoback').addEventListener('change', function () { change(function () { S.noBack = $('oNoback').checked; }, true); });
  $('oBlind').addEventListener('change', function () { change(function () { S.blind = $('oBlind').checked; }, false); });
  $('oSound').addEventListener('change', function () { change(function () { S.sound = $('oSound').checked; }, false); });
  $('oSize').addEventListener('change', function () { change(function () { S.size = +$('oSize').value; }, false); });
  $('oAlign').addEventListener('change', function () { change(function () { S.align = $('oAlign').value; }, false); });
  $('oCaret').addEventListener('change', function () { change(function () { S.caret = $('oCaret').value; }, false); });
  $('oLive').addEventListener('change', function () { change(function () { S.live = $('oLive').value; }, false); });
  $('btnOpts').addEventListener('click', function () { var o = $('kcOpts'); o.hidden = !o.hidden; $('btnOpts').setAttribute('aria-expanded', String(!o.hidden)); });
  window.addEventListener('resize', function () { placeCaret(); });

  /* ---------- tooltip "?" ---------- */
  document.addEventListener('click', function (e) {
    var q = e.target.closest('.kc-q');
    document.querySelectorAll('.kc-tip').forEach(function (tip) { var b = tip.previousElementSibling; if (q && b === q) return; tip.hidden = true; b.setAttribute('aria-expanded', 'false'); });
    if (q) { var tip2 = q.nextElementSibling; tip2.hidden = !tip2.hidden; q.setAttribute('aria-expanded', String(!tip2.hidden)); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.kc-tip').forEach(function (tip) { if (!tip.hidden) { tip.hidden = true; tip.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
  });

  /* ---------- statistik ---------- */
  function fmtDur(ms) { var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0') : m + ':' + String(x).padStart(2, '0'); }
  function comboText(key) {
    var p = key.split('|'); return t('combo', { mode: t(p[0] === 'time' ? 'm_time_v' : 'm_words_v', { n: p[1] }), n: '', lang: t(p[2] === 'id' ? 'lang_id' : 'lang_en'), p: p[3] === '1' ? t('c_punct') : '', nn: p[4] === '1' ? t('c_nums') : '' }).replace(/\s+,/, ',');
  }
  function renderStats() {
    var h = store.history, sm = K.summarize(h);
    $('sTests').textContent = sm.tests; $('sTime').textContent = fmtDur(sm.ms); $('sAvg10').textContent = h.length ? Math.round(sm.avg10 * 10) / 10 : '0'; $('sAvg100').textContent = h.length ? Math.round(sm.avg100 * 10) / 10 : '0';
    var box = $('sChart'); box.textContent = ''; $('sNone').hidden = h.length > 0;
    if (h.length) {
      var vals = h.map(function (x) { return x.wpm; }), mx2 = Math.max.apply(null, vals);
      box.appendChild(G.chart(document, { w: 640, h: 220, label: t('s_chart'), series: [{ cls: 'kc-s-wpm', values: vals, dots: h.length < 30 }], xLabels: h.map(function (x, i) { return String(i + 1); }) }));
      $('sChartAlt').textContent = t('s_chart_alt', { n: h.length, last: Math.round(vals[vals.length - 1]), max: Math.round(mx2) });
    } else $('sChartAlt').textContent = '';
    var body = $('sRecBody'); body.textContent = '';
    var keys = Object.keys(store.records).sort(function (a, b) { return store.records[b].wpm - store.records[a].wpm; });
    $('sRecNone').hidden = keys.length > 0; $('sRecTbl').hidden = keys.length === 0;
    keys.forEach(function (k) {
      var r = store.records[k], tr = el('tr');
      tr.appendChild(el('td', '', comboText(k))); tr.appendChild(el('td', '', String(Math.round(r.wpm * 10) / 10))); tr.appendChild(el('td', '', Math.round(r.acc) + '%'));
      tr.appendChild(el('td', '', new Intl.DateTimeFormat(I.locale, { dateStyle: 'medium' }).format(new Date(r.at)))); body.appendChild(tr);
    });
  }
  $('btnExport').addEventListener('click', function () { download(new Blob([JSON.stringify(store, null, 1)], { type: 'application/json' }), 'ketik-cepat-data.json'); });
  $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
  $('fileImport').addEventListener('change', function () {
    var f = $('fileImport').files[0]; $('fileImport').value = ''; if (!f) return;
    if (f.size > 2e6) { toast(t('imp_bad')); return; }
    f.text().then(function (txt) {
      var data = null; try { data = K.sanitizeStore(JSON.parse(txt)); } catch (e) { data = null; }
      if (!data) { toast(t('imp_bad')); return; }
      store = data; S = store.settings; persist(); applyUI(); renderStats(); toast(t('imp_ok', { n: data.history.length }));
    }, function () { toast(t('imp_bad')); });
  });
  $('btnClear').addEventListener('click', function () { $('dlgClear').showModal(); $('clearNo').focus(); });
  $('clearNo').addEventListener('click', function () { $('dlgClear').close(); });
  $('clearYes').addEventListener('click', function () {
    $('dlgClear').close(); store = K.emptyStore(); S = store.settings; try { localStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
    applyUI(); renderStats(); toast(t('clear_done'));
  });

  /* ---------- palet perintah dan jeda ---------- */
  var pal = $('pal');
  function commands() {
    var go = function (fn) { return function () { fn(); }; };
    return [
      { k: 'c_restart', f: go(function () { newTest(false); }) },
      { k: 'c_again', f: go(function () { newTest(true); }) },
      { k: 'c_time', f: go(function () { change(function () { S.mode = 'time'; }, true); }) },
      { k: 'c_words', f: go(function () { change(function () { S.mode = 'words'; }, true); }) },
      { k: 'c_zen', f: go(function () { change(function () { S.mode = 'zen'; }, true); }) },
      { k: 'c_id', f: go(function () { change(function () { S.lang = 'id'; }, true); }) },
      { k: 'c_en', f: go(function () { change(function () { S.lang = 'en'; }, true); }) },
      { k: 'c_punct_t', f: go(function () { change(function () { S.punct = !S.punct; }, true); }) },
      { k: 'c_nums_t', f: go(function () { change(function () { S.nums = !S.nums; }, true); }) },
      { k: 'c_theme', f: go(function () { document.querySelector('[data-theme-toggle]').click(); }) },
      { k: 'c_opts', f: go(function () { $('btnOpts').click(); }) },
      { k: 'c_stats', f: go(function () { showView('stats'); renderStats(); }) },
      { k: 'c_test', f: go(function () { if (view === 'stats') showView(lastResult ? 'res' : 'test'); }) }
    ];
  }
  function renderPal() {
    var q = $('palQ').value.trim().toLowerCase(), list = $('palList'), n = 0; list.textContent = '';
    commands().forEach(function (c) {
      var label = t(c.k); if (q && label.toLowerCase().indexOf(q) < 0) return;
      var b = el('button', 'btn kc-palbtn', label); b.type = 'button'; b.addEventListener('click', function () { pal.close('run'); c.f(); }); list.appendChild(b); n++;
    });
    $('palNone').hidden = n > 0;
  }
  var palRan = false;
  function openPalette() {
    if (pal.open) return;
    if (running && !paused) { paused = true; pausedAt = now(); stopTimer(); stage.classList.add('kc-unfocus'); $('kcBlurT').textContent = t('paused'); }
    palRan = false; $('palQ').value = ''; renderPal(); pal.showModal(); $('palQ').focus();
  }
  pal.addEventListener('close', function () {
    $('kcBlurT').textContent = t('blur_prompt');
    if (paused) {
      var d = now() - pausedAt; paused = false;
      if (state && running) K.shiftStart(state, d); if (zen && zen.start !== null) { zen.start += d; zen.last += d; }
      if (running) startTimer();
    }
    if (view === 'test') inp.focus();
  });
  $('palQ').addEventListener('input', renderPal);
  $('palQ').addEventListener('keydown', function (e) {
    var bs = $('palList').querySelectorAll('button');
    if (e.key === 'Enter') { e.preventDefault(); if (bs[0]) bs[0].click(); } else if (e.key === 'ArrowDown' && bs[0]) { e.preventDefault(); bs[0].focus(); }
  });
  $('palList').addEventListener('keydown', function (e) {
    var bs = Array.prototype.slice.call($('palList').querySelectorAll('button')), i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); if (bs[i + 1]) bs[i + 1].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) bs[i - 1].focus(); else $('palQ').focus(); }
  });
  $('btnPal').addEventListener('click', openPalette);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); openPalette(); }
  });

  /* ---------- mulai ---------- */
  I.onReady(function () {
    applyUI(); newTest(false);
    if (matchMedia('(hover: hover)').matches) inp.focus();
  });
  document.addEventListener('sagalait:lang', function () {
    applyUI();
    if (S.lang === null && !running && view === 'test') newTest(false);
    else if (lastResult && view === 'res') showResult(true);
    if (view === 'stats') renderStats();
    updateLive(); if (zen && !zen.text) renderZen();
  });
})();
