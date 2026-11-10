import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { GelembungWa, TombolWa } from '../components/TeksWa.jsx';
import { bulanTampil, jamWib, KATEGORI_LGP, uraiLaporanGangguan } from '../laporanGangguan.js';
import { kodeGalat, pesan } from '../pesan.js';
import './laporanGangguan.css';

const BATAS_SEGAR_MS = 120000;   // sinkron dari sumber + susun ulang
const LEBAR_DUA_KOLOM = '(min-width: 1100px)';

/** true bila layar cukup lebar untuk teks WhatsApp di kolom kanan (sebaliknya teks WA jadi tab ketiga). */
function useLebar(query) {
  const [cocok, setCocok] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const ubah = () => setCocok(m.matches);
    m.addEventListener('change', ubah);
    return () => m.removeEventListener('change', ubah);
  }, [query]);
  return cocok;
}

/**
 * Laporan Gangguan Penyulang (v1.0.59, menu OPS_LAP_GANGGUAN): teks WhatsApp H-1 (00.00 - 23.59 kemarin, dilaporkan hari ini) +
 * rekap bulan berjalan. Tanggal tetap, tidak bisa diubah. Server menyinkron data gangguan sendiri bila salinannya
 * belum memuat seluruh hari laporan; "Perbarui dari sumber" memaksa sinkron + susun ulang.
 * Review 8 Nov 2026 (desain ulang, sama dengan HP): hero = tanggal laporan + tiga angka + Salin / Buka WhatsApp; isi dipisah
 * tab Hari laporan / Rekap bulan (diurai dari teks server, uraiLaporanGangguan); teks WhatsApp utuh di kolom kanan (layar
 * lebar) atau tab ketiga. Status data hanya tampil bila perlu (sinkron gagal, galat, sedang / sudah diperbarui).
 */
