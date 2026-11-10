import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Dialog from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { JENIS_GGN, jenisGgn, MENU_GGN } from '../gangguan.js';
import { daftarPenyulang } from '../laporan.js';
import { muatMaster } from '../master.js';
import { aksiMenu } from '../katalog.js';
import { pesan } from '../pesan.js';
import { angka, hariIniWib, kodeGalat, TAHUN_AWAL, useTigaTahun, waktuSinkron } from './historiGangguan/bantu.js';
import { DetailKejadian } from './historiGangguan/Kejadian.jsx';
import { TabData } from './historiGangguan/TabData.jsx';
import { Rincian, TabTop } from './historiGangguan/TabTop.jsx';
import './historiGangguan.css';

const TAB = [['top', 'Top 12 Penyulang', 'listrik'], ['data', 'Data Gangguan', 'laporan']];

/**
 * History Gangguan (menu OPS_REKAP_GANGGUAN). v1.0.38: dua tab berkartu (?tab=top|data) supaya halaman tidak panjang:
 *  - Top 12 Penyulang (historiGangguan/TabTop.jsx): per jenis, tahun dipilih (?top=), tidak ikut filter.
 *  - Data Gangguan (historiGangguan/TabData.jsx): filter + grafik per bulan + perbandingan 3 tahun + pie FGTM + daftar.
 * Semua grafik: batang PMT (trip dari sumber GI / PLTD) | Section (selain PMT) bersebelahan.
 * Pilihan disimpan di alamat (?tab=&top=&penyulang=&fgtm=&dari=&sampai=&jenis=&pie=).
 */
