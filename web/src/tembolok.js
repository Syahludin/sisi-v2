/**
 * v1.0.36: tembolok jawaban BACA di browser ("tampilkan dulu, perbarui di belakang").
 * Disimpan di memori + sessionStorage per token: bertahan saat refresh / pindah halaman, hilang saat tab ditutup atau
 * keluar (data admin tidak tertinggal di komputer bersama). Penyimpanan apa pun yang berhasil = semua dibuang
 * (data bisa berubah di mana saja), dibaca ulang dari server.
 *
 * v1.0.45 (laporan offline): action TETAP (Laporan UP3 / UIW) disimpan di localStorage per akun (bukan per token), jadi
 * tetap ada saat tab ditutup / login ulang dan langsung tampil saat dibuka; jawaban server tetap diminta lalu menimpa.
 * Tidak ikut dibuang saat penyimpanan berhasil (tetap diperbarui server tiap dibuka); dibuang saat keluar / sesi habis.
 * v1.0.47: + getWoAdmin (Penerusan Tim Temuan Inspeksi offline). Foto kecil disimpan terpisah di IndexedDB (fotoLokal.js).
 * v1.0.58: daftar WO (getWoAdmin / getPetaTemuan) tidak lagi di sini: simpananWo.js + sinkronWo.js (selisih).
 */
import { hapusSemuaFotoLokal } from './fotoLokal.js';
import { hapusSimpananWo } from './simpananWo.js';

const AWALAN = 'sisi.web.tb.';
const AWALAN_TETAP = 'sisi.web.tbt.';
const MAKS_BYTE = 400000;   // satu jawaban lebih besar = memori saja
const MAKS_BYTE_TETAP = 1500000;   // simpanan per akun (localStorage ~5 MB per situs)
const MAKS_TETAP = 40;      // jawaban tersimpan lokal paling banyak (terlama dibuang)
const TETAP = new Set(['getLaporanUp3', 'getLaporanUiw']);   // v1.0.58: daftar WO / peta temuan pindah ke simpananWo.js (IndexedDB)
const memori = new Map();

/** Action yang jawabannya disimpan lokal per akun (bertahan antar sesi). */
export const tetapTembolok = (action) => TETAP.has(action);

/** Kunci stabil action + data (urutan field tidak berpengaruh). Murni (diuji). */
export function kunciTembolok(token, action, data) {
  const urut = (v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, k) => { o[k] = urut(v[k]); return o; }, {})
    : Array.isArray(v) ? v.map(urut) : v);
  return String(token || '').slice(0, 16) + '|' + action + '|' + JSON.stringify(urut(data || {}));
}

/** Kunci untuk sesi: action TETAP memakai id akun (token berganti tiap login), selain itu token. */
export function kunciSesi(sesi, action, data) {
  return tetapTembolok(action) ? 'u:' + (sesi.profil?.userId || '') + kunciTembolok('', action, data) : kunciTembolok(sesi.token, action, data);
}

function wadah(tetap) {
  try { return tetap ? window.localStorage : window.sessionStorage; } catch { return null; }
}

const actionKunci = (kunci) => kunci.split('|')[1] || '';

/** { j (amplop jawaban), waktu (ms) } atau null. */
export function bacaTembolok(kunci) {
  if (memori.has(kunci)) return memori.get(kunci);
  const tetap = tetapTembolok(actionKunci(kunci));
  const ss = wadah(tetap);
  if (!ss) return null;
  try {
    const t = ss.getItem((tetap ? AWALAN_TETAP : AWALAN) + kunci);
    if (!t) return null;
    const v = JSON.parse(t);
    memori.set(kunci, v);
    return v;
  } catch { return null; }
}

/** Buang jawaban TETAP terlama sampai tersisa [sisa]. */
function rapikanTetap(ls, sisa) {
  const ada = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !k.startsWith(AWALAN_TETAP)) continue;
    let waktu = 0;
    try { waktu = JSON.parse(ls.getItem(k)).waktu || 0; } catch { /* rusak = terlama */ }
    ada.push([waktu, k]);
  }
  ada.sort((a, b) => a[0] - b[0]).slice(0, Math.max(ada.length - sisa, 0)).forEach(([, k]) => ls.removeItem(k));
}

export function tulisTembolok(kunci, j) {
  const v = { j, waktu: Date.now() };
  memori.set(kunci, v);
  const tetap = tetapTembolok(actionKunci(kunci));
  const ss = wadah(tetap);
  if (!ss) return;
  try {
    const t = JSON.stringify(v);
    if (t.length > (tetap ? MAKS_BYTE_TETAP : MAKS_BYTE)) return;
    if (!tetap) { ss.setItem(AWALAN + kunci, t); return; }
    rapikanTetap(ss, MAKS_TETAP - 1);
    try { ss.setItem(AWALAN_TETAP + kunci, t); } catch {
      rapikanTetap(ss, 0);   // kuota penuh: simpanan lama dibuang, coba sekali lagi
      ss.setItem(AWALAN_TETAP + kunci, t);
    }
  } catch { /* penuh: memori saja */ }
}

function buangAwalan(ss, awalan) {
  if (!ss) return;
  try {
    for (let i = ss.length - 1; i >= 0; i--) { const k = ss.key(i); if (k && k.startsWith(awalan)) ss.removeItem(k); }
  } catch { /* abaikan */ }
}

/** Buang tembolok sesi (penyimpanan berhasil). semua = juga simpanan lokal per akun (keluar / sesi habis). */
export function kosongkanTembolok(semua = false) {
  memori.clear();
  buangAwalan(wadah(false), AWALAN);
  if (semua) {
    buangAwalan(wadah(true), AWALAN_TETAP);
    hapusSemuaFotoLokal().catch(() => {});
    hapusSimpananWo().catch(() => {});
  }
}

/** Action yang hasilnya boleh ditampilkan dulu dari tembolok (baca, bukan unduhan berkas). */
export function bolehTembolok(action) {
  return /^get/.test(action) && !/^get(Pdf|Ttd|FileArsip)/.test(action);
}
