import { useCallback, useEffect, useState } from 'react';

import { kodeGalat, pesan } from '../../pesan.js';

/** Muat satu aksi baca untuk sebuah tab Master Jaringan: { data, memuat, galat, muat(langsung?) }. */
export default function useDataTab(api, aksi) {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async (langsung = false) => {
    setMemuat(true); setGalat('');
    try { setData((await api(aksi, {}, langsung ? { langsung: true } : {})).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api, aksi]);
  useEffect(() => { muat(); }, [muat]);
  return { data, memuat, galat, muat };
}
