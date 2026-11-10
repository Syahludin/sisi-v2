import '../switching/switching_model.dart' show JaringanSwitching, jarakMeter;

/// Verifikasi Tiang + Segmen (menu OPS_VERIFIKASI_TIANG, ADMIN / SUPER): model + logika murni (diuji di test/tiang_test.dart).
/// Data: getVerifikasiTiang (jalur + pilihan isian), getTiangJalur (tiang satu kode jalur), getSegmen.

String _t(Object? v) => v == null ? '' : '$v'.trim();
double? _n(Object? v) => v is num ? v.toDouble() : double.tryParse(_t(v));
List<Map<String, dynamic>> _daftar(Object? v) => [for (final x in (v as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];

/// Status verifikasi: label + kelas warna ('ok' hijau, 'proses' kuning, 'hilang' abu, 'belum' merah).
(String, String) infoStatusTiang(String s) => switch (s) {
      'TERVERIFIKASI' => ('Terverifikasi', 'ok'),
      'PERLU_PERBAIKAN' => ('Perlu Perbaikan', 'proses'),
      'TIDAK_DITEMUKAN' => ('Tidak Ditemukan', 'hilang'),
      'PERLU_DILENGKAPI' => ('Perlu Dilengkapi', 'proses'),
      _ => ('Belum', 'belum'),
    };

const statusTiang = [('TERVERIFIKASI', 'Terverifikasi'), ('PERLU_PERBAIKAN', 'Perlu Perbaikan'), ('TIDAK_DITEMUKAN', 'Tidak Ditemukan')];
const jenisTiang = ['BETON', 'BESI', 'KAYU'];
/// Cadangan bila db_Ukuran_Tiang belum diisi admin; daftar utama dari sheet (PilihanTiang.ukuran).
const ukuranTiang = [
  '9 Meter 100 daN',
  '9 Meter 200 daN',
  '11 Meter 200 daN',
  '11 Meter 350 daN',
  '12 Meter 200 daN',
  '12 Meter 350 daN',
  '13 Meter 350 daN',
  '14 Meter 350 daN'
];
/// Keterangan bawaan (boleh diubah admin) untuk Tiang Awal SKTM dan sirkuit tanpa switching hulu.
const ketTitikAwal = 'Tiang Awal SKTM', ketTanpaSwitching = 'Tidak ada switching';
const posisiSirkuit = [('KIRI', 'Kiri'), ('KANAN', 'Kanan'), ('ATAS', 'Atas'), ('BAWAH', 'Bawah'), ('TENGAH', 'Tengah')];
const peranTitik = [('biasa', 'Biasa'), ('switching', 'Switching'), ('gardu', 'Gardu'), ('percabangan', 'Percabangan'), ('ujung', 'Ujung')];
const jenisKabel = ['AAAC', 'AAACS', 'MVTIC', 'XLPE', 'A3CS'];
const ukuranKabel = [35, 50, 70, 95, 120, 150, 240];
const slotFotoTiang = [('TIANG', 'Tiang Utuh'), ('KEPALA', 'Kepala Tiang')];

class Sirkuit {
  Sirkuit(this.d);
  final Map<String, dynamic> d;
  String teks(String k) => _t(d[k]);
  double? angka(String k) => _n(d[k]);
  String get id => teks('sirkuitId');
  String get induk => teks('indukTiangId');
}

class Tiang {
  Tiang(this.d) : sirkuit = [for (final s in _daftar(d['sirkuit'])) Sirkuit(s)];
  final Map<String, dynamic> d;
  final List<Sirkuit> sirkuit;

  String teks(String k) => _t(d[k]);
  String get id => teks('tiangId');
  String get nama => teks('nama');
  String get status => teks('statusVerifikasi').isEmpty ? 'BELUM' : teks('statusVerifikasi');
  int get revision => (d['revision'] as num?)?.toInt() ?? 0;

  /// Kekurangan data tiang berstatus Terverifikasi; server yang menghitung (kurangLengkapTiang_), kosong = lengkap.
  List<String> get kurang => [for (final x in (d['kurang'] as List? ?? const [])) _t(x)].where((x) => x.isNotEmpty).toList();

  /// Hijau hanya bila Terverifikasi dan datanya lengkap; Terverifikasi tetapi kurang = Perlu Dilengkapi.
  String get statusTampil => status == 'TERVERIFIKASI' && kurang.isNotEmpty ? 'PERLU_DILENGKAPI' : status;
  bool get selesai => statusTampil == 'TERVERIFIKASI' || status == 'TIDAK_DITEMUKAN';

  /// Salinan setelah foto [slots] terkirim: kekurangan foto itu gugur tanpa menunggu server (foto dikirim sesudah simpan).
  Tiang denganFoto(Set<String> slots) {
    if (slots.isEmpty) return this;
    final label = {for (final (slot, nama) in slotFotoTiang) slot: 'Foto $nama'};
    return Tiang({
      ...d,
      'foto': {...(d['foto'] is Map ? d['foto'] as Map : const {}), for (final s in slots) s: true},
      if (d['kurang'] is List) 'kurang': [for (final k in kurang) if (!slots.any((s) => label[s] == k)) k],
      'sirkuit': [for (final s in sirkuit) s.d],
    });
  }
  double? get lat => _n(d['lat']);
  double? get lng => _n(d['lng']);
  double? get latAset => _n(d['latAset']);
  double? get lngAset => _n(d['lngAset']);
  bool get adaTitik => lat != null && lng != null;
  bool get bertanda => teks('tandaCek').isNotEmpty || sirkuit.any((s) => s.teks('tandaCekGawang').isNotEmpty);
  List<String> get tanda =>
      {...teks('tandaCek').split('|'), for (final s in sirkuit) ...s.teks('tandaCekGawang').split('|')}.where((x) => x.isNotEmpty).toList();
  String get induk => sirkuit.isEmpty ? '' : sirkuit.first.induk;
  bool adaFoto(String slot) => (d['foto'] is Map) && (d['foto'] as Map)[slot] == true;
  Map<String, dynamic> get json => {
        ...d,
        'sirkuit': [for (final s in sirkuit) s.d]
      };
}

/// Label tanda cek untuk petugas.
String labelTanda(String k) => switch (k) {
      'koordinat_kosong' => 'Koordinat kosong',
      'kemungkinan_double_feeder' => 'Kemungkinan double feeder',
      'nama_ganda' => 'Nama ganda',
      'nama_tidak_baku' => 'Nama tidak baku',
      'status_invalid' => 'Status INVALID',
      'tanpa_induk' => 'Tanpa induk',
      'jauh' => 'Gawang > 5 km',
      'gawang_panjang' => 'Gawang panjang',
      'gawang_pendek' => 'Gawang pendek',
      'gawang_tak_terhitung' => 'Gawang tak terhitung',
      'zigzag' => 'Zig-zag',
      _ => k,
    };

class Jalur {
  Jalur(Map<String, dynamic> d)
      : kode = _t(d['kode']),
        jumlah = (d['jumlah'] as num?)?.toInt() ?? 0,
        terverifikasi = (d['terverifikasi'] as num?)?.toInt() ?? 0,
        perluDilengkapi = (d['perluDilengkapi'] as num?)?.toInt() ?? 0,
        perluPerbaikan = (d['perluPerbaikan'] as num?)?.toInt() ?? 0,
        tidakDitemukan = (d['tidakDitemukan'] as num?)?.toInt() ?? 0,
        bertanda = (d['bertanda'] as num?)?.toInt() ?? 0;
  final String kode;
  final int jumlah, terverifikasi, perluDilengkapi, perluPerbaikan, tidakDitemukan, bertanda;
  int get selesai => terverifikasi + tidakDitemukan;
  int get persen => jumlah == 0 ? 0 : (selesai * 100 / jumlah).round();
}

class PilihanTiang {
  PilihanTiang(this.jalur, this.konstruksi, this.jaringan, this.segmen, this.switching, [this.ukuran = const []]);
  final List<Jalur> jalur;
  final List<(String, String)> konstruksi; // (konstruksiId, kode)
  final List<String> ukuran; // nama dari db_Ukuran_Tiang; kosong = pakai ukuranTiang bawaan
  final List<JaringanSwitching> jaringan;
  final List<Map<String, dynamic>> segmen; // {segmenId, nama, penyulang, sectionId}
  final List<Map<String, dynamic>> switching; // {switchingId, jenis, nama, penyulang}

  factory PilihanTiang.dariJson(Map<String, dynamic> j) => PilihanTiang(
        [for (final x in _daftar(j['jalur'])) Jalur(x)],
        [for (final x in _daftar(j['konstruksi'])) (_t(x['konstruksiId']), _t(x['kode']))],
        [for (final x in _daftar(j['jaringan'])) JaringanSwitching(_t(x['sectionId']), _t(x['penyulang']), _t(x['section']))],
        _daftar(j['segmen']),
        _daftar(j['switching']),
        [for (final x in (j['ukuran'] is List ? j['ukuran'] as List : const [])) _t(x)].where((x) => x.isNotEmpty).toList(),
      );

  List<String> get pilihanUkuran => ukuran.isEmpty ? ukuranTiang : ukuran;

  List<String> get penyulang => ({
        for (final x in jaringan)
          if (x.penyulang.isNotEmpty) x.penyulang
      }.toList()
        ..sort());
  List<JaringanSwitching> sectionDari(String p) => [
        for (final x in jaringan)
          if (x.penyulang == p) x
      ];
  List<Map<String, dynamic>> segmenDari(String p, String sectionId) => [
        for (final s in segmen)
          if (_t(s['penyulang']) == p && (sectionId.isEmpty || _t(s['sectionId']) == sectionId)) s
      ];
  List<Map<String, dynamic>> switchingDari(String p) => [
        for (final s in switching)
          if (p.isEmpty || _t(s['penyulang']) == p) s
      ];
  int get totalTiang => jalur.fold(0, (a, j) => a + j.jumlah);
  int get totalSelesai => jalur.fold(0, (a, j) => a + j.selesai);
}

int _segmenNama(Tiang t) => '.'.allMatches(t.nama).length;

/// Baris daftar jalur: tiang + kedalaman cabang (0 = jalur utama) + awal cabang.
typedef BarisJalur = ({Tiang tiang, int dalam, bool cabang});

/// Urutan berjalan sepanjang jalur: mulai dari tiang tanpa induk (atau induknya di luar jalur ini), lalu anak-anaknya (urut nama);
/// jalur utama (anak pertama) diteruskan di kedalaman yang sama, cabang lain masuk satu tingkat. Putaran data aman (dikunjungi sekali).
List<BarisJalur> urutanJalur(List<Tiang> tiang) {
  final ada = {for (final t in tiang) t.id: t};
  final anak = <String, List<Tiang>>{};
  for (final t in tiang) {
    if (t.induk.isNotEmpty && ada.containsKey(t.induk)) (anak[t.induk] ??= []).add(t);
  }
  for (final l in anak.values) {
    // lanjutan jalur yang sama (segmen nama paling sedikit, mis. PLS0003) dulu, cabang (PLS0002.C0001) sesudahnya
    l.sort((a, b) => _segmenNama(a).compareTo(_segmenNama(b)) != 0 ? _segmenNama(a).compareTo(_segmenNama(b)) : a.nama.compareTo(b.nama));
  }
  final akar = [
    for (final t in tiang)
      if (t.induk.isEmpty || !ada.containsKey(t.induk)) t
  ]..sort((a, b) => a.nama.compareTo(b.nama));
  final hasil = <BarisJalur>[], lihat = <String>{};
  void jalan(Tiang mulai, int dalam, bool cabang) {
    Tiang? t = mulai;
    var awal = cabang;
    while (t != null && lihat.add(t.id)) {
      hasil.add((tiang: t, dalam: dalam, cabang: awal));
      awal = false;
      final k = anak[t.id] ?? const <Tiang>[];
      for (final c in k.skip(1)) {
        jalan(c, dalam + 1, true);
      }
      t = k.isEmpty ? null : k.first;
    }
  }

  for (final a in akar) {
    jalan(a, 0, false);
  }
  for (final t in tiang) {
    if (!lihat.contains(t.id)) jalan(t, 0, false); // sisa (putaran data)
  }
  return hasil;
}

/// Tiang berikutnya yang belum selesai sesudah [id] dalam urutan jalur (null = semua selesai).
Tiang? berikutnya(List<BarisJalur> urut, String id) {
  final i = urut.indexWhere((b) => b.tiang.id == id);
  for (var k = i + 1; k < urut.length; k++) {
    if (!urut[k].tiang.selesai) return urut[k].tiang;
  }
  return null;
}

/// Selisih maksimum (m) koordinat GPS dari koordinat terdaftar tanpa harus memilih koordinat mana yang dipakai (server: TIANG_TOLERANSI_M_).
const toleransiKoordinatM = 10;

/// Selisih (m) koordinat lapangan dari koordinat aset; null bila salah satunya kosong.
double? selisihAset(Tiang t, double? lat, double? lng) =>
    t.latAset == null || t.lngAset == null || lat == null || lng == null ? null : jarakMeter(t.latAset!, t.lngAset!, lat, lng);

final _polaKoord = RegExp(r'^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$');
(double, double)? uraiKoordinat(String s) {
  final m = _polaKoord.firstMatch(s);
  return m == null ? null : (double.parse(m.group(1)!), double.parse(m.group(2)!));
}

const _kolomSirkuit = [
  'penyulang',
  'posisi',
  'sectionId',
  'segmenId',
  'indukTiangId',
  'peranTitik',
  'switchingId',
  'switchingDiTiang',
  'jenisKabel',
  'indukStatus',
  'indukKeterangan',
  'switchingKeterangan'
];

/// Isian satu sirkuit di form.
class IsianSirkuit {
  IsianSirkuit({this.id = ''});
  String id;
  final Map<String, String> t = {for (final k in _kolomSirkuit) k: ''};
  num? ukuranMm2;

  /// Induk usulan (hasil migrasi ITB atau tiang sebelumnya): memilih induk lain = Diganti, tetap = harus ditekan Induk Benar.
  String indukAsli = '';

  factory IsianSirkuit.dari(Sirkuit s) {
    final i = IsianSirkuit(id: s.id);
    i.indukAsli = s.induk;
    for (final k in _kolomSirkuit) {
      i.t[k] = s.teks(k);
    }
    i.ukuranMm2 = s.angka('ukuranMm2');
    return i;
  }

  /// Salinan isian (tanpa ID) untuk sirkuit lain / tiang berikutnya; induk dan switching di tiang tidak ikut.
  IsianSirkuit salin({String induk = ''}) {
    final i = IsianSirkuit()..ukuranMm2 = ukuranMm2;
    i.t.addAll(t);
    i.t['indukTiangId'] = induk;
    i.indukAsli = induk;
    i.t['indukStatus'] = '';
    i.t['indukKeterangan'] = '';
    i.t['switchingDiTiang'] = '';
    return i;
  }

  /// Pilih induk tiang: sama dengan usulan = belum dikonfirmasi (tekan Induk Benar), beda = Diganti.
  void pilihInduk(String v) {
    t['indukTiangId'] = v;
    t['indukKeterangan'] = '';
    t['indukStatus'] = v.isEmpty || v == indukAsli ? '' : 'DIGANTI';
  }

  /// Tiang Awal SKTM: tanpa induk tiang, keterangan wajib (diisi bawaan, boleh diubah).
  void jadikanTiangAwal() {
    t['indukTiangId'] = '';
    t['indukStatus'] = 'TITIK_AWAL';
    if (t['indukKeterangan']!.trim().isEmpty) t['indukKeterangan'] = ketTitikAwal;
  }

  /// Switching hulu dipilih, atau keterangan tanpa switching (bawaan, boleh diubah).
  void pilihSwitching(String v) {
    t['switchingId'] = v;
    if (v.isNotEmpty) {
      t['switchingKeterangan'] = '';
    } else if (t['switchingKeterangan']!.trim().isEmpty) {
      t['switchingKeterangan'] = ketTanpaSwitching;
    }
  }

  /// Kekurangan sirkuit ini untuk status Terverifikasi (cermin kurangLengkapTiang_ di server); awalan "Sirkuit n: " bila [ganda].
  List<String> kurang(int no, bool ganda) {
    final p = ganda ? 'Sirkuit ${no + 1}: ' : '';
    final k = <String>[
      for (final (kunci, label) in const [
        ('penyulang', 'Penyulang'),
        ('sectionId', 'Section'),
        ('segmenId', 'Segmen'),
        ('posisi', 'Posisi'),
        ('peranTitik', 'Peran Titik'),
        ('jenisKabel', 'Jenis Kabel')
      ])
        if (t[kunci]!.trim().isEmpty) '$p$label',
      if (ukuranMm2 == null || ukuranMm2 == 0) '${p}Ukuran mm²',
    ];
    if (t['indukStatus'] == 'TITIK_AWAL') {
      if (t['indukKeterangan']!.trim().isEmpty) k.add('${p}Keterangan Tiang Awal SKTM');
    } else if (!const ['BENAR', 'DIGANTI'].contains(t['indukStatus']) || t['indukTiangId']!.trim().isEmpty) {
      k.add('${p}Konfirmasi Induk Tiang');
    }
    if (t['switchingId']!.trim().isEmpty && t['switchingKeterangan']!.trim().isEmpty) k.add('${p}Switching Hulu atau Keterangan Tanpa Switching');
    return k;
  }

  Map<String, dynamic> payload() => {
        if (id.isNotEmpty) 'sirkuitId': id,
        for (final k in _kolomSirkuit)
          if (t[k]!.trim().isNotEmpty) k: t[k]!.trim(),
        if (ukuranMm2 != null) 'ukuranMm2': ukuranMm2,
      };
}

/// Isian form verifikasi satu tiang (atau tiang baru dari lapangan bila [tiang] null).
class IsianTiang {
  IsianTiang(this.tiang, {String kode = '', List<IsianSirkuit>? contoh})
      : kode = tiang?.teks('kode') ?? kode,
        status = 'TERVERIFIKASI' {
    final t = tiang;
    if (t != null) {
      jenis = t.teks('jenisTiang').isNotEmpty ? t.teks('jenisTiang') : t.teks('jenisTiangAset');
      ukuran = t.teks('ukuranTiang').isNotEmpty ? t.teks('ukuranTiang') : t.teks('ukuranTiangAset');
      konstruksiId = t.teks('konstruksiId');
      if (t.status == 'PERLU_PERBAIKAN') status = t.status;
    }
    final lama = [for (final s in t?.sirkuit ?? const <Sirkuit>[]) IsianSirkuit.dari(s)];
    if (lama.isEmpty) lama.add(IsianSirkuit());
    // sirkuit yang belum diisi penyulangnya diusulkan dari tiang sebelumnya (induk tetap milik tiang ini)
    final c = contoh ?? const <IsianSirkuit>[];
    for (var i = 0; i < c.length; i++) {
      if (i < lama.length && lama[i].t['penyulang']!.isEmpty) {
        final usul = c[i].salin(induk: lama[i].t['indukTiangId']!)..id = lama[i].id;
        usul.t['peranTitik'] = lama[i].t['peranTitik']!;
        lama[i] = usul;
      }
    }
    sirkuit = lama;
  }

  final Tiang? tiang;
  final String kode;
  String status;
  String nama = '';
  String jenis = '';
  String ukuran = '';
  String konstruksiId = '';
  String koordinat = '';
  double? akurasiM;

  /// Dasar koordinat bila selisih GPS dari koordinat terdaftar > [toleransiKoordinatM]: 'TERDAFTAR' (pakai koordinat aset) atau 'LAPANGAN'.
  String dasarKoordinat = '';
  late List<IsianSirkuit> sirkuit;

  /// Selisih (m) koordinat yang diketik / diambil dari koordinat terdaftar tiang; null bila tidak bisa dibandingkan.
  double? get selisihM {
    final t = tiang, k = uraiKoordinat(koordinat);
    return t == null || k == null ? null : selisihAset(t, k.$1, k.$2);
  }

  bool get perluDasar => !hilang && (selisihM ?? 0) > toleransiKoordinatM;

  bool get baru => tiang == null;
  bool get hilang => status == 'TIDAK_DITEMUKAN';

  /// Tambah / kurangi sirkuit menjadi [n] (1-3); sirkuit baru menyalin sirkuit pertama.
  void aturJumlahSirkuit(int n) {
    while (sirkuit.length < n) {
      sirkuit.add(sirkuit.first.salin(induk: sirkuit.first.t['indukTiangId']!));
    }
    if (sirkuit.length > n) sirkuit = sirkuit.sublist(0, n);
  }

  /// Kekurangan data untuk status Terverifikasi (kosong = boleh). [fotoAda] = slot foto yang sudah ada (di server atau baru diambil).
  List<String> kurang(Set<String> fotoAda) => [
        if (jenis.isEmpty) 'Jenis Tiang',
        if (ukuran.isEmpty) 'Ukuran Tiang',
        if (konstruksiId.isEmpty) 'Konstruksi',
        for (final (slot, label) in slotFotoTiang)
          if (!fotoAda.contains(slot)) 'Foto $label',
        for (var n = 0; n < sirkuit.length; n++) ...sirkuit[n].kurang(n, sirkuit.length > 1),
      ];

  /// Galat sebelum dikirim (server tetap memeriksa ulang). Kunci: 'nama', 'koordinat', 'sirkuit<i>', 'lengkap'.
  Map<String, String> cek(List<String> penyulang, [Set<String> fotoAda = const {}]) {
    final g = <String, String>{};
    if (baru && nama.trim().isEmpty) g['nama'] = 'Nama tiang wajib diisi.';
    if (hilang) return g;
    if (uraiKoordinat(koordinat) == null) g['koordinat'] = 'Ambil GPS di dekat tiang.';
    if (perluDasar && dasarKoordinat.isEmpty) g['dasar'] = 'Selisih koordinat lebih dari ${toleransiKoordinatM.round()} m: pilih koordinat yang dipakai.';
    for (var i = 0; i < sirkuit.length; i++) {
      if (!penyulang.contains(sirkuit[i].t['penyulang'])) g['sirkuit$i'] = 'Pilih penyulang sirkuit ${i + 1}.';
    }
    if (status == 'TERVERIFIKASI') {
      final k = kurang(fotoAda);
      if (k.isNotEmpty) g['lengkap'] = 'Lengkapi dulu: ${k.join(', ')}.';
    }
    return g;
  }

  Map<String, dynamic> payload() => {
        if (!baru) 'tiangId': tiang!.id,
        if (!baru) 'revision': tiang!.revision,
        if (baru) 'nama': nama.trim(),
        if (baru && RegExp(r'^[A-Z]{3}$').hasMatch(kode)) 'kode': kode,
        'statusVerifikasi': status,
        if (!hilang) ...{
          'koordinat': koordinat.trim(),
          if (perluDasar && dasarKoordinat.isNotEmpty) 'dasarKoordinat': dasarKoordinat,
          if (akurasiM != null) 'akurasiM': double.parse(akurasiM!.toStringAsFixed(1)),
          if (jenis.isNotEmpty) 'jenisTiang': jenis,
          if (ukuran.isNotEmpty) 'ukuranTiang': ukuran,
          if (konstruksiId.isNotEmpty) 'konstruksiId': konstruksiId,
          'sirkuit': [for (final s in sirkuit) s.payload()],
        },
      };
}

/// Segmen dari getSegmen.
class Segmen {
  Segmen(this.d);
  final Map<String, dynamic> d;
  String teks(String k) => _t(d[k]);
  String get id => teks('segmenId');
  bool get aktif => d['aktif'] == true;
  int get revision => (d['revision'] as num?)?.toInt() ?? 0;
  bool get kabelTanah => d['jenisSegmen'] == 'KABEL_TANAH';
  bool get dataKabelKurang => kabelTanah && teks('statusData') == 'KURANG';
}

const awalSegmen = [
  ('GI', 'GI'),
  ('SWITCHING', 'Switching'),
  ('GARDU', 'Gardu'),
  ('PERCABANGAN', 'Percabangan'),
  ('UJUNG_KABEL', 'Ujung Kabel (Tiang Naik/Turun)')
];
const akhirSegmen = [
  ('SWITCHING', 'Switching'),
  ('GARDU', 'Gardu'),
  ('PERCABANGAN', 'Percabangan'),
  ('UJUNG_KABEL', 'Ujung Kabel (Tiang Naik/Turun)'),
  ('UJUNG', 'Ujung')
];

/// Segmen seragam: udara (berisi tiang) atau kabel tanah (tanpa tiang; data kabel di segmen).
const jenisSegmen = [('UDARA', 'Udara (SUTM)'), ('KABEL_TANAH', 'Kabel Tanah (SKTM)')];

/// Jenis kabel tanah dari data aset ITB (kategori SKTM).
const jenisKabelTanah = [('N2XSEBY - 1 CORE', 'N2XSEBY - 1 CORE'), ('NA2XSEYBY - 3 CORE', 'NA2XSEYBY - 3 CORE')];
const _kolomKabel = ['jenisKabel', 'ukuranMm2', 'panjangKabelM', 'penghantarId'];
const _kolomSegmen = [
  'nama',
  'jenisSegmen',
  'penyulang',
  'sectionId',
  'indukSegmenId',
  'awalJenis',
  'awalNama',
  'awalSwitchingId',
  'akhirJenis',
  'akhirNama',
  'akhirSwitchingId',
  'segmenItb',
  'catatan'
];

/// Isian form segmen (baru / ubah).
class IsianSegmen {
  IsianSegmen([Segmen? s]) : asal = s {
    for (final k in [..._kolomSegmen, ..._kolomKabel]) {
      t[k] = s?.teks(k) ?? '';
    }
    if (s == null) {
      t['awalJenis'] = 'SWITCHING';
      t['akhirJenis'] = 'GARDU';
    }
    if (t['jenisSegmen']!.isEmpty) t['jenisSegmen'] = 'UDARA';
    urutan = s?.teks('urutan') ?? '';
    aktif = s?.aktif ?? true;
  }
  final Segmen? asal;
  final Map<String, String> t = {};
  String urutan = '';
  bool aktif = true;
  bool get baru => asal == null;
  bool get kabelTanah => t['jenisSegmen'] == 'KABEL_TANAH';

  static double? _angka(String v) => double.tryParse(v.trim().replaceAll(',', '.'));

  Map<String, String> cek(List<String> penyulang) => {
        if (t['nama']!.trim().isEmpty) 'nama': 'Nama segmen wajib diisi.',
        if (!penyulang.contains(t['penyulang'])) 'penyulang': 'Pilih penyulang.',
        if (t['sectionId']!.isEmpty) 'sectionId': 'Pilih section.',
        if (t['awalNama']!.trim().isEmpty) 'awalNama': 'Nama titik awal wajib diisi.',
        if (t['akhirNama']!.trim().isEmpty) 'akhirNama': 'Nama titik akhir wajib diisi.',
        if (urutan.trim().isNotEmpty && int.tryParse(urutan.trim()) == null) 'urutan': 'Isi angka bulat.',
        if (kabelTanah && t['ukuranMm2']!.trim().isNotEmpty && (_angka(t['ukuranMm2']!) ?? 0) <= 0) 'ukuranMm2': 'Isi angka lebih dari 0.',
        if (kabelTanah && t['panjangKabelM']!.trim().isNotEmpty && (_angka(t['panjangKabelM']!) ?? 0) <= 0) 'panjangKabelM': 'Isi angka lebih dari 0.',
      };

  Map<String, dynamic> payload() => {
        for (final k in _kolomSegmen)
          if (t[k]!.trim().isNotEmpty) k: t[k]!.trim(),
        if (kabelTanah) ...{
          if (t['jenisKabel']!.isNotEmpty) 'jenisKabel': t['jenisKabel']!,
          if (t['penghantarId']!.trim().isNotEmpty) 'penghantarId': t['penghantarId']!.trim(),
          if (_angka(t['ukuranMm2']!) != null) 'ukuranMm2': _angka(t['ukuranMm2']!),
          if (_angka(t['panjangKabelM']!) != null) 'panjangKabelM': _angka(t['panjangKabelM']!),
        },
        if (int.tryParse(urutan.trim()) != null) 'urutan': int.parse(urutan.trim()),
        if (!baru) ...{'segmenId': asal!.id, 'revision': asal!.revision, 'aktif': aktif},
      };
}
