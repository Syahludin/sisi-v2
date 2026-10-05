/**
 * Detail arsip per tanggal (tab Arsip > Lihat Pekerjaan). Keputusan 4 Okt 2026 (v0.37):
 *  - getArsipHariRow { tanggal, timId? }: semua header AKTIF tanggal itu (sampai KEMARIN, sama dengan getArsipRow)
 *    beserta realisasi AKTIF + eksekusi AKTIF + metadata foto AKTIF per slot. PETUGAS hanya tim sendiri
 *    (timLaporan_); ADMIN / ADMIN_ES / SUPER semua tim atau timId pilihan. Hanya baca, tanpa lock.
 *  - drive_file_id TIDAK pernah dikirim ke HP. Foto yang lolos cek kepemilikan dicatat di cache
 *    (kunci = token sesi + foto_id, 6 jam; isi = file ID + sha256, v0.47 file dicek mime + sha256 sebelum dikirim). getFotoArsipRow { fotoId } hanya melayani foto di cache itu,
 *    jadi tidak perlu membaca 4 sheet per foto. Cache habis = ARSIP_FOTO_KEDALUWARSA (HP memanggil ulang detail).
 *  - Membaca row_* penuh (bukan jendela 7 hari) karena arsip boleh lebih tua; jarang dipanggil.
 */
var ARSIP_FOTO_TTL_ = 21600;
var URUT_SLOT_ = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];

function kunciArsipFoto_(sesi, fotoId) { return 'arsip-foto:' + String(sesi._tokenHash || '').slice(0, 24) + ':' + fotoId; }

