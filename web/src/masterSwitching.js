/**
 * Master Switching (menu OPS_MASTER_SWITCHING, ADMIN / SUPER): logika murni tanpa React (diuji di test/masterSwitching.test.js).
 * Mirror HP (mobile/lib/features/switching/switching_model.dart). Data = getMasterSwitching { switching, jaringan, waktu }.
 */

export const MENU_SWITCHING = 'OPS_MASTER_SWITCHING';

/** Jenis peralatan: label + warna titik peta / lencana (sama dengan HP). bisaTrip = bawaan isian. */
export const JENIS_SWITCHING = [
  { kode: 'PMT', label: 'PMT', nama: 'Pemutus (PMT)', warna: '#7c3aed', bisaTrip: true },
  { kode: 'ACR', label: 'ACR', nama: 'Recloser (ACR)', warna: '#a8433f', bisaTrip: true },
  { kode: 'SSO', label: 'SSO', nama: 'Sectionalizer (SSO)', warna: '#ea580c', bisaTrip: false },
  { kode: 'LBS', label: 'LBS', nama: 'Load Break Switch (LBS)', warna: '#1d6a73', bisaTrip: false },
  { kode: 'FCO', label: 'FCO', nama: 'Fuse Cut Out (FCO)', warna: '#3a6f1f', bisaTrip: true },
  { kode: 'DS', label: 'DS', nama: 'Disconnecting Switch (DS)', warna: '#5b6f6b', bisaTrip: false },
];
export const infoJenis = (kode) => JENIS_SWITCHING.find((j) => j.kode === kode) || { kode, label: kode || '-', nama: kode || '-', warna: '#5b6f6b', bisaTrip: false };

export const STATUS_VERIFIKASI = {
  TERVERIFIKASI: { label: 'Terverifikasi', kelas: 'ok' },
  PERLU_PERBAIKAN: { label: 'Perlu perbaikan', kelas: 'proses' },
  BELUM: { label: 'Belum diverifikasi', kelas: 'belum' },
};
export const infoStatus = (s) => STATUS_VERIFIKASI[s] || STATUS_VERIFIKASI.BELUM;

/** Pilihan isian (kode server -> label). Urutan = urutan tampil. */
export const PILIHAN = {
  posisiNormal: [['NC', 'Normal tertutup (NC)'], ['NO', 'Normal terbuka (NO)']],
  statusOperasi: [['OPERASI', 'Operasi'], ['TIDAK_OPERASI', 'Tidak operasi'], ['DIBONGKAR', 'Dibongkar']],
  kondisi: [['BAIK', 'Baik'], ['PERLU_PERBAIKAN', 'Perlu perbaikan'], ['RUSAK', 'Rusak']],
  media: [['VAKUM', 'Vakum'], ['SF6', 'SF6'], ['MINYAK', 'Minyak'], ['UDARA', 'Udara']],
  penggerak: [['MANUAL', 'Manual'], ['MOTOR', 'Motor']],
  mediaKomunikasi: [['GSM', 'GSM'], ['RADIO', 'Radio'], ['FO', 'Fiber optik']],
  fungsiFco: [['CABANG', 'Percabangan'], ['GARDU', 'Gardu']],
  fuseTipe: [['K', 'K'], ['T', 'T'], ['H', 'H']],
  statusVerifikasi: [['TERVERIFIKASI', 'Terverifikasi'], ['PERLU_PERBAIKAN', 'Perlu perbaikan']],
};
export const labelPilihan = (kunci, kode) => (PILIHAN[kunci] || []).find((p) => p[0] === kode)?.[1] || '';

export const SLOT_FOTO = [['UNIT', 'Unit'], ['NAMEPLATE', 'Nameplate'], ['KONTROLER', 'Layar kontroler']];

const teks = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** Koordinat switching -> [lat, lng] atau null. */
export function titikSwitching(s) {
  const lat = Number(s?.lat), lng = Number(s?.lng);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0) || s?.lat === null || s?.lng === null) return null;
  return [lat, lng];
}

/** Label switching untuk pilihan: jenis tidak diulang bila nama sudah diawali jenis ("PMT" + "PMT Palas" -> "PMT Palas"). */
export const labelSwitching = (jenis, nama) => (String(nama || '').toUpperCase().startsWith(String(jenis || '').toUpperCase()) ? String(nama || '') : (String(jenis || '') + ' ' + String(nama || '')).trim());

