import { teksKm } from '../../asetItb.js';

const BATAS = 200;

/** Daftar segmen yang bisa dibuka / ditutup (segmen hilang, belum terpetakan). Kosong = tidak ditampilkan. */
export function PanelSegmen({ judul, ket, daftar, kelas }) {
  if (!daftar.length) return null;
  const km = daftar.reduce((n, s) => n + s.panjang, 0);
  return (
    <details className={'das-panel ' + (kelas || '')}>
      <summary><b>{judul}</b><span>{daftar.length} segmen · {teksKm(km)} kmS</span></summary>
      {ket && <p className="das-catatan">{ket}</p>}
      <div className="das-gulir das-gulir--tinggi">
        <table className="das-tabel">
          <thead><tr><th>Segmen</th><th>Penyulang ITB</th><th>Jenis</th><th>Ukuran</th><th className="das-km">kmS</th><th>Keterangan</th></tr></thead>
          <tbody>
            {daftar.slice(0, BATAS).map((s) => (
              <tr key={s.id}><th>{s.desc}</th><td>{s.pny}</td><td>{s.jenis}</td><td>{s.ukuran}</td><td className="das-km">{teksKm(s.panjang)}</td><td>{s.ket || '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {daftar.length > BATAS && <p className="das-catatan">Menampilkan {BATAS} segmen terpanjang dari {daftar.length}.</p>}
    </details>
  );
}
