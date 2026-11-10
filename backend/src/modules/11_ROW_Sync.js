/**
 * syncRow (PRD 6. Endpoint > syncRow, 4. Fitur > F-ROW-SYNC). Keputusan 3 Okt 2026:
 *  - Tanggal data: hari ini s.d. 7 hari ke belakang (WIB). Lebih tua = terkunci (tidak bisa buat/ubah/batal).
 *  - Server hanya membaca JENDELA 7 hari terakhir (berdasar Timestamp terima), bukan seluruh sheet.
 *    Aman karena kode & UUID yang relevan pasti punya tanggal di dalam jendela.
 *  - 1 header AKTIF per sub-tim per tanggal; penyulang unik per header.
 *  - Idempoten tanpa sheet tambahan: buat UUID yang sudah ada = DUPLIKAT; ubah yang sudah diterapkan = DUPLIKAT.
 *  - Anak ikut nasib induk (INDUK_GAGAL / INDUK_BENTROK).
 *  - KODE_BENTROK dicatat di log_Audit, tanpa email.
 * Urutan proses: buat/ubah (header -> realisasi -> eksekusi), lalu batal (eksekusi -> realisasi -> header).
 * Semua baca dulu, semua tulis di akhir (tanpa flush paksa). Error tak terduga = tidak ada yang ditulis.
 */
var ROW_SHEET_ = { header: 'row_Header', realisasi: 'row_Realisasi', eksekusi: 'row_Eksekusi', foto: 'row_Foto' };
var ROW_ID_ = { header: 'header_id', realisasi: 'realisasi_id', eksekusi: 'eksekusi_id', foto: 'foto_id' };
var ROW_KODE_ = { header: 'Kode Header', realisasi: 'Kode Pekerjaan', eksekusi: 'Kode Eksekusi' };
var ROW_TS_ = { header: 'TimeStamp', realisasi: 'Timestamp', eksekusi: 'Timestamp', foto: 'Timestamp' };
var ROW_TSU_ = { header: 'TimeStamp Update', realisasi: 'Timestamp Update', eksekusi: 'Timestamp Update', foto: 'Timestamp Update' };
var ROW_OLEH_ = { header: 'Input By', realisasi: 'Input Oleh', eksekusi: 'Input Oleh' };
var ROW_BATAS_HARI_ = 7;
var ROW_MAKS_OP_ = 50;
var HARI_ID_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Batas waktu bersama: 7 hari ke belakang + awal bulan dari batas itu (untuk total bulanan). */
function waktuRow_() {
  var sekarang = new Date();
  var batasTgl = tglJakarta_(new Date(sekarang.getTime() - ROW_BATAS_HARI_ * 864e5));
  return { sekarang: sekarang, hariIni: tglJakarta_(sekarang), batasTgl: batasTgl,
           cutoff: new Date(batasTgl + 'T00:00:00+07:00'),
           cutoffBulan: new Date(batasTgl.slice(0, 7) + '-01T00:00:00+07:00') };
}

/** Header & eksekusi: jendela 7 hari. Realisasi: sejak awal bulan (total bulanan WA), penunjuk terpisah. */
function bacaJendelaRow_(waktu) {
  return { header: jendelaRow_('header', waktu.cutoff),
           realisasi: jendelaRow_('realisasi', waktu.cutoffBulan, 'ROW_JENDELA_BULAN_'),
           eksekusi: jendelaRow_('eksekusi', waktu.cutoff) };
}

function hariDari_(tanggalIso) { return HARI_ID_[new Date(tanggalIso + 'T00:00:00Z').getUTCDay()]; }

/** Tanggal dari kode berantai (18 karakter pertama = kode header). Sumber tanggal yang tidak bergantung format sel. */
function tanggalDariKode_(kode) {
  var p = parseKodeHeaderRow_(String(kode || '').slice(0, 18));
  return p ? p.tanggal : null;
}

/** Header sheet ROW wajib sama persis dengan skema; dicek ulang paling lama tiap 6 jam. */
function headerRowTerverifikasi_(sh, nama) {
  var skema = skemaHeader_().ROW_SHEET_ID[nama];
  var cache = CacheService.getScriptCache();
  // v0.62.6: kunci ikut SESI_EPOCH, jadi ADMIN_bersihkanCache langsung memaksa header dicek ulang (dulu tunggu 6 jam).
  var kunci = 'hdr-ok:' + cfg_().SESI_EPOCH + ':' + nama;
  if (cache.get(kunci)) return skema;
  var ada = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  while (ada.length && !ada[ada.length - 1]) ada.pop();
  if (ada.join('|') !== skema.join('|')) throw new SisiError_('CONFIG_TIDAK_VALID', 'header ' + nama);
  try { cache.put(kunci, '1', 21600); } catch (eC) { /* abaikan bila cache penuh */ }   // 6 jam (batas CacheService); header ROW jarang berubah
  return skema;
}

/**
 * Baca baris yang diterima sejak `cutoff`. Penunjuk baris awal disimpan di Script Property
 * ROW_JENDELA_<sheet> dan hanya maju. Syarat: sheet ROW hanya di-append server, tidak di-sort.
 */
