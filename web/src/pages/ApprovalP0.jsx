import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  aksiP0, ALASAN_CEPAT, angkaId, bacaBobot, bobotMaster, bolehUbahP0, cocokP0, daftarPekerjaan, dataPutuskan, dataUbahJenis,
  galatAlasan, hitungJumlah, LABEL_SLOT_P0, LABEL_SLOT_SWITCHING, LABEL_STATUS_P0, lokasiP0, MAKS_ALASAN, muatFoto, namaTampil,
  NILAI_GARDU, pekerjaanLain, pilihBerikutnya, SLOT_P0, STATUS_P0, tautanPeta, teksMenit,
} from '../approvalP0.js';
import Dialog from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import NavTanggal from '../components/NavTanggal.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { muatMaster } from '../master.js';
import { pesan } from '../pesan.js';
import { hariIniWib, jamDari } from '../tanggal.js';
import './approvalP0.css';

const kodeGalat = (e) => (e && e.kode) || 'JARINGAN';
const BATAS_TULIS_MS = 60000;

/**
 * Approval P0 Yandal (menu OPS_VERIFIKASI_P0), mirror layar HP approval_p0_screen.dart untuk layar lebar:
 * tanggal > tab Menunggu / Disetujui / Ditolak (+ cari) > daftar kiri, detail kanan (3 foto P0, rincian, lampiran
 * Pengecekan Gardu / Switching) > Setujui / Tolak (alasan) / Edit jenis pekerjaan. Setelah keputusan, P0 berikutnya
 * di tab yang sama langsung terpilih. Hanya ADMIN / SUPER dengan akses UBAH yang bisa memutuskan (server menegakkan).
 */
