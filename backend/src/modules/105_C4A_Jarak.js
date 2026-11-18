/**
 * C4A (permintaan Master Guswan 15 Nov 2026): jarak Laporan C4A = jarak JALAN (bukan garis lurus), dihitung di server
 * dengan layanan Maps bawaan Apps Script (DirectionFinder) sesudah laporan ditutup, jadi HP boleh offline.
 * Rute: titik awal -> titik temuan (urut waktu input, sebagai titik singgah) -> titik akhir.
 * Gagal (rute tidak ada / kuota) = status_jarak GAGAL, dicoba lagi putaran berikutnya setelah jeda.
 */

var UIW_SINGGAH_MAKS_ = 23;

/** Titik singgah: semua bila <= maks, kalau lebih dipilih merata menurut urutan (pertama + terakhir ikut). */
function pilihSinggahC4A_(titik, maks) {
  if (titik.length <= maks) return titik.slice();
  var hasil = [];
  for (var i = 0; i < maks; i++) hasil.push(titik[Math.round(i * (titik.length - 1) / (maks - 1))]);
  return hasil;
}

/** Temuan laporan ber-koordinat, urut waktu input. */
function titikTemuanC4A_(ctx, c4aId) {
  return ctx.tem.rows.filter(function (t) { return String(t.c4a_id) === String(c4aId) && !kosongUiw_(t.lat) && !kosongUiw_(t.lng); })
    .sort(function (a, b) { return msUiw_(a.timestamp) - msUiw_(b.timestamp); })
    .map(function (t) { return { lat: Number(t.lat), lng: Number(t.lng) }; });
}

/** { jarakKm, metode: RUTE_JALAN | NOL, status: SELESAI | GAGAL, bantu } satu laporan SELESAI. */
function hitungJarakC4A_(lap, ctx) {
  var titik = titikTemuanC4A_(ctx, lap.c4a_id);
  if (!titik.length && String(lap.sumber_akhir) === 'TEMUAN_TERAKHIR') return { jarakKm: 0, metode: 'NOL', status: 'SELESAI', bantu: '' };
  try {
    var f = Maps.newDirectionFinder().setOrigin(Number(lap.lat_awal), Number(lap.lng_awal))
      .setDestination(Number(lap.lat_akhir), Number(lap.lng_akhir)).setMode(Maps.DirectionFinder.Mode.DRIVING);
    pilihSinggahC4A_(titik, UIW_SINGGAH_MAKS_).forEach(function (p) { f.addWaypoint(p.lat, p.lng); });
    var r = f.getDirections();
    if (!r || r.status !== 'OK' || !r.routes || !r.routes.length) return { jarakKm: null, metode: '', status: 'GAGAL', bantu: 'rute: ' + (r && r.status || 'kosong') };
    var meter = r.routes[0].legs.reduce(function (s, l) { return s + (Number(l.distance && l.distance.value) || 0); }, 0);
    return { jarakKm: Math.round(meter) / 1000, metode: 'RUTE_JALAN', status: 'SELESAI', bantu: '' };
  } catch (e) {
    return { jarakKm: null, metode: '', status: 'GAGAL', bantu: 'rute: ' + String(e && e.message || e).slice(0, 200) };
  }
}

/**
 * Isi jarak laporan SELESAI yang status_jarak MENUNGGU, atau GAGAL yang sudah lewat jeda 5 menit (timestamp_update).
 * [batasMs] = batas waktu putaran (Date.now()), lewat = berhenti. Hasil = jumlah laporan diproses.
 * Rute dihitung DI LUAR lock (bisa beberapa detik per laporan); hasil ditulis dalam lock singkat dengan revision lama: admin
 * mengirim titik akhir lagi selama rute dihitung (revision naik) = hasil dibuang, dihitung ulang putaran berikutnya.
 */
function prosesJarakC4A_(ctx, batasMs) {
  var n = 0;
  ctx.lap.rows.forEach(function (r) {
    if (String(r.status) !== 'SELESAI' || (batasMs && Date.now() > batasMs)) return;
    var st = String(r.status_jarak);
    if (st !== 'MENUNGGU' && !(st === 'GAGAL' && Date.now() - msUiw_(r.timestamp_update) >= jedaGagalUiw_(1))) return;
    var h = hitungJarakC4A_(r, ctx);
    var u = { status_jarak: h.status, jarak_km: h.jarakKm === null ? '' : h.jarakKm, metode_jarak: h.metode, diubah_oleh: 'SISTEM' };
    try {
      r.revision = denganLock_(function () { return ubahBaris_(ctx.lap, 'c4a_id', r.c4a_id, u, r.revision); }, 30000);
    } catch (e) {
      if (!e || (e.kode !== 'KONFLIK_REVISION' && e.kode !== 'SERVER_SIBUK')) throw e;
      console.warn('C4A jarak ' + r.kode_c4a + ' ditunda: ' + e.kode);
      return;
    }
    Object.keys(u).forEach(function (k) { r[k] = u[k]; });
    r.timestamp_update = sekarangIso_();
    if (h.bantu) console.warn('C4A jarak ' + r.kode_c4a + ': ' + h.bantu);
    n++;
  });
  return n;
}
