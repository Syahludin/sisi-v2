import { useMemo, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import { BULAN_PANJANG } from '../../gangguan.js';
import { tglId } from './bantu.js';
import { JAM, nilai } from './Selisih.jsx';

export const tanda = (n) => (n > 0 ? '+' + n : String(n));

/**
 * Kategori penanda kolom grafik: 'jumlah' = jumlah kejadian kedua sumber berselisih (merah); 'data' = jumlah sama tetapi ada
 * kejadian yang datanya berbeda / hanya di satu sumber (peringatan); 'sama' = tanpa warna. nData = jumlah kejadian selisih.
 */
export const kategoriBeda = (sl, wil, nData) => (sl !== wil ? 'jumlah' : nData > 0 ? 'data' : 'sama');

/** Legenda tiga kategori penanda (dipakai grafik per bulan dan per tanggal). */
export function LegendaKategori() {
  return (
    <ul className="ggn-kat-legenda" aria-label="Arti warna penanda">
      <li><i className="ggn-kat--sama" />Sama</li>
      <li><i className="ggn-kat--jumlah" />Selisih jumlah</li>
      <li><i className="ggn-kat--data" />Jumlah sama, data berbeda</li>
    </ul>
  );
}

const tglDari = (o, j) => String(o[j.waktu] || '').slice(0, 10);
// nilai kosong ditulis jelas (bukan "—"): sumber itu memang tidak mengisi kolomnya
const isi = (v) => (v === '' || v === null || v === undefined ? 'kosong' : nilai(v));
const tinggi = (n, maks) => (maks > 0 ? Math.max(n > 0 ? 6 : 0, Math.round((n / maks) * 100)) : 0) + '%';

/** Satu kejadian selisih -> baris ringkas untuk daftar. */
function butir(status, o, j, p) {
  return {
    status, tgl: tglDari(o, j), waktu: o[j.waktu], o,
    // beda: [{ label, sl, wil }] nilai tiap sumber; hanya_*: satu kalimat penjelasan
    beda: status === 'beda' ? p.beda.map((d) => ({ label: d.label, sl: d.sl, wil: d.wil })) : null,
    ket: status === 'hanya_sl' ? 'Hanya ada di SiMonLang, tidak ditemukan padanannya di Gangguan Wilayah'
      : status === 'hanya_wil' ? 'Hanya ada di Gangguan Wilayah, tidak ditemukan padanannya di SiMonLang' : '',
  };
}

/**
 * Rincian satu bulan dari grafik Perbandingan: tiap tanggal (kejadian kedua sumber berdampingan, tanggal yang berselisih
 * ditandai) dan daftar kejadian selisihnya dengan nilai yang berbeda. Klik tanggal = daftar hanya tanggal itu.
 * h = hasil perbandingan satu jenis (barisSl, barisWil, cocok dari PerbandinganSumber).
 */
export function RincianBulan({ h, ym, onTutup }) {
  const [tanggal, setTanggal] = useState('');
  const [lipat, setLipat] = useState(false);              // seluruh panel diciutkan (hanya judul)
  const [tertutup, setTertutup] = useState(() => new Set());   // kejadian yang rinciannya diciutkan (bawaan: terbuka semua)
  const { j } = h;
  const data = useMemo(() => {
    const [thn, bln] = ym.split('-').map(Number);
    const hari = new Date(Date.UTC(thn, bln, 0)).getUTCDate();
    const hit = (baris) => { const m = new Map(); baris.forEach((o) => { const t = tglDari(o, j); if (t.slice(0, 7) === ym) m.set(t, (m.get(t) || 0) + 1); }); return m; };
    const sl = hit(h.barisSl), wil = hit(h.barisWil);
    const butirAll = [
      ...h.cocok.pasangan.map((p) => butir('beda', p.sl, j, p)),
      ...h.cocok.hanyaSl.map((o) => butir('hanya_sl', o, j)),
      ...h.cocok.hanyaWil.map((o) => butir('hanya_wil', o, j)),
    ].filter((b) => b.tgl.slice(0, 7) === ym).sort((a, b) => (a.waktu < b.waktu ? -1 : a.waktu > b.waktu ? 1 : 0));
    const selisih = new Map();
    butirAll.forEach((b) => selisih.set(b.tgl, (selisih.get(b.tgl) || 0) + 1));
    const kolom = [];
    for (let d = 1; d <= hari; d += 1) {
      const t = `${ym}-${String(d).padStart(2, '0')}`;
      if (t < h.dari || t > h.sampai) continue;   // di luar rentang yang dihitung
      const a = sl.get(t) || 0, b = wil.get(t) || 0, n = selisih.get(t) || 0;
      kolom.push({ t, d, sl: a, wil: b, selisih: n, kat: kategoriBeda(a, b, n) });
    }
    return { kolom, butir: butirAll, maks: Math.max(1, ...kolom.map((k) => Math.max(k.sl, k.wil))), hariJumlah: kolom.filter((k) => k.kat === 'jumlah').length, hariData: kolom.filter((k) => k.kat === 'data').length };
  }, [h, ym, j]);

  const daftar = tanggal ? data.butir.filter((b) => b.tgl === tanggal) : data.butir;
  const kunci = (b, i) => b.status + '|' + i + '|' + b.waktu + '|' + (b.o.penyulang || '');
  const atur = (k, buka) => setTertutup((s) => { if (s.has(k) !== buka) return s; const n = new Set(s); if (buka) n.delete(k); else n.add(k); return n; });
  const semuaTertutup = daftar.length > 0 && daftar.every((b, i) => tertutup.has(kunci(b, i)));
  const judul = `${BULAN_PANJANG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

  return (
    <section className="ggn-rb" aria-label={'Rincian per tanggal ' + judul}>
      <div className="ggn-rb-kepala">
        <h4>Rincian per tanggal · {judul}
          <small>{data.hariJumlah || data.hariData ? [data.hariJumlah && `${data.hariJumlah} tanggal selisih jumlah`, data.hariData && `${data.hariData} tanggal beda data`, `${data.butir.length} kejadian`].filter(Boolean).join(' · ') : 'tidak ada selisih di bulan ini'}</small>
        </h4>
        <div className="ggn-rb-aksi">
          <button type="button" className="k-tombol k-tombol--garis ggn-lipat" aria-expanded={!lipat} onClick={() => setLipat((v) => !v)}
            title={lipat ? 'Tampilkan rincian' : 'Sembunyikan isi, sisakan judul'}>
            <Ikon nama="kanan" ukuran={14} />{lipat ? 'Expand' : 'Minimize'}
          </button>
          <button type="button" className="k-tombol k-tombol--garis" onClick={onTutup}><Ikon nama="tutup" ukuran={14} />Tutup</button>
        </div>
      </div>
      {!lipat && <>

      <LegendaKategori />
      <div className="ggn-rb-hari" role="group" aria-label="Kejadian per tanggal">
        {data.kolom.map((k) => (
          <button key={k.t} type="button" aria-pressed={tanggal === k.t} disabled={!k.selisih && !k.sl && !k.wil}
            className={'ggn-rb-kol ggn-kat--' + k.kat + (tanggal === k.t ? ' ggn-rb-kol--pilih' : '')}
            title={`${tglId(k.t)}: SiMonLang ${k.sl}, Wilayah ${k.wil}${k.kat === 'data' ? ' · jumlah sama, ada data berbeda' : ''}`}
            onClick={() => setTanggal((t) => (t === k.t ? '' : k.t))}>
            {k.kat === 'data' && <span className="ggn-kat-peringatan" aria-label="Jumlah sama, ada data berbeda"><Ikon nama="peringatan" ukuran={13} /></span>}
            <span className="ggn-rb-batang">
              <span style={{ height: tinggi(k.sl, data.maks) }}><i className="ggn-bd--sl" /></span>
              <span style={{ height: tinggi(k.wil, data.maks) }}><i className="ggn-bd--wil" /></span>
            </span>
            <small>{k.d}</small>
            {k.kat === 'jumlah' ? <b className="ggn-bd-chip ggn-chip--jumlah">{tanda(k.sl - k.wil)}</b>
              : <span className="ggn-rb-nol">{k.sl || k.wil ? '=' : ''}</span>}
          </button>
        ))}
      </div>

      {daftar.length > 0 && (
        <div className="ggn-sk-alat">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => setTertutup(semuaTertutup ? new Set() : new Set(daftar.map(kunci)))}>
            <Ikon nama="kanan" ukuran={14} />{semuaTertutup ? 'Expand' : 'Minimize'}
          </button>
          <small>{daftar.length} kejadian{tanggal ? ' pada ' + tglId(tanggal) : ''}</small>
        </div>
      )}
      {!daftar.length ? (
        <p className="ggn-bd-cocok"><Ikon nama="centang" ukuran={16} />{tanggal ? 'Tidak ada selisih pada ' + tglId(tanggal) + '.' : 'Semua kejadian bulan ini cocok.'}</p>
      ) : (
        <ul className="ggn-rb-daftar">
          {daftar.map((b, i) => (
            <li key={kunci(b, i)} className={'ggn-sk--' + b.status}>
              <details open={!tertutup.has(kunci(b, i))} onToggle={(e) => atur(kunci(b, i), e.currentTarget.open)}>
                <summary>
                  <span className="ggn-rb-waktu"><b>{tglId(b.tgl)}</b><small>{JAM(b.waktu) ? 'Trip ' + JAM(b.waktu) : 'jam tidak tercatat'}</small></span>
                  <span className="ggn-rb-nama"><b>{b.o.penyulang}</b><small>{b.o[j.alat] || '—'}</small></span>
                  <em className="ggn-sk-chip">{b.beda ? b.beda.map((d) => d.label).join(', ') + ' berbeda' : b.status === 'hanya_sl' ? 'Hanya di SiMonLang' : 'Hanya di Wilayah'}</em>
                  <Ikon nama="kanan" ukuran={15} />
                </summary>
                <div className="ggn-rb-ket">
                  {b.beda ? b.beda.map((d) => (
                    <span key={d.label} className="ggn-rb-beda">
                      <b>{d.label} berbeda</b>
                      <span className="ggn-rb-sumber"><i className="ggn-bd--sl" />SiMonLang: <strong className={d.sl === '' ? 'ggn-rb-kosong' : ''}>{isi(d.sl)}</strong></span>
                      <span className="ggn-rb-sumber"><i className="ggn-bd--wil" />Gangguan Wilayah: <strong className={d.wil === '' ? 'ggn-rb-kosong' : ''}>{isi(d.wil)}</strong></span>
                    </span>
                  )) : <em className="ggn-sk-chip">{b.ket}</em>}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      </>}
    </section>
  );
}
