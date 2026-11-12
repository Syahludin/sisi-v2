import './motifJaringan.css';

/**
 * Motif jaringan SUTM (PolaJaringanPainter aplikasi HP, mobile/lib/widgets/sisi_motif.dart), sebagai SVG: tiang + palang, tiga kawat
 * melendut, trafo tiang (kotak kuning petir = bertegangan) di tiang ketiga, dan pohon di bawah jaringan (ROW / vegetasi).
 * animasi = tiang tumbuh satu per satu, palang melebar, kawat terentang, lalu trafo & pohon muncul (motifJaringan.css).
 * Tanpa animasi = gambar utuh (latar header / beranda). Warna dari --motif-rgb (garis) dan --motif-pohon (lihat CSS).
 */
const W = 1000;
const H = 300;
const N = 5;
const MULAI_X = W * 0.42;
const JARAK = (W - 10 - MULAI_X) / (N - 1);
const DASAR = H + 2;
const TIANG_TRAFO = 2;

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

/** Trafo tiang: badan kotak + sirip, dua bushing ke kawat, tergantung sepertiga tinggi di bawah palang. */
const TF = (() => {
  const t = TIANG[TIANG_TRAFO];
  const y = t.puncak + (DASAR - t.puncak) * 0.28;
  return { x: t.x + 6, y, w: 34, h: 40, puncak: t.puncak };
})();

/** Pohon: [x pusat, jari-jari tajuk]; batang dari dasar. Diletakkan di antara tiang. */
const POHON = [[TIANG[0].x + JARAK * 0.45, 34], [TIANG[1].x + JARAK * 0.6, 26], [TIANG[3].x + JARAK * 0.4, 30]];

export default function MotifJaringan({ className = '', animasi = true, trafo = true, pohon = true }) {
  return (
    <svg className={`motif ${animasi ? 'motif--animasi' : ''} ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      {pohon && POHON.map(([x, r], i) => (
        <g key={`ph${i}`} className="motif-pohon" style={{ animationDelay: `${1.6 + 0.15 * i}s` }}>
          <rect x={x - 3} y={DASAR - r * 1.3} width="6" height={r * 1.3} rx="2" className="motif-batang" />
          <circle cx={x} cy={DASAR - r * 1.6} r={r} />
          <circle cx={x + r * 0.7} cy={DASAR - r * 1.15} r={r * 0.68} />
          <circle cx={x - r * 0.7} cy={DASAR - r * 1.2} r={r * 0.6} />
        </g>
      ))}
      {TIANG.map((t, i) => (
        <line key={`t${i}`} className="motif-tiang" pathLength="1" x1={t.x} y1={DASAR} x2={t.x} y2={t.atas} style={{ animationDelay: `${0.1 + 0.2 * i}s` }} />
      ))}
      {TIANG.map((t, i) => (
        <line key={`p${i}`} className="motif-palang" x1={t.x - t.palang} y1={t.puncak} x2={t.x + t.palang} y2={t.puncak} style={{ animationDelay: `${0.6 + 0.2 * i}s` }} />
      ))}
      {KAWAT.map((k, i) => (
        <path key={`k${i}`} className="motif-kawat" pathLength="1" d={k.d} style={{ animationDelay: `${1 + 0.2 * k.bentang}s` }} />
      ))}
      {trafo && (
        <g className="motif-trafo" style={{ animationDelay: '1.8s' }}>
          <line x1={TF.x + 10} y1={TF.y} x2={TF.x + 10} y2={TF.puncak} className="motif-bushing" />
          <line x1={TF.x + TF.w - 10} y1={TF.y} x2={TF.x + TF.w - 10} y2={TF.puncak} className="motif-bushing" />
          <rect x={TF.x - 4} y={TF.y + 6} width="4" height={TF.h - 12} rx="1" className="motif-sirip" />
          <rect x={TF.x + TF.w} y={TF.y + 6} width="4" height={TF.h - 12} rx="1" className="motif-sirip" />
          <rect x={TF.x} y={TF.y} width={TF.w} height={TF.h} rx="4" className="motif-badan" />
          <path d={`M${TF.x + 19} ${TF.y + 8} l-7 13 h6 l-3 12 l9 -16 h-6 l3 -9 z`} className="motif-petir" />
        </g>
      )}
    </svg>
  );
}
