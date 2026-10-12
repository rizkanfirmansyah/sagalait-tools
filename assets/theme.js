/* Tema terang/gelap bersama untuk portal dan semua app.
   Dimuat di <head> tanpa defer supaya tema terpasang sebelum halaman tampil (tidak berkedip). */
(function () {
  'use strict';
  var KEY = 'sagalait-theme';
  var root = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* mode privat: abaikan */ }
  }

  var initial = read();
  if (initial !== 'light' && initial !== 'dark') {
    initial = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', initial);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    write(next);
  });
})();
