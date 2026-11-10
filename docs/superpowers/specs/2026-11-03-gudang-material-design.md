# Rancangan sistem Gudang Material (SiSi v2)

Tanggal: 3 Nov 2026. Status: disetujui Master Guswan 3 Nov 2026 (delapan pilihan di bagian "Pilihan Master Guswan"). Belum ada kode yang ditulis. Belum di-commit (atas permintaan Master Guswan).

## Maksud

Stok MCB di tim Yandal selama ini tidak tercatat di SiSi. Setiap shift Yandal harus tahu berapa MCB yang ada, setiap
pemakaian harus tercatat (nomor meter, keperluan, foto), dan kalau stok tidak cocok dengan catatan, ada yang mengurus
selisihnya. Admin harus bisa memantau semuanya dan mengelola stok gudang serta kiriman ke tim.

Ini fitur tambahan di app Flutter + backend Apps Script + web admin yang sudah ada, bukan sistem terpisah.

Tahap pertama **hanya MCB**. Strukturnya dibuat supaya material lain bisa ditambah nanti (lewat `db_Material` dan izin
tim), tetapi tidak ada fitur khusus material lain yang dibangun sekarang.

## Tujuan, bukan tujuan, anti-tujuan

Tujuan:
- Stok MCB per tim Yandal (13 sampai 17) selalu bisa dilihat dan dipercaya.
- Tiap pemakaian MCB tercatat lengkap dengan foto, dan bisa dilaporkan dari satu sheet.
- Selisih stok antar shift tidak lolos begitu saja: ada yang memutuskan, dan keputusannya tercatat.
- Admin mengelola stok gudang, mengirim stok ke tim, dan mengoreksi data.

Bukan tujuan (tahap ini):
- Material selain MCB. Pemeriksaan shift untuk tim non-Yandal (Hartek dan lain-lain). Notifikasi (lonceng / push).
- Nomor seri per MCB. MCB dibedakan hanya menurut Daya, Merk, dan Status.
- Laporan bulanan / grafik. Yang ada: daftar stok, daftar pemakaian, daftar selisih, riwayat koreksi.

Anti-tujuan (dianggap gagal walau secara teknis jalan):
- Stok berubah tanpa jejak (siapa, kapan, kenapa).
- Petugas memakai material saat stok tim sedang dipertanyakan.
- Material lama Hartek / WO tiba-tiba hilang dari pilihan karena aturan izin baru.

## Pengguna dan akses

- **Petugas Yandal**: menu **Stok Material** di HP. Memeriksa stok awal shift, mencatat pemakaian, mengisi pemakaian susulan.
- **Admin / Super**: menu **Material Gudang** di **web dan HP** (isi sama, satu set endpoint backend). Berisi Stok Material, Persetujuan Selisih, Pemakaian,
  Izin Material, dan tambah / kirim stok.
- Akses diatur lewat `db_Menu` + `db_Akses` seperti menu lain. Server menegakkan peran dan akses UBAH / LIHAT pada setiap
  endpoint; layar hanya menyembunyikan tombol.
- Petugas hanya bisa bertindak untuk **tim miliknya** (tim dari `db_Petugas.tim`) dan hanya untuk material yang
  tim itu **diizinkan** memakainya.

## Model data

Enam sheet baru di spreadsheet baru **SiSi_Gudang** (Script Property `GUDANG_SHEET_ID`, ditambahkan ke `cfg_()` dan
`CFG_JSON` mengikuti pola `ABSENSI_SHEET_ID`), satu sheet baru di SiSi_Master. Semua sheet punya kolom pertama **`No`**
(nomor urut baris, diisi otomatis saat baris ditambah, **bukan kunci**; kunci dan rujukan memakai kolom `*_id`).
Tim disimpan sebagai `tim_id` (UUID `db_Tim`), petugas sebagai `petugas_id`. Kolom `revision`, `diubah_pada`,
`diubah_oleh` mengikuti sheet master yang ada. Nama kolom boleh disesuaikan pelaksana dengan pola sheet lain; makna
kolom tidak boleh berubah.

