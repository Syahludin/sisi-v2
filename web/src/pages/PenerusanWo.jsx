import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Dialog from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import DialogTeruskanWo from '../components/DialogTeruskanWo.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { aksiMenu } from '../katalog.js';
import { saringStatusWo } from '../selisihWo.js';
import { sinkronWo } from '../sinkronWo.js';
import useKirimWo from '../useKirimWo.jsx';
import {
  bolehTeruskan, infoStatusWo, lokasiTemuan, MENU_WO, muatFotoWo, pilihanFilter,
  ringkasPekerjaan, saringWo, SLOT_FOTO_TEMUAN, SLOT_FOTO_WO, statusWo, TAB_WO, tabWo, teksWaTemuan, timInspeksi, urlPeta, waktuWo,
} from '../penerusanWo.js';
import { kodeGalat, pesan } from '../pesan.js';
import './penerusanWo.css';

const tglValid = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? t : '');

/**
 * Penerusan Tim Temuan Inspeksi (menu OPS_PENERUSAN_WO), v1.0.38 mirror layar HP wo_admin_screen.dart:
 * tab status (Baru = daftar kerja) + cari + filter penyulang / tim inspeksi / tanggal temuan > daftar kiri, detail kanan
 * (foto temuan / tiang, tindak lanjut, pekerjaan tim + fotonya) > Teruskan ke tim (ROW / Hartek / Yandal aktif + catatan).
 * Pindah / tarik WO terkirim tetap di menu Pindah Tim TO, WO ganda di Verifikasi WO Ganda (server menolak di sini).
 * Pilihan tersimpan di alamat (/penerusan-wo/<temuanId>?status=&dari=&sampai=&penyulang=&tim=).
 */
