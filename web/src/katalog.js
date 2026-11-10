/**
 * Katalog menu website admin, mirror dari mobile KatalogOperasi (urutan sama persis).
 * Hanya menu yang `siap: true` yang sudah dibangun di website; sisanya tampil badge "Segera".
 * Menu baru muncul kalau sesi.menu (dari backend db_Akses) berisi kode menu-nya.
 * Grup = Feeder bernomor di menu atas; nomor mengikuti urutan GRUP_MENU.
 */
export const GRUP_MENU = ['Monitoring', 'Laporan', 'Temuan & Penerusan', 'Jadwal & Material', 'Jaringan & Gardu'];


export const KATALOG_MENU = [
  // Monitoring
  { kode: 'ROW_LAPORAN', nama: 'Laporan per Tim', desc: 'Laporan harian dan arsip pekerjaan tiap tim', ikon: 'orang', grup: 'Monitoring', halaman: '' },
  { kode: 'OPS_REKAP_GANGGUAN', nama: 'History Gangguan', desc: 'Gangguan penyulang, auto reclose, pick up per penyulang', ikon: 'listrik', grup: 'Monitoring', halaman: 'histori-gangguan', siap: true },
  { kode: 'OPS_DATA_ASET', nama: 'Data Aset', desc: 'Panjang jaringan per jenis kabel dan ukuran, per penyulang (ITB)', ikon: 'penggaris', grup: 'Monitoring', halaman: 'data-aset', siap: true },
  { kode: 'OPS_LAP_UP3', nama: 'Laporan UP3', desc: 'Laporan harian keandalan distribusi + C4A per penyulang', ikon: 'laporan', grup: 'Laporan', halaman: 'laporan-up3', siap: true },
  { kode: 'OPS_GASPOL_UP3', nama: 'GASPOL UP3', desc: 'Rekap pekerjaan per penyulang + tanggal, kirim ke GASPOL', ikon: 'laporan', grup: 'Laporan', halaman: 'gaspol-up3', siap: true },
  { kode: 'OPS_WORKPLAN_UP3', nama: 'Workplan UP3', desc: 'Realisasi ROW dan Harkons per section, siap disalin ke sheet workplan', ikon: 'kalender', grup: 'Laporan', halaman: 'workplan-up3', siap: true },   // v1.0.60
  { kode: 'OPS_LAP_GANGGUAN', nama: 'Laporan Gangguan Penyulang', desc: 'Teks WhatsApp gangguan H-1 + rekap bulan berjalan', ikon: 'listrik', grup: 'Laporan', halaman: 'laporan-gangguan', siap: true },   // v1.0.59
  { kode: 'OPS_LAP_UIW', nama: 'Laporan UIW', desc: 'Laporan harian wilayah: cuaca, Care for Asset, realisasi ROW', ikon: 'laporan', grup: 'Laporan', halaman: 'laporan-uiw', siap: true },
  { kode: 'OPS_ENGINE', nama: 'Pemakaian Engine', desc: 'Kuota harian Apps Script dan Cloud Run', ikon: 'ulang', grup: 'Monitoring', halaman: '' },

  // Pekerjaan Teknik
  { kode: 'OPS_JADWAL_PADAM', nama: 'Jadwal Padam', desc: 'Rencana pemadaman, dampak pelanggan, status, format WA', ikon: 'kalender', grup: 'Jadwal & Material', halaman: 'jadwal-padam', siap: true },
  { kode: 'OPS_INPUT_TEMUAN', nama: 'Input Temuan', desc: 'Input temuan inspeksi + daftar temuan offline', ikon: 'cari', grup: 'Temuan & Penerusan', halaman: '' },
  { kode: 'OPS_PETA_TEMUAN', nama: 'Peta Temuan', desc: 'Peta sebaran temuan per status penerusan', ikon: 'lokasi', grup: 'Temuan & Penerusan', halaman: 'temuan-inspeksi', siap: true },   // v1.0.50
  { kode: 'OPS_PENERUSAN_WO', nama: 'Penerusan Tim Temuan Inspeksi', desc: 'Teruskan temuan ke tim ROW / Hartek / Yandal', ikon: 'kanan', grup: 'Temuan & Penerusan', halaman: 'penerusan-wo', siap: true },
  { kode: 'OPS_WO_GANDA', nama: 'Verifikasi WO Ganda', desc: 'Pilih tim yang sah saat WO diunggah lebih dari satu tim', ikon: 'centangLingkaran', grup: 'Temuan & Penerusan', halaman: '' },
  { kode: 'OPS_PINDAH_TIM_TO', nama: 'Pindah Tim TO', desc: 'Pindahkan / tarik WO terkirim yang belum dimulai tim', ikon: 'ulang', grup: 'Temuan & Penerusan', halaman: '' },
  { kode: 'OPS_PETUGAS_YANDAL', nama: 'Pindah Tim Petugas Yandal', desc: 'Atur petugas di tiap tim Yandal sesuai SK', ikon: 'orang', grup: 'Temuan & Penerusan', halaman: '' },
  { kode: 'OPS_VERIFIKASI_P0', nama: 'Approval P0', desc: 'Setujui / tolak P0 Yandal, cek foto, koreksi jenis pekerjaan', ikon: 'centangLingkaran', grup: 'Temuan & Penerusan', halaman: 'approval-p0', siap: true },
  { kode: 'OPS_GUDANG_MATERIAL', nama: 'Material Gudang', desc: 'Stok MCB gudang dan tim Yandal, selisih pemeriksaan awal shift, pemakaian, izin material', ikon: 'dokumen', grup: 'Jadwal & Material', halaman: 'material-gudang', siap: true },   // v1.0.57

  // Jaringan & Gardu
  { kode: 'OPS_PENGUKURAN_GARDU', nama: 'Pengukuran Gardu', desc: 'Beban gardu distribusi dari Master Gardu', ikon: 'penggaris', grup: 'Jaringan & Gardu', halaman: 'ukur-gardu', siap: true },
  { kode: 'OPS_BA_GARDU', nama: 'Berita Acara', desc: 'Buat BA gardu dan switching', ikon: 'dokumen', grup: 'Jaringan & Gardu', halaman: 'berita-acara', siap: true },
  { kode: 'OPS_CHECKPOINT', nama: 'Checkpoint Jaringan', desc: 'Har, cover gardu, gangguan, temuan inspeksi per penyulang', ikon: 'lokasi', grup: 'Jaringan & Gardu', halaman: 'checkpoint', siap: true },   // v1.0.51
  { kode: 'OPS_VERIFIKASI_TIANG', nama: 'Verifikasi Tiang', desc: 'Progres verifikasi tiang TM per jalur', ikon: 'lokasi', grup: 'Jaringan & Gardu', halaman: 'verifikasi-tiang', siap: true },
  { kode: 'OPS_MASTER_SWITCHING', nama: 'Master Jaringan', desc: 'Switching di peta, penyulang + section, dan segmen: tambah, ubah, aktifkan / nonaktifkan', ikon: 'listrik', grup: 'Jaringan & Gardu', halaman: 'master-switching', siap: true },   // 1.0.63
];

