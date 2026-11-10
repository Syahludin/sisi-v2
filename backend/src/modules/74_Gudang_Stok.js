/**
 * v1.0.57 Gudang Material: logika MURNI stok MCB (tanpa akses sheet), dipakai 75-77_Gudang_*.js.
 * Stok tidak disimpan sebagai angka: saldo sebuah lokasi (GUDANG atau tim_id) = jumlah semua baris db_Material_Mutasi lokasi itu.
 * Jenis MCB = material_id + daya + merk + status_mcb (MCB tidak punya nomor seri).
 */

/** Kunci jenis MCB: 'material_id|daya|merk|status_mcb', spasi ujung dibuang. */
function kunciJenis_(r) {
  return [r.material_id, r.daya, r.merk, r.status_mcb].map(function (v) { return String(v === null || v === undefined ? '' : v).trim(); }).join('|');
}

/** Saldo per jenis untuk [lokasi]. Jenis bersaldo nol tidak ikut. Hasil: { kunciJenis: jumlah }. */
function saldoLokasi_(mutasi, lokasi) {
  var hasil = {};
  mutasi.forEach(function (r) {
    if (String(r.lokasi).trim() !== String(lokasi)) return;
    var k = kunciJenis_(r);
    hasil[k] = (hasil[k] || 0) + Number(r.jumlah || 0);
  });
  Object.keys(hasil).forEach(function (k) { if (hasil[k] === 0) delete hasil[k]; });
  return hasil;
}

/**
 * Bandingkan perkiraan (saldo tim) dengan hitungan petugas, per jenis. Hanya jenis yang berbeda; gabungan kunci kedua sisi,
 * jadi jenis yang ada di perkiraan tetapi tidak diinput sama sekali = KURANG. selisih = input - perkiraan.
 */
function bandingStok_(perkiraan, hitungan) {
  var kunci = {};
  Object.keys(perkiraan).concat(Object.keys(hitungan)).forEach(function (k) { kunci[k] = true; });
  var hasil = [];
  Object.keys(kunci).sort().forEach(function (k) {
    var p = Number(perkiraan[k] || 0), i = Number(hitungan[k] || 0);
    if (p === i) return;
    hasil.push({ kunci: k, perkiraan: p, input: i, selisih: i - p, arah: i < p ? 'KURANG' : 'LEBIH' });
  });
  return hasil;
}

/** '<kodeShift>-MCB.nnn' berikutnya: nomor tertinggi yang ada untuk kode shift itu + 1 (lubang tidak diisi, nomor tidak dipakai ulang). */
function nomorPemakaianBerikut_(kodeShift, nomorAda) {
  var awalan = kodeShift + '-MCB.', maks = 0;
  nomorAda.forEach(function (n) {
    n = String(n);
    if (n.indexOf(awalan) !== 0) return;
    var m = /^(\d+)$/.exec(n.slice(awalan.length));
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return awalan + pad3_(maks + 1);
}

/** Material aktif (punya material_id) yang punya baris izin AKTIF untuk [timId]. Tanpa baris izin = tidak boleh dipakai. */
function materialBolehTim_(materialRows, izinRows, timId) {
  if (!timId) return [];
  var boleh = {};
  izinRows.forEach(function (i) {
    if (isAktif_(i.aktif) && String(i.tim_id) === String(timId)) boleh[String(i.material_id)] = true;
  });
  return materialRows.filter(function (m) { return m.material_id && isAktif_(m.aktif) && boleh[String(m.material_id)]; });
}
