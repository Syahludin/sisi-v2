import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ASAL_TRAFO_BA, dataSimpanBa, dataUbahBa, fotoKeJpegBa, galatIsianBa, isianAwalBa, isianDariDetail, isianDariGardu, KEPEMILIKAN_BA,
  KONSTRUKSI_BA, MERK_TRAFO_BA, pilihanKvaBa, PREFIX_GARDU, slotFormBa, TERIMA_FOTO_BA,
} from '../baForm.js';
import { baSwitching, JENIS_ALAT_SWITCHING } from '../baForm.js';
import { swKerusakan, swSesudah } from '../beritaAcara.js';
import { BATAS_FILE_MS, BATAS_PDF_MS, dariBase64, keBase64, sha256Hex } from '../beritaAcara.js';
import { Konfirmasi } from '../components/Dialog.jsx';
import Ikon from '../components/Ikon.jsx';
import Pilih from '../components/Pilih.jsx';
import SisiLoader from '../components/SisiLoader.jsx';
import { muatMaster } from '../master.js';
import { kodeGalat, pesan } from '../pesan.js';
import { hariIniWib } from '../tanggal.js';

const pesanGalat = (e) => pesan(kodeGalat(e)) + (e && e.kolom ? ' (' + e.kolom + ')' : '');
const SUB = {
  'Pengoperasian Trafo': 'Gardu baru: nomor gardu dipesan dari server, masuk Master Gardu (AKTIF).',
  'Penggantian Trafo': 'Trafo / PHB-TR diganti pada gardu yang sudah ada. Master Gardu diperbarui ke trafo baru.',
  'Pemeriksaan Trafo': '',
};

/**
 * v1.0.47: buat / ubah BA Gardu dari website (sama isian HP). Foto hanya dari file (galeri / folder), dicek harus foto
 * lalu dikonversi ke JPEG di browser. Simpan = upload foto -> simpanBaGardu / ubahBaGardu -> buatPdfBaGardu, langkah
 * terlihat. Gagal di tengah = isian tetap, Simpan lagi aman (foto ditimpa, simpan ulang baId sama = DUPLIKAT).
 */
