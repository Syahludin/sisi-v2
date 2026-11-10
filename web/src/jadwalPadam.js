/**
 * Jadwal Padam (menu OPS_JADWAL_PADAM, khusus admin), logika murni tanpa React. Rumus sama dengan server
 * (backend/src/modules/70_JadwalPadam.js) dan HP (jadwal_padam_bantu.dart): dampak (gardu, pelanggan, daerah, VIP,
 * beban) dari Master Daerah Padam, durasi lewat tengah malam = +24 jam, ENS = beban MW x durasi x 1444,7 (rupiah bulat ke atas).
 * Server tetap menghitung ulang semuanya; di sini hanya pratinjau + ringkasan.
 */
export const MENU_JP = 'OPS_JADWAL_PADAM';
export const STATUS_JP = { jadwal: 'Terjadwal', realisasi: 'Terealisasi', batal: 'Batal Pemadaman' };
export const STATUS_PEKERJAAN_JP = ['Padam', 'Tanpa Padam'];
export const TARIF_ENS = 1444.7;
export const JAM_PADAM_AWAL = '09:00';
export const JAM_NYALA_AWAL = '12:00';
export const MAKS_JENIS = 200;
export const MAKS_LOKASI = 300;

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** 'HH:MM' -> menit; salah format = null. */
export function menitJam(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), n = Number(m[2]);
  return h < 24 && n < 60 ? h * 60 + n : null;
}

/** Durasi jam; jam nyala lebih kecil = lewat tengah malam. Jam salah = 0. */
export function durasiJam(padam, nyala) {
  const a = menitJam(padam), b0 = menitJam(nyala);
  if (a === null || b0 === null) return 0;
  return ((b0 < a ? b0 + 1440 : b0) - a) / 60;
}

/** ENS rupiah bulat ke atas (derau pecahan float dibuang dulu, sama dengan ensRupiahJp_ server). */
export const ensRupiah = (bebanMw, durasi) => Math.ceil(Math.round((Number(bebanMw) || 0) * (Number(durasi) || 0) * TARIF_ENS * 100) / 100);

export function angkaId(n, digit = 0) {
  const x = Number(n);
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit }).format(Number.isFinite(x) ? x : 0);
}
export const rupiah = (n) => 'Rp ' + angkaId(Math.ceil(Math.round((Number(n) || 0) * 100) / 100));

/** 3.5 -> '3 jam 30 menit', 0.75 -> '45 menit'. */
export function durasiTeks(jam) {
  const menit = Math.round((Number(jam) || 0) * 60);
  const j = Math.floor(menit / 60), m = menit % 60;
  return [j > 0 && j + ' jam', (m > 0 || j === 0) && m + ' menit'].filter(Boolean).join(' ');
}

/** '2026-10-25' -> '25 Oktober 2026'. */
export function labelTanggalJp(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? Number(m[3]) + ' ' + BULAN[Number(m[2]) - 1] + ' ' + m[1] : String(iso ?? '');
}

// ---------------- periode bulan + kalender ----------------

export const bulanDari = (iso) => iso.slice(0, 7);
export const labelBulan = (bulan) => BULAN[Number(bulan.slice(5, 7)) - 1] + ' ' + bulan.slice(0, 4);

export function geserBulan(bulan, n) {
  const d = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Rentang satu bulan untuk getJadwalPadam: { dari, sampai }. */
export function rentangBulan(bulan) {
  const akhir = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)), 0)).getUTCDate();
  return { dari: bulan + '-01', sampai: bulan + '-' + String(akhir).padStart(2, '0') };
}

/** Grid kalender Senin-pertama: minggu x 7 sel, sel di luar bulan = null. */
export function gridBulan(bulan) {
  const { sampai } = rentangBulan(bulan);
  const pertama = new Date(bulan + '-01T00:00:00Z').getUTCDay(); // 0 = Minggu
  const geser = (pertama + 6) % 7;
  const sel = Array.from({ length: geser }, () => null);
  for (let h = 1; h <= Number(sampai.slice(8)); h++) sel.push(bulan + '-' + String(h).padStart(2, '0'));
  while (sel.length % 7) sel.push(null);
  return Array.from({ length: sel.length / 7 }, (_, i) => sel.slice(i * 7, i * 7 + 7));
}

/** Tanda kalender per tanggal: { padam, tanpa } (jadwal batal tidak dihitung). */
export function tandaKalender(jadwal) {
  const m = {};
  jadwal.forEach((j) => {
    if (j.status === STATUS_JP.batal) return;
    const t = (m[j.tanggal] = m[j.tanggal] || { padam: 0, tanpa: 0 });
    if (j.statusPekerjaan === 'Tanpa Padam') t.tanpa++; else t.padam++;
  });
  return m;
}

// ---------------- daftar ----------------

/** Saring di browser (satu bulan dimuat sekali): penyulang, status jadwal, status pekerjaan, tanggal. */
export function saringJadwal(jadwal, { penyulang = '', status = '', statusPekerjaan = '', tanggal = '' } = {}) {
  return jadwal.filter((j) => (!penyulang || norm(j.penyulang) === norm(penyulang)) && (!status || j.status === status)
    && (!statusPekerjaan || j.statusPekerjaan === statusPekerjaan) && (!tanggal || j.tanggal === tanggal));
}

