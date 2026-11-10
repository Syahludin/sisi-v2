import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import DialogTeruskanWo from '../components/DialogTeruskanWo.jsx';
import Ikon from '../components/Ikon.jsx';
import Pilih from '../components/Pilih.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import RincianJenisTemuan from './RincianJenisTemuan.jsx';
import { sinkronWo } from '../sinkronWo.js';
import useKirimWo from '../useKirimWo.jsx';
import {
  koordinatTemuan, LATAR_PETA, PUSAT_PETA, rentangAwalPeta, ringkasPeta, saringPeta, STATUS_PETA, statusPeta,
} from '../petaTemuan.js';
import { bolehTeruskanDariDaftar, lokasiTemuan, muatFotoWo, pilihanFilter, timInspeksi, urlPeta, waktuWo } from '../penerusanWo.js';
import { kodeGalat, pesan } from '../pesan.js';
import { navigasi } from '../rute.js';
import { hariIniWib } from '../tanggal.js';
import './petaTemuan.css';

const tglValid = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? t : '');

/**
 * v1.0.50 menu Temuan Inspeksi (OPS_PETA_TEMUAN, admin): peta sebaran temuan inspeksi, port v1 Temuan-Inspeksi.html.
 * Leaflet + latar gratis (OpenStreetMap / Esri satelit, tanpa API key), titik lingkaran berwarna per status WO + legenda,
 * layar penuh. Klik titik = panel detail (foto, lokasi, Google Maps, buka di Penerusan Tim untuk meneruskan).
 * Rentang tanggal tersimpan di alamat (?dari=&sampai=); filter status / penyulang / jenis / cari di browser.
 */