export default function ApprovalP0({ sesi, api }) {
  const bolehUbah = bolehUbahP0(sesi);
  const [tanggal, setTanggal] = useState(hariIniWib());
  const [list, setList] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [tab, setTab] = useState('Menunggu');
  const [cari, setCari] = useState('');
  const [pilihId, setPilihId] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [info, setInfo] = useState(null); // { jenis: 'ok' | 'galat', teks }
  const [dialog, setDialog] = useState(null); // { jenis: 'setujui' | 'tolak' | 'jenis', x } | { jenis: 'foto', daftar, i }
  const urutMuat = useRef(0);

  const muat = useCallback(async (tgl) => {
    const no = ++urutMuat.current;
    setMemuat(true);
    setGalatMuat('');
    try {
      const j = await api('getApprovalP0', { tanggal: tgl });
      if (no === urutMuat.current) setList(Array.isArray(j.data.list) ? j.data.list : []);
    } catch (e) {
      if (no !== urutMuat.current) return;
      const kode = kodeGalat(e);
      setGalatMuat(kode === 'AKSES_DITOLAK' ? 'Approval P0 khusus akun Admin dengan akses menu ini.' : pesan(kode));
    } finally {
      if (no === urutMuat.current) setMemuat(false);
    }
  }, [api]);

  useEffect(() => { muat(tanggal); }, []);

  const jumlah = useMemo(() => hitungJumlah(list || []), [list]);
  const diTab = useMemo(() => (list || []).filter((x) => x.status === tab), [list, tab]);
  const tampil = useMemo(() => diTab.filter((x) => cocokP0(x, cari)), [diTab, cari]);
  const pilih = tampil.find((x) => x.p0Id === pilihId) || tampil[0] || null;

  const gantiTanggal = (t) => {
    setTanggal(t);
    setList(null);
    setPilihId(null);
    setInfo(null);
    muat(t);
  };

  const segarkan = () => {
    if (memuat || sibuk) return;
    setInfo(null);
    muat(tanggal);
  };

  /** Kirim keputusan / koreksi; jawaban server = item baru, daftar diperbarui tanpa muat ulang. */
  const jalankan = async (action, data, x, teksOk) => {
    if (sibuk) return false;
    setSibuk(true);
    setInfo(null);
    try {
      const baru = (await api(action, data, { batasMs: BATAS_TULIS_MS })).data;
      const listBaru = list.map((y) => (y.p0Id === baru.p0Id ? baru : y));
      setList(listBaru);
      setPilihId(pilihBerikutnya(tampil, listBaru.filter((y) => y.status === tab && cocokP0(y, cari)), x.p0Id));
      setInfo({ jenis: 'ok', teks: teksOk });
      return true;
    } catch (e) {
      const kode = kodeGalat(e);
      setInfo({ jenis: 'galat', teks: x.kodeP0 + ': ' + pesan(kode) });
      if (kode === 'DATA_BERUBAH') muat(tanggal);
      return kode === 'DATA_BERUBAH';
    } finally {
      setSibuk(false);
    }
  };

  const setujui = (x, bobot = null) => jalankan('simpanApprovalP0', dataPutuskan(x, 'Approved', { bobot }), x, x.kodeP0 + ' disetujui.');
  const bukaDialog = (o) => { setInfo(null); setDialog(o); };
  const klikSetujui = (x) => (x.lainLain || pekerjaanLain(x.namaPekerjaan) ? bukaDialog({ jenis: 'setujui', x }) : setujui(x));
  const tutupDialog = () => setDialog(null);
  // gagal = dialog tetap terbuka dengan pesan galat di dalamnya (pesan halaman tertutup latar dialog)
  const selesaiDialog = async (janji) => { if (await janji) setDialog(null); };
  const galatDialog = info?.jenis === 'galat' ? info.teks : '';

  return (
    <div className="hlm ap">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Approval P0</h1>
          <p>Setujui / tolak P0 Yandal per tanggal, cek foto, koreksi jenis pekerjaan</p>
        </div>
        <div className="hlm-aksi">
          <NavTanggal tanggal={tanggal} disabled={memuat || sibuk} onGanti={gantiTanggal} />
          <button type="button" className="k-tombol k-tombol--garis" onClick={segarkan} disabled={memuat || sibuk}>
            {memuat && list ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
        </div>
      </header>

      {!list && memuat && <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat P0" /><p>Memuat P0...</p></div>}
      {!list && !memuat && (
        <div className="k-tengah k-tengah--galat" role="alert">
          <Ikon nama="peringatan" ukuran={30} />
          <b>Daftar P0 belum bisa dimuat</b>
          <p>{galatMuat}</p>
          <button type="button" className="k-tombol k-tombol--utama" onClick={() => muat(tanggal)}><Ikon nama="ulang" ukuran={16} />Coba lagi</button>
        </div>
      )}

      {list && (
        <>
          {galatMuat && <p className="k-pesan k-pesan--galat" role="alert">{galatMuat} Data di bawah dari pemuatan sebelumnya.</p>}
          {!bolehUbah && <p className="k-banner"><Ikon nama="mata" ukuran={17} />Akun ini hanya bisa melihat. Keputusan hanya oleh Admin dengan akses ubah.</p>}
          <div className="ap-alat">
            <div className="k-tab" role="tablist" aria-label="Status approval">
              {STATUS_P0.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={tab === s} className={'k-tab-tombol k-tab-tombol--' + s + (tab === s ? ' k-tab-tombol--aktif' : '')}
                  onClick={() => { setTab(s); setPilihId(null); }}>
                  {LABEL_STATUS_P0[s]}<span>{jumlah[s]}</span>
                </button>
              ))}
            </div>
            <label className="k-cari">
              <Ikon nama="cari" ukuran={16} />
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari kode, pekerjaan, lokasi, tim, petugas" aria-label="Cari P0" />
            </label>
          </div>
          <div role="status" aria-live="polite">{info && <p className={'k-pesan k-pesan--' + info.jenis + ' ap-info'}>{info.teks}</p>}</div>

          {tampil.length === 0 ? (
            <p className="k-kosong ap-kosong">
              {diTab.length ? 'Tidak ada P0 yang cocok dengan pencarian.' : 'Tidak ada P0 ' + LABEL_STATUS_P0[tab].toLowerCase() + ' pada tanggal ini.'}
            </p>
          ) : (
            <div className={'ap-grid' + (memuat ? ' ap-grid--muat' : '')} aria-busy={memuat}>
              <DaftarP0 tampil={tampil} pilih={pilih} onPilih={setPilihId} />
              {pilih && (
                <DetailP0 key={pilih.p0Id} x={pilih} api={api} sibuk={sibuk} aksi={aksiP0(pilih, bolehUbah)}
                  onSetujui={() => klikSetujui(pilih)} onTolak={() => bukaDialog({ jenis: 'tolak', x: pilih })}
                  onUbahJenis={() => bukaDialog({ jenis: 'jenis', x: pilih })} onFoto={(daftar, i) => setDialog({ jenis: 'foto', daftar, i })} />
              )}
            </div>
          )}
        </>
      )}

      <DialogSetujui d={dialog?.jenis === 'setujui' ? dialog : null} sibuk={sibuk} galat={galatDialog} onTutup={tutupDialog}
        onKirim={(x, bobot) => selesaiDialog(setujui(x, bobot))} />
      <DialogTolak d={dialog?.jenis === 'tolak' ? dialog : null} sibuk={sibuk} galat={galatDialog} onTutup={tutupDialog}
        onKirim={(x, alasan) => selesaiDialog(jalankan('simpanApprovalP0', dataPutuskan(x, 'Rejected', { alasan }), x, x.kodeP0 + ' ditolak.'))} />
      <DialogJenis d={dialog?.jenis === 'jenis' ? dialog : null} sibuk={sibuk} galat={galatDialog} api={api} token={sesi.token} onTutup={tutupDialog}
        onKirim={(x, isi) => selesaiDialog(jalankan('ubahJenisP0', dataUbahJenis(x, isi), x, x.kodeP0 + ': jenis pekerjaan dikoreksi.'))} />
      <DialogFoto d={dialog?.jenis === 'foto' ? dialog : null} api={api} onTutup={tutupDialog} onGeser={(i) => setDialog({ ...dialog, i })} />
    </div>
  );
}

