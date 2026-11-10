/** Approval P0 web: daftar kiri + detail kanan (foto, rincian, lampiran Pengecekan Gardu / Switching). Review 8 Nov 2026: dipecah dari pages/ApprovalP0.jsx (isi komponen tidak berubah). */

import { useEffect, useState } from 'react';

import {
  angkaId, LABEL_SLOT_P0, LABEL_SLOT_SWITCHING, LABEL_STATUS_P0, lokasiP0, muatFoto, namaTampil, NILAI_GARDU, SLOT_P0, tautanPeta, teksMenit,
} from '../../approvalP0.js';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { kodeGalat, pesan } from '../../pesan.js';
import { jamDari } from '../../tanggal.js';

// ---------------- daftar ----------------

const BADGE_STATUS = { Menunggu: 'proses', Approved: 'ok', Rejected: 'belum' };

function BadgeStatus({ x }) {
  return <span className={'k-badge k-badge--' + (BADGE_STATUS[x.status] || 'v1')}>{x.sistem ? 'DITOLAK SISTEM' : LABEL_STATUS_P0[x.status].toUpperCase()}</span>;
}

/** Daftar kiri; panah atas / bawah pindah P0 (tombol berikutnya difokus dan dipilih). */
export function DaftarP0({ tampil, pilih, onPilih }) {
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

export function DetailP0({ x, api, sibuk, aksi, onSetujui, onTolak, onUbahJenis, onFoto }) {
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
