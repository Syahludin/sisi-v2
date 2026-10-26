import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Dialog, { Konfirmasi } from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import TeksWa from '../components/TeksWa.jsx';
import {
  aksiJadwal, angkaId, bulanDari, dampak, daftarPenyulangJp, daftarSectionJp, durasiTeks, gabungJadwal, galatIsi, geserBulan,
  gridBulan, isiAwal, labelBulan, labelTanggalJp, MAKS_JENIS, MAKS_LOKASI, MENU_JP, payloadJadwal, perTanggal, rentangBulan,
  ringkasJadwal, rupiah, saringJadwal, STATUS_JP, STATUS_PEKERJAAN_JP, tandaKalender,
} from '../jadwalPadam.js';
import { aksiMenu } from '../katalog.js';
import { pesan } from '../pesan.js';
import { hariIniWib } from '../tanggal.js';
import './jadwalPadam.css';

const kodeGalat = (e) => (e && e.kode) || 'JARINGAN';
const BATAS_TULIS_MS = 60000;
const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
/** Galat yang berarti data di layar sudah basi: daftar dimuat ulang. */
const BASI = new Set(['KONFLIK_REVISION', 'JADWAL_TERKUNCI', 'DATA_TIDAK_DITEMUKAN']);

/**
 * Jadwal Padam (menu OPS_JADWAL_PADAM), mirror layar HP jadwal_padam_screen.dart untuk layar lebar: satu bulan dimuat
 * sekali (kalender + ringkasan kiri, tabel per tanggal kanan, saring di browser), jadwal baru / ubah dengan pratinjau
 * dampak dari Master Daerah Padam, tandai Terealisasi / Batal Pemadaman, hapus (hanya Terjadwal), Format WA rentang.
 */
