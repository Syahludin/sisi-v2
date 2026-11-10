import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import Dialog from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { fotoKeJpegBa } from '../baForm.js';
import { BATAS_FILE_MS, keBase64, sha256Hex } from '../beritaAcara.js';
import { aksiMenu } from '../katalog.js';
import {
  cekIsian, daftarPenyulang, gantiJenis, infoJenis, infoStatus, isianBaru, isianDari, JENIS_SWITCHING, labelPilihan, labelSwitching, MENU_SWITCHING,
  payloadSimpan, persenTerverifikasi, PILIHAN, pilihanHulu, ringkasSwitching, saringSwitching, sectionPenyulang, SLOT_FOTO, titikSwitching,
  waktuSingkat,
} from '../masterSwitching.js';
import { LATAR_PETA, PUSAT_PETA } from '../petaTemuan.js';
import { kodeGalat, pesan } from '../pesan.js';
import useKirimLatar from '../useKirimLatar.jsx';
import TabJaringan from './jaringan/TabJaringan.jsx';
import TabSegmen from './jaringan/TabSegmen.jsx';
import './masterSwitching.css';
import './verifikasiTiang.css';

/**
 * Master Jaringan (menu OPS_MASTER_SWITCHING, ADMIN / SUPER; dulu Master Switching): tiga tab, Switching (peta + verifikasi),
 * Jaringan (penyulang + section) dan Segmen. Semua simpan berjalan di latar belakang (useKirimLatar) lalu kartu "Data Berhasil
 * disimpan". Panel Switching = pendataan aset switching dari lapangan.
 * Satu layar: ringkasan verifikasi + jumlah per jenis, peta (Leaflet + OpenStreetMap / Esri satelit, gratis tanpa API key) dan
 * daftar berdampingan. Klik titik / baris = rincian (foto, Google Maps, Ubah). Tambah / Ubah = form bertahap: isian wajib di atas,
 * isian lain dilipat. Simpan oleh Admin = verifikasi langsung berlaku (server). Logika murni di masterSwitching.js.
 */
export default function MasterJaringan({ api, sesi, rute, keRute }) {
  const bolehUbah = aksiMenu(sesi, MENU_SWITCHING) === 'UBAH';
  const tab = ['jaringan', 'segmen'].includes(rute?.query?.tab) ? rute.query.tab : 'switching';
  const { kirim, popup, galat, hapusGalat } = useKirimLatar(api);
  return (
    <div className="hlm msw">
      <header className="hlm-header">
        <div className="hlm-judul">
          <h1>Master Jaringan</h1>
          <p>Switching, penyulang + section, dan segmen. Semua dapat ditambah, diubah, serta diaktifkan / dinonaktifkan (data tidak dihapus).</p>
        </div>
      </header>
      <div className="k-tab vt-tab" role="tablist">
        {[['switching', 'Switching'], ['jaringan', 'Jaringan'], ['segmen', 'Segmen']].map(([k, label]) => (
          <button type="button" key={k} role="tab" aria-selected={tab === k} className={'k-tab-tombol' + (tab === k ? ' k-tab-tombol--aktif' : '')}
            onClick={() => { hapusGalat(); keRute({ query: { tab: k === 'switching' ? '' : k } }, { ganti: true }); }}>{label}</button>
        ))}
      </div>
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      {tab === 'switching' && <PanelSwitching api={api} sesi={sesi} kirim={kirim} />}
      {tab === 'jaringan' && <TabJaringan api={api} bolehUbah={bolehUbah} kirim={kirim} />}
      {tab === 'segmen' && <TabSegmen api={api} bolehUbah={bolehUbah} kirim={kirim} />}
      {popup}
    </div>
  );
}

