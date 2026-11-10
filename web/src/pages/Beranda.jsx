import { useMemo } from 'react';
import Ikon from '../components/Ikon.jsx';
import MotifJaringan from '../components/MotifJaringan.jsx';
import SisiLoader from '../components/SisiLoader.jsx';

const LABEL_ROLE = { ADMIN: 'Admin', ADMIN_ES: 'Admin ES', SUPER: 'Super Admin' };

function Tile({ m, onPilih }) {
  return (
    <button type="button" className="brd-tile" onClick={() => onPilih(m.halaman)}>
      <span className="brd-tile-ikon"><Ikon nama={m.ikon} ukuran={22} /></span>
      <span className="brd-tile-isi"><b>{m.nama}</b><small>{m.desc}</small></span>
    </button>
  );
}

/**
 * Halaman Beranda website: sambutan, menu yang sedang dibuka (rel menu atas), semua menu per feeder, dan menu yang segera hadir.
 * feeder = [{ grup, no, menu }] (menu siap saja); rel = kode menu yang dibuka; segera = menu tanpa halaman.
 */
export default function Beranda({ sesi, feeder, rel, segera, onPilih }) {
  const p = sesi.profil || {};
  const role = LABEL_ROLE[p.role] || p.role || '';
  const semua = useMemo(() => feeder.flatMap((g) => g.menu), [feeder]);
  const dari = (kodeKode) => kodeKode.map((k) => semua.find((m) => m.kode === k)).filter(Boolean);
  const dibuka = dari(rel);

  return (
    <div className="brd">
      <section className="brd-hero">
        <MotifJaringan animasi={false} className="brd-motif" />
        <div className="brd-kicker"><span className="brd-percik" />SELAMAT DATANG</div>
        <h1>{p.nama || p.username}</h1>
        <p>{role}{p.timNama ? ' · ' + p.timNama : ''} · PLN ULP Toboali</p>
      </section>

      {semua.length > 0 ? (
        <>
          {dibuka.length > 0 && (
            <section className="brd-kartu">
              <h2><span className="brd-percik brd-percik--gelap" />Sedang dibuka</h2>
              <div className="brd-grid">{dibuka.map((m) => <Tile key={m.kode} m={m} onPilih={onPilih} />)}</div>
            </section>
          )}
          {feeder.map((g) => (
            <section key={g.grup} className="brd-kartu">
              <h2><code className="brd-feeder">FEEDER {g.no}</code>{g.grup}<span className="brd-jumlah">{g.menu.length}</span></h2>
              <div className="brd-grid">{g.menu.map((m) => <Tile key={m.kode} m={m} onPilih={onPilih} />)}</div>
            </section>
          ))}
        </>
      ) : (
        <section className="brd-kartu">
          <h2><span className="brd-percik brd-percik--gelap" />Menu admin</h2>
          <div className="brd-kosong">
            <SisiLoader ukuran={44} diam label="SiSi" />
            <div>
              <b>Belum ada menu admin di website</b>
              <p>Login website sudah berjalan. Fitur admin dipindahkan dari aplikasi HP secara bertahap.</p>
            </div>
          </div>
        </section>
      )}

      {segera.length > 0 && (
        <section className="brd-kartu">
          <h2><span className="brd-percik brd-percik--gelap" />Segera hadir di website</h2>
          <p className="brd-catatan">Sudah ada di aplikasi HP, halaman websitenya belum dibuat.</p>
          <div className="brd-segera">{segera.map((m) => <span key={m.kode} title={m.desc}>{m.nama}</span>)}</div>
        </section>
      )}
    </div>
  );
}
