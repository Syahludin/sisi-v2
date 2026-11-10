import 'package:flutter/material.dart';

import 'package:geolocator/geolocator.dart';

import '../../core/api_client.dart';
import '../../core/cek_lokasi.dart';
import '../../core/deps.dart';
import '../../core/env.dart';
import '../../core/cek_versi.dart';
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
/// v1.0.19 (permintaan Master Guswan 23 Okt 2026): desain ulang Jaringan SiSi (latar gradien + motif tiang & kawat, logo bercahaya,
/// tombol kuning PLN), alur tetap sama.
/// PRD Alur B: login -> getMaster -> getKodeRow -> dashboard.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.deps, required this.onMasuk});
  final Deps deps;
  final void Function(Sesi) onMasuk;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

/// v1.0.28 (permintaan Master Guswan 23 Okt 2026): animasi pembuka. Siluet jaringan (tiang lalu kawat) tergambar lebih dulu,
/// disusul logo SiSi + judul, lalu tombol Login. Form username / password muncul pelan saat Login diketuk.
class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(vsync: this, duration: const Duration(milliseconds: 2800))..forward();
  late final Animation<double> _siluet = CurvedAnimation(parent: _intro, curve: const Interval(0, .55, curve: Curves.easeInOut));
  late final Animation<double> _logo = CurvedAnimation(parent: _intro, curve: const Interval(.5, .74, curve: Curves.easeOutBack));
  late final Animation<double> _teks = CurvedAnimation(parent: _intro, curve: const Interval(.58, .82, curve: Curves.easeOutCubic));
  late final Animation<double> _tombol = CurvedAnimation(parent: _intro, curve: const Interval(.74, 1, curve: Curves.easeOutBack));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) _intro.value = 1; // "Kurangi animasi" di HP
  }

  @override
  void dispose() {
    _intro.dispose();
    super.dispose();
  }

  /// Muncul: memudar masuk, naik [geser] px, membesar dari [skala].
  Widget _muncul(Animation<double> a, Widget child, {double geser = 0, double skala = 1}) => AnimatedBuilder(
        animation: a,
        child: child,
        builder: (_, c) => Opacity(
          opacity: a.value.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - a.value) * geser),
            child: Transform.scale(scale: skala + (1 - skala) * a.value, child: c),
          ),
        ),
      );

  Future<void> _bukaForm(BuildContext context) async {
    // v0.63.0: form mengembalikan Sesi (akun biasa) atau TiketYandal (akun YANDAL: pilih petugas dulu)
    final hasil = await showModalBottomSheet<Object>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      // v1.0.28: kartu username / password naik dengan tempo pelan
      sheetAnimationStyle: const AnimationStyle(duration: Duration(milliseconds: 750), reverseDuration: Duration(milliseconds: 320)),
      builder: (_) => _FormLogin(deps: widget.deps),
    );
    if (hasil == null || !context.mounted) return;
    Sesi? s = hasil is Sesi ? hasil : null;
    if (hasil is TiketYandal) {
      s = await Navigator.of(context).push<Sesi>(
        MaterialPageRoute(builder: (_) => PilihPetugasScreen(deps: widget.deps, tiket: hasil)),
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
    widget.onMasuk(masuk);
  }

  @override
  Widget build(BuildContext context) {
    final tinggi = MediaQuery.sizeOf(context).height;
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
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _siluet,
                builder: (_, __) => CustomPaint(painter: PolaJaringanPainter(alpha: .16, kerapatan: 5, progres: _siluet.value)),
              ),
            ),
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
                    _muncul(_logo, skala: .4, Container(
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
                    )),
                    const SizedBox(height: 22),
                    _muncul(_teks, geser: 18, Column(mainAxisSize: MainAxisSize.min, children: [
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
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.location_on, size: 13, color: AppColors.accent400),
                        const SizedBox(width: 4),
                        Text('PLN ULP ${Env.ulp.toUpperCase()}',
                            style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: .6, color: Colors.white)),
                      ]),
                    ),
                    ])),
                    const SizedBox(height: 38),
                    _muncul(_tombol, geser: 34, Column(mainAxisSize: MainAxisSize.min, children: [
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
                    const BannerUpdateLogin(), // v1.0.61: update aplikasi bisa dilakukan sebelum login
                    ])),
                  ]),
                ),
              ),
              const Positioned(
                left: 0,
                right: 0,
                bottom: 14,
                child: Text('Sistem Integrasi © 2026 · PLN ULP ${Env.ulp}',
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
  final _kodeStg = TextEditingController(); // v1.0.61: kode pengaman, kolom hanya tampil di APK staging
  final _fokusUser = FocusNode(), _fokusSandi = FocusNode(), _fokusKode = FocusNode(); // v1.0.20: sorot kartu kredensial
  bool _proses = false;
  bool _lihat = false;
  String? _pesan;
  int _salah = 0; // v0.62.3: salah berturut-turut di HP ini (untuk kartu login gagal)

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _kodeStg.dispose();
    _fokusUser.dispose();
    _fokusSandi.dispose();
    _fokusKode.dispose();
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
      final hasil = await widget.deps.auth.login(_username.text, _password.text, kodeStg: Env.isStaging ? _kodeStg.text : null);
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
      // v0.63.2 (keputusan Master Guswan 8 Okt 2026): ada kartu = pesan merah di atas kolom tidak ditampilkan (tidak dobel)
      setState(() => _pesan = kartu == null ? KodeError.pesan(e.kode) : null);
      if (kartu != null) await tampilkanLoginGagal(context, kode: e.kode, username: _username.text, percobaan: _salah);
    } catch (_) {
      if (mounted) setState(() => _pesan = 'Tidak bisa terhubung. Cek sinyal.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
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
          // v1.0.21 (permintaan Master Guswan 23 Okt 2026): warna sama dengan header / latar aplikasi (tanpa ujung kuning)
          Container(
            height: 10,
            decoration: const BoxDecoration(
                gradient: LinearGradient(colors: [AppColors.brand950, AppColors.brand800, AppColors.brand700], stops: [0, .62, 1])),
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
              // v1.0.20 (permintaan Master Guswan 23 Okt 2026): satu kartu kredensial (username + kata sandi) bergaya SiSi
              ListenableBuilder(
                listenable: Listenable.merge([_fokusUser, _fokusSandi, _fokusKode]),
                builder: (context, _) {
                  final fokus = _fokusUser.hasFocus || _fokusSandi.hasFocus || _fokusKode.hasFocus;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                          colors: [AppColors.brand50, Colors.white], begin: Alignment.topLeft, end: Alignment.bottomRight),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: fokus ? AppColors.brand600 : AppColors.neutral200, width: fokus ? 1.6 : 1),
                      boxShadow: [
                        BoxShadow(
                            color: (fokus ? AppColors.brand500 : AppColors.brand950).withValues(alpha: fokus ? .18 : .05),
                            blurRadius: fokus ? 18 : 10,
                            offset: const Offset(0, 6)),
                      ],
                    ),
                    child: Column(children: [
                      _KolomKredensial(
                        controller: _username,
                        fokus: _fokusUser,
                        aktif: !_proses,
                        label: 'USERNAME',
                        hint: 'cth. 16130.row01',
                        ikon: Icons.person_rounded,
                        latarIkon: SisiMotif.gradien,
                        warnaIkon: Colors.white,
                        aksiKeyboard: TextInputAction.next,
                        onSubmitted: (_) => _fokusSandi.requestFocus(),
                      ),
                      const Divider(height: 1, indent: 70, endIndent: 16),
                      _KolomKredensial(
                        controller: _password,
                        fokus: _fokusSandi,
                        aktif: !_proses,
                        label: 'KATA SANDI',
                        hint: 'Masukkan kata sandi',
                        ikon: Icons.key_rounded,
                        latarIkon: const LinearGradient(colors: [AppColors.accent400, AppColors.accent600]),
                        warnaIkon: AppColors.brand950,
                        rahasia: !_lihat,
                        aksiKeyboard: TextInputAction.done,
                        onSubmitted: (_) => _proses ? null : _masuk(),
                        suffix: IconButton(
                          tooltip: _lihat ? 'Sembunyikan kata sandi' : 'Lihat kata sandi',
                          icon: Icon(_lihat ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppColors.neutral500),
                          onPressed: () => setState(() => _lihat = !_lihat),
                        ),
                      ),
                      if (Env.isStaging) ...[
                        const Divider(height: 1, indent: 70, endIndent: 16),
                        _KolomKredensial(
                          controller: _kodeStg,
                          fokus: _fokusKode,
                          aktif: !_proses,
                          label: 'KODE PENGAMAN STAGING',
                          hint: 'Hanya admin yang tahu',
                          ikon: Icons.shield_rounded,
                          latarIkon: const LinearGradient(colors: [AppColors.accent400, AppColors.accent600]),
                          warnaIkon: AppColors.brand950,
                          rahasia: true,
                          aksiKeyboard: TextInputAction.done,
                          onSubmitted: (_) => _proses ? null : _masuk(),
                        ),
                      ],
                    ]),
                  );
                },
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

/// v1.0.20: satu baris kartu kredensial: kotak ikon berwarna, label kecil huruf besar, isian tanpa garis.
class _KolomKredensial extends StatelessWidget {
  const _KolomKredensial({
    required this.controller,
    required this.fokus,
    required this.aktif,
    required this.label,
    required this.hint,
    required this.ikon,
    required this.latarIkon,
    required this.warnaIkon,
    required this.aksiKeyboard,
    required this.onSubmitted,
    this.rahasia = false,
    this.suffix,
  });
  final TextEditingController controller;
  final FocusNode fokus;
  final bool aktif, rahasia;
  final String label, hint;
  final IconData ikon;
  final Gradient latarIkon;
  final Color warnaIkon;
  final TextInputAction aksiKeyboard;
  final ValueChanged<String> onSubmitted;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(gradient: latarIkon, borderRadius: BorderRadius.circular(13)),
            child: Icon(ikon, color: warnaIkon, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 10.5,
                      letterSpacing: 1,
                      fontWeight: FontWeight.w800,
                      color: fokus.hasFocus ? AppColors.brand700 : AppColors.neutral500)),
              TextField(
                controller: controller,
                focusNode: fokus,
                enabled: aktif,
                obscureText: rahasia,
                autocorrect: false,
                enableSuggestions: false,
                textInputAction: aksiKeyboard,
                onSubmitted: onSubmitted,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.brand950),
                decoration: InputDecoration(
                  hintText: hint,
                  isDense: true,
                  filled: false,
                  contentPadding: const EdgeInsets.only(top: 4, bottom: 2),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  disabledBorder: InputBorder.none,
                ),
              ),
            ]),
          ),
          if (suffix != null) suffix!,
        ]),
      );
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
