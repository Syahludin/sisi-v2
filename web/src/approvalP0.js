/**
 * Approval P0 (menu OPS_VERIFIKASI_P0, khusus ADMIN / SUPER), logika murni tanpa React. Mirror dari HP
 * (mobile/lib/features/yandal/approval_p0_repository.dart + approval_p0_screen.dart). Keputusan langsung ke server
 * (point + rekap shift dihitung server saat itu); revision dikirim, beda = DATA_BERUBAH.
 */
import { aksiMenu } from './katalog.js';

export const MENU_P0 = 'OPS_VERIFIKASI_P0';
export const STATUS_P0 = ['Menunggu', 'Approved', 'Rejected'];
export const LABEL_STATUS_P0 = { Menunggu: 'Menunggu', Approved: 'Disetujui', Rejected: 'Ditolak' };
export const SLOT_P0 = ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
export const LABEL_SLOT_P0 = { SEBELUM: 'Sebelum', PEKERJAAN: 'Pekerjaan', SESUDAH: 'Sesudah' };
export const LABEL_SLOT_SWITCHING = {
  ARUS: 'Arus', GANGGUAN_1: 'Arus Gangguan 1', GANGGUAN_2: 'Arus Gangguan 2', GANGGUAN_3: 'Arus Gangguan 3',
  GANGGUAN_4: 'Arus Gangguan 4', GANGGUAN_5: 'Arus Gangguan 5',
};
/** Nilai pengukuran gardu (urutan + slot foto sama dengan YAN_NILAI_GARDU_ server), lalu foto KONDISI opsional. */
export const NILAI_GARDU = [
  ['bebanR', 'BEBAN_R', 'Beban R', 'A'], ['bebanS', 'BEBAN_S', 'Beban S', 'A'], ['bebanT', 'BEBAN_T', 'Beban T', 'A'],
  ['bebanN', 'BEBAN_N', 'Beban N', 'A'], ['teganganRS', 'TEGANGAN_RS', 'Tegangan R-S', 'V'], ['teganganRT', 'TEGANGAN_RT', 'Tegangan R-T', 'V'],
  ['teganganST', 'TEGANGAN_ST', 'Tegangan S-T', 'V'], ['teganganRN', 'TEGANGAN_RN', 'Tegangan R-N', 'V'],
  ['teganganSN', 'TEGANGAN_SN', 'Tegangan S-N', 'V'], ['teganganTN', 'TEGANGAN_TN', 'Tegangan T-N', 'V'],
].map(([kunci, slot, label, satuan]) => ({ kunci, slot, label, satuan }));
export const PEKERJAAN_LAIN = 'Lain - Lain';
export const ALASAN_CEPAT = ['Foto tidak sesuai pekerjaan', 'Foto buram / tidak jelas', 'Lokasi tidak sesuai', 'Pekerjaan tidak valid', 'Foto duplikat'];
export const MAKS_ALASAN = 300;
export const MAKS_BARIS_ALASAN = 5;
/** Foto penuh (watermark terbaca) bisa beberapa MB: batas sama dengan HP. */
export const BATAS_FOTO_PENUH_MS = 90000;

const kunciNama = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const pekerjaanLain = (nama) => kunciNama(nama) === kunciNama(PEKERJAAN_LAIN);

/** Akun boleh memutuskan / mengoreksi (server memeriksa ulang peran + akses). */
export function bolehUbahP0(sesi) {
  const role = sesi?.profil?.role;
  return (role === 'ADMIN' || role === 'SUPER') && aksiMenu(sesi, MENU_P0) === 'UBAH';
}

export const namaTampil = (x) => (x.lainLain && x.pekerjaanLainnya ? x.namaPekerjaan + ' · ' + x.pekerjaanLainnya : x.namaPekerjaan || '');
export const lokasiP0 = (x) => [x.penyulang, x.section, x.daerah].filter((v) => String(v || '').trim()).join(' · ');

export function cocokP0(x, kata) {
  const k = String(kata || '').trim().toLowerCase();
  return !k || [x.kodeP0, namaTampil(x), lokasiP0(x), x.tim, x.petugas].join(' ').toLowerCase().includes(k);
}

export function hitungJumlah(list) {
  const j = { Menunggu: 0, Approved: 0, Rejected: 0 };
  list.forEach((x) => { if (x.status in j) j[x.status]++; });
  return j;
}

/** Tombol yang tersedia untuk satu P0 (Rejected oleh SISTEM "P0 Tidak Selesai" tidak bisa diubah). */
export function aksiP0(x, bolehUbah) {
  const bisa = bolehUbah && x.sistem !== true;
  return {
    setujui: bisa && x.status !== 'Approved',
    tolak: bisa && x.status !== 'Rejected',
    ubahJenis: bisa,
    labelSetujui: x.status === 'Rejected' ? 'Setujui ulang' : 'Setujui',
  };
}

/**
 * P0 yang dipilih setelah keputusan: berikutnya di tab yang sama (urutan sebelum diputuskan), kalau habis yang
 * sebelumnya, kalau tab kosong null. lama = daftar tab sebelum keputusan, idLama = P0 yang baru diputuskan.
 */