export default function LaporanGangguan({ api }) {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [segar, setSegar] = useState(false);       // sedang "Perbarui dari sumber"
  const [diperbarui, setDiperbarui] = useState(false);   // pembaruan dari sumber terakhir berhasil
  const [galat, setGalat] = useState('');
  const [tab, setTab] = useState('hari');
  const urut = useRef(0);
  const lebar = useLebar(LEBAR_DUA_KOLOM);

  const muat = useCallback(async (paksa) => {
    const no = ++urut.current;
    setMemuat(true);
    setSegar(paksa);
    setGalat('');
    if (paksa) setDiperbarui(false);
    try {
      const j = await api('getLaporanGangguan', paksa ? { segar: true } : {}, {
        batasMs: BATAS_SEGAR_MS, awal: (c) => { if (no === urut.current && !paksa) setData(c.data); } });
      if (no === urut.current) { setData(j.data); setDiperbarui(paksa && !j.data?.sinkronGagal); }
    } catch (e) {
      if (no === urut.current) setGalat(pesan(kodeGalat(e)));
    } finally {
      if (no === urut.current) { setMemuat(false); setSegar(false); }
    }
  }, [api]);

  useEffect(() => { muat(false); }, [muat]);

  const uraian = useMemo(() => uraiLaporanGangguan(data?.teks), [data?.teks]);
  const tabAktif = lebar && tab === 'wa' ? 'hari' : tab;
  // layar sempit: label pendek + tab ketiga teks WA (layar lebar: teks WA di kolom kanan)
  const daftarTab = lebar
    ? [['hari', 'Hari laporan'], ['bulan', 'Rekap ' + (uraian ? bulanTampil(uraian.bulan) : 'bulan')]]
    : [['hari', 'Hari laporan'], ['bulan', 'Rekap bulan'], ['wa', 'Teks WA']];
  const j = data?.jumlah || {};

  if (!data) {
    return (
      <div className="hlm lgp">
        <div className="lgp-hero lgp-hero--kosong">
          <h1 className="lgp-judul">Laporan Gangguan Penyulang</h1>
          {memuat && <div className="lgp-muat" role="status"><SisiLoader ukuran={40} label="Memuat" /><p>Menyusun laporan…</p></div>}
          {!memuat && galat && (
            <div className="lgp-muat" role="alert">
              <p>{galat}</p>
              <button type="button" className="k-tombol k-tombol--terang" onClick={() => muat(false)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="hlm lgp">
      <section className="lgp-hero" aria-labelledby="lgp-judul">
        <div className="lgp-hero-atas">
          <div className="lgp-hero-teks">
            <h1 id="lgp-judul" className="lgp-judul">Laporan Gangguan Penyulang</h1>
            <p className="lgp-tanggal"><span className="lgp-h1">H-1</span>{data.hari}</p>
          </div>
          <button type="button" className="k-tombol k-tombol--kaca lgp-segar" onClick={() => muat(true)} disabled={memuat}
            title="Baca ulang data gangguan dari sumber, lalu susun ulang laporan">
            {segar ? <SisiLoader ukuran={16} label="Memperbarui" /> : <Ikon nama="ulang" ukuran={16} />}
            {segar ? 'Memperbarui… (maks 2 menit)' : 'Perbarui dari sumber'}
          </button>
        </div>
        <ul className="lgp-kpi" aria-label="Jumlah gangguan hari laporan">
          {KATEGORI_LGP.map((k) => (
            <li key={k.kode} className={'lgp-kpi--' + k.kode}>
              <b>{Number(j[k.kode]) || 0}</b>
              <span>{k.label}</span>
            </li>
          ))}
        </ul>
        <TombolWa teks={data.teks} kelas="lgp-kirim" terang />
      </section>

      <div className="lgp-status" aria-live="polite">
        {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat} Yang tampil laporan dari pemuatan sebelumnya.</p>}
        {data.sinkronGagal && (
          <p className="k-banner lgp-banner" role="alert">
            <Ikon nama="peringatan" ukuran={18} />
            <span>Data gangguan belum terbaru dari sumber, kejadian terakhir mungkin belum masuk. Perbarui dulu sebelum laporan dikirim.</span>
            <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat(true)} disabled={memuat}>Coba lagi</button>
          </p>
        )}
        {diperbarui && !memuat && <p className="k-pesan k-pesan--ok">Diperbarui dari sumber pukul {jamWib(data.disusunPada)}.</p>}
      </div>

      <div className={'lgp-isi' + (lebar ? ' lgp-isi--dua' : '')}>
        <section className="lgp-utama">
          {uraian ? (
            <>
              <div className="k-tab" role="tablist" aria-label="Bagian laporan">
                {daftarTab.map(([k, l]) => (
                  <button key={k} type="button" role="tab" id={'lgp-tab-' + k} aria-selected={tabAktif === k} aria-controls={'lgp-panel-' + k}
                    className={'k-tab-tombol' + (tabAktif === k ? ' k-tab-tombol--aktif' : '')} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              <div role="tabpanel" id={'lgp-panel-' + tabAktif} aria-labelledby={'lgp-tab-' + tabAktif} className="lgp-panel">
                {tabAktif === 'hari' && <HariLaporan uraian={uraian} />}
                {tabAktif === 'bulan' && <RekapBulan uraian={uraian} />}
                {tabAktif === 'wa' && <GelembungWa teks={data.teks} />}
              </div>
            </>
          ) : (
            <GelembungWa teks={data.teks} />
          )}
        </section>
        {lebar && uraian && (
          <aside className="lgp-wa" aria-label="Teks WhatsApp">
            <h2>Teks WhatsApp</h2>
            <GelembungWa teks={data.teks} tinggiMaks="calc(100vh - 210px)" />
          </aside>
        )}
      </div>
    </div>
  );
}

function Nihil() { return <span className="lgp-nihil">NIHIL</span>; }

/** Kejadian hari laporan per kategori (penyulang + penyebab). */
function HariLaporan({ uraian }) {
  return (
    <div className="lgp-kat-daftar">
      {uraian.harian.map((k) => (
        <article key={k.kode} className={'lgp-kat lgp-kat--' + k.kode}>
          <header>
            <h3>{k.label}</h3>
            {k.jumlah ? <span className="lgp-jumlah">{k.jumlah} kali</span> : <Nihil />}
          </header>
          {k.kejadian.length > 0 && (
            <ol className="lgp-kejadian">
              {k.kejadian.map((x, i) => (
                <li key={i}>
                  <b>{x.penyulang}</b>
                  <span>{x.penyebab || 'Penyebab belum diisi'}</span>
                </li>
              ))}
            </ol>
          )}
        </article>
      ))}
    </div>
  );
}

/** Rekap bulan: gangguan tertinggi + komulatif per kategori dengan batang. */
function RekapBulan({ uraian }) {
  return (
    <div className="lgp-kat-daftar">
      <article className="lgp-kat lgp-kat--tertinggi">
        <header>
          <h3>Gangguan tertinggi</h3>
          {uraian.tertinggi.length ? <span className="lgp-jumlah">{uraian.tertinggi[0].pmt + uraian.tertinggi[0].section} kali</span> : <Nihil />}
        </header>
        {uraian.tertinggi.length > 0 && (
          <ul className="lgp-tertinggi">
            {uraian.tertinggi.map((x) => (
              <li key={x.nama}>
                <b>{x.nama}</b>
                <span><i className="lgp-titik lgp-titik--pmt" />PMT {x.pmt}<i className="lgp-titik lgp-titik--lockout" />Section {x.section}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
      {uraian.rekap.map((k) => {
        const maks = Math.max(1, ...k.daftar.map((x) => x.jumlah));
        return (
          <article key={k.kode} className={'lgp-kat lgp-kat--' + k.kode}>
            <header>
              <h3>{k.label}</h3>
              {k.total ? <span className="lgp-jumlah">{k.total} kali</span> : <Nihil />}
            </header>
            {k.daftar.length > 0 && (
              <ul className="lgp-batang">
                {k.daftar.map((x) => (
                  <li key={x.nama}>
                    <span className="lgp-batang-nama">{x.nama}</span>
                    <span className="lgp-batang-jalur" aria-hidden="true"><i style={{ width: (x.jumlah / maks) * 100 + '%' }} /></span>
                    <b>{x.jumlah}</b>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}