export default function PetaTemuan({ sesi, api, rute, keRute }) {
  const hariIni = hariIniWib();
  const awal = rentangAwalPeta(hariIni);
  const dari = tglValid(rute.query.dari) || awal.dari, sampai = tglValid(rute.query.sampai) || awal.sampai;
  const tab = rute.query.tab === 'rincian' ? 'rincian' : 'peta';
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [simpanan, setSimpanan] = useState(0);
  const [teruskan, setTeruskan] = useState(null);   // v1.0.58: temuan yang sedang dipilih timnya (Teruskan ke tim)
  const [filter, setFilter] = useState({ status: '', penyulang: [], jenis: [], cari: '' });
  const [ketik, setKetik] = useState('');   // isi kotak Cari; baru menyaring saat tombol Cari / Enter ditekan
  const [latar, setLatar] = useState('peta');
  const [penuh, setPenuh] = useState(false);
  const [pilih, setPilih] = useState(null);
  const elPeta = useRef(null);
  const peta = useRef(null);
  const lapisTitik = useRef(null);
  const lapisLatar = useRef({});
  const urut = useRef(0);

  // v1.0.58: daftar lengkap tersimpan di browser per akun + rentang; server hanya mengirim selisih (sinkronWo.js)
  const kunciWo = 'u:' + (sesi?.profil?.userId || '') + '|getPetaTemuan|' + dari + '|' + sampai;
  const muat = useCallback(async (paksaPenuh = false) => {
    const no = ++urut.current;
    setMemuat(true); setGalat('');
    let gagal = false;
    try {
      const j = await sinkronWo({
        action: 'getPetaTemuan', param: { dari, sampai }, kunci: kunciWo, paksaPenuh,
        api: (a, d, o) => api(a, d, { batasMs: 150000, ...o }),
        onLokal: (c, w) => { if (no === urut.current) { setData(c); setSimpanan(w || 1); } },
        onGagal: () => { gagal = true; },
      });
      if (no === urut.current) { setData(j); if (!gagal) setSimpanan(0); }
    } catch (e) { if (no === urut.current) setGalat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api, kunciWo, dari, sampai]);
  useEffect(() => { muat(); }, [muat]);

  // v1.0.58: Kirim WO dijalankan di latar (useKirimWo); panel ikut menampilkan status sementara lalu jawaban server
  const { kirim: kirimWo, popup } = useKirimWo({
    api, data, setData, kunci: kunciWo, muat, onMulai: (dari, ke) => setPilih(ke), onGalat: setGalat,
  });

  const semua = data?.temuan || [];
  const tampil = useMemo(() => saringPeta(semua, filter), [semua, filter]);
  const ringkas = useMemo(() => ringkasPeta(tampil), [tampil]);

  // peta dibuat sekali
  useEffect(() => {
    const m = L.map(elPeta.current, { center: PUSAT_PETA, zoom: 11, preferCanvas: true, zoomControl: true });
    Object.entries(LATAR_PETA).forEach(([k, v]) => { lapisLatar.current[k] = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution }); });
    lapisLatar.current.peta.addTo(m);
    lapisTitik.current = L.layerGroup().addTo(m);
    peta.current = m;
    return () => { m.remove(); peta.current = null; };
  }, []);

  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    Object.entries(lapisLatar.current).forEach(([k, l]) => { if (k === latar) l.addTo(m); else m.removeLayer(l); });
  }, [latar]);

  // titik digambar ulang saat data / filter berubah; peta menyesuaikan ke semua titik
  useEffect(() => {
    const m = peta.current, g = lapisTitik.current;
    if (!m || !g) return;
    g.clearLayers();
    const batas = [];
    tampil.forEach((t) => {
      const k = koordinatTemuan(t);
      if (!k) return;
      const st = statusPeta(t);
      L.circleMarker(k, { radius: 7, color: '#fff', weight: 2, fillColor: st.warna, fillOpacity: 0.95 })
        .bindTooltip(String(t.kodeTemuan || '') + ' · ' + String(t.jenisTemuan || 'Temuan'), { direction: 'top', offset: [0, -6] })
        .on('click', () => setPilih(t))
        .addTo(g);
      batas.push(k);
    });
    if (batas.length === 1) m.setView(batas[0], 16);
    else if (batas.length > 1) m.fitBounds(batas, { padding: [30, 30], maxZoom: 16 });
  }, [tampil]);

  useEffect(() => { setTimeout(() => peta.current?.invalidateSize(), 60); }, [penuh, tab]);
  useEffect(() => {
    if (!penuh) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setPenuh(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [penuh]);

  const ubahRentang = (o) => keRute({ query: { dari, sampai, ...(tab === 'rincian' ? { tab } : {}), ...o } }, { ganti: true });
  const ubahTab = (t) => keRute({ query: { dari, sampai, tab: t === 'rincian' ? t : '' } }, { ganti: true });   // tab '' dibuang dari alamat; tanpa ini keRute menggabung query lama dan tab=rincian menempel
  const ubahFilter = (o) => { setFilter((f) => ({ ...f, ...o })); setPilih(null); };
  const adaFilter = filter.status || filter.penyulang.length || filter.jenis.length || filter.cari;

  return (
    <div className="hlm pt">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Temuan Inspeksi</h1>
          <p>Peta sebaran temuan Inspeksi Jaringan &amp; Gardu per status penerusan.</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat(true)} disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
        </div>
      </header>

      <div className="pt-tab" role="tablist" aria-label="Bagian Temuan Inspeksi">
        <button type="button" role="tab" aria-selected={tab === 'peta'} className={tab === 'peta' ? 'aktif' : ''} onClick={() => ubahTab('peta')}><Ikon nama="lokasi" ukuran={17} />Peta Temuan</button>
        <button type="button" role="tab" aria-selected={tab === 'rincian'} className={tab === 'rincian' ? 'aktif' : ''} onClick={() => ubahTab('rincian')}><Ikon nama="laporan" ukuran={17} />Rincian Jenis Temuan</button>
      </div>
      {tab === 'rincian' && (
        <>
          <div className="pt-filter">
            <label className="pt-tgl"><span>Dari</span><input type="date" className="k-input" value={dari} max={sampai} onChange={(e) => e.target.value && ubahRentang({ dari: e.target.value })} /></label>
            <label className="pt-tgl"><span>Sampai</span><input type="date" className="k-input" value={sampai} min={dari} max={hariIni} onChange={(e) => e.target.value && ubahRentang({ sampai: e.target.value })} /></label>
          </div>
          <RincianJenisTemuan api={api} dari={dari} sampai={sampai} />
        </>
      )}
      <div hidden={tab !== 'peta'}>

      <div className="pt-ringkas" role="list" aria-label="Jumlah per status">
        <button type="button" role="listitem" className={'pt-kartu' + (!filter.status ? ' pt-kartu--aktif' : '')} onClick={() => ubahFilter({ status: '' })}>
          <small>Semua</small><b>{data ? ringkasPeta(saringPeta(semua, { ...filter, status: '' })).total : '–'}</b>
        </button>
        {STATUS_PETA.map((s) => (
          <button key={s.kode} type="button" role="listitem" style={{ '--w': s.warna }}
            className={'pt-kartu pt-kartu--status' + (filter.status === s.kode ? ' pt-kartu--aktif' : '')}
            onClick={() => ubahFilter({ status: filter.status === s.kode ? '' : s.kode })}>
            <small><i />{s.label}</small><b>{data ? ringkasPeta(saringPeta(semua, { ...filter, status: '' })).per[s.kode] : '–'}</b>
          </button>
        ))}
      </div>

      <div className="pt-filter">
        <form className="pt-cari-form" role="search" onSubmit={(e) => { e.preventDefault(); ubahFilter({ cari: ketik.trim() }); }}>
          <label className="k-cari pt-cari">
            <Ikon nama="cari" ukuran={17} />
            <input type="search" value={ketik} onChange={(e) => setKetik(e.target.value)} placeholder="Cari kode, jenis, penyulang, gardu..." aria-label="Cari temuan" />
          </label>
          <button type="submit" className="k-tombol">Cari</button>
        </form>
        <div className="pt-pilih"><Pilih label="Penyulang" nilai={filter.penyulang} opsi={pilihanFilter(semua, (t) => t.penyulang)} kosong="Semua penyulang" banyak
          placeholder="Semua penyulang" onUbah={(v) => ubahFilter({ penyulang: v })} /></div>
        <div className="pt-pilih"><Pilih label="Jenis temuan" nilai={filter.jenis} opsi={pilihanFilter(semua, (t) => t.jenisTemuan)} kosong="Semua jenis temuan" banyak
          placeholder="Semua jenis temuan" onUbah={(v) => ubahFilter({ jenis: v })} /></div>
        <label className="pt-tgl"><span>Dari</span><input type="date" className="k-input" value={dari} max={sampai} onChange={(e) => e.target.value && ubahRentang({ dari: e.target.value })} /></label>
        <label className="pt-tgl"><span>Sampai</span><input type="date" className="k-input" value={sampai} min={dari} max={hariIni} onChange={(e) => e.target.value && ubahRentang({ sampai: e.target.value })} /></label>
        {adaFilter && <button type="button" className="k-tombol k-tombol--teks" onClick={() => { setKetik(''); ubahFilter({ status: '', penyulang: [], jenis: [], cari: '' }); }}>Hapus saring</button>}
      </div>

      {simpanan > 0 && !memuat && <p className="k-banner" role="status"><Ikon nama="peringatan" ukuran={17} />Offline: titik dari data tersimpan. Gambar peta butuh koneksi.</p>}
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat} <button type="button" className="k-tautan" onClick={() => muat()}>Coba lagi</button></p>}

      <div className={'pt-bungkus' + (penuh ? ' pt-bungkus--penuh' : '')}>
        <div ref={elPeta} className="pt-peta" aria-label="Peta temuan inspeksi" />
        <div className="pt-latar" role="group" aria-label="Latar peta">
          <button type="button" className={latar === 'peta' ? 'on' : ''} onClick={() => setLatar('peta')}>Peta</button>
          <button type="button" className={latar === 'satelit' ? 'on' : ''} onClick={() => setLatar('satelit')}>Satelit</button>
        </div>
        <button type="button" className="pt-penuh" onClick={() => setPenuh((v) => !v)} aria-label={penuh ? 'Keluar layar penuh' : 'Layar penuh'} title={penuh ? 'Keluar layar penuh (Esc)' : 'Layar penuh'}>
          <Ikon nama={penuh ? 'tutup' : 'menu'} ukuran={16} />
        </button>
        <div className="pt-legenda" aria-label="Legenda">
          {STATUS_PETA.map((s) => <div key={s.kode}><i style={{ background: s.warna }} />{s.label}</div>)}
        </div>
        {memuat && !data && <div className="pt-muat"><SisiLoader ukuran={40} label="Memuat temuan" /></div>}
        {pilih && <PanelTemuan t={pilih} api={api} sesi={sesi} onTeruskan={setTeruskan} onTutup={() => setPilih(null)} />}
        <DialogTeruskanWo t={teruskan} tim={data?.tim || []} onTutup={() => setTeruskan(null)}
          onKirim={(t, tim, catatan) => { setTeruskan(null); setGalat(''); kirimWo(t, tim, catatan); }} />
        {popup}
      </div>
      <p className="k-catatan pt-info">
        {data ? `${ringkas.total - ringkas.tanpaKoordinat} titik di peta` + (ringkas.tanpaKoordinat ? ` · ${ringkas.tanpaKoordinat} temuan tanpa koordinat` : '')
          + (semua.length >= 500 ? ' · dibatasi 500 temuan terbaru, persempit rentang tanggal' : '') : 'Memuat...'}
      </p>
      </div>
    </div>
  );
}

