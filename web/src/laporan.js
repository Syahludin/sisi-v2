/**
 * Laporan UP3 / UIW (menu OPS_LAP_UP3 / OPS_LAP_UIW), logika murni tanpa React. Mirror dari HP
 * (mobile/lib/features/operasi/laporan_up3_repository.dart). Teks WA selalu dibuat server; website hanya input
 * C4A (+ Cuaca untuk UIW). Simpan hanya ADMIN / SUPER untuk hari ini (bisaUbah dari server, server yang menegakkan).
 */
import { GalatApi } from './api.js';

export const MAKS_C4A = 20;
export const KMS_PER_TIANG = 0.05;
export const PRESET_CUACA = ['Cerah', 'Cerah Berawan', 'Berawan', 'Mendung', 'Hujan Ringan', 'Hujan Lebat'];
/** Tanggal paling awal di pemilih tanggal (sama dengan HP). */
export const TANGGAL_AWAL = '2026-01-01';
/** Laporan menyusun data ROW + Hartek + Inspeksi: bisa lama, batas sama dengan HP. */
export const BATAS_LAPORAN_MS = 60000;

export const endpointMuat = (bagian) => (bagian === 'UP3' ? 'getLaporanUp3' : 'getLaporanUiw');
export const endpointSimpan = (bagian) => (bagian === 'UP3' ? 'simpanLaporanUp3' : 'simpanLaporanUiw');

/** 4.6 -> "4,6", 4 -> "4", 4.355 -> "4,36" (sama dengan angkaKoma_ server). */
export function angkaKoma(v) {
  const n = Math.round(v * 100) / 100;
  return String(n).replace('.', ',');
}

