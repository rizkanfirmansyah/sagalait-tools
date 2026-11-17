/* Tampilan Konverter waktu. Logika murni di waktu.js. Hanya zona yang dipilih disimpan di browser. */
(function () {
  'use strict';
  var W = window.Waktu, I = window.SagalaI18n, KEY = 'sagalait-waktu';
  var $ = function (id) { return document.getElementById(id); };
  function t(k, p) { return I.t(k, p); }
  function num(n, max) { return new Intl.NumberFormat(I.locale, { maximumFractionDigits: max === undefined ? 0 : max }).format(n); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var ERR = { empty: 'e_empty', format: 'e_format', date: 'e_date', range: 'e_range' };
  var browserTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
  var zoneId = 'WIB', cur = null;

  function tzOf(id) { if (id === 'local') return browserTz; for (var i = 0; i < W.ZONES.length; i++) if (W.ZONES[i].id === id) return W.ZONES[i].tz; return 'Asia/Jakarta'; }
  function zoneLabel(id) { return id === 'local' ? t('zone_browser', { tz: browserTz }) : t('z_' + id); }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && (s.zone === 'local' || W.ZONES.some(function (z) { return z.id === s.zone; }))) zoneId = s.zone; } catch (e) { /* abaikan */ } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ zone: zoneId })); } catch (e) { /* mode privat */ } }
  function buildZone() {
    var sel = $('zone'); sel.textContent = '';
    W.ZONES.concat([{ id: 'local' }]).forEach(function (z) { var o = el('option', null, z.id === 'local' ? t('zone_browser', { tz: browserTz }) : t('z_' + z.id)); o.value = z.id; sel.appendChild(o); });
    sel.value = zoneId;
  }
  function copy(text, btn, label) {
    var ok = function () { btn.textContent = t('common.copied'); setTimeout(function () { btn.textContent = label; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { /* ditolak */ });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (b) { var src = $(b.getAttribute('data-copy')); copy(src.getAttribute('data-raw') || src.textContent, b, t('common.copy')); return; }
    var n = e.target.closest('[data-now]'); if (n) { $(n.getAttribute('data-now')).value = String(Date.now()); diff(); }
  });

  /* ---------- jam hidup ---------- */
  function tickNow() {
    var ms = Date.now(); $('nowS').textContent = String(W.epochSeconds(ms)); $('nowMs').textContent = String(ms);
    $('nowWib').textContent = W.iso(ms, 'Asia/Jakarta') + ' · ' + W.human(ms, 'Asia/Jakarta', I.locale);
  }
  var timer = 0;
  function setLive(on) { clearInterval(timer); if (on) timer = setInterval(tickNow, 250); }
  $('live').addEventListener('change', function (e) { setLive(e.target.checked); if (e.target.checked) tickNow(); });
  $('btnNow').addEventListener('click', function () { $('inp').value = String(Date.now()); update(); });

  /* ---------- konversi ---------- */
  function update() {
    var raw = $('inp').value, err = $('err'), kind = $('kind');
    if (raw.trim() === '') { cur = null; err.textContent = ''; kind.textContent = ''; $('empty').hidden = false; $('out').hidden = true; return; }
    var r = W.parse(raw, tzOf(zoneId));
    if (!r.ok) { cur = null; err.textContent = t(ERR[r.error]); kind.textContent = ''; $('empty').hidden = false; $('out').hidden = true; return; }
    cur = r; err.textContent = ''; $('empty').hidden = true; $('out').hidden = false;
    kind.textContent = r.kind === 'epoch' ? t('kind_' + r.unit) : r.kind === 'iso' ? t('kind_iso') : t('kind_local', { zone: zoneLabel(zoneId) });
    var w = $('warn32'); w.hidden = !W.overInt32(r.ms); w.textContent = t('warn32');
    $('rS').textContent = String(W.epochSeconds(r.ms)); $('rMs').textContent = String(r.ms);
    var ul = $('zones'); ul.textContent = '';
    W.ZONES.map(function (z) { return { id: z.id, tz: z.tz }; }).concat([{ id: 'local', tz: browserTz }]).forEach(function (z, i) {
      var li = el('li', 'wk-zone'), h = el('div', 'wk-zhead'), code = el('code', 'wk-iso', W.iso(r.ms, z.tz)), b = el('button', 'btn btn-sm', t('common.copy'));
      h.appendChild(el('strong', null, zoneLabel(z.id))); li.appendChild(h); li.appendChild(code);
      code.id = 'iso' + i; b.type = 'button'; b.setAttribute('data-copy', 'iso' + i); b.setAttribute('aria-label', t('common.copy') + ' ' + zoneLabel(z.id)); h.appendChild(b);
      li.appendChild(el('div', 'small muted', W.human(r.ms, z.tz, I.locale))); ul.appendChild(li);
    });
  }
  $('inp').addEventListener('input', update);
  $('zone').addEventListener('change', function (e) { zoneId = e.target.value; save(); update(); diff(); });
  document.querySelector('.wk-ex').addEventListener('click', function (e) { var b = e.target.closest('[data-ex]'); if (b) { $('inp').value = b.getAttribute('data-ex'); update(); } });
  $('btnSample').addEventListener('click', function () { $('inp').value = '1700000000'; update(); $('dA').value = '2026-11-18 08:00'; $('dB').value = '2026-12-25 17:30:15'; diff(); });

  /* ---------- selisih ---------- */
  function diff() {
    var a = $('dA').value, b = $('dB').value, res = $('dRes'), tot = $('dTot'); tot.textContent = '';
    if (!a.trim() || !b.trim()) { res.textContent = ''; return; }
    var pa = W.parse(a, tzOf(zoneId)), pb = W.parse(b, tzOf(zoneId));
    if (!pa.ok) { res.textContent = t('diff_bad', { which: t('diff_a'), msg: t(ERR[pa.error]) }); return; }
    if (!pb.ok) { res.textContent = t('diff_bad', { which: t('diff_b'), msg: t(ERR[pb.error]) }); return; }
    var d = W.diff(pa.ms, pb.ms);
    if (!d.sign) { res.textContent = t('diff_same'); return; }
    var text = t('diff_text', { d: num(d.days), h: d.hours, m: d.minutes, s: d.seconds + (d.ms ? '.' + String(d.ms).padStart(3, '0') : '') });
    res.textContent = t(d.sign > 0 ? 'diff_after' : 'diff_before', { n: '', text: text }).replace(/\s{2,}/g, ' ');
    tot.textContent = t('diff_tot', { s: num(d.totalSeconds, 3), m: num(d.totalMinutes, 2), h: num(d.totalHours, 2), d: num(d.totalDays, 3) });
  }
  $('dA').addEventListener('input', diff); $('dB').addEventListener('input', diff);

  I.onReady(function () { load(); buildZone(); tickNow(); setLive($('live').checked); update(); diff(); });
  document.addEventListener('sagalait:lang', function () { buildZone(); tickNow(); update(); diff(); });
})();
