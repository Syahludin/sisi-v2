import { useEffect, useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import { rincianPenyulang, teksKm, warnaJenis } from '../../asetItb.js';

const SUMBER = { GARDU: 'gardu', SECTION: 'section', UJUNG: 'ujung section', MANUAL: 'manual', BELUM: 'belum' };
const operasi = (s) => String(s.status).toUpperCase() === 'OPERATING';
const jumlah = (daftar) => daftar.reduce((n, s) => n + s.panjang, 0);
const bulat = (v) => Math.round(v * 1000) / 1000;

/**
 * Rincian satu penyulang (klik kartu): ringkasan, tabel panjang jenis kabel x ukuran (dengan total baris dan kolom), lalu daftar
 * segmen yang bisa disaring per jenis kabel dan dicari. rincian = { tab, kunci, nama } | null.
 */
export function Rincian({ segmen, rincian, onTutup }) {
  const r = useMemo(() => (rincian ? rincianPenyulang(segmen, rincian.tab, rincian.kunci) : null), [segmen, rincian]);
  const [jenis, setJenis] = useState('');
  const [cari, setCari] = useState('');
  useEffect(() => { setJenis(''); setCari(''); }, [rincian]);

  const ringkas = useMemo(() => {
    if (!r) return null;
    const aktif = r.segmen.filter(operasi), non = r.segmen.filter((s) => !operasi(s));
    return { total: bulat(jumlah(aktif)), nAktif: aktif.length, non: bulat(jumlah(non)), nNon: non.length };
  }, [r]);
  const jenisAda = useMemo(() => (r ? r.matriks.map((m) => m.jenis) : []), [r]);
  const tampil = useMemo(() => {
    if (!r) return [];
    const k = cari.trim().toUpperCase();
    return r.segmen.filter((s) => (!jenis || s.jenis === jenis) && (!k || String(s.desc).toUpperCase().includes(k)));
  }, [r, jenis, cari]);

  const lapangan = rincian?.tab === 'lapangan';
  const sub = !rincian ? '' : lapangan ? 'Berdasarkan Lapangan (nomor gardu / section di DESCRIPTION)' : 'Berdasarkan EAM (CXPENYULANG ' + rincian.kunci + ')';
  return (
    <Dialog buka={!!rincian} judul={rincian ? rincian.nama : ''} sub={sub} onTutup={onTutup} lebar="min(980px, 96vw)">
      {r && ringkas && (
        <div className="das-rinc">
          <div className="das-rinc-kpi">
            <div><small>Total panjang</small><b>{teksKm(ringkas.total)}<i> kmS</i></b><span>{ringkas.nAktif} segmen operasi</span></div>
            <div className={ringkas.nNon ? 'das-rinc-kpi--merah' : ''}><small>Non-aktif</small><b>{teksKm(ringkas.non)}<i> kmS</i></b><span>{ringkas.nNon} segmen</span></div>
            <div><small>Jenis kabel</small><b>{jenisAda.length}</b><span>{r.ukuran.length} ukuran ({r.ukuran.join(', ')} mm²)</span></div>
          </div>

          <h3 className="das-sub">Panjang per jenis kabel dan ukuran (kmS)</h3>
          <div className="das-gulir">
            <table className="das-tabel das-tabel--angka das-matriks">
              <thead><tr><th>Jenis kabel</th>{r.ukuran.map((u) => <th key={u}>{u} mm²</th>)}<th>Total</th></tr></thead>
              <tbody>
                {r.matriks.map((m) => (
                  <tr key={m.jenis}>
                    <th><i className={'das-titik das-' + warnaJenis(m.jenis)} />{m.jenis}</th>
                    {r.ukuran.map((u) => <td key={u} className={m.km[u] ? '' : 'das-kosong'}>{m.km[u] ? teksKm(m.km[u]) : '-'}</td>)}
                    <td className="das-total">{teksKm(Object.values(m.km).reduce((n, v) => n + v, 0))}</td>
                  </tr>
                ))}
              </tbody>
              {r.matriks.length > 1 && (
                <tfoot>
                  <tr>
                    <th>Total</th>
                    {r.ukuran.map((u) => <td key={u}>{teksKm(r.matriks.reduce((n, m) => n + (m.km[u] || 0), 0))}</td>)}
                    <td className="das-total">{teksKm(ringkas.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <h3 className="das-sub">Segmen <small>{tampil.length === r.segmen.length ? r.segmen.length : `${tampil.length} dari ${r.segmen.length}`} · {teksKm(jumlah(tampil))} kmS</small></h3>
          <div className="das-saring">
            <div className="das-filter" role="group" aria-label="Jenis kabel">
              <button type="button" className={'das-pil' + (jenis === '' ? ' aktif' : '')} onClick={() => setJenis('')}>Semua</button>
              {jenisAda.map((j) => (
                <button key={j} type="button" className={'das-pil' + (jenis === j ? ' aktif' : '')} onClick={() => setJenis(j)}><i className={'das-' + warnaJenis(j)} />{j}</button>
              ))}
            </div>
            <input className="k-input das-cari" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari segmen (mis. PY0088)" aria-label="Cari segmen" />
          </div>
          <div className="das-gulir das-gulir--tinggi">
            <table className="das-tabel das-daftar">
              <thead><tr><th>Segmen</th><th>Jenis kabel</th><th>Ukuran</th><th className="das-km">kmS</th>{lapangan && <th>Dipetakan lewat</th>}<th>Status</th></tr></thead>
              <tbody>
                {tampil.map((s) => (
                  <tr key={s.id} className={operasi(s) ? '' : 'das-redup'}>
                    <th className="das-desc">{s.desc}</th>
                    <td><i className={'das-titik das-' + warnaJenis(s.jenis)} />{s.jenis}</td>
                    <td>{s.ukuran} mm²</td>
                    <td className="das-km">{teksKm(s.panjang)}</td>
                    {lapangan && <td>{SUMBER[s.sumber] || s.sumber}{s.gardu ? ' · ' + s.gardu : ''}</td>}
                    <td>{operasi(s) ? <span className="das-lencana das-lencana--ok">Operasi</span> : <span className="das-lencana das-lencana--non">{s.status}</span>}</td>
                  </tr>
                ))}
                {!tampil.length && <tr><td colSpan={lapangan ? 6 : 5} className="das-kosong das-tengah">Tidak ada segmen yang cocok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={onTutup}>Tutup</button></div>
    </Dialog>
  );
}
