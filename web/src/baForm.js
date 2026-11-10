/**
 * v1.0.47: form buat / ubah Berita Acara Gardu di website (mirror HP ba_pengoperasian_screen / ba_penggantian_screen /
 * ba_pemeriksaan_screen + ba_antrean), logika murni tanpa React. Server (simpanBaGardu / ubahBaGardu) tetap menegakkan
 * semua aturan; di sini hanya cek dini supaya admin tahu kolom mana yang salah sebelum mengirim.
 *
 * Foto website SELALU dari file (galeri / folder komputer). Guard: hanya JPEG / PNG / WebP (tipe, ekstensi, DAN isi
 * file dicek), lalu dikonversi ke JPEG <= 2048 px dan <= 2 MB di browser (batas uploadFotoBaGardu).
 */
import { JENIS_BA, SLOT_FOTO_BA, slotSwitching, swKerusakan, swSesudah } from './beritaAcara.js';

export const JENIS_FORM_BA = ['Pengoperasian Trafo', 'Penggantian Trafo', 'Pemeriksaan Trafo', ...JENIS_BA.SWITCHING];
/** v1.0.49: jenis switching (sama v1 swJenisSwitching). */
export const JENIS_ALAT_SWITCHING = ['LBS Motorized', 'Recloser', 'Fuse Cut Out (FCO)', 'Disconnecting Switch (DS)'];
export const baSwitching = (jenis) => JENIS_BA.SWITCHING.includes(jenis);
export const PREFIX_GARDU = ['TB', 'PY', 'TL', 'PG'];
export const KONSTRUKSI_BA = ['Portal', 'Cantol'];
export const KEPEMILIKAN_BA = ['PLN', 'Non-PLN'];
/** Merk trafo (sama v1 BA_MERK_TRAFO / HP merkTrafoBa); boleh ketik merk lain. */
export const MERK_TRAFO_BA = ['Alsthom Atlantique', 'Amtra Electric', 'B&D', 'Centrado', 'J&P', 'Lucky Light', 'Mastergreen', 'Maxima', 'Monata',
  'Morawa', 'Trafindo', 'Trafoindo', 'Triputra Electric Abadi', 'Schneider', 'Shenyang', 'Sintra', 'Starlite', 'Unindo', 'Voltra', 'Weltraf'];
export const KVA_STANDAR_BA = [25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000];
export const ASAL_TRAFO_BA = ['Gudang UP3 (Baru)', 'Gudang UP3 (Rekondisi)', 'Gudang ULP', 'Eks Bongkaran Gardu Lain'];

/** Slot foto per jenis: wajib + syarat tampil (sama HP). */
const WAJIB_FOTO = {
  'Pengoperasian Trafo': ['NAMEPLATE', 'FULL_GARDU', 'NAMEPLATE_PHB', 'BOX_PHB'],
  'Penggantian Trafo': ['NAMEPLATE', 'NAMEPLATE_SESUDAH'],
  'Pemeriksaan Trafo': [],
};
const FOTO_PHB_SESUDAH = ['NAMEPLATE_PHB_SESUDAH', 'BOX_PHB_SESUDAH'];

/** Slot yang tampil di form: [{ slot, label, wajib }]. Penggantian: foto PHB-TR sesudah hanya kalau PHB-TR diganti. */
export function slotFormBa(jenis, isi = {}) {
  if (baSwitching(jenis)) return slotSwitching(jenis).map(([slot, label, wajib]) => ({ slot, label, wajib }));
  return (SLOT_FOTO_BA[jenis] || [])
    .filter(([slot]) => jenis !== 'Penggantian Trafo' || !FOTO_PHB_SESUDAH.includes(slot) || isi.phbDiganti)
    .map(([slot, label]) => ({ slot, label, wajib: WAJIB_FOTO[jenis].includes(slot) }));
}

/** Pilihan kVA: standar + kVA bulat dari Master Gardu (1-5000), urut naik. */
export function pilihanKvaBa(master = []) {
  const s = new Set(KVA_STANDAR_BA);
  master.forEach((k) => { if (typeof k === 'number' && k >= 1 && k <= 5000 && Number.isInteger(k)) s.add(k); });
  return [...s].sort((a, b) => a - b);
}

