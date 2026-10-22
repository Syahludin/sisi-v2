/**
 * Satu-satunya pintu masuk. Hanya doPost, doGet, rpc yang publik.
 * Semua fungsi lain diakhiri "_" sehingga tidak bisa dipanggil dari luar.
 *
 * publik : tanpa sesi (cuma ping & login)
 * menu   : kode menu di db_Menu yang wajib dimiliki sesi
 * tulis  : butuh aksi UBAH (ADMIN_ES dengan LIHAT otomatis ditolak)
 * platform: menu WEB hanya lewat rpc, menu MOBILE hanya lewat doPost, KEDUANYA dua-duanya (guard_)
 * syncShift: (v0.63.4) tetap boleh untuk akun YANDAL sesudah akhir shift sampai akhir mode sync; lainnya SHIFT_BERAKHIR
 * batasMenit: rem per sesi untuk endpoint berat (baca sheet penuh / Drive). Semua endpoint bersesi juga kena
 *            rem umum GUARD_BATAS_UMUM_ per sesi per menit (v0.42, audit 4 Okt 2026).
 */
var PAYLOAD_MAKS_ = 4 * 1024 * 1024;

function endpoints_() {
  return {
    ping:      { fn: ping_, publik: true },
    login:     { fn: login_, publik: true },   // v0.86.0-fix2: tanpa flag tulis (publik tidak melewati guard_)
    // v0.63.0: login tahap 2 akun YANDAL (tiket dari login, tanpa token)
    mulaiShiftYandal: { fn: mulaiShiftYandal_, publik: true },
    // v0.63.4 syncShift: boleh dipanggil akun YANDAL sesudah akhir shift (mode sync: kirim data lalu logout)
    cekSesi:   { fn: cekSesi_, syncShift: true, batasMenit: 30 },
    logout:    { fn: logout_, syncShift: true, batasMenit: 10 },
    // v0.67.0: Ganti Password pemilik akun (Pengaturan). Tanpa menu: semua akun bersesi kecuali tim YANDAL (dicek di fungsi).
    gantiPassword: { fn: gantiPassword_, batasMenit: 5 },
    getMaster: { fn: getMaster_, batasMenit: 30 },
    // v0.83.0: daftar token notifikasi FCM (akun YANDAL + ADMIN / SUPER dari HP, dicek di fungsi). syncShift: HP Yandal
    // tetap bisa mendaftar di mode sync akhir shift (pengingat shift berikutnya dikirim ke HP terakhir yang login).
    daftarNotif: { fn: daftarNotif_, syncShift: true, batasMenit: 10 },
    // v0.84.0 / v0.85.0: menu Pemakaian Engine (OPS_ENGINE, ADMIN / SUPER dicek di fungsi): kuota Apps Script + Cloud Run per layanan
    getPemakaian: { fn: getPemakaian_, menu: 'OPS_ENGINE', batasMenit: 10 },   // v0.76.1 audit guard: semua endpoint bersesi punya rem sendiri
    getKodeRow: { fn: getKodeRow_, menu: 'ROW_EKSEKUSI', batasMenit: 30 },
    syncRow:   { fn: syncRow_, menu: 'ROW_EKSEKUSI', tulis: true, batasMenit: 20 },
    uploadFotoRow: { fn: uploadFotoRow_, menu: 'ROW_EKSEKUSI', tulis: true, batasMenit: 30 },
    getFotoRow: { fn: getFotoRow_, menu: 'ROW_EKSEKUSI', batasMenit: 40 },
    getLaporanRow: { fn: getLaporanRow_, menu: 'ROW_LAPORAN', batasMenit: 30 },
    getArsipRow: { fn: getArsipRow_, menu: 'ROW_LAPORAN', batasMenit: 20 },
    getArsipHariRow: { fn: getArsipHariRow_, menu: 'ROW_LAPORAN', batasMenit: 10 },
    getFotoArsipRow: { fn: getFotoArsipRow_, menu: 'ROW_LAPORAN', batasMenit: 40 },
    // v0.57: Laporan UP3 dan Laporan UIW jadi 2 menu (akses per laporan di db_Akses)
    getLaporanUp3: { fn: getLaporanUp3_, menu: 'OPS_LAP_UP3', batasMenit: 20 },
    simpanLaporanUp3: { fn: simpanLaporanUp3_, menu: 'OPS_LAP_UP3', tulis: true, batasMenit: 10 },
    getLaporanUiw: { fn: getLaporanUiw_, menu: 'OPS_LAP_UIW', batasMenit: 20 },
    simpanLaporanUiw: { fn: simpanLaporanUiw_, menu: 'OPS_LAP_UIW', tulis: true, batasMenit: 10 },
    // v0.63.0: Pindah Tim Petugas Yandal (ADMIN / SUPER)
    getPetugasYandal: { fn: getPetugasYandal_, menu: 'OPS_PETUGAS_YANDAL', batasMenit: 20 },
    simpanPetugasYandal: { fn: simpanPetugasYandal_, menu: 'OPS_PETUGAS_YANDAL', tulis: true, batasMenit: 10 },
    // v0.63.5: Arsip P0 (tim akun YANDAL sendiri) + Rank Yandal (beranda). Tanpa menu: dibatasi di fungsi.
    getArsipYandal: { fn: getArsipYandal_, batasMenit: 20 },
    getRankYandal: { fn: getRankYandal_, batasMenit: 20 },
    // v0.99.0: Laporan per Tim untuk tim YANDAL (admin): status login per shift + rekap & daftar P0. Hanya baca.
    getLaporanTimYandal: { fn: getLaporanTimYandal_, menu: 'ROW_LAPORAN', batasMenit: 20 },
    // v0.65.0: kirim P0 + foto P0 dari HP (tanpa menu: dibatasi di fungsi ke PETUGAS YANDAL dari HP).
    // syncShift: tetap boleh sesudah akhir shift (mode sync) supaya P0 shift itu bisa dikirim sebelum logout.
    simpanP0Yandal: { fn: simpanP0Yandal_, syncShift: true, batasMenit: 40 },
    uploadFotoP0Yandal: { fn: uploadFotoP0Yandal_, syncShift: true, batasMenit: 40 },
    // v0.66.0: Pengecekan Switching (anak P0), aturan sama dengan kirim P0
    simpanSwitchingYandal: { fn: simpanSwitchingYandal_, syncShift: true, batasMenit: 40 },
    uploadFotoSwitchingYandal: { fn: uploadFotoSwitchingYandal_, syncShift: true, batasMenit: 40 },
    // v0.74.0: Pengecekan Gardu (anak P0), aturan sama dengan switching. Foto 10 wajib + 1 opsional per pengukuran.
    simpanGarduYandal: { fn: simpanGarduYandal_, syncShift: true, batasMenit: 40 },
    uploadFotoGarduYandal: { fn: uploadFotoGarduYandal_, syncShift: true, batasMenit: 60 },
    // v0.75.0: Approval P0 (menu OPS_VERIFIKASI_P0, khusus ADMIN / SUPER dicek di fungsi) + aturan Yandal (Pengaturan)
    getApprovalP0: { fn: getApprovalP0_, menu: 'OPS_VERIFIKASI_P0', batasMenit: 30 },
    getFotoApprovalP0: { fn: getFotoApprovalP0_, menu: 'OPS_VERIFIKASI_P0', batasMenit: 80 },
    simpanApprovalP0: { fn: simpanApprovalP0_, menu: 'OPS_VERIFIKASI_P0', tulis: true, batasMenit: 40 },
    ubahJenisP0: { fn: ubahJenisP0_, menu: 'OPS_VERIFIKASI_P0', tulis: true, batasMenit: 20 },
    simpanAturanYandal: { fn: simpanAturanYandal_, menu: 'OPS_VERIFIKASI_P0', tulis: true, batasMenit: 10 },
    // v0.70.0: Berita Acara Gardu (menu OPS_BA_GARDU, khusus ADMIN / SUPER dicek di fungsi)
    getNomorGarduBaru: { fn: getNomorGarduBaru_, menu: 'OPS_BA_GARDU', batasMenit: 30 },
    getOwnerIdGardu: { fn: getOwnerIdGardu_, menu: 'OPS_BA_GARDU', batasMenit: 30 },
    uploadFotoBaGardu: { fn: uploadFotoBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 40 },
    simpanBaGardu: { fn: simpanBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 10 },
    // v0.71.0: PDF BA lewat Cloud Run sisi-pdf-engine (stateless) + daftar BA untuk buat / buat ulang / buka PDF
    getDaftarBaGardu: { fn: getDaftarBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 30 },
    buatPdfBaGardu: { fn: buatPdfBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 6 },
    // v0.76.0: BA tanpa Drive di HP (foto / PDF lewat server) + edit BA
    getBaGardu: { fn: getBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 30 },
    getFotoBaGardu: { fn: getFotoBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 40 },
    getPdfBaGardu: { fn: getPdfBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 20 },
    ubahBaGardu: { fn: ubahBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 10 },
    // v0.78.0: BA TTD (upload per bagian <= 2 MB), Kirim EAM format v1, Update Master Gardu dari BA TTD
    uploadTtdBaGardu: { fn: uploadTtdBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 30 },
    getTtdBaGardu: { fn: getTtdBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 20 },
    kirimEamBaGardu: { fn: kirimEamBaGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 20 },
    updateMasterGarduBa: { fn: updateMasterGarduBa_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 10 },
    // v0.73.0: pesan nomor gardu per BA (watermark kamera = nomor final)
    pesanNomorGardu: { fn: pesanNomorGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 30 },
    lepasNomorGardu: { fn: lepasNomorGardu_, menu: 'OPS_BA_GARDU', tulis: true, batasMenit: 30 },
    // v0.86.0: file Arsip BA v1 (baca saja, sheet arsip_BA_V1); daftar arsip ikut getDaftarBaGardu sumber V1 / SEMUA
    getFileArsipBaGardu: { fn: getFileArsipBaGardu_, menu: 'OPS_BA_GARDU', batasMenit: 20 },
    // v0.87.0: inputan Hartek petugas (PETUGAS HARTEK, hari ini saja untuk tulis). Lihat modules/71_Hartek.js
    getMaterialHartek: { fn: getMaterialHartek_, menu: 'OPS_HARTEK_INPUT', batasMenit: 30 },
    getHartekHarian: { fn: getHartekHarian_, menu: 'OPS_HARTEK_INPUT', batasMenit: 30 },
    getJaringanHartek: { fn: getJaringanHartek_, menu: 'OPS_HARTEK_INPUT', batasMenit: 30 },
    getJenisPekerjaanHartek: { fn: getJenisPekerjaanHartek_, menu: 'OPS_HARTEK_INPUT', batasMenit: 30 },   // v0.91.0
    buatHeaderHartek: { fn: buatHeaderHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 20 },
    ubahHeaderHartek: { fn: ubahHeaderHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    simpanPgHartek: { fn: simpanPgHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    simpanPekerjaanHartek: { fn: simpanPekerjaanHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    ubahPekerjaanHartek: { fn: ubahPekerjaanHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },   // v0.97.0: ubah jumlah rincian
    simpanMaterialHartek: { fn: simpanMaterialHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 40 },
    simpanGroundingHartek: { fn: simpanGroundingHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    simpanPemerataanHartek: { fn: simpanPemerataanHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    uploadFotoHartek: { fn: uploadFotoHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 60 },   // v1.0.0: foto grounding / pemerataan
    // v1.0.0: Inspeksi Jaringan petugas (PETUGAS INSPEKSI_JARINGAN, tulis hari ini saja). Lihat modules/73_InsJar.js
    getMasterInsJar: { fn: getMasterInsJar_, menu: 'OPS_INSJAR_INPUT', batasMenit: 30 },
    getInsJarHarian: { fn: getInsJarHarian_, menu: 'OPS_INSJAR_INPUT', batasMenit: 30 },
    buatHeaderInsJar: { fn: buatHeaderInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 20 },
    ubahHeaderInsJar: { fn: ubahHeaderInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 30 },
    simpanRealisasiInsJar: { fn: simpanRealisasiInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 30 },
    ubahRealisasiInsJar: { fn: ubahRealisasiInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 30 },
    simpanTemuanInsJar: { fn: simpanTemuanInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 40 },
    ubahTemuanInsJar: { fn: ubahTemuanInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 40 },   // v1.0.5
    uploadFotoInsJar: { fn: uploadFotoInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 60 },   // v1.0.0
    getFotoTemuanInsJar: { fn: getFotoTemuanInsJar_, menu: 'OPS_INSJAR_INPUT', batasMenit: 80 },   // v1.0.19
    // v1.0.8: Inspeksi Gardu petugas (PETUGAS INSPEKSI_GARDU). Lihat modules/74_InsDu.js
    getMasterInsDu: { fn: getMasterInsDu_, menu: 'OPS_INSDU_INPUT', batasMenit: 30 },
    getInsDuHarian: { fn: getInsDuHarian_, menu: 'OPS_INSDU_INPUT', batasMenit: 30 },
    buatHeaderInsDu: { fn: buatHeaderInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 20 },
    ubahHeaderInsDu: { fn: ubahHeaderInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 30 },
    simpanRealisasiInsDu: { fn: simpanRealisasiInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 30 },
    ubahRealisasiInsDu: { fn: ubahRealisasiInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 30 },   // v1.0.14
    simpanPengukuranInsDu: { fn: simpanPengukuranInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 40 },
    hapusRealisasiInsDu: { fn: hapusRealisasiInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 30 },   // v1.0.16
    simpanTemuanInsDu: { fn: simpanTemuanInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 40 },
    ubahTemuanInsDu: { fn: ubahTemuanInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 40 },
    uploadFotoInsDu: { fn: uploadFotoInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 60 },
    getFotoTemuanInsDu: { fn: getFotoTemuanInsDu_, menu: 'OPS_INSDU_INPUT', batasMenit: 80 },   // v1.0.19
    // v1.0.0: Input Temuan Inspeksi (admin, menu OPS_INPUT_TEMUAN): form temuan sama + pilih penyulang
    getMasterTemuanInspeksi: { fn: getMasterTemuanInspeksi_, menu: 'OPS_INPUT_TEMUAN', batasMenit: 30 },
    getTemuanInspeksi: { fn: getTemuanInspeksi_, menu: 'OPS_INPUT_TEMUAN', batasMenit: 30 },
    simpanTemuanInspeksi: { fn: simpanTemuanInspeksi_, menu: 'OPS_INPUT_TEMUAN', tulis: true, batasMenit: 40 },
    uploadFotoTemuanInspeksi: { fn: uploadFotoTemuanInspeksi_, menu: 'OPS_INPUT_TEMUAN', tulis: true, batasMenit: 60 },   // v1.0.0
    getFotoTemuanInspeksi: { fn: getFotoTemuanInspeksi_, menu: 'OPS_INPUT_TEMUAN', batasMenit: 80 },   // v1.0.19: foto di kartu temuan
    // v1.0.10: WO tindak lanjut temuan. Admin (OPS_PENERUSAN_WO) teruskan / pindah / tarik; tim ROW / HARTEK / YANDAL
    // (OPS_WO_TIM) mulai, catat pekerjaan + foto, selesai (= masuk realisasi tim). Lihat modules/75_TindakLanjut.js
    getWoAdmin: { fn: getWoAdmin_, menu: 'OPS_PENERUSAN_WO', batasMenit: 30 },
    teruskanWo: { fn: teruskanWo_, menu: 'OPS_PENERUSAN_WO', tulis: true, batasMenit: 40 },
    // v1.0.18: pindah / tarik WO terkirim hanya di menu Pindah Tim TO (Penerusan WO tab Terkirim = lihat saja)
    tarikWo: { fn: tarikWo_, menu: 'OPS_PINDAH_TIM_TO', tulis: true, batasMenit: 20 },
    getWoPindah: { fn: getWoPindah_, menu: 'OPS_PINDAH_TIM_TO', batasMenit: 30 },
    getFotoWoPindah: { fn: getFotoWoPindah_, menu: 'OPS_PINDAH_TIM_TO', batasMenit: 60 },
    pindahWo: { fn: pindahWo_, menu: 'OPS_PINDAH_TIM_TO', tulis: true, batasMenit: 40 },
    getFotoWoAdmin: { fn: getFotoWoAdmin_, menu: 'OPS_PENERUSAN_WO', batasMenit: 60 },   // v1.0.15: foto temuan / tiang di Penerusan WO
    getWoTim: { fn: getWoTim_, menu: 'OPS_WO_TIM', batasMenit: 30 },
    mulaiWo: { fn: mulaiWo_, menu: 'OPS_WO_TIM', tulis: true, batasMenit: 20 },
    simpanPekerjaanWo: { fn: simpanPekerjaanWo_, menu: 'OPS_WO_TIM', tulis: true, batasMenit: 40 },
    hapusPekerjaanWo: { fn: hapusPekerjaanWo_, menu: 'OPS_WO_TIM', tulis: true, batasMenit: 20 },
    uploadFotoWo: { fn: uploadFotoWo_, menu: 'OPS_WO_TIM', tulis: true, batasMenit: 60 },
    getFotoWoTim: { fn: getFotoWoTim_, menu: 'OPS_WO_TIM', batasMenit: 60 },
    // v1.0.16: verifikasi WO ganda (dua tim mengunggah WO yang sama), admin. Lihat modules/75_TindakLanjut.js
    getWoGanda: { fn: getWoGanda_, menu: 'OPS_WO_GANDA', batasMenit: 30 },
    getFotoWoGanda: { fn: getFotoWoGanda_, menu: 'OPS_WO_GANDA', batasMenit: 60 },
    putuskanWoGanda: { fn: putuskanWoGanda_, menu: 'OPS_WO_GANDA', tulis: true, batasMenit: 20 },   // v1.0.15: foto temuan + pekerjaan di WO Tim
    selesaiWo: { fn: selesaiWo_, menu: 'OPS_WO_TIM', tulis: true, batasMenit: 10 },
    // v1.0.17: sinkron atomik, segel laporan tim sesudah semua antrean HP diterima (ringkasan HP = ringkasan server).
    // Lihat modules/76_SinkronAtomik.js
    segelSinkronHartek: { fn: segelSinkronHartek_, menu: 'OPS_HARTEK_INPUT', tulis: true, batasMenit: 30 },
    segelSinkronInsJar: { fn: segelSinkronInsJar_, menu: 'OPS_INSJAR_INPUT', tulis: true, batasMenit: 30 },
    segelSinkronInsDu: { fn: segelSinkronInsDu_, menu: 'OPS_INSDU_INPUT', tulis: true, batasMenit: 30 },
    // v1.0.17: Arsip Laporan tim Hartek / Inspeksi Jaringan / Inspeksi Gardu (pola getArsipRow). Lihat modules/77_Arsip_Tim.js
    getArsipHartek: { fn: getArsipHartek_, menu: 'OPS_HARTEK_INPUT', batasMenit: 20 },
    getArsipInsJar: { fn: getArsipInsJar_, menu: 'OPS_INSJAR_INPUT', batasMenit: 20 },
    getArsipInsDu: { fn: getArsipInsDu_, menu: 'OPS_INSDU_INPUT', batasMenit: 20 },
    // v1.0.17: Jadwal Padam (port v1), khusus admin menu OPS_JADWAL_PADAM. Lihat modules/78_JadwalPadam.js
    getMasterJadwalPadam: { fn: getMasterJadwalPadam_, menu: 'OPS_JADWAL_PADAM', batasMenit: 30 },
    getJadwalPadam: { fn: getJadwalPadam_, menu: 'OPS_JADWAL_PADAM', batasMenit: 30 },
    getWaJadwalPadam: { fn: getWaJadwalPadam_, menu: 'OPS_JADWAL_PADAM', batasMenit: 20 },
    simpanJadwalPadam: { fn: simpanJadwalPadam_, menu: 'OPS_JADWAL_PADAM', tulis: true, batasMenit: 30 },
    ubahJadwalPadam: { fn: ubahJadwalPadam_, menu: 'OPS_JADWAL_PADAM', tulis: true, batasMenit: 30 },
    ubahStatusJadwalPadam: { fn: ubahStatusJadwalPadam_, menu: 'OPS_JADWAL_PADAM', tulis: true, batasMenit: 30 },
    hapusJadwalPadam: { fn: hapusJadwalPadam_, menu: 'OPS_JADWAL_PADAM', tulis: true, batasMenit: 20 },
    // v1.0.17: Kalender tim (pekerjaan tim + WO + jadwal padam per hari). Tanpa menu: dibatasi di fungsi ke PETUGAS bertim,
    // data tim sesi sendiri. Lihat modules/79_Kalender_Tim.js
    getKalenderTim: { fn: getKalenderTim_, batasMenit: 20 },
    // v1.0.19: lonceng notifikasi header (tanpa menu: isi dibatasi menu sesi di fungsi). Lihat modules/83_Lonceng.js
    getNotifikasi: { fn: getNotifikasi_, batasMenit: 30 },
    tandaiNotifikasi: { fn: tandaiNotifikasi_, batasMenit: 30 },
    // v1.0.19: update APK dari folder Drive (APK_FOLDER_ID), semua akun bersesi. Lihat 09_Versi.js
    getUpdateApp: { fn: getUpdateApp_, batasMenit: 10 },
    // v1.0.17: riwayat gardu (pengukuran arus / tegangan, temuan + perbaikan, BA / manajemen trafo), admin Pengukuran Gardu.
    // Lihat modules/80_Riwayat_Gardu.js
    getRiwayatGardu: { fn: getRiwayatGardu_, menu: 'OPS_PENGUKURAN_GARDU', batasMenit: 40 }
  };
}

function doPost(e) {
  var hasil;
  try {
    var teks = (e && e.postData && e.postData.contents) || '';
    // v0.47: maks 4 MB (foto terbesar 2 MB = ~2,8 MB base64). Dicek sebelum JSON.parse & sebelum sesi.
    if (teks.length > PAYLOAD_MAKS_) throw new SisiError_('PAYLOAD_TERLALU_BESAR');
    var req;
    try { req = JSON.parse(teks || '{}'); } catch (x) { throw new SisiError_('JSON_TIDAK_VALID'); }
    hasil = proses_(req, 'MOBILE');
  } catch (err) {
    hasil = gagal_(err);
  }
  return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
}

/** Health check. Tidak pernah membaca token dari query string. */
function doGet() {
  var hasil;
  try { hasil = { ok: true, env: cfg_().ENV, data: { layanan: 'sisi-v2' } }; } catch (err) { hasil = gagal_(err); }
  return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
}

/** Untuk halaman web: google.script.run.rpc({action, token, data}). */
function rpc(req) {
  try {
    // v0.62.5: batas 4 MB yang sama dengan doPost (dulu rpc tanpa batas ukuran).
    var teks;
    try { teks = JSON.stringify(req || {}); } catch (x) { throw new SisiError_('REQUEST_TIDAK_VALID'); }
    if (!teks || teks.length > PAYLOAD_MAKS_) throw new SisiError_('PAYLOAD_TERLALU_BESAR');
    return proses_(req || {}, 'WEB');
  } catch (err) { return gagal_(err); }
}

function proses_(req, platform) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw new SisiError_('REQUEST_TIDAK_VALID');
  var daftar = endpoints_();
  var nama = String(req.action || '');
  if (!Object.prototype.hasOwnProperty.call(daftar, nama)) throw new SisiError_('AKSI_TIDAK_DIKENAL');
  var ep = daftar[nama];
  cekVersiHp_(req, platform, nama);   // v0.81.1: app di bawah versi minimum (opsional, WAJIB_VERSI_APP)
  var sesi = ep.publik ? null : guard_(req.token, ep, platform, nama);
  var data = req.data === undefined || req.data === null ? {} : req.data;
  if (typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  var isi = ep.fn(sesi, data, platform);
  // v0.64.2: jam server (dicap SETELAH proses) = patokan jam terpercaya HP (jam monoton). Ada di semua jawaban.
  // v0.81.0: versi backend di setiap jawaban (HP tahu backend baru di-deploy, lalu cek update)
  return { ok: true, env: cfg_().ENV, data: isi, waktu: sekarangIso_(), versi: VERSI_BACKEND_ };
}

function gagal_(err) {
  var kode = err && err.kode ? err.kode : 'KESALAHAN_SERVER';
  try {
    console.error(JSON.stringify({ kode: kode, detail: err && (err.detail || err.message), stack: err && err.stack }));
  } catch (x) { /* abaikan */ }
  var jawab = { ok: false, kode: kode, waktu: sekarangIso_() };
  // v0.72.0: error validasi isian ikut menyebut NAMA KOLOM (mis. tahunPhb) supaya HP bisa menunjuk isian yang salah.
  // Hanya nama kunci skema (bukan nilai isian), jadi tidak membocorkan data.
  if (KODE_VALIDASI_KOLOM_.indexOf(kode) !== -1 && err && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(String(err.detail || ''))) jawab.kolom = String(err.detail);
  return jawab;
}
var KODE_VALIDASI_KOLOM_ = ['FIELD_WAJIB', 'TIPE_SALAH', 'TERLALU_PANJANG', 'TERLALU_BANYAK_BARIS', 'FORMAT_SALAH', 'HARUS_BULAT', 'DI_LUAR_RENTANG', 'PILIHAN_TIDAK_VALID', 'FIELD_TIDAK_DIKENAL'];

function ping_() { return { waktuServer: sekarangIso_(), versi: infoVersi_() }; }   // v0.81.0: info update app
