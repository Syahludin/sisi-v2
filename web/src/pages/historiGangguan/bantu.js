import { useEffect, useState } from 'react';

import { BULAN_PENDEK, JENIS_GGN, rentangTahun, tigaTahun } from '../../gangguan.js';
import { kodeGalat, pesan } from '../../pesan.js';

/** Bantuan bersama halaman History Gangguan (format angka / tanggal, tetapan tampilan, data 3 tahun). */
export { kodeGalat };
export const angka = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(v) : '-');
export const rupiah = (v) => (typeof v === 'number' && v ? 'Rp ' + angka(v) : '-');
export const waktuSinkron = (iso) => (iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'belum pernah');
export const tglId = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t || '')); return m ? Number(m[3]) + ' ' + BULAN_PENDEK[Number(m[2]) - 1] + ' ' + m[1] : '-'; };
export const pecahWaktu = (w) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(String(w || ''));
  return m ? { tgl: Number(m[3]), bln: BULAN_PENDEK[Number(m[2]) - 1], jam: m[4] || '' } : { tgl: '?', bln: '', jam: '' };
};
export const hariIniWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export const TAMPIL_AWAL = 60;
// warna potongan pie (urut terbanyak), cukup kontras di latar putih
export const WARNA_PIE = ['#bd5550', '#12a5b5', '#d7ae45', '#4d8a2c', '#6250d6', '#e87ba4', '#1d4a45', '#b5651d', '#8a9b97', '#5d7a2a'];
export const TAB_PIE = [['SEMUA', 'Keseluruhan'], ['INTERNAL', 'Internal'], ['EXTERNAL', 'External']];
export const TAHUN_AWAL = 2022;   // data sumber paling awal
export const teksPeriode = ({ dari, sampai }) => tglId(dari) + ' – ' + tglId(sampai);

/**
 * Kejadian 3 tahun (tahun-2 .. tahun, tahun berjalan s.d. hari ini) per jenis. Dua panggilan getHistoriGangguan
 * (server membatasi rentang 2 tahun): 2 tahun sebelumnya + tahun itu. tahun null = tidak memuat. ulang = muat ulang.
 */
export function useTigaTahun(api, tahun, ulang) {
  const [hasil, setHasil] = useState({ tahun: null, data: null, galat: '' });
  useEffect(() => {
    if (!tahun) return undefined;
    let hidup = true;
    const hariIni = hariIniWib(), [t2, t1] = tigaTahun(tahun);
    const ambil = (r) => api('getHistoriGangguan', r, { batasMs: 60000 }).then((j) => j.data);
    setHasil((h) => (h.tahun === tahun ? h : { tahun, data: null, galat: '' }));
    Promise.all([ambil({ dari: t2 + '-01-01', sampai: t1 + '-12-31' }), ambil(rentangTahun(tahun, hariIni))])
      .then(([a, b]) => { if (hidup) setHasil({ tahun, data: Object.fromEntries(JENIS_GGN.map((j) => [j.kode, [...(b[j.kode] || []), ...(a[j.kode] || [])]])), galat: '' }); })
      .catch((e) => { if (hidup) setHasil({ tahun, data: null, galat: pesan(kodeGalat(e)) }); });
    return () => { hidup = false; };
  }, [api, tahun, ulang]);
  return hasil.tahun === tahun ? hasil : { tahun, data: null, galat: '' };
}
