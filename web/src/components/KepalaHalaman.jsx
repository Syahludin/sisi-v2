import MotifJaringan from './MotifJaringan.jsx';

/**
 * Kerangka kepala halaman (spec desain Hijau Rimba S6): judul, satu kalimat "untuk apa halaman ini", aksi utama di kanan,
 * motif SUTM tipis di latar. children = baris tambahan di bawah judul (mis. ringkasan angka / filter aktif).
 */
export default function KepalaHalaman({ judul, sub = '', aksi = null, children = null, motif = true }) {
  return (
    <header className="k-kepala">
      {motif && <MotifJaringan animasi={false} pohon={false} className="k-kepala-motif" />}
      <div className="k-kepala-baris">
        <div className="k-kepala-teks">
          <h1>{judul}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {aksi && <div className="k-kepala-aksi">{aksi}</div>}
      </div>
      {children && <div className="k-kepala-tambah">{children}</div>}
    </header>
  );
}
