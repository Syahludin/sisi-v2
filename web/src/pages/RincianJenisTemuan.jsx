import { useCallback, useEffect, useMemo, useState } from 'react';

import Pilih from '../components/Pilih.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { properNama } from '../checkpoint.js';
import { rekapJenisTemuan } from '../petaTemuan.js';
import { pilihanFilter } from '../penerusanWo.js';
import { kodeGalat, pesan } from '../pesan.js';
import TabelRekapTemuan from './TabelRekapTemuan.jsx';

/** '2026-10-01' -> '1 Okt 2026'. */
const tglRingkas = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t + 'T00:00:00Z')) : '');


/**
 * v1.0.51 tab "Rincian Jenis Temuan" (menu Temuan Inspeksi), port v1 rekap temuan per section: Tier, Temuan, Volume, Satuan,
 * satu kolom per Section. Rentang tanggal sama dengan peta; penyulang SATU pilihan, jenis temuan pilihan ganda, disaring di browser.
 */
export default function RincianJenisTemuan({ api, dari, sampai }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [peny, setPeny] = useState('');
  const [jenis, setJenis] = useState([]);

  const muat = useCallback(async () => {
    setGalat('');
    try { setData((await api('getRekapJenisTemuan', { dari, sampai }, { batasMs: 150000 })).data.baris); }
    catch (e) { setGalat(pesan(kodeGalat(e))); }
  }, [api, dari, sampai]);
  useEffect(() => { setData(null); muat(); }, [muat]);

  const r = useMemo(() => rekapJenisTemuan(data, { penyulang: peny ? [peny] : [], jenis }), [data, peny, jenis]);

  if (galat) return <p className="k-pesan k-pesan--galat" role="alert">{galat} <button type="button" className="k-tautan" onClick={muat}>Coba lagi</button></p>;
  if (!data) return <div className="k-tengah pt-panel-isi"><SisiLoader ukuran={48} label="Memuat" /><p>Loading Rincian Jenis Temuan</p></div>;

  return (
    <section className="pt-panel-isi" aria-label="Rincian jenis temuan">
      <div className="pt-filter">
        <div className="pt-pilih prt-isian"><span className="k-label" aria-hidden="true">Penyulang</span><Pilih label="Penyulang" nilai={peny} opsi={[...new Set(pilihanFilter(data, (t) => t.penyulang).map(properNama))].sort((a, b) => a.localeCompare(b))} kosong="Semua penyulang"
          placeholder="Semua penyulang" onUbah={setPeny} /></div>
        <div className="pt-pilih prt-isian"><span className="k-label" aria-hidden="true">Jenis temuan</span><Pilih label="Jenis temuan" nilai={jenis} opsi={pilihanFilter(data, (t) => t.jenisTemuan)} kosong="Semua jenis temuan" banyak
          placeholder="Semua jenis temuan" onUbah={setJenis} /></div>
        {(peny || jenis.length > 0) && <button type="button" className="k-tombol k-tombol--teks" onClick={() => { setPeny(''); setJenis([]); }}>Hapus saring</button>}
        {dari && sampai && <p className="prt-rentang">Rentang temuan <b>{tglRingkas(dari)} – {tglRingkas(sampai)}</b> (sama dengan peta)</p>}
      </div>
      <TabelRekapTemuan r={r} />
    </section>
  );
}