function jendelaRow_(jenis, cutoff, awalanKunci) {
  var nama = ROW_SHEET_[jenis];
  var sh = bukaSpreadsheet_(cfg_().ROW_SHEET_ID).getSheetByName(nama);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', nama);
  var header = headerRowTerverifikasi_(sh, nama);
  var akhir = sh.getLastRow();
  var props = PropertiesService.getScriptProperties();
  var kunci = (awalanKunci || 'ROW_JENDELA_') + nama;
  var p = Number(props.getProperty(kunci)) || 2;
  if (p < 2 || p > akhir + 1) p = 2;
  var nilai = akhir >= p ? sh.getRange(p, 1, akhir - p + 1, header.length).getValues() : [];
  var idxTs = header.indexOf(ROW_TS_[jenis]);
  var geser = 0;
  while (geser < nilai.length) {
    var ts = keDate_(nilai[geser][idxTs]);
    if (ts && ts.getTime() >= cutoff.getTime()) break;
    geser++;
  }
  var rows = [];
  for (var i = geser; i < nilai.length; i++) {
    var o = { _baris: p + i };
    var kosong = true;
    for (var j = 0; j < header.length; j++) {
      o[header[j]] = nilai[i][j];
      if (nilai[i][j] !== '' && nilai[i][j] !== null) kosong = false;
    }
    if (!kosong) rows.push(o);
  }
  if (geser > 0) {
    try { props.setProperty(kunci, String(p + geser)); } catch (eP) { /* abaikan */ }
  }
  return { sheet: sh, nama: nama, header: header, rows: rows, akhir: akhir, dalamLock: LOCK_AKTIF_.ya };
}

/** db_Jaringan + db_Jenis_Pekerjaan untuk validasi ROW (cache CACHE_DETIK). */
function masterRow_() {
  var cache = CacheService.getScriptCache();
  var ada = cache.get('master-row:v3');
  if (ada) {
    try { return JSON.parse(ada); } catch (eJ) { /* baca ulang */ }
  }
  var jaringan = {};
  tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.forEach(function (r) {
    if (!r.section_id) return;
    jaringan[String(r.section_id)] = {
      penyulang: String(r.penyulang).trim(), section: String(r.section).trim(),
      parent: r.parent_section_id ? String(r.parent_section_id) : '', urutan: Number(r.urutan) || 0, aktif: isAktif_(r.aktif),
      baris: Number(r._baris) || 0   // pemecah seri / urutan kosong (v0.46: urutan utama = kolom urutan)
    };
  });
  var jenis = tabel_('MASTER_SHEET_ID', 'db_Jenis_Pekerjaan').rows
    .filter(function (r) { return r.jenis_id; })
    .map(function (r) {
      return { jenis_id: String(r.jenis_id), modul: String(r.modul), nama: String(r.nama), satuan: String(r.satuan || ''),
               urutan: Number(r.urutan) || 0, diameter_min: r.diameter_min, diameter_max: r.diameter_max, aktif: r.aktif };
    });
  var hasil = { jaringan: jaringan, jenis: jenis };
  try { cache.put('master-row:v3', JSON.stringify(hasil), cfg_().CACHE_DETIK); } catch (eC) { /* >100KB: tanpa cache */ }
  return hasil;
}

/** Kolom hitungan realisasi untuk satu jenis pekerjaan (lewat jenis_id -> master). */
function kolomHitungJenis_(jenis) {
  var n = String(jenis && jenis.nama || '').toLowerCase();
  if (/besar/.test(n)) return 'Besar';
  if (/sedang/.test(n)) return 'Sedang';
  if (/rabas|pangkas/.test(n)) return 'Rabas';
  return null;
}

/**
 * Section realisasi = DAFTAR section eksekusinya, dipisah koma, tanpa penggabungan rentang (keputusan 3 Okt 2026).
 * Urutan (v0.46, keputusan Master Guswan 4 Okt 2026) = kolom `urutan` db_Jaringan per penyulang: angka kecil = dekat PMT / sumber.
 * Isi kelipatan 20 (v0.46.1) supaya section baru bisa disisip (mis. 30) tanpa memindah baris. `urutan` kosong / 0 = di belakang
 * yang bernomor, urut baris sheet; seri juga dipecah urutan baris, lalu nama. ADMIN_lengkapiMaster mengisi yang kosong.
 */
function kunciSection_(x, id) {
  x = x || {};
  var u = Number(x.urutan), b = Number(x.baris);
  return [u > 0 ? u : Infinity, b > 0 ? b : Infinity, String(x.section || id)];
}

