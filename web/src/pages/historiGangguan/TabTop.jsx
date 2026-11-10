import { useMemo } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { BULAN_PENDEK, hitungKategori, JENIS_GGN, jenisGgn, kategoriAlat, kodeFgtm, perBulanRentang, perBulanTigaTahun, perTahunGgn, pieFgtm, rentangTahun, ringkasGgn, saringFilter, teksDurasi, tigaTahun, topPenyulang } from '../../gangguan.js';
import { angka, hariIniWib, TAHUN_AWAL, teksPeriode, tglId } from './bantu.js';
import { Batang, GrafikBulan, GrafikBulanTigaTahun, GrafikTop, KartuGrafik, kelasBeda, LegendaAlat, teksBeda } from './Grafik.jsx';

/** Judul kartu perbandingan bulanan 3 tahun: YOY <jenis> ULP Toboali. */
const judulYoy = (j) => 'YOY ' + (j.kode === 'pickup' ? 'Pickup' : j.label) + ' ULP Toboali';

/**
 * Tab "Top 12 Penyulang": tahun dipilih (?top=, bawaan tahun berjalan; tidak ikut filter tab Data Gangguan), satu kartu per
 * jenis (periode, grafik PMT | Section, perbandingan 3 tahun penyulang yang sama). Bar diklik = rincian penyulang itu.
 */
