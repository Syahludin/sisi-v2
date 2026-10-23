import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'pemakaian_model.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.85.0: menu Operasi "Pemakaian Engine" (OPS_ENGINE): satu layar untuk kuota harian Apps Script dan
/// Cloud Run per layanan (data nyata Cloud Monitoring). Menggantikan kartu Pemakaian Server di Pengaturan (v0.84.0).
class PemakaianEngineScreen extends StatefulWidget {
  const PemakaianEngineScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<PemakaianEngineScreen> createState() => _PemakaianEngineScreenState();
}

(Color, Color, String) warnaPakai(TingkatPakai t) => switch (t) {
      TingkatPakai.aman => (AppColors.success700, AppColors.success100, 'Aman'),
      TingkatPakai.waspada => (AppColors.accent700, AppColors.accent100, 'Waspada'),
      TingkatPakai.bahaya => (AppColors.red700, AppColors.red100, 'Hampir habis'),
    };

class _PemakaianEngineScreenState extends State<PemakaianEngineScreen> {
  RingkasPakai? _data;
  String? _galat;
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat({bool segarkan = false}) async {
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final j = await widget.deps.api.call('getPemakaian', token: widget.sesi.token, data: {if (segarkan) 'segarkan': true});
      if (mounted) setState(() => _data = RingkasPakai.dariJson(j));
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = KodeError.pesan(e.kode));
    } catch (_) {
      if (mounted) setState(() => _galat = 'Belum terbaca. Periksa sinyal lalu coba lagi.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Pemakaian Engine', subjudul: 'Kuota Apps Script + Cloud Run', actions: [
        TombolSegarkan(sibuk: _sibuk, onPressed: () => unawaited(_muat(segarkan: true))),
      ]),
      body: d == null
          ? Center(
              child: _sibuk
                  ? const SisiLoader()
                  : Padding(padding: const EdgeInsets.all(24), child: Text(_galat ?? 'Gagal memuat.', textAlign: TextAlign.center)))
          : RefreshSisi(
              onRefresh: () => _muat(segarkan: true),
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
                _Ringkas(d),
                if (_galat != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat!, style: const TextStyle(color: AppColors.red700))),
                const SizedBox(height: 14),
                _KartuAppsScript(d),
                const SizedBox(height: 14),
                _KartuCloudRun(d.cloudRun),
                const SizedBox(height: 12),
                const Text(
                    'Apps Script: perkiraan dari catatan SiSi (Google tidak menampilkan sisa kuota). Lewat 80% admin dapat notifikasi dan '
                    'salin foto migrasi berhenti otomatis. Cloud Run: data Cloud Monitoring, kuota gratis dihitung per akun billing '
                    '(semua layanan digabung), diperbarui tiap 10 menit.',
                    style: TextStyle(fontSize: 10.5, color: AppColors.neutral400)),
              ]),
            ),
    );
  }
}

class _Ringkas extends StatelessWidget {
  const _Ringkas(this.d);
  final RingkasPakai d;

  @override
  Widget build(BuildContext context) {
    final (warna, latar, label) = warnaPakai(d.statusGabung);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppColors.navy900, AppColors.navy600]),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(children: [
        const Icon(Icons.speed_rounded, color: Colors.white, size: 34),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('STATUS PEMAKAIAN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: .8, color: Colors.white70)),
            const SizedBox(height: 2),
            Text('Paket ${d.paket} · ${d.tanggal}', style: const TextStyle(fontSize: 12.5, color: Colors.white)),
          ]),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(99)),
          child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: warna)),
        ),
      ]),
    );
  }
}

class _Kartu extends StatelessWidget {
  const _Kartu({required this.ikon, required this.judul, required this.sub, required this.children, this.tingkat});
  final IconData ikon;
  final String judul;
  final String sub;
  final List<Widget> children;
  final TingkatPakai? tingkat;

  @override
  Widget build(BuildContext context) {
    final t = tingkat;
    final (warna, latar, label) = warnaPakai(t ?? TingkatPakai.aman);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t == null ? AppColors.neutral200 : warna.withValues(alpha: .45)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.navy700.withValues(alpha: .1), borderRadius: BorderRadius.circular(12)),
            child: Icon(ikon, color: AppColors.navy700),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(judul, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          if (t != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(99)),
              child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: warna)),
            ),
        ]),
        const SizedBox(height: 12),
        ...children,
      ]),
    );
  }
}

class _KartuAppsScript extends StatelessWidget {
  const _KartuAppsScript(this.d);
  final RingkasPakai d;

