import { useEffect, useMemo, useState } from 'react';

import { galatCatatan, grupTim, lokasiTemuan, MAKS_CATATAN } from '../penerusanWo.js';
import Dialog from './Dialog.jsx';
import Ikon from './Ikon.jsx';
import '../pages/penerusanWo.css';

/**
 * v1.0.58: dipindah dari pages/PenerusanWo.jsx supaya dipakai juga di daftar Temuan Inspeksi (PetaTemuan).
 * Hanya memilih tim + catatan: onKirim(t, tim, catatan) dipanggil sekali dan pengiriman dijalankan di latar oleh pemanggil
 * (useKirimWo.jsx), jadi dialog tidak menunggu server dan tidak menampilkan galat sendiri.
 */
/** Pilih tim tujuan (dikelompokkan ROW / Hartek / Yandal) + catatan, lalu teruskanWo. */
export default function DialogTeruskanWo({ t, tim, onTutup, onKirim }) {
  const [timId, setTimId] = useState('');
  const [catatan, setCatatan] = useState('');
  useEffect(() => {
    if (!t) return;
    setTimId(''); setCatatan(t.wo?.catatanAdmin || '');
  }, [t]);
  const grup = useMemo(() => grupTim(tim), [tim]);
  const galatC = galatCatatan(catatan);
  const kirim = () => {
    const pilih = tim.find((x) => x.timId === timId);
    if (!pilih || galatC) return;
    onKirim(t, pilih, catatan.trim());
  };
  return (
    <Dialog buka={!!t} judul="Teruskan WO ke tim" sub={t ? t.kodeTemuan + ' · ' + (t.jenisTemuan || 'Temuan') : ''} onTutup={onTutup} lebar="min(560px, 94vw)">
      {t && (
        <>
          <p className="pw-lokasi-dialog">{lokasiTemuan(t) || '-'}</p>
          {!grup.length && <p className="k-kosong">Belum ada tim ROW / Hartek / Yandal yang aktif di db_Tim.</p>}
          <div className="pw-tim" role="radiogroup" aria-label="Tim tujuan">
            {grup.map((g) => (
              <fieldset key={g.jenis}>
                <legend>{g.label}</legend>
                {g.tim.map((x) => (
                  <label key={x.timId} className={'pw-tim-pilih' + (timId === x.timId ? ' pw-tim-pilih--aktif' : '')}>
                    <input type="radio" name="tim-wo" value={x.timId} checked={timId === x.timId} onChange={() => setTimId(x.timId)} />
                    <span>{x.nama}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <label className="k-medan">
            <span className="k-label">Catatan untuk tim (opsional)</span>
            <textarea className="k-input" rows={3} maxLength={MAKS_CATATAN} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            <small className={galatC ? 'k-galat' : 'pw-hitung'}>{galatC || `${catatan.trim().length}/${MAKS_CATATAN}`}</small>
          </label>
          <div className="k-dialog-aksi">
            <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Batal</button>
            <button type="button" className="k-tombol k-tombol--utama" onClick={kirim} disabled={!timId || !!galatC}>
              <Ikon nama="kanan" ukuran={16} />Kirim WO
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