// ---------------- daftar ----------------

const BADGE_STATUS = { Menunggu: 'proses', Approved: 'ok', Rejected: 'belum' };

function BadgeStatus({ x }) {
  return <span className={'k-badge k-badge--' + (BADGE_STATUS[x.status] || 'v1')}>{x.sistem ? 'DITOLAK SISTEM' : LABEL_STATUS_P0[x.status].toUpperCase()}</span>;
}

/** Daftar kiri; panah atas / bawah pindah P0 (tombol berikutnya difokus dan dipilih). */
function DaftarP0({ tampil, pilih, onPilih }) {
  const geser = (e) => {
    const ke = e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.key === 'ArrowUp' ? e.currentTarget.previousElementSibling : null;
    if (!ke) return;
    e.preventDefault();
    ke.focus();
  };
  return (
    <nav className="ap-daftar" aria-label="Daftar P0">
      {tampil.map((x) => (
        <button key={x.p0Id} type="button" className={'ap-item' + (pilih?.p0Id === x.p0Id ? ' ap-item--pilih' : '')} aria-current={pilih?.p0Id === x.p0Id}
          onClick={() => onPilih(x.p0Id)} onFocus={() => onPilih(x.p0Id)} onKeyDown={geser}>
          <span className="ap-item-atas"><small>{x.kodeP0}</small><BadgeStatus x={x} /></span>
          <b>{namaTampil(x)}</b>
          {lokasiP0(x) && <span className="ap-item-lokasi">{lokasiP0(x)}</span>}
          <span className="ap-item-meta">
            {x.tim}{x.shift ? ' · Shift ' + x.shift : ''} · {teksMenit(x.durasi)}
            {x.waktuSebelum && ' · ' + jamDari(x.waktuSebelum) + '-' + jamDari(x.waktuSesudah)}
            {x.status === 'Approved' && typeof x.point === 'number' && <em> · {angkaId(x.point, 2)} point</em>}
          </span>
          {(x.gardu?.length > 0 || x.switching?.length > 0 || x.koreksiJenis?.length > 0) && (
            <span className="ap-item-tanda">
              {x.gardu?.length > 0 && <span>{x.gardu.length} gardu</span>}
              {x.switching?.length > 0 && <span>switching</span>}
              {x.koreksiJenis?.length > 0 && <span>jenis dikoreksi</span>}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

// ---------------- detail ----------------

function DetailP0({ x, api, sibuk, aksi, onSetujui, onTolak, onUbahJenis, onFoto }) {
  const fotoP0 = SLOT_P0.map((s) => ({ p0Id: x.p0Id, jenis: 'P0', slot: s, label: LABEL_SLOT_P0[s], ada: (x.foto || []).includes(s) }));
  const peta = tautanPeta(x.koordinat), petaClosing = tautanPeta(x.koordinatClosing);
  const m = (v) => (typeof v === 'number' ? angkaId(v) + ' m' : '-');
  const rincian = [
    ['Petugas', x.petugas || '-'],
    ['Tim / shift', [x.tim, x.shift && 'Shift ' + x.shift].filter(Boolean).join(' · ') || '-'],
    ['Dibuat', x.waktuDibuat || '-'],
    ['Foto sebelum', x.waktuSebelum || '-'],
    ['Foto pekerjaan', x.waktuPekerjaan || '-'],
    ['Foto sesudah', x.waktuSesudah || '-'],
    ['Durasi', teksMenit(x.durasi)],
    ['Koordinat pekerjaan', peta ? <a href={peta} target="_blank" rel="noopener noreferrer">{x.koordinat}</a> : (x.koordinat || '-')],
    ['Koordinat closing', petaClosing ? <a href={petaClosing} target="_blank" rel="noopener noreferrer">{x.koordinatClosing}</a> : (x.koordinatClosing || '-')],
    ['Jarak closing', m(x.jarakClosing)],
    ['Jarak antar P0', m(x.jarakAntar)],
    ['Skor durasi', angkaId(x.skorDurasi, 2)],
    ['Bobot', angkaId(x.bobot, 2)],
    ['Pengali', angkaId(x.pengali, 2)],
    ['Point', x.status === 'Approved' ? angkaId(x.point, 2) : '-'],
  ];
  if (x.approvedOleh) rincian.push(['Diputuskan', x.approvedOleh + (x.waktuApprove ? ' · ' + x.waktuApprove : '')]);
  const adaAksi = aksi.setujui || aksi.tolak || aksi.ubahJenis;

  return (
    <article className="hlm-kartu ap-detail" aria-label={'Detail ' + x.kodeP0}>
      <header className="ap-detail-kepala">
        <div>
          <small>{x.kodeP0}</small>
          <h2>{namaTampil(x)}</h2>
          {lokasiP0(x) && <p>{lokasiP0(x)}</p>}
        </div>
        <BadgeStatus x={x} />
      </header>

      <div className="ap-foto-3">
        {fotoP0.map((f, i) => <FotoKecil key={f.slot} api={api} f={f} onBuka={() => onFoto(fotoP0, i)} />)}
      </div>

      {x.status === 'Rejected' && x.alasanRejected && <p className="ap-kotak ap-kotak--tolak"><b>Alasan ditolak:</b> {x.alasanRejected}</p>}
      {x.catatan && <p className="ap-kotak"><b>Catatan petugas:</b> {x.catatan}</p>}
      {x.koreksiJenis?.length > 0 && (
        <div className="ap-kotak ap-kotak--koreksi">
          <b>Riwayat koreksi jenis</b>
          <ul>
            {x.koreksiJenis.map((k, i) => <li key={i}>{k.dari} → {k.ke} <small>· {k.oleh} · {k.waktu} · {k.alasan}</small></li>)}
          </ul>
        </div>
      )}

      <dl className="k-rincian">
        {rincian.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>

      {(x.gardu || []).map((g) => <KartuGardu key={g.id} g={g} p0Id={x.p0Id} api={api} onFoto={onFoto} />)}
      {(x.switching || []).map((s) => <KartuSwitching key={s.id} s={s} p0Id={x.p0Id} api={api} onFoto={onFoto} />)}

      {adaAksi && (
        <footer className="ap-aksi">
          {aksi.ubahJenis && (
            <button type="button" className="k-tombol k-tombol--garis" onClick={onUbahJenis} disabled={sibuk}><Ikon nama="edit" ukuran={16} />Edit jenis</button>
          )}
          <span className="k-spasi" />
          {sibuk && <SisiLoader ukuran={20} label="Menyimpan" />}
          {aksi.tolak && <button type="button" className="k-tombol k-tombol--tolak" onClick={onTolak} disabled={sibuk}>Tolak</button>}
          {aksi.setujui && (
            <button type="button" className="k-tombol k-tombol--setuju" onClick={onSetujui} disabled={sibuk}><Ikon nama="centang" ukuran={16} />{aksi.labelSetujui}</button>
          )}
        </footer>
      )}
    </article>
  );
}

/** Thumbnail dari server (getFotoApprovalP0 KECIL); klik = foto penuh. */
function FotoKecil({ api, f, onBuka }) {
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    if (!f.ada) return undefined;
    let hidup = true;
    setGalat('');
    muatFoto(api, f).then((s) => { if (hidup) setSrc(s); }, (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, f.p0Id, f.jenis, f.id, f.slot, f.ada, ulang]);

  let isi;
  if (!f.ada) isi = <span className="ap-foto-kosong">Tidak ada foto</span>;
  else if (galat) isi = <span className="ap-foto-kosong ap-foto-kosong--galat">Gagal memuat<button type="button" className="k-tautan" onClick={() => setUlang(ulang + 1)}>Coba lagi</button></span>;
  else if (!src) isi = <span className="ap-foto-kosong"><SisiLoader ukuran={24} label={'Memuat foto ' + f.label} /></span>;
  else isi = <button type="button" className="ap-foto-tombol" onClick={onBuka} aria-label={'Perbesar foto ' + f.label}><img src={src} alt={'Foto ' + f.label} /></button>;
  return <figure className="ap-foto">{isi}<figcaption>{f.label}</figcaption></figure>;
}

/** Foto lampiran dimuat hanya kalau dibuka (banyak foto per gardu / switching). */
function FotoLampiran({ daftar, api, onFoto }) {
  const [buka, setBuka] = useState(false);
  const ada = daftar.filter((f) => f.ada).length;
  if (!buka) {
    return <button type="button" className="k-tombol k-tombol--garis ap-tampil-foto" onClick={() => setBuka(true)} disabled={!ada}>Tampilkan foto ({ada})</button>;
  }
  return <div className="ap-foto-grid">{daftar.map((f, i) => <FotoKecil key={f.slot} api={api} f={f} onBuka={() => onFoto(daftar, i)} />)}</div>;
}

function KartuGardu({ g, p0Id, api, onFoto }) {
  const h = g.hasil || {}, n = g.nilai || {};
  const ada = new Set(g.foto || []);
  const daftar = [
    ...NILAI_GARDU.map((v) => ({ p0Id, jenis: 'GARDU', id: g.id, slot: v.slot, label: v.label + ' ' + angkaId(n[v.kunci], 1) + ' ' + v.satuan, ada: ada.has(v.slot) })),
    { p0Id, jenis: 'GARDU', id: g.id, slot: 'KONDISI', label: 'Kondisi / temuan', ada: ada.has('KONDISI') },
  ];
  const peta = tautanPeta(g.koordinat);
  return (
    <section className="ap-lampiran">
      <h3>Pengukuran Gardu {g.noGardu} <small>{g.kode}</small></h3>
      <p className="ap-lampiran-sub">{[g.alamat, g.penyulang, g.section].filter(Boolean).join(' · ')}</p>
      <p className="ap-lampiran-hasil">
        <b>{angkaId(h.kva, 2)} kVA</b> dari {angkaId(g.kapasitas)} kVA · <b>{angkaId(h.persen, 1)}%</b> {h.kategori}
        {' '}· tidak seimbang {angkaId(h.tidakSeimbang, 1)}% · arus maks {angkaId(h.arusMaks, 1)} A
      </p>
      <div className="ap-nilai">
        {NILAI_GARDU.map((v) => <span key={v.kunci}><small>{v.label}</small>{angkaId(n[v.kunci], 1)} {v.satuan}</span>)}
      </div>
      <p className="ap-lampiran-sub">
        Jam ukur {jamDari(g.jam) || '-'}{g.waktuBeban ? ' · ' + g.waktuBeban : ''} · jarak ke gardu {typeof g.jarakM === 'number' ? angkaId(g.jarakM) + ' m' : '-'}
        {peta && <> · <a href={peta} target="_blank" rel="noopener noreferrer">peta</a></>}
        {g.diterapkan && ' · diterapkan ke master: ' + g.diterapkan}
      </p>
      {g.catatan && <p className="ap-lampiran-sub">Catatan: {g.catatan}</p>}
      <FotoLampiran daftar={daftar} api={api} onFoto={onFoto} />
    </section>
  );
}

function KartuSwitching({ s, p0Id, api, onFoto }) {
  const ada = new Set(s.foto || []);
  const daftar = Object.keys(LABEL_SLOT_SWITCHING).map((slot) => ({ p0Id, jenis: 'SWITCHING', id: s.id, slot, label: LABEL_SLOT_SWITCHING[slot], ada: ada.has(slot) }));
  const a = s.arus || {}, ind = s.indikator || {};
  const peta = tautanPeta(s.koordinat);
  return (
    <section className="ap-lampiran">
      <h3>Pengecekan Switching {s.nama} <small>{s.kode}</small></h3>
      <p className="ap-lampiran-sub">{[s.penyulang, s.section].filter(Boolean).join(' · ')} · jam {jamDari(s.jam) || '-'}{peta && <> · <a href={peta} target="_blank" rel="noopener noreferrer">peta</a></>}</p>
      <div className="ap-nilai">
        {['R', 'S', 'T'].map((f) => <span key={f}><small>Arus {f}</small>{angkaId(a[f], 1)} A</span>)}
        {Object.keys(ind).map((k) => <span key={k}><small>{k}</small>{ind[k] || '-'}</span>)}
      </div>
      {s.catatan && <p className="ap-lampiran-sub">Catatan: {s.catatan}</p>}
      <FotoLampiran daftar={daftar} api={api} onFoto={onFoto} />
    </section>
  );
}

// ---------------- dialog ----------------

function DialogSetujui({ d, sibuk, galat: galatKirim, onTutup, onKirim }) {
  const [teks, setTeks] = useState('');
  const [coba, setCoba] = useState(false);
  useEffect(() => { if (d) { setTeks(typeof d.x.bobot === 'number' ? String(d.x.bobot).replace('.', ',') : ''); setCoba(false); } }, [d]);
  const bobot = bacaBobot(teks);
  return (
    <Dialog buka={!!d} judul="Setujui P0 Lain - Lain" sub={d && d.x.kodeP0 + ' · ' + namaTampil(d.x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => { e.preventDefault(); setCoba(true); if (bobot !== null) onKirim(d.x, bobot); }}>
        <label className="k-medan">
          <span className="k-label">Bobot pekerjaan (0 - 100)</span>
          <input className={'k-input k-input--angka' + (coba && bobot === null ? ' k-input--galat' : '')} value={teks} inputMode="decimal" autoFocus
            onChange={(e) => setTeks(e.target.value)} aria-invalid={coba && bobot === null} style={{ maxWidth: 140 }} />
          {coba && bobot === null ? <small className="k-galat">Isi angka 0 - 100, maks 2 desimal.</small>
            : <small className="k-catatan">Pekerjaan Lain - Lain tidak punya bobot master: bobot diisi admin, point dihitung server.</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--setuju" disabled={sibuk}>{sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="centang" ukuran={16} />}Setujui</button>
        </div>
      </form>
    </Dialog>
  );
}

function DialogTolak({ d, sibuk, galat: galatKirim, onTutup, onKirim }) {
  const [alasan, setAlasan] = useState('');
  const [coba, setCoba] = useState(false);
  useEffect(() => { if (d) { setAlasan(''); setCoba(false); } }, [d]);
  const galat = galatAlasan(alasan);
  return (
    <Dialog buka={!!d} judul="Tolak P0" sub={d && d.x.kodeP0 + ' · ' + namaTampil(d.x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => { e.preventDefault(); setCoba(true); if (!galat) onKirim(d.x, alasan); }}>
        <div className="k-chip-baris">
          {ALASAN_CEPAT.map((a) => <button key={a} type="button" className={'k-chip' + (alasan === a ? ' k-chip--aktif' : '')} onClick={() => setAlasan(a)}>{a}</button>)}
        </div>
        <label className="k-medan">
          <span className="k-label">Alasan (wajib, terlihat petugas)</span>
          <textarea className={'k-input' + (coba && galat ? ' k-input--galat' : '')} rows={3} maxLength={MAKS_ALASAN} value={alasan} autoFocus
            onChange={(e) => setAlasan(e.target.value)} aria-invalid={coba && !!galat} />
          {coba && galat ? <small className="k-galat">{galat}</small> : <small className="k-catatan">{alasan.length}/{MAKS_ALASAN} · point P0 menjadi 0.</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--bahaya" disabled={sibuk}>{sibuk && <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" />}Tolak P0</button>
        </div>
      </form>
    </Dialog>
  );
}

function DialogJenis({ d, sibuk, galat: galatKirim, api, token, onTutup, onKirim }) {
  const [master, setMaster] = useState(null);
  const [galatMaster, setGalatMaster] = useState('');
  const [nama, setNama] = useState('');
  const [lainnya, setLainnya] = useState('');
  const [bobotTeks, setBobotTeks] = useState('');
  const [alasan, setAlasan] = useState('');
  const [coba, setCoba] = useState(false);

  const ambil = useCallback((segar = false) => {
    setGalatMaster('');
    muatMaster(api, token, 'jenisPekerjaan', { segar }).then(setMaster, (e) => setGalatMaster(pesan(kodeGalat(e))));
  }, [api, token]);

  useEffect(() => {
    if (!d) return;
    setNama(''); setLainnya(d.x.lainLain ? d.x.pekerjaanLainnya || '' : ''); setBobotTeks(''); setAlasan(''); setCoba(false);
    ambil();
  }, [d, ambil]);

  if (!d) return <Dialog buka={false} onTutup={onTutup} />;
  const x = d.x;
  const daftar = master ? daftarPekerjaan(master) : [];
  const bobotM = master ? bobotMaster(master) : new Map();
  const lain = pekerjaanLain(nama);
  const perluBobot = lain && x.status === 'Approved';
  const bobot = bacaBobot(bobotTeks);
  const galat = {
    nama: !nama ? 'Pilih jenis pekerjaan.' : '',
    lainnya: lain && !lainnya.trim() ? 'Isi nama pekerjaan Lain - Lain.' : '',
    bobot: lain && bobotTeks.trim() && bobot === null ? 'Bobot 0 - 100.' : perluBobot && bobot === null ? 'P0 sudah disetujui: isi bobot Lain - Lain.' : '',
    alasan: galatAlasan(alasan),
  };
  const valid = !Object.values(galat).some(Boolean);
  const g = (k) => (coba ? galat[k] : '');

  return (
    <Dialog buka judul="Edit jenis pekerjaan" sub={x.kodeP0 + ' · sekarang: ' + namaTampil(x)} kunci={sibuk} onTutup={onTutup}>
      <form className="ap-form" onSubmit={(e) => {
        e.preventDefault(); setCoba(true);
        if (valid) onKirim(x, { nama, lainnya, alasan, bobot: lain ? bobot : null });
      }}>
        <p className="k-catatan" style={{ margin: 0 }}>Untuk petugas yang salah memilih jenis. Foto, waktu, petugas dan kode P0 tetap; point dihitung ulang server.</p>
        <label className="k-medan">
          <span className="k-label">Jenis pekerjaan (master)</span>
          {galatMaster ? (
            <span className="k-galat">{galatMaster} <button type="button" className="k-tautan" onClick={() => ambil(true)}>Coba lagi</button></span>
          ) : (
            <select className={'k-input' + (g('nama') ? ' k-input--galat' : '')} value={nama} onChange={(e) => setNama(e.target.value)} autoFocus disabled={!master}>
              <option value="">{master ? 'Pilih jenis' : 'Memuat master...'}</option>
              {daftar.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          {g('nama') && <small className="k-galat">{g('nama')}</small>}
          {nama && !lain && <small className="k-catatan">Bobot master: {angkaId(bobotM.get(nama), 2)}</small>}
        </label>
        {lain && (
          <>
            <label className="k-medan">
              <span className="k-label">Nama pekerjaan Lain - Lain</span>
              <input className={'k-input' + (g('lainnya') ? ' k-input--galat' : '')} value={lainnya} maxLength={100} onChange={(e) => setLainnya(e.target.value)} />
              {g('lainnya') && <small className="k-galat">{g('lainnya')}</small>}
            </label>
            <label className="k-medan">
              <span className="k-label">{perluBobot ? 'Bobot (wajib, 0 - 100)' : 'Bobot (boleh diisi saat menyetujui)'}</span>
              <input className={'k-input k-input--angka' + (g('bobot') ? ' k-input--galat' : '')} value={bobotTeks} inputMode="decimal" style={{ maxWidth: 140 }}
                onChange={(e) => setBobotTeks(e.target.value)} />
              {g('bobot') && <small className="k-galat">{g('bobot')}</small>}
            </label>
          </>
        )}
        <label className="k-medan">
          <span className="k-label">Alasan koreksi (wajib)</span>
          <textarea className={'k-input' + (g('alasan') ? ' k-input--galat' : '')} rows={2} maxLength={MAKS_ALASAN} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          {g('alasan') && <small className="k-galat">{g('alasan')}</small>}
        </label>
        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup} disabled={sibuk}>Batal</button>
          <button type="submit" className="k-tombol k-tombol--utama" disabled={sibuk || !master}>{sibuk ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}Simpan koreksi</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Foto penuh (watermark terbaca); panah kiri / kanan pindah foto dalam kelompok yang sama. */
function DialogFoto({ d, api, onTutup, onGeser }) {
  const f = d ? d.daftar[d.i] : null;
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');

  useEffect(() => {
    if (!f) return undefined;
    setSrc(''); setGalat('');
    if (!f.ada) return undefined;
    let hidup = true;
    muatFoto(api, f, 'PENUH').then((s) => { if (hidup) setSrc(s); }, (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, f]);

  if (!d) return <Dialog buka={false} onTutup={onTutup} />;
  const n = d.daftar.length;
  const geser = (k) => onGeser((d.i + k + n) % n);
  return (
    <Dialog buka judul={f.label} sub={(d.i + 1) + ' dari ' + n} lebar="min(1100px, calc(100vw - 32px))" onTutup={onTutup}>
      <div className="ap-lightbox" onKeyDown={(e) => { if (e.key === 'ArrowRight') geser(1); if (e.key === 'ArrowLeft') geser(-1); }}>
        {n > 1 && <button type="button" className="k-ikon-tombol ap-lightbox-panah" onClick={() => geser(-1)} aria-label="Foto sebelumnya"><Ikon nama="kiri" /></button>}
        <div className="ap-lightbox-isi">
          {!f.ada ? <p className="k-kosong">Tidak ada foto.</p>
            : galat ? <p className="k-pesan k-pesan--galat">{galat}</p>
            : !src ? <SisiLoader ukuran={48} label="Memuat foto penuh" />
            : <img src={src} alt={'Foto ' + f.label} />}
        </div>
        {n > 1 && <button type="button" className="k-ikon-tombol ap-lightbox-panah" onClick={() => geser(1)} aria-label="Foto berikutnya"><Ikon nama="kanan" /></button>}
      </div>
      <div className="k-dialog-aksi">
        {src && <a className="k-tombol k-tombol--garis" href={src} download={[f.p0Id, f.jenis, f.slot].join('_') + '.jpg'}>Unduh</a>}
        <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup} autoFocus>Tutup</button>
      </div>
    </Dialog>
  );
}
