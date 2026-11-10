import { useEffect, useMemo, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import {
  GRUP_FGTM, grupBulanGgn, JENIS_GGN, jenisGgn, KODE_FGTM, perBulanRentang, perTahunGgn, pieFgtm, ringkasGgn, samaPenyulang, saringFilter, tigaTahun,
} from '../../gangguan.js';
import { angka, TAB_PIE, TAMPIL_AWAL, teksPeriode } from './bantu.js';
import { GrafikBulan, GrafikTahun, KartuGrafik, LegendaAlat, Pie } from './Grafik.jsx';
import { KartuKejadian, RingkasPadam } from './Kejadian.jsx';

/**
 * Tab "Data Gangguan": filter (penyulang, Kode FGTM, rentang tanggal; di alamat), grafik per bulan, perbandingan 3 tahun
 * (tahun "sampai" dan 2 tahun sebelumnya), pie Kode FGTM, dan daftar kejadian per jenis. Semua mengikuti filter.
 */
export function TabData({ data, memuat, q, ubah, ubahTanggal, banding, tahunBanding, tahunKini, daftarNama, onBuka }) {
  const dari = q.dari, sampai = q.sampai, penyulang = q.penyulang, fgtm = q.fgtm;
  const jenis = jenisGgn(q.jenis).kode;
  const tabPie = TAB_PIE.some(([k]) => k === q.pie) ? q.pie : 'SEMUA';
  const [sumberPie, setSumberPie] = useState('penyulang');
  const [cari, setCari] = useState('');
  const [tampil, setTampil] = useState(TAMPIL_AWAL);
  useEffect(() => { setTampil(TAMPIL_AWAL); }, [jenis, penyulang, fgtm, cari, dari, sampai]);

  const filter = { penyulang, fgtm, dari, sampai };
  const tersaring = useMemo(() => Object.fromEntries(JENIS_GGN.map((j) => [j.kode, saringFilter(data?.[j.kode], j.kode, filter)])), [data, penyulang, fgtm, dari, sampai]);
  const baris = useMemo(() => saringFilter(data?.[jenis], jenis, { ...filter, cari }), [data, jenis, penyulang, fgtm, dari, sampai, cari]);
  const grup = useMemo(() => grupBulanGgn(baris.slice(0, tampil), jenis), [baris, tampil, jenis]);
  const pie = useMemo(() => pieFgtm(tersaring[sumberPie], tabPie), [tersaring, sumberPie, tabPie]);
  const adaFilter = penyulang || fgtm || q.dariAlamat || q.sampaiAlamat;

  return (
    <section className={'ggn-panel ggn-tab-isi' + (memuat ? ' ggn-badan--muat' : '')} aria-label="Data gangguan">
      <div className="ggn-filter" aria-label="Filter">
        <label><span>Penyulang</span>
          <select className="k-input" value={daftarNama.find((n) => samaPenyulang(n, penyulang)) || penyulang} onChange={(e) => ubah({ penyulang: e.target.value })}>
            <option value="">Semua penyulang</option>
            {penyulang && !daftarNama.some((n) => samaPenyulang(n, penyulang)) && <option value={penyulang}>{penyulang}</option>}
            {daftarNama.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label><span>Kode gangguan (FGTM)</span>
          <select className="k-input" value={fgtm} onChange={(e) => ubah({ fgtm: e.target.value })}>
            <option value="">Semua kode</option>
            <optgroup label="Kelompok">{Object.entries(GRUP_FGTM).map(([k, l]) => <option key={k} value={k}>Semua {l}</option>)}</optgroup>
            {Object.entries(GRUP_FGTM).map(([g, l]) => (
              <optgroup key={g} label={l}>
                {KODE_FGTM.filter((k) => k.grup === g).map((k) => <option key={k.kode} value={k.kode}>{k.kode} · {k.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label><span>Dari tanggal</span><input type="date" className="k-input" value={dari} max={sampai} onChange={(e) => ubahTanggal('dari', e.target.value)} /></label>
        <label><span>Sampai tanggal</span><input type="date" className="k-input" value={sampai} min={dari} onChange={(e) => ubahTanggal('sampai', e.target.value)} /></label>
        <button type="button" className="k-tombol k-tombol--garis" disabled={!adaFilter} onClick={() => ubah({ penyulang: '', fgtm: '', dari: '', sampai: '' })}>
          <Ikon nama="tutup" ukuran={15} />Reset
        </button>
        {fgtm && <p className="ggn-catatan">Pick up tidak memiliki Kode FGTM, jadi tidak ikut tersaring kode.</p>}
      </div>

      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Per bulan <small>{teksPeriode({ dari, sampai })} · ikut filter</small></h2>
        <LegendaAlat />
      </div>
      <div className="ggn-grafik-grid" aria-label="Grafik per bulan">
        {JENIS_GGN.map((j) => (
          <KartuGrafik key={j.kode} className={'ggn-panel ggn-w--' + j.warna} judul={j.label + ' per bulan'} sub={teksPeriode({ dari, sampai })}>
            <h3><span className="ggn-titik" />{j.label}<b>{angka(tersaring[j.kode].length)}<i> kali</i></b></h3>
            <GrafikBulan isi={perBulanRentang(tersaring[j.kode], j.kode, dari, sampai)} />
          </KartuGrafik>
        ))}
      </div>

      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Perbandingan 3 tahun <small>{tigaTahun(tahunBanding).join(' · ')} · ikut filter penyulang &amp; kode, {tahunBanding === tahunKini ? tahunBanding + ' s.d. hari ini' : 'tahun penuh'}</small></h2>
        <LegendaAlat />
      </div>
      {banding.galat && <p className="k-pesan k-pesan--galat">{banding.galat}</p>}
      <div className="ggn-grafik-grid" aria-label="Perbandingan 3 tahun">
        {JENIS_GGN.map((j) => {
          const isi = banding.data ? perTahunGgn(saringFilter(banding.data[j.kode], j.kode, { penyulang, fgtm }), j.kode, tahunBanding) : null;
          return (
            <KartuGrafik key={j.kode} className={'ggn-panel ggn-w--' + j.warna} judul={j.label + ' · perbandingan 3 tahun'} sub={tigaTahun(tahunBanding).join(' · ')}>
              <h3><span className="ggn-titik" />{j.label}{isi && <b>{angka(isi[2].jumlah)}<i> di {tahunBanding}</i></b>}</h3>
              {isi ? <GrafikTahun isi={isi} /> : !banding.galat && <div className="k-tengah"><SisiLoader ukuran={32} label="Memuat" /></div>}
            </KartuGrafik>
          );
        })}
      </div>

      <KartuGrafik as="section" className="ggn-panel ggn-pie-kartu" aria-label="Ringkasan Kode FGTM" judul="Kode FGTM" legenda={false}>
        <div className="ggn-pie-kepala">
          <h3>Kode FGTM</h3>
          <div className="ggn-tab" role="tablist">
            {TAB_PIE.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tabPie === k} className={tabPie === k ? 'aktif' : ''} onClick={() => ubah({ pie: k === 'SEMUA' ? '' : k })}>{l}</button>)}
          </div>
          <div className="ggn-tab ggn-tab--kecil" role="group" aria-label="Sumber">
            {JENIS_GGN.filter((j) => j.kode !== 'pickup').map((j) => <button key={j.kode} type="button" className={sumberPie === j.kode ? 'aktif' : ''} onClick={() => setSumberPie(j.kode)}>{j.label}</button>)}
          </div>
        </div>
        <Pie isi={pie} onPilih={(k) => k && ubah({ fgtm: fgtm === k ? '' : k })} aktif={fgtm} />
      </KartuGrafik>

      <section className="ggn-daftar" aria-label="Daftar kejadian">
        <div className="ggn-daftar-kepala">
          <div className="ggn-tab" role="tablist" aria-label="Jenis">
            {JENIS_GGN.map((j) => <button key={j.kode} type="button" role="tab" aria-selected={jenis === j.kode} className={jenis === j.kode ? 'aktif' : ''} onClick={() => ubah({ jenis: j.kode })}>{j.label} <span>{tersaring[j.kode].length}</span></button>)}
          </div>
          <label className="ggn-cari">
            <Ikon nama="cari" ukuran={17} />
            <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari peralatan, penyebab, lokasi..." aria-label="Cari kejadian" />
          </label>
        </div>
        {jenis === 'penyulang' && baris.length > 0 && <RingkasPadam r={ringkasGgn(baris, 'penyulang')} />}
        {!baris.length && <p className="k-kosong">Tidak ada kejadian untuk pilihan ini.</p>}
        {grup.map((g) => (
          <div key={g.kunci} className="ggn-grup">
            <h3 className="ggn-grup-judul">{g.label}<span>{g.isi.length}</span></h3>
            <ul>
              {g.isi.map((o, i) => <KartuKejadian key={(o.gangguan_id || o.ar_id || o.pickup_id || '') + i} o={o} jenis={jenis} onBuka={() => onBuka({ o, jenis })} />)}
            </ul>
          </div>
        ))}
        {baris.length > tampil && (
          <button type="button" className="k-tombol k-tombol--garis ggn-lagi" onClick={() => setTampil((n) => n + TAMPIL_AWAL)}>
            Tampilkan {Math.min(TAMPIL_AWAL, baris.length - tampil)} lagi
          </button>
        )}
      </section>
    </section>
  );
}
