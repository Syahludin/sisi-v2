import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'yandal_login.dart';
import '../../widgets/sisi_loader.dart';

/// v0.63.0 (keputusan Master Guswan 7 Okt 2026): akun tim YANDAL memilih 1-2 petugas shift ini, lalu verifikasi
/// "Apakah user yang masuk saat ini adalah ...". Shift sudah dimulai HP lain = crew dikunci, cukup konfirmasi.
/// Hasil (pop): Sesi kalau berhasil masuk, null kalau batal / tiket habis (kembali ke login).
class PilihPetugasScreen extends StatefulWidget {
  const PilihPetugasScreen({super.key, required this.deps, required this.tiket});
  final Deps deps;
  final TiketYandal tiket;

  @override
  State<PilihPetugasScreen> createState() => _PilihPetugasScreenState();
}

class _PilihPetugasScreenState extends State<PilihPetugasScreen> {
  late List<String> _dipilih = [...widget.tiket.terpilih];
  bool _proses = false;
  String? _pesan;

  TiketYandal get _t => widget.tiket;

  void _ketuk(PetugasPilih p) {
    if (_proses || _t.crewTerkunci || p.sibuk) return;
    final baru = togglePetugas(_dipilih, p.petugasId, _t.maks);
    if (baru == null) {
      tampilPesan(context, 'Maksimal ${_t.maks} petugas per shift.');
      return;
    }
    setState(() => _dipilih = baru);
  }

  Future<void> _lanjut() async {
    if (_proses || _dipilih.isEmpty) return;
    final nama = _t.namaDari(_dipilih);
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (c) => _DialogVerifikasi(tiket: _t, nama: nama),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _proses = true;
      _pesan = null;
    });
    try {
      final Sesi s = await widget.deps.auth.mulaiShiftYandal(_t, _dipilih);
      await widget.deps.master.segarkan(s);
      if (mounted) Navigator.pop(context, s);
    } on ApiException catch (e) {
      if (!mounted) return;
      // tiket habis / shift sudah berganti = login ulang dari awal
      if (e.kode == 'TIKET_TIDAK_VALID' || e.kode == 'SHIFT_BERAKHIR' || e.kode == 'SHIFT_PERALIHAN') {
        tampilPesan(context, KodeError.pesan(e.kode));
        Navigator.pop(context);
        return;
      }
      setState(() => _pesan = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _pesan = 'Tidak bisa terhubung. Cek sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sampai = _t.sampai;
    return PopScope(
      canPop: !_proses,
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar('Petugas Shift', subjudul: _t.timNama),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.navy700, borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_t.timNama, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('Shift ${_t.shiftNo} (${_t.jamShift})',
                  style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
              Text('${_t.hari}, ${_t.tanggal}', style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
              if (sampai != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Sesi otomatis berakhir pukul ${jamWib(sampai)} WIB',
                      style: const TextStyle(color: AppColors.plnYellow, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
            ]),
          ),
          const SizedBox(height: 16),
          Text(
            _t.crewTerkunci
                ? 'Shift ini sudah dimulai di HP lain. Konfirmasi petugas di bawah untuk masuk.'
                : 'Pilih petugas yang bertugas shift ini (minimal 1, maksimal ${_t.maks}).',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.neutral700),
          ),
          const SizedBox(height: 10),
          if (_pesan != null)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(11)),
              child: Text(_pesan!, style: const TextStyle(fontSize: 12.5, color: AppColors.red700)),
            ),
          for (final p in _t.petugas)
            if (!_t.crewTerkunci || _dipilih.contains(p.petugasId))
              Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(color: _dipilih.contains(p.petugasId) ? AppColors.navy700 : AppColors.neutral200),
                ),
                child: CheckboxListTile(
                  value: _dipilih.contains(p.petugasId),
                  onChanged: _proses || _t.crewTerkunci || p.sibuk ? null : (_) => _ketuk(p),
                  title: Text(p.nama, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: p.sibuk ? const Text('Sedang bertugas di tim lain shift ini') : null,
                  controlAffinity: ListTileControlAffinity.leading,
                ),
              ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text('${_dipilih.length}/${_t.maks} dipilih', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              onPressed: _proses || _dipilih.isEmpty ? null : _lanjut,
              icon: _proses
                  ? const SisiLoader(ukuran: 18, warna: Colors.white)
                  : const Icon(Icons.verified_user_outlined),
              label: Text(_proses ? 'Memproses...' : 'Lanjut'),
            ),
          ),
        ]),
      ),
    );
  }
}

