/**
 * v1.0.51 (permintaan Master Guswan 31 Okt 2026): migrasi 7 isian cover gardu dari tab Master_Gardu file SHEET_GARDU_ULP
 * (kolom FP-FV = 172-178, v1 COL_GARDU coverFcoAtas .. coverJumperanBawah) ke db_Gardu (GARDU_SHEET_ID).
 * Dicocokkan per No Gardu (parseNoGarduLama_). HANYA sel cover db_Gardu yang KOSONG diisi (nilai dari Inspeksi Gardu v2
 * tidak ditimpa). File sumber hanya dibaca. No Gardu ganda di sumber dilewati + dilaporkan. Aman diulang.
 * Pratinjau dulu (ADMIN_cekMigrasiCoverGardu), lalu ADMIN_migrasiCoverGardu.
 */
var MIGRASI_COVER_GARDU_ = {
  tab: 'Master_Gardu', barisData: 12, kolGardu: 3,
  // kolom db_Gardu -> kolom Master_Gardu (1-based), urut COVER_GARDU_
  kolom: [['Cover FCO Atas', 172], ['Cover FCO Bawah', 173], ['Cover Bushing TM', 174], ['Cover Bushing TR', 175],
          ['Cover Arrester', 176], ['Jumperan Atas', 177], ['Jumperan Bawah', 178]]
};

/** Inti. tulis false = pratinjau (tidak menulis apa pun). */
function migrasiCoverGardu_(tulis) {
  var M = MIGRASI_COVER_GARDU_, idSumber = propKonfig_('SHEET_GARDU_ULP');
  if (!idSumber) throw new SisiError_('CONFIG_TIDAK_LENGKAP', 'SHEET_GARDU_ULP');
  var b = bacaSheetSinkron_(sheetSinkron_(idSumber, M.tab), M.barisData, M.kolom[M.kolom.length - 1][1], M.kolGardu);
  return denganLock_(function () {
    var t = tabelGarduUkur_(), H = t.header;
    var h = { tulis: !!tulis, barisDb: t.rows.length, gardu: 0, sel: 0, perKolom: {}, sudahTerisi: 0, tidakAdaDiSumber: 0,
              gandaSumber: b.ganda.slice(0, 20) };
    var ubah = [];
    t.rows.forEach(function (r) {
      var no = parseNoGarduLama_(r['No Gardu']);
      if (!no) return;
      var i = b.perNo[no.nomor];
      if (i === undefined) { h.tidakAdaDiSumber++; return; }
      if (i < 0) return;   // ganda di sumber
      var u = {};
      M.kolom.forEach(function (k) {
        var lama = teksGarduLama_(r[k[0]]), baru = teksGarduLama_(b.tampil[i][k[1] - 1]);
        if (!baru) return;
        if (lama) { if (lama !== baru) h.sudahTerisi++; return; }
        u[k[0]] = baru;
        h.perKolom[k[0]] = (h.perKolom[k[0]] || 0) + 1;
      });
      if (Object.keys(u).length) { ubah.push({ r: r, u: u }); h.sel += Object.keys(u).length; }
    });
    h.gardu = ubah.length;
    if (tulis && ubah.length) {
      // per kolom (baris 2 s.d. terakhir), isi lain kolom itu tetap; sama dengan lengkapiIdGardu_
      var akhir = t.sheet.getLastRow();
      M.kolom.forEach(function (k) {
        if (!h.perKolom[k[0]]) return;
        var rg = t.sheet.getRange(2, H.indexOf(k[0]) + 1, akhir - 1, 1), v = rg.getValues();
        ubah.forEach(function (x) { if (k[0] in x.u) v[x.r._baris - 2][0] = x.u[k[0]]; });
        rg.setValues(v);
      });
    }
    return h;
  }, 30000);
}

function logMigrasiCoverGardu_(judul, h) {
  console.log(judul + ': ' + h.barisDb + ' baris db_Gardu, ' + h.gardu + ' gardu diisi (' + h.sel + ' sel kosong). Per kolom: ' +
    JSON.stringify(h.perKolom) + '. Sel db_Gardu sudah berisi nilai lain (tidak ditimpa): ' + h.sudahTerisi +
    '. Gardu tidak ada di Master_Gardu: ' + h.tidakAdaDiSumber + '.');
  if (h.gandaSumber.length) console.warn('No Gardu ganda di Master_Gardu (dilewati): ' + h.gandaSumber.join(', '));
}

/** Editor: pratinjau migrasi cover (tidak menulis). */
function ADMIN_cekMigrasiCoverGardu() {
  pastikanPemilik_();
  var h = migrasiCoverGardu_(false);
  logMigrasiCoverGardu_('PRATINJAU migrasi cover gardu', h);
  return h;
}

/** Editor: isi sel cover db_Gardu yang kosong dari Master_Gardu SHEET_GARDU_ULP. */
function ADMIN_migrasiCoverGardu() {
  pastikanPemilik_();
  var h = migrasiCoverGardu_(true);
  logMigrasiCoverGardu_('Migrasi cover gardu selesai', h);
  return h;
}
