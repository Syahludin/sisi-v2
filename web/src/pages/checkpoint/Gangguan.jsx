import { useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import { grupBulanGgn, hitungKategori, perBulanRentang, pieFgtm, ringkasGgn } from '../../gangguan.js';
import { angka, TAB_PIE, TAMPIL_AWAL } from '../historiGangguan/bantu.js';
import { GrafikBulan, KartuGrafik, LegendaAlat, Pie } from '../historiGangguan/Grafik.jsx';
import { DetailKejadian, KartuKejadian, RingkasPadam } from '../historiGangguan/Kejadian.jsx';

/**
 * v1.0.51 sub-tab "Gangguan Penyulang" menu Checkpoint (port v1 getDpgGangguanPenyulang + grafik): KPI Total / PMT / Section,
 * grafik per bulan (PMT | Section), pie Kode FGTM, daftar kejadian per bulan. Data = getHistoriGangguan tahun itu
 * (komponen History Gangguan dipakai ulang). Filter penyulang saja (data gangguan tidak bersection).
 */
export function TabGangguan({ ggn, penyulang, tahun, dari, sampai }) {
  const [tabPie, setTabPie] = useState('SEMUA');
  const [tampil, setTampil] = useState(TAMPIL_AWAL);
  const [buka, setBuka] = useState(null);
  const baris = useMemo(() => (ggn?.penyulang || []).filter((o) => !penyulang || String(o.penyulang || '').toLowerCase() === penyulang.toLowerCase()), [ggn, penyulang]);
  const k = hitungKategori(baris, 'penyulang');
  const grup = useMemo(() => grupBulanGgn(baris.slice(0, tampil), 'penyulang'), [baris, tampil]);

  return (
    <section aria-label="Gangguan penyulang">
      <div className="ggn-jenis">
        {[['Total Gangguan', k.jumlah, 'merah'], ['PMT', k.pmt, 'kuning'], ['Section', k.section, 'biru']].map(([l, n, w]) => (
          <div key={l} className={'ggn-jenis-kartu ggn-cover-kartu ggn-w--' + w}><small>{l}</small><b>{angka(n)} <i>kali</i></b><em>{penyulang || 'Semua penyulang'} · {tahun}</em></div>
        ))}
      </div>
      <div className="ggn-ringkas">
        <KartuGrafik className="ggn-panel ggn-w--merah" judul={'Gangguan per bulan ' + tahun} sub={penyulang || 'Semua penyulang'}>
          <h3><span className="ggn-titik" />Gangguan per bulan<b>{angka(k.jumlah)}<i> kali</i></b></h3>
          <GrafikBulan isi={perBulanRentang(baris, 'penyulang', dari, sampai)} />
          <LegendaAlat />
        </KartuGrafik>
        <KartuGrafik className="ggn-panel ggn-pie-kartu" judul="Kode FGTM" legenda={false}>
          <div className="ggn-pie-kepala">
            <h3>Kode FGTM</h3>
            <div className="ggn-tab" role="tablist">
              {TAB_PIE.map(([kd, l]) => <button key={kd} type="button" role="tab" aria-selected={tabPie === kd} className={tabPie === kd ? 'aktif' : ''} onClick={() => setTabPie(kd)}>{l}</button>)}
            </div>
          </div>
          <Pie isi={pieFgtm(baris, tabPie)} />
        </KartuGrafik>
      </div>
      <section className="ggn-daftar" aria-label="Daftar gangguan">
        <h2 className="ggn-daftar-judul">Daftar gangguan penyulang {tahun}</h2>
        {baris.length > 0 && <RingkasPadam r={ringkasGgn(baris, 'penyulang')} />}
        {!baris.length && <p className="k-kosong">Tidak ada gangguan pada tahun {tahun}.</p>}
        {grup.map((g) => (
          <div key={g.kunci} className="ggn-grup">
            <h3 className="ggn-grup-judul">{g.label}<span>{g.isi.length}</span></h3>
            <ul>{g.isi.map((o, i) => <KartuKejadian key={(o.gangguan_id || '') + i} o={o} jenis="penyulang" onBuka={() => setBuka(o)} />)}</ul>
          </div>
        ))}
        {baris.length > tampil && (
          <button type="button" className="k-tombol k-tombol--garis ggn-lagi" onClick={() => setTampil((n) => n + TAMPIL_AWAL)}>Tampilkan {Math.min(TAMPIL_AWAL, baris.length - tampil)} lagi</button>
        )}
      </section>
      <Dialog buka={!!buka} judul={buka ? (buka.peralatan || buka.penyulang) : ''} sub={buka ? 'Gangguan Penyulang · ' + buka.penyulang : ''} onTutup={() => setBuka(null)} lebar="min(720px, 94vw)">
        {buka && <DetailKejadian o={buka} jenis="penyulang" />}
        <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={() => setBuka(null)}>Tutup</button></div>
      </Dialog>
    </section>
  );
}
