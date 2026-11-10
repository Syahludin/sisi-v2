/**
 * Panggilan ke backend Apps Script (doPost yang sama dengan HP), ditandai platform 'WEB'.
 * Content-Type text/plain = permintaan "sederhana" (tanpa preflight CORS, yang tidak dilayani Apps Script);
 * jawaban Apps Script membawa Access-Control-Allow-Origin: *.
 * Hasil = amplop jawaban { ok, data, versi, waktu }. Gagal = GalatApi dengan kode server
 * (LOGIN_GAGAL, SESI_KEDALUWARSA, ...) atau kode lokal JARINGAN / WAKTU_HABIS / JAWABAN_TIDAK_VALID / CONFIG_KOSONG.
 */
export class GalatApi extends Error {
  constructor(kode, kolom) {
    super(kode);
    this.name = 'GalatApi';
    this.kode = kode;
    this.kolom = kolom || '';
  }
}

// v1.0.38: 60 dtk (dulu 30), sama dengan HP. Apps Script yang baru bangun / menunggu lock kiriman lain bisa >30 dtk
// walau tetap selesai; memutus di 30 dtk membuang kerja server dan memunculkan "Server terlalu lama menjawab".
export const BATAS_WAKTU_MS = 60000;

/** batasMs: endpoint sangat berat (PDF, file, sinkron) boleh lebih lama dari batas bawaan. */
export async function panggil(apiUrl, action, { token, data, batasMs = BATAS_WAKTU_MS } = {}, fetchFn = globalThis.fetch) {
  if (!apiUrl) throw new GalatApi('CONFIG_KOSONG');
  const henti = new AbortController();
  const jam = setTimeout(() => henti.abort(), batasMs);
  let res;
  try {
    res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, platform: 'WEB', token: token || undefined, data: data || {} }),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      signal: henti.signal,
    });
  } catch (e) {
    throw new GalatApi(e && e.name === 'AbortError' ? 'WAKTU_HABIS' : 'JARINGAN');
  } finally {
    clearTimeout(jam);
  }
  if (!res || !res.ok) throw new GalatApi('JARINGAN');
  let j;
  try {
    j = await res.json();
  } catch {
    throw new GalatApi('JAWABAN_TIDAK_VALID');
  }
  if (!j || typeof j !== 'object') throw new GalatApi('JAWABAN_TIDAK_VALID');
  if (j.ok !== true) throw new GalatApi(typeof j.kode === 'string' && j.kode ? j.kode : 'KESALAHAN_SERVER', j.kolom);
  return j;
}