function getArsipHariRow_(sesi, data) {
  var d = validasi_(data, { tanggal: { tipe: 'tanggal', wajib: true }, timId: { tipe: 'uuid' } });
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  var timFilter = timLaporan_(sesi, d.timId);
  if (!sesi._tokenHash) throw new SisiError_('SESI_TIDAK_VALID');
  var waktu = waktuRow_();
  // Hari H: PETUGAS memakai data HP (tab Hari ini). ADMIN / ADMIN_ES / SUPER boleh hari ini (v0.50, menu Operasi >
  // Laporan per Tim). Masa depan selalu ditolak.
  if (d.tanggal > waktu.hariIni || (d.tanggal === waktu.hariIni && sesi.role === 'PETUGAS')) {
    throw new SisiError_('TANGGAL_DI_LUAR_BATAS', d.tanggal);
  }
  var w = stopwatch_();
  var H = tabel_('ROW_SHEET_ID', ROW_SHEET_.header).rows;
  var header = H.filter(function (h) {
    return h.header_id && h.status === 'AKTIF' && tanggalDariKode_(h['Kode Header']) === d.tanggal &&
           (!timFilter || String(h.tim_id) === timFilter);
  });
  var hasil = { tanggal: d.tanggal, laporan: [] };
  if (!header.length) { w('baca'); if (c.ENV === 'staging') hasil._waktu = w.ringkas(); return hasil; }
  var idHeader = {};
  header.forEach(function (h) { idHeader[String(h.header_id)] = true; });
  var R = tabel_('ROW_SHEET_ID', ROW_SHEET_.realisasi).rows.filter(function (r) {
    return idHeader[String(r.header_id)] && r.status === 'AKTIF';
  });
  var idReal = {};
  R.forEach(function (r) { idReal[String(r.realisasi_id)] = true; });
  var E = tabel_('ROW_SHEET_ID', ROW_SHEET_.eksekusi).rows.filter(function (e) {
    return idReal[String(e.realisasi_id)] && e.status === 'AKTIF';
  });
  var idEks = {};
  E.forEach(function (e) { idEks[String(e.eksekusi_id)] = true; });
  var F = tabel_('ROW_SHEET_ID', ROW_SHEET_.foto).rows.filter(function (f) {
    return idEks[String(f.eksekusi_id)] && f.status === 'AKTIF' && f.drive_file_id;
  });
  w('baca');

  var teks = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
  var angka = function (v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); };
  var iso = function (v) { var x = keDate_(v); return x ? x.toISOString() : ''; };
  var urutKode = function (kolom) { return function (a, b) { return String(a[kolom]) < String(b[kolom]) ? -1 : 1; }; };

  // foto AKTIF terbaru per slot
  var fotoPer = {};
  F.forEach(function (f) {
    var m = fotoPer[String(f.eksekusi_id)] = fotoPer[String(f.eksekusi_id)] || {};
    var lama = m[String(f.slot)];
    var t = keDate_(f.Timestamp), tl = lama ? keDate_(lama.Timestamp) : null;
    if (!lama || (t && (!tl || t.getTime() >= tl.getTime()))) m[String(f.slot)] = f;
  });
  var izin = {};
  var eksPer = {};
  E.sort(urutKode('Kode Eksekusi')).forEach(function (e) {
    var m = fotoPer[String(e.eksekusi_id)] || {};
    var foto = URUT_SLOT_.filter(function (s) { return m[s]; }).map(function (s) {
      var f = m[s];
      izin[kunciArsipFoto_(sesi, String(f.foto_id))] = JSON.stringify({ f: String(f.drive_file_id), s: teks(f.sha256) });
      return { fotoId: String(f.foto_id), slot: s, sha256: teks(f.sha256), ukuranByte: Number(f.ukuran_byte) || 0,
               sumber: teks(f.sumber_foto) };
    });
    (eksPer[String(e.realisasi_id)] = eksPer[String(e.realisasi_id)] || []).push({
      eksekusiId: String(e.eksekusi_id), kode: teks(e['Kode Eksekusi']), section: teks(e.Section),
      nomorTiang: teks(e['Nomor Tiang']), koordinatTiang: teks(e['Koordinat Tiang']),
      koordinatPekerjaan: teks(e['Koordinat Pekerjaan']), diameter: angka(e.Diameter), jenis: teks(e['Jenis Pekerjaan']),
      fotoLengkap: isAktif_(e.foto_lengkap), sumber: teks(e.sumber), inputOleh: teks(e['Input Oleh']),
      waktu: iso(e.Timestamp), foto: foto
    });
  });
  var realPer = {};
  R.sort(urutKode('Kode Pekerjaan')).forEach(function (r) {
    (realPer[String(r.header_id)] = realPer[String(r.header_id)] || []).push({
      realisasiId: String(r.realisasi_id), kode: teks(r['Kode Pekerjaan']), penyulang: teks(r.Penyulang),
      section: teks(r.Section), rabas: Number(r.Rabas) || 0, sedang: Number(r.Sedang) || 0, besar: Number(r.Besar) || 0,
      eksekusi: eksPer[String(r.realisasi_id)] || []
    });
  });
  hasil.laporan = header.sort(urutKode('Kode Header')).map(function (h) {
    var real = realPer[String(h.header_id)] || [];
    var wa = teks(h['WA Text']);
    return {
      headerId: String(h.header_id), kodeHeader: teks(h['Kode Header']), tanggal: d.tanggal, timId: String(h.tim_id),
      tim: teks(h.Tim), subTim: teks(h['Sub-Tim']), koordinatAwal: teks(h['Koordinat Awal']),
      koordinatAkhir: teks(h['Koordinat Akhir']), kmAwal: angka(h['KM Awal']), kmAkhir: angka(h['KM Akhir']),
      kendala: teks(h.Kendala), inputOleh: teks(h['Input By']),
      total: real.reduce(function (a, r) { return { rabas: a.rabas + r.rabas, sedang: a.sedang + r.sedang, besar: a.besar + r.besar }; },
                         { rabas: 0, sedang: 0, besar: 0 }),
      siapKirim: wa !== '', waText: wa, realisasi: real
    };
  });
  var kunci = Object.keys(izin);
  for (var i = 0; i < kunci.length; i += 100) {   // putAll per 100 kunci
    var potong = {};
    kunci.slice(i, i + 100).forEach(function (k) { potong[k] = izin[k]; });
    CacheService.getScriptCache().putAll(potong, ARSIP_FOTO_TTL_);
  }
  w('susun');
  if (c.ENV === 'staging') hasil._waktu = w.ringkas();
  return hasil;
}

/** 1 foto arsip (base64). Hanya foto yang sudah lolos cek kepemilikan di getArsipHariRow sesi yang sama. */
function getFotoArsipRow_(sesi, data) {
  var d = validasi_(data, { fotoId: { tipe: 'uuid', wajib: true } });
  timLaporan_(sesi, null);   // PETUGAS non-ROW ditolak
  if (!sesi._tokenHash) throw new SisiError_('SESI_TIDAK_VALID');
  var izin = null;
  try { izin = JSON.parse(CacheService.getScriptCache().get(kunciArsipFoto_(sesi, d.fotoId)) || 'null'); } catch (e) { izin = null; }
  // izin format lama (v0.37-v0.46: teks ID saja) dianggap kedaluwarsa, HP memanggil ulang detail
  if (!izin || typeof izin !== 'object' || !izin.f) throw new SisiError_('ARSIP_FOTO_KEDALUWARSA');
  var v = bytesFotoTerverifikasi_(izin.f, izin.s);
  return { fotoId: d.fotoId, mime: 'image/jpeg', ukuranByte: v.bytes.length, sha256: v.sha256,
           data: Utilities.base64Encode(v.bytes) };
}