function urutSection_(jaringan) {
  return function (a, b) {
    var ka = kunciSection_(jaringan[a], a), kb = kunciSection_(jaringan[b], b);
    for (var i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
  };
}

/**
 * Rencana isi `urutan` db_Jaringan yang kosong / 0, per penyulang. Yang kosong ditaruh SETELAH nomor terbesar
 * (kelipatan 20, urut baris), jadi urutan laporan tidak berubah sama sekali setelah diisi.
 * Sel berisi teks bukan angka tidak ditimpa (diperingatkan). Juga memperingatkan nomor ganda dalam satu penyulang.
 */
function rencanaUrutanSection_(rows) {
  var grup = {}, isi = [], peringatan = [];
  rows.forEach(function (r) {
    var p = String(r.penyulang || '').trim();
    if (!p || !String(r.section || '').trim()) return;
    (grup[p.toLowerCase()] = grup[p.toLowerCase()] || { nama: p, rows: [] }).rows.push(r);
  });
  Object.keys(grup).forEach(function (k) {
    var g = grup[k], maks = 0, lihat = {};
    var urutBaris = g.rows.slice().sort(function (a, b) { return a._baris - b._baris; });
    urutBaris.forEach(function (r) {
      var v = r.urutan, n = Number(v);
      var kosong = v === '' || v === null || v === undefined || n === 0;
      if (kosong) return;
      if (!(n > 0)) { peringatan.push('db_Jaringan baris ' + r._baris + ': urutan "' + v + '" bukan angka positif, tidak diubah'); return; }
      if (lihat[n]) peringatan.push('db_Jaringan: urutan ' + n + ' ganda di penyulang "' + g.nama + '" (baris ' + lihat[n] + ' & ' + r._baris + ')');
      lihat[n] = r._baris;
      if (n > maks) maks = n;
    });
    var LANGKAH = 20, dasar = Math.floor(maks / LANGKAH) * LANGKAH;
    urutBaris.forEach(function (r) {
      var v = r.urutan;
      if (v === '' || v === null || v === undefined || Number(v) === 0) {
        dasar += LANGKAH;
        isi.push({ baris: r._baris, nilai: dasar, penyulang: g.nama, section: String(r.section).trim() });
      }
    });
  });
  return { isi: isi, peringatan: peringatan };
}

function sectionDaftar_(ids, jaringan) {
  var unik = [];
  ids.forEach(function (id) { if (id && unik.indexOf(id) === -1 && jaringan[id]) unik.push(id); });
  return unik.sort(urutSection_(jaringan)).map(function (id) { return jaringan[id].section; }).join(', ');
}

var SKEMA_OP_ROW_ = {
  opId: { tipe: 'uuid', wajib: true },
  jenis: { tipe: 'pilihan', wajib: true, pilihan: ['header', 'realisasi', 'eksekusi'] },
  aksi: { tipe: 'pilihan', wajib: true, pilihan: ['buat', 'ubah', 'batal'] },
  id: { tipe: 'uuid', wajib: true },
  kode: { tipe: 'teks', maks: 60 },
  revision: { tipe: 'angka', bulat: true, min: 0 },
  waktuPerangkat: { tipe: 'waktu' }
};

var ISI_ROW_ = {
  header: {
    buat: { tanggal: { tipe: 'tanggal', wajib: true }, koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
            kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 }, kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 } },
    ubah: { koordinatAwal: { tipe: 'koordinat' }, koordinatAkhir: { tipe: 'koordinat' },
            kmAwal: { tipe: 'angka', min: 0, max: 100000 }, kmAkhir: { tipe: 'angka', min: 0, max: 100000 }, kendala: { tipe: 'teks', maks: 500, multiBaris: true, maksBaris: 5 } }
  },
  realisasi: {
    buat: { headerId: { tipe: 'uuid', wajib: true }, penyulang: { tipe: 'teks', wajib: true, maks: 100 } }
  },
  eksekusi: {
    buat: { realisasiId: { tipe: 'uuid', wajib: true }, sectionId: { tipe: 'uuid', wajib: true },
            nomorTiang: { tipe: 'teks', maks: 40 }, koordinatTiang: { tipe: 'koordinat' },
            koordinatPekerjaan: { tipe: 'koordinat', wajib: true },
            diameter: { tipe: 'angka', wajib: true, bulat: true, min: 0, max: 1000 },
            jenisId: { tipe: 'uuid', wajib: true }, sumber: { tipe: 'pilihan', pilihan: ['LANGSUNG'] } },
    ubah: { sectionId: { tipe: 'uuid' }, nomorTiang: { tipe: 'teks', maks: 40 }, koordinatTiang: { tipe: 'koordinat' },
            koordinatPekerjaan: { tipe: 'koordinat' }, diameter: { tipe: 'angka', bulat: true, min: 0, max: 1000 },
            jenisId: { tipe: 'uuid' } }
  }
};

