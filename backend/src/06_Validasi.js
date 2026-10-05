/**
 * Validasi berbasis allowlist. Field yang tidak ada di skema DITOLAK.
 *
 * tipe: teks | angka | bool | uuid | tanggal | waktu | koordinat | pilihan
 * opsi: wajib, maks (teks), mentah (teks tanpa trim / tanpa pembersihan, mis. password),
 *       multiBaris + maksBaris (teks boleh baris baru; default teks = satu baris),
 *       pola (RegExp), min, max, bulat (angka), pilihan (array), area (koordinat)
 */
var AREA_BABEL_ = { latMin: -3.6, latMax: -1.3, lngMin: 105.0, lngMax: 109.0 };

function validasi_(data, skema) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SisiError_('DATA_TIDAK_VALID');
  Object.keys(data).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(skema, k)) throw new SisiError_('FIELD_TIDAK_DIKENAL', k);
  });
  var hasil = {};
  Object.keys(skema).forEach(function (k) {
    var aturan = skema[k];
    var v = data[k];
    var kosong = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (kosong) {
      if (aturan.wajib) throw new SisiError_('FIELD_WAJIB', k);
      return;
    }
    hasil[k] = cekTipe_(k, v, aturan);
  });
  return hasil;
}

/**
 * v0.47 (audit 4 Okt 2026): buang karakter kontrol (kecuali baris baru di teks multiBaris) supaya teks petugas
 * tidak bisa menyisip baris palsu ke WA / sheet. Teks satu baris: baris baru & tab jadi spasi.
 */
function bersihTeks_(v, a) {
  var s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F\u2028\u2029]/g, '');
  if (a.multiBaris) {
    s = s.replace(/\t/g, ' ').split('\n').map(function (b) { return b.trim(); }).filter(function (b) { return b; }).join('\n');
  } else {
    s = s.replace(/[\n\t]+/g, ' ').replace(/ {2,}/g, ' ');
  }
  return s.trim();
}

function cekTipe_(k, v, a) {
  switch (a.tipe) {
    case 'teks': {
      if (typeof v !== 'string') throw new SisiError_('TIPE_SALAH', k);
      var s = a.mentah ? v : bersihTeks_(v, a);
      if (s.length > (a.maks || 500)) throw new SisiError_('TERLALU_PANJANG', k);
      if (a.multiBaris && s.split('\n').length > (a.maksBaris || 5)) throw new SisiError_('TERLALU_BANYAK_BARIS', k);
      if (a.pola && !a.pola.test(s)) throw new SisiError_('FORMAT_SALAH', k);
      return s;
    }
    case 'angka': {
      var n = typeof v === 'number' ? v
        : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : NaN);
      if (!isFinite(n)) throw new SisiError_('TIPE_SALAH', k);
      if (a.bulat && Math.floor(n) !== n) throw new SisiError_('HARUS_BULAT', k);
      if (a.min !== undefined && n < a.min) throw new SisiError_('DI_LUAR_RENTANG', k);
      if (a.max !== undefined && n > a.max) throw new SisiError_('DI_LUAR_RENTANG', k);
      return n;
    }
    case 'bool':
      if (typeof v !== 'boolean') throw new SisiError_('TIPE_SALAH', k);
      return v;
    case 'uuid':
      if (typeof v !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
        throw new SisiError_('FORMAT_SALAH', k);
      }
      return v.toLowerCase();
    case 'tanggal': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new SisiError_('FORMAT_SALAH', k);
      var d = new Date(v + 'T00:00:00Z');
      if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new SisiError_('FORMAT_SALAH', k);
      return v;
    }
    case 'waktu': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v)) throw new SisiError_('FORMAT_SALAH', k);
      var w = new Date(v);
      if (isNaN(w.getTime())) throw new SisiError_('FORMAT_SALAH', k);
      return w.toISOString();
    }
    case 'koordinat':
      return parseKoordinat_(k, v, a.area || AREA_BABEL_);
    case 'pilihan':
      if (a.pilihan.indexOf(v) === -1) throw new SisiError_('PILIHAN_TIDAK_VALID', k);
      return v;
    default:
      throw new SisiError_('SKEMA_TIDAK_VALID', k);
  }
}

/**
 * Terima "lat, lng". Disimpan SEKALI (lat & lng diturunkan dari sini),
 * supaya tidak ada lagi kolom koordinat vs kolom longitude yang beda.
 */
function parseKoordinat_(k, v, area) {
  if (typeof v !== 'string') throw new SisiError_('TIPE_SALAH', k);
  var m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(v);
  if (!m) throw new SisiError_('FORMAT_SALAH', k);
  var lat = Number(m[1]), lng = Number(m[2]);
  if (lat < area.latMin || lat > area.latMax || lng < area.lngMin || lng > area.lngMax) {
    throw new SisiError_('KOORDINAT_DI_LUAR_AREA', k);
  }
  return { teks: lat.toFixed(6) + ', ' + lng.toFixed(6), lat: lat, lng: lng };
}
