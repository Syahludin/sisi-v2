import { useMemo, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import { BULAN_PENDEK, cocokkanKejadian, jenisGgn, saringFilter, SUMBER_GGN } from '../../gangguan.js';
import { angka, teksPeriode } from './bantu.js';
import { KartuGrafik } from './Grafik.jsx';
import { kategoriBeda, LegendaKategori, RincianBulan, tanda } from './RincianBulan.jsx';
import { RincianPenyulang } from './RincianPenyulang.jsx';
import { SelisihKejadian } from './Selisih.jsx';

/** Filter Sumber (?sumber=wilayah|simonlang|banding): dipakai tab Top 12 Penyulang dan Data Gangguan. */
export function PilihSumber({ sumber, ubah, kelas }) {
  return (
    <label className={kelas}><span>Sumber</span>
      <select className="k-input" value={sumber} onChange={(e) => ubah({ sumber: e.target.value === 'wilayah' ? '' : e.target.value })}>
        {SUMBER_GGN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

const JENIS_BANDING = ['penyulang', 'ar'];
const BATAS_PENYULANG = 12;
const tglBaris = (o, j) => String(o[j.waktu] || '').slice(0, 10);
const hitungPer = (baris, ambil) => { const m = new Map(); baris.forEach((o) => { const k = ambil(o); m.set(k, (m.get(k) || 0) + 1); }); return m; };
const lebar = (n, maks) => (maks > 0 ? Math.max(n > 0 ? 3 : 0, Math.round((n / maks) * 100)) : 0) + '%';
const bulanTeks = (ym) => BULAN_PENDEK[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(2, 4);

/** Legenda dua sumber (warna sama di seluruh tampilan Perbandingan). */
export function LegendaSumber() {
  return (
    <ul className="ggn-bd-legenda" aria-label="Warna sumber">
      <li><i className="ggn-bd--sl" /><b>SiMonLang</b></li>
      <li><i className="ggn-bd--wil" /><b>Gangguan Wilayah</b></li>
    </ul>
  );
}

/**
 * Perbandingan SiMonLang dan Gangguan Wilayah (penyulang + AR; pick up hanya ada di SiMonLang). Hanya rentang tanggal yang ada
 * di KEDUA sumber yang dihitung (dalam data yang dimuat), supaya selisihnya adil. Ikut filter penyulang, kode, dan tanggal.
 * Tiap jenis: kesimpulan satu kalimat, dua batang total, batang ganda per bulan, dan rincian gangguan per penyulang.
 */
export function PerbandinganSumber({ data, filter }) {
  const hasil = useMemo(() => JENIS_BANDING.map((kode) => {
    const j = jenisGgn(kode), wil = data?.[kode] || [], sl = data?.[kode + '_sl'] || [];
    const tgl = (b) => b.map((o) => tglBaris(o, j)).filter(Boolean).sort();
    const tw = tgl(wil), ts = tgl(sl);
    if (!tw.length || !ts.length) return { j, kosong: true };
    const dari = [tw[0], ts[0], filter.dari].filter(Boolean).sort().pop();
    const sampai = [tw[tw.length - 1], ts[ts.length - 1], filter.sampai].filter(Boolean).sort()[0];
    if (dari > sampai) return { j, kosong: true };
    const f = { penyulang: filter.penyulang, fgtm: filter.fgtm, dari, sampai };
    const a = saringFilter(sl, kode, f), b = saringFilter(wil, kode, f);
    const bulan = new Set([...a, ...b].map((o) => tglBaris(o, j).slice(0, 7)));
    const pa = hitungPer(a, (o) => o.penyulang), pb = hitungPer(b, (o) => o.penyulang);
    const ba = hitungPer(a, (o) => tglBaris(o, j).slice(0, 7)), bb = hitungPer(b, (o) => tglBaris(o, j).slice(0, 7));
    const per = (ma, mb, urut) => [...urut].map((k) => ({ nama: k, sl: ma.get(k) || 0, wil: mb.get(k) || 0 }));
    const semuaPenyulang = per(pa, pb, new Set([...pa.keys(), ...pb.keys()]));
    return {
      j, dari, sampai, sl: a.length, wil: b.length, barisSl: a, barisWil: b, cocok: cocokkanKejadian(a, b, kode),
      bulan: per(ba, bb, [...bulan].sort()),
      jumlahPenyulang: semuaPenyulang.length,
      beda: semuaPenyulang.filter((x) => x.sl !== x.wil)
        .sort((x, y) => Math.abs(y.sl - y.wil) - Math.abs(x.sl - x.wil) || x.nama.localeCompare(y.nama)),
    };
  }), [data, filter.penyulang, filter.fgtm, filter.dari, filter.sampai]);

  const [pen, setPen] = useState('');   // penyulang yang rinciannya dibuka (dialog)
  const [kode, setKode] = useState(JENIS_BANDING[0]);   // tab jenis yang tampil (satu jenis per tampilan supaya lebih besar)
  const h = hasil.find((x) => x.j.kode === kode) || hasil[0];
  return (
    <>
    <div className="ggn-tab ggn-tab--jenis" role="tablist" aria-label="Jenis gangguan">
      {hasil.map((x) => {
        const n = x.kosong ? 0 : x.cocok.pasangan.length + x.cocok.hanyaSl.length + x.cocok.hanyaWil.length;
        return (
          <button key={x.j.kode} type="button" role="tab" aria-selected={h.j.kode === x.j.kode} className={h.j.kode === x.j.kode ? 'aktif' : ''} onClick={() => { setKode(x.j.kode); setPen(''); }}>
            {x.j.label}<span title="Jumlah kejadian yang berselisih">{n}</span>
          </button>
        );
      })}
    </div>
    <div className="ggn-bd-grid" role="tabpanel" aria-label={'Perbandingan ' + h.j.label}>
      <KartuGrafik legenda={false} className={'ggn-panel ggn-bd ggn-w--' + h.j.warna} judul={h.j.label + ' · SiMonLang vs Wilayah'} sub={h.kosong ? '' : teksPeriode(h)}>
        <h3><span className="ggn-titik" />{h.j.label}</h3>
        {h.kosong ? <p className="k-kosong">Belum ada rentang tanggal yang sama di kedua sumber.</p> : <IsiBanding h={h} onPenyulang={setPen} />}
      </KartuGrafik>
    </div>
    {!h.kosong && <SelisihKejadian key={h.j.kode} h={h} />}
    {!h.kosong && <RincianPenyulang h={h} nama={pen} onTutup={() => setPen('')} />}
    </>
  );
}

function IsiBanding({ h, onPenyulang }) {
  const [ym, setYm] = useState('');   // bulan yang dibuka rincian per tanggalnya
  // jumlah kejadian selisih (nilai berbeda / hanya di satu sumber) per bulan: untuk kategori penanda
  const dataPerBulan = useMemo(() => {
    const m = new Map(), j = h.j;
    const tambah = (o) => { const k = String(o[j.waktu] || '').slice(0, 7); m.set(k, (m.get(k) || 0) + 1); };
    h.cocok.pasangan.forEach((p) => tambah(p.sl));
    h.cocok.hanyaSl.forEach(tambah);
    h.cocok.hanyaWil.forEach(tambah);
    return m;
  }, [h]);
  const selisih = h.sl - h.wil, maks = Math.max(h.sl, h.wil);
  const persen = h.wil ? Math.abs(selisih / h.wil) * 100 : 0;
  const sama = selisih === 0 && !h.beda.length;
  const kesimpulan = selisih === 0
    ? (sama ? 'Jumlah sama persis' : 'Total sama, tetapi sebarannya berbeda')
    : (selisih > 0 ? 'SiMonLang lebih banyak ' : 'Gangguan Wilayah lebih banyak ') + angka(Math.abs(selisih)) + ' kejadian';
  const bulanBeda = h.bulan.filter((x) => x.sl !== x.wil).length;
  const maksBulan = Math.max(1, ...h.bulan.map((x) => Math.max(x.sl, x.wil)));
  const maksPen = Math.max(1, ...h.beda.map((x) => Math.max(x.sl, x.wil)));
  return (
    <>
      <p className="ggn-periode"><Ikon nama="kalender" ukuran={14} />Rentang yang dihitung {teksPeriode(h)}</p>

      <div className={'ggn-bd-hasil ggn-bd-hasil--' + (sama ? 'sama' : selisih ? 'jumlah' : 'data')} role="status">
        <Ikon nama={sama ? 'centangLingkaran' : 'peringatan'} ukuran={22} />
        <div>
          <b>{kesimpulan}</b>
          <small>
            {sama ? 'Semua bulan dan penyulang cocok.'
              : `${selisih ? persen.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '% dari Gangguan Wilayah · ' : ''}${bulanBeda} dari ${h.bulan.length} bulan berbeda · ${h.beda.length} dari ${h.jumlahPenyulang} penyulang berbeda`}
          </small>
        </div>
      </div>

      <div className="ggn-bd-total" aria-label="Total kejadian">
        <div><span>SiMonLang</span><div className="ggn-bd-jalur"><i className="ggn-bd--sl" style={{ width: lebar(h.sl, maks) }} /></div><b>{angka(h.sl)}</b></div>
        <div><span>Gangguan Wilayah</span><div className="ggn-bd-jalur"><i className="ggn-bd--wil" style={{ width: lebar(h.wil, maks) }} /></div><b>{angka(h.wil)}</b></div>
      </div>

      <h4 className="ggn-sub">Rincian Gangguan Per bulan</h4>
      <LegendaKategori />
      <div className="ggn-bd-bulan" role="group" aria-label="Kejadian per bulan: SiMonLang dan Gangguan Wilayah berdampingan">
        {h.bulan.map((x) => {
          const d = x.sl - x.wil, kat = kategoriBeda(x.sl, x.wil, dataPerBulan.get(x.nama) || 0);
          return (
            <button key={x.nama} type="button" aria-pressed={ym === x.nama} onClick={() => setYm((v) => (v === x.nama ? '' : x.nama))}
              className={'ggn-bd-kol ggn-kat--' + kat + (ym === x.nama ? ' ggn-bd-kol--pilih' : '')}
              title={`${bulanTeks(x.nama)}: SiMonLang ${x.sl}, Wilayah ${x.wil}. Klik untuk melihat per tanggal.`}>
              {kat === 'data' && <span className="ggn-kat-peringatan" aria-label="Jumlah sama, ada data berbeda"><Ikon nama="peringatan" ukuran={15} /></span>}
              <span className="ggn-bd-pasang">
                <span style={{ height: lebar(x.sl, maksBulan) }}><em>{x.sl}</em><i className="ggn-bd--sl" /></span>
                <span style={{ height: lebar(x.wil, maksBulan) }}><em>{x.wil}</em><i className="ggn-bd--wil" /></span>
              </span>
              <small>{bulanTeks(x.nama)}</small>
              <b className={'ggn-bd-chip ' + (kat === 'jumlah' ? 'ggn-chip--jumlah' : 'ggn-bd-chip--sama')}>{kat === 'jumlah' ? tanda(d) : '='}</b>
            </button>
          );
        })}
      </div>
      {ym && <RincianBulan h={h} ym={ym} onTutup={() => setYm('')} />}

      <h4 className="ggn-sub">Rincian Gangguan Per Penyulang <small>{h.beda.length > BATAS_PENYULANG ? `${BATAS_PENYULANG} terbesar dari ${h.beda.length} · ` : ''}klik untuk rincian per kejadian</small></h4>
      {!h.beda.length ? (
        <p className="ggn-bd-cocok"><Ikon nama="centang" ukuran={16} />Semua {h.jumlahPenyulang} penyulang punya jumlah yang sama di kedua sumber.</p>
      ) : (
        <ul className="ggn-bd-daftar">
          {h.beda.slice(0, BATAS_PENYULANG).map((x) => (
            <li key={x.nama}>
              <button type="button" className="ggn-bd-baris" onClick={() => onPenyulang(x.nama)} title="Klik untuk melihat setiap gangguan penyulang ini">
                <b>{x.nama}</b>
                <span className="ggn-bd-ganda" aria-hidden="true">
                  <span className="ggn-bd-jalur"><i className="ggn-bd--sl" style={{ width: lebar(x.sl, maksPen) }} /></span>
                  <span className="ggn-bd-jalur"><i className="ggn-bd--wil" style={{ width: lebar(x.wil, maksPen) }} /></span>
                </span>
                <span className="ggn-bd-angka"><i className="ggn-bd--sl" />{x.sl}<i className="ggn-bd--wil" />{x.wil}</span>
                <em className="ggn-bd-chip">{tanda(x.sl - x.wil)}</em>
                <Ikon nama="kanan" ukuran={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