### SiSi_Master: `db_Material` (sudah ada, dipakai ulang)
Kolom sudah ada: `nomor`, `nama_material`, `satuan`, `aktif`, `material_id`, `revision`, `timestamp_update`, `diubah_oleh`.
Tambah satu baris **MCB** (satuan `unit`). Tidak ada perubahan struktur.

### SiSi_Master: `db_Material_Tim` (baru): tim mana boleh memakai material apa
`No`, `izin_id`, `material_id`, `tim_id`, `aktif`, `revision`, `diubah_pada`, `diubah_oleh`

### SiSi_Gudang: `db_Material_Mutasi`: buku stok gudang dan stok tim (sumber kebenaran stok)
`No`, `mutasi_id`, `waktu`, `jenis_mutasi`, `lokasi`, `material_id`, `daya`, `merk`, `status_mcb`, `jumlah`,
`ref_jenis`, `ref_id`, `catatan`, `foto`, `link_foto`, `dibuat_oleh`, `dibuat_pada`
- `jenis_mutasi`: `MASUK_GUDANG`, `KIRIM_TIM`, `TARIK_TIM`, `KOREKSI_GUDANG`, `KOREKSI_TIM`, `PAKAI`, `HILANG`, `TAMBAHAN`.
- `lokasi`: `GUDANG` atau `tim_id`. `jumlah` bertanda (tambah positif, kurang negatif).
- `KIRIM_TIM` ditulis sebagai dua baris dalam satu operasi: gudang minus, tim plus (atomik, lihat Konsistensi).
  `TARIK_TIM` kebalikannya: tim minus, gudang plus, juga dua baris dalam satu operasi.
- Baris mutasi **tidak pernah diubah atau dihapus**. Koreksi = baris mutasi baru yang membalik / menggantikan.

### SiSi_Gudang: `db_Stok_Pemeriksaan`: pemeriksaan awal shift (satu baris per shift per tim)
`No`, `pemeriksaan_id`, `tanggal`, `tim_id`, `shift`, `petugas_id`, `waktu_input`, `total_input`, `total_perkiraan`,
`status`, `foto_stok`, `link_foto_stok`, `revision`, `diubah_pada`, `diubah_oleh`
- `status`: `COCOK`, `MENUNGGU_ADMIN`, `DISETUJUI`, `DIKEMBALIKAN` (admin memilih SALAH_HITUNG; petugas menghitung ulang).

### SiSi_Gudang: `db_Stok_Pemeriksaan_Item`: rincian per jenis MCB dalam satu pemeriksaan
`No`, `item_id`, `pemeriksaan_id`, `daya`, `merk`, `status_mcb`, `jumlah_input`, `jumlah_perkiraan`, `selisih`

### SiSi_Gudang: `db_Pemakaian_MCB`: sheet pelaporan pemakaian
`No`, `pemakaian_id`, `nomor_pemakaian`, `tanggal`, `waktu`, `tim_id`, `shift`, `nomor_meter`, `daya`, `merk_mcb`,
`keperluan`, `petugas_id`, `status_mcb`, `foto_penggunaan`, `link_foto`, `jenis_catatan`, `diisi_oleh`, `diisi_pada`,
`revision`, `diubah_pada`, `diubah_oleh`
- `status_mcb`: `Baru` atau `Ex-Handal`. `jenis_catatan`: `NORMAL`, `SUSULAN`, `DIKOREKSI` (ditambah `BATAL` untuk
  pemakaian yang dibatalkan admin, lihat Koreksi).
- Sheet ini yang dibaca sebagai laporan; judul kolom tampilnya boleh dibuat terbaca (Nomor Meter, Merk MCB, Keperluan
  Penggunaan, Status MCB, dan seterusnya) mengikuti sheet Yandal yang ada (`yan_P0`).

