import { useCallback, useEffect, useMemo, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { kodeGalat, pesan } from '../../pesan.js';


/**
 * Tab Izin Material: tim mana boleh memakai material apa (db_Material_Tim). Material tanpa izin tidak muncul di pilihan
 * tim mana pun. Mencabut izin boleh walau tim masih punya stok: stok itu jadi "tanpa izin" (tarik di tab Stok Material).
 */
export default function IzinMaterial({ api, bolehUbah }) {
  const [data, setData] = useState(null);
  const [materialId, setMaterialId] = useState('');
  const [pilih, setPilih] = useState(new Set());
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setData((await api('getIzinMaterial', {}, { batasMs: 60000 })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    if (!data) return;
    const id = data.material.some((m) => m.materialId === materialId) ? materialId : data.material[0]?.materialId || '';
    if (id !== materialId) { setMaterialId(id); return; }
    setPilih(new Set(data.izin.filter((i) => i.materialId === id && i.aktif).map((i) => i.timId)));
  }, [data, materialId]);

  const kelompok = useMemo(() => {
    const k = {};
    (data?.tim || []).forEach((t) => { (k[t.jenis || 'LAIN'] = k[t.jenis || 'LAIN'] || []).push(t); });
    return Object.keys(k).sort().map((j) => [j, k[j]]);
  }, [data]);

  const alih = (id) => setPilih((s) => { const b = new Set(s); if (b.has(id)) b.delete(id); else b.add(id); return b; });
  const semuaJenis = (tim, nyala) => setPilih((s) => { const b = new Set(s); tim.forEach((t) => (nyala ? b.add(t.timId) : b.delete(t.timId))); return b; });

  const simpan = async () => {
    setSibuk(true); setGalat(''); setInfo('');
    try {
      const j = await api('simpanIzinMaterial', { materialId, timIds: [...pilih] }, { batasMs: 60000 });
      const sisa = j.data.stokTertinggal || [];
      setInfo('Izin tersimpan.' + (sisa.length ? ' Peringatan: stok masih tertinggal di ' + sisa.map((s) => (data.tim.find((t) => t.timId === s.timId)?.nama || s.timId) + ' (' + s.jumlah + ')').join(', ') + '. Tarik ke gudang di tab Stok Material.' : ''));
      await muat();
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setSibuk(false);
  };

  if (!data && memuat) return <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat" /><p>Memuat izin...</p></div>;
  if (!data) return <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>;
  return (
    <div className="gd-isi">
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}
      <label className="k-medan gd-material"><span className="k-label">Material</span>
        <select className="k-input" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>{data.material.map((m) => <option key={m.materialId} value={m.materialId}>{m.nama}</option>)}</select>
      </label>
      <p className="k-catatan">Material tanpa izin tidak boleh dipakai tim mana pun. Centang tim yang boleh memakai {data.material.find((m) => m.materialId === materialId)?.nama || 'material ini'}.</p>
      {kelompok.map(([jenis, tim]) => (
        <section className="gd-kartu" key={jenis}>
          <header><h2 className="k-h2">{jenis}</h2>
            {bolehUbah && <span className="gd-aksi">
              <button type="button" className="k-tombol k-tombol--teks" onClick={() => semuaJenis(tim, true)}>Pilih semua tim {jenis}</button>
              <button type="button" className="k-tombol k-tombol--teks" onClick={() => semuaJenis(tim, false)}>Kosongkan</button>
            </span>}
          </header>
          <div className="gd-centang">
            {tim.map((t) => (
              <label key={t.timId} className="gd-pilih"><input type="checkbox" checked={pilih.has(t.timId)} disabled={!bolehUbah || sibuk} onChange={() => alih(t.timId)} />{t.nama}</label>
            ))}
          </div>
        </section>
      ))}
      {bolehUbah && (
        <div><button type="button" className="k-tombol k-tombol--utama" onClick={simpan} disabled={sibuk || !materialId}>
          {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}Simpan izin</button></div>
      )}
    </div>
  );
}