/** Cek apakah sesi punya akses ke menu tertentu (sesi.menu dari backend). */
export function punyaAkses(sesi, kode) {
  const menu = Array.isArray(sesi?.menu) ? sesi.menu : [];
  return menu.some((m) => m.kode === kode);
}

/** Aksi akses sesi ke menu: 'UBAH' | 'LIHAT' | '' (tidak punya). Server tetap menegakkan ulang. */
export function aksiMenu(sesi, kode) {
  const menu = Array.isArray(sesi?.menu) ? sesi.menu : [];
  return menu.find((m) => m.kode === kode)?.aksi || '';
}

/** Daftar menu yang akan ditampilkan di sidebar untuk sesi ini (hanya yang punya akses). */
export function menuTampil(sesi) {
  return KATALOG_MENU.filter((m) => punyaAkses(sesi, m.kode));
}

/** Menu dikelompokkan per grup, hanya grup yang punya minimal 1 menu. */
export function menuPerGrup(sesi) {
  const tampil = menuTampil(sesi);
  return GRUP_MENU.map((g) => ({ grup: g, menu: tampil.filter((m) => m.grup === g) })).filter((g) => g.menu.length > 0);
}

/** Menu yang halamannya sudah ada (siap) dan belum; yang belum tidak ditampilkan di menu, hanya didaftar di Beranda. */
export function menuBelumSiap(sesi) {
  return menuTampil(sesi).filter((m) => !m.siap);
}

