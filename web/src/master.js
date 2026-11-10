/**
 * Master dari backend (getMaster, sama dengan HP) disimpan di memori tab: cukup diambil sekali per sesi (token) dan
 * diambil ulang kalau diminta (segar = true). v1.0.36: awal(isi) = salinan tersimpan di browser (tembolok, bertahan saat
 * refresh) ditampilkan dulu selama master diambil.
 * api(action, data, opsi) = panggilan backend milik Dashboard (token sesi sudah terpasang).
 */
const tembolok = new Map(); // `${token}|${modul}` -> Promise<isi[]>

const isiModul = (j, modul) => {
  const m = j && j.data && j.data.modul && j.data.modul[modul];
  return Array.isArray(m && m.isi) ? m.isi : [];
};

export function muatMaster(api, token, modul, { segar = false, awal } = {}) {
  const kunci = token + '|' + modul;
  if (segar || !tembolok.has(kunci)) {
    // segar = langsung dari Sheet (bukan jawaban jadi MySQL), mis. tombol muat ulang sesudah sheet diubah manual
    const janji = api('getMaster', { modul: [modul] }, awal && !segar ? { awal: (j) => awal(isiModul(j, modul)) } : { langsung: segar })
      .then((j) => isiModul(j, modul));
    // gagal = jangan disimpan, panggilan berikutnya mencoba lagi
    janji.catch(() => { if (tembolok.get(kunci) === janji) tembolok.delete(kunci); });
    tembolok.set(kunci, janji);
  }
  return tembolok.get(kunci);
}
