import { useCallback, useState } from 'react';
import { bukaRel, tutupRel } from './katalog.js';

/**
 * Pilihan menu pribadi admin, disimpan per akun DI BROWSER INI (localStorage, tidak ikut ke server): rel menu atas = menu yang
 * sudah dibuka, dan feeder yang dilipat di panel. Browser / perangkat lain punya rel sendiri. Penyimpanan diblokir browser =
 * hanya di memori.
 */
const kunci = (nama, username) => 'sisi.web.menu.' + nama + '.' + (username || '-');

function baca(k, awal) {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return Array.isArray(v) ? v : awal;
  } catch { return awal; }
}
function tulis(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat: hanya di memori */ }
}

export default function useMenuPribadi(username) {
  const kRel = kunci('terbuka', username), kTutup = kunci('tutup', username);
  const [rel, setRel] = useState(() => baca(kRel, []));
  const [tutup, setTutup] = useState(() => baca(kTutup, []));

  /** Menu dibuka (dari mana pun: menu, tautan, Back): masuk rel. `aktifKode` = menu yang aktif sebelumnya, tidak ikut terlepas. */
  const buka = useCallback((kode, aktifKode) => setRel((r) => {
    const baru = bukaRel(r, kode, aktifKode);
    if (baru !== r) tulis(kRel, baru);
    return baru;
  }), [kRel]);
  const lepas = useCallback((kode) => setRel((r) => { const baru = tutupRel(r, kode); tulis(kRel, baru); return baru; }), [kRel]);
  const balikTutup = useCallback((grup) => setTutup((t) => {
    const baru = t.includes(grup) ? t.filter((x) => x !== grup) : [...t, grup];
    tulis(kTutup, baru);
    return baru;
  }), [kTutup]);
  const setTutupSemua = useCallback((daftarGrup, lipat) => { const baru = lipat ? [...daftarGrup] : []; setTutup(baru); tulis(kTutup, baru); }, [kTutup]);

  return { rel, tutup, buka, lepas, balikTutup, setTutupSemua };
}