/** Field yang boleh DIKOSONGKAN lewat ubah (kirim null / ""). */
var BOLEH_KOSONG_ROW_ = { header: ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir', 'kendala'], eksekusi: ['koordinatTiang', 'nomorTiang'] };   // nomorTiang opsional (3 Okt 2026), boleh dihapus lewat Edit

function syncRow_(sesi, data, platform) {
  wajibPetugasRow_(sesi);   // v0.62.4: role PETUGAS + tim ROW. v0.66.2: dicek PALING AWAL (sebelum isi data dibaca)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  Object.keys(data).forEach(function (k) { if (k !== 'operasi') throw new SisiError_('FIELD_TIDAK_DIKENAL', k); });
  var mentah = data.operasi;
  if (!Array.isArray(mentah) || !mentah.length) throw new SisiError_('FIELD_WAJIB', 'operasi');
  if (mentah.length > ROW_MAKS_OP_) throw new SisiError_('TERLALU_BANYAK_OPERASI', mentah.length);
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');

  var waktu = waktuRow_();

  return denganLock_(function () {
    var w = stopwatch_();
    var master = masterRow_();
    w('master');
    var T = bacaJendelaRow_(waktu);
    var logT = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    w('baca');
    var ctx = konteksSync_(T, master, sesi, c, waktu);
    var hasil = prosesOperasiRow_(ctx, mentah);
    hitungUlangRealisasi_(ctx);
    hitungUlangWa_(ctx);
    w('proses');
    tulisSync_(ctx);
    var hitung = {};
    hasil.forEach(function (h) { hitung[h.status] = (hitung[h.status] || 0) + 1; });
    auditLog_(sesi, 'SYNC_ROW', '', JSON.stringify(hitung), platform, logT);
    (ctx.auditBatal || []).forEach(function (b) { auditLog_(sesi, 'BATAL_ROW', b.kode, b.detail, platform, logT); });
    hasil.filter(function (h) { return h.status === 'KODE_BENTROK' && h.alasan !== 'INDUK_BENTROK'; }).forEach(function (h) {
      auditLog_(sesi, 'KODE_BENTROK', h.kode || '', 'opId ' + h.opId, platform, logT);
    });
    w('tulis');
    var keluar = { hasil: hasil };
    if (c.ENV === 'staging') keluar._waktu = w.ringkas();
    return keluar;
  });
}

function konteksSync_(T, master, sesi, c, waktu) {
  var ctx = { T: T, master: master, sesi: sesi, c: c, waktu: waktu, byId: {}, byKode: {},
              baru: { header: [], realisasi: [], eksekusi: [] }, kotorRealisasi: {}, kotorHeader: {}, statusBatch: {} };
  ['header', 'realisasi', 'eksekusi'].forEach(function (j) {
    ctx.byId[j] = {}; ctx.byKode[j] = {};
    T[j].rows.forEach(function (r) {
      var id = String(r[ROW_ID_[j]] || '');
      if (id) ctx.byId[j][id] = r;
      var kode = String(r[ROW_KODE_[j]] || '');
      if (kode) ctx.byKode[j][kode] = r;
    });
  });
  return ctx;
}

function prosesOperasiRow_(ctx, mentah) {
  var hasil = new Array(mentah.length);
  var ops = [];
  var opIdTerpakai = {};
  mentah.forEach(function (raw, i) {
    var opIdMentah = raw && typeof raw === 'object' && typeof raw.opId === 'string' ? raw.opId : '';
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SisiError_('DATA_TIDAK_VALID');
      var tanpaIsi = {};
      Object.keys(raw).forEach(function (k) { if (k !== 'isi') tanpaIsi[k] = raw[k]; });
      var op = validasi_(tanpaIsi, SKEMA_OP_ROW_);
      var isi = raw.isi === undefined || raw.isi === null ? {} : raw.isi;
      if (typeof isi !== 'object' || Array.isArray(isi)) throw new SisiError_('DATA_TIDAK_VALID', 'isi');
      op.isi = isi;
      if (opIdTerpakai[op.opId]) throw new SisiError_('OP_GANDA');
      opIdTerpakai[op.opId] = true;
      if (op.aksi === 'buat' && !op.kode) throw new SisiError_('FIELD_WAJIB', 'kode');
      if (op.aksi !== 'buat' && op.revision === undefined) throw new SisiError_('FIELD_WAJIB', 'revision');
      op._i = i;
      ops.push(op);
    } catch (e) {
      if (!e || !e.kode) throw e;
      hasil[i] = { opId: opIdMentah, status: 'DITOLAK', alasan: e.kode };
    }
  });
  var urutJenis = { header: 1, realisasi: 2, eksekusi: 3 };
  var kunci = function (op) { return op.aksi === 'batal' ? 10 - urutJenis[op.jenis] : urutJenis[op.jenis]; };
  ops.slice().sort(function (a, b) { return (kunci(a) - kunci(b)) || (a._i - b._i); }).forEach(function (op) {
    var h;
    try {
      h = satuOperasiRow_(ctx, op);
    } catch (e) {
      if (!e || !e.kode) throw e;   // bug server: batalkan seluruh batch, tidak ada yang ditulis
      h = { status: 'DITOLAK', alasan: e.kode };
    }
    h.opId = op.opId;
    if (op.aksi === 'buat') ctx.statusBatch[op.id] = h.status;
    hasil[op._i] = h;
  });
  return hasil;
}

function ditolak_(alasan) { return { status: 'DITOLAK', alasan: alasan }; }

/** Status untuk anak yang induknya tidak ada di server. */
function statusIndukHilang_(ctx, indukId) {
  var s = ctx.statusBatch[indukId];
  if (s === 'KODE_BENTROK') return { status: 'KODE_BENTROK', alasan: 'INDUK_BENTROK' };
  if (s) return ditolak_('INDUK_GAGAL');
  return ditolak_('INDUK_TIDAK_ADA');
}

function headerDari_(ctx, jenis, row) {
  if (jenis === 'header') return row;
  if (jenis === 'realisasi') return ctx.byId.header[String(row.header_id)] || null;
  var r = ctx.byId.realisasi[String(row.realisasi_id)];
  return r ? ctx.byId.header[String(r.header_id)] || null : null;
}

