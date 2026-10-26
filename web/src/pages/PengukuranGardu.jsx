import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NILAI_GARDU } from '../approvalP0.js';
import Dialog, { Konfirmasi } from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { TAB_HI } from '../hiGardu.def.js';
import { aksiMenu } from '../katalog.js';
import { daftarPenyulang, daftarSection } from '../laporan.js';
import { muatMaster } from '../master.js';
import {
  bisaUpdateUkur, cariGardu, dataUpdateUkur, galatHi, isianBerubah, jenisKategori, MAKS_DAFTAR, MENU_UKUR, nilaiAwalHi, payloadHi,
  pilihanIsian, ringkasHasilHi, sudahDiMaster,
} from '../pengukuranGardu.js';
import { pesan } from '../pesan.js';
import './pengukuranGardu.css';

const kodeGalat = (e) => (e && e.kode) || 'JARINGAN';
const BATAS_MS = 60000;
const angka = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(v) : '-');
const tglId = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(m[0] + 'T00:00:00Z')) : (iso || '-');
};

/**
 * Pengukuran Gardu (menu OPS_PENGUKURAN_GARDU), mirror HP pengukuran_gardu_screen + riwayat_gardu_screen untuk layar lebar,
 * ditambah form Update Data Gardu v1 (HI) yang menulis ke 3 file sheet lama + db_Gardu (getHiGardu / updateHiGardu).
 */