### SiSi_Gudang: `db_Stok_Selisih`
`No`, `selisih_id`, `pemeriksaan_id`, `tim_id`, `daya`, `merk`, `status_mcb`, `jumlah_perkiraan`, `jumlah_input`,
`selisih`, `arah`, `status`, `cara_penyelesaian`, `pemakaian_id`, `catatan_admin`, `diselesaikan_oleh`, `diselesaikan_pada`
- `arah`: `KURANG` atau `LEBIH`. `status`: `MENUNGGU` atau `SELESAI`.
- `cara_penyelesaian`: `SUSULAN`, `HILANG`, `TAMBAHAN_MASUK`, `SALAH_CATAT`, `SALAH_HITUNG`.

### SiSi_Gudang: `db_Material_LogKoreksi`: jejak perubahan
`No`, `log_id`, `waktu`, `jenis_objek` (`PEMAKAIAN`, `STOK`, `PEMERIKSAAN`), `objek_id`, `kolom`, `nilai_lama`,
`nilai_baru`, `alasan`, `oleh`

## Aturan stok

- **Jenis MCB** = kombinasi (`material_id`, `daya`, `merk`, `status_mcb`). Stok dihitung per jenis.
- **Saldo** suatu lokasi untuk suatu jenis = jumlah semua baris mutasi lokasi itu untuk jenis itu. Tidak ada angka saldo
  yang disimpan.
- **Perkiraan** stok tim saat pemeriksaan awal = saldo tim saat itu. Artinya sudah memuat: kiriman admin sejak shift
  lalu, semua pemakaian yang tercatat, dan koreksi.
- **Stok sesudah shift** tidak punya langkah atau sheet sendiri: itu saldo tim sebelum pemeriksaan shift berikutnya.
  Hitungan awal shift berikutnya adalah konfirmasinya.

## Alur Yandal (HP): menu Stok Material

### 1. Pemeriksaan awal shift
1. Petugas memasukkan MCB yang ada **satu per satu** (tiap entri: Daya, Merk, Status). Layar menjumlahkannya per jenis.
2. Petugas mengambil **satu foto stok** (satu kolom foto + link Drive, wajib).
3. Server membandingkan hitungan dengan perkiraan **per jenis**.
   - Semua jenis sama: `status = COCOK`, petugas langsung boleh mencatat pemakaian.
   - Ada beda (kurang atau lebih): `status = MENUNGGU_ADMIN`, satu baris `db_Stok_Selisih` per jenis yang beda.
     Pemakaian baru **diblokir** sampai selesai, kecuali pemakaian susulan (lihat 2).
4. Pemeriksaan pertama sebuah tim (saldo awal nol) akan menghasilkan selisih LEBIH. Cara awal yang benar: admin
   lebih dulu mencatat `MASUK_GUDANG` lalu `KIRIM_TIM` supaya perkiraan tim sudah terisi.
5. Tidak ada langkah "tutup shift". Pemeriksaan hanya sekali di awal shift.

### 2. Selisih KURANG karena lupa mencatat pemakaian
- Layar menampilkan MCB yang kurang. Untuk tiap MCB petugas memilih **Isi pemakaian susulan** (Nomor Meter, Keperluan,
  foto bila ada) atau membiarkannya **Tidak diketahui**.
- Pemakaian susulan dicatat atas nama **shift dan petugas sebelumnya** (tanggal, shift, tim dari shift lama),
  `jenis_catatan = SUSULAN`, `diisi_oleh` = petugas yang mengisi. `nomor_pemakaian` melanjutkan urutan kode shift lama.
  Ia menimbulkan mutasi `PAKAI` sehingga perkiraan turun dan selisih terkait selesai (`cara_penyelesaian = SUSULAN`)
  **tanpa menunggu admin**; petugas langsung boleh lanjut. Admin memeriksa daftar SUSULAN sesudahnya.
- Sisa selisih yang tidak ditutup susulan adalah **Tidak diketahui** dan butuh persetujuan admin (lihat alur admin).

### 3. Mencatat pemakaian
- Petugas memilih MCB dari stok tim yang **ada** (jenis dengan saldo lebih dari nol), mengisi Nomor Meter dan Keperluan,
  mengambil **Foto Penggunaan** (wajib; kolom foto + link Drive). Status MCB (Baru / Ex-Handal) mengikuti jenis yang dipilih.
