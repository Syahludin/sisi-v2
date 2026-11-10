import { useCallback, useEffect, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { hanyaAngka, STATUS_MCB, teksDaya } from '../../gudang.js';
import { kodeGalat, pesan } from '../../pesan.js';
import { geserTanggal, hariIniWib } from '../../tanggal.js';


/** Dialog koreksi (isi / jenis MCB) atau pembatalan satu pemakaian. d = { mode: 'koreksi'|'batal', p } atau null. */
function DialogUbah({ d, api, onTutup, onSelesai }) {
  const [f, setF] = useState({});
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  useEffect(() => {
    if (d) { setF({ nomorMeter: d.p.nomorMeter, keperluan: d.p.keperluan, daya: d.p.daya, merk: d.p.merk, statusMcb: d.p.statusMcb, alasan: '' }); setGalat(''); setSibuk(false); }
  }, [d]);
  if (!d) return <Dialog buka={false} judul="" onTutup={onTutup} />;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const kirim = async (e) => {
    e.preventDefault();
    setGalat('');
    if (!f.alasan.trim()) return setGalat(pesan('ALASAN_WAJIB'));
    setSibuk(true);
    try {
      const dasar = { pemakaianId: d.p.pemakaianId, revision: d.p.revision, alasan: f.alasan.trim() };
      if (d.mode === 'batal') await api('batalkanPemakaian', dasar, { batasMs: 60000 });
      else await api('koreksiPemakaian', { ...dasar, nomorMeter: f.nomorMeter.trim(), keperluan: f.keperluan.trim(), daya: f.daya.trim(), merk: f.merk.trim(), statusMcb: f.statusMcb }, { batasMs: 60000 });
      onSelesai(d.mode);
    } catch (err) { setGalat(pesan(kodeGalat(err))); setSibuk(false); }
  };
  const batal = d.mode === 'batal';
  return (
    <Dialog buka={!!d} judul={batal ? 'Batalkan pemakaian' : 'Koreksi pemakaian'} sub={d.p.nomorPemakaian} kunci={sibuk} onTutup={onTutup}>
      <form className="gd-form" onSubmit={kirim}>
        {batal ? <p className="k-dialog-teks">MCB kembali ke stok tim. Nomor pemakaian ini tidak dipakai ulang.</p> : (
          <>
            <label className="k-medan"><span className="k-label">Nomor meter</span><input className="k-input" value={f.nomorMeter} onChange={set('nomorMeter')} maxLength={30} /></label>
            <label className="k-medan"><span className="k-label">Keperluan</span><input className="k-input" value={f.keperluan} onChange={set('keperluan')} maxLength={200} /></label>
            <div className="gd-baris">
              <label className="k-medan"><span className="k-label">Daya (A)</span><input className="k-input k-input--angka" value={f.daya} onChange={(e) => setF((x) => ({ ...x, daya: hanyaAngka(e.target.value) }))} inputMode="numeric" maxLength={4} /></label>
              <label className="k-medan"><span className="k-label">Merk</span><input className="k-input" value={f.merk} onChange={set('merk')} maxLength={40} /></label>
              <label className="k-medan"><span className="k-label">Status MCB</span><select className="k-input" value={f.statusMcb} onChange={set('statusMcb')}>{STATUS_MCB.map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>
            <small className="k-catatan">Mengganti daya / merk / status memindahkan stok: jenis lama kembali, jenis baru berkurang.</small>
          </>
        )}
        <label className="k-medan"><span className="k-label">Alasan (wajib, tercatat)</span><textarea className="k-input" rows={2} maxLength={200} value={f.alasan} onChange={set('alasan')} autoFocus /></label>
        {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className={'k-tombol ' + (batal ? 'k-tombol--bahaya' : 'k-tombol--utama')} disabled={sibuk}>
            {sibuk && <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" />}{batal ? 'Batalkan pemakaian' : 'Simpan koreksi'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DialogFoto({ d, onTutup }) {
  return (
    <Dialog buka={!!d} judul="Foto penggunaan" sub={d?.p.nomorPemakaian} onTutup={onTutup} lebar="min(720px, 94vw)">
      {d && (d.src ? <img className="gd-foto" alt={'Foto ' + d.p.nomorPemakaian} src={d.src} /> : d.galat ? <p className="k-pesan k-pesan--galat" role="alert">{d.galat}</p>
        : <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat foto" /></div>)}
      <div className="k-dialog-aksi"><button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Tutup</button></div>
    </Dialog>
  );
}

/** Tab Pemakaian: daftar pemakaian MCB per rentang tanggal; koreksi, batalkan, lihat foto. */
export default function Pemakaian({ api, bolehUbah }) {
  const [dari, setDari] = useState(geserTanggal(hariIniWib(), -6));
  const [sampai, setSampai] = useState(hariIniWib());
  const [merk, setMerk] = useState('');
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [ubah, setUbah] = useState(null);
  const [foto, setFoto] = useState(null);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setData((await api('getPemakaianGudang', { dari, sampai, ...(merk.trim() ? { merk: merk.trim() } : {}) }, { batasMs: 60000 })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api, dari, sampai, merk]);
  useEffect(() => { muat(); }, [muat]);

  const lihatFoto = async (p) => {
    setFoto({ p });
    try {
      const j = await api('getFotoGudang', { jenis: 'PEMAKAIAN', id: p.pemakaianId, ukuran: 'PENUH' }, { batasMs: 90000 });
      setFoto({ p, src: 'data:' + (j.data.mime || 'image/jpeg') + ';base64,' + j.data.data });
    } catch (e) { setFoto({ p, galat: pesan(kodeGalat(e)) }); }
  };

  return (
    <div className="gd-isi">
      <div className="gd-saring">
        <label className="k-medan"><span className="k-label">Dari</span><input className="k-input" type="date" value={dari} max={sampai} onChange={(e) => e.target.value && setDari(e.target.value)} /></label>
        <label className="k-medan"><span className="k-label">Sampai</span><input className="k-input" type="date" value={sampai} min={dari} onChange={(e) => e.target.value && setSampai(e.target.value)} /></label>
        <label className="k-medan"><span className="k-label">Merk</span><input className="k-input" value={merk} onChange={(e) => setMerk(e.target.value)} placeholder="Cari merk" /></label>
      </div>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}
      {!data && memuat ? <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat" /><p>Memuat pemakaian...</p></div>
        : data && !data.pemakaian.length ? <p className="k-kosong">Tidak ada pemakaian pada rentang ini.</p>
          : data && (
            <div className="k-tabel-bungkus"><table className="k-tabel k-tabel--ringkas">
              <thead><tr><th>Nomor</th><th>Tanggal</th><th>Nomor meter</th><th>MCB</th><th>Keperluan</th><th>Catatan</th><th /></tr></thead>
              <tbody>{data.pemakaian.map((p) => (
                <tr key={p.pemakaianId} className={p.jenisCatatan === 'BATAL' ? 'gd-batal' : ''}>
                  <td>{p.nomorPemakaian}</td><td>{p.tanggal} · shift {p.shift}</td><td>{p.nomorMeter}</td><td>{teksDaya(p.daya)} {p.merk} {p.statusMcb}</td><td>{p.keperluan}</td>
                  <td>{p.jenisCatatan === 'NORMAL' ? '-' : p.jenisCatatan}</td>
                  <td className="gd-aksi">
                    {p.linkFoto && <button type="button" className="k-tombol k-tombol--teks" onClick={() => lihatFoto(p)}><Ikon nama="mata" ukuran={14} />Foto</button>}
                    {bolehUbah && p.jenisCatatan !== 'BATAL' && (
                      <>
                        <button type="button" className="k-tombol k-tombol--garis" onClick={() => setUbah({ mode: 'koreksi', p })}>Koreksi</button>
                        <button type="button" className="k-tombol k-tombol--tolak" onClick={() => setUbah({ mode: 'batal', p })}>Batalkan</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
      <DialogUbah d={ubah} api={api} onTutup={() => setUbah(null)} onSelesai={(mode) => { setUbah(null); setInfo(mode === 'batal' ? 'Pemakaian dibatalkan, MCB kembali ke stok tim.' : 'Koreksi tersimpan.'); muat(); }} />
      <DialogFoto d={foto} onTutup={() => setFoto(null)} />
    </div>
  );
}
