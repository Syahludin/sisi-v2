import 'package:flutter/material.dart';

import 'package:geolocator/geolocator.dart';

import '../../core/api_client.dart';
import '../../core/cek_lokasi.dart';
import '../../core/deps.dart';
import '../../core/env.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/login_gagal_card.dart';
import '../../widgets/mock_gps_warning_dialog.dart';
import '../../widgets/sisi_brand.dart';
import '../../widgets/sisi_motif.dart';
import '../yandal/pilih_petugas_screen.dart';
import '../yandal/yandal_login.dart';
import 'auth_repository.dart';
import '../../widgets/sisi_loader.dart';

/// Login: halaman brand + tombol Login, form di bottom sheet.
/// v1.0.19 (permintaan kvlar 23 Okt 2026): desain ulang Jaringan SiSi (latar gradien + motif tiang & kawat, logo bercahaya,
/// tombol kuning PLN), alur tetap sama.
/// PRD Alur B: login -> getMaster -> getKodeRow -> dashboard.
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key, required this.deps, required this.onMasuk});
  final Deps deps;
  final void Function(Sesi) onMasuk;

  Future<void> _bukaForm(BuildContext context) async {
    // v0.63.0: form mengembalikan Sesi (akun biasa) atau TiketYandal (akun YANDAL: pilih petugas dulu)
    final hasil = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _FormLogin(deps: deps),
    );
    if (hasil == null || !context.mounted) return;
    Sesi? s = hasil is Sesi ? hasil : null;
    if (hasil is TiketYandal) {
      s = await Navigator.of(context).push<Sesi>(
        MaterialPageRoute(builder: (_) => PilihPetugasScreen(deps: deps, tiket: hasil)),
      );
    }
    if (s == null || !context.mounted) return;
    final masuk = s;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: AppColors.navy950.withValues(alpha: .72),
      builder: (c) {
        Future.delayed(const Duration(seconds: 2), () {
          if (c.mounted) Navigator.of(c).pop();
        });
        return _DialogBerhasil(sesi: masuk);
      },
    );
    onMasuk(masuk);
  }

  @override
  Widget build(BuildContext context) {
    final tinggi = MediaQuery.sizeOf(context).height;
    Widget modul(IconData i, String t) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .10),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withValues(alpha: .18)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(i, size: 14, color: AppColors.accent400),
            const SizedBox(width: 5),
            Text(t, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: Colors.white)),
          ]),
        );
    return Scaffold(
      backgroundColor: AppColors.brand950,
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: SisiMotif.gradien),
        child: Stack(children: [
          // v1.0.19: motif tiang & kawat jaringan memenuhi sepertiga bawah layar
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: tinggi * .36,
            child: const IgnorePointer(child: CustomPaint(painter: PolaJaringanPainter(alpha: .16, kerapatan: 5))),
          ),
          SafeArea(
            child: Stack(children: [
              const Positioned(top: 16, right: 16, child: PlnBadge()),
              if (Env.isStaging)
                Positioned(
                  top: 22,
                  left: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.accent400, borderRadius: BorderRadius.circular(999)),
                    child: const Text('STAGING',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: .8, color: AppColors.brand950)),
                  ),
                ),
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 128,
                      height: 128,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(36),
                        boxShadow: [
                          BoxShadow(color: AppColors.accent400.withValues(alpha: .35), blurRadius: 36, spreadRadius: 2),
                          BoxShadow(color: Colors.black.withValues(alpha: .25), blurRadius: 18, offset: const Offset(0, 10)),
                        ],
                      ),
                      child: Image.asset('assets/images/logo-sisi.png',
                          errorBuilder: (context, error, stack) => const Icon(Icons.hub, size: 80, color: AppColors.navy700)),
                    ),
                    const SizedBox(height: 22),
                    const Text('SiSi',
                        style: TextStyle(fontSize: 46, height: 1, fontWeight: FontWeight.w900, letterSpacing: -1, color: Colors.white)),
                    const SizedBox(height: 6),
                    const Row(mainAxisSize: MainAxisSize.min, children: [
                      PercikSisi(tinggi: 12),
                      SizedBox(width: 8),
                      Text('SISTEM INTEGRASI',
                          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, letterSpacing: 2.4, color: Color(0xD9FFFFFF))),
                    ]),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: .16), borderRadius: BorderRadius.circular(100)),
                      child: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.location_on, size: 13, color: AppColors.accent400),
                        SizedBox(width: 4),
                        Text('PLN ULP TOBOALI',
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: .6, color: Colors.white)),
                      ]),
                    ),
                    const SizedBox(height: 22),
                    Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
                      modul(Icons.forest_outlined, 'ROW'),
                      modul(Icons.handyman_outlined, 'Hartek'),
                      modul(Icons.bolt_rounded, 'Yandal'),
                      modul(Icons.travel_explore_rounded, 'Inspeksi'),
                      modul(Icons.calendar_month_rounded, 'Jadwal Padam'),
                    ]),
                    const SizedBox(height: 38),
                    SizedBox(
                      width: 280,
                      height: 56,
                      child: FilledButton.icon(
                        onPressed: () => _bukaForm(context),
                        icon: const Icon(Icons.login_rounded, size: 20),
                        label: const Text('Login', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accent400,
                          foregroundColor: AppColors.brand950,
                          elevation: 6,
                          shadowColor: Colors.black45,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text('Masuk dengan akun tim / admin ULP', style: TextStyle(fontSize: 12, color: Color(0xB3FFFFFF))),
                  ]),
                ),
              ),
              const Positioned(
                left: 0,
                right: 0,
                bottom: 14,
                child: Text('Sistem Integrasi © 2026 · PLN ULP Toboali',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Color(0x99FFFFFF))),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _FormLogin extends StatefulWidget {
  const _FormLogin({required this.deps});
  final Deps deps;

  @override
  State<_FormLogin> createState() => _FormLoginState();
}