function dalamBatasTanggal_(ctx, tanggal) {
  return !!tanggal && tanggal >= ctx.waktu.batasTgl && tanggal <= ctx.waktu.hariIni;
}

function hasilSimpan_(jenis, row, status) {
  return { status: status, kode: String(row[ROW_KODE_[jenis]]), revision: Number(row.revision) || 0 };
}

function satuOperasiRow_(ctx, op) {
  var j = op.jenis;
  var ada = ctx.byId[j][op.id];
  if (op.aksi === 'buat') {
    if (ada) {
      var hdr = headerDari_(ctx, j, ada);
      if (!hdr || String(hdr.tim_id) !== ctx.sesi.timId) return ditolak_('ID_DIPAKAI');
      return hasilSimpan_(j, ada, 'DUPLIKAT');
    }
    if (j === 'header') return buatHeaderRow_(ctx, op);
    if (j === 'realisasi') return buatRealisasiRow_(ctx, op);
    return buatEksekusiRow_(ctx, op);
  }
  if (!ada) return ditolak_('DATA_TIDAK_DITEMUKAN');
  var h = headerDari_(ctx, j, ada);
  if (!h || String(h.tim_id) !== ctx.sesi.timId) return ditolak_('BUKAN_MILIK_TIM');
  if (!dalamBatasTanggal_(ctx, tanggalDariKode_(ada[ROW_KODE_[j]]))) return ditolak_('DATA_TERKUNCI');
  // v1.0.10: eksekusi dari WO tindak lanjut temuan (sumber TEMUAN) dikunci, supaya realisasi tetap sama dengan WO Selesai
  if (j === 'eksekusi' && String(ada.sumber || '') === 'TEMUAN') return ditolak_('TERKUNCI_WO');
  if (op.aksi === 'batal') return batalRow_(ctx, op, ada);
  return ubahRow_(ctx, op, ada);
}

function barisBaru_(ctx, jenis, isi) {
  var s = ctx.sesi, t = ctx.waktu.sekarang;
  var row = { _baru: true, status: 'AKTIF', revision: 1, dibuat_oleh: s.userId, diubah_oleh: s.userId };
  row[ROW_TS_[jenis]] = t;
  row[ROW_TSU_[jenis]] = t;
  row[ROW_OLEH_[jenis]] = s.username;
  Object.keys(isi).forEach(function (k) { row[k] = isi[k]; });
  ctx.byId[jenis][String(row[ROW_ID_[jenis]])] = row;
  ctx.byKode[jenis][String(row[ROW_KODE_[jenis]])] = row;
  ctx.baru[jenis].push(row);
  return { status: 'OK', kode: String(row[ROW_KODE_[jenis]]), revision: 1 };
}

function buatHeaderRow_(ctx, op) {
  var d = validasi_(op.isi, ISI_ROW_.header.buat);
  if (d.kmAwal !== undefined && d.kmAkhir !== undefined && d.kmAkhir < d.kmAwal) return ditolak_('KM_AKHIR_KURANG');
  if (!dalamBatasTanggal_(ctx, d.tanggal)) return ditolak_('TANGGAL_DI_LUAR_BATAS');
  cekKodeHeaderRow_(op.kode, { subTim: ctx.sesi.timKode, kodeUlp: ctx.c.KODE_ULP, tanggal: d.tanggal });
  var ganda = Object.keys(ctx.byId.header).some(function (id) {
    var r = ctx.byId.header[id];
    return String(r.tim_id) === ctx.sesi.timId && r.status === 'AKTIF' && tanggalDariKode_(r['Kode Header']) === d.tanggal;
  });
  if (ganda) return ditolak_('HEADER_GANDA');
  if (ctx.byKode.header[op.kode]) return { status: 'KODE_BENTROK', kode: op.kode };
  var ka = d.koordinatAwal, kb = d.koordinatAkhir;
  var isi = {
    'Kode Header': op.kode, 'ULP': ctx.c.ULP_NAMA, 'Hari': hariDari_(d.tanggal), 'Tanggal': d.tanggal,
    'Tim': ctx.sesi.jenisTim, 'Sub-Tim': ctx.sesi.timNama,
    'Koordinat Awal': ka ? ka.teks : '', 'Koordinat Akhir': kb ? kb.teks : '',
    'KM Awal': d.kmAwal === undefined ? '' : d.kmAwal, 'KM Akhir': d.kmAkhir === undefined ? '' : d.kmAkhir,
    'Kendala': d.kendala || '', 'WA Text': '',
    header_id: op.id, tim_id: ctx.sesi.timId, waktu_perangkat: op.waktuPerangkat || ''
  };
  ctx.kotorHeader[op.id] = true;
  return barisBaru_(ctx, 'header', isi);
}

