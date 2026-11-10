/// v1.0.38 History Gangguan (menu OPS_REKAP_GANGGUAN) di HP: logika murni, port dari web/src/gangguan.js supaya hitungan
/// HP = website (filter, Kode FGTM, kategori PMT | Section, per bulan, 3 tahun, Top 12). Data dari getHistoriGangguan.
library;

class JenisGgn {
  const JenisGgn(this.kode, this.label, this.pendek, this.waktu, this.alat, this.sebab);
  final String kode, label, pendek, waktu, alat, sebab;
}

const List<JenisGgn> jenisGgnSemua = [
  JenisGgn('penyulang', 'Gangguan Penyulang', 'Penyulang', 'waktu_padam', 'peralatan', 'penyebab'),
  JenisGgn('ar', 'Auto Reclose', 'AR', 'waktu_ar', 'peralatan', 'penyebab'),
  JenisGgn('pickup', 'Pick Up Recloser', 'Pick Up', 'waktu_event', 'recloser', 'temuan'),
];

JenisGgn jenisGgn(String? kode) => jenisGgnSemua.firstWhere((j) => j.kode == kode, orElse: () => jenisGgnSemua.first);

const bulanPendekGgn = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const bulanPanjangGgn = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String teksGgn(Object? v) => v?.toString().trim() ?? '';
num? angkaGgn(Object? v) => v is num ? v : num.tryParse(teksGgn(v));
List<Map<String, dynamic>> daftarGgn(Object? v) => v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : const [];

String _tgl(Map<String, dynamic> o, JenisGgn j) {
  final w = teksGgn(o[j.waktu]);
  return w.length >= 10 ? w.substring(0, 10) : w;
}

/* ===== Kode FGTM ===== */
class KodeFgtm {
  const KodeFgtm(this.kode, this.label, this.grup);
  final String kode, label, grup;
}

const kodeFgtmSemua = [
  KodeFgtm('I1', 'Komponen JTM', 'INTERNAL'), KodeFgtm('I2', 'Peralatan JTM', 'INTERNAL'),
  KodeFgtm('I3', 'Trafo', 'INTERNAL'), KodeFgtm('I4', 'Tiang', 'INTERNAL'),
  KodeFgtm('E1', 'Pohon', 'EXTERNAL'), KodeFgtm('E2', 'Bencana Alam', 'EXTERNAL'),
  KodeFgtm('E3', 'Pekerjaan Pihak III / Binatang', 'EXTERNAL'), KodeFgtm('E4', 'Layang-layang / Umbul-umbul', 'EXTERNAL'),
  KodeFgtm('E', 'Tidak Diketahui', 'EXTERNAL'),
];
const grupFgtm = {'INTERNAL': 'Internal', 'EXTERNAL': 'External'};

/// Teks Kode FGTM sumber ('Pohon - E1', 'Tidak Diketahui') -> kode. Kosong = kode '' (Belum diisi).
KodeFgtm kodeFgtm(Object? teks) {
  final s = teksGgn(teks);
  if (s.isEmpty) return const KodeFgtm('', 'Belum diisi', '');
  final m = RegExp(r'\b([IE])\s*-?\s*(\d)\s*$', caseSensitive: false).firstMatch(s);
  final kode = m != null ? '${m.group(1)!.toUpperCase()}${m.group(2)}' : 'E';
  for (final k in kodeFgtmSemua) {
    if (k.kode == kode) return k;
  }
  return KodeFgtm(kode, s.replaceAll(RegExp(r'\s*-?\s*[IE]\d\s*$', caseSensitive: false), ''), kode.startsWith('I') ? 'INTERNAL' : 'EXTERNAL');
}

bool cocokKodeGgn(Object? teks, String filter) {
  if (filter.isEmpty) return true;
  final k = kodeFgtm(teks);
  return filter == 'INTERNAL' || filter == 'EXTERNAL' ? k.grup == filter : k.kode == filter;
}

/// Potongan pie: tab 'SEMUA' | 'INTERNAL' | 'EXTERNAL' -> [(kode, label, jumlah)] terurut turun.
List<({String kode, String label, int jumlah})> pieFgtm(List<Map<String, dynamic>> baris, [String tab = 'SEMUA']) {
  final hit = <String, ({String kode, String label, int jumlah})>{};
  for (final o in baris) {
    final k = kodeFgtm(o['kode_fgtm']);
    if (tab != 'SEMUA' && k.grup != tab) continue;
    final id = k.kode.isEmpty ? '-' : k.kode;
    final x = hit[id];
    hit[id] = (kode: k.kode, label: k.label, jumlah: (x?.jumlah ?? 0) + 1);
  }
  return hit.values.toList()..sort((a, b) => b.jumlah != a.jumlah ? b.jumlah - a.jumlah : a.kode.compareTo(b.kode));
}

