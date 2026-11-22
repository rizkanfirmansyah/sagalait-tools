/* Tampilan Cek kontras warna. Rumus dan saran di kontras.js. Yang disimpan hanya dua warna terakhir yang sah. */
(function () {
  'use strict';
  var K = window.KontrasLab, I = window.SagalaI18n, KEY = 'sagalait-kontras';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  /* Warna awal diambil dari token tema (aksen di atas panel), bukan hex tertanam; nama dasar jadi cadangan. */
  function tok(n, fallback) { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return K.parseColor(v) ? v : fallback; }
  var S = { fg: tok('--accent', 'navy'), bg: tok('--panel', 'white') };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) ['fg', 'bg'].forEach(function (k) { if (typeof s[k] === 'string' && K.parseColor(s[k])) S[k] = s[k]; });
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* mode privat */ } }

  var cur = { fg: null, bg: null }, last = null;
  function toast(msg) {
    var old = document.querySelector('.ui-toast'); if (old) old.remove();
    var n = el('div', 'ui-toast', msg); n.setAttribute('role', 'status'); document.body.appendChild(n); setTimeout(function () { n.remove(); }, 2200);
  }
  function setVars(node, fg, bg) { node.style.setProperty('--kn-fg', K.toHex(fg)); node.style.setProperty('--kn-bg', K.toHex(bg)); }

  /* ---------- kolom warna ---------- */
  function fmtLine(c) {
    var x = K.toHex(c) + ' · ' + K.toRgbStr(c) + ' · ' + K.toHslStr(c);
    return c.a < 1 ? x + ' · ' + t('alpha', { n: Math.round(c.a * 100) }) : x;
  }
  function readField(k) {
    var txt = $(k).value, c = K.parseColor(txt), bad = txt.trim() === '' || !c;
    $(k).setAttribute('aria-invalid', bad ? 'true' : 'false'); $(k + 'Err').hidden = !bad; $(k + 'Fmt').textContent = bad ? '' : fmtLine(c);
    cur[k] = bad ? null : c;
    if (!bad) { $(k + 'Pick').value = K.toHex(c); S[k] = txt.trim(); }
    return !bad;
  }

  /* ---------- hasil ---------- */
  var LEVELS = [['aaNormal', 'lv_aa_n', 4.5], ['aaLarge', 'lv_aa_l', 3], ['aaaNormal', 'lv_aaa_n', 7], ['aaaLarge', 'lv_aaa_l', 4.5], ['ui', 'lv_ui', 3]];
  var SUG = [[3, 'lv_aa_l'], [4.5, 'lv_aa_n'], [7, 'lv_aaa_n']];
  function render() {
    var ok = cur.fg && cur.bg; $('resNone').hidden = !!ok; $('resBox').hidden = !ok; $('btnCopy').disabled = !ok;
    if (!ok) { last = null; return; }
    var e = K.effective(cur.fg, cur.bg), r = K.ratio(cur.fg, cur.bg), lv = K.levels(r);
    last = { r: r, fg: K.toHex(e.fg), bg: K.toHex(e.bg) };
    setVars($('preview'), e.fg, e.bg); save();
    $('ratio').textContent = K.fmtRatio(r) + ':1';
    $('verdict').textContent = t(lv.aaaNormal ? 'v_aaa' : lv.aaNormal ? 'v_aa' : lv.aaLarge ? 'v_large' : 'v_fail');
    $('verdict').className = 'kn-verdict ' + (lv.aaNormal ? 'is-pass' : lv.aaLarge ? 'is-part' : 'is-fail');
    var ul = $('levels'); ul.textContent = '';
    LEVELS.forEach(function (L) {
      var pass = lv[L[0]], li = el('li', 'kn-lv ' + (pass ? 'is-pass' : 'is-fail'));
      var ic = el('span', 'kn-ic', pass ? '✓' : '✗'); ic.setAttribute('aria-hidden', 'true'); li.appendChild(ic);
      li.appendChild(el('span', 'kn-ln', t(L[1]))); li.appendChild(el('span', 'kn-lm', t('min', { n: L[2] })));
      li.appendChild(el('strong', 'kn-lp', t(pass ? 'pass' : 'fail'))); ul.appendChild(li);
    });
    renderSuggestions(lv);
  }
  function sugRow(kind, s, target) {
    var row = el('div', 'kn-srow'), name = el('span', 'kn-sname', t(kind === 'fg' ? 'sug_fg' : 'sug_bg')); row.appendChild(name);
    if (!s) { row.appendChild(el('span', 'kn-snone small', t('sug_none'))); return row; }
    var hex = K.toHex(s.color), sw = el('span', 'kn-sw', 'Aa'); sw.setAttribute('aria-hidden', 'true');
    var e = K.effective(cur.fg, cur.bg); setVars(sw, kind === 'fg' ? s.color : e.fg, kind === 'fg' ? e.bg : s.color);
    row.appendChild(sw); row.appendChild(el('code', 'kn-shex', hex)); row.appendChild(el('span', 'kn-sratio', t('sug_ratio', { n: K.fmtRatio(s.ratio) })));
    var b = el('button', 'btn btn-sm kn-use', t('sug_use')); b.type = 'button'; b.setAttribute('aria-label', t('sug_use') + ' ' + hex + ' · ' + t(kind === 'fg' ? 'sug_fg' : 'sug_bg'));
    b.addEventListener('click', function () { $(kind).value = hex; $(kind).dispatchEvent(new Event('input', { bubbles: true })); $(kind).focus(); }); row.appendChild(b);
    return row;
  }
  function renderSuggestions(lv) {
    var box = $('sugs'); box.textContent = ''; var shown = 0;
    SUG.forEach(function (x) {
      var pass = x[0] === 3 ? lv.aaLarge : x[0] === 4.5 ? lv.aaNormal : lv.aaaNormal; if (pass) return;
      var sg = K.suggest(cur.fg, cur.bg, x[0]), grp = el('div', 'kn-sgrp'); shown++;
      grp.appendChild(el('h4', 'kn-sh', t('sug_for', { level: t(x[1]), n: x[0] }))); grp.appendChild(sugRow('fg', sg.fg, x[0])); grp.appendChild(sugRow('bg', sg.bg, x[0])); box.appendChild(grp);
    });
    if (!shown) box.appendChild(el('p', 'kn-sall', t('sug_all')));
  }

  /* ---------- peristiwa ---------- */
  ['fg', 'bg'].forEach(function (k) {
    $(k).addEventListener('input', function () { readField('fg') ; readField('bg'); render(); });
    $(k + 'Pick').addEventListener('input', function () { $(k).value = $(k + 'Pick').value; readField('fg'); readField('bg'); render(); });
  });
  $('btnSwap').addEventListener('click', function () { var a = $('fg').value; $('fg').value = $('bg').value; $('bg').value = a; readField('fg'); readField('bg'); render(); });
  $('btnCopy').addEventListener('click', function () {
    if (!last) return;
    var s = t('share', { ratio: K.fmtRatio(last.r), fg: last.fg, bg: last.bg });
    (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { toast(t('copy_ok')); }, function () { toast(t('copy_fail')); });
  });

  I.onReady(function () { $('fg').value = S.fg; $('bg').value = S.bg; readField('fg'); readField('bg'); render(); });
  document.addEventListener('sagalait:lang', function () { if ($('fg').value || $('bg').value) { readField('fg'); readField('bg'); render(); } });
})();
