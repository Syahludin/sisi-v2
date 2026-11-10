/**
 * v1.0.58: simpanan daftar WO lengkap di browser (IndexedDB `sisi-web-wo` / `wo`), per kunci akun + endpoint + rentang
 * tanggal. Jawaban WO besar (ratusan temuan + pekerjaan) melewati batas localStorage, jadi dipisah dari tembolok.js.
 * Dibuang saat keluar / sesi habis (hapusSimpananWo). IndexedDB tidak ada / gagal = memori saja (tetap berfungsi
 * selama halaman terbuka). sudahPenuh = unduhan penuh sudah dilakukan di peluncuran ini (hilang saat halaman dimuat ulang).
 */
const DB = 'sisi-web-wo';
const TOKO = 'wo';

const memori = new Map();
const penuh = new Set();

let buka = null;
function db() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (!buka) {
    buka = new Promise((ok) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore(TOKO, { keyPath: 'k' }); };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok(null);
        r.onblocked = () => ok(null);
      } catch { ok(null); }
    });
  }
  return buka;
}

function jalan(mode, kerja) {
  return db().then((d) => (!d ? null : new Promise((ok) => {
    try {
      const tx = d.transaction(TOKO, mode);
      const hasil = kerja(tx.objectStore(TOKO));
      tx.oncomplete = () => ok(hasil && 'result' in hasil ? hasil.result : null);
      tx.onerror = () => ok(null);
      tx.onabort = () => ok(null);
    } catch { ok(null); }
  })));
}

/** { data, waktu (ms) } atau null. */
export async function bacaSimpananWo(kunci) {
  if (memori.has(kunci)) return memori.get(kunci);
  const v = await jalan('readonly', (s) => s.get(kunci));
  if (!v || !v.data || typeof v.data !== 'object') return null;
  const hasil = { data: v.data, waktu: Number(v.waktu) || 0 };
  memori.set(kunci, hasil);
  return hasil;
}

/** Simpan; gagal menulis ke IndexedDB tidak melempar (memori tetap terisi). */
export async function tulisSimpananWo(kunci, data) {
  const v = { data, waktu: Date.now() };
  memori.set(kunci, v);
  await jalan('readwrite', (s) => { s.put({ k: kunci, ...v }); return null; });
}

/** Semua simpanan akun dibuang (keluar / sesi habis). */
export async function hapusSimpananWo() {
  memori.clear();
  penuh.clear();
  await jalan('readwrite', (s) => s.clear());
}

export const sudahPenuhWo = (kunci) => penuh.has(kunci);
export const tandaiPenuhWo = (kunci) => { penuh.add(kunci); };

/** Pasangan fungsi yang dipakai sinkronWo (tes menyuntik pengganti). */
export const simpananBawaan = { baca: bacaSimpananWo, tulis: tulisSimpananWo, sudahPenuh: sudahPenuhWo, tandaiPenuh: tandaiPenuhWo };
