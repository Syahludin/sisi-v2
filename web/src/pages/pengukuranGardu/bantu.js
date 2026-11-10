/** Bantuan bersama halaman Pengukuran Gardu. */
export { kodeGalat } from '../../pesan.js';
export const BATAS_MS = 60000;
export const angka = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(v) : '-');
export const tglId = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(m[0] + 'T00:00:00Z')) : (iso || '-');
};

