/**
 * v1.0.35 (laporan kvlar 26 Okt 2026: Hartek > Tambah Pekerjaan Gardu hanya 3 penyulang): db_Gardu production kehilangan
 * kolom ID (gardu_id, section_id, ...) di hampir semua baris; Master Gardu HP hanya memuat baris ber-gardu_id.
 * "Lengkapi master" untuk db_Gardu, tanpa mengubah alur aplikasi:
 *   gardu_id    UUID valid = tetap. Kosong / bukan UUID = ID LAMA dipulihkan dari tabel yang merujuk gardu itu
 *               (Rekap_BA, res_NomorGardu, yan_Gardu, Hartek, Inspeksi Gardu; dicocokkan No Gardu, terbanyak dipakai)
 *               supaya riwayat tetap tersambung; tidak ada rujukan = UUID baru. Satu ID tidak dipakai dua baris.
 *   section_id  bukan section db_Jaringan = dicari dari Penyulang + Section (tidak cocok = kosong + dilaporkan).
 *   kolom *_id lain berisi bukan UUID = dikosongkan (sisa data bergeser). Baris yang gardu_id-nya berisi sampah:
 *   Timestamp bukan waktu = diisi sekarang, revision = 1. Timestamp / dibuat_oleh / revision kosong = diisi.
 * Kolom lain tidak disentuh. Pratinjau dulu (ADMIN_cekLengkapiGardu), lalu ADMIN_lengkapiGardu. Aman diulang.
 */
var POLA_UUID_GARDU_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sumber rujukan gardu_id lama: [kunci properti, tab, kolom No Gardu]. Tab / file tidak ada = dilewati. */
var RUJUKAN_ID_GARDU_ = [
  ['GARDU_SHEET_ID', 'Rekap_BA', 'Nama Peralatan'],
  ['GARDU_SHEET_ID', 'res_NomorGardu', 'No Gardu'],
  ['YANDAL_SHEET_ID', 'yan_Gardu', 'No Gardu'],
  ['HARTEK_SHEET_ID', 'db_Hartek_PenyulangGardu', 'no_gardu'],
  ['INSDU_SHEET_ID', 'db_insdu_realisasi', 'no_gardu'],
  ['INSDU_SHEET_ID', 'db_insdu_pengukuran', 'no_gardu']
];

function uuidGardu_(v) { return POLA_UUID_GARDU_.test(String(v === undefined || v === null ? '' : v).trim()); }
function kosongGardu_(v) { return v === '' || v === null || v === undefined; }
function kunciNoGardu_(v) { var p = parseNoGarduLama_(v); return p ? p.nomor : teksGarduLama_(v).toUpperCase(); }

/** { noGardu: { id: jumlah } } dari semua tab rujukan + catatan sumber yang dibaca / dilewati. */
function petaRujukanIdGardu_() {
  var c = cfg_(), peta = {}, sumber = [];
  RUJUKAN_ID_GARDU_.forEach(function (s) {
    if (!c[s[0]]) { sumber.push(s[1] + ': dilewati (' + s[0] + ' kosong)'); return; }
    var t;
    try { t = tabel_(s[0], s[1]); } catch (e) { sumber.push(s[1] + ': dilewati (' + (e.kode || e.message) + ')'); return; }
    var n = 0;
    t.rows.forEach(function (r) {
      var id = String(r.gardu_id === undefined || r.gardu_id === null ? '' : r.gardu_id).trim().toLowerCase(), no = kunciNoGardu_(r[s[2]]);
      if (!no || !uuidGardu_(id)) return;
      var m = peta[no] = peta[no] || {};
      m[id] = (m[id] || 0) + 1;
      n++;
    });
    sumber.push(s[1] + ': ' + n + ' rujukan');
  });
  return { peta: peta, sumber: sumber };
}

