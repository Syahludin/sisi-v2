import { useState } from 'react';
import Ikon from './Ikon.jsx';
import './sidebar.css';

/**
 * Sidebar navigasi website (v1.0.34): kiri, bisa collapse ke mode ikon-saja.
 * Mengikuti urutan KatalogOperasi mobile (menuPerGrup). Menu yang belum siap tampil "Segera".
 */
export default function Sidebar({ grupMenu, halamanAktif, onPilih, lipat, onLipat }) {
  return (
    <aside className={`sb ${lipat ? 'sb--lipat' : ''}`} aria-label="Navigasi">
      <button
        type="button"
        className="sb-tombol-lipat"
        onClick={onLipat}
        aria-label={lipat ? 'Buka sidebar' : 'Lipat sidebar'}
        title={lipat ? 'Buka' : 'Lipat'}
      >
        <Ikon nama={lipat ? 'kanan' : 'kiri'} ukuran={16} />
      </button>

      <nav className="sb-nav">
        {grupMenu.map((g) => (
          <div key={g.grup} className="sb-grup">
            {!lipat && <div className="sb-grup-judul">{g.grup}</div>}
            {g.menu.map((m) => {
              const aktif = halamanAktif === m.halaman;
              const siap = !!m.siap;
              return (
                <button
                  key={m.kode}
                  type="button"
                  className={`sb-item ${aktif ? 'sb-item--aktif' : ''} ${!siap ? 'sb-item--tidak-siap' : ''}`}
                  onClick={() => siap && onPilih(m.halaman)}
                  disabled={!siap}
                  title={lipat ? m.nama : (!siap ? 'Segera: ' + m.desc : m.desc)}
                >
                  <span className="sb-item-ikon"><Ikon nama={m.ikon} ukuran={lipat ? 20 : 18} /></span>
                  {!lipat && (
                    <>
                      <span className="sb-item-label">{m.nama}</span>
                      {!siap && <span className="sb-item-badge">Segera</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
