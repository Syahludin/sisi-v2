/**
 * v1.0.51 Cover Gardu (tab History Gangguan), port v1 getDpgCoverGardu. Murni (diuji): klasifikasi Full / Belum Full Cover,
 * hitungan per komponen, kategori BTS (alamat mengandung kata "BTS"), filter penyulang (banyak pilihan).
 * Jawaban getCoverGardu: { gardu: [{ no, penyulang, section, alamat, nilai: [7 isian urut KOMPONEN_COVER] }] }.
 */
export const KOMPONEN_COVER = [
  { label: 'FCO Atas', jumperan: false }, { label: 'FCO Bawah', jumperan: false }, { label: 'Bushing TM', jumperan: false },
  { label: 'Bushing TR', jumperan: false }, { label: 'Bushing Arrester', jumperan: false },
  { label: 'Jumperan Atas', jumperan: true }, { label: 'Jumperan Bawah', jumperan: true },
];

/** Lengkap = full; jumperan juga A3CS / Protective Sleeve. */
export const coverLengkap = (k, nilai) => {
  const v = String(nilai ?? '').trim().toLowerCase();
  return v === 'lengkap' || (KOMPONEN_COVER[k].jumperan && (v === 'a3cs' || v === 'protective sleeve'));
};

export const adaBts = (g) => /bts/i.test(g.alamat || '');

/** Tambah kurang[] (indeks komponen belum lengkap) dan bts ke tiap gardu. */
export const nilaiCover = (gardu) => (gardu || []).map((g) => ({
  ...g, bts: adaBts(g), kurang: KOMPONEN_COVER.map((_, k) => k).filter((k) => !coverLengkap(k, g.nilai?.[k])),
}));

export const daftarPenyulangCover = (gardu) => [...new Set((gardu || []).map((g) => g.penyulang).filter(Boolean))].sort();

/** penyulang = array nama (kosong = semua). */
export const saringCover = (gardu, penyulang) => (penyulang?.length ? gardu.filter((g) => penyulang.includes(g.penyulang)) : gardu);

/** { total, totalTanpaBts, full, belum: {gardu, tanpaBts}, komponen: [{label, lengkap, belum}] } dari gardu hasil nilaiCover. */
export function ringkasCover(gardu) {
  const urut = (a) => [...a].sort((x, y) => String(x.no).localeCompare(String(y.no)));
  const full = urut(gardu.filter((g) => !g.kurang.length)), belum = urut(gardu.filter((g) => g.kurang.length));
  const tb = (a) => a.filter((g) => !g.bts).length;
  return {
    total: gardu.length, totalTanpaBts: tb(gardu),
    full: { gardu: full, tanpaBts: tb(full) }, belum: { gardu: belum, tanpaBts: tb(belum) },
    komponen: KOMPONEN_COVER.map((c, k) => ({
      label: c.label, lengkap: gardu.filter((g) => !g.kurang.includes(k)).length, belum: gardu.filter((g) => g.kurang.includes(k)).length,
    })),
  };
}

/** Kelompok per Section (urut nama), rincian pop-up. */
export function perSectionCover(gardu) {
  const m = new Map();
  gardu.forEach((g) => { const s = (g.section || '').trim() || '(Tanpa Section)'; if (!m.has(s)) m.set(s, []); m.get(s).push(g); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([section, daftar]) => ({ section, gardu: daftar }));
}

/** Kebutuhan material: jumlah gardu belum lengkap per komponen. */
export const kebutuhanCover = (gardu) => KOMPONEN_COVER.map((c, k) => ({ label: c.label, jumlah: gardu.filter((g) => g.kurang.includes(k)).length }));