  @override
  Widget build(BuildContext context) {
    final cloudAktif = d.cloudRun?.aktif == true;
    return _Kartu(
      ikon: Icons.code_rounded,
      judul: 'Apps Script (kuota harian)',
      sub: 'Pemicu otomatis + panggilan luar',
      tingkat: d.status,
      children: [
        // perkiraan engine PDF dari catatan SiSi hanya kalau data nyata Cloud Run belum ada
        for (final b in d.baris.take(cloudAktif ? 2 : 3)) BatangPakai(b),
        if (d.fungsiTerberat.isNotEmpty)
          Text('Paling berat: ${d.fungsiTerberat.join(' · ')}', style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        if (d.direm.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.pause_circle_outline_rounded, size: 16, color: AppColors.accent700),
              const SizedBox(width: 6),
              Expanded(
                child: Text('Dihentikan sementara supaya kuota tidak habis: ${d.direm.join(', ')}',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.accent700, fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        if (d.riwayat.length > 1) ...[
          const SizedBox(height: 12),
          const Text('Pemicu 7 hari terakhir', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
          const SizedBox(height: 6),
          SizedBox(
            height: 46,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              for (final r in d.riwayat.reversed)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                      Container(
                        height: 4.0 + 26.0 * (r.pemicuPersen.clamp(0, 100) / 100),
                        decoration: BoxDecoration(color: warnaPakai(tingkatPakai(r.pemicuPersen)).$1, borderRadius: BorderRadius.circular(4)),
                      ),
                      const SizedBox(height: 3),
                      Text(r.tanggal.length >= 10 ? r.tanggal.substring(8, 10) : r.tanggal,
                          style: const TextStyle(fontSize: 9.5, color: AppColors.neutral500)),
                    ]),
                  ),
                ),
            ]),
          ),
        ],
      ],
    );
  }
}

class _KartuCloudRun extends StatelessWidget {
  const _KartuCloudRun(this.c);
  final CloudRunPakai? c;

  @override
  Widget build(BuildContext context) {
    final x = c;
    if (x == null || !x.aktif) {
      return _Kartu(
        ikon: Icons.cloud_outlined,
        judul: 'Cloud Run per layanan',
        sub: 'Belum tersambung',
        children: [
          Text(x?.pesan.isNotEmpty == true ? x!.pesan : 'Server belum mengirim data Cloud Run (backend lama?).',
              style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
          const SizedBox(height: 6),
          const Text('Isi Script Property CLOUD_RUN_PROJECT + akun layanan dengan peran Monitoring Viewer (lihat README).',
              style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
        ],
      );
    }
    return _Kartu(
      ikon: Icons.cloud_done_outlined,
      judul: 'Cloud Run per layanan',
      sub: 'Proyek ${x.proyek} · ${x.bulan} · hari ini ${angkaId(x.requestHari)} request',
      tingkat: x.tingkat,
      children: [
        const Text('Total semua layanan vs kuota gratis per bulan',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
        const SizedBox(height: 8),
        for (final b in x.baris) BatangPakai(b),
        if (x.layanan.isEmpty)
          const Text('Belum ada request ke layanan Cloud Run bulan ini.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
        for (final l in x.layanan) _BarisLayanan(l),
      ],
    );
  }
}

class _BarisLayanan extends StatelessWidget {
  const _BarisLayanan(this.l);
  final LayananCloudRun l;

  @override
  Widget build(BuildContext context) {
    final (warna, latar, _) = warnaPakai(tingkatPakai(l.persenVcpu));
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(Icons.dns_outlined, size: 18, color: AppColors.navy700),
          const SizedBox(width: 6),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(l.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text(l.nama, style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(99)),
            child: Text('${angkaId(l.persenVcpu)}% vCPU', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: warna)),
          ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          _Angka('Hari ini', '${angkaId(l.requestHari)} req'),
          _Angka('Bulan ini', '${angkaId(l.requestBulan)} req'),
          _Angka('vCPU-detik', angkaId(l.vcpuBulan)),
          _Angka('GiB-detik', angkaId(l.gibBulan)),
        ]),
      ]),
    );
  }
}

class _Angka extends StatelessWidget {
  const _Angka(this.label, this.nilai);
  final String label;
  final String nilai;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.neutral500)),
          Text(nilai, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
        ]),
      );
}

/// Satu batang pemakaian (judul, persen, progress, angka).
class BatangPakai extends StatelessWidget {
  const BatangPakai(this.b, {super.key});
  final BarisPakai b;

  @override
  Widget build(BuildContext context) {
    final (warna, latar, _) = warnaPakai(b.tingkat);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(b.judul, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy900))),
          Text('${angkaId(b.persen)}%', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, color: warna)),
        ]),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(value: b.rasio, minHeight: 8, color: warna, backgroundColor: latar),
        ),
        const SizedBox(height: 3),
        Text('${angkaId(b.dipakai)} / ${angkaId(b.batas)}${b.satuan.isEmpty ? '' : ' ${b.satuan}'}${b.catatan.isEmpty ? '' : ' · ${b.catatan}'}',
            style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
      ]),
    );
  }
}
