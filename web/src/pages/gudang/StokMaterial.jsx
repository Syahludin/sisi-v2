import { useCallback, useEffect, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { adaStokTanpaIzin, LABEL_MUTASI, ringkasJenis, teksDaya, totalJenis } from '../../gudang.js';
import { kodeGalat, pesan } from '../../pesan.js';
import FormStok from './FormStok.jsx';


function TabelJenis({ daftar, nama, aksi }) {
  if (!daftar.length) return <p className="k-kosong">Tidak ada stok.</p>;
  return (
    <div className="k-tabel-bungkus">
      <table className="k-tabel k-tabel--ringkas">
        <thead><tr><th>Material</th><th>Daya</th><th>Merk</th><th>Status</th><th className="gd-angka">Jumlah</th>{aksi && <th />}</tr></thead>
        <tbody>
          {daftar.map((j) => (
            <tr key={[j.materialId, j.daya, j.merk, j.statusMcb].join('|')}>
              <td>{nama(j.materialId)}</td><td>{teksDaya(j.daya)}</td><td>{j.merk}</td><td><span className={'gd-status gd-status--' + (j.statusMcb === 'Baru' ? 'baru' : 'ex')}>{j.statusMcb}</span></td><td className="gd-angka"><b className="gd-besar">{j.jumlah}</b></td>
              {aksi && <td className="gd-aksi">{aksi(j)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tab Stok Material: saldo gudang, saldo tiap tim (termasuk stok tanpa izin), riwayat mutasi; tambah / kirim / tarik / koreksi. */
export default function StokMaterial({ api, bolehUbah }) {
  const [data, setData] = useState(null);
  const [master, setMaster] = useState(null);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [form, setForm] = useState(null);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try {
      const [s, m] = await Promise.all([api('getGudangStok', {}, { batasMs: 60000 }), api('getIzinMaterial', {}, { batasMs: 60000 })]);
      setData(s.data); setMaster(m.data);
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const nama = (id) => master?.material.find((m) => m.materialId === id)?.nama || '-';
  const namaLokasi = (l) => (l === 'GUDANG' ? 'Gudang' : data?.tim.find((t) => t.timId === l)?.nama || master?.tim.find((t) => t.timId === l)?.nama || l);
  const buka = (mode, isi = {}) => { setInfo(''); setForm({ mode, isi }); };
  const selesai = (hasil, mode) => {
    setForm(null);
    setInfo(hasil?.duplikat ? 'Operasi ini sudah pernah tersimpan.' : hasil?.tanpaPerubahan ? 'Jumlah sudah sama, tidak ada yang diubah.' : 'Tersimpan.');
    muat();
    return mode;
  };

  if (!data && memuat) return <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat" /><p>Memuat stok...</p></div>;
  if (!data) return <div className="k-tengah k-tengah--galat" role="alert"><Ikon nama="peringatan" ukuran={30} /><b>Stok belum bisa dimuat</b><p>{galat}</p>
    <button type="button" className="k-tombol k-tombol--utama" onClick={muat}><Ikon nama="ulang" ukuran={16} />Coba lagi</button></div>;

  const jenisIsi = (j) => ({ materialId: j.materialId, daya: j.daya, merk: j.merk, statusMcb: j.statusMcb });
  return (
    <div className="gd-isi">
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}
      <div className="gd-kpi">
        <div><small>MCB di gudang</small><b>{totalJenis(data.gudang)}</b></div>
        <div className="gd-kpi--hijau"><small>MCB di tim</small><b>{data.tim.reduce((a, t) => a + totalJenis(t.stok), 0)}</b></div>
        <div className={data.tim.some(adaStokTanpaIzin) ? 'gd-kpi--merah' : ''}><small>Tanpa izin</small><b>{data.tim.reduce((a, t) => a + totalJenis(t.tanpaIzin), 0)}</b></div>
      </div>
      <section className="gd-kartu">
        <header><h2 className="k-h2">Gudang <small>{totalJenis(data.gudang)} unit</small></h2>
          {bolehUbah && <button type="button" className="k-tombol k-tombol--utama" onClick={() => buka('tambah')}><Ikon nama="tambah" ukuran={16} />Tambah stok</button>}
        </header>
        <TabelJenis daftar={data.gudang} nama={nama} aksi={bolehUbah ? (j) => (
          <>
            <button type="button" className="k-tombol k-tombol--garis" onClick={() => buka('kirim', jenisIsi(j))}>Kirim ke tim</button>
            <button type="button" className="k-tombol k-tombol--teks" onClick={() => buka('koreksi', { ...jenisIsi(j), lokasi: 'GUDANG' })}>Koreksi</button>
          </>) : null} />
      </section>

      {data.tim.map((t) => (
        <section className="gd-kartu" key={t.timId}>
          <header><h2 className="k-h2">{t.nama} <small>{totalJenis(t.stok)} unit{adaStokTanpaIzin(t) ? ` · ${totalJenis(t.tanpaIzin)} tanpa izin` : ''}</small></h2>
            {bolehUbah && <button type="button" className="k-tombol k-tombol--garis" onClick={() => buka('kirim', { timId: t.timId })}>Kirim stok</button>}
          </header>
          <TabelJenis daftar={t.stok} nama={nama} aksi={bolehUbah ? (j) => (
            <>
              <button type="button" className="k-tombol k-tombol--garis" onClick={() => buka('tarik', { ...jenisIsi(j), timId: t.timId, jumlah: String(j.jumlah) })}>Tarik</button>
              <button type="button" className="k-tombol k-tombol--teks" onClick={() => buka('koreksi', { ...jenisIsi(j), lokasi: t.timId, jumlahBaru: String(j.jumlah) })}>Koreksi</button>
            </>) : null} />
          {adaStokTanpaIzin(t) && (
            <div className="gd-tanpa-izin">
              <p className="k-peringatan"><Ikon nama="peringatan" ukuran={16} />Stok tanpa izin: tim ini tidak boleh memakainya lagi. Tarik ke gudang atau beri izin lagi di tab Izin Material.</p>
              <TabelJenis daftar={t.tanpaIzin} nama={nama} aksi={bolehUbah ? (j) => (
                <button type="button" className="k-tombol k-tombol--tolak" onClick={() => buka('tarik', { ...jenisIsi(j), timId: t.timId, jumlah: String(j.jumlah), alasan: 'Izin material dicabut' })}>Tarik ke gudang</button>) : null} />
            </div>
          )}
        </section>
      ))}

      <section className="gd-kartu">
        <header><h2 className="k-h2">Riwayat mutasi <small>200 terbaru</small></h2></header>
        {data.mutasi.length ? (
          <div className="k-tabel-bungkus">
            <table className="k-tabel k-tabel--ringkas">
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Lokasi</th><th>MCB</th><th className="gd-angka">Jumlah</th><th>Catatan</th></tr></thead>
              <tbody>
                {data.mutasi.map((m) => (
                  <tr key={m.mutasiId}>
                    <td>{m.waktu}</td><td>{LABEL_MUTASI[m.jenisMutasi] || m.jenisMutasi}</td><td>{namaLokasi(m.lokasi)}</td>
                    <td>{ringkasJenis([{ ...m, jumlah: 1 }]).replace('1 × ', '')}</td>
                    <td className="gd-angka">{m.jumlah > 0 ? '+' + m.jumlah : m.jumlah}</td><td>{m.catatan || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="k-kosong">Belum ada mutasi.</p>}
      </section>

      <FormStok d={form} master={master} api={api} onTutup={() => setForm(null)} onSelesai={selesai} />
    </div>
  );
}
