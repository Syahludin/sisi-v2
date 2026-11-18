import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import SisiLoader from '../../components/SisiLoader.jsx';
import { LATAR_PETA, PUSAT_PETA } from '../../petaTemuan.js';
import { SUMBER_PETA, WARNA_SUMBER, bacaTiangPeta, ringkasPeta, saringPeta } from '../../petaKoordinat.js';
import useDataTab from './useDataTab.js';
import './petaKoordinat.css';

const LABEL_SUMBER = { GIS: 'GIS', TAKSIRAN: 'Taksiran tetangga', ITB: 'Hanya ITB' };
const LABEL_TANDA = { gawang_panjang: 'Gawang panjang', zigzag: 'Zigzag', jauh: 'Jauh dari induk', gawang_pendek: 'Gawang pendek', tanpa_induk: 'Tanpa induk', gawang_tak_terhitung: 'Gawang tak terhitung' };
const meter = (m) => (m == null ? '-' : Math.round(m).toLocaleString('id-ID') + ' m');

/** Tab Peta Koordinat di Master Jaringan: cek koordinat tiang (GIS / taksiran / ITB / lapangan) langsung dari data sheet (baca saja). */
export default function TabPetaKoordinat({ api }) {
  const { data, memuat, galat, muat } = useDataTab(api, 'getPetaKoordinatTiang');
  const semua = useMemo(() => bacaTiangPeta(data?.tiang), [data]);
  const ringkas = useMemo(() => ringkasPeta(semua), [semua]);
  const peta = useRef(null), elPeta = useRef(null), lapisLatar = useRef({}), lapis = useRef(null), sudahPas = useRef(false);
  const [sumber, setSumber] = useState(SUMBER_PETA);
  const [hanyaTanda, setHanyaTanda] = useState(false);
  const [hanyaBergeser, setHanyaBergeser] = useState(false);
  const [itbAsli, setItbAsli] = useState(false);
  const [garisInduk, setGarisInduk] = useState(false);
  const [cari, setCari] = useState('');
  const [latar, setLatar] = useState('peta');
  const [pilih, setPilih] = useState(null);
  const tampil = useMemo(() => saringPeta(semua, { sumber, hanyaTanda, hanyaBergeser, cari }), [semua, sumber, hanyaTanda, hanyaBergeser, cari]);
  const perId = useMemo(() => Object.fromEntries(semua.map((t) => [t.id, t])), [semua]);
  const siap = !!data;

  // peta dibuat sekali, setelah data ada (elemen peta baru dirender saat itu)
  useEffect(() => {
    if (!siap || !elPeta.current) return undefined;
    const m = L.map(elPeta.current, { center: PUSAT_PETA, zoom: 10, preferCanvas: true });
    Object.entries(LATAR_PETA).forEach(([k, v]) => { lapisLatar.current[k] = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution }); });
    lapisLatar.current.peta.addTo(m);
    lapis.current = L.layerGroup().addTo(m);
    peta.current = m;
    return () => { m.remove(); peta.current = null; lapis.current = null; sudahPas.current = false; };
  }, [siap]);
  useEffect(() => {
    const m = peta.current;
    if (!m) return;
    Object.entries(lapisLatar.current).forEach(([k, l]) => { if (k === latar) l.addTo(m); else m.removeLayer(l); });
  }, [latar, siap]);
  useEffect(() => {
    const m = peta.current, g = lapis.current;
    if (!m || !g) return;
    g.clearLayers();
    tampil.forEach((t) => {
      const bertanda = t.tanda.length > 0;
      if (itbAsli && t.sumber !== 'ITB') {
        L.circleMarker(t.itb, { radius: 2, color: '#d33', fillOpacity: 0.7, interactive: false }).addTo(g);
        L.polyline([t.itb, t.terdaftar], { color: '#d33', weight: 1, opacity: 0.35, interactive: false }).addTo(g);
      }
      const induk = t.indukId && perId[t.indukId]?.terdaftar;
      if (induk && (garisInduk || bertanda)) {
        L.polyline([induk, t.terdaftar], { color: bertanda ? '#c00' : '#5a7', weight: bertanda ? 3 : 1.5, opacity: bertanda ? 0.9 : 0.5, interactive: false }).addTo(g);
      }
      L.circleMarker(t.terdaftar, { radius: bertanda ? 5 : 3, color: bertanda ? '#c00' : WARNA_SUMBER[t.sumber], weight: bertanda ? 2 : 1, fillOpacity: 0.8 })
        .on('click', () => setPilih(t.id)).addTo(g);
    });
    const dipilih = pilih && perId[pilih];
    if (dipilih?.terdaftar) L.circleMarker(dipilih.terdaftar, { radius: 11, color: '#1d4ed8', weight: 3, fill: false, interactive: false }).addTo(g);
    if (!sudahPas.current && tampil.length) { m.fitBounds(L.latLngBounds(tampil.map((t) => t.terdaftar)), { padding: [20, 20] }); sudahPas.current = true; }
  }, [tampil, itbAsli, garisInduk, pilih, perId, siap]);
  useEffect(() => {
    const m = peta.current;
    if (m && cari.trim() && tampil.length && tampil.length < 400) m.fitBounds(L.latLngBounds(tampil.map((t) => t.terdaftar)).pad(0.3));
  }, [cari]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = pilih ? perId[pilih] : null;
  const ganti = (s) => setSumber((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]));
  if (!data) return memuat ? <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /></div> : <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>;
  return (
    <div className="pk">
      {galat && <p className="k-pesan k-pesan--galat" role="alert">{galat}</p>}
      <div className="pk-ringkas" aria-label="Ringkasan koordinat">
        <b>{ringkas.total.toLocaleString('id-ID')} tiang</b>
        {SUMBER_PETA.map((s) => <span key={s}><i style={{ background: WARNA_SUMBER[s] }} />{LABEL_SUMBER[s]} {ringkas[s].toLocaleString('id-ID')}</span>)}
        <span>Tanpa koordinat {ringkas.tanpa}</span>
        <span>Gawang bertanda {ringkas.bertanda}</span>
        <span>Bergeser &gt; 200 m {ringkas.bergeser.toLocaleString('id-ID')}</span>
      </div>
      <div className="vt-saring pk-saring">
        {SUMBER_PETA.map((s) => (
          <label key={s} className="vt-cek"><input type="checkbox" checked={sumber.includes(s)} onChange={() => ganti(s)} /><i className="pk-titik" style={{ background: WARNA_SUMBER[s] }} />{LABEL_SUMBER[s]}</label>
        ))}
        <label className="vt-cek"><input type="checkbox" checked={itbAsli} onChange={(e) => setItbAsli(e.target.checked)} />ITB asli + garis pergeseran</label>
        <label className="vt-cek"><input type="checkbox" checked={garisInduk} onChange={(e) => setGarisInduk(e.target.checked)} />Garis ke induk</label>
        <label className="vt-cek"><input type="checkbox" checked={hanyaTanda} onChange={(e) => setHanyaTanda(e.target.checked)} />Hanya gawang bertanda</label>
        <label className="vt-cek"><input type="checkbox" checked={hanyaBergeser} onChange={(e) => setHanyaBergeser(e.target.checked)} />Hanya yang bergeser</label>
        <input type="search" className="k-input pk-cari" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama tiang, mis. PLS0647" aria-label="Cari nama tiang" />
        <select className="k-input" value={latar} onChange={(e) => setLatar(e.target.value)} aria-label="Latar peta">
          <option value="peta">Peta jalan</option>
          <option value="satelit">Satelit</option>
        </select>
        <button type="button" className="k-tombol k-tombol--sekunder" onClick={() => muat(true)} disabled={memuat}>{memuat ? 'Memuat…' : 'Muat ulang'}</button>
      </div>
      <div className="pk-isi">
        <div className="pk-peta" ref={elPeta} role="application" aria-label="Peta koordinat tiang" />
        <aside className="pk-rincian" aria-live="polite">
          <p className="pk-hitung">{tampil.length.toLocaleString('id-ID')} tiang tampil</p>
          {!t && <p className="pk-bantu">Klik sebuah titik untuk melihat sumber koordinat, selisih ke ITB, induk, dan tanda gawang. Titik berwarna menurut koordinat terdaftar yang dipakai; garis merah tebal = gawang bertanda; merah muda = ITB asli.</p>}
          {t && (
            <div className="pk-kartu">
              <b>{t.nama}</b>
              <small>{t.id} · {t.status || '-'}</small>
              <dl>
                <dt>Terdaftar dari</dt><dd><i className="pk-titik" style={{ background: WARNA_SUMBER[t.sumber] }} />{LABEL_SUMBER[t.sumber]}</dd>
                <dt>Selisih ke ITB</dt><dd>{meter(t.selisihM)}</dd>
                <dt>Induk</dt><dd>{(t.indukId && perId[t.indukId]?.nama) || '-'}</dd>
                <dt>Gawang</dt><dd>{meter(t.gawangM)}</dd>
                <dt>Tanda</dt><dd>{t.tanda.length ? t.tanda.map((x) => LABEL_TANDA[x] || x).join(', ') : '-'}</dd>
                <dt>Lapangan</dt><dd>{t.lapangan ? `${t.lapangan[0].toFixed(6)}, ${t.lapangan[1].toFixed(6)} (${t.sumberKoordinat || '-'})` : '-'}</dd>
                <dt>Terdaftar</dt><dd>{t.terdaftar[0].toFixed(6)}, {t.terdaftar[1].toFixed(6)}</dd>
              </dl>
              <a className="k-tautan" href={`https://www.google.com/maps?q=${t.terdaftar[0]},${t.terdaftar[1]}`} target="_blank" rel="noreferrer">Buka di Google Maps</a>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