- Server membuat `nomor_pemakaian`, menulis baris `db_Pemakaian_MCB` dan mutasi `PAKAI` (tim, minus satu) dalam satu operasi.
- Tidak bisa memakai jenis yang saldonya nol, dan tidak bisa memakai material yang tidak diizinkan untuk timnya.

## Alur Admin (web dan HP): menu Material Gudang

- **Stok Material**: saldo gudang dan saldo tiap tim per jenis; riwayat mutasi; filter tim, jenis MCB, tanggal, merk.
- **Tambah stok gudang** (`MASUK_GUDANG`) dan **Kirim ke tim** (`KIRIM_TIM`, hanya ke tim yang diizinkan memakai
  materialnya). Yang dikirim langsung masuk ke saldo tim. Kolom foto + link tersedia pada transaksi ini (boleh kosong).
- **Tarik ke Gudang** (`TARIK_TIM`): admin memilih tim, jenis MCB (Daya, Merk, Status), jumlah, dan alasan wajib; foto
  boleh kosong. Jumlah tidak boleh melebihi saldo tim untuk jenis itu. Saldo tim berkurang dan saldo gudang bertambah
  dalam satu operasi semua-atau-tidak. **Hanya admin** yang menarik; petugas Yandal tidak bisa mengajukan atau menarik.
  Stok "tanpa izin" (lihat Izin) punya tombol cepat **Tarik semua** yang memakai jalur yang sama. Penarikan langsung
  masuk ke perkiraan pemeriksaan awal shift berikutnya.
- **Koreksi stok** (`KOREKSI_GUDANG` / `KOREKSI_TIM`): jumlah baru atau selisih, alasan wajib.
- **Persetujuan Selisih**: daftar selisih berstatus `MENUNGGU` (Tidak diketahui, kurang maupun lebih). Admin memilih
  per baris:
  - KURANG: `HILANG` (mutasi `HILANG`, MCB keluar dari stok, kejadian tetap tercatat); atau `SUSULAN` (admin mengisi
    pemakaiannya setelah bertanya ke petugas); atau `SALAH_HITUNG` (pemeriksaan dikembalikan agar petugas menghitung ulang).
  - LEBIH: `TAMBAHAN_MASUK` (mutasi `TAMBAHAN`, mis. Ex-Handal kembali) atau `SALAH_CATAT`.
  - Alasan / catatan wajib. Tiap cara menulis sendiri mutasi yang menyamakan saldo jenis itu dengan hitungan petugas (`HILANG`, `TAMBAHAN`, atau `PAKAI`
    lewat pemakaian susulan; SALAH_CATAT dan SALAH_HITUNG tanpa mutasi). Setelah semua selisih sebuah pemeriksaan selesai, `status = DISETUJUI`; **stok yang ada langsung dapat digunakan**.
  - Kalau hitungan sama dengan perkiraan, tidak ada persetujuan sama sekali.
- **Pemakaian**: daftar pemakaian dengan filter; admin dapat **mengoreksi** (lihat Koreksi) dan menandai SUSULAN
  untuk diperiksa. Admin melihat daftar SUSULAN dan DIKOREKSI.
- **Izin Material**: lihat bagian Izin.

## Koreksi

- Admin dapat mengubah pemakaian yang sudah diinput (Nomor Meter, Keperluan, Daya, Merk, Status MCB). Mengubah jenis MCB
  (Daya / Merk / Status) mengubah stok: server menulis mutasi pembalik untuk jenis lama dan mutasi `PAKAI` untuk jenis
  baru. Baris diberi `jenis_catatan = DIKOREKSI`.
- Admin dapat **membatalkan** pemakaian (`BATAL`): mutasi pembalik mengembalikan MCB ke stok tim.
- Setiap koreksi menulis baris `db_Material_LogKoreksi` (nilai lama, nilai baru, alasan, siapa, kapan). Alasan wajib.
- Koreksi tidak mengubah selisih yang sudah selesai; ia hanya memengaruhi perkiraan pemeriksaan berikutnya.

