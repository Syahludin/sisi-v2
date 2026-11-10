import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import Pilih from '../components/Pilih.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { properNama } from '../checkpoint.js';
import { galatRentang, rentangAwal } from '../gaspol.js';
import { muatMaster } from '../master.js';
import { kodeGalat, pesan } from '../pesan.js';
import { geserTanggal, hariIniWib } from '../tanggal.js';
import {
  angkaWorkplan, BATAS_WORKPLAN_MS, gabungWorkplan, hariWorkplan, MAKS_HARI_WORKPLAN, opsiWorkplan, ringkasWorkplan, saringWorkplan, TAB_WORKPLAN,
  tglPendek, totalWorkplan, tsvWorkplan,
} from '../workplan.js';
import './workplan.css';


/**
 * Workplan UP3 (v1.0.60, menu OPS_WORKPLAN_UP3): realisasi ROW / Hartek per penyulang, section dan jenis kegiatan, satu kolom per
 * tanggal rentang, susunan kolom seperti sheet WORKPLAN PRIORITAS PENYULANG. Sheet itu tidak dibaca; admin menyalin angkanya
 * (tombol "Salin tabel"). Filter: tab (ROW / Harkons), rentang tanggal, dropdown Penyulang + Section dari master jaringan
 * (db_Jaringan, disaring di browser); tersimpan di alamat (?tab=&dari=&sampai=&penyulang=&section=).
 * Review 8 Nov 2026 (desain ulang): tab segmen seperti halaman lain, filter sejajar dalam satu kartu, ringkasan total per jenis,
 * sel Penyulang / Section bergabung per kelompok, kolom akhir pekan diarsir, baris Total per tanggal; isi salinan TSV tidak berubah.
 */
