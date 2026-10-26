import { useEffect, useRef, useState } from 'react';

import Ikon from './Ikon.jsx';

/** Format WhatsApp sederhana: *tebal* dan _miring_ (teks yang disalin tetap teks asli). */
function barisWa(baris) {
  return baris.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <b key={i}>{p.slice(1, -1)}</b>;
    if (/^_[^_]+_$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>;
    return p;
  });
}

async function salinTeks(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    // clipboard API ditolak (izin / bukan https): cara lama
    const t = document.createElement('textarea');
    t.value = teks;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** Pratinjau teks WA (gelembung hijau) + Salin teks + Buka WhatsApp. tinggiMaks = batas tinggi gelembung (CSS). */
export default function TeksWa({ teks, tinggiMaks }) {
  const [tersalin, setTersalin] = useState('');
  const jam = useRef(0);
  useEffect(() => () => clearTimeout(jam.current), []);

  const salin = async () => {
    const ok = await salinTeks(teks);
    setTersalin(ok ? 'Tersalin' : 'Gagal menyalin');
    clearTimeout(jam.current);
    jam.current = setTimeout(() => setTersalin(''), 2200);
  };

  return (
    <>
      <div className="k-wa-teks" style={tinggiMaks ? { maxHeight: tinggiMaks } : undefined}>
        {teks.split('\n').map((b, i) => <div key={i}>{b ? barisWa(b) : ' '}</div>)}
      </div>
      <div className="k-bawah">
        <button type="button" className="k-tombol k-tombol--utama" onClick={salin}>
          <Ikon nama={tersalin === 'Tersalin' ? 'centang' : 'salin'} ukuran={16} />{tersalin || 'Salin teks'}
        </button>
        <a className="k-tombol k-tombol--garis" href={'https://wa.me/?text=' + encodeURIComponent(teks)} target="_blank" rel="noopener noreferrer">
          Buka WhatsApp
        </a>
      </div>
    </>
  );
}
