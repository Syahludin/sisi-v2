import { useMemo } from 'react';

import { angkaHar, KRITERIA_HAR, matriksHar, mingguBulan } from '../../checkpoint.js';
import { BULAN_PENDEK } from '../../gangguan.js';

/**
 * v1.0.51 sub-tab "Har" menu Checkpoint (port v1 getDpgHarMatrix): kriteria pekerjaan (Inspeksi, ROW, HARKOM, HARKONS SUTM,
 * Gardu, SUTR / SR) x bulan + minggu (M1..M5) + total tahun. Sumber = rekap GASPOL tahun itu (Hartek + Inspeksi + ROW).
 */
export function TabHar({ har, saring, tahun }) {
  const m = useMemo(() => matriksHar(har, saring), [har, saring]);
  const minggu = useMemo(() => mingguBulan(tahun), [tahun]);
  const totalSemua = Object.values(m.total).reduce((n, v) => n + v, 0);
  const sel = (v) => (v ? <span className="cp-har-n">{angkaHar(v)}</span> : <span className="cp-har-0">·</span>);

  return (
    <section aria-label="Har">
      <div className="pt-ringkas cp-ringkas">
        {KRITERIA_HAR.map((g) => {
          const n = g.items.reduce((s, [k]) => s + (m.total[k] || 0), 0);
          return <div key={g.grup} className="pt-kartu pt-kartu--diam"><small>{g.grup}</small><b>{angkaHar(n)}</b></div>;
        })}
      </div>
      {!totalSemua && <p className="k-catatan">Belum ada pekerjaan tercatat untuk filter ini pada {tahun}.</p>}
      <div className="cp-har">
        <table className="cp-har-tabel">
          <thead>
            <tr>
              <th className="cp-har-grup" rowSpan={2}>Grup</th><th className="cp-har-krit" rowSpan={2}>Kriteria Pekerjaan</th>
              {minggu.map((n, b) => <th key={b} colSpan={n} className={b % 2 ? 'cp-har-alt' : ''}>{BULAN_PENDEK[b]}</th>)}
              <th className="cp-har-total" rowSpan={2}>Total {tahun}</th>
            </tr>
            <tr className="cp-har-sub">
              {minggu.flatMap((n, b) => Array.from({ length: n }, (_, w) => <th key={b + '-' + w} className={b % 2 ? 'cp-har-alt' : ''}>M{w + 1}</th>))}
            </tr>
          </thead>
          <tbody>
            {KRITERIA_HAR.map((g) => g.items.map(([k, label], i) => (
              <tr key={k} className={i === 0 ? 'cp-har-awal' : ''}>
                {i === 0 && <th className="cp-har-grup" rowSpan={g.items.length}>{g.grup}</th>}
                <th className="cp-har-krit">{label}</th>
                {minggu.flatMap((n, b) => Array.from({ length: n }, (_, w) => (
                  <td key={b + '-' + w} className={b % 2 ? 'cp-har-alt' : ''}>{sel(m.data[k]?.[b + '-' + (w + 1)])}</td>
                )))}
                <td className="cp-har-total">{sel(m.total[k])}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="k-catatan">Minggu ke = tanggal dibagi 7 dibulatkan ke atas (M1 tanggal 1–7, M5 tanggal 29–31). Sumber: rekap GASPOL (Inspeksi, ROW, Hartek).</p>
    </section>
  );
}