function buatRealisasiRow_(ctx, op) {
  var d = validasi_(op.isi, ISI_ROW_.realisasi.buat);
  var induk = ctx.byId.header[d.headerId];
  if (!induk) return statusIndukHilang_(ctx, d.headerId);
  if (String(induk.tim_id) !== ctx.sesi.timId) return ditolak_('BUKAN_MILIK_TIM');
  if (induk.status !== 'AKTIF') return ditolak_('INDUK_BATAL');
  var tanggal = tanggalDariKode_(induk['Kode Header']);
  if (!dalamBatasTanggal_(ctx, tanggal)) return ditolak_('DATA_TERKUNCI');
  var cari = d.penyulang.toLowerCase();
  var resmi = null;
  Object.keys(ctx.master.jaringan).forEach(function (id) {
    var s = ctx.master.jaringan[id];
    if (s.aktif && s.penyulang.toLowerCase() === cari) resmi = s.penyulang;
  });
  if (!resmi) return ditolak_('PENYULANG_TIDAK_ADA');
  var p = parseKodeAnak_(op.kode, 'PNY');
  if (!p || p.induk !== String(induk['Kode Header'])) return ditolak_('KODE_TIDAK_VALID');
  var ganda = Object.keys(ctx.byId.realisasi).some(function (id) {
    var r = ctx.byId.realisasi[id];
    return String(r.header_id) === d.headerId && r.status === 'AKTIF' && String(r.Penyulang).toLowerCase() === cari;
  });
  if (ganda) return ditolak_('PENYULANG_GANDA');
  if (ctx.byKode.realisasi[op.kode]) return { status: 'KODE_BENTROK', kode: op.kode };
  var isi = {
    'Kode Header': induk['Kode Header'], 'Kode Pekerjaan': op.kode, 'Hari': hariDari_(tanggal), 'Tanggal': tanggal,
    'Tim': induk['Sub-Tim'], 'Penyulang': resmi, 'Section': '', 'Rabas': 0, 'Sedang': 0, 'Besar': 0,
    realisasi_id: op.id, header_id: d.headerId, waktu_perangkat: op.waktuPerangkat || ''
  };
  return barisBaru_(ctx, 'realisasi', isi);
}

/** sectionId null = section tidak diubah (tidak dicek ulang). */
function cekSectionJenis_(ctx, realisasi, sectionId, diameter, jenisId) {
  var s = null;
  if (sectionId) {
    s = ctx.master.jaringan[sectionId];
    if (!s || !s.aktif || !realisasi || s.penyulang.toLowerCase() !== String(realisasi.Penyulang).toLowerCase()) {
      throw new SisiError_('SECTION_TIDAK_COCOK');
    }
  }
  var jenis = diameter === undefined ? null : klasifikasiJenis_(diameter, ctx.master.jenis);
  if (jenis && jenis.jenis_id !== jenisId) throw new SisiError_('JENIS_TIDAK_COCOK');
  return { section: s, jenis: jenis };
}

function buatEksekusiRow_(ctx, op) {
  var d = validasi_(op.isi, ISI_ROW_.eksekusi.buat);
  var induk = ctx.byId.realisasi[d.realisasiId];
  if (!induk) return statusIndukHilang_(ctx, d.realisasiId);
  var hdr = ctx.byId.header[String(induk.header_id)];
  if (!hdr || String(hdr.tim_id) !== ctx.sesi.timId) return ditolak_('BUKAN_MILIK_TIM');
  if (induk.status !== 'AKTIF') return ditolak_('INDUK_BATAL');
  var tanggal = tanggalDariKode_(induk['Kode Pekerjaan']);
  if (!dalamBatasTanggal_(ctx, tanggal)) return ditolak_('DATA_TERKUNCI');
  var cek = cekSectionJenis_(ctx, induk, d.sectionId, d.diameter, d.jenisId);
  var p = parseKodeAnak_(op.kode, 'EKS');
  if (!p || p.induk !== String(induk['Kode Pekerjaan'])) return ditolak_('KODE_TIDAK_VALID');
  if (ctx.byKode.eksekusi[op.kode]) return { status: 'KODE_BENTROK', kode: op.kode };
  var kt = d.koordinatTiang, kp = d.koordinatPekerjaan;
  var isi = {
    'Kode Header': induk['Kode Header'], 'Kode Pekerjaan': induk['Kode Pekerjaan'], 'Kode Eksekusi': op.kode,
    'ULP': ctx.c.ULP_NAMA, 'Hari': hariDari_(tanggal), 'Tanggal': tanggal, 'Tim': induk.Tim,
    'Penyulang': induk.Penyulang, 'Section': cek.section.section, 'Nomor Tiang': d.nomorTiang || '',
    'Koordinat Tiang': kt ? kt.teks : '', 'Lat Tiang': kt ? kt.lat : '', 'Long Tiang': kt ? kt.lng : '',
    'Koordinat Pekerjaan': kp.teks, 'Lat Pekerjaan': kp.lat, 'Long Pekerjaan': kp.lng,
    'Diameter': d.diameter, 'Jenis Pekerjaan': cek.jenis.nama,
    eksekusi_id: op.id, realisasi_id: d.realisasiId, section_id: d.sectionId, jenis_id: cek.jenis.jenis_id,
    foto_lengkap: false, sumber: d.sumber || 'LANGSUNG', temuan_id: '', waktu_perangkat: op.waktuPerangkat || ''
  };
  ctx.kotorRealisasi[d.realisasiId] = true;
  return barisBaru_(ctx, 'eksekusi', isi);
}

