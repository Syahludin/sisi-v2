# Rancangan Penerusan WO berbasis data lokal + pilih tim dari daftar Temuan Inspeksi (SiSi v2)

Tanggal: 4 Nov 2026. Status: DRAFT, ketiga pertanyaan terbuka sudah dijawab Master Guswan 4 Nov 2026, menunggu persetujuan akhir. Belum ada kode yang ditulis. Belum di-commit.

## Maksud

Menu Penerusan Tim Temuan Inspeksi (`OPS_PENERUSAN_WO`) saat ini membaca seluruh daftar WO ke server setiap dibuka
(`getWoAdmin`: sheet temuan, tindak lanjut, WO ganda, dan `db_Tim`, sampai 500 temuan). Di HP, bacaan ini berkali-kali
gagal dengan pesan "Butuh sinyal untuk memuat WO" (timeout 60 detik atau HTTP error). Web ikut gagal.

Maksud perubahan: layar langsung memakai data yang sudah ada di perangkat, lalu hanya meminta ke server temuan yang
baru atau berubah. Pembukaan menu tidak lagi menunggu pembacaan penuh. Admin yang menginput temuan juga bisa
meneruskan WO-nya langsung dari daftar temuan tanpa pindah menu.

## Keadaan sekarang (hasil membaca kode)

- HP: `wo_admin_screen.dart` menyimpan jawaban terakhir (`SimpananWo`) hanya sebagai cadangan tampilan. Setiap buka
  tetap memanggil `getWoAdmin` penuh. Antrean kirim offline sudah ada (v1.0.47).
- Web: `tembolok.js` menyimpan jawaban `getWoAdmin` / `getPetaTemuan` di localStorage, tetapi tetap meminta jawaban
  penuh dan menimpanya.
- Server: `getWoAdmin_` (`56_TindakLanjut.js`) membaca semua sheet utuh. Pembanding sort-nya sudah diperbaiki 4 Nov 2026
  (tanggal dihitung sekali per baris), belum terbukti memperbaiki kegagalan di produksi.
- `ringkas` (Baru / Terkirim / Dikerjakan / Selesai / Ganda) dihitung dari SEMUA temuan, bukan hanya rentang tanggal
  yang tampil.
- Daftar temuan admin di HP: `input_temuan_inspeksi_screen.dart` (`getTemuanInspeksi`, menu `OPS_INPUT_TEMUAN`). Tiap
  temuan sudah membawa objek `wo` dan `revision` (`temuanKeHpInsJar_`).

## Tujuan, bukan tujuan, anti-tujuan

Tujuan:
- Menu Penerusan WO terbuka seketika dari data lokal; sinkron berikutnya hanya membawa yang baru atau berubah.
- Tampilan di HP dan web tidak pernah salah lebih dari satu siklus sinkron untuk status WO yang sedang dikerjakan.
- Admin yang berhak bisa memilih tim pelaksana dari rincian WO di daftar Temuan Inspeksi, dengan aturan yang sama
  persis dengan Penerusan WO.

Bukan tujuan:
- Mempercepat pembacaan sheet di server. Server masih membaca sheet saat sinkron; yang kecil adalah jawabannya dan
  kerja di perangkat. (Percepatan server dibahas terpisah.)
- Mengubah alur WO (teruskan, pindah, tarik, mulai, selesai, WO ganda), aturan penguncian, atau notifikasi tim.
- Mengubah hak akses menu.

Anti-tujuan (dianggap gagal walau jalan):
- Data lokal yang usang dianggap benar: WO yang sudah dimulai tim atau ditarik tampak masih bisa dipindah.
- Dua jalur meneruskan WO dengan aturan berbeda.
- Admin tanpa `OPS_PENERUSAN_WO` bisa meneruskan WO lewat daftar temuan.

## Bagian A: daftar WO dari data lokal + sinkron selisih

Keputusan Master Guswan:
- Data diunduh sekali saat menu pertama berhasil dibuka, disimpan di perangkat, ditampilkan langsung pada pembukaan
  berikutnya.
- Sinkron berikutnya hanya memproses data yang belum ada atau berubah.
- Aturan siapa yang boleh membuka menu tidak berubah.

Rancangan (pilihan saya, kecuali ditandai):
1. `getWoAdmin` menerima penanda `sejak` (waktu server terakhir sinkron sukses). Tanpa `sejak` = jawaban penuh
   seperti sekarang (unduhan awal).
2. Dengan `sejak`, server membalas hanya temuan yang berubah sesudah penanda, ditambah `ringkas`, daftar `tim`, dan
   penanda baru. `ringkas` dikirim di setiap jawaban karena dihitung dari semua temuan, bukan dari rentang tanggal.
3. "Berubah" harus mencakup perubahan yang TIDAK menyentuh baris temuan: pekerjaan baru di
   `db_temuan_tindak_lanjut` dan perubahan `db_wo_ganda` (klaim, siap, putusan). Temuan dianggap berubah bila salah satu
   dari ketiga sumber itu lebih baru dari `sejak`. Ini titik rawan: bila hanya `timestamp_update` temuan yang dilihat,
   perubahan tersebut hilang dari selisih.
4. Penanda dikurangi beberapa menit (tumpang tindih) supaya penulisan yang selesai belakangan tidak terlewat. Menggabung
   dilakukan per `temuanId` (menimpa), jadi baris ganda tidak masalah.
