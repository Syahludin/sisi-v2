/** C4A: putaran sinkron UIW + pemicu (permintaan Master Guswan 15 Nov 2026). */
const test = require('node:test');
const assert = require('node:assert');
const { j } = require('./gudangUji');
const { duniaFile, pasangMaps, rute } = require('./duniaC4A');

/** File UIW palsu + laporan aaaa0001 ditutup + [n] temuan ber-foto (bbbb000k, foto Fk), Maps 1,5 km. */
function duniaPutaran(n = 3, opsi) {
  const x = duniaFile(opsi);
  pasangMaps(x, rute(1500));
  x.buka({ c4aId: 'aaaa0001' });
  for (let k = 1; k <= n; k++) {
    x.temuan('aaaa0001', { uniqueid: 'bbbb000' + k });
    x.ubah('db_temuan_inspeksi', k - 1, { foto_temuan_file_id: 'F' + k });
    x.jam.ms += 1000;
  }
  x.tutup('aaaa0001');
  x.pemicu.length = 0;
  x.h.PropertiesService.getScriptProperties().deleteProperty('UIW_PEMICU');
  x.putar = () => j(x.h.putaranSinkronUiw_());
  x.status = () => x.baris('uiw_antrean').map((r) => [r.jenis, r.kunci, r.status]);
  x.sinkron = () => x.pemicu.filter((p) => p.fn === 'ADMIN_pemicuSinkronUiw').map((p) => p.afterMs);
  x.nUpdate = () => x.panggil.filter((p) => p === 'update:UIWX').length;
  return x;
}