export default function PengukuranGardu({ api, sesi, penjaga }) {
  const bolehUbah = aksiMenu(sesi, MENU_UKUR) === 'UBAH';
  const [gardu, setGardu] = useState(null);
  const [galatMuat, setGalatMuat] = useState('');
  const [kata, setKata] = useState('');
  const [status, setStatus] = useState('AKTIF');
  const [pilihId, setPilihId] = useState(null);

  const muat = useCallback(async (segar = false) => {
    setGalatMuat('');
    try { setGardu(await muatMaster(api, sesi.token, 'gardu', { segar })); } catch (e) { setGalatMuat(pesan(kodeGalat(e))); }
  }, [api, sesi.token]);
  useEffect(() => { muat(); }, []);
  useEffect(() => () => { penjaga.current = false; }, [penjaga]);

  const hasil = useMemo(() => (gardu ? cariGardu(gardu, kata, status) : []), [gardu, kata, status]);
  const pilih = gardu?.find((g) => g.id === pilihId) || null;
  const gantiGardu = (id) => {
    if (id === pilihId) return;
    if (penjaga.current && !window.confirm('Ada perubahan data gardu yang belum disimpan. Tinggalkan?')) return;
    penjaga.current = false;
    setPilihId(id);
  };
  /** Hasil update (riwayat -> master / form HI) memperbarui baris gardu di daftar. */
  const perbaruiGardu = (g) => { if (g) setGardu((l) => l.map((x) => (x.id === g.id ? { ...x, ...g } : x))); };

  return (
    <div className="hlm pg">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Pengukuran Gardu</h1>
          <p>Data gardu, riwayat pengukuran 3 sumber, update ke Master Gardu dan ke 3 sheet HI seperti v1</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => { setGardu(null); muat(true); }} disabled={!gardu && !galatMuat}>
            <Ikon nama="ulang" ukuran={16} />Muat ulang master
          </button>
        </div>
      </header>

      {!gardu && !galatMuat && <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat master gardu" /><p>Memuat Master Gardu...</p></div>}
      {!gardu && galatMuat && (
        <div className="k-tengah k-tengah--galat" role="alert">
          <Ikon nama="peringatan" ukuran={30} /><b>Master Gardu belum bisa dimuat</b><p>{galatMuat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => muat(true)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
        </div>
      )}

      {gardu && (
        <div className="pg-grid">
          <aside className="pg-kiri">
            <div className="pg-cari">
              <label className="k-cari pg-cari-isi">
                <Ikon nama="cari" ukuran={16} />
                <input type="search" value={kata} onChange={(e) => setKata(e.target.value)} placeholder="No gardu, alamat, penyulang" aria-label="Cari gardu" />
              </label>
              <select className="k-input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status gardu">
                <option value="AKTIF">Aktif</option><option value="TIDAK AKTIF">Tidak aktif</option><option value="">Semua</option>
              </select>
            </div>
            <p className="pg-jumlah">{hasil.length} gardu{hasil.length > MAKS_DAFTAR ? ' · tampil ' + MAKS_DAFTAR + ' pertama, persempit pencarian' : ''}</p>
            <nav className="pg-daftar" aria-label="Daftar gardu">
              {hasil.slice(0, MAKS_DAFTAR).map((g) => (
                <button key={g.id} type="button" className={'pg-item' + (g.id === pilihId ? ' pg-item--pilih' : '')} aria-current={g.id === pilihId}
                  onClick={() => gantiGardu(g.id)}>
                  <span className="pg-item-atas"><b>{g.no}</b>{g.kva ? <small>{angka(g.kva)} kVA</small> : null}</span>
                  <span className="pg-item-alamat">{g.alamat || '-'}</span>
                  <span className="pg-item-meta">
                    {[g.penyulang, g.section].filter(Boolean).join(' · ')}
                    {typeof g.persen === 'number' && <em className={'pg-persen pg-persen--' + jenisKategori(g.kategori)}> {angka(g.persen, 1)}%</em>}
                  </span>
                </button>
              ))}
              {!hasil.length && <p className="k-kosong">Tidak ada gardu yang cocok.</p>}
            </nav>
          </aside>
          {pilih ? (
            <DetailGardu key={pilih.id} g={pilih} api={api} sesi={sesi} bolehUbah={bolehUbah} penjaga={penjaga} onGardu={perbaruiGardu} />
          ) : (
            <div className="k-tengah pg-kosong"><Ikon nama="penggaris" ukuran={34} /><p>Pilih gardu di kiri untuk melihat data, riwayat pengukuran, dan update data.</p></div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- detail ----------------

const TAB_DETAIL = [['ringkas', 'Ringkasan'], ['ukur', 'Riwayat pengukuran'], ['temuan', 'Temuan & perbaikan'], ['ba', 'Berita acara'], ['hi', 'Update data (3 sheet)']];

function DetailGardu({ g, api, sesi, bolehUbah, penjaga, onGardu }) {
  const [tab, setTab] = useState('ringkas');
  const [r, setR] = useState(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setR((await api('getRiwayatGardu', { garduId: g.id, noGardu: g.no }, { batasMs: BATAS_MS })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api, g.id, g.no]);
  useEffect(() => { muat(); }, [muat]);

  const gTerkini = r?.gardu || g;
  const gantiTab = (t) => {
    if (tab === 'hi' && t !== 'hi' && penjaga.current && !window.confirm('Ada perubahan data gardu yang belum disimpan. Tinggalkan?')) return;
    if (t !== 'hi') penjaga.current = false;
    setTab(t);
  };
  const jumlah = { ukur: r?.pengukuran?.length, temuan: r?.temuan?.length, ba: r?.ba?.length };

  return (
    <section className="hlm-kartu pg-detail" aria-label={'Gardu ' + g.no}>
      <header className="pg-kepala">
        <div>
          <h2>{g.no} <span className={'k-badge k-badge--' + (g.status === 'AKTIF' ? 'ok' : 'v1')}>{g.status}</span></h2>
          <p>{gTerkini.alamat || '-'}</p>
          <p className="pg-kepala-sub">{[gTerkini.penyulang, gTerkini.section].filter(Boolean).join(' · ')}{gTerkini.kva ? ' · ' + angka(gTerkini.kva) + ' kVA' : ''}{gTerkini.merk ? ' · ' + gTerkini.merk : ''}</p>
        </div>
        <button type="button" className="k-tombol k-tombol--garis" onClick={muat} disabled={memuat}>
          {memuat && r ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
        </button>
      </header>
      <div className="k-tab pg-tab" role="tablist" aria-label="Bagian data gardu">
        {TAB_DETAIL.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={'k-tab-tombol' + (tab === id ? ' k-tab-tombol--aktif' : '')} onClick={() => gantiTab(id)}>
            {label}{jumlah[id] !== undefined && <span>{jumlah[id]}</span>}
          </button>
        ))}
      </div>

      {tab === 'hi' ? (
        <FormHi g={g} api={api} sesi={sesi} bolehUbah={bolehUbah} penjaga={penjaga} onGardu={(x) => { onGardu(x); muat(); }} />
      ) : !r && memuat ? (
        <div className="k-tengah pg-dalam"><SisiLoader ukuran={44} label="Memuat riwayat" /><p>Memuat riwayat gardu...</p></div>
      ) : !r ? (
        <div className="k-tengah k-tengah--galat pg-dalam" role="alert"><b>Riwayat belum bisa dimuat</b><p>{galat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={muat}>Coba lagi</button></div>
      ) : (
        <>
          {galat && <p className="k-pesan k-pesan--galat">{galat} Data dari pemuatan sebelumnya.</p>}
          {tab === 'ringkas' && <Ringkasan g={gTerkini} />}
          {tab === 'ukur' && <RiwayatUkur r={r} api={api} bolehUbah={bolehUbah}
            onMaster={(h) => { setR({ ...r, gardu: h.gardu, terbaru: h.terbaru }); onGardu(h.gardu); }} />}
          {tab === 'temuan' && <Temuan list={r.temuan || []} />}
          {tab === 'ba' && <DaftarBa list={r.ba || []} />}
        </>
      )}
    </section>
  );
}

function BlokUkur({ judul, b }) {
  if (!b || !b.tglUkur) return <div className="pg-blok pg-blok--kosong"><h3>{judul}</h3><p>Belum ada pengukuran {judul} di Master Gardu.</p></div>;
  const u = b.ukur || {};
  return (
    <div className="pg-blok">
      <h3>{judul} <span className={'k-badge k-badge--' + jenisKategori(b.kategori)}>{b.kategori || '-'}</span></h3>
      <p className="pg-blok-utama"><b>{angka(b.bebanKva, 2)} kVA</b> · {angka(b.persen, 1)}%</p>
      <p className="pg-blok-sub">{tglId(b.tglUkur)}{b.kodeUkur ? ' · ' + b.kodeUkur : ''}{b.sumberUkur ? ' · ' + b.sumberUkur : ''}</p>
      <div className="pg-nilai">{NILAI_GARDU.map((v) => <span key={v.kunci}><small>{v.label}</small>{angka(u[v.kunci], 1)} {v.satuan}</span>)}</div>
    </div>
  );
}

function Ringkasan({ g }) {
  const c = g.cover;
  const trafo = [
    ['Konstruksi', g.konstruksi], ['Merk', g.merk], ['Kapasitas', g.kva ? angka(g.kva) + ' kVA' : ''], ['No seri', g.seri], ['Tahun', g.tahun],
    ['Jurusan', g.jurusan], ['PHB-TR', [g.merkPhb, g.seriPhb, g.tahunPhb].filter(Boolean).join(' · ')], ['Kepemilikan', g.kepemilikan],
    ['Koordinat', typeof g.lat === 'number' ? <a href={'https://www.google.com/maps?q=' + g.lat + ',' + g.lng} target="_blank" rel="noopener noreferrer">{g.lat}, {g.lng}</a> : ''],
    ['Operasi', g.tglOperasi ? tglId(g.tglOperasi) + (g.baOperasi ? ' · ' + g.baOperasi : '') : ''],
    ['BA terakhir', g.baTerakhir ? g.jenisBaTerakhir + ' · ' + tglId(g.tglBaTerakhir) : ''],
  ];
  return (
    <div className="pg-ringkas">
      <div className="pg-blok-grid"><BlokUkur judul="WBP" b={g} /><BlokUkur judul="LWBP" b={g.lwbp} /></div>
      <h3 className="k-subjudul"><span>DATA TRAFO</span></h3>
      <dl className="k-rincian pg-rincian">{trafo.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '-'}</dd></div>)}</dl>
      <h3 className="k-subjudul"><span>COVER GARDU</span>{c && <span>{tglId(c.tanggal)}</span>}</h3>
      {c ? (
        <dl className="k-rincian pg-rincian">
          {[['FCO atas', c.coverFcoAtas], ['FCO bawah', c.coverFcoBawah], ['Bushing TM', c.coverBushingTm], ['Bushing TR', c.coverBushingTr],
            ['Arrester', c.coverArrester], ['Jumperan atas', c.jumperanAtas], ['Jumperan bawah', c.jumperanBawah]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || '-'}</dd></div>)}
        </dl>
      ) : <p className="k-kosong">Belum ada data cover.</p>}
    </div>
  );
}

function RiwayatUkur({ r, api, bolehUbah, onMaster }) {
  const [periode, setPeriode] = useState('');
  const [yakin, setYakin] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const list = (r.pengukuran || []).filter((u) => !periode || u.periode === periode);
  const n = (p) => (r.pengukuran || []).filter((u) => u.periode === p).length;

  const jalankan = async () => {
    setSibuk(true); setGalat('');
    try {
      const h = (await api('updateUkurMasterGardu', dataUpdateUkur(r.gardu, yakin.u), { batasMs: BATAS_MS })).data;
      onMaster(h);
      setInfo('Pengukuran ' + (yakin.u.kode || '') + ' (' + yakin.u.periode + ') jadi pengukuran terbaru Master Gardu.');
      setYakin(null);
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setSibuk(false);
  };

  return (
    <div>
      <div className="pg-alat">
        <div className="k-tab" role="tablist" aria-label="Periode">
          {[['', 'Semua', (r.pengukuran || []).length], ['LWBP', 'LWBP', n('LWBP')], ['WBP', 'WBP', n('WBP')]].map(([p, l, j]) => (
            <button key={p} type="button" role="tab" aria-selected={periode === p} className={'k-tab-tombol' + (periode === p ? ' k-tab-tombol--aktif' : '')} onClick={() => setPeriode(p)}>{l}<span>{j}</span></button>
          ))}
        </div>
        {!r.gardu && <span className="k-catatan">Gardu tidak ada di db_Gardu: update ke master tidak tersedia.</span>}
      </div>
      <div role="status" aria-live="polite">{info && <p className="k-pesan k-pesan--ok">{info}</p>}</div>
      {!list.length ? <p className="k-kosong">Belum ada pengukuran.</p> : (
        <div className="k-tabel-bungkus">
          <table className="k-tabel pg-tabel">
            <thead><tr><th>Tanggal</th><th>Periode</th><th>Sumber</th><th className="k-angka">R / S / T / N (A)</th><th className="k-angka">kVA</th><th className="k-angka">%</th><th>Kategori</th><th /></tr></thead>
            <tbody>
              {list.map((u, i) => (
                <tr key={(u.ukurId || u.kode || '') + u.periode + i}>
                  <td className="pg-nowrap">{tglId(u.tanggal)}{u.jam && <small> {u.jam}</small>}</td>
                  <td><span className={'k-badge ' + (u.periode === 'WBP' ? 'pg-badge-wbp' : 'pg-badge-lwbp')}>{u.periode || '-'}</span></td>
                  <td>{u.sumber}<small className="pg-kode">{[u.kode, u.petugas].filter(Boolean).join(' · ')}</small></td>
                  <td className="k-angka pg-nowrap">{[u.bebanR, u.bebanS, u.bebanT, u.bebanN].map((v) => angka(v, 1)).join(' / ')}</td>
                  <td className="k-angka">{angka(u.kva, 2)}</td>
                  <td className="k-angka">{angka(u.persen, 1)}</td>
                  <td><span className={'k-badge k-badge--' + jenisKategori(u.kategori)}>{u.kategori || '-'}</span></td>
                  <td className="pg-nowrap">
                    {sudahDiMaster(r.gardu, u) ? <span className="pg-di-master"><Ikon nama="centang" ukuran={14} />Di master</span>
                      : bolehUbah && r.gardu && bisaUpdateUkur(u) && (
                        <button type="button" className="k-tombol k-tombol--garis pg-tombol-kecil" onClick={() => { setGalat(''); setInfo(''); setYakin({ u }); }}>Update ke master</button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Konfirmasi sibuk={sibuk} galat={galat} onTutup={() => setYakin(null)} onYa={jalankan}
        k={yakin && { judul: 'Update pengukuran Master Gardu?', tombol: 'Update',
          teks: yakin.u.sumber + ' · ' + yakin.u.periode + ' · ' + tglId(yakin.u.tanggal) + (yakin.u.kode ? ' · ' + yakin.u.kode : '') +
            '\n\nPengukuran ini menjadi pengukuran ' + yakin.u.periode + ' terbaru di Master Gardu (db_Gardu), juga kalau tanggalnya lebih lama.' }} />
    </div>
  );
}

function Temuan({ list }) {
  if (!list.length) return <p className="k-kosong">Belum ada temuan untuk gardu ini.</p>;
  return (
    <div className="pg-kartu-daftar">
      {list.map((t) => (
        <article key={t.temuanId} className="pg-temuan">
          <header><b>{t.jenisTemuan || 'Temuan'}</b><span className="k-badge k-badge--v1">{t.status || '-'}</span></header>
          <p className="pg-blok-sub">{tglId(t.tanggal)} · {t.kodeTemuan}{t.timInspeksi ? ' · ' + t.timInspeksi : ''}</p>
          {t.deskripsi && <p>{t.deskripsi}</p>}
          {(t.timTindakLanjut || t.tindakLanjut) && <p className="pg-blok-sub">Tindak lanjut: {[t.timTindakLanjut, t.tindakLanjut, t.waktuSelesai].filter(Boolean).join(' · ')}</p>}
          {t.perbaikan?.length > 0 && (
            <ul>{t.perbaikan.map((p, i) => <li key={i}>{tglId(p.tanggal)} · {p.tim} · {p.pekerjaan}{p.jumlah ? ' ' + angka(p.jumlah) + ' ' + (p.satuan || '') : ''} · {p.status}</li>)}</ul>
          )}
        </article>
      ))}
    </div>
  );
}

function DaftarBa({ list }) {
  if (!list.length) return <p className="k-kosong">Belum ada Berita Acara untuk gardu ini.</p>;
  return (
    <div className="k-tabel-bungkus">
      <table className="k-tabel">
        <thead><tr><th>Tanggal</th><th>Jenis pekerjaan</th><th>No BA</th><th>Trafo sebelum → sesudah</th><th>Status</th></tr></thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.baId || b.noBa}>
              <td className="pg-nowrap">{tglId(b.tanggalBa)}</td>
              <td>{b.jenisPekerjaan}</td>
              <td className="pg-kode-sel">{b.noBa}</td>
              <td>{[b.trafo, b.trafoSesudah].map((t) => [t.merk, t.kva && angka(t.kva) + ' kVA', t.tahun].filter(Boolean).join(' ') || '-').join(' → ')}</td>
              <td className="pg-nowrap"><span className="k-badge k-badge--v1">{b.statusBa || '-'}</span>{b.statusTtd && <small> TTD {b.statusTtd}</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- form Update Data Gardu (HI v1, 3 sheet) ----------------

function FormHi({ g, api, sesi, bolehUbah, penjaga, onGardu }) {
  const [h, setH] = useState(null);
  const [awal, setAwal] = useState({});
  const [nilai, setNilai] = useState({});
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [sub, setSub] = useState(TAB_HI[0].id);
  const [jaringan, setJaringan] = useState([]);
  const [sibuk, setSibuk] = useState(false);
  const [coba, setCoba] = useState(false);
  const [galat, setGalat] = useState('');
  const [hasil, setHasil] = useState(null);
  const urut = useRef(0);

  const muat = useCallback(async () => {
    const no = ++urut.current;
    setMemuat(true); setGalatMuat('');
    try {
      const d = (await api('getHiGardu', { noGardu: g.no }, { batasMs: BATAS_MS })).data;
      if (no !== urut.current) return;
      const n = nilaiAwalHi(d);
      setH(d); setAwal(n); setNilai(n); setCoba(false);
    } catch (e) { if (no === urut.current) setGalatMuat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api, g.no]);
  useEffect(() => { muat(); muatMaster(api, sesi.token, 'jaringan').then(setJaringan, () => {}); }, [muat]);

  const berubah = useMemo(() => isianBerubah(awal, nilai), [awal, nilai]);
  const galatKolom = useMemo(() => galatHi(nilai), [nilai]);
  const kotor = berubah.length > 0;
  useEffect(() => {
    penjaga.current = kotor;
    if (!kotor) return undefined;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', tahan);
    return () => window.removeEventListener('beforeunload', tahan);
  }, [kotor, penjaga]);

  const ubah = (col, v) => setNilai((n) => ({ ...n, [col]: v, ...(col === 'E' ? { F: '' } : {}) }));
  const simpan = async () => {
    setCoba(true); setGalat('');
    if (Object.keys(galatKolom).length) { setGalat('Ada isian angka yang belum benar (ditandai merah).'); return; }
    setSibuk(true);
    try {
      const r = (await api('updateHiGardu', payloadHi(h.noGardu, h.revision, awal, nilai), { batasMs: BATAS_MS })).data;
      // nilai dari db_Gardu sesudah simpan (mis. angka disimpan sebagai angka, section resmi db_Jaringan)
      const n = nilaiAwalHi(r);
      setHasil(r);
      setH({ ...h, revision: r.revision, sinkron: r.sinkron });
      setAwal(n);
      setNilai(n);
      penjaga.current = false;
      if (r.gardu) onGardu(r.gardu);
    } catch (e) {
      const kode = kodeGalat(e);
      setGalat(kode === 'KONFLIK_REVISION' ? 'Data gardu ini sudah diubah (admin lain / HP) sejak form dibuka. Muat ulang form, lalu isi lagi.' : pesan(kode) + ' Belum tersimpan, isian masih di layar.');
    }
    setSibuk(false);
  };

  if (!h && memuat) return <div className="k-tengah pg-dalam"><SisiLoader ukuran={44} label="Memuat data gardu" /><p>Membaca data gardu dari db_Gardu...</p></div>;
  if (!h) {
    return (
      <div className="k-tengah k-tengah--galat pg-dalam" role="alert"><b>Data gardu belum bisa dimuat</b><p>{galatMuat}</p>
        <button type="button" className="k-tombol k-tombol--utama" onClick={muat}>Coba lagi</button></div>
    );
  }
  const tab = TAB_HI.find((t) => t.id === sub);
  const opsi = (f) => {
    if (f.col === 'E') return pilihanIsian(daftarPenyulang(jaringan), nilai.E);
    if (f.col === 'F') return pilihanIsian(daftarSection(jaringan, nilai.E).map((s) => s.nama), nilai.F);
    return pilihanIsian(f.pilihan, nilai[f.col]);
  };
  const ubahPerTab = (t) => t.seksi.flatMap((s) => s.fields).filter((f) => berubah.includes(f.col)).length;

  return (
    <div className="pg-hi">
      <p className="k-catatan pg-hi-info">
        Sumber utama: <b>db_Gardu</b>. Simpan menulis db_Gardu, lalu gardu ini langsung ditulis ke <b>Master HI Toboali</b>, <b>Master HI HP</b>{' '}
        dan <b>Master HI UP3</b> (mengikuti db_Gardu). Sinkron sheet lama terakhir: {h.sinkron?.waktu ? new Date(h.sinkron.waktu).toLocaleString('id-ID') : 'belum pernah'}.
      </p>
      {galatMuat && <p className="k-pesan k-pesan--galat">{galatMuat}</p>}
      <div className="pg-hi-tab" role="tablist" aria-label="Kelompok isian">
        {TAB_HI.map((t) => {
          const n = ubahPerTab(t);
          return (
            <button key={t.id} type="button" role="tab" aria-selected={sub === t.id} className={'k-chip' + (sub === t.id ? ' k-chip--aktif' : '')} onClick={() => setSub(t.id)}>
              {t.label}{n > 0 && <b className="pg-hi-ubah-jml"> {n}</b>}
            </button>
          );
        })}
      </div>
      <fieldset className="pg-hi-isi" disabled={!bolehUbah || sibuk}>
        {tab.seksi.map((s) => (
          <section key={s.judul} className="pg-hi-seksi">
            <h3>{s.judul}</h3>
            <div className="pg-hi-grid">
              {s.fields.map((f) => {
                const ganti = berubah.includes(f.col), g2 = coba || ganti ? galatKolom[f.col] : '';
                const kelas = 'k-input' + (ganti ? ' pg-ubah' : '') + (g2 ? ' k-input--galat' : '') + (f.tipe === 'number' ? ' k-input--angka' : '');
                return (
                  <label key={f.col} className={'k-medan pg-hi-f' + (f.lebar ? ' pg-hi-f--' + f.lebar : '')}>
                    <span className="k-label">{f.label}{ganti && <i className="pg-titik-ubah" title={'Sebelumnya: ' + (awal[f.col] || '(kosong)')} />}</span>
                    {f.tipe === 'select' ? (
                      <select className={kelas} value={nilai[f.col]} disabled={f.mati} onChange={(e) => ubah(f.col, e.target.value)}>
                        <option value="">-</option>
                        {opsi(f).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className={kelas} type={f.tipe === 'number' ? 'text' : (f.tipe || 'text')} inputMode={f.tipe === 'number' ? 'decimal' : undefined}
                        value={nilai[f.col]} disabled={f.mati} placeholder={f.placeholder} maxLength={200} onChange={(e) => ubah(f.col, e.target.value)} aria-invalid={!!g2} />
                    )}
                    {g2 && <small className="k-galat">{g2}</small>}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </fieldset>
      {bolehUbah && (
        <footer className="pg-hi-aksi">
          <span className="pg-hi-status">{kotor ? berubah.length + ' isian berubah' : 'Belum ada perubahan'}</span>
          <span className="k-spasi" />
          {galat && <span className="k-galat pg-hi-galat" role="alert">{galat}</span>}
          {kotor && <button type="button" className="k-tombol k-tombol--teks" onClick={() => setNilai(awal)} disabled={sibuk}>Batalkan perubahan</button>}
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => { if (!kotor || window.confirm('Perubahan akan hilang. Muat ulang?')) muat(); }} disabled={sibuk || memuat}>Muat ulang</button>
          <button type="button" className="k-tombol k-tombol--utama" onClick={simpan} disabled={sibuk || !kotor}>
            {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}{sibuk ? 'Menyimpan ke 3 sheet...' : 'Simpan ke 3 sheet'}
          </button>
        </footer>
      )}
      <DialogHasil r={hasil} onTutup={() => setHasil(null)} />
    </div>
  );
}

/**
 * Hasil simpan: db_Gardu dulu (sumber utama, sudah tersimpan), lalu 3 file sheet lama yang mengikutinya (seperti popup v1:
 * nama gsheet + centang, rincian per tab). File yang gagal disusul sinkron harian 05:00.
 */
function DialogHasil({ r, onTutup }) {
  const ringkas = r ? ringkasHasilHi(r.sheet?.hasil) : [];
  return (
    <Dialog buka={!!r} judul="Data gardu tersimpan" sub={r && r.noGardu + ' · db_Gardu ' + r.db.jumlah + ' kolom diperbarui'} lebar="min(560px, calc(100vw - 32px))" onTutup={onTutup}>
      {r && (
        <>
          <ul className="pg-hasil">
            <li className="pg-hasil--ok">
              <div className="pg-hasil-kepala">
                <Ikon nama="centangLingkaran" ukuran={20} /><b>db_Gardu (sumber utama)</b>
                <span>{r.db.jumlah ? r.db.jumlah + ' kolom' : 'tidak ada perubahan'}</span>
              </div>
            </li>
            {ringkas.map((f) => (
              <li key={f.nama} className={f.ok ? 'pg-hasil--ok' : f.lewat ? 'pg-hasil--lewat' : 'pg-hasil--gagal'}>
                <div className="pg-hasil-kepala">
                  <Ikon nama={f.ok ? 'centangLingkaran' : 'peringatan'} ukuran={20} />
                  <b>{f.nama}</b>
                  <span>{f.ok ? f.jumlah + ' sel' : f.lewat ? 'belum diatur' : 'sebagian gagal'}</span>
                </div>
                <ul>
                  {f.tab.map((t) => (
                    <li key={t.tab}>
                      {t.tab}: {t.ok ? t.jumlah + ' sel' + (t.disisipkan ? ', baris baru dibuat' : '') + (t.rumus ? ', ' + t.rumus + ' sel formula dilewati' : '') : (t.lewat || t.pesan)}
                      {t.peringatan?.map((p) => <small key={p}>{p}</small>)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {!r.sheet?.ok && <p className="k-peringatan" style={{ margin: 0 }}>Sheet lama yang belum tertulis akan disusul otomatis oleh sinkron harian 05:00. Data di db_Gardu sudah aman.</p>}
          <div className="k-dialog-aksi"><button type="button" className="k-tombol k-tombol--utama" onClick={onTutup} autoFocus>Tutup</button></div>
        </>
      )}
    </Dialog>
  );
}