/** "4,6" / "4.6" -> 4.6; tidak valid (maks 3 digit + 2 desimal) = null. */
export function bacaKms(teks) {
  const t = String(teks ?? '').trim().replace(',', '.');
  return /^\d{1,3}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

/** Bilangan bulat dalam [min, max] dari teks input; tidak valid = null. */
export function bacaBulat(teks, min, max) {
  const t = String(teks ?? '').trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** Panjang kmS UIW = tiang x 0,05, 2 desimal gaya Indonesia (server yang menghitung nilai simpannya). */
export const kmsTeks = (tiang) => (tiang * KMS_PER_TIANG).toFixed(2).replace('.', ',');

const teks = (v) => (v == null ? '' : String(v));
const angka = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);

/**
 * Baris C4A dari server -> baris form (semua isian teks, siap diedit di tabel). baru = belum pernah tersimpan
 * (penyulang / section masih bisa dipilih; yang sudah tersimpan dikunci server: KOLOM_TERKUNCI).
 */
export function barisForm(bagian, c) {
  if (bagian === 'UP3') {
    return { id: c.id, baru: false, penyulang: teks(c.penyulang), realisasiKms: c.realisasiKms == null ? '' : angkaKoma(Number(c.realisasiKms)),
             temuan: teks(c.temuan), tindakLanjut: teks(c.tindakLanjut), eksekusi: teks(c.eksekusi), keterangan: teks(c.keterangan) };
  }
  return { id: c.id, baru: false, sectionId: teks(c.sectionId), penyulang: teks(c.penyulang), section: teks(c.section),
           jumlahTiang: String(angka(c.jumlahTiang) || ''), temuanPeralatan: String(angka(c.temuanPeralatan)),
           temuanRow: String(angka(c.temuanRow)), eksekusi: String(angka(c.eksekusi)), keterangan: teks(c.keterangan) };
}

export function barisBaru(bagian, id = globalThis.crypto.randomUUID()) {
  if (bagian === 'UP3') return { id, baru: true, penyulang: '', realisasiKms: '', temuan: '', tindakLanjut: '', eksekusi: '', keterangan: '' };
  return { id, baru: true, sectionId: '', penyulang: '', section: '', jumlahTiang: '', temuanPeralatan: '0', temuanRow: '0', eksekusi: '0', keterangan: '' };
}

const BATAS_TEKS_UP3 = { temuan: 200, tindakLanjut: 200, eksekusi: 100, keterangan: 200 };

/**
 * Galat per kolom satu baris ({ kolom: pesan }), kosong = valid. dipakai = penyulang (UP3, huruf kecil) /
 * sectionId (UIW) yang sudah dipakai baris LAIN, supaya ganda ketahuan sebelum dikirim.
 */
export function galatBaris(bagian, b, dipakai = new Set()) {
  const g = {};
  if (bagian === 'UP3') {
    if (!b.penyulang) g.penyulang = 'Pilih penyulang';
    else if (dipakai.has(b.penyulang.toLowerCase())) g.penyulang = 'Penyulang sudah ada di baris lain';
    if (bacaKms(b.realisasiKms) === null) g.realisasiKms = 'Angka, maks 2 desimal (mis. 4,6)';
    for (const [k, maks] of Object.entries(BATAS_TEKS_UP3)) if (b[k].trim().length > maks) g[k] = 'Maks ' + maks + ' huruf';
    return g;
  }
  if (!b.sectionId) g.sectionId = 'Pilih section';
  else if (dipakai.has(b.sectionId)) g.sectionId = 'Section sudah ada di baris lain';
  if (bacaBulat(b.jumlahTiang, 1, 2000) === null) g.jumlahTiang = 'Bilangan bulat 1-2000';
  for (const k of ['temuanPeralatan', 'temuanRow', 'eksekusi']) if (bacaBulat(b[k], 0, 999) === null) g[k] = 'Bilangan bulat 0-999';
  if (b.keterangan.trim().length > 200) g.keterangan = 'Maks 200 huruf';
  return g;
}

/** Galat semua baris: Map id -> { kolom: pesan } (hanya baris yang salah). */
export function galatDaftar(bagian, daftar) {
  const kunci = (b) => (bagian === 'UP3' ? b.penyulang.toLowerCase() : b.sectionId);
  const hasil = new Map();
  daftar.forEach((b, i) => {
    const dipakai = new Set(daftar.filter((_, j) => j !== i).map(kunci).filter(Boolean));
    const g = galatBaris(bagian, b, dipakai);
    if (Object.keys(g).length) hasil.set(b.id, g);
  });
  return hasil;
}

/** Baris form -> C4A yang diterima server (hanya field skema; nama penyulang/section UIW diambil server dari master). */
export function keServer(bagian, b) {
  if (bagian === 'UP3') {
    const o = { id: b.id, penyulang: b.penyulang, realisasiKms: bacaKms(b.realisasiKms) };
    for (const k of ['temuan', 'tindakLanjut', 'eksekusi', 'keterangan']) if (b[k].trim()) o[k] = b[k].trim();
    return o;
  }
  const o = { id: b.id, sectionId: b.sectionId, jumlahTiang: Number(b.jumlahTiang), temuanPeralatan: Number(b.temuanPeralatan),
              temuanRow: Number(b.temuanRow), eksekusi: Number(b.eksekusi) };
  if (b.keterangan.trim()) o.keterangan = b.keterangan.trim();
  return o;
}

/** Payload simpan, dibekukan sekali supaya kirim ulang memakai payload yang SAMA persis (server aman diulang). */
export function payloadSimpan(bagian, { tanggal, revision, cuaca, daftar }) {
  const d = { tanggal, revision, c4a: daftar.map((b) => keServer(bagian, b)) };
  if (bagian === 'UIW' && cuaca.trim()) d.cuaca = cuaca.trim();
  return d;
}

/** Bentuk pembanding satu C4A (kunci urut, teks dirapikan) supaya isi server bisa dibandingkan dengan yang dikirim. */
function sidik(bagian, c) {
  const m = { ...c };
  if (bagian === 'UP3') {
    m.penyulang = String(m.penyulang ?? '').trim().toLowerCase();
    m.realisasiKms = Math.round((m.realisasiKms ?? 0) * 100);
  }
  return JSON.stringify(Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]])));
}

