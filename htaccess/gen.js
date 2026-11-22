/* Logika Generator .htaccess dan php.ini: tanpa DOM. Teks komentar di keluaran datang dari fungsi M(kunci, param) supaya mengikuti bahasa antarmuka.
   Keluaran .htaccess untuk Apache 2.4; tiap blok dibungkus IfModule supaya modul yang tidak aktif tidak membuat error 500 (aturannya diam-diam tidak jalan). */
(function (root) {
  'use strict';
  var HT_DEFAULTS = {
    https: true, proxy: false, www: 'none', front: true, entry: 'index.php', base: '', auth: false,
    gzip: true, cache: 'month', dotfiles: true, sensitive: true, indexes: true, headers: true, hsts: 'off', hstsSub: false, csp: false
  };
  var PHP_DEFAULTS = { profile: 'production', memory: '256M', upload: '64M', post: '72M', time: 60, tz: 'Asia/Jakarta', sessionSecure: false, opcache: true, disableFn: true, urlFopen: true, errorLog: '' };
  var CACHE_SEC = { week: 604800, month: 2592000, year: 31536000 };
  var HSTS_SEC = { week: 604800, half: 15768000, year: 31536000 };
  var TIMEZONES = ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'UTC', 'Europe/London', 'America/New_York'];
  var DISABLED_FN = 'exec,passthru,shell_exec,system,proc_open,popen';

  function comment(M, key, p, pre) { return M(key, p).split('\n').map(function (l) { return (pre || '#') + ' ' + l; }).join('\n'); }
  function pick(v, allowed, def) { return allowed.indexOf(v) >= 0 ? v : def; }

  /* Kembalian { text, errors: [kunci], warnings: [kunci] }. Opsi yang tidak sah memakai nilai bawaan dan dilaporkan di errors. */
  function buildHtaccess(opts, M) {
    var o = Object.assign({}, HT_DEFAULTS, opts || {}), errors = [], warns = [], blocks = [], c = function (k, p) { return comment(M, k, p); };
    o.www = pick(o.www, ['none', 'remove', 'add'], 'none'); o.cache = pick(o.cache, ['off', 'week', 'month', 'year'], 'month'); o.hsts = pick(o.hsts, ['off', 'week', 'half', 'year'], 'off');
    if (!/^[A-Za-z0-9._-]+\.php$/.test(o.entry)) { errors.push('he_entry'); o.entry = 'index.php'; }
    if (o.base !== '' && !/^\/[A-Za-z0-9._~\/-]*$/.test(o.base)) { errors.push('he_base'); o.base = ''; }

    if (o.indexes) { blocks.push(c('hc_indexes') + '\nOptions -Indexes'); warns.push('hw_indexes'); }
    if (o.dotfiles) blocks.push(c('hc_dot') + '\n<IfModule mod_alias.c>\n    RedirectMatch 403 "/\\.(?!well-known(?:/|$))"\n</IfModule>');
    if (o.sensitive) {
      blocks.push(c('hc_sens') + '\n<FilesMatch "(?i)(?:\\.(?:bak|backup|conf|config|dist|inc|ini|log|orig|sh|sql|swp|tpl)|~)$|^(?:composer\\.(?:json|lock)|package(?:-lock)?\\.json|yarn\\.lock|Dockerfile|Makefile)$">\n    <IfModule mod_authz_core.c>\n        Require all denied\n    </IfModule>\n</FilesMatch>');
      warns.push('hw_sens');
    }
    if (o.headers || o.hsts !== 'off' || o.csp) {
      var h = [], secure = o.proxy ? '"expr=%{HTTPS} == \'on\' || %{HTTP:X-Forwarded-Proto} == \'https\'"' : '"expr=%{HTTPS} == \'on\'"';
      if (o.headers) h.push('Header always set X-Content-Type-Options "nosniff"', 'Header always set X-Frame-Options "SAMEORIGIN"', 'Header always set Referrer-Policy "strict-origin-when-cross-origin"', 'Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"', 'Header always unset X-Powered-By');
      var txt = c('hc_headers') + '\n<IfModule mod_headers.c>\n' + h.map(function (x) { return '    ' + x; }).join('\n');
      if (o.hsts !== 'off') {
        txt += '\n' + c('hc_hsts').replace(/^/gm, '    ') + '\n    Header always set Strict-Transport-Security "max-age=' + HSTS_SEC[o.hsts] + (o.hstsSub ? '; includeSubDomains' : '') + '" ' + secure;
        warns.push('hw_hsts'); if (o.hstsSub) warns.push('hw_hsts_sub'); if (!o.https) warns.push('hw_hsts_no_https');
      }
      if (o.csp) { txt += '\n' + c('hc_csp').replace(/^/gm, '    ') + '\n    Header always set Content-Security-Policy-Report-Only "default-src \'self\'; img-src \'self\' data:; style-src \'self\' \'unsafe-inline\'; frame-ancestors \'self\'"'; warns.push('hw_csp'); }
      blocks.push(txt + '\n</IfModule>');
    }
    if (o.gzip) blocks.push(c('hc_gzip') + '\n<IfModule mod_deflate.c>\n    AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml text/javascript application/javascript application/json application/ld+json application/manifest+json application/xml application/xhtml+xml application/rss+xml image/svg+xml image/x-icon font/ttf font/otf application/vnd.ms-fontobject\n</IfModule>');
    if (o.cache !== 'off') {
      blocks.push(c('hc_cache', { days: Math.round(CACHE_SEC[o.cache] / 86400) }) + '\n<IfModule mod_headers.c>\n    <FilesMatch "\\.(?:css|js|mjs|jpe?g|png|gif|webp|avif|svg|ico|woff2?|ttf|otf)$">\n        Header set Cache-Control "public, max-age=' + CACHE_SEC[o.cache] + '"\n    </FilesMatch>\n</IfModule>');
      warns.push('hw_cache');
    }

    /* Pengalihan dan front controller memakai satu blok mod_rewrite. */
    var rw = [], needRw = o.https || o.www !== 'none' || o.front || o.auth;
    if (needRw) {
      rw.push('RewriteEngine On'); if (o.base) rw.push('RewriteBase ' + o.base);
      var ELIGIBLE = ['RewriteCond %{HTTP_HOST} !^www\\. [NC]', 'RewriteCond %{HTTP_HOST} !^localhost [NC]', 'RewriteCond %{HTTP_HOST} !^[0-9.]+(:[0-9]+)?$', 'RewriteCond %{HTTP_HOST} ^([^:]+)(:[0-9]+)?$'];
      if (o.https) {
        var cm = [], cond = ['RewriteCond %{HTTPS} !=on']; if (o.proxy) cond.push('RewriteCond %{HTTP:X-Forwarded-Proto} !https');
        if (o.proxy) cm.push(c('hc_proxy'));
        cm.push(c('hc_https'));
        rw.push('', cm.join('\n'));
        if (o.www === 'add') rw.push.apply(rw, cond.concat(ELIGIBLE, ['RewriteRule ^ https://www.%1%{REQUEST_URI} [L,R=301]']));
        else if (o.www === 'remove') rw.push.apply(rw, cond.concat(['RewriteCond %{HTTP_HOST} ^(?:www\\.)?(.+)$ [NC]', 'RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]']));
        if (o.www === 'add') rw.push.apply(rw, cond.concat(['RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]']));
        else if (o.www === 'none') rw.push.apply(rw, cond.concat(['RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]']));
        warns.push('hw_https'); if (!o.proxy) warns.push('hw_loop');
      }
      if (o.www !== 'none') {
        var scheme = '%{ENV:PROTO}';
        if (!o.https) {
          rw.push('', c('hc_proto'), 'RewriteCond %{HTTPS} =on' + (o.proxy ? ' [OR]' : '')); if (o.proxy) rw.push('RewriteCond %{HTTP:X-Forwarded-Proto} =https');
          rw.push('RewriteRule ^ - [E=PROTO:https]', 'RewriteCond %{HTTPS} !=on'); if (o.proxy) rw.push('RewriteCond %{HTTP:X-Forwarded-Proto} !=https');
          rw.push('RewriteRule ^ - [E=PROTO:http]');
        } else scheme = 'https';
        if (o.www === 'remove') rw.push('', c('hc_www_remove'), 'RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]', 'RewriteRule ^ ' + scheme + '://%1%{REQUEST_URI} [L,R=301]');
        else { rw.push.apply(rw, ['', c('hc_www_add')].concat(ELIGIBLE, ['RewriteRule ^ ' + scheme + '://www.%1%{REQUEST_URI} [L,R=301]'])); warns.push('hw_www_add'); }
      }
      if (o.auth) rw.push('', c('hc_auth'), 'RewriteCond %{HTTP:Authorization} .', 'RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]');
      if (o.front) rw.push('', c('hc_front', { entry: o.entry }), 'RewriteCond %{REQUEST_FILENAME} !-f', 'RewriteCond %{REQUEST_FILENAME} !-d', 'RewriteRule ^ ' + o.entry + ' [L]');
      blocks.push('<IfModule mod_rewrite.c>\n' + rw.map(function (x) { return x === '' ? '' : x.charAt(0) === '#' ? x.replace(/^/gm, '    ') : '    ' + x.replace(/\n/g, '\n    '); }).join('\n') + '\n</IfModule>');
    }
    if (o.front) blocks.push('DirectoryIndex ' + o.entry + ' index.html');
    warns.push('hw_modules'); if (!blocks.length) warns.push('hw_nothing');
    var text = c('hc_head') + '\n\n' + blocks.join('\n\n') + '\n';
    return { text: text, errors: errors, warnings: warns.filter(function (w, i) { return warns.indexOf(w) === i; }) };
  }

  /* ---------- php.ini ---------- */
  function sizeBytes(s) { var m = /^(\d{1,4})([KMG])$/i.exec(s); if (!m) return null; return parseInt(m[1], 10) * ({ K: 1024, M: 1048576, G: 1073741824 }[m[2].toUpperCase()]); }
  function buildPhpIni(opts, M) {
    var o = Object.assign({}, PHP_DEFAULTS, opts || {}), errors = [], warns = [], prod, c = function (k, p) { return comment(M, k, p, ';'); };
    o.profile = pick(o.profile, ['production', 'development'], 'production'); prod = o.profile === 'production';
    o.memory = pick(o.memory, ['128M', '256M', '512M', '1G'], '256M'); o.tz = pick(o.tz, TIMEZONES, 'Asia/Jakarta');
    if (sizeBytes(o.upload) === null) { errors.push('pe_size'); o.upload = '64M'; }
    if (sizeBytes(o.post) === null) { if (errors.indexOf('pe_size') < 0) errors.push('pe_size'); o.post = '72M'; }
    var t = Number(o.time); if (!(t >= 0 && t <= 3600) || t % 1 !== 0) { errors.push('pe_time'); t = 60; } o.time = t;
    if (o.errorLog !== '' && !/^\/[A-Za-z0-9._\/-]+$/.test(o.errorLog)) { errors.push('pe_log'); o.errorLog = ''; }
    if (sizeBytes(o.post) < sizeBytes(o.upload)) warns.push('pw_post');
    var L = [c('pc_head', { profile: M(prod ? 'pf_prod' : 'pf_dev') }), '', '[PHP]', c(prod ? 'pc_err_prod' : 'pc_err_dev')];
    L.push('display_errors = ' + (prod ? 'Off' : 'On'), 'display_startup_errors = ' + (prod ? 'Off' : 'On'), 'html_errors = Off', 'log_errors = On', 'error_reporting = E_ALL');
    if (o.errorLog) L.push('error_log = ' + o.errorLog);
    L.push('', c('pc_sec'), 'expose_php = Off', 'allow_url_include = Off', 'allow_url_fopen = ' + (o.urlFopen ? 'On' : 'Off'), 'cgi.fix_pathinfo = 0');
    if (prod && o.disableFn) { L.push(c('pc_disable'), 'disable_functions = ' + DISABLED_FN); warns.push('pw_disable'); }
    L.push('', c('pc_limits'), 'memory_limit = ' + o.memory, 'max_execution_time = ' + o.time, 'max_input_time = 60', 'upload_max_filesize = ' + o.upload, 'post_max_size = ' + o.post, 'max_file_uploads = 20', 'max_input_vars = 3000');
    L.push('', c('pc_date'), 'date.timezone = ' + o.tz, 'default_charset = "UTF-8"');
    L.push('', c('pc_session'), 'session.use_strict_mode = 1', 'session.use_only_cookies = 1', 'session.cookie_httponly = 1', 'session.cookie_samesite = Lax', 'session.cookie_secure = ' + (o.sessionSecure ? '1' : '0'));
    if (o.sessionSecure) warns.push('pw_secure');
    L.push('', c('pc_assert'), 'zend.assertions = ' + (prod ? '-1' : '1'));
    if (o.opcache) {
      L.push('', '[opcache]', c(prod ? 'pc_opcache_prod' : 'pc_opcache_dev'), 'opcache.enable = 1', 'opcache.enable_cli = 0', 'opcache.memory_consumption = 128', 'opcache.interned_strings_buffer = 16', 'opcache.max_accelerated_files = 10000',
        'opcache.validate_timestamps = ' + (prod ? '0' : '1'), 'opcache.revalidate_freq = ' + (prod ? '2' : '0'));
      if (prod) warns.push('pw_opcache');
    }
    return { text: L.join('\n') + '\n', errors: errors, warnings: warns };
  }

  var api = { HT_DEFAULTS: HT_DEFAULTS, PHP_DEFAULTS: PHP_DEFAULTS, TIMEZONES: TIMEZONES, CACHE_SEC: CACHE_SEC, HSTS_SEC: HSTS_SEC, DISABLED_FN: DISABLED_FN, sizeBytes: sizeBytes, buildHtaccess: buildHtaccess, buildPhpIni: buildPhpIni };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HtaccessLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
