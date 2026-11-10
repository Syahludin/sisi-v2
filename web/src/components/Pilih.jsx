import { useEffect, useId, useMemo, useRef, useState } from 'react';

import Ikon from './Ikon.jsx';
import './pilih.css';

/** Opsi -> { nilai, label, sub }. String = nilai sekaligus label. */
const rapikan = (o) => (typeof o === 'object' && o !== null ? { nilai: String(o.nilai), label: o.label ?? String(o.nilai), sub: o.sub || '' } : { nilai: String(o), label: String(o), sub: '' });

/**
 * v1.0.48 dropdown bergaya SiSi (pengganti <select> / <datalist> di form BA): tombol bernilai + panel kartu berisi cari
 * (otomatis kalau opsi > 7), daftar dengan tanda centang, keyboard (panah, Enter, Esc), klik di luar = tutup.
 * bebas = boleh ketik nilai di luar daftar (merk, kVA, asal trafo): Enter / "Pakai ..." memakai ketikan.
 * kosong = label baris "tanpa pilihan" (nilai ''), mis. "Tidak ada" untuk Petugas 2.
 * v1.0.50 banyak = pilihan ganda: nilai = array, klik opsi = centang / lepas (panel tetap terbuka), baris kosong = lepas semua.
 * v1.0.51 pilihan ganda tampil sebagai kotak centang (checkbox) di kiri tiap opsi.
 */
export default function Pilih({ id, nilai, onUbah, opsi, placeholder = 'Pilih', kosong, bebas = false, mati = false, galat = false, label, banyak = false }) {
  const daftar = useMemo(() => [...(kosong !== undefined ? [{ nilai: '', label: kosong, sub: '' }] : []), ...opsi.map(rapikan)], [opsi, kosong]);
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState('');
  const [aktif, setAktif] = useState(0);
  const akar = useRef(null);
  const masukan = useRef(null);
  const listId = useId();
  const pakaiCari = bebas || daftar.length > 7;
  const terpilih = banyak ? (Array.isArray(nilai) ? nilai.map(String) : []) : null;
  const kena = (v) => (banyak ? (v === '' ? !terpilih.length : terpilih.includes(v)) : v === String(nilai ?? ''));
  const dipilih = banyak ? null : daftar.find((o) => o.nilai === String(nilai ?? ''));
  const tampil = banyak
    ? (terpilih.length === 0 ? '' : terpilih.length === 1 ? terpilih[0] : terpilih[0] + ' +' + (terpilih.length - 1))
    : dipilih ? dipilih.label : (nilai ? String(nilai) : '');

  const saring = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return k ? daftar.filter((o) => (o.label + ' ' + o.sub).toLowerCase().includes(k)) : daftar;
  }, [daftar, cari]);
  const ketikBaru = bebas && cari.trim() && !daftar.some((o) => o.label.toLowerCase() === cari.trim().toLowerCase());

  useEffect(() => {
    if (!buka) return undefined;
    const luar = (e) => { if (akar.current && !akar.current.contains(e.target)) setBuka(false); };
    document.addEventListener('pointerdown', luar);
    return () => document.removeEventListener('pointerdown', luar);
  }, [buka]);
  useEffect(() => {
    if (!buka) return;
    setCari('');
    setAktif(Math.max(0, daftar.findIndex((o) => o.nilai === String(nilai ?? ''))));
    setTimeout(() => masukan.current?.focus(), 0);
  }, [buka]);
  useEffect(() => {
    const el = akar.current?.querySelector('[data-aktif="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [aktif, buka]);

  const pilih = (v) => {
    if (!banyak) { onUbah(v); setBuka(false); return; }
    onUbah(v === '' ? [] : terpilih.includes(v) ? terpilih.filter((x) => x !== v) : [...terpilih, v]);
  };
  const tombol = (e) => {
    const n = saring.length + (ketikBaru ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); setAktif((a) => Math.min(n - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktif((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (aktif < saring.length) pilih(saring[aktif].nilai);
      else if (ketikBaru) pilih(cari.trim());
    } else if (e.key === 'Escape') { e.preventDefault(); setBuka(false); }
  };

  return (
    <div className={'pl' + (buka ? ' pl--buka' : '')} ref={akar}>
      <button type="button" id={id} className={'pl-tombol' + (galat ? ' pl-tombol--galat' : '') + (tampil ? '' : ' pl-tombol--kosong')}
        aria-haspopup="listbox" aria-expanded={buka} aria-label={label} disabled={mati}
        onClick={() => setBuka((b) => !b)} onKeyDown={(e) => { if (!buka && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); setBuka(true); } }}>
        <span className="pl-nilai">
          {tampil || placeholder}
          {dipilih?.sub && <small>{dipilih.sub}</small>}
        </span>
        <svg className="pl-panah" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {buka && (
        <div className="pl-panel" onKeyDown={tombol}>
          {pakaiCari ? (
            <label className="pl-cari">
              <Ikon nama="cari" ukuran={16} />
              <input ref={masukan} value={cari} onChange={(e) => { setCari(e.target.value); setAktif(0); }} placeholder={bebas ? 'Cari atau ketik baru' : 'Cari'}
                role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" />
            </label>
          ) : <input ref={masukan} className="pl-fokus" readOnly aria-hidden="true" tabIndex={-1} />}
          <ul className="pl-daftar" role="listbox" id={listId} aria-multiselectable={banyak || undefined}>
            {saring.map((o, i) => (
              <li key={o.nilai + '|' + i} role="option" aria-selected={kena(o.nilai)} data-aktif={i === aktif ? '1' : '0'}
                className={'pl-opsi' + (i === aktif ? ' pl-opsi--aktif' : '') + (kena(o.nilai) ? ' pl-opsi--pilih' : '')}
                onPointerEnter={() => setAktif(i)} onClick={() => pilih(o.nilai)}>
                {banyak && <span className={'pl-kotak' + (kena(o.nilai) ? ' pl-kotak--on' : '')} aria-hidden="true">{kena(o.nilai) && <Ikon nama="centang" ukuran={13} />}</span>}
                <span><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span>
                {!banyak && kena(o.nilai) && <Ikon nama="centang" ukuran={16} />}
              </li>
            ))}
            {ketikBaru && (
              <li role="option" aria-selected="false" data-aktif={aktif === saring.length ? '1' : '0'}
                className={'pl-opsi pl-opsi--baru' + (aktif === saring.length ? ' pl-opsi--aktif' : '')}
                onPointerEnter={() => setAktif(saring.length)} onClick={() => pilih(cari.trim())}>
                <span><b>Pakai “{cari.trim()}”</b><small>Nilai di luar daftar</small></span><Ikon nama="tambah" ukuran={16} />
              </li>
            )}
            {!saring.length && !ketikBaru && <li className="pl-kosong">Tidak ada yang cocok.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
