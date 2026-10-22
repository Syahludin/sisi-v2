import 'dart:async';

import 'package:flutter/material.dart';

import '../../widgets/sisi_loader.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'form_eksekusi_screen.dart';
import 'form_header_screen.dart';
import 'perbaikan_repository.dart';
import 'row_repository.dart';

/// M4 (v0.62): Pusat Masalah Sinkron. Semua operasi KONFLIK / DITOLAK dengan tindakannya
/// (PRD 13. Spesifikasi M4 bagian 4.C sampai 4.G).
class MasalahSyncScreen extends StatefulWidget {
  const MasalahSyncScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<MasalahSyncScreen> createState() => _MasalahSyncScreenState();
}

class _MasalahSyncScreenState extends State<MasalahSyncScreen> {
  List<MasalahSync>? _m;
  bool _proses = false;

  PerbaikanRepository get _p => widget.deps.perbaikan;

  @override
  void initState() {
    super.initState();
    unawaited(_muat());
  }

  Future<void> _muat() async {
    final m = await _p.daftarMasalah(widget.sesi.userId);
    if (mounted) setState(() => _m = m);
  }

  /// Tarik data server (getKodeRow) untuk tanggal yang bermasalah. Hasil per tanggal.
  Future<Map<String, Map<String, dynamic>>> _tarik({String? tanggal}) async {
    final daftar = tanggal != null ? {tanggal} : await _p.tanggalMasalah(widget.sesi.userId);
    final hasil = <String, Map<String, dynamic>>{};
    for (final t in daftar) {
      hasil[t] = await widget.deps.sync.tarikKode(widget.sesi, tanggal: t);
    }
    return hasil;
  }

