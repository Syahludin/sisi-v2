import { useCallback, useState } from 'react';

import PopupBerhasil from './components/PopupBerhasil.jsx';
import { kodeGalat, pesan } from './pesan.js';

/**
 * Simpan di latar belakang (sama dengan proses lain di SiSi): dialog isian langsung tertutup, permintaan berjalan di server,
 * selesai = kartu "Data Berhasil disimpan" lalu [sesudah]. Gagal = pesan galat di halaman (isian dapat diisi ulang).
 * Hasil: { kirim(aksi, data, sesudah?), popup (elemen kartu), galat, hapusGalat }.
 */
export default function useKirimLatar(api) {
  const [berhasil, setBerhasil] = useState(null);
  const [galat, setGalat] = useState('');
  const kirim = useCallback((aksi, data, sesudah) => {
    setGalat('');
    api(aksi, data, { batasMs: 90000 })
      .then(() => { setBerhasil({ judul: 'Data Berhasil disimpan' }); if (sesudah) sesudah(); })
      .catch((e) => setGalat('Belum tersimpan. ' + pesan(kodeGalat(e)) + (e && e.kolom ? ' (' + e.kolom + ')' : '')));
  }, [api]);
  const popup = <PopupBerhasil p={berhasil} onTutup={() => setBerhasil(null)} />;
  return { kirim, popup, galat, hapusGalat: () => setGalat('') };
}
