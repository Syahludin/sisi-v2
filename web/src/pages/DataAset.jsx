import { useCallback, useEffect, useMemo, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { daftarBelum, daftarHilang, JENIS_KABEL, kartuPenyulang, ringkasAset, teksKm, warnaJenis } from '../asetItb.js';
import { aksiMenu } from '../katalog.js';
import { kodeGalat, pesan } from '../pesan.js';
import { KartuPenyulang } from './dataAset/KartuPenyulang.jsx';
import { PanelSegmen } from './dataAset/PanelSegmen.jsx';
import { Rincian } from './dataAset/Rincian.jsx';
import './dataAset.css';

const TAB = [['eam', 'Data Aset Berdasarkan EAM'], ['lapangan', 'Data Aset Berdasarkan Lapangan']];
const waktuSinkron = (iso) => (iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'belum pernah');

/**
 * Data Aset (menu OPS_DATA_ASET): data ITB per segmen (master db_Aset_ITB), dua tab: EAM (penyulang dari CXPENYULANG) dan
 * Lapangan (penyulang dari nomor gardu / section di DESCRIPTION). Rekap dihitung di browser (asetItb.js). Alamat: ?tab=&jenis=.
 */
export default function DataAset({ api, sesi, rute, keRute }) {
  const bolehUbah = aksiMenu(sesi, 'OPS_DATA_ASET') === 'UBAH';
  const q = rute.query;
  const tab = q.tab === 'lapangan' ? 'lapangan' : 'eam';
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [rincian, setRincian] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setData((await api('getDataAset', {}, { batasMs: 60000 })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const segmen = data?.segmen || [];
  const jenisAda = useMemo(() => {
    const ada = new Set(segmen.filter((s) => !s.hilang).map((s) => s.jenis));
    return [...JENIS_KABEL.filter((j) => ada.has(j)), ...[...ada].filter((j) => !JENIS_KABEL.includes(j)).sort()];
  }, [segmen]);
  const jenis = jenisAda.includes(q.jenis) ? q.jenis : '';
  const ringkas = useMemo(() => ringkasAset(segmen, tab), [segmen, tab]);
  const kartu = useMemo(() => kartuPenyulang(segmen, tab, jenis), [segmen, tab, jenis]);
  const hilang = useMemo(() => daftarHilang(segmen), [segmen]);
  const belum = useMemo(() => daftarBelum(segmen), [segmen]);

  const ubah = (o) => keRute({ query: o }, { ganti: true });
  const perbarui = async () => {
    setSibuk(true); setGalat(''); setInfo('');
    try {
      const j = await api('sinkronDataAset', {}, { batasMs: 300000 });
      const r = j.data?.ringkas || {};
      setInfo(`Diperbarui dari "${j.data?.judul || 'file ITB'}": ${r.tambah} baru, ${r.ubah} berubah, ${r.hilang} hilang, ${r.pulih} kembali, ${r.belum} belum terpetakan.`);
      await muat();
    } catch (err) { setGalat(pesan(kodeGalat(err))); }
    setSibuk(false);
  };

  const kartuRingkas = [['Total jaringan', ringkas.total, ''], ['SUTM', ringkas.sutm, ''], ['SKTM', ringkas.sktm, 'das-kpi--kuning'], ['Non-aktif', ringkas.nonaktif, 'das-kpi--merah']];
  return (
    <div className="hlm das">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Data Aset</h1>
          <p>{data?.sinkron ? `Diperbarui ${waktuSinkron(data.sinkron.waktu)} · file ITB ${data.sinkron.bulan}` : 'Data ITB per segmen (kmS)'}</p>
        </div>
        <div className="hlm-aksi">
          {bolehUbah && (
            <button type="button" className="k-tombol k-tombol--utama" onClick={perbarui} disabled={sibuk || memuat}>
              {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Memperbarui" /> : <Ikon nama="ulang" ukuran={16} />}
              {sibuk ? 'Memperbarui...' : 'Perbarui Data Aset'}
            </button>
          )}
        </div>
      </header>

      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}

      <div className="das-tab" role="tablist" aria-label="Dasar penentuan penyulang">
        {TAB.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'aktif' : ''} onClick={() => ubah({ tab: k === 'eam' ? '' : k })}>{l}</button>)}
      </div>

      {!data && memuat ? (
        <div className="k-tengah das-panel"><SisiLoader ukuran={56} label="Memuat" /><p>Loading Data Aset</p></div>
      ) : data && !segmen.length ? (
        <div className="k-tengah das-panel"><p>Belum ada data aset. {bolehUbah ? 'Klik "Perbarui Data Aset" untuk mengambil data dari file ITB.' : 'Hubungi admin untuk memperbarui data.'}</p></div>
      ) : data && (
        <>
          <div className="das-kpi">
            {kartuRingkas.map(([l, v, kelas]) => <div key={l} className={kelas}><small>{l}</small><b>{teksKm(v)}<i> kmS</i></b></div>)}
          </div>
          <div className="das-filter" role="group" aria-label="Jenis kabel">
            <span>Tampilkan</span>
            <button type="button" className={'das-pil' + (jenis === '' ? ' aktif' : '')} onClick={() => ubah({ jenis: '' })}>Semua</button>
            {jenisAda.map((j) => (
              <button key={j} type="button" className={'das-pil' + (jenis === j ? ' aktif' : '')} onClick={() => ubah({ jenis: j })}><i className={'das-' + warnaJenis(j)} />{j}</button>
            ))}
          </div>
          {kartu.length ? (
            <div className="das-grid">
              {kartu.map((k) => <KartuPenyulang key={k.kunci} k={k} onBuka={() => setRincian({ tab, kunci: k.kunci, nama: k.nama })} />)}
            </div>
          ) : <p className="das-ket">Tidak ada penyulang untuk pilihan ini.</p>}
          {tab === 'lapangan' && <PanelSegmen kelas="das-panel--kuning" judul="Segmen belum terpetakan" daftar={belum} />}
          <PanelSegmen kelas="das-panel--merah" judul="Segmen hilang" daftar={hilang}
            ket="Ada di master tetapi tidak ada di file ITB bulan terakhir. Tidak dihitung di kartu mana pun." />
        </>
      )}

      <Rincian segmen={segmen} rincian={rincian} onTutup={() => setRincian(null)} />
    </div>
  );
}
