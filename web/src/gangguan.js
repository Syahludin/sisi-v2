/**
 * v1.0.37 History Gangguan (menu OPS_REKAP_GANGGUAN): saring + ringkasan dihitung di browser dari jawaban
 * getHistoriGangguan (satu tahun), jadi ganti penyulang / bulan / cari tidak memanggil server lagi. Murni (diuji).
 */
export const MENU_GGN = 'OPS_REKAP_GANGGUAN';

export const JENIS_GGN = [
  { kode: 'penyulang', label: 'Gangguan Penyulang', pendek: 'Penyulang', waktu: 'waktu_padam', alat: 'peralatan', sebab: 'penyebab', warna: 'merah' },
  { kode: 'ar', label: 'Auto Reclose', pendek: 'AR', waktu: 'waktu_ar', alat: 'peralatan', sebab: 'penyebab', warna: 'kuning' },
  { kode: 'pickup', label: 'Pick Up Recloser', pendek: 'Pick Up', waktu: 'waktu_event', alat: 'recloser', sebab: 'temuan', warna: 'biru' },
];
export const jenisGgn = (kode) => JENIS_GGN.find((j) => j.kode === kode) || JENIS_GGN[0];

export const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** 'yyyy-MM-dd HH:mm' -> nomor bulan 1..12 (0 = tidak terbaca). */
export const bulanDari = (w) => { const m = /^\d{4}-(\d{2})/.exec(String(w || '')); return m ? Number(m[1]) : 0; };

const teksCari = (o) => Object.values(o).filter((v) => typeof v === 'string' || typeof v === 'number').join(' ').toLowerCase();

/* ===== Kode FGTM ===== */
export const KODE_FGTM = [
  { kode: 'I1', label: 'Komponen JTM', grup: 'INTERNAL' }, { kode: 'I2', label: 'Peralatan JTM', grup: 'INTERNAL' },
  { kode: 'I3', label: 'Trafo', grup: 'INTERNAL' }, { kode: 'I4', label: 'Tiang', grup: 'INTERNAL' },
  { kode: 'E1', label: 'Pohon', grup: 'EXTERNAL' }, { kode: 'E2', label: 'Bencana Alam', grup: 'EXTERNAL' },
  { kode: 'E3', label: 'Pekerjaan Pihak III / Binatang', grup: 'EXTERNAL' }, { kode: 'E4', label: 'Layang-layang / Umbul-umbul', grup: 'EXTERNAL' },
  { kode: 'E', label: 'Tidak Diketahui', grup: 'EXTERNAL' },
];
export const GRUP_FGTM = { INTERNAL: 'Internal', EXTERNAL: 'External' };

/**
 * Teks Kode FGTM sumber ('Pohon - E1', 'Pohon E1', 'Tidak Diketahui', 'Proses Penelusuran') -> { kode, label, grup }.
 * Kode = 2 huruf terakhir (I1.., E1..); isian tanpa kode = E Tidak Diketahui; kosong = kode '' (Belum diisi, tanpa grup).
 */
export function kodeFgtm(teks) {
  const s = String(teks ?? '').trim();
  if (!s) return { kode: '', label: 'Belum diisi', grup: '' };
  const m = /\b([IE])\s*-?\s*(\d)\s*$/i.exec(s);
  const kode = m ? m[1].toUpperCase() + m[2] : 'E';
  const k = KODE_FGTM.find((x) => x.kode === kode);
  return k ? { ...k } : { kode, label: s.replace(/\s*-?\s*[IE]\d\s*$/i, '') || kode, grup: kode[0] === 'I' ? 'INTERNAL' : 'EXTERNAL' };
}

/** Cocok filter kode: '' semua, 'INTERNAL' / 'EXTERNAL' grup, selain itu kode persis. */
export function cocokKode(teks, filter) {
  if (!filter) return true;
  const k = kodeFgtm(teks);
  return filter === 'INTERNAL' || filter === 'EXTERNAL' ? k.grup === filter : k.kode === filter;
}

/** Potongan pie: tab 'SEMUA' | 'INTERNAL' | 'EXTERNAL' -> [{ kode, label, jumlah }] terurut turun. */
export function pieFgtm(baris, tab = 'SEMUA') {
  const hit = new Map();
  (baris || []).forEach((o) => {
    const k = kodeFgtm(o.kode_fgtm);
    if (tab !== 'SEMUA' && k.grup !== tab) return;
    const id = k.kode || '-';
    const x = hit.get(id) || { kode: k.kode, label: k.label, jumlah: 0 };
    x.jumlah += 1;
    hit.set(id, x);
  });
  return [...hit.values()].sort((a, b) => b.jumlah - a.jumlah || a.kode.localeCompare(b.kode));
}

/** Daftar bulan 'yyyy-MM' dari tanggal dari s.d. sampai (inklusif). */
export function bulanRentang(dari, sampai) {
  const hasil = [];
  let [y, m] = String(dari).slice(0, 7).split('-').map(Number);
  const [y2, m2] = String(sampai).slice(0, 7).split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    hasil.push(y + '-' + String(m).padStart(2, '0'));
    m += 1; if (m > 12) { m = 1; y += 1; }
    if (hasil.length > 60) break;
  }
  return hasil;
}