export function TabTop({ tahunTop, tahunKini, tt, onTahun, onPilih }) {
  return (
    <section className="ggn-panel ggn-tab-isi" aria-label={'Top 12 penyulang ' + tahunTop}>
      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Top 12 penyulang <small>klik bar untuk rincian</small></h2>
        <label className="ggn-pilih-tahun"><span>Tahun</span>
          <select className="k-input" value={tahunTop} onChange={(e) => onTahun(Number(e.target.value))}>
            {Array.from({ length: tahunKini - TAHUN_AWAL + 1 }, (_, i) => tahunKini - i).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <LegendaAlat />
      </div>
      {tt.galat && <p className="k-pesan k-pesan--galat">{tt.galat}</p>}
      <div className="ggn-top-grid">
        {JENIS_GGN.map((j) => (
          <KartuTop key={j.kode} j={j} tahun={tahunTop} baris={tt.data?.[j.kode]} onPilih={(n) => onPilih({ jenis: j.kode, penyulang: n })} />
        ))}
      </div>

      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Per bulan <small>{teksPeriode(rentangTahun(tahunTop, hariIniWib()))}</small></h2>
        <LegendaAlat />
      </div>
      <div className="ggn-grafik-grid" aria-label={'Gangguan per bulan ' + tahunTop}>
        {JENIS_GGN.map((j) => {
          const periode = rentangTahun(tahunTop, hariIniWib()), baris = tt.data?.[j.kode];
          return (
            <KartuGrafik key={j.kode} className={'ggn-panel ggn-w--' + j.warna} judul={j.label + ' per bulan'} sub={teksPeriode(periode)}>
              <h3><span className="ggn-titik" />{j.label}{baris && <b>{angka(perBulanRentang(baris, j.kode, periode.dari, periode.sampai).reduce((n, x) => n + x.jumlah, 0))}<i> kali</i></b>}</h3>
              {baris ? <GrafikBulan isi={perBulanRentang(baris, j.kode, periode.dari, periode.sampai)} onPilih={(bulan, kategori) => onPilih({ jenis: j.kode, bulan, kategori })} /> : <div className="k-tengah"><SisiLoader ukuran={32} label="Memuat" /></div>}
            </KartuGrafik>
          );
        })}
      </div>

      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Perbandingan bulanan 3 tahun <small>{tigaTahun(tahunTop).join(' · ')} · tiap batang = total, PMT (bawah) | Section (atas) dipisah garis putih</small></h2>
        <LegendaAlat />
      </div>
      <div className="ggn-top-grid" aria-label="Perbandingan bulanan 3 tahun">
        {JENIS_GGN.map((j) => (
          <KartuGrafik key={j.kode} className={'ggn-panel ggn-w--' + j.warna} judul={judulYoy(j)} sub={tigaTahun(tahunTop).join(' · ')}>
            <h3><span className="ggn-titik" />{judulYoy(j)}</h3>
            {tt.data?.[j.kode] ? <GrafikBulanTigaTahun isi={perBulanTigaTahun(tt.data[j.kode], j.kode, tahunTop)} onPilih={(bulan) => onPilih({ jenis: j.kode, bulan })} /> : <div className="k-tengah"><SisiLoader ukuran={32} label="Memuat" /></div>}
          </KartuGrafik>
        ))}
      </div>
    </section>
  );
}

/** Kartu Top 12 satu jenis: periode, grafik PMT | Section per penyulang, tabel perbandingan 3 tahun penyulang yang sama. */
export function KartuTop({ j, tahun, baris, onPilih }) {
  const hariIni = hariIniWib();
  const periode = rentangTahun(tahun, hariIni);
  const top = useMemo(() => (baris ? topPenyulang(baris, j.kode, tahun) : null), [baris, j.kode, tahun]);
  const total = useMemo(() => (baris ? perTahunGgn(baris, j.kode, tahun) : null), [baris, j.kode, tahun]);
  const tahun3 = tigaTahun(tahun);
  const berjalan = tahun === Number(hariIni.slice(0, 4));
  return (
    <KartuGrafik className={'ggn-panel ggn-top-kartu ggn-w--' + j.warna} judul={'Top 12 penyulang · ' + j.label} sub={'Periode ' + teksPeriode(periode)}>
      <h3><span className="ggn-titik" />{j.label}{total && <b>{angka(total[2].jumlah)}<i> kejadian</i></b>}</h3>
      <p className="ggn-periode">
        <Ikon nama="kalender" ukuran={14} />Periode {teksPeriode(periode)}{berjalan ? ' (tahun berjalan)' : ''}
        {total && <span> · PMT {total[2].pmt} · Section {total[2].section}</span>}
      </p>
      {!top ? <div className="k-tengah"><SisiLoader ukuran={32} label="Memuat" /></div> : <GrafikTop isi={top} onPilih={onPilih} />}
      {top && top.length > 0 && (
        <details className="ggn-banding-top">
          <summary>Perbandingan 3 tahun ({tahun3.join(', ')}) untuk penyulang di atas</summary>
          <div className="ggn-tabel-gulir">
            <table className="ggn-tabel">
              <thead><tr><th>Penyulang</th>{tahun3.map((t) => <th key={t}>{t}{berjalan && t === tahun ? '*' : ''}</th>)}<th>vs {tahun3[1]}</th></tr></thead>
              <tbody>
                {top.map((x) => {
                  const n = tahun3.map((t) => x.tahun[t]), beda = n[2] - n[1];
                  return (
                    <tr key={x.nama}>
                      <th><button type="button" onClick={() => onPilih(x.nama)}>{x.nama}</button></th>
                      {n.map((v, i) => <td key={tahun3[i]}>{v}</td>)}
                      <td className={kelasBeda(beda)}>{teksBeda(beda)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><th>Semua penyulang</th>{total.map((x) => <td key={x.tahun}>{x.jumlah}</td>)}<td className={kelasBeda(total[2].jumlah - total[1].jumlah)}>{teksBeda(total[2].jumlah - total[1].jumlah)}</td></tr></tfoot>
            </table>
          </div>
          {berjalan && <p className="ggn-catatan-kecil">* {tahun} s.d. hari ini, tahun sebelumnya penuh.</p>}
        </details>
      )}
    </KartuGrafik>
  );
}

/**
 * Rincian satu bar: kejadian penyulang itu di tahun Top 12, atau (rincian.bulan 'yyyy-MM', kategori?) semua kejadian bar bulanan
 * yang diklik di dialog perbesar. Dari data 3 tahun yang sudah dimuat, tidak ikut filter.
 */
export function Rincian({ baris, rincian, tahun, onTutup, onBuka }) {
  const J = rincian ? jenisGgn(rincian.jenis) : null;
  const periode = rentangTahun(tahun, hariIniWib());
  const isi = useMemo(() => {
    if (!rincian || !baris) return null;
    if (!rincian.bulan) return saringFilter(baris, rincian.jenis, { penyulang: rincian.penyulang, ...periode });
    // bar bulanan: semua kejadian bulan itu (kategori 'pmt' | 'section' bila batang PMT / Section yang diklik)
    return saringFilter(baris, rincian.jenis, { dari: rincian.bulan + '-01', sampai: rincian.bulan + '-31' })
      .filter((o) => !rincian.kategori || kategoriAlat(o, rincian.jenis) === rincian.kategori);
  }, [baris, rincian, periode.dari, periode.sampai]);
  const [thn, bln] = rincian?.bulan ? rincian.bulan.split('-') : [];
  const judul = !rincian ? '' : rincian.bulan ? BULAN_PENDEK[Number(bln) - 1] + ' ' + thn + (rincian.kategori ? ' · ' + (rincian.kategori === 'pmt' ? 'PMT' : 'Section') : '') : rincian.penyulang;
  const subJudul = !J ? '' : J.label + (rincian.bulan ? (rincian.kategori ? '' : ' · semua peralatan') : ' · ' + teksPeriode(periode));
  const r = isi ? ringkasGgn(isi, rincian.jenis) : null;
  const k = isi ? hitungKategori(isi, rincian.jenis) : null;
  return (
    <Dialog buka={!!rincian} judul={judul} sub={subJudul} onTutup={onTutup} lebar="min(760px, 94vw)">
      {rincian && !isi && <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div>}
      {isi && J && (
        <div className={'ggn-rincian ggn-w--' + J.warna}>
          <div className="ggn-kpi ggn-kpi--3">
            <div><small>Kejadian</small><b>{angka(r.jumlah)}</b><span className="ggn-kpi-alat"><i className="ggn-alat--pmt" />PMT {k.pmt}<i className="ggn-alat--section" />Section {k.section}</span></div>
            {rincian.jenis === 'penyulang' && <div><small>Total padam</small><b>{teksDurasi(r.durasiMenit)}</b></div>}
            {rincian.jenis === 'penyulang' && <div><small>ENS</small><b>{angka(r.ensKwh)}<i> kWh</i></b></div>}
            {rincian.jenis === 'pickup' && <div><small>Selesai</small><b>{angka(r.selesai)}</b></div>}
            {rincian.jenis === 'pickup' && <div><small>Belum</small><b>{angka(r.terbuka)}</b></div>}
            {rincian.jenis === 'ar' && <div><small>Peralatan terbanyak</small><b className="ggn-kecil">{r.alat[0]?.nama || '-'}</b></div>}
          </div>
          {rincian.jenis !== 'pickup' && <><h3 className="ggn-sub">Kode FGTM</h3><Batang isi={pieFgtm(isi).map((x) => ({ nama: (x.kode ? x.kode + ' · ' : '') + x.label, jumlah: x.jumlah }))} warna={J.warna} /></>}
          <h3 className="ggn-sub">Kejadian</h3>
          <ul className="ggn-rincian-daftar">
            {isi.map((o, i) => (
              <li key={i}>
                <button type="button" onClick={() => onBuka(o, rincian.jenis)}>
                  <span>{tglId(o[J.waktu])}</span><b>{o[J.alat] || '-'}</b><small>{o[J.sebab] || kodeFgtm(o.kode_fgtm).label}</small>
                  {rincian.jenis === 'penyulang' && <em>{teksDurasi(o.durasi_menit)}</em>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
