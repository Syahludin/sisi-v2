import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import Pilih from '../components/Pilih.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { cocokCp, opsiCp, properNama, SUBTAB_CP } from '../checkpoint.js';
import { rekapJenisTemuan } from '../petaTemuan.js';
import { pilihanFilter } from '../penerusanWo.js';
import { kodeGalat, pesan } from '../pesan.js';
import { TabCover } from './checkpoint/Cover.jsx';
import { TabGangguan } from './checkpoint/Gangguan.jsx';
import { TabHar } from './checkpoint/Har.jsx';
import { hariIniWib, TAHUN_AWAL } from './historiGangguan/bantu.js';
import TabelRekapTemuan from './TabelRekapTemuan.jsx';
import './historiGangguan.css';
import './petaTemuan.css';
import './checkpoint.css';


/**
 * v1.0.51 menu Checkpoint Jaringan (OPS_CHECKPOINT), port v1 "Data Pendukung CheckPoint" dengan tampilan v2:
 * filter Penyulang + Section (pangkal) + Tahun, 4 sub-tab Har / Cover Gardu / Gangguan Penyulang / Rekap Temuan Inspeksi.
 * Tiap sub-tab memuat getCheckpoint { bagian, tahun } sekali (disimpan per sub-tab + tahun); filter disaring di browser.
 * Pilihan di alamat (?tab=&penyulang=&section=&tahun=).
 */
export default function Checkpoint({ api, rute, keRute }) {
  const q = rute.query;
  const tahunKini = Number(hariIniWib().slice(0, 4));
  const tab = SUBTAB_CP.some((t) => t.kode === q.tab) ? q.tab : 'har';
  const tahun = Number(q.tahun) >= TAHUN_AWAL && Number(q.tahun) <= tahunKini ? Number(q.tahun) : tahunKini;
  const saring = useMemo(() => ({ penyulang: q.penyulang || '', section: q.section || '' }), [q.penyulang, q.section]);
  const [simpan, setSimpan] = useState({});   // 'bagian-tahun' -> data
  const [galat, setGalat] = useState('');
  const [jenis, setJenis] = useState([]);
  const memuat = useRef({});
  const kunci = tab + '-' + tahun, data = simpan[kunci];

  const muat = useCallback(async (paksa) => {
    if (memuat.current[kunci] || (!paksa && simpan[kunci])) return;
    memuat.current[kunci] = true;
    setGalat('');
    try {
      const j = await api('getCheckpoint', { bagian: tab, tahun }, { batasMs: 180000 });
      setSimpan((s) => ({ ...s, [kunci]: j.data }));
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    memuat.current[kunci] = false;
  }, [api, tab, tahun, kunci, simpan]);
  useEffect(() => { muat(false); }, [kunci]);   // eslint-disable-line react-hooks/exhaustive-deps

  const ubah = (o) => keRute({ query: { ...q, ...o } }, { ganti: true });
  const opsi = useMemo(() => opsiCp(data?.master, saring.penyulang), [data, saring.penyulang]);   // master jaringan (db_Jaringan)
  const sampai = tahun === tahunKini ? hariIniWib() : tahun + '-12-31';
  const tahunList = Array.from({ length: tahunKini - TAHUN_AWAL + 1 }, (_, i) => tahunKini - i);
  const adaFilter = saring.penyulang || saring.section || q.tahun;

  const isi = () => {
    if (galat) return <p className="k-pesan k-pesan--galat" role="alert">{galat} <button type="button" className="k-tautan" onClick={() => muat(true)}>Coba lagi</button></p>;
    if (!data) return <div className="k-tengah cp-muat"><SisiLoader ukuran={56} label="Memuat" /><p>Loading {SUBTAB_CP.find((t) => t.kode === tab).label}</p></div>;
    if (tab === 'har') return <TabHar har={data} saring={saring} tahun={tahun} />;
    if (tab === 'cover') return <TabCover gardu={data.gardu} saring={saring} />;
    if (tab === 'gangguan') return <TabGangguan ggn={data} penyulang={saring.penyulang} tahun={tahun} dari={tahun + '-01-01'} sampai={sampai} />;
    const r = rekapJenisTemuan(data.baris, { jenis, cocok: (b) => cocokCp(b.penyulang, b.section, saring) });
    return (
      <>
        <div className="pt-filter">
          <div className="pt-pilih"><Pilih label="Jenis temuan" nilai={jenis} opsi={pilihanFilter(data.baris, (t) => t.jenisTemuan)} kosong="Semua jenis temuan" banyak
            placeholder="Semua jenis temuan" onUbah={setJenis} /></div>
        </div>
        <TabelRekapTemuan r={r} />
      </>
    );
  };

  return (
    <div className="hlm ggn cp">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Checkpoint Jaringan</h1>
          <p>Data pendukung checkpoint per penyulang: pekerjaan Har, cover gardu, gangguan, dan temuan inspeksi.</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat(true)} disabled={!data && !galat}>
            <Ikon nama="ulang" ukuran={16} />Muat ulang
          </button>
        </div>
      </header>

      <div className="ggn-panel cp-filter">
        <label><span>Penyulang</span>
          <Pilih nilai={properNama(saring.penyulang)} opsi={opsi.penyulang} kosong="Semua penyulang" placeholder="Semua penyulang"
            onUbah={(v) => ubah({ penyulang: v, section: '' })} />
        </label>
        <label><span>Section</span>
          <Pilih nilai={saring.section} opsi={opsi.section} kosong="Semua section" placeholder={tab === 'gangguan' ? 'Tidak berlaku' : 'Semua section'}
            mati={tab === 'gangguan'} onUbah={(v) => ubah({ section: v })} />
        </label>
        <label><span>Tahun</span>
          <select className="k-input" value={tahun} onChange={(e) => ubah({ tahun: Number(e.target.value) === tahunKini ? '' : e.target.value })}>
            {tahunList.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button type="button" className="k-tombol k-tombol--garis" disabled={!adaFilter} onClick={() => ubah({ penyulang: '', section: '', tahun: '' })}>
          <Ikon nama="tutup" ukuran={15} />Reset
        </button>
      </div>

      <div className="ggn-tab-utama" role="tablist" aria-label="Bagian Checkpoint">
        {SUBTAB_CP.map((t) => (
          <button key={t.kode} type="button" role="tab" aria-selected={tab === t.kode} className={tab === t.kode ? 'aktif' : ''} onClick={() => ubah({ tab: t.kode === 'har' ? '' : t.kode })}>
            <Ikon nama={t.ikon} ukuran={17} />{t.label}
          </button>
        ))}
      </div>

      <section className="ggn-panel ggn-tab-isi">{isi()}</section>
    </div>
  );
}
