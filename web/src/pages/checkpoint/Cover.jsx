import { useMemo, useState } from 'react';

import Dialog from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import {
  kebutuhanCover, KOMPONEN_COVER, nilaiCover, perSectionCover, ringkasCover,
} from '../../coverGardu.js';
import { cocokCp } from '../../checkpoint.js';
import { angka } from '../historiGangguan/bantu.js';

/**
 * v1.0.51 sub-tab "Cover Gardu" menu Checkpoint (port v1 Data Checkpoint > Cover Gardu). gardu = getCheckpoint bagian cover,
 * saring = filter halaman { penyulang, section } (section pangkal). Kartu Full / Belum Full Cover (seluruh dan tanpa BTS),
 * klik angka = rincian gardu per Section; Belum Full Cover berkolom per komponen + Jumlah Keperluan Material + komulatif.
 */
export function TabCover({ gardu: mentah, saring }) {
  const [buka, setBuka] = useState(null);   // { judul, gardu, belum }
  const gardu = useMemo(() => nilaiCover(mentah), [mentah]);
  const tersaring = useMemo(() => gardu.filter((g) => cocokCp(g.penyulang, g.section, saring)), [gardu, saring]);
  const r = useMemo(() => ringkasCover(tersaring), [tersaring]);

  const angkaTombol = (n, judul, daftarGardu, belum) => (n
    ? <button type="button" className="ggn-cover-angka" onClick={() => setBuka({ judul, gardu: daftarGardu, belum })}>{angka(n)}</button>
    : <span className="ggn-cover-nol">0</span>);
  const tanpa = (a) => a.filter((g) => !g.bts);
  const persen = (n) => (r.total ? Math.round((n / r.total) * 100) : 0);
  const pFull = persen(r.full.gardu.length);

  return (
    <section aria-label="Cover gardu">
      <div className="ggn-jenis">
        <div className="ggn-jenis-kartu ggn-w--biru ggn-cover-kartu">
          <span className="ggn-jenis-ikon"><Ikon nama="perisai" ukuran={20} /></span>
          <small>Total Gardu</small><b>{angka(r.total)}</b><em>Tanpa BTS: {angka(r.totalTanpaBts)}</em>
        </div>
        <button type="button" className="ggn-jenis-kartu ggn-w--hijau" onClick={() => setBuka({ judul: 'Gardu Sudah Full Cover', gardu: r.full.gardu, belum: false })}>
          <span className="ggn-jenis-ikon"><Ikon nama="centangLingkaran" ukuran={20} /></span>
          <small>Full Cover</small><b>{angka(r.full.gardu.length)} <i>{pFull}%</i></b><em>Tanpa BTS: {angka(r.full.tanpaBts)}</em>
        </button>
        <button type="button" className="ggn-jenis-kartu ggn-w--merah" onClick={() => setBuka({ judul: 'Gardu Belum Full Cover', gardu: r.belum.gardu, belum: true })}>
          <span className="ggn-jenis-ikon"><Ikon nama="peringatan" ukuran={20} /></span>
          <small>Belum Full Cover</small><b>{angka(r.belum.gardu.length)} <i>{r.total ? 100 - pFull : 0}%</i></b><em>Tanpa BTS: {angka(r.belum.tanpaBts)}</em>
        </button>
      </div>

      <div className="ggn-cover-progres" role="img" aria-label={`${pFull}% gardu sudah full cover`}>
        <div className="ggn-cover-progres-kepala"><b>Capaian Full Cover</b><span>{pFull}%</span></div>
        <div className="ggn-cover-bar"><i style={{ width: pFull + '%' }} /></div>
      </div>

      <div className="ggn-ringkas">
        <div className="ggn-panel">
          <h2>Jumlah Gardu Full Cover dan Belum Full Cover</h2>
          <table className="ggn-tabel ggn-cover-tabel">
            <thead><tr><th>Status</th><th>Seluruh</th><th>Tanpa BTS</th></tr></thead>
            <tbody>
              {[['Full Cover', 'hijau', r.full, 'Gardu Sudah Full Cover', false], ['Belum Full Cover', 'merah', r.belum, 'Gardu Belum Full Cover', true]].map(([label, w, b, judul, belum]) => (
                <tr key={label}>
                  <th><span className={'ggn-cover-titik ggn-w--' + w} />{label}</th>
                  <td>{angkaTombol(b.gardu.length, judul, b.gardu, belum)}</td>
                  <td>{angkaTombol(b.tanpaBts, judul + ' — Tanpa BTS', tanpa(b.gardu), belum)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th>Total Gardu</th><td>{angka(r.total)}</td><td>{angka(r.totalTanpaBts)}</td></tr></tfoot>
          </table>
        </div>
        <div className="ggn-panel">
          <h2>Kelengkapan per Komponen Cover</h2>
          <ul className="ggn-cover-komp">
            {r.komponen.map((k, i) => {
              const p = r.total ? Math.round((k.lengkap / r.total) * 100) : 0;
              return (
                <li key={k.label}>
                  <span className="ggn-cover-komp-nama">{k.label}</span>
                  <span className="ggn-cover-bar ggn-cover-bar--kecil"><i style={{ width: p + '%' }} /></span>
                  <span className="ggn-cover-komp-p">{p}%</span>
                  <span className="ggn-cover-komp-belum" title="Belum lengkap (klik untuk rincian)">
                    {angkaTombol(k.belum, k.label + ' — Belum Lengkap', tersaring.filter((g) => g.kurang.includes(i)), true)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="ggn-cover-ket">Bar hijau = persentase lengkap. Angka merah = gardu belum lengkap, klik untuk rincian.</p>
        </div>
      </div>

      <Dialog buka={!!buka} judul={buka ? `${buka.judul} (${buka.gardu.length} Gardu)` : ''} onTutup={() => setBuka(null)} lebar="min(1200px, 96vw)">
        {buka && <RincianCover gardu={buka.gardu} belum={buka.belum} />}
        <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={() => setBuka(null)}>Tutup</button></div>
      </Dialog>
    </section>
  );
}

const v = (x) => (x && String(x).trim() ? x : '-');

/** Rincian pop-up: per Section. Belum Full Cover = kolom per komponen (belum lengkap ditandai merah) + jumlah keperluan material. */
function RincianCover({ gardu, belum }) {
  const kebutuhan = belum ? kebutuhanCover(gardu).filter((x) => x.jumlah) : [];
  return (
    <div className="ggn-cover-rincian">
      <div className="ggn-tabel-gulir">
        <table className="ggn-tabel ggn-cover-tabel ggn-cover-rinci">
          <thead>
            <tr><th>No</th><th>Nomor Gardu</th>{belum ? <th>Alamat</th> : <><th>Penyulang</th><th>Section</th><th>Alamat</th></>}
              {belum && KOMPONEN_COVER.map((c) => <th key={c.label}>{c.label}</th>)}</tr>
          </thead>
          {perSectionCover(gardu).map(({ section, gardu: daftar }) => (
            <tbody key={section}>
              <tr className="ggn-cover-sec"><td colSpan={belum ? 3 + KOMPONEN_COVER.length : 5}>Section: {section} ({daftar.length} gardu)</td></tr>
              {daftar.map((g, i) => (
                <tr key={g.no}>
                  <td>{i + 1}</td><th>{g.no}</th>
                  {belum ? <td className="ggn-cover-kiri">{v(g.alamat)}</td> : <><td className="ggn-cover-kiri">{v(g.penyulang)}</td><td className="ggn-cover-kiri">{v(g.section)}</td><td className="ggn-cover-kiri">{v(g.alamat)}</td></>}
                  {belum && KOMPONEN_COVER.map((c, k) => (
                    <td key={c.label}>{g.kurang.includes(k) ? <span className="ggn-cover-kurang">{v(g.nilai[k])}</span> : v(g.nilai[k])}</td>
                  ))}
                </tr>
              ))}
              {belum && (
                <tr className="ggn-cover-jumlah">
                  <td colSpan={3}>Jumlah Keperluan Material</td>
                  {kebutuhanCover(daftar).map((x) => <td key={x.label}>{x.jumlah || '-'}</td>)}
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
      {kebutuhan.length > 0 && (
        <>
          <h3 className="ggn-daftar-judul">Komulatif Kebutuhan Material</h3>
          <div className="ggn-tabel-gulir">
            <table className="ggn-tabel"><thead><tr><th>Komponen Cover</th><th>Jumlah Gardu</th></tr></thead>
              <tbody>{kebutuhan.map((x) => <tr key={x.label}><th>{x.label}</th><td>{x.jumlah}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
