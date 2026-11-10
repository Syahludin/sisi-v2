/**
 * Master Jaringan (tab Jaringan: penyulang + section), logika murni diuji di test/jaringan.test.js. Mirror aturan server
 * (backend/src/modules/100_Jaringan_Admin.js).
 */

const teks = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** Kelompokkan section per penyulang (urut abjad); section urut menurut urutan. aktif = ada section aktif. */
export function groupPenyulang(section) {
  const per = {};
  (section || []).forEach((s) => { (per[s.penyulang] = per[s.penyulang] || []).push(s); });
  return Object.keys(per).sort((a, b) => a.localeCompare(b)).map((p) => ({
    penyulang: p, aktif: per[p].some((s) => s.aktif), section: per[p].slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0) || a.section.localeCompare(b.section)),
  }));
}

export const isianSectionBaru = (penyulang = '') => ({ sectionId: '', revision: null, penyulang, penyulangBaru: false, section: '', parentSectionId: '', urutan: '', aktif: true });

export const isianSectionDari = (s) => ({ ...isianSectionBaru(s.penyulang), sectionId: s.sectionId, revision: s.revision, section: s.section, parentSectionId: s.parentSectionId || '',
  urutan: s.urutan === null || s.urutan === undefined ? '' : String(s.urutan), aktif: s.aktif });

export function cekSection(i) {
  const g = {};
  if (!teks(i.penyulang)) g.penyulang = i.penyulangBaru ? 'Isi nama penyulang baru.' : 'Pilih penyulang.';
  if (!teks(i.section)) g.section = 'Nama section wajib diisi.';
  if (teks(i.urutan) && !/^\d+$/.test(teks(i.urutan))) g.urutan = 'Isi angka bulat.';
  return g;
}

/** Isian -> payload simpanSection (kolom kosong tidak dikirim; ubah menyertakan sectionId + revision + aktif). */
export function payloadSection(i) {
  const p = { penyulang: teks(i.penyulang), section: teks(i.section) };
  if (teks(i.parentSectionId)) p.parentSectionId = teks(i.parentSectionId);
  if (teks(i.urutan)) p.urutan = Number(teks(i.urutan));
  if (i.sectionId) { p.sectionId = i.sectionId; p.revision = i.revision; p.aktif = !!i.aktif; }
  return p;
}