/** Angka isian: koma = titik, kosong / "-" = null, bukan angka = NaN. */
export function angkaIsian(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s || s === '-') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Sama server (validasi_ tipe angka). '' = sah. */
export function cekAngka(v, { min, max, wajib = true, bulat = false }) {
  const n = angkaIsian(v);
  if (n === null) return wajib ? 'Wajib diisi' : '';
  if (Number.isNaN(n)) return 'Harus angka';
  if (bulat && !Number.isInteger(n)) return 'Harus angka bulat';
  if (n < min || n > max) return 'Harus ' + min + ' sampai ' + max;
  return '';
}

/** Koordinat "lat, lng" (tipe koordinat server). '' = sah. */
export function cekKoordinat(v, wajib = true) {
  const s = String(v ?? '').trim();
  if (!s) return wajib ? 'Wajib diisi' : '';
  const m = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) return 'Format: -3.012345, 106.456789';
  return '';
}

const teks = (v) => (v === null || v === undefined ? '' : String(v));
const angkaTeks = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : teks(v));

/** Isian kosong awal. */
export function isianAwalBa(hariIni) {
  return {
    tanggalBa: hariIni, tanggalPekerjaan: hariIni, prefix: '', nomorBatalId: '', garduId: '', penyulang: '', sectionId: '',
    alamat: '', koordinat: '', konstruksi: 'Portal', kva: '', merk: '', seri: '', tahun: '', jurusan: '',
    merkPhb: '', seriPhb: '', tahunPhb: '', kepemilikan: 'PLN', perluasanSutm: '', vendor: '', catatan: '',
    kvaSesudah: '', merkSesudah: '', seriSesudah: '', tahunSesudah: '', asalTrafo: 'Gudang UP3 (Rekondisi)', phbDiganti: false,
    merkPhbSesudah: '', seriPhbSesudah: '', tahunPhbSesudah: '', jurusanSesudah: '', kesimpulan: '', petugas1Id: '', petugas2Id: '',
    // v1.0.49 switching
    jenisSwitching: '', namaSwitching: '', tipe: '', kerusakan: '', jenisSwitchingSesudah: '', namaSwitchingSesudah: '',
    penyulangSesudah: '', sectionIdSesudah: '', tipeSesudah: '', koordinatSesudah: '', asalSwitching: '',
  };
}

/** Data trafo + PHB-TR dari satu gardu master (getMaster modul gardu) -> sebagian isian. */
export function isianDariGardu(g) {
  const k = (g.konstruksi || '').toLowerCase() === 'cantol' ? 'Cantol' : 'Portal';
  const koordinat = typeof g.lat === 'number' && typeof g.lng === 'number' ? g.lat + ', ' + g.lng : '';
  return {
    garduId: g.id, penyulang: teks(g.penyulang), sectionId: teks(g.sectionId), alamat: teks(g.alamat), koordinat, konstruksi: k,
    kva: angkaTeks(g.kva), merk: teks(g.merk), seri: teks(g.seri), tahun: teks(g.tahun), jurusan: teks(g.jurusan),
    merkPhb: teks(g.merkPhb), seriPhb: teks(g.seriPhb), tahunPhb: teks(g.tahunPhb),
    kepemilikan: String(g.kepemilikan || '').startsWith('Non') ? 'Non-PLN' : 'PLN',
    // PHB-TR sesudah = PHB-TR sekarang sampai dicentang diganti
    merkPhbSesudah: teks(g.merkPhb), seriPhbSesudah: teks(g.seriPhb), tahunPhbSesudah: teks(g.tahunPhb), jurusanSesudah: teks(g.jurusan),
  };
}

