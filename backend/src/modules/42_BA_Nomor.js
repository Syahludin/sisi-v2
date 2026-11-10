/**
 * v0.73.0 (keputusan Master Guswan 9 Okt 2026): PESAN NOMOR GARDU per BA (bukan kunci prefix).
 *
 * Masalah: watermark foto kamera memuat No Gardu, padahal nomor final baru ditentukan saat simpan. Dua admin membuat BA
 * prefix sama bersamaan = watermark salah nomor.
 * Solusi: saat prefix dipilih HP memanggil pesanNomorGardu -> server memesankan SATU nomor untuk baId itu (tab
 * res_NomorGardu). Admin lain mendapat nomor berikutnya. Ganti prefix / pakai nomor BATAL = pesanan lama DILEPAS,
 * nomor baru dipesan (HP merender ulang watermark dari foto asli). Tidak ada aktivitas RES_NOMOR_MENIT_ menit = pesanan
 * hangus sendiri (tiap pesan ulang / upload foto memperpanjang), nomor dipakai lagi = tidak ada nomor bolong.
 * Pengaman terakhir: simpanBaGardu menolak (NOMOR_GARDU_BERUBAH) bila nomor pesanan sudah tidak bebas atau berbeda
 * dengan noGarduWatermark, SEBELUM menulis apa pun. HP lalu memesan ulang, merender ulang watermark, kirim ulang foto.
 */
var RES_NOMOR_HEADER_ = ['No', 'No Gardu', 'Prefix', 'Asal Nomor', 'Status', 'Dipesan Oleh', 'Waktu Pesan', 'Aktif Sampai',
  'Timestamp Update', 'ba_id', 'gardu_id', 'user_id', 'revision'];
var RES_STATUS_ = ['DIPESAN', 'DIPAKAI', 'DILEPAS'];
var RES_NOMOR_MENIT_ = 180;

/** Tabel pesanan. wajib = false: tab belum dibuat (ADMIN_siapkanSheetGardu) dianggap kosong, null. */
function tabelPesanan_(wajib) {
  try {
    return cekStrukturGardu_('GARDU_SHEET_ID', 'res_NomorGardu');
  } catch (e) {
    if (!wajib && e && e.kode === 'SHEET_TIDAK_ADA') return null;
    throw e;
  }
}

function aktifSampaiPesan_(now) { return new Date(now.getTime() + RES_NOMOR_MENIT_ * 60000).toISOString(); }

/** Pesanan DIPESAN yang belum hangus pada waktu now. */
function pesananAktif_(rows, now) {
  return (rows || []).filter(function (r) {
    if (teksBa_(r.Status).toUpperCase() !== 'DIPESAN') return false;
    var s = keDate_(r['Aktif Sampai']);
    return !!s && s.getTime() > now.getTime();
  });
}

/** Pesanan DIPESAN milik baId (hangus maupun belum), terbaru dulu. */
function pesananMilik_(rows, baId) {
  return (rows || []).filter(function (r) { return String(r.ba_id) === baId && teksBa_(r.Status).toUpperCase() === 'DIPESAN'; })
    .sort(function (a, b) { return (Number(b.No) || 0) - (Number(a.No) || 0); });
}

/** Nomor gardu yang SUDAH ADA (db_Gardu semua status + Master_Gardu C + Rekap Gardu B lama) untuk prefix: {angka: true}. */
function nomorAdaGardu_(rowsGardu, prefix) {
  var ada = {};
  var catat = function (v) { var n = parseNoGarduLama_(v); if (n && n.prefix === prefix) ada[n.angka] = true; };
  rowsGardu.forEach(function (r) { catat(r['No Gardu']); });
  kolomTetapLama_(sheetGarduLama_(MIGRASI_GARDU_.master.tab), MIGRASI_GARDU_.master.kol.gardu, MIGRASI_GARDU_.master.barisData).forEach(catat);
  kolomTetapLama_(sheetGarduLama_(MIGRASI_GARDU_.rekap.tab), MIGRASI_GARDU_.rekap.kol.gardu, MIGRASI_GARDU_.rekap.barisData).forEach(catat);
  return ada;
}

function maksAngka_(ada) {
  return Object.keys(ada).reduce(function (m, k) { return Math.max(m, Number(k)); }, 0);
}

/** {No Gardu: true} dipegang pesanan aktif selain baId. */
function dipesanLain_(rowsRes, baId, now) {
  var x = {};
  pesananAktif_(rowsRes, now).forEach(function (r) { if (String(r.ba_id) !== baId) x[teksBa_(r['No Gardu']).toUpperCase()] = true; });
  return x;
}

