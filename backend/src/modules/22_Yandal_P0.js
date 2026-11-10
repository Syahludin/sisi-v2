/**
 * v0.65.0 (keputusan Master Guswan 8 Okt 2026): kirim Penugasan P0 dari HP ke yan_P0 (66 kolom) + foto P0 ke Drive.
 *
 *  simpanP0Yandal     data P0 (dikirim begitu P0 dibuat, ulang = tidak dobel, kunci p0_id). Kode P0 resmi
 *                     <Kode Shift>-P0.nnn dibuat server (nomor HP hanya sementara). final = HP sudah di akhir shift
 *                     (foto belum disimpan sudah dikunci): P0 tanpa foto Sesudah = Rejected oleh SISTEM,
 *                     Alasan "P0 Tidak Selesai", Point 0.
 *  uploadFotoP0Yandal satu foto (base64 JPEG) per kiriman, hanya foto yang sudah DISIMPAN petugas, urut Sebelum >
 *                     Pekerjaan > Sesudah, kamera SiSi saja. Sesudah masuk = Status P0 SELESAI, Status Approval Menunggu.
 *
 * Guard: akun PETUGAS YANDAL, dari HP, shift token sendiri (tim sesi), waktu di dalam jam shift dan tidak lewat jam
 * server (Waktu Diterima), mode sync sesudah akhir shift tetap boleh (syncShift). Semua tulis di dalam lock, satu
 * panggilan tulis per sheet (tulisBlok_), lalu rekap shift (rekapShiftId_).
 * Pemicu rekap: P0 yang masih PROSES sesudah batas mode sync (akhir shift + 24 jam) juga di-Rejected SISTEM.
 */
var YAN_P0_ALASAN_TIDAK_SELESAI_ = 'P0 Tidak Selesai';
var YAN_P0_OLEH_SISTEM_ = 'SISTEM';
var YAN_SLOT_P0_ = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
var YAN_KOLOM_FOTO_P0_ = {
  SEBELUM: { foto: 'Foto Sebelum', link: 'Link Drive Sebelum', id: 'foto_id_sebelum', waktu: 'Waktu Sebelum' },
  PEKERJAAN: { foto: 'Foto Pekerjaan', link: 'Link Drive Pekerjaan', id: 'foto_id_pekerjaan', waktu: 'Waktu Pekerjaan' },
  SESUDAH: { foto: 'Foto Sesudah', link: 'Link Drive Sesudah', id: 'foto_id_sesudah', waktu: 'Waktu Sesudah' }
};
var YAN_P0_TOLERANSI_MS_ = 2 * 60e3;   // selisih jam terpercaya HP vs server yang masih diterima
// v0.65.2 (keputusan Master Guswan 8 Okt 2026): koordinat foto boleh menyusul, MAKS 30 detik sesudah jepret (petugas bisa
// bergerak; lewat dari itu koordinat dibiarkan kosong, bukan diisi titik yang salah). Sama dengan GpsSusulan.jendela HP.
var YAN_P0_SUSULAN_MAKS_DETIK_ = 30;
// v0.65.8: Jarak Closing P0 (m) / Jarak Antar P0 (m) dalam meter bulat (jarakMeter_). v0.65.7 masih km 3 desimal.

function teksP0_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/** Akun PETUGAS YANDAL dari HP, punya tim + batas shift di token. */
function wajibPetugasYandalHp_(sesi, platform) {
  if (!petugasYandal_(sesi) || !sesi.timId || !sesi._sampai) throw new SisiError_('AKSES_DITOLAK', 'P0 hanya akun YANDAL');
  if (platform !== 'MOBILE') throw new SisiError_('AKSES_DITOLAK', 'P0 hanya dari HP');
}

/** Baris yan_Shift shift token ini (tim sesi). shiftId dari HP wajib sama. */
function shiftSesiP0_(rows, sesi, shiftId) {
  var aktif = shiftAktif_(rows, sesi.timId, shiftYandal_(sesi._sampai));
  if (!aktif || (shiftId && String(aktif.shift_id) !== String(shiftId))) throw new SisiError_('BUKAN_SHIFT_INI', shiftId || '');
  var j = jadwalBarisShift_(aktif);
  if (!j) throw new SisiError_('DATA_TIDAK_VALID', 'jadwal shift');
  return { r: aktif, j: j };
}