/** Isian dari getBaGardu (mode ubah). */
export function isianDariDetail(d, hariIni) {
  const a = isianAwalBa(hariIni);
  const ambil = (k) => teks(d[k]);
  const angka = (k) => angkaTeks(d[k]);
  return {
    ...a, tanggalBa: ambil('tanggalBa').slice(0, 10) || hariIni, tanggalPekerjaan: ambil('tanggalPekerjaan').slice(0, 10) || hariIni, garduId: ambil('garduId'),
    penyulang: ambil('penyulang'), sectionId: ambil('sectionId'), alamat: ambil('alamat'), koordinat: ambil('koordinat'),
    konstruksi: ambil('konstruksi') === 'Cantol' ? 'Cantol' : 'Portal', kva: angka('kva'), merk: ambil('merk'), seri: ambil('seri'),
    tahun: angka('tahun'), jurusan: angka('jurusan'), merkPhb: ambil('merkPhb'), seriPhb: ambil('seriPhb'), tahunPhb: angka('tahunPhb'),
    kepemilikan: ambil('kepemilikan').startsWith('Non') ? 'Non-PLN' : 'PLN', perluasanSutm: angka('perluasanSutm'),
    vendor: ambil('vendor'), catatan: ambil('catatan'), kesimpulan: ambil('kesimpulan'),
    kvaSesudah: angka('kvaSesudah'), merkSesudah: ambil('merkSesudah'), seriSesudah: ambil('seriSesudah'), tahunSesudah: angka('tahunSesudah'),
    asalTrafo: ambil('asalTrafo') || a.asalTrafo, phbDiganti: d.phbDiganti === true,
    merkPhbSesudah: ambil('merkPhbSesudah'), seriPhbSesudah: ambil('seriPhbSesudah'), tahunPhbSesudah: angka('tahunPhbSesudah'),
    jurusanSesudah: angka('jurusanSesudah') || angka('jurusan'), petugas1Id: ambil('petugas1Id'), petugas2Id: ambil('petugas2Id'),
    jenisSwitching: ambil('jenisSwitching'), namaSwitching: ambil('namaSwitching'), tipe: ambil('tipe'), kerusakan: ambil('kerusakan'),
    jenisSwitchingSesudah: ambil('jenisSwitchingSesudah'), namaSwitchingSesudah: ambil('namaSwitchingSesudah'),
    penyulangSesudah: ambil('penyulangSesudah'), sectionIdSesudah: ambil('sectionIdSesudah'), tipeSesudah: ambil('tipeSesudah'),
    koordinatSesudah: ambil('koordinatSesudah'), asalSwitching: ambil('asalSwitching'),
  };
}

/**
 * Isian salah pertama, urut dari atas form (sama HP _isianSalah + cekKelengkapan*). null = siap kirim.
 * foto = Set slot yang terisi (baru atau sudah tersimpan di server). edit = nomor / gardu / tanggal BA tetap.
 */
export function galatIsianBa(jenis, isi, foto, { edit = false, tahunIni = new Date().getFullYear() } = {}) {
  const wajib = (v) => (String(v ?? '').trim() ? '' : 'Wajib diisi');
  if (baSwitching(jenis)) return galatSwitching(jenis, isi, foto, wajib);
  const tahun = (v, w = true) => cekAngka(v, { min: 1950, max: tahunIni + 1, bulat: true, wajib: w });
  const operasi = jenis === 'Pengoperasian Trafo';
  const aturan = [
    ...(edit ? [] : operasi ? [['prefix', 'Kode Gardu', () => (isi.prefix ? '' : 'Pilih kode gardu (prefix) dulu')]]
      : [['garduId', 'Gardu', () => (isi.garduId ? '' : 'Pilih gardu dari Master Gardu dulu')]]),
    ['tanggalPekerjaan', 'Tanggal Pekerjaan', () => (isi.tanggalPekerjaan > isi.tanggalBa ? 'Tidak boleh sesudah Tanggal BA' : '')],
    ...(operasi ? [['sectionId', 'Section', () => (isi.sectionId ? '' : 'Pilih penyulang dan section')]] : []),
    ['kva', 'Kapasitas', () => cekAngka(isi.kva, { min: 1, max: 5000 })],
    ['merk', 'Merk trafo', () => wajib(isi.merk)],
    ['seri', 'Nomor Seri', () => wajib(isi.seri)],
    ['tahun', 'Tahun trafo', () => tahun(isi.tahun)],
    ['koordinat', 'Koordinat', () => cekKoordinat(isi.koordinat, operasi)],
    ['jurusan', 'Jurusan Terpasang', () => cekAngka(isi.jurusan, { min: 1, max: 12, bulat: true })],
    ['alamat', 'Alamat', () => wajib(isi.alamat)],
    ['tahunPhb', 'Tahun PHB-TR', () => tahun(isi.tahunPhb, false)],
    ...(operasi ? [['perluasanSutm', 'Panjang Perluasan SUTM', () => cekAngka(isi.perluasanSutm, { min: 0, max: 100, wajib: false })]] : []),
    ...(jenis === 'Penggantian Trafo' ? [
      ['kvaSesudah', 'Kapasitas Sesudah', () => cekAngka(isi.kvaSesudah, { min: 1, max: 5000 })],
      ['merkSesudah', 'Merk Trafo Sesudah', () => wajib(isi.merkSesudah)],
      ['seriSesudah', 'Nomor Seri Sesudah', () => wajib(isi.seriSesudah)],
      ['tahunSesudah', 'Tahun Trafo Sesudah', () => tahun(isi.tahunSesudah)],
      ['asalTrafo', 'Asal Trafo', () => wajib(isi.asalTrafo)],
      ...(isi.phbDiganti ? [
        ['tahunPhbSesudah', 'Tahun PHB-TR Sesudah', () => tahun(isi.tahunPhbSesudah, false)],
        ['jurusanSesudah', 'Jumlah Jurusan Sesudah', () => cekAngka(isi.jurusanSesudah, { min: 1, max: 12, bulat: true })],
      ] : []),
    ] : []),
    ['foto', 'Foto', () => {
      const kurang = slotFormBa(jenis, isi).filter((s) => s.wajib && !foto.has(s.slot)).map((s) => s.label);
      return kurang.length ? 'Belum lengkap: ' + kurang.join(', ') : '';
    }],
    ['petugas1Id', 'Petugas 1', () => (isi.petugas1Id ? '' : 'Pilih Petugas 1')],
    ['petugas2Id', 'Petugas 2', () => (isi.petugas2Id && isi.petugas2Id === isi.petugas1Id ? 'Tidak boleh sama dengan Petugas 1' : '')],
  ];
  for (const [kolom, label, cek] of aturan) {
    const g = cek();
    if (g) return { kolom, pesan: label + ': ' + g };
  }
  return null;
}

