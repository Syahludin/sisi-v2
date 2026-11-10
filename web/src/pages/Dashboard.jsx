import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BATAS_WAKTU_MS, panggil } from '../api.js';
import { bacaMysql, bolehBacaMysql, lupakanTiket, tiketBaca } from '../apiBaca.js';
import { SESI_HABIS } from '../pesan.js';
import { aset, navigasi, useRute } from '../rute.js';
import { bacaTembolok, bolehTembolok, kosongkanTembolok, kunciSesi, tulisTembolok } from '../tembolok.js';
import Ikon from '../components/Ikon.jsx';
import MenuAtas from '../components/MenuAtas.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { feederMenu, menuBelumSiap, relEfektif } from '../katalog.js';
import useMenuPribadi from '../menuPribadi.js';
import { useTema } from '../tema.js';
import Beranda from './Beranda.jsx';
import './dashboard.css';

// v1.0.36: kode tiap halaman diunduh saat halaman itu dibuka pertama kali
const LaporanUp3Uiw = lazy(() => import('./LaporanUp3Uiw.jsx'));
const JadwalPadam = lazy(() => import('./JadwalPadam.jsx'));
const ApprovalP0 = lazy(() => import('./ApprovalP0.jsx'));
const BeritaAcara = lazy(() => import('./BeritaAcara.jsx'));
const PengukuranGardu = lazy(() => import('./PengukuranGardu.jsx'));
const HistoriGangguan = lazy(() => import('./HistoriGangguan.jsx'));
const MaterialGudang = lazy(() => import('./MaterialGudang.jsx'));   // v1.0.57 menu Material Gudang
const MasterSwitching = lazy(() => import('./MasterSwitching.jsx'));   // 1.0.63 menu Master Switching
const VerifikasiTiang = lazy(() => import('./VerifikasiTiang.jsx'));   // menu Verifikasi Tiang + Segmen
const DataAset = lazy(() => import('./DataAset.jsx'));   // v1.0.56 menu Data Aset (ITB)
const PenerusanWo = lazy(() => import('./PenerusanWo.jsx'));
const GaspolUp3 = lazy(() => import('./GaspolUp3.jsx'));
const WorkplanUp3 = lazy(() => import('./WorkplanUp3.jsx'));   // v1.0.60 menu Workplan UP3
const LaporanGangguan = lazy(() => import('./LaporanGangguan.jsx'));   // v1.0.59 menu Laporan Gangguan Penyulang
const PetaTemuan = lazy(() => import('./PetaTemuan.jsx'));
const Checkpoint = lazy(() => import('./Checkpoint.jsx'));   // v1.0.51 menu Checkpoint Jaringan   // v1.0.50 (Leaflet ikut terpisah, diunduh saat dibuka)
const HALAMAN = ['laporan-up3', 'laporan-uiw', 'jadwal-padam', 'approval-p0', 'berita-acara', 'ukur-gardu', 'histori-gangguan', 'penerusan-wo', 'gaspol-up3', 'workplan-up3', 'laporan-gangguan', 'temuan-inspeksi', 'checkpoint', 'data-aset', 'material-gudang', 'master-switching', 'verifikasi-tiang'];
const dalamProses = new Map();   // kunci baca -> Promise (panggilan sama bersamaan = satu permintaan)

const LABEL_ROLE = { ADMIN: 'Admin', ADMIN_ES: 'Admin ES', SUPER: 'Super Admin' };

/**
 * Dashboard website admin: menu atas lebar (Semua Menu + rel menu yang sudah dibuka + cari, components/MenuAtas.jsx) + area isi selebar layar.
 * Sebelum v1.0.70 navigasinya sidebar kiri.
 * v1.0.36: halaman aktif = alamat (/sisi/<halaman>/<id>?<query>, rute.js): refresh / Back / bookmark / link WA.
 * Menu dari katalog.js (kode sama dengan KatalogOperasi mobile; pengelompokan website sendiri).
 * Halaman memanggil backend lewat api(action, data, { batasMs, awal }) (token terpasang; sesi habis = kembali ke login).
 * awal(j) = jawaban tersimpan di browser ditampilkan dulu (tembolok.js), lalu jawaban baru dari server dikembalikan.
 * Isian belum disimpan ditandai penjaga.current = true (pindah halaman / Back / keluar minta konfirmasi).
 * Halaman menerima rute { halaman, id, query } + keRute({ id?, query? }, { ganti }) untuk menyimpan pilihan di alamat.
 */