/// v0.65.11 (permintaan Master Guswan 9 Okt 2026): kartu verifikasi petugas yang lebih menarik. Isi sama dengan keputusan
/// 7 Okt 2026 (teksKonfirmasiPetugas): "Apakah user yang masuk saat ini adalah ... Jika sudah betul silahkan lanjut login".
/// Kepala bergradasi + ikon perisai, info tim / shift / sesi, kartu per petugas (avatar inisial), dua tombol lebar.
class _DialogVerifikasi extends StatelessWidget {
  const _DialogVerifikasi({required this.tiket, required this.nama});
  final TiketYandal tiket;
  final List<String> nama;

  @override
  Widget build(BuildContext context) {
    final sampai = tiket.sampai;
    Widget info(IconData ikon, String teks) => Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(ikon, size: 14, color: Colors.white70),
          const SizedBox(width: 4),
          Flexible(child: Text(teks, style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600))),
        ]);
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // kepala
            Container(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.brand900, AppColors.brand700, AppColors.brand500],
                ),
              ),
              child: Column(children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.16),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.45), width: 2),
                  ),
                  child: const Icon(Icons.verified_user_rounded, color: Colors.white, size: 32),
                ),
                const SizedBox(height: 10),
                const Text('Verifikasi Petugas',
                    style: TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: 0.2)),
                const SizedBox(height: 4),
                Text('${tiket.timNama} · Shift ${tiket.shiftNo}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                Wrap(alignment: WrapAlignment.center, spacing: 12, runSpacing: 6, children: [
                  info(Icons.calendar_today_rounded, '${tiket.hari}, ${tiket.tanggal}'),
                  info(Icons.schedule_rounded, tiket.jamShift),
                ]),
                if (sampai != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(20)),
                    child: Text('Sesi berakhir ${jamWib(sampai)} WIB',
                        style: const TextStyle(color: AppColors.accent700, fontSize: 11.5, fontWeight: FontWeight.w800)),
                  ),
                ],
              ]),
            ),
            // isi
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Apakah user yang masuk saat ini adalah',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.neutral900)),
                const SizedBox(height: 12),
                for (var i = 0; i < nama.length; i++)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.brand50,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.brand100),
                    ),
                    child: Row(children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(colors: [AppColors.brand700, AppColors.brand500]),
                        ),
                        child: Text(inisialPetugas(nama[i]),
                            style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(nama[i],
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.neutral950)),
                          Text('Petugas ${i + 1}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                        ]),
                      ),
                      const Icon(Icons.check_circle_rounded, color: AppColors.success600, size: 22),
                    ]),
                  ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12)),
                  child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(Icons.info_outline_rounded, size: 16, color: AppColors.neutral500),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Jika sudah betul silahkan lanjut login. Petugas yang dipilih tercatat di shift ini.',
                          style: TextStyle(fontSize: 12, height: 1.4, color: AppColors.neutral700)),
                    ),
                  ]),
                ),
              ]),
            ),
            // tombol
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
              child: Row(children: [
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context, false),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.neutral700,
                        side: const BorderSide(color: AppColors.neutral300),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: const Text('Bukan', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: SizedBox(
                    height: 48,
                    child: FilledButton.icon(
                      onPressed: () => Navigator.pop(context, true),
                      style: FilledButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                      icon: const Icon(Icons.login_rounded, size: 19),
                      label: const Text('Betul, lanjut login', style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