/** v1.0.49 cek isian switching (sama fieldSwitchingBa_ server). */
function galatSwitching(jenis, isi, foto, wajib) {
  const aturan = [
    ['tanggalPekerjaan', 'Tanggal Pekerjaan', () => (isi.tanggalPekerjaan > isi.tanggalBa ? 'Tidak boleh sesudah Tanggal BA' : '')],
    ['jenisSwitching', 'Jenis Switching', () => (isi.jenisSwitching ? '' : 'Wajib dipilih')],
    ['namaSwitching', 'Nama Switching', () => wajib(isi.namaSwitching)],
    ['sectionId', 'Section', () => (isi.sectionId ? '' : 'Pilih penyulang dan section')],
    ['koordinat', 'Koordinat', () => cekKoordinat(isi.koordinat, false)],
    ...(swSesudah(jenis) ? [
      ['jenisSwitchingSesudah', 'Jenis Switching Sesudah', () => (isi.jenisSwitchingSesudah ? '' : 'Wajib dipilih')],
      ['namaSwitchingSesudah', 'Nama Switching Sesudah', () => wajib(isi.namaSwitchingSesudah)],
      ['sectionIdSesudah', 'Section Sesudah', () => (isi.sectionIdSesudah ? '' : 'Pilih penyulang dan section sesudah')],
      ['koordinatSesudah', 'Koordinat Sesudah', () => cekKoordinat(isi.koordinatSesudah, false)],
    ] : []),
    ['foto', 'Foto', () => {
      const kurang = slotFormBa(jenis).filter((s) => s.wajib && !foto.has(s.slot)).map((s) => s.label);
      return kurang.length ? 'Belum lengkap: ' + kurang.join(', ') : '';
    }],
    ['petugas1Id', 'Petugas 1', () => (isi.petugas1Id ? '' : 'Pilih Petugas 1')],
    ['petugas2Id', 'Petugas 2', () => (isi.petugas2Id && isi.petugas2Id === isi.petugas1Id ? 'Tidak boleh sama dengan Petugas 1' : '')],
  ];
  for (const [kolom, label, cek] of aturan) {
    const g = cek();
    if (g) return { kolom, pesan: label + ': ' + g };
  }
  return null;
}

