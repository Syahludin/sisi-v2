/**
 * v1.0.58: daftar WO (Penerusan WO / Peta Temuan) disimpan lengkap di browser; server hanya mengirim temuan yang
 * berubah (getWoAdmin { sejak }). Fungsi murni untuk menggabung selisih, mengubah satu temuan setelah aksi admin,
 * dan menyaring status di perangkat (aturan sama dengan getWoAdmin_ di backend 56_TindakLanjut.js).
 */

const EMBER = { '': 'baru', TERKIRIM: 'terkirim', DIKERJAKAN: 'dikerjakan', SELESAI: 'selesai' };
const statusDari = (t) => (t && t.wo && t.wo.status) || '';

/** tanggal turun, lalu kodeTemuan turun (kode memuat nomor urut) */
const urut = (a, b) => {
  const ta = String(a.tanggal || ''), tb = String(b.tanggal || '');
  if (ta !== tb) return ta < tb ? 1 : -1;
  const ka = String(a.kodeTemuan || ''), kb = String(b.kodeTemuan || '');
  return ka === kb ? 0 : ka < kb ? 1 : -1;
};

/** lokal + selisih server -> data baru (argumen tidak diubah). ringkas / tim / kursor / status dari selisih. */
export function gabungSelisihWo(lokal, selisih) {
  const peta = new Map();
  ((lokal && lokal.temuan) || []).forEach((t) => peta.set(t.temuanId, t));
  ((selisih && selisih.temuan) || []).forEach((t) => peta.set(t.temuanId, t));
  return { ...(lokal || {}), ...selisih, selisih: false, temuan: [...peta.values()].sort(urut) };
}

/** Ganti / tambah satu temuan (jawaban aksi admin); ringkas ikut pindah ember status. */
export function ubahTemuanWo(lokal, temuanBaru) {
  const lama = ((lokal && lokal.temuan) || []).find((t) => t.temuanId === temuanBaru.temuanId);
  const ringkas = { ...((lokal && lokal.ringkas) || {}) };
  const geser = (t, n) => { const k = EMBER[statusDari(t)]; if (k) ringkas[k] = Math.max((Number(ringkas[k]) || 0) + n, 0); };
  if (lama) geser(lama, -1);
  geser(temuanBaru, 1);
  const temuan = ((lokal && lokal.temuan) || []).filter((t) => t.temuanId !== temuanBaru.temuanId).concat(temuanBaru).sort(urut);
  return { ...(lokal || {}), ringkas, temuan };
}

/** BARU = belum diteruskan; TERKIRIM / DIKERJAKAN / SELESAI = sama; AKTIF = bukan SELESAI; lainnya (SEMUA, kosong) = semua. */
export function saringStatusWo(temuan, status) {
  const d = temuan || [];
  if (status === 'BARU') return d.filter((t) => !statusDari(t));
  if (status === 'AKTIF') return d.filter((t) => statusDari(t) !== 'SELESAI');
  if (status === 'TERKIRIM' || status === 'DIKERJAKAN' || status === 'SELESAI') return d.filter((t) => statusDari(t) === status);
  return d.slice();
}
