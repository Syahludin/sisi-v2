/**
 * Master Jaringan: penyulang + section (db_Jaringan di SiSi_Master), permintaan Master Guswan 8 Nov 2026. Satu menu dengan Master
 * Switching dan Master Segmen (OPS_MASTER_SWITCHING, ADMIN / SUPER). Penyulang tidak punya tab sendiri: penyulang = kumpulan
 * section, jadi menambah penyulang = menambah section pertamanya, menonaktifkan penyulang = menonaktifkan semua section-nya.
 * Baris tidak pernah dihapus (aktif FALSE). Setiap perubahan menaikkan MASTER_REVISI supaya HP mengunduh ulang master.
 */

var JAR_SHEET_ = 'db_Jaringan';
var JAR_MAKS_BARIS_ = 3000;

function tabelJaringan_() { return tabel_('MASTER_SHEET_ID', JAR_SHEET_); }

/** HP + cache akses mengambil master baru sesudah db_Jaringan berubah. */
function perbaruiMasterJaringan_() {
  CacheService.getScriptCache().removeAll(['akses:v1', 'master-row:v3']);
  PropertiesService.getScriptProperties().setProperty('MASTER_REVISI', sekarangIso_());
}

function jarKeApi_(r, hitung) {
  var id = teksSwc_(r.section_id), h = hitung[id] || {};
  return { sectionId: id, penyulang: teksSwc_(r.penyulang), section: teksSwc_(r.section), parentSectionId: teksSwc_(r.parent_section_id),
    urutan: angkaSwc_(r.urutan), aktif: isAktif_(r.aktif), revision: Number(r.revision) || 0, jumlahSegmen: h.segmen || 0, jumlahSwitching: h.switching || 0 };
}

/** Jumlah segmen / switching aktif per section (0 bila SiSi_Tiang belum disiapkan). */
function hitungJaringan_() {
  var h = {};
  if (!cfg_().TIANG_SHEET_ID) return h;
  var tambah = function (nama, kolom) {
    try {
      tabel_('TIANG_SHEET_ID', nama).rows.forEach(function (r) {
        var id = teksSwc_(r.section_id);
        if (id && isAktif_(r.aktif)) { h[id] = h[id] || {}; h[id][kolom] = (h[id][kolom] || 0) + 1; }
      });
    } catch (e) { if (!e || e.kode !== 'SHEET_TIDAK_ADA') throw e; }
  };
  tambah(SGM_SHEET_, 'segmen');
  tambah(SWC_SHEET_, 'switching');
  return h;
}

/** getJaringan {} -> { section: [{sectionId, penyulang, section, parentSectionId, urutan, aktif, revision, jumlahSegmen, jumlahSwitching}] } (semua, termasuk nonaktif). */
function getJaringan_(sesi, data) {
  wajibAdminSwitching_(sesi);
  validasi_(data || {}, {});
  var hitung = hitungJaringan_();
  return { section: tabelJaringan_().rows.filter(function (r) { return teksSwc_(r.section_id); }).map(function (r) { return jarKeApi_(r, hitung); }) };
}

/**
 * simpanSection { sectionId?, revision?, penyulang, section, parentSectionId?, urutan?, aktif? } -> { section }.
 * Penyulang baru = ditulis apa adanya (ejaan penyulang yang sudah ada diikuti). Tanpa sectionId = baru. Aturan: penyulang + nama
 * section unik (NAMA_GANDA), induk ada + penyulang sama + tanpa putaran (HULU_TIDAK_VALID), urutan kosong = kelipatan 20 berikutnya.
 */
