import { useCallback, useEffect, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { labelCara, pilihanCara, teksDaya, teksSelisih } from '../../gudang.js';
import { kodeGalat, pesan } from '../../pesan.js';


function KartuSelisih({ s, api, bolehUbah, onSelesai }) {
  const cara = pilihanCara(s.arah);
  const [pilih, setPilih] = useState(cara[0]);
  const [catatan, setCatatan] = useState('');
  const [meter, setMeter] = useState('');
  const [perlu, setPerlu] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const simpan = async (e) => {
    e.preventDefault();
    setGalat('');
    if (!catatan.trim()) return setGalat(pesan('ALASAN_WAJIB'));
    if (pilih === 'SUSULAN' && (!meter.trim() || !perlu.trim())) return setGalat(pesan('FIELD_WAJIB'));
    setSibuk(true);
    try {
      const data = { selisihId: s.selisihId, cara: pilih, catatan: catatan.trim() };
      if (pilih === 'SUSULAN') { data.nomorMeter = meter.trim(); data.keperluan = perlu.trim(); }
      const j = await api('selesaikanSelisih', data, { batasMs: 60000 });
      onSelesai(j.data);
    } catch (err) { setGalat(pesan(kodeGalat(err))); setSibuk(false); }
  };

  return (
    <article className="gd-kartu gd-selisih">
      <header>
        <h3>{s.timNama} <small>{s.tanggal} · shift {s.shift}</small></h3>
        <span className={'k-badge ' + (s.arah === 'KURANG' ? 'k-badge--belum' : 'k-badge--proses')}>{s.arah}</span>
      </header>
      <p>{teksSelisih(s)}</p>
      {bolehUbah ? (
        <form className="gd-form" onSubmit={simpan}>
          <label className="k-medan"><span className="k-label">Cara penyelesaian</span>
            <select className="k-input" value={pilih} onChange={(e) => setPilih(e.target.value)}>{cara.map((c) => <option key={c} value={c}>{labelCara(c)}</option>)}</select>
          </label>
          {pilih === 'SUSULAN' && (
            <div className="gd-baris">
              <label className="k-medan"><span className="k-label">Nomor meter</span><input className="k-input" value={meter} onChange={(e) => setMeter(e.target.value)} maxLength={30} /></label>
              <label className="k-medan"><span className="k-label">Keperluan</span><input className="k-input" value={perlu} onChange={(e) => setPerlu(e.target.value)} maxLength={200} /></label>
            </div>
          )}
          {pilih === 'SUSULAN' && <small className="k-catatan">Dicatat atas nama shift dan petugas sebelumnya, satu MCB per simpan.</small>}
          <label className="k-medan"><span className="k-label">Catatan (wajib)</span><textarea className="k-input" rows={2} maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
          {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
          <div><button type="submit" className="k-tombol k-tombol--setuju" disabled={sibuk}>
            {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="centang" ukuran={16} />}Selesaikan</button></div>
        </form>
      ) : <p className="k-catatan">Akun ini hanya bisa melihat.</p>}
    </article>
  );
}

/** Tab Persetujuan Selisih: selisih MENUNGGU (Tidak diketahui) untuk diselesaikan, lalu daftar SUSULAN / DIKOREKSI untuk diperiksa. */
export default function Selisih({ api, bolehUbah }) {
  const [data, setData] = useState(null);
  const [selesai, setSelesai] = useState(null);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setData((await api('getSelisihGudang', { status: 'MENUNGGU' }, { batasMs: 60000 })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const lihatSelesai = async () => {
    try { setSelesai((await api('getSelisihGudang', { status: 'SELESAI' }, { batasMs: 60000 })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
  };
  const klikSelesai = (h) => {
    setInfo(h?.duplikat ? 'Sudah pernah diproses.' : 'Selisih diselesaikan.' + (h?.pemeriksaanStatus === 'DISETUJUI' ? ' Pemeriksaan disetujui, petugas bisa memakai stok.' : h?.pemeriksaanStatus === 'DIKEMBALIKAN' ? ' Pemeriksaan dikembalikan ke petugas.' : ''));
    muat();
  };

  if (!data && memuat) return <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat" /><p>Memuat selisih...</p></div>;
  return (
    <div className="gd-isi">
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}
      <h2 className="k-h2">Menunggu persetujuan <small>{data?.selisih.length || 0}</small></h2>
      {data && !data.selisih.length && <p className="k-kosong">Tidak ada selisih yang menunggu.</p>}
      {data?.selisih.map((s) => <KartuSelisih key={s.selisihId} s={s} api={api} bolehUbah={bolehUbah} onSelesai={klikSelesai} />)}

      <h2 className="k-h2">Pemakaian susulan <small>untuk diperiksa</small></h2>
      <DaftarPemakaian daftar={data?.susulan || []} />
      <h2 className="k-h2">Pemakaian dikoreksi <small>untuk diperiksa</small></h2>
      <DaftarPemakaian daftar={data?.dikoreksi || []} />

      <h2 className="k-h2">Sudah selesai</h2>
      {!selesai ? <div><button type="button" className="k-tombol k-tombol--garis" onClick={lihatSelesai}>Tampilkan selisih yang sudah selesai</button></div>
        : selesai.selisih.length ? (
          <div className="k-tabel-bungkus"><table className="k-tabel k-tabel--ringkas">
            <thead><tr><th>Tim</th><th>Tanggal</th><th>Selisih</th><th>Cara</th><th>Catatan</th></tr></thead>
            <tbody>{selesai.selisih.map((s) => <tr key={s.selisihId}><td>{s.timNama}</td><td>{s.tanggal} · shift {s.shift}</td><td>{teksSelisih(s)}</td><td>{labelCara(s.caraPenyelesaian)}</td><td>{s.catatanAdmin || '-'}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="k-kosong">Belum ada.</p>}
    </div>
  );
}

function DaftarPemakaian({ daftar }) {
  if (!daftar.length) return <p className="k-kosong">Tidak ada.</p>;
  return (
    <div className="k-tabel-bungkus"><table className="k-tabel k-tabel--ringkas">
      <thead><tr><th>Nomor</th><th>Tanggal</th><th>Nomor meter</th><th>MCB</th><th>Keperluan</th></tr></thead>
      <tbody>{daftar.map((p) => (
        <tr key={p.pemakaianId}><td>{p.nomorPemakaian}</td><td>{p.tanggal} · shift {p.shift}</td><td>{p.nomorMeter}</td><td>{teksDaya(p.daya)} {p.merk} {p.statusMcb}</td><td>{p.keperluan}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
