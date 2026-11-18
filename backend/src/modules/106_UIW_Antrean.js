/**
 * C4A (permintaan Master Guswan 15 Nov 2026): antrean kirim ke file UIW (tab uiw_antrean di SiSi_Temuan).
 * Satu baris per entitas: INSPEKSI (laporan -> sheet Inspeksi), KMS (laporan -> sheet KMS), TEMUAN (temuan -> sheet Temuan).
 * Sumber kebenaran tetap c4a_laporan + db_temuan_inspeksi; antrean hanya mencatat status kirim.
 *
 * Status: ANTRE -> TERKIRIM; MENUNGGU (data belum lengkap, tunggu), PERLU_DATA (perlu dibenahi orang, dicek ulang tiap
 * putaran), GAGAL (dicoba ulang dengan jeda), HAPUS (sumber hilang -> hapus di file) -> TERHAPUS.
 * TERKIRIM yang sumbernya berubah (sidik sumber beda) kembali ANTRE. Kolom bantu = alasan, tanpa notifikasi.
 */

var UIW_KOLOM_ = {
  Inspeksi: ['InspeksiID', 'Tanggal', 'UP3', 'ULP', 'Penyulang', 'Section', 'Petugas'],
  Temuan: ['Temuan ID', 'Inspeksi ID', 'Kategori', 'Temuan Awal', 'Foto Awal', 'Lokasi Awal', 'Keterangan Awal', 'Tindak Lanjut',
    'Status', 'Foto Akhir', 'Lokasi Akhir', 'Keterangan Akhir', 'Tanggal Selesai'],
  'KMS': ['Id', 'UP3', 'ULP', 'Penyulang', 'Section', 'Panjang']
};
/** Kolom kunci upsert per sheet UIW. */
var UIW_KUNCI_ = { Inspeksi: 'InspeksiID', Temuan: 'Temuan ID', 'KMS': 'Id' };
var UIW_SHEET_JENIS_ = { INSPEKSI: 'Inspeksi', TEMUAN: 'Temuan', KMS: 'KMS' };
var UIW_FOTO_AWALAN_ = 'Temuan_Images/';
/** Temuan tanpa foto lewat sekian lama = dikirim tanpa foto (foto bisa tidak diambil sama sekali). */
var UIW_TUNGGU_FOTO_MS_ = 24 * 3600e3;
var UIW_JEDA_GAGAL_MS_ = [300000, 900000, 3600000];

/** Section di file UIW = bagian awal section (teks sebelum " - " pertama). */
function sectionAwalUiw_(section) {
  var s = String(section || '').trim();
  var i = s.search(/\s-\s/);
  return (i === -1 ? s : s.slice(0, i)).trim();
}

function jedaGagalUiw_(percobaan) {
  var n = Math.max(1, Number(percobaan) || 1);
  return UIW_JEDA_GAGAL_MS_[Math.min(n, UIW_JEDA_GAGAL_MS_.length) - 1];
}

/** Path foto di file UIW (pola AppSheet): Temuan_Images/<uniqueid>.<Kolom>.<HHmmss WIB>.jpg */
function namaFotoUiw_(uniqueid, kolom, waktuMs) {
  var jam = new Date(Number(waktuMs) + 7 * 3600e3).toISOString().slice(11, 19).replace(/:/g, '');
  return UIW_FOTO_AWALAN_ + uniqueid + '.' + kolom + '.' + jam + '.jpg';
}

function msUiw_(v) {
  if (v instanceof Date) return v.getTime();
  var t = Date.parse(String(v || ''));
  return isFinite(t) ? t : 0;
}

function kosongUiw_(v) { return v === '' || v === null || v === undefined; }

/** Satu kali baca semua sumber untuk satu putaran. */
function bacaKonteksUiw_() {
  var c = cfg_();
  var lap = tabelInsJar_('c4a_laporan'), tem = tabelInsJar_(INSJAR_SHEET_.TEMUAN), tl = tabelInsJar_('db_temuan_tindak_lanjut');
  var ctx = { lap: lap, tem: tem, an: tabelInsJar_('uiw_antrean'), up3: c.UIW_UP3, lapBy: {}, temBy: {}, tlBy: {}, nama: {}, peta: {}, nowMs: Date.now() };
  lap.rows.forEach(function (r) { if (r.c4a_id) ctx.lapBy[String(r.c4a_id)] = r; });
  tem.rows.forEach(function (t) { if (t.c4a_id && t.uniqueid) ctx.temBy[String(t.uniqueid)] = t; });
  tl.rows.forEach(function (r) { var k = String(r.temuan_id); (ctx.tlBy[k] = ctx.tlBy[k] || []).push(r); });
  Object.keys(ctx.tlBy).forEach(function (k) { ctx.tlBy[k].sort(function (a, b) { return msUiw_(a.timestamp) - msUiw_(b.timestamp); }); });
  tabel_('MASTER_SHEET_ID', 'db_Users').rows.forEach(function (u) { ctx.nama[String(u.user_id)] = String(u.nama || '').trim(); });
  ctx.peta = petaUiwJenis_();
  return ctx;
}