/* ===== PMT | Section ===== */

/// 'pmt' | 'section': jenis peralatan PMT = PMT, lainnya Section; pick up (tanpa jenis) dari nama peralatan.
String kategoriAlatGgn(Map<String, dynamic> o, String kode) {
  final jenis = teksGgn(o['jenis_peralatan']).toUpperCase();
  if (jenis.isNotEmpty) return jenis == 'PMT' ? 'pmt' : 'section';
  return RegExp(r'^PMT\b', caseSensitive: false).hasMatch(teksGgn(o[jenisGgn(kode).alat])) ? 'pmt' : 'section';
}

class HitungAlat {
  int jumlah = 0, pmt = 0, section = 0;
  void tambah(String k) {
    jumlah++;
    if (k == 'pmt') {
      pmt++;
    } else {
      section++;
    }
  }
}

HitungAlat hitungKategoriGgn(List<Map<String, dynamic>> baris, String kode) {
  final h = HitungAlat();
  for (final o in baris) {
    h.tambah(kategoriAlatGgn(o, kode));
  }
  return h;
}

/* ===== tanggal ===== */

/// Bulan 'yyyy-MM' dari [dari] s.d. [sampai] (inklusif), maks 61.
List<String> bulanRentangGgn(String dari, String sampai) {
  final hasil = <String>[];
  var y = int.parse(dari.substring(0, 4)), m = int.parse(dari.substring(5, 7));
  final y2 = int.parse(sampai.substring(0, 4)), m2 = int.parse(sampai.substring(5, 7));
  while (y < y2 || (y == y2 && m <= m2)) {
    hasil.add('$y-${m.toString().padLeft(2, '0')}');
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (hasil.length > 60) break;
  }
  return hasil;
}

/// Satu kolom grafik: label + PMT | Section + total.
class KolomGgn {
  KolomGgn(this.kunci, this.label, this.h, {this.sub = ''});
  final String kunci, label, sub;
  final HitungAlat h;
}

List<KolomGgn> perBulanRentangGgn(List<Map<String, dynamic>> baris, String kode, String dari, String sampai) {
  final j = jenisGgn(kode), daftar = bulanRentangGgn(dari, sampai);
  final kel = {for (final b in daftar) b: HitungAlat()};
  for (final o in baris) {
    final b = teksGgn(o[j.waktu]);
    if (b.length >= 7) kel[b.substring(0, 7)]?.tambah(kategoriAlatGgn(o, kode));
  }
  return [
    for (var i = 0; i < daftar.length; i++)
      KolomGgn(daftar[i], bulanPendekGgn[int.parse(daftar[i].substring(5)) - 1], kel[daftar[i]]!,
          sub: i == 0 || daftar[i].endsWith('-01') ? daftar[i].substring(0, 4) : ''),
  ];
}

({String dari, String sampai}) rentangTahunGgn(int tahun, String hariIni) {
  final akhir = '$tahun-12-31';
  return (dari: '$tahun-01-01', sampai: hariIni.compareTo(akhir) < 0 ? hariIni : akhir);
}

List<int> tigaTahunGgn(int tahun) => [tahun - 2, tahun - 1, tahun];

List<KolomGgn> perTahunGgn(List<Map<String, dynamic>> baris, String kode, int tahun) {
  final j = jenisGgn(kode);
  return [
    for (final t in tigaTahunGgn(tahun))
      KolomGgn('$t', '$t', hitungKategoriGgn(baris.where((o) => teksGgn(o[j.waktu]).startsWith('$t')).toList(), kode)),
  ];
}

class TopGgn {
  TopGgn(this.nama);
  final String nama;
  final h = HitungAlat();
  final Map<int, int> perTahun = {};
}

