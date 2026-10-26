import { useCallback, useEffect, useRef, useState } from 'react';

import { bukaDiTabBaru, unduhBase64 } from '../berkas.js';
import {
  aksiBa, ARTI_TAHAP_BA, BADGE_TAHAP_BA, bagianUploadTtd, BATAS_FILE_MS, BATAS_PDF_MS, dataDaftarBa, gabungInfoBa, galatFileTtd, galatFilterBa,
  JENIS_BA, LABEL_TAHAP_BA, MENU_BA, nomorBa, SLOT_FOTO_BA, SUMBER_BA, TAHAP_BA, tahapItemBa,
} from '../beritaAcara.js';
import Dialog, { Konfirmasi } from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import TeksWa from '../components/TeksWa.jsx';
import { aksiMenu } from '../katalog.js';
import { pesan } from '../pesan.js';
import './beritaAcara.css';

const kodeGalat = (e) => (e && e.kode) || 'JARINGAN';
const tglId = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(m[0] + 'T00:00:00Z')) : (iso || '-');
};
const angka = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(v) : '');
const FILTER_AWAL = { sumber: 'SEMUA', cari: '', tahap: '', jenis: '', dari: '', sampai: '', terlama: false };

/**
 * Berita Acara Gardu (menu OPS_BA_GARDU), tahap 1 website: Daftar BA (SiSi v2 + arsip v1) dan alur satu BA
 * (PDF -> BA TTD -> Kirim EAM -> Update Master Gardu), mirror HP daftar_ba_screen + detail_ba_screen.
 * Buat / ubah BA (form Pengoperasian / Penggantian Trafo + foto) menyusul di tahap 2.
 */