/** v1.0.49 data simpanBaGardu switching. Opsional kosong tetap dikirim '' (ubah: boleh dikosongkan). */
function dataSwitching(jenis, baId, isi) {
  const t = (v) => String(v ?? '').trim();
  const ko = (v) => (cekKoordinat(v) === '' ? t(v).replace(/\s*,\s*/, ', ') : undefined);
  const d = {
    baId, jenis, tanggalBa: isi.tanggalBa, tanggalPekerjaan: isi.tanggalPekerjaan, jenisSwitching: isi.jenisSwitching,
    namaSwitching: t(isi.namaSwitching), sectionId: isi.sectionId, merk: t(isi.merk), tipe: t(isi.tipe), seri: t(isi.seri),
    catatan: t(isi.catatan), petugas1Id: isi.petugas1Id,
  };
  if (isi.petugas2Id) d.petugas2Id = isi.petugas2Id;
  if (ko(isi.koordinat)) d.koordinat = ko(isi.koordinat);
  if (swKerusakan(jenis)) d.kerusakan = t(isi.kerusakan);
  if (swSesudah(jenis)) {
    Object.assign(d, { jenisSwitchingSesudah: isi.jenisSwitchingSesudah, namaSwitchingSesudah: t(isi.namaSwitchingSesudah),
      sectionIdSesudah: isi.sectionIdSesudah, merkSesudah: t(isi.merkSesudah), tipeSesudah: t(isi.tipeSesudah),
      seriSesudah: t(isi.seriSesudah), asalSwitching: t(isi.asalSwitching) });
    if (ko(isi.koordinatSesudah)) d.koordinatSesudah = ko(isi.koordinatSesudah);
  }
  return d;
}

/** Isian -> data simpanBaGardu (sama HP _isi). Kunci kosong opsional tidak dikirim. */
export function dataSimpanBa(jenis, baId, isi) {
  if (baSwitching(jenis)) return dataSwitching(jenis, baId, isi);
  const n = (v) => { const x = angkaIsian(v); return x === null || Number.isNaN(x) ? undefined : x; };
  const t = (v) => String(v ?? '').trim();
  const opsi = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  const umum = {
    baId, jenis, tanggalBa: isi.tanggalBa, tanggalPekerjaan: isi.tanggalPekerjaan, alamat: t(isi.alamat), konstruksi: isi.konstruksi,
    kva: n(isi.kva), merk: t(isi.merk), seri: t(isi.seri), tahun: n(isi.tahun), jurusan: n(isi.jurusan),
    merkPhb: t(isi.merkPhb), seriPhb: t(isi.seriPhb), tahunPhb: n(isi.tahunPhb), catatan: t(isi.catatan),
    petugas1Id: isi.petugas1Id, petugas2Id: isi.petugas2Id || undefined,
  };
  if (cekKoordinat(isi.koordinat) === '') umum.koordinat = t(isi.koordinat).replace(/\s*,\s*/, ', ');
  if (jenis === 'Pengoperasian Trafo') {
    return opsi({ ...umum, prefix: isi.prefix, nomorBatalId: isi.nomorBatalId || undefined, sectionId: isi.sectionId,
      kepemilikan: isi.kepemilikan, perluasanSutm: n(isi.perluasanSutm), vendor: t(isi.vendor) });
  }
  const gardu = { garduId: isi.garduId, sectionId: isi.sectionId || undefined };
  if (jenis === 'Pemeriksaan Trafo') {
    // kosong tetap dikirim: kesimpulan / catatan / PHB-TR boleh dikosongkan saat ubah
    return { ...opsi({ ...umum, ...gardu }), merkPhb: t(isi.merkPhb), seriPhb: t(isi.seriPhb), kesimpulan: t(isi.kesimpulan), catatan: t(isi.catatan) };
  }
  const ganti = !!isi.phbDiganti;
  const pilih = (sesudah, sebelum) => (ganti && t(sesudah) ? t(sesudah) : t(sebelum));
  return opsi({
    ...umum, ...gardu, kepemilikan: isi.kepemilikan, vendor: t(isi.vendor),
    kvaSesudah: n(isi.kvaSesudah), merkSesudah: t(isi.merkSesudah), seriSesudah: t(isi.seriSesudah), tahunSesudah: n(isi.tahunSesudah),
    asalTrafo: t(isi.asalTrafo), phbDiganti: ganti,
    merkPhbSesudah: pilih(isi.merkPhbSesudah, isi.merkPhb), seriPhbSesudah: pilih(isi.seriPhbSesudah, isi.seriPhb),
    tahunPhbSesudah: ganti && n(isi.tahunPhbSesudah) !== undefined ? n(isi.tahunPhbSesudah) : n(isi.tahunPhb),
    jurusanSesudah: ganti ? (n(isi.jurusanSesudah) ?? n(isi.jurusan)) : n(isi.jurusan),
  });
}

