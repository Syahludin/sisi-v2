import { useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { labelSwitching } from '../../masterSwitching.js';
import { AKHIR_SEGMEN, AWAL_SEGMEN, JENIS_KABEL_TANAH, JENIS_SEGMEN, cekSegmen, isianSegmenBaru, isianSegmenDari, kabelTanah, payloadSegmen, saringSegmen } from '../../tiang.js';
import useDataTab from './useDataTab.js';

/** Tab Segmen di Master Jaringan: daftar + form satu per satu. Simpan berjalan di latar belakang (kirim dari useKirimLatar). */
export default function TabSegmen({ api, bolehUbah, kirim }) {
  const { data, memuat, galat, muat } = useDataTab(api, 'getSegmen');
  const [penyulang, setPenyulang] = useState('');
  const [nonaktif, setNonaktif] = useState(false);
  const [form, setForm] = useState(null);
  const daftarPny = useMemo(() => [...new Set((data?.jaringan || []).map((x) => x.penyulang))].sort(), [data]);
  const section = useMemo(() => Object.fromEntries((data?.jaringan || []).map((x) => [x.sectionId, x.section])), [data]);
  const tampil = saringSegmen(data?.segmen, { penyulang, nonaktif });
  const kirimForm = (payload) => { setForm(null); kirim('simpanSegmen', payload, () => muat(true)); };
  if (!data) return memuat ? <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div> : <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>;
  return (
    <>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      <div className="vt-saring">
        <select className="k-input" value={penyulang} onChange={(e) => setPenyulang(e.target.value)} aria-label="Penyulang">
          <option value="">Semua Penyulang</option>
          {daftarPny.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="vt-cek"><input type="checkbox" checked={nonaktif} onChange={(e) => setNonaktif(e.target.checked)} />Tampilkan Nonaktif</label>
        <span className="k-spasi" />
        {bolehUbah && <button type="button" className="k-tombol k-tombol--utama" onClick={() => setForm(isianSegmenBaru(penyulang))}><Ikon nama="tambah" ukuran={16} />Tambah Segmen</button>}
      </div>
      {!tampil.length ? <p className="k-kosong">Belum ada segmen. Tambahkan satu per satu.</p> : (
        <div className="k-tabel-bungkus">
          <table className="k-tabel vt-tabel">
            <thead><tr><th>ID</th><th>Nama Segmen</th><th>Penyulang / Section</th><th>Awal → Akhir</th><th className="k-angka">Urutan</th><th className="k-angka">Tiang</th><th /></tr></thead>
            <tbody>
              {tampil.map((s) => (
                <tr key={s.segmenId} className={s.aktif ? '' : 'vt-redup'}>
                  <td>{s.segmenId}</td>
                  <td><b>{s.nama}</b>{kabelTanah(s) && <small className="vt-sub">Kabel tanah{s.statusData === 'KURANG' ? ' · data kabel belum lengkap' : ''}</small>}{!s.aktif && <small className="vt-merah"> · nonaktif</small>}</td>
                  <td>{s.penyulang}<small className="vt-sub">{section[s.sectionId] || s.sectionId}</small></td>
                  <td>{s.awalNama} → {s.akhirNama}</td>
                  <td className="k-angka">{s.urutan ?? '-'}</td>
                  <td className="k-angka">{kabelTanah(s) ? '-' : s.jumlahTerverifikasi + '/' + s.jumlahTiang}</td>
                  <td>{bolehUbah && <button type="button" className="k-tautan" onClick={() => setForm(isianSegmenDari(s))}>Ubah</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <FormSegmen awal={form} data={data} onTutup={() => setForm(null)} onKirim={kirimForm} />}
    </>
  );
}

function FormSegmen({ awal, data, onTutup, onKirim }) {
  const [i, setI] = useState(awal);
  const [galat, setGalat] = useState({});
  const [galatKirim, setGalatKirim] = useState('');
  const ubah = (o) => setI((x) => ({ ...x, ...o }));
  const daftarPny = [...new Set((data.jaringan || []).map((x) => x.penyulang))].sort();
  const sections = (data.jaringan || []).filter((x) => x.penyulang === i.penyulang);
  const switching = (data.switching || []).filter((w) => !i.penyulang || w.penyulang === i.penyulang);
  const pilihanSwc = switching.map((w) => [w.switchingId, labelSwitching(w.jenis, w.nama)]);
  const induk = (data.segmen || []).filter((s) => s.aktif && s.penyulang === i.penyulang && s.segmenId !== i.segmenId);
  const isian = (k, label, o = {}) => (
    <label className="vt-isian">
      <span className="k-label">{label}</span>
      <input className={'k-input' + (galat[k] ? ' k-input--galat' : '')} value={i[k] ?? ''} onChange={(e) => ubah({ [k]: e.target.value })} {...o} />
      {galat[k] && <small className="k-galat">{galat[k]}</small>}
    </label>
  );
  const pilih = (k, label, isi, kosong, sesudah) => (
    <label className="vt-isian">
      <span className="k-label">{label}</span>
      <select className={'k-input' + (galat[k] ? ' k-input--galat' : '')} value={i[k] ?? ''} onChange={(e) => ubah({ [k]: e.target.value, ...(sesudah ? sesudah(e.target.value) : {}) })}>
        {kosong !== null && <option value="">{kosong}</option>}
        {isi.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
      </select>
      {galat[k] && <small className="k-galat">{galat[k]}</small>}
    </label>
  );
  const namaSwc = (id) => { const w = switching.find((x) => x.switchingId === id); return w ? labelSwitching(w.jenis, w.nama) : undefined; };
  const simpan = () => {
    const g = cekSegmen(i, data.jaringan);
    setGalat(g);
    if (Object.keys(g).length) { setGalatKirim('Periksa isian bertanda merah.'); return; }
    onKirim(payloadSegmen(i));
  };
  return (
    <Dialog buka judul={i.segmenId ? 'Ubah ' + i.segmenId : 'Tambah Segmen'} sub="Segmen = jalur antar-titik batas di dalam satu section. Isian bertanda * wajib." onTutup={onTutup} lebar="min(760px, 96vw)">
      <div className="vt-grid">
        {isian('nama', 'Nama Segmen *', { placeholder: 'mis. PMT Tungkal - SKTM Tungkal', maxLength: 100 })}
        {pilih('jenisSegmen', 'Jenis Segmen *', JENIS_SEGMEN, null)}
        {pilih('penyulang', 'Penyulang *', daftarPny.map((p) => [p, p]), 'Pilih penyulang', () => ({ sectionId: '', indukSegmenId: '' }))}
        {pilih('sectionId', 'Section *', sections.map((x) => [x.sectionId, x.section]), i.penyulang ? 'Pilih section' : 'Pilih penyulang dulu')}
        {pilih('indukSegmenId', 'Segmen Induk (Percabangan)', induk.map((s) => [s.segmenId, s.nama + ' (' + s.segmenId + ')']), 'Tidak ada')}
      </div>
      <h3 className="vt-sub-judul">Titik Awal</h3>
      <div className="vt-grid">
        {pilih('awalJenis', 'Jenis *', AWAL_SEGMEN, null)}
        {i.awalJenis === 'SWITCHING' && pilih('awalSwitchingId', 'Switching', pilihanSwc, 'Belum ada di master switching', (v) => (namaSwc(v) ? { awalNama: namaSwc(v) } : {}))}
        {isian('awalNama', 'Nama Titik Awal *', { maxLength: 80 })}
      </div>
      <h3 className="vt-sub-judul">Titik Akhir</h3>
      <div className="vt-grid">
        {pilih('akhirJenis', 'Jenis *', AKHIR_SEGMEN, null)}
        {i.akhirJenis === 'SWITCHING' && pilih('akhirSwitchingId', 'Switching', pilihanSwc, 'Belum ada di master switching', (v) => (namaSwc(v) ? { akhirNama: namaSwc(v) } : {}))}
        {isian('akhirNama', 'Nama Titik Akhir *', { maxLength: 80 })}
      </div>
      {kabelTanah(i) && (
        <>
          <h3 className="vt-sub-judul">Data Kabel Tanah</h3>
          <div className="vt-grid">
            {pilih('jenisKabel', 'Jenis Kabel', JENIS_KABEL_TANAH, 'Belum diketahui')}
            {isian('ukuranMm2', 'Penampang (mm²)', { inputMode: 'decimal', placeholder: 'mis. 240' })}
            {isian('panjangKabelM', 'Panjang Rute Kabel (m)', { inputMode: 'decimal', placeholder: 'Ukur rute, bukan jarak lurus' })}
            {isian('penghantarId', 'Acuan Penghantar', { maxLength: 40 })}
          </div>
          <p className="vt-sub">Segmen kabel tanah tidak berisi tiang. Data yang belum lengkap ditandai &quot;belum lengkap&quot; dan tetap bisa disimpan.</p>
        </>
      )}
      <h3 className="vt-sub-judul">Lainnya</h3>
      <div className="vt-grid">
        {isian('urutan', 'Urutan Dari GI', { placeholder: 'Kosong = otomatis', inputMode: 'numeric' })}
        {isian('segmenItb', 'Rujukan Segmen ITB', { maxLength: 200 })}
        {isian('catatan', 'Catatan', { maxLength: 300 })}
      </div>
      {i.segmenId && <label className="vt-cek"><input type="checkbox" checked={i.aktif} onChange={(e) => ubah({ aktif: e.target.checked })} />Aktif (hapus centang untuk menonaktifkan, data tidak dihapus)</label>}
      {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
      <div className="k-dialog-aksi">
        <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Batal</button>
        <button type="button" className="k-tombol k-tombol--utama" onClick={simpan}>Simpan Segmen</button>
      </div>
    </Dialog>
  );
}