/** Sumber entitas antrean: laporan / temuan, atau null bila sudah hilang. */
function sumberUiw_(ent, ctx) {
  if (ent.jenis === 'TEMUAN') {
    var t = ctx.temBy[String(ent.kunci)];
    return t && ctx.lapBy[String(t.c4a_id)] ? t : null;
  }
  return ctx.lapBy[String(ent.kunci)] || null;
}

/** Sidik isi sumber (bukan isi file): berubah = baris TERKIRIM dikirim ulang. Tanpa baca Drive. */
function sidikSumberUiw_(ent, ctx) {
  var s = sumberUiw_(ent, ctx);
  if (!s) return '';
  var isi;
  if (ent.jenis === 'TEMUAN') {
    isi = [s.c4a_id, s.jenis_temuan_id, ctx.peta[String(s.jenis_temuan_id)], s.deskripsi, s.jenis_temuan, s.lat, s.lng, s.foto_temuan_file_id, s.status_wo, s.keterangan_tindak_lanjut,
      String(s.waktu_selesai || ''), (ctx.tlBy[String(s.temuan_id)] || []).map(function (r) {
        return [r.pekerjaan, r.tim, r.lat, r.lng, r.catatan, r.foto_sesudah_file_id, String(r.timestamp || '')];
      })];
  } else {
    isi = [ent.jenis, tglTeksC4A_(s.tanggal), s.ulp, s.penyulang, s.section, ctx.nama[String(s.user_id)], ctx.up3, s.jarak_km, s.status_jarak];
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(isi)).map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function fileAdaUiw_(id) {
  try {
    var f = DriveApp.getFileById(String(id));
    return !(f.isTrashed && f.isTrashed());
  } catch (e) { return false; }
}

function perluDataUiw_(bantu) { return { ok: false, status: 'PERLU_DATA', bantu: bantu }; }
function menungguUiw_(bantu) { return { ok: false, status: 'MENUNGGU', bantu: bantu }; }

/** Kolom wajib kosong pertama (urut daftar), atau ''. */
function wajibKosongUiw_(nilai, daftar) {
  for (var i = 0; i < daftar.length; i++) if (kosongUiw_(nilai[daftar[i]])) return daftar[i];
  return '';
}

/**
 * Baris file UIW satu entitas antrean: { ok: true, sheet, nilai: {judul: nilai}, foto: [{slot, fileId, nama}] } atau
 * { ok: false, status: PERLU_DATA | MENUNGGU, bantu }. Pemeriksaan spec 7.4 nomor 7, 8, 9, 10, 12.
 */
function barisUiw_(ent, ctx) {
  var s = sumberUiw_(ent, ctx);
  if (!s) return perluDataUiw_('sumber tidak ada');
  var lap = ent.jenis === 'TEMUAN' ? ctx.lapBy[String(s.c4a_id)] : s;
  var umum = { UP3: ctx.up3, ULP: String(lap.ulp || ''), Penyulang: String(lap.penyulang || ''), Section: sectionAwalUiw_(lap.section) };
  var nilai, kosong;
  if (ent.jenis === 'INSPEKSI') {
    nilai = { InspeksiID: String(lap.c4a_id), Tanggal: tglTeksC4A_(lap.tanggal), UP3: umum.UP3, ULP: umum.ULP, Penyulang: umum.Penyulang,
      Section: umum.Section, Petugas: ctx.nama[String(lap.user_id)] || '' };
    kosong = wajibKosongUiw_(nilai, ['Tanggal', 'Penyulang', 'Section', 'Petugas']);
    return kosong ? perluDataUiw_('kolom ' + kosong + ' kosong') : { ok: true, sheet: 'Inspeksi', nilai: nilai, foto: [] };
  }
  if (ent.jenis === 'KMS') {
    if (String(lap.status) !== 'SELESAI' || String(lap.status_jarak) !== 'SELESAI' || kosongUiw_(lap.jarak_km)) return menungguUiw_('jarak belum dihitung');
    nilai = { Id: String(lap.c4a_id), UP3: umum.UP3, ULP: umum.ULP, Penyulang: umum.Penyulang, Section: umum.Section, Panjang: Number(lap.jarak_km) };
    kosong = wajibKosongUiw_(nilai, ['Penyulang', 'Section']);
    return kosong ? perluDataUiw_('kolom ' + kosong + ' kosong') : { ok: true, sheet: 'KMS', nilai: nilai, foto: [] };
  }
  return barisTemuanUiw_(s, ctx);
}

/** Catatan tindak lanjut kosong: "<nama tim> - Perbaikan <jenis temuan>" (permintaan Master Guswan 15 Nov 2026). */
function ketAkhirBawaanUiw_(akhir, t) {
  var tim = String(akhir.tim || t.tim_tindak_lanjut || '').trim(), jenis = String(t.jenis_temuan || '').trim();
  return (tim ? tim + ' - ' : '') + 'Perbaikan' + (jenis ? ' ' + jenis : '');
}

function barisTemuanUiw_(t, ctx) {
  var p = ctx.peta[String(t.jenis_temuan_id)];
  if (!p || !p.kode || !p.kategori || !p.temuan) return perluDataUiw_('kategori UIW belum dipetakan untuk "' + String(t.jenis_temuan || '') + '"');
  var selesai = String(t.status_wo) === 'SELESAI';
  var tl = selesai ? (ctx.tlBy[String(t.temuan_id)] || []) : [];
  // pekerjaan terakhir yang berfoto sesudah (WO banyak pekerjaan: foto / lokasi akhir = hasil akhir yang punya bukti), selain itu yang terakhir
  var akhir = null;
  tl.forEach(function (r) { if (String(r.foto_sesudah_file_id || '').trim()) akhir = r; });
  if (!akhir && tl.length) akhir = tl[tl.length - 1];
  var nilai = {
    'Temuan ID': String(t.uniqueid), 'Inspeksi ID': String(t.c4a_id), Kategori: p.kategori, 'Temuan Awal': p.temuan, 'Foto Awal': '',
    'Lokasi Awal': kosongUiw_(t.lat) || kosongUiw_(t.lng) ? '' : t.lat + ', ' + t.lng, 'Keterangan Awal': String(t.jenis_temuan || '').trim(), // permintaan Master Guswan 15 Nov 2026: jenis temuan saja
    // permintaan Master Guswan 16 Nov 2026: pilihan admin saat input (P0 / Perlu Padam / Tidak Padam), bukan nama pekerjaan WO
    'Tindak Lanjut': String(t.keterangan_tindak_lanjut || '').trim(),
    Status: selesai ? 'Close' : 'Open', 'Foto Akhir': '',
    'Lokasi Akhir': akhir && !kosongUiw_(akhir.lat) && !kosongUiw_(akhir.lng) ? akhir.lat + ', ' + akhir.lng : '',
    // permintaan Master Guswan 15 Nov 2026: catatan tindak lanjut; kosong = nama pekerjaan (baris Close tidak tanpa keterangan)
    'Keterangan Akhir': akhir ? (String(akhir.catatan || '').trim() || ketAkhirBawaanUiw_(akhir, t)) : '',
    'Tanggal Selesai': selesai && t.waktu_selesai ? tglJakarta_(new Date(msUiw_(t.waktu_selesai))) : ''
  };
  var kosong = wajibKosongUiw_(nilai, ['Kategori', 'Temuan Awal', 'Lokasi Awal']);
  if (kosong) return perluDataUiw_('kolom ' + kosong + ' kosong');
  var foto = [];
  var idAwal = String(t.foto_temuan_file_id || '').trim();
  if (!idAwal) {
    if (ctx.nowMs - msUiw_(t.timestamp) < UIW_TUNGGU_FOTO_MS_) return menungguUiw_('foto belum terunggah');
  } else {
    if (!fileAdaUiw_(idAwal)) return perluDataUiw_('foto asli hilang');
    nilai['Foto Awal'] = namaFotoUiw_(t.uniqueid, 'Foto Awal', msUiw_(t.timestamp));
    foto.push({ slot: 'AWAL', fileId: idAwal, nama: nilai['Foto Awal'].slice(UIW_FOTO_AWALAN_.length) });
  }
  var idAkhir = akhir ? String(akhir.foto_sesudah_file_id || '').trim() : '';
  if (idAkhir) {
    if (!fileAdaUiw_(idAkhir)) return perluDataUiw_('foto asli hilang');
    nilai['Foto Akhir'] = namaFotoUiw_(t.uniqueid, 'Foto Akhir', msUiw_(akhir.timestamp));
    foto.push({ slot: 'AKHIR', fileId: idAkhir, nama: nilai['Foto Akhir'].slice(UIW_FOTO_AWALAN_.length) });
  }
  return { ok: true, sheet: 'Temuan', nilai: nilai, foto: foto };
}

/**
 * Samakan antrean dengan sumber: entitas baru = ANTRE, TERKIRIM yang sumbernya berubah = ANTRE, sumber hilang = HAPUS.
 * Hanya laporan C4A + temuan ber-c4a_id (data lama tidak dikirim). Hanya dipanggil putaran (giliran eksklusif ambilGiliranUiw_):
 * uiw_antrean tidak ditulis endpoint mana pun, jadi tidak perlu ScriptLock.
 */
function segarkanAntreanUiw_(ctx) {
  var an = ctx.an, hasil = { antre: 0, hapus: 0 }, ada = {}, sekarang = sekarangIso_();
  an.rows.forEach(function (r) { ada[r.jenis + '|' + r.kunci] = r; });
  var mau = [];
  Object.keys(ctx.lapBy).forEach(function (id) {
    mau.push({ jenis: 'INSPEKSI', kunci: id, c4a_id: id });
    mau.push({ jenis: 'KMS', kunci: id, c4a_id: id });
  });
  Object.keys(ctx.temBy).forEach(function (u) {
    var t = ctx.temBy[u];
    if (ctx.lapBy[String(t.c4a_id)]) mau.push({ jenis: 'TEMUAN', kunci: u, c4a_id: String(t.c4a_id) });
  });
  mau.forEach(function (e) {
    if (ada[e.jenis + '|' + e.kunci]) return;
    var baris = { nomor: an.rows.length + 1, jenis: e.jenis, kunci: e.kunci, c4a_id: e.c4a_id, status: 'ANTRE', bantu: '', percobaan: 0,
      coba_lagi_setelah: '', waktu_coba: '', waktu_terkirim: '', sidik: '', foto_awal_uiw: '', foto_akhir_uiw: '', antrean_id: uuid_(),
      dibuat_oleh: 'SISTEM', diubah_oleh: 'SISTEM', timestamp: sekarang, timestamp_update: sekarang, revision: 1 };
    tambahBaris_(an, baris);
    an.rows.push(baris);
    ada[e.jenis + '|' + e.kunci] = baris;
    hasil.antre++;
  });
  an.rows.forEach(function (r) {
    var st = String(r.status);
    if (st === 'HAPUS' || st === 'TERHAPUS') return;
    if (!sumberUiw_(r, ctx)) {
      ubahAntreanUiw_(an, r, { status: 'HAPUS', bantu: '', coba_lagi_setelah: '' });
      hasil.hapus++;
    } else if (st === 'TERKIRIM' && (ctx.penuh !== false || sumberBerubahUiw_(r, ctx))) {
      if (String(r.sidik) !== sidikSumberUiw_(r, ctx)) {
        ubahAntreanUiw_(an, r, { status: 'ANTRE', bantu: '', percobaan: 0, coba_lagi_setelah: '' });
        hasil.antre++;
      } else if (ctx.penuh === false) {
        // cap waktu sumber dekat waktu kirim (mis. jarak dihitung dalam putaran yang sama) tetapi isinya sama: catat waktu periksa
        // supaya putaran berikutnya tidak memeriksa baris ini lagi
        ubahAntreanUiw_(an, r, { waktu_coba: sekarangIso_() });
      }
    }
  });
  return hasil;
}

/**
 * Sumber baris TERKIRIM berubah sejak dikirim? Hanya bandingkan cap waktu (tanpa menghitung sidik): sumber (laporan / temuan) atau
 * tindak lanjut temuan lebih baru dari waktu kirim dikurangi satu putaran (perubahan selama putaran sebelumnya tidak boleh terlewat).
 * Sapuan penuh tiap 60 menit tetap membandingkan sidik semua baris (perubahan master / nama petugas tidak mengubah cap waktu sumber).
 */
function sumberBerubahUiw_(r, ctx) {
  var acuan = Math.max(msUiw_(r.waktu_terkirim), msUiw_(r.waktu_coba)), batas = acuan - UIW_BATAS_PUTARAN_MS_;
  if (!acuan) return true;
  var s = sumberUiw_(r, ctx);
  if (!s) return true;
  if (msUiw_(s.timestamp_update) > batas) return true;
  if (r.jenis !== 'TEMUAN') return false;
  return (ctx.tlBy[String(s.temuan_id)] || []).some(function (x) { return msUiw_(x.timestamp_update || x.timestamp) > batas; });
}

/** Ubah satu baris antrean (sheet + salinan di memori). */
function ubahAntreanUiw_(an, r, u) {
  u.diubah_oleh = 'SISTEM';
  r.revision = ubahBaris_(an, 'antrean_id', r.antrean_id, u);
  Object.keys(u).forEach(function (k) { r[k] = u[k]; });
}
