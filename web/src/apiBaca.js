/**
 * v1.0.38 API baca MySQL (Hostinger) untuk aksi baca berat (docs/rancangan-hybrid-mysql.md). Google Sheet tetap sumber
 * utama: kalau API ini gagal / belum diatur, pemanggil membaca lewat Apps Script seperti biasa.
 * Tiket bertanda dari Apps Script (getTiketApi, berlaku 15 menit) disimpan di memori saja dan diperbarui sebelum habis.
 */
import { GalatApi } from './api.js';

/** JSON kanonik (kunci objek diurutkan, rekursif). Sama persis dengan backend 93_Mysql.js kanonMysql_. */
export function kanon(v) {
  const urut = (x) => (Array.isArray(x) ? x.map(urut)
    : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = urut(x[k]); return o; }, {}) : x);
  return JSON.stringify(urut(v === undefined ? {} : v));
}

/**
 * Aksi yang bisa dibaca dari API baca: gangguan.php (salinan tabel) atau jawaban.php (v1.0.38 jawaban jadi Pengukuran
 * Gardu, disimpan Apps Script). Nilai = (data) -> boleh. getMaster hanya untuk modul gardu.
 */
const AKSI_BACA = {
  getHistoriGangguan: () => true,
  getRiwayatGardu: () => true,
  getHiGardu: () => true,
  getMaster: (d) => ['{"modul":["gardu"]}', '{"modul":["jaringan"]}'].includes(kanon(d)),
  getPetaTemuan: () => true,   // v1.0.50 Temuan Inspeksi
  getWoAdmin: () => true,
  // Review 8 Nov 2026: menu admin lain (jawaban jadi; gagal / BELUM_ADA = Apps Script seperti biasa)
  getRekapJenisTemuan: () => true,
  getCheckpoint: () => true,
  getCoverGardu: () => true,
  getDataAset: () => true,
  getJadwalPadam: () => true,
  getMasterJadwalPadam: () => true,
  getApprovalP0: () => true,
  getDaftarBaGardu: () => true,
  getBaGardu: () => true,
  getGudangStok: () => true,
  getSelisihGudang: () => true,
  getPemakaianGudang: () => true,
  getIzinMaterial: () => true,
  getWorkplanUp3: () => true,
  getGaspolUp3: () => true,
};
export const bolehBacaMysql = (action, data) => !!AKSI_BACA[action] && AKSI_BACA[action](data || {});

const SISA_MS = 60000;   // tiket diperbarui bila sisa < 1 menit
let tiket = null;        // { token (sesi), tiket, sampaiMs }
let diminta = null;      // { token, janji }: beberapa baca bersamaan = SATU getTiketApi

export function lupakanTiket() { tiket = null; diminta = null; }

/** Simpan tiket { tiket, sampai } yang sudah ada (mis. ikut jawaban cekSesi saat website dibuka). Salah bentuk = diabaikan. */
export function simpanTiket(token, d) {
  const sampaiMs = Date.parse(d && d.sampai);
  if (!d || typeof d.tiket !== 'string' || !Number.isFinite(sampaiMs)) return false;
  tiket = { token, tiket: d.tiket, sampaiMs };
  return true;
}

/** Tiket untuk token sesi ini; minta baru lewat ambilTiket (getTiketApi) bila belum ada / hampir habis. */
export async function tiketBaca(token, ambilTiket, sekarang = Date.now()) {
  if (tiket && tiket.token === token && tiket.sampaiMs - sekarang > SISA_MS) return tiket.tiket;
  if (!diminta || diminta.token !== token) {
    const janji = (async () => {
      const d = await ambilTiket();
      if (!simpanTiket(token, d)) throw new GalatApi('JAWABAN_TIDAK_VALID');
      return d.tiket;
    })();
    diminta = { token, janji };
    janji.then(() => { if (diminta && diminta.janji === janji) diminta = null; }, () => { if (diminta && diminta.janji === janji) diminta = null; });
  }
  return diminta.janji;
}

/** URL GET aksi baca (data = parameter query, nilai kosong tidak dikirim). */
export function urlBaca(dasar, action, data = {}) {
  if (action !== 'getHistoriGangguan') return dasar + '/jawaban.php?aksi=' + encodeURIComponent(action) + '&data=' + encodeURIComponent(kanon(data));
  const q = new URLSearchParams();
  Object.keys(data || {}).sort().forEach((k) => { const v = data[k]; if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
  const s = q.toString();
  return dasar + '/gangguan.php' + (s ? '?' + s : '');
}

/** Baca lewat API PHP. Hasil amplop sama dengan Apps Script ({ ok, data, waktu }). Gagal = GalatApi. */
export async function bacaMysql(dasar, action, data, tiketTeks, { batasMs = 30000 } = {}, fetchFn = globalThis.fetch) {
  const henti = new AbortController();
  const jam = setTimeout(() => henti.abort(), batasMs);
  let res;
  try {
    res = await fetchFn(urlBaca(dasar, action, data), {
      method: 'GET', headers: { 'X-SiSi-Tiket': tiketTeks }, cache: 'no-store', credentials: 'omit', signal: henti.signal,
    });
  } catch (e) {
    throw new GalatApi(e && e.name === 'AbortError' ? 'WAKTU_HABIS' : 'JARINGAN');
  } finally {
    clearTimeout(jam);
  }
  let j = null;
  try { j = await res.json(); } catch { j = null; }
  if (!j || typeof j !== 'object') throw new GalatApi(res && res.ok ? 'JAWABAN_TIDAK_VALID' : 'JARINGAN');
  if (j.ok !== true || !j.data) throw new GalatApi(typeof j.kode === 'string' && j.kode ? j.kode : 'KESALAHAN_SERVER');
  // belum pernah disinkron (tabel kosong) = jangan tampilkan kosong, baca dari Apps Script
  if (action === 'getHistoriGangguan' && !j.data.sinkron) throw new GalatApi('MYSQL_BELUM_SINKRON');
  return j;
}
