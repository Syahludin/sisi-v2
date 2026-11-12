/**
 * sinkronTiang (v1.0.71, rancangan docs/superpowers/specs/2026-11-10-antrean-tiang-lokal-design.md): HP menyimpan perubahan tiang /
 * segmen di antrean lokal lalu mengirim banyak entri sekaligus. Server memakai ulang simpanSegmen_ / simpanVerifikasiTiang_ (aturan
 * validasi satu versi) di dalam SATU lock; tabel SiSi_Tiang dibaca sekali ke memori (tabelTiangSisi_), perubahan ditulis sekali per
 * tabel di akhir (tulisBlokTunda_ -> tulisBlok_) dan baris audit ditulis sekali.
 */

var SINKRON_MAKS_ENTRI_ = 25;
var SINKRON_MAKS_MS_ = 4 * 60 * 1000;
var SINKRON_CACHE_DETIK_ = 6 * 60 * 60;
var SINKRON_POLA_OPID_ = /^[0-9A-Za-z._:-]{6,64}$/;
var SINKRON_POLA_SEMENTARA_ = /^LOKAL-[0-9A-Za-z-]{1,60}$/;

/** Bukan null = sedang sinkronTiang: { tabel: {nama: tabel}, tunda: {nama: {t, ubah: {baris: {r, u, asli, revisiAsal}}, baru: []}} }. */
var TIANG_BATCH_ = null;

/** Versi tulisBlok_ untuk kelompok: validasi kolom sekarang, memori diperbarui sekarang, tulis ke sheet saat sinkronSelesai_. */
function tulisBlokTunda_(t, ubah, baru, opsi) {
  var bolehId = (opsi && opsi.bolehId) || [], idxRev = t.header.indexOf('revision'), b = t.batch;
  ubah = (ubah || []).map(function (x) { return { r: x.r, u: capWaktuUbah_(t, x.u) }; });
  baru = baru || [];
  var item = b.tunda[t.nama] = b.tunda[t.nama] || { t: t, ubah: {}, baru: [] };
  ubah.forEach(function (x) {
    if (!x.r || !x.r._baris || x.r._baris < 2 || x.r._baris > t.akhirAsal) throw new SisiError_('DATA_TIDAK_DITEMUKAN', t.nama);
    if (item.ubah[x.r._baris]) throw new SisiError_('DATA_TIDAK_VALID', 'baris sama diubah dua kali dalam satu kelompok');
    Object.keys(x.u).forEach(function (k) {
      if (t.header.indexOf(k) === -1) throw new SisiError_('KOLOM_TIDAK_ADA', k);
      if (k === 'revision' || (/_id$/.test(k) && bolehId.indexOf(k) === -1)) throw new SisiError_('KOLOM_TERKUNCI', k);
    });
  });
  ubah.forEach(function (x) {
    var asli = {};
    Object.keys(x.u).forEach(function (k) { asli[k] = x.r[k]; x.r[k] = x.u[k]; });
    var revisiAsal = Number(x.r.revision) || 0;
    if (idxRev !== -1) x.r.revision = revisiAsal + 1;
    item.ubah[x.r._baris] = { r: x.r, u: x.u, asli: asli, revisiAsal: revisiAsal, opsi: opsi };
  });
  baru.forEach(function (o) {
    t.akhirMemori++;
    o._baris = t.akhirMemori;
    item.baru.push({ o: o, opsi: opsi });
    t.rows.push(o);
  });
}

/** Tulis semua perubahan tertunda: satu tulisBlok_ per tabel, lalu baris audit sekaligus. */
function sinkronSelesai_(b, audit) {
  Object.keys(b.tunda).forEach(function (nama) {
    var item = b.tunda[nama], t = item.t, ubah = [], opsi = {};
    Object.keys(item.ubah).forEach(function (k) {
      var x = item.ubah[k];
      Object.keys(x.asli).forEach(function (kol) { x.r[kol] = x.asli[kol]; }); // tulisBlok_ menaikkan revision & menerapkan ulang dari keadaan asli
      x.r.revision = x.revisiAsal;
      ubah.push({ r: x.r, u: x.u });
      if (x.opsi && x.opsi.bolehId) opsi.bolehId = (opsi.bolehId || []).concat(x.opsi.bolehId);
    });
    item.baru.forEach(function (x) { if (x.opsi && x.opsi.bolehId) opsi.bolehId = (opsi.bolehId || []).concat(x.opsi.bolehId); });
    var baru = item.baru.map(function (x) { return x.o; });
    t.batch = null;
    t.rows = t.rows.filter(function (r) { return baru.indexOf(r) === -1; }); // tulisBlok_ memberi _baris; memori tidak dilihat lagi sesudah ini
    tulisBlok_(t, ubah, baru, opsi);
  });
  if (audit.length) tambahBanyak_(audit[0].t, audit.map(function (x) { return x.o; }));
}