/** Terjemahkan isi ubah jadi { kolomSheet: nilai }. */
function perubahanRow_(ctx, op, row) {
  var j = op.jenis;
  var skema = ISI_ROW_[j] && ISI_ROW_[j].ubah;
  if (!skema) throw new SisiError_('AKSI_TIDAK_DIIZINKAN');
  var kunci = Object.keys(op.isi);
  if (!kunci.length) throw new SisiError_('FIELD_WAJIB', 'isi');
  var kosong = [];
  var berisi = {};
  kunci.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(skema, k)) throw new SisiError_('FIELD_TIDAK_DIKENAL', k);
    var v = op.isi[k];
    if (v === null || (typeof v === 'string' && v.trim() === '')) {
      if ((BOLEH_KOSONG_ROW_[j] || []).indexOf(k) === -1) throw new SisiError_('FIELD_WAJIB', k);
      kosong.push(k);
    } else berisi[k] = v;
  });
  var d = validasi_(berisi, skema);
  var u = {};
  if (j === 'header') {
    var peta = { koordinatAwal: 'Koordinat Awal', koordinatAkhir: 'Koordinat Akhir', kmAwal: 'KM Awal', kmAkhir: 'KM Akhir', kendala: 'Kendala' };
    Object.keys(d).forEach(function (k) { u[peta[k]] = d[k] && d[k].teks !== undefined ? d[k].teks : d[k]; });
    kosong.forEach(function (k) { u[peta[k]] = ''; });
    var awal = u.hasOwnProperty('KM Awal') ? u['KM Awal'] : row['KM Awal'];
    var akhir = u.hasOwnProperty('KM Akhir') ? u['KM Akhir'] : row['KM Akhir'];
    if (awal !== '' && akhir !== '' && Number(akhir) < Number(awal)) throw new SisiError_('KM_AKHIR_KURANG');
    return u;
  }
  // eksekusi
  if ((d.diameter === undefined) !== (d.jenisId === undefined)) throw new SisiError_('FIELD_WAJIB', 'diameter+jenisId');
  var realisasi = ctx.byId.realisasi[String(row.realisasi_id)];
  var cek = cekSectionJenis_(ctx, realisasi, d.sectionId || null, d.diameter, d.jenisId);
  if (d.sectionId) { u.section_id = d.sectionId; u.Section = cek.section.section; }
  if (d.nomorTiang !== undefined) u['Nomor Tiang'] = d.nomorTiang;
  if (kosong.indexOf('nomorTiang') !== -1) u['Nomor Tiang'] = '';
  if (d.koordinatTiang) { u['Koordinat Tiang'] = d.koordinatTiang.teks; u['Lat Tiang'] = d.koordinatTiang.lat; u['Long Tiang'] = d.koordinatTiang.lng; }
  if (kosong.indexOf('koordinatTiang') !== -1) { u['Koordinat Tiang'] = ''; u['Lat Tiang'] = ''; u['Long Tiang'] = ''; }
  if (d.koordinatPekerjaan) {
    u['Koordinat Pekerjaan'] = d.koordinatPekerjaan.teks; u['Lat Pekerjaan'] = d.koordinatPekerjaan.lat; u['Long Pekerjaan'] = d.koordinatPekerjaan.lng;
  }
  if (cek.jenis) { u.Diameter = d.diameter; u.jenis_id = cek.jenis.jenis_id; u['Jenis Pekerjaan'] = cek.jenis.nama; }
  return u;
}

function samaNilai_(a, b) {
  var n = function (v) { return v === null || v === undefined ? '' : (typeof v === 'number' ? String(v) : String(v).trim()); };
  if (typeof a === 'number' || typeof b === 'number') {
    if (a === '' || b === '') return n(a) === n(b);
    return Number(a) === Number(b);
  }
  return n(a) === n(b);
}

function terapkan_(ctx, jenis, row, u) {
  if (jenis === 'header') ctx.kotorHeader[String(row.header_id)] = true;
  if (jenis === 'realisasi') ctx.kotorHeader[String(row.header_id)] = true;
  u.revision = (Number(row.revision) || 0) + 1;
  u.diubah_oleh = ctx.sesi.userId;
  u[ROW_TSU_[jenis]] = ctx.waktu.sekarang;
  row._ubah = row._ubah || {};
  Object.keys(u).forEach(function (k) { row[k] = u[k]; if (!row._baru) row._ubah[k] = u[k]; });
  return hasilSimpan_(jenis, row, 'OK');
}

function ubahRow_(ctx, op, row) {
  if (row.status !== 'AKTIF') return ditolak_('SUDAH_BATAL');
  var u = perubahanRow_(ctx, op, row);
  var rev = Number(row.revision) || 0;
  if (rev !== op.revision) {
    var sudah = rev === op.revision + 1 && Object.keys(u).every(function (k) { return samaNilai_(row[k], u[k]); });
    return sudah ? hasilSimpan_(op.jenis, row, 'DUPLIKAT') : { status: 'KONFLIK_REVISION', revision: rev };
  }
  if (op.jenis === 'eksekusi') ctx.kotorRealisasi[String(row.realisasi_id)] = true;
  return terapkan_(ctx, op.jenis, row, u);
}