/** Ringkasan periode (rumus sama dengan getJadwalPadam_ server). */
export function ringkasJadwal(jadwal) {
  const r = { total: jadwal.length, terjadwal: 0, terealisasi: 0, batal: 0, padam: 0, pelanggan: 0, ens: 0 };
  jadwal.forEach((x) => {
    if (x.status === STATUS_JP.jadwal) r.terjadwal++;
    else if (x.status === STATUS_JP.realisasi) r.terealisasi++;
    else if (x.status === STATUS_JP.batal) r.batal++;
    if (x.statusPekerjaan === 'Padam' && x.status !== STATUS_JP.batal) { r.padam++; r.pelanggan += Number(x.jumlahPelanggan) || 0; r.ens += Number(x.ensRupiah) || 0; }
  });
  return r;
}

/** Kelompok per tanggal (urutan masuk dipertahankan; server sudah mengurutkan tanggal + jam). */
export function perTanggal(jadwal) {
  const m = new Map();
  jadwal.forEach((j) => { if (!m.has(j.tanggal)) m.set(j.tanggal, []); m.get(j.tanggal).push(j); });
  return [...m].map(([tanggal, isi]) => ({ tanggal, isi }));
}

/** Aksi satu jadwal: semua hanya selama Terjadwal (realisasi / batal terkunci di server). */
export function aksiJadwal(j, bolehUbah) {
  const bisa = bolehUbah && j.status === STATUS_JP.jadwal;
  return { ubah: bisa, realisasi: bisa, batal: bisa, hapus: bisa };
}

/** Penyulang yang dikenal: master + yang pernah tampil di jadwal (master kosong tetap bisa menyaring). */
export function daftarPenyulangJp(master, jadwal = []) {
  return [...new Set([...master, ...jadwal].map((x) => x.penyulang).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
}

export const daftarSectionJp = (master, penyulang) =>
  master.filter((d) => norm(d.penyulang) === norm(penyulang)).map((d) => d.section).sort((a, b) => a.localeCompare(b, 'id'));

export const masterUntuk = (master, penyulang, section) =>
  master.find((d) => norm(d.penyulang) === norm(penyulang) && norm(d.section) === norm(section)) || null;

/** Pratinjau dampak dari master + jam (null = penyulang/section belum dipilih atau tidak ada di master). */
export function dampak(master, isi) {
  const m = masterUntuk(master, isi.penyulang, isi.section);
  if (!m) return null;
  const durasi = durasiJam(isi.jamPadam, isi.jamNyala);
  return { ...m, durasi, ens: ensRupiah(m.bebanMw, durasi) };
}

// ---------------- form ----------------

export function isiAwal(j, tanggal) {
  return {
    penyulang: j?.penyulang || '', section: j?.section || '', jenis: j?.jenis || '', tanggal: j?.tanggal || tanggal,
    jamPadam: j?.jamPadam || JAM_PADAM_AWAL, jamNyala: j?.jamNyala || JAM_NYALA_AWAL,
    statusPekerjaan: j?.statusPekerjaan || 'Padam', lokasi: j?.lokasi || '',
  };
}

/** Galat per kolom ({ kolom: pesan }); kosong = valid. */
export function galatIsi(master, isi) {
  const g = {};
  if (!isi.penyulang) g.penyulang = 'Pilih penyulang.';
  if (!isi.section) g.section = 'Pilih section.';
  else if (isi.penyulang && !masterUntuk(master, isi.penyulang, isi.section)) g.section = 'Section tidak ada di Master Daerah Padam.';
  if (!isi.jenis.trim()) g.jenis = 'Jenis pekerjaan wajib diisi.';
  else if (isi.jenis.trim().length > MAKS_JENIS) g.jenis = 'Maks ' + MAKS_JENIS + ' huruf.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isi.tanggal)) g.tanggal = 'Pilih tanggal.';
  if (menitJam(isi.jamPadam) === null) g.jamPadam = 'Jam HH:MM.';
  if (menitJam(isi.jamNyala) === null) g.jamNyala = 'Jam HH:MM.';
  else if (!g.jamPadam && isi.jamPadam === isi.jamNyala) g.jamNyala = 'Jam nyala sama dengan jam padam.';
  if (!STATUS_PEKERJAAN_JP.includes(isi.statusPekerjaan)) g.statusPekerjaan = 'Pilih status pekerjaan.';
  const lokasi = isi.lokasi.trim();
  if (lokasi.length > MAKS_LOKASI) g.lokasi = 'Maks ' + MAKS_LOKASI + ' huruf.';
  else if (lokasi.split('\n').length > 5) g.lokasi = 'Maks 5 baris.';
  return g;
}

/**
 * Payload simpanJadwalPadam (baru: idBaris = kirim ulang tidak membuat jadwal kembar) /
 * ubahJadwalPadam (jadwalId + revision).
 */
export function payloadJadwal(isi, { jadwal = null, idBaris = '' } = {}) {
  const d = { penyulang: isi.penyulang, section: isi.section, jenis: isi.jenis.trim(), tanggal: isi.tanggal,
              jamPadam: isi.jamPadam, jamNyala: isi.jamNyala, statusPekerjaan: isi.statusPekerjaan };
  if (isi.lokasi.trim()) d.lokasi = isi.lokasi.trim();
  if (jadwal) { d.jadwalId = jadwal.jadwalId; d.revision = Number(jadwal.revision) || 1; } else d.idBaris = idBaris;
  return d;
}

/** Jadwal hasil simpan / ubah / status masuk ke daftar (ganti yang sama, atau tambah lalu urut tanggal + jam). */
export function gabungJadwal(daftar, baru) {
  const ada = daftar.some((j) => j.jadwalId === baru.jadwalId);
  const hasil = ada ? daftar.map((j) => (j.jadwalId === baru.jadwalId ? baru : j)) : [...daftar, baru];
  return hasil.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jamPadam.localeCompare(b.jamPadam));
}