test('putaran: laporan + 3 temuan -> satu kali tulis file, semua TERKIRIM, jarak dihitung, foto disalin, tanpa sisa tanpa pemicu', () => {
  const x = duniaPutaran(3);
  const h = x.putar();
  assert.deepStrictEqual([h.status, h.ditulis, h.dihapus, h.sisa], ['OK', 5, 0, 0]);
  assert.strictEqual(x.nUpdate(), 1);
  assert.deepStrictEqual(x.status().map((s) => s[2]), ['TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'TERKIRIM']);
  assert.deepStrictEqual(x.tmp['KMS'].data.slice(1).map((r) => [r[0], r[5]]), [['aaaa0001', 1.5]]);
  assert.deepStrictEqual(x.tmp.Temuan.data.slice(1).map((r) => [r[0], r[1], r[8]]), [['bbbb0001', 'aaaa0001', 'Open'], ['bbbb0002', 'aaaa0001', 'Open'], ['bbbb0003', 'aaaa0001', 'Open']]);
  assert.deepStrictEqual(x.drive.salinan.map((s) => s.id), ['F1', 'F2', 'F3']);
  assert.match(x.baris('uiw_antrean')[2].foto_awal_uiw, /^bbbb0001\.Foto Awal\.\d{6}\.jpg$/);
  assert.deepStrictEqual(x.sinkron(), []);
  // putaran kedua tanpa perubahan: tidak menulis file
  assert.strictEqual(x.putar().ditulis, 0);
  assert.strictEqual(x.nUpdate(), 1);
});

test('putaran: waktu habis -> baris yang lolos tetap ditulis, sisanya ANTRE, pemicu 2 menit', () => {
  const x = duniaPutaran(3);
  const salin = x.h.salinFotoUiw_;
  x.h.salinFotoUiw_ = (...a) => { x.jam.ms += 100000; return salin(...a); };
  const h = x.putar();
  assert.deepStrictEqual([h.ditulis, h.sisa, h.alasanSisa], [4, 1, 'WAKTU']);
  assert.deepStrictEqual(x.status().map((s) => s[2]), ['TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'ANTRE']);
  assert.deepStrictEqual(x.sinkron(), [120000]);
});

test('putaran: tulis file gagal -> tidak ada TERKIRIM, GAGAL percobaan 1 coba lagi 5 menit, pemicu 5 menit; berhasil sesudahnya', () => {
  const x = duniaPutaran(1);
  x.gagal.update = true;
  const h = x.putar();
  assert.deepStrictEqual([h.ditulis, h.alasanSisa], [0, 'GAGAL']);
  const r = x.baris('uiw_antrean');
  assert.deepStrictEqual(r.map((a) => [a.status, a.percobaan]), [['GAGAL', 1], ['GAGAL', 1], ['GAGAL', 1]]);
  assert.match(r[0].bantu, /upload gagal/);
  assert.strictEqual(Date.parse(r[0].coba_lagi_setelah) - x.jam.ms, 300000);
  assert.deepStrictEqual(x.sinkron(), [300000]);
  x.gagal.update = false;
  assert.strictEqual(x.putar().ditulis, 0, 'belum lewat jeda');
  x.jam.ms += 301000;
  assert.strictEqual(x.putar().ditulis, 3);
  assert.deepStrictEqual(x.baris('uiw_antrean').map((a) => [a.status, a.percobaan, a.bantu]), [['TERKIRIM', 0, ''], ['TERKIRIM', 0, ''], ['TERKIRIM', 0, '']]);
});

test('putaran: penandaan TERKIRIM hilang lalu putaran ulang -> upsert, tidak ada baris ganda di file', () => {
  const x = duniaPutaran(2);
  x.putar();
  x.baris('uiw_antrean').forEach((_, i) => x.ubah('uiw_antrean', i, { status: 'ANTRE' }));
  x.putar();
  assert.strictEqual(x.tmp.Temuan.data.length, 3);
  assert.strictEqual(x.tmp.Inspeksi.data.filter((r) => r[0] === 'aaaa0001').length, 1);
});

test('putaran: periksa awal gagal -> UIW_STATUS_FILE terisi, file tidak disentuh, pemicu 60 menit; pulih = status dihapus', () => {
  const x = duniaPutaran(1, { bisaEdit: false });
  const h = x.putar();
  assert.deepStrictEqual([h.status, h.bantuFile], ['FILE', 'akses file UIW']);
  assert.match(x.h.PropertiesService.getScriptProperties().getProperty('UIW_STATUS_FILE'), /^akses file UIW · /);
  assert.ok(!x.panggil.some((p) => /^(copy|update)/.test(p)));
  assert.deepStrictEqual(x.status().map((s) => s[2]), ['ANTRE', 'ANTRE', 'ANTRE']);
  assert.deepStrictEqual(x.sinkron(), [3600000]);
});

test('putaran: struktur file UIW berubah -> UIW_STATUS_FILE, baris tetap ANTRE (bukan GAGAL), file asli tidak diperbarui', () => {
  const x = duniaPutaran(1);
  x.tmp.Temuan.data[0][3] = 'Temuan';
  const h = x.putar();
  assert.strictEqual(h.status, 'FILE');
  assert.match(x.h.PropertiesService.getScriptProperties().getProperty('UIW_STATUS_FILE'), /^struktur file UIW berubah: Temuan/);
  assert.strictEqual(x.nUpdate(), 0);
  assert.deepStrictEqual(x.status().map((s) => s[2]), ['ANTRE', 'ANTRE', 'ANTRE']);
});

test('putaran: jenis belum dipetakan = PERLU_DATA tanpa menahan baris lain dan tanpa pemicu; foto belum ada = MENUNGGU + pemicu 15 menit', () => {
  const x = duniaPutaran(1);
  x.temuan('aaaa0001', { uniqueid: 'bbbb0009', jenisTemuanId: 'jt-3' });
  x.ubah('db_temuan_inspeksi', 1, { foto_temuan_file_id: 'F9' });
  x.pemicu.length = 0;
  x.h.PropertiesService.getScriptProperties().deleteProperty('UIW_PEMICU');
  x.putar();
  const r = x.baris('uiw_antrean');
  assert.deepStrictEqual(r.map((a) => a.status), ['TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'PERLU_DATA']);
  assert.strictEqual(r[3].bantu, 'kategori UIW belum dipetakan untuk "Bentang kendur"');
  assert.deepStrictEqual(x.sinkron(), []);
  x.temuan('aaaa0001', { uniqueid: 'bbbb000a' });
  x.pemicu.length = 0;
  x.h.PropertiesService.getScriptProperties().deleteProperty('UIW_PEMICU');
  x.putar();
  assert.deepStrictEqual(x.baris('uiw_antrean').slice(4).map((a) => [a.status, a.bantu]), [['MENUNGGU', 'foto belum terunggah']]);
  assert.deepStrictEqual(x.sinkron(), [900000]);
});

test('putaran: temuan dihapus di SiSi -> baris Temuan UIW dihapus, foto Temuan_Images dibuang, status TERHAPUS', () => {
  const x = duniaPutaran(2);
  x.putar();
  const nama = x.baris('uiw_antrean')[2].foto_awal_uiw;
  x.sheets.t.db_temuan_inspeksi.data.splice(1, 1);
  const h = x.putar();
  assert.deepStrictEqual([h.ditulis, h.dihapus], [0, 1]);
  assert.deepStrictEqual(x.tmp.Temuan.data.slice(1).map((a) => a[0]), ['bbbb0002']);
  assert.deepStrictEqual(x.drive.dihapus, ['n:' + nama]);
  assert.strictEqual(x.baris('uiw_antrean')[2].status, 'TERHAPUS');
});

test('pemicu 5 menit: tutup otomatis laporan kemarin lalu langsung menjalankan putaran, data terproses dicatat di log', () => {
  const x = duniaPutaran(0);
  x.buka({ c4aId: 'aaaa0002' });
  x.jam.ms += 864e5;
  const log = [];
  x.h.console = { log: (s) => log.push(String(s)) };
  const h = j(x.h.harianC4A_());
  assert.strictEqual(h.ditutup, 1);
  assert.deepStrictEqual([h.putaran.status, h.putaran.ditulis], ['OK', 4]);
  assert.deepStrictEqual(h.putaran.proses, ['INSPEKSI aaaa0001: TERKIRIM', 'KMS aaaa0001: TERKIRIM', 'INSPEKSI aaaa0002: TERKIRIM', 'KMS aaaa0002: TERKIRIM']);
  assert.deepStrictEqual(x.sinkron(), [], 'tidak memasang pemicu sekali jalan: putaran sudah jalan');
  assert.strictEqual(log.length, 1);
  assert.match(log[0], /"ditutup":1/);
  assert.match(log[0], /KMS aaaa0002: TERKIRIM/);
});

test('pasang pemicu C4A: setiap 5 menit, dijalankan ulang = tetap satu pemicu', () => {
  const x = duniaPutaran(0);
  x.h.pastikanPemilik_ = () => {};
  x.h.ADMIN_pasangPemicuC4A();
  x.h.ADMIN_pasangPemicuC4A();
  assert.deepStrictEqual(x.pemicu.filter((p) => p.fn === 'ADMIN_pemicuHarianC4A').map((p) => p.menitan), [5]);
});

// Review 15 Nov 2026: putaran tidak memegang ScriptLock global sepanjang jalan (semua simpan di semua modul tertahan)
test('putaran: Maps, salin foto, dan ganti isi file UIW berjalan DI LUAR ScriptLock; giliran dilepas sesudahnya', () => {
  const x = duniaPutaran(2);
  const dalamLock = [];
  const upd = x.h.Drive.Files.update, maps = x.h.Maps.newDirectionFinder, salin = x.h.salinFotoUiw_;
  x.h.Drive.Files.update = (...a) => { dalamLock.push(['update', x.h.LOCK_AKTIF_.ya]); return upd(...a); };
  x.h.Maps.newDirectionFinder = (...a) => { dalamLock.push(['maps', x.h.LOCK_AKTIF_.ya]); return maps(...a); };
  x.h.salinFotoUiw_ = (...a) => { dalamLock.push(['salin', x.h.LOCK_AKTIF_.ya]); return salin(...a); };
  assert.strictEqual(x.putar().status, 'OK');
  assert.ok(dalamLock.length >= 3);
  assert.deepStrictEqual(dalamLock.filter((d) => d[1]), [], 'tidak ada kerja lambat di dalam lock');
  assert.strictEqual(x.h.PropertiesService.getScriptProperties().getProperty('UIW_PUTARAN_JALAN'), null);
});

test('putaran: putaran lain masih jalan = SIBUK tanpa menyentuh file + jadwal ulang; penanda basi (> 7 menit) diabaikan', () => {
  const x = duniaPutaran(1);
  const p = x.h.PropertiesService.getScriptProperties();
  p.setProperty('UIW_PUTARAN_JALAN', String(x.jam.ms - 60000));
  assert.strictEqual(x.putar().status, 'SIBUK');
  assert.ok(!x.panggil.some((c) => /^(copy|update)/.test(c)));
  assert.deepStrictEqual(x.sinkron(), [120000]);
  assert.strictEqual(p.getProperty('UIW_PUTARAN_JALAN'), String(x.jam.ms - 60000), 'penanda putaran lain tidak dihapus');
  p.setProperty('UIW_PUTARAN_JALAN', String(x.jam.ms - 8 * 60000));
  p.deleteProperty('UIW_PEMICU');
  assert.strictEqual(x.putar().ditulis, 3);
});

test('putaran: file UIW diubah orang lain selama penulisan = isi file TIDAK diganti, baris GAGAL dicoba lagi 5 menit', () => {
  const x = duniaPutaran(1);
  const get = x.h.Drive.Files.get;
  let v = 10;
  x.h.Drive.Files.get = (id, o) => (o && o.fields === 'version' ? { version: String(v++) } : get(id, o));
  const h = x.putar();
  assert.strictEqual(h.alasanSisa, 'GAGAL');
  assert.strictEqual(x.nUpdate(), 0);
  const r = x.baris('uiw_antrean');
  assert.deepStrictEqual(r.map((a) => a.status), ['GAGAL', 'GAGAL', 'GAGAL']);
  assert.match(r[0].bantu, /FILE_UIW_BERUBAH/);
});

test('jarak: titik akhir dikirim lagi selama rute dihitung (revision naik) = hasil lama tidak ditulis', () => {
  const x = duniaPutaran(1);
  const ctx = x.h.bacaKonteksUiw_();
  const maps = x.h.Maps.newDirectionFinder;
  x.h.Maps.newDirectionFinder = (...a) => { x.ubah('c4a_laporan', 0, { revision: Number(x.baris('c4a_laporan')[0].revision) + 1, status_jarak: 'MENUNGGU' }); return maps(...a); };
  assert.strictEqual(x.h.prosesJarakC4A_(ctx), 0);
  assert.strictEqual(x.baris('c4a_laporan')[0].status_jarak, 'MENUNGGU');
  assert.strictEqual(x.baris('c4a_laporan')[0].jarak_km, '');
});

// Review / permintaan Master Guswan 16 Nov 2026: pemicu 5 menit tidak membaca data yang sudah terkirim
test('pemicu 5 menit: tanpa tanda perubahan dan sapuan belum jatuh tempo = tidak ada putaran, tidak membaca temuan / tindak lanjut / antrean', () => {
  const x = duniaPutaran(2);
  x.h.console = { log: () => {} };
  const awal = j(x.h.harianC4A_());
  assert.strictEqual(awal.putaran.status, 'OK', 'sapuan pertama (belum pernah) berjalan penuh');
  assert.deepStrictEqual(x.status().map((s) => s[2]), ['TERKIRIM', 'TERKIRIM', 'TERKIRIM', 'TERKIRIM']);
  const baca = [];
  const asli = x.h.tabelInsJar_;
  x.h.tabelInsJar_ = (n) => { baca.push(n); return asli(n); };
  x.jam.ms += 5 * 60000;
  assert.strictEqual(j(x.h.harianC4A_()).putaran.status, 'LEWAT');
  assert.ok(!baca.includes('db_temuan_inspeksi') && !baca.includes('db_temuan_tindak_lanjut') && !baca.includes('uiw_antrean'), 'hanya c4a_laporan yang dibaca: ' + baca);
  // temuan baru = tanda perubahan -> putaran jalan, tanda dihapus lagi sesudahnya
  x.temuan('aaaa0001', { uniqueid: 'cccc0001' });
  x.ubah('db_temuan_inspeksi', 2, { foto_temuan_file_id: 'F9' });
  x.jam.ms += 5 * 60000;
  const h = j(x.h.harianC4A_());
  assert.deepStrictEqual([h.putaran.status, h.putaran.ditulis], ['OK', 1]);
  x.jam.ms += 5 * 60000;
  assert.strictEqual(j(x.h.harianC4A_()).putaran.status, 'LEWAT');
  // sapuan penuh tiap 60 menit tetap jalan walau tanpa tanda
  x.jam.ms += 60 * 60000;
  assert.strictEqual(j(x.h.harianC4A_()).putaran.status, 'OK');
});

test('putaran bukan sapuan penuh: baris TERKIRIM yang sumbernya tidak berubah tidak dihitung sidiknya; yang berubah dikirim ulang', () => {
  const x = duniaPutaran(2);
  const lama = '2026-01-01T00:00:00.000Z';
  x.baris('c4a_laporan').forEach((_, i) => x.ubah('c4a_laporan', i, { timestamp_update: lama }));
  x.baris('db_temuan_inspeksi').forEach((_, i) => x.ubah('db_temuan_inspeksi', i, { timestamp_update: lama }));
  x.putar();   // sapuan penuh pertama
  const sidik = x.h.sidikSumberUiw_;
  let n = 0;
  x.h.sidikSumberUiw_ = (...a) => { n++; return sidik(...a); };
  // baris laporan baru dihitung jaraknya di putaran pertama (cap waktu dekat waktu kirim): diperiksa sekali lalu dicatat
  x.jam.ms += 10 * 60000;
  assert.strictEqual(j(x.h.putaranSinkronUiw_(false)).ditulis, 0);
  const periksaAwal = n;
  x.jam.ms += 10 * 60000;
  assert.strictEqual(j(x.h.putaranSinkronUiw_(false)).ditulis, 0);
  assert.strictEqual(n, periksaAwal, 'putaran berikutnya tidak menghitung sidik baris yang sudah diperiksa');
  assert.ok(periksaAwal <= 2, 'hanya baris laporan yang jaraknya baru dihitung');
  x.jam.ms += 60000;
  x.ubah('db_temuan_inspeksi', 0, { deskripsi: 'diubah admin', jenis_temuan: 'Isolator pecah', timestamp_update: new Date(x.jam.ms).toISOString() });
  const h = j(x.h.putaranSinkronUiw_(false));
  assert.strictEqual(h.ditulis, 1, 'sumber lebih baru = dikirim ulang');
  assert.ok(n >= 1);
  // sapuan penuh membandingkan semua sidik (perubahan master tanpa cap waktu sumber tetap terbaca)
  x.ubah('db_temuan_inspeksi', 1, { jenis_temuan: 'Diubah tanpa cap waktu' });
  assert.strictEqual(j(x.h.putaranSinkronUiw_(true)).ditulis, 1);
});

test('tutup otomatis: tanpa laporan terbuka dari hari lalu tidak membaca temuan dan tidak mengambil lock', () => {
  const x = duniaPutaran(1);
  const baca = [];
  const asli = x.h.tabelInsJar_;
  x.h.tabelInsJar_ = (n) => { baca.push(n); return asli(n); };
  let lock = 0;
  const dl = x.h.denganLock_;
  x.h.denganLock_ = (...a) => { lock++; return dl(...a); };
  assert.strictEqual(x.h.tutupOtomatisC4A_(), 0);
  assert.deepStrictEqual([baca, lock], [['c4a_laporan'], 0]);
});
