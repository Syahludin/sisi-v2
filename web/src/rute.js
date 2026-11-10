import { useEffect, useState } from 'react';

/**
 * v1.0.36: alamat per halaman di bawah folder build (BASE = import.meta.env.BASE_URL, mis. '/sisi/').
 * /sisi/<halaman>/<id>?<query>  ->  { halaman, id, query }. Tanpa library: History API + event 'sisi:rute'.
 */
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

/** Path + search (relatif dokumen) -> { halaman, id, query: {k: v} }. Murni (diuji). */
export function bacaRute(pathname, search = '', base = BASE) {
  let p = String(pathname || '');
  if (p.startsWith(base)) p = p.slice(base.length);
  else if (p.startsWith(base.replace(/\/$/, ''))) p = p.slice(base.length - 1);
  const bagian = p.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const query = {};
  new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
  return { halaman: bagian[0] || '', id: bagian[1] || '', query };
}

/** { halaman, id, query } -> alamat lengkap. Query kosong / null dibuang. Murni (diuji). */
export function alamatRute({ halaman = '', id = '', query = {} } = {}, base = BASE) {
  let a = base + (halaman ? encodeURIComponent(halaman) + (id ? '/' + encodeURIComponent(id) : '') : '');
  const q = new URLSearchParams();
  Object.keys(query).sort().forEach((k) => { const v = query[k]; if (v !== undefined && v !== null && v !== '') q.set(k, String(v)); });
  const s = q.toString();
  return s ? a + '?' + s : a;
}

function sekarang() { return bacaRute(window.location.pathname, window.location.search); }

/** Pindah alamat. ganti = replaceState (mis. filter berubah, tidak menambah riwayat Back). */
export function navigasi(rute, { ganti = false } = {}) {
  const a = alamatRute(rute);
  if (a === window.location.pathname + window.location.search) return;
  window.history[ganti ? 'replaceState' : 'pushState'](null, '', a);
  window.dispatchEvent(new Event('sisi:rute'));
}

/** Rute aktif; berubah saat navigasi() atau Back / Forward browser. */
export function useRute() {
  const [r, setR] = useState(sekarang);
  useEffect(() => {
    const ubah = () => setR(sekarang());
    window.addEventListener('popstate', ubah);
    window.addEventListener('sisi:rute', ubah);
    return () => { window.removeEventListener('popstate', ubah); window.removeEventListener('sisi:rute', ubah); };
  }, []);
  return r;
}

/** Aset di folder public (gambar) sesuai BASE, aman di alamat bertingkat. */
export function aset(path) { return BASE + String(path).replace(/^\.?\//, ''); }
