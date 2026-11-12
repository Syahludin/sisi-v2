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
export const WARNA_PIE = ['#c04a4a', '#2f6fb3', '#e0b400', '#1f6b45', '#6250d6', '#e87ba4', '#153f2c', '#b5651d', '#8a9a91', '#5d7a2a'];
export const TAB_PIE = [['SEMUA', 'Keseluruhan'], ['INTERNAL', 'Internal'], ['EXTERNAL', 'External']];
export const TAHUN_AWAL = 2022;   // data sumber paling awal
export const teksPeriode = ({ dari, sampai }) => tglId(dari) + ' – ' + tglId(sampai);

// kunci jawaban getHistoriGangguan: penyulang | ar | pickup, ditambah penyulang_sl | ar_sl pada sumber 'banding'
const KUNCI_DATA = [...JENIS_GGN.map((j) => j.kode), 'penyulang_sl', 'ar_sl'];

/**
 * Kejadian 3 tahun (tahun-2 .. tahun, tahun berjalan s.d. hari ini) per jenis. Dua panggilan getHistoriGangguan
 * (server membatasi rentang 2 tahun): 2 tahun sebelumnya + tahun itu. tahun null = tidak memuat. ulang = muat ulang.
 */
export function useTigaTahun(api, tahun, ulang, sumber = 'wilayah') {
  const [hasil, setHasil] = useState({ tahun: null, sumber, data: null, galat: '' });
  useEffect(() => {
    if (!tahun) return undefined;
    let hidup = true;
    const hariIni = hariIniWib(), [t2, t1] = tigaTahun(tahun);
    const ambil = (r) => api('getHistoriGangguan', { ...r, sumber }, { batasMs: 60000 }).then((j) => j.data);
    setHasil((h) => (h.tahun === tahun && h.sumber === sumber ? h : { tahun, sumber, data: null, galat: '' }));
    Promise.all([ambil({ dari: t2 + '-01-01', sampai: t1 + '-12-31' }), ambil(rentangTahun(tahun, hariIni))])
      .then(([a, b]) => { if (hidup) setHasil({ tahun, sumber, data: Object.fromEntries(KUNCI_DATA.map((k) => [k, [...(b[k] || []), ...(a[k] || [])]])), galat: '' }); })
      .catch((e) => { if (hidup) setHasil({ tahun, sumber, data: null, galat: pesan(kodeGalat(e)) }); });
    return () => { hidup = false; };
  }, [api, tahun, ulang, sumber]);
  return hasil.tahun === tahun && hasil.sumber === sumber ? hasil : { tahun, sumber, data: null, galat: '' };
}
