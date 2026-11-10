/**
 * v1.0.38 Penerusan Tim Temuan Inspeksi (menu OPS_PENERUSAN_WO), mirror layar HP wo_admin_screen.dart + wo_bantu.dart.
 * Temuan inspeksi (petugas Inspeksi Jaringan / Gardu, input admin) diteruskan ke tim ROW / HARTEK / YANDAL yang aktif
 * (teruskanWo). Pindah / tarik WO terkirim tetap di menu Pindah Tim TO; WO ganda di Verifikasi WO Ganda. Murni (diuji).
 */
import { bacaFotoLokal, simpanFotoLokal } from './fotoLokal.js';

export const MENU_WO = 'OPS_PENERUSAN_WO';

/** Tab status = parameter status getWoAdmin. Daftar kerja admin = Baru (belum diteruskan). */
export const TAB_WO = [
  { kode: 'BARU', label: 'Baru', ringkas: 'baru' },
  { kode: 'AKTIF', label: 'Aktif' },
  { kode: 'TERKIRIM', label: 'Terkirim', ringkas: 'terkirim' },
  { kode: 'DIKERJAKAN', label: 'Dikerjakan', ringkas: 'dikerjakan' },
  { kode: 'SELESAI', label: 'Selesai', ringkas: 'selesai' },
  { kode: 'SEMUA', label: 'Semua' },
];
export const tabWo = (kode) => TAB_WO.find((t) => t.kode === kode) || TAB_WO[0];

export const STATUS_WO = {
  '': { label: 'Belum diteruskan', warna: 'merah' },
  TERKIRIM: { label: 'Terkirim', warna: 'biru' },
  DIKERJAKAN: { label: 'Dikerjakan', warna: 'kuning' },
  SELESAI: { label: 'Selesai', warna: 'hijau' },
};
export const LABEL_JENIS_TIM = { ROW: 'Tim ROW', HARTEK: 'Tim Hartek', YANDAL: 'Tim Yandal' };
export const SLOT_FOTO_WO = [['SEBELUM', 'Sebelum'], ['PEKERJAAN', 'Pekerjaan'], ['SESUDAH', 'Sesudah']];
export const SLOT_FOTO_TEMUAN = [['TEMUAN', 'Foto temuan'], ['TIANG', 'Foto tiang']];
export const MAKS_CATATAN = 300;
export const MAKS_BARIS_CATATAN = 5;

const teks = (v) => (v === null || v === undefined ? '' : String(v).trim());

export const statusWo = (t) => teks(t?.wo?.status);
export const infoStatusWo = (s) => STATUS_WO[teks(s)] || STATUS_WO[''];

/** Lokasi ringkas: penyulang · section · Gardu x · Tiang y. */
export const lokasiTemuan = (t) => [teks(t.penyulang), teks(t.section), teks(t.noGardu) && 'Gardu ' + teks(t.noGardu), teks(t.nomorTiang) && 'Tiang ' + teks(t.nomorTiang)]
  .filter(Boolean).join(' · ');

/** Tim inspeksi asal temuan: Admin / nama tim / Petugas. */
export const timInspeksi = (t) => (teks(t.sumber) === 'ADMIN' ? 'Admin' : teks(t.tim) || 'Petugas');

/** Teruskan hanya untuk temuan Baru yang tidak menunggu verifikasi WO ganda. */
export const bolehTeruskan = (t) => !statusWo(t) && t?.wo?.ganda !== true;

/** v1.0.58: tombol Teruskan ke tim di daftar Temuan Inspeksi (peta): admin dengan aksi UBAH di OPS_PENERUSAN_WO + WO belum diteruskan. */
export const bolehTeruskanDariDaftar = (sesi, t) =>
  (Array.isArray(sesi?.menu) ? sesi.menu : []).some((m) => m.kode === MENU_WO && m.aksi === 'UBAH') && bolehTeruskan(t);

