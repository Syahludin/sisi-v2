/**
 * Workplan UP3 (v1.0.60), logika murni tanpa React. Server (getWorkplanUp3) mengirim realisasi ROW / Hartek per Penyulang +
 * Section + Jenis Kegiatan, satu nilai per tanggal rentang. Sheet workplan tidak dibaca; admin menyalin angkanya sendiri.
 */
import { properNama } from './checkpoint.js';

export const BATAS_WORKPLAN_MS = 60000;
export const MAKS_HARI_WORKPLAN = 62;
export const TAB_WORKPLAN = [
  { kode: 'ROW', nama: 'ROW' },
  { kode: 'HARKONS', nama: 'Harkons' },
];

const kecil = (v) => String(v || '').trim().toLowerCase();

/**
 * Opsi dropdown dari master jaringan [{ penyulang, section }] (db_Jaringan, sama dengan Checkpoint): penyulang unik tanpa beda
 * huruf besar / kecil (format proper), section = semua section penyulang terpilih ('' = kosong, pilih penyulang dulu).
 * Master kosong / gagal dimuat = pakai penyulang dan section yang ada di baris realisasi (cadangan).
 */
export function opsiWorkplan(master, penyulang, baris = []) {
  const sumber = master && master.length ? master : baris;
  const p = new Map(), sec = new Map();
  sumber.forEach((x) => {
    const n = String(x.penyulang || '').trim();
    if (n && !p.has(kecil(n))) p.set(kecil(n), properNama(n));
    const s = String(x.section || '').trim();
    if (penyulang && s && kecil(n) === kecil(penyulang) && !sec.has(kecil(s))) sec.set(kecil(s), s);
  });
  const urut = (m) => [...m.values()].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  return { penyulang: urut(p), section: urut(sec) };
}

/** Saring baris realisasi: penyulang sama persis (huruf besar/kecil bebas); section sama, atau salah satu bagian "A / B". */
export function saringWorkplan(baris, { penyulang = '', section = '' } = {}) {
  const sec = kecil(section);
  return baris.filter((b) => (!penyulang || kecil(b.penyulang) === kecil(penyulang))
    && (!sec || kecil(b.section) === sec || kecil(b.section).split(/\s*\/\s*/).includes(sec)));
}

/** '2026-11-05' -> '05/11'. */
export const tglPendek = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? t.slice(8, 10) + '/' + t.slice(5, 7) : t || '');

/** Angka untuk sheet berlokal Indonesia (koma desimal). 0 / kosong = sel kosong. */
const sel = (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? '' : String(v).replace('.', ','));

/** Angka tampil (koma desimal), nol = tanda hubung. */
export const angkaWorkplan = (v) => (v === '' || v === null || v === undefined ? '' : Number(v) === 0 ? '-' : String(v).replace('.', ','));

/** Teks tempel (TSV) tabel yang tampil: baris judul (No ... tanggal ... Total) lalu satu baris per kegiatan. */
export function tsvWorkplan(baris, tanggal) {
  const kepala = ['No', 'Penyulang', 'Section', 'Jenis Kegiatan', 'Satuan', ...tanggal.map(tglPendek), 'Total'];
  return [kepala, ...baris.map((b, i) => [i + 1, b.penyulang, b.section, b.jenis, b.satuan, ...b.realisasi.map(sel), sel(b.total)])]
    .map((r) => r.join('\t')).join('\n');
}

/**
 * Review 8 Nov 2026 (desain ulang): rentang sel bergabung untuk tabel. Baris berurutan (server mengurut penyulang, section,
 * jenis) dengan penyulang sama = satu sel Penyulang (rowSpan), section sama dalam penyulang itu = satu sel Section.
 * -> per baris { penyulang: n, section: n } (n = rowSpan sel di baris itu, 0 = sel tidak digambar), plus grup (indeks grup
 * penyulang, untuk belang per penyulang).
 */
export function gabungWorkplan(baris) {
  const out = baris.map(() => ({ penyulang: 0, section: 0, grup: 0 }));
  let grup = -1;
  baris.forEach((b, i) => {
    const samaP = i > 0 && kecil(baris[i - 1].penyulang) === kecil(b.penyulang);
    if (!samaP) grup += 1;
    out[i].grup = grup;
    if (!samaP) {
      let n = 1;
      while (i + n < baris.length && kecil(baris[i + n].penyulang) === kecil(b.penyulang)) n += 1;
      out[i].penyulang = n;
    }
    if (!samaP || kecil(baris[i - 1].section) !== kecil(b.section)) {
      let n = 1;
      while (i + n < baris.length && kecil(baris[i + n].penyulang) === kecil(b.penyulang) && kecil(baris[i + n].section) === kecil(b.section)) n += 1;
      out[i].section = n;
    }
  });
  return out;
}

const bulat = (v) => Math.round(v * 100) / 100;

/** Total per tanggal (kolom) dan total semua baris yang tampil. */
export function totalWorkplan(baris, jumlahTanggal) {
  const kolom = Array.from({ length: jumlahTanggal }, (_, i) => bulat(baris.reduce((n, b) => n + (Number(b.realisasi[i]) || 0), 0)));
  return { kolom, semua: bulat(baris.reduce((n, b) => n + (Number(b.total) || 0), 0)) };
}

/** Ringkasan atas tabel: total per jenis kegiatan (urut jumlah) + banyak penyulang / section yang punya realisasi. */
export function ringkasWorkplan(baris) {
  const jenis = new Map(), peny = new Set(), sec = new Set();
  baris.forEach((b) => {
    const k = kecil(b.jenis) + '|' + kecil(b.satuan);
    const x = jenis.get(k) || { jenis: b.jenis, satuan: b.satuan, total: 0 };
    x.total = bulat(x.total + (Number(b.total) || 0));
    jenis.set(k, x);
    peny.add(kecil(b.penyulang));
    sec.add(kecil(b.penyulang) + '|' + kecil(b.section));
  });
  return { jenis: [...jenis.values()].sort((a, b) => b.total - a.total || a.jenis.localeCompare(b.jenis)), penyulang: peny.size, section: sec.size };
}

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
/** '2026-11-07' -> { hari: 'Sab', libur: true } (Sabtu / Minggu = akhir pekan). */
export function hariWorkplan(t) {
  const d = new Date(String(t) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return { hari: '', libur: false };
  const h = d.getUTCDay();
  return { hari: HARI_PENDEK[h], libur: h === 0 || h === 6 };
}
