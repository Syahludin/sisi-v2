/// Review 8 Nov 2026 (desain ulang Laporan Gangguan Penyulang): tampilan terstruktur (kartu hari laporan + rekap bulan) DIURAI
/// dari teks WhatsApp yang disusun server (teksLaporanGangguan_ di backend 68_Laporan_Gangguan.js), jadi yang tampil di kartu =
/// yang terkirim. Teks yang tidak bisa diurai = null (layar menampilkan teks saja). Pasangan web: web/src/laporanGangguan.js.
library;

class KategoriLgp {
  const KategoriLgp(this.kode, this.label);
  final String kode;
  final String label;

  static const semua = [KategoriLgp('pmt', 'PMT Trip'), KategoriLgp('sukses', 'AR Sukses'), KategoriLgp('lockout', 'AR Lockout')];
}

class KejadianLgp {
  KejadianLgp(this.penyulang);
  final String penyulang;
  String penyebab = ''; // diisi dari baris "Penyebab : ..." sesudahnya; "-" = kosong
}

class HarianLgp {
  HarianLgp(this.kategori, this.jumlah);
  final KategoriLgp kategori;
  final int jumlah;
  final List<KejadianLgp> kejadian = [];
}

class TertinggiLgp {
  const TertinggiLgp(this.nama, this.pmt, this.section);
  final String nama;
  final int pmt;
  final int section;
}

class RekapLgp {
  RekapLgp(this.kategori, this.total);
  final KategoriLgp kategori;
  final int total;
  final List<({String nama, int jumlah})> daftar = [];
}

class UraianLgp {
  const UraianLgp({required this.bulan, required this.harian, required this.tertinggi, required this.rekap});
  final String bulan; // 'NOVEMBER 2026'
  final List<HarianLgp> harian;
  final List<TertinggiLgp> tertinggi;
  final List<RekapLgp> rekap;

  /// 'NOVEMBER 2026' -> 'November 2026'.
  String get bulanTampil => bulan.toLowerCase().replaceAllMapped(RegExp(r'(^|\s)([a-z])'), (m) => '${m[1]}${m[2]!.toUpperCase()}');
}

const _judulHarian = '📍 GANGGUAN PENYULANG';
const _awalRekap = '📊 REKAP GANGGUAN TERTINGGI BULAN ';
final _kepala = RegExp(r'^▪️ (.+?) :(.*)$');
final _kejadian = RegExp(r'^- Penyulang : (.*)$');
final _penyebab = RegExp(r'^Penyebab : (.*)$');
final _tertinggi = RegExp(r'^- Penyulang (.+) \(PMT (\d+) kali & Section (\d+) kali\)$');
final _baris = RegExp(r'^- (.+) \((\d+) kali\)$');

int? _kali(String s) {
  final m = RegExp(r'^(\d+) kali$').firstMatch(s.trim());
  if (m != null) return int.parse(m[1]!);
  return s.trim() == 'NIHIL' ? 0 : null;
}

KategoriLgp? _kategori(String label) {
  for (final k in KategoriLgp.semua) {
    if (k.label == label) return k;
  }
  return null;
}

/// Urai teks laporan server. Format lain / rusak = null.
UraianLgp? uraiLaporanGangguan(String? teks) {
  final l = (teks ?? '').split(RegExp(r'\r?\n')).map((s) => s.trim()).toList();
  final iH = l.indexOf(_judulHarian);
  final iR = l.indexWhere((s) => s.startsWith(_awalRekap));
  if (iH < 0 || iR < iH) return null;
  final harian = <HarianLgp>[];
  HarianLgp? kini;
  KejadianLgp? tunggu;
  for (final s in l.sublist(iH + 1, iR)) {
    final k = _kepala.firstMatch(s);
    if (k != null) {
      final kat = _kategori(k[1]!.trim());
      final n = _kali(k[2]!);
      if (kat == null || n == null) return null;
      harian.add(kini = HarianLgp(kat, n));
      tunggu = null;
      continue;
    }
    final p = _kejadian.firstMatch(s);
    if (p != null && kini != null) {
      kini.kejadian.add(tunggu = KejadianLgp(p[1]!.trim()));
      continue;
    }
    final sb = _penyebab.firstMatch(s);
    if (sb != null && tunggu != null) {
      final isi = sb[1]!.trim();
      tunggu.penyebab = isi == '-' ? '' : isi;
      tunggu = null;
    }
  }
  final tertinggi = <TertinggiLgp>[];
  final rekap = <RekapLgp>[];
  RekapLgp? r;
  var diTertinggi = false;
  for (final s in l.sublist(iR + 1)) {
    if (s.startsWith('Demikian')) break;
    final k = _kepala.firstMatch(s);
    if (k != null && k[1]!.trim().startsWith('Gangguan Tertinggi')) {
      diTertinggi = true;
      r = null;
      continue;
    }
    if (k != null) {
      final kat = _kategori(k[1]!.trim());
      final n = _kali(k[2]!);
      if (kat == null || n == null) return null;
      rekap.add(r = RekapLgp(kat, n));
      diTertinggi = false;
      continue;
    }
    if (diTertinggi) {
      final t = _tertinggi.firstMatch(s);
      if (t != null) tertinggi.add(TertinggiLgp(t[1]!, int.parse(t[2]!), int.parse(t[3]!)));
      continue;
    }
    final d = _baris.firstMatch(s);
    if (d != null && r != null) r.daftar.add((nama: d[1]!, jumlah: int.parse(d[2]!)));
  }
  if (harian.length != KategoriLgp.semua.length || rekap.length != KategoriLgp.semua.length) return null;
  return UraianLgp(bulan: l[iR].substring(_awalRekap.length).trim(), harian: harian, tertinggi: tertinggi, rekap: rekap);
}
