/* Dua bahasa (id/en) bersama untuk portal dan semua app.
   Dimuat sinkron di <head> setelah theme.js: bahasa dipasang ke <html lang> sebelum halaman tampil.
   Kamus bersama: assets/lang/{id,en}.json (datar). Kamus app: atribut data-lang-src pada <html>,
   berkas JSON berbentuk { "id": {...}, "en": {...} }.
   Penanda: data-i18n="kunci" (textContent, hanya elemen tanpa anak), data-i18n-attr="atribut:kunci,...".
   Kode app memakai SagalaI18n.t(kunci, {param}) dan mendengar event "sagalait:lang" di document. */
(function () {
  'use strict';
  var KEY = 'sagalait-lang', LANGS = ['id', 'en'], root = document.documentElement;
  var script = document.currentScript;
  var base = new URL('lang/', script && script.src ? script.src : document.baseURI).href;

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* mode privat: abaikan */ } }
  function detect() {
    var s = read();
    if (LANGS.indexOf(s) >= 0) return s;
    return /^id\b/i.test((navigator.language || '').replace('_', '-')) ? 'id' : 'en';
  }

  var lang = detect(), dict = { id: {}, en: {} }, ready = false, waiters = [], missing = {};
  root.setAttribute('lang', lang);

  // Sembunyikan isi sebentar selama kamus Inggris dimuat, supaya teks Indonesia tidak berkedip.
  var wait = document.createElement('style');
  wait.textContent = 'html.i18n-wait body{visibility:hidden}';
  document.head.appendChild(wait);
  if (lang === 'en') root.classList.add('i18n-wait');

  function fill(v, p) { return String(v).replace(/\{(\w+)\}/g, function (m, k) { return p && Object.prototype.hasOwnProperty.call(p, k) ? String(p[k]) : m; }); }
  function lookup(key) {
    var v = dict[lang][key];
    if (v == null && lang !== 'id') v = dict.id[key];
    return v == null ? null : v;
  }
  function warn(key) {
    if (!ready || missing[key]) return;
    missing[key] = 1;
    if (window.console && console.warn) console.warn('i18n: kunci tidak ada: ' + key);
  }
  function t(key, p) {
    var v = lookup(key);
    if (v == null) { warn(key); return key; }
    return fill(v, p);
  }

  function apply(scope) {
    scope = scope || document;
    var i, els = scope.querySelectorAll('[data-i18n]');
    for (i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n'), v = lookup(key);
      if (v == null) warn(key); else els[i].textContent = fill(v);
    }
    els = scope.querySelectorAll('[data-i18n-attr]');
    for (i = 0; i < els.length; i++) {
      els[i].getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var c = pair.indexOf(':'); if (c < 1) return;
        var attr = pair.slice(0, c).trim(), k = pair.slice(c + 1).trim(), val = lookup(k);
        if (val == null) warn(k); else this.setAttribute(attr, fill(val));
      }, els[i]);
    }
    syncSwitch();
  }

  /* ---------- saklar bahasa ---------- */
  var group;
  function syncSwitch() {
    if (!group) return;
    Array.prototype.forEach.call(group.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-lang') === lang;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    });
  }
  function mountSwitch() {
    var host = document.querySelector('.top-end');
    if (!host || host.querySelector('.ui-langswitch')) return;
    group = document.createElement('div');
    group.className = 'ui-langswitch';
    group.setAttribute('role', 'group');
    group.setAttribute('data-i18n-attr', 'aria-label:common.lang');
    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = l.toUpperCase();
      b.setAttribute('data-lang', l); b.setAttribute('lang', l);
      b.setAttribute('data-i18n-attr', 'aria-label:common.lang_' + l);
      group.appendChild(b);
    });
    group.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-lang]');
      if (b) setLang(b.getAttribute('data-lang'));
    });
    host.insertBefore(group, host.querySelector('[data-theme-toggle]'));
    apply(group);
  }

  function setLang(l, silent) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    lang = l; if (!silent) write(l);
    root.setAttribute('lang', l);
    apply(document);
    document.dispatchEvent(new CustomEvent('sagalait:lang', { detail: { lang: l } }));
  }

  /* ---------- muat kamus ---------- */
  function getJson(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }
  function merge(to, from) { Object.keys(from || {}).forEach(function (k) { to[k] = from[k]; }); }
  var jobs = [
    getJson(base + 'id.json').then(function (o) { merge(dict.id, o); }),
    getJson(base + 'en.json').then(function (o) { merge(dict.en, o); })
  ];
  var src = root.getAttribute('data-lang-src');
  if (src) jobs.push(getJson(new URL(src, document.baseURI).href).then(function (o) { merge(dict.id, o.id); merge(dict.en, o.en); }));

  function finish() {
    if (ready) return;
    ready = true; root.classList.remove('i18n-wait');
    var go = function () { mountSwitch(); apply(document); waiters.splice(0).forEach(function (f) { f(); }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  Promise.all(jobs).then(function () { if (ready) apply(document); else finish(); });
  setTimeout(finish, 2500);

  window.addEventListener('storage', function (e) { if (e.key === KEY && e.newValue) setLang(e.newValue, true); });

  window.SagalaI18n = {
    get lang() { return lang; },
    get locale() { return lang === 'id' ? 'id-ID' : 'en-US'; },
    t: t, apply: apply, setLang: setLang,
    onReady: function (f) { if (ready) f(); else waiters.push(f); }
  };
})();
