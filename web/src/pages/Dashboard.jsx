import { useCallback, useMemo, useRef, useState } from 'react';

import { panggil } from '../api.js';
import { SESI_HABIS } from '../pesan.js';
import Ikon from '../components/Ikon.jsx';
import Sidebar from '../components/Sidebar.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { menuPerGrup } from '../katalog.js';
import Beranda from './Beranda.jsx';
import LaporanUp3Uiw from './LaporanUp3Uiw.jsx';
import JadwalPadam from './JadwalPadam.jsx';
import ApprovalP0 from './ApprovalP0.jsx';
import BeritaAcara from './BeritaAcara.jsx';
import PengukuranGardu from './PengukuranGardu.jsx';
import './dashboard.css';

const LABEL_ROLE = { ADMIN: 'Admin', ADMIN_ES: 'Admin ES', SUPER: 'Super Admin' };

/**
 * Dashboard website admin (v1.0.34): sidebar kiri yang bisa dilipat + header atas + area isi.
 * Routing state di sini (halaman aktif). Menu dari KatalogOperasi mobile (urutan sama).
 * Halaman memanggil backend lewat api(action, data, { batasMs }) (token terpasang; sesi habis = kembali ke login),
 * dan menandai isian belum disimpan lewat penjaga.current = true (pindah halaman / keluar minta konfirmasi).
 */
export default function Dashboard({ sesi, env, config, onKeluar, onSesiHabis }) {
  const [keluar, setKeluar] = useState(false);
  const [halaman, setHalaman] = useState(''); // '' = beranda
  const [lipat, setLipat] = useState(false);
  const penjaga = useRef(false);

  const p = sesi.profil || {};
  const role = LABEL_ROLE[p.role] || p.role || '';
  const grupMenu = useMemo(() => menuPerGrup(sesi), [sesi]);

  const api = useCallback(async (action, data, opsi = {}) => {
    try {
      return await panggil(config.apiUrl, action, { token: sesi.token, data, ...opsi });
    } catch (e) {
      if (e && SESI_HABIS.has(e.kode)) onSesiHabis(e.kode);
      throw e;
    }
  }, [config.apiUrl, sesi.token, onSesiHabis]);

  const bolehTinggal = () => !penjaga.current || window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?');

  const pindah = (h) => {
    if (h === halaman || !bolehTinggal()) return;
    penjaga.current = false;
    setHalaman(h);
  };

  const klikKeluar = async () => {
    if (keluar || !bolehTinggal()) return;
    setKeluar(true);
    await onKeluar();
  };

  const props = { sesi, config, api, penjaga };
  const konten = (() => {
    switch (halaman) {
      case 'laporan-up3': return <LaporanUp3Uiw key="UP3" {...props} bagian="UP3" />;
      case 'laporan-uiw': return <LaporanUp3Uiw key="UIW" {...props} bagian="UIW" />;
      case 'jadwal-padam': return <JadwalPadam {...props} />;
      case 'approval-p0': return <ApprovalP0 {...props} />;
      case 'berita-acara': return <BeritaAcara {...props} />;
      case 'ukur-gardu': return <PengukuranGardu {...props} />;
      default: return <Beranda sesi={sesi} grupMenu={grupMenu} onPilih={pindah} />;
    }
  })();

  return (
    <div className="db">
      <header className="db-bar">
        <div className="db-merek">
          <button type="button" className="db-menu-tombol" onClick={() => setLipat(!lipat)} aria-label="Lipat/buka sidebar">
            <Ikon nama="menu" ukuran={20} />
          </button>
          <span className="db-logo"><img src="./img/logo-sisi.png" alt="" /></span>
          <button type="button" className="db-judul" onClick={() => pindah('')}>
            SiSi<small>PANEL ADMIN</small>
          </button>
          {env === 'staging' && <span className="db-stg">STAGING</span>}
        </div>
        <div className="db-akun">
          <span className="db-avatar" aria-hidden="true">{(p.nama || p.username || '?').trim().charAt(0).toUpperCase()}</span>
          <span className="db-nama"><b>{p.nama || p.username}</b><small>{p.username} · {role}</small></span>
          <button type="button" className="db-keluar" onClick={klikKeluar} disabled={keluar}>
            {keluar ? <SisiLoader ukuran={16} warna="#fff" label="Keluar" /> : <Ikon nama="keluar" ukuran={17} />}
            Keluar
          </button>
        </div>
      </header>

      <div className="db-badan">
        <Sidebar grupMenu={grupMenu} halamanAktif={halaman} onPilih={pindah} lipat={lipat} onLipat={() => setLipat(!lipat)} />
        <main className="db-isi">{konten}</main>
      </div>

      <footer className="db-kaki">Sistem Integrasi © 2026 · PLN ULP Toboali{sesi.versi ? ' · server v' + sesi.versi : ''}</footer>
    </div>
  );
}
