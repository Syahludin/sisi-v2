/**
 * Berita Acara Gardu (menu OPS_BA_GARDU, khusus ADMIN / SUPER), logika murni tanpa React. Mirror HP
 * (mobile/lib/features/gardu/ba_repository.dart + daftar_ba_screen / detail_ba_screen):
 *   daftar getDaftarBaGardu (BA SiSi v2 + arsip BA v1, filter tahap / sumber / cari / tanggal / jenis / urut),
 *   alur satu BA: PDF (buatPdfBaGardu / getPdfBaGardu) -> BA TTD (uploadTtdBaGardu per bagian 2 MB / getTtdBaGardu)
 *   -> Kirim EAM (kirimEamBaGardu) -> Update Master Gardu (updateMasterGarduBa). Server menegakkan semua syarat.
 */
export const MENU_BA = 'OPS_BA_GARDU';
export const TAHAP_BA = ['DRAFT', 'PROSES_TTD', 'TTD_ULANG', 'SELESAI_TTD', 'BATAL'];
export const LABEL_TAHAP_BA = { DRAFT: 'Draft BA', PROSES_TTD: 'Proses TTD', TTD_ULANG: 'Perlu TTD ulang', SELESAI_TTD: 'Selesai TTD', BATAL: 'Batal' };
export const ARTI_TAHAP_BA = {
  DRAFT: 'PDF BA belum dibuat', PROSES_TTD: 'PDF siap, menunggu BA bertanda tangan', TTD_ULANG: 'PDF dibuat ulang / BA diedit, upload BA TTD baru',
  SELESAI_TTD: 'BA TTD sudah diupload', BATAL: 'BA dibatalkan',
};
/** Warna badge k-badge--* per tahap. */
export const BADGE_TAHAP_BA = { DRAFT: 'v1', PROSES_TTD: 'proses', TTD_ULANG: 'belum', SELESAI_TTD: 'ok', BATAL: 'v1' };
export const JENIS_BA = {
  TRAFO: ['Pengoperasian Trafo', 'Penggantian Trafo', 'Pemeriksaan Trafo', 'Pembongkaran Sementara Trafo', 'Pembongkaran Trafo'],
  SWITCHING: ['Pengoperasian Switching', 'Penggantian Switching', 'Relokasi Switching', 'Pemeriksaan Switching', 'Kerusakan Switching'],
};
/** Jenis yang punya form, PDF, dan Update Master di v2 (BA_JENIS_SIAP_ server). */
export const JENIS_BA_SIAP = ['Pengoperasian Trafo', 'Penggantian Trafo'];
export const SUMBER_BA = [['SEMUA', 'Semua (v2 + arsip v1)'], ['V2', 'SiSi v2'], ['V1', 'Arsip v1']];
export const BATAS_HALAMAN_BA = 100;
/** Slot foto per jenis (BA_SLOT_FOTO_ server): label tampil. */
export const SLOT_FOTO_BA = {
  'Pengoperasian Trafo': [['NAMEPLATE', 'Nameplate Trafo'], ['FULL_GARDU', 'Foto Full Gardu'], ['NAMEPLATE_PHB', 'Nameplate PHB-TR'], ['BOX_PHB', 'Box PHB-TR']],
  'Penggantian Trafo': [['NAMEPLATE', 'Nameplate Trafo Sebelum'], ['NAMEPLATE_SESUDAH', 'Nameplate Trafo Sesudah'], ['FULL_GARDU', 'Konstruksi Trafo Sebelum'],
    ['FULL_GARDU_SESUDAH', 'Konstruksi Trafo Sesudah'], ['NAMEPLATE_PHB_SESUDAH', 'Nameplate PHB-TR Sesudah'], ['BOX_PHB_SESUDAH', 'Box PHB-TR Sesudah']],
};

export const TTD_MAKS_BYTE = 10 * 1024 * 1024;
export const TTD_BAGIAN_BYTE = 2 * 1024 * 1024;
/** Batas waktu panggilan berat (sama HP): buat PDF 180 dtk, unduh / upload 120 dtk. */
export const BATAS_PDF_MS = 180000;
export const BATAS_FILE_MS = 120000;

/** Filter halaman -> data getDaftarBaGardu. */
export function dataDaftarBa(f, mulai = 0) {
  const d = { sumber: f.sumber || 'SEMUA', urut: f.terlama ? 'TERLAMA' : 'TERBARU', batas: BATAS_HALAMAN_BA };
  if (String(f.cari || '').trim()) d.cari = String(f.cari).trim().slice(0, 60);
  if (f.dari) d.dari = f.dari;
  if (f.sampai) d.sampai = f.sampai;
  if (f.jenis) d.jenis = f.jenis;
  if (f.tahap) d.tahap = f.tahap;
  if (mulai > 0) d.mulai = mulai;
  return d;
}

