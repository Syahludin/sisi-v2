import { useEffect, useRef, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import { jenisKategori } from '../../pengukuranGardu.js';
import { angka } from './bantu.js';

export const MAKS_SARAN = 12;

/** v1.0.36: kotak cari + saran (combobox) menggantikan daftar gardu panjang di kiri; detail memakai lebar penuh. */
export function PemilihGardu({ hasil, kata, onKata, status, onStatus, terpilih, onPilih }) {
  const [buka, setBuka] = useState(false);
  const [sorot, setSorot] = useState(0);
  const akar = useRef(null);
  const saran = hasil.slice(0, MAKS_SARAN);
  useEffect(() => {
    if (!buka) return undefined;
    const luar = (e) => { if (akar.current && !akar.current.contains(e.target)) setBuka(false); };
    document.addEventListener('pointerdown', luar);
    return () => document.removeEventListener('pointerdown', luar);
  }, [buka]);
  const ambil = (g) => { setBuka(false); onPilih(g.no); };
  const tombol = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setBuka(true); setSorot((i) => Math.min(i + 1, saran.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSorot((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && buka && saran[sorot]) { e.preventDefault(); ambil(saran[sorot]); }
    else if (e.key === 'Escape' && buka) { e.stopPropagation(); setBuka(false); }
  };
  return (
    <div className="pg-pemilih" ref={akar}>
      <div className="pg-pemilih-baris">
        <label className="pg-pemilih-cari">
          <Ikon nama="cari" ukuran={18} />
          <input type="search" role="combobox" aria-expanded={buka} aria-controls="pg-saran" aria-autocomplete="list"
            aria-activedescendant={buka && saran[sorot] ? 'pg-saran-' + sorot : undefined}
            value={kata} placeholder="Cari no gardu, alamat, penyulang, section" aria-label="Cari gardu"
            onChange={(e) => { onKata(e.target.value); setSorot(0); setBuka(true); }} onFocus={() => setBuka(true)} onKeyDown={tombol} />
        </label>
        <div className="pg-pemilih-status" role="group" aria-label="Status gardu">
          {[['AKTIF', 'Aktif'], ['TIDAK AKTIF', 'Tidak aktif'], ['', 'Semua']].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={status === v} className={status === v ? 'aktif' : ''} onClick={() => { onStatus(v); setSorot(0); }}>{l}</button>
          ))}
        </div>
      </div>
      {buka && (
        <ul className="pg-saran" id="pg-saran" role="listbox" aria-label="Gardu yang cocok">
          {saran.map((g, i) => (
            <li key={g.id} id={'pg-saran-' + i} role="option" aria-selected={i === sorot}
              className={'pg-saran-item pg-saran-item--' + jenisKategori(g.kategori) + (i === sorot ? ' pg-saran-item--sorot' : '') + (g.no === terpilih ? ' pg-saran-item--pilih' : '')}
              onPointerEnter={() => setSorot(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => ambil(g)}>
              <b>{g.no}</b>
              <span className="pg-saran-alamat">{g.alamat || '-'}<small>{[g.penyulang, g.section].filter(Boolean).join(' · ')}</small></span>
              <span className="pg-saran-kanan">
                {g.kva ? <small>{angka(g.kva)} kVA</small> : null}
                {typeof g.persen === 'number' && <em className={'pg-persen pg-persen--' + jenisKategori(g.kategori)}>{angka(g.persen, 1)}%</em>}
              </span>
            </li>
          ))}
          {!saran.length && <li className="pg-saran-kosong">Tidak ada gardu yang cocok.</li>}
          {hasil.length > MAKS_SARAN && <li className="pg-saran-kosong">{hasil.length - MAKS_SARAN} gardu lain, ketik lebih spesifik.</li>}
        </ul>
      )}
    </div>
  );
}

/** Belum memilih gardu: gambaran beban seluruh gardu aktif per kategori (dari Master Gardu yang sudah dimuat). */
export function RingkasanMaster({ gardu }) {
  const aktif = gardu.filter((g) => g.status === 'AKTIF');
  const hitung = (j) => aktif.filter((g) => jenisKategori(g.kategori) === j).length;
  const kotak = [
    ['Gardu aktif', aktif.length, 'netral'], ['Beban cukup', hitung('ok'), 'ok'], ['Underload', hitung('proses'), 'proses'],
    ['Overload / buruk', hitung('belum'), 'belum'], ['Belum diukur', hitung('v1'), 'v1'],
  ];
  return (
    <section className="pg-sambut" aria-label="Ringkasan master gardu">
      <div className="pg-statistik">
        {kotak.map(([l, n, j]) => <div key={l} className={'pg-stat pg-stat--' + j}><small>{l}</small><b>{angka(n)}</b></div>)}
      </div>
      <div className="k-tengah pg-kosong"><Ikon nama="penggaris" ukuran={34} /><p>Cari gardu di atas untuk melihat data, riwayat pengukuran, dan update pengukuran.</p></div>
    </section>
  );
}

// ---------------- detail ----------------