export default function JadwalPadam({ api, sesi }) {
  const bolehUbah = aksiMenu(sesi, MENU_JP) === 'UBAH';
  const hariIni = hariIniWib();
  const [bulan, setBulan] = useState(bulanDari(hariIni));
  const [jadwal, setJadwal] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [master, setMaster] = useState([]);
  const [galatMaster, setGalatMaster] = useState('');
  const [saring, setSaring] = useState({ penyulang: '', status: '', statusPekerjaan: '' });
  const [hari, setHari] = useState('');
  const [detail, setDetail] = useState(null); // jadwal yang dibuka
  const [form, setForm] = useState(null); // { jadwal | null, idBaris }
  const [yakin, setYakin] = useState(null); // { jenis: 'realisasi' | 'batal' | 'hapus', j, judul, teks, tombol, bahaya }
  const [bukaWa, setBukaWa] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galatAksi, setGalatAksi] = useState('');
  const [info, setInfo] = useState(null);
  const urutMuat = useRef(0);

  const muat = useCallback(async (b) => {
    const no = ++urutMuat.current;
    setMemuat(true);
    setGalatMuat('');
    try {
      const j = await api('getJadwalPadam', rentangBulan(b));
      if (no === urutMuat.current) setJadwal(Array.isArray(j.data.jadwal) ? j.data.jadwal : []);
    } catch (e) {
      if (no === urutMuat.current) setGalatMuat(pesan(kodeGalat(e)));
    } finally {
      if (no === urutMuat.current) setMemuat(false);
    }
  }, [api]);

  /** Master Daerah Padam dimuat saat halaman dibuka dan setiap form dibuka (baris master baru langsung muncul). */
  const muatMaster = useCallback(async () => {
    setGalatMaster('');
    try {
      const m = await api('getMasterJadwalPadam', {});
      setMaster(Array.isArray(m.data.daerah) ? m.data.daerah : []);
    } catch (e) {
      setGalatMaster(pesan(kodeGalat(e)));
    }
  }, [api]);

  useEffect(() => { muat(bulan); muatMaster(); }, []);

  const gantiBulan = (b) => {
    setBulan(b);
    setJadwal(null);
    setHari('');
    setInfo(null);
    muat(b);
  };

  const tampil = useMemo(() => saringJadwal(jadwal || [], { ...saring, tanggal: hari }), [jadwal, saring, hari]);
  const tanpaHari = useMemo(() => saringJadwal(jadwal || [], saring), [jadwal, saring]);
  const ringkas = useMemo(() => ringkasJadwal(tanpaHari), [tanpaHari]);
  const tanda = useMemo(() => tandaKalender(tanpaHari), [tanpaHari]);
  const penyulang = useMemo(() => daftarPenyulangJp(master, jadwal || []), [master, jadwal]);
  const adaSaring = saring.penyulang || saring.status || saring.statusPekerjaan || hari;

  /** Satu aksi tulis; hasil server (jadwal baru) masuk ke daftar tanpa muat ulang. */
  const tulis = async (action, data, teksOk, terapkan) => {
    if (sibuk) return false;
    setSibuk(true);
    setGalatAksi('');
    try {
      const r = (await api(action, data, { batasMs: BATAS_TULIS_MS })).data;
      terapkan(r);
      setInfo({ jenis: 'ok', teks: teksOk(r) });
      return true;
    } catch (e) {
      const kode = kodeGalat(e);
      setGalatAksi(pesan(kode) + (BASI.has(kode) ? ' Daftar dimuat ulang.' : ''));
      if (BASI.has(kode)) muat(bulan);
      return false;
    } finally {
      setSibuk(false);
    }
  };

  /** Jadwal hasil simpan masuk ke daftar kalau tanggalnya di bulan yang tampil (pindah bulan = keluar dari daftar). */
  const terapkanJadwal = (j) => setJadwal((l) => {
    const sisa = (l || []).filter((x) => x.jadwalId !== j.jadwalId);
    return bulanDari(j.tanggal) === bulan ? gabungJadwal(sisa, j) : sisa;
  });

  const bukaForm = (j = null) => {
    setDetail(null);
    setGalatAksi('');
    setForm({ jadwal: j, idBaris: globalThis.crypto.randomUUID() });
    muatMaster();
  };

  const simpanForm = async (isi) => {
    const ubah = !!form.jadwal;
    const ok = await tulis(ubah ? 'ubahJadwalPadam' : 'simpanJadwalPadam', payloadJadwal(isi, form), (r) => 'Jadwal ' + r.kode + ' tersimpan.',
      (r) => terapkanJadwal(r.jadwal));
    if (ok) setForm(null);
  };

  const mintaYakin = (jenis, j) => {
    setDetail(null);
    setGalatAksi('');
    const nama = j.kode + ' · ' + j.penyulang + ' ' + j.section + '\n' + labelTanggalJp(j.tanggal) + ', ' + j.jamPadam + '-' + j.jamNyala + ' WIB';
    setYakin({
      realisasi: { jenis, j, judul: 'Tandai terealisasi?', teks: nama + '\n\nSetelah terealisasi jadwal tidak bisa diubah lagi.', tombol: 'Terealisasi' },
      batal: { jenis, j, judul: 'Batalkan pemadaman?', teks: nama + '\n\nJadwal ditandai Batal Pemadaman dan tidak ikut teks WA.', tombol: 'Batalkan pemadaman', bahaya: true },
      hapus: { jenis, j, judul: 'Hapus jadwal padam?', teks: nama, tombol: 'Hapus', bahaya: true },
    }[jenis]);
  };

  const jalankanYakin = async () => {
    const { jenis, j } = yakin;
    const data = { jadwalId: j.jadwalId, revision: Number(j.revision) || 1 };
    const ok = jenis === 'hapus'
      ? await tulis('hapusJadwalPadam', data, () => 'Jadwal ' + j.kode + ' dihapus.',
        () => setJadwal((l) => l.filter((x) => x.jadwalId !== j.jadwalId)))
      : await tulis('ubahStatusJadwalPadam', { ...data, status: jenis === 'realisasi' ? STATUS_JP.realisasi : STATUS_JP.batal },
        (r) => 'Jadwal ' + j.kode + ': ' + r.jadwal.status + '.', (r) => terapkanJadwal(r.jadwal));
    if (ok) setYakin(null);
  };

  const segarkan = () => { if (!memuat && !sibuk) { setInfo(null); muat(bulan); } };

  return (
    <div className="hlm jp">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Jadwal Padam</h1>
          <p>Rencana pemadaman, dampak pelanggan, status, format WA</p>
        </div>
        <div className="hlm-aksi jp-aksi">
          <div className="hlm-aksi">
            <button type="button" className="k-ikon-tombol" onClick={() => gantiBulan(geserBulan(bulan, -1))} disabled={memuat} aria-label="Bulan sebelumnya" title="Bulan sebelumnya">
              <Ikon nama="kiri" ukuran={18} />
            </button>
            <span className="k-tgl jp-bulan" aria-live="polite"><Ikon nama="kalender" ukuran={16} />{labelBulan(bulan)}</span>
            <button type="button" className="k-ikon-tombol" onClick={() => gantiBulan(geserBulan(bulan, 1))} disabled={memuat} aria-label="Bulan berikutnya" title="Bulan berikutnya">
              <Ikon nama="kanan" ukuran={18} />
            </button>
            {bulan !== bulanDari(hariIni) && (
              <button type="button" className="k-tombol k-tombol--garis" onClick={() => gantiBulan(bulanDari(hariIni))} disabled={memuat}>Bulan ini</button>
            )}
          </div>
          <button type="button" className="k-tombol k-tombol--garis" onClick={segarkan} disabled={memuat || sibuk}>
            {memuat && jadwal ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => setBukaWa(true)}><Ikon nama="laporan" ukuran={16} />Format WA</button>
          {bolehUbah && (
            <button type="button" className="k-tombol k-tombol--utama" onClick={() => bukaForm()}><Ikon nama="tambah" ukuran={16} />Jadwal baru</button>
          )}
        </div>
      </header>

      {!bolehUbah && <p className="k-banner"><Ikon nama="mata" ukuran={17} />Akun ini hanya bisa melihat jadwal padam.</p>}
      {galatMaster && (
        <p className="k-pesan k-pesan--galat jp-pesan">Master Daerah Padam gagal dimuat: {galatMaster} <button type="button" className="k-tautan" onClick={muatMaster}>Coba lagi</button></p>
      )}
      <div role="status" aria-live="polite">{info && <p className={'k-pesan k-pesan--' + info.jenis + ' jp-pesan'}>{info.teks}</p>}</div>

      {!jadwal && memuat && <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat jadwal" /><p>Memuat jadwal {labelBulan(bulan)}...</p></div>}
      {!jadwal && !memuat && (
        <div className="k-tengah k-tengah--galat" role="alert">
          <Ikon nama="peringatan" ukuran={30} />
          <b>Jadwal padam belum bisa dimuat</b>
          <p>{galatMuat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => muat(bulan)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
        </div>
      )}

      {jadwal && (
        <div className={'jp-grid' + (memuat ? ' jp-grid--muat' : '')} aria-busy={memuat}>
          <aside className="jp-kiri">
            <Kalender bulan={bulan} hariIni={hariIni} tanda={tanda} hari={hari} onHari={(t) => setHari(t === hari ? '' : t)} />
            <Ringkasan r={ringkas} />
          </aside>

          <section className="hlm-kartu jp-kanan">
            {galatMuat && <p className="k-pesan k-pesan--galat" role="alert">{galatMuat} Data di bawah dari pemuatan sebelumnya.</p>}
            <div className="jp-saring">
              <select className="k-input" value={saring.penyulang} onChange={(e) => setSaring({ ...saring, penyulang: e.target.value })} aria-label="Saring penyulang">
                <option value="">Semua penyulang</option>
                {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="k-input" value={saring.status} onChange={(e) => setSaring({ ...saring, status: e.target.value })} aria-label="Saring status jadwal">
                <option value="">Semua status</option>
                {Object.values(STATUS_JP).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="k-input" value={saring.statusPekerjaan} onChange={(e) => setSaring({ ...saring, statusPekerjaan: e.target.value })} aria-label="Saring status pekerjaan">
                <option value="">Padam + tanpa padam</option>
                {STATUS_PEKERJAAN_JP.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {hari && (
                <button type="button" className="k-chip k-chip--aktif jp-chip-hari" onClick={() => setHari('')} aria-label="Hapus saring tanggal">
                  {labelTanggalJp(hari)}<Ikon nama="tutup" ukuran={13} />
                </button>
              )}
              {adaSaring && (
                <button type="button" className="k-tombol k-tombol--teks" onClick={() => { setSaring({ penyulang: '', status: '', statusPekerjaan: '' }); setHari(''); }}>Hapus saring</button>
              )}
            </div>
            <TabelJadwal tampil={tampil} kosong={jadwal.length ? 'Tidak ada jadwal yang cocok dengan saringan.' : 'Belum ada jadwal padam di ' + labelBulan(bulan) + '.'}
              hariIni={hariIni} onBuka={(j) => { setGalatAksi(''); setDetail(j); }} />
          </section>
        </div>
      )}

      <DialogDetail j={detail} aksi={detail ? aksiJadwal(detail, bolehUbah) : null} onTutup={() => setDetail(null)}
        onUbah={() => bukaForm(detail)} onYakin={(jenis) => mintaYakin(jenis, detail)} />
      <DialogForm f={form} master={master} jadwal={jadwal || []} hariIni={hariIni} bulan={bulan} hari={hari} sibuk={sibuk} galat={galatAksi}
        onTutup={() => setForm(null)} onSimpan={simpanForm} />
      <Konfirmasi k={yakin} sibuk={sibuk} galat={galatAksi} onTutup={() => setYakin(null)} onYa={jalankanYakin} />
      <DialogWa buka={bukaWa} api={api} awal={hari ? { dari: hari, sampai: hari } : rentangBulan(bulan)} penyulangAwal={saring.penyulang}
        penyulang={penyulang} onTutup={() => setBukaWa(false)} />
    </div>
  );
}

// ---------------- kiri: kalender + ringkasan ----------------

function Kalender({ bulan, hariIni, tanda, hari, onHari }) {
  const minggu = gridBulan(bulan);
  return (
    <section className="hlm-kartu jp-kal" aria-label={'Kalender ' + labelBulan(bulan)}>
      <div className="jp-kal-grid jp-kal-kepala">{HARI_PENDEK.map((h) => <span key={h}>{h}</span>)}</div>
      {minggu.map((m, i) => (
        <div key={i} className="jp-kal-grid">
          {m.map((t, k) => {
            if (!t) return <span key={k} />;
            const n = tanda[t];
            const label = labelTanggalJp(t) + (n ? ': ' + n.padam + ' padam, ' + n.tanpa + ' tanpa padam' : ': tidak ada jadwal');
            return (
              <button key={t} type="button" aria-label={label} aria-pressed={hari === t} title={label} onClick={() => onHari(t)}
                className={'jp-kal-hari' + (t === hariIni ? ' jp-kal-hari--ini' : '') + (hari === t ? ' jp-kal-hari--pilih' : '') + (k >= 5 ? ' jp-kal-hari--libur' : '')}>
                {Number(t.slice(8))}
                <span className="jp-kal-tanda">
                  {n?.padam > 0 && <i className="jp-titik jp-titik--padam" />}
                  {n?.tanpa > 0 && <i className="jp-titik jp-titik--tanpa" />}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <p className="jp-kal-legenda"><span><i className="jp-titik jp-titik--padam" />Padam</span><span><i className="jp-titik jp-titik--tanpa" />Tanpa padam</span></p>
    </section>
  );
}

function Ringkasan({ r }) {
  return (
    <section className="hlm-kartu jp-ringkas">
      <h2 className="k-h2"><Ikon nama="listrik" ukuran={18} />Ringkasan</h2>
      <div className="jp-angka">
        <span><small>Jadwal</small><b>{r.total}</b></span>
        <span><small>Terjadwal</small><b>{r.terjadwal}</b></span>
        <span className="jp-angka--ok"><small>Terealisasi</small><b>{r.terealisasi}</b></span>
        <span className="jp-angka--batal"><small>Batal</small><b>{r.batal}</b></span>
      </div>
      <dl className="jp-dampak-ringkas">
        <div><dt>Pemadaman (tanpa yang batal)</dt><dd>{r.padam} jadwal</dd></div>
        <div><dt>Pelanggan terdampak</dt><dd>{angkaId(r.pelanggan)}</dd></div>
        <div><dt>ENS</dt><dd>{rupiah(r.ens)}</dd></div>
      </dl>
    </section>
  );
}

// ---------------- kanan: tabel per tanggal ----------------

const BADGE_STATUS = { [STATUS_JP.jadwal]: 'proses', [STATUS_JP.realisasi]: 'ok', [STATUS_JP.batal]: 'belum' };

function BadgeJp({ j }) {
  return (
    <>
      <span className={'k-badge ' + (j.statusPekerjaan === 'Tanpa Padam' ? 'jp-badge-tanpa' : 'jp-badge-padam')}>{j.statusPekerjaan === 'Tanpa Padam' ? 'TANPA PADAM' : 'PADAM'}</span>
      <span className={'k-badge k-badge--' + (BADGE_STATUS[j.status] || 'v1')}>{j.status === STATUS_JP.batal ? 'BATAL' : j.status.toUpperCase()}</span>
    </>
  );
}

function TabelJadwal({ tampil, kosong, hariIni, onBuka }) {
  if (!tampil.length) return <p className="k-kosong">{kosong}</p>;
  return (
    <div className="k-tabel-bungkus">
      <table className="k-tabel jp-tabel">
        <thead>
          <tr>
            <th>Jam</th><th>Penyulang / section</th><th>Jenis pekerjaan</th><th className="k-angka">Pelanggan</th>
            <th className="k-angka">Durasi</th><th className="k-angka">ENS</th><th>Status</th>
          </tr>
        </thead>
        {perTanggal(tampil).map((g) => (
          <tbody key={g.tanggal}>
            <tr className="jp-tgl-baris">
              <th colSpan={7} scope="rowgroup">
                {(g.isi[0].hari ? g.isi[0].hari + ', ' : '') + labelTanggalJp(g.tanggal)}{g.tanggal === hariIni && <em> · hari ini</em>}
                <small>{g.isi.length} jadwal</small>
              </th>
            </tr>
            {g.isi.map((j) => (
              <tr key={j.jadwalId} className={'jp-baris' + (j.status === STATUS_JP.batal ? ' jp-baris--batal' : '')} onClick={() => onBuka(j)}>
                <td className="jp-jam">{j.jamPadam}–{j.jamNyala}</td>
                <td>
                  <button type="button" className="jp-buka" onClick={(e) => { e.stopPropagation(); onBuka(j); }}>
                    <b>{j.penyulang}</b><span>{j.section}</span>
                  </button>
                </td>
                <td className="jp-jenis">{j.jenis}<small>{j.kode}</small></td>
                <td className="k-angka">{angkaId(j.jumlahPelanggan)}</td>
                <td className="k-angka">{durasiTeks(j.durasi)}</td>
                <td className="k-angka">{rupiah(j.ensRupiah)}</td>
                <td className="jp-status"><BadgeJp j={j} /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ---------------- dialog ----------------

function DialogDetail({ j, aksi, onTutup, onUbah, onYakin }) {
  const baris = j ? [
    ['Tanggal', (j.hari ? j.hari + ', ' : '') + labelTanggalJp(j.tanggal)],
    ['Jam', j.jamPadam + ' – ' + j.jamNyala + ' WIB (' + durasiTeks(j.durasi) + ')'],
    ['Penyulang', j.penyulang], ['Section', j.section], ['Jenis pekerjaan', j.jenis], ['Lokasi pekerjaan', j.lokasi || '-'],
    ['Daerah padam', j.daerah || '-'], ['Jumlah gardu', angkaId(j.jumlahGardu) + ' unit'], ['Jumlah pelanggan', angkaId(j.jumlahPelanggan)],
    ['Pelanggan VIP', j.vip || '-'], ['Beban', (j.bebanA === '' ? '-' : angkaId(j.bebanA, 2) + ' A') + ' · ' + angkaId(j.bebanMw, 2) + ' MW'],
    ['ENS', rupiah(j.ensRupiah)], ['ULP', j.ulp || '-'],
  ] : [];
  const adaAksi = aksi && (aksi.ubah || aksi.realisasi || aksi.batal || aksi.hapus);
  return (
    <Dialog buka={!!j} judul={j?.kode} sub={j && j.penyulang + ' · ' + j.section} lebar="min(620px, calc(100vw - 32px))" onTutup={onTutup}>
      {j && (
        <>
          <div className="jp-detail-badge"><BadgeJp j={j} /></div>
          <dl className="jp-detail">{baris.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {!adaAksi && j.status !== STATUS_JP.jadwal && <p className="k-catatan">Jadwal {j.status.toLowerCase()} terkunci: tidak bisa diubah atau dihapus.</p>}
          <div className="k-dialog-aksi jp-detail-aksi">
            {aksi.hapus && <button type="button" className="k-tombol k-tombol--teks" onClick={() => onYakin('hapus')}><Ikon nama="hapus" ukuran={16} />Hapus</button>}
            <span className="k-spasi" />
            {aksi.batal && <button type="button" className="k-tombol k-tombol--tolak" onClick={() => onYakin('batal')}>Batal padam</button>}
            {aksi.realisasi && <button type="button" className="k-tombol k-tombol--setuju" onClick={() => onYakin('realisasi')}><Ikon nama="centang" ukuran={16} />Terealisasi</button>}
            {aksi.ubah && <button type="button" className="k-tombol k-tombol--utama" onClick={onUbah}><Ikon nama="edit" ukuran={16} />Ubah</button>}
            {!adaAksi && <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup} autoFocus>Tutup</button>}
          </div>
        </>
      )}
    </Dialog>
  );
}

function DialogForm({ f, master, jadwal, hariIni, bulan, hari, sibuk, galat, onTutup, onSimpan }) {
  const [isi, setIsi] = useState(null);
  const [coba, setCoba] = useState(false);

  useEffect(() => {
    if (!f) { setIsi(null); return; }
    const tglAwal = hari || (bulanDari(hariIni) === bulan ? hariIni : bulan + '-01');
    setIsi(isiAwal(f.jadwal, tglAwal));
    setCoba(false);
  }, [f]);

  if (!f || !isi) return <Dialog buka={false} onTutup={onTutup} />;
  const ubah = (o) => setIsi({ ...isi, ...o });
  const galatKolom = galatIsi(master, isi);
  const g = (k) => (coba ? galatKolom[k] : '');
  const penyulang = daftarPenyulangJp(master);
  const section = daftarSectionJp(master, isi.penyulang);
  const d = dampak(master, isi);
  const lain = jadwal.filter((x) => x.tanggal === isi.tanggal && x.jadwalId !== f.jadwal?.jadwalId && x.status !== STATUS_JP.batal);
  const kirim = (e) => {
    e.preventDefault();
    setCoba(true);
    if (!Object.keys(galatKolom).length) onSimpan(isi);
  };

  return (
    <Dialog buka judul={f.jadwal ? 'Ubah jadwal ' + f.jadwal.kode : 'Jadwal padam baru'} sub="Dampak dihitung server dari Master Daerah Padam"
      kunci={sibuk} lebar="min(860px, calc(100vw - 32px))" onTutup={onTutup}>
      <form className="jp-form" onSubmit={kirim} noValidate>
        <div className="jp-form-isi">
          <label className="k-medan">
            <span className="k-label">Penyulang</span>
            <select className={'k-input' + (g('penyulang') ? ' k-input--galat' : '')} value={isi.penyulang} autoFocus
              onChange={(e) => ubah({ penyulang: e.target.value, section: '' })}>
              <option value="">{master.length ? 'Pilih penyulang' : 'Master Daerah Padam kosong'}</option>
              {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {g('penyulang') && <small className="k-galat">{g('penyulang')}</small>}
          </label>
          <label className="k-medan">
            <span className="k-label">Section</span>
            <select className={'k-input' + (g('section') ? ' k-input--galat' : '')} value={isi.section} onChange={(e) => ubah({ section: e.target.value })}>
              <option value="">{isi.penyulang ? 'Pilih section' : 'Pilih penyulang dulu'}</option>
              {section.map((s) => <option key={s} value={s}>{s}</option>)}
              {isi.section && !section.includes(isi.section) && <option value={isi.section}>{isi.section} (tidak ada di master)</option>}
            </select>
            {g('section') && <small className="k-galat">{g('section')}</small>}
          </label>
          <label className="k-medan jp-penuh">
            <span className="k-label">Jenis pekerjaan</span>
            <textarea className={'k-input' + (g('jenis') ? ' k-input--galat' : '')} rows={2} maxLength={MAKS_JENIS} value={isi.jenis}
              onChange={(e) => ubah({ jenis: e.target.value })} placeholder="mis. Pemeliharaan PMT dan pangkas pohon" />
            {g('jenis') && <small className="k-galat">{g('jenis')}</small>}
          </label>
          <label className="k-medan">
            <span className="k-label">Tanggal</span>
            <input type="date" className={'k-input' + (g('tanggal') ? ' k-input--galat' : '')} value={isi.tanggal} onChange={(e) => ubah({ tanggal: e.target.value })} />
            {g('tanggal') && <small className="k-galat">{g('tanggal')}</small>}
          </label>
          <div className="jp-jam-isi">
            <label className="k-medan">
              <span className="k-label">Jam padam</span>
              <input type="time" className={'k-input' + (g('jamPadam') ? ' k-input--galat' : '')} value={isi.jamPadam} onChange={(e) => ubah({ jamPadam: e.target.value })} />
              {g('jamPadam') && <small className="k-galat">{g('jamPadam')}</small>}
            </label>
            <label className="k-medan">
              <span className="k-label">Jam nyala</span>
              <input type="time" className={'k-input' + (g('jamNyala') ? ' k-input--galat' : '')} value={isi.jamNyala} onChange={(e) => ubah({ jamNyala: e.target.value })} />
              {g('jamNyala') && <small className="k-galat">{g('jamNyala')}</small>}
            </label>
          </div>
          <fieldset className="k-medan jp-penuh jp-pilihan">
            <legend className="k-label">Status pekerjaan</legend>
            <div className="jp-pilihan-isi">
              {STATUS_PEKERJAAN_JP.map((s) => (
                <label key={s}><input type="radio" name="statusPekerjaan" value={s} checked={isi.statusPekerjaan === s} onChange={() => ubah({ statusPekerjaan: s })} />{s}</label>
              ))}
            </div>
          </fieldset>
          <label className="k-medan jp-penuh">
            <span className="k-label">Lokasi pekerjaan (opsional)</span>
            <textarea className={'k-input' + (g('lokasi') ? ' k-input--galat' : '')} rows={2} maxLength={MAKS_LOKASI} value={isi.lokasi} onChange={(e) => ubah({ lokasi: e.target.value })} />
            {g('lokasi') && <small className="k-galat">{g('lokasi')}</small>}
          </label>
        </div>

        <aside className="jp-form-dampak" aria-live="polite">
          <h3>Dampak</h3>
          {d ? (
            <dl>
              <div><dt>Durasi</dt><dd>{durasiTeks(d.durasi)}{isi.jamNyala < isi.jamPadam && ' (lewat tengah malam)'}</dd></div>
              <div><dt>Daerah padam</dt><dd>{d.daerahSection || '-'}</dd></div>
              <div><dt>Gardu</dt><dd>{angkaId(d.jumlahGardu)} unit</dd></div>
              <div><dt>Pelanggan</dt><dd>{angkaId(d.jumlahPelanggan)}</dd></div>
              <div><dt>Pelanggan VIP</dt><dd>{d.pelangganVip || '-'}</dd></div>
              <div><dt>Beban</dt><dd>{d.arus === '' ? '-' : angkaId(d.arus, 2) + ' A'} · {angkaId(d.bebanMw, 2)} MW</dd></div>
              <div><dt>ENS</dt><dd>{rupiah(d.ens)}</dd></div>
            </dl>
          ) : <p className="k-catatan">Pilih penyulang dan section untuk melihat gardu, pelanggan, beban, dan ENS.</p>}
          {isi.tanggal && (
            <>
              <h3>Jadwal lain {labelTanggalJp(isi.tanggal)}</h3>
              {bulanDari(isi.tanggal) !== bulan ? <p className="k-catatan">Di luar bulan yang dimuat.</p>
                : lain.length ? (
                  <ul className="jp-lain">{lain.map((x) => <li key={x.jadwalId}><b>{x.jamPadam}–{x.jamNyala}</b> {x.penyulang} · {x.section}</li>)}</ul>
                ) : <p className="k-catatan">Belum ada.</p>}
            </>
          )}
        </aside>

        {galat && <p className="k-pesan k-pesan--galat jp-penuh-form" role="alert">{galat}</p>}
        <div className="k-dialog-aksi jp-penuh-form">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--utama" disabled={sibuk}>
            {sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}Simpan jadwal
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Format WA rentang tanggal (hanya status pekerjaan Padam, tanpa yang batal; teks dari server). */
function DialogWa({ buka, api, awal, penyulangAwal, penyulang, onTutup }) {
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [peny, setPeny] = useState('');
  const [hasil, setHasil] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    if (!buka) return;
    setDari(awal.dari); setSampai(awal.sampai); setPeny(penyulangAwal); setHasil(null); setGalat('');
  }, [buka]);

  const buat = async (e) => {
    e.preventDefault();
    if (!dari || !sampai) { setGalat('Isi tanggal dari dan sampai.'); return; }
    if (dari > sampai) { setGalat(pesan('RENTANG_TIDAK_VALID')); return; }
    setMemuat(true); setGalat(''); setHasil(null);
    try {
      const d = { dari, sampai };
      if (peny) d.penyulang = peny;
      setHasil((await api('getWaJadwalPadam', d)).data);
    } catch (er) {
      setGalat(pesan(kodeGalat(er)));
    } finally {
      setMemuat(false);
    }
  };

  return (
    <Dialog buka={buka} judul="Format WA jadwal padam" sub="Hanya jadwal dengan status pekerjaan Padam, tanpa yang dibatalkan"
      lebar="min(640px, calc(100vw - 32px))" onTutup={onTutup}>
      {buka && (
        <>
          <form className="jp-wa-form" onSubmit={buat}>
            <label className="k-medan"><span className="k-label">Dari</span><input type="date" className="k-input" value={dari} onChange={(e) => setDari(e.target.value)} /></label>
            <label className="k-medan"><span className="k-label">Sampai</span><input type="date" className="k-input" value={sampai} onChange={(e) => setSampai(e.target.value)} /></label>
            <label className="k-medan">
              <span className="k-label">Penyulang</span>
              <select className="k-input" value={peny} onChange={(e) => setPeny(e.target.value)}>
                <option value="">Semua</option>
                {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <button type="submit" className="k-tombol k-tombol--utama" disabled={memuat}>
              {memuat ? <SisiLoader ukuran={16} warna="#fff" label="Membuat teks" /> : <Ikon nama="laporan" ukuran={16} />}Buat teks
            </button>
          </form>
          {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
          {hasil && (
            <>
              <p className="k-catatan" style={{ margin: 0 }}>{hasil.jumlah} jadwal · {labelTanggalJp(hasil.dari)} s.d. {labelTanggalJp(hasil.sampai)}</p>
              <TeksWa teks={hasil.teks} tinggiMaks="46vh" />
            </>
          )}
          <div className="k-dialog-aksi"><button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Tutup</button></div>
        </>
      )}
    </Dialog>
  );
}
