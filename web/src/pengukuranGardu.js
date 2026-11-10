/**
 * Pengukuran Gardu (menu OPS_PENGUKURAN_GARDU), logika murni tanpa React.
 *  - daftar gardu dari getMaster modul `gardu` (sama HP), riwayat dari getRiwayatGardu (3 sumber),
 *    updateUkurMasterGardu (satu pengukuran riwayat -> db_Gardu);
 *  - form Update Data Gardu v1 (HI, 182 isian, hiGardu.def.js): getHiGardu / updateHiGardu. v1.0.35 (keputusan Master Guswan
 *    26 Okt 2026): db_Gardu sumber utama, website menulis db_Gardu; server lalu menulis gardu itu ke 3 file sheet lama
 *    (Master HI Toboali, Master HI HP, Master HI UP3) yang mengikuti db_Gardu.
 */
import { TAB_HI } from './hiGardu.def.js';

export const MENU_UKUR = 'OPS_PENGUKURAN_GARDU';
export const SUMBER_UPDATE = ['Pengecekan Gardu Yandal', 'Inspeksi Gardu'];
export const FILE_HI = ['Master HI Toboali', 'Master HI HP', 'Master HI UP3'];
export const MAKS_DAFTAR = 200;

export const semuaIsianHi = (def = TAB_HI) => def.flatMap((t) => t.seksi.flatMap((s) => s.fields));

/** Cari gardu: nomor (tanpa tanda baca), alamat, penyulang, section. status '' = semua. Urut nomor. */
export function cariGardu(daftar, kata = '', status = 'AKTIF') {
  const k = String(kata).trim().toLowerCase(), kNo = k.replace(/[\s\-_.]/g, '');
  return daftar.filter((g) => (!status || g.status === status) && (!k
    || String(g.no).toLowerCase().includes(kNo)
    || [g.alamat, g.penyulang, g.section].some((v) => String(v || '').toLowerCase().includes(k))))
    .sort((a, b) => String(a.no).localeCompare(String(b.no)));
}

/** Nilai awal form dari jawaban getHiGardu (nilai per kunci isian): { col: teks } untuk <input> / <select>. */
export function nilaiAwalHi(h, def = TAB_HI) {
  const o = {};
  semuaIsianHi(def).forEach((f) => {
    const v = h?.nilai?.[f.col];
    o[f.col] = v === null || v === undefined ? '' : String(v);
  });
  return o;
}

/** Isian yang berubah dibanding nilai awal (kunci col). */
export const isianBerubah = (awal, nilai) => Object.keys(nilai).filter((k) => String(nilai[k]) !== String(awal[k] ?? ''));

/** Nilai satu isian untuk dikirim: number = angka (kosong = ''), lainnya teks rapi. */
function nilaiKirim(f, v) {
  const s = String(v ?? '').trim();
  if (f.tipe === 'number') return s === '' ? '' : (Number.isFinite(Number(s.replace(',', '.'))) ? Number(s.replace(',', '.')) : s);
  return s;
}

/**
 * Kiriman updateHiGardu: hanya isian yang berubah dibanding nilai awal (db_Gardu), per kunci isian v1, + revision baris
 * db_Gardu saat form dimuat (beda di server = KONFLIK_REVISION). Isian terkunci (Nomor Gardu, ULP) tidak pernah dikirim.
 */
export function payloadHi(noGardu, revision, awal, nilai, def = TAB_HI) {
  const p = { noGardu, revision, nilai: {} };
  semuaIsianHi(def).forEach((f) => {
    if (f.mati || String(nilai[f.col] ?? '') === String(awal[f.col] ?? '')) return;
    p.nilai[f.col] = nilaiKirim(f, nilai[f.col]);
  });
  return p;
}

