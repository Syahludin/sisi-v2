import { useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { cekSection, groupPenyulang, isianSectionBaru, isianSectionDari, payloadSection } from '../../jaringan.js';
import useDataTab from './useDataTab.js';

/**
 * Tab Jaringan di Master Jaringan: penyulang + section (db_Jaringan). Tambah penyulang = tambah section pertamanya; aktif /
 * nonaktif penyulang = semua section-nya sekaligus; section dapat diubah dan dinonaktifkan satu per satu. Data tidak dihapus.
 */
export default function TabJaringan({ api, bolehUbah, kirim }) {
  const { data, memuat, galat, muat } = useDataTab(api, 'getJaringan');
  const [form, setForm] = useState(null);
  const [nonaktif, setNonaktif] = useState(false);
  const grup = useMemo(() => groupPenyulang(data?.section), [data]);
  const sesudah = () => muat(true);
  if (!data) return memuat ? <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div> : <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>;
  return (
    <>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      <div className="vt-saring">
        <label className="vt-cek"><input type="checkbox" checked={nonaktif} onChange={(e) => setNonaktif(e.target.checked)} />Tampilkan Nonaktif</label>
        <span className="k-spasi" />
        {bolehUbah && <button type="button" className="k-tombol k-tombol--utama" onClick={() => setForm(isianSectionBaru(''))}><Ikon nama="tambah" ukuran={16} />Tambah Penyulang / Section</button>}
      </div>
      {!grup.length && <p className="k-kosong">Belum ada penyulang. Tambahkan dari tombol di atas.</p>}
      {grup.filter((g) => nonaktif || g.aktif).map((g) => (
        <section key={g.penyulang} className={'vt-kartu' + (g.aktif ? '' : ' vt-redup')}>
          <header>
            <b>{g.penyulang}</b>
            <small>{g.section.filter((s) => s.aktif).length} section aktif</small>
            <span className="k-spasi" />
            {bolehUbah && (
              <>
                <button type="button" className="k-tautan" onClick={() => setForm(isianSectionBaru(g.penyulang))}>Tambah Section</button>
                <label className="vt-cek"><input type="checkbox" checked={g.aktif} onChange={(e) => kirim('setAktifPenyulang', { penyulang: g.penyulang, aktif: e.target.checked }, sesudah)} />{g.aktif ? 'Aktif' : 'Nonaktif'}</label>
              </>
            )}
          </header>
          <table className="k-tabel vt-tabel">
            <thead><tr><th>Section</th><th className="k-angka">Urutan</th><th className="k-angka">Segmen</th><th className="k-angka">Switching</th><th /></tr></thead>
            <tbody>
              {g.section.filter((s) => nonaktif || s.aktif).map((s) => (
                <tr key={s.sectionId} className={s.aktif ? '' : 'vt-redup'}>
                  <td><b>{s.section}</b>{!s.aktif && <small className="vt-merah"> · nonaktif</small>}</td>
                  <td className="k-angka">{s.urutan ?? '-'}</td>
                  <td className="k-angka">{s.jumlahSegmen}</td>
                  <td className="k-angka">{s.jumlahSwitching}</td>
                  <td>{bolehUbah && <button type="button" className="k-tautan" onClick={() => setForm(isianSectionDari(s))}>Ubah</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {form && <FormSection awal={form} section={data.section} onTutup={() => setForm(null)} onKirim={(p) => { setForm(null); kirim('simpanSection', p, sesudah); }} />}
    </>
  );
}

function FormSection({ awal, section, onTutup, onKirim }) {
  const [i, setI] = useState(awal);
  const [galat, setGalat] = useState({});
  const ubah = (o) => setI((x) => ({ ...x, ...o }));
  const daftarPny = [...new Set(section.map((s) => s.penyulang))].sort();
  const induk = section.filter((s) => s.penyulang === (i.penyulangBaru ? '' : i.penyulang) && s.sectionId !== i.sectionId);
  const simpan = () => {
    const g = cekSection(i);
    setGalat(g);
    if (!Object.keys(g).length) onKirim(payloadSection(i));
  };
  return (
    <Dialog buka judul={i.sectionId ? 'Ubah Section' : 'Tambah Section'} sub="Penyulang baru dibuat dengan menambah section pertamanya." onTutup={onTutup} lebar="min(620px, 96vw)">
      <div className="vt-grid">
        <label className="vt-isian">
          <span className="k-label">Penyulang *</span>
          <select className={'k-input' + (galat.penyulang ? ' k-input--galat' : '')} disabled={!!i.sectionId} value={i.penyulangBaru ? '__baru__' : i.penyulang}
            onChange={(e) => (e.target.value === '__baru__' ? ubah({ penyulangBaru: true, penyulang: '', parentSectionId: '' }) : ubah({ penyulangBaru: false, penyulang: e.target.value, parentSectionId: '' }))}>
            <option value="">Pilih penyulang</option>
            {daftarPny.map((p) => <option key={p} value={p}>{p}</option>)}
            {!i.sectionId && <option value="__baru__">+ Penyulang Baru</option>}
          </select>
          {galat.penyulang && <small className="k-galat">{galat.penyulang}</small>}
        </label>
        {i.penyulangBaru && (
          <label className="vt-isian">
            <span className="k-label">Nama Penyulang Baru *</span>
            <input className="k-input" value={i.penyulang} maxLength={80} onChange={(e) => ubah({ penyulang: e.target.value })} />
          </label>
        )}
        <label className="vt-isian">
          <span className="k-label">Nama Section *</span>
          <input className={'k-input' + (galat.section ? ' k-input--galat' : '')} value={i.section} maxLength={120} placeholder="mis. LBS Air Bara" onChange={(e) => ubah({ section: e.target.value })} />
          {galat.section && <small className="k-galat">{galat.section}</small>}
        </label>
        <label className="vt-isian">
          <span className="k-label">Section Induk</span>
          <select className="k-input" value={i.parentSectionId} onChange={(e) => ubah({ parentSectionId: e.target.value })}>
            <option value="">Tidak ada</option>
            {induk.map((s) => <option key={s.sectionId} value={s.sectionId}>{s.section}</option>)}
          </select>
        </label>
        <label className="vt-isian">
          <span className="k-label">Urutan Dari GI</span>
          <input className={'k-input' + (galat.urutan ? ' k-input--galat' : '')} value={i.urutan} inputMode="numeric" placeholder="Kosong = otomatis" onChange={(e) => ubah({ urutan: e.target.value })} />
          {galat.urutan && <small className="k-galat">{galat.urutan}</small>}
        </label>
      </div>
      {i.sectionId && <label className="vt-cek"><input type="checkbox" checked={i.aktif} onChange={(e) => ubah({ aktif: e.target.checked })} />Aktif (hapus centang untuk menonaktifkan, data tidak dihapus)</label>}
      <div className="k-dialog-aksi">
        <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Batal</button>
        <button type="button" className="k-tombol k-tombol--utama" onClick={simpan}>Simpan</button>
      </div>
    </Dialog>
  );
}