/** Galat filter yang tidak perlu dikirim ke server. Kosong = valid. */
export const galatFilterBa = (f) => (f.dari && f.sampai && f.dari > f.sampai ? 'Tanggal "dari" sesudah "sampai".' : '');

/** Tahap satu item (server mengirim `tahap`; cadangan sama HP). */
export const tahapItemBa = (x) => x.tahap || (x.statusBa === 'BATAL' ? 'BATAL' : 'DRAFT');

/** Nomor tampil: No BA Full, ID BA, atau penanda. */
export const nomorBa = (x) => x.noBaFull || x.idBa || 'Tanpa nomor BA';

/**
 * Aksi yang boleh untuk satu BA (sama syarat server; tombol mati + alasan kalau tidak boleh).
 * arsip v1 = baca saja (unduh file lama). bolehUbah = akses UBAH menu.
 */
export function aksiBa(x, bolehUbah) {
  const arsip = !!x.arsip, batal = x.statusBa === 'BATAL', tulis = bolehUbah && !arsip && !batal;
  const pdfAda = x.statusPdf === 'SELESAI' && (arsip ? !!x.adaPdf : !!(x.fileId || x.urlPdf));
  const ttdOk = x.statusTtd === 'SUDAH TTD' && !!x.adaTtd;
  const alasanTtd = !x.adaTtd ? 'Upload BA TTD dulu.' : x.statusTtd === 'TTD ULANG' ? 'PDF dibuat ulang / BA diedit: upload BA TTD baru dulu.' : '';
  return {
    buatPdf: tulis && !!x.pdfBisa,
    unduhPdf: pdfAda,
    uploadTtd: tulis && pdfAda,
    unduhTtd: arsip ? !!x.adaTtd : !!x.adaTtd,
    kirimEam: tulis && ttdOk,
    updateMaster: tulis && ttdOk && JENIS_BA_SIAP.includes(x.jenis),
    alasanEam: tulis && !ttdOk ? alasanTtd : '',
    alasanPdf: tulis && !pdfAda ? 'Buat PDF dulu.' : '',
  };
}

/** Item daftar diperbarui dari jawaban aksi (info TTD / PDF / EAM / master). */
export function gabungInfoBa(x, j) {
  const kunci = ['statusPdf', 'urlPdf', 'fileId', 'waktuPdf', 'tahap', 'statusTtd', 'adaTtd', 'waktuTtd', 'eamTerakhir', 'eamKali', 'masterTerakhir'];
  const baru = { ...x };
  kunci.forEach((k) => { if (j && k in j) baru[k] = j[k]; });
  return baru;
}

// ---------------- file ----------------

/** Bytes PDF? (%PDF di awal, sama mimeDariBytes_ server). */
export const pdfDariBytes = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/** Galat file BA TTD sebelum dikirim. Kosong = valid. */
export function galatFileTtd(bytes, nama = '') {
  if (!bytes.length) return 'File kosong.';
  if (!pdfDariBytes(bytes)) return 'File BA TTD harus PDF' + (nama && !/\.pdf$/i.test(nama) ? ' (bukan ' + nama.split('.').pop() + ')' : '') + '.';
  if (bytes.length > TTD_MAKS_BYTE) return 'File maksimal 10 MB (ini ' + (bytes.length / 1048576).toFixed(1) + ' MB).';
  return '';
}

/** Potong per 2 MB (bagian terakhir boleh lebih kecil; server mewajibkan bagian lain tepat 2 MB). */
export function potongBagian(bytes, ukuran = TTD_BAGIAN_BYTE) {
  const hasil = [];
  for (let i = 0; i < bytes.length; i += ukuran) hasil.push(bytes.subarray(i, Math.min(i + ukuran, bytes.length)));
  return hasil;
}

export async function sha256Hex(bytes) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Uint8Array -> base64 (per potongan supaya tidak melebihi batas argumen). */
export function keBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(s);
}

export function dariBase64(b64) {
  const s = globalThis.atob(b64 || '');
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/**
 * Kiriman uploadTtdBaGardu per bagian (sama HP): satu uploadId, ke / dari, sha256 + ukuran file utuh, data base64 bagian.
 * Nama file maks 120 huruf (ujung nama dipertahankan).
 */
export async function bagianUploadTtd(baId, bytes, namaFile, uploadId = globalThis.crypto.randomUUID()) {
  const sha = await sha256Hex(bytes), bagian = potongBagian(bytes);
  const nama = namaFile.length > 120 ? namaFile.slice(-120) : namaFile;
  return bagian.map((b, i) => ({ baId, uploadId, ke: i + 1, dari: bagian.length, mime: 'application/pdf', namaFile: nama, sha256: sha,
    ukuranByte: bytes.length, data: keBase64(b) }));
}