export default function WorkplanUp3({ sesi, api, rute, keRute }) {
  const hariIni = hariIniWib();
  const awal = rentangAwal(hariIni);
  const q = rute.query;
  const rentangSah = !galatRentang(q.dari, q.sampai);
  const [tab, setTab] = useState(() => (TAB_WORKPLAN.some((t) => t.kode === q.tab) ? q.tab : 'ROW'));
  const [dari, setDari] = useState(() => (rentangSah ? q.dari : awal.dari));
  const [sampai, setSampai] = useState(() => (rentangSah ? q.sampai : awal.sampai));
  const [master, setMaster] = useState([]);
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [tersalin, setTersalin] = useState(false);
  const urut = useRef(0);
  const penyulang = q.penyulang || '', section = q.section || '';

  const muat = useCallback(async (t, d, s) => {
    let g = galatRentang(d, s);
    if (!g && geserTanggal(d, MAKS_HARI_WORKPLAN) <= s) g = 'Rentang maksimal ' + MAKS_HARI_WORKPLAN + ' hari.';
    if (g) { setGalat(g); return; }
    const no = ++urut.current;
    setMemuat(true);
    setGalat('');
    setTersalin(false);
    keRute({ query: { tab: t, dari: d, sampai: s, penyulang, section } }, { ganti: true });
    try {
      const j = await api('getWorkplanUp3', { tab: t, dari: d, sampai: s }, { batasMs: BATAS_WORKPLAN_MS });
      if (no === urut.current) setData(j.data);
    } catch (e) {
      if (no === urut.current) setGalat(pesan(kodeGalat(e)));
    } finally {
      if (no === urut.current) setMemuat(false);
    }
  }, [api, keRute, penyulang, section]);

  useEffect(() => { muat(tab, dari, sampai); }, []);
  useEffect(() => { muatMaster(api, sesi.token, 'jaringan').then(setMaster, () => setMaster([])); }, []);   // gagal = opsi dari baris realisasi

  const gantiTab = (t) => { setTab(t); setData(null); muat(t, dari, sampai); };
  const reset = () => {
    setDari(awal.dari);
    setSampai(awal.sampai);
    keRute({ query: { tab, dari: awal.dari, sampai: awal.sampai } }, { ganti: true });
    muat(tab, awal.dari, awal.sampai);
  };
  const ubahFilter = (o) => { setTersalin(false); keRute({ query: { ...q, ...o } }, { ganti: true }); };

  const sesuai = !!data && data.tab === tab;
  const tanggal = sesuai ? data.tanggal : [];
  const opsi = useMemo(() => opsiWorkplan(master, penyulang, sesuai ? data.baris : []), [master, penyulang, sesuai, data]);
  const baris = useMemo(() => (sesuai ? saringWorkplan(data.baris, { penyulang, section }) : []), [sesuai, data, penyulang, section]);
  const gabung = useMemo(() => gabungWorkplan(baris), [baris]);
  const total = useMemo(() => totalWorkplan(baris, tanggal.length), [baris, tanggal.length]);
  const ringkas = useMemo(() => ringkasWorkplan(baris), [baris]);
  const hari = useMemo(() => tanggal.map(hariWorkplan), [tanggal]);
  const kelasJenis = (j) => 'wp-jenis' + (/^pangkas$/i.test(j) ? ' wp-jenis--pangkas' : /^tebang$/i.test(j) ? ' wp-jenis--tebang' : '');

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(tsvWorkplan(baris, tanggal));
      setTersalin(true);
    } catch {
      setGalat('Browser menolak menyalin. Izinkan akses papan klip lalu coba lagi.');
    }
  };

  return (
    <div className="hlm wp">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Workplan UP3</h1>
          <p>Realisasi ROW dan Harkons per penyulang, section, dan jenis kegiatan, dari data ROW dan Hartek.</p>
        </div>
        <div className="k-tab" role="tablist" aria-label="Jenis workplan">
          {TAB_WORKPLAN.map((t) => (
            <button key={t.kode} type="button" role="tab" aria-selected={tab === t.kode} disabled={memuat}
              className={'k-tab-tombol' + (tab === t.kode ? ' k-tab-tombol--aktif' : '')} onClick={() => gantiTab(t.kode)}>{t.nama}</button>
          ))}
        </div>
      </header>

      <form className="wp-filter" onSubmit={(e) => { e.preventDefault(); muat(tab, dari, sampai); }}>
        <div className="wp-isian"><span className="k-label" aria-hidden="true">Penyulang</span>
          <Pilih label="Penyulang" nilai={properNama(penyulang)} opsi={opsi.penyulang} kosong="Semua penyulang" placeholder="Semua penyulang"
            onUbah={(v) => ubahFilter({ penyulang: v, section: '' })} />
        </div>
        <div className="wp-isian"><span className="k-label" aria-hidden="true">Section</span>
          <Pilih label="Section" nilai={section} opsi={opsi.section} kosong="Semua section" mati={!penyulang}
            placeholder={penyulang ? 'Semua section' : 'Pilih penyulang dulu'} onUbah={(v) => ubahFilter({ section: v })} />
        </div>
        <label className="wp-isian wp-isian--tgl"><span className="k-label">Dari</span>
          <input type="date" className="k-input" value={dari} onChange={(e) => setDari(e.target.value)} />
        </label>
        <label className="wp-isian wp-isian--tgl"><span className="k-label">Sampai</span>
          <input type="date" className="k-input" value={sampai} onChange={(e) => setSampai(e.target.value)} />
        </label>
        <div className="wp-aksi">
          <button type="submit" className="k-tombol k-tombol--utama" disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} warna="#fff" label="Memuat" /> : <Ikon nama="cari" ukuran={16} />}{memuat ? 'Memuat…' : 'Tampilkan'}
          </button>
          <button type="button" className="k-tombol k-tombol--teks" onClick={reset} disabled={memuat}>Reset</button>
        </div>
      </form>

      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}

      {sesuai && (
        <div className="wp-ringkas">
          <ul className="wp-ringkas-angka" aria-label="Total realisasi yang tampil">
            {ringkas.jenis.slice(0, 4).map((x) => (
              <li key={x.jenis + '|' + x.satuan}><span className={kelasJenis(x.jenis)}>{x.jenis}</span><b>{angkaWorkplan(x.total)}</b><small>{x.satuan}</small></li>
            ))}
            {ringkas.jenis.length > 4 && <li className="wp-ringkas-lain">+{ringkas.jenis.length - 4} jenis lain</li>}
            <li className="wp-ringkas-info">{ringkas.penyulang} penyulang · {ringkas.section} section · {tanggal.length} hari</li>
          </ul>
          <button type="button" className="k-tombol k-tombol--garis" disabled={!baris.length} onClick={salin} title="Salin tabel (TSV) untuk ditempel ke sheet WORKPLAN">
            <Ikon nama={tersalin ? 'centang' : 'salin'} ukuran={16} />{tersalin ? 'Tersalin' : 'Salin tabel'}
          </button>
        </div>
      )}

      <div className={'wp-bungkus' + (memuat && data ? ' wp-bungkus--muat' : '')} aria-busy={memuat}>
        <table className="wp-tabel">
          <thead>
            <tr>
              <th className="wp-c-no">No</th><th className="wp-c-peny">Penyulang</th><th className="wp-c-sec">Section</th><th className="wp-c-jenis">Jenis Kegiatan</th>
              <th>Satuan</th>
              {tanggal.map((t, i) => (
                <th key={t} title={t} className={'wp-tgl' + (hari[i].libur ? ' wp-libur' : '')}><b>{tglPendek(t)}</b><small>{hari[i].hari}</small></th>
              ))}
              <th className="wp-c-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {!sesuai && memuat && (
              <tr><td colSpan={6} className="wp-kosong"><SisiLoader ukuran={40} label="Memuat" /><p>Memuat data…</p></td></tr>
            )}
            {sesuai && !baris.length && (
              <tr><td colSpan={6 + tanggal.length} className="wp-kosong"><Ikon nama="cari" ukuran={26} /><p>Tidak ada realisasi pada filter ini.</p></td></tr>
            )}
            {baris.map((b, i) => (
              <tr key={b.penyulang + '|' + b.section + '|' + b.jenis} className={(gabung[i].grup % 2 ? 'wp-belang' : '') + (gabung[i].penyulang ? ' wp-awal-grup' : '')}>
                <td className="wp-c-no">{i + 1}</td>
                {gabung[i].penyulang > 0 && <th scope="rowgroup" rowSpan={gabung[i].penyulang} className="wp-c-peny">{b.penyulang}</th>}
                {gabung[i].section > 0 && <td rowSpan={gabung[i].section} className="wp-c-sec">{b.section || '-'}</td>}
                <td className="wp-c-jenis"><span className={kelasJenis(b.jenis)}>{b.jenis}</span></td>
                <td className="wp-satuan">{b.satuan}</td>
                {b.realisasi.map((v, c) => <td key={c} className={'wp-angka' + (v === 0 ? ' wp-nol' : '') + (hari[c]?.libur ? ' wp-libur' : '')}>{angkaWorkplan(v)}</td>)}
                <td className="wp-angka wp-c-total">{angkaWorkplan(b.total)}</td>
              </tr>
            ))}
          </tbody>
          {baris.length > 0 && (
            <tfoot>
              <tr>
                <td className="wp-c-no" /><th scope="row" className="wp-c-peny">Total</th><td className="wp-c-sec" /><td className="wp-c-jenis" /><td />
                {total.kolom.map((v, c) => <td key={c} className={'wp-angka' + (v === 0 ? ' wp-nol' : '') + (hari[c]?.libur ? ' wp-libur' : '')}>{angkaWorkplan(v)}</td>)}
                <td className="wp-angka wp-c-total">{angkaWorkplan(total.semua)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
