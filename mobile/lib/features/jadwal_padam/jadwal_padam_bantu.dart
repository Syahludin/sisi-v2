import 'package:flutter/material.dart' show TimeOfDay;

/// v1.0.17: bantuan murni Jadwal Padam (sama dengan rumus server 70_JadwalPadam.js).

class StatusJadwalPadam {
  StatusJadwalPadam._();
  static const jadwal = 'Terjadwal', realisasi = 'Terealisasi', batal = 'Batal Pemadaman';
  static const semua = [jadwal, realisasi, batal];
}

/// Tarif ENS v1 (Rp per kWh, rumus v1: beban MW x durasi jam x tarif).
const double tarifEnsJp = 1444.7;

const _bulanJp = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String teksJp(Object? v) => v?.toString().trim() ?? '';

List<Map<String, dynamic>> daftarJp(Object? v) =>
    v is List ? [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)] : <Map<String, dynamic>>[];

/// '2026-10-25' -> '25 Oktober 2026'.
String labelTanggalJp(String iso) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso.trim());
  return m == null ? iso : '${m.group(3)} ${_bulanJp[int.parse(m.group(2)!) - 1]} ${m.group(1)}';
}

String jamTeksJp(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

TimeOfDay jamDariTeksJp(String s, TimeOfDay bawaan) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(s.trim());
  if (m == null) return bawaan;
  final h = int.parse(m.group(1)!), n = int.parse(m.group(2)!);
  return h < 24 && n < 60 ? TimeOfDay(hour: h, minute: n) : bawaan;
}

/// Durasi jam; jam nyala lebih kecil = lewat tengah malam (+24 jam), sama dengan v1.
double durasiJamJp(String padam, String nyala) {
  int? menit(String s) {
    final m = RegExp(r'^(\d{2}):(\d{2})$').firstMatch(s);
    return m == null ? null : int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
  }

  final a = menit(padam), b0 = menit(nyala);
  if (a == null || b0 == null) return 0;
  final b = b0 < a ? b0 + 1440 : b0;
  return (b - a) / 60;
}

/// v1.0.18: ENS rupiah bulat, dibulatkan ke atas (sama dengan ensRupiahJp_ server; derau pecahan float dibuang dulu).
int ensJp(num bebanMw, num durasi) => ((bebanMw * durasi * tarifEnsJp * 100).roundToDouble() / 100).ceil();

/// v1.0.18: 'Rp 1.234.567' (tanpa desimal, bulat ke atas). Nilai server lama berdesimal ikut dibulatkan ke atas.
String rupiahJp(Object? v) {
  final n = num.tryParse(teksJp(v)) ?? 0;
  return 'Rp ${angkaIdJp(((n * 100).roundToDouble() / 100).ceil())}';
}

/// 3.5 -> '3 jam 30 menit'.
String durasiTeksJp(Object? durasiJam) {
  final menit = ((num.tryParse(teksJp(durasiJam)) ?? 0) * 60).round();
  final j = menit ~/ 60, m = menit % 60;
  return [if (j > 0) '$j jam', if (m > 0 || j == 0) '$m menit'].join(' ');
}

/// Angka format Indonesia (ribuan '.', desimal ',').
String angkaIdJp(num n, [int digit = 0]) {
  final s = n.abs().toStringAsFixed(digit).split('.');
  final ribu = s[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
  return '${n < 0 ? '-' : ''}$ribu${s.length > 1 ? ',${s[1]}' : ''}';
}