/** Waktu (ms) wajib di dalam jam shift (toleransi 1 menit) dan tidak melewati jam server. */
function cekWaktuShiftP0_(ms, j, sekarangMs, nama) {
  if (!isFinite(ms) || ms < j.mulai - 60e3 || ms > j.sampai + 60e3) throw new SisiError_('WAKTU_DI_LUAR_SHIFT', nama);
  if (ms > sekarangMs + YAN_P0_TOLERANSI_MS_) throw new SisiError_('WAKTU_MELEWATI_SERVER', nama);
}

function metaP0_(r) {
  try { var m = JSON.parse(String(r.foto_meta || '{}')); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (e) { return {}; }
}

/** Nomor berikutnya Kode P0 di shift (semua status, termasuk BATAL): <Kode Shift>-P0.nnn. */
function kodeP0Berikut_(p0Shift, kodeShift) {
  var maks = 0;
  p0Shift.forEach(function (r) {
    var m = /-P0\.(\d+)$/.exec(teksP0_(r['Kode P0']));
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return kodeShift + '-P0.' + pad3_(maks + 1);
}

/** Jarak Antar P0 (m) per p0_id: urut Waktu Dibuat, dari P0 sebelumnya yang punya koordinat. P0 pertama = 0. */
function jarakAntarP0_(p0Shift) {
  var l = p0Shift.filter(function (r) { return r.p0_id && String(r.status || 'AKTIF') !== 'BATAL'; })
    .map(function (r) { return { r: r, w: waktuP0Ms_(r, 'DIBUAT', 'Waktu Dibuat') || 0 }; })
    .sort(function (a, b) { return a.w - b.w; });
  var hasil = {}, lalu = null;
  l.forEach(function (x) {
    var r = x.r;
    if (!titikSah_(r.Lat, r.Long)) { hasil[String(r.p0_id)] = ''; return; }
    hasil[String(r.p0_id)] = lalu ? jarakMeter_(lalu.lat, lalu.lon, Number(r.Lat), Number(r.Long)) : 0;
    lalu = { lat: Number(r.Lat), lon: Number(r.Long) };
  });
  return hasil;
}

/** Perubahan Jarak Antar P0 baris lain di shift (yang berubah saja), untuk tulisBlok_. */
function ubahJarakAntarP0_(p0Shift, kecuali, ubahIni) {
  var jarak = jarakAntarP0_(p0Shift), ubah = [];
  p0Shift.forEach(function (r) {
    var id = String(r.p0_id || '');
    if (!id || !Object.prototype.hasOwnProperty.call(jarak, id)) return;
    var v = jarak[id];
    if (id === kecuali) { ubahIni['Jarak Antar P0 (m)'] = v; return; }
    if (String(r['Jarak Antar P0 (m)']) !== String(v)) ubah.push({ r: r, u: { 'Jarak Antar P0 (m)': v } });
  });
  return ubah;
}

/** Sumber Waktu (SERVER / HP / CAMPUR) + Selisih Jam HP (menit) dari meta (DIBUAT + tiap foto). */
function ringkasWaktuP0_(meta) {
  var sumber = {}, selisih = 0;
  Object.keys(meta).forEach(function (k) {
    var m = meta[k];
    if (!m || !m.waktu) return;
    sumber[m.sumberWaktu === 'SERVER' ? 'SERVER' : 'HP'] = true;
    var a = Date.parse(m.waktu), b = Date.parse(m.waktuHp || m.waktu);
    if (isFinite(a) && isFinite(b)) selisih = Math.max(selisih, Math.abs(a - b) / 60e3);
  });
  var s = Object.keys(sumber);
  return { sumber: s.length === 2 ? 'CAMPUR' : (s[0] || 'HP'), selisih: Math.round(selisih) };
}

/** Rejected SISTEM karena P0 tidak selesai (Point 0). */
function tolakSistemP0_(sekarangMs) {
  return { 'Status Approval': 'Rejected', 'Alasan Rejected': YAN_P0_ALASAN_TIDAK_SELESAI_, 'Approved Oleh': YAN_P0_OLEH_SISTEM_,
           'Waktu Approve': waktuWib_(sekarangMs, true), Point: 0 };
}

function ditolakSistemP0_(r) {
  return teksP0_(r['Status Approval']) === 'Rejected' && teksP0_(r['Alasan Rejected']) === YAN_P0_ALASAN_TIDAK_SELESAI_ &&
    teksP0_(r['Approved Oleh']) === YAN_P0_OLEH_SISTEM_;
}

/** Jawaban ringkas status P0 untuk HP. */
function jawabP0_(r) {
  return {
    p0Id: String(r.p0_id), kodeP0: teksP0_(r['Kode P0']), statusP0: teksP0_(r['Status P0']),
    statusApproval: teksP0_(r['Status Approval']), alasanRejected: teksP0_(r['Alasan Rejected']),
    fotoServer: YAN_SLOT_P0_.filter(function (s) { return !!teksP0_(r[YAN_KOLOM_FOTO_P0_[s].id]); })
  };
}

/** Pekerjaan dari master (modul YANDAL, aktif) atau Lain - Lain. Hasil { nama, jenisId, bobot }. */
function jenisP0_(nama, lainnya) {
  var semua = tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows.filter(function (r) {
    return r.jenis_id && String(r.modul).trim().toUpperCase() === 'YANDAL';
  });
  var kunci = function (v) { return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  if (pekerjaanLainP0_(nama)) {
    if (!lainnya) throw new SisiError_('FIELD_WAJIB', 'pekerjaanLainnya');
    var lain = semua.filter(function (r) { return pekerjaanLainP0_(r.nama); })[0];
    return { nama: YAN_PEKERJAAN_LAIN_, jenisId: lain ? String(lain.jenis_id) : '', bobot: '' };   // v0.64.6: bobot diisi admin
  }
  var cocok = semua.filter(function (r) { return isAktif_(r.aktif) && kunci(r.nama) === kunci(nama); });
  if (!cocok.length) throw new SisiError_('PEKERJAAN_TIDAK_DIKENAL', nama);
  var b = cocok[0].bobot, n = Number(b);
  return { nama: String(cocok[0].nama).trim(), jenisId: String(cocok[0].jenis_id),
           bobot: b === '' || b === null || b === undefined || !isFinite(n) ? '' : n };
}

/**
 * Penyulang / section dari db_Jaringan. Aturan (v0.87.10, keputusan Master Guswan 13 Okt 2026):
 *  - penyulang KOSONG (pekerjaan bukan di penyulang) = section DIABAIKAN, hasil kosong.
 *  - penyulang DIISI = section WAJIB dipilih dan harus milik penyulang itu (FIELD_WAJIB 'section' kalau kosong).
 */
function lokasiP0_(penyulang, sectionId) {
  if (!teksP0_(penyulang)) return { penyulang: '', section: '', sectionId: '' };
  var rows = tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (r) { return r.section_id; });
  var kunci = function (v) { return String(v || '').trim().toLowerCase(); };
  var p = rows.filter(function (r) { return kunci(r.penyulang) === kunci(penyulang); })[0];
  if (!p) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', penyulang);
  if (!teksP0_(sectionId)) throw new SisiError_('FIELD_WAJIB', 'section');
  var s = rows.filter(function (r) { return String(r.section_id) === sectionId; })[0];
  if (!s) throw new SisiError_('SECTION_TIDAK_DIKENAL', sectionId);
  if (kunci(s.penyulang) !== kunci(penyulang)) throw new SisiError_('SECTION_BUKAN_PENYULANG', sectionId);
  return { penyulang: String(s.penyulang).trim(), section: String(s.section).trim(), sectionId: sectionId };
}

/** v0.66.4: P0 Pengecekan Switching wajib penyulang + section LBS / ACR (Nama Switching diambil dari section P0). */
function cekLokasiSwitchingP0_(lokasi) {
  if (!lokasi.penyulang) throw new SisiError_('FIELD_WAJIB', 'penyulang');
  if (!lokasi.sectionId) throw new SisiError_('FIELD_WAJIB', 'section');
  if (!switchingSah_(namaSwitching_(lokasi.section))) throw new SisiError_('BUKAN_SWITCHING', lokasi.section);
}

/**
 * v0.66.4 (keputusan Master Guswan 9 Okt 2026): ubah penyulang / section / daerah P0 yang sudah di server (section salah pilih).
 * Hanya selama P0 belum SELESAI dan belum ada Status Approval; P0 Pengecekan Switching hanya sebelum switching disimpan
 * (Nama Switching terkunci sesudah itu) dan section tetap wajib LBS / ACR. Tidak berubah = kosong (kirim ulang aman).
 */
function ubahLokasiP0_(r, lokasi, daerah, waktu) {
  var sama = teksP0_(r.Penyulang) === lokasi.penyulang && teksP0_(r.section_id) === lokasi.sectionId && teksP0_(r.Daerah) === daerah;
  if (sama) return null;
  if (teksP0_(r['Status P0']) === 'SELESAI' || teksP0_(r['Status Approval'])) throw new SisiError_('P0_SUDAH_SELESAI', teksP0_(r['Kode P0']));
  // v0.66.5: jam edit (jam terpercaya HP) wajib di jam shift, sesudah P0 dibuat, tidak lewat jam server.
  // Edit offline sebelum akhir shift tetap diterima walau baru terkirim sesudah shift selesai.
  if (!waktu.diubah) throw new SisiError_('FIELD_WAJIB', 'lokasiDiubah');
  var ms = Date.parse(waktu.diubah);
  cekWaktuShiftP0_(ms, waktu.j, waktu.sekarangMs, 'lokasiDiubah');
  var dibuatMs = Date.parse((metaP0_(r).DIBUAT || {}).waktu || '');
  if (isFinite(dibuatMs) && ms < dibuatMs - 60e3) throw new SisiError_('WAKTU_TIDAK_URUT', 'edit lokasi sebelum P0 dibuat');
  if (p0Switching_(r['Nama Pekerjaan'])) {
    cekLokasiSwitchingP0_(lokasi);
    var ada = bacaSheetYandal_(['yan_Switching']).yan_Switching.rows.some(function (x) {
      return String(x.p0_id) === String(r.p0_id) && String(x.status || 'AKTIF') !== 'BATAL';
    });
    if (ada) throw new SisiError_('SWITCHING_TERKUNCI', 'lokasi terkunci, switching sudah ada');
  }
  cekUbahLokasiGarduP0_(r, lokasi);   // v0.74.0: Pengecekan Gardu wajib penyulang, terkunci sesudah pengukuran disimpan
  return { Penyulang: lokasi.penyulang, Section: lokasi.section, Daerah: daerah, section_id: lokasi.sectionId };
}

function simpanP0Yandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    shiftId: { tipe: 'uuid', wajib: true },
    namaPekerjaan: { tipe: 'teks', wajib: true, maks: 100 },
    pekerjaanLainnya: { tipe: 'teks', maks: 100 },
    penyulang: { tipe: 'teks', maks: 100 },
    sectionId: { tipe: 'uuid' },
    daerah: { tipe: 'teks', maks: 150 },
    catatan: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 10 },
    dibuat: { tipe: 'waktu', wajib: true },
    dibuatHp: { tipe: 'waktu' },
    sumberWaktu: { tipe: 'pilihan', pilihan: ['SERVER', 'HP'] },
    installId: { tipe: 'uuid' },
    slotHp: { tipe: 'teks', maks: 40, pola: /^(SEBELUM(,PEKERJAAN(,SESUDAH)?)?)?$/ },
    final: { tipe: 'bool' },
    ubahLokasi: { tipe: 'bool' },   // v0.66.4: P0 sudah ada = terapkan penyulang / section / daerah baru
    lokasiDiubah: { tipe: 'waktu' }  // v0.66.5: jam edit lokasi (wajib bila lokasi benar-benar berubah)
  });
  var sekarangMs = sekarangMsYandal_();
  var jenis = jenisP0_(d.namaPekerjaan, d.pekerjaanLainnya || '');
  var lokasi = lokasiP0_(d.penyulang || '', d.sectionId || '');

  var dibuatMs = Date.parse(d.dibuat);

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, d.shiftId), s = sh.r, j = sh.j;
    var p0Shift = t.yan_P0.rows.filter(function (r) { return String(r.shift_id) === String(s.shift_id); });
    var lama = t.yan_P0.rows.filter(function (r) { return String(r.p0_id) === d.p0Id; });
    if (lama.length > 1) throw new SisiError_('DATA_GANDA', d.p0Id);
    var r = lama[0] || null;
    if (r && (String(r.shift_id) !== String(s.shift_id) || String(r.tim_id) !== String(sesi.timId))) throw new SisiError_('ID_DIPAKAI', d.p0Id);
    if (r && String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.p0Id);
    var finalHp = d.final === true && sekarangMs >= j.sampai;   // final sebelum akhir shift diabaikan
    var tanpaSesudah = String(d.slotHp || '').split(',').indexOf('SESUDAH') === -1;
    var waktuTerima = waktuWib_(sekarangMs, true), iso = new Date(sekarangMs).toISOString();
    var aksi, lok = null;

    if (!r) {
      cekWaktuShiftP0_(dibuatMs, j, sekarangMs, 'dibuat');
      if (p0Switching_(jenis.nama)) cekLokasiSwitchingP0_(lokasi);   // v0.66.0 penyulang, v0.66.4 + section LBS / ACR
      if (p0Gardu_(jenis.nama)) cekLokasiGarduP0_(lokasi);   // v0.74.0 penyulang wajib (gardu dari penyulang P0)
      var meta = { DIBUAT: { waktu: d.dibuat, waktuHp: d.dibuatHp || d.dibuat, sumberWaktu: d.sumberWaktu || 'HP' } };
      var rw = ringkasWaktuP0_(meta);
      var baru = {
        No: (t.yan_P0.rows.length ? Math.max.apply(null, t.yan_P0.rows.map(function (x) { return x._baris; })) : 1),
        'Kode Header': s['Kode Header'], 'Kode Shift': s['Kode Shift'], 'Kode P0': kodeP0Berikut_(p0Shift, teksP0_(s['Kode Shift'])),
        ULP: s.ULP, Hari: s.Hari, Tanggal: tglSel_(s.Tanggal), Tim: s.Tim, Shift: s.Shift,
        Petugas: [teksP0_(s['Petugas 1']), teksP0_(s['Petugas 2'])].filter(Boolean).join(', '),
        'Nama Pekerjaan': jenis.nama, 'Pekerjaan Lainnya': jenis.nama === YAN_PEKERJAAN_LAIN_ ? (d.pekerjaanLainnya || '') : '',
        Penyulang: lokasi.penyulang, Section: lokasi.section, Daerah: d.daerah || '', Catatan: d.catatan || '',
        'Waktu Dibuat': waktuWib_(dibuatMs, true), 'Sumber Waktu': rw.sumber, 'Selisih Jam HP (menit)': rw.selisih,
        'Waktu Diterima': waktuTerima, 'Status P0': 'PROSES', 'Status Approval': '',
        'Skor Durasi': '', Bobot: jenis.bobot, Pengali: pengaliP0_(jenis.nama, dibuatMs), Point: '',
        'Input Oleh': sesi.nama || sesi.username, Timestamp: iso, 'Timestamp Update': iso,
        p0_id: d.p0Id, shift_id: s.shift_id, tim_id: sesi.timId, jenis_id: jenis.jenisId, section_id: lokasi.sectionId,
        petugas_id_1: s.petugas_id_1 || '', petugas_id_2: s.petugas_id_2 || '',
        foto_meta: JSON.stringify(meta), install_id: d.installId || '',
        status: 'AKTIF', revision: 1, dibuat_oleh: sesi.userId, diubah_oleh: sesi.userId
      };
      if (finalHp && tanpaSesudah) Object.assign(baru, tolakSistemP0_(sekarangMs));
      var semua = p0Shift.concat([baru]);
      var ubahLain = ubahJarakAntarP0_(semua, d.p0Id, baru);
      tulisBlok_(t.yan_P0, ubahLain, [baru]);
      r = baru;
      aksi = 'SIMPAN_P0';
    } else {
      var u = { 'Waktu Diterima': waktuTerima, 'Timestamp Update': iso, diubah_oleh: sesi.userId };
      lok = d.ubahLokasi === true ? ubahLokasiP0_(r, lokasi, d.daerah || '', { diubah: d.lokasiDiubah, j: j, sekarangMs: sekarangMs }) : null;
      if (lok) Object.assign(u, lok);
      if (finalHp && tanpaSesudah && teksP0_(r['Status P0']) !== 'SELESAI' && !teksP0_(r['Status Approval'])) {
        Object.assign(u, tolakSistemP0_(sekarangMs));
      }
      tulisBlok_(t.yan_P0, [{ r: r, u: u }], [], { bolehId: lok ? ['section_id'] : [] });
      aksi = lok ? 'UBAH_LOKASI_P0' : 'KIRIM_ULANG_P0';
    }
    auditLog_(sesi, aksi, teksP0_(r['Kode P0']), (finalHp ? 'final ' : '') + (ditolakSistemP0_(r) ? 'rejected sistem' : '') +
      (lok ? 'lokasi ' + [lok.Penyulang, lok.Section].filter(Boolean).join(' / ') : ''), platform, logT);
    rekapShiftId_([s.shift_id], sekarangMs, sesi.userId);
    return jawabP0_(r);
  });
}

