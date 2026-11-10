/**
 * v1.0.50 menu Temuan Inspeksi (OPS_PETA_TEMUAN): peta sebaran temuan, port v1 Temuan-Inspeksi.html (Leaflet + OSM / Esri
 * satelit, titik berwarna per status, legenda). Logika murni (diuji); peta di pages/PetaTemuan.jsx.
 * Data = getPetaTemuan (isi sama getWoAdmin, status SEMUA, maks 500 temuan terbaru per rentang tanggal).
 */
import { cocokCari, statusWo } from './penerusanWo.js';

export const MENU_PETA = 'OPS_PETA_TEMUAN';

/** Status peta = status WO, label + warna sama legenda v1 (Belum Ada Tim / Penugasan Tim / Progress Pekerjaan / Selesai). */
export const STATUS_PETA = [
  { kode: 'BELUM', wo: '', label: 'Belum Ada Tim', warna: '#a8433f' },
  { kode: 'TERKIRIM', wo: 'TERKIRIM', label: 'Penugasan Tim', warna: '#c9861f' },
  { kode: 'DIKERJAKAN', wo: 'DIKERJAKAN', label: 'Progress Pekerjaan', warna: '#1d6a73' },
  { kode: 'SELESAI', wo: 'SELESAI', label: 'Selesai', warna: '#3a6f1f' },
];

/** Info status peta satu temuan (status WO tak dikenal = Belum Ada Tim). */
export const statusPeta = (t) => STATUS_PETA.find((s) => s.wo === statusWo(t)) || STATUS_PETA[0];

/** Koordinat temuan "lat, lng" -> [lat, lng], null = kosong / rusak / di luar bumi / titik 0,0. */
export function koordinatTemuan(t) {
  const m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(t?.koordinat ?? ''));
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

/** Filter peta (di browser). status = kode STATUS_PETA ('' = semua). */
// penyulang / jenis: string atau array (v1.0.50 pilihan ganda); kosong = semua
const cocokSalah = (v, saring) => {
  const d = Array.isArray(saring) ? saring : saring ? [saring] : [];
  return !d.length || d.includes(String(v || '').trim());
};
export const saringPeta = (daftar, { status = '', penyulang = '', jenis = '', cari = '' } = {}) => (daftar || []).filter((t) =>
  (!status || statusPeta(t).kode === status) && cocokSalah(t.penyulang, penyulang)
  && cocokSalah(t.jenisTemuan, jenis) && cocokCari(t, cari));

/** Jumlah per status + titik tanpa koordinat. */
export function ringkasPeta(daftar) {
  const per = Object.fromEntries(STATUS_PETA.map((s) => [s.kode, 0]));
  let tanpaKoordinat = 0;
  (daftar || []).forEach((t) => { per[statusPeta(t).kode]++; if (!koordinatTemuan(t)) tanpaKoordinat++; });
  return { total: (daftar || []).length, per, tanpaKoordinat };
}

/** Rentang bawaan v1: tanggal 1 bulan ini s.d. hari ini. */
export const rentangAwalPeta = (hariIni) => ({ dari: hariIni.slice(0, 8) + '01', sampai: hariIni });

/** Latar peta gratis (tanpa API key), sama v1. */
export const LATAR_PETA = {
  peta: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19, attribution: '&copy; OpenStreetMap' },
  satelit: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics',
  },
};
/** Pusat awal: ULP Toboali. */
export const PUSAT_PETA = [-3.0, 106.45];

export const TIER_BELUM = 'Belum dipetakan';
export const satuanTemuan = (nama) => {
  const n = String(nama || '').toLowerCase();
  return /tebang/.test(n) ? 'Btg' : /pohon|rabas|pangkas|vegetasi/.test(n) ? 'Gwg' : 'Titik';
};
/** Urutan tier: Tier 1, Tier 2, ... (angka), lalu lainnya abjad, 'Belum dipetakan' paling akhir. */
const urutTier = (a, b) => {
  const n = (t) => (t === TIER_BELUM ? 1e9 : Number((/^Tier\s*(\d+)$/i.exec(t) || [])[1]) || 1e8);
  return n(a) - n(b) || a.localeCompare(b);
};

/**
 * v1.0.51 Rincian Jenis Temuan (port v1 rekap temuan per section). baris = getRekapJenisTemuan.baris
 * [{ penyulang, section, jenisTemuan, tier, jumlah }]. penyulang / jenis = array (kosong = semua).
 * Review 8 Nov 2026 (desain ulang): kolom dikelompokkan per penyulang (kunci penyulang|section: section bernama sama di dua
 * penyulang tidak lagi digabung), baris dikelompokkan per tier (Belum dipetakan paling akhir).
 * -> { kolom: [{ kunci, penyulang, section }], grupPenyulang: [{ penyulang, jumlahKolom, total }],
 *      rows: [{ jenisTemuan, tier, satuan, volume, perKolom: { kunci: n } }], perTier: [{ tier, jenis, volume }], total, maks }.
 */
export function rekapJenisTemuan(baris, { penyulang = [], jenis = [], cocok = null } = {}) {   // cocok(b) = saring tambahan (Checkpoint)
  const peny = new Set(penyulang.map((p) => String(p).toLowerCase())), jen = new Set(jenis), kelompok = new Map(), kolom = new Map();
  let total = 0;
  (baris || []).forEach((b) => {
    if ((peny.size && !peny.has(String(b.penyulang).toLowerCase())) || (jen.size && !jen.has(b.jenisTemuan)) || (cocok && !cocok(b))) return;
    const p = String(b.penyulang || '').trim(), s = String(b.section || '').trim(), kunci = p.toLowerCase() + '|' + s.toLowerCase();
    if (!kolom.has(kunci)) kolom.set(kunci, { kunci, penyulang: p, section: s, total: 0 });
    kolom.get(kunci).total += b.jumlah;
    const k = b.jenisTemuan.toLowerCase();
    if (!kelompok.has(k)) kelompok.set(k, { jenisTemuan: b.jenisTemuan, tier: b.tier || TIER_BELUM, satuan: satuanTemuan(b.jenisTemuan), volume: 0, perKolom: {} });
    const r = kelompok.get(k);
    r.volume += b.jumlah; r.perKolom[kunci] = (r.perKolom[kunci] || 0) + b.jumlah; total += b.jumlah;
  });
  const kol = [...kolom.values()].sort((a, b) => a.penyulang.localeCompare(b.penyulang, 'id', { numeric: true }) || a.section.localeCompare(b.section, 'id', { numeric: true }));
  const grup = [];
  kol.forEach((c) => {
    const g = grup[grup.length - 1];
    if (g && g.penyulang.toLowerCase() === c.penyulang.toLowerCase()) { g.jumlahKolom += 1; g.total += c.total; } else grup.push({ penyulang: c.penyulang, jumlahKolom: 1, total: c.total });
  });
  const rows = [...kelompok.values()].sort((a, b) => urutTier(a.tier, b.tier) || a.jenisTemuan.localeCompare(b.jenisTemuan));
  const perTier = [];
  rows.forEach((x) => {
    const t = perTier[perTier.length - 1];
    if (t && t.tier === x.tier) { t.jenis += 1; t.volume += x.volume; } else perTier.push({ tier: x.tier, jenis: 1, volume: x.volume });
  });
  const maks = rows.reduce((m, x) => Math.max(m, ...Object.values(x.perKolom)), 0);
  return { kolom: kol.map(({ kunci, penyulang: p, section }) => ({ kunci, penyulang: p, section })), grupPenyulang: grup, rows, perTier, total, maks };
}
