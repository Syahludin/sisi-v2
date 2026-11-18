/**
 * Koreksi sekali jalan (Nov 2026): jumlah Rabas / Sedang / Besar di row_Realisasi hasil migrasi tidak sama dengan jumlah
 * baris row_Eksekusi-nya. Fungsi editor ini menghitung ulang dari SEMUA eksekusi AKTIF (foto lengkap atau tidak) per
 * realisasi, menulis hasilnya ke row_Realisasi, lalu membuat ulang WA Text hanya untuk tim yang realisasinya berubah
 * (hitungUlangWa_: header itu + header tim yang sama di bulan yang sama dengan tanggal sesudahnya, karena Total Bulanan ikut).
 *
 *   ADMIN_cekHitungUlangRealisasiRow()  pratinjau: tidak menulis apa pun ke row_Realisasi / row_Header
 *   ADMIN_hitungUlangRealisasiRow()     menerapkan
 * Keduanya menulis rincian lama -> baru ke tab mig_HitungUlang (spreadsheet ROW) supaya bisa dicek / dikembalikan.
 *
 * Realisasi AKTIF yang tidak punya satu pun eksekusi AKTIF TIDAK diubah (angka lamanya bisa satu-satunya catatan);
 * dicatat di tab yang sama. Sync berikutnya yang menyentuh sebuah realisasi memakai aturan sync biasa (hanya foto lengkap).
 * Tidak memakai jendela 7 hari: membaca seluruh row_Header, row_Realisasi, row_Eksekusi.
 */
var ROW_TAB_HITUNG_ULANG_ = 'mig_HitungUlang';

/**
 * Rencana hitung ulang (murni, diuji). realisasi / eksekusi = baris objek per nama kolom. jenisById = master jenis.
 * Hasil { ubah: [{ realisasi, lama: {Rabas,Sedang,Besar}, baru: {...} }], sama, tanpaEksekusi: [realisasi], tanpaJenis }.
 * Jenis eksekusi dari jenis_id (master); bila tidak ada di master, dari teks kolom "Jenis Pekerjaan".
 */
function rencanaHitungUlangRealisasi_(realisasi, eksekusi, jenisById) {
  var hitung = {}, tanpaJenis = 0;
  eksekusi.forEach(function (e) {
    if (String(e.status) !== 'AKTIF') return;
    var rid = String(e.realisasi_id || '');
    if (!rid) return;
    var kol = kolomHitungJenis_(jenisById[String(e.jenis_id)]) || kolomHitungJenis_({ nama: e['Jenis Pekerjaan'] });
    var h = hitung[rid] = hitung[rid] || { Rabas: 0, Sedang: 0, Besar: 0, jumlah: 0 };
    h.jumlah++;
    if (kol) h[kol]++; else tanpaJenis++;
  });
  var hasil = { ubah: [], sama: 0, tanpaEksekusi: [], tanpaJenis: tanpaJenis };
  realisasi.forEach(function (r) {
    if (String(r.status) !== 'AKTIF') return;
    var h = hitung[String(r.realisasi_id)];
    if (!h) { hasil.tanpaEksekusi.push(r); return; }
    var lama = {}, baru = {}, beda = false;
    KOLOM_HITUNG_.forEach(function (k) {
      lama[k] = r[k]; baru[k] = h[k];
      if (!samaNilai_(r[k], h[k])) beda = true;
    });
    if (beda) hasil.ubah.push({ realisasi: r, lama: lama, baru: baru }); else hasil.sama++;
  });
  return hasil;
}