/** Ganti id sementara (LOKAL-...) yang sudah dipetakan; yang belum dipetakan -> DATA_TIDAK_DITEMUKAN. */
function gantiIdSementara_(data, peta) {
  function ganti(nilai, nama) {
    if (typeof nilai !== 'string' || !SINKRON_POLA_SEMENTARA_.test(nilai)) return nilai;
    if (!peta[nilai]) throw new SisiError_('DATA_TIDAK_DITEMUKAN', nama + ' belum diterima server');
    return peta[nilai];
  }
  var d = Object.assign({}, data);
  ['tiangId', 'indukSegmenId'].forEach(function (k) { if (d[k] !== undefined) d[k] = ganti(d[k], k); });
  if (Array.isArray(d.sirkuit)) {
    d.sirkuit = d.sirkuit.map(function (s) {
      if (!s || typeof s !== 'object') return s;
      var o = Object.assign({}, s);
      ['segmenId', 'indukTiangId'].forEach(function (k) { if (o[k] !== undefined) o[k] = ganti(o[k], k); });
      return o;
    });
  }
  return d;
}

function hasilGalat_(opId, e) {
  var kode = e instanceof SisiError_ ? e.kode : 'KESALAHAN_SERVER';
  if (!(e instanceof SisiError_)) console.error('sinkronTiang ' + opId + ': ' + e);
  return { opId: opId, ok: false, galat: { kode: kode, info: e instanceof SisiError_ ? e.detail : '' } };
}

/**
 * sinkronTiang { ops: [{ opId, jenis: SEGMEN | TIANG, refId?, data }] } -> { hasil: [{ opId, ok, tiang | segmen | galat: { kode, info } }],
 * idBaru: { id-sementara: id-server } }. Entri diproses berurutan; yang gagal tidak mengubah apa pun dan tidak membatalkan yang lain.
 * refId = id sementara HP untuk segmen / tiang baru. Lebih dari 25 entri atau lewat ±4 menit = sisanya DITUNDA (HP mengirim lagi).
 * opId yang pernah berhasil (6 jam) dijawab dari simpanan tanpa menulis lagi.
 */
function sinkronTiang_(sesi, data, platform) {
  wajibAdminTiang_(sesi);
  if (!data || !Array.isArray(data.ops)) throw new SisiError_('TIPE_SALAH', 'ops');
  if (data.ops.length > 200) throw new SisiError_('TERLALU_BANYAK', 'ops');
  wajibKonfigTiang_();
  var cache = CacheService.getScriptCache(), mulai = Date.now(), hasil = [], idBaru = {}, dipakai = {}, proses = 0;
  return denganLock_(function () {
    TIANG_BATCH_ = { tabel: {}, tunda: {} };
    AUDIT_TUNDA_ = [];
    var b = TIANG_BATCH_, audit = AUDIT_TUNDA_, simpanCache = [];
    try {
      data.ops.forEach(function (op) {
        var opId = op && typeof op.opId === 'string' ? op.opId : '';
        try {
          if (!SINKRON_POLA_OPID_.test(opId)) throw new SisiError_('DATA_TIDAK_VALID', 'opId');
          if (!op.data || typeof op.data !== 'object' || Array.isArray(op.data)) throw new SisiError_('DATA_TIDAK_VALID', 'data');
          if (['SEGMEN', 'TIANG'].indexOf(op.jenis) === -1) throw new SisiError_('PILIHAN_TIDAK_VALID', 'jenis');
          if (op.refId !== undefined && !SINKRON_POLA_SEMENTARA_.test(String(op.refId))) throw new SisiError_('DATA_TIDAK_VALID', 'refId');
          var lama = cache.get('sinkronTiang:' + opId);
          if (lama) {
            var s = JSON.parse(lama);
            Object.keys(s.idBaru || {}).forEach(function (k) { idBaru[k] = s.idBaru[k]; });
            hasil.push(s.hasil);
            return;
          }
          if (proses >= SINKRON_MAKS_ENTRI_ || Date.now() - mulai > SINKRON_MAKS_MS_) throw new SisiError_('DITUNDA');
          var d = gantiIdSementara_(op.data, idBaru);
          var kunci = d.tiangId ? 'T:' + d.tiangId : d.segmenId ? 'S:' + d.segmenId : '';
          if (kunci && dipakai[op.jenis[0] + kunci]) throw new SisiError_('DATA_TIDAK_VALID', 'sama dua kali dalam satu kelompok');
          proses++;
          var r = op.jenis === 'SEGMEN' ? simpanSegmen_(sesi, d, platform) : simpanVerifikasiTiang_(sesi, d, platform);
          if (kunci) dipakai[op.jenis[0] + kunci] = true;
          var entri = { opId: opId, ok: true }, peta = {};
          if (op.jenis === 'SEGMEN') entri.segmen = r.segmen;
          else {
            entri.tiang = r.tiang;
            entri.selisihM = r.selisihM;
          }
          var idServer = op.jenis === 'SEGMEN' ? r.segmen.segmenId : r.tiang.tiangId;
          if (op.refId && !d.tiangId && !d.segmenId) {
            idBaru[op.refId] = idServer;
            peta[op.refId] = idServer;
          }
          hasil.push(entri);
          simpanCache.push([opId, JSON.stringify({ hasil: entri, idBaru: peta })]);
        } catch (e) {
          hasil.push(hasilGalat_(opId, e));
        }
      });
      sinkronSelesai_(b, audit);
    } finally {
      TIANG_BATCH_ = null;
      AUDIT_TUNDA_ = null;
    }
    // simpanan hanya sesudah tulis berhasil; gagal simpan cache tidak menggagalkan kelompok
    simpanCache.forEach(function (x) { try { cache.put('sinkronTiang:' + x[0], x[1], SINKRON_CACHE_DETIK_); } catch (e) { console.warn('cache sinkronTiang: ' + e); } });
    return { hasil: hasil, idBaru: idBaru };
  });
}
