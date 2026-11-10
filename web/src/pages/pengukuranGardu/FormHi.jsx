import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import PopupBerhasil from '../../components/PopupBerhasil.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { TAB_HI } from '../../hiGardu.def.js';
import { daftarPenyulang, daftarSection } from '../../laporan.js';
import { muatMaster } from '../../master.js';
import { galatHi, isianBerubah, jumlahTerisi, matriksFasa, nilaiAwalHi, payloadHi, pilihanIsian } from '../../pengukuranGardu.js';
import { pesan } from '../../pesan.js';
import { angka, BATAS_MS, kodeGalat } from './bantu.js';

/**
 * Form Update Pengukuran Gardu (HI v1). v1.0.38: simpan = db_Gardu saja (server menjawab cepat; 3 sheet lama ditulis pemicu
 * di belakang layar), lalu kartu berhasil seperti HP.
 */
export function FormHi({ g, api, sesi, bolehUbah, penjaga, onGardu }) {
  const [h, setH] = useState(null);
  const [awal, setAwal] = useState({});
  const [nilai, setNilai] = useState({});
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [sub, setSub] = useState(TAB_HI[0].id);
  const [jaringan, setJaringan] = useState([]);
  const [sibuk, setSibuk] = useState(false);
  const [coba, setCoba] = useState(false);
  const [galat, setGalat] = useState('');
  const [hasil, setHasil] = useState(null);   // kartu berhasil { judul, keterangan }
  const tutupHasil = useCallback(() => setHasil(null), []);
  const urut = useRef(0);

  const muat = useCallback(async () => {
    const no = ++urut.current;
    setMemuat(true); setGalatMuat('');
    try {
      const d = (await api('getHiGardu', { noGardu: g.no }, { batasMs: BATAS_MS })).data;
      if (no !== urut.current) return;
      const n = nilaiAwalHi(d);
      setH(d); setAwal(n); setNilai(n); setCoba(false);
    } catch (e) { if (no === urut.current) setGalatMuat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api, g.no]);
  useEffect(() => { muat(); muatMaster(api, sesi.token, 'jaringan').then(setJaringan, () => {}); }, [muat]);

  const berubah = useMemo(() => isianBerubah(awal, nilai), [awal, nilai]);
  const galatKolom = useMemo(() => galatHi(nilai), [nilai]);
  const kotor = berubah.length > 0;
  useEffect(() => {
    penjaga.current = kotor;
    if (!kotor) return undefined;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', tahan);
    return () => window.removeEventListener('beforeunload', tahan);
  }, [kotor, penjaga]);

  const ubah = (col, v) => setNilai((n) => ({ ...n, [col]: v, ...(col === 'E' ? { F: '' } : {}) }));
  const simpan = async () => {
    setCoba(true); setGalat('');
    if (Object.keys(galatKolom).length) { setGalat('Ada isian angka yang belum benar (ditandai merah).'); return; }
    setSibuk(true);
    try {
      const r = (await api('updateHiGardu', payloadHi(h.noGardu, h.revision, awal, nilai), { batasMs: BATAS_MS })).data;
      // nilai dari db_Gardu sesudah simpan (mis. angka disimpan sebagai angka, section resmi db_Jaringan)
      const n = nilaiAwalHi(r);
      setHasil({ judul: 'Data Berhasil disimpan', keterangan: 'Gardu ' + r.noGardu + (r.db.jumlah ? ' · ' + r.db.jumlah + ' kolom diperbarui' : ' · tidak ada perubahan') });
      setH({ ...h, revision: r.revision, sinkron: r.sinkron });
      setAwal(n);
      setNilai(n);
      penjaga.current = false;
      if (r.gardu) onGardu(r.gardu);
    } catch (e) {
      const kode = kodeGalat(e);
      setGalat(kode === 'KONFLIK_REVISION' ? 'Data gardu ini sudah diubah (admin lain / HP) sejak form dibuka. Muat ulang form, lalu isi lagi.' : pesan(kode) + ' Belum tersimpan, isian masih di layar.');
    }
    setSibuk(false);
  };

  if (!h && memuat) return <div className="k-tengah pg-dalam"><SisiLoader ukuran={44} label="Loading Data Gardu" /><p>Loading Data Gardu</p></div>;
  if (!h) {
    return (
      <div className="k-tengah k-tengah--galat pg-dalam" role="alert"><b>Data gardu belum bisa dimuat</b><p>{galatMuat}</p>
        <button type="button" className="k-tombol k-tombol--utama" onClick={muat}>Coba lagi</button></div>
    );
  }
  const tab = TAB_HI.find((t) => t.id === sub);
  const opsi = (f) => {
    if (f.col === 'E') return pilihanIsian(daftarPenyulang(jaringan), nilai.E);
    if (f.col === 'F') return pilihanIsian(daftarSection(jaringan, nilai.E).map((s) => s.nama), nilai.F);
    return pilihanIsian(f.pilihan, nilai[f.col]);
  };
  const fieldTab = (t) => t.seksi.flatMap((s) => s.fields);
  const ubahPerTab = (t) => fieldTab(t).filter((f) => berubah.includes(f.col)).length;
  const iTab = TAB_HI.indexOf(tab);
  const keTab = (t) => { setSub(t.id); document.querySelector('.db-isi')?.scrollTo({ top: 0, behavior: 'smooth' }); };

  /** Satu isian. tanpaLabel = di dalam tabel fasa (label = judul baris / kolom). */
  const medan = (f, tanpaLabel = false) => {
    const ganti = berubah.includes(f.col), g2 = coba || ganti ? galatKolom[f.col] : '';
    const kelas = 'k-input' + (ganti ? ' pg-ubah' : '') + (g2 ? ' k-input--galat' : '') + (f.tipe === 'number' ? ' k-input--angka' : '');
    const isi = f.tipe === 'select' ? (
      <select className={kelas} value={nilai[f.col]} disabled={f.mati} onChange={(e) => ubah(f.col, e.target.value)} aria-label={tanpaLabel ? f.label : undefined}>
        <option value="">-</option>
        {opsi(f).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input className={kelas} type={f.tipe === 'number' ? 'text' : (f.tipe || 'text')} inputMode={f.tipe === 'number' ? 'decimal' : undefined}
        value={nilai[f.col]} disabled={f.mati} placeholder={f.placeholder} maxLength={200} onChange={(e) => ubah(f.col, e.target.value)}
        aria-invalid={!!g2} aria-label={tanpaLabel ? f.label : undefined} title={ganti ? 'Sebelumnya: ' + (awal[f.col] || '(kosong)') : undefined} />
    );
    if (tanpaLabel) return <>{isi}{g2 && <small className="k-galat">{g2}</small>}</>;
    return (
      <label key={f.col} className={'k-medan pg-hi-f' + (f.lebar ? ' pg-hi-f--' + f.lebar : '')}>
        <span className="k-label">{f.label}{ganti && <i className="pg-titik-ubah" title={'Sebelumnya: ' + (awal[f.col] || '(kosong)')} />}</span>
        {isi}
        {g2 && <small className="k-galat">{g2}</small>}
      </label>
    );
  };

  return (
    <div className="pg-hi">
      {galatMuat && <p className="k-pesan k-pesan--galat">{galatMuat}</p>}
      <div className="pg-hi-tata">
        <nav className="pg-hi-langkah" aria-label="Kelompok isian">
          {TAB_HI.map((t, i) => {
            const n = ubahPerTab(t), f = fieldTab(t), terisi = jumlahTerisi(f, nilai);
            return (
              <button key={t.id} type="button" aria-current={sub === t.id ? 'step' : undefined}
                className={'pg-hi-langkah-item' + (sub === t.id ? ' pg-hi-langkah-item--aktif' : '')} onClick={() => keTab(t)}>
                <span className="pg-hi-langkah-no">{i + 1}</span>
                <span className="pg-hi-langkah-teks">
                  <b>{t.label}</b>
                  <small>{terisi}/{f.length} terisi{n > 0 && <em> · {n} berubah</em>}</small>
                  <span className="pg-hi-progres"><span style={{ width: Math.round((terisi / f.length) * 100) + '%' }} /></span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="pg-hi-panel">
          <header className="pg-hi-panel-kepala">
            <small>Langkah {iTab + 1} dari {TAB_HI.length}</small>
            <h3>{tab.label}</h3>
          </header>
          <fieldset className="pg-hi-isi" disabled={!bolehUbah || sibuk}>
            {tab.seksi.map((s) => {
              const [awalan, ...sisa] = s.judul.split(' · ');
              const periode = (awalan === 'WBP' || awalan === 'LWBP') ? awalan : '';
              const judul = periode ? sisa.join(' · ') : s.judul;
              const mx = matriksFasa(s.fields);
              const nUbah = s.fields.filter((f) => berubah.includes(f.col)).length;
              return (
                <section key={s.judul} className="pg-hi-seksi">
                  <header>
                    {periode && <span className={'k-badge pg-badge-' + periode.toLowerCase()}>{periode}</span>}
                    <h4>{judul}</h4>
                    <small>{jumlahTerisi(s.fields, nilai)}/{s.fields.length} terisi{nUbah > 0 && <em> · {nUbah} berubah</em>}</small>
                  </header>
                  {mx ? (
                    <div className="pg-hi-matriks-bungkus">
                      <table className="pg-hi-matriks">
                        <thead><tr>{mx.baris.some((b) => b.nama) && <th />}{mx.kolom.map((k) => <th key={k}><span className={'pg-fasa pg-fasa--' + k}>{k}</span></th>)}</tr></thead>
                        <tbody>
                          {mx.baris.map((b) => (
                            <tr key={b.nama}>
                              {mx.baris.some((x) => x.nama) && <th scope="row">{b.nama}</th>}
                              {mx.kolom.map((k) => <td key={k}>{b.sel[k] ? medan(b.sel[k], true) : null}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="pg-hi-grid">{s.fields.map((f) => medan(f))}</div>
                  )}
                </section>
              );
            })}
          </fieldset>
          <nav className="pg-hi-pindah" aria-label="Pindah kelompok isian">
            {iTab > 0 ? <button type="button" className="k-tombol k-tombol--garis" onClick={() => keTab(TAB_HI[iTab - 1])}><Ikon nama="kiri" ukuran={16} />{TAB_HI[iTab - 1].label}</button> : <span />}
            {iTab < TAB_HI.length - 1 && <button type="button" className="k-tombol k-tombol--garis" onClick={() => keTab(TAB_HI[iTab + 1])}>{TAB_HI[iTab + 1].label}<Ikon nama="kanan" ukuran={16} /></button>}
          </nav>
        </div>
      </div>
      {bolehUbah && (
        <footer className="pg-hi-aksi">
          <span className="pg-hi-status">{kotor ? berubah.length + ' isian berubah' : 'Belum ada perubahan'}</span>
          <span className="k-spasi" />
          {galat && <span className="k-galat pg-hi-galat" role="alert">{galat}</span>}
          {kotor && <button type="button" className="k-tombol k-tombol--teks" onClick={() => setNilai(awal)} disabled={sibuk}>Batalkan perubahan</button>}
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => { if (!kotor || window.confirm('Perubahan akan hilang. Muat ulang?')) muat(); }} disabled={sibuk || memuat}>Muat ulang</button>
          <button type="button" className="k-tombol k-tombol--utama" onClick={simpan} disabled={sibuk || !kotor}>
            {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}{sibuk ? 'Menyimpan...' : 'Simpan'}
          </button>
        </footer>
      )}
      <PopupBerhasil p={hasil} onTutup={tutupHasil} />
    </div>
  );
}

