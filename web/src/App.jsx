import { useCallback, useEffect, useMemo, useState } from 'react';

import { panggil } from './api.js';
import { bacaConfig } from './config.js';
import { pesan, SESI_HABIS } from './pesan.js';
import { bacaSesi, hapusSesi, KUNCI_SESI, simpanSesi } from './sesi.js';
import Ikon from './components/Ikon.jsx';
import SisiLoader from './components/SisiLoader.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';

/**
 * Alur: sesi tersimpan = cekSesi dulu (token dicek + diperpanjang server) -> dashboard; sesi habis / bukan admin =
 * login dengan pesan; server tidak terjangkau = layar "putus" (coba lagi / keluar). Logout di satu tab = semua tab keluar.
 */
export default function App() {
  const config = useMemo(() => bacaConfig(), []);
  const [sesi, setSesi] = useState(() => bacaSesi(config.env));
  const [tahap, setTahap] = useState(() => (bacaSesi(config.env) ? 'cek' : 'login'));
  const [pesanLogin, setPesanLogin] = useState('');

  const keLogin = useCallback((teks = '') => {
    hapusSesi();
    setSesi(null);
    setPesanLogin(teks);
    setTahap('login');
  }, []);

  const periksa = useCallback(async () => {
    const s = bacaSesi(config.env);
    if (!s) { keLogin(); return; }
    setTahap('cek');
    try {
      const j = await panggil(config.apiUrl, 'cekSesi', { token: s.token });
      const segar = { ...s, profil: j.data.profil, menu: j.data.menu || [], versi: j.versi || s.versi || '' };
      simpanSesi(segar);
      setSesi(segar);
      setTahap('masuk');
    } catch (e) {
      const kode = (e && e.kode) || 'JARINGAN';
      if (SESI_HABIS.has(kode) || kode === 'AKSES_DITOLAK') keLogin(pesan(kode));
      else { setPesanLogin(pesan(kode)); setTahap('putus'); }
    }
  }, [config, keLogin]);

  // hanya saat halaman dibuka
  useEffect(() => {
    if (tahap === 'cek') periksa();
  }, []);

  // keluar di tab lain = tab ini ikut ke login
  useEffect(() => {
    const dengar = (e) => { if (e.key === KUNCI_SESI && !e.newValue) keLogin(); };
    window.addEventListener('storage', dengar);
    return () => window.removeEventListener('storage', dengar);
  }, [keLogin]);

  const keluar = useCallback(async () => {
    const s = bacaSesi(config.env);
    if (s) {
      try { await panggil(config.apiUrl, 'logout', { token: s.token }); } catch { /* token tetap dihapus di browser */ }
    }
    keLogin();
  }, [config, keLogin]);

  if (tahap === 'masuk' && sesi) {
    return <Dashboard sesi={sesi} env={config.env} config={config} onKeluar={keluar} onSesiHabis={(kode) => keLogin(pesan(kode))} />;
  }

  if (tahap === 'cek' || tahap === 'putus') {
    return (
      <div className="layar-tengah">
        {tahap === 'cek' ? (
          <><SisiLoader ukuran={56} warna="#fff" kepala="var(--accent-400)" label="Memeriksa sesi" /><p>Memeriksa sesi...</p></>
        ) : (
          <div className="layar-putus" role="alert">
            <Ikon nama="peringatan" ukuran={34} />
            <p>{pesanLogin}</p>
            <div className="layar-aksi">
              <button type="button" className="tombol-kuning" onClick={periksa}><Ikon nama="ulang" ukuran={18} />Coba lagi</button>
              <button type="button" className="tombol-garis" onClick={keluar}><Ikon nama="keluar" ukuran={18} />Keluar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Login
      key={pesanLogin}
      config={config}
      pesanAwal={pesanLogin}
      onMasuk={(s) => { setSesi(s); setPesanLogin(''); setTahap('masuk'); }}
    />
  );
}
