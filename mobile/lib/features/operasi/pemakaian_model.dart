/// v0.84.0 / v0.85.0: ringkasan pemakaian kuota Apps Script + Cloud Run per layanan (jawaban getPemakaian).
/// Murni, dites tanpa Flutter.
enum TingkatPakai { aman, waspada, bahaya }

TingkatPakai tingkatPakai(num persen) => persen >= 95 ? TingkatPakai.bahaya : persen >= 80 ? TingkatPakai.waspada : TingkatPakai.aman;

num _n(Object? v) => v is num ? v : num.tryParse('$v') ?? 0;
Map<String, dynamic> _m(Object? v) => v is Map ? Map<String, dynamic>.from(v) : const {};

/// Angka ribuan gaya Indonesia: 20000 -> "20.000", 12.5 -> "12,5".
String angkaId(num v) {
  final bulat = v == v.roundToDouble();
  final s = bulat ? v.round().toString() : v.toStringAsFixed(1);
  final bagian = s.split('.');
  final depan = bagian[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
  return bagian.length > 1 ? '$depan,${bagian[1]}' : depan;
}

class BarisPakai {
  const BarisPakai({required this.judul, required this.dipakai, required this.batas, required this.persen, required this.satuan, this.catatan = ''});
  final String judul;
  final num dipakai;
  final num batas;
  final num persen;
  final String satuan;
  final String catatan;
  TingkatPakai get tingkat => tingkatPakai(persen);
  double get rasio => batas <= 0 ? 0 : (dipakai / batas).clamp(0, 1).toDouble();
}

/// Satu layanan Cloud Run (service_name) di proyek engine.
class LayananCloudRun {
  const LayananCloudRun({required this.nama, required this.requestHari, required this.vcpuHari, required this.requestBulan,
      required this.vcpuBulan, required this.gibBulan, required this.persenVcpu});
  final String nama;
  final num requestHari;
  final num vcpuHari;
  final num requestBulan;
  final num vcpuBulan;
  final num gibBulan;
  final num persenVcpu;

  /// Label ramah: sisi2-pdf-staging -> "PDF BA v2 · staging".
  String get label {
    final n = nama.toLowerCase();
    final env = n.contains('staging') ? 'staging' : n.contains('prod') ? 'production' : '';
    final jenis = n.contains('pdf') ? (n.startsWith('sisi2') ? 'PDF BA v2' : 'PDF BA v1') : n.contains('wm') || n.contains('watermark') ? 'Watermark' : nama;
    return env.isEmpty ? jenis : '$jenis · $env';
  }
}

/// Pemakaian Cloud Run bulan ini (dari Cloud Monitoring). [aktif] false = belum disiapkan / gagal, alasan di [pesan].
class CloudRunPakai {
  const CloudRunPakai({required this.aktif, this.pesan = '', this.proyek = '', this.bulan = '', this.layanan = const [],
      this.baris = const [], this.persenMaks = 0, this.requestHari = 0});
  final bool aktif;
  final String pesan;
  final String proyek;
  final String bulan;
  final List<LayananCloudRun> layanan;

  /// Total semua layanan vs kuota gratis per bulan: request, vCPU-detik, GiB-detik.
  final List<BarisPakai> baris;
  final num persenMaks;
  final num requestHari;
  TingkatPakai get tingkat => tingkatPakai(persenMaks);

  static CloudRunPakai? dariJson(Object? v) {
    if (v is! Map) return null;
    final j = Map<String, dynamic>.from(v);
    if (j['aktif'] != true) return CloudRunPakai(aktif: false, pesan: '${j['pesan'] ?? ''}', proyek: '${j['proyek'] ?? ''}');
    final t = _m(_m(j['total'])['bulan']), g = _m(j['gratis']), p = _m(j['persen']);
    return CloudRunPakai(
      aktif: true,
      proyek: '${j['proyek'] ?? ''}',
      bulan: '${j['bulan'] ?? ''}',
      persenMaks: _n(j['persenMaks']),
      requestHari: _n(_m(_m(j['total'])['hariIni'])['request']),
      baris: [
        BarisPakai(judul: 'vCPU-detik', dipakai: _n(t['vcpuDetik']), batas: _n(g['vcpuDetik']), persen: _n(p['vcpuDetik']), satuan: ''),
        BarisPakai(judul: 'Memori GiB-detik', dipakai: _n(t['gibDetik']), batas: _n(g['gibDetik']), persen: _n(p['gibDetik']), satuan: ''),
        BarisPakai(judul: 'Request', dipakai: _n(t['request']), batas: _n(g['request']), persen: _n(p['request']), satuan: ''),
      ],
      layanan: [
        for (final l in (j['layanan'] is List ? j['layanan'] as List : const []).whereType<Map<dynamic, dynamic>>())
          LayananCloudRun(
            nama: '${l['nama'] ?? ''}',
            requestHari: _n(_m(l['hariIni'])['request']),
            vcpuHari: _n(_m(l['hariIni'])['vcpuDetik']),
            requestBulan: _n(_m(l['bulan'])['request']),
            vcpuBulan: _n(_m(l['bulan'])['vcpuDetik']),
            gibBulan: _n(_m(l['bulan'])['gibDetik']),
            persenVcpu: _n(l['persenVcpu']),
          ),
      ],
    );
  }
}

class RingkasPakai {
  const RingkasPakai({required this.tanggal, required this.paket, required this.status, required this.baris, required this.direm,
      required this.fungsiTerberat, required this.riwayat, this.cloudRun});

  final String tanggal;
  final String paket;
  final TingkatPakai status;
  final List<BarisPakai> baris;
  final List<String> direm;
  final List<String> fungsiTerberat;
  final List<({String tanggal, num pemicuPersen})> riwayat;
  final CloudRunPakai? cloudRun;

  /// Status gabungan Apps Script + Cloud Run.
  TingkatPakai get statusGabung {
    final c = cloudRun;
    if (c == null || !c.aktif) return status;
    return c.tingkat.index > status.index ? c.tingkat : status;
  }

  static String namaFungsi(String n) => switch (n.replaceFirst('ADMIN_', '')) {
        'pengingatYandal' => 'Pengingat Yandal',
        'rekapShiftYandal' => 'Rekap Yandal',
        'pantauPemakaian' => 'Pemantau',
        'sinkronGarduLama' => 'Sinkron Gardu',
        'buatBarisHarian' => 'Baris laporan harian',
        'migrasiFoto' => 'Salin foto ROW',
        'migrasiCekFoto' => 'Cek foto ROW',
        'migrasiP0Foto' => 'Salin foto P0',
        final x => x,
      };

  static RingkasPakai dariJson(Map<String, dynamic> j) {
    final p = _m(j['pemicu']), u = _m(j['urlFetch']), d = _m(j['pdfBulan']);
    final status = switch ('${j['status']}') { 'BAHAYA' => TingkatPakai.bahaya, 'WASPADA' => TingkatPakai.waspada, _ => TingkatPakai.aman };
    return RingkasPakai(
      tanggal: '${j['tanggal'] ?? ''}',
      paket: '${j['paket'] ?? ''}',
      status: status,
      baris: [
        BarisPakai(judul: 'Pemicu otomatis hari ini', dipakai: _n(p['menit']), batas: _n(p['batasMenit']), persen: _n(p['persen']), satuan: 'menit',
            catatan: '${_n(p['jalan'])} kali jalan'),
        BarisPakai(judul: 'Panggilan luar (UrlFetch) hari ini', dipakai: _n(u['jumlah']), batas: _n(u['batas']), persen: _n(u['persen']), satuan: '',
            catatan: 'PDF ${_n(u['pdf'])} · notifikasi ${_n(u['fcm'])}'),
        BarisPakai(judul: 'Engine PDF bulan ini (perkiraan catatan SiSi)', dipakai: _n(d['vcpuDetik']), batas: _n(d['batasVcpuDetik']),
            persen: _n(d['persen']), satuan: 'vCPU-detik', catatan: '${_n(d['request'])} request'),
      ],
      direm: [for (final e in _m(p['direm']).entries) '${namaFungsi(e.key)} ${_n(e.value)}x'],
      fungsiTerberat: [
        for (final f in (p['perFungsi'] is List ? p['perFungsi'] as List : const []).whereType<Map<dynamic, dynamic>>().take(3))
          '${namaFungsi('${f['nama']}')} ${angkaId(_n(f['menit']))} mnt'
      ],
      riwayat: [
        for (final r in (j['riwayat'] is List ? j['riwayat'] as List : const []).whereType<Map<dynamic, dynamic>>())
          (tanggal: '${r['tanggal'] ?? ''}', pemicuPersen: _n(r['pemicuPersen']))
      ],
      cloudRun: CloudRunPakai.dariJson(j['cloudRun']),
    );
  }
}
