/** Approval P0 web: dialog Setujui / Tolak / Edit jenis pekerjaan / foto besar. Review 8 Nov 2026: dipecah dari pages/ApprovalP0.jsx (isi komponen tidak berubah). */

import { useCallback, useEffect, useState } from 'react';

import {
  ALASAN_CEPAT, angkaId, bacaBobot, bobotMaster, daftarPekerjaan, galatAlasan, MAKS_ALASAN, muatFoto, namaTampil, pekerjaanLain,
} from '../../approvalP0.js';
import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { muatMaster } from '../../master.js';
import { kodeGalat, pesan } from '../../pesan.js';

// ---------------- dialog ----------------

export function DialogSetujui({ d, sibuk, galat: galatKirim, onTutup, onKirim }) {
  const [teks, setTeks] = useState('');
  const [coba, setCoba] = useState(false);
  useEffect(() => { if (d) { setTeks(typeof d.x.bobot === 'number' ? String(d.x.bobot).replace('.', ',') : ''); setCoba(false); } }, [d]);
  const bobot = bacaBobot(teks);
  return (
    <Dialog buka={!!d} judul="Setujui P0 Lain - Lain" sub={d && d.x.kodeP0 + ' · ' + namaTampil(d.x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => { e.preventDefault(); setCoba(true); if (bobot !== null) onKirim(d.x, bobot); }}>
        <label className="k-medan">
          <span className="k-label">Bobot pekerjaan (0 - 100)</span>
          <input className={'k-input k-input--angka' + (coba && bobot === null ? ' k-input--galat' : '')} value={teks} inputMode="decimal" autoFocus
            onChange={(e) => setTeks(e.target.value)} aria-invalid={coba && bobot === null} style={{ maxWidth: 140 }} />
          {coba && bobot === null ? <small className="k-galat">Isi angka 0 - 100, maks 2 desimal.</small>
            : <small className="k-catatan">Pekerjaan Lain - Lain tidak punya bobot master: bobot diisi admin, point dihitung server.</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--setuju" disabled={sibuk}>{sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="centang" ukuran={16} />}Setujui</button>
        </div>
      </form>
    </Dialog>
  );
}

export function DialogTolak({ d, sibuk, galat: galatKirim, onTutup, onKirim }) {
  const [alasan, setAlasan] = useState('');
  const [coba, setCoba] = useState(false);
  useEffect(() => { if (d) { setAlasan(''); setCoba(false); } }, [d]);
  const galat = galatAlasan(alasan);
  return (
    <Dialog buka={!!d} judul="Tolak P0" sub={d && d.x.kodeP0 + ' · ' + namaTampil(d.x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => { e.preventDefault(); setCoba(true); if (!galat) onKirim(d.x, alasan); }}>
        <div className="k-chip-baris">
          {ALASAN_CEPAT.map((a) => <button key={a} type="button" className={'k-chip' + (alasan === a ? ' k-chip--aktif' : '')} onClick={() => setAlasan(a)}>{a}</button>)}
        </div>
        <label className="k-medan">
          <span className="k-label">Alasan (wajib, terlihat petugas)</span>
          <textarea className={'k-input' + (coba && galat ? ' k-input--galat' : '')} rows={3} maxLength={MAKS_ALASAN} value={alasan} autoFocus
            onChange={(e) => setAlasan(e.target.value)} aria-invalid={coba && !!galat} />
          {coba && galat ? <small className="k-galat">{galat}</small> : <small className="k-catatan">{alasan.length}/{MAKS_ALASAN} · point P0 menjadi 0.</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--bahaya" disabled={sibuk}>{sibuk && <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" />}Tolak P0</button>
        </div>
      </form>
    </Dialog>
  );
}

export function DialogJenis({ d, sibuk, galat: galatKirim, api, token, onTutup, onKirim }) {
  const [master, setMaster] = useState(null);
  const [galatMaster, setGalatMaster] = useState('');
  const [nama, setNama] = useState('');
  const [lainnya, setLainnya] = useState('');
  const [bobotTeks, setBobotTeks] = useState('');
  const [alasan, setAlasan] = useState('');
  const [coba, setCoba] = useState(false);

  const ambil = useCallback((segar = false) => {
    setGalatMaster('');
    muatMaster(api, token, 'jenisPekerjaan', { segar }).then(setMaster, (e) => setGalatMaster(pesan(kodeGalat(e))));
  }, [api, token]);

  useEffect(() => {
    if (!d) return;
    setNama(''); setLainnya(d.x.lainLain ? d.x.pekerjaanLainnya || '' : ''); setBobotTeks(''); setAlasan(''); setCoba(false);
    ambil();
  }, [d, ambil]);

  if (!d) return <Dialog buka={false} onTutup={onTutup} />;
  const x = d.x;
  const daftar = master ? daftarPekerjaan(master) : [];
  const bobotM = master ? bobotMaster(master) : new Map();
  const lain = pekerjaanLain(nama);
  const perluBobot = lain && x.status === 'Approved';
  const bobot = bacaBobot(bobotTeks);
  const galat = {
    nama: !nama ? 'Pilih jenis pekerjaan.' : '',
    lainnya: lain && !lainnya.trim() ? 'Isi nama pekerjaan Lain - Lain.' : '',
    bobot: lain && bobotTeks.trim() && bobot === null ? 'Bobot 0 - 100.' : perluBobot && bobot === null ? 'P0 sudah disetujui: isi bobot Lain - Lain.' : '',
    alasan: galatAlasan(alasan),
  };
  const valid = !Object.values(galat).some(Boolean);
  const g = (k) => (coba ? galat[k] : '');

  return (
    <Dialog buka judul="Edit jenis pekerjaan" sub={x.kodeP0 + ' · sekarang: ' + namaTampil(x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => {
        e.preventDefault(); setCoba(true);
        if (valid) onKirim(x, { nama, lainnya, alasan, bobot: lain ? bobot : null });
      }}>
        <p className="k-catatan" style={{ margin: 0 }}>Untuk petugas yang salah memilih jenis. Foto, waktu, petugas dan kode P0 tetap; point dihitung ulang server.</p>
        <label className="k-medan">
          <span className="k-label">Jenis pekerjaan (master)</span>
          {galatMaster ? (
            <span className="k-galat">{galatMaster} <button type="button" className="k-tautan" onClick={() => ambil(true)}>Coba lagi</button></span>
          ) : (
            <select className={'k-input' + (g('nama') ? ' k-input--galat' : '')} value={nama} onChange={(e) => setNama(e.target.value)} autoFocus disabled={!master}>
              <option value="">{master ? 'Pilih jenis' : 'Memuat master...'}</option>
              {daftar.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {g('nama') && <small className="k-galat">{g('nama')}</small>}
          {nama && !lain && <small className="k-catatan">Bobot master: {angkaId(bobotM.get(nama), 2)}</small>}
        </label>
        {lain && (
          <>
            <label className="k-medan">
              <span className="k-label">Nama pekerjaan Lain - Lain</span>
              <input className={'k-input' + (g('lainnya') ? ' k-input--galat' : '')} value={lainnya} maxLength={100} onChange={(e) => setLainnya(e.target.value)} />
              {g('lainnya') && <small className="k-galat">{g('lainnya')}</small>}
            </label>
            <label className="k-medan">
              <span className="k-label">{perluBobot ? 'Bobot (wajib, 0 - 100)' : 'Bobot (boleh diisi saat menyetujui)'}</span>
              <input className={'k-input k-input--angka' + (g('bobot') ? ' k-input--galat' : '')} value={bobotTeks} inputMode="decimal" style={{ maxWidth: 140 }}
                onChange={(e) => setBobotTeks(e.target.value)} />
              {g('bobot') && <small className="k-galat">{g('bobot')}</small>}
            </label>
          </>
        )}
        <label className="k-medan">
          <span className="k-label">Alasan koreksi (wajib)</span>
          <textarea className={'k-input' + (g('alasan') ? ' k-input--galat' : '')} rows={2} maxLength={MAKS_ALASAN} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          {g('alasan') && <small className="k-galat">{g('alasan')}</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--utama" disabled={sibuk || !master}>{sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}Simpan koreksi</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Foto penuh (watermark terbaca); panah kiri / kanan pindah foto dalam kelompok yang sama. */
export function DialogFoto({ d, api, onTutup, onGeser }) {
  const f = d ? d.daftar[d.i] : null;
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');

  useEffect(() => {
    if (!f) return undefined;
    setSrc(''); setGalat('');
    if (!f.ada) return undefined;
    let hidup = true;
    muatFoto(api, f, 'PENUH').then((s) => { if (hidup) setSrc(s); }, (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, f]);

  if (!d) return <Dialog buka={false} onTutup={onTutup} />;
  const n = d.daftar.length;
  const geser = (k) => onGeser((d.i + k + n) % n);
  return (
    <Dialog buka judul={f.label} sub={(d.i + 1) + ' dari ' + n} lebar="min(1100px, calc(100vw - 32px))" onTutup={onTutup}>
      <div className="ap-lightbox" onKeyDown={(e) => { if (e.key === 'ArrowRight') geser(1); if (e.key === 'ArrowLeft') geser(-1); }}>
        {n > 1 && <button type="button" className="k-ikon-tombol ap-lightbox-panah" onClick={() => geser(-1)} aria-label="Foto sebelumnya"><Ikon nama="kiri" /></button>}
        <div className="ap-lightbox-isi">
          {!f.ada ? <p className="k-kosong">Tidak ada foto.</p>
            : galat ? <p className="k-pesan k-pesan--galat">{galat}</p>
            : !src ? <SisiLoader ukuran={48} label="Memuat foto penuh" />
            : <img src={src} alt={'Foto ' + f.label} />}
        </div>
        {n > 1 && <button type="button" className="k-ikon-tombol ap-lightbox-panah" onClick={() => geser(1)} aria-label="Foto berikutnya"><Ikon nama="kanan" /></button>}
      </div>
      <div className="k-dialog-aksi">
        {src && <a className="k-tombol k-tombol--garis" href={src} download={[f.p0Id, f.jenis, f.slot].join('_') + '.jpg'}>Unduh</a>}
        <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup} autoFocus>Tutup</button>
      </div>
    </Dialog>
  );
}
