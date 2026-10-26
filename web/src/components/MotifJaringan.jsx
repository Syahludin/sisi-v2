/**
 * Motif tiang + kawat jaringan distribusi (PolaJaringanPainter aplikasi HP, mobile/lib/widgets/sisi_motif.dart), sebagai SVG.
 * animasi = tiang tumbuh satu per satu, palang melebar, lalu tiga kawat melendut terentang antar tiang (gaya di login.css).
 * Tanpa animasi = gambar utuh (latar header / dashboard).
 */
const W = 1000;
const H = 300;
const N = 5;
const MULAI_X = W * 0.42;
const JARAK = (W - 10 - MULAI_X) / (N - 1);
const DASAR = H + 2;

const TIANG = Array.from({ length: N }, (_, i) => {
  const x = MULAI_X + JARAK * i;
  const atas = DASAR - H * (0.42 + (0.38 * i) / (N - 1));
  return { x, atas, palang: 18 + 6 * i, puncak: atas + 10 };
});

const KAWAT = [];
for (let i = 0; i + 1 < N; i++) {
  const a = TIANG[i];
  const b = TIANG[i + 1];
  for (const dx of [-1, 0, 1]) {
    const x0 = a.x + dx * a.palang;
    const x1 = b.x + dx * b.palang;
    const lendut = (x1 - x0) * 0.12;
    const tx = (x0 + x1) / 2;
    const ty = Math.max(a.puncak, b.puncak) + lendut;
    KAWAT.push({ d: `M${x0.toFixed(1)} ${a.puncak.toFixed(1)} Q${tx.toFixed(1)} ${ty.toFixed(1)} ${x1.toFixed(1)} ${b.puncak.toFixed(1)}`, bentang: i });
  }
}

export default function MotifJaringan({ className = '', animasi = true }) {
  return (
    <svg className={`motif ${animasi ? 'motif--animasi' : ''} ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      {TIANG.map((t, i) => (
        <line key={`t${i}`} className="motif-tiang" pathLength="1" x1={t.x} y1={DASAR} x2={t.x} y2={t.atas} style={{ animationDelay: `${0.1 + 0.2 * i}s` }} />
      ))}
      {TIANG.map((t, i) => (
        <line key={`p${i}`} className="motif-palang" x1={t.x - t.palang} y1={t.puncak} x2={t.x + t.palang} y2={t.puncak} style={{ animationDelay: `${0.6 + 0.2 * i}s` }} />
      ))}
      {KAWAT.map((k, i) => (
        <path key={`k${i}`} className="motif-kawat" pathLength="1" d={k.d} style={{ animationDelay: `${1 + 0.2 * k.bentang}s` }} />
      ))}
    </svg>
  );
}
