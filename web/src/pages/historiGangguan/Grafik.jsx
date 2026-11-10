import { createContext, useContext, useEffect, useRef, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import { KATEGORI_ALAT } from '../../gangguan.js';
import { WARNA_PIE } from './bantu.js';

/** Grafik History Gangguan: kartu yang bisa diperbesar, batang PMT | Section, Top 12, per bulan, 3 tahun, pie, batang mendatar. */
// klik di elemen ini = aksi elemen itu sendiri (bar, tab, tabel, potongan pie), bukan perbesar kartu
export const BUKAN_PERBESAR = 'button, a, summary, select, input, label, table, circle, .k-input, .ggn-kolom-klik';

/**
 * v1.0.50 (permintaan Master Guswan): skala teks grafik. 1 = kartu biasa; SKALA_BESAR = dialog perbesar, supaya teks (sumbu, label,
 * angka, legenda, judul) tetap terbaca saat di-screenshot ke PPT. SVG tren memakai skala ini untuk jarak tepi + posisi
 * teks, CSS memakai --ggn-s untuk ukuran huruf.
 */
export const SKALA_BESAR = 1.6;
const SkalaGrafik = createContext(1);

/**
 * Kartu grafik: klik area kosong kartu = isi kartu yang sama dibuka besar di dialog (Esc / klik latar / Tutup = kembali).
 * Isi dirender ulang di dialog, jadi bar / tab di dalamnya tetap bisa diklik.
 */
export function KartuGrafik({ as: Tag = 'div', className, judul, sub, legenda = true, children, ...lain }) {
  const [besar, setBesar] = useState(false);
  return (
    <>
      <Tag {...lain} className={className + ' ggn-bisa-besar'} title="Klik area kosong untuk memperbesar"
        onClick={(e) => { if (!e.target.closest(BUKAN_PERBESAR)) setBesar(true); }}>
        {children}
      </Tag>
      <Dialog buka={besar} judul={judul} sub={sub} onTutup={() => setBesar(false)} lebar="min(1400px, 98vw)">
        <SkalaGrafik.Provider value={SKALA_BESAR}>
          <div className="ggn-besar-isi" style={{ '--ggn-s': SKALA_BESAR }}>
            {legenda && <LegendaAlat />}
            <div className={className + ' ggn-besar'}>{children}</div>
          </div>
        </SkalaGrafik.Provider>
        <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={() => setBesar(false)}>Tutup</button></div>
      </Dialog>
    </>
  );
}

export function LegendaAlat() {
  return (
    <ul className="ggn-legenda-alat" aria-label="Kategori peralatan">
      {KATEGORI_ALAT.map((k) => <li key={k.kode} title={k.ket}><i className={'ggn-alat--' + k.kode} /><b>{k.label}</b><small>{k.ket}</small></li>)}
    </ul>
  );
}

export const teksAlat = (x) => `PMT ${x.pmt}, Section ${x.section}`;
export const teksBeda = (beda) => (beda > 0 ? '▲ ' + beda : beda < 0 ? '▼ ' + -beda : '=');
export const kelasBeda = (beda) => (beda > 0 ? 'naik' : beda < 0 ? 'turun' : '');

/** Ukuran kotak (px) dari ResizeObserver: SVG digambar sesuai lebar asli, jadi teks tidak ikut melar / mengecil. */
function useUkuran() {
  const ref = useRef(null);
  const [u, setU] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const e = ref.current;
    if (!e) return undefined;
    const ukur = () => setU({ w: Math.round(e.clientWidth), h: Math.round(e.clientHeight) });
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  return [ref, u];
}

/** Batas atas sumbu "bulat" (langkah 1 / 2 / 5 x 10^n, 3-5 garis bantu). Murni. */
function skalaSumbu(maks) {
  const kasar = Math.max(1, maks) / 4, p = Math.pow(10, Math.floor(Math.log10(kasar)));
  const langkah = [1, 2, 5, 10].map((x) => x * p).find((x) => x >= kasar);
  return { atas: Math.max(langkah, Math.ceil(Math.max(1, maks) / langkah) * langkah), langkah };
}

/** Nama panjang dipecah per kata ke maks 2 baris (sisanya dipotong "…"). */
function barisLabel(t, maksHuruf) {
  const kata = String(t).split(/\s+/), hasil = [''];
  kata.forEach((k) => {
    const i = hasil.length - 1;
    if (!hasil[i] || (hasil[i] + ' ' + k).length <= maksHuruf) hasil[i] = hasil[i] ? hasil[i] + ' ' + k : k;
    else hasil.push(k);
  });
  if (hasil.length > 2) hasil.splice(2, hasil.length, hasil[1] + '…');
  return hasil.map((b) => (b.length > maksHuruf + 1 ? b.slice(0, maksHuruf) + '…' : b));
}

/** Sudut atas membulat (r) untuk batang tegak dari garis dasar. */
const pathBatang = (x, y, w, h, r) => {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y + h}Z`;
};

/**
 * v1.0.38 Opsi C (mockup chart): sumbu Y berangka + garis bantu, per kolom dua batang tipis PMT | Section (angka di dalam
 * batang bila muat), garis + area tren total dengan titik dan angka total. Dipakai Top 12, per bulan, dan 3 tahun.
 * isi: [{ kunci, label, sub?, pmt, section, jumlah, catatan?, kelasCatatan?, judul (tooltip) }]. onPilih(kunci, kategori?) = kolom bisa
 * diklik (kategori 'pmt' | 'section' bila batangnya yang diklik); hanyaBesar = hanya aktif di dialog perbesar.
 */
function GrafikTren({ isi, onPilih, hanyaBesar = false, baris2 = false, labelPanjang = false, ariaLabel }) {
  const [ref, { w, h }] = useUkuran();
  const k = useContext(SkalaGrafik);   // v1.0.50: 1 biasa, SKALA_BESAR di dialog perbesar
  const aktif = !!onPilih && (!hanyaBesar || k > 1);
  const m = { l: 34 * k, r: 44 * k, t: 24 * k, b: (labelPanjang ? 40 : baris2 ? 34 : 22) * k };   // kanan: label rata-rata
  const rata = isi.length ? isi.reduce((n, x) => n + x.jumlah, 0) / isi.length : 0;
  const s = skalaSumbu(Math.max(0, ...isi.map((x) => x.jumlah)));
  const lebarDalam = Math.max(0, w - m.l - m.r), kolom = isi.length ? lebarDalam / isi.length : 0;
  const y = (v) => m.t + (h - m.t - m.b) * (1 - v / s.atas);
  const bw = Math.max(3, Math.min(16 * k, kolom * 0.2));
  const titik = isi.map((x, i) => [m.l + kolom * (i + 0.5), y(x.jumlah)]);
  const garis = [];
  for (let v = 0; v <= s.atas; v += s.langkah) garis.push(v);
  const maksHuruf = Math.max(4, Math.floor(kolom / (6.2 * k)));
  return (
    <div ref={ref} className="ggn-svg" role="img" aria-label={ariaLabel}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {garis.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className={v ? 'ggn-svg-grid' : 'ggn-svg-dasar'} />
              <text x={m.l - 6 * k} y={y(v) + 3.5 * k} textAnchor="end" className="ggn-svg-sumbu">{v}</text>
            </g>
          ))}
          {titik.length > 0 && (
            <path className="ggn-svg-area" d={'M' + titik.map((p) => p.join(',')).join('L') + `L${titik[titik.length - 1][0]},${y(0)}L${titik[0][0]},${y(0)}Z`} />
          )}
          {isi.map((x, i) => {
            const cx = titik[i][0], klik = aktif ? () => onPilih(x.kunci) : undefined;
            const batang = [['pmt', x.pmt, cx - bw - 1], ['section', x.section, cx + 1]];
            return (
              <g key={x.kunci} className={'ggn-svg-kolom' + (klik ? ' ggn-kolom-klik' : '')} onClick={klik}
                role={klik ? 'button' : undefined} tabIndex={klik ? 0 : undefined} aria-label={klik ? x.judul + ', lihat rincian' : undefined}
                onKeyDown={klik ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); klik(); } } : undefined}>
                <title>{x.judul}</title>
                <rect className="ggn-svg-sorot" x={m.l + kolom * i + 1} y={m.t - 18 * k} width={Math.max(0, kolom - 2)} height={y(0) - m.t + 18 * k} rx="6" />
                {/* review 8 Nov 2026: nama `kat`, bukan `k` (dulu menimpa skala k sehingga angka di dalam batang tidak pernah tampil) */}
                {batang.map(([kat, v, bx]) => (
                  <g key={kat} onClick={klik ? (e) => { e.stopPropagation(); onPilih(x.kunci, kat); } : undefined}>
                    <path d={pathBatang(bx, y(v), bw, y(0) - y(v), 3)} className={'ggn-svg-' + kat} />
                    {v > 0 && y(0) - y(v) >= 15 * k && bw >= 9 * k && <text x={bx + bw / 2} y={y(v) + 11 * k} textAnchor="middle" className="ggn-svg-dalam">{v}</text>}
                  </g>
                ))}
                {(labelPanjang ? barisLabel(x.label, maksHuruf) : [x.label]).map((t, j) => (
                  <text key={j} x={cx} y={y(0) + (14 + j * 12) * k} textAnchor="middle" className={labelPanjang ? 'ggn-svg-nama' : 'ggn-svg-label'}>{t}</text>
                ))}
                {x.sub && <text x={cx} y={y(0) + 26 * k} textAnchor="middle" className="ggn-svg-sub">{x.sub}</text>}
              </g>
            );
          })}
          {isi.length > 1 && (
            <g className="ggn-svg-rata">
              <title>{'Rata-rata ' + rata.toFixed(1) + ' kejadian per kolom'}</title>
              <line x1={m.l} x2={w - m.r} y1={y(rata)} y2={y(rata)} />
              <text x={w - m.r + 4 * k} y={y(rata) - 2 * k}>rata</text>
              <text x={w - m.r + 4 * k} y={y(rata) + 9 * k} className="ggn-svg-rata-n">{rata.toFixed(1).replace('.', ',')}</text>
            </g>
          )}
          {titik.length > 1 && <polyline points={titik.map((p) => p.join(',')).join(' ')} className="ggn-svg-tren" />}
          {titik.map((p, i) => (
            <g key={isi[i].kunci} className="ggn-svg-titik">
              <circle cx={p[0]} cy={p[1]} r={3.8 * k} />
              <text x={p[0]} y={p[1] - 8 * k} textAnchor="middle" className="ggn-svg-total">
                {isi[i].jumlah}{isi[i].catatan && <tspan className={'ggn-svg-beda ' + (isi[i].kelasCatatan || '')}>{' ' + isi[i].catatan}</tspan>}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/** Top 12: per penyulang (opsi C). Kolom diklik = rincian. */
export function GrafikTop({ isi, onPilih }) {
  if (!isi.length) return <p className="ggn-kosong">Belum ada kejadian di tahun ini.</p>;
  return (
    <div className="ggn-topbar">
      <GrafikTren labelPanjang onPilih={onPilih} ariaLabel="Top 12 penyulang"
        isi={isi.map((x, i) => ({ kunci: x.nama, label: x.nama, pmt: x.pmt, section: x.section, jumlah: x.jumlah, judul: `${i + 1}. ${x.nama}: ${x.jumlah} kejadian (${teksAlat(x)})` }))} />
    </div>
  );
}

export function GrafikBulan({ isi, onPilih }) {
  const sempit = isi.length > 14;
  return (
    <div className="ggn-tren">
      <GrafikTren baris2 hanyaBesar onPilih={onPilih} ariaLabel="Kejadian per bulan"
        isi={isi.map((x, i) => ({ kunci: x.bulan, label: sempit && i % 2 ? '' : x.pendek, sub: i === 0 || x.pendek === 'Jan' ? x.bulan.slice(0, 4) : '',
          pmt: x.pmt, section: x.section, jumlah: x.jumlah, judul: `${x.label}: ${x.jumlah} kejadian (${teksAlat(x)})` }))} />
    </div>
  );
}

/** 3 tahun: total + selisih terhadap tahun sebelumnya di atas titik. */
export function GrafikTahun({ isi }) {
  return (
    <div className="ggn-tren ggn-tren3">
      <GrafikTren ariaLabel="Perbandingan 3 tahun"
        isi={isi.map((x, i) => {
          const beda = i ? x.jumlah - isi[i - 1].jumlah : 0;
          return { kunci: String(x.tahun), label: String(x.tahun),pmt: x.pmt, section: x.section, jumlah: x.jumlah,
            catatan: i ? teksBeda(beda).replace(' ', '') : '', kelasCatatan: kelasBeda(beda), judul: `${x.tahun}: ${x.jumlah} kejadian (${teksAlat(x)})` };
        })} />
    </div>
  );
}

/**
 * Perbandingan bulanan 3 tahun dalam satu grafik: per bulan 3 batang bersebelahan (tahun-2, tahun-1, tahun, ditandai '24 '25 '26
 * di bawah batang), tiap batang total kejadian bertumpuk PMT (bawah, biru) + Section (atas, oranye) dengan garis putih pemisah.
 * Warna hanya berarti PMT / Section (sama dengan grafik lain). isi: dari perBulanTigaTahun. onPilih('yyyy-MM') = batang bisa
 * diklik, hanya di dialog perbesar.
 */
export function GrafikBulanTigaTahun({ isi, onPilih }) {
  const [ref, { w, h }] = useUkuran();
  const k = useContext(SkalaGrafik);
  const m = { l: 34 * k, r: 8 * k, t: 22 * k, b: 34 * k };
  const aktif = !!onPilih && k > 1;
  const s = skalaSumbu(Math.max(0, ...isi.flatMap((x) => x.tahun.map((y) => y.jumlah))));
  const kolom = isi.length ? Math.max(0, w - m.l - m.r) / isi.length : 0;
  const y = (v) => m.t + (h - m.t - m.b) * (1 - v / s.atas);
  const bw = Math.max(3, Math.min(18 * k, (kolom * 0.86) / 3 - 1));
  const garis = [];
  for (let v = 0; v <= s.atas; v += s.langkah) garis.push(v);
  return (
    <div className="ggn-tren">
      <div ref={ref} className="ggn-svg" role="img" aria-label="Perbandingan bulanan 3 tahun">
        {w > 0 && h > 0 && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {garis.map((v) => (
              <g key={v}>
                <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className={v ? 'ggn-svg-grid' : 'ggn-svg-dasar'} />
                <text x={m.l - 6 * k} y={y(v) + 3.5 * k} textAnchor="end" className="ggn-svg-sumbu">{v}</text>
              </g>
            ))}
            {isi.map((bln, i) => {
              const tengah = m.l + kolom * (i + 0.5), x0 = tengah - (bw * 3 + 2) / 2;
              return (
                <g key={bln.bulan} className="ggn-svg-kolom">
                  <title>{bln.pendek + ': ' + bln.tahun.map((t) => `${t.tahun} ${t.jumlah} (PMT ${t.pmt}, Section ${t.section})`).join(' · ')}</title>
                  <rect className="ggn-svg-sorot" x={m.l + kolom * i + 1} y={m.t - 16 * k} width={Math.max(0, kolom - 2)} height={y(0) - m.t + 16 * k} rx="6" />
                  {bln.tahun.map((t, j) => {
                    const bx = x0 + j * (bw + 1), yPmt = y(t.pmt), yAtas = y(t.jumlah);
                    const klik = aktif && t.jumlah > 0 ? () => onPilih(t.tahun + '-' + String(bln.bulan).padStart(2, '0')) : undefined;
                    return (
                      <g key={t.tahun} className={klik ? 'ggn-kolom-klik ggn-bar-klik' : undefined} onClick={klik}
                        role={klik ? 'button' : undefined} tabIndex={klik ? 0 : undefined} aria-label={klik ? `${bln.pendek} ${t.tahun}: ${t.jumlah} kejadian, lihat rincian` : undefined}
                        onKeyDown={klik ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); klik(); } } : undefined}>
                        <path d={pathBatang(bx, yAtas, bw, yPmt - yAtas, 3)} className="ggn-svg-section" />
                        <path d={pathBatang(bx, yPmt, bw, y(0) - yPmt, t.section ? 0 : 3)} className="ggn-svg-pmt" />
                        {t.pmt > 0 && t.section > 0 && <line x1={bx} x2={bx + bw} y1={yPmt} y2={yPmt} className="ggn-svg-pisah" />}
                        {t.jumlah > 0 && bw >= 8 * k && <text x={bx + bw / 2} y={yAtas - 3 * k} textAnchor="middle" className="ggn-svg-total ggn-svg-total--kecil">{t.jumlah}</text>}
                        {bw >= 8 * k && <text x={bx + bw / 2} y={y(0) + 10 * k} textAnchor="middle" className="ggn-svg-sub">{"'" + String(t.tahun).slice(2)}</text>}
                      </g>
                    );
                  })}
                  <text x={tengah} y={y(0) + 24 * k} textAnchor="middle" className="ggn-svg-label">{bln.pendek}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

export function Pie({ isi, onPilih, aktif }) {
  const total = isi.reduce((n, x) => n + x.jumlah, 0);
  if (!total) return <p className="ggn-kosong">Belum ada kejadian dengan Kode FGTM untuk pilihan ini.</p>;
  let sudut = 0;
  const R = 70, K = 2 * Math.PI * R;
  return (
    <div className="ggn-pie">
      <svg viewBox="0 0 180 180" role="img" aria-label="Komposisi Kode FGTM">
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--neutral-100)" strokeWidth="30" />
        {isi.map((x, i) => {
          const pjg = (x.jumlah / total) * K, el = (
            <circle key={x.kode || '-'} cx="90" cy="90" r={R} fill="none" stroke={WARNA_PIE[i % WARNA_PIE.length]} strokeWidth={aktif && aktif === x.kode ? 36 : 30}
              strokeDasharray={`${pjg} ${K - pjg}`} strokeDashoffset={-sudut} transform="rotate(-90 90 90)"
              style={{ cursor: x.kode ? 'pointer' : 'default' }} onClick={() => onPilih(x.kode)}><title>{`${x.label}: ${x.jumlah}`}</title></circle>
          );
          sudut += pjg;
          return el;
        })}
        <text x="90" y="86" textAnchor="middle" className="ggn-pie-total">{total}</text>
        <text x="90" y="106" textAnchor="middle" className="ggn-pie-label">kejadian</text>
      </svg>
      <ul className="ggn-pie-legenda">
        {isi.map((x, i) => (
          <li key={x.kode || '-'}>
            <button type="button" disabled={!x.kode} className={aktif && aktif === x.kode ? 'aktif' : ''} onClick={() => onPilih(x.kode)}>
              <i style={{ background: WARNA_PIE[i % WARNA_PIE.length] }} />
              <span>{x.kode ? <b>{x.kode}</b> : null}{x.label}</span>
              <em>{x.jumlah}</em><small>{Math.round((x.jumlah / total) * 100)}%</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Batang({ judul, isi, onPilih, warna }) {
  if (!isi || !isi.length) return <p className="ggn-kosong">Belum ada data.</p>;
  const maks = Math.max(1, ...isi.map((x) => x.jumlah));
  return (
    <>
      {judul && <h3 className="ggn-sub">{judul}</h3>}
      <ul className={'ggn-batang' + (warna ? ' ggn-w--' + warna : '')}>
        {isi.map((x) => {
          const isiBaris = (
            <>
              <span className="ggn-batang-nama" title={x.nama}>{x.nama}</span>
              <span className="ggn-batang-jalur"><span style={{ width: (x.jumlah / maks) * 100 + '%' }} /></span>
              <b>{x.jumlah}</b>
            </>
          );
          return (
            <li key={x.nama}>
              {onPilih ? <button type="button" onClick={() => onPilih(x.nama)}>{isiBaris}</button> : <div>{isiBaris}</div>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
