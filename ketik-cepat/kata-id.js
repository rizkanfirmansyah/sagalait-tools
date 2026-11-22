/* Daftar kata umum bahasa Indonesia untuk Ketik cepat (687 kata): huruf kecil a sampai z, tanpa duplikat, tanpa kata ofensif. */
(function (root) {
  'use strict';
  var WORDS = (
  "yang dan di ini itu dengan untuk tidak dari dalam akan pada juga saya " +
  "ke karena tersebut bisa ada mereka lebih kita kamu kami dia atau sudah telah " +
  "belum masih sedang hanya sangat saat setelah sebelum antara oleh sebagai seperti jika kalau " +
  "maka agar supaya tetapi namun sehingga bahwa ketika sambil sementara walau meskipun orang anak " +
  "ibu bapak kakak adik teman guru murid dokter petani nelayan pedagang tetangga keluarga saudara " +
  "nenek kakek paman bibi suami istri laki perempuan pemuda warga tamu sahabat kawan pemimpin " +
  "pekerja pegawai rumah kamar dapur pintu jendela atap lantai dinding meja kursi tempat tidur " +
  "lemari sekolah kantor pasar toko jalan jembatan kota desa kampung negara pulau gunung sungai " +
  "laut danau hutan sawah kebun taman pantai pelabuhan stasiun bandara terminal masjid gereja pura " +
  "makan minum nasi roti kue buah sayur ikan ayam daging telur susu gula garam " +
  "air teh kopi sambal tempe tahu bakso soto mie goreng bakar rebus manis asin " +
  "pedas segar panas dingin hangat lapar haus kenyang pergi datang pulang lari duduk berdiri " +
  "bangun mandi baca tulis lihat dengar bicara bilang tanya jawab minta beri ambil bawa " +
  "buka tutup naik turun masuk keluar mulai selesai tunggu cari temukan pilih ganti ubah " +
  "pakai buat bikin kerja belajar main nyanyi tari lompat dorong tarik angkat taruh simpan " +
  "kirim terima beli jual bayar pinjam kembali ingat lupa paham coba bantu tolong jaga " +
  "rawat bersih cuci masak siram tanam panen besar kecil panjang pendek tinggi rendah luas " +
  "sempit berat ringan baru lama muda tua cepat lambat mudah sulit dekat jauh penuh " +
  "kosong terang gelap kotor basah kering keras lunak tajam tumpul kuat lemah senang sedih " +
  "marah takut berani malu bangga yakin ragu sabar rajin malas pintar baik buruk benar " +
  "salah indah cantik tampan ramai sepi aman bahaya sehat sakit lelah tenang satu dua " +
  "tiga empat lima enam tujuh delapan sembilan sepuluh seratus seribu pertama kedua ketiga banyak " +
  "sedikit semua setiap beberapa separuh seluruh hari minggu bulan tahun pagi siang sore malam " +
  "kemarin besok sekarang nanti tadi dulu kelak selalu sering jarang kadang pernah biasa mungkin " +
  "pasti harus boleh mau ingin perlu dapat mampu sempat matahari bintang langit awan hujan " +
  "angin petir badai pelangi cuaca udara tanah batu pasir kayu daun bunga pohon akar " +
  "rumput hewan burung kucing anjing kuda sapi kambing bebek kupu lebah semut nyamuk kata " +
  "kalimat cerita buku surat berita majalah koran kertas pensil pena tinta gambar foto lagu " +
  "musik suara bunyi nada irama puisi bahasa huruf angka nama judul isi pesan kabar " +
  "uang harga biaya gaji untung rugi modal hutang tabungan bank kartu dompet belanja tawar " +
  "murah mahal gratis hadiah pajak mobil motor sepeda bus kereta kapal pesawat truk ban " +
  "mesin bensin kunci tiket jalur lampu rambu parkir macet komputer telepon layar tombol kabel " +
  "baterai listrik internet situs aplikasi program data berkas folder sandi akun alamat jaringan sinyal " +
  "kamera surel waktu ruang dunia alam hidup mati lahir tumbuh cinta benci harap mimpi " +
  "cita rasa pikir hati jiwa tubuh kepala tangan kaki mata telinga hidung mulut gigi " +
  "lidah rambut wajah jari punggung perut dada bahu lutut usaha rencana tugas hasil masalah " +
  "solusi cara tujuan arah sebab akibat contoh bagian jumlah ukuran bentuk warna merah biru " +
  "hijau kuning putih hitam coklat abu ungu jingga ujian nilai kelas pelajaran ilmu sejarah " +
  "budaya seni olahraga permainan juara tim lomba pertandingan latihan obat selamat kasih maaf silakan " +
  "permisi halo sampai jumpa salam hormat mohon atas bawah kiri kanan depan belakang tengah " +
  "samping luar sekitar sini situ sana mana siapa apa kapan kenapa bagaimana berapa bukan " +
  "jangan tanpa pun lagi lalu kemudian akhirnya maupun serta bahkan padahal sedangkan selain terhadap " +
  "tentang menuju melalui menurut sejak hingga demi bagi lembut halus kasar bundar bulat lurus " +
  "miring datar tegak dangkal tebal tipis lebar doa harapan kenangan perjalanan pertemuan kebersamaan kebaikan " +
  "kejujuran kesehatan keselamatan kebahagiaan kesempatan pengalaman pengetahuan pekerjaan perubahan pembangunan pendidikan pemerintah masyarakat kehidupan " +
  "kebutuhan permintaan penjelasan pemandangan percakapan persahabatan kegiatan kemajuan kekuatan keindahan kesabaran bertemu berjalan bermain " +
  "bekerja berbicara berpikir bernyanyi berlari berenang bersama berusaha bercerita berharap berubah berhenti berangkat bergerak " +
  "berbagi berikan membaca menulis membuka menutup membeli menjual memakai membuat menjaga membantu memilih mengambil " +
  "mengirim menerima menunggu menemukan mencari menjadi melihat mendengar mengajar mengerti menyapa menyiram menanam memasak " +
  "mencuci"
  ).split(' ');
  if (typeof module !== 'undefined' && module.exports) module.exports = WORDS;
  root.KATA_ID = WORDS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
