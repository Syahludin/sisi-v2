import { teksKm, warnaJenis } from '../../asetItb.js';

const teksKva = (v) => new Intl.NumberFormat('id-ID').format(v);

/**
 * Kartu satu penyulang: total km, batang bertumpuk komposisi jenis kabel (warna per jenis), angka per jenis. Klik = rincian.
 * gardu = gardu aktif penyulang itu ([{ no, kva }]); klik jumlah gardu = rincian gardu (onGardu).
 */
export function KartuPenyulang({ k, gardu, onBuka, onGardu }) {
  const ringkas = k.perJenis.map((x) => `${x.jenis} ${teksKm(x.km)}`).join(', ');
  const nGardu = gardu.length;
  const totalKva = gardu.reduce((n, g) => n + g.kva, 0);
  return (
    <div className="das-kartu">
      <button type="button" className="das-kartu-isi" onClick={onBuka} aria-label={`${k.nama}: ${teksKm(k.total)} kmS, lihat rincian`}>
        <span className="das-kartu-kepala"><b>{k.nama}</b><strong>{teksKm(k.total)}<i> kmS</i></strong></span>
        <span className="das-tumpuk" role="img" aria-label={ringkas}>
          {k.perJenis.map((x) => <span key={x.jenis} className={'das-' + warnaJenis(x.jenis)} style={{ flexGrow: x.km }} title={`${x.jenis}: ${teksKm(x.km)} kmS`} />)}
        </span>
        <span className="das-legenda">
          {k.perJenis.map((x) => <span key={x.jenis}><i className={'das-' + warnaJenis(x.jenis)} />{x.jenis}<b>{teksKm(x.km)}</b></span>)}
        </span>
        {k.nonaktif > 0 && <small className="das-nonaktif">Non-aktif {teksKm(k.nonaktif)} kmS</small>}
      </button>
      {nGardu > 0
        ? <button type="button" className="das-gardu" onClick={onGardu} aria-label={`${k.nama}: ${nGardu} gardu, ${teksKva(totalKva)} kVA, lihat daftar gardu`}><b>{nGardu}</b> gardu · {teksKva(totalKva)} kVA</button>
        : <span className="das-gardu das-gardu--kosong">0 gardu</span>}
    </div>
  );
}