/// Top n penyulang satu tahun + jumlah 3 tahun penyulang yang sama, terurut terbanyak lalu abjad.
List<TopGgn> topPenyulangGgn(List<Map<String, dynamic>> baris, String kode, int tahun, [int n = 12]) {
  final j = jenisGgn(kode), daftar = tigaTahunGgn(tahun), hit = <String, TopGgn>{};
  for (final o in baris) {
    final nama = teksGgn(o['penyulang']), w = teksGgn(o[j.waktu]);
    final t = w.length >= 4 ? int.tryParse(w.substring(0, 4)) : null;
    if (nama.isEmpty || t == null || !daftar.contains(t)) continue;
    final x = hit.putIfAbsent(nama, () => TopGgn(nama)..perTahun.addAll({for (final y in daftar) y: 0}));
    x.perTahun[t] = (x.perTahun[t] ?? 0) + 1;
    if (t == tahun) x.h.tambah(kategoriAlatGgn(o, kode));
  }
  final l = hit.values.where((x) => x.h.jumlah > 0).toList()
    ..sort((a, b) => b.h.jumlah != a.h.jumlah ? b.h.jumlah - a.h.jumlah : a.nama.compareTo(b.nama));
  return l.take(n).toList();
}

/// Saring halaman: penyulang ('' semua), kode FGTM (pick up tidak disaring kode), tanggal, kata cari (semua kata).
List<Map<String, dynamic>> saringGgn(List<Map<String, dynamic>> baris, String kode,
    {String penyulang = '', String fgtm = '', String dari = '', String sampai = '', String cari = ''}) {
  final kata = cari.trim().toLowerCase().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
  final j = jenisGgn(kode);
  return baris.where((o) {
    final t = _tgl(o, j);
    if (penyulang.isNotEmpty && teksGgn(o['penyulang']) != penyulang) return false;
    if (kode != 'pickup' && !cocokKodeGgn(o['kode_fgtm'], fgtm)) return false;
    if (dari.isNotEmpty && t.compareTo(dari) < 0) return false;
    if (sampai.isNotEmpty && t.compareTo(sampai) > 0) return false;
    if (kata.isEmpty) return true;
    final isi = o.values.where((v) => v is String || v is num).join(' ').toLowerCase();
    return kata.every(isi.contains);
  }).toList();
}

/// Baris (terbaru dulu) dikelompokkan per bulan: [(kunci, label, isi)].
List<({String kunci, String label, List<Map<String, dynamic>> isi})> grupBulanGgn(List<Map<String, dynamic>> baris, String kode) {
  final j = jenisGgn(kode);
  final hasil = <({String kunci, String label, List<Map<String, dynamic>> isi})>[];
  for (final o in baris) {
    final w = teksGgn(o[j.waktu]), kunci = w.length >= 7 ? w.substring(0, 7) : '';
    if (hasil.isEmpty || hasil.last.kunci != kunci) {
      final b = kunci.isEmpty ? 0 : int.tryParse(kunci.substring(5)) ?? 0;
      hasil.add((kunci: kunci, label: b > 0 ? '${bulanPanjangGgn[b - 1]} ${kunci.substring(0, 4)}' : 'Tanpa tanggal', isi: []));
    }
    hasil.last.isi.add(o);
  }
  return hasil;
}

/// Ringkasan padam (gangguan penyulang): total / rata-rata durasi menit, ENS kWh, jumlah pelanggan padam.
({num durasi, num rata, num ensKwh, num pelanggan}) ringkasPadamGgn(List<Map<String, dynamic>> baris) {
  num jml(String k) => baris.fold<num>(0, (s, o) => s + (o[k] is num ? o[k] as num : 0));
  final d = jml('durasi_menit');
  return (durasi: d, rata: baris.isEmpty ? 0 : d / baris.length, ensKwh: jml('ens_kwh'), pelanggan: jml('pelanggan'));
}

/// Durasi menit -> '2 j 15 m' / '45 m'.
String teksDurasiGgn(Object? menit) {
  final n = angkaGgn(menit);
  if (n == null || !n.isFinite) return '-';
  final m = n.round(), j = m ~/ 60;
  return j > 0 ? '$j j${m % 60 > 0 ? ' ${m % 60} m' : ''}' : '$m m';
}

/// 'yyyy-MM-dd ...' -> '27 Okt 2026'.
String tglIdGgn(Object? w) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(teksGgn(w));
  return m == null ? '-' : '${int.parse(m.group(3)!)} ${bulanPendekGgn[int.parse(m.group(2)!) - 1]} ${m.group(1)}';
}

String isoHariGgn(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
