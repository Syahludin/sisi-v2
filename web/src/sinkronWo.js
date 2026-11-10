/**
 * v1.0.58: daftar WO dari data lokal + sinkron selisih (rancangan docs/superpowers/specs/2026-11-04-penerusan-wo-offline-design.md).
 *   1. Data lokal (bila ada) langsung diberikan lewat onLokal.
 *   2. Pembukaan pertama di peluncuran ini = unduhan penuh (status SEMUA); sesudahnya hanya selisih (sejak = kursor terakhir).
 *   3. Simpanan ditulis hanya sesudah panggilan sukses. Server tidak terjangkau (jaringan / waktu habis) dengan data lokal =
 *      data lokal kembali tanpa galat (onGagal dipanggil); penolakan server (mis. AKSES_DITOLAK) dan tanpa data lokal = galat dilempar.
 * Filter status dilakukan di perangkat (saringStatusWo), jadi permintaan selalu status SEMUA. param = { dari?, sampai? }.
 */
import { gabungSelisihWo } from './selisihWo.js';
import { simpananBawaan } from './simpananWo.js';

/** Server tidak terjangkau / tidak menjawab dengan benar (bukan penolakan server seperti AKSES_DITOLAK). */
const TAK_TERJANGKAU = new Set(['JARINGAN', 'WAKTU_HABIS', 'JAWABAN_TIDAK_VALID', 'KESALAHAN_SERVER']);

export async function sinkronWo({ action, param = {}, kunci, api, simpanan = simpananBawaan, onLokal, onGagal, paksaPenuh = false }) {
  const lokal = await simpanan.baca(kunci);
  if (lokal && onLokal) onLokal(lokal.data, lokal.waktu);
  const selisih = !!lokal && !paksaPenuh && simpanan.sudahPenuh(kunci) && !!lokal.data.kursor;
  try {
    let data;
    if (selisih) {
      const j = await api(action, { ...param, status: 'SEMUA', sejak: lokal.data.kursor }, { langsung: true, tanpaTembolok: true });
      data = gabungSelisihWo(lokal.data, j.data);
    } else {
      const j = await api(action, { ...param, status: 'SEMUA' }, { ...(paksaPenuh ? { langsung: true } : {}), tanpaTembolok: true });
      data = j.data;
      simpanan.tandaiPenuh(kunci);
    }
    await simpanan.tulis(kunci, data);
    return data;
  } catch (e) {
    if (lokal && (!e || !e.kode || TAK_TERJANGKAU.has(e.kode))) { if (onGagal) onGagal(e); return lokal.data; }
    throw e;
  }
}
