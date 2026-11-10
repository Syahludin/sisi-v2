import { useEffect } from 'react';

import Ikon from './Ikon.jsx';
import './popupBerhasil.css';

const LAMA_MS = 2600;

/**
 * v1.0.38 kartu "berhasil" di tengah layar, sama dengan HP (mobile/lib/widgets/popup_berhasil.dart): kartu meletup masuk,
 * centang muncul-hilang-muncul lalu menetap dengan cincin berdenyut, kartu memudar sendiri (±2,6 dtk). Klik di mana saja
 * = tutup. "Kurangi animasi" di sistem = langsung tampil tanpa kedip. p = { judul, keterangan?, tembus? } atau null (tertutup).
 * tembus = klik lolos ke halaman di belakang (kartu hanya penanda).
 */
export default function PopupBerhasil({ p, onTutup }) {
  useEffect(() => {
    if (!p) return undefined;
    const jam = setTimeout(onTutup, LAMA_MS);
    const esc = (e) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(jam); window.removeEventListener('keydown', esc); };
  }, [p, onTutup]);
  if (!p) return null;
  return (
    <div className={'pb-latar' + (p.tembus ? ' pb-latar--tembus' : '')} onClick={onTutup} role="status" aria-live="polite">
      <div className="pb-kartu" style={{ '--pb-lama': LAMA_MS + 'ms' }}>
        <div className="pb-ikon">
          <span className="pb-cincin" />
          <span className="pb-dasar" />
          <span className="pb-centang"><Ikon nama="centang" ukuran={36} /></span>
        </div>
        <b>{p.judul}</b>
        {p.keterangan && <p>{p.keterangan}</p>}
      </div>
    </div>
  );
}
