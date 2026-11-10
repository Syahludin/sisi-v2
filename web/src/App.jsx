import { useCallback, useEffect, useMemo, useState } from 'react';

import { panggil } from './api.js';
import { simpanTiket } from './apiBaca.js';
import { bacaConfig } from './config.js';
import { pesan, SESI_HABIS } from './pesan.js';
import { bacaSesi, hapusSesi, KUNCI_SESI, simpanSesi } from './sesi.js';
import { kosongkanTembolok } from './tembolok.js';
import Ikon from './components/Ikon.jsx';
import SisiLoader from './components/SisiLoader.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';

/**
 * Alur: sesi tersimpan = dashboard LANGSUNG tampil (v1.0.36), cekSesi berjalan di belakang (token dicek + diperpanjang,
 * menu diperbarui); sesi habis / bukan admin = login dengan pesan. Server tidak terjangkau = dashboard tetap terbuka
 * (halaman menampilkan galat masing-masing). Logout di satu tab = semua tab keluar. Alamat halaman tetap saat login.
 */
export default function App() {
  const config = useMemo(() => bacaConfig(), []);
  const [sesi, setSesi] = useState(() => bacaSesi(config.env));
  const [tahap, setTahap] = useState(() => (bacaSesi(config.env) ? 'masuk' : 'login'));
  const [pesanLogin, setPesanLogin] = useState('');

  const keLogin = useCallback((teks = '') => {
    hapusSesi();
    kosongkanTembolok(true);   // v1.0.45: termasuk laporan tersimpan lokal per akun
    setSesi(null);
    setPesanLogin(teks);
    setTahap('login');
  }, []);

  const periksa = useCallback(async ({ diam = false } = {}) => {
    const s = bacaSesi(config.env);
    if (!s) { keLogin(); return; }
    if (!diam) setTahap('cek');
    try {
      const j = await panggil(config.apiUrl, 'cekSesi', { token: s.token });
      const segar = { ...s, profil: j.data.profil, menu: j.data.menu || [], versi: j.versi || s.versi || '' };
      simpanTiket(s.token, j.data.tiketApi);   // v1.0.38: tiket API baca ikut cekSesi (baca pertama tanpa getTiketApi)
      simpanSesi(segar);
      setSesi(segar);
      setTahap('masuk');
    } catch (e) {
      const kode = (e && e.kode) || 'JARINGAN';
      if (SESI_HABIS.has(kode) || kode === 'AKSES_DITOLAK') keLogin(pesan(kode));
      else if (!diam) { setPesanLogin(pesan(kode)); setTahap('putus'); }
    }
  }, [config, keLogin]);

  // hanya saat halaman dibuka: sesi tersimpan dicek di belakang (dashboard sudah tampil)
  useEffect(() => {
    if (tahap === 'masuk') periksa({ diam: true });
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
              <button type="button" className="tombol-kuning" onClick={() => periksa()}><Ikon nama="ulang" ukuran={18} />Coba lagi</button>
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
