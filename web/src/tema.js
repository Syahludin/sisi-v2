/**
 * Tema terang / gelap. Pilihan tersimpan di localStorage (per browser); belum memilih = ikut pengaturan sistem.
 * <html data-tema="terang|gelap"> selalu terisi hasil akhirnya (index.html mengisinya lebih dulu agar tidak berkedip).
 */
import { useCallback, useEffect, useState } from 'react';

export const KUNCI_TEMA = 'sisi.web.tema';

/** Murni (diuji): pilihan 'terang' | 'gelap' | lainnya (= sistem) + apakah sistem gelap -> 'terang' | 'gelap'. */
export const tentukanTema = (pilihan, sistemGelap) => (pilihan === 'terang' || pilihan === 'gelap' ? pilihan : sistemGelap ? 'gelap' : 'terang');

const bacaPilihan = () => { try { return globalThis.localStorage.getItem(KUNCI_TEMA) || ''; } catch { return ''; } };
const sistemGelap = () => !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;

function pasang(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'gelap' ? '#0C1614' : '#0F2A27');
}

export function useTema() {
  const [pilihan, setPilihan] = useState(bacaPilihan);
  const [gelapSistem, setGelapSistem] = useState(sistemGelap);
  const tema = tentukanTema(pilihan, gelapSistem);
  useEffect(() => { pasang(tema); }, [tema]);
  useEffect(() => {
    const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const ubah = () => setGelapSistem(mq.matches);
    mq.addEventListener('change', ubah);
    return () => mq.removeEventListener('change', ubah);
  }, []);
  const balik = useCallback(() => {
    const baru = tema === 'gelap' ? 'terang' : 'gelap';
    try { globalThis.localStorage.setItem(KUNCI_TEMA, baru); } catch { /* mode privat: berlaku untuk sesi ini saja */ }
    setPilihan(baru);
  }, [tema]);
  return { tema, balik };
}
