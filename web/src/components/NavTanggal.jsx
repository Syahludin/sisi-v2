import { geserTanggal, hariIniWib, labelTanggal } from '../tanggal.js';
import Ikon from './Ikon.jsx';

/**
 * Pilih tanggal laporan: hari sebelumnya / berikutnya, pemilih tanggal bawaan browser, "Hari ini".
 * Tanggal di luar [min, max] tidak dikirim ke onGanti. max bawaan = hari ini (WIB).
 */
export default function NavTanggal({ tanggal, min, max = hariIniWib(), disabled = false, onGanti }) {
  const ganti = (t) => { if (t && t !== tanggal && (!min || t >= min) && t <= max) onGanti(t); };
  return (
    <div className="hlm-aksi k-navtgl">
      <button type="button" className="k-ikon-tombol" onClick={() => ganti(geserTanggal(tanggal, -1))}
        disabled={disabled || (!!min && tanggal <= min)} aria-label="Hari sebelumnya" title="Hari sebelumnya">
        <Ikon nama="kiri" ukuran={18} />
      </button>
      <label className="k-tgl">
        <Ikon nama="kalender" ukuran={16} />
        <span className="k-tgl-label">{labelTanggal(tanggal)}</span>
        <input type="date" value={tanggal} min={min} max={max} disabled={disabled}
          onChange={(e) => ganti(e.target.value)} aria-label="Pilih tanggal" />
      </label>
      <button type="button" className="k-ikon-tombol" onClick={() => ganti(geserTanggal(tanggal, 1))}
        disabled={disabled || tanggal >= max} aria-label="Hari berikutnya" title="Hari berikutnya">
        <Ikon nama="kanan" ukuran={18} />
      </button>
      {tanggal !== max && (
        <button type="button" className="k-tombol k-tombol--garis" onClick={() => ganti(max)} disabled={disabled}>Hari ini</button>
      )}
    </div>
  );
}
