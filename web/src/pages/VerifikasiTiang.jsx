import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { kodeGalat, pesan } from '../pesan.js';
import { hitungStatusTiang, persenJalur, SARING_TIANG, saringTiang, selesaiJalur, statusTiang, totalJalur } from '../tiang.js';
import './verifikasiTiang.css';

/**
 * Verifikasi Tiang (menu OPS_VERIFIKASI_TIANG, ADMIN / SUPER). Pola daftar + rincian (spec desain Hijau Rimba S6 A): kiri = jalur dengan
 * progres, kanan = tiang jalur terpilih (getTiangJalur, dimuat saat jalur dibuka, disimpan per jalur sampai Muat Ulang) dengan saringan
 * status. Layar sempit: dua langkah (daftar jalur -> rincian, tombol kembali). Verifikasi tetap hanya dari HP. Logika murni di tiang.js.
 */
export default function VerifikasiTiang({ api }) {
  const [jalur, setJalur] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [pilih, setPilih] = useState('');
  const [tiang, setTiang] = useState({});          // kode -> { daftar } | { galat } | { memuat: true }
  const minta = useRef(0);

  const muat = useCallback(async (opsi = {}) => {
    setMemuat(true); setGalat('');
    try {
      const j = (await api('getVerifikasiTiang', {}, { batasMs: 120000, ...opsi })).data.jalur || [];
      setJalur(j);
      setTiang({});
    } catch (e) { setGalat(pesan(kodeGalat(e))); }
    setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const buka = useCallback(async (kode, paksa = false) => {
    setPilih(kode);
    if (!paksa && tiang[kode] && !tiang[kode].galat) return;
    const no = ++minta.current;
    setTiang((t) => ({ ...t, [kode]: { memuat: true } }));
    try {
      const d = (await api('getTiangJalur', { kode }, { batasMs: 120000, ...(paksa ? { langsung: true } : {}) })).data;
      setTiang((t) => ({ ...t, [kode]: { daftar: d.tiang || [] } }));
    } catch (e) {
      if (no === minta.current) setTiang((t) => ({ ...t, [kode]: { galat: pesan(kodeGalat(e)) } }));
    }
  }, [api, tiang]);

  const t = jalur ? totalJalur(jalur) : null;
  return (
    <div className="hlm vt">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Verifikasi Tiang</h1>
          <p>Progres verifikasi tiang TM per jalur. Pilih jalur untuk melihat tiangnya; verifikasi dikerjakan dari HP.</p>
        </div>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat({ langsung: true })} disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat Ulang
          </button>
        </div>
      </header>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {!jalur && memuat && <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div>}
      {jalur && (
        <>
          <Ringkasan t={t} jumlahJalur={jalur.length} />
          {!jalur.length ? <p className="k-kosong">Belum ada tiang. Jalankan migrasi tiang dari ITB (ADMIN_migrasiTiangItb).</p> : (
            <div className={'vt-split' + (pilih ? ' vt-split--rincian' : '')}>
              <DaftarJalur jalur={jalur} pilih={pilih} onPilih={buka} />
              <Rincian j={jalur.find((x) => x.kode === pilih)} isi={tiang[pilih]} onKembali={() => setPilih('')} onUlang={() => buka(pilih, true)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Ringkasan({ t, jumlahJalur }) {
  const persen = persenJalur(t);
  return (
    <section className="vt-ringkas">
      <div className="vt-total">
        <b>{persen}%</b>
        <div>
          <span>{selesaiJalur(t)} dari {t.jumlah} tiang selesai · {jumlahJalur} jalur</span>
          <i className="vt-bar" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100}><i style={{ width: persen + '%' }} /></i>
          <small>Target 90% sebelum temuan per tiang dimulai. Hanya tiang lengkap dengan foto lapangan yang dihitung.</small>
        </div>
      </div>
      <div className="k-stat vt-stat">
        <div className="vt-stat--ok"><b>{t.terverifikasi}</b><small>Terverifikasi</small></div>
        <div className="vt-stat--draf"><b>{t.perluDilengkapi || 0}</b><small>Perlu Dilengkapi</small></div>
        <div className="vt-stat--tolak"><b>{t.perluPerbaikan}</b><small>Perlu Perbaikan</small></div>
        <div className="vt-stat--belum"><b>{t.tidakDitemukan}</b><small>Tidak Ditemukan</small></div>
        <div className="vt-stat--cek"><b>{t.bertanda}</b><small>Bertanda Cek</small></div>
      </div>
    </section>
  );
}

function DaftarJalur({ jalur, pilih, onPilih }) {
  const [cari, setCari] = useState('');
  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return q ? jalur.filter((j) => j.kode.includes(q)) : jalur;
  }, [jalur, cari]);
  return (
    <aside className="vt-daftar" aria-label="Jalur tiang">
      <label className="k-cari vt-cari">
        <Ikon nama="cari" ukuran={16} />
        <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari kode jalur, mis. PLS" aria-label="Cari jalur" />
      </label>
      <ul>
        {tampil.map((j) => {
          const p = persenJalur(j);
          return (
            <li key={j.kode}>
              <button type="button" className={'vt-jalur' + (pilih === j.kode ? ' vt-jalur--aktif' : '')} onClick={() => onPilih(j.kode)} aria-current={pilih === j.kode}>
                <span className="vt-jalur-atas">
                  <b>{j.kode}</b>
                  <span className="vt-jalur-n">{selesaiJalur(j)}/{j.jumlah}</span>
                  <span className="vt-jalur-p">{p}%</span>
                </span>
                <i className="vt-bar"><i style={{ width: p + '%' }} /></i>
                {(j.perluPerbaikan > 0 || j.bertanda > 0) && (
                  <span className="vt-jalur-tanda">
                    {j.perluPerbaikan > 0 && <span className="k-status k-status--tolak">{j.perluPerbaikan} perbaikan</span>}
                    {j.bertanda > 0 && <span className="k-status k-status--draf">{j.bertanda} cek</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {!tampil.length && <li className="vt-kosong-kecil">Tidak ada jalur "{cari}".</li>}
      </ul>
    </aside>
  );
}

function Rincian({ j, isi, onKembali, onUlang }) {
  const [status, setStatus] = useState('');
  const [cari, setCari] = useState('');
  const el = useRef(null);
  useEffect(() => {
    setStatus(''); setCari('');
    // layar sempit (dua langkah): rincian langsung terlihat, tidak tertinggal di bawah ringkasan
    if (j && globalThis.matchMedia?.('(max-width: 900px)').matches) el.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [j?.kode]);
  const daftar = isi?.daftar;
  const jumlah = useMemo(() => hitungStatusTiang(daftar), [daftar]);
  const tampil = useMemo(() => saringTiang(daftar, { status, cari }), [daftar, status, cari]);

  if (!j) {
    return (
      <section className="vt-rincian vt-rincian--kosong">
        <Ikon nama="lokasi" ukuran={28} />
        <b>Pilih jalur di kiri</b>
        <p>Tiang jalur itu tampil di sini lengkap dengan statusnya: terverifikasi, perlu dilengkapi, perlu perbaikan, atau belum.</p>
      </section>
    );
  }
  const p = persenJalur(j);
  return (
    <section className="vt-rincian" ref={el} aria-label={'Tiang jalur ' + j.kode}>
      <header className="vt-rincian-kepala">
        <button type="button" className="k-tombol k-tombol--teks vt-kembali" onClick={onKembali}><Ikon nama="kiri" ukuran={16} />Semua jalur</button>
        <div className="vt-rincian-judul">
          <h2>Jalur {j.kode}</h2>
          <span>{selesaiJalur(j)} dari {j.jumlah} tiang selesai · {p}%</span>
        </div>
        <button type="button" className="k-tombol k-tombol--garis" onClick={onUlang} disabled={isi?.memuat}><Ikon nama="ulang" ukuran={15} />Muat Ulang</button>
      </header>
      <i className="vt-bar vt-bar--besar"><i style={{ width: p + '%' }} /></i>

      {isi?.memuat && <div className="k-tengah"><SisiLoader ukuran={36} label="Memuat tiang" /></div>}
      {isi?.galat && <p className="k-pesan k-pesan--galat" role="alert">{isi.galat}</p>}
      {daftar && (
        <>
          <div className="vt-saring">
            <div className="k-chip-baris" role="group" aria-label="Saring status">
              {SARING_TIANG.map(([k, label]) => (
                <button key={k || 'semua'} type="button" className={'k-chip' + (status === k ? ' k-chip--aktif' : '')} onClick={() => setStatus(k)} aria-pressed={status === k}>
                  {label} <span className="vt-chip-n">{jumlah[k]}</span>
                </button>
              ))}
            </div>
            <label className="k-cari vt-cari">
              <Ikon nama="cari" ukuran={16} />
              <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama tiang" aria-label="Cari tiang" />
            </label>
          </div>
          {!tampil.length ? <p className="k-kosong">Tidak ada tiang dengan saringan ini.</p> : (
            <div className="k-tabel-bungkus">
              <table className="k-tabel vt-tabel">
                <thead><tr><th>Status</th><th>Tiang</th><th>Foto</th><th>Koordinat</th><th>Diverifikasi</th><th>Catatan</th></tr></thead>
                <tbody>
                  {tampil.map((x) => {
                    const s = statusTiang(x);
                    const foto = (x.foto?.TIANG ? 1 : 0) + (x.foto?.KEPALA ? 1 : 0);
                    return (
                      <tr key={x.tiangId}>
                        <td><span className={'k-status k-status--' + s.kelas}>{s.label}</span></td>
                        <td><b>{x.nama || x.tiangId}</b><span className="vt-sub">{[x.jenisTiang || x.jenisTiangAset, x.ukuranTiang || x.ukuranTiangAset].filter(Boolean).join(' · ') || '-'}</span></td>
                        <td className={foto < 2 && s.kunci !== 'BELUM' ? 'vt-merah' : ''}>{foto}/2</td>
                        <td>{x.lat != null ? (x.sumberKoordinat === 'peta' ? 'Dipilih di peta' : 'GPS lapangan') : x.latAset != null ? 'Terdaftar (aset)' : <span className="vt-merah">Tidak ada</span>}</td>
                        <td>{x.verifikasiTerakhir ? new Date(x.verifikasiTerakhir).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                        <td><div className="vt-catatan">
                          {(x.kurang || []).length > 0 && <span>Kurang: {x.kurang.join(', ')}</span>}
                          {x.tandaCek && <span className="k-status k-status--draf">Cek: {x.tandaCek}</span>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