export default function Dashboard({ sesi, env, config, onKeluar, onSesiHabis }) {
  const [keluar, setKeluar] = useState(false);
  const penjaga = useRef(false);
  const ruteMentah = useRute();
  const [rute, setRute] = useState(ruteMentah);   // rute yang diterima (Back ditolak penjaga = tetap)
  const halaman = HALAMAN.includes(rute.halaman) ? rute.halaman : '';

  const p = sesi.profil || {};
  const role = LABEL_ROLE[p.role] || p.role || '';
  const feeder = useMemo(() => feederMenu(sesi), [sesi]);
  const menuSiap = useMemo(() => feeder.flatMap((g) => g.menu), [feeder]);
  const menuSegera = useMemo(() => menuBelumSiap(sesi), [sesi]);
  const pribadi = useMenuPribadi(p.username);
  const { tema, balik: balikTema } = useTema();
  const rel = useMemo(() => relEfektif(pribadi.rel, menuSiap), [pribadi.rel, menuSiap]);
  // menu yang halamannya dibuka (menu, tautan, Back, muat ulang) masuk rel; menu aktif sebelumnya tidak ikut terlepas saat rel penuh
  const sebelumnya = useRef('');
  useEffect(() => {
    const m = menuSiap.find((x) => x.halaman === halaman);
    if (!m) return;
    pribadi.buka(m.kode, sebelumnya.current);
    sebelumnya.current = m.kode;
  }, [halaman, menuSiap]);   // eslint-disable-line react-hooks/exhaustive-deps

  const api = useCallback(async (action, data, opsi = {}) => {
    const { awal, langsung, tanpaTembolok, ...lain } = opsi;   // langsung = lewati API baca MySQL (muat ulang paksa dari Sheet)
    // v1.0.58 tanpaTembolok = baca yang disimpan pemanggil sendiri (daftar WO: simpananWo.js); tidak membaca / menulis / membuang tembolok
    const baca = bolehTembolok(action) && !tanpaTembolok;
    const kunci = baca ? kunciSesi(sesi, action, data) : '';
    if (baca && awal) {
      const t = bacaTembolok(kunci);
      if (t) awal(t.j, t.waktu);
    }
    if (baca && dalamProses.has(kunci)) return dalamProses.get(kunci);
    const janji = (async () => {
      try {
        let j = null;
        // v1.0.38: baca berat lewat API MySQL Hostinger bila diatur; gagal apa pun = Apps Script seperti biasa
        if (config.apiBacaUrl && !langsung && bolehBacaMysql(action, data)) {
          try {
            const t = await tiketBaca(sesi.token, async () => (await panggil(config.apiUrl, 'getTiketApi', { token: sesi.token })).data);
            j = await bacaMysql(config.apiBacaUrl, action, data, t, lain);
          } catch (e) {
            if (e && SESI_HABIS.has(e.kode)) throw e;
            if (e && /^TIKET_/.test(e.kode)) lupakanTiket();
            // BELUM_ADA = jawaban jadi belum disimpan / baru dihapus karena data berubah (normal): Apps Script menyimpannya
            if (!e || e.kode !== 'BELUM_ADA') console.warn('API baca MySQL tidak dipakai (' + ((e && e.kode) || 'galat') + '), membaca lewat Apps Script.');
          }
        }
        if (!j) j = await panggil(config.apiUrl, action, { token: sesi.token, data, ...lain });
        if (baca) tulisTembolok(kunci, j); else if (!tanpaTembolok) kosongkanTembolok();
        return j;
      } catch (e) {
        if (e && SESI_HABIS.has(e.kode)) onSesiHabis(e.kode);
        if (e && e.kode === 'WAKTU_HABIS') console.warn('Server terlalu lama menjawab: ' + action + ' (' + ((lain.batasMs || BATAS_WAKTU_MS) / 1000) + ' dtk)');
        throw e;
      } finally {
        if (baca) dalamProses.delete(kunci);
      }
    })();
    if (baca) dalamProses.set(kunci, janji);
    return janji;
  }, [config.apiUrl, config.apiBacaUrl, sesi.token, onSesiHabis]);

  const bolehTinggal = () => !penjaga.current || window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?');

  // alamat berubah (menu, Back / Forward, link): pindah halaman / item dijaga isian belum disimpan
  useEffect(() => {
    const sama = ruteMentah.halaman === rute.halaman && ruteMentah.id === rute.id;
    if (!sama && penjaga.current && !window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?')) {
      navigasi(rute);   // Back ditolak: alamat dikembalikan
      return;
    }
    if (!sama) penjaga.current = false;
    setRute(ruteMentah);
  }, [ruteMentah]);

  const pindah = (h) => {
    if (h === halaman && !rute.id) return;
    if (!bolehTinggal()) return;
    penjaga.current = false;
    navigasi({ halaman: h });
  };

  /** Tutup satu menu di rel. Menu yang sedang aktif ditutup = pindah ke menu terakhir di rel (atau Beranda bila rel kosong). */
  const lepasMenu = (kode) => {
    const m = menuSiap.find((x) => x.kode === kode);
    if (!m) return;
    if (m.halaman !== halaman) { pribadi.lepas(kode); return; }
    if (!bolehTinggal()) return;
    const sisa = rel.filter((k) => k !== kode);
    const tujuan = menuSiap.find((x) => x.kode === sisa[sisa.length - 1]);
    penjaga.current = false;
    pribadi.lepas(kode);
    navigasi({ halaman: tujuan ? tujuan.halaman : '' });
  };

  /** Simpan pilihan halaman di alamat: id (gardu / BA) dan query (tanggal, tab, filter). ganti = tanpa riwayat Back. */
  const keRute = useCallback((ubah, { ganti = false } = {}) => {
    navigasi({ halaman: rute.halaman, id: ubah.id !== undefined ? ubah.id : rute.id,
      query: ubah.query !== undefined ? { ...rute.query, ...ubah.query } : rute.query }, { ganti });
  }, [rute]);

  // judul tab browser ikut halaman
  useEffect(() => {
    const m = menuSiap.find((x) => x.halaman === halaman);
    document.title = (m ? m.nama + (rute.id ? ' · ' + rute.id : '') + ' · ' : '') + 'SiSi · Panel Admin';
  }, [halaman, rute.id, menuSiap]);

  const klikKeluar = async () => {
    if (keluar || !bolehTinggal()) return;
    setKeluar(true);
    await onKeluar();
  };

  const props = { sesi, config, api, penjaga, rute, keRute };
  const konten = (() => {
    switch (halaman) {
      case 'laporan-up3': return <LaporanUp3Uiw key="UP3" {...props} bagian="UP3" />;
      case 'gaspol-up3': return <GaspolUp3 {...props} />;
      case 'workplan-up3': return <WorkplanUp3 {...props} />;
      case 'laporan-gangguan': return <LaporanGangguan {...props} />;
      case 'laporan-uiw': return <LaporanUp3Uiw key="UIW" {...props} bagian="UIW" />;
      case 'jadwal-padam': return <JadwalPadam {...props} />;
      case 'approval-p0': return <ApprovalP0 {...props} />;
      case 'berita-acara': return <BeritaAcara {...props} />;
      case 'ukur-gardu': return <PengukuranGardu {...props} />;
      case 'histori-gangguan': return <HistoriGangguan {...props} />;
      case 'penerusan-wo': return <PenerusanWo {...props} />;
      case 'temuan-inspeksi': return <PetaTemuan {...props} />;
      case 'checkpoint': return <Checkpoint {...props} />;
      case 'data-aset': return <DataAset {...props} />;
      case 'material-gudang': return <MaterialGudang {...props} />;
      case 'master-switching': return <MasterSwitching {...props} />;
      case 'verifikasi-tiang': return <VerifikasiTiang {...props} />;
      default: return <Beranda sesi={sesi} feeder={feeder} rel={rel} segera={menuSegera} onPilih={pindah} />;
    }
  })();
  const tunggu = <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat halaman" /></div>;

  return (
    <div className="db">
      <header className="db-bar">
        <span className="db-bus" aria-hidden="true" />
        <div className="db-sumber">
          <span className="db-logo"><img src={aset('img/logo-sisi.png')} alt="" /></span>
          <button type="button" className="db-judul" onClick={() => pindah('')}>SiSi</button>
          {env === 'staging' && <span className="db-stg">STAGING</span>}
        </div>
        <MenuAtas feeder={feeder} rel={rel} aktif={halaman} tutup={pribadi.tutup}
          onPilih={(m) => pindah(m.halaman)} onLepas={lepasMenu}
          onTutup={pribadi.balikTutup} onTutupSemua={pribadi.setTutupSemua}>
          <button type="button" className="db-tema" onClick={balikTema} aria-label={tema === 'gelap' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'} title={tema === 'gelap' ? 'Tema terang' : 'Tema gelap'}>
            <Ikon nama={tema === 'gelap' ? 'matahari' : 'bulan'} ukuran={16} />
          </button>
          <div className="db-akun">
            <span className="db-avatar" aria-hidden="true">{(p.nama || p.username || '?').trim().charAt(0).toUpperCase()}</span>
            <span className="db-nama"><b>{p.nama || p.username}</b><small>{p.username} · {role}</small></span>
            <button type="button" className="db-keluar" onClick={klikKeluar} disabled={keluar}>
              {keluar ? <SisiLoader ukuran={16} warna="var(--brand-700)" label="Keluar" /> : <Ikon nama="keluar" ukuran={16} />}
              <span className="db-keluar-teks">Keluar</span>
            </button>
          </div>
        </MenuAtas>
      </header>

      <main className="db-isi"><Suspense fallback={tunggu}>{konten}</Suspense></main>

      <footer className="db-kaki">Sistem Integrasi © 2026 · PLN ULP Toboali{sesi.versi ? ' · server v' + sesi.versi : ''}</footer>
    </div>
  );
}
