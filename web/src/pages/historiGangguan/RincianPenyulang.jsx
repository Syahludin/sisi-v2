import { useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import { MEDAN_BANDING, samaPenyulang } from '../../gangguan.js';
import { angka, tglId } from './bantu.js';
import { JAM } from './Selisih.jsx';

const STATUS = {
  sama: 'Cocok',
  beda: 'Nilai berbeda',
  hanya_sl: 'Hanya di SiMonLang',
  hanya_wil: 'Hanya di Gangguan Wilayah',
};
// nilai kosong ditulis jelas: sumber itu memang tidak mengisi kolomnya
const teks = (v) => (v === '' || v === null || v === undefined ? 'kosong' : typeof v === 'number' ? angka(v, 2) : String(v));

/**
 * Rincian satu penyulang dari daftar "Rincian Gangguan Per Penyulang": SEMUA gangguan penyulang itu pada rentang filter, kedua sumber
 * berdampingan (cocok, nilai berbeda, hanya di satu sumber). Kejadian yang bermasalah terbuka, yang cocok diciutkan.
 * h = hasil perbandingan satu jenis (cocok.samaDaftar / pasangan / hanyaSl / hanyaWil dari PerbandinganSumber).
 */
export function RincianPenyulang({ h, nama, onTutup }) {
  const [mode, setMode] = useState('auto');   // auto = yang bermasalah terbuka | buka | tutup (semua)
  const j = h.j;
  const data = useMemo(() => {
    if (!nama) return null;
    const ini = (o) => samaPenyulang(o.penyulang, nama);
    const w = (o) => o[j.waktu];
    const baris = [
      ...h.cocok.samaDaftar.filter((p) => ini(p.sl)).map((p) => ({ status: 'sama', waktu: w(p.sl), sl: p.sl, wil: p.wil, beda: [] })),
      ...h.cocok.pasangan.filter((p) => ini(p.sl)).map((p) => ({ status: 'beda', waktu: w(p.sl), sl: p.sl, wil: p.wil, beda: p.beda })),
      ...h.cocok.hanyaSl.filter(ini).map((o) => ({ status: 'hanya_sl', waktu: w(o), sl: o, wil: null, beda: [] })),
      ...h.cocok.hanyaWil.filter(ini).map((o) => ({ status: 'hanya_wil', waktu: w(o), sl: null, wil: o, beda: [] })),
    ].sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : 0));
    const hitung = (s) => baris.filter((b) => b.status === s).length;
    return {
      baris, nSl: baris.filter((b) => b.sl).length, nWil: baris.filter((b) => b.wil).length,
      jumlah: { sama: hitung('sama'), beda: hitung('beda'), hanya_sl: hitung('hanya_sl'), hanya_wil: hitung('hanya_wil') },
    };
  }, [h, nama, j.waktu]);

  return (
    <Dialog buka={!!nama} judul={nama ? `${nama} · ${j.label}` : ''} sub={nama ? `Perbandingan setiap kejadian · ${tglId(h.dari)} – ${tglId(h.sampai)}` : ''} onTutup={onTutup} lebar="min(980px, 96vw)">
      {data && (
        <div className={'ggn-rp ggn-w--' + j.warna}>
          <div className="ggn-kpi ggn-kpi--3">
            <div><small>SiMonLang</small><b>{angka(data.nSl)}</b></div>
            <div><small>Gangguan Wilayah</small><b>{angka(data.nWil)}</b></div>
            <div><small>Selisih jumlah (SiMonLang − Wilayah)</small><b>{data.nSl - data.nWil > 0 ? '+' : ''}{angka(data.nSl - data.nWil)}</b></div>
          </div>
          <ul className="ggn-rp-ringkas" aria-label="Ringkasan status kejadian">
            {Object.entries(STATUS).map(([k, l]) => {
              const n = k === 'sama' ? data.jumlah.sama : data.jumlah[k];
              return <li key={k} className={'ggn-sk--' + k}><b>{n}</b> {l}</li>;
            })}
          </ul>

          <div className="ggn-sk-alat">
            <button type="button" className="k-tombol k-tombol--garis" onClick={() => setMode('buka')}><Ikon nama="kanan" ukuran={14} />Expand</button>
            <button type="button" className="k-tombol k-tombol--garis" onClick={() => setMode('tutup')}><Ikon nama="kanan" ukuran={14} />Minimize</button>
            <small>{angka(data.baris.length)} kejadian · terbaru di atas</small>
          </div>

          {!data.baris.length ? <p className="k-kosong">Tidak ada kejadian pada rentang ini.</p> : (
            <ul className="ggn-rp-daftar">
              {data.baris.map((b, i) => (
                <li key={mode + i + b.status + b.waktu} className={'ggn-sk-baris ggn-sk--' + b.status}>
                  <details open={mode === 'auto' ? b.status !== 'sama' : mode === 'buka'}>
                    <summary>
                      <span className="ggn-sk-waktu"><b>{tglId(b.waktu)}</b><small>{ringkasJam(b, j)}</small></span>
                      <span className="ggn-sk-nama"><b>{(b.sl || b.wil)[j.alat] || '—'}</b><small>{ringkasSelisih(b)}</small></span>
                      <em className="ggn-sk-chip">{STATUS[b.status]}</em>
                      <Ikon nama="kanan" ukuran={15} />
                    </summary>
                    <TabelKejadian b={b} j={j} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={onTutup}>Tutup</button></div>
    </Dialog>
  );
}

function ringkasJam(b, j) {
  const a = b.sl ? JAM(b.sl[j.waktu]) : '', w = b.wil ? JAM(b.wil[j.waktu]) : '';
  if (!a && !w) return 'jam tidak tercatat';
  return a === w || !b.sl || !b.wil ? 'Trip ' + (a || w) : 'Trip SiMonLang ' + (a || 'tidak tercatat') + ' · Wilayah ' + (w || 'tidak tercatat');
}

function ringkasSelisih(b) {
  if (b.status === 'beda') return b.beda.map((d) => d.label).join(', ') + ' berbeda';
  if (b.status === 'sama') return 'semua kolom cocok';
  return 'tidak ada padanannya di sumber lain';
}

/** Tabel kolom demi kolom: SiMonLang | Gangguan Wilayah; kolom yang berbeda ditandai. */
function TabelKejadian({ b, j }) {
  const berbeda = new Set(b.beda.map((d) => d.medan));
  const kolom = MEDAN_BANDING[j.kode] || [];
  const sel = (o, nilaiKolom) => (o ? <td className={nilaiKolom === '' || nilaiKolom === undefined || nilaiKolom === null ? 'ggn-rp-kosong' : ''}>{teks(nilaiKolom)}</td> : <td className="ggn-rp-tiada">tidak ada</td>);
  return (
    <div className="ggn-tabel-gulir">
      <table className="ggn-tabel ggn-sk-tabel ggn-rp-tabel">
        <thead><tr><th>Kolom</th><th><i className="ggn-bd--sl" />SiMonLang</th><th><i className="ggn-bd--wil" />Gangguan Wilayah</th></tr></thead>
        <tbody>
          <tr className="ggn-sk-trip">
            <th>Jam trip</th>
            {b.sl ? <td>{JAM(b.sl[j.waktu]) || 'tidak tercatat'}</td> : <td className="ggn-rp-tiada">tidak ada</td>}
            {b.wil ? <td>{JAM(b.wil[j.waktu]) || 'tidak tercatat'}</td> : <td className="ggn-rp-tiada">tidak ada</td>}
          </tr>
          {kolom.map(([k, label]) => (
            <tr key={k} className={berbeda.has(k) ? 'ggn-rp-beda' : ''}>
              <th>{label}{berbeda.has(k) && <Ikon nama="peringatan" ukuran={13} />}</th>
              {sel(b.sl, b.sl?.[k])}
              {sel(b.wil, b.wil?.[k])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
