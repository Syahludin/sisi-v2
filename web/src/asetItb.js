/**
 * Data Aset (ITB): rekap dari baris segmen getDataAset. Murni (diuji). Tab 'eam' = penyulang menurut CXPENYULANG ITB
 * (segmen.cx / pny), tab 'lapangan' = menurut DESCRIPTION (segmen.pnyLap; sumber BELUM = belum terpetakan, tidak dihitung).
 * Hanya segmen OPERATING dan tidak hilang masuk SUTM / SKTM / kartu; status lain = Non-aktif; segmen hilang tidak dihitung.
 */
export const JENIS_KABEL = ['AAAC', 'AAACS', 'N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE'];

/** Kelas warna per jenis kabel (k1..k4 jenis dikenal, k5 lainnya). */
export const warnaJenis = (jenis) => {
  const i = JENIS_KABEL.indexOf(jenis);
  return 'k' + (i === -1 ? 5 : i + 1);
};

const bulat = (v) => Math.round(v * 1000) / 1000;
const operasi = (s) => String(s.status).toUpperCase() === 'OPERATING';
// segmen yang ikut dihitung di tab itu: tidak hilang; tab Lapangan juga hanya yang sudah terpetakan
const dihitung = (segmen, tab) => segmen.filter((s) => !s.hilang && (tab !== 'lapangan' || (s.sumber !== 'BELUM' && s.pnyLap)));
const kunciTab = (s, tab) => (tab === 'lapangan' ? s.pnyLap : s.cx);
const urutJenis = (a, b) => {
  const i = JENIS_KABEL.indexOf(a), j = JENIS_KABEL.indexOf(b);
  return (i === -1 ? 99 : i) - (j === -1 ? 99 : j) || (a < b ? -1 : a > b ? 1 : 0);
};

/** { total, sutm, sktm, lainnya, nonaktif, belum, hilang }: total = sutm + sktm + lainnya + nonaktif (pola sheet Rekap). */
export function ringkasAset(segmen, tab) {
  const r = { sutm: 0, sktm: 0, lainnya: 0, nonaktif: 0 };
  dihitung(segmen, tab).forEach((s) => {
    if (!operasi(s)) r.nonaktif += s.panjang;
    else if (s.kategori === 'SUTM') r.sutm += s.panjang;
    else if (s.kategori === 'SKTM') r.sktm += s.panjang;
    else r.lainnya += s.panjang;
  });
  return {
    total: bulat(r.sutm + r.sktm + r.lainnya + r.nonaktif), sutm: bulat(r.sutm), sktm: bulat(r.sktm), lainnya: bulat(r.lainnya), nonaktif: bulat(r.nonaktif),
    belum: tab === 'lapangan' ? segmen.filter((s) => !s.hilang && (s.sumber === 'BELUM' || !s.pnyLap)).length : 0,
    hilang: segmen.filter((s) => s.hilang).length,
  };
}

/** Nama penyulang untuk satu kunci tab EAM: nama ITB yang paling sering dipakai CX itu. */
function namaEam(baris) {
  const n = {};
  baris.forEach((s) => { n[s.pny] = (n[s.pny] || 0) + 1; });
  return Object.keys(n).sort((a, b) => n[b] - n[a] || (a < b ? -1 : 1))[0] || '';
}

/**
 * Kartu semua penyulang yang ada di data: [{ kunci, nama, total, nonaktif, perJenis: [{ jenis, km }] }], terpanjang dulu.
 * jenis (opsional) = hanya jenis kabel itu.
 */
export function kartuPenyulang(segmen, tab, jenis) {
  const grup = new Map();
  dihitung(segmen, tab).forEach((s) => {
    const k = kunciTab(s, tab);
    if (!k) return;
    if (!grup.has(k)) grup.set(k, []);
    grup.get(k).push(s);
  });
  const hasil = [];
  grup.forEach((baris, kunci) => {
    const aktif = baris.filter((s) => operasi(s) && (!jenis || s.jenis === jenis));
    const per = new Map();
    aktif.forEach((s) => per.set(s.jenis, (per.get(s.jenis) || 0) + s.panjang));
    const perJenis = [...per.keys()].sort(urutJenis).map((j) => ({ jenis: j, km: bulat(per.get(j)) }));
    const total = bulat(perJenis.reduce((n, x) => n + x.km, 0));
    const nonaktif = bulat(baris.filter((s) => !operasi(s) && (!jenis || s.jenis === jenis)).reduce((n, s) => n + s.panjang, 0));
    if (total > 0 || nonaktif > 0) hasil.push({ kunci, nama: tab === 'lapangan' ? kunci : namaEam(baris), total, nonaktif, perJenis });
  });
  return hasil.sort((a, b) => b.total - a.total || (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0));
}

/** Rincian satu penyulang: matriks jenis x ukuran (OPERATING) + daftar segmen tak hilang (terpanjang dulu). */
export function rincianPenyulang(segmen, tab, kunci) {
  const baris = dihitung(segmen, tab).filter((s) => kunciTab(s, tab) === kunci);
  const aktif = baris.filter(operasi);
  const ukuran = [...new Set(aktif.map((s) => String(s.ukuran)))].sort((a, b) => Number(a) - Number(b) || (a < b ? -1 : 1));
  const jenis = [...new Set(aktif.map((s) => s.jenis))].sort(urutJenis);
  const matriks = jenis.map((j) => {
    const km = {};
    aktif.filter((s) => s.jenis === j).forEach((s) => { km[s.ukuran] = bulat((km[s.ukuran] || 0) + s.panjang); });
    return { jenis: j, km };
  });
  return { ukuran, matriks, segmen: baris.slice().sort((a, b) => b.panjang - a.panjang) };
}

export const daftarHilang = (segmen) => segmen.filter((s) => s.hilang).sort((a, b) => b.panjang - a.panjang);
export const daftarBelum = (segmen) => segmen.filter((s) => !s.hilang && (s.sumber === 'BELUM' || !s.pnyLap)).sort((a, b) => b.panjang - a.panjang);

/** 26.689 -> '26,69' (kmS, format Indonesia). */
export const teksKm = (v) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
