/**
 * Material Gudang (menu OPS_GUDANG_MATERIAL, ADMIN / SUPER), logika murni tanpa React. Mirror HP
 * (mobile/lib/features/gudang/). Stok MCB dihitung server dari buku mutasi; di sini hanya merapikan isian menjadi payload
 * endpoint (tambahStokGudang / kirimStokTim / tarikStokTim / koreksiStok) dan teks tampilan. Kode galat lokal = kode server
 * supaya pesan(kode) yang sama dipakai.
 */
import { GalatApi } from './api.js';
import { aksiMenu } from './katalog.js';

export const MENU_GUDANG = 'OPS_GUDANG_MATERIAL';
export const STATUS_MCB = ['Baru', 'Ex-Handal'];
export const JUMLAH_MAKS = 100000;

export const LABEL_MUTASI = {
  MASUK_GUDANG: 'Masuk gudang', KIRIM_TIM: 'Kirim ke tim', TARIK_TIM: 'Tarik ke gudang', KOREKSI_GUDANG: 'Koreksi gudang', KOREKSI_TIM: 'Koreksi tim',
  PAKAI: 'Dipakai', HILANG: 'Hilang', TAMBAHAN: 'Tambahan masuk',
};

const LABEL_CARA = {
  HILANG: 'MCB hilang (keluar dari stok)',
  SUSULAN: 'Isi pemakaian susulan',
  SALAH_HITUNG: 'Petugas salah hitung (dikembalikan)',
  TAMBAHAN_MASUK: 'Tambahan masuk (tambah ke stok)',
  SALAH_CATAT: 'Salah catat (stok tetap)',
};

/** Akun boleh mengubah stok: ADMIN / SUPER dengan aksi UBAH di menu ini (server menegakkan ulang). */
export function bolehUbahGudang(sesi) {
  const role = sesi?.profil?.role;
  return (role === 'ADMIN' || role === 'SUPER') && aksiMenu(sesi, MENU_GUDANG) === 'UBAH';
}

/** Daya untuk tampilan: angka saja diberi satuan A ('2' -> '2A'); nilai lama berhuruf ('2A') apa adanya. */
export const teksDaya = (daya) => (/^\d+$/.test(String(daya || '').trim()) ? String(daya).trim() + 'A' : String(daya || '').trim());

/** Isian Daya: hanya angka (satuan Ampere ada di judul kolom). */
export const hanyaAngka = (teks) => String(teks || '').replace(/\D/g, '');

export const totalJenis = (daftar) => (daftar || []).reduce((a, j) => a + Number(j.jumlah || 0), 0);

/** '3 × 2A Schneider Baru; 1 × 4A Hager Ex-Handal' */
export function ringkasJenis(daftar) {
  const l = (daftar || []).filter((j) => Number(j.jumlah) !== 0);
  return l.length ? l.map((j) => `${j.jumlah} × ${teksDaya(j.daya)} ${j.merk} ${j.statusMcb}`).join('; ') : '-';
}

export const pilihanCara = (arah) => (arah === 'KURANG' ? ['HILANG', 'SUSULAN', 'SALAH_HITUNG'] : arah === 'LEBIH' ? ['TAMBAHAN_MASUK', 'SALAH_CATAT', 'SALAH_HITUNG'] : []);
export const labelCara = (cara) => LABEL_CARA[cara] || cara;
export const adaStokTanpaIzin = (tim) => ((tim && tim.tanpaIzin) || []).length > 0;

export function teksSelisih(s) {
  return `${s.arah === 'KURANG' ? 'Kurang' : 'Lebih'} ${Math.abs(s.selisih)}: ${teksDaya(s.daya)} ${s.merk} ${s.statusMcb} (perkiraan ${s.jumlahPerkiraan}, dihitung ${s.jumlahInput})`;
}

const wajib = (v, kolom) => {
  const t = String(v === undefined || v === null ? '' : v).trim();
  if (!t) throw new GalatApi('FIELD_WAJIB', kolom);
  return t;
};

/** Bilangan bulat dalam [min, JUMLAH_MAKS] dari teks isian. Kode galat sama dengan validasi_ server. */
function angka(v, kolom, min) {
  const t = wajib(v, kolom);
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new GalatApi('TIPE_SALAH', kolom);
  const n = Number(t);
  if (Math.floor(n) !== n) throw new GalatApi('HARUS_BULAT', kolom);
  if (n < min || n > JUMLAH_MAKS) throw new GalatApi('DI_LUAR_RENTANG', kolom);
  return n;
}

function jenis(f) {
  const statusMcb = wajib(f.statusMcb, 'statusMcb');
  if (!STATUS_MCB.includes(statusMcb)) throw new GalatApi('PILIHAN_TIDAK_VALID', 'statusMcb');
  return { materialId: wajib(f.materialId, 'materialId'), daya: wajib(f.daya, 'daya'), merk: wajib(f.merk, 'merk'), statusMcb };
}

const alasan = (f) => {
  if (!String(f.alasan || '').trim()) throw new GalatApi('ALASAN_WAJIB', 'alasan');
  return String(f.alasan).trim();
};
const catatan = (f) => (String(f.catatan || '').trim() ? { catatan: String(f.catatan).trim() } : {});

export function dataStok(f, idOperasi) {
  return { idOperasi, ...jenis(f), jumlah: angka(f.jumlah, 'jumlah', 1), ...catatan(f) };
}

export function dataKirim(f, idOperasi) {
  const timId = wajib(f.timId, 'timId');
  return { idOperasi, timId, ...jenis(f), jumlah: angka(f.jumlah, 'jumlah', 1), ...catatan(f) };
}

export function dataTarik(f, idOperasi) {
  const a = alasan(f);
  const timId = wajib(f.timId, 'timId');
  return { idOperasi, timId, ...jenis(f), jumlah: angka(f.jumlah, 'jumlah', 1), alasan: a };
}

export function dataKoreksi(f, idOperasi) {
  const a = alasan(f);
  const lokasi = wajib(f.lokasi, 'lokasi');
  return { idOperasi, lokasi, ...jenis(f), jumlahBaru: angka(f.jumlahBaru, 'jumlahBaru', 0), alasan: a };
}

/** uuid v4 untuk idOperasi / pemakaianId (satu per form, dibuat saat form dibuka). */
export const idBaru = () => globalThis.crypto.randomUUID();