/** Folder foto P0: Foto Yandal / YYYY / MM / DD / <Tim> / <Kode Shift>. */
function pathFotoP0_(r) {
  var tgl = tglSel_(r.Tanggal);
  return [tgl.slice(0, 4), tgl.slice(5, 7), tgl.slice(8, 10), namaFolderFoto_(r.Tim), namaFolderFoto_(r['Kode Shift'])];
}

function uploadFotoP0Yandal_(sesi, data, platform) {
  wajibPetugasYandalHp_(sesi, platform);
  var d = validasi_(data, {
    p0Id: { tipe: 'uuid', wajib: true },
    slot: { tipe: 'pilihan', wajib: true, pilihan: YAN_SLOT_P0_ },
    sumber: { tipe: 'pilihan', wajib: true, pilihan: ['KAMERA'] },
    sha256: { tipe: 'teks', wajib: true, maks: 64, pola: /^[0-9a-f]{64}$/ },
    ukuranByte: { tipe: 'angka', wajib: true, bulat: true, min: 1, max: FOTO_MAKS_BYTE_ },
    data: { tipe: 'teks', wajib: true, maks: Math.ceil(FOTO_MAKS_BYTE_ / 3) * 4 + 4 },
    waktu: { tipe: 'waktu', wajib: true },
    waktuHp: { tipe: 'waktu' },
    sumberWaktu: { tipe: 'pilihan', pilihan: ['SERVER', 'HP'] },
    lat: { tipe: 'angka', min: -90, max: 90 },
    lng: { tipe: 'angka', min: -180, max: 180 },
    akurasiM: { tipe: 'angka', min: 0, max: 100000 },
    gpsSusulanDetik: { tipe: 'angka', bulat: true, min: 0, max: YAN_P0_SUSULAN_MAKS_DETIK_ }
  });
  var c = cfg_();
  if (!c.YANDAL_FOTO_FOLDER_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'YANDAL_FOTO_FOLDER_ID');
  var bytes;
  try { bytes = Utilities.base64Decode(d.data); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'data'); }
  if (bytes.length > FOTO_MAKS_BYTE_) throw new SisiError_('FOTO_TERLALU_BESAR', bytes.length);
  if (bytes.length !== d.ukuranByte) throw new SisiError_('FOTO_RUSAK', 'ukuran');
  if (bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)) !== d.sha256) throw new SisiError_('FOTO_RUSAK', 'sha256');
  var dim = ukuranJpeg_(bytes);
  if (!dim) throw new SisiError_('FORMAT_FOTO_SALAH');
  if (Math.max(dim.lebar, dim.tinggi) > FOTO_MAKS_SISI_) throw new SisiError_('FOTO_TERLALU_BESAR', dim.lebar + 'x' + dim.tinggi);
  if ((d.lat === undefined) !== (d.lng === undefined)) throw new SisiError_('FIELD_WAJIB', d.lat === undefined ? 'lat' : 'lng');
  if (d.gpsSusulanDetik !== undefined && d.lat === undefined) throw new SisiError_('FIELD_WAJIB', 'lat');   // susulan tanpa titik
  var waktuMs = Date.parse(d.waktu);
  var sekarangMs = sekarangMsYandal_();

  return denganLock_(function () {
    var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    var sh = shiftSesiP0_(t.yan_Shift.rows, sesi, null), s = sh.r, j = sh.j;
    var lama = t.yan_P0.rows.filter(function (x) { return String(x.p0_id) === d.p0Id; });
    if (!lama.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.p0Id);
    if (lama.length > 1) throw new SisiError_('DATA_GANDA', d.p0Id);
    var r = lama[0];
    if (String(r.tim_id) !== String(sesi.timId) || String(r.shift_id) !== String(s.shift_id)) throw new SisiError_('BUKAN_MILIK_TIM', d.p0Id);
    if (String(r.status || 'AKTIF') === 'BATAL') throw new SisiError_('SUDAH_BATAL', d.p0Id);
    var k = YAN_KOLOM_FOTO_P0_[d.slot], meta = metaP0_(r);
    if (teksP0_(r[k.id])) {
      if (meta[d.slot] && meta[d.slot].sha256 === d.sha256) return Object.assign(jawabP0_(r), { status: 'DUPLIKAT' });
      throw new SisiError_('FOTO_SUDAH_ADA', d.slot);   // foto yang sudah disimpan petugas tidak bisa diganti
    }
    var i = YAN_SLOT_P0_.indexOf(d.slot);
    var sebelumnya = i > 0 ? YAN_SLOT_P0_[i - 1] : null;
    if (sebelumnya && !teksP0_(r[YAN_KOLOM_FOTO_P0_[sebelumnya].id])) throw new SisiError_('URUTAN_FOTO', 'foto ' + sebelumnya + ' belum ada');
    cekWaktuShiftP0_(waktuMs, j, sekarangMs, 'waktu foto');
    var dibuatMs = waktuP0Ms_(r, 'DIBUAT', 'Waktu Dibuat');   // v0.65.1: dari foto_meta (ISO), bukan sel sheet
    if (dibuatMs !== null && waktuMs < dibuatMs - 60e3) throw new SisiError_('WAKTU_TIDAK_URUT', 'foto sebelum P0 dibuat');
    var lalu = sebelumnya ? waktuP0Ms_(r, sebelumnya, YAN_KOLOM_FOTO_P0_[sebelumnya].waktu) : null;
    if (lalu !== null && waktuMs < lalu - 1000) throw new SisiError_('WAKTU_TIDAK_URUT', 'foto ' + d.slot);
    if (d.slot === 'SESUDAH') cekSwitchingSebelumSesudah_(r);   // v0.66.0: Pengecekan Switching wajib ada switching ber-foto arus
    if (d.slot === 'SESUDAH') cekGarduSebelumSesudah_(r);   // v0.74.0: Pengecekan Gardu wajib pengukuran dengan 10 foto lengkap

    // Drive: cari dulu (kiriman ulang setelah gagal di tengah tidak membuat file kembar)
    var folder = folderFoto_(c.YANDAL_FOTO_FOLDER_ID, pathFotoP0_(r));
    var penanda = d.p0Id + '-' + d.slot;
    var file = cariFileFoto_(folder, penanda), fileBaru = !file;
    if (fileBaru) {
      file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', namaFotoBebas_(folder, teksP0_(r['Kode P0']), d.slot, 1, d.p0Id)));
      try { file.setDescription(PENANDA_FOTO_ + penanda); } catch (eD) { /* tanpa penanda */ }
    }
    pastikanFotoPrivat_(file, fileBaru);

    meta[d.slot] = { waktu: d.waktu, waktuHp: d.waktuHp || d.waktu, sumberWaktu: d.sumberWaktu || 'HP', sumber: d.sumber,
                     lat: d.lat === undefined ? null : d.lat, lng: d.lng === undefined ? null : d.lng,
                     akurasi: d.akurasiM === undefined ? null : d.akurasiM, sha256: d.sha256, ukuran: bytes.length };
    if (d.gpsSusulanDetik !== undefined) meta[d.slot].gpsSusulanDetik = d.gpsSusulanDetik;   // v0.65.2: titik menyusul (detik sesudah jepret)
    var rw = ringkasWaktuP0_(meta), iso = new Date(sekarangMs).toISOString();
    var u = {};
    u[k.foto] = file.getName();
    u[k.link] = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    u[k.id] = file.getId();
    u[k.waktu] = waktuWib_(waktuMs, true);
    u.foto_meta = JSON.stringify(meta);
    u['Sumber Waktu'] = rw.sumber;
    u['Selisih Jam HP (menit)'] = rw.selisih;
    u['Waktu Diterima'] = waktuWib_(sekarangMs, true);
    u['Timestamp Update'] = iso;
    u.diubah_oleh = sesi.userId;
    var punyaGps = d.lat !== undefined && d.lng !== undefined;
    // v0.65.2: titik pekerjaan = GPS foto Sebelum; Sebelum tanpa GPS = cadangan dari foto Pekerjaan (titik kerja sama),
    // ditandai foto_meta.sumberKoordinat. Foto Sesudah TIDAK dipakai (itu titik closing).
    var titikDariPekerjaan = d.slot === 'PEKERJAAN' && punyaGps && !titikSah_(r.Lat, r.Long);
    if ((d.slot === 'SEBELUM' || titikDariPekerjaan) && punyaGps) {
      u.Lat = d.lat; u.Long = d.lng; u.Koordinat = koordinatTeks_(d.lat, d.lng);
      meta.sumberKoordinat = d.slot;
      u.foto_meta = JSON.stringify(meta);
    }
    if (d.slot === 'SESUDAH') {
      if (punyaGps) { u['Lat Closing'] = d.lat; u['Long Closing'] = d.lng; u['Koordinat Closing'] = koordinatTeks_(d.lat, d.lng); }
      var lat1 = u.Lat !== undefined ? u.Lat : r.Lat, lon1 = u.Long !== undefined ? u.Long : r.Long;
      if (punyaGps && titikSah_(lat1, lon1)) u['Jarak Closing P0 (m)'] = jarakMeter_(Number(lat1), Number(lon1), d.lat, d.lng);
      var mulaiMs = waktuP0Ms_(r, 'SEBELUM', 'Waktu Sebelum');
      // v0.65.12: 2 desimal (dulu dibulatkan ke menit, P0 di bawah 1 menit tertulis 0). 45 detik = 0.75
      var menit = mulaiMs === null ? '' : menitP0_(waktuMs - mulaiMs);
      u['Durasi (menit)'] = menit;
      u['Skor Durasi'] = menit === '' ? '' : skorDurasiP0_(menit);
      u['Status P0'] = 'SELESAI';
      if (!teksP0_(r['Status Approval']) || ditolakSistemP0_(r)) {
        // Sesudah masuk = selesai: menunggu verifikasi admin (juga membatalkan Rejected SISTEM "P0 Tidak Selesai")
        u['Status Approval'] = 'Menunggu'; u['Alasan Rejected'] = ''; u['Approved Oleh'] = ''; u['Waktu Approve'] = ''; u.Point = '';
      }
    }
    var p0Shift = t.yan_P0.rows.filter(function (x) { return String(x.shift_id) === String(s.shift_id); });
    var ubahLain = [];
    if (u.Lat !== undefined) {
      var salin = p0Shift.map(function (x) { return x === r ? Object.assign({}, x, u) : x; });
      ubahLain = ubahJarakAntarP0_(salin, d.p0Id, u);
    }
    tulisBlok_(t.yan_P0, [{ r: r, u: u }].concat(ubahLain), []);
    auditLog_(sesi, 'UPLOAD_FOTO_P0', teksP0_(r['Kode P0']), d.slot + ' ' + file.getId(), platform, logT);
    rekapShiftId_([s.shift_id], sekarangMs, sesi.userId);
    return Object.assign(jawabP0_(r), { status: 'OK' });
  });
}

