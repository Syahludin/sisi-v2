import Ikon from '../components/Ikon.jsx';
import MotifJaringan from '../components/MotifJaringan.jsx';
import SisiLoader from '../components/SisiLoader.jsx';

const LABEL_ROLE = { ADMIN: 'Admin', ADMIN_ES: 'Admin ES', SUPER: 'Super Admin' };

/**
 * Halaman Beranda website: kartu sambutan + grid akses cepat ke menu yang siap.
 */
export default function Beranda({ sesi, grupMenu, onPilih }) {
  const p = sesi.profil || {};
  const role = LABEL_ROLE[p.role] || p.role || '';
  const menuSiap = grupMenu.flatMap((g) => g.menu).filter((m) => m.siap);

  return (
    <div className="brd">
      <section className="brd-hero">
        <MotifJaringan animasi={false} className="brd-motif" />
        <div className="brd-kicker"><span className="brd-percik" />SELAMAT DATANG</div>
        <h1>{p.nama || p.username}</h1>
        <p>{role}{p.timNama ? ' · ' + p.timNama : ''} · PLN ULP Toboali</p>
      </section>

      {menuSiap.length > 0 ? (
        <section className="brd-kartu">
          <h2><span className="brd-percik brd-percik--gelap" />Akses cepat</h2>
          <div className="brd-grid">
            {menuSiap.map((m) => (
              <button key={m.kode} type="button" className="brd-tile" onClick={() => onPilih(m.halaman)}>
                <span className="brd-tile-ikon"><Ikon nama={m.ikon} ukuran={22} /></span>
                <span className="brd-tile-isi">
                  <b>{m.nama}</b>
                  <small>{m.desc}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
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
    </div>
  );
}
