/**
 * Laporan GASPOL UP3 (v1.0.44, v1 SIE-Teknik tab GASPOL UP3), logika murni tanpa React.
 * Server (getGaspolUp3) mengirim baris 38 nilai dengan urutan kolom = KOLOM_GASPOL di bawah (sama dengan v1).
 */
import { geserTanggal } from './tanggal.js';

export const BATAS_GASPOL_MS = 120000;
export const MAKS_HARI_GASPOL = 366;

/** Grup kepala tabel (baris 1) beserta jumlah kolom dan kelas warna. 4 kolom identitas berdiri sendiri (rowSpan 2). */
export const GRUP_GASPOL = [
  { nama: 'Inspeksi Jaringan', n: 3, kelas: 'sutm' },
  { nama: 'ROW', n: 3, kelas: 'row' },
  { nama: 'HARKOM', n: 3, kelas: 'harkom' },
  { nama: 'HARKONS SUTM', n: 10, kelas: 'harkons' },
  { nama: 'Gardu', n: 9, kelas: 'gardu' },
  { nama: 'SUTR / SR', n: 4, kelas: 'sutr' },
  { nama: 'Lainnya', n: 2, kelas: 'lain' },
];

/** 38 kolom: label kepala sama dengan v1. */
export const KOLOM_GASPOL = [
  'No', 'Tanggal', 'Section', 'ULP',
  'Inspeksi SUTM (kmS)', 'Inspeksi SUTM Tier 1 (Gwg)', 'Inspeksi SUTM Tier 2 (Gwg)',
  'ROW 5 / Rabas (Gwg)', 'Tebang Sedang (Btg)', 'Tebang Besar (Btg)',
  'Harkom Isolator (Titik)', 'Harkom Arrester (Titik)', 'Harkom FCO (Titik)',
  'Harkons Tiang (Titik)', 'Harkons SUTM (Titik)', 'Harkons GW (Titik)', 'Harkons GSW (Titik)',
  'Perbaikan Grounding TM (Titik)', 'Harkeypoint (Titik)', 'Penghalang Hewan (Titik)', 'Rekonektor SUTM (Titik)',
  'Rehabilitasi / Pemberatan SUTM (kmS)', 'Penyulang Baru SUTM - Pecah Beban (kmS)',
  'No Gardu', 'Inspeksi Gardu Tier 1 (Bh)', 'Inspeksi Gardu Tier 2 (Bh)', 'Manajemen Gardu (Bh)', 'Tap Changer (Bh)',
  'Penyeimbangan Beban (Bh)', 'Perbaikan Grounding Gardu (Titik)', 'Cover Gardu (Set)', 'Lost Contact PHB-TR (Bh)',
  'Jurusan Baru Pecah Beban (kmS)', 'Rekonektor SUTR (Titik)', 'SR Seri (kmS)', 'Rekonektor SR (Titik)',
  'Care For Asset / CFA (Gwg)', 'Pemasangan AVR (Bh)',
];

export const KOLOM_TEKS = new Set([1, 2, 3, 23]);

/** Rentang bawaan: tanggal 1 bulan ini s.d. hari ini (sama dengan Reset v1). */
export function rentangAwal(hariIni) {
  return { dari: hariIni.slice(0, 8) + '01', sampai: hariIni };
}

/** Pesan galat rentang, '' = sah. */
export function galatRentang(dari, sampai) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari || '') || !/^\d{4}-\d{2}-\d{2}$/.test(sampai || '')) return 'Isi Tgl Dari dan Tgl Sampai dulu.';
  if (dari > sampai) return 'Tgl Dari tidak boleh melebihi Tgl Sampai.';
  if (geserTanggal(dari, MAKS_HARI_GASPOL) <= sampai) return 'Rentang maksimal ' + MAKS_HARI_GASPOL + ' hari.';
  return '';
}

/** Angka tampil gaya Indonesia (koma desimal). */
export const angkaGaspol = (v) => String(Number(v) || 0).replace('.', ',');

