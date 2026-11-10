import { useCallback, useEffect, useState } from 'react';

import { NILAI_GARDU } from '../../approvalP0.js';
import { Konfirmasi } from '../../components/Dialog.jsx';
import Ikon from '../../components/Ikon.jsx';
import SisiLoader from '../../components/SisiLoader.jsx';
import { bisaUpdateUkur, dataUpdateUkur, jenisKategori, sudahDiMaster } from '../../pengukuranGardu.js';
import { pesan } from '../../pesan.js';
import { angka, BATAS_MS, kodeGalat, tglId } from './bantu.js';
import { FormHi } from './FormHi.jsx';

/** Detail satu gardu: tab Ringkasan, Riwayat pengukuran (Update ke Master Gardu), Temuan, Berita acara, Update Pengukuran Gardu. */
export const TAB_DETAIL = [['ringkas', 'Ringkasan'], ['ukur', 'Riwayat pengukuran'], ['temuan', 'Temuan & perbaikan'], ['ba', 'Berita acara'], ['hi', 'Update Pengukuran Gardu']];

export function DetailGardu({ g, api, sesi, bolehUbah, penjaga, onGardu, tab, onTab }) {
  const [r, setR] = useState(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(true);

  const muat = useCallback(async () => {
    setMemuat(true); setGalat('');
    try { setR((await api('getRiwayatGardu', { garduId: g.id, noGardu: g.no }, { batasMs: BATAS_MS, awal: (j) => { setR(j.data); setMemuat(false); } })).data); } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api, g.id, g.no]);
  useEffect(() => { muat(); }, [muat]);

  const gTerkini = r?.gardu || g;
  const gantiTab = (t) => {
    if (tab === 'hi' && t !== 'hi' && penjaga.current && !window.confirm('Ada perubahan data gardu yang belum disimpan. Tinggalkan?')) return;
    if (t !== 'hi') penjaga.current = false;
    onTab(t);
  };
  const jumlah = { ukur: r?.pengukuran?.length, temuan: r?.temuan?.length, ba: r?.ba?.length };

  return (
    <section className="hlm-kartu pg-detail" aria-label={'Gardu ' + g.no}>
      <header className="pg-kepala">
        <div className="pg-kepala-isi">
          <span className="pg-kepala-label">Gardu distribusi</span>
          <h2>{g.no} <span className={'k-badge k-badge--' + (g.status === 'AKTIF' ? 'ok' : 'v1')}>{g.status}</span></h2>
          <p>{gTerkini.alamat || '-'}</p>
          <p className="pg-kepala-sub">{[gTerkini.penyulang, gTerkini.section, gTerkini.merk].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="pg-kepala-angka">
          <div><small>Kapasitas</small><b>{gTerkini.kva ? angka(gTerkini.kva) : '-'}<i> kVA</i></b></div>
          <div className={'pg-beban pg-beban--' + jenisKategori(gTerkini.kategori)}><small>Beban WBP · {gTerkini.kategori || 'belum diukur'}</small><b>{angka(gTerkini.persen, 1)}<i>%</i></b></div>
          <div className={'pg-beban pg-beban--' + jenisKategori(gTerkini.lwbp?.kategori)}><small>Beban LWBP · {gTerkini.lwbp?.kategori || 'belum diukur'}</small><b>{angka(gTerkini.lwbp?.persen, 1)}<i>%</i></b></div>
        </div>
        <button type="button" className="k-tombol k-tombol--garis pg-kepala-ulang" onClick={muat} disabled={memuat}>
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

export function BlokUkur({ judul, b }) {
  if (!b || !b.tglUkur) return <div className="pg-blok pg-blok--kosong"><h3>{judul}</h3><p>Belum ada pengukuran {judul} di Master Gardu.</p></div>;
  const u = b.ukur || {};
  return (
    <div className={'pg-blok pg-blok--' + jenisKategori(b.kategori)}>
      <h3>{judul} <span className={'k-badge k-badge--' + jenisKategori(b.kategori)}>{b.kategori || '-'}</span></h3>
      <p className="pg-blok-utama"><b>{angka(b.bebanKva, 2)} kVA</b> · {angka(b.persen, 1)}%</p>
      <p className="pg-blok-sub"><small>Tanggal pengukuran</small>{tglId(b.tglUkur)}</p>
      <div className="pg-nilai">{NILAI_GARDU.map((v) => <span key={v.kunci}><small>{v.label}</small>{angka(u[v.kunci], 1)} {v.satuan}</span>)}</div>
    </div>
  );
}

export function Ringkasan({ g }) {
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

export function RiwayatUkur({ r, api, bolehUbah, onMaster }) {
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

export function Temuan({ list }) {
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

export function DaftarBa({ list }) {
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