/**
 * Nomor baru berikut: terbesar yang ada + 1 (lewati nomor pesanan lain). Nomor bekas pesanan yang DILEPAS / hangus dan
 * belum dipakai siapa pun didahulukan, jadi pesanan yang batal tidak meninggalkan nomor bolong.
 */
function nomorBebasBerikut_(ada, prefix, lain, rowsRes) {
  var n = maksAngka_(ada) + 1;
  while (lain[formatNoGardu_(prefix, n)]) n++;
  (rowsRes || []).forEach(function (r) {
    if (teksBa_(r['Asal Nomor']) !== 'BARU' || teksBa_(r.Status).toUpperCase() === 'DIPAKAI') return;
    var p = parseNoGarduLama_(r['No Gardu']);
    if (p && p.prefix === prefix && p.angka < n && !ada[p.angka] && !lain[p.nomor]) n = p.angka;
  });
  return formatNoGardu_(prefix, n);
}

/** Nomor BARU masih bebas: belum ada di data gardu dan tidak dipegang pesanan lain. */
function nomorBaruBebas_(no, prefix, ada, lain) {
  var p = parseNoGarduLama_(no);
  return !!p && p.prefix === prefix && !ada[p.angka] && !lain[p.nomor];
}

function batalUntukHp_(rowsGardu, prefix, lain) {
  return nomorBatalTersedia_(rowsGardu, prefix).filter(function (r) { return !lain[teksBa_(r['No Gardu']).toUpperCase()]; }).map(function (r) {
    return { garduId: String(r.gardu_id), noGardu: teksBa_(r['No Gardu']).toUpperCase(), alamat: teksBa_(r.Alamat), penyulang: teksBa_(r.Penyulang) };
  });
}

/**
 * pesanNomorGardu {baId, prefix, nomorBatalId?} -> { baId, prefix, nomor, asal BARU | ULANG BATAL, garduId?, aktifSampai,
 * menitBerlaku, terakhir, batal: [...] }. Panggil ulang dengan isian sama = pesanan sama diperpanjang (nomor tetap).
 */
function pesanNomorGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, {
    baId: { tipe: 'uuid', wajib: true },
    prefix: { tipe: 'pilihan', wajib: true, pilihan: GARDU_PREFIX_ },
    nomorBatalId: { tipe: 'uuid' }
  });
  return denganLock_(function () {
    if (barisBa_(cekStrukturGardu_('GARDU_SHEET_ID', 'Rekap_BA').rows, d.baId)) throw new SisiError_('BA_SUDAH_DISIMPAN', d.baId);
    var tRes = tabelPesanan_(true);
    var tG = cekStrukturGardu_('GARDU_SHEET_ID', 'db_Gardu');
    var now = new Date(), sekarang = now.toISOString(), oleh = sesi.username || '';
    var lain = dipesanLain_(tRes.rows, d.baId, now);
    var ada = nomorAdaGardu_(tG.rows, d.prefix);
    var milik = pesananMilik_(tRes.rows, d.baId);
    var target;
    if (d.nomorBatalId) {
      var b = nomorBatalTersedia_(tG.rows, d.prefix).filter(function (r) { return String(r.gardu_id) === d.nomorBatalId; })[0];
      if (!b || lain[teksBa_(b['No Gardu']).toUpperCase()]) throw new SisiError_('NOMOR_BATAL_TIDAK_TERSEDIA', d.nomorBatalId);
      target = { no: teksBa_(b['No Gardu']).toUpperCase(), asal: 'ULANG BATAL', garduId: String(b.gardu_id) };
    } else {
      var lama = milik.filter(function (r) {
        return teksBa_(r['Asal Nomor']) === 'BARU' && teksBa_(r.Prefix) === d.prefix && nomorBaruBebas_(r['No Gardu'], d.prefix, ada, lain);
      })[0];
      target = { no: lama ? teksBa_(lama['No Gardu']).toUpperCase() : nomorBebasBerikut_(ada, d.prefix, lain, tRes.rows), asal: 'BARU', garduId: '' };
    }
    var sama = milik.filter(function (r) {
      return teksBa_(r['No Gardu']).toUpperCase() === target.no && teksBa_(r['Asal Nomor']) === target.asal && String(r.gardu_id || '') === target.garduId;
    })[0] || null;
    var sampai = aktifSampaiPesan_(now);
    var ubah = milik.filter(function (r) { return r !== sama; }).map(function (r) { return { r: r, u: { Status: 'DILEPAS', 'Timestamp Update': sekarang } }; });
    if (sama) ubah.push({ r: sama, u: { 'Aktif Sampai': sampai, 'Timestamp Update': sekarang } });
    var baru = sama ? [] : [{
      No: tRes.rows.reduce(function (m, r) { return Math.max(m, Number(r.No) || 0); }, 0) + 1, 'No Gardu': target.no, Prefix: d.prefix,
      'Asal Nomor': target.asal, Status: 'DIPESAN', 'Dipesan Oleh': oleh, 'Waktu Pesan': sekarang, 'Aktif Sampai': sampai,
      'Timestamp Update': sekarang, ba_id: d.baId, gardu_id: target.garduId, user_id: sesi.userId || '', revision: 1
    }];
    tulisBlok_(tRes, ubah, baru);
    var maks = maksAngka_(ada);
    return {
      baId: d.baId, prefix: d.prefix, nomor: target.no, asal: target.asal, garduId: target.garduId, aktifSampai: sampai,
      menitBerlaku: RES_NOMOR_MENIT_, terakhir: maks ? formatNoGardu_(d.prefix, maks) : '', batal: batalUntukHp_(tG.rows, d.prefix, lain)
    };
  });
}