export default function BaForm({ api, sesi, jenis, ubahBaId, onSelesai, onBatal }) {
  const hariIni = hariIniWib();
  const edit = !!ubahBaId;
  const baId = useMemo(() => ubahBaId || globalThis.crypto.randomUUID(), [ubahBaId]);
  const [isi, setIsi] = useState(() => isianAwalBa(hariIni));
  const [detail, setDetail] = useState(null);
  const [gardu, setGardu] = useState([]);
  const [jaringan, setJaringan] = useState([]);
  const [pejabat, setPejabat] = useState([]);
  const [galatMuat, setGalatMuat] = useState('');
  const [memuat, setMemuat] = useState(true);
  const [foto, setFoto] = useState({});        // slot -> { jpeg?, url, server?, galat? }
  const [nomor, setNomor] = useState(null);    // jawaban pesanNomorGardu
  const [lewatiBatal, setLewatiBatal] = useState(false);
  const [owner, setOwner] = useState(null);
  const [sibuk, setSibuk] = useState('');      // 'nomor' | 'owner' | 'kirim'
  const [langkah, setLangkah] = useState([]);  // [{ teks, status: 'jalan'|'ok'|'gagal' }]
  const [galat, setGalat] = useState(null);    // { kolom, pesan }
  const [yakinBatal, setYakinBatal] = useState(false);
  const kotor = useRef(false);
  const tersimpan = useRef(false);

  const ubah = (o) => { kotor.current = true; setGalat(null); setIsi((x) => ({ ...x, ...o })); };

  // master + detail (mode ubah)
  useEffect(() => {
    let hidup = true;
    (async () => {
      try {
        const [g, j, p] = await Promise.all([
          muatMaster(api, sesi.token, 'gardu'), muatMaster(api, sesi.token, 'jaringan'), muatMaster(api, sesi.token, 'pejabatBa'),
        ]);
        if (!hidup) return;
        setGardu(g); setJaringan(j.filter((x) => x.aktif !== false)); setPejabat(p.filter((x) => x.aktif !== false));
        if (edit) {
          const d = (await api('getBaGardu', { baId })).data;
          if (!hidup) return;
          setDetail(d);
          setIsi(isianDariDetail(d, hariIni));
          setOwner({ ownerId: d.ownerId, externalReference: d.externalReference, ditemukan: true });
          const awal = {};
          (d.foto || []).forEach((s) => { awal[s] = { server: true, url: '' }; });
          setFoto(awal);
          (d.foto || []).forEach(async (s) => {
            try {
              const f = (await api('getFotoBaGardu', { baId, slot: s, ukuran: 'KECIL' }, { batasMs: BATAS_FILE_MS })).data;
              const url = URL.createObjectURL(new Blob([dariBase64(f.data)], { type: 'image/jpeg' }));
              if (hidup) setFoto((x) => (x[s] && x[s].server ? { ...x, [s]: { ...x[s], url } } : x));
            } catch { /* pratinjau saja */ }
          });
        }
      } catch (e) { if (hidup) setGalatMuat(pesanGalat(e)); }
      if (hidup) setMemuat(false);
    })();
    return () => { hidup = false; };
  }, [api, sesi.token, baId, edit]);

  // tutup tab / refresh saat isian belum disimpan
  useEffect(() => {
    const cegah = (e) => { if (kotor.current && !tersimpan.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', cegah);
    return () => window.removeEventListener('beforeunload', cegah);
  }, []);

  const penyulang = useMemo(() => [...new Set(jaringan.map((x) => x.penyulang))].sort(), [jaringan]);
  const section = useMemo(() => jaringan.filter((x) => x.penyulang === isi.penyulang).sort((a, b) => a.urutan - b.urutan), [jaringan, isi.penyulang]);
  const sectionSesudah = useMemo(() => jaringan.filter((x) => x.penyulang === isi.penyulangSesudah).sort((a, b) => a.urutan - b.urutan),
    [jaringan, isi.penyulangSesudah]);
  const kvaOpsi = useMemo(() => pilihanKvaBa(gardu.map((g) => g.kva)), [gardu]);
  const pemeriksa = pejabat.filter((p) => p.peran === 'PEMERIKSA');
  const mengetahui = pejabat.filter((p) => p.peran === 'MENGETAHUI');
  const slot = slotFormBa(jenis, isi);

  // ---- Pengoperasian: pesan nomor gardu + OwnerId ----
  const pesanNomor = async (prefix, nomorBatalId = '') => {
    setSibuk('nomor');
    try {
      const n = (await api('pesanNomorGardu', { baId, prefix, ...(nomorBatalId ? { nomorBatalId } : {}) })).data;
      setNomor(n);
      ubah({ prefix, nomorBatalId: n.asal === 'ULANG BATAL' ? String(n.garduId) : '' });
    } catch (e) { setGalat({ kolom: 'prefix', pesan: pesanGalat(e) }); }
    setSibuk('');
  };
  const pilihSection = async (sectionId) => {
    ubah({ sectionId });
    setOwner(null);
    if (!sectionId) return;
    setSibuk('owner');
    try { setOwner((await api('getOwnerIdGardu', { sectionId })).data); } catch (e) { setGalat({ kolom: 'sectionId', pesan: pesanGalat(e) }); }
    setSibuk('');
  };
  const keluar = () => {
    if (!edit && isi.prefix) api('lepasNomorGardu', { baId }).catch(() => {});
    onBatal();
  };
  // isian belum disimpan = kartu konfirmasi SiSi (bukan dialog bawaan browser)
  const batal = () => { if (kotor.current) setYakinBatal(true); else keluar(); };

  // ---- Penggantian / Pemeriksaan: pilih gardu ----
  const pilihGardu = (id) => {
    const g = gardu.find((x) => x.id === id);
    if (g) ubah(isianDariGardu(g));
  };
  const opsiGardu = useMemo(() => gardu.map((g) => ({
    nilai: g.id, label: g.no,
    sub: [g.kva ? g.kva + ' kVA' : '', g.status === 'TIDAK AKTIF' ? 'TIDAK AKTIF' : '', g.alamat || g.penyulang].filter(Boolean).join(' · '),
  })), [gardu]);

  // ---- foto ----
  const pasangFoto = async (s, file) => {
    if (!file) return;
    setFoto((x) => ({ ...x, [s]: { ...(x[s] || {}), proses: true, galat: '' } }));
    try {
      const { jpeg, url } = await fotoKeJpegBa(file);
      kotor.current = true;
      setGalat(null);
      setFoto((x) => ({ ...x, [s]: { jpeg, url, nama: file.name } }));
    } catch (e) {
      setFoto((x) => ({ ...x, [s]: { ...(x[s] || {}), proses: false, galat: e.message } }));
    }
  };
  const hapusFoto = (s) => setFoto((x) => { const y = { ...x }; delete y[s]; return y; });

  // ---- simpan ----
  const simpan = async () => {
    const terisi = new Set(Object.keys(foto).filter((s) => foto[s].jpeg || foto[s].server));
    const g = galatIsianBa(jenis, isi, terisi, { edit });
    if (g) { setGalat(g); document.getElementById('baf-' + g.kolom)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (mengetahui.length !== 1) { setGalat({ kolom: 'petugas1Id', pesan: 'Pejabat MENGETAHUI aktif harus tepat satu di db_Pejabat_BA.' }); return; }
    const baru = slot.filter((s) => foto[s.slot] && foto[s.slot].jpeg);
    const daftar = [...baru.map((s) => 'Upload foto ' + s.label), edit ? 'Simpan perubahan BA' : 'Simpan BA (nomor dari server)', 'Buat PDF'];
    const tandai = (i, status, ket = '') => setLangkah((l) => l.map((x, k) => (k === i ? { ...x, status, ket } : x)));
    setLangkah(daftar.map((teks) => ({ teks, status: 'tunggu' })));
    setSibuk('kirim');
    setGalat(null);
    let i = 0;
    try {
      for (const s of baru) {
        tandai(i, 'jalan');
        const b = foto[s.slot].jpeg;
        await api('uploadFotoBaGardu', { baId, jenis, slot: s.slot, sumber: 'GALERI', sha256: await sha256Hex(b), ukuranByte: b.length,
          data: keBase64(b), ...(edit ? { revisi: true } : {}) }, { batasMs: BATAS_FILE_MS });
        tandai(i++, 'ok');
      }
      tandai(i, 'jalan');
      const h = edit
        ? (await api('ubahBaGardu', dataUbahBa(jenis, baId, isi, Number(detail?.revision) || 0), { batasMs: BATAS_FILE_MS })).data
        : (await api('simpanBaGardu', dataSimpanBa(jenis, baId, isi), { batasMs: BATAS_FILE_MS })).data;
      tandai(i++, 'ok', h.noBaFull || h.idBa || '');
      tersimpan.current = true;
      if (h.status === 'TIDAK_BERUBAH') { tandai(i, 'ok', 'Tidak ada perubahan'); onSelesai(baId, { judul: 'Tidak ada perubahan' }); return; }
      tandai(i, 'jalan');
      let pdfOk = true;
      try { await api('buatPdfBaGardu', { baId }, { batasMs: BATAS_PDF_MS }); tandai(i, 'ok'); } catch (e) { pdfOk = false; tandai(i, 'gagal', pesanGalat(e)); }
      onSelesai(baId, {
        judul: edit ? 'Perubahan BA tersimpan' : 'BA berhasil dibuat',
        keterangan: (h.noGardu ? h.noGardu + ' · ' : '') + (h.noBaFull || '') + (pdfOk ? '' : ' · PDF gagal, buat ulang dari detail BA'),
      });
    } catch (e) {
      tandai(i, 'gagal', pesanGalat(e));
      setGalat({ kolom: e && e.kolom ? e.kolom : 'simpan', pesan: pesanGalat(e) });
      setSibuk('');
    }
  };

  if (memuat) return <div className="k-tengah"><SisiLoader ukuran={40} label="Memuat" /><p>Memuat master gardu, jaringan, dan pejabat BA...</p></div>;
  if (galatMuat) {
    return (
      <div className="k-tengah k-tengah--galat"><b>Form BA tidak termuat</b><p>{galatMuat}</p>
        <button type="button" className="k-tombol k-tombol--garis" onClick={onBatal}>Kembali</button></div>
    );
  }

  const medan = (kolom, label, input, { penuh = false, ket, div = false } = {}) => {
    const Bungkus = div ? 'div' : 'label';   // dropdown (tombol + panel) tidak boleh di dalam <label>
    return (
      <Bungkus className={'k-medan' + (penuh ? ' baf-penuh' : '')} id={'baf-' + kolom}>
        <span className="k-label">{label}</span>
        {input}
        {ket && <small className="k-catatan">{ket}</small>}
        {galat && galat.kolom === kolom && <span className="k-galat" role="alert">{galat.pesan}</span>}
      </Bungkus>
    );
  };
  /** Dropdown SiSi. o.bebas = boleh ketik nilai sendiri (merk, kVA, asal trafo). */
  const dropdown = (kolom, label, opsi, o = {}) => medan(kolom, label,
    <Pilih label={label} nilai={isi[kolom]} opsi={opsi} placeholder={o.placeholder} kosong={o.kosong} bebas={o.bebas}
      mati={!!sibuk || o.mati} galat={galat?.kolom === kolom}
      onUbah={(v) => (o.onUbah ? o.onUbah(v) : ubah({ [kolom]: v }))} />, { ...o, div: true });
  const teks = (kolom, label, o = {}) => medan(kolom, label,
    <input className={'k-input' + (galat?.kolom === kolom ? ' k-input--galat' : '')} value={isi[kolom]} inputMode={o.angka ? 'decimal' : undefined}
      maxLength={o.maks || 200} placeholder={o.contoh} onChange={(e) => ubah({ [kolom]: e.target.value })} disabled={!!sibuk} />, o);
  /** opsi: string atau [nilai, label]. o.kosong = placeholder; o.tanpa = baris pilihan kosong (mis. "Tidak ada"). */
  const pilih = (kolom, label, opsi, o = {}) => dropdown(kolom, label,
    opsi.map((x) => (Array.isArray(x) ? { nilai: x[0], label: x[1] } : x)), { ...o, placeholder: o.kosong, kosong: o.tanpa });
  const area = (kolom, label, o = {}) => medan(kolom, label,
    <textarea className="k-input baf-area" rows={o.baris || 3} maxLength={o.maks || 500} value={isi[kolom]} onChange={(e) => ubah({ [kolom]: e.target.value })} disabled={!!sibuk} />,
    { penuh: true, ...o });
  const tanggal = (kolom, label, o = {}) => medan(kolom, label,
    <input type="date" className="k-input" value={isi[kolom]} max={o.maks || hariIni} min="2020-01-01" disabled={!!sibuk || o.kunci}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        ubah(kolom === 'tanggalBa' && isi.tanggalPekerjaan > v ? { tanggalBa: v, tanggalPekerjaan: v } : { [kolom]: v });
      }} />, o);
  const kartu = (judul, ikon, isiKartu, id) => (
    <section className="baf-kartu" id={id}><h2 className="baf-judul"><Ikon nama={ikon} ukuran={18} />{judul}</h2><div className="baf-grid">{isiKartu}</div></section>
  );
  const opsiKva = kvaOpsi.map((k) => ({ nilai: String(k), label: k + ' kVA' }));
  const dataTrafo = (akhiran = '') => <>
    {dropdown('kva' + akhiran, 'Kapasitas (kVA) *', opsiKva, { bebas: true, placeholder: 'Pilih kVA' })}
    {dropdown('merk' + akhiran, 'Merk *', MERK_TRAFO_BA, { bebas: true, placeholder: 'Pilih merk' })}
    {teks('seri' + akhiran, 'Nomor Seri *', { maks: 60 })}
    {teks('tahun' + akhiran, 'Tahun *', { angka: true, contoh: '2024' })}
  </>;
  const dataPhb = <>
    {teks('merkPhb', 'Merk PHB-TR', { maks: 60 })}
    {teks('seriPhb', 'Nomor Seri PHB-TR', { maks: 60 })}
    {teks('tahunPhb', 'Tahun PHB-TR', { angka: true })}
    {teks('jurusan', 'Jumlah Jurusan *', { angka: true })}
  </>;
  const operasi = jenis === 'Pengoperasian Trafo';
  const sw = baSwitching(jenis);   // v1.0.49 BA Switching: tanpa gardu / OwnerId, nama switching diketik
  const tawarBatal = operasi && !edit && nomor && (nomor.batal || []).length > 0 && !isi.nomorBatalId && !lewatiBatal;

  return (
    <div className="baf">
      <header className="hlm-header">
        <div className="hlm-judul">
          <button type="button" className="k-tautan" onClick={batal} disabled={sibuk === 'kirim'}><Ikon nama="kiri" ukuran={14} /> Kembali ke Daftar BA</button>
          <h1>{edit ? 'Edit BA ' + jenis : 'BA ' + jenis}</h1>
          {(edit || SUB[jenis]) && <p>{edit ? (detail?.noGardu || '') + ' · ' + (detail?.noBaFull || detail?.idBa || '') + '. Nomor gardu, ID BA, No BA, dan Tanggal BA tetap.' : SUB[jenis]}</p>}
        </div>
      </header>

      {kartu('Identitas Berita Acara', 'dokumen', <>
        {operasi && !edit && <>
          {dropdown('prefix', 'Kode Gardu (prefix) *', PREFIX_GARDU, {
            placeholder: 'Pilih kode', onUbah: (v) => { setLewatiBatal(false); setNomor(null); pesanNomor(v); } })}
          <div className="k-medan">
            <span className="k-label">Nomor Gardu</span>
            <p className="baf-nomor">{sibuk === 'nomor' ? <SisiLoader ukuran={18} label="Memesan" /> : nomor ? nomor.nomor : '-'}
              {nomor && <small>{nomor.asal === 'ULANG BATAL' ? 'pakai ulang nomor BATAL' : 'dipesan ' + nomor.menitBerlaku + ' menit'}</small>}</p>
          </div>
          {tawarBatal && (
            <div className="baf-penuh k-banner">
              <div>
                <b>Ada {nomor.batal.length} nomor gardu BATAL yang belum dipakai ulang</b>
                <div className="k-chip-baris">
                  {nomor.batal.map((b) => (
                    <button key={b.garduId} type="button" className="k-chip" disabled={!!sibuk} onClick={() => pesanNomor(isi.prefix, String(b.garduId))}>
                      {b.noGardu}{b.alamat ? ' · ' + b.alamat : ''}
                    </button>
                  ))}
                  <button type="button" className="k-tombol k-tombol--teks" onClick={() => setLewatiBatal(true)}>Lewati, pakai nomor berikutnya</button>
                </div>
              </div>
            </div>
          )}
        </>}
        {!operasi && !sw && (edit
          ? <div className="k-medan"><span className="k-label">Gardu</span><p className="baf-nomor">{detail?.noGardu}</p></div>
          : dropdown('garduId', 'Pilih Gardu (Master Gardu) *', opsiGardu, { placeholder: 'Cari no gardu, mis. TB0012', onUbah: pilihGardu }))}
        {tanggal('tanggalBa', 'Tanggal BA *', { kunci: edit })}
        {tanggal('tanggalPekerjaan', 'Tanggal Pekerjaan *')}
      </>, 'baf-identitas')}

      {operasi && kartu('Data Trafo', 'listrik', <>
        {pilih('penyulang', 'Penyulang *', penyulang, { kosong: 'Pilih penyulang', onUbah: (v) => { ubah({ penyulang: v, sectionId: '' }); setOwner(null); } })}
        {pilih('sectionId', 'Section *', section.map((s) => [s.id, s.section]), { kosong: isi.penyulang ? 'Pilih section' : 'Pilih penyulang dulu', mati: !isi.penyulang, onUbah: pilihSection })}
        <div className="k-medan baf-penuh">
          <span className="k-label">OwnerId / External Reference</span>
          <p className="baf-owner">{sibuk === 'owner' ? 'Mencari...' : owner ? (owner.ownerId || '-') + ' / ' + (owner.externalReference || '-') + (owner.ditemukan ? '' : ' · ' + (owner.pesan || 'tidak ditemukan')) : 'Terisi otomatis saat section dipilih'}</p>
        </div>
        {dataTrafo()}
        {pilih('konstruksi', 'Konstruksi *', KONSTRUKSI_BA)}
        {pilih('kepemilikan', 'Kepemilikan *', KEPEMILIKAN_BA)}
        {teks('koordinat', 'Koordinat Trafo *', { contoh: '-3.012345, 106.456789' })}
        {area('alamat', 'Alamat *', { baris: 2, maks: 200 })}
      </>, 'baf-trafo')}
      {operasi && kartu('Data PHB-TR', 'listrik', dataPhb)}
      {operasi && kartu('Pengoperasian', 'kalender', <>
        {teks('perluasanSutm', 'Panjang Perluasan SUTM (kmS)', { angka: true })}
        {teks('vendor', 'Vendor Pelaksana', { maks: 100 })}
        {area('catatan', 'Catatan', { baris: 2 })}
      </>)}

      {sw && kartu(swSesudah(jenis) ? 'Data Switching Sebelum' : 'Data Switching', 'listrik', <>
        {pilih('jenisSwitching', 'Jenis Switching *', JENIS_ALAT_SWITCHING, { kosong: 'Pilih jenis' })}
        {teks('namaSwitching', 'Nama Switching *', { maks: 100, contoh: 'mis. LBS SPBU Bukit' })}
        {pilih('penyulang', 'Penyulang *', penyulang, { kosong: 'Pilih penyulang', onUbah: (v) => ubah({ penyulang: v, sectionId: '' }) })}
        {pilih('sectionId', 'Section *', section.map((x) => [x.id, x.section]), { kosong: isi.penyulang ? 'Pilih section' : 'Pilih penyulang dulu', mati: !isi.penyulang })}
        {teks('merk', 'Merk', { maks: 60 })}
        {teks('tipe', 'Tipe', { maks: 60 })}
        {teks('seri', 'Nomor Seri', { maks: 60 })}
        {teks('koordinat', 'Koordinat', { contoh: '-3.012345, 106.456789' })}
      </>, 'baf-trafo')}
      {sw && swSesudah(jenis) && kartu('Data Switching Sesudah', 'ulang', <>
        {pilih('jenisSwitchingSesudah', 'Jenis Switching Sesudah *', JENIS_ALAT_SWITCHING, { kosong: 'Pilih jenis' })}
        {teks('namaSwitchingSesudah', 'Nama Switching Sesudah *', { maks: 100 })}
        {pilih('penyulangSesudah', 'Penyulang *', penyulang, { kosong: 'Pilih penyulang', onUbah: (v) => ubah({ penyulangSesudah: v, sectionIdSesudah: '' }) })}
        {pilih('sectionIdSesudah', 'Section *', sectionSesudah.map((x) => [x.id, x.section]),
          { kosong: isi.penyulangSesudah ? 'Pilih section' : 'Pilih penyulang dulu', mati: !isi.penyulangSesudah })}
        {teks('merkSesudah', 'Merk Sesudah', { maks: 60 })}
        {teks('tipeSesudah', 'Tipe Sesudah', { maks: 60 })}
        {teks('seriSesudah', 'Nomor Seri Sesudah', { maks: 60 })}
        {teks('koordinatSesudah', 'Koordinat Sesudah', { contoh: '-3.012345, 106.456789' })}
        {teks('asalSwitching', 'Asal Switching', { maks: 80 })}
      </>)}
      {sw && kartu('Keterangan', 'dokumen', <>
        {area('catatan', 'Keterangan Tambahan', { baris: 2 })}
        {swKerusakan(jenis) && area('kerusakan', 'Keterangan Kerusakan / Pemeriksaan', { baris: 3, maks: 1000 })}
      </>)}

      {!operasi && !sw && kartu(jenis === 'Penggantian Trafo' ? 'Data Trafo & PHB-TR Sebelum' : 'Data Trafo & PHB-TR', 'listrik', <>
        {dataTrafo()}
        {pilih('konstruksi', 'Konstruksi', KONSTRUKSI_BA)}
        {teks('koordinat', 'Koordinat', { contoh: '-3.012345, 106.456789' })}
        {area('alamat', 'Alamat *', { baris: 2, maks: 200 })}
        {dataPhb}
      </>, 'baf-trafo')}

      {jenis === 'Penggantian Trafo' && kartu('Data Trafo Sesudah (Pengganti)', 'ulang', <>
        {dataTrafo('Sesudah')}
        {dropdown('asalTrafo', 'Asal Trafo *', ASAL_TRAFO_BA, { bebas: true, placeholder: 'Pilih asal trafo' })}
        {pilih('kepemilikan', 'Kepemilikan', KEPEMILIKAN_BA)}
        {area('catatan', 'Catatan', { baris: 2 })}
      </>)}
      {jenis === 'Penggantian Trafo' && kartu('Data PHB-TR Sesudah', 'listrik', <>
        <label className="baf-penuh baf-centang">
          <input type="checkbox" checked={isi.phbDiganti} disabled={!!sibuk}
            onChange={(e) => ubah(e.target.checked ? { phbDiganti: true } : { phbDiganti: false, merkPhbSesudah: isi.merkPhb, seriPhbSesudah: isi.seriPhb, tahunPhbSesudah: isi.tahunPhb, jurusanSesudah: isi.jurusan })} />
          PHB-TR ikut diganti <small>{isi.phbDiganti ? 'isi data PHB-TR baru' : 'tetap memakai data PHB-TR sebelum'}</small>
        </label>
        {isi.phbDiganti && <>
          {teks('merkPhbSesudah', 'Merk PHB-TR Sesudah', { maks: 60 })}
          {teks('seriPhbSesudah', 'Nomor Seri PHB-TR Sesudah', { maks: 60 })}
          {teks('tahunPhbSesudah', 'Tahun PHB-TR Sesudah', { angka: true })}
          {teks('jurusanSesudah', 'Jumlah Jurusan Sesudah *', { angka: true })}
        </>}
      </>)}

      {jenis === 'Pemeriksaan Trafo' && kartu('Kesimpulan & Catatan', 'centang', <>
        {area('kesimpulan', 'Kesimpulan', { baris: 4, maks: 1000 })}
        {area('catatan', 'Catatan', { baris: 3, maks: 1000, ket: 'Kosong = tidak dicetak di PDF.' })}
      </>)}

      <section className="baf-kartu" id="baf-foto">
        <h2 className="baf-judul"><Ikon nama="dokumen" ukuran={18} />
          {jenis === 'Pemeriksaan Trafo' ? 'Lampiran Pemeriksaan (opsional, maks 6)' : 'Foto Lampiran'}
        </h2>
        <p className="k-catatan">Pilih file foto dari komputer / galeri (JPG, PNG, WebP). File selain foto ditolak. Foto diperkecil otomatis (maks 2048 px, 2 MB).</p>
        {galat?.kolom === 'foto' && <p className="k-pesan k-pesan--galat" role="alert">{galat.pesan}</p>}
        <div className="baf-foto">
          {slot.map((s) => {
            const f = foto[s.slot];
            return (
              <div key={s.slot} className={'baf-slot' + (f && (f.jpeg || f.server) ? ' baf-slot--isi' : '') + (f?.galat ? ' baf-slot--galat' : '')}>
                <label className="baf-slot-gambar">
                  {f?.url ? <img src={f.url} alt={s.label} /> : f?.proses ? <SisiLoader ukuran={28} label="Memproses" />
                    : <span className="baf-slot-kosong"><Ikon nama="tambah" ukuran={22} />{f?.server ? 'Foto tersimpan' : 'Pilih foto'}</span>}
                  <input type="file" accept={TERIMA_FOTO_BA} disabled={!!sibuk} aria-label={'Foto ' + s.label}
                    onChange={(e) => { pasangFoto(s.slot, e.target.files && e.target.files[0]); e.target.value = ''; }} />
                </label>
                <div className="baf-slot-ket">
                  <b>{s.label}{s.wajib ? ' *' : ''}</b>
                  <small>{f?.galat ? f.galat : f?.jpeg ? 'Baru · ' + Math.round(f.jpeg.length / 1024) + ' KB' : f?.server ? 'Tersimpan (pilih file untuk mengganti)' : s.wajib ? 'Wajib' : 'Opsional'}</small>
                  {f?.jpeg && <button type="button" className="k-tautan" disabled={!!sibuk} onClick={() => hapusFoto(s.slot)}>Batalkan foto ini</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {kartu('Pemeriksa', 'orang', <>
        {pilih('petugas1Id', 'Petugas 1 *', pemeriksa.map((p) => [p.id, p.nama + ' · ' + p.jabatan]), { kosong: 'Pilih petugas' })}
        {pilih('petugas2Id', 'Petugas 2', pemeriksa.filter((p) => p.id !== isi.petugas1Id).map((p) => [p.id, p.nama + ' · ' + p.jabatan]), { kosong: 'Tidak ada', tanpa: 'Tidak ada' })}
        <div className="k-medan baf-penuh">
          <span className="k-label">Mengetahui</span>
          <p className={mengetahui.length === 1 ? 'baf-owner' : 'k-galat'}>
            {mengetahui.length === 1 ? mengetahui[0].nama + ' · ' + mengetahui[0].jabatan : 'Pejabat MENGETAHUI aktif harus tepat satu di db_Pejabat_BA.'}
          </p>
        </div>
      </>, 'baf-pemeriksa')}

      {langkah.length > 0 && (
        <ol className="baf-langkah" aria-live="polite">
          {langkah.map((l) => (
            <li key={l.teks} className={'baf-langkah--' + l.status}>
              {l.status === 'jalan' ? <SisiLoader ukuran={14} label="Proses" /> : <Ikon nama={l.status === 'ok' ? 'centang' : l.status === 'gagal' ? 'peringatan' : 'kanan'} ukuran={14} />}
              <span>{l.teks}{l.ket ? ' · ' + l.ket : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {galat && !['foto'].includes(galat.kolom) && !document.getElementById('baf-' + galat.kolom) && <p className="k-pesan k-pesan--galat" role="alert">{galat.pesan}</p>}

      <div className="baf-aksi">
        <button type="button" className="k-tombol k-tombol--teks" onClick={batal} disabled={sibuk === 'kirim'}>Batal</button>
        <button type="button" className="k-tombol k-tombol--utama" onClick={simpan} disabled={!!sibuk}>
          {sibuk === 'kirim' ? <SisiLoader ukuran={16} warna="#fff" label="Menyimpan" /> : <Ikon nama="simpan" ukuran={16} />}
          {edit ? 'Simpan Perubahan' : 'Simpan Berita Acara'}
        </button>
      </div>
      <Konfirmasi k={yakinBatal ? { judul: 'Buang isian BA?', teks: 'Isian dan foto yang belum disimpan akan hilang.', tombol: 'Buang isian', bahaya: true } : null}
        onTutup={() => setYakinBatal(false)} onYa={() => { setYakinBatal(false); keluar(); }} />
      <p className="k-catatan baf-kaki">
        {edit ? 'Foto baru menggantikan foto lama. PDF dibuat ulang otomatis; BA TTD lama perlu diupload ulang.'
          : 'Nomor BA dibuat server saat simpan, lalu PDF dibuat otomatis.' + (jenis === 'Pemeriksaan Trafo' || sw ? ' Master Gardu tidak berubah.' : ' Master Gardu ikut diperbarui.')}
      </p>
    </div>
  );
}
