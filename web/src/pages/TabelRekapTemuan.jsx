import { properNama } from '../checkpoint.js';
import { TIER_BELUM } from '../petaTemuan.js';

const kelasTier = (t) => (t === 'Tier 1' ? '1' : t === 'Tier 2' ? '2' : t === TIER_BELUM ? 'x' : 'lain');

/**
 * v1.0.51 tampilan rekap jenis temuan (hasil rekapJenisTemuan), dipakai tab Rincian Jenis Temuan (Temuan Inspeksi) dan sub-tab
 * Rekap Temuan Inspeksi (Checkpoint).
 * Review 8 Nov 2026 (desain ulang): ringkasan satu kartu (volume total + batang proporsi tier + jumlah jenis / section /
 * penyulang); tabel berkepala dua tingkat (penyulang -> section) supaya section tiap penyulang berdampingan; baris
 * dikelompokkan per tier dengan subtotal; sel diberi warna menurut nilai (makin pekat = makin banyak). Kolom No + Temuan dan
 * kepala tabel menempel saat digulir.
 */
export default function TabelRekapTemuan({ r }) {
  const totalKolom = (k) => r.rows.reduce((n, x) => n + (x.perKolom[k] || 0), 0);
  const pekat = (n) => (r.maks ? Math.round(10 + (n / r.maks) * 45) : 0);
  return (
    <>
      <section className="prt-ringkas" aria-label="Ringkasan temuan">
        <div className="prt-ringkas-utama">
          <small>Volume total</small>
          <b>{r.total}</b>
        </div>
        <div className="prt-ringkas-tier">
          {r.total > 0 && (
            <div className="prt-tier-batang" aria-hidden="true">
              {r.perTier.map((t) => <i key={t.tier} className={'prt-tier--' + kelasTier(t.tier)} style={{ flexGrow: t.volume }} title={t.tier + ': ' + t.volume} />)}
            </div>
          )}
          <ul>
            {r.perTier.map((t) => (
              <li key={t.tier}><i className={'prt-tier--' + kelasTier(t.tier)} />{t.tier}<b>{t.volume}</b><small>{t.jenis} jenis</small></li>
            ))}
          </ul>
        </div>
        <dl className="prt-ringkas-info">
          <div><dt>Jenis temuan</dt><dd>{r.rows.length}</dd></div>
          <div><dt>Section</dt><dd>{r.kolom.length}</dd></div>
          <div><dt>Penyulang</dt><dd>{r.grupPenyulang.length}</dd></div>
        </dl>
      </section>
      {r.rows.length === 0 ? <p className="k-kosong">Tidak ada temuan pada rentang dan filter ini.</p> : (
        <div className="pt-rekap">
          <div className="pt-rekap-gulir">
            <table className="pt-rekap-tabel prt-tabel">
              <thead>
                <tr className="prt-k1">
                  <th rowSpan={2} className="pt-rekap-no">No</th>
                  <th rowSpan={2} className="pt-rekap-nama">Temuan</th>
                  <th rowSpan={2}>Satuan</th>
                  <th rowSpan={2}>Volume</th>
                  {r.grupPenyulang.map((g) => (
                    <th key={g.penyulang} colSpan={g.jumlahKolom} className="prt-peny" scope="colgroup">
                      {properNama(g.penyulang)}<small>{g.total}</small>
                    </th>
                  ))}
                </tr>
                <tr className="prt-k2">
                  {r.kolom.map((c, i) => (
                    <th key={c.kunci} scope="col" className={'prt-sec' + (i === 0 || r.kolom[i - 1].penyulang.toLowerCase() !== c.penyulang.toLowerCase() ? ' prt-awal' : '')} title={c.section}>
                      {c.section || '-'}
                    </th>
                  ))}
                </tr>
              </thead>
              {r.perTier.map((t) => {
                const isi = r.rows.filter((x) => x.tier === t.tier);
                const awal = r.rows.indexOf(isi[0]);
                return (
                  <tbody key={t.tier}>
                    <tr className="prt-grup">
                      <th colSpan={4} className="prt-grup-judul" scope="rowgroup">
                        <span className={'pt-tier pt-tier--' + kelasTier(t.tier)}>{t.tier}</span>
                        <small>{t.jenis} jenis · volume {t.volume}</small>
                      </th>
                      <td colSpan={Math.max(1, r.kolom.length)} />
                    </tr>
                    {isi.map((x, i) => (
                      <tr key={x.jenisTemuan}>
                        <td className="pt-rekap-no">{awal + i + 1}</td>
                        <th className="pt-rekap-nama" scope="row">{x.jenisTemuan}</th>
                        <td className="pt-rekap-sat">{x.satuan}</td>
                        <td><b className="pt-rekap-vol">{x.volume}</b></td>
                        {r.kolom.map((c, j) => {
                          const n = x.perKolom[c.kunci] || 0;
                          return (
                            <td key={c.kunci} className={'prt-sel' + (j === 0 || r.kolom[j - 1].penyulang.toLowerCase() !== c.penyulang.toLowerCase() ? ' prt-awal' : '')}
                              style={n ? { '--pekat': pekat(n) + '%' } : undefined}>
                              {n ? <span className="pt-rekap-n">{n}</span> : <span className="pt-rekap-0">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot>
                <tr>
                  <td className="pt-rekap-no" /><th className="pt-rekap-nama" scope="row">Total</th><td /><td><b className="pt-rekap-vol">{r.total}</b></td>
                  {r.kolom.map((c, j) => (
                    <td key={c.kunci} className={j === 0 || r.kolom[j - 1].penyulang.toLowerCase() !== c.penyulang.toLowerCase() ? 'prt-awal' : undefined}><b>{totalKolom(c.kunci)}</b></td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
