/**
 * Verifikasi Tiang + Segmen (menu OPS_VERIFIKASI_TIANG, ADMIN / SUPER): logika murni (diuji di test/tiang.test.js).
 * Mirror HP (mobile/lib/features/tiang/tiang_model.dart). Data: getVerifikasiTiang (jalur), getSegmen.
 */

export const MENU_TIANG = 'OPS_VERIFIKASI_TIANG';

export const AWAL_SEGMEN = [['GI', 'GI'], ['SWITCHING', 'Switching'], ['GARDU', 'Gardu'], ['PERCABANGAN', 'Percabangan'], ['UJUNG_KABEL', 'Ujung Kabel (Tiang Naik/Turun)']];
export const AKHIR_SEGMEN = [['SWITCHING', 'Switching'], ['GARDU', 'Gardu'], ['PERCABANGAN', 'Percabangan'], ['UJUNG_KABEL', 'Ujung Kabel (Tiang Naik/Turun)'], ['UJUNG', 'Ujung']];
/** Segmen seragam: udara (berisi tiang) atau kabel tanah (tanpa tiang; data kabel di segmen). */
export const JENIS_SEGMEN = [['UDARA', 'Udara (SUTM)'], ['KABEL_TANAH', 'Kabel Tanah (SKTM)']];
/** Jenis kabel tanah dari data aset ITB (kategori SKTM). */
export const JENIS_KABEL_TANAH = [['N2XSEBY - 1 CORE', 'N2XSEBY - 1 CORE'], ['NA2XSEYBY - 3 CORE', 'NA2XSEYBY - 3 CORE']];
export const kabelTanah = (s) => s?.jenisSegmen === 'KABEL_TANAH';

const teks = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** Selesai = terverifikasi + tidak ditemukan; persen bulat. */
export const selesaiJalur = (j) => (j.terverifikasi || 0) + (j.tidakDitemukan || 0);
export const persenJalur = (j) => (j.jumlah ? Math.round((selesaiJalur(j) * 100) / j.jumlah) : 0);

/** Total semua jalur. */
export function totalJalur(jalur) {
  const t = { jumlah: 0, terverifikasi: 0, perluDilengkapi: 0, perluPerbaikan: 0, tidakDitemukan: 0, bertanda: 0 };
  (jalur || []).forEach((j) => Object.keys(t).forEach((k) => { t[k] += j[k] || 0; }));
  return t;
}

/** Saring + urut segmen: penyulang ('' = semua), nonaktif disembunyikan kecuali diminta; urut penyulang lalu urutan. */
export const saringSegmen = (daftar, { penyulang = '', nonaktif = false } = {}) => (daftar || [])
  .filter((s) => (nonaktif || s.aktif) && (!penyulang || s.penyulang === penyulang))
  .sort((a, b) => a.penyulang.localeCompare(b.penyulang) || (a.urutan || 0) - (b.urutan || 0) || a.nama.localeCompare(b.nama));

export const isianSegmenBaru = (penyulang = '') => ({
  segmenId: '', revision: null, nama: '', penyulang, sectionId: '', urutan: '', indukSegmenId: '', awalJenis: 'SWITCHING', awalNama: '',
  awalSwitchingId: '', akhirJenis: 'GARDU', akhirNama: '', akhirSwitchingId: '', segmenItb: '', catatan: '', aktif: true,
  jenisSegmen: 'UDARA', jenisKabel: '', ukuranMm2: '', panjangKabelM: '', penghantarId: '',
});

const angkaKeTeks = (v) => (v === null || v === undefined ? '' : String(v));
export const isianSegmenDari = (s) => ({
  ...isianSegmenBaru(), ...s, urutan: angkaKeTeks(s.urutan), ukuranMm2: angkaKeTeks(s.ukuranMm2), panjangKabelM: angkaKeTeks(s.panjangKabelM),
  jenisSegmen: s.jenisSegmen || 'UDARA',
});

/** Galat per kolom sebelum kirim (server memeriksa ulang). */
export function cekSegmen(i, jaringan) {
  const g = {};
  if (!teks(i.nama)) g.nama = 'Nama segmen wajib diisi.';
  if (!(jaringan || []).some((x) => x.penyulang === i.penyulang)) g.penyulang = 'Pilih penyulang.';
  if (!(jaringan || []).some((x) => x.sectionId === i.sectionId && x.penyulang === i.penyulang)) g.sectionId = 'Pilih section milik penyulang ini.';
  if (!teks(i.awalNama)) g.awalNama = 'Nama titik awal wajib diisi.';
  if (!teks(i.akhirNama)) g.akhirNama = 'Nama titik akhir wajib diisi.';
  if (teks(i.urutan) && !/^\d+$/.test(teks(i.urutan))) g.urutan = 'Isi angka bulat.';
  if (kabelTanah(i)) {
    if (teks(i.ukuranMm2) && !(Number(teks(i.ukuranMm2).replace(',', '.')) > 0)) g.ukuranMm2 = 'Isi angka lebih dari 0.';
    if (teks(i.panjangKabelM) && !(Number(teks(i.panjangKabelM).replace(',', '.')) > 0)) g.panjangKabelM = 'Isi angka lebih dari 0.';
  }
  return g;
}

/** Isian -> payload simpanSegmen (kolom kosong tidak dikirim; switching batas hanya bila jenisnya SWITCHING). */
export function payloadSegmen(i) {
  const p = {};
  ['nama', 'penyulang', 'sectionId', 'indukSegmenId', 'awalJenis', 'awalNama', 'akhirJenis', 'akhirNama', 'segmenItb', 'catatan']
    .forEach((k) => { if (teks(i[k])) p[k] = teks(i[k]); });
  if (i.awalJenis === 'SWITCHING' && teks(i.awalSwitchingId)) p.awalSwitchingId = teks(i.awalSwitchingId);
  if (i.akhirJenis === 'SWITCHING' && teks(i.akhirSwitchingId)) p.akhirSwitchingId = teks(i.akhirSwitchingId);
  if (teks(i.urutan)) p.urutan = Number(teks(i.urutan));
  p.jenisSegmen = kabelTanah(i) ? 'KABEL_TANAH' : 'UDARA';
  if (kabelTanah(i)) {
    if (teks(i.jenisKabel)) p.jenisKabel = teks(i.jenisKabel);
    if (teks(i.ukuranMm2)) p.ukuranMm2 = Number(teks(i.ukuranMm2).replace(',', '.'));
    if (teks(i.panjangKabelM)) p.panjangKabelM = Number(teks(i.panjangKabelM).replace(',', '.'));
    if (teks(i.penghantarId)) p.penghantarId = teks(i.penghantarId);
  }
  if (i.segmenId) { p.segmenId = i.segmenId; p.revision = i.revision; p.aktif = !!i.aktif; }
  return p;
}
