import { useCallback, useEffect, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { kodeGalat, pesan } from '../pesan.js';
import { persenJalur, selesaiJalur, totalJalur } from '../tiang.js';
import './verifikasiTiang.css';

/**
 * Verifikasi Tiang (menu OPS_VERIFIKASI_TIANG, ADMIN / SUPER). Progres verifikasi per kode jalur (verifikasi dilakukan di HP, berurutan
 * sepanjang jalur). Master segmen sekarang di menu Master Jaringan. Logika murni di tiang.js.
 */
export default function VerifikasiTiang({ api }) {
  const [jalur, setJalur] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');

  const muat = useCallback(async (opsi = {}) => {
    setMemuat(true); setGalat('');
    try {
      setJalur((await api('getVerifikasiTiang', {}, { batasMs: 120000, ...opsi })).data.jalur || []);
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  return (
    <div className="hlm vt">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Verifikasi Tiang</h1>
          <p>Progres verifikasi tiang TM di lapangan (dikerjakan dari HP).</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat({ langsung: true })} disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat Ulang
          </button>
        </div>
      </header>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {!jalur && memuat && <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div>}
      {jalur && <TabJalur jalur={jalur} />}
    </div>
  );
}

function TabJalur({ jalur }) {
  const t = totalJalur(jalur), persen = persenJalur(t);
  return (
    <>
      <section className="vt-total">
        <b>{persen}%</b>
        <div>
          <span>{selesaiJalur(t)} dari {t.jumlah} tiang selesai · {jalur.length} jalur</span>
          <i className="vt-bar"><i style={{ width: persen + '%' }} /></i>
          <small>Target 90% sebelum temuan per tiang dimulai. Hanya tiang lengkap dengan foto lapangan yang dihitung; verifikasi hanya dari HP.</small>
        </div>
      </section>
      {!jalur.length ? <p className="k-kosong">Belum ada tiang. Jalankan migrasi tiang dari ITB (ADMIN_migrasiTiangItb).</p> : (
        <div className="k-tabel-bungkus">
          <table className="k-tabel vt-tabel">
            <thead><tr><th>Jalur</th><th className="k-angka">Tiang</th><th>Progres</th><th className="k-angka">Terverifikasi</th><th className="k-angka">Perlu Dilengkapi</th><th className="k-angka">Perlu Perbaikan</th><th className="k-angka">Tidak Ditemukan</th><th className="k-angka">Bertanda Cek</th></tr></thead>
            <tbody>
              {jalur.map((j) => (
                <tr key={j.kode}>
                  <td><b>{j.kode}</b></td>
                  <td className="k-angka">{j.jumlah}</td>
                  <td><span className="vt-progres"><i className="vt-bar"><i style={{ width: persenJalur(j) + '%' }} /></i>{persenJalur(j)}%</span></td>
                  <td className="k-angka">{j.terverifikasi}</td>
                  <td className="k-angka">{j.perluDilengkapi || 0}</td>
                  <td className="k-angka">{j.perluPerbaikan}</td>
                  <td className="k-angka">{j.tidakDitemukan}</td>
                  <td className="k-angka vt-merah">{j.bertanda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