/** v0.62 (M4): isi batal opsional, dicatat di log_Audit BATAL_ROW. Tanpa isi tetap diterima (APK lama). */
var ISI_BATAL_ROW_ = {
  alasan: { tipe: 'pilihan', pilihan: ['SALAH_INPUT', 'DOBEL', 'SALAH_LOKASI', 'LAINNYA'] },
  catatan: { tipe: 'teks', maks: 100 }
};

function batalRow_(ctx, op, row) {
  var d = validasi_(op.isi, ISI_BATAL_ROW_);
  if (row.status === 'BATAL') return hasilSimpan_(op.jenis, row, 'DUPLIKAT');
  var rev = Number(row.revision) || 0;
  if (rev !== op.revision) return { status: 'KONFLIK_REVISION', revision: rev };
  var anakJenis = op.jenis === 'header' ? 'realisasi' : op.jenis === 'realisasi' ? 'eksekusi' : null;
  if (anakJenis) {
    var kolomInduk = ROW_ID_[op.jenis];
    var masihAda = Object.keys(ctx.byId[anakJenis]).some(function (id) {
      var a = ctx.byId[anakJenis][id];
      return String(a[kolomInduk]) === op.id && a.status === 'AKTIF';
    });
    if (masihAda) return ditolak_('MASIH_ADA_ANAK');
  }
  if (op.jenis === 'eksekusi') ctx.kotorRealisasi[String(row.realisasi_id)] = true;
  var hasil = terapkan_(ctx, op.jenis, row, { status: 'BATAL' });
  (ctx.auditBatal = ctx.auditBatal || []).push({ kode: String(row[ROW_KODE_[op.jenis]]),
    detail: op.jenis + ' | ' + (d.alasan || '-') + (d.catatan ? ' | ' + d.catatan : '') });
  return hasil;
}

/** Section + Rabas/Sedang/Besar realisasi yang tersentuh. Hanya eksekusi AKTIF & foto lengkap. */
function hitungUlangRealisasi_(ctx) {
  var jenisById = {};
  ctx.master.jenis.forEach(function (j) { jenisById[j.jenis_id] = j; });
  Object.keys(ctx.kotorRealisasi).forEach(function (rid) {
    var r = ctx.byId.realisasi[rid];
    if (!r) return;
    ctx.kotorHeader[String(r.header_id)] = true;
    var hitung = { Rabas: 0, Sedang: 0, Besar: 0 }, sections = [];
    Object.keys(ctx.byId.eksekusi).forEach(function (eid) {
      var e = ctx.byId.eksekusi[eid];
      if (String(e.realisasi_id) !== rid || e.status !== 'AKTIF' || !isAktif_(e.foto_lengkap)) return;
      var kol = kolomHitungJenis_(jenisById[String(e.jenis_id)]);
      if (kol) hitung[kol]++;
      sections.push(String(e.section_id));
    });
    var baru = { Section: sectionDaftar_(sections, ctx.master.jaringan), Rabas: hitung.Rabas, Sedang: hitung.Sedang, Besar: hitung.Besar };
    var beda = Object.keys(baru).filter(function (k) { return !samaNilai_(r[k], baru[k]); });
    if (!beda.length) return;
    r._ubah = r._ubah || {};
    beda.forEach(function (k) { r[k] = baru[k]; if (!r._baru) r._ubah[k] = baru[k]; });
    r['Timestamp Update'] = ctx.waktu.sekarang;
    if (!r._baru) r._ubah['Timestamp Update'] = ctx.waktu.sekarang;
  });
}

/** Semua tulis tanpa baca: sel yang berubah, lalu baris baru di bawah baris terakhir yang sudah dibaca. */
function tulisSync_(ctx) {
  ['header', 'realisasi', 'eksekusi'].forEach(function (j) {
    var t = ctx.T[j];
    t.rows.forEach(function (r) {
      if (!r._ubah) return;
      Object.keys(r._ubah).forEach(function (k) {
        var idx = t.header.indexOf(k);
        if (idx === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
        t.sheet.getRange(r._baris, idx + 1).setValue(amanSheet_(r._ubah[k]));
      });
    });
    var baru = ctx.baru[j];
    if (!baru.length) return;
    var mulai = t.akhir + 1;
    var data = baru.map(function (r, i) { r.No = mulai + i - 1; return barisDariObjek_(t.header, r); });
    t.sheet.getRange(mulai, 1, data.length, t.header.length).setValues(data);
  });
}

/** Alat editor: reset penunjuk jendela ROW ke baris 2 (mis. setelah perbaikan manual sheet). */
function ADMIN_resetJendelaRow() {
  pastikanPemilik_();
  var props = PropertiesService.getScriptProperties();
  Object.keys(ROW_SHEET_).forEach(function (j) {
    props.deleteProperty('ROW_JENDELA_' + ROW_SHEET_[j]);
    props.deleteProperty('ROW_JENDELA_BULAN_' + ROW_SHEET_[j]);
  });
  console.log('Penunjuk jendela ROW direset. Sync berikutnya membaca dari baris 2 lalu maju sendiri.');
}