/** Inti (murni terhadap sheet kecuali tulis=true). Hasil ringkasan untuk log / pratinjau. */
function lengkapiIdGardu_(tulis) {
  var ruj = petaRujukanIdGardu_();
  var jar = tabel_('MASTER_SHEET_ID', 'db_Jaringan').rows.filter(function (j) { return j.section_id; });
  var idSection = {};
  jar.forEach(function (j) { idSection[String(j.section_id)] = true; });
  return denganLock_(function () {
    var t = tabelGarduUkur_(), H = t.header, sekarang = sekarangIso_();
    var kolomId = H.filter(function (h) { return /_id/.test(h) && h !== 'gardu_id' && h !== 'section_id'; });
    var h = { baris: t.rows.length, idTetap: 0, idDipulihkan: 0, idBaru: 0, sectionDiisi: 0, sampah: 0, sel: 0,
              ambigu: [], sectionGagal: [], idDipakaiLain: [], sumber: ruj.sumber };
    var ubah = [];   // [{ r, u }]
    var dipakai = {};
    t.rows.forEach(function (r) { if (uuidGardu_(r.gardu_id)) dipakai[String(r.gardu_id).trim().toLowerCase()] = r._baris; });
    // baris AKTIF / TIDAK AKTIF didahulukan supaya ID lama jatuh ke gardu yang masih dipakai, bukan baris BATAL bernomor sama
    var urut = t.rows.slice().sort(function (a, b) {
      var aktif = function (r) { var s = teksGarduLama_(r['Status Gardu']).toUpperCase(); return s === 'AKTIF' || s === 'TIDAK AKTIF' ? 0 : 1; };
      return aktif(a) - aktif(b) || a._baris - b._baris;
    });
    urut.forEach(function (r) {
      var u = {}, no = kunciNoGardu_(r['No Gardu']);
      var sampah = !kosongGardu_(r.gardu_id) && !uuidGardu_(r.gardu_id);
      if (uuidGardu_(r.gardu_id)) h.idTetap++;
      else {
        var calon = Object.keys(ruj.peta[no] || {}).sort(function (a, b) { return ruj.peta[no][b] - ruj.peta[no][a]; });
        if (calon.length > 1) h.ambigu.push(no + ' (' + calon.length + ' ID rujukan, dipakai yang terbanyak)');
        var bebas = calon.filter(function (id) { return !dipakai[id]; });
        if (calon.length && !bebas.length) h.idDipakaiLain.push(no + ' baris ' + r._baris + ': ID rujukan sudah dipakai baris ' + dipakai[calon[0]] + ', dibuat ID baru');
        u.gardu_id = bebas[0] || uuid_();
        dipakai[u.gardu_id] = r._baris;
        if (bebas[0]) h.idDipulihkan++; else h.idBaru++;
      }
      // section_id ikut db_Jaringan
      if (!idSection[String(r.section_id)]) {
        var s = jar.filter(function (j) { return kunciNama_(j.penyulang) === kunciNama_(r.Penyulang) && kunciNama_(j.section) === kunciNama_(r.Section); });
        var aktif = s.filter(function (j) { return isAktif_(j.aktif); });
        var pilih = (aktif.length ? aktif : s)[0];
        if (pilih) { u.section_id = String(pilih.section_id); h.sectionDiisi++; }
        else {
          if (!kosongGardu_(r.section_id)) u.section_id = '';
          if (teksGarduLama_(r.Penyulang) || teksGarduLama_(r.Section)) h.sectionGagal.push(no + ': ' + teksGarduLama_(r.Penyulang) + ' / ' + teksGarduLama_(r.Section));
        }
      }
      kolomId.forEach(function (k) { if (!kosongGardu_(r[k]) && !uuidGardu_(r[k])) u[k] = ''; });
      var ts = r.Timestamp, tsOk = Object.prototype.toString.call(ts) === '[object Date]' || /^\d{4}-\d{2}-\d{2}T/.test(String(ts));
      if (H.indexOf('Timestamp') !== -1 && !tsOk) u.Timestamp = sekarang;
      if (H.indexOf('dibuat_oleh') !== -1 && (sampah || kosongGardu_(r.dibuat_oleh))) u.dibuat_oleh = 'admin-tools';
      if (H.indexOf('revision') !== -1 && (sampah || !(Number(r.revision) > 0))) u.revision = 1;
      if (sampah) h.sampah++;
      Object.keys(u).forEach(function (k) { if (String(u[k]) === String(r[k] === undefined || r[k] === null ? '' : r[k])) delete u[k]; });
      if (Object.keys(u).length) { ubah.push({ r: r, u: u }); h.sel += Object.keys(u).length; }
    });
    h.gardu = ubah.length;
    if (tulis && ubah.length) {
      // kolom ID terkunci untuk tulisBlok_: ditulis per kolom (baris 2 s.d. terakhir, isi lain di kolom itu tetap)
      var akhir = t.sheet.getLastRow(), kolom = {};
      ubah.forEach(function (x) { Object.keys(x.u).forEach(function (k) { kolom[k] = true; }); });
      Object.keys(kolom).forEach(function (k) {
        var i = H.indexOf(k), rg = t.sheet.getRange(2, i + 1, akhir - 1, 1), v = rg.getValues();
        ubah.forEach(function (x) { if (k in x.u) v[x.r._baris - 2][0] = x.u[k]; });
        rg.setValues(v);
      });
      ubah.forEach(function (x) { Object.keys(x.u).forEach(function (k) { x.r[k] = x.u[k]; }); });
    }
    return h;
  }, 30000);
}

function logLengkapiGardu_(judul, h) {
  console.log(judul + ': ' + h.baris + ' baris db_Gardu, ' + h.gardu + ' baris diubah (' + h.sel + ' sel). gardu_id: ' + h.idTetap + ' tetap, ' +
    h.idDipulihkan + ' dipulihkan dari rujukan, ' + h.idBaru + ' ID baru. section_id diisi: ' + h.sectionDiisi + '. Baris berisi data bergeser: ' + h.sampah + '.');
  console.log('Sumber rujukan: ' + h.sumber.join('; '));
  if (h.ambigu.length) console.warn('ID rujukan lebih dari satu: ' + h.ambigu.join(', '));
  if (h.idDipakaiLain.length) console.warn(h.idDipakaiLain.join('\n'));
  if (h.sectionGagal.length) console.warn('Section tidak ada di db_Jaringan (' + h.sectionGagal.length + '): ' + h.sectionGagal.join(', '));
}

/** Editor: pratinjau melengkapi ID db_Gardu (tidak menulis). */
function ADMIN_cekLengkapiGardu() {
  pastikanPemilik_();
  var h = lengkapiIdGardu_(false);
  logLengkapiGardu_('PRATINJAU lengkapi db_Gardu', h);
  return h;
}

/** Editor: lengkapi ID db_Gardu (gardu_id, section_id, kolom *_id, Timestamp, revision). Sesudahnya HP unduh ulang Master Gardu. */
function ADMIN_lengkapiGardu() {
  pastikanPemilik_();
  var h = lengkapiIdGardu_(true);
  logLengkapiGardu_('Lengkapi db_Gardu selesai', h);
  return h;
}