/** Cari (semua kata) di kode, jenis, penyulang, section, gardu, tiang, tim inspeksi, tim tindak lanjut. */
export function cocokCari(t, kata) {
  const k = teks(kata).toLowerCase().split(/\s+/).filter(Boolean);
  if (!k.length) return true;
  const isi = [t.kodeTemuan, t.jenisTemuan, t.penyulang, t.section, t.noGardu, t.nomorTiang, timInspeksi(t), t?.wo?.tim, t.deskripsi]
    .map(teks).join(' ').toLowerCase();
  return k.every((x) => isi.includes(x));
}

/** Saring daftar: kata cari + penyulang + tim inspeksi ('' = semua). */
export const saringWo = (daftar, { cari = '', penyulang = '', tim = '' } = {}) => (daftar || [])
  .filter((t) => cocokCari(t, cari) && (!penyulang || teks(t.penyulang) === penyulang) && (!tim || timInspeksi(t) === tim));

/** Pilihan filter unik terurut abjad (tanpa kosong). */
export const pilihanFilter = (daftar, ambil) => [...new Set((daftar || []).map(ambil).map(teks).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Tim tujuan dikelompokkan per jenis (urutan ROW, HARTEK, YANDAL): [{ jenis, label, tim: [...] }]. */
export function grupTim(tim) {
  const urut = Object.keys(LABEL_JENIS_TIM);
  const g = new Map();
  (tim || []).forEach((x) => { const j = teks(x.jenis); if (!g.has(j)) g.set(j, []); g.get(j).push(x); });
  return [...g.entries()].sort((a, b) => (urut.indexOf(a[0]) + 99) % 99 - (urut.indexOf(b[0]) + 99) % 99 || a[0].localeCompare(b[0]))
    .map(([jenis, isi]) => ({ jenis, label: LABEL_JENIS_TIM[jenis] || jenis, tim: isi }));
}

/** Galat catatan admin (sama skema server: maks 300 huruf, 5 baris). '' = valid. */
export function galatCatatan(c) {
  const s = String(c || '');
  if (s.trim().length > MAKS_CATATAN) return `Catatan maksimal ${MAKS_CATATAN} huruf.`;
  if (s.trim().split('\n').length > MAKS_BARIS_CATATAN) return `Catatan maksimal ${MAKS_BARIS_CATATAN} baris.`;
  return '';
}

/** Data teruskanWo. Catatan kosong tidak dikirim (server memakai catatan lama). */
export function dataTeruskan(t, timId, catatan) {
  const c = String(catatan || '').trim();
  return { temuanId: t.temuanId, timId, ...(c ? { catatan: c } : {}), revision: Number(t.revision) || 1 };
}

/**
 * v1.0.58: tampilan sementara sesudah Kirim WO ditekan (pengiriman jalan di latar): temuan langsung TERKIRIM ke tim terpilih.
 * Server tetap pemutus; jawabannya menggantikan ini, gagal = temuan asli dikembalikan. Argumen tidak diubah.
 */
export function temuanTerkirimSementara(t, tim, catatan) {
  return { ...t, wo: { ...(t.wo || {}), status: 'TERKIRIM', timId: tim.timId, tim: tim.nama, jenisTim: tim.jenis || '', catatanAdmin: catatan || '' } };
}

const angkaPendek = (v) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? teks(v) : String(Math.round(n * 100) / 100); };

/** Ringkasan satu pekerjaan tim: nama + ukuran / jumlah; Hartek = semua pekerjaan + material per pekerjaan. */
export function ringkasPekerjaan(p) {
  const pk = Array.isArray(p?.rincian?.pekerjaan) ? p.rincian.pekerjaan : [];
  const satu = (x) => [teks(x.nama), angkaPendek(x.jumlah), teks(x.satuan)].filter(Boolean).join(' ');
  const material = (x) => {
    const m = Array.isArray(x.material) ? x.material : [];
    return m.length ? ' (' + m.map((y) => [teks(y.nama), angkaPendek(y.jumlah), teks(y.satuan), teks(y.kepemilikan)].filter(Boolean).join(' ')).join(', ') + ')' : '';
  };
  if (pk.length > 1 || (pk.length === 1 && material(pk[0]))) return pk.map((x) => satu(x) + material(x)).join(', ');
  const ada = (v) => v !== null && v !== undefined && v !== '';
  return [teks(p.pekerjaan), teks(p.pekerjaanLainnya) && '(' + teks(p.pekerjaanLainnya) + ')',
    ada(p.diameter) && 'Ø ' + p.diameter + ' cm', teks(p.satuan) && !ada(p.diameter) && angkaPendek(p.jumlah) + ' ' + teks(p.satuan)]
    .filter(Boolean).join(' ');
}

/** ISO waktu server -> '27 Okt 2026 14.05' WIB ('' = kosong). */
export function waktuWo(iso) {
  const d = new Date(teks(iso));
  if (!teks(iso) || Number.isNaN(d.getTime())) return teks(iso);
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Koordinat 'lat, lng' valid -> URL Google Maps, selain itu ''. */
export function urlPeta(k) {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(teks(k));
  if (!m || Math.abs(m[1]) > 90 || Math.abs(m[2]) > 180) return '';
  return 'https://www.google.com/maps?q=' + m[1] + ',' + m[2];
}

/* ===== foto dari server (getFotoWoAdmin, Drive privat) ===== */
const tembolokFoto = { KECIL: new Map(), PENUH: new Map() };
const BATAS_FOTO = { KECIL: 120, PENUH: 12 };

/**
 * f = { temuanId, slot, tlId? }. Hasil Promise data URL. Gagal tidak disimpan (bisa dicoba lagi).
 * v1.0.47: foto KECIL disimpan di IndexedDB (fotoLokal.js) dan dibaca dari sana dulu: offline tetap tampil.
 */
export function muatFotoWo(api, f, ukuran = 'KECIL', aksi = 'getFotoWoAdmin') {   // v1.0.50 aksi: getFotoPetaTemuan (menu peta)
  const peta = tembolokFoto[ukuran];
  const k = [f.temuanId, f.tlId || '', f.slot].join('|');
  if (!peta.has(k)) {
    const data = { temuanId: f.temuanId, slot: f.slot, ukuran, ...(f.tlId ? { tlId: f.tlId } : {}) };
    const server = () => api(aksi, data, { batasMs: ukuran === 'PENUH' ? 90000 : 60000 })
      .then((j) => 'data:' + (j.data.mime || 'image/jpeg') + ';base64,' + j.data.data);
    const janji = ukuran !== 'KECIL' ? server()
      : bacaFotoLokal('wo|' + k).catch(() => null).then((ada) => ada || server().then((url) => { simpanFotoLokal('wo|' + k, url).catch(() => {}); return url; }));
    janji.catch(() => { if (peta.get(k) === janji) peta.delete(k); });
    if (peta.size >= BATAS_FOTO[ukuran]) peta.delete(peta.keys().next().value);
    peta.set(k, janji);
  }
  return peta.get(k);
}

/**
 * v1.0.48 teks WA temuan, format v1 (SIE-Teknik _stShareWaTemuan). fotoTerlampir = foto temuan ikut dibagikan sebagai
 * gambar (foto v2 di Drive privat, link tidak bisa dibuka penerima); selain itu link foto seperti v1. Murni (diuji).
 */
export function teksWaTemuan(t, { fotoTerlampir = false } = {}) {
  const v = (x) => teks(x) || '-';
  const ko = teks(t.koordinat);
  const lokasi = ko ? 'https://www.google.com/maps?q=' + ko.replace(/\s+/g, '') : '-';
  const foto = fotoTerlampir ? 'terlampir' : v(t.foto && t.foto.TEMUAN);
  return '*Temuan Inspeksi*\n\n'
    + 'Kode Temuan : *' + v(t.kodeTemuan) + '*\n'
    + 'Penyulang : ' + v(t.penyulang) + '\n'
    + 'Section : ' + v(t.section) + '\n'
    + 'Segmen : ' + v(t.segmen) + '\n'
    + 'Temuan : ' + v(t.jenisTemuan) + '\n\n'
    + 'Lokasi : ' + lokasi + '\n\n'
    + 'Foto Temuan : ' + foto + '\n\n'
    + '*Segera Tindak Lanjut🔥🔥🔥*';
}
