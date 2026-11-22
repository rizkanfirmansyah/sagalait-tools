/* Tampilan Generator .htaccess dan php.ini. Isi keluaran dibuat di gen.js. Pilihan opsi disimpan di browser ini; tidak ada data yang dikirim. */
(function () {
  'use strict';
  var G = window.HtaccessLab, I = window.SagalaI18n, KEY = 'sagalait-htaccess';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var S = { tab: 'ht', ht: Object.assign({}, G.HT_DEFAULTS), php: Object.assign({}, G.PHP_DEFAULTS) };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (s.tab === 'php') S.tab = 'php';
      ['ht', 'php'].forEach(function (g) { if (s[g] && typeof s[g] === 'object') Object.keys(S[g]).forEach(function (k) { if (typeof s[g][k] === typeof S[g][k] && (typeof s[g][k] !== 'string' || s[g][k].length < 200)) S[g][k] = s[g][k]; }); });
    }
  } catch (e) { /* abaikan */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* mode privat */ } }

  var SW = { ht: { oHttps: 'https', oProxy: 'proxy', oFront: 'front', oAuth: 'auth', oGzip: 'gzip', oDot: 'dotfiles', oSens: 'sensitive', oIdx: 'indexes', oHdr: 'headers', oHstsSub: 'hstsSub', oCsp: 'csp' }, php: { pOpc: 'opcache', pDis: 'disableFn', pFopen: 'urlFopen', pSsec: 'sessionSecure' } };
  var TX = { ht: { oEntry: 'entry', oBase: 'base' }, php: { pUpload: 'upload', pPost: 'post', pLog: 'errorLog', pMem: 'memory', pTz: 'tz' } };
  var SEG = { ht: { www: 'www', cache: 'cache', hsts: 'hsts' }, php: { profile: 'profile' } };
  var PRESETS = {
    app: { https: true, proxy: false, www: 'none', front: true, auth: false, gzip: true, cache: 'month', dotfiles: true, sensitive: true, indexes: true, headers: true, hsts: 'off', hstsSub: false, csp: false },
    static: { https: true, proxy: false, www: 'none', front: false, auth: false, gzip: true, cache: 'year', dotfiles: true, sensitive: false, indexes: true, headers: true, hsts: 'off', hstsSub: false, csp: false },
    strict: { https: true, proxy: false, www: 'remove', front: true, auth: false, gzip: true, cache: 'month', dotfiles: true, sensitive: true, indexes: true, headers: true, hsts: 'week', hstsSub: false, csp: true }
  };

  /* ---------- isi formulir dari keadaan ---------- */
  function fill() {
    ['ht', 'php'].forEach(function (g) {
      Object.keys(SW[g]).forEach(function (id) { $(id).checked = !!S[g][SW[g][id]]; });
      Object.keys(TX[g]).forEach(function (id) { $(id).value = S[g][TX[g][id]]; });
      Object.keys(SEG[g]).forEach(function (name) { var r = document.querySelector('input[name=' + name + '][value="' + S[g][SEG[g][name]] + '"]'); if (r) r.checked = true; });
    });
    $('pTime').value = S.php.time;
  }
  function gate() {
    $('oEntry').disabled = !S.ht.front; $('oHstsSub').disabled = S.ht.hsts === 'off'; $('oProxy').disabled = !S.ht.https && S.ht.www === 'none';
    $('pDis').disabled = S.php.profile !== 'production';
  }

  /* ---------- keluaran ---------- */
  function build() { return S.tab === 'ht' ? G.buildHtaccess(S.ht, t) : G.buildPhpIni(S.php, t); }
  function render() {
    var ht = S.tab === 'ht'; gate();
    $('formHt').hidden = !ht; $('formPhp').hidden = ht; $('tabHt').setAttribute('aria-pressed', String(ht)); $('tabPhp').setAttribute('aria-pressed', String(!ht));
    $('fileName').textContent = ht ? '.htaccess' : 'php.ini'; $('howTo').textContent = t(ht ? 'how_ht' : 'how_php');
    var r = build(); $('outPre').textContent = r.text; $('outMeta').textContent = t('lines', { n: r.text.split('\n').length - 1 });
    var eb = $('errList'); eb.textContent = ''; r.errors.forEach(function (k) { eb.appendChild(el('li', '', t(k))); }); $('errBox').hidden = !r.errors.length;
    var wl = $('warnList'); wl.textContent = ''; r.warnings.forEach(function (k) { wl.appendChild(el('li', '', t(k))); }); $('warnBox').hidden = !r.warnings.length;
  }
  function changed() { save(); render(); }

  /* ---------- peristiwa ---------- */
  ['ht', 'php'].forEach(function (g) {
    Object.keys(SW[g]).forEach(function (id) { $(id).addEventListener('change', function () { S[g][SW[g][id]] = $(id).checked; changed(); }); });
    Object.keys(TX[g]).forEach(function (id) { $(id).addEventListener('input', function () { S[g][TX[g][id]] = $(id).value.trim(); changed(); }); });
    Object.keys(SEG[g]).forEach(function (name) { document.querySelectorAll('input[name=' + name + ']').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) { S[g][SEG[g][name]] = r.value; changed(); } }); }); });
  });
  $('pTime').addEventListener('input', function () { var v = $('pTime').value; S.php.time = v === '' ? NaN : Number(v); changed(); });
  document.querySelectorAll('[data-preset]').forEach(function (b) { b.addEventListener('click', function () { Object.assign(S.ht, PRESETS[b.getAttribute('data-preset')]); fill(); changed(); }); });
  $('tabHt').addEventListener('click', function () { S.tab = 'ht'; changed(); });
  $('tabPhp').addEventListener('click', function () { S.tab = 'php'; changed(); });

  function toast(msg) {
    var old = document.querySelector('.ui-toast'); if (old) old.remove();
    var n = el('div', 'ui-toast', msg); n.setAttribute('role', 'status'); document.body.appendChild(n); setTimeout(function () { n.remove(); }, 2000);
  }
  $('btnCopy').addEventListener('click', function () {
    (navigator.clipboard ? navigator.clipboard.writeText($('outPre').textContent) : Promise.reject()).then(function () { toast(t('copy_ok')); }, function () { toast(t('copy_fail')); });
  });
  $('btnDl').addEventListener('click', function () {
    var u = URL.createObjectURL(new Blob([$('outPre').textContent], { type: 'text/plain' })), a = el('a'); a.href = u; a.download = S.tab === 'ht' ? '.htaccess' : 'php.ini';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  });

  I.onReady(function () {
    var tz = $('pTz'); G.TIMEZONES.forEach(function (z) { var o = el('option', '', z); o.value = z; tz.appendChild(o); });
    fill(); render();
  });
  document.addEventListener('sagalait:lang', render);
})();
