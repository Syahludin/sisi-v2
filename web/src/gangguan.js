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

/* ===== Sumber data (v1.0.71): wilayah | simonlang | banding ===== */
export const SUMBER_GGN = [['wilayah', 'Gangguan Wilayah'], ['simonlang', 'SiMonLang'], ['banding', 'Perbandingan']];
export const pilihSumber = (v) => (SUMBER_GGN.some(([k]) => k === v) ? v : 'wilayah');
/** Jenis yang ada per sumber: pick up hanya ada di SiMonLang, jadi Gangguan Wilayah dan Perbandingan tanpa pick up. */
export const jenisUntukSumber = (sumber) => (sumber === 'simonlang' ? JENIS_GGN : JENIS_GGN.filter((j) => j.kode !== 'pickup'));

/* ===== Pencocokan kejadian SiMonLang vs Gangguan Wilayah (v1.0.71, murni, diuji) ===== */
// selisih jam yang masih dianggap kejadian yang sama (lebih dari ini = berbeda), dalam menit
export const TOLERANSI_JAM_MENIT = 60;
// [kolom, label, toleransi angka]; kolom tanpa toleransi dibandingkan sebagai teks (huruf besar, spasi dirapikan)
export const MEDAN_BANDING = {
  penyulang: [['peralatan', 'Peralatan'], ['waktu_nyala', 'Waktu nyala', TOLERANSI_JAM_MENIT], ['durasi_menit', 'Durasi (menit)', 1], ['indikasi', 'Indikasi'],
    ['arus_r', 'Arus R (A)'], ['arus_s', 'Arus S (A)'], ['arus_t', 'Arus T (A)'], ['arus_n', 'Arus N (A)'], ['ens_kwh', 'ENS (kWh)', 1],
    ['cuaca', 'Cuaca'], ['kode_fgtm', 'Kode FGTM']],
  ar: [['peralatan', 'Peralatan'], ['indikasi', 'Indikasi'], ['arus_r', 'Arus R (A)'], ['arus_s', 'Arus S (A)'], ['arus_t', 'Arus T (A)'],
    ['arus_n', 'Arus N (A)'], ['cuaca', 'Cuaca'], ['kode_fgtm', 'Kode FGTM']],
};
const teksBanding = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
/** 'yyyy-MM-dd[ H:mm]' -> menit sejak epoch (WIB dianggap UTC, hanya untuk selisih). Tanpa jam = 00:00 (data lama hanya memuat tanggal). */
const menitDari = (w) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(w ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 6e4 : NaN;
};

// kata yang dianggap satu makna di nama peralatan (kiri = bentuk baku). Tambah di sini bila ada singkatan lain.
const SINONIM_PERALATAN = { SIMPANG: 'SP', SMP: 'SP', GANG: 'GG' };   // 'GG.' / 'GG' / 'GANG' (ACR GANG MAWAR = ACR GG. MAWAR)

/**
 * Nama peralatan untuk dibandingkan (hanya perangkat yang dinilai, bukan keterangan section):
 *  - teks di dalam tanda kurung dibuang: SiMonLang "OG PERMIS (GH PAYUNG)" = wilayah "OG PERMIS - UJUNG";
 *  - bagian sesudah " - " dibuang: wilayah "PMT A - B" / "ACR POLSEK SIMBA - UJUNG" = SiMonLang "PMT A" / "ACR POLSEK SIMBA"
 *    (tanda hubung tanpa spasi, mis. "SP-3", tetap bagian nama);
 *  - tanda baca dan huruf besar-kecil diabaikan; "SP." / "SP" / "SIMPANG" satu makna, begitu juga "GG." / "GG" / "GANG"; akhiran "UJUNG" tanpa tanda hubung dibuang.
 */
export function normalPeralatan(nama) {
  const inti = String(nama ?? '').replace(/\([^)]*\)?/g, ' ').split(/\s[-–—]\s/)[0];
  const kata = inti.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((k) => SINONIM_PERALATAN[k] || k);
  if (kata.length > 2 && kata[kata.length - 1] === 'UJUNG') kata.pop();
  return kata.join(' ');
}


/**
 * Cuaca untuk dibandingkan: penghubung ("DISERTAI", "DENGAN", "DAN", "+", "&", "/", ",") diabaikan, jadi "HUJAN DISERTAI PETIR" =
 * "HUJAN + PETIR" = "hujan petir". Urutan kata tetap dihitung ("HUJAN PETIR" != "PETIR").
 */
