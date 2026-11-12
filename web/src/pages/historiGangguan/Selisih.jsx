import { useEffect, useMemo, useState } from 'react';

import Ikon from '../../components/Ikon.jsx';
import { angka, tglId } from './bantu.js';

const STATUS = [
  ['semua', 'Semua selisih'],
  ['beda', 'Nilai berbeda'],
  ['hanya_sl', 'Hanya di SiMonLang'],
  ['hanya_wil', 'Hanya di Gangguan Wilayah'],
];
const TAMPIL_AWAL = 30;
export const JAM = (w) => { const m = /(\d{1,2}):(\d{2})/.exec(String(w || '').slice(10)); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
export const nilai = (v) => (v === '' || v === null || v === undefined ? '—' : typeof v === 'number' ? angka(v, 2) : String(v));
// kolom yang ditampilkan untuk kejadian yang hanya ada di satu sumber
const RINGKAS = [['peralatan', 'Peralatan'], ['indikasi', 'Indikasi'], ['durasi_menit', 'Durasi (menit)'], ['kode_fgtm', 'Kode FGTM'], ['penyebab', 'Penyebab'], ['lokasi', 'Lokasi']];

/**
 * Selisih Per Gangguan: tiap kejadian SiMonLang dicocokkan dengan Gangguan Wilayah (penyulang + waktu; waktu yang bergeser
 * sampai 1 jam tetap dipasangkan dan tidak dihitung selisih), lalu yang tidak cocok ditampilkan: nilai kolom yang berbeda, atau hanya ada di satu sumber.
 * Data = baris yang sama dengan kartu perbandingan di atasnya (rentang bersama + filter), jadi angkanya konsisten.
 */
export function SelisihKejadian({ h }) {
  const [status, setStatus] = useState('semua');
  const [tampil, setTampil] = useState(TAMPIL_AWAL);
  const [lipat, setLipat] = useState(false);          // seluruh bagian diciutkan (hanya judul)
  const [terbuka, setTerbuka] = useState(() => new Set());   // kunci baris yang rinciannya dibuka
  useEffect(() => { setTampil(TAMPIL_AWAL); setTerbuka(new Set()); }, [status, h]);

  const aktif = useMemo(() => {
    const c = h.cocok, j = h.j;   // pencocokan dihitung sekali di PerbandinganSumber
    const baris = [
      ...c.pasangan.map((p) => ({ status: 'beda', waktu: p.sl[j.waktu], o: p.sl, p })),
      ...c.hanyaSl.map((o) => ({ status: 'hanya_sl', waktu: o[j.waktu], o })),
      ...c.hanyaWil.map((o) => ({ status: 'hanya_wil', waktu: o[j.waktu], o })),
    ].sort((x, y) => (x.waktu < y.waktu ? 1 : x.waktu > y.waktu ? -1 : 0));
    return { j, sama: c.sama, baris };
  }, [h]);

  const hitung = (s) => aktif.baris.filter((b) => s === 'semua' || b.status === s).length;
  const daftar = aktif.baris.filter((b) => status === 'semua' || b.status === status);
  const total = aktif.sama + aktif.baris.filter((b) => b.status === 'beda').length;
  const kunciBaris = (b, i) => b.status + '|' + i + '|' + b.waktu + '|' + (b.o.penyulang || '');
  const atur = (kunci, buka) => setTerbuka((s) => { if (s.has(kunci) === buka) return s; const n = new Set(s); if (buka) n.add(kunci); else n.delete(kunci); return n; });
  const semuaTerbuka = daftar.length > 0 && daftar.every((b, i) => terbuka.has(kunciBaris(b, i)));

  return (
    <section className="ggn-panel ggn-sk" aria-label="Selisih Per Gangguan">
      <div className="ggn-bagian-kepala">
        <h2 className="ggn-bagian">Selisih Per Gangguan · {aktif.j.label}</h2>
        <button type="button" className="k-tombol k-tombol--garis ggn-lipat" aria-expanded={!lipat} onClick={() => setLipat((v) => !v)}
          title={lipat ? 'Tampilkan bagian ini' : 'Sembunyikan isi, sisakan judul'}>
          <Ikon nama="kanan" ukuran={14} />{lipat ? 'Expand' : 'Minimize'}
        </button>
      </div>

      {!lipat && <>
      <div className="ggn-sk-kepala">
        <div className="ggn-tab ggn-tab--kecil" role="group" aria-label="Jenis selisih">
          {STATUS.map(([k, l]) => <button key={k} type="button" className={status === k ? 'aktif' : ''} onClick={() => setStatus(k)}>{l} <span>{hitung(k)}</span></button>)}
        </div>
      </div>
      {daftar.length > 0 && (
        <div className="ggn-sk-alat">
          <button type="button" className="k-tombol k-tombol--garis" onClick={() => setTerbuka(semuaTerbuka ? new Set() : new Set(daftar.map(kunciBaris)))}>
            <Ikon nama="kanan" ukuran={14} />{semuaTerbuka ? 'Minimize' : 'Expand'}
          </button>
          <small>{angka(daftar.length)} kejadian · klik baris untuk membuka rinciannya</small>
        </div>
      )}

      {!daftar.length ? (
        <p className="ggn-bd-cocok"><Ikon nama="centang" ukuran={16} />{total ? 'Tidak ada selisih untuk pilihan ini.' : 'Tidak ada kejadian di rentang ini.'}</p>
      ) : (
        <ul className="ggn-sk-daftar">
          {daftar.slice(0, tampil).map((b, i) => <BarisSelisih key={kunciBaris(b, i)} b={b} j={aktif.j} buka={terbuka.has(kunciBaris(b, i))} onBuka={(v) => atur(kunciBaris(b, i), v)} />)}
        </ul>
      )}
      {daftar.length > tampil && (
        <button type="button" className="k-tombol k-tombol--garis ggn-lagi" onClick={() => setTampil((n) => n + TAMPIL_AWAL)}>
          Tampilkan {Math.min(TAMPIL_AWAL, daftar.length - tampil)} lagi
        </button>
      )}
      </>}
    </section>
  );
}

const LABEL_STATUS = { beda: 'Nilai berbeda', hanya_sl: 'Hanya di SiMonLang', hanya_wil: 'Hanya di Wilayah' };

/** Jam trip untuk ringkasan: satu jam bila kedua sumber sama, "SiMonLang 21:24 · Wilayah 21:40" bila berbeda, "jam belum ada" bila data hanya tanggal. */
function jamTrip(b, j) {
  if (b.status === 'beda') {
    const a = JAM(b.p.sl[j.waktu]), w = JAM(b.p.wil[j.waktu]);
    if (!a && !w) return 'jam tidak tercatat';
    return a === w ? 'Trip ' + a : 'Trip SiMonLang ' + (a || 'tidak tercatat') + ' · Wilayah ' + (w || 'tidak tercatat');
  }
  return JAM(b.waktu) ? 'Trip ' + JAM(b.waktu) : 'jam tidak tercatat';
}

function BarisSelisih({ b, j, buka, onBuka }) {
  const { o, p } = b;
  const ringkas = b.status === 'beda'
    ? p.beda.length + ' kolom berbeda' + (p.menit ? ' · waktu bergeser ' + Math.abs(p.menit) + ' menit' : '')
    : LABEL_STATUS[b.status];
  return (
    <li className={'ggn-sk-baris ggn-sk--' + b.status}>
      <details open={buka} onToggle={(e) => onBuka(e.currentTarget.open)}>
        <summary>
          <span className="ggn-sk-waktu"><b>{tglId(b.waktu)}</b><small>{jamTrip(b, j)}</small></span>
          <span className="ggn-sk-nama"><b>{o.penyulang}</b><small>{o[j.alat] || '—'}</small></span>
          <em className="ggn-sk-chip">{ringkas}</em>
          <Ikon nama="kanan" ukuran={15} />
        </summary>
        {b.status === 'beda' ? (
          <div className="ggn-tabel-gulir">
            <table className="ggn-tabel ggn-sk-tabel">
              <thead><tr><th>Kolom</th><th><i className="ggn-bd--sl" />SiMonLang</th><th><i className="ggn-bd--wil" />Gangguan Wilayah</th></tr></thead>
              <tbody>
                <tr className="ggn-sk-trip"><th>Jam trip</th><td>{JAM(p.sl[j.waktu]) || 'tidak tercatat'}</td><td>{JAM(p.wil[j.waktu]) || 'tidak tercatat'}</td></tr>
                {p.beda.map((d) => <tr key={d.medan}><th>{d.label}</th><td>{nilai(d.sl)}</td><td>{nilai(d.wil)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : (
          <dl className="ggn-sk-rinci">
            <div><dt>Jam trip</dt><dd>{JAM(b.waktu) || '—'}</dd></div>
            <div><dt>Tanggal</dt><dd>{tglId(b.waktu)}</dd></div>
            {RINGKAS.filter(([k]) => k !== j.alat && o[k] !== undefined && o[k] !== '').map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{nilai(o[k])}</dd></div>)}
          </dl>
        )}
      </details>
    </li>
  );
}
