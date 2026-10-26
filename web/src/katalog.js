/**
 * Katalog menu website admin, mirror dari mobile KatalogOperasi (urutan sama persis).
 * Hanya menu yang `siap: true` yang sudah dibangun di website; sisanya tampil badge "Segera".
 * Menu baru muncul kalau sesi.menu (dari backend db_Akses) berisi kode menu-nya.
 */
export const GRUP_MENU = ['Monitoring', 'Pekerjaan Teknik', 'Jaringan & Gardu'];

export const KATALOG_MENU = [
  // Monitoring
  { kode: 'ROW_LAPORAN', nama: 'Laporan per Tim', desc: 'Laporan harian dan arsip pekerjaan tiap tim', ikon: 'orang', grup: 'Monitoring', halaman: '' },
  { kode: 'OPS_PETA_TEMUAN', nama: 'Peta Temuan', desc: 'Peta temuan inspeksi', ikon: 'lokasi', grup: 'Monitoring', halaman: '' },
  { kode: 'OPS_REKAP_GANGGUAN', nama: 'Rekap Gangguan', desc: 'Rekap padam dan gangguan distribusi', ikon: 'listrik', grup: 'Monitoring', halaman: '' },
  { kode: 'OPS_LAP_UP3', nama: 'Laporan UP3', desc: 'Laporan harian keandalan distribusi + C4A per penyulang', ikon: 'laporan', grup: 'Monitoring', halaman: 'laporan-up3', siap: true },
  { kode: 'OPS_LAP_UIW', nama: 'Laporan UIW', desc: 'Laporan harian wilayah: cuaca, Care for Asset, realisasi ROW', ikon: 'laporan', grup: 'Monitoring', halaman: 'laporan-uiw', siap: true },
  { kode: 'OPS_ENGINE', nama: 'Pemakaian Engine', desc: 'Kuota harian Apps Script dan Cloud Run', ikon: 'ulang', grup: 'Monitoring', halaman: '' },

  // Pekerjaan Teknik
  { kode: 'OPS_JADWAL_PADAM', nama: 'Jadwal Padam', desc: 'Rencana pemadaman, dampak pelanggan, status, format WA', ikon: 'kalender', grup: 'Pekerjaan Teknik', halaman: 'jadwal-padam', siap: true },
  { kode: 'OPS_INPUT_TEMUAN', nama: 'Temuan Inspeksi', desc: 'Input temuan inspeksi + daftar temuan offline', ikon: 'cari', grup: 'Pekerjaan Teknik', halaman: '' },
  { kode: 'OPS_PENERUSAN_WO', nama: 'Penerusan Tim Temuan Inspeksi', desc: 'Teruskan temuan ke tim ROW / Hartek / Yandal', ikon: 'kanan', grup: 'Pekerjaan Teknik', halaman: '' },
  { kode: 'OPS_WO_GANDA', nama: 'Verifikasi WO Ganda', desc: 'Pilih tim yang sah saat WO diunggah lebih dari satu tim', ikon: 'centangLingkaran', grup: 'Pekerjaan Teknik', halaman: '' },
  { kode: 'OPS_PINDAH_TIM_TO', nama: 'Pindah Tim TO', desc: 'Pindahkan / tarik WO terkirim yang belum dimulai tim', ikon: 'ulang', grup: 'Pekerjaan Teknik', halaman: '' },
  { kode: 'OPS_PETUGAS_YANDAL', nama: 'Pindah Tim Petugas Yandal', desc: 'Atur petugas di tiap tim Yandal sesuai SK', ikon: 'orang', grup: 'Pekerjaan Teknik', halaman: '' },
  { kode: 'OPS_VERIFIKASI_P0', nama: 'Approval P0', desc: 'Setujui / tolak P0 Yandal, cek foto, koreksi jenis pekerjaan', ikon: 'centangLingkaran', grup: 'Pekerjaan Teknik', halaman: 'approval-p0', siap: true },

  // Jaringan & Gardu
  { kode: 'OPS_PENGUKURAN_GARDU', nama: 'Pengukuran Gardu', desc: 'Beban gardu distribusi dari Master Gardu', ikon: 'penggaris', grup: 'Jaringan & Gardu', halaman: 'ukur-gardu', siap: true },
  { kode: 'OPS_BA_GARDU', nama: 'Berita Acara', desc: 'Buat BA gardu dan switching', ikon: 'dokumen', grup: 'Jaringan & Gardu', halaman: 'berita-acara', siap: true },
  { kode: 'OPS_CHECKPOINT', nama: 'Checkpoint Jaringan', desc: 'Monitoring checkpoint jalur penyulang', ikon: 'lokasi', grup: 'Jaringan & Gardu', halaman: '' },
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
