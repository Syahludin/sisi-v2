import { bolehUbahGudang } from '../gudang.js';
import IzinMaterial from './gudang/IzinMaterial.jsx';
import Pemakaian from './gudang/Pemakaian.jsx';
import Selisih from './gudang/Selisih.jsx';
import StokMaterial from './gudang/StokMaterial.jsx';
import './gudang.css';

const TAB = [['stok', 'Stok Material'], ['selisih', 'Persetujuan Selisih'], ['pemakaian', 'Pemakaian'], ['izin', 'Izin Material']];

/**
 * Material Gudang (menu OPS_GUDANG_MATERIAL, ADMIN / SUPER): stok MCB gudang dan per tim Yandal, tambah / kirim / tarik / koreksi stok,
 * persetujuan selisih pemeriksaan awal shift, pemakaian MCB (koreksi / batal), izin material per tim. Alamat: ?tab=.
 * Stok dihitung server dari buku mutasi; halaman ini hanya menampilkan dan mengirim perintah.
 */
export default function MaterialGudang({ sesi, api, rute, keRute }) {
  const bolehUbah = bolehUbahGudang(sesi);
  const tab = TAB.some(([k]) => k === rute.query.tab) ? rute.query.tab : 'stok';
  return (
    <div className="hlm gd">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Material Gudang</h1>
          <p>Stok MCB gudang dan tim Yandal, selisih pemeriksaan awal shift, pemakaian, izin material</p>
        </div>
      </header>
      {!bolehUbah && <p className="k-banner">Akun ini hanya bisa melihat. Mengubah stok hanya oleh Admin dengan akses ubah.</p>}
      <div className="k-tab" role="tablist" aria-label="Bagian Material Gudang">
        {TAB.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={'k-tab-tombol' + (tab === k ? ' k-tab-tombol--aktif' : '')}
            onClick={() => keRute({ query: { tab: k === 'stok' ? '' : k } }, { ganti: true })}>{l}</button>
        ))}
      </div>
      {tab === 'stok' && <StokMaterial key="stok" api={api} bolehUbah={bolehUbah} />}
      {tab === 'selisih' && <Selisih key="selisih" api={api} bolehUbah={bolehUbah} />}
      {tab === 'pemakaian' && <Pemakaian key="pemakaian" api={api} bolehUbah={bolehUbah} />}
      {tab === 'izin' && <IzinMaterial key="izin" api={api} bolehUbah={bolehUbah} />}
    </div>
  );
}
