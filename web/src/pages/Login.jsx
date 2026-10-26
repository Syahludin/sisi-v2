import { useEffect, useRef, useState } from 'react';

import { panggil } from '../api.js';
import { namaPerangkat } from '../perangkat.js';
import { pesan } from '../pesan.js';
import { simpanSesi } from '../sesi.js';
import Ikon from '../components/Ikon.jsx';
import MotifJaringan from '../components/MotifJaringan.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import './login.css';

const JEDA_BERHASIL_MS = 1600;

/**
 * Login web admin (keputusan kvlar 26 Okt 2026): 70:30, gaya aplikasi HP. Kiri = panggung SiSi (motif tiang & kawat,
 * logo bercahaya); kanan = panel kaca gelap berisi tombol kuning Login, form muncul sesudah diklik. Berhasil = kartu
 * "Login Berhasil" lalu dashboard. Website khusus Admin / Admin ES (backend menolak role lain: WEB_KHUSUS_ADMIN).
 */
export default function Login({ config, pesanAwal = '', onMasuk }) {
  const [terbuka, setTerbuka] = useState(Boolean(pesanAwal));
  const [username, setUsername] = useState('');
  const [sandi, setSandi] = useState('');
  const [lihat, setLihat] = useState(false);
  const [proses, setProses] = useState(false);
  const [galat, setGalat] = useState(pesanAwal);
  const [berhasil, setBerhasil] = useState(null);
  const [server, setServer] = useState({ status: 'cek', versi: '' });
  const inputUser = useRef(null);
  const inputSandi = useRef(null);
  const tombolLogin = useRef(null);

  // status server di kaki panel (ping publik), sekaligus memastikan config.js benar
  useEffect(() => {
    let aktif = true;
    panggil(config.apiUrl, 'ping')
      .then((j) => aktif && setServer({ status: 'ok', versi: (j.data && j.data.versi && j.data.versi.server) || j.versi || '' }))
      .catch((e) => aktif && setServer({ status: e.kode === 'CONFIG_KOSONG' ? 'config' : 'putus', versi: '' }));
    return () => { aktif = false; };
  }, [config.apiUrl]);

  useEffect(() => {
    if (terbuka) inputUser.current?.focus({ preventScroll: true });
  }, [terbuka]);

  const tutup = () => {
    if (proses) return;
    setTerbuka(false);
    setGalat('');
    requestAnimationFrame(() => tombolLogin.current?.focus({ preventScroll: true }));
  };

  const kirim = async (e) => {
    e.preventDefault();
    if (proses) return;
    const u = username.trim().toLowerCase();
    if (!u || !sandi) {
      setGalat(pesan('LOGIN_KOSONG'));
      (u ? inputSandi : inputUser).current?.focus();
      return;
    }
    setProses(true);
    setGalat('');
    try {
      const j = await panggil(config.apiUrl, 'login', { data: { username: u, password: sandi, perangkat: namaPerangkat() } });
      const d = j.data || {};
      // akun tim YANDAL (login 2 tahap) bukan akun admin
      if (!d.token || d.tahap) throw Object.assign(new Error('WEB_KHUSUS_ADMIN'), { kode: 'WEB_KHUSUS_ADMIN' });
      const sesi = { token: d.token, profil: d.profil, menu: d.menu || [], env: config.env, versi: j.versi || '' };
      simpanSesi(sesi);
      setSandi('');
      setBerhasil(sesi);
      setTimeout(() => onMasuk(sesi), JEDA_BERHASIL_MS);
    } catch (err) {
      setProses(false);
      setGalat(pesan(err && err.kode));
      inputSandi.current?.focus();
      inputSandi.current?.select();
    }
  };

  const teksServer = {
    cek: 'Menghubungkan ke server...',
    ok: 'Koneksi aman · SiSi v' + server.versi,
    putus: 'Server belum terhubung',
    config: 'Alamat server belum diatur (config.js)',
  }[server.status];

  return (
    <div className="lg" onKeyDown={(e) => { if (e.key === 'Escape' && terbuka) tutup(); }}>
      <section className="lg-kiri" aria-label="SiSi PLN ULP Toboali">
        <MotifJaringan className="lg-motif" />
        {config.env === 'staging' && <div className="lg-stg">STAGING</div>}
        <div className="lg-logo"><img src="./img/logo-sisi.png" alt="Logo SiSi" /></div>
        <div className="lg-teks">
          <h1 className="lg-sisi">SiSi</h1>
          <div className="lg-kicker"><span className="lg-percik" />SISTEM INTEGRASI · PANEL ADMIN</div>
          <div className="lg-pill"><Ikon nama="lokasi" ukuran={14} tebal={2.4} className="lg-pill-ikon" />PLN ULP TOBOALI</div>
          <p className="lg-desc">Approval, laporan, dan pemantauan pekerjaan lapangan ULP dalam satu layar.</p>
        </div>
        <div className="lg-foot">Sistem Integrasi © 2026 · PLN ULP Toboali</div>
      </section>

      <div className="lg-pln"><img src="./img/logo-pln.png" alt="PLN" /></div>

      <aside className="lg-auth">

        <div className={`lg-pintu ${terbuka ? 'lg-pintu--tutup' : ''}`} inert={terbuka}>
          <button ref={tombolLogin} type="button" className="lg-tombol-login" onClick={() => setTerbuka(true)}>
            <Ikon nama="masuk" ukuran={22} tebal={2.4} />Login
          </button>
          <small>Masuk dengan akun Admin / Admin ES ULP</small>
        </div>

        <form className={`lg-form ${terbuka ? 'lg-form--buka' : ''}`} onSubmit={kirim} noValidate inert={!terbuka}>
          <div className="lg-head">
            <div className="lg-tile lg-tile--kaca"><Ikon nama="kunci" ukuran={20} /></div>
            <h2 className="lg-h">Masuk ke akun</h2>
            <button type="button" className="lg-x" onClick={tutup} aria-label="Tutup form login" disabled={proses}>
              <Ikon nama="tutup" ukuran={16} tebal={2.6} />
            </button>
          </div>
          <p className="lg-sub">Gunakan akun admin yang terdaftar di ULP.</p>

          {galat && (
            <div className="lg-galat" role="alert"><Ikon nama="peringatan" ukuran={18} /><span>{galat}</span></div>
          )}

          <div className="lg-cred">
            <label className="lg-row">
              <span className="lg-tile lg-tile--biru"><Ikon nama="orang" ukuran={20} /></span>
              <span className="lg-isian">
                <span className="lg-lbl">USERNAME</span>
                <input ref={inputUser} type="text" name="username" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="cth. 16130.admin" autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck="false"
                  maxLength={80} disabled={proses} />
              </span>
            </label>
            <label className="lg-row">
              <span className="lg-tile lg-tile--kuning"><Ikon nama="sandi" ukuran={20} /></span>
              <span className="lg-isian">
                <span className="lg-lbl">KATA SANDI</span>
                <input ref={inputSandi} type={lihat ? 'text' : 'password'} name="password" value={sandi} onChange={(e) => setSandi(e.target.value)}
                  placeholder="Masukkan kata sandi" autoComplete="current-password" maxLength={200} disabled={proses} />
              </span>
              <button type="button" className="lg-mata" onClick={() => setLihat((v) => !v)} aria-label={lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>
                <Ikon nama={lihat ? 'mataTutup' : 'mata'} ukuran={20} tebal={2} />
              </button>
            </label>
          </div>

          <button type="submit" className="lg-masuk" disabled={proses}>
            {proses ? <><SisiLoader ukuran={20} warna="var(--brand-950)" label="Memverifikasi" />Verifikasi Akun</> : 'Masuk'}
          </button>
          <p className="lg-note">Data terenkripsi dan hanya bisa diakses admin yang berwenang.</p>
        </form>

        <div className={`lg-ver lg-ver--${server.status}`}><Ikon nama="perisai" ukuran={13} tebal={2.2} />{teksServer}</div>
      </aside>

      {berhasil && (
        <div className="lg-ok" role="status" aria-live="polite">
          <div className="lg-okc">
            <div className="lg-okr"><Ikon nama="centang" ukuran={44} tebal={3} /></div>
            <div className="lg-okk">LOGIN BERHASIL</div>
            <div className="lg-okh">Selamat Datang! 👋</div>
            <div className="lg-okp">
              <b>{berhasil.profil?.nama || berhasil.profil?.username}</b>
              <span>{berhasil.profil?.username} · {berhasil.profil?.role}</span>
            </div>
            <div className="lg-oks"><SisiLoader ukuran={20} />Mengalihkan ke dashboard...</div>
          </div>
        </div>
      )}
    </div>
  );
}