class _FormLoginState extends State<_FormLogin> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _proses = false;
  bool _lihat = false;
  String? _pesan;
  int _salah = 0; // v0.62.3: salah berturut-turut di HP ini (untuk kartu login gagal)

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _masuk() async {
    setState(() {
      _proses = true;
      _pesan = null;
    });
    try {
      // Guard fake GPS (v0.38): cek lokasi dulu, lokasi palsu / GPS mati / tanpa izin = tidak lanjut ke server.
      final lokasi = await CekLokasi.sebelumLogin();
      if (lokasi != StatusLokasi.aman) {
        if (lokasi == StatusLokasi.palsu) {
          await widget.deps.auth.laporGpsPalsu(_username.text);
          if (mounted) await tampilkanMockGpsWarning(context, catatan: 'Lokasi palsu terdeteksi. Login ditolak.');
        } else if (lokasi == StatusLokasi.izinDitolakPermanen) {
          await Geolocator.openAppSettings();
        } else if (lokasi == StatusLokasi.gpsMati) {
          await Geolocator.openLocationSettings();
        }
        if (mounted) setState(() => _pesan = CekLokasi.pesan(lokasi));
        return;
      }
      final hasil = await widget.deps.auth.login(_username.text, _password.text);
      final Sesi s;
      switch (hasil) {
        case LoginPilihPetugas(:final tiket):
          // v0.63.0: akun YANDAL belum punya token. Pilih petugas + konfirmasi di layar berikutnya.
          _salah = 0;
          if (mounted) Navigator.pop(context, tiket);
          return;
        case LoginSelesai(:final sesi):
          s = sesi;
      }
      await widget.deps.master.segarkan(s);
      // Wajib sebelum input ROW (PRD F-ROW-INPUT), hanya untuk petugas ROW. v0.56.1: dulu dipanggil untuk semua akun,
      // jadi ADMIN / SUPER / ADMIN_ES / petugas non-ROW gagal login dengan AKSES_DITOLAK (getKodeRow khusus petugas ROW).
      if (s.petugasRow) await widget.deps.sync.tarikKode(s);
      _salah = 0;
      if (mounted) Navigator.pop(context, s);
    } on ApiException catch (e) {
      if (!mounted) return;
      final kartu = jenisLoginGagal(e.kode);
      if (kartu == JenisLoginGagal.salah) {
        _salah++;
        _password.clear(); // kata sandi diketik ulang, username tetap
      }
      // v0.63.2 (keputusan kvlar 8 Okt 2026): ada kartu = pesan merah di atas kolom tidak ditampilkan (tidak dobel)
      setState(() => _pesan = kartu == null ? KodeError.pesan(e.kode) : null);
      if (kartu != null) await tampilkanLoginGagal(context, kode: e.kode, username: _username.text, percobaan: _salah);
    } catch (_) {
      if (mounted) setState(() => _pesan = 'Tidak bisa terhubung. Cek sinyal.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  InputDecoration _dek(String label, String hint, IconData ikon, Color aksen, {Widget? suffix}) {
    OutlineInputBorder b(double w) =>
        OutlineInputBorder(borderRadius: BorderRadius.circular(11), borderSide: BorderSide(color: aksen, width: w));
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(ikon, color: aksen),
      suffixIcon: suffix,
      isDense: true,
      filled: true,
      fillColor: aksen.withValues(alpha: .06),
      border: b(1.5),
      enabledBorder: b(1.5),
      focusedBorder: b(1.8),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
        clipBehavior: Clip.antiAlias,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // v1.0.19: strip Jaringan SiSi di atas form
          Container(
            height: 10,
            decoration:
                const BoxDecoration(gradient: LinearGradient(colors: [AppColors.brand800, AppColors.brand500, AppColors.accent400])),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(
                child: Container(
                    width: 40, height: 4, decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4))),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(gradient: SisiMotif.gradien, borderRadius: BorderRadius.circular(13)),
                  child: const Icon(Icons.lock_person_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                const Expanded(
                    child: Text('Masuk ke akun', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: AppColors.brand950))),
                SizedBox(
                  width: 32,
                  height: 32,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    style: IconButton.styleFrom(
                        minimumSize: const Size(32, 32), backgroundColor: AppColors.neutral100, shape: const CircleBorder()),
                    onPressed: _proses ? null : () => Navigator.pop(context),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ),
              ]),
              const Text('Gunakan akun yang terdaftar di ULP kamu.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
              const SizedBox(height: 16),
              if (_pesan != null) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(11)),
                  child: Row(children: [
                    const Icon(Icons.error_outline, size: 18, color: AppColors.red600),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700))),
                  ]),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: _username,
                enabled: !_proses,
                autocorrect: false,
                enableSuggestions: false,
                decoration: _dek('Username (Kode Unit.Tim)', 'cth. 16130.row01', Icons.person_outline, AppColors.navy700),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                enabled: !_proses,
                obscureText: !_lihat,
                onSubmitted: (_) => _proses ? null : _masuk(),
                decoration: _dek('Kata sandi', 'Masukkan kata sandi', Icons.lock_outline, AppColors.amber600,
                    suffix: IconButton(
                      icon: Icon(_lihat ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                      onPressed: () => setState(() => _lihat = !_lihat),
                    )),
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 48,
                child: FilledButton(
                  onPressed: _proses ? null : _masuk,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.amber600,
                    foregroundColor: AppColors.navy950,
                    // saat proses tombol nonaktif tapi warnanya tetap amber (bukan abu-abu)
                    disabledBackgroundColor: AppColors.amber600,
                    disabledForegroundColor: AppColors.navy950,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                  ),
                  child: _proses
                      ? const Row(mainAxisSize: MainAxisSize.min, children: [
                          SisiLoader(ukuran: 18, warna: AppColors.navy950),
                          SizedBox(width: 10),
                          Text('Verifikasi Akun'),
                        ])
                      : const Text('Masuk'),
                ),
              ),
              const SizedBox(height: 12),
              const Text('Data kamu terenkripsi & hanya bisa diakses oleh tim yang berwenang.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _DialogBerhasil extends StatelessWidget {
  const _DialogBerhasil({required this.sesi});
  final Sesi sesi;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 76,
            height: 76,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: [AppColors.success600, AppColors.success700]),
            ),
            child: const Icon(Icons.check_rounded, color: Colors.white, size: 44),
          ),
          const SizedBox(height: 14),
          const Text('LOGIN BERHASIL',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1, color: AppColors.success700)),
          const SizedBox(height: 4),
          const Text('Selamat Datang! 👋', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(14)),
            child: Column(children: [
              Text(sesi.nama, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text('${sesi.username} · ${sesi.role}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
              if (sesi.petugasShift.isNotEmpty)
                Text(sesi.petugasShift.join(' & '),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy700)),
            ]),
          ),
          const SizedBox(height: 14),
          const SisiLoader(ukuran: 20),
          const SizedBox(height: 8),
          const Text('Mengalihkan ke dashboard...', style: TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
        ]),
      ),
    );
  }
}