5. Keputusan Master Guswan: setiap aplikasi dibuka (web: halaman dimuat / login), dilakukan unduhan penuh di belakang layar.
   Bila sinyal lemah atau tidak ada, layar langsung memakai data lokal tanpa menunggu atau menampilkan galat. Unduhan
   penuh ini juga menangkap temuan yang dihapus manual di sheet (tidak terlihat dari selisih). Pembukaan menu sesudahnya
   dalam sesi aplikasi yang sama memakai sinkron selisih. Dijalankan malas: pada pembukaan pertama menu itu di tiap
   peluncuran (tanpa prefetch saat startup). Tombol muat ulang penuh manual tetap ada (pilihan saya).
   Unduhan penuh yang gagal atau terputus tidak menimpa data lokal (ditulis penuh dulu, baru menggantikan).
6. Simpanan lokal dikunci per akun + endpoint + rentang `dari`/`sampai`; mengganti rentang = kunci lain (unduhan penuh
   untuk kunci itu). Filter status (dan penyulang / tim) diterapkan di perangkat; permintaan sinkron selalu
   `status: 'SEMUA'`. Unduhan penuh tetap dibatasi 500 temuan terbaru; selisih tidak dibatasi.
7. Aksi teruskan / pindah / tarik tetap langsung ke server dan ditolak bila konflik (`KONFLIK_REVISION`, WO sudah
   dimulai). Sesudah sukses, baris lokal diperbarui dari jawaban aksi. Sebelum aksi dikirim, aplikasi menyinkron selisih
   sekali supaya keputusan admin memakai data terbaru; server tetap pemutus akhir.
8. Keputusan Master Guswan: berlaku untuk HP dan web, juga layar Pindah Tim TO (`getWoPindah` memakai `getWoAdmin_`) dan peta
   temuan web (`getPetaTemuan`). Web tidak punya halaman Pindah Tim TO, jadi untuk menu itu hanya HP.
9. Foto kecil temuan yang sudah disimpan di perangkat (`FotoServerWo`, `fotoLokal.js`) tetap dipakai apa adanya.

Perilaku gagal:
- Server atau jaringan gagal saat sinkron (termasuk timeout): data lokal tetap tampil, dengan keterangan "terakhir
  diperbarui <waktu>". Pesan "Butuh sinyal untuk memuat WO" hanya muncul bila belum ada data lokal sama sekali.
- Akun berganti atau keluar: data lokal akun itu dibuang di web (seperti `tembolok.js`); di HP tersimpan per akun
  (kunci sudah memuat userId).

## Bagian B: pilih tim dari rincian WO di daftar Temuan Inspeksi

Keputusan Master Guswan:
- Admin menginput temuan; di daftar temuan, rincian WO punya fitur memilih tim pelaksana.
- Alur sesudahnya sama dengan Penerusan Tim Temuan Inspeksi.
- Hanya admin yang punya akses `OPS_PENERUSAN_WO` yang melihat dan boleh memakainya.

Rancangan (pilihan saya):
1. Keputusan Master Guswan: berlaku di HP (`OPS_INPUT_TEMUAN`) dan web (menu Temuan Inspeksi / peta). Tombol "Teruskan ke tim"
   muncul di rincian WO temuan yang belum diteruskan, hanya bila sesi punya `OPS_PENERUSAN_WO`. Pemilih tim dan catatan memakai komponen layar Penerusan WO yang sama (bukan salinan).
2. Memanggil `teruskanWo` yang sama (revision dari temuan). Server sudah menolak tanpa `OPS_PENERUSAN_WO`
   (`02_Router.js`), jadi tombol hanyalah kemudahan, bukan penjaga.
3. Daftar tim dan status WO diambil dari penyimpanan lokal bagian A, supaya tidak ada pembacaan server tambahan.
   Temuan yang baru diinput atau diteruskan memperbarui kedua layar.
4. Pindah dan tarik WO tetap hanya di Pindah Tim TO; tidak ditambah ke daftar temuan.
5. Tidak ada perubahan alur server baru: riwayat `db_wo_riwayat`, audit log, notifikasi ke tim, dan penguncian setelah
   Mulai Kerjakan semua ikut dari `teruskanWo_`.

## Batasan

- Apps Script: server tidak menyimpan keadaan antar panggilan; "perubahan sejak" dihitung dari kolom waktu di sheet.
- Penyimpanan web terbatas (localStorage sekitar 5 MB per situs; sekarang batas 1,5 MB per akun). Semua temuan mungkin
  tidak muat; perlu penyimpanan lebih besar di web (IndexedDB) atau batas jumlah. Diserahkan ke pembangun.
- Versi HP lama tetap harus jalan: tanpa `sejak` server menjawab penuh seperti sekarang.

## Diserahkan ke pembangun

Bentuk penanda dan kolom waktu yang dipakai tiap sumber (format `timestamp_update`, `waktu_klaim`, dan seterusnya),
penyimpanan lokal di web, penamaan, tata letak tombol, dan pengujian (termasuk kasus: pekerjaan tim baru tidak mengubah
baris temuan; WO ditarik admin lain lalu HP ini meneruskan).

## Pertanyaan terbuka

Tidak ada. Jawaban Master Guswan 4 Nov 2026: (1) Bagian B juga di web; (2) sinkron selisih dipakai di Pindah Tim TO dan peta
temuan web; (3) unduhan penuh setiap aplikasi dibuka, tanpa sinyal langsung memakai data lokal (menggantikan batas 24
jam di draf awal).