/** Isi laporan di server (respons muat) sama dengan payload yang dikirim? Dipakai setelah KONFLIK_REVISION. */
export function isiSama(bagian, kirim, server) {
  if (bagian === 'UIW' && String(kirim.cuaca ?? '') !== String(server.cuaca ?? '')) return false;
  const dariServer = (Array.isArray(server.c4a) ? server.c4a : []).map((c) => sidik(bagian, keServer(bagian, barisForm(bagian, c)))).sort();
  const dikirim = kirim.c4a.map((c) => sidik(bagian, c)).sort();
  return JSON.stringify(dariServer) === JSON.stringify(dikirim);
}

/** Gagal jaringan / timeout / server sibuk / kesalahan server = kirim ulang aman. */
export function bolehUlang(e) {
  const kode = e instanceof GalatApi ? e.kode : '';
  return !kode || ['JARINGAN', 'WAKTU_HABIS', 'JAWABAN_TIDAK_VALID', 'SERVER_SIBUK', 'KESALAHAN_SERVER'].includes(kode);
}

const tundaAsli = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Simpan dengan pemulihan (sama dengan HP v0.62.9). Server menulis C4A dulu lalu baris harian + revision terakhir:
 * - gagal jaringan / server = kirim ulang payload + revision yang SAMA (maks `ulang` kali, jeda bertambah);
 * - KONFLIK_REVISION setelah percobaan yang gagal = mungkin simpan sebelumnya sebenarnya masuk (jawaban hilang):
 *   muat ulang; isi server sama = berhasil (masih tertunda = dikunci sekali lagi dengan revision server).
 *   Isi beda = KONFLIK_REVISION diteruskan (admin lain mengubah).
 * kirim(action, data) = panggilan backend (token + batas waktu diurus pemanggil).
 */
export async function simpanPulih(kirim, bagian, data, { ulang = 2, tunda = tundaAsli } = {}) {
  let gagalSebelumnya = false;
  for (let i = 0; ; ) {
    try {
      return (await kirim(endpointSimpan(bagian), data)).data;
    } catch (e) {
      if (e instanceof GalatApi && e.kode === 'KONFLIK_REVISION' && gagalSebelumnya) {
        const server = (await kirim(endpointMuat(bagian), { tanggal: data.tanggal })).data;
        if (!isiSama(bagian, data, server)) throw e;
        if (server.tertunda !== true) return server;
        return (await kirim(endpointSimpan(bagian), { ...data, revision: Number(server.revision) || 0 })).data;
      }
      if (!bolehUlang(e) || i >= ulang) throw e;
      gagalSebelumnya = true;
      i++;
      await tunda(2000 * i);
    }
  }
}

/** Penyulang aktif unik urut abjad, dari master modul jaringan (getMaster). */
export function daftarPenyulang(jaringan) {
  return [...new Set(jaringan.filter((j) => j.aktif).map((j) => j.penyulang))].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Urutan section = kolom urutan db_Jaringan (kosong/0 di belakang), lalu baris sheet, lalu nama. Sama dengan HP. */
function bandingSection(a, b) {
  const k = (j, f) => (j[f] > 0 ? j[f] : Infinity);
  return (k(a, 'urutan') - k(b, 'urutan')) || (k(a, 'baris') - k(b, 'baris')) || String(a.section).localeCompare(String(b.section));
}

/** Section aktif milik satu penyulang: [{ id, nama }]. */
export function daftarSection(jaringan, penyulang) {
  const p = String(penyulang).toLowerCase();
  return jaringan.filter((j) => j.aktif && String(j.penyulang).toLowerCase() === p).sort(bandingSection)
    .map((j) => ({ id: j.id, nama: j.section }));
}
