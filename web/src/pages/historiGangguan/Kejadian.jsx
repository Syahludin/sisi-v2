import Ikon from '../../components/Ikon.jsx';
import { jenisGgn, kodeFgtm, teksDurasi } from '../../gangguan.js';
import { angka, pecahWaktu } from './bantu.js';

/** Kartu kejadian di daftar, ringkasan padam, dan isi dialog detail satu kejadian. */
export function RingkasPadam({ r }) {
  return (
    <div className="ggn-kpi ggn-kpi--4">
      <div><small>Total padam</small><b>{teksDurasi(r.durasiMenit)}</b></div>
      <div><small>Rata-rata / kejadian</small><b>{teksDurasi(r.rataMenit)}</b></div>
      <div><small>ENS</small><b>{angka(r.ensKwh)}<i> kWh</i></b></div>
      <div><small>Pelanggan padam</small><b>{angka(r.pelanggan)}</b></div>
    </div>
  );
}

export function KartuKejadian({ o, jenis, onBuka }) {
  const J = jenisGgn(jenis);
  const w = pecahWaktu(o[J.waktu]);
  const sebab = o[J.sebab];
  return (
    <li>
      <button type="button" className={'ggn-kartu ggn-w--' + J.warna} onClick={onBuka}>
        <span className="ggn-kartu-tgl"><b>{w.tgl}</b><small>{w.bln}</small>{w.jam && <i>{w.jam}</i>}</span>
        <span className="ggn-kartu-isi">
          <b>{o[J.alat] || '-'}</b>
          <small>{o.penyulang}{o.jenis_peralatan ? ' · ' + o.jenis_peralatan : ''}{jenis === 'pickup' && o.fasa ? ' · fasa ' + o.fasa : ''}</small>
          <span className="ggn-kartu-sebab">{sebab || <em>{jenis === 'pickup' ? 'Temuan belum diisi' : 'Penyebab belum diketahui'}</em>}</span>
        </span>
        <span className="ggn-kartu-tanda">
          {(o.indikasi || o.indikasi_relay) && <span className="ggn-pil">{o.indikasi || o.indikasi_relay}</span>}
          {jenis === 'penyulang' && <span className="ggn-pil ggn-pil--durasi">{teksDurasi(o.durasi_menit)}</span>}
          {jenis === 'pickup' && <span className={'ggn-pil ' + (o.status === 'DONE' || o.status === 'SELESAI' ? 'ggn-pil--ok' : 'ggn-pil--buka')}>{o.status || 'BELUM'}</span>}
          {jenis !== 'pickup' && o.kode_fgtm && (() => { const k = kodeFgtm(o.kode_fgtm); return <span className={'ggn-pil ggn-pil--' + (k.grup === 'INTERNAL' ? 'int' : 'ext')} title={k.label}>{k.kode}</span>; })()}
          {o.cuaca && <span className="ggn-pil ggn-pil--cuaca">{o.cuaca}</span>}
        </span>
      </button>
    </li>
  );
}

export const BARIS_DETAIL = {
  penyulang: [['No APKT', 'no_apkt'], ['Padam', 'waktu_padam'], ['Nyala', 'waktu_nyala'], ['Durasi', 'durasi_menit', teksDurasi], ['Status', 'status'],
    ['Indikasi', 'indikasi'], ['Arus sebelum trip', 'beban_a', (v) => angka(v) + ' A'], ['ENS', 'ens_kwh', (v) => angka(v) + ' kWh'],
    ['Pelanggan', 'pelanggan', angka], ['Pelanggan x durasi', 'pelanggan_x_durasi', angka], ['Pelanggan VIP', 'pelanggan_vip'],
    ['SCADA', 'scada'], ['Status SCADA', 'status_scada'], ['Cuaca', 'cuaca'], ['Kode FGTM', 'kode_fgtm'], ['Penyebab', 'penyebab'],
    ['Ket. penyebab', 'ket_penyebab'], ['Lokasi', 'lokasi'], ['Jumlah gardu', 'jumlah_gardu', angka], ['Daerah padam', 'daerah_padam'],
    ['Keterangan', 'keterangan'], ['Petugas P2D', 'petugas'], ['Pengawas', 'pengawas']],
  ar: [['Waktu AR', 'waktu_ar'], ['Indikasi', 'indikasi'], ['Arus sebelum trip', 'beban_a', (v) => angka(v) + ' A'], ['SCADA', 'scada'], ['Status SCADA', 'status_scada'],
    ['Cuaca', 'cuaca'], ['Kode FGTM', 'kode_fgtm'], ['Penyebab', 'penyebab'], ['Ket. penyebab', 'ket_penyebab'], ['Lokasi', 'lokasi'],
    ['Keterangan', 'keterangan'], ['Petugas P2D', 'petugas'], ['Pengawas', 'pengawas']],
  pickup: [['Waktu event', 'waktu_event'], ['Indikasi relay', 'indikasi_relay'], ['Fasa', 'fasa'], ['Tindak lanjut', 'waktu_tindak_lanjut'],
    ['Temuan', 'temuan'], ['Status', 'status'], ['Petugas eksekusi', 'petugas_eksekusi'], ['Koordinat temuan', 'koordinat_temuan'], ['Koordinat ujung', 'koordinat_ujung']],
};
export const FOTO_PICKUP = [['foto_arus', 'Arus pick up'], ['foto_ujung', 'Gardu ujung'], ['foto_temuan', 'Temuan'], ['foto_sesudah', 'Sesudah eksekusi']];

