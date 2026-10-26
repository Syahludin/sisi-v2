import { useEffect, useRef } from 'react';

/**
 * Loader huruf S patah logo SiSi, salinan SisiLoader aplikasi HP (mobile/lib/widgets/sisi_loader.dart):
 * garis tumbuh dari ekor atas sampai ekor bawah (titik sudut muncul saat dilewati, kepala kuning), menetap, lalu terhapus
 * dari pangkal. "Kurangi animasi" di sistem / [diam] = S utuh tanpa gerak.
 */
const TITIK = [[80, 30], [50, 8], [20, 40], [80, 60], [50, 92], [20, 70]];
const RUAS = TITIK.slice(1).map((p, i) => Math.hypot(p[0] - TITIK[i][0], p[1] - TITIK[i][1]));
const PANJANG = RUAS.reduce((a, b) => a + b, 0);
const JARAK = TITIK.map((_, i) => RUAS.slice(0, i).reduce((a, b) => a + b, 0));
const POIN = TITIK.map((p) => p.join(',')).join(' ');
const TEBAL = 8.5;

const mulus = (x) => {
  const v = Math.min(1, Math.max(0, x));
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

/** Bagian garis yang tampil pada fase t (0..1): [awal, akhir] dalam pecahan panjang (sama dengan HP). */
export function potongan(t) {
  if (t < 0.55) return [0, mulus(t / 0.55)];
  if (t < 0.7) return [0, 1];
  return [mulus((t - 0.7) / 0.3), 1];
}

function titikPada(d) {
  for (let i = 0; i < RUAS.length; i++) {
    if (d <= JARAK[i + 1] || i === RUAS.length - 1) {
      const f = RUAS[i] ? Math.min(1, Math.max(0, (d - JARAK[i]) / RUAS[i])) : 0;
      return [TITIK[i][0] + (TITIK[i + 1][0] - TITIK[i][0]) * f, TITIK[i][1] + (TITIK[i + 1][1] - TITIK[i][1]) * f];
    }
  }
  return TITIK[TITIK.length - 1];
}

export default function SisiLoader({ ukuran = 40, warna, kepala, durasi = 1600, diam = false, label = 'Memuat' }) {
  const garis = useRef(null);
  const ujung = useRef(null);
  const simpul = useRef([]);
  const warnaGaris = warna || 'var(--brand-900)';
  const warnaKepala = kepala || (warna ? warna : 'var(--accent-600)');
  const besar = ukuran >= 18;

  useEffect(() => {
    const kurang = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gambar = (t) => {
      const [a, b] = potongan(t);
      const g = garis.current;
      if (!g) return;
      g.style.strokeDasharray = `${(b - a) * PANJANG} ${PANJANG * 2}`;
      g.style.strokeDashoffset = `${-a * PANJANG}`;
      simpul.current.forEach((c, i) => {
        if (!c) return;
        const f = JARAK[i] / PANJANG;
        c.style.opacity = f >= a - 1e-6 && f <= b + 1e-6 ? '1' : '0';
      });
      const u = ujung.current;
      if (!u) return;
      if (b > a && b < 1) {
        const [x, y] = titikPada(b * PANJANG);
        u.setAttribute('cx', String(x));
        u.setAttribute('cy', String(y));
        u.style.opacity = '1';
      } else {
        u.style.opacity = '0';
      }
    };
    if (diam || kurang) {
      gambar(0.6);
      return undefined;
    }
    let id = 0;
    const mulai = performance.now();
    const putar = (sekarang) => {
      gambar(((sekarang - mulai) % durasi) / durasi);
      id = requestAnimationFrame(putar);
    };
    id = requestAnimationFrame(putar);
    return () => cancelAnimationFrame(id);
  }, [diam, durasi]);

  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 100 100" role="img" aria-label={label} style={{ display: 'block', flex: '0 0 auto' }}>
      <polyline points={POIN} fill="none" stroke={warnaGaris} strokeOpacity="0.22" strokeWidth={TEBAL} strokeLinejoin="round" strokeLinecap="round" />
      <polyline ref={garis} points={POIN} fill="none" stroke={warnaGaris} strokeWidth={TEBAL} strokeLinejoin="round" strokeLinecap="round"
        style={{ strokeDasharray: `0 ${PANJANG * 2}` }} />
      {besar && TITIK.map(([x, y], i) => (
        <circle key={i} ref={(el) => { simpul.current[i] = el; }} cx={x} cy={y} r={TEBAL * 0.95} fill={warnaGaris} style={{ opacity: 0 }} />
      ))}
      <circle ref={ujung} cx={TITIK[0][0]} cy={TITIK[0][1]} r={TEBAL * (besar ? 1.05 : 0.8)} fill={warnaKepala} style={{ opacity: 0 }} />
    </svg>
  );
}
