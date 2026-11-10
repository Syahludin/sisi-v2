/**
 * Modul ROW v2.
 * Kode berantai dibuat di HP (satu sub-tim = satu penulis); server hanya WASIT:
 * cek format, cek kecocokan sub-tim/tanggal/induk, cek keunikan.
 *
 * Header : R<kode sub-tim 2>-<KODE_ULP 5><YYMMDD><urut 3>   contoh R03-16130261002001
 * PNY    : <header>-PNY.<urut 3>
 * EKS    : <pny>-EKS.<urut 3>
 */
function kodeHeaderRow_(kodeSubTim, kodeUlp, tanggalIso, urut) {
  return 'R' + pad2_(kodeSubTim) + '-' + kodeUlp + tanggalIso.slice(2, 4) + tanggalIso.slice(5, 7) +
         tanggalIso.slice(8, 10) + pad3_(urut);
}

function parseKodeHeaderRow_(kode) {
  var m = /^R(\d{2})-(\d{5})(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(String(kode || ''));
  if (!m) return null;
  return { subTim: m[1], kodeUlp: m[2], tanggal: '20' + m[3] + '-' + m[4] + '-' + m[5], urut: Number(m[6]) };
}

/** Lempar KODE_TIDAK_VALID kalau kode tidak sesuai sesi/tanggal. */
function cekKodeHeaderRow_(kode, harapan) {
  var p = parseKodeHeaderRow_(kode);
  if (!p) throw new SisiError_('KODE_TIDAK_VALID', 'format');
  if (p.urut < 1) throw new SisiError_('KODE_TIDAK_VALID', 'urut');
  if (p.subTim !== pad2_(harapan.subTim)) throw new SisiError_('KODE_TIDAK_VALID', 'sub-tim');
  if (p.kodeUlp !== harapan.kodeUlp) throw new SisiError_('KODE_TIDAK_VALID', 'ulp');
  if (p.tanggal !== harapan.tanggal) throw new SisiError_('KODE_TIDAK_VALID', 'tanggal');
  return p;
}

function kodeAnak_(kodeInduk, jenis, urut) { return kodeInduk + '-' + jenis + '.' + pad3_(urut); }

function parseKodeAnak_(kode, jenis) {
  var m = new RegExp('^(.+)-' + jenis + '\\.(\\d{3})$').exec(String(kode || ''));
  if (!m || Number(m[2]) < 1) return null;
  return { induk: m[1], urut: Number(m[2]) };
}

/**
 * Diameter -> jenis pekerjaan, dari db_Jenis_Pekerjaan (modul ROW). Keputusan 2 Okt 2026:
 *   Rabas / Pangkas = 0, Tebang Sedang = 25-50, Tebang Besar = 51 ke atas (cm, bilangan bulat).
 * diameter_min dan diameter_max sama-sama INKLUSIF; kosong = tanpa batas di sisi itu.
 * Diameter wajib bilangan bulat 0-1000. Tidak cocok kategori mana pun (mis. 1-24) = ditolak.
 * Lebih dari satu cocok = konfigurasi master salah.
 */
function klasifikasiJenis_(diameter, daftarJenis) {
  if (typeof diameter !== 'number' || !Number.isInteger(diameter) || diameter < 0 || diameter > 1000) {
    throw new SisiError_('DIAMETER_TIDAK_VALID', String(diameter));
  }
  var n = function (v) { return v === '' || v === null || v === undefined ? null : Number(v); };
  var cocok = daftarJenis.filter(function (j) {
    if (!isAktif_(j.aktif) || j.modul !== 'ROW') return false;
    var min = n(j.diameter_min), max = n(j.diameter_max);
    if (min === null && max === null) return false;
    return (min === null || diameter >= min) && (max === null || diameter <= max);
  });
  if (cocok.length > 1) throw new SisiError_('JENIS_AMBIGU', String(diameter));
  if (!cocok.length) throw new SisiError_('DIAMETER_DI_LUAR_KATEGORI', String(diameter));
  return cocok[0];
}

/**
 * v0.62.4 (audit 6 Okt 2026): tulis / ambil kode ROW hanya untuk PETUGAS tim ROW. Dulu cuma dicek jenis tim, jadi
 * akun ADMIN / ADMIN_ES / SUPER yang tim_id-nya diisi tim ROW bisa syncRow / uploadFotoRow / getKodeRow atas nama tim itu.
 */
function wajibPetugasRow_(sesi) {
  if (!sesi || sesi.role !== 'PETUGAS' || sesi.jenisTim !== 'ROW' || !sesi.timId) throw new SisiError_('AKSES_DITOLAK', 'bukan petugas ROW');
}
