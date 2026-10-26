/** Tanggal operasional SiSi = WIB, bentuk 'YYYY-MM-DD' (sama dengan server). */

/** Tanggal hari ini di WIB, patokan "hari ini" server. */
export function hariIniWib(sekarang = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sekarang);
}

export function geserTanggal(tanggal, hari) {
  const d = new Date(tanggal + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/** 'Senin, 26 Oktober 2026' */
export function labelTanggal(tanggal) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(tanggal + 'T00:00:00Z'));
}

/** Jam 'HH:MM' dari waktu server 'YYYY-MM-DD HH:MM[:SS]' (WIB); bentuk lain apa adanya. */
export const jamDari = (waktu) => (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(waktu || '') ? waktu.slice(11, 16) : (waktu || ''));