  Future<void> _jalan(Future<String?> Function() fn) async {
    if (_proses) return;
    setState(() => _proses = true);
    try {
      final pesan = await fn();
      if (mounted && pesan != null) tampilPesan(context, pesan);
      unawaited(widget.deps.syncCtl.sinkron());
    } on ApiException catch (e) {
      if (mounted) {
        tampilPesan(context, e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk ini. Coba lagi saat online.' : KodeError.pesan(e.kode));
      }
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } on StateError catch (e) {
      if (mounted) tampilPesan(context, e.message);
    } catch (e) {
      // Exception = jaringan (timeout / socket); Error = bug di HP, jangan disamarkan jadi "tidak ada sinyal".
      if (mounted) {
        tampilPesan(context, e is Exception ? 'Butuh sinyal untuk ini. Coba lagi saat online.' : 'Terjadi kesalahan di HP ($e). Laporkan ke admin.');
      }
    } finally {
      if (mounted) setState(() => _proses = false);
      await _muat();
    }
  }

  Future<bool> _yakin(String judul, String isi, String tombol) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
        content: Text(isi),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Kembali')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.red600, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(c, true),
            child: Text(tombol),
          ),
        ],
      ),
    );
    return ok == true;
  }

  // ---------- tindakan ----------

  Future<void> _mintaNomorBaru() => _jalan(() async {
        await _tarik();
        final g = await widget.deps.syncCtl.tanpaSync(() => _p.mintaNomorBaru(widget.sesi));
        if (g.isEmpty) return 'Tidak ada nomor yang bentrok.';
        return 'Nomor diganti: ${g.map((x) => '${x.lama.split('-').last} ke ${x.baru.split('-').last}').join(', ')}.';
      });

  Future<void> _gabungHeader(MasalahSync m) => _jalan(() async {
        await _tarik(tanggal: m.tanggal);
        final kode = await widget.deps.syncCtl.tanpaSync(() => _p.gabungKeHeaderServer(widget.sesi, m.id));
        return 'Digabung ke laporan $kode.';
      });

  Future<void> _gabungPenyulang(MasalahSync m) => _jalan(() async {
        await _tarik(tanggal: m.tanggal);
        final kode = await widget.deps.syncCtl.tanpaSync(() => _p.gabungKePenyulangServer(widget.sesi, m.id));
        return 'Eksekusi dipindah ke $kode.';
      });

  Future<void> _pakaiServer(MasalahSync m) => _jalan(() async {
        await widget.deps.syncCtl.tanpaSync(() => _p.buang(widget.sesi, m.opId));
        if (m.tanggal != null) await _tarik(tanggal: m.tanggal);
        return 'Data HP diganti dengan data server.';
      });

  Future<void> _kirimUlang(MasalahSync m) => _jalan(() async {
        final d = (await _tarik(tanggal: m.tanggal))[m.tanggal];
        final daftar = (d?[m.jenis] as List<dynamic>? ?? const <dynamic>[]).whereType<Map<dynamic, dynamic>>();
        final server = daftar.where((x) => x['id'] == m.id).toList();
        if (server.isEmpty) throw RowError('Data ini tidak ada di server.');
        final rev = (server.first['revision'] as num?)?.toInt() ?? 0;
        await widget.deps.syncCtl.tanpaSync(() => _p.kirimUlang(widget.sesi, m.opId, rev));
        return 'Perubahan HP ini dikirim ulang.';
      });

  Future<void> _hapus(MasalahSync m) async {
    final buat = m.aksi == 'buat';
    final ok = await _yakin(
      buat ? 'Hapus dari HP?' : 'Buang perubahan?',
      buat
          ? '${m.kode} dan turunannya belum pernah masuk server. Data ini dihapus dari HP dan tidak bisa dikembalikan.'
          : 'Perubahan ${m.kode} di HP ini dibuang, data server yang dipakai.',
      buat ? 'Hapus' : 'Buang',
    );
    if (!ok) return;
    await _jalan(() async {
      await widget.deps.syncCtl.tanpaSync(() => _p.buang(widget.sesi, m.opId));
      if (!buat && m.tanggal != null && PerbaikanRepository.dalamBatas(m.kode)) await _tarik(tanggal: m.tanggal);
      return buat ? 'Dihapus dari HP.' : 'Perubahan dibuang.';
    });
  }

  Future<void> _perbaiki(MasalahSync m) async {
    final r = widget.deps.row;
    Widget? layar;
    if (m.jenis == 'header') {
      final h = await r.header(m.id);
      if (h != null) layar = FormHeaderScreen(deps: widget.deps, sesi: widget.sesi, header: h);
    } else if (m.jenis == 'eksekusi') {
      final e = await r.eksekusi(m.id);
      final real = e == null ? null : await r.realisasi(e.realisasiId);
      if (e != null && real != null) layar = FormEksekusiScreen(deps: widget.deps, sesi: widget.sesi, realisasi: real, edit: e);
    }
    if (!mounted) return;
    if (layar == null) {
      tampilPesan(context, 'Data tidak ditemukan di HP.');
      return;
    }
    final tujuan = layar;
    await Navigator.push(context, MaterialPageRoute(builder: (_) => tujuan));
    await _muat();
    unawaited(widget.deps.syncCtl.sinkron());
  }

  // ---------- tampilan ----------

  static const _labelJenis = {'header': 'Laporan', 'realisasi': 'Penyulang', 'eksekusi': 'Eksekusi'};
  static const _labelAksi = {'buat': 'baru', 'ubah': 'perubahan', 'batal': 'pembatalan'};

  String _keterangan(MasalahSync m) => switch (m.tipe) {
        'BENTROK' => 'Nomor ini sudah dipakai HP lain di sub-tim yang sama.',
        'IKUT_INDUK' => 'Menunggu laporan/penyulang di atasnya beres dulu. Nanti ikut terkirim otomatis.',
        'HEADER_GANDA' => 'Sub-tim ini sudah punya laporan di tanggal itu dari HP lain.',
        'PENYULANG_GANDA' => 'Penyulang ini sudah ditambahkan HP lain di laporan yang sama.',
        'REVISI' => 'Data ini sudah diubah di HP lain atau oleh admin.',
        'TERKUNCI' => 'Lewat 7 hari, tidak bisa dikirim lagi.',
        _ => KodeError.alasanSinkron(m.alasan),
      };

  List<Widget> _tombol(MasalahSync m) {
    final hapus = TextButton(
      onPressed: _proses ? null : () => _hapus(m),
      style: TextButton.styleFrom(foregroundColor: AppColors.red700),
      child: Text(m.aksi == 'buat' ? 'Hapus dari HP' : 'Buang'),
    );
    FilledButton utama(String label, VoidCallback fn) => FilledButton(onPressed: _proses ? null : fn, child: Text(label));
    return switch (m.tipe) {
      'BENTROK' => [hapus],
      'IKUT_INDUK' => [hapus],
      'HEADER_GANDA' => [hapus, utama('Gabungkan', () => _gabungHeader(m))],
      'PENYULANG_GANDA' => [hapus, utama('Gabungkan', () => _gabungPenyulang(m))],
      'REVISI' => [
          TextButton(onPressed: _proses ? null : () => _kirimUlang(m), child: const Text('Kirim ulang punya saya')),
          utama('Pakai data server', () => _pakaiServer(m)),
        ],
      'PERBAIKI' => [hapus, utama('Perbaiki', () => _perbaiki(m))],
      'BUANG' => [utama('Pakai data server', () => _pakaiServer(m))],
      _ => [hapus],
    };
  }

  @override
  Widget build(BuildContext context) {
    final m = _m;
    final adaBentrok = m?.any((x) => x.tipe == 'BENTROK') ?? false;
    return Scaffold(
      backgroundColor: AppColors.neutral100,
      appBar: sisiAppBar('Perlu Tindakan', subjudul: 'Data yang belum bisa terkirim'),
      body: m == null
          ? const SisiLoading(ukuran: 60)
          : m.isEmpty
              ? const SisiKosong(ikon: Icons.cloud_done_outlined, judul: 'Tidak ada masalah', pesan: 'Semua data bisa terkirim normal.')
              : ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
                  if (_proses) const Padding(padding: EdgeInsets.only(bottom: 12), child: Center(child: SisiLoader(ukuran: 28))),
                  if (adaBentrok) ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(14)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        const Text('Ada nomor yang bentrok dengan HP lain.',
                            style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
                        const SizedBox(height: 4),
                        const Text('Satu ketukan: HP minta nomor berikutnya dari server lalu mengganti nomor data + turunannya. Butuh sinyal.',
                            style: TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
                        const SizedBox(height: 10),
                        FilledButton.icon(
                          onPressed: _proses ? null : _mintaNomorBaru,
                          icon: const Icon(Icons.autorenew_rounded),
                          label: const Text('Minta nomor baru'),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 14),
                  ],
                  for (final x in m) ...[
                    Container(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: x.status == 'DITOLAK' ? AppColors.red100 : AppColors.accent100, width: 1.4),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(
                            child: Text('${_labelJenis[x.jenis]} ${_labelAksi[x.aksi]}',
                                style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy900)),
                          ),
                          StatusBadge.sinkron(x.status),
                        ]),
                        const SizedBox(height: 2),
                        Text(x.kode, style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                        const SizedBox(height: 6),
                        Text(_keterangan(x), style: const TextStyle(fontSize: 12.5, color: AppColors.neutral900)),
                        // Kode kecil untuk admin saat dilaporkan, bukan untuk dibaca petugas.
                        Text('Kode bantuan: ${x.alasan}', style: const TextStyle(fontSize: 10, color: AppColors.neutral400)),
                        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          for (final t in _tombol(x)) Padding(padding: const EdgeInsets.only(left: 6), child: t),
                        ]),
                      ]),
                    ),
                    const SizedBox(height: 10),
                  ],
                ]),
    );
  }
}
