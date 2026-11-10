import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import NavTanggal from '../components/NavTanggal.jsx';
import TeksWa from '../components/TeksWa.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import {
  BATAS_LAPORAN_MS, barisBaru, barisForm, daftarPenyulang, daftarSection, endpointMuat, galatDaftar,
  kmsTeks, MAKS_C4A, payloadSimpan, PRESET_CUACA, simpanPulih, TANGGAL_AWAL,
} from '../laporan.js';
import { muatMaster } from '../master.js';
import { kodeGalat, pesan } from '../pesan.js';
import { hariIniWib } from '../tanggal.js';
import './laporan.css';


/**
 * Laporan UP3 / UIW (bagian = 'UP3' | 'UIW'), mirror layar HP laporan_up3_screen.dart dengan tata letak layar lebar:
 * kiri status tim + input harian (tabel C4A yang bisa diedit langsung), kanan teks WA dari server.
 * UP3: C4A per penyulang (kmS langsung). UIW: Cuaca + C4A per section (Panjang kmS = tiang x 0,05).
 * Input hanya ADMIN / SUPER untuk hari ini (bisaUbah dari server); Admin ES dan tanggal lewat = hanya lihat.
 */
export default function LaporanUp3Uiw({ sesi, api, penjaga, bagian, rute, keRute }) {
  const isUp3 = bagian === 'UP3';
  const hariIni = hariIniWib();
  // v1.0.36: tanggal tersimpan di alamat (?tanggal=): refresh / bookmark = laporan tanggal yang sama
  const [tanggal, setTanggal] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(rute.query.tanggal || '') && rute.query.tanggal <= hariIni ? rute.query.tanggal : hariIni));
  const [data, setData] = useState(null);
  const [daftar, setDaftar] = useState([]);
  const [cuaca, setCuaca] = useState('');
  const [kotor, setKotor] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [cobaSimpan, setCobaSimpan] = useState(false);
  const [info, setInfo] = useState(null); // { jenis: 'ok' | 'galat', teks }
  const [jaringan, setJaringan] = useState(null);
  const [galatMaster, setGalatMaster] = useState('');
  const urutMuat = useRef(0);
  const kotorRef = useRef(false);
  useEffect(() => { kotorRef.current = kotor; }, [kotor]);

  const kirim = useCallback((action, d) => api(action, d, { batasMs: BATAS_LAPORAN_MS }), [api]);

  const terapkan = useCallback((d) => {
    setData(d);
    setDaftar((Array.isArray(d.c4a) ? d.c4a : []).map((c) => barisForm(bagian, c)));
    setCuaca(d.cuaca || '');
    setKotor(false);
    setCobaSimpan(false);
  }, [bagian]);

  const muat = useCallback(async (tgl) => {
    const no = ++urutMuat.current;
    setMemuat(true);
    setGalatMuat('');
    try {
      // v1.0.36: laporan tersimpan di browser tampil dulu; jawaban server tidak menimpa C4A yang sedang diisi
      const j = await api(endpointMuat(bagian), { tanggal: tgl }, {
        batasMs: BATAS_LAPORAN_MS, awal: (c) => { if (no === urutMuat.current && !kotorRef.current) { terapkan(c.data); setMemuat(false); } } });
      if (no === urutMuat.current && !kotorRef.current) terapkan(j.data);
    } catch (e) {
      if (no === urutMuat.current) setGalatMuat(pesan(kodeGalat(e)));
    } finally {
      if (no === urutMuat.current) setMemuat(false);
    }
  }, [api, bagian, terapkan]);

  useEffect(() => { muat(tanggal); }, []);
  useEffect(() => { keRute({ query: { tanggal: tanggal === hariIni ? '' : tanggal } }, { ganti: true }); }, [tanggal]);

  const bisaUbah = data?.bisaUbah === true;
  const ubah = bisaUbah && !menyimpan;

  const muatJaringan = useCallback(async (segar = false) => {
    setGalatMaster('');
    try {
      setJaringan(await muatMaster(api, sesi.token, 'jaringan', { segar }));
    } catch (e) {
      setGalatMaster(pesan(kodeGalat(e)));
    }
  }, [api, sesi.token]);

  // master penyulang / section hanya perlu kalau bisa menambah baris
  useEffect(() => { if (bisaUbah && !jaringan) muatJaringan(); }, [bisaUbah]);

  // isian belum disimpan: pindah menu (Dashboard) dan tutup / muat ulang tab minta konfirmasi
  useEffect(() => {
    penjaga.current = kotor;
    if (!kotor) return undefined;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', tahan);
    return () => window.removeEventListener('beforeunload', tahan);
  }, [kotor, penjaga]);
  useEffect(() => () => { penjaga.current = false; }, [penjaga]);

  const galat = useMemo(() => galatDaftar(bagian, daftar), [bagian, daftar]);
  /** Galat kolom tampil kalau sudah mencoba simpan, atau isiannya sudah diisi tapi salah (mis. penyulang ganda). */
  const galatKolom = (b, k) => {
    const g = galat.get(b.id)?.[k];
    return g && (cobaSimpan || String(b[k]).trim() !== '') ? g : '';
  };

  const bolehBuang = () => !kotor || window.confirm(isUp3 ? 'C4A yang belum disimpan akan hilang. Lanjutkan?'
    : 'Cuaca / C4A yang belum disimpan akan hilang. Lanjutkan?');

  const gantiTanggal = (t) => {
    if (!t || t === tanggal || t < TANGGAL_AWAL || t > hariIni || !bolehBuang()) return;
    setTanggal(t);
    setData(null);
    setInfo(null);
    muat(t);
  };

  const segarkan = () => {
    if (memuat || menyimpan || !bolehBuang()) return;
    setInfo(null);
    muat(tanggal);
  };

  const batalkan = () => {
    if (!kotor || !bolehBuang()) return;
    terapkan(data);
    setInfo(null);
  };

  const ubahBaris = (id, isi) => {
    setDaftar((ds) => ds.map((b) => (b.id === id ? { ...b, ...isi } : b)));
    setKotor(true);
  };
  const tambahBaris = () => {
    if (daftar.length >= MAKS_C4A) return;
    setDaftar((ds) => [...ds, barisBaru(bagian)]);
    setKotor(true);
  };
  const hapusBaris = (id) => {
    setDaftar((ds) => ds.filter((b) => b.id !== id));
    setKotor(true);
  };

  const simpan = async () => {
    if (!bisaUbah || menyimpan) return;
    setCobaSimpan(true);
    if (galat.size) {
      setInfo({ jenis: 'galat', teks: 'Ada isian yang belum benar (ditandai merah). Perbaiki dulu lalu simpan.' });
      return;
    }
    setMenyimpan(true);
    setInfo(null);
    // payload dibekukan sekali; gagal jaringan dikirim ulang persis sama (server aman diulang)
    const payload = payloadSimpan(bagian, { tanggal: data.tanggal, revision: Number(data.revision) || 0, cuaca, daftar });
    try {
      terapkan(await simpanPulih(kirim, bagian, payload));
      setInfo({ jenis: 'ok', teks: 'Laporan ' + bagian + ' tersimpan. Teks WA sudah diperbarui.' });
    } catch (e) {
      const kode = kodeGalat(e);
      setInfo({ jenis: 'galat', teks: kode === 'KONFLIK_REVISION'
        ? 'Laporan ' + bagian + ' sudah diubah admin lain. Muat ulang dulu, lalu isi lagi.'
        : pesan(kode) + ' Belum tersimpan, isian masih di layar.' });
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <div className="hlm lap">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Laporan {bagian}</h1>
        </div>
        <div className="hlm-aksi">
          <NavTanggal tanggal={tanggal} min={TANGGAL_AWAL} max={hariIni} disabled={memuat} onGanti={gantiTanggal} />
          <button type="button" className="k-tombol k-tombol--garis" onClick={segarkan} disabled={memuat || menyimpan}>
            {memuat && data ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
        </div>
      </header>

      {!data && memuat && (
        <div className="k-tengah"><SisiLoader ukuran={56} label="Menyusun laporan" /><p>Menyusun laporan {bagian}...</p></div>
      )}
      {!data && !memuat && (
        <div className="k-tengah k-tengah--galat" role="alert">
          <Ikon nama="peringatan" ukuran={30} />
          <b>Laporan belum bisa dimuat</b>
          <p>{galatMuat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => muat(tanggal)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
        </div>
      )}

      {data && (
        <>
          {galatMuat && <p className="k-pesan k-pesan--galat" role="alert">{galatMuat} Data di bawah dari pemuatan sebelumnya.</p>}
          <Banner data={data} bisaUbah={bisaUbah} />
          <div className={'lap-grid' + (memuat ? ' lap-grid--muat' : '')} aria-busy={memuat}>
              <section className="hlm-kartu lap-g-input">
                <h2 className="k-h2"><Ikon nama="edit" ukuran={18} />Input harian</h2>
                {!isUp3 && (
                  <InputCuaca nilai={cuaca} ubah={ubah} onUbah={(v) => { setCuaca(v); setKotor(true); }} />
                )}
                <div className="k-subjudul">
                  <span>{isUp3 ? 'C4A LAPORAN UP3' : 'C4A UIW / CARE FOR ASSET'}</span>
                  <span>{daftar.length}/{MAKS_C4A}</span>
                </div>
                {bisaUbah && galatMaster && (
                  <p className="k-pesan k-pesan--galat">
                    Master penyulang/section gagal dimuat: {galatMaster}{' '}
                    <button type="button" className="k-tautan" onClick={() => muatJaringan(true)}>Coba lagi</button>
                  </p>
                )}
                {daftar.length === 0 ? (
                  <p className="k-kosong">{isUp3 ? 'Belum ada C4A UP3. Di laporan tampil "- Nihil".' : 'Belum ada C4A UIW. Di laporan tampil "-".'}</p>
                ) : isUp3 ? (
                  <TabelUp3 daftar={daftar} ubah={ubah} jaringan={jaringan} galatKolom={galatKolom} onUbah={ubahBaris} onHapus={hapusBaris} />
                ) : (
                  <TabelUiw daftar={daftar} ubah={ubah} jaringan={jaringan} galatKolom={galatKolom} onUbah={ubahBaris} onHapus={hapusBaris} />
                )}
                {bisaUbah && (
                  <>
                    <div className="k-bawah">
                      <button type="button" className="k-tombol k-tombol--garis" onClick={tambahBaris} disabled={!ubah || daftar.length >= MAKS_C4A}>
                        <Ikon nama="tambah" ukuran={16} />Tambah C4A {bagian}
                      </button>
                      <span className="k-spasi" />
                      {kotor && (
                        <button type="button" className="k-tombol k-tombol--teks" onClick={batalkan} disabled={menyimpan}>Batalkan perubahan</button>
                      )}
                      <button type="button" className="k-tombol k-tombol--utama" onClick={simpan} disabled={menyimpan}>
                        {menyimpan ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}
                        {menyimpan ? 'Menyimpan...' : 'Simpan ' + bagian + (kotor ? ' *' : '')}
                      </button>
                    </div>
                    <p className="k-catatan">Baris yang dihapus baru hilang dari laporan setelah Simpan. Simpan juga mencatat salinan teks laporan ini di sheet harian.</p>
                  </>
                )}
                <div role="status" aria-live="polite">
                  {info && <p className={'k-pesan k-pesan--' + info.jenis}>{info.teks}</p>}
                </div>
              </section>

              {Array.isArray(data.statusTim) && <KartuStatus data={data} />}

            <KartuWa data={data} bagian={bagian} kotor={kotor} />
          </div>
        </>
      )}
    </div>
  );
}

function Banner({ data, bisaUbah }) {
  let teks = '';
  if (data.tertunda === true) {
    teks = bisaUbah ? 'Simpan terakhir belum selesai. Periksa isian lalu tekan Simpan supaya laporan final.'
      : 'Simpan terakhir belum selesai. Laporan ini belum final.';
  } else if (data.sumber === 'ARSIP') {
    teks = 'Lebih dari 7 hari: ini salinan terakhir yang disimpan. Hanya lihat.';
  } else if (!bisaUbah) {
    teks = data.hariIni ? 'Akun ini hanya bisa melihat laporan.' : 'Tanggal lewat: hanya lihat. Input hanya untuk hari ini.';
  }
  if (!teks) return null;
  return <p className="k-banner"><Ikon nama="mata" ukuran={17} />{teks}</p>;
}

function InputCuaca({ nilai, ubah, onUbah }) {
  return (
    <div className="lap-cuaca">
      <label className="k-label" htmlFor="lap-cuaca">Cuaca</label>
      {ubah ? (
        <>
          <input id="lap-cuaca" className="k-input" value={nilai} maxLength={40} placeholder="mis. Cerah" onChange={(e) => onUbah(e.target.value)} />
          <div className="k-chip-baris">
            {PRESET_CUACA.map((p) => (
              <button key={p} type="button" className={'k-chip' + (nilai === p ? ' k-chip--aktif' : '')} aria-pressed={nilai === p}
                onClick={() => onUbah(p)}>{p}</button>
            ))}
          </div>
        </>
      ) : (
        <p id="lap-cuaca" className="k-nilai">{nilai || '-'}</p>
      )}
    </div>
  );
}

/** Sel teks / angka: input saat bisa ubah, teks biasa saat hanya lihat. */
function Sel({ b, k, label, ubah, galatKolom, onUbah, maks, angka, lebar }) {
  if (!ubah) return <td className={angka ? 'k-angka' : ''}>{b[k] === '' ? '-' : b[k]}</td>;
  const g = galatKolom(b, k);
  return (
    <td>
      <input className={'k-input' + (angka ? ' k-input--angka' : '') + (g ? ' k-input--galat' : '')} style={lebar ? { width: lebar } : undefined}
        value={b[k]} maxLength={maks} inputMode={angka ? 'decimal' : undefined} aria-label={label} aria-invalid={!!g} title={g || undefined}
        onChange={(e) => onUbah(b.id, { [k]: e.target.value })} />
      {g && <small className="k-galat">{g}</small>}
    </td>
  );
}

function SelPilih({ b, k, label, nilai, pilihan, galatKolom, onPilih, kosong }) {
  const g = galatKolom(b, k);
  return (
    <td>
      <select className={'k-input' + (g ? ' k-input--galat' : '')} value={nilai} aria-label={label} aria-invalid={!!g}
        onChange={(e) => onPilih(e.target.value)}>
        <option value="">{kosong}</option>
        {pilihan.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
      </select>
      {g && <small className="k-galat">{g}</small>}
    </td>
  );
}

function TombolHapus({ ubah, label, onHapus }) {
  if (!ubah) return null;
  return (
    <td className="lap-aksi-sel">
      <button type="button" className="k-ikon-tombol k-ikon-tombol--hapus" onClick={onHapus} aria-label={'Hapus ' + label} title="Hapus baris">
        <Ikon nama="hapus" ukuran={16} />
      </button>
    </td>
  );
}

function TabelUp3({ daftar, ubah, jaringan, galatKolom, onUbah, onHapus }) {
  const penyulang = useMemo(() => (jaringan ? daftarPenyulang(jaringan) : []), [jaringan]);
  return (
    <div className="k-tabel-bungkus">
      <table className="k-tabel">
        <thead>
          <tr>
            <th>Penyulang</th><th className="k-angka">Realisasi (kmS)</th><th>Temuan</th><th>Tindak lanjut</th><th>Eksekusi (tim)</th>
            <th>Keterangan <small>(tidak masuk WA)</small></th>{ubah && <th aria-label="Aksi" />}
          </tr>
        </thead>
        <tbody>
          {daftar.map((b, i) => {
            const label = 'baris ' + (i + 1);
            const sel = { b, ubah, galatKolom, onUbah };
            const dipakai = new Set(daftar.filter((x) => x.id !== b.id).map((x) => x.penyulang.toLowerCase()));
            return (
              <tr key={b.id}>
                {ubah && b.baru ? (
                  <SelPilih b={b} k="penyulang" label={'Penyulang ' + label} nilai={b.penyulang} galatKolom={galatKolom}
                    kosong={jaringan ? 'Pilih penyulang' : 'Memuat master...'}
                    pilihan={penyulang.filter((p) => p === b.penyulang || !dipakai.has(p.toLowerCase())).map((p) => ({ id: p, nama: p }))}
                    onPilih={(v) => onUbah(b.id, { penyulang: v })} />
                ) : (
                  <td className="lap-kunci" title={ubah ? 'Penyulang tidak bisa diganti. Hapus lalu tambah baris baru.' : undefined}><b>{b.penyulang}</b></td>
                )}
                <Sel {...sel} k="realisasiKms" label={'Realisasi kmS ' + label} angka maks={6} lebar="90px" />
                <Sel {...sel} k="temuan" label={'Temuan ' + label} maks={200} />
                <Sel {...sel} k="tindakLanjut" label={'Tindak lanjut ' + label} maks={200} />
                <Sel {...sel} k="eksekusi" label={'Eksekusi ' + label} maks={100} />
                <Sel {...sel} k="keterangan" label={'Keterangan ' + label} maks={200} />
                <TombolHapus ubah={ubah} label={b.penyulang || label} onHapus={() => onHapus(b.id)} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelUiw({ daftar, ubah, jaringan, galatKolom, onUbah, onHapus }) {
  const penyulang = useMemo(() => (jaringan ? daftarPenyulang(jaringan) : []), [jaringan]);
  const total = daftar.reduce((n, b) => n + (Number(b.jumlahTiang) || 0), 0);
  return (
    <div className="k-tabel-bungkus">
      <table className="k-tabel">
        <thead>
          <tr>
            <th>Penyulang</th><th>Section</th><th className="k-angka">Jumlah tiang</th><th className="k-angka">Panjang (kmS)</th>
            <th className="k-angka">Temuan peralatan</th><th className="k-angka">Temuan ROW</th><th className="k-angka">Eksekusi</th>
            <th>Keterangan</th>{ubah && <th aria-label="Aksi" />}
          </tr>
        </thead>
        <tbody>
          {daftar.map((b, i) => {
            const label = 'baris ' + (i + 1);
            const sel = { b, ubah, galatKolom, onUbah };
            const tiang = Number(b.jumlahTiang);
            const dipakai = new Set(daftar.filter((x) => x.id !== b.id).map((x) => x.sectionId));
            const section = jaringan && b.penyulang ? daftarSection(jaringan, b.penyulang).filter((s) => s.id === b.sectionId || !dipakai.has(s.id)) : [];
            return (
              <tr key={b.id}>
                {ubah && b.baru ? (
                  <>
                    <td>
                      <select className="k-input" value={b.penyulang} aria-label={'Penyulang ' + label}
                        onChange={(e) => onUbah(b.id, { penyulang: e.target.value, sectionId: '', section: '' })}>
                        <option value="">{jaringan ? 'Pilih penyulang' : 'Memuat master...'}</option>
                        {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <SelPilih b={b} k="sectionId" label={'Section ' + label} nilai={b.sectionId} galatKolom={galatKolom} pilihan={section}
                      kosong={b.penyulang ? 'Pilih section' : 'Pilih penyulang dulu'}
                      onPilih={(v) => onUbah(b.id, { sectionId: v, section: section.find((s) => s.id === v)?.nama || '' })} />
                  </>
                ) : (
                  <>
                    <td className="lap-kunci"><b>{b.penyulang}</b></td>
                    <td className="lap-kunci" title={ubah ? 'Section tidak bisa diganti. Hapus lalu tambah baris baru.' : undefined}>{b.section}</td>
                  </>
                )}
                <Sel {...sel} k="jumlahTiang" label={'Jumlah tiang ' + label} angka maks={4} lebar="76px" />
                <td className="k-angka lap-hitung">{tiang > 0 ? kmsTeks(tiang) : '-'}</td>
                <Sel {...sel} k="temuanPeralatan" label={'Temuan peralatan ' + label} angka maks={3} lebar="64px" />
                <Sel {...sel} k="temuanRow" label={'Temuan ROW ' + label} angka maks={3} lebar="64px" />
                <Sel {...sel} k="eksekusi" label={'Eksekusi ' + label} angka maks={3} lebar="64px" />
                <Sel {...sel} k="keterangan" label={'Keterangan ' + label} maks={200} />
                <TombolHapus ubah={ubah} label={b.section || label} onHapus={() => onHapus(b.id)} />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={2}>Total</td><td className="k-angka">{total}</td><td className="k-angka">{kmsTeks(total)}</td><td colSpan={ubah ? 5 : 4} /></tr>
        </tfoot>
      </table>
    </div>
  );
}

const BADGE = {
  SIAP: ['SIAP WA', 'ok'],
  LAPOR: ['PROSES', 'proses'],
  BELUM: ['BELUM LAPOR', 'belum'],
};

function Badge({ status }) {
  const [teks, jenis] = BADGE[status] || ['BELUM DI V2', 'v1'];
  return <span className={'k-badge k-badge--' + jenis}>{teks}</span>;
}

function KartuStatus({ data }) {
  const row = data.row || {};
  const peny = Array.isArray(row.penyulang) ? row.penyulang : [];
  const kom = row.komulatif;
  const htk = data.hartek;
  const penyH = Array.isArray(htk?.penyulang) ? htk.penyulang : [];
  return (
    <section className="hlm-kartu lap-g-status">
      <h2 className="k-h2"><Ikon nama="orang" ukuran={18} />Status tim</h2>
      <ul className="lap-status">
        {data.statusTim.map((t) => <li key={t.timId}><span>{t.nama}</span><Badge status={t.status} /></li>)}
        <li><span>Hartek</span><Badge status={htk?.status || 'V1'} /></li>
        {/* v1.0.35: status dari server (aturan sama Hartek); server lama tanpa `inspeksi` = BELUM DI V2 */}
        <li><span>Inspeksi Jaringan</span><Badge status={data.inspeksi?.jaringan?.status || 'V1'} /></li>
        <li><span>Inspeksi Gardu</span><Badge status={data.inspeksi?.gardu?.status || 'V1'} /></li>
      </ul>

      <div className="k-subjudul"><span>ROW HARI INI (REALISASI / TARGET)</span></div>
      {peny.length === 0 ? <p className="k-kosong">Belum ada eksekusi foto lengkap.</p> : (
        <table className="k-tabel k-tabel--ringkas">
          <thead><tr><th>Penyulang</th><th className="k-angka">Rabas (gawang)</th><th className="k-angka">Tebang (batang)</th></tr></thead>
          <tbody>
            {peny.map((p) => (
              <tr key={p.penyulang}><td>{p.penyulang}</td><td className="k-angka">{p.rabas} / {p.targetRabas}</td><td className="k-angka">{p.tebang} / {p.targetTebang}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {kom && <p className="k-catatan">Komulatif bulan ini: Rabas {kom.rabas} gawang · Tebang {kom.tebang} batang</p>}

      {htk && (
        <>
          <div className="k-subjudul"><span>HARTEK HARI INI</span></div>
          {penyH.length === 0 ? <p className="k-kosong">Belum ada pekerjaan Hartek hari ini.</p> : (
            <table className="k-tabel k-tabel--ringkas">
              <thead><tr><th>Penyulang</th><th className="k-angka">Gardu (unit)</th><th className="k-angka">Jaringan (gawang)</th></tr></thead>
              <tbody>
                {penyH.map((p) => <tr key={p.penyulang}><td>{p.penyulang}</td><td className="k-angka">{p.gardu}</td><td className="k-angka">{p.jaringan}</td></tr>)}
              </tbody>
            </table>
          )}
          {htk.komulatif && <p className="k-catatan">Komulatif bulan ini: Gardu {htk.komulatif.gardu} unit · Jaringan {htk.komulatif.jaringan} gawang</p>}
        </>
      )}
    </section>
  );
}

function KartuWa({ data, bagian, kotor }) {
  const teks = data.waText || '';
  return (
    <section className="hlm-kartu lap-wa lap-g-wa">
      <h2 className="k-h2"><Ikon nama="laporan" ukuran={18} />Teks WA {bagian}</h2>
      {data.tertunda === true && !kotor && <p className="k-peringatan">Belum final: simpan terakhir belum selesai. Jangan kirim teks ini dulu.</p>}
      {kotor && <p className="k-peringatan">Ada perubahan belum disimpan. Simpan dulu supaya teks WA ikut berubah.</p>}
      {teks ? (
        <TeksWa teks={teks} />
      ) : (
        <p className="k-kosong">Belum ada salinan tersimpan untuk tanggal ini.</p>
      )}
    </section>
  );
}
