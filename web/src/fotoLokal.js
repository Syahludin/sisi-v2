/**
 * v1.0.47: simpanan foto kecil (thumbnail) di browser, IndexedDB `sisi-web` / `foto`, supaya halaman yang dibuka offline
 * tetap menampilkan foto yang pernah dilihat. Kunci bebas (mis. temuanId|tlId|slot), nilai = data URL.
 * Dibuang saat keluar / sesi habis (kosongkanTembolok(true)). Semua gagal (private mode, kuota) = diam, seperti tanpa simpanan.
 */
const DB = 'sisi-web';
const TOKO = 'foto';
const MAKS = 400;   // foto terlama dibuang lebih dulu

let buka = null;
function db() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  if (!buka) {
    buka = new Promise((ok) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { r.result.createObjectStore(TOKO, { keyPath: 'k' }).createIndex('waktu', 'waktu'); };
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

/** Data URL tersimpan atau null. */
export async function bacaFotoLokal(k) {
  const v = await jalan('readonly', (s) => s.get(k));
  return v && typeof v.url === 'string' ? v.url : null;
}

/** Simpan; lewat MAKS = yang terlama dibuang. */
export async function simpanFotoLokal(k, url) {
  await jalan('readwrite', (s) => {
    s.put({ k, url, waktu: Date.now() });
    const n = s.count();
    n.onsuccess = () => {
      let lebih = n.result - MAKS;
      if (lebih <= 0) return;
      s.index('waktu').openCursor().onsuccess = (e) => {
        const c = e.target.result;
        if (!c || lebih-- <= 0) return;
        c.delete();
        c.continue();
      };
    };
    return null;
  });
}

export async function hapusSemuaFotoLokal() {
  await jalan('readwrite', (s) => s.clear());
}