/** Panel detail satu titik (di atas peta). */
function PanelTemuan({ t, api, sesi, onTeruskan, onTutup }) {
  const [src, setSrc] = useState('');
  const st = statusPeta(t), gm = urlPeta(t.koordinat), ada = !!t.foto?.TEMUAN;
  useEffect(() => {
    if (!ada) return undefined;
    let hidup = true;
    setSrc('');
    muatFotoWo(api, { temuanId: t.temuanId, slot: 'TEMUAN' }, 'KECIL', 'getFotoPetaTemuan').then((s) => { if (hidup) setSrc(s); }, () => {});
    return () => { hidup = false; };
  }, [api, t.temuanId, ada]);
  return (
    <aside className="pt-panel" aria-label={'Temuan ' + t.kodeTemuan}>
      <button type="button" className="pt-panel-tutup" onClick={onTutup} aria-label="Tutup"><Ikon nama="tutup" ukuran={16} /></button>
      <small className="pt-panel-kode">{t.kodeTemuan}</small>
      <h2>{t.jenisTemuan || 'Temuan'}</h2>
      <span className="pt-status" style={{ '--w': st.warna }}><i />{st.label}{t.wo?.tim ? ' · ' + t.wo.tim : ''}</span>
      {ada && <div className="pt-foto">{src ? <img src={src} alt="Foto temuan" /> : <SisiLoader ukuran={24} label="Memuat foto" />}</div>}
      <dl>
        <div><dt>Lokasi</dt><dd>{lokasiTemuan(t) || '-'}</dd></div>
        <div><dt>Tanggal</dt><dd>{t.tanggal || '-'}</dd></div>
        <div><dt>Sumber</dt><dd>{timInspeksi(t)}</dd></div>
        {t.deskripsi && <div><dt>Deskripsi</dt><dd>{t.deskripsi}</dd></div>}
        {t.wo?.waktuDiteruskan && <div><dt>Diteruskan</dt><dd>{waktuWo(t.wo.waktuDiteruskan)}</dd></div>}
      </dl>
      <div className="pt-panel-aksi">
        {gm && <a className="k-tombol k-tombol--garis" href={gm} target="_blank" rel="noopener noreferrer"><Ikon nama="lokasi" ukuran={15} />Google Maps</a>}
        {bolehTeruskanDariDaftar(sesi, t) && (
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => onTeruskan(t)}><Ikon nama="kanan" ukuran={15} />Teruskan ke tim</button>
        )}
        <button type="button" className="k-tombol k-tombol--utama" onClick={() => navigasi({ halaman: 'penerusan-wo', id: t.temuanId, query: { status: 'SEMUA' } })}>
          <Ikon nama="kanan" ukuran={15} />Buka di Penerusan Tim
        </button>
      </div>
    </aside>
  );
}