/** Daftar penyulang unik dari jaringan (urut abjad). */
export const daftarPenyulang = (jaringan) => [...new Set((jaringan || []).map((j) => teks(j.penyulang)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Section milik [penyulang]. */
export const sectionPenyulang = (jaringan, penyulang) => (jaringan || []).filter((j) => teks(j.penyulang) === teks(penyulang));

/**
 * Saring di browser: { jenis: kode | '', penyulang: '', status: kode | '', cari: '', nonaktif: bool }. Baris nonaktif
 * hanya tampil bila nonaktif = true. Cari = nama, ID, penyulang, merk kontroler, kode aset.
 */
export function saringSwitching(daftar, { jenis = '', penyulang = '', status = '', cari = '', nonaktif = false } = {}) {
  const c = teks(cari).toLowerCase();
  return (daftar || []).filter((s) => (nonaktif ? !s.aktif : s.aktif)
    && (!jenis || s.jenis === jenis)
    && (!penyulang || teks(s.penyulang) === penyulang)
    && (!status || (s.statusVerifikasi || 'BELUM') === status)
    && (!c || [s.nama, s.switchingId, s.penyulang, s.merkKontroler, s.kodeAset].some((v) => teks(v).toLowerCase().includes(c))));
}

/** Ringkasan baris aktif: total, per status verifikasi, per jenis, tanpa koordinat, nonaktif. */
export function ringkasSwitching(daftar) {
  const r = { total: 0, TERVERIFIKASI: 0, PERLU_PERBAIKAN: 0, BELUM: 0, jenis: {}, tanpaTitik: 0, nonaktif: 0 };
  JENIS_SWITCHING.forEach((j) => { r.jenis[j.kode] = 0; });
  (daftar || []).forEach((s) => {
    if (!s.aktif) { r.nonaktif += 1; return; }
    r.total += 1;
    const st = STATUS_VERIFIKASI[s.statusVerifikasi] ? s.statusVerifikasi : 'BELUM';
    r[st] += 1;
    r.jenis[s.jenis] = (r.jenis[s.jenis] || 0) + 1;
    if (!titikSwitching(s)) r.tanpaTitik += 1;
  });
  return r;
}

/** Persen terverifikasi (bulat), 0 bila belum ada data. */
export const persenTerverifikasi = (r) => (r && r.total ? Math.round((r.TERVERIFIKASI / r.total) * 100) : 0);

/** Isian form kosong (baris baru). */
export function isianBaru(penyulang = '') {
  return {
    switchingId: '', revision: null, jenis: 'LBS', nama: '', penyulang, sectionId: '', koordinat: '', posisiNormal: 'NC', statusOperasi: 'OPERASI',
    kondisi: '', kodeAset: '', merkKontroler: '', tipeKontroler: '', versiFirmware: '', rasioCt: '', rasioVt: '', merk: '', tipe: '', nomorSeri: '',
    tahunPasang: '', ratingKv: '', ratingA: '', kapasitasPutusKa: '', media: '', penggerak: '', tiangId: '', switchingHuluId: '',
    titikHubung: false, tiangSisiA: '', tiangSisiB: '', penyulangSisiB: '', bisaTrip: infoJenis('LBS').bisaTrip, catatGangguan: false, bacaArus: false,
    bacaTegangan: false, terhubungScada: false, kodeRtu: '', mediaKomunikasi: '', fungsiFco: '', fuseTipe: '', fuseRating: '', catatan: '',
    statusVerifikasi: 'TERVERIFIKASI', aktif: true, bisaTripDiubah: false,
  };
}

/** Objek server -> isian form (angka kosong = '', koordinat teks). */
export function isianDari(s) {
  const o = { ...isianBaru(), ...s };
  ['tahunPasang', 'ratingKv', 'ratingA', 'kapasitasPutusKa'].forEach((k) => { o[k] = s[k] === null || s[k] === undefined ? '' : String(s[k]); });
  o.koordinat = titikSwitching(s) ? `${s.lat}, ${s.lng}` : '';
  o.statusVerifikasi = s.statusVerifikasi === 'PERLU_PERBAIKAN' ? 'PERLU_PERBAIKAN' : 'TERVERIFIKASI';
  o.bisaTripDiubah = true;
  delete o.foto; delete o.lat; delete o.lng; delete o.proteksiHuluId; delete o.verifikasiTerakhir; delete o.diubahPada;
  return o;
}

/** Ganti jenis: bisaTrip mengikuti bawaan jenis selama admin belum mengubahnya sendiri. */
export function gantiJenis(isian, jenis) {
  return { ...isian, jenis, bisaTrip: isian.bisaTripDiubah ? isian.bisaTrip : infoJenis(jenis).bisaTrip };
}

const POLA_KOORD = /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/;
const ANGKA = ['tahunPasang', 'ratingKv', 'ratingA', 'kapasitasPutusKa'];

/** Galat per kolom sebelum dikirim (server tetap memeriksa ulang). Hasil {kolom: pesan}, kosong = boleh dikirim. */
export function cekIsian(i, jaringan) {
  const g = {};
  if (!teks(i.nama)) g.nama = 'Nama wajib diisi.';
  if (!daftarPenyulang(jaringan).includes(teks(i.penyulang))) g.penyulang = 'Pilih penyulang dari daftar.';
  if (!POLA_KOORD.test(teks(i.koordinat))) g.koordinat = 'Format "lat, lng", mis. -3.012345, 106.512345.';
  if (i.titikHubung && (!teks(i.penyulangSisiB) || teks(i.penyulangSisiB) === teks(i.penyulang))) g.penyulangSisiB = 'Pilih penyulang sisi lain (beda dengan penyulang).';
  ANGKA.forEach((k) => { if (teks(i[k]) && !/^\d+(\.\d+)?$/.test(teks(i[k]))) g[k] = 'Isi angka saja.'; });
  if (teks(i.tahunPasang) && /^\d+$/.test(teks(i.tahunPasang)) && (Number(i.tahunPasang) < 1950 || Number(i.tahunPasang) > 2100)) g.tahunPasang = 'Tahun 1950 - 2100.';
  if (i.switchingHuluId && i.switchingHuluId === i.switchingId) g.switchingHuluId = 'Tidak boleh dirinya sendiri.';
  return g;
}

/** Isian form -> payload simpanSwitching (kolom kosong tidak dikirim, angka jadi Number, kolom yang tidak berlaku dibuang). */
export function payloadSimpan(i) {
  const p = {};
  const salin = ['jenis', 'nama', 'penyulang', 'sectionId', 'koordinat', 'posisiNormal', 'statusOperasi', 'kondisi', 'kodeAset', 'merkKontroler',
    'tipeKontroler', 'versiFirmware', 'rasioCt', 'rasioVt', 'merk', 'tipe', 'nomorSeri', 'media', 'penggerak', 'tiangId', 'switchingHuluId', 'catatan',
    'statusVerifikasi'];
  salin.forEach((k) => { if (teks(i[k])) p[k] = teks(i[k]); });
  ANGKA.forEach((k) => { if (teks(i[k])) p[k] = Number(teks(i[k])); });
  ['bisaTrip', 'catatGangguan', 'bacaArus', 'bacaTegangan', 'terhubungScada', 'titikHubung'].forEach((k) => { p[k] = !!i[k]; });
  if (i.titikHubung) ['tiangSisiA', 'tiangSisiB', 'penyulangSisiB'].forEach((k) => { if (teks(i[k])) p[k] = teks(i[k]); });
  if (i.terhubungScada) ['kodeRtu', 'mediaKomunikasi'].forEach((k) => { if (teks(i[k])) p[k] = teks(i[k]); });
  if (i.jenis === 'FCO') ['fungsiFco', 'fuseTipe', 'fuseRating'].forEach((k) => { if (teks(i[k])) p[k] = teks(i[k]); });
  if (i.switchingId) { p.switchingId = i.switchingId; p.revision = i.revision; p.aktif = !!i.aktif; }
  return p;
}

/** Pilihan switching hulu: aktif, penyulang sama (atau semua bila penyulang kosong), bukan diri sendiri. */
export const pilihanHulu = (daftar, isian) => (daftar || [])
  .filter((s) => s.aktif && s.switchingId !== isian.switchingId && (!isian.penyulang || teks(s.penyulang) === teks(isian.penyulang)))
  .sort((a, b) => a.nama.localeCompare(b.nama));

/** Teks waktu WIB singkat ("8 Nov 2026 14.05"), kosong = '-'. */
export function waktuSingkat(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}
