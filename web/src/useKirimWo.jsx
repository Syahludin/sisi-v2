import { useCallback, useRef, useState } from 'react';

import PopupBerhasil from './components/PopupBerhasil.jsx';
import { dataTeruskan, temuanTerkirimSementara } from './penerusanWo.js';
import { pesan } from './pesan.js';
import { ubahTemuanWo } from './selisihWo.js';
import { tulisSimpananWo } from './simpananWo.js';

/** Galat yang berarti data di server sudah berubah: sesudah dikembalikan, daftar disinkron (bukan coba lagi dengan revision lama). */
const DATA_BERUBAH = ['KONFLIK_REVISION', 'WO_SUDAH_DIMULAI', 'WO_SUDAH_SELESAI', 'WO_PINDAH_DI_MENU_PINDAH', 'WO_GANDA_MENUNGGU', 'DATA_TIDAK_DITEMUKAN'];

/**
 * v1.0.58: Kirim WO ke tim dijalankan di LATAR (pola Approval P0): temuan langsung tampil TERKIRIM dan kartu "Data berhasil
 * disimpan" muncul; teruskanWo berjalan sesudahnya. Jawaban server menggantikan tampilan sementara; gagal = temuan
 * dikembalikan + onGalat(teks) (+ sinkron bila data di server berubah). Dipakai Penerusan WO dan peta Temuan Inspeksi.
 *   data / setData : daftar lengkap lokal (sinkronWo.js); kunci : kunci simpanannya; muat : sinkron selisih
 *   onMulai(dari, ke) : dipanggil sinkron saat dikirim (dari = asli, ke = sementara) dan saat dikembalikan karena gagal
 *     (dari = sementara, ke = asli), mis. untuk memilih temuan; onGalat(teks)
 * Mengembalikan { kirim(t, tim, catatan), popup } : popup = elemen kartu yang harus dirender halaman.
 */
export default function useKirimWo({ api, data, setData, kunci, muat, onMulai, onGalat }) {
  const ref = useRef(data);
  ref.current = data;
  const [berhasil, setBerhasil] = useState(null);
  const tutup = useCallback(() => setBerhasil(null), []);

  // terapkan ke data terbaru (bukan salinan lama di closure), simpan, dan kembalikan hasilnya
  const terapkan = useCallback((ubah) => {
    if (!ref.current) return;
    const baru = ubah(ref.current);
    ref.current = baru;
    setData(baru);
    tulisSimpananWo(kunci, baru);
  }, [kunci, setData]);

  const kirim = useCallback((t, tim, catatan) => {
    const sementara = temuanTerkirimSementara(t, tim, catatan);
    terapkan((d) => ubahTemuanWo(d, sementara));
    if (onMulai) onMulai(t, sementara);
    setBerhasil({ judul: 'Data berhasil disimpan', keterangan: `${t.kodeTemuan} diteruskan ke ${tim.nama}.`, tembus: true });
    // dua argumen then: galat saat memasang jawaban / sinkron tidak dianggap pengiriman gagal (tidak mengembalikan temuan)
    api('teruskanWo', dataTeruskan(t, tim.timId, catatan), { batasMs: 60000 }).then((j) => {
      if (j?.data?.temuan) terapkan((d) => ubahTemuanWo(d, j.data.temuan));
      return muat();
    }, (e) => {
      const kode = (e && e.kode) || 'JARINGAN';
      terapkan((d) => ubahTemuanWo(d, t));
      if (onMulai) onMulai(sementara, t);
      if (onGalat) onGalat(`${t.kodeTemuan} gagal diteruskan ke ${tim.nama}: ${pesan(kode)}`);
      if (DATA_BERUBAH.includes(kode)) return muat();
      return undefined;
    }).catch(() => {});
  }, [api, terapkan, muat, onMulai, onGalat]);

  return { kirim, popup: <PopupBerhasil p={berhasil} onTutup={tutup} /> };
}
