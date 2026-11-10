import { useCallback, useEffect, useMemo, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { aksiMenu } from '../katalog.js';
import { muatMaster } from '../master.js';
import { cariGardu, MENU_UKUR } from '../pengukuranGardu.js';
import { pesan } from '../pesan.js';
import { kodeGalat } from './pengukuranGardu/bantu.js';
import { DetailGardu, TAB_DETAIL } from './pengukuranGardu/Detail.jsx';
import { PemilihGardu, RingkasanMaster } from './pengukuranGardu/Pemilih.jsx';
import './pengukuranGardu.css';

/**
 * Pengukuran Gardu (menu OPS_PENGUKURAN_GARDU), mirror HP pengukuran_gardu_screen + riwayat_gardu_screen untuk layar lebar,
 * ditambah form Update Data Gardu v1 (HI) yang menulis ke 3 file sheet lama + db_Gardu (getHiGardu / updateHiGardu).
 * v1.0.38: dipecah per bagian di pengukuranGardu/ (Pemilih, Detail + riwayat, FormHi, bantu).
 */
export default function PengukuranGardu({ api, sesi, penjaga, rute, keRute }) {
  const bolehUbah = aksiMenu(sesi, MENU_UKUR) === 'UBAH';
  const [gardu, setGardu] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [kata, setKata] = useState('');
  const [status, setStatus] = useState('AKTIF');

  const muat = useCallback(async (segar = false) => {
    setGalatMuat('');
    // v1.0.36: master tersimpan di browser tampil dulu, lalu diganti yang terbaru
    try { setGardu(await muatMaster(api, sesi.token, 'gardu', { segar, awal: setGardu })); } catch (e) { setGalatMuat(pesan(kodeGalat(e))); }
  }, [api, sesi.token]);
  useEffect(() => { muat(); }, []);
  useEffect(() => () => { penjaga.current = false; }, [penjaga]);

  const hasil = useMemo(() => (gardu ? cariGardu(gardu, kata, status) : []), [gardu, kata, status]);
  // v1.0.36: gardu terpilih = alamat (/ukur-gardu/TB0002)
  const pilih = (rute.id && gardu?.find((g) => g.no === rute.id)) || null;
  const gantiGardu = (no) => {
    if (no === rute.id) return;
    if (penjaga.current && !window.confirm('Ada perubahan data gardu yang belum disimpan. Tinggalkan?')) return;
    penjaga.current = false;
    keRute({ id: no, query: { tab: '' } });
  };
  /** Hasil update (riwayat -> master / form HI) memperbarui baris gardu di daftar. */
  const perbaruiGardu = (g) => { if (g) setGardu((l) => l.map((x) => (x.id === g.id ? { ...x, ...g } : x))); };

  return (
    <div className="hlm pg">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Pengukuran Gardu</h1>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => { setGardu(null); muat(true); }} disabled={!gardu && !galatMuat}>
            <Ikon nama="ulang" ukuran={16} />Muat ulang master
          </button>
        </div>
      </header>

      {!gardu && !galatMuat && <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat master gardu" /><p>Memuat Master Gardu...</p></div>}
      {!gardu && galatMuat && (
        <div className="k-tengah k-tengah--galat" role="alert">
          <Ikon nama="peringatan" ukuran={30} /><b>Master Gardu belum bisa dimuat</b><p>{galatMuat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => muat(true)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
        </div>
      )}

      {gardu && (
        <>
          <PemilihGardu hasil={hasil} kata={kata} onKata={setKata} status={status} onStatus={setStatus} terpilih={rute.id} onPilih={gantiGardu} />
          {pilih ? (
            <DetailGardu key={pilih.id} g={pilih} api={api} sesi={sesi} bolehUbah={bolehUbah} penjaga={penjaga} onGardu={perbaruiGardu}
              tab={TAB_DETAIL.some(([id]) => id === rute.query.tab) ? rute.query.tab : 'ringkas'}
              onTab={(t) => keRute({ query: { tab: t === 'ringkas' ? '' : t } }, { ganti: true })} />
          ) : (
            <RingkasanMaster gardu={gardu} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------- pemilih gardu ----------------