function PanelSwitching({ api, sesi, kirim }) {
  const bolehUbah = aksiMenu(sesi, MENU_SWITCHING) === 'UBAH';
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [filter, setFilter] = useState({ jenis: '', penyulang: '', status: '', cari: '', nonaktif: false });
  const [latar, setLatar] = useState('peta');
  const [pilih, setPilih] = useState(null);
  const [form, setForm] = useState(null);
  const elPeta = useRef(null);
  const peta = useRef(null);
  const lapisTitik = useRef(null);
  const lapisLatar = useRef({});
  const urut = useRef(0);

  const muat = useCallback(async (opsi = {}) => {
    const no = ++urut.current;
    setMemuat(true); setGalat('');
    try {
      const j = await api('getMasterSwitching', {}, { awal: (c) => { if (no === urut.current) setData(c.data); }, ...opsi });
      if (no === urut.current) setData(j.data);
    } catch (e) { if (no === urut.current) setGalat(pesan(kodeGalat(e))); }
    if (no === urut.current) setMemuat(false);
  }, [api]);
  useEffect(() => { muat(); }, [muat]);

  const semua = useMemo(() => data?.switching || [], [data]);
  const jaringan = useMemo(() => data?.jaringan || [], [data]);
  const penyulang = useMemo(() => daftarPenyulang(jaringan), [jaringan]);
  const ringkas = useMemo(() => ringkasSwitching(semua), [semua]);
  const tampil = useMemo(() => saringSwitching(semua, filter), [semua, filter]);
  const namaPerId = useMemo(() => Object.fromEntries(semua.map((s) => [s.switchingId, s.nama])), [semua]);
  const persen = persenTerverifikasi(ringkas);

  // peta dibuat sekali
  useEffect(() => {
    const m = L.map(elPeta.current, { center: PUSAT_PETA, zoom: 11, preferCanvas: true });
    Object.entries(LATAR_PETA).forEach(([k, v]) => { lapisLatar.current[k] = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution }); });
    lapisLatar.current.peta.addTo(m);
    lapisTitik.current = L.layerGroup().addTo(m);
    peta.current = m;
    return () => { m.remove(); peta.current = null; };
  }, []);
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    Object.entries(lapisLatar.current).forEach(([k, l]) => { if (k === latar) l.addTo(m); else m.removeLayer(l); });
  }, [latar]);
  useEffect(() => {
    const m = peta.current, g = lapisTitik.current;
    if (!m || !g) return;
    g.clearLayers();
    const batas = [];
    tampil.forEach((s) => {
      const k = titikSwitching(s);
      if (!k) return;
      const j = infoJenis(s.jenis);
      L.circleMarker(k, { radius: 8, color: s.statusVerifikasi === 'PERLU_PERBAIKAN' ? '#c9861f' : '#fff', weight: 3, fillColor: j.warna, fillOpacity: 0.95 })
        .bindTooltip(j.label + ' · ' + s.nama, { direction: 'top', offset: [0, -6] })
        .on('click', () => setPilih(s))
        .addTo(g);
      batas.push(k);
    });
    if (batas.length === 1) m.setView(batas[0], 16);
    else if (batas.length > 1) m.fitBounds(batas, { padding: [30, 30], maxZoom: 16 });
  }, [tampil]);

  const ubahFilter = (o) => setFilter((f) => ({ ...f, ...o }));
  const keTitik = (s) => { const k = titikSwitching(s); if (k && peta.current) peta.current.setView(k, 17); setPilih(s); };
  // simpan di latar belakang: dialog langsung tertutup, kartu "Data Berhasil disimpan" saat server selesai
  const kirimSwitching = (payload) => { setForm(null); kirim('simpanSwitching', payload, () => muat({ langsung: true })); };

  return (
    <div className="msw-panel">
      <header className="msw-toolbar">
        <p>Aset switching hasil verifikasi lapangan: PMT, ACR, SSO, LBS, FCO, DS. Klik titik atau baris untuk rinciannya.</p>
        <div className="hlm-aksi">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => muat({ langsung: true })} disabled={memuat}>
            {memuat ? <SisiLoader ukuran={16} label="Memuat" /> : <Ikon nama="ulang" ukuran={16} />}Muat Ulang
          </button>
          {bolehUbah && (
            <button type="button" className="k-tombol k-tombol--utama" onClick={() => setForm(isianBaru(filter.penyulang))} disabled={!data}>
              <Ikon nama="tambah" ukuran={16} />Tambah Switching
            </button>
          )}
        </div>
      </header>

      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}

      <section className="msw-kpi" aria-label="Ringkasan verifikasi">
        <button type="button" className={'msw-kpi-utama' + (filter.status === '' ? ' aktif' : '')} onClick={() => ubahFilter({ status: '' })}>
          <small>Switching aktif</small><b>{ringkas.total}</b>
          <span className="msw-bar" aria-hidden="true"><i style={{ width: persen + '%' }} /></span>
          <em>{persen}% terverifikasi</em>
        </button>
        {[['TERVERIFIKASI', 'Terverifikasi', 'ok'], ['PERLU_PERBAIKAN', 'Perlu perbaikan', 'kuning'], ['BELUM', 'Belum diverifikasi', 'merah']].map(([k, label, w]) => (
          <button type="button" key={k} className={'msw-kpi-' + w + (filter.status === k ? ' aktif' : '')} onClick={() => ubahFilter({ status: filter.status === k ? '' : k })}>
            <small>{label}</small><b>{ringkas[k]}</b>
          </button>
        ))}
      </section>

      <div className="msw-jenis" role="group" aria-label="Saring jenis">
        <button type="button" className={'msw-pil' + (!filter.jenis ? ' aktif' : '')} onClick={() => ubahFilter({ jenis: '' })}>Semua <b>{ringkas.total}</b></button>
        {JENIS_SWITCHING.map((j) => (
          <button type="button" key={j.kode} className={'msw-pil' + (filter.jenis === j.kode ? ' aktif' : '')} onClick={() => ubahFilter({ jenis: filter.jenis === j.kode ? '' : j.kode })} title={j.nama}>
            <i style={{ background: j.warna }} />{j.label} <b>{ringkas.jenis[j.kode] || 0}</b>
          </button>
        ))}
      </div>

      <div className="msw-saring">
        <select className="k-input msw-pny" value={filter.penyulang} onChange={(e) => ubahFilter({ penyulang: e.target.value })} aria-label="Penyulang">
          <option value="">Semua penyulang</option>
          {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="k-cari">
          <Ikon nama="cari" ukuran={16} />
          <input type="search" value={filter.cari} onChange={(e) => ubahFilter({ cari: e.target.value })} placeholder="Cari nama, ID, merk kontroler" aria-label="Cari switching" />
        </label>
        <label className="msw-cek"><input type="checkbox" checked={filter.nonaktif} onChange={(e) => ubahFilter({ nonaktif: e.target.checked })} />Nonaktif ({ringkas.nonaktif})</label>
      </div>

      <div className="msw-isi">
        <div className="msw-peta-bungkus">
          <div ref={elPeta} className="msw-peta" role="region" aria-label="Peta switching" />
          <div className="msw-latar" role="group" aria-label="Latar peta">
            {[['peta', 'Peta'], ['satelit', 'Satelit']].map(([k, v]) => (
              <button type="button" key={k} className={latar === k ? 'aktif' : ''} onClick={() => setLatar(k)}>{v}</button>
            ))}
          </div>
          {ringkas.tanpaTitik > 0 && <p className="msw-catatan-peta">{ringkas.tanpaTitik} switching tanpa koordinat tidak tampil di peta.</p>}
        </div>

        <div className="msw-daftar" aria-label="Daftar switching">
          <div className="msw-daftar-kepala"><b>{tampil.length}</b> switching{filter.penyulang ? ' · ' + filter.penyulang : ''}</div>
          {!data && memuat && <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat switching" /></div>}
          {data && !tampil.length && (
            <p className="k-kosong">{semua.length ? 'Tidak ada switching yang cocok dengan saringan.' : 'Belum ada switching. Tambahkan dari HP saat di lokasi, atau dari tombol Tambah switching.'}</p>
          )}
          <ul>
            {tampil.map((s) => {
              const j = infoJenis(s.jenis), st = infoStatus(s.statusVerifikasi);
              return (
                <li key={s.switchingId}>
                  <button type="button" className={'msw-baris' + (pilih?.switchingId === s.switchingId ? ' aktif' : '')} onClick={() => keTitik(s)}>
                    <span className="msw-lencana" style={{ background: j.warna }}>{j.label}</span>
                    <span className="msw-baris-isi">
                      <b>{s.nama}</b>
                      <small>{s.penyulang} · {s.switchingId}{s.posisiNormal === 'NO' ? ' · NO' : ''}{!titikSwitching(s) ? ' · tanpa titik' : ''}</small>
                    </span>
                    <span className={'k-badge k-badge--' + st.kelas}>{st.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <Rincian s={pilih} api={api} bolehUbah={bolehUbah} namaPerId={namaPerId} onTutup={() => setPilih(null)}
        onUbah={(s) => { setPilih(null); setForm(isianDari(s)); }}
        onFotoBaru={(s) => setData((d) => (d ? { ...d, switching: d.switching.map((x) => (x.switchingId === s.switchingId ? s : x)) } : d))} />
      {form && (
        <FormSwitching awal={form} jaringan={jaringan} penyulang={penyulang} daftar={semua} onTutup={() => setForm(null)} onKirim={kirimSwitching} />
      )}
    </div>
  );
}

/** Satu baris rincian; nilai kosong = tidak ditampilkan. */
const Baris = ({ label, v }) => (v === '' || v === null || v === undefined ? null : <div><dt>{label}</dt><dd>{v}</dd></div>);
const ya = (b) => (b ? 'Ya' : 'Tidak');

function Rincian({ s, api, bolehUbah, namaPerId, onTutup, onUbah, onFotoBaru }) {
  if (!s) return <Dialog buka={false} onTutup={onTutup} />;
  const j = infoJenis(s.jenis), st = infoStatus(s.statusVerifikasi), k = titikSwitching(s);
  return (
    <Dialog buka judul={j.label + ' · ' + s.nama} sub={s.switchingId + ' · ' + s.penyulang + (s.aktif ? '' : ' · NONAKTIF')} onTutup={onTutup} lebar="min(760px, 96vw)">
      <div className="msw-rinc-status">
        <span className={'k-badge k-badge--' + st.kelas}>{st.label}</span>
        <span>Verifikasi terakhir {waktuSingkat(s.verifikasiTerakhir)}</span>
      </div>
      <h3 className="msw-sub">Foto</h3>
      <div className="msw-foto">
        {SLOT_FOTO.map(([slot, label]) => (
          <FotoSlot key={slot + s.revision} s={s} slot={slot} label={label} api={api} bolehUbah={bolehUbah} onBaru={onFotoBaru} />
        ))}
      </div>
      <h3 className="msw-sub">Lokasi &amp; jaringan</h3>
      <dl className="k-rincian msw-rinc">
        <Baris label="Koordinat" v={k ? s.lat + ', ' + s.lng : 'belum ada'} />
        <Baris label="Posisi normal" v={labelPilihan('posisiNormal', s.posisiNormal)} />
        <Baris label="Status operasi" v={labelPilihan('statusOperasi', s.statusOperasi)} />
        <Baris label="Switching hulu" v={s.switchingHuluId ? s.switchingHuluId + ' ' + (namaPerId[s.switchingHuluId] || '') : ''} />
        <Baris label="Proteksi hulu (bisa trip)" v={s.proteksiHuluId ? s.proteksiHuluId + ' ' + (namaPerId[s.proteksiHuluId] || '') : ''} />
        <Baris label="Tiang" v={s.tiangId} />
        <Baris label="Titik hubung" v={s.titikHubung ? 'Ya, ke ' + s.penyulangSisiB : ''} />
        <Baris label="Tiang sisi A / B" v={s.titikHubung ? (s.tiangSisiA || '-') + ' / ' + (s.tiangSisiB || '-') : ''} />
      </dl>
      <h3 className="msw-sub">Kontroler &amp; kemampuan</h3>
      <dl className="k-rincian msw-rinc">
        <Baris label="Merk / tipe kontroler" v={[s.merkKontroler, s.tipeKontroler].filter(Boolean).join(' / ')} />
        <Baris label="Firmware" v={s.versiFirmware} />
        <Baris label="Rasio CT / VT" v={s.rasioCt || s.rasioVt ? (s.rasioCt || '-') + ' / ' + (s.rasioVt || '-') : ''} />
        <Baris label="Bisa trip" v={ya(s.bisaTrip)} />
        <Baris label="Indikator gangguan (FPI)" v={ya(s.catatGangguan)} />
        <Baris label="Baca arus / tegangan" v={ya(s.bacaArus) + ' / ' + ya(s.bacaTegangan)} />
        <Baris label="SCADA" v={s.terhubungScada ? 'Ya' + (s.kodeRtu ? ', RTU ' + s.kodeRtu : '') + (s.mediaKomunikasi ? ', ' + labelPilihan('mediaKomunikasi', s.mediaKomunikasi) : '') : 'Tidak'} />
        <Baris label="Fuse (FCO)" v={s.jenis === 'FCO' ? [labelPilihan('fungsiFco', s.fungsiFco), s.fuseTipe && 'tipe ' + s.fuseTipe, s.fuseRating].filter(Boolean).join(', ') || '-' : ''} />
      </dl>
      {[s.merk, s.tipe, s.nomorSeri, s.tahunPasang, s.ratingKv, s.ratingA, s.kapasitasPutusKa, s.media, s.penggerak, s.kodeAset, s.kondisi, s.catatan]
        .some((v) => v !== '' && v !== null && v !== undefined) && <h3 className="msw-sub">Data unit</h3>}
      <dl className="k-rincian msw-rinc">
        <Baris label="Merk / tipe" v={[s.merk, s.tipe].filter(Boolean).join(' / ')} />
        <Baris label="Nomor seri" v={s.nomorSeri} />
        <Baris label="Tahun pasang" v={s.tahunPasang} />
        <Baris label="Rating" v={[s.ratingKv !== null && s.ratingKv + ' kV', s.ratingA !== null && s.ratingA + ' A', s.kapasitasPutusKa !== null && s.kapasitasPutusKa + ' kA'].filter(Boolean).join(' · ')} />
        <Baris label="Media / penggerak" v={[labelPilihan('media', s.media), labelPilihan('penggerak', s.penggerak)].filter(Boolean).join(' / ')} />
        <Baris label="Kode aset" v={s.kodeAset} />
        <Baris label="Kondisi" v={labelPilihan('kondisi', s.kondisi)} />
        <Baris label="Catatan" v={s.catatan} />
      </dl>
      <div className="k-dialog-aksi">
        {k && <a className="k-tombol k-tombol--garis" href={'https://www.google.com/maps?q=' + k[0] + ',' + k[1]} target="_blank" rel="noreferrer"><Ikon nama="lokasi" ukuran={16} />Google Maps</a>}
        <span className="k-spasi" />
        <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Tutup</button>
        {bolehUbah && <button type="button" className="k-tombol k-tombol--utama" onClick={() => onUbah(s)}>Ubah</button>}
      </div>
    </Dialog>
  );
}

/** Kotak foto satu slot: thumbnail dari server (dimuat saat dialog dibuka), ganti foto dari file (diperkecil ke JPEG <= 2 MB). */
function FotoSlot({ s, slot, label, api, bolehUbah, onBaru }) {
  const ada = !!s.foto?.[slot];
  const [src, setSrc] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const fileRef = useRef(null);
  useEffect(() => {
    if (!ada) return undefined;
    let hidup = true;
    api('getFotoSwitching', { switchingId: s.switchingId, slot, ukuran: 'KECIL' }, { batasMs: BATAS_FILE_MS, tanpaTembolok: true })
      .then((j) => { if (hidup) setSrc('data:' + (j.data.mime || 'image/jpeg') + ';base64,' + j.data.data); })
      .catch((e) => { if (hidup) setGalat(pesan(kodeGalat(e))); });
    return () => { hidup = false; };
  }, [api, ada, s.switchingId, slot]);
  const unggah = async (file) => {
    if (!file) return;
    setSibuk(true); setGalat('');
    try {
      const { jpeg, url } = await fotoKeJpegBa(file);
      await api('uploadFotoSwitching', { switchingId: s.switchingId, slot, sha256: await sha256Hex(jpeg), ukuranByte: jpeg.length, data: keBase64(jpeg) }, { batasMs: BATAS_FILE_MS });
      setSrc(url);
      onBaru({ ...s, foto: { ...s.foto, [slot]: true } });
    } catch (e) { setGalat(e && e.kode ? pesan(e.kode) : String(e?.message || e)); }
    setSibuk(false);
  };
  return (
    <figure className="msw-foto-slot">
      <div className="msw-foto-kotak">
        {src ? <img src={src} alt={'Foto ' + label + ' ' + s.nama} /> : <span>{ada ? <SisiLoader ukuran={22} label="Memuat foto" /> : 'Belum ada foto'}</span>}
      </div>
      <figcaption>
        <b>{label}</b>
        {bolehUbah && (
          <>
            <button type="button" className="k-tautan" onClick={() => fileRef.current?.click()} disabled={sibuk}>{sibuk ? 'Mengunggah…' : ada ? 'Ganti' : 'Unggah'}</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { unggah(e.target.files?.[0]); e.target.value = ''; }} />
          </>
        )}
      </figcaption>
      {galat && <small className="k-galat">{galat}</small>}
    </figure>
  );
}

/** Peta kecil di form: klik = pilih koordinat; titik lama ditandai. */
function PetaTitik({ koordinat, onPilih }) {
  const el = useRef(null);
  const m = useRef(null);
  const tanda = useRef(null);
  useEffect(() => {
    const p = L.map(el.current, { center: PUSAT_PETA, zoom: 11 });
    L.tileLayer(LATAR_PETA.peta.url, { maxZoom: LATAR_PETA.peta.maxZoom, attribution: LATAR_PETA.peta.attribution }).addTo(p);
    p.on('click', (e) => onPilih(e.latlng.lat.toFixed(6) + ', ' + e.latlng.lng.toFixed(6)));
    m.current = p;
    setTimeout(() => p.invalidateSize(), 80);
    return () => { p.remove(); m.current = null; };
  }, [onPilih]);
  useEffect(() => {
    const p = m.current;
    if (!p) return;
    const t = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(koordinat || '');
    if (tanda.current) { tanda.current.remove(); tanda.current = null; }
    if (!t) return;
    const k = [Number(t[1]), Number(t[2])];
    tanda.current = L.circleMarker(k, { radius: 9, color: '#fff', weight: 3, fillColor: '#a8433f', fillOpacity: 1 }).addTo(p);
    p.setView(k, Math.max(p.getZoom(), 16));
  }, [koordinat]);
  return <div ref={el} className="msw-peta-kecil" aria-label="Klik peta untuk memilih koordinat" />;
}

function Isian({ label, galat, wajib, children, lebar }) {
  return (
    <label className={'msw-isian' + (lebar ? ' msw-isian--lebar' : '')}>
      <span className="k-label">{label}{wajib && <i aria-hidden="true"> *</i>}</span>
      {children}
      {galat && <small className="k-galat">{galat}</small>}
    </label>
  );
}

function Pilihan({ nilai, onUbah, kunci, kosong = 'Pilih' }) {
  return (
    <select className="k-input" value={nilai} onChange={(e) => onUbah(e.target.value)}>
      <option value="">{kosong}</option>
      {PILIHAN[kunci].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function FormSwitching({ awal, jaringan, penyulang, daftar, onTutup, onKirim }) {
  const [i, setI] = useState(awal);
  const [galat, setGalat] = useState({});
  const [galatKirim, setGalatKirim] = useState('');
  const ubah = (o) => setI((x) => ({ ...x, ...o }));
  const teks = (k, o = {}) => ({ className: 'k-input' + (galat[k] ? ' k-input--galat' : ''), value: i[k] ?? '', onChange: (e) => ubah({ [k]: e.target.value }), ...o });
  const pilihKoord = useCallback((v) => setI((x) => ({ ...x, koordinat: v })), []);
  const sections = sectionPenyulang(jaringan, i.penyulang);
  const hulu = pilihanHulu(daftar, i);
  const baru = !i.switchingId;

  const simpan = () => {
    const g = cekIsian(i, jaringan);
    setGalat(g);
    if (Object.keys(g).length) { setGalatKirim('Periksa isian bertanda merah.'); return; }
    onKirim(payloadSimpan(i));
  };

  return (
    <Dialog buka judul={baru ? 'Tambah Switching' : 'Ubah ' + i.switchingId} sub="Simpan oleh Admin = data langsung terverifikasi. Isian bertanda * wajib." onTutup={onTutup} lebar="min(820px, 96vw)">
      <div className="msw-form">
        <div className="msw-jenis-pilih" role="radiogroup" aria-label="Jenis switching">
          {JENIS_SWITCHING.map((j) => (
            <button type="button" key={j.kode} role="radio" aria-checked={i.jenis === j.kode} className={i.jenis === j.kode ? 'aktif' : ''}
              style={i.jenis === j.kode ? { background: j.warna, borderColor: j.warna } : undefined} onClick={() => setI((x) => gantiJenis(x, j.kode))} title={j.nama}>
              {j.label}
            </button>
          ))}
        </div>
        <div className="msw-grid">
          <Isian label="Nama switching" wajib galat={galat.nama}><input {...teks('nama')} maxLength={80} placeholder="mis. LBS Air Bara" autoFocus={baru} /></Isian>
          <Isian label="Penyulang" wajib galat={galat.penyulang}>
            <select className={'k-input' + (galat.penyulang ? ' k-input--galat' : '')} value={i.penyulang} onChange={(e) => ubah({ penyulang: e.target.value, sectionId: '', switchingHuluId: '' })}>
              <option value="">Pilih penyulang</option>
              {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Isian>
          <Isian label="Section">
            <select className="k-input" value={i.sectionId} onChange={(e) => ubah({ sectionId: e.target.value })} disabled={!i.penyulang}>
              <option value="">{i.penyulang ? 'Pilih section (opsional)' : 'Pilih penyulang dulu'}</option>
              {sections.map((s) => <option key={s.sectionId} value={s.sectionId}>{s.section}</option>)}
            </select>
          </Isian>
          <Isian label="Posisi normal" wajib>
            <div className="msw-segmen">
              {PILIHAN.posisiNormal.map(([k, v]) => <button type="button" key={k} className={i.posisiNormal === k ? 'aktif' : ''} onClick={() => ubah({ posisiNormal: k })}>{v}</button>)}
            </div>
          </Isian>
          <Isian label="Koordinat" wajib galat={galat.koordinat} lebar>
            <input {...teks('koordinat')} placeholder="-3.012345, 106.512345 (atau klik peta di bawah)" inputMode="decimal" />
          </Isian>
        </div>
        <PetaTitik koordinat={i.koordinat} onPilih={pilihKoord} />

        <details className="msw-lipat" open>
          <summary>Kontroler &amp; kemampuan</summary>
          <div className="msw-grid">
            <Isian label="Merk kontroler"><input {...teks('merkKontroler')} maxLength={60} /></Isian>
            <Isian label="Tipe kontroler"><input {...teks('tipeKontroler')} maxLength={60} /></Isian>
            <Isian label="Versi firmware"><input {...teks('versiFirmware')} maxLength={40} /></Isian>
            <Isian label="Rasio CT"><input {...teks('rasioCt')} maxLength={30} placeholder="mis. 400/1" /></Isian>
            <Isian label="Rasio VT"><input {...teks('rasioVt')} maxLength={30} placeholder="mis. 20000/110" /></Isian>
          </div>
          <div className="msw-cek-grup">
            <label className="msw-cek"><input type="checkbox" checked={i.bisaTrip} onChange={(e) => ubah({ bisaTrip: e.target.checked, bisaTripDiubah: true })} />Bisa trip (memutus arus gangguan)</label>
            <label className="msw-cek"><input type="checkbox" checked={i.catatGangguan} onChange={(e) => ubah({ catatGangguan: e.target.checked })} />Ada indikator gangguan (FPI)</label>
            <label className="msw-cek"><input type="checkbox" checked={i.bacaArus} onChange={(e) => ubah({ bacaArus: e.target.checked })} />Bisa baca arus</label>
            <label className="msw-cek"><input type="checkbox" checked={i.bacaTegangan} onChange={(e) => ubah({ bacaTegangan: e.target.checked })} />Bisa baca tegangan</label>
            <label className="msw-cek"><input type="checkbox" checked={i.terhubungScada} onChange={(e) => ubah({ terhubungScada: e.target.checked })} />Terhubung SCADA</label>
          </div>
          {i.terhubungScada && (
            <div className="msw-grid">
              <Isian label="Kode RTU"><input {...teks('kodeRtu')} maxLength={40} /></Isian>
              <Isian label="Media komunikasi"><Pilihan nilai={i.mediaKomunikasi} onUbah={(v) => ubah({ mediaKomunikasi: v })} kunci="mediaKomunikasi" /></Isian>
            </div>
          )}
        </details>

        {i.jenis === 'FCO' && (
          <details className="msw-lipat" open>
            <summary>Fuse (FCO)</summary>
            <div className="msw-grid">
              <Isian label="Fungsi FCO"><Pilihan nilai={i.fungsiFco} onUbah={(v) => ubah({ fungsiFco: v })} kunci="fungsiFco" /></Isian>
              <Isian label="Tipe fuse"><Pilihan nilai={i.fuseTipe} onUbah={(v) => ubah({ fuseTipe: v })} kunci="fuseTipe" /></Isian>
              <Isian label="Rating fuse"><input {...teks('fuseRating')} maxLength={20} placeholder="mis. 10K" /></Isian>
            </div>
          </details>
        )}

        <details className="msw-lipat">
          <summary>Topologi (hulu, tiang, titik hubung)</summary>
          <div className="msw-grid">
            <Isian label="Switching hulu" galat={galat.switchingHuluId}>
              <select className="k-input" value={i.switchingHuluId} onChange={(e) => ubah({ switchingHuluId: e.target.value })}>
                <option value="">Tidak ada / langsung dari GI</option>
                {hulu.map((s) => <option key={s.switchingId} value={s.switchingId}>{labelSwitching(s.jenis, s.nama)} ({s.switchingId})</option>)}
              </select>
            </Isian>
            <Isian label="Nomor tiang (ASSETNUM)"><input {...teks('tiangId')} maxLength={40} /></Isian>
          </div>
          <label className="msw-cek"><input type="checkbox" checked={i.titikHubung} onChange={(e) => ubah({ titikHubung: e.target.checked })} />Titik hubung ke penyulang lain</label>
          {i.titikHubung && (
            <div className="msw-grid">
              <Isian label="Penyulang sisi lain" wajib galat={galat.penyulangSisiB}>
                <select className="k-input" value={i.penyulangSisiB} onChange={(e) => ubah({ penyulangSisiB: e.target.value })}>
                  <option value="">Pilih penyulang</option>
                  {penyulang.filter((p) => p !== i.penyulang).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Isian>
              <Isian label="Tiang sisi A"><input {...teks('tiangSisiA')} maxLength={40} /></Isian>
              <Isian label="Tiang sisi B"><input {...teks('tiangSisiB')} maxLength={40} /></Isian>
            </div>
          )}
        </details>

        <details className="msw-lipat">
          <summary>Data unit (opsional)</summary>
          <div className="msw-grid">
            <Isian label="Merk unit"><input {...teks('merk')} maxLength={60} /></Isian>
            <Isian label="Tipe unit"><input {...teks('tipe')} maxLength={60} /></Isian>
            <Isian label="Nomor seri"><input {...teks('nomorSeri')} maxLength={60} /></Isian>
            <Isian label="Tahun pasang" galat={galat.tahunPasang}><input {...teks('tahunPasang')} inputMode="numeric" maxLength={4} /></Isian>
            <Isian label="Rating kV" galat={galat.ratingKv}><input {...teks('ratingKv')} inputMode="decimal" /></Isian>
            <Isian label="Rating A" galat={galat.ratingA}><input {...teks('ratingA')} inputMode="decimal" /></Isian>
            <Isian label="Kapasitas putus kA" galat={galat.kapasitasPutusKa}><input {...teks('kapasitasPutusKa')} inputMode="decimal" /></Isian>
            <Isian label="Media"><Pilihan nilai={i.media} onUbah={(v) => ubah({ media: v })} kunci="media" /></Isian>
            <Isian label="Penggerak"><Pilihan nilai={i.penggerak} onUbah={(v) => ubah({ penggerak: v })} kunci="penggerak" /></Isian>
            <Isian label="Kode aset PLN"><input {...teks('kodeAset')} maxLength={40} /></Isian>
          </div>
        </details>

        <div className="msw-grid">
          <Isian label="Status operasi" wajib><Pilihan nilai={i.statusOperasi} onUbah={(v) => ubah({ statusOperasi: v || 'OPERASI' })} kunci="statusOperasi" kosong="Operasi" /></Isian>
          <Isian label="Kondisi"><Pilihan nilai={i.kondisi} onUbah={(v) => ubah({ kondisi: v })} kunci="kondisi" kosong="Belum dinilai" /></Isian>
          <Isian label="Hasil verifikasi">
            <div className="msw-segmen">
              {PILIHAN.statusVerifikasi.map(([k, v]) => <button type="button" key={k} className={i.statusVerifikasi === k ? 'aktif' : ''} onClick={() => ubah({ statusVerifikasi: k })}>{v}</button>)}
            </div>
          </Isian>
          <Isian label="Catatan" lebar><textarea {...teks('catatan')} rows={2} maxLength={300} /></Isian>
        </div>
        {!baru && <label className="msw-cek"><input type="checkbox" checked={i.aktif} onChange={(e) => ubah({ aktif: e.target.checked })} />Aktif (hapus centang untuk menonaktifkan, data tidak dihapus)</label>}

        {galatKirim && <p className="k-pesan k-pesan--galat" role="alert">{galatKirim}</p>}
        <div className="k-dialog-aksi">
          <button type="button" className="k-tombol k-tombol--teks" onClick={onTutup}>Batal</button>
          <button type="button" className="k-tombol k-tombol--utama" onClick={simpan}>
            Simpan
          </button>
        </div>
      </div>
    </Dialog>
  );
}