/* ===== Kategori peralatan: PMT (trip dari sumber: GI / PLTD) vs Section (ACR, OG, LBS, ... selain PMT) ===== */
export const KATEGORI_ALAT = [
  { kode: 'pmt', label: 'PMT', ket: 'Trip dari sumber (GI / PLTD)' },
  { kode: 'section', label: 'Section', ket: 'Trip selain PMT (ACR, OG, LBS)' },
];

/** 'pmt' | 'section'. Jenis peralatan sumber (PMT / ACR / OG) dipakai dulu; pick up (tanpa jenis) dari nama peralatan. */
export function kategoriAlat(o, kode) {
  const jenis = String(o?.jenis_peralatan || '').trim().toUpperCase();
  if (jenis) return jenis === 'PMT' ? 'pmt' : 'section';
  return /^PMT\b/i.test(String(o?.[jenisGgn(kode).alat] || '').trim()) ? 'pmt' : 'section';
}

/** Hitung { jumlah, pmt, section } baris satu jenis. */
export function hitungKategori(baris, kode) {
  const r = { jumlah: 0, pmt: 0, section: 0 };
  (baris || []).forEach((o) => { r.jumlah += 1; r[kategoriAlat(o, kode)] += 1; });
  return r;
}

/** Jumlah kejadian per bulan rentang: [{ bulan: 'yyyy-MM', label: "Jan '26", pendek, jumlah, pmt, section }]. */
export function perBulanRentang(baris, kode, dari, sampai) {
  const j = jenisGgn(kode), daftar = bulanRentang(dari, sampai), kel = Object.fromEntries(daftar.map((b) => [b, []]));
  (baris || []).forEach((o) => { const b = String(o[j.waktu] || '').slice(0, 7); if (b in kel) kel[b].push(o); });
  return daftar.map((b) => ({ bulan: b, label: BULAN_PENDEK[Number(b.slice(5)) - 1] + " '" + b.slice(2, 4), pendek: BULAN_PENDEK[Number(b.slice(5)) - 1], ...hitungKategori(kel[b], kode) }));
}

/** Tahun penuh (tahun berjalan s.d. hari ini): { dari, sampai }. */
export function rentangTahun(tahun, hariIni) {
  const t = String(tahun), akhir = t + '-12-31';
  return { dari: t + '-01-01', sampai: hariIni && hariIni < akhir ? hariIni : akhir };
}

/** Tiga tahun (tahun-2 .. tahun), terbaru di akhir. */
export const tigaTahun = (tahun) => [Number(tahun) - 2, Number(tahun) - 1, Number(tahun)];

/** Per tahun dari tigaTahun: [{ tahun, jumlah, pmt, section }]. */
export function perTahunGgn(baris, kode, tahun) {
  const j = jenisGgn(kode);
  return tigaTahun(tahun).map((t) => ({ tahun: t, ...hitungKategori((baris || []).filter((o) => String(o[j.waktu] || '').slice(0, 4) === String(t)), kode) }));
}

/** Per bulan (Jan-Des) x tigaTahun: [{ bulan: 1..12, pendek, tahun: [{ tahun, jumlah, pmt, section }] x3 }]. */
export function perBulanTigaTahun(baris, kode, tahun) {
  const j = jenisGgn(kode), daftar = tigaTahun(tahun), kel = new Map();
  (baris || []).forEach((o) => {
    const w = String(o[j.waktu] || '');
    const t = Number(w.slice(0, 4)), b = Number(w.slice(5, 7));
    if (!daftar.includes(t) || !(b >= 1 && b <= 12)) return;
    const id = t + '-' + b;
    if (!kel.has(id)) kel.set(id, []);
    kel.get(id).push(o);
  });
  return BULAN_PENDEK.map((pendek, i) => ({ bulan: i + 1, pendek, tahun: daftar.map((t) => ({ tahun: t, ...hitungKategori(kel.get(t + '-' + (i + 1)), kode) })) }));
}

/** Top n penyulang satu tahun: [{ nama, jumlah, pmt, section, tahun: { [t]: jumlah } x3 }] terurut terbanyak lalu abjad. */
export function topPenyulang(baris, kode, tahun, n = 12) {
  const j = jenisGgn(kode), t0 = String(tahun), daftar = tigaTahun(tahun).map(String), hit = new Map();
  (baris || []).forEach((o) => {
    const t = String(o[j.waktu] || '').slice(0, 4);
    if (!o.penyulang || !daftar.includes(t)) return;
    const x = hit.get(o.penyulang) || { nama: o.penyulang, jumlah: 0, pmt: 0, section: 0, tahun: Object.fromEntries(daftar.map((y) => [y, 0])) };
    x.tahun[t] += 1;
    if (t === t0) { x.jumlah += 1; x[kategoriAlat(o, kode)] += 1; }
    hit.set(o.penyulang, x);
  });
  return [...hit.values()].filter((x) => x.jumlah).sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama)).slice(0, n);
}

