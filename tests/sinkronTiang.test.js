const test = require('node:test');
const assert = require('node:assert');
const { j } = require('./gudangUji');
const { dunia } = require('./duniaTiang');

const SEG = { nama: 'LBS Air Bara - TB0011', penyulang: 'TOBOALI 1', sectionId: 's2', awalJenis: 'SWITCHING', awalNama: 'LBS Air Bara', akhirJenis: 'GARDU', akhirNama: 'TB0011' };
const sinkron = (x, ops) => j(x.g.sinkronTiang_(x.admin, { ops }, 'MOBILE'));
const awal = (x, t, segmenId, o = {}) => ({ opId: 'op-' + t.tiangId, jenis: 'TIANG', data: { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5',
  ...x.fisik, sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...x.lengkap(segmenId, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' }) }] }, ...o });
const anak = (x, t, induk, segmenId) => ({ opId: 'op-' + t.tiangId, jenis: 'TIANG', data: { tiangId: t.tiangId, revision: t.revision, statusVerifikasi: 'TERVERIFIKASI', koordinat: '-3, 106.5005',
  ...x.fisik, sirkuit: [{ sirkuitId: t.sirkuit[0].sirkuitId, ...x.lengkap(segmenId, { indukTiangId: induk, indukStatus: 'BENAR' }) }] } });

test('sinkronTiang: segmen baru + induk + anak dalam satu kelompok; id sementara dipetakan; satu baris audit per entri', () => {
  const x = dunia();
  const [t1, t2] = x.jalur();
  const r = sinkron(x, [
    { opId: 'op-seg', jenis: 'SEGMEN', refId: 'LOKAL-seg1', data: { ...SEG, awalSwitchingId: x.swc.switchingId } },
    awal(x, t1, 'LOKAL-seg1'),
    anak(x, t2, t1.tiangId, 'LOKAL-seg1')]);
  assert.deepStrictEqual(r.hasil.map((h) => h.ok), [true, true, true]);
  assert.deepStrictEqual(r.idBaru, { 'LOKAL-seg1': 'SGM-0001' });
  assert.strictEqual(x.baris('db_Tiang_Sirkuit').filter((b) => b.segmen_id === 'SGM-0001').length, 2);
  assert.strictEqual(x.baris('db_Tiang').filter((b) => b.status_verifikasi === 'TERVERIFIKASI').length, 2);
  assert.strictEqual(r.hasil[2].tiang.revision, 2);
});

test('sinkronTiang: entri gagal tidak membatalkan entri lain; anak tanpa induk terverifikasi ditolak', () => {
  const x = dunia();
  const [t1, t2, t3] = x.jalur();
  const sg = x.segmen().segmenId;
  const r = sinkron(x, [anak(x, t2, t1.tiangId, sg), awal(x, t1, sg), { ...awal(x, t3, sg), opId: 'op-konflik', data: { ...awal(x, t3, sg).data, revision: 99 } }]);
  assert.deepStrictEqual(r.hasil.map((h) => h.ok), [false, true, false]);
  assert.strictEqual(r.hasil[0].galat.kode, 'DATA_TIDAK_VALID');
  assert.strictEqual(r.hasil[2].galat.kode, 'KONFLIK_REVISION');
  assert.strictEqual(x.baris('db_Tiang').filter((b) => b.status_verifikasi === 'TERVERIFIKASI').length, 1);
});

test('sinkronTiang: tiang baru lewat refId; opId diulang = hasil sama tanpa tiang ganda', () => {
  const x = dunia();
  const sg = x.segmen().segmenId;
  const op = { opId: 'op-baru', jenis: 'TIANG', refId: 'LOKAL-t1', data: { statusVerifikasi: 'TERVERIFIKASI', nama: 'PLS0003A', kode: 'PLS', koordinat: '-3, 106.5012', ...x.fisik,
    sirkuit: [x.lengkap(sg, { indukStatus: 'TITIK_AWAL', indukKeterangan: 'Tiang Awal SKTM' })] } };
  const a = sinkron(x, [op]);
  assert.deepStrictEqual([a.hasil[0].ok, a.idBaru['LOKAL-t1']], [true, 'BARU-0001']);
  const b = sinkron(x, [op]);
  assert.deepStrictEqual([b.hasil[0].ok, b.idBaru['LOKAL-t1']], [true, 'BARU-0001']);
  assert.strictEqual(x.baris('db_Tiang').filter((r) => r.nama === 'PLS0003A').length, 1);
});

test('sinkronTiang: tiang yang sama dua kali dalam kelompok ditolak; lebih dari 25 entri = sisanya DITUNDA; bukan Admin ditolak', () => {
  const x = dunia();
  const t1 = x.jalur()[0], sg = x.segmen().segmenId;
  const dua = sinkron(x, [awal(x, t1, sg), awal(x, t1, sg, { opId: 'op-lain' })]);
  assert.deepStrictEqual(dua.hasil.map((h) => h.ok), [true, false]);
  const banyak = sinkron(x, Array.from({ length: 27 }, (_, i) => ({ opId: 'op-seg-' + i, jenis: 'SEGMEN', data: { ...SEG, nama: 'S' + i, awalSwitchingId: x.swc.switchingId } })));
  assert.deepStrictEqual([banyak.hasil.filter((h) => h.ok).length, banyak.hasil.filter((h) => h.galat && h.galat.kode === 'DITUNDA').length], [25, 2]);
  assert.throws(() => x.g.sinkronTiang_({ userId: 'p', role: 'PETUGAS' }, { ops: [] }, 'MOBILE'));
});

test('sinkronTiang: tabel dibaca sekali dan ditulis sekali per kelompok', () => {
  const x = dunia();
  const sg = x.segmen().segmenId, [t1, t2] = x.jalur();
  const sheet = x.sheets.t.db_Tiang;
  let baca = 0, tulis = 0;
  const gr = sheet.getRange.bind(sheet);
  sheet.getRange = (...a) => { const r = gr(...a); const sv = r.setValues && r.setValues.bind(r); if (sv) r.setValues = (v) => { tulis++; return sv(v); }; const gvv = r.getValues.bind(r); r.getValues = () => { baca++; return gvv(); }; return r; };
  sinkron(x, [awal(x, t1, sg), anak(x, t2, t1.tiangId, sg)]);
  assert.strictEqual(tulis, 1, 'db_Tiang ditulis sekali');
  assert.ok(baca <= 3, 'pembacaan db_Tiang tidak berlipat per entri (' + baca + ')');
});

test('sinkronTiang: segmen anak memakai id segmen induk yang baru dibuat dalam kelompok yang sama', () => {
  const x = dunia();
  const r = sinkron(x, [
    { opId: 'op-induk', jenis: 'SEGMEN', refId: 'LOKAL-induk', data: { ...SEG, awalSwitchingId: x.swc.switchingId } },
    { opId: 'op-anak', jenis: 'SEGMEN', refId: 'LOKAL-anak', data: { ...SEG, nama: 'TB0011 - Ujung', awalJenis: 'GARDU', akhirJenis: 'UJUNG', indukSegmenId: 'LOKAL-induk' } }]);
  assert.deepStrictEqual(r.hasil.map((h) => h.ok), [true, true]);
  assert.deepStrictEqual(r.idBaru, { 'LOKAL-induk': 'SGM-0001', 'LOKAL-anak': 'SGM-0002' });
  assert.strictEqual(r.hasil[1].segmen.indukSegmenId, 'SGM-0001');
});