## Izin material per tim

- Material hanya boleh dipakai tim yang punya baris aktif di `db_Material_Tim`. **Material tanpa izin tidak boleh dipakai**
  (tidak muncul di pilihan, dan server menolak).
- Layar **Izin Material** (admin): pilih material, tampil tim aktif dikelompokkan menurut jenis tim dengan kotak centang
  dan pintasan "pilih semua tim jenis ini". Mencabut izin menonaktifkan baris (`aktif` salah), tidak menghapusnya.
  Izin **boleh dicabut walau tim masih punya stok** material itu. Akibatnya stok menjadi "tanpa izin": tetap tampil di
  Stok Material dengan tanda, tidak bisa dipakai, dan tidak ikut pemeriksaan awal shift; admin menyelesaikannya dengan
  **Tarik ke Gudang** (atau koreksi stok tim bila jumlahnya memang salah). Mencabut izin menampilkan peringatan jumlah
  stok yang tertinggal.
- **Dampak ke fitur lama**: pilihan material Hartek dan WO Tindak Lanjut kini disaring oleh izin tim
  (`50_Hartek.js` baris ±293 dan ±705, `56_TindakLanjut.js` baris ±494 dan ±662, serta `tabelMaterialHartek_` yang
  dipakai migrasi). Material lama hanya dipakai tim Hartek, jadi alat admin sekali jalan
  **`ADMIN_isiIzinMaterialAwal`** membuat baris izin untuk **semua material aktif × semua tim aktif berjenis Hartek**
  (aman diulang, tidak menggandakan baris). Alat ini **wajib dijalankan sebelum** aturan izin diaktifkan di lingkungan
  mana pun, kalau tidak Hartek dan WO melihat daftar material kosong. Tes wajib membuktikan Hartek dan WO tetap
  menerima material lama.
- Kelak Hartek memakai MCB: cukup tambah baris izin MCB untuk tim Hartek. Alur pemeriksaan shift untuk Hartek
  bukan bagian rancangan ini.

## Foto

- Folder Drive privat baru, Script Property `GUDANG_FOTO_FOLDER_ID` (pola `FOTO_TEMUAN_FOLDER_ID` /
  `YANDAL_FOTO_FOLDER_ID`). Foto diunggah lewat server, dibaca lewat server (Drive privat), mengikuti cara foto P0 /
  temuan yang sudah ada.
- Satu foto stok per pemeriksaan (kolom `foto_stok` + `link_foto_stok`), satu foto per pemakaian (`foto_penggunaan` +
  `link_foto`), satu foto opsional per transaksi admin (`foto` + `link_foto` di mutasi).
- Foto pemakaian susulan: boleh kosong.

## Konsistensi dan guard

- Semua penulisan yang menyentuh lebih dari satu baris (kirim stok, pemakaian + mutasi, persetujuan selisih,
  koreksi) dilakukan di dalam `LockService` dan **semua-atau-tidak**: tidak boleh ada pemakaian tanpa mutasi atau
  sebaliknya.
- Pemakaian dan pemeriksaan membawa `idBaris` buatan HP sekali per form (pola `simpanTemuanInspeksi`): kirim ulang
  tidak menggandakan baris. Pengubahan memakai `revision`; beda revision = `DATA_BERUBAH`.
- Validasi input di server: material diizinkan untuk tim, jenis MCB ada di saldo, jumlah bilangan bulat positif,
  tanggal / shift sah, panjang teks, foto wajib sesuai aturan di atas.
- Otorisasi: petugas hanya timnya; admin hanya dengan akses menu yang sesuai; endpoint admin (termasuk penarikan) ditambahkan ke tiga daftar
  audit guard di `tests/backend.test.js` (cekMilik, matriks guard, daftar 'awal') seperti catatan di pratinjau mingguan.