export function DetailKejadian({ o, jenis }) {
  const ada = (v) => v !== null && v !== undefined && v !== '';
  const arus = ['arus_r', 'arus_s', 'arus_t', 'arus_n'];
  const koord = o.koordinat || o.koordinat_temuan;
  return (
    <div className="ggn-detail">
      {jenis !== 'pickup' && arus.some((k) => ada(o[k])) && (
        <div className="ggn-arus" aria-label="Arus gangguan">
          {arus.map((k) => <span key={k} className={'ggn-arus-' + k.slice(-1)}><small>{k.slice(-1).toUpperCase()}</small><b>{ada(o[k]) ? angka(o[k]) : '-'}</b></span>)}
        </div>
      )}
      <dl className="ggn-dl">
        {BARIS_DETAIL[jenis].filter(([, k]) => ada(o[k])).map(([l, k, f]) => <div key={k}><dt>{l}</dt><dd>{f ? f(o[k]) : o[k]}</dd></div>)}
      </dl>
      {jenis === 'penyulang' && Array.isArray(o.nyala_bertahap) && o.nyala_bertahap.length > 0 && (
        <>
          <h3 className="ggn-sub">Penormalan bertahap</h3>
          <ol className="ggn-tahap">
            {o.nyala_bertahap.map((t) => (
              <li key={t.tahap}><b>Tahap {t.tahap}{t.jam ? ' · ' + t.jam : ''}</b>
                <span>{[ada(t.gardu) && t.gardu + ' gardu', ada(t.pelanggan) && angka(t.pelanggan) + ' pelanggan'].filter(Boolean).join(' · ')}</span>
                {t.daerah && <small>{t.daerah}</small>}
              </li>
            ))}
            {o.masih_padam && <li className="ggn-tahap--padam"><b>Masih padam</b><span>{[ada(o.masih_padam.gardu) && o.masih_padam.gardu + ' gardu', ada(o.masih_padam.pelanggan) && angka(o.masih_padam.pelanggan) + ' pelanggan'].filter(Boolean).join(' · ')}</span>{o.masih_padam.daerah && <small>{o.masih_padam.daerah}</small>}</li>}
          </ol>
        </>
      )}
      {jenis === 'pickup' && FOTO_PICKUP.some(([k]) => o[k]) && (
        <div className="ggn-foto">
          {FOTO_PICKUP.filter(([k]) => o[k]).map(([k, l]) => (
            <a key={k} href={o[k]} target="_blank" rel="noopener noreferrer" className="k-tombol k-tombol--garis"><Ikon nama="mata" ukuran={15} />Foto {l}</a>
          ))}
        </div>
      )}
      {koord && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(koord) && (
        <a className="k-tombol k-tombol--garis ggn-peta" href={'https://www.google.com/maps?q=' + encodeURIComponent(koord)} target="_blank" rel="noopener noreferrer">
          <Ikon nama="lokasi" ukuran={15} />Buka lokasi di peta
        </a>
      )}
    </div>
  );
}
