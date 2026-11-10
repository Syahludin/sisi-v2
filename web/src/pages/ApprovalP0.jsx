import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  aksiP0, bolehUbahP0, cocokP0, dataPutuskan, dataUbahJenis, hitungJumlah, LABEL_STATUS_P0, pekerjaanLain, pilihBerikutnya, STATUS_P0,
} from '../approvalP0.js';
import Ikon from '../components/Ikon.jsx';
import NavTanggal from '../components/NavTanggal.jsx';
import PopupBerhasil from '../components/PopupBerhasil.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { kodeGalat, pesan } from '../pesan.js';
import { hariIniWib } from '../tanggal.js';
import { DaftarP0, DetailP0 } from './approvalP0/Daftar.jsx';
import { DialogFoto, DialogJenis, DialogSetujui, DialogTolak } from './approvalP0/DialogP0.jsx';
import './approvalP0.css';

const BATAS_TULIS_MS = 60000;

/**
 * Approval P0 Yandal (menu OPS_VERIFIKASI_P0), mirror layar HP approval_p0_screen.dart untuk layar lebar:
 * tanggal > tab Menunggu / Disetujui / Ditolak (+ cari) > daftar kiri, detail kanan (3 foto P0, rincian, lampiran
 * Pengecekan Gardu / Switching) > Setujui / Tolak (alasan) / Edit jenis pekerjaan. Setelah keputusan, P0 berikutnya
 * di tab yang sama langsung terpilih. Hanya ADMIN / SUPER dengan akses UBAH yang bisa memutuskan (server menegakkan).
 */
export default function ApprovalP0({ sesi, api, rute, keRute }) {
  const bolehUbah = bolehUbahP0(sesi);
  // v1.0.36: tanggal, tab, P0 terpilih tersimpan di alamat (?tanggal=&tab=, /approval-p0/<p0Id>): refresh = posisi sama
  const [tanggal, setTanggal] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(rute.query.tanggal || '') ? rute.query.tanggal : hariIniWib()));
  const [list, setList] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState('');
  const [tab, setTab] = useState(() => (['Menunggu', 'Disetujui', 'Ditolak'].includes(rute.query.tab) ? rute.query.tab : 'Menunggu'));
  const [cari, setCari] = useState('');
  const [pilihId, setPilihId] = useState(rute.id || null);
  const [sibuk, setSibuk] = useState(false);
  const [tunda, setTunda] = useState(0); // keputusan yang masih dikirim di latar
  const [berhasil, setBerhasil] = useState(null);
  const [info, setInfo] = useState(null); // { jenis: 'ok' | 'galat', teks }
  const [dialog, setDialog] = useState(null); // { jenis: 'setujui' | 'tolak' | 'jenis', x } | { jenis: 'foto', daftar, i }
  const urutMuat = useRef(0);

  const muat = useCallback(async (tgl) => {
    const no = ++urutMuat.current;
    setMemuat(true);
    setGalatMuat('');
    try {
      const j = await api('getApprovalP0', { tanggal: tgl }, {
        awal: (c) => { if (no === urutMuat.current && Array.isArray(c.data.list)) setList(c.data.list); } });
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
  useEffect(() => {
    keRute({ id: pilihId || '', query: { tanggal: tanggal === hariIniWib() ? '' : tanggal, tab: tab === 'Menunggu' ? '' : tab } }, { ganti: true });
  }, [tanggal, tab, pilihId]);

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
    if (memuat || sibuk || tunda > 0) return;
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

  /**
   * Setujui / tolak: P0 langsung keluar dari daftar, kartu "berhasil" tampil, keputusan dikirim di latar. Jawaban server
   * dipasang di posisi semula; gagal = P0 kembali ke posisi semula + pesan galat. Tanggal / muat ulang terkunci selama ada
   * yang tertunda (daftar tanggal lain tidak boleh tertimpa jawaban ini).
   */
  const putuskan = (data, x, teksOk) => {
    const urutan = list.findIndex((y) => y.p0Id === x.p0Id);
    const pasang = (isi) => setList((cur) => {
      if (!cur) return cur;
      const sisa = cur.filter((y) => y.p0Id !== x.p0Id);
      sisa.splice(Math.min(urutan, sisa.length), 0, isi);
      return sisa;
    });
    const sisa = list.filter((y) => y.p0Id !== x.p0Id);
    setList(sisa);
    setPilihId(pilihBerikutnya(tampil, sisa.filter((y) => y.status === tab && cocokP0(y, cari)), x.p0Id));
    setInfo(null);
    setBerhasil({ judul: 'Data berhasil disimpan', keterangan: teksOk, tembus: true });
    setTunda((n) => n + 1);
    (async () => {
      try {
        pasang((await api('simpanApprovalP0', data, { batasMs: BATAS_TULIS_MS })).data);
      } catch (e) {
        const kode = kodeGalat(e);
        setBerhasil(null);
        pasang(x);
        setInfo({ jenis: 'galat', teks: x.kodeP0 + ': ' + pesan(kode) });
        if (kode === 'DATA_BERUBAH') muat(tanggal);
      } finally {
        setTunda((n) => n - 1);
      }
    })();
    return true;
  };

  const setujui = (x, bobot = null) => putuskan(dataPutuskan(x, 'Approved', { bobot }), x, x.kodeP0 + ' disetujui');
  const bukaDialog = (o) => { setInfo(null); setDialog(o); };
  const klikSetujui = (x) => (x.lainLain || pekerjaanLain(x.namaPekerjaan) ? bukaDialog({ jenis: 'setujui', x }) : setujui(x));
  const tutupDialog = () => setDialog(null);
  const tutupBerhasil = useCallback(() => setBerhasil(null), []);
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
          <NavTanggal tanggal={tanggal} disabled={memuat || sibuk || tunda > 0} onGanti={gantiTanggal} />
          <button type="button" className="k-tombol k-tombol--garis" onClick={segarkan} disabled={memuat || sibuk || tunda > 0}>
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
        onKirim={(x, alasan) => selesaiDialog(putuskan(dataPutuskan(x, 'Rejected', { alasan }), x, x.kodeP0 + ' ditolak'))} />
      <DialogJenis d={dialog?.jenis === 'jenis' ? dialog : null} sibuk={sibuk} galat={galatDialog} api={api} token={sesi.token} onTutup={tutupDialog}
        onKirim={(x, isi) => selesaiDialog(jalankan('ubahJenisP0', dataUbahJenis(x, isi), x, x.kodeP0 + ': jenis pekerjaan dikoreksi.'))} />
      <PopupBerhasil p={berhasil} onTutup={tutupBerhasil} />
      <DialogFoto d={dialog?.jenis === 'foto' ? dialog : null} api={api} onTutup={tutupDialog} onGeser={(i) => setDialog({ ...dialog, i })} />
    </div>
  );
}
