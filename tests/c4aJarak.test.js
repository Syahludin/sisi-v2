/** C4A: jarak jalan Maps (permintaan Master Guswan 15 Nov 2026). */
const test = require('node:test');
const assert = require('node:assert');
const { j } = require('./gudangUji');
const { duniaC4A, pasangMaps, rute } = require('./duniaC4A');

test('pilih singgah: <= maks = semua; 30 titik -> 23 merata, pertama dan terakhir ikut', () => {
  const x = duniaC4A();
  const t = Array.from({ length: 30 }, (_, i) => ({ lat: i, lng: i }));
  assert.strictEqual(x.h.pilihSinggahC4A_(t.slice(0, 5), 23).length, 5);
  const p = j(x.h.pilihSinggahC4A_(t, 23));
  assert.strictEqual(p.length, 23);
  assert.deepStrictEqual([p[0].lat, p[22].lat], [0, 29]);
  assert.strictEqual(new Set(p.map((q) => q.lat)).size, 23, 'tanpa titik kembar');
});

test('jarak: jumlah legs (1200 m + 800 m = 2 km), temuan jadi titik singgah urut waktu, mode DRIVING', () => {
  const x = duniaC4A();
  pasangMaps(x, rute(1200, 800));
  const a = x.buka();
  x.temuan(a.c4aId, { koordinat: '-3.0300, 106.5300' });
  x.jam.ms += 60e3;
  x.temuan(a.c4aId, { koordinat: '-3.0400, 106.5400' });
  x.tutup(a.c4aId);
  const ctx = x.h.bacaKonteksUiw_();
  const h = j(x.h.hitungJarakC4A_(ctx.lapBy[a.c4aId], ctx));
  assert.deepStrictEqual(h, { jarakKm: 2, metode: 'RUTE_JALAN', status: 'SELESAI', bantu: '' });
  assert.deepStrictEqual(j(x.maps[0]), { asal: [-3.01, 106.5], tujuan: [-3.02, 106.51], singgah: [[-3.03, 106.53], [-3.04, 106.54]], mode: 'driving' });
});

test('proses jarak: laporan SELESAI MENUNGGU diisi + antrean KMS; ZERO_RESULTS = GAGAL lalu dicoba lagi setelah jeda', () => {
  const x = duniaC4A();
  let jawab = { status: 'ZERO_RESULTS', routes: [] };
  pasangMaps(x, () => jawab);
  const a = x.buka();
  x.tutup(a.c4aId);
  assert.strictEqual(x.h.prosesJarakC4A_(x.h.bacaKonteksUiw_()), 1);
  let r = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([r.status_jarak, r.jarak_km], ['GAGAL', '']);
  assert.strictEqual(x.h.prosesJarakC4A_(x.h.bacaKonteksUiw_()), 0, 'belum lewat jeda 5 menit');
  jawab = rute(1500);
  x.jam.ms += 6 * 60e3;
  assert.strictEqual(x.h.prosesJarakC4A_(x.h.bacaKonteksUiw_()), 1);
  r = x.baris('c4a_laporan')[0];
  assert.deepStrictEqual([r.status_jarak, r.jarak_km, r.metode_jarak], ['SELESAI', 1.5, 'RUTE_JALAN']);
  assert.strictEqual(x.maps.length, 2);
});

test('jarak: laporan TERBUKA / jarak NOL tidak memanggil Maps', () => {
  const x = duniaC4A();
  pasangMaps(x, rute(1000));
  x.buka();
  const b = x.buka({}, x.admin2);
  x.jam.ms += 864e5;
  x.h.tutupOtomatisC4A_();   // admin2 tanpa temuan = NOL
  x.buka({}, x.admin2);      // laporan baru TERBUKA
  assert.strictEqual(x.h.prosesJarakC4A_(x.h.bacaKonteksUiw_()), 0);
  assert.strictEqual(x.maps.length, 0);
  assert.strictEqual(x.baris('c4a_laporan').find((r) => r.c4a_id === b.c4aId).metode_jarak, 'NOL');
});
