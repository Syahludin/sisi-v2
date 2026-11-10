/**
 * Konfigurasi dari public/config.js (window.SISI_CONFIG), dibaca saat halaman dibuka.
 * Hanya alamat /exec Apps Script yang diterima: salah ketik di config.js tidak bisa mengirim password ke tempat lain.
 */
const POLA_EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
const POLA_BACA = /^(https:\/\/[a-z0-9.-]+(:\d+)?)?(\/[A-Za-z0-9._-]+)+$/i;

export function bacaConfig(w = globalThis) {
  const c = (w && w.SISI_CONFIG) || {};
  const url = typeof c.apiUrl === 'string' ? c.apiUrl.trim() : '';
  const baca = typeof c.apiBacaUrl === 'string' ? c.apiBacaUrl.trim().replace(/\/+$/, '') : '';
  return {
    apiUrl: POLA_EXEC.test(url) ? url : '',
    env: c.env === 'production' ? 'production' : 'staging',
    // v1.0.38: API baca MySQL Hostinger (opsional; kosong / salah = semua baca lewat Apps Script). https atau path domain sama.
    apiBacaUrl: POLA_BACA.test(baca) ? baca : '',
  };
}