function simpanSection_(sesi, data, platform) {
  wajibAdminSwitching_(sesi);
  var d = validasi_(data, {
    sectionId: { tipe: 'teks', maks: 64, pola: /^[0-9A-Za-z_-]+$/ }, revision: { tipe: 'angka', bulat: true, min: 1 }, aktif: { tipe: 'bool' },
    penyulang: { tipe: 'teks', wajib: true, maks: 80 }, section: { tipe: 'teks', wajib: true, maks: 120 },
    parentSectionId: { tipe: 'teks', maks: 64, pola: /^[0-9A-Za-z_-]+$/ }, urutan: { tipe: 'angka', bulat: true, min: 1, max: 99999 }
  });
  if (d.sectionId && d.revision === undefined) throw new SisiError_('FIELD_WAJIB', 'revision');
  return denganLock_(function () {
    var t = tabelJaringan_(), rows = t.rows.filter(function (r) { return teksSwc_(r.section_id); });
    var lama = d.sectionId ? rows.filter(function (r) { return teksSwc_(r.section_id) === d.sectionId; }) : [];
    if (lama.length > 1) throw new SisiError_('ID_GANDA', d.sectionId);
    if (d.sectionId && !lama.length) throw new SisiError_('DATA_TIDAK_DITEMUKAN', d.sectionId);
    if (lama.length && Number(lama[0].revision || 0) !== d.revision) throw new SisiError_('KONFLIK_REVISION', d.sectionId);
    if (!lama.length && rows.length >= JAR_MAKS_BARIS_) throw new SisiError_('TERLALU_BANYAK', JAR_SHEET_);
    var id = d.sectionId || uuid_(), pny = d.penyulang;
    rows.forEach(function (r) { if (teksSwc_(r.penyulang).toUpperCase() === pny.toUpperCase()) pny = teksSwc_(r.penyulang); });
    rows.forEach(function (r) {
      if (teksSwc_(r.section_id) !== id && teksSwc_(r.penyulang) === pny && teksSwc_(r.section).toUpperCase() === d.section.toUpperCase()) throw new SisiError_('NAMA_GANDA', d.section);
    });
    var peta = {};
    rows.forEach(function (r) { peta[teksSwc_(r.section_id)] = r; });
    var induk = d.parentSectionId || '';
    if (induk) {
      if (induk === id || !peta[induk]) throw new SisiError_('HULU_TIDAK_VALID', 'induk section');
      if (teksSwc_(peta[induk].penyulang) !== pny) throw new SisiError_('DATA_TIDAK_VALID', 'induk section beda penyulang');
      for (var cur = induk, n = 0; cur && n < 200; n++) {   // putaran: induk tidak boleh turunan section ini
        if (cur === id) throw new SisiError_('HULU_TIDAK_VALID', 'induk section berputar');
        cur = peta[cur] ? teksSwc_(peta[cur].parent_section_id) : '';
      }
    }
    var urutan = d.urutan;
    if (urutan === undefined) {
      urutan = lama.length ? angkaSwc_(lama[0].urutan) : null;
      if (urutan === null) urutan = rows.reduce(function (m, r) { return teksSwc_(r.penyulang) === pny ? Math.max(m, Number(r.urutan) || 0) : m; }, 0) + 20;
    }
    var u = { penyulang: pny, section: d.section, parent_section_id: induk, urutan: urutan, diubah_pada: sekarangIso_(), diubah_oleh: sesi.userId,
      aktif: d.aktif !== undefined ? d.aktif : lama.length ? isAktif_(lama[0].aktif) : true };
    var log = headerTabel_('AUTH_SHEET_ID', 'log_Audit'), baris;
    if (lama.length) {
      var beda = bedaSwitching_(lama[0], u);
      tulisBlok_(t, [{ r: lama[0], u: u }], [], { bolehId: ['parent_section_id'] });
      baris = lama[0];
      auditLog_(sesi, 'SECTION_UBAH', JAR_SHEET_, id + ': ' + (beda || 'tanpa perubahan isian'), platform, log);
    } else {
      baris = Object.assign({ section_id: id, revision: 1 }, u);
      tulisBlok_(t, [], [baris]);
      auditLog_(sesi, 'SECTION_BARU', JAR_SHEET_, pny + ' / ' + d.section, platform, log);
    }
    perbaruiMasterJaringan_();
    return { section: jarKeApi_(baris, {}) };
  });
}

/** setAktifPenyulang { penyulang, aktif } -> { penyulang, aktif, jumlah }. Mengubah SEMUA section penyulang itu (satu tulis). */
function setAktifPenyulang_(sesi, data, platform) {
  wajibAdminSwitching_(sesi);
  var d = validasi_(data, { penyulang: { tipe: 'teks', wajib: true, maks: 80 }, aktif: { tipe: 'bool', wajib: true } });
  return denganLock_(function () {
    var t = tabelJaringan_();
    var ubah = t.rows.filter(function (r) { return teksSwc_(r.section_id) && teksSwc_(r.penyulang) === d.penyulang && isAktif_(r.aktif) !== d.aktif; })
      .map(function (r) { return { r: r, u: { aktif: d.aktif, diubah_pada: sekarangIso_(), diubah_oleh: sesi.userId } }; });
    if (!t.rows.some(function (r) { return teksSwc_(r.penyulang) === d.penyulang; })) throw new SisiError_('PENYULANG_TIDAK_DIKENAL', d.penyulang);
    tulisBlok_(t, ubah, []);
    auditLog_(sesi, 'PENYULANG_AKTIF', JAR_SHEET_, d.penyulang + ' ' + (d.aktif ? 'diaktifkan' : 'dinonaktifkan') + ' (' + ubah.length + ' section)', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
    if (ubah.length) perbaruiMasterJaringan_();
    return { penyulang: d.penyulang, aktif: d.aktif, jumlah: ubah.length };
  });
}