/** Galat isian angka (bukan angka) per col. Kosong = valid. */
export function galatHi(nilai, def = TAB_HI) {
  const g = {};
  semuaIsianHi(def).forEach((f) => {
    if (f.mati || f.tipe !== 'number') return;
    const s = String(nilai[f.col] ?? '').trim();
    if (s && !Number.isFinite(Number(s.replace(',', '.')))) g[f.col] = 'Isi angka';
    else if (s && f.min !== undefined && Number(s.replace(',', '.')) < Number(f.min)) g[f.col] = 'Minimal ' + f.min;
  });
  return g;
}

/** Pilihan <select>: pilihan v1 + nilai sekarang kalau tidak ada di daftar (nilai lama di sheet tetap tampil). */
export function pilihanIsian(pilihan, nilai) {
  const p = [...(pilihan || [])];
  if (nilai && !p.includes(nilai)) p.unshift(nilai);
  return p;
}

/**
 * Ringkasan hasil updateHiGardu per file (seperti popup v1: nama gsheet + centang). ok = semua tab file itu tertulis
 * (atau memang tidak ada isiannya); lewat = file belum diatur di server.
 */
export function ringkasHasilHi(hasil) {
  return FILE_HI.map((nama) => {
    const tab = (hasil || []).filter((r) => r.file === nama);
    const lewat = tab.length > 0 && tab.every((r) => r.lewat && !r.ok);
    return { nama, ok: tab.length > 0 && tab.every((r) => r.ok), lewat, jumlah: tab.reduce((n, r) => n + (r.jumlah || 0), 0), tab };
  });
}

/** Satu pengukuran riwayat bisa dijadikan pengukuran Master Gardu (sumber Yandal / Inspeksi Gardu, ada ukurId + periode). */
export const bisaUpdateUkur = (u) => SUMBER_UPDATE.includes(u.sumber) && !!u.ukurId && (u.periode === 'LWBP' || u.periode === 'WBP');

export const dataUpdateUkur = (gardu, u) => ({ garduId: gardu.id, noGardu: gardu.no, sumber: u.sumber, ukurId: u.ukurId, periode: u.periode });

/** Pengukuran riwayat ini yang sekarang tercatat di Master Gardu? (kode sama dengan blok periodenya). */
export function sudahDiMaster(gardu, u) {
  const blok = u.periode === 'LWBP' ? gardu?.lwbp : gardu;
  return !!(blok && u.kode && blok.kodeUkur === u.kode);
}

/** Warna kategori beban server (kategoriBeban_: Underload < 50%, Cukup < 80%, Overload < 100%, Buruk): badge k-badge--*. */
export function jenisKategori(k) {
  const t = String(k || '').toLowerCase();
  if (t === 'overload' || t === 'buruk') return 'belum';
  if (t === 'underload') return 'proses';
  if (t === 'cukup') return 'ok';
  return 'v1';
}

const FASA = ['R', 'S', 'T', 'N'];

/**
 * v1.0.36: isian per fasa ("Jurusan A R", "Bushing TM S", "R") disusun jadi tabel baris x fasa agar mudah diisi.
 * Semua label harus berakhiran fasa; selain itu null (tampil sebagai grid biasa). Murni (diuji).
 * -> { kolom: ['R','S','T',...], baris: [{ nama, sel: { R: field, ... } }] }
 */
export function matriksFasa(fields) {
  if (!fields || fields.length < 3) return null;
  const baris = [], per = {}, ada = new Set();
  for (const f of fields) {
    const m = /^(?:(.*\S)\s+)?([RSTN])$/.exec(String(f.label || '').trim());
    if (!m) return null;
    const nama = m[1] || '';
    if (/[-–]$/.test(nama)) return null;   // 'R - S' = tegangan antar fasa, bukan per fasa
    if (!per[nama]) { per[nama] = { nama, sel: {} }; baris.push(per[nama]); }
    if (per[nama].sel[m[2]]) return null;
    per[nama].sel[m[2]] = f;
    ada.add(m[2]);
  }
  return { kolom: FASA.filter((x) => ada.has(x)), baris };
}

/** Jumlah isian terisi (tidak kosong) dari daftar field. */
export const jumlahTerisi = (fields, nilai) => fields.filter((f) => String(nilai[f.col] ?? '').trim() !== '').length;
