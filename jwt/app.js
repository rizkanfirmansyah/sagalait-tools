(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var enc = new TextEncoder();
  var SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  var ALGS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];
  var DESC = {
    iss: 'Penerbit token (issuer)',
    sub: 'Subjek, biasanya ID pengguna',
    aud: 'Audiens: pihak yang boleh menerima token',
    exp: 'Kedaluwarsa: token tidak boleh diterima setelah waktu ini',
    nbf: 'Belum berlaku sebelum waktu ini (not before)',
    iat: 'Waktu token diterbitkan (issued at)',
    jti: 'ID unik token'
  };
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  // ---------- util DOM ----------
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function issue(kind, title, msg) {
    var d = h('div', 'issue' + (kind ? ' ' + kind : ''));
    var hd = h('div', 'issue-head');
    hd.appendChild(h('span', 'tag', kind === 'warning' ? 'Peringatan' : kind === 'info' ? 'Info' : 'Kesalahan'));
    hd.appendChild(h('strong', '', title));
    d.appendChild(hd);
    if (msg) d.appendChild(h('p', '', msg));
    return d;
  }
  function banner(cls, mark, text, aside) {
    var b = h('div', 'banner ' + cls);
    b.appendChild(h('span', 'dot', mark));
    b.appendChild(h('span', '', text));
    if (aside) b.appendChild(h('span', 'aside', aside));
    return b;
  }
  function copy(btn, getText) {
    btn.onclick = function () {
      var v = getText();
      var done = function () { var o = btn.dataset.l || (btn.dataset.l = btn.textContent); btn.textContent = 'Tersalin'; setTimeout(function () { btn.textContent = o; }, 1500); };
      var fb = function () {
        var t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* abaikan */ }
        document.body.removeChild(t);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, fb); else fb();
    };
  }

  // ---------- base64url ----------
  function b64uBytes(s) {
    var t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesB64u(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Mengembalikan {err} atau {bytes}. name dipakai di pesan.
  function decodePart(s, name) {
    if (/[+\/]/.test(s)) return { err: 'Bagian ' + name + ' memakai karakter + atau /, itu base64 biasa. JWT memakai base64url: ganti + dengan - dan / dengan _.' };
    if (/=/.test(s)) return { err: 'Bagian ' + name + ' berisi tanda =. JWT memakai base64url tanpa padding; hapus tanda = di akhir.' };
    var bad = s.match(/[^A-Za-z0-9_-]/);
    if (bad) return { err: 'Bagian ' + name + ' berisi karakter "' + bad[0] + '" yang bukan base64url. Periksa apakah token tersalin utuh.' };
    if (s.length % 4 === 1) return { err: 'Panjang bagian ' + name + ' tidak mungkin base64url yang valid (' + s.length + ' karakter). Token kemungkinan terpotong saat disalin.' };
    return { bytes: b64uBytes(s) };
  }
  function decodeJson(s, name) {
    var d = decodePart(s, name);
    if (d.err) return d;
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(d.bytes); }
    catch (e) { return { err: 'Bagian ' + name + ' bukan teks UTF-8 yang valid. Isinya mungkin biner atau rusak.' }; }
    var v;
    try { v = JSON.parse(text); }
    catch (e) {
      var m = String(e.message).match(/position (\d+)/);
      var pos = m ? ' pada karakter ke-' + (+m[1] + 1) : '';
      return { err: 'Bagian ' + name + ' bukan JSON valid' + pos + '. Periksa apakah token dibuat dengan benar atau terpotong.', detail: e.message };
    }
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { err: 'Bagian ' + name + ' harus berupa objek JSON, tetapi isinya ' + (Array.isArray(v) ? 'array' : typeof v) + '.' };
    return { value: v, text: text };
  }

  // ---------- waktu ----------
  function jakarta(ms) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.day + ' ' + BULAN[+p.month - 1] + ' ' + p.year + ' ' + p.hour + ':' + p.minute + ':' + p.second + ' WIB';
  }
  function utc(ms) { return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'); }
  function span(sec) {
    var u = [['hari', 86400], ['jam', 3600], ['menit', 60], ['detik', 1]], i = 0;
    while (i < 3 && sec < u[i][1]) i++;
    var n = Math.floor(sec / u[i][1]), out = n + ' ' + u[i][0];
    if (i < 3) { var r = Math.floor((sec - n * u[i][1]) / u[i + 1][1]); if (r) out += ' ' + r + ' ' + u[i + 1][0]; }
    return out;
  }
  function rel(ms, kind) {
    var d = Math.floor((ms - Date.now()) / 1000);
    var fut = d > 0, t = span(Math.abs(d));
    if (kind === 'exp') return fut ? 'kedaluwarsa ' + t + ' lagi' : 'sudah kedaluwarsa ' + t + ' lalu';
    if (kind === 'nbf') return fut ? 'berlaku ' + t + ' lagi' : 'sudah berlaku sejak ' + t + ' lalu';
    return fut ? t + ' lagi (di masa depan)' : t + ' lalu';
  }
  // Nilai klaim waktu -> {ms, note} atau {bad}
  function timeVal(v) {
    if (typeof v !== 'number' || !isFinite(v)) return { bad: 'Nilai bukan bilangan; klaim waktu JWT harus berupa detik sejak 1970 (NumericDate).' };
    if (Math.abs(v) >= 1e11) return { ms: v, note: 'Nilai tampak dalam milidetik, padahal JWT memakai detik. Waktu di atas dibaca sebagai milidetik; server yang ketat akan menafsirkannya sebagai tahun yang jauh sekali.' };
    return { ms: v * 1000 };
  }

  // ---------- state ----------
  var cur = null; // {header, payload, parts, alg, jwe}
  var tick = null;

  function cleanToken(raw) {
    var notes = [], t = raw;
    var t2 = t.trim();
    if (t2 !== t && t2.length) notes.push('spasi atau baris baru di sekitar token');
    t = t2;
    var m = t.match(/^authorization\s*:\s*/i);
    if (m) { t = t.slice(m[0].length); notes.push('awalan "Authorization:"'); }
    m = t.match(/^bearer\s+/i);
    if (m) { t = t.slice(m[0].length); notes.push('awalan "Bearer "'); }
    t = t.trim();
    m = t.match(/^(["'`])([\s\S]*)\1$/);
    if (m) { t = m[2].trim(); notes.push('tanda kutip'); }
    if (/\s/.test(t)) { t = t.replace(/\s+/g, ''); notes.push('spasi atau baris baru di dalam token'); }
    return { token: t, notes: notes };
  }

  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function startTick() {
    if (tick || !cur || document.hidden) return;
    tick = setInterval(function () { if (cur && !document.hidden) renderTime(); }, 1000);
  }

  function resetResults() {
    cur = null; stopTick();
    ['partsPanel', 'verPanel', 'hdrPanel', 'payPanel', 'claimPanel'].forEach(function (i) { $(i).hidden = true; });
    ['errBox', 'status', 'warns', 'verResult'].forEach(function (i) { clear($(i)); });
    $('cleanNote').hidden = true;
  }

  function render() {
    var raw = $('input').value;
    resetResults();
    $('inNote').textContent = '';
    if (!raw.trim()) { $('empty').hidden = false; return; }
    $('empty').hidden = true;
    var c = cleanToken(raw);
    $('inNote').textContent = c.token.length + ' karakter';
    if (c.notes.length) { $('cleanNote').textContent = 'Dibersihkan otomatis: ' + c.notes.join(', ') + '.'; $('cleanNote').hidden = false; }
    var parts = c.token.split('.');
    if (parts.length !== 3 && parts.length !== 5) {
      $('errBox').appendChild(issue('', 'Jumlah bagian token salah', 'Token ini terdiri dari ' + parts.length + ' bagian yang dipisah titik. JWT biasa punya 3 bagian (header.payload.tanda-tangan), JWE terenkripsi punya 5. Periksa apakah token terpotong atau ada titik yang ikut tersalin.'));
      return;
    }
    var jwe = parts.length === 5;
    var hd = decodeJson(parts[0], 'header');
    if (hd.err) { $('errBox').appendChild(issue('', 'Header tidak bisa dibaca', hd.err)); showParts(parts, jwe); return; }
    showParts(parts, jwe);
    $('hdrOut').textContent = JSON.stringify(hd.value, null, 2);
    $('hdrPanel').hidden = false;
    var alg = hd.value.alg;

    if (jwe) {
      $('warns').appendChild(issue('info', 'Token terenkripsi (JWE)', 'Token ini punya 5 bagian sehingga berupa JWE: isinya terenkripsi dan tidak bisa dibaca tanpa kunci dekripsi. Hanya header yang bisa ditampilkan.'));
      cur = null;
      return;
    }
    var pl = decodeJson(parts[1], 'payload');
    if (pl.err) { $('errBox').appendChild(issue('', 'Payload tidak bisa dibaca', pl.err)); return; }
    var sg = parts[2] === '' ? { bytes: new Uint8Array(0) } : decodePart(parts[2], 'tanda tangan');
    $('payOut').textContent = JSON.stringify(pl.value, null, 2);
    $('payPanel').hidden = false;
    if (sg.err) $('errBox').appendChild(issue('warning', 'Tanda tangan tidak valid', sg.err));

    cur = { header: hd.value, payload: pl.value, parts: parts, alg: alg, sig: sg.bytes || null };
    algWarnings(hd.value);
    $('claimPanel').hidden = false;
    renderTime();
    setupVerify();
    startTick();
  }

  function showParts(parts, jwe) {
    var box = $('parts'); clear(box);
    var cls = jwe ? ['p-h', 'p-p', 'p-p', 'p-p', 'p-s'] : ['p-h', 'p-p', 'p-s'];
    parts.forEach(function (p, i) {
      if (i) box.appendChild(h('span', 'sep', '.'));
      if (p) box.appendChild(h('span', 'p ' + cls[i], p));
    });
    $('partsPanel').hidden = false;
  }

  function algWarnings(hv) {
    var w = $('warns'), alg = hv.alg;
    if (typeof alg !== 'string') w.appendChild(issue('warning', 'Header tanpa alg', 'Header tidak punya klaim "alg" berupa teks, jadi algoritma tanda tangan tidak diketahui.'));
    else if (alg.toLowerCase() === 'none') w.appendChild(issue('', 'alg: none, token tanpa tanda tangan', 'Token ini tidak punya tanda tangan sama sekali sehingga siapa pun bisa membuatnya. Server tidak boleh menerimanya sebagai token sah; pastikan server hanya menerima algoritma yang kamu tentukan.'));
    else if (ALGS.indexOf(alg) === -1) w.appendChild(issue('warning', 'Algoritma tidak dikenal: ' + alg, 'Algoritma ini tidak ada di daftar yang umum (HS, RS, PS, ES 256/384/512, EdDSA). Tanda tangannya tidak bisa diperiksa di sini.'));
    if (hv.typ !== undefined && String(hv.typ).toUpperCase() !== 'JWT') w.appendChild(issue('info', 'typ bukan JWT', 'Header menyebut typ "' + String(hv.typ) + '". Biasanya nilainya "JWT"; bisa jadi ini jenis token lain (mis. at+jwt).'));
  }

  // bagian yang bergantung waktu: status dan klaim
  function renderTime() {
    if (!cur) return;
    var p = cur.payload, now = Date.now();
    var dl = $('claims'), st = $('status');
    clear(dl); clear(st);
    var info = {};
    ['exp', 'nbf', 'iat'].forEach(function (k) { if (k in p) info[k] = timeVal(p[k]); });
    var any = false;
    ['iss', 'sub', 'aud', 'exp', 'nbf', 'iat', 'jti'].forEach(function (k) {
      if (!(k in p)) return;
      any = true;
      var dt = h('dt', '', k), dd = h('dd');
      dd.appendChild(h('span', 'desc', DESC[k]));
      var v = p[k];
      if (k === 'exp' || k === 'nbf' || k === 'iat') {
        var t = info[k];
        if (t.bad) { dd.insertBefore(h('span', '', JSON.stringify(v)), dd.firstChild); dd.appendChild(h('span', 'cnote', t.bad)); }
        else {
          dd.insertBefore(h('span', '', jakarta(t.ms)), dd.firstChild);
          dd.insertBefore(h('span', 'rel', rel(t.ms, k)), dd.children[1]);
          dd.appendChild(h('span', 'small muted', utc(t.ms)));
          if (t.note) dd.appendChild(h('span', 'cnote', t.note));
        }
      } else if (k === 'aud' && Array.isArray(v)) {
        dd.insertBefore(h('span', '', v.map(String).join(', ')), dd.firstChild);
      } else {
        dd.insertBefore(h('span', '', typeof v === 'string' ? v : JSON.stringify(v)), dd.firstChild);
      }
      dl.appendChild(dt); dl.appendChild(dd);
    });
    if (!any) { dl.appendChild(h('dt', '', '-')); dl.appendChild(h('dd', 'muted', 'Payload tidak punya klaim terdaftar (iss, sub, aud, exp, nbf, iat, jti).')); }

    var ex = info.exp && !info.exp.bad ? info.exp.ms : null;
    var nb = info.nbf && !info.nbf.bad ? info.nbf.ms : null;
    if (nb !== null && nb > now) st.appendChild(banner('warn', '!', 'Belum berlaku', rel(nb, 'nbf')));
    else if (ex !== null && ex <= now) st.appendChild(banner('bad', '!', 'Sudah kedaluwarsa', rel(ex, 'exp')));
    else if (!('exp' in p)) st.appendChild(banner('warn', '!', 'Tanpa exp: token tidak pernah kedaluwarsa', 'Berisiko bila bocor'));
    else if (ex === null) st.appendChild(banner('warn', '!', 'Nilai exp tidak bisa dibaca', 'Masa berlaku tidak bisa dinilai'));
    else st.appendChild(banner('ok', '✓', 'Valid secara waktu', rel(ex, 'exp')));
    if (!cur.verified) st.appendChild(banner('sub', 'i', 'Tanda tangan belum diperiksa. Decode bukan verifikasi: isi token bisa dibaca siapa saja, hanya tanda tangan yang membuktikan keasliannya.'));
    else st.appendChild(cur.verified);
  }

  // ---------- verifikasi ----------
  var HASH = { 256: 'SHA-256', 384: 'SHA-384', 512: 'SHA-512' };
  function setupVerify() {
    var a = cur.alg, p = $('verPanel');
    p.hidden = false;
    var hs = /^HS(256|384|512)$/.test(a), pk = /^(RS|PS|ES)(256|384|512)$/.test(a);
    $('verHS').hidden = !hs; $('verPK').hidden = !pk;
    $('btnVerify').disabled = !(hs || pk);
    $('verInfo').textContent = hs ? 'Algoritma ' + a + ' (HMAC): isi secret yang dipakai penerbit token.'
      : pk ? 'Algoritma ' + a + ': tempel kunci publik penerbit dalam format PEM (PUBLIC KEY atau CERTIFICATE).'
      : (a === 'EdDSA' ? 'EdDSA belum didukung untuk pemeriksaan di sini.' : 'Algoritma ' + String(a) + ' tidak bisa diperiksa di sini.');
  }
  function derTLV(b, o) {
    var tag = b[o], l = b[o + 1], hl = 2;
    if (l & 0x80) { var n = l & 0x7f; l = 0; for (var i = 0; i < n; i++) l = l * 256 + b[o + 2 + i]; hl = 2 + n; }
    if (o + hl + l > b.length) throw new Error('DER rusak');
    return { tag: tag, start: o, body: o + hl, end: o + hl + l };
  }
  function pemToSpki(pem) {
    var m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
    if (!m) throw new Error('Format PEM tidak dikenali. Harus diawali "-----BEGIN PUBLIC KEY-----" atau "-----BEGIN CERTIFICATE-----".');
    var der = b64uBytes(m[2].replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    if (m[1] === 'PUBLIC KEY') return der;
    if (m[1] === 'CERTIFICATE') {
      var cert = derTLV(der, 0), tbs = derTLV(der, cert.body), o = tbs.body, t = derTLV(der, o);
      if (t.tag === 0xA0) { o = t.end; }          // version
      for (var i = 0; i < 5; i++) o = derTLV(der, o).end; // serial, sigalg, issuer, validity, subject
      return der.slice(o, derTLV(der, o).end);
    }
    throw new Error('Jenis PEM "' + m[1] + '" belum didukung. Pakai PUBLIC KEY (SPKI) atau CERTIFICATE.');
  }
  async function verify() {
    var a = cur.alg, bits = a.slice(2), hash = HASH[bits], data = enc.encode(cur.parts[0] + '.' + cur.parts[1]), sig = cur.sig;
    if (!window.crypto || !crypto.subtle) throw new Error('Web Crypto tidak tersedia. Buka halaman lewat https atau localhost.');
    var key, alg;
    if (a.slice(0, 2) === 'HS') {
      var raw;
      if ($('secretB64').checked) {
        var s = $('secret').value.trim();
        if (/[^A-Za-z0-9+\/_=-]/.test(s)) throw new Error('Secret berisi karakter yang bukan base64 atau base64url. Matikan centang bila secret berupa teks biasa.');
        raw = b64uBytes(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
      } else raw = enc.encode($('secret').value);
      key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: hash }, false, ['verify']);
      alg = 'HMAC';
    } else {
      var spki = pemToSpki($('pubkey').value);
      var kind = a.slice(0, 2);
      var imp = kind === 'RS' ? { name: 'RSASSA-PKCS1-v1_5', hash: hash } : kind === 'PS' ? { name: 'RSA-PSS', hash: hash } : { name: 'ECDSA', namedCurve: { 256: 'P-256', 384: 'P-384', 512: 'P-521' }[bits] };
      try { key = await crypto.subtle.importKey('spki', spki, imp, false, ['verify']); }
      catch (e) { throw new Error('Kunci tidak bisa dipakai untuk ' + a + '. Pastikan jenis kunci (RSA atau EC dan kurvanya) sesuai dengan algoritma di header.'); }
      alg = kind === 'RS' ? 'RSASSA-PKCS1-v1_5' : kind === 'PS' ? { name: 'RSA-PSS', saltLength: +bits / 8 } : { name: 'ECDSA', hash: hash };
      if (kind === 'ES' && sig.length !== { 256: 64, 384: 96, 512: 132 }[bits]) return false; // JWS memakai r||s mentah, bukan DER
    }
    return crypto.subtle.verify(alg, key, sig, data);
  }
  $('btnVerify').onclick = async function () {
    var out = $('verResult'); clear(out);
    if (!cur) return;
    var b;
    if (!cur.sig || !cur.sig.length) { out.appendChild(issue('warning', 'Tidak ada tanda tangan', 'Bagian ketiga token kosong atau rusak, jadi tidak ada yang bisa diperiksa.')); return; }
    var ok;
    try { ok = await verify(); }
    catch (e) { out.appendChild(issue('', 'Pemeriksaan gagal', e.message)); return; }
    if (ok) b = banner('ok', '✓', 'Tanda tangan cocok', 'Token ini dibuat oleh pemegang secret atau kunci tersebut dan isinya tidak diubah.');
    else b = banner('bad', '!', 'Tanda tangan tidak cocok', 'Penyebab umum: secret atau kunci salah, ada spasi atau baris baru tersisa, algoritma tidak sesuai, atau isi token diubah.');
    b.style.marginTop = '12px';
    out.appendChild(b);
    if (cur) { cur.verified = banner(ok ? 'ok' : 'bad', ok ? '✓' : '!', ok ? 'Tanda tangan cocok' : 'Tanda tangan tidak cocok'); cur.verified.style.marginTop = '8px'; renderTime(); }
  };

  // ---------- generator HS256 ----------
  function b64uText(s) { return bytesB64u(enc.encode(s)); }
  $('btnGen').onclick = async function () {
    var err = $('genErr'); clear(err); $('genOut').hidden = true;
    var hdr, pay;
    try { hdr = JSON.parse($('genHeader').value); } catch (e) { err.appendChild(issue('', 'Header bukan JSON valid', 'Periksa tanda kutip ganda dan koma. ' + e.message)); return; }
    try { pay = JSON.parse($('genPayload').value); } catch (e) { err.appendChild(issue('', 'Payload bukan JSON valid', 'Periksa tanda kutip ganda dan koma. ' + e.message)); return; }
    if (!hdr || typeof hdr !== 'object' || !pay || typeof pay !== 'object') { err.appendChild(issue('', 'Header dan payload harus objek JSON', 'Tulis dengan kurung kurawal, misalnya {"sub":"1"}.')); return; }
    if (hdr.alg !== 'HS256') { err.appendChild(issue('', 'Header harus memakai alg HS256', 'Pembuat token ini hanya mendukung HS256. Ubah "alg" menjadi "HS256".')); return; }
    if (!$('genSecret').value) { err.appendChild(issue('', 'Secret kosong', 'Isi secret untuk menandatangani token.')); return; }
    if (!window.crypto || !crypto.subtle) { err.appendChild(issue('', 'Web Crypto tidak tersedia', 'Buka halaman lewat https atau localhost.')); return; }
    var head = b64uText(JSON.stringify(hdr)) + '.' + b64uText(JSON.stringify(pay));
    var key = await crypto.subtle.importKey('raw', enc.encode($('genSecret').value), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    var sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(head)));
    $('genToken').textContent = head + '.' + bytesB64u(sig);
    $('genOut').hidden = false;
  };
  copy($('btnGenCopy'), function () { return $('genToken').textContent; });
  $('btnGenUse').onclick = function () { $('input').value = $('genToken').textContent; render(); $('input').focus(); };

  // ---------- pengikat ----------
  copy($('btnCopyH'), function () { return $('hdrOut').textContent; });
  copy($('btnCopyP'), function () { return $('payOut').textContent; });
  $('input').addEventListener('input', render);
  $('btnSample').onclick = $('btnSample2').onclick = function () { $('input').value = SAMPLE; render(); };
  $('btnClear').onclick = function () {
    ['input', 'secret', 'pubkey', 'genSecret'].forEach(function (i) { $(i).value = ''; });
    $('secretB64').checked = false;
    clear($('genErr')); clear($('genToken')); $('genOut').hidden = true;
    render(); $('input').focus();
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopTick(); else if (cur) { renderTime(); startTick(); } });
  render();
})();