export default function BeritaAcara({ api, sesi }) {
  const bolehUbah = aksiMenu(sesi, MENU_BA) === 'UBAH' && ['ADMIN', 'SUPER'].includes(sesi.profil?.role);
  const [filter, setFilter] = useState(FILTER_AWAL);
  const [cariKetik, setCariKetik] = useState('');
  const [hasil, setHasil] = useState(null); // { jumlah, ringkasan, isi, arsipAda }
  const [memuat, setMemuat] = useState(true);
  const [tambah, setTambah] = useState(false);
  const [galat, setGalat] = useState('');
  const [buka, setBuka] = useState(null);
  const urut = useRef(0);

  const muat = useCallback(async (f) => {
    const g = galatFilterBa(f);
    if (g) { setGalat(g); return; }
    const no = ++urut.current;
    setMemuat(true); setGalat('');
    try {
      const d = (await api('getDaftarBaGardu', dataDaftarBa(f))).data;
      if (no === urut.current) setHasil({ jumlah: d.jumlah || 0, ringkasan: d.ringkasan || {}, isi: d.isi || [], arsipAda: !!d.arsipAda });
    } catch (e) { if (no === urut.current) setGalat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api]);

  useEffect(() => { muat(filter); }, [filter, muat]);
  // cari dikirim ke server setelah berhenti mengetik
  useEffect(() => {
    if (cariKetik === filter.cari) return undefined;
    const t = setTimeout(() => setFilter((f) => ({ ...f, cari: cariKetik })), 450);
    return () => clearTimeout(t);
  }, [cariKetik]);

  const muatLagi = async () => {
    setTambah(true);
    try {
      const d = (await api('getDaftarBaGardu', dataDaftarBa(filter, hasil.isi.length))).data;
      setHasil((h) => ({ ...h, isi: [...h.isi, ...(d.isi || [])] }));
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setTambah(false);
  };

  const ubahFilter = (o) => setFilter((f) => ({ ...f, ...o }));
  const totalTahap = hasil ? TAHAP_BA.reduce((n, t) => n + (hasil.ringkasan[t] || 0), 0) : 0;
  const perbaruiItem = (x) => {
    setHasil((h) => ({ ...h, isi: h.isi.map((y) => (y.baId && y.baId === x.baId ? x : y)) }));
    setBuka((b) => (b && b.baId === x.baId ? x : b));
  };
  const adaFilter = filter.jenis || filter.dari || filter.sampai || filter.terlama || filter.cari || filter.sumber !== 'SEMUA';

  return (
    <div className="hlm ba">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Berita Acara</h1>
          <p>BA gardu: PDF, BA bertanda tangan, kirim EAM, update Master Gardu. Buat / ubah BA dari website menyusul.</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat(filter)} disabled={memuat}>
            {memuat && hasil ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat ulang
          </button>
        </div>
      </header>

      <div className="ba-alat">
        <div className="k-tab ba-tahap" role="tablist" aria-label="Tahap BA">
          <button type="button" role="tab" aria-selected={!filter.tahap} className={'k-tab-tombol' + (!filter.tahap ? ' k-tab-tombol--aktif' : '')} onClick={() => ubahFilter({ tahap: '' })}>
            Semua<span>{totalTahap}</span>
          </button>
          {TAHAP_BA.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={filter.tahap === t} className={'k-tab-tombol' + (filter.tahap === t ? ' k-tab-tombol--aktif' : '')}
              onClick={() => ubahFilter({ tahap: t })} title={ARTI_TAHAP_BA[t]}>
              {LABEL_TAHAP_BA[t]}<span>{hasil?.ringkasan[t] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ba-saring">
          <label className="k-cari ba-cari">
            <Ikon nama="cari" ukuran={16} />
            <input type="search" value={cariKetik} onChange={(e) => setCariKetik(e.target.value)} placeholder="No gardu, ID / No BA, penyulang" aria-label="Cari BA" />
          </label>
          <select className="k-input" value={filter.sumber} onChange={(e) => ubahFilter({ sumber: e.target.value })} aria-label="Sumber BA">
            {SUMBER_BA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="k-input" value={filter.jenis} onChange={(e) => ubahFilter({ jenis: e.target.value })} aria-label="Jenis BA">
            <option value="">Semua jenis</option>
            <optgroup label="Trafo">{JENIS_BA.TRAFO.map((j) => <option key={j} value={j}>{j}</option>)}</optgroup>
            <optgroup label="Switching">{JENIS_BA.SWITCHING.map((j) => <option key={j} value={j}>{j}</option>)}</optgroup>
          </select>
          <label className="ba-tgl"><span>Dari</span><input type="date" className="k-input" value={filter.dari} onChange={(e) => ubahFilter({ dari: e.target.value })} /></label>
          <label className="ba-tgl"><span>Sampai</span><input type="date" className="k-input" value={filter.sampai} onChange={(e) => ubahFilter({ sampai: e.target.value })} /></label>
          <select className="k-input" value={filter.terlama ? '1' : ''} onChange={(e) => ubahFilter({ terlama: !!e.target.value })} aria-label="Urutan">
            <option value="">Terbaru dulu</option><option value="1">Terlama dulu</option>
          </select>
          {adaFilter && <button type="button" className="k-tombol k-tombol--teks" onClick={() => { setCariKetik(''); setFilter({ ...FILTER_AWAL, tahap: filter.tahap }); }}>Hapus saring</button>}
        </div>
      </div>

      {galat && <p className="k-pesan k-pesan--galat ba-pesan" role="alert">{galat}</p>}
      {!hasil && memuat && <div className="k-tengah"><SisiLoader ukuran={56} label="Memuat BA" /><p>Memuat daftar BA...</p></div>}
      {hasil && (
        <section className={'hlm-kartu ba-daftar' + (memuat ? ' ba-daftar--muat' : '')} aria-busy={memuat}>
          <p className="k-catatan ba-jumlah">{hasil.jumlah} BA{filter.tahap ? ' · ' + LABEL_TAHAP_BA[filter.tahap] : ''}{filter.sumber !== 'V2' && !hasil.arsipAda ? ' · arsip v1 belum tersedia di server' : ''}</p>
          {!hasil.isi.length ? <p className="k-kosong">Tidak ada BA yang cocok.</p> : (
            <div className="k-tabel-bungkus">
              <table className="k-tabel ba-tabel">
                <thead><tr><th>Tanggal BA</th><th>No BA</th><th>Jenis</th><th>Gardu</th><th>Penyulang</th><th>Tahap</th><th>Alur</th></tr></thead>
                <tbody>
                  {hasil.isi.map((x, i) => {
                    const tahap = tahapItemBa(x);
                    return (
                      <tr key={(x.baId || x.arsipId) + i} className="ba-baris" onClick={() => setBuka(x)}>
                        <td className="ba-nowrap">{tglId(x.tanggalBa)}</td>
                        <td>
                          <button type="button" className="ba-buka" onClick={(e) => { e.stopPropagation(); setBuka(x); }}>{nomorBa(x)}</button>
                          {x.arsip && <span className="k-badge k-badge--v1 ba-v1">ARSIP V1</span>}
                          {x.idBa && x.noBaFull && <small>{x.idBa}</small>}
                        </td>
                        <td>{x.jenis}</td>
                        <td className="ba-nowrap"><b>{x.noGardu || x.nama}</b></td>
                        <td>{x.penyulang || '-'}</td>
                        <td><span className={'k-badge k-badge--' + BADGE_TAHAP_BA[tahap]} title={ARTI_TAHAP_BA[tahap]}>{LABEL_TAHAP_BA[tahap] || tahap}</span></td>
                        <td className="ba-alur-mini">
                          <i className={x.statusPdf === 'SELESAI' ? 'ya' : ''} title="PDF BA">PDF</i>
                          <i className={x.statusTtd === 'SUDAH TTD' ? 'ya' : x.statusTtd === 'TTD ULANG' ? 'ulang' : ''} title="BA TTD">TTD</i>
                          {!x.arsip && <i className={x.eamKali ? 'ya' : ''} title={x.eamKali ? 'Kirim EAM ' + x.eamKali + 'x' : 'Belum kirim EAM'}>EAM</i>}
                          {!x.arsip && <i className={x.masterTerakhir ? 'ya' : ''} title="Update Master Gardu">MST</i>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasil.isi.length < hasil.jumlah && (
            <div className="k-bawah ba-lagi">
              <button type="button" className="k-tombol k-tombol--garis" onClick={muatLagi} disabled={tambah}>
                {tambah && <SisiLoader ukuran={16} label="Memuat" />}Muat lebih banyak ({hasil.isi.length} dari {hasil.jumlah})
              </button>
            </div>
          )}
        </section>
      )}

      {buka && (buka.arsip
        ? <DetailArsip x={buka} api={api} onTutup={() => setBuka(null)} />
        : <DetailBa key={buka.baId} item={buka} api={api} bolehUbah={bolehUbah} onItem={perbaruiItem} onTutup={() => setBuka(null)} />)}
    </div>
  );
}

// ---------------- detail BA v2 ----------------

function Rincian({ judul, baris }) {
  const isi = baris.filter(([, v]) => v !== '' && v !== null && v !== undefined);
  if (!isi.length) return null;
  return (
    <section className="ba-rincian">
      <h3>{judul}</h3>
      <dl>{isi.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}

function DetailBa({ item, api, bolehUbah, onItem, onTutup }) {
  const [d, setD] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState('');   // aksi yang sedang berjalan
  const [info, setInfo] = useState(null);   // { jenis, teks }
  const [yakin, setYakin] = useState(null); // 'pdf' | 'master'
  const [eam, setEam] = useState(null);     // jawaban kirimEamBaGardu
  const [master, setMaster] = useState(null);
  const [progres, setProgres] = useState('');
  const inputTtd = useRef(null);

  const muat = useCallback(async () => {
    setGalat('');
    try { setD((await api('getBaGardu', { baId: item.baId })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
  }, [api, item.baId]);
  useEffect(() => { muat(); }, [muat]);

  const x = d ? { ...item, ...gabungInfoBa(item, d), jenis: d.jenis || item.jenis } : item;
  const a = aksiBa(x, bolehUbah), tahap = tahapItemBa(x);
  const terapkan = (j) => { const baru = gabungInfoBa(x, j); onItem(baru); if (d) setD({ ...d, ...baru }); };
  const jalankan = async (nama, fn, teksOk) => {
    if (sibuk) return;
    setSibuk(nama); setInfo(null);
    try { const r = await fn(); if (teksOk) setInfo({ jenis: 'ok', teks: typeof teksOk === 'function' ? teksOk(r) : teksOk }); return r; } catch (e) {
      setInfo({ jenis: 'galat', teks: pesan(kodeGalat(e)) });
      return null;
    } finally { setSibuk(''); setProgres(''); }
  };

  const buatPdf = () => jalankan('pdf', async () => {
    const r = (await api('buatPdfBaGardu', { baId: x.baId }, { batasMs: BATAS_PDF_MS })).data;
    terapkan({ ...r, tahap: x.adaTtd ? 'TTD_ULANG' : 'PROSES_TTD', statusTtd: x.adaTtd ? 'TTD ULANG' : x.statusTtd });
    return r;
  }, (r) => 'PDF BA dibuat' + (r.fotoHilang?.length ? '. Foto kosong: ' + r.fotoHilang.join(', ') : '.'));
  const ambilPdf = async () => { const r = (await api('getPdfBaGardu', { baId: x.baId }, { batasMs: BATAS_FILE_MS })).data; return { ...r, mime: 'application/pdf' }; };
  const ambilTtd = async () => (await api('getTtdBaGardu', { baId: x.baId }, { batasMs: BATAS_FILE_MS })).data;

  const pilihTtd = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const g = galatFileTtd(bytes, f.name);
    if (g) { setInfo({ jenis: 'galat', teks: g }); return; }
    jalankan('ttd', async () => {
      const bagian = await bagianUploadTtd(x.baId, bytes, f.name);
      let r = null;
      for (const b of bagian) {
        setProgres('Mengirim bagian ' + b.ke + ' dari ' + b.dari + '...');
        r = (await api('uploadTtdBaGardu', b, { batasMs: BATAS_FILE_MS })).data;
      }
      terapkan(r);
      return r;
    }, (r) => 'BA TTD ' + (r.ulang ? 'diganti' : 'tersimpan') + ': ' + r.namaFile);
  };

  const kirimEam = () => jalankan('eam', async () => {
    const r = (await api('kirimEamBaGardu', { baId: x.baId })).data;
    terapkan(r); setEam(r);
    return r;
  });
  const updateMaster = () => jalankan('master', async () => {
    const r = (await api('updateMasterGarduBa', { baId: x.baId }, { batasMs: BATAS_FILE_MS })).data;
    terapkan(r); setMaster(r); setYakin(null);
    return r;
  });

  const slot = SLOT_FOTO_BA[x.jenis] || [];
  const tr = d && (d.kvaSesudah || d.merkSesudah);

  return (
    <Dialog buka judul={nomorBa(x)} sub={x.jenis + ' · ' + (x.noGardu || '') + (x.idBa ? ' · ' + x.idBa : '')} lebar="min(1060px, calc(100vw - 32px))"
      kunci={!!sibuk} onTutup={onTutup}>
      <div className="ba-detail-tahap">
        <span className={'k-badge k-badge--' + BADGE_TAHAP_BA[tahap]}>{LABEL_TAHAP_BA[tahap]}</span>
        <span className="k-catatan">{ARTI_TAHAP_BA[tahap]}</span>
      </div>
      {galat && <p className="k-pesan k-pesan--galat">{galat} <button type="button" className="k-tautan" onClick={muat}>Coba lagi</button></p>}
      <div className="ba-detail">
        <div className="ba-detail-kiri">
          {!d && !galat && <div className="k-tengah ba-dalam"><SisiLoader ukuran={40} label="Memuat BA" /></div>}
          {d && (
            <>
              <Rincian judul="Berita Acara" baris={[['Tanggal BA', tglId(d.tanggalBa)], ['Tanggal pekerjaan', tglId(d.tanggalPekerjaan)], ['Revisi BA', d.revisiBa ? 'ke-' + d.revisiBa : ''],
                ['Status BA', d.statusBa]]} />
              <Rincian judul="Lokasi" baris={[['Penyulang', d.penyulang], ['Section', d.section], ['Alamat', d.alamat],
                ['Koordinat', d.koordinat && <a href={'https://www.google.com/maps?q=' + d.koordinat.replace(/\s/g, '')} target="_blank" rel="noopener noreferrer">{d.koordinat}</a>]]} />
              <Rincian judul={tr ? 'Trafo sebelum' : 'Trafo'} baris={[['Konstruksi', d.konstruksi], ['Kapasitas', d.kva ? angka(d.kva) + ' kVA' : ''], ['Merk', d.merk], ['No seri', d.seri],
                ['Tahun', d.tahun || ''], ['Jurusan', d.jurusan || ''], ['Kepemilikan', d.kepemilikan], ['OwnerId', d.ownerId], ['External Reference', d.externalReference],
                ['Perluasan SUTM', d.perluasanSutm ? angka(d.perluasanSutm, 2) + ' kmS' : '']]} />
              {tr && <Rincian judul="Trafo sesudah" baris={[['Kapasitas', d.kvaSesudah ? angka(d.kvaSesudah) + ' kVA' : ''], ['Merk', d.merkSesudah], ['No seri', d.seriSesudah],
                ['Tahun', d.tahunSesudah || ''], ['Asal trafo', d.asalTrafo], ['Jurusan', d.jurusanSesudah || '']]} />}
              <Rincian judul="PHB-TR" baris={[['Merk', d.merkPhb], ['No seri', d.seriPhb], ['Tahun', d.tahunPhb || ''],
                ['Diganti', d.phbDiganti ? [d.merkPhbSesudah, d.seriPhbSesudah, d.tahunPhbSesudah].filter(Boolean).join(' · ') || 'Ya' : '']]} />
              <Rincian judul="Pelaksana" baris={[['Petugas 1', d.petugas1], ['Petugas 2', d.petugas2], ['Mengetahui', d.mengetahui && d.mengetahui + (d.jabatanMengetahui ? ' (' + d.jabatanMengetahui + ')' : '')],
                ['Vendor', d.vendor], ['Catatan', d.catatan]]} />
              {slot.length > 0 && (
                <section className="ba-rincian">
                  <h3>Foto</h3>
                  <div className="ba-foto-grid">
                    {slot.map(([s, label]) => <FotoBa key={s} api={api} baId={x.baId} slot={s} label={label} ada={(d.foto || []).includes(s)} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="ba-alur" aria-label="Alur BA">
          <div role="status" aria-live="polite">
            {progres && <p className="k-pesan k-pesan--ok">{progres}</p>}
            {info && <p className={'k-pesan k-pesan--' + info.jenis}>{info.teks}</p>}
          </div>
          <Langkah no="1" judul="PDF BA" selesai={x.statusPdf === 'SELESAI'} ket={x.statusPdf === 'SELESAI' ? 'Dibuat ' + (x.waktuPdf || '') : x.statusPdf === 'GAGAL' ? 'Gagal dibuat, coba lagi' : 'Belum dibuat'}>
            {a.buatPdf && (
              <button type="button" className="k-tombol k-tombol--utama" disabled={!!sibuk} onClick={() => (x.adaTtd ? setYakin('pdf') : buatPdf())}>
                {sibuk === 'pdf' ? <SisiLoader ukuran={16} warna="#fff" label="Membuat PDF" /> : <Ikon nama="dokumen" ukuran={16} />}
                {sibuk === 'pdf' ? 'Membuat PDF...' : x.statusPdf === 'SELESAI' ? 'Buat ulang' : 'Buat PDF'}
              </button>
            )}
            {a.unduhPdf && <>
              <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('lihatPdf', () => bukaDiTabBaru(ambilPdf))}>Lihat</button>
              <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('unduhPdf', async () => { const r = await ambilPdf(); unduhBase64(r.data, r.mime, r.namaFile); })}>Unduh</button>
            </>}
            {!x.pdfBisa && <small className="k-catatan">PDF untuk jenis ini belum tersedia di SiSi v2.</small>}
          </Langkah>

          <Langkah no="2" judul="BA bertanda tangan" selesai={x.statusTtd === 'SUDAH TTD'} ulang={x.statusTtd === 'TTD ULANG'}
            ket={x.statusTtd === 'SUDAH TTD' ? 'Diupload ' + (x.waktuTtd || '') : x.statusTtd === 'TTD ULANG' ? 'Perlu upload ulang (PDF / BA berubah)' : 'Belum diupload'}>
            {a.uploadTtd && <>
              <input ref={inputTtd} type="file" accept="application/pdf,.pdf" hidden onChange={pilihTtd} />
              <button type="button" className="k-tombol k-tombol--utama" disabled={!!sibuk} onClick={() => inputTtd.current?.click()}>
                {sibuk === 'ttd' ? <SisiLoader ukuran={16} warna="#fff" label="Mengirim" /> : <Ikon nama="masuk" ukuran={16} />}{x.adaTtd ? 'Ganti file TTD' : 'Upload PDF TTD'}
              </button>
            </>}
            {a.unduhTtd && <>
              <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('lihatTtd', () => bukaDiTabBaru(ambilTtd))}>Lihat</button>
              <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('unduhTtd', async () => { const r = await ambilTtd(); unduhBase64(r.data, r.mime, r.namaFile); })}>Unduh</button>
            </>}
            {bolehUbah && !a.uploadTtd && !a.unduhTtd && <small className="k-catatan">{a.alasanPdf || 'Tidak tersedia.'}</small>}
            {a.uploadTtd && <small className="k-catatan">PDF hasil scan / tanda tangan, maks 10 MB.</small>}
          </Langkah>

          <Langkah no="3" judul="Kirim EAM" selesai={!!x.eamKali} ket={x.eamKali ? x.eamKali + ' kali · terakhir ' + x.eamTerakhir : 'Belum dikirim'}>
            {bolehUbah && (
              <button type="button" className="k-tombol k-tombol--utama" disabled={!!sibuk || !a.kirimEam} onClick={kirimEam} title={a.alasanEam || undefined}>
                {sibuk === 'eam' ? <SisiLoader ukuran={16} warna="#fff" label="Menyiapkan" /> : <Ikon nama="laporan" ukuran={16} />}Buat teks EAM
              </button>
            )}
            {a.alasanEam && <small className="k-catatan">{a.alasanEam}</small>}
          </Langkah>

          <Langkah no="4" judul="Update Master Gardu" selesai={!!x.masterTerakhir} ket={x.masterTerakhir ? 'Terakhir ' + x.masterTerakhir : 'Belum diterapkan'}>
            {bolehUbah && (
              <button type="button" className="k-tombol k-tombol--utama" disabled={!!sibuk || !a.updateMaster} onClick={() => setYakin('master')}
                title={a.updateMaster ? undefined : a.alasanEam || 'Jenis BA ini belum bisa diterapkan ke master.'}>
                <Ikon nama="ulang" ukuran={16} />Update Master
              </button>
            )}
            {master && <HasilMaster r={master} />}
          </Langkah>
        </aside>
      </div>

      <Konfirmasi sibuk={!!sibuk} onTutup={() => setYakin(null)}
        onYa={() => (yakin === 'pdf' ? (setYakin(null), buatPdf()) : updateMaster())}
        k={yakin === 'pdf' ? { judul: 'Buat ulang PDF?', tombol: 'Buat ulang', teks: 'BA TTD yang sudah diupload jadi tidak berlaku (status Perlu TTD ulang). Kirim EAM dan Update Master terkunci sampai BA TTD baru diupload.' }
          : yakin === 'master' ? { judul: 'Update Master Gardu?', tombol: 'Update Master', teks: 'Isian BA ' + nomorBa(x) + ' diterapkan ke db_Gardu gardu ' + (x.noGardu || '') + ', lalu 3 sheet gardu lama mengikuti.' } : null} />
      <DialogEam r={eam} api={api} baId={x.baId} onTutup={() => setEam(null)} />
    </Dialog>
  );
}

function Langkah({ no, judul, selesai, ulang, ket, children }) {
  return (
    <section className={'ba-langkah' + (selesai ? ' ba-langkah--selesai' : ulang ? ' ba-langkah--ulang' : '')}>
      <header><span className="ba-langkah-no">{selesai ? <Ikon nama="centang" ukuran={14} tebal={3} /> : no}</span><b>{judul}</b></header>
      <p>{ket}</p>
      <div className="ba-langkah-aksi">{children}</div>
    </section>
  );
}

function HasilMaster({ r }) {
  const sheet = r.sheet?.hasil || [];
  return (
    <div className="ba-hasil-master">
      <p><b>{r.status === 'OK' ? r.diubah.length + ' kolom db_Gardu ' + r.noGarduMaster + ' diubah' : 'Master sudah sama dengan BA'}</b></p>
      {r.diubah?.length > 0 && <ul>{r.diubah.map((c) => <li key={c.kolom}>{c.kolom}: {String(c.lama || '-')} → {String(c.baru || '-')}</li>)}</ul>}
      {sheet.length > 0 && (
        <p className="k-catatan">3 sheet gardu lama: {sheet.map((h) => h.tab + (h.ok ? ' ✓' : h.lewat ? ' (belum diatur)' : ' ✗')).join(', ')}
          {r.sheet && !r.sheet.ok ? '. Yang belum tertulis disusul sinkron 05:00.' : ''}</p>
      )}
    </div>
  );
}

function DialogEam({ r, api, baId, onTutup }) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const unduh = async () => {
    setSibuk(true); setGalat('');
    try { const f = (await api('getTtdBaGardu', { baId }, { batasMs: BATAS_FILE_MS })).data; unduhBase64(f.data, f.mime, f.namaFile); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setSibuk(false);
  };
  return (
    <Dialog buka={!!r} judul="Kirim EAM" sub={r && r.idBa + ' · kirim ke-' + r.eamKali} lebar="min(620px, calc(100vw - 32px))" onTutup={onTutup}>
      {r && (
        <>
          <p className="k-catatan" style={{ margin: 0 }}>Salin teks ke WhatsApp EAM, lalu lampirkan file BA TTD <b>{r.namaFile}</b>.</p>
          {r.peringatan?.map((p) => <p key={p} className="k-peringatan" style={{ margin: 0 }}>{p}</p>)}
          <TeksWa teks={r.teks} tinggiMaks="40vh" />
          {galat && <p className="k-pesan k-pesan--galat">{galat}</p>}
          <div className="k-dialog-aksi">
            <button type="button" className="k-tombol k-tombol--garis" onClick={unduh} disabled={sibuk}>{sibuk && <SisiLoader ukuran={16} label="Mengunduh" />}Unduh file BA TTD</button>
            <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup}>Selesai</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Thumbnail foto BA (getFotoBaGardu KECIL); klik = foto penuh di tab baru. */
function FotoBa({ api, baId, slot, label, ada }) {
  const [src, setSrc] = useState('');
  const [galat, setGalat] = useState('');
  useEffect(() => {
    if (!ada) return undefined;
    let hidup = true;
    api('getFotoBaGardu', { baId, slot, ukuran: 'KECIL' }).then((j) => { if (hidup) setSrc('data:' + (j.data.mime || 'image/jpeg') + ';base64,' + j.data.data); },
      (e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, baId, slot, ada]);
  const penuh = () => bukaDiTabBaru(async () => (await api('getFotoBaGardu', { baId, slot, ukuran: 'PENUH' }, { batasMs: BATAS_FILE_MS })).data).catch((e) => setGalat(pesan(kodeGalat(e))));
  return (
    <figure className="ba-foto">
      {!ada ? <span className="ba-foto-kosong">Tidak ada foto</span>
        : galat ? <span className="ba-foto-kosong ba-foto-kosong--galat" title={galat}>Gagal memuat</span>
        : !src ? <span className="ba-foto-kosong"><SisiLoader ukuran={22} label={'Memuat ' + label} /></span>
        : <button type="button" className="ba-foto-tombol" onClick={penuh} aria-label={'Buka foto ' + label}><img src={src} alt={label} /></button>}
      <figcaption>{label}</figcaption>
    </figure>
  );
}

// ---------------- arsip v1 (baca saja) ----------------

function DetailArsip({ x, api, onTutup }) {
  const [sibuk, setSibuk] = useState('');
  const [galat, setGalat] = useState('');
  const ambil = (berkas) => async () => (await api('getFileArsipBaGardu', { arsipId: x.arsipId, berkas }, { batasMs: BATAS_FILE_MS })).data;
  const jalankan = async (nama, fn) => {
    setSibuk(nama); setGalat('');
    try { await fn(); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setSibuk('');
  };
  const tahap = tahapItemBa(x);
  return (
    <Dialog buka judul={nomorBa(x)} sub={'Arsip BA v1 · ' + x.jenis} lebar="min(620px, calc(100vw - 32px))" onTutup={onTutup}>
      <div className="ba-detail-tahap">
        <span className="k-badge k-badge--v1">ARSIP V1 · BACA SAJA</span>
        <span className={'k-badge k-badge--' + BADGE_TAHAP_BA[tahap]}>{LABEL_TAHAP_BA[tahap]}</span>
      </div>
      <Rincian judul="BA lama" baris={[['Tanggal BA', tglId(x.tanggalBa)], ['ID BA', x.idBa], ['Peralatan', x.peralatan === 'SWITCHING' ? 'Switching' + (x.jenisSwitching ? ' (' + x.jenisSwitching + ')' : '') : 'Trafo'],
        [x.peralatan === 'SWITCHING' ? 'Nama switching' : 'Gardu', x.nama], ['Penyulang', x.penyulang], ['Section', x.section], ['Alamat', x.alamat],
        ['Kapasitas', x.kva ? angka(x.kva) + ' kVA' : ''], ['Status PDF v1', x.statusPdfV1], ['Sumber', x.sumber]]} />
      {galat && <p className="k-pesan k-pesan--galat">{galat}</p>}
      <div className="k-dialog-aksi ba-arsip-aksi">
        {x.adaPdf && <>
          <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('lp', () => bukaDiTabBaru(ambil('PDF')))}>Lihat PDF</button>
          <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('up', async () => { const f = await ambil('PDF')(); unduhBase64(f.data, f.mime, f.namaFile); })}>Unduh PDF</button>
        </>}
        {x.adaTtd && (
          <button type="button" className="k-tombol k-tombol--garis" disabled={!!sibuk} onClick={() => jalankan('ut', async () => { const f = await ambil('TTD')(); unduhBase64(f.data, f.mime, f.namaFile); })}>Unduh BA TTD</button>
        )}
        {sibuk && <SisiLoader ukuran={18} label="Memuat berkas" />}
        <span className="k-spasi" />
        <button type="button" className="k-tombol k-tombol--utama" onClick={onTutup}>Tutup</button>
      </div>
    </Dialog>
  );
}
