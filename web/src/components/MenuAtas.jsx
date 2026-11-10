import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Ikon from './Ikon.jsx';
import { saringMenu, sembunyiRel } from '../katalog.js';
import './menuAtas.css';

/** Pemisah (isolator) rel: memotong rel di antara dua pemutus, digambar dengan warna rel. */
const Isolator = () => (
  <svg className="ma-iso" viewBox="0 0 26 8" aria-hidden="true">
    <circle cx="3" cy="4" r="2.5" fill="currentColor" /><circle cx="23" cy="4" r="2.5" fill="currentColor" />
    <path d="M4 4.5L21 -2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/**
 * Menu atas gaya busbar (diagram satu garis): tombol "Semua Menu" membuka panel selebar layar (tiap grup = Feeder bernomor,
 * dilipat / dibuka, tiap menu = pemutus dengan deskripsi). Rel di bilah = menu yang SUDAH DIBUKA admin di browser ini (bukan
 * favorit), urut dibuka; pemutus emas = halaman aktif, teal penuh = sudah dibuka, kosong = belum dibuka. Ctrl+K membuka panel
 * dengan kotak cari. `children` = isi blok kanan setelah tombol cari (tema, akun).
 * `feeder` = [{ grup, no, menu }] dari feederMenu(sesi); `rel` = kode menu yang dibuka (sudah efektif).
 */
export default function MenuAtas({ feeder, rel, aktif, tutup, onPilih, onLepas, onTutup, onTutupSemua, children }) {
  const [buka, setBuka] = useState(false);
  const [kata, setKata] = useState('');
  const tombol = useRef(null);
  const isian = useRef(null);
  const kolom = useRef(null);
  const semuaMenu = useMemo(() => feeder.flatMap((g) => g.menu), [feeder]);
  const tampil = useMemo(() => saringMenu(feeder, kata), [feeder, kata]);
  const mencari = kata.trim() !== '';
  const noFeeder = useMemo(() => new Map(feeder.flatMap((g) => g.menu.map((m) => [m.kode, g.no]))), [feeder]);
  const relMenu = rel.map((k) => semuaMenu.find((m) => m.kode === k)).filter(Boolean);
  const aktifKode = relMenu.find((m) => m.halaman === aktif)?.kode || '';
  const [lebar, setLebar] = useState({});   // kode -> lebar pemutus (px), diukur dari yang sedang tampil
  const [ruang, setRuang] = useState(0);    // lebar rel yang tersedia
  const [lagiBuka, setLagiBuka] = useState(false);
  const relEl = useRef(null);
  const sembunyi = useMemo(() => (ruang ? sembunyiRel(rel, aktifKode, lebar, ruang) : []), [rel, aktifKode, lebar, ruang]);
  const menuLagi = sembunyi.map((k) => semuaMenu.find((m) => m.kode === k)).filter(Boolean);
  const semuaTerlipat = feeder.length > 0 && feeder.every((g) => tutup.includes(g.grup));

  useLayoutEffect(() => {
    const el = relEl.current;
    if (!el) return undefined;
    const ukurRuang = () => setRuang(el.clientWidth);
    ukurRuang();
    const ro = new ResizeObserver(ukurRuang);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // ukur pemutus yang sedang tampil (yang disembunyikan memakai ukuran terakhirnya)
  useLayoutEffect(() => {
    const el = relEl.current;
    if (!el) return;
    const baru = {};
    el.querySelectorAll('.ma-grup[data-kode]').forEach((g) => { if (g.offsetParent !== null) baru[g.dataset.kode] = g.offsetWidth; });
    setLebar((lama) => (Object.keys(baru).some((k) => lama[k] !== baru[k]) ? { ...lama, ...baru } : lama));
  });
  useEffect(() => { if (!sembunyi.length) setLagiBuka(false); }, [sembunyi.length]);
  useEffect(() => {
    if (!lagiBuka) return undefined;
    const luar = (e) => { if (!e.target.closest?.('.ma-grup--lagi')) setLagiBuka(false); };
    document.addEventListener('mousedown', luar);
    return () => document.removeEventListener('mousedown', luar);
  }, [lagiBuka]);

  const bukaPanel = () => { setKata(''); setBuka(true); };
  const tutupPanel = (kembali) => { setBuka(false); if (kembali) tombol.current?.focus(); };

  useEffect(() => { if (buka) isian.current?.focus(); }, [buka]);
  useEffect(() => {
    const dengar = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (buka) tutupPanel(true); else bukaPanel(); }
      else if (e.key === 'Escape' && buka) tutupPanel(true);
    };
    window.addEventListener('keydown', dengar);
    return () => window.removeEventListener('keydown', dengar);
  }, [buka]);

  const pilih = (m) => { tutupPanel(false); onPilih(m); };
  const pindahFokus = (e, arah) => {
    const daftar = [...(kolom.current ? kolom.current.querySelectorAll('.ma-mi-buka') : [])];
    if (!daftar.length) return;
    e.preventDefault();
    const i = daftar.indexOf(document.activeElement);
    const berikut = i < 0 ? (arah > 0 ? 0 : daftar.length - 1) : Math.min(daftar.length - 1, Math.max(-1, i + arah));
    if (berikut < 0) isian.current?.focus(); else daftar[berikut].focus();
  };
  const tekanPanel = (e) => {
    if (e.key === 'ArrowDown') pindahFokus(e, 1);
    else if (e.key === 'ArrowUp') pindahFokus(e, -1);
  };
  const tekanIsian = (e) => {
    if (e.key === 'Enter') {
      const pertama = tampil[0] && tampil[0].menu[0];
      if (pertama) { e.preventDefault(); pilih(pertama); }
    }
  };

  return (
    <>
      <button type="button" ref={tombol} className="ma-semua" aria-label="Semua Menu" aria-expanded={buka} aria-controls="ma-panel" onClick={() => (buka ? tutupPanel(false) : bukaPanel())}>
        <Ikon nama="menu" ukuran={17} tebal={1.9} />
        <span className="ma-semua-teks">Semua Menu</span>
        <span className={'ma-semua-panah' + (buka ? ' ma-semua-panah--buka' : '')}><Ikon nama="kanan" ukuran={14} /></span>
      </button>

      <nav className="ma-rel" ref={relEl} aria-label="Menu yang dibuka">
        {relMenu.map((m) => {
          const sedang = m.halaman === aktif;
          return (
            <div key={m.kode} data-kode={m.kode} className={'ma-grup' + (sembunyi.includes(m.kode) ? ' ma-grup--sembunyi' : '')}>
              <Isolator />
              <div className="ma-nod">
              <span className="ma-f">FEEDER {noFeeder.get(m.kode)}</span>
              <button type="button" className={'ma-pm' + (sedang ? ' ma-pm--aktif' : ' ma-pm--buka')} aria-current={sedang ? 'page' : undefined} onClick={() => pilih(m)}>
                {m.nama}
                <span className="ma-tip" role="tooltip"><b>{m.nama}</b>{m.desc}</span>
              </button>
              <button type="button" className="ma-x" aria-label={'Tutup ' + m.nama} title={'Tutup ' + m.nama} onClick={() => onLepas(m.kode)}>×</button>
              </div>
            </div>
          );
        })}
        {menuLagi.length > 0 && (
          <div className="ma-grup ma-grup--lagi">
            <Isolator />
            <div className="ma-nod">
              <button type="button" className="ma-pm ma-pm--lagi" aria-expanded={lagiBuka} aria-haspopup="true" onClick={() => setLagiBuka((v) => !v)}>
                {menuLagi.length} lagi <span aria-hidden="true">▾</span>
              </button>
              {lagiBuka && (
                <ul className="ma-lagi" aria-label="Menu lain yang dibuka">
                  {menuLagi.map((m) => (
                    <li key={m.kode}>
                      <button type="button" className="ma-lagi-buka" onClick={() => { setLagiBuka(false); pilih(m); }}>
                        <code>FEEDER {noFeeder.get(m.kode)}</code><span>{m.nama}</span>
                      </button>
                      <button type="button" className="ma-lagi-x" aria-label={'Tutup ' + m.nama} title={'Tutup ' + m.nama} onClick={() => onLepas(m.kode)}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="ma-grup ma-grup--tambah">
          <Isolator />
          <div className="ma-nod">
            <button type="button" className="ma-pm ma-pm--tambah" aria-label="Buka menu lain" onClick={bukaPanel}>
              +<span className="ma-tip" role="tooltip"><b>Buka menu lain</b>Menu yang Anda buka tampil di rel ini.</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="ma-beban">
        <button type="button" className="ma-cari" onClick={bukaPanel} aria-label="Cari menu">
          <Ikon nama="cari" ukuran={16} tebal={1.9} /><span className="ma-cari-teks">Cari menu</span><kbd>Ctrl K</kbd>
        </button>
        {children}
      </div>

      {buka && (
        <>
          <button type="button" className="ma-latar" aria-label="Tutup menu" onClick={() => tutupPanel(true)} />
          <section id="ma-panel" className="ma-panel" aria-label="Semua menu" onKeyDown={tekanPanel}>
            <div className="ma-cariin">
              <Ikon nama="cari" ukuran={17} tebal={1.9} />
              <input ref={isian} type="text" value={kata} onChange={(e) => setKata(e.target.value)} onKeyDown={tekanIsian}
                placeholder="Cari menu, mis. tiang, padam, gardu" autoComplete="off" aria-label="Cari menu" />
              <span>Esc untuk menutup</span>
            </div>
            <div className="ma-kolom" ref={kolom}>
              {tampil.length === 0 && <p className="ma-kosong">Tidak ada menu yang cocok dengan “{kata.trim()}”.</p>}
              {tampil.map((g) => {
                const terlipat = !mencari && tutup.includes(g.grup);
                const adaAktif = g.menu.some((m) => m.halaman === aktif);
                return (
                  <section key={g.grup} className={'ma-fd' + (terlipat ? ' ma-fd--tutup' : '')}>
                    <button type="button" className="ma-fd-judul" aria-expanded={!terlipat} onClick={() => onTutup(g.grup)} title={terlipat ? 'Buka ' + g.grup : 'Lipat ' + g.grup}>
                      <code>FEEDER {g.no}</code>
                      <span className="ma-fd-nama">{g.grup}</span>
                      {terlipat && adaAktif && <i className="ma-fd-titik" title="Menu yang sedang dibuka ada di feeder ini" />}
                      <span className="ma-fd-bus" />
                      <em>{g.menu.length}</em>
                      <span className="ma-fd-panah"><Ikon nama="kanan" ukuran={14} /></span>
                    </button>
                    {!terlipat && (
                      <ul className="ma-fd-daftar">
                        {g.menu.map((m) => {
                          const sedang = m.halaman === aktif;
                          return (
                            <li key={m.kode} className={'ma-mi' + (sedang ? ' ma-mi--aktif' : rel.includes(m.kode) ? ' ma-mi--buka' : '')}>
                              <i className="ma-br" aria-hidden="true" />
                              <button type="button" className="ma-mi-buka" onClick={() => pilih(m)} aria-current={m.halaman === aktif ? 'page' : undefined}>
                                <b>{m.nama}</b><small>{m.desc}</small>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="ma-kaki">
              <button type="button" className="ma-mini" onClick={() => onTutupSemua(feeder.map((g) => g.grup), !semuaTerlipat)}>{semuaTerlipat ? 'Buka Semua' : 'Lipat Semua'}</button>
              <span className="ma-legenda"><i className="ma-lg ma-lg--aktif" />Sedang dibuka<i className="ma-lg ma-lg--buka" />Sudah dibuka, ada di rel<i className="ma-lg" />Belum dibuka</span>
              <span className="ma-kaki-kanan"><kbd>↑</kbd> <kbd>↓</kbd> pindah · <kbd>Enter</kbd> buka</span>
            </div>
          </section>
        </>
      )}
    </>
  );
}