export function normalCuaca(teks) {
  return String(teks ?? '').toUpperCase().replace(/\b(DISERTAI|DENGAN|DAN)\b|[+&,/]/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Nilai satu kolom untuk dibandingkan: Kode FGTM dibandingkan kodenya saja ('Pohon - E1' = 'Pohon E1'). */
function nilaiBanding(o, kolom) {
  if (kolom === 'kode_fgtm') return kodeFgtm(o.kode_fgtm).kode;
  if (kolom === 'peralatan') return normalPeralatan(o.peralatan);
  if (kolom === 'cuaca') return normalCuaca(o.cuaca);
  if (kolom === 'waktu_nyala') { const m = menitDari(o.waktu_nyala); return Number.isFinite(m) ? m : ''; }   // menit, supaya bisa bertoleransi
  const v = o[kolom];
  return typeof v === 'number' ? v : teksBanding(v);
}

/** Kolom yang nilainya beda antara dua kejadian: [{ medan, label, sl, wil }] (nilai asli, kosong = ''). */
export function bedaKejadian(sl, wil, kode) {
  return (MEDAN_BANDING[kode] || []).filter(([kolom, , toleransi]) => {
    const a = nilaiBanding(sl, kolom), b = nilaiBanding(wil, kolom);
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > (toleransi || 0);
    return String(a) !== String(b);
  }).map(([kolom, label]) => ({ medan: kolom, label, sl: sl[kolom] ?? '', wil: wil[kolom] ?? '' }));
}

/**
 * Cocokkan kejadian SiMonLang (sl) dengan Gangguan Wilayah (wil) satu jenis ('penyulang' | 'ar'). Kunci = penyulang + waktu
 * dan indikasi sampai menit (kembar dihitung berurutan). Sisa (termasuk yang sama-sama muncul tetapi indikasinya beda) yang penyulangnya sama dan waktunya berselisih <= toleranMenit dipasangkan
 * juga (menit != 0, "waktu berbeda"). Hasil { sama, pasangan: [{ sl, wil, menit, beda }], hanyaSl, hanyaWil };
 * sama = jumlah pasangan tanpa selisih (samaDaftar = pasangannya), pasangan = yang punya selisih kolom.
 */
export function cocokkanKejadian(sl, wil, kode, { toleranMenit = TOLERANSI_JAM_MENIT } = {}) {
  const j = jenisGgn(kode);
  const indikasi = (o) => teksBanding(o.indikasi);
  // indikasi ikut kunci: dua kejadian di penyulang + menit yang sama tetapi GFR dan OCR adalah dua kejadian, bukan kembar
  const kunci = (o) => String(o.penyulang ?? '').trim().toUpperCase() + ' | ' + String(o[j.waktu] || '').slice(0, 16) + ' | ' + indikasi(o);
  const antre = new Map();
  (wil || []).forEach((o) => { const k = kunci(o); if (!antre.has(k)) antre.set(k, []); antre.get(k).push(o); });
  const pasangan = [], sisaSl = [];
  let sama = 0;
  const samaDaftar = [];   // pasangan cocok sempurna (untuk rincian per penyulang)
  const catat = (a, b, menit) => {
    const beda = bedaKejadian(a, b, kode);   // selisih jam <= toleransi bukan perbedaan: hanya dicatat di `menit`
    if (beda.length) pasangan.push({ sl: a, wil: b, menit, beda }); else { sama += 1; samaDaftar.push({ sl: a, wil: b, menit }); }
  };
  (sl || []).forEach((o) => {
    const q = antre.get(kunci(o));
    if (q && q.length) catat(o, q.shift(), 0); else sisaSl.push(o);
  });
  const sisaWil = [...antre.values()].flat();
  // sisa: pasangkan yang waktunya berdekatan (penyulang sama), selisih terkecil dulu
  const calon = [];
  const adaJam = (o) => /\d{1,2}:\d{2}/.test(String(o[j.waktu] || '').slice(10));
  const tgl = (o) => String(o[j.waktu] || '').slice(0, 10);
  sisaSl.forEach((a, i) => sisaWil.forEach((b, k) => {
    if (String(a.penyulang ?? '').trim().toUpperCase() !== String(b.penyulang ?? '').trim().toUpperCase()) return;
    if (!adaJam(a) || !adaJam(b)) {
      // salah satu tidak mencatat jam trip: tidak bisa diukur selisih jamnya, jadi dipasangkan bila tanggal dan section (peralatan) sama
      if (tgl(a) && tgl(a) === tgl(b) && normalPeralatan(a.peralatan) === normalPeralatan(b.peralatan)) calon.push({ i, k, m: 0, tanpaJam: true });
      return;
    }
    const m = menitDari(b[j.waktu]) - menitDari(a[j.waktu]);
    if (Number.isFinite(m) && Math.abs(m) <= toleranMenit) calon.push({ i, k, m });
  }));
  const bedaInd = (c) => (indikasi(sisaSl[c.i]) === indikasi(sisaWil[c.k]) ? 0 : 1);
  // tanggal acuan utama: tanggal yang sama didahulukan, lalu yang jamnya tercatat, lalu selisih waktu terkecil, lalu indikasi yang sama
  const bedaTgl = (c) => (String(sisaSl[c.i][j.waktu]).slice(0, 10) === String(sisaWil[c.k][j.waktu]).slice(0, 10) ? 0 : 1);
  calon.sort((x, y) => bedaTgl(x) - bedaTgl(y) || (x.tanpaJam ? 1 : 0) - (y.tanpaJam ? 1 : 0) || Math.abs(x.m) - Math.abs(y.m) || bedaInd(x) - bedaInd(y));
  const pakaiSl = new Set(), pakaiWil = new Set();
  calon.forEach(({ i, k, m }) => {
    if (pakaiSl.has(i) || pakaiWil.has(k)) return;
    pakaiSl.add(i); pakaiWil.add(k);
    catat(sisaSl[i], sisaWil[k], m);
  });
  return {
    sama, samaDaftar, pasangan,
    hanyaSl: sisaSl.filter((_, i) => !pakaiSl.has(i)),
    hanyaWil: sisaWil.filter((_, k) => !pakaiWil.has(k)),
  };
}