/** Grup untuk menu atas: hanya menu siap, grup kosong dibuang. Nomor grup (Feeder 01..) mengikuti urutan GRUP_MENU. */
export function feederMenu(sesi) {
  const siap = menuTampil(sesi).filter((m) => m.siap);
  return GRUP_MENU.map((g, i) => ({ grup: g, no: String(i + 1).padStart(2, '0'), menu: siap.filter((m) => m.grup === g) })).filter((g) => g.menu.length > 0);
}

/** Saring menu menurut kata kunci (nama, deskripsi, atau nama grup). Kata kunci kosong = semua. */
export function saringMenu(feeder, kata) {
  const q = String(kata || '').trim().toLowerCase();
  if (!q) return feeder;
  return feeder
    .map((g) => ({ ...g, menu: g.menu.filter((m) => (m.nama + ' ' + m.desc + ' ' + g.grup).toLowerCase().includes(q)) }))
    .filter((g) => g.menu.length > 0);
}

/**
 * Rel menu atas = menu yang sudah dibuka admin di browser ini (bukan favorit), urut sesuai dibuka. Pilihan tersimpan boleh
 * berisi kode yang aksesnya sudah dicabut: dibuang. Paling banyak MAKS_REL.
 */
export const MAKS_REL = 6;
export function relEfektif(tersimpan, menuSiap) {
  const ada = new Set(menuSiap.map((m) => m.kode));
  const daftar = Array.isArray(tersimpan) ? tersimpan : [];
  return daftar.filter((k, i) => ada.has(k) && daftar.indexOf(k) === i).slice(-MAKS_REL);
}

/**
 * Menu `kode` dibuka: masuk di ujung rel bila belum ada. Rel penuh = menu paling lama dilepas, kecuali `kode` dan menu yang
 * sedang aktif sebelumnya (`aktifKode`). Mengembalikan daftar yang sama (===) bila tidak ada perubahan.
 */
export function bukaRel(daftar, kode, aktifKode = '', maks = MAKS_REL) {
  if (!kode || daftar.includes(kode)) return daftar;
  const baru = [...daftar, kode];
  while (baru.length > maks) {
    const i = baru.findIndex((k) => k !== kode && k !== aktifKode);
    baru.splice(i < 0 ? 0 : i, 1);
  }
  return baru;
}

export const tutupRel = (daftar, kode) => daftar.filter((k) => k !== kode);

/**
 * Menu rel yang tidak muat di bilah (masuk daftar "N lagi"). `lebar` = { kode: lebar px } hasil ukur, `ruang` = lebar rel.
 * Yang paling lama dibuka disembunyikan lebih dulu; menu aktif dan paling sedikit satu menu selalu tampil.
 * Menu yang belum diukur dihitung 0 (tampil dulu, diukur, lalu dihitung ulang).
 */
export function sembunyiRel(rel, aktifKode, lebar, ruang, { tambah = 76, lagi = 104 } = {}) {
  const tampil = rel.slice(), sembunyi = [];
  const total = () => tampil.reduce((n, k) => n + (lebar[k] || 0), 0) + tambah + (sembunyi.length ? lagi : 0);
  while (tampil.length > 1 && total() > ruang) {
    const i = tampil.findIndex((k) => k !== aktifKode);
    if (i < 0) break;
    sembunyi.push(tampil[i]);
    tampil.splice(i, 1);
  }
  return sembunyi;
}