/** Baca seluruh satu tabel ROW (bukan jendela). nilai = isi mentah (untuk menulis ulang satu kolom tanpa mengubah baris lain). */
function bacaPenuhRow_(jenis) {
  var nama = ROW_SHEET_[jenis];
  var sh = bukaSpreadsheet_(cfg_().ROW_SHEET_ID).getSheetByName(nama);
  if (!sh) throw new SisiError_('SHEET_TIDAK_ADA', nama);
  var header = headerRowTerverifikasi_(sh, nama);
  var akhir = sh.getLastRow();
  var nilai = akhir >= 2 ? sh.getRange(2, 1, akhir - 1, header.length).getValues() : [];
  var rows = [];
  nilai.forEach(function (baris, i) {
    var o = { _baris: i + 2 }, kosong = true;
    header.forEach(function (h, j) {
      o[h] = baris[j];
      if (baris[j] !== '' && baris[j] !== null) kosong = false;
    });
    if (!kosong) rows.push(o);
  });
  return { sheet: sh, nama: nama, header: header, rows: rows, nilai: nilai, akhir: akhir, dalamLock: LOCK_AKTIF_.ya };
}

/**
 * Tulis ulang SATU kolom sekali (isi baris lain dikembalikan apa adanya). ubahPerBaris = { nomorBaris: nilaiBaru }.
 * Baris yang tidak diubah (review 15 Nov 2026): setValues mengurai teks seperti ketikan (0012 -> 12, +62.. / =.. -> rumus,
 * teks tanggal -> Date), jadi teks lama diberi awalan ' (tetap teks persis) dan sel berumus ditulis kembali rumusnya.
 */
function tulisKolomRow_(t, kolom, ubahPerBaris) {
  var idx = t.header.indexOf(kolom);
  if (idx === -1) throw new SisiError_('KOLOM_TIDAK_ADA', kolom);
  if (!Object.keys(ubahPerBaris).length || !t.nilai.length) return;
  var rg = t.sheet.getRange(2, idx + 1, t.nilai.length, 1), rumus = rg.getFormulas();
  var isi = t.nilai.map(function (b, i) {
    var v = ubahPerBaris[i + 2];
    if (v !== undefined) return [amanSheet_(v)];
    if (rumus[i] && rumus[i][0]) return [rumus[i][0]];
    var lama = b[idx];
    return [typeof lama === 'string' && lama !== '' ? "'" + lama : lama];
  });
  rg.setValues(isi);
}

