/**
 * Master dari backend (getMaster, sama dengan HP) disimpan di memori tab saja: website tidak punya database lokal,
 * jadi cukup diambil sekali per sesi (token) dan diambil ulang kalau diminta (segar = true).
 * api(action, data) = panggilan backend milik Dashboard (token sesi sudah terpasang).
 */
const tembolok = new Map(); // `${token}|${modul}` -> Promise<isi[]>

export function muatMaster(api, token, modul, { segar = false } = {}) {
  const kunci = token + '|' + modul;
  if (segar || !tembolok.has(kunci)) {
    const janji = api('getMaster', { modul: [modul] }).then((j) => {
      const m = j.data && j.data.modul && j.data.modul[modul];
      return Array.isArray(m && m.isi) ? m.isi : [];
    });
    // gagal = jangan disimpan, panggilan berikutnya mencoba lagi
    janji.catch(() => { if (tembolok.get(kunci) === janji) tembolok.delete(kunci); });
    tembolok.set(kunci, janji);
  }
  return tembolok.get(kunci);
}