/**
 * Pemicu rekap: P0 yang masih PROSES (belum ada keputusan) sesudah batas mode sync (akhir shift + YAN_SYNC_JAM_)
 * = Rejected SISTEM "P0 Tidak Selesai". WAJIB di dalam lock. Hasil: jumlah P0 yang ditolak.
 */
function tolakP0KedaluwarsaYandal_(sekarangMs) {
  var t = bacaSheetYandal_(['yan_Shift', 'yan_P0']);
  var jadwal = {};
  t.yan_Shift.rows.forEach(function (r) { if (r.shift_id) jadwal[String(r.shift_id)] = jadwalBarisShift_(r); });
  var iso = new Date(sekarangMs).toISOString(), ubah = [];
  t.yan_P0.rows.forEach(function (r) {
    if (!r.p0_id || String(r.status || 'AKTIF') === 'BATAL' || teksP0_(r['Status P0']) === 'SELESAI' || teksP0_(r['Status Approval'])) return;
    var j = jadwal[String(r.shift_id)];
    if (!j || syncSampaiYandal_(j.sampai) > sekarangMs) return;
    var u = tolakSistemP0_(sekarangMs);
    u['Timestamp Update'] = iso; u.diubah_oleh = YAN_P0_OLEH_SISTEM_;
    ubah.push({ r: r, u: u });
  });
  if (ubah.length) tulisBlok_(t.yan_P0, ubah.slice(0, YAN_REKAP_BATAS_), []);
  return Math.min(ubah.length, YAN_REKAP_BATAS_);
}