export default function PenerusanWo({ sesi, api, rute, keRute }) {
  const bolehUbah = aksiMenu(sesi, MENU_WO) === 'UBAH';
  const q = rute.query;
  const status = tabWo(q.status).kode;
  const dari = tglValid(q.dari), sampai = tglValid(q.sampai);
  const penyulang = q.penyulang || '', tim = q.tim || '';
  const pilihId = rute.id || '';
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [cari, setCari] = useState('');
  const [info, setInfo] = useState(null);       // { jenis: 'ok' | 'galat', teks }
  const [teruskan, setTeruskan] = useState(null); // temuan yang sedang dipilih timnya
  const [foto, setFoto] = useState(null);        // { daftar: [{ temuanId, slot, tlId?, label }], i }
  const urut = useRef(0);

  // v1.0.58: daftar lengkap tersimpan di browser per akun + rentang; server hanya mengirim selisih (sinkronWo.js).
  // Status disaring di sini (permintaan selalu SEMUA), jadi pindah tab tidak memanggil server.
  const kunciWo = 'u:' + (sesi.profil?.userId || '') + '|getWoAdmin|' + dari + '|' + sampai;
  const muat = useCallback(async (paksaPenuh = false) => {
    const no = ++urut.current;
    setMemuat(true); setGalatMuat('');
    try {
      const j = await sinkronWo({
        action: 'getWoAdmin', param: { ...(dari ? { dari } : {}), ...(sampai ? { sampai } : {}) }, kunci: kunciWo, paksaPenuh,
        api: (a, d, o) => api(a, d, { batasMs: 150000, ...o }),
        onLokal: (c) => { if (no === urut.current) setData(c); },
      });
      if (no === urut.current) setData(j);
    } catch (e) {
      if (no === urut.current) setGalatMuat(pesan(kodeGalat(e)));
    }
    if (no === urut.current) setMemuat(false);
  }, [api, kunciWo, dari, sampai]);
  useEffect(() => { muat(); }, [muat]);

  // v1.0.58: isian filter / pencarian hanya rancangan sampai tombol Cari ditekan (atau Enter); tab status tetap langsung
  const [rancang, setRancang] = useState({ cari: '', penyulang, tim, dari, sampai });
  useEffect(() => { setRancang((r) => ({ ...r, penyulang, tim, dari, sampai })); }, [penyulang, tim, dari, sampai]);
  const ubahRancang = (k, v) => setRancang((r) => ({ ...r, [k]: v }));
  const belumDicari = rancang.cari.trim() !== cari || rancang.penyulang !== penyulang || rancang.tim !== tim
    || rancang.dari !== dari || rancang.sampai !== sampai;

  const ubah = (query, id) => keRute({ ...(id !== undefined ? { id } : {}), query }, { ganti: true });
  const terapkan = (e) => {
    if (e) e.preventDefault();
    setCari(rancang.cari.trim());
    ubah({ penyulang: rancang.penyulang, tim: rancang.tim, dari: rancang.dari, sampai: rancang.sampai });
  };
  const resetFilter = () => {
    setCari('');
    setRancang({ cari: '', penyulang: '', tim: '', dari: '', sampai: '' });
    ubah({ penyulang: '', tim: '', dari: '', sampai: '' });
  };
  const pilih = (id) => keRute({ id, query: {} }, { ganti: true });

  const semuaWo = data?.temuan;
  const semua = useMemo(() => saringStatusWo(semuaWo, status), [semuaWo, status]);
  const tampil = useMemo(() => saringWo(semua, { cari, penyulang, tim }), [semua, cari, penyulang, tim]);
  const dipilih = semua.find((t) => t.temuanId === pilihId) || null;
  const r = data?.ringkas || {};
  const adaFilter = penyulang || tim || dari || sampai;

  // v1.0.58: Kirim WO dijalankan di latar (useKirimWo): kartu "Data berhasil disimpan" langsung, tanpa menunggu server.
  // Temuan berikutnya di daftar dipilih saat dikirim (Baru = sudah pindah tab); dikembalikan karena gagal = dipilih lagi.
  const sesudahMulai = (dari, ke) => {
    if (ke.wo?.status !== 'TERKIRIM') { pilih(ke.temuanId); return; }
    const i = tampil.findIndex((x) => x.temuanId === dari.temuanId);
    const lanjut = tampil[i + 1] || tampil[i - 1];
    pilih(status === 'BARU' && lanjut ? lanjut.temuanId : dari.temuanId);
  };
  const { kirim: kirimWo, popup } = useKirimWo({
    api, data, setData, kunci: kunciWo, muat, onMulai: sesudahMulai, onGalat: (teks) => setInfo({ jenis: 'galat', teks }),
  });

  return (
    <div className="hlm pw">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Penerusan Tim Temuan Inspeksi</h1>
          <p>{r.baru ?? 0} baru · {r.terkirim ?? 0} terkirim · {r.dikerjakan ?? 0} dikerjakan · {r.selesai ?? 0} selesai{r.ganda ? ` · ${r.ganda} WO ganda` : ''}</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat(true)} disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
        </div>
      </header>

      {!bolehUbah && <p className="k-banner"><Ikon nama="mata" ukuran={17} />Akun ini hanya bisa melihat. Penerusan hanya oleh Admin dengan akses ubah.</p>}
      {info && <p className={'k-pesan k-pesan--' + info.jenis + ' pw-info'} role={info.jenis === 'ok' ? 'status' : 'alert'}>{info.teks}</p>}

      <form className="pw-form" style={{ display: 'contents' }} onSubmit={terapkan}>
      <div className="pw-alat">
        <div className="k-tab" role="tablist" aria-label="Status WO">
          {TAB_WO.map((x) => (
            <button key={x.kode} type="button" role="tab" aria-selected={status === x.kode}
              className={'k-tab-tombol' + (status === x.kode ? ' k-tab-tombol--aktif' : '')}
              onClick={() => { setInfo(null); ubah({ status: x.kode === 'BARU' ? '' : x.kode }, ''); }}>
              {x.label}{x.ringkas && <span>{r[x.ringkas] ?? 0}</span>}
            </button>
          ))}
        </div>
        <label className="k-cari">
          <Ikon nama="cari" ukuran={17} />
          <input type="search" value={rancang.cari} onChange={(e) => ubahRancang('cari', e.target.value)} placeholder="Cari kode, jenis, penyulang, gardu, tim..." aria-label="Cari temuan" />
        </label>
      </div>

      <div className="pw-filter">
        <label><span>Penyulang</span>
          <select className="k-input" value={rancang.penyulang} onChange={(e) => ubahRancang('penyulang', e.target.value)}>
            <option value="">Semua penyulang</option>
            {pilihanFilter(semua, (t) => t.penyulang).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label><span>Tim inspeksi</span>
          <select className="k-input" value={rancang.tim} onChange={(e) => ubahRancang('tim', e.target.value)}>
            <option value="">Semua tim</option>
            {pilihanFilter(semua, timInspeksi).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label><span>Temuan dari</span><input type="date" className="k-input" value={rancang.dari} max={rancang.sampai || undefined} onChange={(e) => ubahRancang('dari', e.target.value)} /></label>
        <label><span>Sampai</span><input type="date" className="k-input" value={rancang.sampai} min={rancang.dari || undefined} onChange={(e) => ubahRancang('sampai', e.target.value)} /></label>
        <button type="submit" className={'k-tombol ' + (belumDicari ? 'k-tombol--utama' : 'k-tombol--garis')} disabled={memuat && !data}>
          <Ikon nama="cari" ukuran={15} />Cari
        </button>
        <button type="button" className="k-tombol k-tombol--garis" disabled={!adaFilter && !cari && !belumDicari} onClick={resetFilter}>
          <Ikon nama="tutup" ukuran={15} />Reset
        </button>
      </div>
      </form>

      {galatMuat && <p className="k-pesan k-pesan--galat" role="alert">{galatMuat} <button type="button" className="k-tautan" onClick={() => muat()}>Coba lagi</button></p>}

      {!data && memuat ? (
        <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat" /><p>Memuat temuan</p></div>
      ) : !data ? null : !tampil.length ? (
        <p className="k-kosong pw-kosong">{cari || adaFilter ? 'Tidak ada temuan yang cocok. Coba kata lain atau ubah filter.' : status === 'BARU' ? 'Semua temuan sudah diteruskan ke tim.' : 'Belum ada temuan dengan status ini.'}</p>
      ) : (
        <div className={'pw-grid' + (memuat ? ' pw-grid--muat' : '')}>
          <div className="pw-daftar" role="list" aria-label="Daftar temuan">
            {tampil.map((t) => <ItemTemuan key={t.temuanId} t={t} api={api} aktif={t.temuanId === pilihId} onPilih={() => pilih(t.temuanId)} />)}
            {semua.length >= 500 && <p className="pw-catatan">Daftar dibatasi 500 temuan terbaru. Persempit dengan filter tanggal.</p>}
          </div>
          {dipilih
            ? <Detail t={dipilih} api={api} bolehUbah={bolehUbah} onTeruskan={() => setTeruskan(dipilih)} onFoto={setFoto} />
            : <div className="hlm-kartu pw-detail pw-detail--kosong"><Ikon nama="kiri" ukuran={20} /><p>Pilih temuan di daftar untuk melihat detail dan meneruskannya ke tim.</p></div>}
        </div>
      )}

      <DialogTeruskanWo t={teruskan} tim={data?.tim || []} onTutup={() => setTeruskan(null)}
        onKirim={(t, tim, catatan) => { setTeruskan(null); setInfo(null); kirimWo(t, tim, catatan); }} />
      {popup}
      <DialogFoto d={foto} api={api} onTutup={() => setFoto(null)} onGeser={(i) => setFoto({ ...foto, i })} />
    </div>
  );
}

function PilStatus({ t }) {
  const s = infoStatusWo(statusWo(t));
  return <span className={'pw-pil pw-pil--' + s.warna}>{s.label}</span>;
}

function ItemTemuan({ t, api, aktif, onPilih }) {
  return (
    <button type="button" role="listitem" className={'pw-item pw-item--' + infoStatusWo(statusWo(t)).warna + (aktif ? ' pw-item--pilih' : '')} onClick={onPilih} aria-current={aktif || undefined}>
      <FotoMini api={api} t={t} />
      <span className="pw-item-isi">
        <span className="pw-item-atas"><small>{t.kodeTemuan}</small><PilStatus t={t} /></span>
        <b>{t.jenisTemuan || 'Temuan'}</b>
        <span className="pw-item-lokasi">{lokasiTemuan(t) || '-'}</span>
        <span className="pw-item-tanda">
          {t.wo?.ganda && <span className="pw-tanda--ganda">WO ganda</span>}
          {t.wo?.tim && <span>{t.wo.tim}</span>}
          <span>{timInspeksi(t)}</span>
          {t.tanggal && <span>{t.tanggal}</span>}
        </span>
      </span>
    </button>
  );
}

/** Foto temuan kecil di daftar (dimuat hanya kalau temuan punya foto). */
function FotoMini({ api, t }) {
  const [src, setSrc] = useState('');
  const ada = !!t.foto?.TEMUAN;
  useEffect(() => {
    if (!ada) return undefined;
    let hidup = true;
    muatFotoWo(api, { temuanId: t.temuanId, slot: 'TEMUAN' }).then((s) => { if (hidup) setSrc(s); }, () => {});
    return () => { hidup = false; };
  }, [api, t.temuanId, ada]);
  return <span className="pw-mini">{src ? <img src={src} alt="" /> : <Ikon nama={ada ? 'mata' : 'peringatan'} ukuran={20} />}</span>;
}

function Baris({ label, children }) {
  if (children === '' || children === null || children === undefined || children === false) return null;
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function Detail({ t, api, bolehUbah, onTeruskan, onFoto }) {
  const wo = t.wo || {};
  const s = statusWo(t);
  const peta = urlPeta(t.koordinat);
  const fotoTemuan = SLOT_FOTO_TEMUAN.filter(([k]) => t.foto?.[k]).map(([slot, label]) => ({ temuanId: t.temuanId, slot, label }));
  const pekerjaan = t.pekerjaanWo || [];
  return (
    <article className="hlm-kartu pw-detail" aria-label={'Detail ' + t.kodeTemuan}>
      <div className="pw-detail-kepala">
        <div>
          <small>{t.kodeTemuan}</small>
          <h2>{t.jenisTemuan || 'Temuan'}</h2>
          <p>{lokasiTemuan(t) || '-'}</p>
        </div>
        <PilStatus t={t} />
      </div>
      {wo.ganda && <p className="k-pesan k-pesan--galat">WO ini diunggah dua tim. Verifikasi dulu di menu Verifikasi WO Ganda.</p>}

      <dl className="k-rincian pw-rincian">
        <Baris label="Objek">{t.objekInspeksi || '-'}</Baris>
        <Baris label="Tier">{t.tierInspeksi}</Baris>
        <Baris label="Sumber">{timInspeksi(t)}</Baris>
        <Baris label="Tanggal temuan">{t.tanggal}</Baris>
        <Baris label="Koordinat">{t.koordinat && (peta ? <a href={peta} target="_blank" rel="noopener noreferrer">{t.koordinat}</a> : t.koordinat)}</Baris>
      </dl>
      {t.deskripsi && <p className="pw-deskripsi">{t.deskripsi}</p>}
      {fotoTemuan.length > 0 && (
        <div className="pw-foto-grid">
          {fotoTemuan.map((f, i) => <FotoKecil key={f.slot} api={api} f={f} onBuka={() => onFoto({ daftar: fotoTemuan, i })} />)}
        </div>
      )}
      <KirimWaTemuan key={t.temuanId} t={t} api={api} />

      <h3 className="pw-sub">Tindak lanjut</h3>
      <dl className="k-rincian pw-rincian">
        <Baris label="Tim">{wo.tim && wo.tim + (wo.jenisTim ? ' (' + wo.jenisTim + ')' : '')}</Baris>
        <Baris label="Catatan admin">{wo.catatanAdmin}</Baris>
        <Baris label="Diteruskan">{wo.waktuDiteruskan && waktuWo(wo.waktuDiteruskan) + ' · ' + wo.diteruskanOleh}</Baris>
        <Baris label="Dimulai">{wo.waktuMulai && waktuWo(wo.waktuMulai) + ' · ' + wo.dimulaiOleh}</Baris>
        <Baris label="Selesai">{wo.waktuSelesai && waktuWo(wo.waktuSelesai) + ' · ' + wo.diselesaikanOleh}</Baris>
      </dl>
      {wo.tindakLanjut && <p className="pw-hasil">{wo.tindakLanjut}</p>}
      {!s && <p className="pw-catatan">Belum diteruskan ke tim.</p>}
      {s === 'TERKIRIM' && <p className="pw-catatan">Menunggu tim mulai mengerjakan. Untuk memindah atau menarik WO ini, buka menu Pindah Tim TO.</p>}
      {s === 'DIKERJAKAN' && <p className="pw-catatan pw-catatan--kerja">Sedang dikerjakan tim, WO tidak bisa dipindah.</p>}

      {pekerjaan.length > 0 && (
        <>
          <h3 className="pw-sub">Pekerjaan tim ({pekerjaan.length})</h3>
          {pekerjaan.map((p) => {
            const daftar = SLOT_FOTO_WO.map(([slot, label]) => ({ temuanId: t.temuanId, tlId: p.tlId, slot, label, ada: !!p.foto?.[slot] }));
            const ada = daftar.filter((f) => f.ada);
            return (
              <div key={p.tlId} className="pw-pekerjaan">
                <b>{ringkasPekerjaan(p) || '-'}</b>
                <small>{[p.kodeTl, p.kodeRealisasiModul && '→ ' + p.kodeRealisasiModul, p.tanggal, p.status].filter(Boolean).join('  ·  ')}</small>
                {p.catatan && <p>{p.catatan}</p>}
                <div className="pw-foto-grid pw-foto-grid--3">
                  {daftar.map((f) => <FotoKecil key={f.slot} api={api} f={f} onBuka={() => onFoto({ daftar: ada, i: ada.indexOf(f) })} />)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {bolehUbah && bolehTeruskan(t) && (
        <div className="pw-aksi">
          <button type="button" className="k-tombol k-tombol--utama" onClick={onTeruskan}><Ikon nama="kanan" ukuran={16} />Teruskan ke tim</button>
        </div>
      )}
    </article>
  );
}

/**
 * v1.0.48 Kirim WA temuan (format v1), foto temuan langsung terlampir (sama HP; foto v2 di Drive privat, link tidak terbuka
 * penerima). Browser yang bisa berbagi file (HP, Chrome / Edge Windows) = lembar Bagikan > WhatsApp, gambar + teks.
 * Selain itu (mis. browser komputer tanpa Web Share): foto disalin ke clipboard, WhatsApp dibuka dengan teks, admin tinggal
 * tempel (Ctrl+V) di chat. Clipboard ditolak = foto diunduh untuk dilampirkan. Tanpa foto = teks saja.
 */
function KirimWaTemuan({ t, api }) {
  const [sibuk, setSibuk] = useState(false);
  const [info, setInfo] = useState(null);   // { jenis, teks }
  const adaFoto = !!(t.foto && t.foto.TEMUAN);
  const namaFile = (t.kodeTemuan || 'temuan').replace(/[^\w.-]+/g, '_') + '.jpg';
  const bukaWa = (teks) => window.open('https://wa.me/?text=' + encodeURIComponent(teks), '_blank', 'noopener');
  // foto penuh disiapkan saat detail dibuka: browser hanya mengizinkan Bagikan sesaat sesudah klik
  useEffect(() => { if (adaFoto) muatFotoWo(api, { temuanId: t.temuanId, slot: 'TEMUAN' }, 'PENUH').catch(() => {}); }, [api, t.temuanId, adaFoto]);

  const kirim = async () => {
    setSibuk(true); setInfo(null);
    try {
      if (!adaFoto) {
        bukaWa(teksWaTemuan(t));
        return;
      }
      const url = await muatFotoWo(api, { temuanId: t.temuanId, slot: 'TEMUAN' }, 'PENUH');
      const blob = blobDataUrl(url);   // tanpa fetch(data:): diblokir CSP connect-src
      const file = new File([blob], namaFile, { type: 'image/jpeg' });
      const teks = teksWaTemuan(t, { fotoTerlampir: true });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: teks }); return; } catch (e) {
          if (e && e.name === 'AbortError') return;   // admin menutup lembar Bagikan
          // NotAllowedError (izin klik habis selama foto diunduh): cara cadangan di bawah
        }
      }
      // browser komputer: foto ke clipboard (PNG, satu-satunya format gambar clipboard yang didukung umum) lalu buka WA
      try {
        const png = await keBlobPng(blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        bukaWa(teks);
        setInfo({ jenis: 'ok', teks: 'Foto temuan sudah disalin. Di chat WhatsApp tekan Ctrl+V untuk melampirkan foto, lalu kirim.' });
      } catch {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file); a.download = namaFile; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        bukaWa(teks);
        setInfo({ jenis: 'ok', teks: 'Foto temuan diunduh (' + namaFile + '). Lampirkan foto itu di chat WhatsApp, lalu kirim.' });
      }
    } catch (e) {
      setInfo({ jenis: 'galat', teks: (e && e.kode ? pesan(e.kode) : 'Foto temuan gagal disiapkan.') + ' Coba lagi saat sinyal stabil.' });
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="pw-wa">
      <button type="button" className="k-tombol k-tombol--garis pw-wa-tombol" onClick={kirim} disabled={sibuk}>
        {sibuk ? <SisiLoader ukuran={16} label="Menyiapkan" /> : <Ikon nama="kanan" ukuran={16} />}{sibuk ? 'Menyiapkan foto...' : 'Kirim WA'}
      </button>
      {info && <p className={'k-pesan k-pesan--' + info.jenis} role={info.jenis === 'ok' ? 'status' : 'alert'}>{info.teks}</p>}
    </div>
  );
}

/** data URL base64 -> Blob. */
function blobDataUrl(url) {
  const [kepala, isi] = url.split(',');
  const bin = atob(isi);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Blob([b], { type: (/data:([^;]+)/.exec(kepala) || [])[1] || 'image/jpeg' });
}

/** JPEG -> PNG (clipboard browser hanya menerima image/png). */
async function keBlobPng(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return new Promise((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('png'))), 'image/png'));
}

/** Thumbnail dari server (KECIL); klik = foto penuh. f.ada false = tanpa foto. */
function FotoKecil({ api, f, onBuka }) {
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');
  const [ulang, setUlang] = useState(0);
  const ada = f.ada !== false;
  useEffect(() => {
    if (!ada) return undefined;
    let hidup = true;
    setGalat('');
    muatFotoWo(api, f).then((s) => { if (hidup) setSrc(s); }, (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, f.temuanId, f.tlId, f.slot, ada, ulang]);
  let isi;
  if (!ada) isi = <span className="pw-foto-kosong">Belum ada</span>;
  else if (galat) isi = <span className="pw-foto-kosong pw-foto-kosong--galat">Gagal memuat<button type="button" className="k-tautan" onClick={() => setUlang(ulang + 1)}>Coba lagi</button></span>;
  else if (!src) isi = <span className="pw-foto-kosong"><SisiLoader ukuran={24} label={'Memuat ' + f.label} /></span>;
  else isi = <button type="button" className="pw-foto-tombol" onClick={onBuka} aria-label={'Perbesar ' + f.label}><img src={src} alt={f.label} /></button>;
  return <figure className="pw-foto">{isi}<figcaption>{f.label}</figcaption></figure>;
}

/** Foto penuh; panah kiri / kanan pindah foto dalam kelompok yang sama. */
function DialogFoto({ d, api, onTutup, onGeser }) {
  const f = d ? d.daftar[d.i] : null;
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');
  useEffect(() => {
    if (!f) return undefined;
    setSrc(''); setGalat('');
    let hidup = true;
    muatFotoWo(api, f, 'PENUH').then((s) => { if (hidup) setSrc(s); }, (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, f]);
  if (!d || !f) return <Dialog buka={false} onTutup={onTutup} />;
  const n = d.daftar.length;
  const geser = (k) => onGeser((d.i + k + n) % n);
  return (
    <Dialog buka judul={f.label} sub={(d.i + 1) + ' dari ' + n} lebar="min(1100px, calc(100vw - 32px))" onTutup={onTutup}>
      <div className="pw-lightbox" onKeyDown={(e) => { if (e.key === 'ArrowRight') geser(1); if (e.key === 'ArrowLeft') geser(-1); }}>
        {n > 1 && <button type="button" className="k-ikon-tombol" onClick={() => geser(-1)} aria-label="Foto sebelumnya"><Ikon nama="kiri" /></button>}
        <div className="pw-lightbox-isi">
          {galat ? <p className="k-pesan k-pesan--galat">{galat}</p> : !src ? <SisiLoader ukuran={48} label="Memuat foto penuh" /> : <img src={src} alt={f.label} />}
        </div>
        {n > 1 && <button type="button" className="k-ikon-tombol" onClick={() => geser(1)} aria-label="Foto berikutnya"><Ikon nama="kanan" /></button>}
      </div>
      <div className="k-dialog-aksi">
        {src && <a className="k-tombol k-tombol--garis" href={src} download={[f.temuanId, f.tlId, f.slot].filter(Boolean).join('_') + '.jpg'}>Unduh</a>}
        <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup} autoFocus>Tutup</button>
      </div>
    </Dialog>
  );
}
