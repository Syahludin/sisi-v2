/**
 * Laporan Gangguan Penyulang (menu OPS_LAP_GANGGUAN). Review 8 Nov 2026 (desain ulang): tampilan terstruktur (kartu hari
 * laporan + rekap bulan) DIURAI dari teks WhatsApp yang disusun server (teksLaporanGangguan_ di 68_Laporan_Gangguan.js),
 * jadi yang tampil di kartu = yang terkirim. Teks yang tidak bisa diurai (format lain) = null, halaman menampilkan teks saja.
 * Pasangan HP: mobile/lib/features/gangguan/laporan_gangguan_bantu.dart (aturan sama).
 */

export const KATEGORI_LGP = [
  { kode: 'pmt', label: 'PMT Trip', ket: 'Trip PMT di sumber (GI / PLTD)' },
  { kode: 'sukses', label: 'AR Sukses', ket: 'Recloser menutup kembali' },
  { kode: 'lockout', label: 'AR Lockout', ket: 'Gangguan section (ACR, OG, LBS)' },
];

const kali = (s) => { const m = /^(\d+) kali$/.exec(String(s).trim()); return m ? Number(m[1]) : String(s).trim() === 'NIHIL' ? 0 : null; };

/**
 * teks -> { bulan: 'NOVEMBER 2026', harian: [{ kode, label, jumlah, kejadian: [{ penyulang, penyebab }] }],
 *           tertinggi: [{ nama, pmt, section }], rekap: [{ kode, label, total, daftar: [{ nama, jumlah }] }] } | null.
 */
export function uraiLaporanGangguan(teks) {
  const L = String(teks || '').split(/\r?\n/);
  const iH = L.findIndex((s) => s.trim() === '📍 GANGGUAN PENYULANG');
  const iR = L.findIndex((s) => s.trim().startsWith('📊 REKAP GANGGUAN TERTINGGI BULAN '));
  if (iH < 0 || iR < iH) return null;
  const label = new Map(KATEGORI_LGP.map((k) => [k.label, k]));
  const kepala = (s) => {
    const m = /^▪️ (.+?) :(.*)$/.exec(s.trim());
    return m ? { judul: m[1].trim(), isi: m[2].trim() } : null;
  };
  const harian = [];
  let kini = null, tunggu = null;
  for (const s of L.slice(iH + 1, iR)) {
    const k = kepala(s);
    if (k) {
      const kat = label.get(k.judul), jumlah = kali(k.isi);
      if (!kat || jumlah === null) return null;
      kini = { kode: kat.kode, label: kat.label, jumlah, kejadian: [] };
      harian.push(kini);
      tunggu = null;
      continue;
    }
    const p = /^- Penyulang : (.*)$/.exec(s.trim());
    if (p && kini) { tunggu = { penyulang: p[1].trim(), penyebab: '' }; kini.kejadian.push(tunggu); continue; }
    const sb = /^Penyebab : (.*)$/.exec(s.trim());
    if (sb && tunggu) { tunggu.penyebab = sb[1].trim() === '-' ? '' : sb[1].trim(); tunggu = null; }
  }
  const tertinggi = [], rekap = [];
  kini = null;
  let diTertinggi = false;
  for (const s of L.slice(iR + 1)) {
    if (s.trim().startsWith('Demikian')) break;
    const k = kepala(s);
    if (k && k.judul.startsWith('Gangguan Tertinggi')) { diTertinggi = true; kini = null; continue; }
    if (k) {
      const kat = label.get(k.judul), total = kali(k.isi);
      if (!kat || total === null) return null;
      kini = { kode: kat.kode, label: kat.label, total, daftar: [] };
      rekap.push(kini);
      diTertinggi = false;
      continue;
    }
    if (diTertinggi) {
      const t = /^- Penyulang (.+) \(PMT (\d+) kali & Section (\d+) kali\)$/.exec(s.trim());
      if (t) tertinggi.push({ nama: t[1], pmt: Number(t[2]), section: Number(t[3]) });
      continue;
    }
    const d = /^- (.+) \((\d+) kali\)$/.exec(s.trim());
    if (d && kini) kini.daftar.push({ nama: d[1], jumlah: Number(d[2]) });
  }
  if (harian.length !== KATEGORI_LGP.length || rekap.length !== KATEGORI_LGP.length) return null;
  return { bulan: L[iR].trim().slice('📊 REKAP GANGGUAN TERTINGGI BULAN '.length).trim(), harian, tertinggi, rekap };
}

/** 'NOVEMBER 2026' -> 'November 2026'. */
export const bulanTampil = (s) => String(s || '').toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());

/** Waktu ISO -> '08.12' (WIB). */
export function jamWib(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(d).replace(':', '.');
}
