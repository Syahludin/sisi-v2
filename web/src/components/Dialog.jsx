import { useEffect, useId, useRef } from 'react';

import SisiLoader from './SisiLoader.jsx';

/**
 * Dialog modal dari elemen <dialog> bawaan browser (fokus terkunci di dalam, Esc / klik latar = tutup).
 * kunci = sedang menyimpan: Esc dan klik latar diabaikan. Isi hanya dirender selama buka.
 */
export default function Dialog({ buka, judul, sub, onTutup, kunci = false, lebar, children }) {
  const ref = useRef(null);
  const idJudul = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (buka && !d.open) d.showModal();
    if (!buka && d.open) d.close();
  }, [buka]);

  return (
    <dialog ref={ref} className="k-dialog" aria-labelledby={idJudul} style={lebar ? { width: lebar } : undefined}
      // dialog bertumpuk: event cancel dialog dalam ikut naik lewat pohon React, hanya tangani milik sendiri
      onCancel={(e) => { if (e.target !== ref.current) return; e.preventDefault(); if (!kunci) onTutup(); }}
      onClick={(e) => { if (e.target === ref.current && !kunci) onTutup(); }}>
      {buka && (
        <div className="k-dialog-isi">
          <h2 id={idJudul} className="k-dialog-judul">{judul}</h2>
          {sub && <p className="k-dialog-sub">{sub}</p>}
          {children}
        </div>
      )}
    </dialog>
  );
}

/**
 * Konfirmasi satu aksi: teks + Batal / tombol aksi. k = { judul, teks, tombol, bahaya? } atau null (tertutup).
 * galat = pesan gagal dari pemanggil (dialog tetap terbuka supaya bisa dicoba lagi).
 */
export function Konfirmasi({ k, sibuk, galat, onTutup, onYa }) {
  return (
    <Dialog buka={!!k} judul={k?.judul} kunci={sibuk} onTutup={onTutup}>
      {k && (
        <>
          <p className="k-dialog-teks">{k.teks}</p>
          {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
          <div className="k-dialog-aksi">
            <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
            <button type="button" className={'k-tombol ' + (k.bahaya ? 'k-tombol--bahaya' : 'k-tombol--utama')} onClick={onYa} disabled={sibuk} autoFocus>
              {sibuk && <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" />}{k.tombol}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
