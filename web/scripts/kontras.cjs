#!/usr/bin/env node
/**
 * Periksa kontras pasangan teks-latar dari token (src/styles/tokens.css), tema terang dan gelap (WCAG 2.x).
 * Pakai: npm run kontras   (keluar 1 bila ada pasangan di bawah minimum)
 */
const fs = require('fs');
const path = require('path');

/** Token CSS `--nama: #hex` dari :root, ditimpa :root[data-tema="gelap"] bila tema = 'gelap'. Nilai bukan heksa diabaikan. */
function bacaToken(css, tema) {
  const blok = (pola) => {
    const m = css.match(pola);
    const hasil = {};
    if (!m) return hasil;
    for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) hasil[k] = v.toLowerCase();
    return hasil;
  };
  const terang = blok(/:root\s*\{([^}]*)\}/);
  return tema === 'gelap' ? { ...terang, ...blok(/:root\[data-tema="gelap"\]\s*\{([^}]*)\}/) } : terang;
}

const kanal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function luminans(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}
function rasio(a, b) {
  const [x, y] = [luminans(a), luminans(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [teks, latar, minimum]; nama = token, '#fff' = putih murni (teks di atas bilah / gradien). */
const PASANGAN = [
  ['neutral-900', 'putih', 4.5], ['neutral-700', 'putih', 4.5], ['neutral-500', 'putih', 3],
  ['neutral-900', 'neutral-50', 4.5], ['brand-950', 'brand-50', 4.5], ['brand-700', 'putih', 4.5], ['brand-800', 'brand-100', 4.5],
  ['di-isi', 'isi-utama', 4.5], ['di-isi', 'utama-hover', 4.5], ['di-isi', 'pil-aktif', 4.5],
  ['di-isi', 'isi-setuju', 4.5], ['di-isi', 'isi-setuju-hover', 4.5], ['di-isi', 'isi-bahaya', 4.5], ['di-isi', 'isi-bahaya-hover', 4.5],
  ['#fff', 'latar-dasar', 4.5], ['di-aksen', 'accent-600', 4.5], ['accent-700', 'accent-100', 4.5],
  ['red-700', 'red-100', 4.5], ['red-700', 'putih', 4.5], ['success-700', 'success-100', 4.5], ['brand-700', 'brand-100', 4.5],
  ['bar-teks', 'bar-latar', 4.5], ['bar-redup', 'bar-latar', 4.5], ['bar-garis', 'bar-latar', 3], ['di-aksen', 'accent-600', 4.5],
];

function periksa(css) {
  const hasil = [];
  for (const tema of ['terang', 'gelap']) {
    const t = bacaToken(css, tema);
    const nilai = (k) => (k.startsWith('#') ? k : t[k]);
    for (const [teks, latar, minimum] of PASANGAN) {
      const a = nilai(teks), b = nilai(latar);
      if (!a || !b) { hasil.push({ tema, teks, latar, rasio: 0, minimum, lulus: false }); continue; }
      const r = rasio(a, b);
      hasil.push({ tema, teks, latar, rasio: Math.round(r * 100) / 100, minimum, lulus: r >= minimum });
    }
  }
  return hasil;
}

module.exports = { bacaToken, rasio, luminans, PASANGAN, periksa };

if (require.main === module) {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');
  const h = periksa(css);
  for (const x of h) console.log(`${x.lulus ? 'ok ' : 'GAGAL'} ${x.tema.padEnd(6)} ${x.teks} / ${x.latar}: ${x.rasio} (min ${x.minimum})`);
  process.exit(h.every((x) => x.lulus) ? 0 : 1);
}
