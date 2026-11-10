import { useEffect, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { dataKirim, dataKoreksi, dataStok, dataTarik, hanyaAngka, idBaru, STATUS_MCB } from '../../gudang.js';
import { pesan } from '../../pesan.js';

const JUDUL = { tambah: 'Tambah stok gudang', kirim: 'Kirim stok ke tim', tarik: 'Tarik stok ke gudang', koreksi: 'Koreksi stok' };
const AKSI = {
  tambah: ['tambahStokGudang', dataStok], kirim: ['kirimStokTim', dataKirim], tarik: ['tarikStokTim', dataTarik], koreksi: ['koreksiStok', dataKoreksi],
};

/**
 * Dialog tambah / kirim / tarik / koreksi stok. d = { mode, isi } atau null (tertutup); isi = nilai awal (jenis MCB, timId, lokasi).
 * idOperasi dibuat sekali per pembukaan: tekan Simpan dua kali / kirim ulang tidak menggandakan mutasi di server.
 */
export default function FormStok({ d, master, api, onTutup, onSelesai }) {
  const [f, setF] = useState({});
  const [id, setId] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  useEffect(() => {
    if (!d) return;
    setF({ materialId: master.material[0]?.materialId || '', statusMcb: STATUS_MCB[0], daya: '', merk: '', jumlah: '', jumlahBaru: '', lokasi: 'GUDANG', ...d.isi });
    setId(idBaru()); setGalat(''); setSibuk(false);
  }, [d]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Dialog buka={false} judul="" onTutup={onTutup} />;

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const kirim = async (e) => {
    e.preventDefault();
    setGalat('');
    const [aksi, bangun] = AKSI[d.mode];
    let payload;
    try { payload = bangun(f, id); } catch (err) { setGalat(pesan(err.kode)); return; }
    setSibuk(true);
    try {
      const j = await api(aksi, payload, { batasMs: 60000 });
      onSelesai(j.data, d.mode);
    } catch (err) { setGalat(pesan((err && err.kode) || 'JARINGAN')); setSibuk(false); }
  };

  const perluTim = d.mode === 'kirim' || d.mode === 'tarik';
  const teksAlasan = d.mode === 'tarik' || d.mode === 'koreksi';
  return (
    <Dialog buka={!!d} judul={JUDUL[d.mode]} kunci={sibuk} onTutup={onTutup}>
      <form className="gd-form" onSubmit={kirim}>
        <label className="k-medan"><span className="k-label">Material</span>
          <select className="k-input" value={f.materialId || ''} onChange={set('materialId')}>
            {master.material.map((m) => <option key={m.materialId} value={m.materialId}>{m.nama}</option>)}
          </select>
        </label>
        <div className="gd-baris">
          <label className="k-medan"><span className="k-label">Daya (A)</span><input className="k-input k-input--angka" value={f.daya} onChange={(e) => setF((x) => ({ ...x, daya: hanyaAngka(e.target.value) }))} inputMode="numeric" maxLength={4} placeholder="mis. 2" autoFocus /></label>
          <label className="k-medan"><span className="k-label">Merk</span><input className="k-input" value={f.merk} onChange={set('merk')} maxLength={40} /></label>
          <label className="k-medan"><span className="k-label">Status MCB</span>
            <select className="k-input" value={f.statusMcb} onChange={set('statusMcb')}>{STATUS_MCB.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        </div>
        {perluTim && (
          <label className="k-medan"><span className="k-label">Tim</span>
            <select className="k-input" value={f.timId || ''} onChange={set('timId')}>
              <option value="">Pilih tim</option>
              {master.tim.map((t) => <option key={t.timId} value={t.timId}>{t.nama}</option>)}
            </select>
          </label>
        )}
        {d.mode === 'koreksi' && (
          <label className="k-medan"><span className="k-label">Lokasi stok</span>
            <select className="k-input" value={f.lokasi} onChange={set('lokasi')}>
              <option value="GUDANG">Gudang</option>
              {master.tim.map((t) => <option key={t.timId} value={t.timId}>{t.nama}</option>)}
            </select>
          </label>
        )}
        <label className="k-medan"><span className="k-label">{d.mode === 'koreksi' ? 'Jumlah yang benar' : 'Jumlah'}</span>
          <input className="k-input k-input--angka" inputMode="numeric" value={d.mode === 'koreksi' ? f.jumlahBaru : f.jumlah} onChange={set(d.mode === 'koreksi' ? 'jumlahBaru' : 'jumlah')} style={{ maxWidth: 140 }} />
        </label>
        <label className="k-medan"><span className="k-label">{teksAlasan ? 'Alasan (wajib, tercatat)' : 'Catatan (boleh kosong)'}</span>
          <textarea className="k-input" rows={2} maxLength={200} value={(teksAlasan ? f.alasan : f.catatan) || ''} onChange={set(teksAlasan ? 'alasan' : 'catatan')} />
        </label>
        {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--utama" disabled={sibuk}>
            {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}Simpan
          </button>
        </div>
      </form>
    </Dialog>
  );
}
