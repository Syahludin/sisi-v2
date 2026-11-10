/**
 * v1.0.51 menu Checkpoint Jaringan (OPS_CHECKPOINT), port v1 "Data Pendukung CheckPoint": sub-tab Har, Cover Gardu,
 * Gangguan Penyulang, Rekap Temuan Inspeksi; filter Penyulang + Section (pangkal) + Tahun. Logika murni (diuji).
 * Data = getCheckpoint { bagian, tahun } per sub-tab (backend modules/65_Checkpoint.js).
 */
export const MENU_CHECKPOINT = 'OPS_CHECKPOINT';

export const SUBTAB_CP = [
  { kode: 'har', label: 'Har', ikon: 'penggaris' },
  { kode: 'cover', label: 'Cover Gardu', ikon: 'perisai' },
  { kode: 'gangguan', label: 'Gangguan Penyulang', ikon: 'listrik' },
  { kode: 'temuan', label: 'Rekap Temuan Inspeksi', ikon: 'laporan' },
];

/** Kriteria Har (urut v1 KRITERIA), key = kolom GASPOL. */
export const KRITERIA_HAR = [
  { grup: 'Inspeksi', items: [['insSutmKms', 'Inspeksi SUTM (kmS)'], ['insSutmTier1', 'Inspeksi SUTM Tier 1'], ['insSutmTier2', 'Inspeksi SUTM Tier 2'],
    ['insGarduTier1', 'Inspeksi Gardu Tier 1'], ['insGarduTier2', 'Inspeksi Gardu Tier 2']] },
  { grup: 'ROW', items: [['rowRabas', 'ROW 5 / Rabas'], ['rowSedang', 'Tebang Sedang'], ['rowBesar', 'Tebang Besar']] },
  { grup: 'HARKOM', items: [['harkomIsolator', 'Isolator'], ['harkomArrester', 'Arrester'], ['harkomFco', 'FCO']] },
  { grup: 'HARKONS SUTM', items: [['harkonsTiang', 'Tiang'], ['harkonsSutm', 'SUTM'], ['harkonsGw', 'GW'], ['harkonsGsw', 'GSW'], ['groundingTm', 'Grounding TM'],
    ['harkeypoint', 'Harkeypoint'], ['penghalangHewan', 'Penghalang Hewan'], ['rekonektorSutm', 'Rekonektor SUTM'], ['rehabSutm', 'Rehab SUTM'],
    ['penyulangBaruSutm', 'Penyulang Baru SUTM']] },
  { grup: 'Gardu', items: [['manajemenGardu', 'Manajemen Gardu'], ['tapChanger', 'Tap Changer'], ['penyeimbanganBeban', 'Penyeimbangan Beban'],
    ['groundingGardu', 'Grounding Gardu'], ['coverGardu', 'Cover Gardu'], ['lostContactPhbTr', 'Lost Contact PHB-TR']] },
  { grup: 'SUTR / SR', items: [['jurusanBaruPecahBeban', 'Jurusan Baru / Pecah Beban'], ['rekonektorSutr', 'Rekonektor SUTR'], ['srSeri', 'SR Seri'],
    ['rekonektorSr', 'Rekonektor SR']] },
];

/** Nama penyulang format proper (Palas, bukan PALAS / palas): huruf pertama tiap kata kapital, sisanya kecil. */
export const properNama = (s) => String(s || '').trim().toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Section pangkal (ruas sebelum '-'), sama v1 _siePangkalSection: 'LBS A - GH B' -> 'LBS A'. */
export const pangkalSection = (s) => String(s || '').split('-')[0].trim();

/** Cocok filter penyulang ('' semua) + section pangkal ('' semua), tanpa beda huruf besar / kecil. */
export const cocokCp = (penyulang, section, f) =>
  (!f.penyulang || String(penyulang || '').trim().toLowerCase() === f.penyulang.toLowerCase())
  && (!f.section || pangkalSection(section).toLowerCase() === pangkalSection(f.section).toLowerCase());

/** Jumlah minggu tiap bulan (ceil(hari / 7)), 0-based bulan. */
export const mingguBulan = (tahun) => Array.from({ length: 12 }, (_, b) => Math.ceil(new Date(Date.UTC(tahun, b + 1, 0)).getUTCDate() / 7));

/**
 * Matriks Har dari jawaban getCheckpoint bagian har { kolom, baris, penyulang }.
 * -> { data: { key: { 'b-m': nilai } }, total: { key: nilai } } (b 0..11, m 1..5), ikut filter penyulang + section.
 */
export function matriksHar(har, f = {}) {
  const data = {}, total = {};
  if (!har) return { data, total };
  const ix = Object.fromEntries((har.kolom || []).map((k, i) => [k, i]));
  const kunci = KRITERIA_HAR.flatMap((g) => g.items.map(([k]) => k));
  (har.baris || []).forEach((b, i) => {
    if (!cocokCp(har.penyulang?.[i], b[ix.section], f)) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b[ix.tanggal] || ''));
    if (!m) return;
    const slot = (Number(m[2]) - 1) + '-' + Math.ceil(Number(m[3]) / 7);
    kunci.forEach((k) => {
      const v = Number(b[ix[k]]) || 0;
      if (!v) return;
      (data[k] = data[k] || {})[slot] = (data[k][slot] || 0) + v;
      total[k] = (total[k] || 0) + v;
    });
  });
  return { data, total };
}

/** Bulatkan 2 desimal untuk tampilan (kmS). */
export const angkaHar = (v) => String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',');

/**
 * Opsi dropdown dari master jaringan [{ penyulang, section }] (db_Jaringan aktif): penyulang unik tanpa beda huruf besar / kecil
 * (ditampilkan format proper), section = section pangkal unik, hanya milik penyulang terpilih ('' = semua penyulang).
 */
export function opsiCp(master, penyulang) {
  const p = new Map(), s = new Map();
  (master || []).forEach((x) => {
    const n = String(x.penyulang || '').trim();
    if (n && !p.has(n.toLowerCase())) p.set(n.toLowerCase(), properNama(n));
    const sec = pangkalSection(x.section);
    if (sec && (!penyulang || n.toLowerCase() === penyulang.toLowerCase()) && !s.has(sec.toLowerCase())) s.set(sec.toLowerCase(), sec);
  });
  const urut = (m) => [...m.values()].sort((x, y) => x.localeCompare(y, 'id', { numeric: true }));
  return { penyulang: urut(p), section: urut(s) };
}