export function pilihBerikutnya(lama, baru, idLama) {
  const ada = new Set(baru.map((x) => x.p0Id));
  if (ada.has(idLama)) return idLama;
  const i = lama.findIndex((x) => x.p0Id === idLama);
  const sesudah = lama.slice(i + 1).find((x) => ada.has(x.p0Id));
  const sebelum = lama.slice(0, Math.max(i, 0)).reverse().find((x) => ada.has(x.p0Id));
  return (sesudah || sebelum)?.p0Id ?? null;
}

/** Jenis pekerjaan YANDAL aktif dari master (urut kolom urutan), Lain - Lain selalu terakhir, tanpa dobel. */
export function daftarPekerjaan(master) {
  const l = master.filter((j) => String(j.modul).toUpperCase() === 'YANDAL' && j.aktif === true)
    .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
  const nama = [];
  for (const j of l) {
    const n = String(j.nama || '').trim();
    if (n && !pekerjaanLain(n) && !nama.includes(n)) nama.push(n);
  }
  return [...nama, PEKERJAAN_LAIN];
}

export function bobotMaster(master) {
  const m = new Map();
  master.forEach((j) => { if (String(j.modul).toUpperCase() === 'YANDAL') m.set(String(j.nama).trim(), typeof j.bobot === 'number' ? j.bobot : null); });
  return m;
}

/** "12,5" / "12.5" -> 12.5 dalam 0..100; kosong / salah = null. */
export function bacaBobot(teks) {
  const t = String(teks ?? '').trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

/** Galat alasan (tolak / koreksi): wajib, maks 300 huruf, maks 5 baris. Kosong = valid. */
export function galatAlasan(teks) {
  const t = String(teks || '').trim();
  if (!t) return 'Alasan wajib diisi.';
  if (t.length > MAKS_ALASAN) return 'Maks ' + MAKS_ALASAN + ' huruf.';
  if (t.split('\n').length > MAKS_BARIS_ALASAN) return 'Maks ' + MAKS_BARIS_ALASAN + ' baris.';
  return '';
}

export function dataPutuskan(x, keputusan, { alasan = '', bobot = null } = {}) {
  const d = { p0Id: x.p0Id, keputusan, revision: Number(x.revision) || 0 };
  if (alasan.trim()) d.alasan = alasan.trim();
  if (bobot !== null) d.bobot = bobot;
  return d;
}

export function dataUbahJenis(x, { nama, lainnya = '', alasan, bobot = null }) {
  const d = { p0Id: x.p0Id, namaPekerjaan: nama, alasan: alasan.trim(), revision: Number(x.revision) || 0 };
  if (pekerjaanLain(nama) && lainnya.trim()) d.pekerjaanLainnya = lainnya.trim();
  if (bobot !== null) d.bobot = bobot;
  return d;
}

const formatId = (desimal) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: desimal });
export const angkaId = (v, desimal = 0) => (typeof v === 'number' && Number.isFinite(v) ? formatId(desimal).format(v) : '-');

/** 45 -> "45 menit", 75 -> "1 jam 15 menit", 0,5 -> "30 detik" (sama dengan teksMenit HP). */
export function teksMenit(menit) {
  if (typeof menit !== 'number' || !Number.isFinite(menit)) return '-';
  const detik = Math.round(menit * 60);
  const j = Math.floor(detik / 3600), m = Math.floor((detik % 3600) / 60), d = detik % 60;
  if (j) return j + ' jam' + (m ? ' ' + m + ' menit' : '');
  if (m) return m + ' menit';
  return d + ' detik';
}

/** Tautan Google Maps untuk koordinat "lat, lon"; bukan koordinat = ''. */
export function tautanPeta(koordinat) {
  const m = String(koordinat || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? 'https://www.google.com/maps?q=' + m[1] + ',' + m[2] : '';
}

// ---------------- foto (Drive privat dibaca lewat server) ----------------

export const kunciFoto = (f) => [f.p0Id, f.jenis, f.id || '', f.slot].join('-');

export function dataFoto(f, ukuran) {
  const d = { p0Id: f.p0Id, jenis: f.jenis, slot: f.slot, ukuran };
  if (f.id) d.id = f.id;
  return d;
}

const tembolok = { KECIL: new Map(), PENUH: new Map() };
const BATAS_TEMBOLOK = { KECIL: 300, PENUH: 30 };

/**
 * Foto sebagai data URL, disimpan di memori tab (thumbnail 300, penuh 30 terakhir). Gagal tidak disimpan.
 * api(action, data, opsi) = panggilan backend milik Dashboard.
 */
export function muatFoto(api, f, ukuran = 'KECIL') {
  const peta = tembolok[ukuran];
  const k = kunciFoto(f);
  if (!peta.has(k)) {
    const janji = api('getFotoApprovalP0', dataFoto(f, ukuran), ukuran === 'PENUH' ? { batasMs: BATAS_FOTO_PENUH_MS } : {})
      .then((j) => 'data:' + (j.data.mime || 'image/jpeg') + ';base64,' + j.data.data);
    janji.catch(() => { if (peta.get(k) === janji) peta.delete(k); });
    if (peta.size >= BATAS_TEMBOLOK[ukuran]) peta.delete(peta.keys().next().value);
    peta.set(k, janji);
  }
  return peta.get(k);
}