/** Data ubahBaGardu: tanpa jenis / nomor / gardu / Tanggal BA (tetap), + revision. */
export function dataUbahBa(jenis, baId, isi, revision) {
  const { jenis: _j, prefix: _p, nomorBatalId: _n, garduId: _g, tanggalBa: _t, ...sisa } = dataSimpanBa(jenis, baId, isi);
  return { ...sisa, revision };
}

// ---------------- foto ----------------

export const FOTO_BA_MAKS_MASUK = 25 * 1024 * 1024;   // file asli dari komputer / galeri
export const FOTO_BA_MAKS_BYTE = 2 * 1024 * 1024;     // = FOTO_MAKS_BYTE_ server
export const FOTO_BA_MAKS_SISI = 2048;                // = FOTO_MAKS_SISI_ server
export const TERIMA_FOTO_BA = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const TIPE_FOTO = { 'image/jpeg': 'JPEG', 'image/jpg': 'JPEG', 'image/pjpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP' };
const EKSTENSI_FOTO = { jpg: 'JPEG', jpeg: 'JPEG', jfif: 'JPEG', png: 'PNG', webp: 'WEBP' };

/** Jenis gambar dari byte awal (tanda tangan file), null = bukan foto yang diterima. */
export function jenisGambarBytes(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'JPEG';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'PNG';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'WEBP';
  return null;
}

/**
 * Guard foto: tipe MIME, ekstensi, ukuran, dan isi file (byte awal) harus foto JPEG / PNG / WebP. '' = boleh.
 * b = 16 byte awal file (Uint8Array).
 */
export function galatFileFoto(nama, tipe, ukuran, b) {
  const ext = String(nama || '').toLowerCase().split('.').pop();
  const dariTipe = TIPE_FOTO[String(tipe || '').toLowerCase()];
  if (!dariTipe || !EKSTENSI_FOTO[ext]) return 'Hanya file foto JPG, PNG, atau WebP.';
  if (!ukuran) return 'File kosong.';
  if (ukuran > FOTO_BA_MAKS_MASUK) return 'File terlalu besar (maks 25 MB).';
  if (!jenisGambarBytes(b)) return 'Isi file bukan foto (JPG / PNG / WebP).';
  return '';
}

/** Ukuran gambar sesudah diperkecil (sisi terpanjang <= maks), bulat. */
export function skalaFoto(lebar, tinggi, maks = FOTO_BA_MAKS_SISI) {
  const s = Math.min(1, maks / Math.max(lebar, tinggi));
  return { lebar: Math.max(1, Math.round(lebar * s)), tinggi: Math.max(1, Math.round(tinggi * s)) };
}

/**
 * Browser: File -> { jpeg: Uint8Array, url (pratinjau) }. Gagal dibaca sebagai gambar = Error (pesan siap tampil).
 * Foto diputar sesuai EXIF (createImageBitmap imageOrientation), diperkecil, lalu JPEG; mutu diturunkan sampai <= 2 MB.
 */
export async function fotoKeJpegBa(file) {
  const awal = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const galat = galatFileFoto(file.name, file.type, file.size, awal);
  if (galat) throw new Error(galat);
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('Foto tidak bisa dibaca (rusak / bukan foto).'); }
  const { lebar, tinggi } = skalaFoto(bmp.width, bmp.height);
  const kanvas = document.createElement('canvas');
  kanvas.width = lebar; kanvas.height = tinggi;
  const ctx = kanvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lebar, tinggi);   // PNG transparan = latar putih
  ctx.drawImage(bmp, 0, 0, lebar, tinggi);
  if (bmp.close) bmp.close();
  for (const mutu of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise((ok) => kanvas.toBlob(ok, 'image/jpeg', mutu));
    if (!blob) break;
    if (blob.size <= FOTO_BA_MAKS_BYTE) return { jpeg: new Uint8Array(await blob.arrayBuffer()), url: URL.createObjectURL(blob) };
  }
  throw new Error('Foto terlalu besar sesudah diperkecil. Pakai foto lain.');
}
