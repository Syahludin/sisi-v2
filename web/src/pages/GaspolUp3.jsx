import { useCallback, useEffect, useRef, useState } from 'react';

import { Konfirmasi } from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { angkaGaspol, BATAS_GASPOL_MS, galatRentang, GRUP_GASPOL, KOLOM_GASPOL, KOLOM_TEKS, rentangAwal } from '../gaspol.js';
import { aksiMenu } from '../katalog.js';
import { kodeGalat, pesan } from '../pesan.js';
import { hariIniWib } from '../tanggal.js';
import './gaspol.css';

const tglTampil = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : t || '-');

/**
 * Laporan GASPOL UP3 (v1.0.44), struktur sama dengan v1 SIE-Teknik tab GASPOL UP3: filter Tgl Dari / Tgl Sampai,
 * tabel lebar 38 kolom (kepala 2 baris berwarna per grup, 3 kolom pertama menempel saat digeser), tombol
 * "Input Laporan ke GASPOL" (menu OPS_GASPOL_UP3, ADMIN / SUPER dengan akses UBAH; server tetap mengecek). Angka direkap otomatis dari
 * modul, tidak bisa diedit. Rentang tersimpan di alamat (?dari=&sampai=).
 */
export default function GaspolUp3({ sesi, api, rute, keRute }) {
  const hariIni = hariIniWib();
  const awal = rentangAwal(hariIni);
  const q = rute.query;
  const [dari, setDari] = useState(() => (galatRentang(q.dari, q.sampai) ? awal.dari : q.dari));
  const [sampai, setSampai] = useState(() => (galatRentang(q.dari, q.sampai) ? awal.sampai : q.sampai));
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galatKirim, setGalatKirim] = useState('');
  const [info, setInfo] = useState('');
  const urut = useRef(0);

  const bolehKirim = aksiMenu(sesi, 'OPS_GASPOL_UP3') === 'UBAH' && ['ADMIN', 'SUPER'].includes(sesi.profil?.role);

  const muat = useCallback(async (d, s) => {
    const g = galatRentang(d, s);
    if (g) { setGalat(g); return; }
    const no = ++urut.current;
    setMemuat(true);
    setGalat('');
    keRute({ query: { dari: d, sampai: s } }, { ganti: true });
    try {
      const j = await api('getGaspolUp3', { dari: d, sampai: s }, {
        batasMs: BATAS_GASPOL_MS, awal: (c) => { if (no === urut.current) setData(c.data); } });
      if (no === urut.current) setData(j.data);
    } catch (e) {
      if (no === urut.current) setGalat(pesan(kodeGalat(e)));
    } finally {
      if (no === urut.current) setMemuat(false);
    }
  }, [api, keRute]);

  useEffect(() => { muat(dari, sampai); }, []);

  const reset = () => {
    setDari(awal.dari);
    setSampai(awal.sampai);
    setInfo('');
    muat(awal.dari, awal.sampai);
  };

  const kirim = async () => {
    setMengirim(true);
    setGalatKirim('');
    try {
      const j = await api('kirimGaspolUp3', { dari: data.dari, sampai: data.sampai }, { batasMs: BATAS_GASPOL_MS });
      const r = j.data;
      setKonfirmasi(false);
      setInfo('Terkirim ke GASPOL: ' + r.total + ' baris (' + r.tambah + ' baru, ' + r.timpa + ' diperbarui).');
    } catch (e) {
      setGalatKirim(pesan(kodeGalat(e)));
    } finally {
      setMengirim(false);
    }
  };

  const baris = data?.baris || [];
  const sesuaiFilter = data && data.dari === dari && data.sampai === sampai;

  return (
    <div className="hlm gs">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>GASPOL UP3</h1>
          <p>Rekap otomatis dari modul (Inspeksi, ROW, Hartek, Yandal) per penyulang dan tanggal.</p>
        </div>
      </header>

      <form className="gs-filter" onSubmit={(e) => { e.preventDefault(); setInfo(''); muat(dari, sampai); }}>
        <label className="gs-isian"><span className="k-label">Tgl Dari</span>
          <input type="date" className="k-input" value={dari} max={hariIni} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label className="gs-isian"><span className="k-label">Tgl Sampai</span>
          <input type="date" className="k-input" value={sampai} max={hariIni} onChange={(e) => setSampai(e.target.value)} />
        </label>
        <button type="submit" className="k-tombol k-tombol--utama" disabled={memuat}>
          {memuat ? <SisiLoader ukuran={16} warna="#fff" label="Memuat" /> : <Ikon nama="cari" ukuran={16} />}{memuat ? 'Memuat data...' : 'Cari'}
        </button>
        <button type="button" className="k-tombol k-tombol--teks" onClick={reset} disabled={memuat}>Reset</button>
        <span className="k-spasi" />
        {bolehKirim && (
          <button type="button" className="k-tombol k-tombol--garis" disabled={memuat || !sesuaiFilter || !baris.length || !data?.bisaKirim}
            title={data && !data.bisaKirim ? 'Spreadsheet GASPOL belum diatur di server (GASPOL_SHEET_ID)' : undefined}
            onClick={() => { setGalatKirim(''); setKonfirmasi(true); }}>
            <Ikon nama="kanan" ukuran={16} />Input Laporan ke GASPOL
          </button>
        )}
      </form>

      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}{data ? ' Data di bawah dari pemuatan sebelumnya.' : ''}</p>}
      {info && <p className="k-pesan k-pesan--ok" role="status">{info}</p>}

      <div className={'gs-bungkus' + (memuat && data ? ' gs-bungkus--muat' : '')} aria-busy={memuat}>
        <table className="gs-tabel">
          <thead>
            <tr className="gs-grp">
              {KOLOM_GASPOL.slice(0, 4).map((k, i) => <th key={k} rowSpan={2} className={'gs-id gs-c' + (i + 1)}>{k}</th>)}
              {GRUP_GASPOL.map((g) => <th key={g.nama} colSpan={g.n} className={'gs-g-' + g.kelas}>{g.nama}</th>)}
            </tr>
            <tr className="gs-sub">
              {KOLOM_GASPOL.slice(4).map((k) => <th key={k}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {!data && memuat && (
              <tr><td colSpan={38} className="gs-kosong"><SisiLoader ukuran={40} label="Memuat" /><p>Memuat data...</p></td></tr>
            )}
            {data && !baris.length && (
              <tr><td colSpan={38} className="gs-kosong"><Ikon nama="cari" ukuran={26} /><p>Tidak ada data pada periode ini.</p></td></tr>
            )}
            {baris.map((b, r) => (
              <tr key={(data.penyulang?.[r] || '') + b[1] + r}>
                {b.map((v, c) => {
                  if (c === 0) return <td key={c} className="gs-c1 gs-angka">{v}</td>;
                  if (c === 1) return <td key={c} className="gs-c2">{tglTampil(v)}</td>;
                  if (c === 2) return <td key={c} className="gs-c3" title={data.penyulang?.[r] ? 'Penyulang ' + data.penyulang[r] : undefined}>{v || '-'}</td>;
                  if (KOLOM_TEKS.has(c)) return <td key={c} className={c === 23 ? 'gs-kiri' : ''}>{v || '-'}</td>;
                  const n = Number(v) || 0;
                  return <td key={c} className={'gs-angka' + (n === 0 ? ' gs-nol' : '')}>{angkaGaspol(n)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Konfirmasi
        k={konfirmasi && data ? {
          judul: 'Input Laporan ke GASPOL',
          teks: 'Rekap ' + tglTampil(data.dari) + ' s.d. ' + tglTampil(data.sampai) + ' (' + baris.length + ' baris) dikirim ke tab Input TBL GASPOL. '
            + 'Baris penyulang + tanggal yang sudah ada ditimpa, sisanya ditambah. Angka direkap dari modul dan tidak dapat diedit manual.',
          tombol: 'Kirim ke GASPOL',
        } : null}
        sibuk={mengirim} galat={galatKirim} onTutup={() => setKonfirmasi(false)} onYa={kirim} />
    </div>
  );
}