export default function HistoriGangguan({ api, sesi, rute, keRute }) {
  const bolehUbah = aksiMenu(sesi, MENU_GGN) === 'UBAH';
  const q = rute.query;
  const tab = TAB.some(([k]) => k === q.tab) ? q.tab : 'top';
  const tahunIni = hariIniWib().slice(0, 4);
  const dari = q.dari || tahunIni + '-01-01';
  const sampai = q.sampai || hariIniWib();
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [sinkron, setSinkron] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [buka, setBuka] = useState(null);
  const [rincian, setRincian] = useState(null);   // { jenis, penyulang }
  const [ulang, setUlang] = useState(0);           // naik setelah sinkron = data 3 tahun dimuat ulang
  const urut = useRef(0);
  const tahunKini = Number(tahunIni);
  const tahunTop = Number(q.top) >= TAHUN_AWAL && Number(q.top) <= tahunKini ? Number(q.top) : tahunKini;
  const tahunBanding = Number(sampai.slice(0, 4));
  const tt = useTigaTahun(api, tahunTop, ulang);
  const tb = useTigaTahun(api, tahunBanding !== tahunTop ? tahunBanding : null, ulang);
  const banding = tahunBanding !== tahunTop ? tb : tt;

  const muat = useCallback(async () => {
    const no = ++urut.current;
    setMemuat(true); setGalat('');
    try {
      const j = await api('getHistoriGangguan', { dari, sampai }, { batasMs: 60000, awal: (t) => { if (no === urut.current) setData(t.data); } });
      if (no === urut.current) setData(j.data);
    } catch (e) { if (no === urut.current) setGalat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api, dari, sampai]);
  useEffect(() => { muat(); }, [muat]);

  const ubah = (o) => keRute({ query: o }, { ganti: true });
  const ubahTanggal = (k, v) => {
    const d = k === 'dari' ? v : dari, s = k === 'sampai' ? v : sampai;
    if (!v || d > s) { setGalat('Tanggal "dari" harus sebelum "sampai".'); return; }
    if ((Date.parse(s) - Date.parse(d)) / 864e5 > 731) { setGalat('Rentang tanggal maksimal 2 tahun.'); return; }
    setGalat('');
    ubah({ [k]: v });
  };

  const perbarui = async () => {
    setSinkron(true); setGalat(''); setInfo('');
    try {
      const j = await api('sinkronHistoriGangguan', {}, { batasMs: 300000 });
      const n = j.data?.jumlah || {};
      setInfo(`Diperbarui dari sumber: ${angka(n.penyulang)} gangguan penyulang, ${angka(n.ar)} AR, ${angka(n.pickup)} pick up (semua tahun).`);
      await muat();
      setUlang((x) => x + 1);
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setSinkron(false);
  };

  // pilihan penyulang = penyulang aktif di master jaringan (getMaster, sama dengan Laporan UP3/UIW). Master belum termuat / gagal
  // dimuat = sementara memakai nama yang ada di data gangguan.
  const [master, setMaster] = useState(null);
  useEffect(() => {
    let batal = false;
    muatMaster(api, sesi.token, 'jaringan').then((j) => { if (!batal) { const d = daftarPenyulang(j); setMaster(d.length ? d : null); } }, () => {});
    return () => { batal = true; };
  }, [api, sesi.token]);

  const daftarNama = useMemo(() => {
    if (master) return master;
    const s = new Set();
    JENIS_GGN.forEach((j) => { (data?.[j.kode] || []).forEach((o) => o.penyulang && s.add(o.penyulang)); (tt.data?.[j.kode] || []).forEach((o) => o.penyulang && s.add(o.penyulang)); });
    return [...s].sort();
  }, [master, data, tt.data]);

  return (
    <div className="hlm ggn">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>History Gangguan</h1>
          <p>Diperbarui {waktuSinkron(data?.sinkron?.waktu)} · otomatis setiap hari pukul 18.00 WIB</p>
        </div>
        <div className="hlm-aksi">
          {bolehUbah && (
            <button type="button" className="k-tombol k-tombol--utama" onClick={perbarui} disabled={sinkron || memuat}
              title="Ambil data terbaru dari Rekap Gangguan ULP Toboali sekarang">
              {sinkron ? <SisiLoader ukuran={16} warna="#fff" label="Memperbarui" /> : <Ikon nama="ulang" ukuran={16} />}
              {sinkron ? 'Memperbarui...' : 'Perbarui Data Gangguan Penyulang'}
            </button>
          )}
        </div>
      </header>

      {galat && <p className="k-pesan k-pesan--galat ggn-pesan" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok ggn-pesan" role="status">{info}</p>}

      <div className="ggn-tab-utama" role="tablist" aria-label="Bagian History Gangguan">
        {TAB.map(([k, l, ikon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'aktif' : ''} onClick={() => ubah({ tab: k === 'top' ? '' : k })}>
            <Ikon nama={ikon} ukuran={17} />{l}
          </button>
        ))}
      </div>

      {tab === 'top' && (
        <TabTop tahunTop={tahunTop} tahunKini={tahunKini} tt={tt} onTahun={(t) => ubah({ top: t === tahunKini ? '' : String(t) })} onPilih={setRincian} />
      )}
      {tab === 'data' && (!data && memuat ? (
        <div className="k-tengah ggn-panel"><SisiLoader ukuran={56} label="Memuat" /><p>Loading History Gangguan</p></div>
      ) : data && (
        <TabData data={data} memuat={memuat} ubah={ubah} ubahTanggal={ubahTanggal} banding={banding} tahunBanding={tahunBanding} tahunKini={tahunKini}
          daftarNama={daftarNama} onBuka={setBuka}
          q={{ ...q, dari, sampai, penyulang: q.penyulang || '', fgtm: q.fgtm || '', dariAlamat: q.dari, sampaiAlamat: q.sampai }} />
      ))}

      <Rincian baris={rincian ? tt.data?.[rincian.jenis] : null} rincian={rincian} tahun={tahunTop} onTutup={() => setRincian(null)} onBuka={(o, j) => setBuka({ o, jenis: j })} />

      <Dialog buka={!!buka} judul={buka ? (buka.o[jenisGgn(buka.jenis).alat] || buka.o.penyulang) : ''}
        sub={buka ? jenisGgn(buka.jenis).label + ' · ' + buka.o.penyulang : ''} onTutup={() => setBuka(null)} lebar="min(720px, 94vw)">
        {buka && <DetailKejadian o={buka.o} jenis={buka.jenis} />}
        <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={() => setBuka(null)}>Tutup</button></div>
      </Dialog>
    </div>
  );
}