/** Saring filter halaman: penyulang ('' semua), kode FGTM (pick up tidak punya kode = tidak disaring kode), tanggal, kata cari. */
/** Nama penyulang dibandingkan tanpa beda huruf besar-kecil dan spasi tepi (nama di master dan di data gangguan bisa berbeda penulisan). */
export const samaPenyulang = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export function saringFilter(baris, kode, { penyulang = '', fgtm = '', dari = '', sampai = '', cari = '' } = {}) {
  const j = jenisGgn(kode);
  const kata = String(cari).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (baris || []).filter((o) => {
    const t = String(o[j.waktu] || '').slice(0, 10);
    return (!penyulang || samaPenyulang(o.penyulang, penyulang))
      && (kode === 'pickup' || cocokKode(o.kode_fgtm, fgtm))
      && (!dari || t >= dari) && (!sampai || t <= sampai)
      && (!kata.length || kata.every((k) => teksCari(o).includes(k)));
  });
}

/** Baris satu jenis disaring penyulang ('' = semua), bulan (0 = semua) dan kata cari. */
export function saringGgn(baris, kode, { penyulang = '', bulan = 0, cari = '' } = {}) {
  const j = jenisGgn(kode);
  const kata = String(cari).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (baris || []).filter((o) => (!penyulang || samaPenyulang(o.penyulang, penyulang))
    && (!bulan || bulanDari(o[j.waktu]) === Number(bulan))
    && (!kata.length || kata.every((k) => teksCari(o).includes(k))));
}

/** Hitung nilai teks terbanyak (kosong = "Tidak diisi"), maks n, terurut turun lalu abjad. */
export function terbanyak(baris, kolom, n = 6) {
  const hit = new Map();
  baris.forEach((o) => { const k = String(o[kolom] ?? '').trim() || 'Tidak diisi'; hit.set(k, (hit.get(k) || 0) + 1); });
  return [...hit.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([nama, jumlah]) => ({ nama, jumlah }));
}

const jumlahKolom = (baris, k) => baris.reduce((s, o) => s + (typeof o[k] === 'number' ? o[k] : 0), 0);

/** Ringkasan satu jenis: jumlah, per bulan (12), per penyulang, penyebab / indikasi teratas + angka khusus jenis. */
export function ringkasGgn(baris, kode) {
  const j = jenisGgn(kode);
  const perBulan = Array(12).fill(0);
  baris.forEach((o) => { const b = bulanDari(o[j.waktu]); if (b) perBulan[b - 1] += 1; });
  const r = {
    jumlah: baris.length, perBulan, perPenyulang: terbanyak(baris, 'penyulang', 50),
    sebab: terbanyak(baris, j.sebab), alat: terbanyak(baris, j.alat, 5),
    indikasi: terbanyak(baris, kode === 'pickup' ? 'indikasi_relay' : 'indikasi', 5),
  };
  if (kode === 'penyulang') {
    r.durasiMenit = jumlahKolom(baris, 'durasi_menit');
    r.rataMenit = baris.length ? r.durasiMenit / baris.length : 0;
    r.ensKwh = jumlahKolom(baris, 'ens_kwh');
    r.pelanggan = jumlahKolom(baris, 'pelanggan');   // sumber baru tanpa Rupiah ENS
  }
  if (kode === 'pickup') {
    r.selesai = baris.filter((o) => o.status === 'DONE' || o.status === 'SELESAI').length;
    r.terbuka = baris.length - r.selesai;
  }
  return r;
}

/** Daftar penyulang dari semua jenis + jumlah kejadian (semua jenis), urut terbanyak. */
export function daftarPenyulang(data) {
  const hit = new Map();
  JENIS_GGN.forEach((j) => (data?.[j.kode] || []).forEach((o) => { if (o.penyulang) hit.set(o.penyulang, (hit.get(o.penyulang) || 0) + 1); }));
  return [...hit.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([nama, jumlah]) => ({ nama, jumlah }));
}

/** Baris (sudah terurut terbaru dulu) dikelompokkan per bulan: [{ bulan, label, isi }]. */
export function grupBulanGgn(baris, kode) {
  const j = jenisGgn(kode), grup = [];
  baris.forEach((o) => {
    const w = String(o[j.waktu] || ''), kunci = w.slice(0, 7);
    let g = grup[grup.length - 1];
    if (!g || g.kunci !== kunci) {
      const b = bulanDari(w);
      g = { kunci, label: b ? BULAN_PANJANG[b - 1] + ' ' + w.slice(0, 4) : 'Tanpa tanggal', isi: [] };
      grup.push(g);
    }
    g.isi.push(o);
  });
  return grup;
}

/** Durasi menit -> '2 j 15 m' / '45 m'. */
export function teksDurasi(menit) {
  if (typeof menit !== 'number' || !Number.isFinite(menit)) return '-';
  const m = Math.round(menit), j = Math.floor(m / 60);
  return j ? j + ' j' + (m % 60 ? ' ' + (m % 60) + ' m' : '') : m + ' m';
}