- Pemakaian diblokir saat tim punya pemeriksaan `MENUNGGU_ADMIN` (kecuali susulan), dan saat pemeriksaan shift berjalan
  belum dilakukan.

## Pilihan Master Guswan (dikonfirmasi 3 Nov 2026; poin 9 menyusul di hari yang sama)

1. **Lokasi data**: spreadsheet baru SiSi_Gudang, bukan memperluas SiSi_Yandal, supaya modul tidak terikat Yandal.
2. **Admin di web dan HP** (Approval P0 juga di keduanya). Yandal hanya di HP.
3. **Pemeriksaan dan pemakaian butuh sinyal** (server harus menghitung perkiraan dan saldo). Tidak ada antrean
   offline seperti Temuan Inspeksi pada tahap ini.
4. **Format Nomor Pemakaian**: `<Kode Shift>-MCB.nnn`, nomor urut per shift per tim, tidak dipakai ulang, mengikuti
   `<Kode Shift>-P0.nnn`. Pemakaian susulan melanjutkan urutan kode shift lama.
5. **Pemakaian dibatalkan** memakai `jenis_catatan = BATAL` dan mutasi pembalik, bukan penghapusan baris.
6. **Foto wajib** untuk pemeriksaan dan pemakaian Yandal; opsional untuk transaksi admin dan pemakaian susulan.
7. **Satu foto stok per pemeriksaan**, bukan satu per jenis MCB.
8. **Cabut izin boleh walau stok masih ada** (stok jadi "tanpa izin", lihat bagian Izin).
9. **Penarikan dari tim ke gudang hanya oleh admin** (mutasi `TARIK_TIM`); petugas tidak bisa mengajukan.

## Diserahkan ke pelaksana

- Nama final kolom / sheet (mengikuti pola yang ada), nama kode menu di `db_Menu`, tampilan layar HP dan web.
- Tampilan admin di HP dan web memakai endpoint yang sama; pelaksana memutuskan layar HP mana yang cukup berupa daftar.
- Cara menentukan "shift berjalan" dan "shift sebelumnya" dengan data `yan_Shift` yang sudah ada, termasuk kasus
  shift pertama tim dan pergantian tanggal.
- Pembagian modul backend (nomor berkas), tes, dan urutan rilis (staging dulu).
- Pengisian awal baris `MCB` di `db_Material` dan baris `db_Material_Tim` untuk Yandal 13 sampai 17 (lewat alat admin).

## Risiko

- Mengaktifkan aturan izin tanpa menjalankan `ADMIN_isiIzinMaterialAwal` mengosongkan pilihan material Hartek / WO.
- Pemeriksaan awal yang selisih menghentikan pemakaian sampai admin bertindak; admin yang lama tidak merespons
  menghambat kerja Yandal (sengaja, sesuai permintaan Master Guswan; susulan sengaja tidak menunggu admin).
- Tanpa nomor seri, MCB berjenis sama tidak dapat dibedakan; pelacakan per unit tidak mungkin.
- Sinyal buruk di lapangan memperlambat pemeriksaan dan pemakaian (lihat pilihan 3).
- Izin yang dicabut meninggalkan stok "tanpa izin" yang harus dibereskan admin; tanpa tampilan khusus, stok ini terlupakan.

## Pengujian

- Tes murni: perhitungan saldo dari mutasi, perbandingan perkiraan vs hitungan per jenis, pembentukan Nomor Pemakaian,
  aturan izin (dengan dan tanpa baris izin), mutasi pembalik pada koreksi dan pembatalan.
- Tes backend: setiap endpoint (otorisasi, validasi, `idBaris` idempotensi, `DATA_BERUBAH`), blokir pemakaian saat
  selisih, susulan menutup selisih tanpa admin, persetujuan admin menyamakan saldo, penarikan memindahkan saldo tim ke gudang secara atomik dan ditolak bila melebihi saldo, Hartek / WO tetap menerima material lama
  sesudah `ADMIN_isiIzinMaterialAwal`.
- Tes web untuk logika layar admin; `flutter analyze` + tes model untuk layar Yandal.