function laporHitungUlangRow_(ss, rencana, waBerubah, terapkan) {
  var sh = ss.getSheetByName(ROW_TAB_HITUNG_ULANG_) || ss.insertSheet(ROW_TAB_HITUNG_ULANG_);
  sh.clear();
  var kepala = ['status', 'kode_pekerjaan', 'tim', 'penyulang', 'tanggal', 'rabas_lama', 'sedang_lama', 'besar_lama', 'rabas_baru', 'sedang_baru', 'besar_baru', 'selisih_total'];
  var baris = [];
  var total = function (o) { return (Number(o.Rabas) || 0) + (Number(o.Sedang) || 0) + (Number(o.Besar) || 0); };
  rencana.ubah.forEach(function (u) {
    var r = u.realisasi;
    baris.push([terapkan ? 'DIUBAH' : 'AKAN_DIUBAH', r['Kode Pekerjaan'], r.Tim, r.Penyulang, tanggalDariKode_(r['Kode Header']) || '',
      u.lama.Rabas, u.lama.Sedang, u.lama.Besar, u.baru.Rabas, u.baru.Sedang, u.baru.Besar, total(u.baru) - total(u.lama)]);
  });
  rencana.tanpaEksekusi.forEach(function (r) {
    baris.push(['TANPA_EKSEKUSI_TIDAK_DIUBAH', r['Kode Pekerjaan'], r.Tim, r.Penyulang, tanggalDariKode_(r['Kode Header']) || '',
      r.Rabas, r.Sedang, r.Besar, '', '', '', '']);
  });
  sh.getRange(1, 1, 1, kepala.length).setValues([kepala]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (baris.length) sh.getRange(2, 1, baris.length, kepala.length).setValues(baris.map(function (b) { return b.map(function (v) { return amanSheet_(v); }); }));
  sh.getRange(1, kepala.length + 2).setValue('WA Text berubah (header): ' + waBerubah + (terapkan ? ' (ditulis)' : ' (pratinjau)'));
}

function jalankanHitungUlangRow_(terapkan) {
  var c = cfg_();
  if (!c.ROW_SHEET_ID) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'ROW_SHEET_ID');
  return denganLock_(function () {
    var T = { header: bacaPenuhRow_('header'), realisasi: bacaPenuhRow_('realisasi'), eksekusi: bacaPenuhRow_('eksekusi') };
    var master = masterRow_();
    var ctx = konteksSync_(T, master, null, c, waktuRow_());
    var jenisById = {};
    master.jenis.forEach(function (j) { jenisById[j.jenis_id] = j; });
    var rencana = rencanaHitungUlangRealisasi_(T.realisasi.rows, T.eksekusi.rows, jenisById);

    var sekarang = ctx.waktu.sekarang, ubahBaris = { Rabas: {}, Sedang: {}, Besar: {}, 'Timestamp Update': {} }, tim = {};
    rencana.ubah.forEach(function (u) {
      var r = u.realisasi;
      KOLOM_HITUNG_.forEach(function (k) { r[k] = u.baru[k]; ubahBaris[k][r._baris] = u.baru[k]; });
      r['Timestamp Update'] = sekarang;
      ubahBaris['Timestamp Update'][r._baris] = sekarang;
      ctx.kotorHeader[String(r.header_id)] = true;   // WA Text header ini + header tim yang sama sesudahnya di bulan itu
      tim[String(r.Tim)] = true;
    });
    hitungUlangWa_(ctx);
    var waUbah = { 'WA Text': {}, 'TimeStamp Update': {} }, waJumlah = 0;
    T.header.rows.forEach(function (h) {
      if (!h._ubah || h._ubah['WA Text'] === undefined) return;
      waUbah['WA Text'][h._baris] = h._ubah['WA Text'];
      waUbah['TimeStamp Update'][h._baris] = h._ubah['TimeStamp Update'];
      waJumlah++;
    });

    if (terapkan) {
      KOLOM_HITUNG_.forEach(function (k) { tulisKolomRow_(T.realisasi, k, ubahBaris[k]); });
      tulisKolomRow_(T.realisasi, 'Timestamp Update', ubahBaris['Timestamp Update']);
      tulisKolomRow_(T.header, 'WA Text', waUbah['WA Text']);
      tulisKolomRow_(T.header, 'TimeStamp Update', waUbah['TimeStamp Update']);
    }
    laporHitungUlangRow_(bukaSpreadsheet_(c.ROW_SHEET_ID), rencana, waJumlah, terapkan);
    var ringkas = { terapkan: terapkan, realisasiDiubah: rencana.ubah.length, realisasiSama: rencana.sama, tanpaEksekusi: rencana.tanpaEksekusi.length,
      eksekusiTanpaJenis: rencana.tanpaJenis, timBerubah: Object.keys(tim).sort(), waTextBerubah: waJumlah };
    console.log((terapkan ? 'DITERAPKAN ' : 'PRATINJAU (belum ditulis) ') + JSON.stringify(ringkas) + '. Rincian di tab ' + ROW_TAB_HITUNG_ULANG_ + '.');
    return ringkas;
  }, 30000);
}

/** Pratinjau: hitung tanpa menulis ke row_Realisasi / row_Header; rincian ke tab mig_HitungUlang. */
function ADMIN_cekHitungUlangRealisasiRow() {
  pastikanPemilik_();
  return jalankanHitungUlangRow_(false);
}

/** Terapkan: tulis Rabas / Sedang / Besar realisasi dari semua eksekusi AKTIF, lalu WA Text tim yang berubah. */
function ADMIN_hitungUlangRealisasiRow() {
  pastikanPemilik_();
  return jalankanHitungUlangRow_(true);
}
