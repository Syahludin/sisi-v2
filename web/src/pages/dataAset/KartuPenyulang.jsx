import { teksKm, warnaJenis } from '../../asetItb.js';

/** Kartu satu penyulang: total km, batang bertumpuk komposisi jenis kabel (warna per jenis), angka per jenis. Klik = rincian. */
export function KartuPenyulang({ k, onBuka }) {
  const ringkas = k.perJenis.map((x) => `${x.jenis} ${teksKm(x.km)}`).join(', ');
  return (
    <button type="button" className="das-kartu" onClick={onBuka} aria-label={`${k.nama}: ${teksKm(k.total)} kmS, lihat rincian`}>
      <span className="das-kartu-kepala"><b>{k.nama}</b><strong>{teksKm(k.total)}<i> kmS</i></strong></span>
      <span className="das-tumpuk" role="img" aria-label={ringkas}>
        {k.perJenis.map((x) => <span key={x.jenis} className={'das-' + warnaJenis(x.jenis)} style={{ flexGrow: x.km }} title={`${x.jenis}: ${teksKm(x.km)} kmS`} />)}
      </span>
      <span className="das-legenda">
        {k.perJenis.map((x) => <span key={x.jenis}><i className={'das-' + warnaJenis(x.jenis)} />{x.jenis}<b>{teksKm(x.km)}</b></span>)}
      </span>
      {k.nonaktif > 0 && <small className="das-nonaktif">Non-aktif {teksKm(k.nonaktif)} kmS</small>}
    </button>
  );
}