/** lepasNomorGardu {baId} -> { dilepas: n }. Form BA dibuang = nomor langsung bebas (tanpa menunggu hangus). */
function lepasNomorGardu_(sesi, data) {
  wajibAdminBa_(sesi);
  var d = validasi_(data, { baId: { tipe: 'uuid', wajib: true } });
  return denganLock_(function () {
    var tRes = tabelPesanan_(false);
    if (!tRes) return { dilepas: 0 };
    var milik = pesananMilik_(tRes.rows, d.baId), sekarang = sekarangIso_();
    tulisBlok_(tRes, milik.map(function (r) { return { r: r, u: { Status: 'DILEPAS', 'Timestamp Update': sekarang } }; }), []);
    return { dilepas: milik.length };
  });
}

/** Di dalam lock pemanggil (upload foto): pesanan aktif baId diperpanjang. Tab belum ada / tanpa pesanan = diam. */
function perpanjangPesanan_(baId) {
  var tRes = tabelPesanan_(false);
  if (!tRes) return;
  var now = new Date();
  var m = pesananMilik_(tRes.rows, baId)[0];
  if (!m) return;
  tulisBlok_(tRes, [{ r: m, u: { 'Aktif Sampai': aktifSampaiPesan_(now), 'Timestamp Update': now.toISOString() } }], []);
}

/**
 * Di dalam lock simpanBaGardu: nomor gardu dari pesanan baId (bila ada). Hasil { tRes, pesanan, no, asal, ulang } atau
 * pesanan null (app lama / tanpa pesanan: nomor dihitung seperti v0.70 tapi melewati nomor pesanan admin lain).
 * Nomor pesanan sudah tidak bebas / prefix beda = NOMOR_GARDU_BERUBAH (belum ada yang ditulis).
 */
function nomorUntukSimpan_(d, rowsGardu) {
  var tRes = tabelPesanan_(false), now = new Date();
  var rowsRes = tRes ? tRes.rows : [];
  var lain = dipesanLain_(rowsRes, d.baId, now);
  var p = pesananMilik_(rowsRes, d.baId)[0] || null;
  var ada = nomorAdaGardu_(rowsGardu, d.prefix);
  if (p) {
    if (teksBa_(p.Prefix) !== d.prefix) throw new SisiError_('NOMOR_GARDU_BERUBAH', 'prefix pesanan ' + p.Prefix);
    var no = teksBa_(p['No Gardu']).toUpperCase();
    if (teksBa_(p['Asal Nomor']) === 'ULANG BATAL') {
      var u = nomorBatalTersedia_(rowsGardu, d.prefix).filter(function (r) { return String(r.gardu_id) === String(p.gardu_id); })[0];
      if (!u || lain[no]) throw new SisiError_('NOMOR_GARDU_BERUBAH', 'batal ' + no);
      return { tRes: tRes, pesanan: p, no: no, asal: 'ULANG BATAL', ulang: u };
    }
    if (!nomorBaruBebas_(no, d.prefix, ada, lain)) throw new SisiError_('NOMOR_GARDU_BERUBAH', no + ' sudah dipakai');
    return { tRes: tRes, pesanan: p, no: no, asal: 'BARU', ulang: null };
  }
  if (d.nomorBatalId) {
    var b = nomorBatalTersedia_(rowsGardu, d.prefix).filter(function (r) { return String(r.gardu_id) === d.nomorBatalId; })[0];
    if (!b || lain[teksBa_(b['No Gardu']).toUpperCase()]) throw new SisiError_('NOMOR_BATAL_TIDAK_TERSEDIA', d.nomorBatalId);
    return { tRes: tRes, pesanan: null, no: teksBa_(b['No Gardu']).toUpperCase(), asal: 'ULANG BATAL', ulang: b };
  }
  return { tRes: tRes, pesanan: null, no: nomorBebasBerikut_(ada, d.prefix, lain, rowsRes), asal: 'BARU', ulang: null };
}
