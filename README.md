# Tools SagalaIT Tool

Portal kecil untuk kumpulan tool. Halaman utama (`index.html`) membaca daftar tool dari `tools.json`, jadi menambah atau mengurangi tool cukup mengubah satu file JSON. Tidak ada backend.

## Strukture

```
index.html            portal v2 (membaca tools.json)
portal.css, portal.js gaya dan logika portal (kisi satu layar, pencarian)
tools.json            daftar tool, edit di sini
assets/app.css        token dan komponen bersama v2
assets/theme.js       tema terang/gelap bersama
_styleguide/          panduan token dan komponen (tidak terdaftar di portal)
v1/                   cadangan tampilan lama, dibekukan (tag git v1-final)
serialize-checker/    app 1
json-formatter/       app 2
hitung-byte/          app 3
timer/                app 4
jwt/                  app 5
cron/                 app 6
nginx-generator/      app 7
db-viewer/            app 8
firewall/             app 9
roda-acak/            app 10
db-cmd/               app 11
php-installer/        app 12
json-compare/         app 13
api-docs/             app 14
watermark/            app 15
converter/            app 16
signature/            app 17
game-2048/            app 18 (game; engine.js murni, tes di Node)
```

## Tampilan v2 dan v1

Folder akar adalah tampilan v2. Tampilan lama utuh di `v1/` (`tools.sagalait.cloud/v1/`) dan di tag `v1-final` serta branch `backup/v1`. Di portal, Ctrl atau Cmd + F, `/`, dan Ctrl atau Cmd + K membuka pencarian; di portal Ctrl/Cmd + F menggantikan pencarian bawaan browser, halaman app tidak terpengaruh. Kolom opsional `short` di `tools.json` adalah nama pendek untuk tampilan ponsel.

## Dua bahasa (Indonesia dan Inggris)

Saklar ID/EN ada di bilah atas portal dan semua app. Pilihan disimpan di `localStorage` (`sagalait-lang`); bila belum ada, dipakai bahasa browser (awalan `id` jadi Indonesia, selain itu Inggris). Halaman `v1/` tetap Indonesia.

- Muat `../assets/i18n.js` tepat setelah `theme.js` di `<head>` dan beri `<html data-lang-src="lang.json">`.
- Teks statis: `data-i18n="kunci"` pada elemen tanpa anak; atribut: `data-i18n-attr="placeholder:kunci,aria-label:kunci"`. Teks bahasa Indonesia tetap ditulis di HTML sebagai isi awal.
- Kamus app di `<app>/lang.json` berbentuk `{ "id": {...}, "en": {...} }`. Kunci id dan en harus sama persis, begitu juga parameter `{nama}`. Teks bersama (remah roti, nama grup, tombol umum) ada di `assets/lang/*.json` dengan awalan `common.` dan `group.`.
- Teks dari JS: `SagalaI18n.t('kunci', { param })`. Jalankan inisialisasi app di `SagalaI18n.onReady(...)` dan render ulang bagian dinamis pada event `sagalait:lang` di `document`. Format angka dan tanggal: `Intl` dengan `SagalaI18n.locale`.
- Kunci yang hilang di Inggris memakai teks Indonesia; kunci yang tidak ada sama sekali tampil sebagai kuncinya dan memberi peringatan di console.
- `tools.json` memakai kolom `name_en`, `description_en`, `tags_en`, `short_en`; grup memakai `name_en`; `site` memakai `title_en` dan `tagline_en`.
- Status terjemahan isi app: Inggris penuh pada portal, `signature/`, `watermark/`, dan `game-2048/`. App lain baru menerjemahkan bilah atas, remah roti, dan judul; isinya masih Indonesia. Menambah app baru wajib dwibahasa.

## Menjalankan di lokal

`tools.json` dibaca dengan `fetch`, jadi halaman harus dibuka lewat server, bukan klik dua kali pada file.

```
php -S localhost:8000
# atau
python3 -m http.server 8000
```

Lalu buka http://localhost:8000. Di produksi cukup unggah seluruh folder ke subdomain (misalnya `tools.sagalait.cloud`), tanpa langkah build.

## Menambah tool

1. Buat folder baru berisi `index.html`, misalnya `base64/`.
2. Tambahkan satu objek ke array `tools` di `tools.json`:

```json
{
  "id": "base64",
  "name": "Base64",
  "description": "Encode dan decode teks",
  "group": "teks",
  "path": "base64/",
  "icon": "64",
  "tags": ["encode", "decode"],
  "favorite": false
}
```

| Field | Keterangan |
|---|---|
| `id` | unik, dipakai untuk menyimpan favorite |
| `name`, `description` | teks di daftar |
| `group` | harus sama dengan `id` di array `groups`. Kalau tidak cocok, tool masuk grup "Lainnya" |
| `path` | folder atau alamat tujuan saat diklik |
| `icon` | 1 sampai 3 karakter di kotak ikon |
| `tags` | kata tambahan agar mudah dicari |
| `favorite` | favorit awal. Setelah pengguna mengubahnya, pilihan tersimpan di browser |
| `hidden` | `true` untuk menyembunyikan tool tanpa menghapusnya |

Grup baru: tambahkan `{ "id": "...", "name": "..." }` ke array `groups`. Urutan di JSON adalah urutan tampil.

Teks hero diubah di bagian `site`. `{n}` pada `tagline` diganti jumlah tool yang tampil.

## Catatan

- App di folder sendiri boleh memakai gaya apa saja. Kalau mau mengikuti tampilan portal, muat `../assets/theme.js` dan `../assets/app.css` seperti app yang ada.
- Tema dan favorit disimpan di `localStorage` browser, bukan di server.
