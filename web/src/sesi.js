/**
 * Sesi admin di localStorage (dipakai bersama semua tab). Masa berlaku token diatur server (cekSesi tiap halaman dibuka);
 * sesi milik backend lain (staging <-> production) diabaikan. Penyimpanan diblokir browser = sesi hanya di memori.
 */
export const KUNCI_SESI = 'sisi.web.sesi.v1';
const KUNCI = KUNCI_SESI;

export function bacaSesi(env, simpan = globalThis.localStorage) {
  try {
    const s = JSON.parse((simpan && simpan.getItem(KUNCI)) || 'null');
    if (!s || typeof s.token !== 'string' || !/^[0-9a-f]{64}$/.test(s.token) || s.env !== env || !s.profil) return null;
    return s;
  } catch {
    return null;
  }
}

export function simpanSesi(sesi, simpan = globalThis.localStorage) {
  try { simpan && simpan.setItem(KUNCI, JSON.stringify(sesi)); } catch { /* mode privat / diblokir */ }
}

export function hapusSesi(simpan = globalThis.localStorage) {
  try { simpan && simpan.removeItem(KUNCI); } catch { /* abaikan */ }
}
