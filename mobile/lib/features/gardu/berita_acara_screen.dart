import 'package:flutter/material.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_widgets.dart';
import 'arsip_ba_lembar.dart';
import 'ba_penggantian_screen.dart';
import 'ba_pengoperasian_screen.dart';
import 'daftar_ba_screen.dart';

/// Perubahan status gardu oleh satu jenis BA: (dari, ke). dari kosong = gardu baru.
typedef AlurStatus = (String dari, String ke);

/// Satu jenis BA (nama = nilai kolom Jenis Pekerjaan di Rekap_BA). Isi kartu form mengikuti format v1.
class JenisBa {
  const JenisBa({
    required this.nama,
    required this.ikon,
    required this.warna,
    required this.kapan,
    required this.alur,
    required this.sumber,
    required this.kartu,
    required this.foto,
    this.siap = false,
  });
  final String nama;
  final IconData ikon;
  final Color warna;

  /// Kalimat sederhana "dipakai kalau ..." (v0.72.0: hub lebih mudah dipahami).
  final String kapan;

  /// Perubahan status gardu (db_Gardu) saat BA disimpan. Kosong = status tetap.
  final List<AlurStatus> alur;

  /// Asal data awal: gardu baru (nomor otomatis) atau pilih dari Master Gardu.
  final String sumber;
  final List<String> kartu;
  final List<String> foto;
  final bool siap;
}

/// Katalog BA. Trafo: 5 jenis sesuai v1. Switching menunggu db_Switching.
class KatalogBa {
  KatalogBa._();

  static const trafo = <JenisBa>[
    JenisBa(
      nama: 'Pengoperasian Trafo',
      ikon: Icons.add_circle_outline_rounded,
      warna: AppColors.success700,
      kapan: 'Pemasangan Gardu Baru untuk didaftarkan di EAM',
      alur: [('', 'AKTIF')],
      sumber: 'Input baru (bukan dari Master Gardu)',
      kartu: ['Identitas BA (prefix, nomor gardu, tanggal BA & pekerjaan)', 'Identitas Trafo', 'Identitas PHB-TR',
              'Data Pengoperasian (kepemilikan, OwnerId, External Ref, perluasan SUTM, vendor)', 'Pemeriksa & Mengetahui'],
      foto: ['Nameplate Trafo', 'Foto Full Gardu', 'Nameplate PHB-TR', 'Box PHB-TR'],
      siap: true,
    ),
    JenisBa(
      nama: 'Penggantian Trafo',
      ikon: Icons.swap_horiz_rounded,
      warna: AppColors.navy700,
      kapan: 'Penggantian Trafo / Box PHB-TR dengan Nomor Gardu yang sudah terdaftar di EAM',
      alur: [('AKTIF', 'AKTIF'), ('TIDAK AKTIF', 'AKTIF')],
      sumber: 'Pilih gardu dari Master Gardu',
      kartu: ['Identitas BA', 'Data Trafo Awal + PHB-TR Lama', 'Data Trafo Sesudah (asal trafo, jurusan)',
              'PHB-TR Sesudah (saklar: PHB-TR diganti / tetap)', 'Pemeriksa & Mengetahui'],
      foto: ['Nameplate Trafo Sebelum', 'Nameplate Trafo Sesudah', 'Konstruksi Trafo Sebelum & Sesudah (opsional)', 'Nameplate & Box PHB-TR Sesudah (jika PHB-TR diganti)'],
      siap: true,
    ),
    JenisBa(
      nama: 'Pemeriksaan Trafo',
      ikon: Icons.fact_check_outlined,
      warna: AppColors.cyan600,
      kapan: 'Trafo DIPERIKSA / diuji (megger). Gardu tidak berubah.',
      alur: [],
      sumber: 'Pilih gardu dari Master Gardu',
      kartu: ['Identitas BA', 'Data Trafo', 'Lampiran Pemeriksaan 1-6', 'Kesimpulan & Catatan', 'Pemeriksa & Mengetahui'],
      foto: ['Lampiran 1 s.d. 6'],
    ),
    JenisBa(
      nama: 'Pembongkaran Sementara Trafo',
      ikon: Icons.pause_circle_outline_rounded,
      warna: AppColors.amber700,
      kapan: 'Trafo DILEPAS SEMENTARA, nanti dipasang lagi. Nomor gardu tetap.',
      alur: [('AKTIF', 'TIDAK AKTIF')],
      sumber: 'Pilih gardu dari Master Gardu',
      kartu: ['Identitas BA', 'Data Trafo', 'Pembongkaran (alasan, lokasi penyimpanan, catatan)', 'Pemeriksa & Mengetahui'],
      foto: ['Nameplate Trafo', 'Foto Full Gardu'],
    ),
    JenisBa(
      nama: 'Pembongkaran Trafo',
      ikon: Icons.remove_circle_outline_rounded,
      warna: AppColors.red700,
      kapan: 'Gardu DIBONGKAR PERMANEN.',
      alur: [('AKTIF', 'BONGKAR RAMPUNG'), ('TIDAK AKTIF', 'BONGKAR RAMPUNG')],
      sumber: 'Pilih gardu dari Master Gardu',
      kartu: ['Identitas BA', 'Data Trafo', 'Pembongkaran (alasan, lokasi penyimpanan, catatan)', 'Pemeriksa & Mengetahui'],
      foto: ['Nameplate Trafo', 'Foto Full Gardu'],
    ),
  ];

  static const switching = <String>[
    'Pengoperasian Switching',
    'Penggantian Switching',
    'Relokasi Switching',
    'Pemeriksaan Switching',
    'Kerusakan Switching',
  ];
}

/// Warna chip status gardu.
(Color, Color) warnaStatusGardu(String s) => switch (s) {
      'AKTIF' => (AppColors.success700, AppColors.success100),
      'TIDAK AKTIF' => (AppColors.accent700, AppColors.accent100),
      'BONGKAR RAMPUNG' => (AppColors.red700, AppColors.red100),
      _ => (AppColors.navy700, AppColors.brand100),
    };

/// v0.69.0 menu Berita Acara Gardu (OPS_BA_GARDU, khusus admin). v0.72.0 (perbaikan kvlar 9 Okt 2026): tampilan dibuat
/// mudah dipahami tanpa menelaah: panduan 3 langkah, aksi Daftar BA & PDF terpisah dari jenis BA, tiap jenis punya
/// kalimat "dipakai kalau" + chip perubahan status gardu, jenis yang belum ada digabung di bawah.
class BeritaAcaraScreen extends StatelessWidget {
  const BeritaAcaraScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  bool get _bolehBuat => bolehLihatBa(sesi) && sesi.bisaUbah('OPS_BA_GARDU');

  Future<void> _buka(BuildContext context, JenisBa j) async {
    if (!bolehLihatBa(sesi)) {
      tampilPesan(context, 'Akses Berita Acara khusus ADMIN / SUPER.');
      return;
    }
    if (j.siap && (j.nama == 'Pengoperasian Trafo' || j.nama == 'Penggantian Trafo')) {
      if (!_bolehBuat) {
        tampilPesan(context, 'Akun ini hanya memiliki akses baca Berita Acara.');
        return;
      }
      final layar = j.nama == 'Penggantian Trafo' ? BaPenggantianScreen(deps: deps, sesi: sesi) : BaPengoperasianScreen(deps: deps, sesi: sesi);
      final ok = await Navigator.push(context, MaterialPageRoute<bool>(builder: (_) => layar));
      // v0.76.0: BA dikirim di latar belakang: langsung tampilkan Daftar BA (progres + PDF)
      if (ok == true && context.mounted) {
        await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => DaftarBaScreen(deps: deps, sesi: sesi)));
      }
      return;
    }
    return _infoJenis(context, j);
  }

  Future<void> _infoJenis(BuildContext context, JenisBa j) => showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (c) => ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * .85),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
            Row(children: [
              _IkonJenis(j, ukuran: 46),
              const SizedBox(width: 12),
              Expanded(child: Text(j.nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900))),
              _BadgeSiap(j.siap),
            ]),
            const SizedBox(height: 10),
            Text(j.kapan, style: const TextStyle(fontSize: 13, color: AppColors.neutral700, fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            _AlurChip(j),
            const SizedBox(height: 14),
            _Judul('Yang diisi di form', Icons.edit_note_rounded),
            for (final k in j.kartu) _Butir(k),
            const SizedBox(height: 10),
            _Judul('Foto / lampiran', Icons.photo_camera_outlined),
            for (final f in j.foto) _Butir(f, ikon: Icons.photo_outlined),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
              child: const Text('Form jenis BA ini sedang disiapkan. Untuk sekarang yang sudah bisa: Pengoperasian Trafo & Penggantian Trafo.',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.accent700)),
            ),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti')),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final siap = KatalogBa.trafo.where((j) => j.siap).toList();
    final segera = KatalogBa.trafo.where((j) => !j.siap).toList();
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FC),
      appBar: sisiAppBar('Berita Acara', subjudul: 'Gardu · ULP ${sesi.ulp}'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 120), children: [
        const _Panduan(),
        const SizedBox(height: 14),
        _AksiBesar(
          ikon: Icons.picture_as_pdf_rounded,
          judul: 'Lihat BA & PDF',
          sub: 'Lihat & download PDF, edit BA, progres kirim',
          onTap: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => DaftarBaScreen(deps: deps, sesi: sesi))),
        ),
        const SizedBox(height: 18),
        const _Judul('Buat BA baru · pilih sesuai pekerjaan', Icons.add_task_rounded),
        for (final j in siap) _KartuJenis(jenis: j, onTap: () => _buka(context, j)),
        const SizedBox(height: 10),
        _Judul('Segera hadir (${segera.length + KatalogBa.switching.length})', Icons.hourglass_top_rounded),
        Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: Column(children: [
              ExpansionTile(
                shape: const Border(),
                leading: const Icon(Icons.electrical_services_rounded, color: AppColors.navy700),
                title: Text('BA Trafo lainnya (${segera.length})',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                subtitle: const Text('Ketuk jenis untuk lihat isi form-nya', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                children: [for (final j in segera) _KartuJenis(jenis: j, onTap: () => _buka(context, j), ringkas: true)],
              ),
              const Divider(height: 1, color: AppColors.neutral100),
              ExpansionTile(
                shape: const Border(),
                leading: const Icon(Icons.toggle_on_outlined, color: AppColors.neutral500),
                title: Text('BA Switching (${KatalogBa.switching.length})',
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                subtitle: const Text('Menunggu data switching (db_Switching)', style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                children: [for (final s in KatalogBa.switching) _Butir(s, ikon: Icons.toggle_off_outlined)],
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Panduan extends StatelessWidget {
  const _Panduan();

  @override
  Widget build(BuildContext context) {
    Widget langkah(int no, IconData ikon, String teks) => Expanded(
          child: Column(children: [
            Stack(clipBehavior: Clip.none, children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .16), borderRadius: BorderRadius.circular(14)),
                child: Icon(ikon, color: Colors.white, size: 22),
              ),
              Positioned(
                right: -6,
                top: -6,
                child: Container(
                  width: 20,
                  height: 20,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: AppColors.plnYellow, shape: BoxShape.circle),
                  child: Text('$no', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                ),
              ),
            ]),
            const SizedBox(height: 6),
            Text(teks, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, height: 1.25, color: Colors.white, fontWeight: FontWeight.w600)),
          ]),
        );
    Widget panah() => const Padding(
          padding: EdgeInsets.only(bottom: 26),
          child: Icon(Icons.chevron_right_rounded, color: Colors.white54),
        );
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [AppColors.brand800, AppColors.brand600], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Cara membuat Berita Acara', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
        const SizedBox(height: 2),
        const Text('BA langsung tercatat di Rekap_BA dan mengubah Master Gardu. Nomor BA otomatis.',
            style: TextStyle(fontSize: 11, color: Colors.white70)),
        const SizedBox(height: 14),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          langkah(1, Icons.touch_app_rounded, 'Pilih jenis BA sesuai pekerjaan'),
          panah(),
          langkah(2, Icons.edit_note_rounded, 'Isi data + ambil 4 foto'),
          panah(),
          langkah(3, Icons.picture_as_pdf_rounded, 'Simpan, PDF dibuat otomatis'),
        ]),
      ]),
    );
  }
}

class _AksiBesar extends StatelessWidget {
  const _AksiBesar({required this.ikon, required this.judul, required this.sub, required this.onTap});
  final IconData ikon;
  final String judul;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.red100, width: 1.5)),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                child: Icon(ikon, color: AppColors.red600),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(judul, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                  const SizedBox(height: 2),
                  Text(sub, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
      );
}

class _KartuJenis extends StatelessWidget {
  const _KartuJenis({required this.jenis, required this.onTap, this.ringkas = false});
  final JenisBa jenis;
  final VoidCallback onTap;
  final bool ringkas;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Material(
          color: ringkas ? AppColors.neutral50 : Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Container(
              padding: EdgeInsets.all(ringkas ? 11 : 14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: jenis.siap ? jenis.warna.withValues(alpha: .35) : AppColors.neutral200, width: jenis.siap ? 1.5 : 1),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _IkonJenis(jenis, ukuran: ringkas ? 36 : 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(jenis.nama, style: TextStyle(fontSize: ringkas ? 13 : 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                    const SizedBox(height: 3),
                    Text(jenis.kapan, style: const TextStyle(fontSize: 11.5, height: 1.3, color: AppColors.neutral700)),
                    if (jenis.nama != 'Pengoperasian Trafo' && jenis.nama != 'Penggantian Trafo') ...[
                      const SizedBox(height: 8),
                      _AlurChip(jenis),
                    ],
                  ]),
                ),
                const SizedBox(width: 6),
                jenis.siap
                    ? Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                        decoration: BoxDecoration(color: jenis.warna, borderRadius: BorderRadius.circular(999)),
                        child: const Row(mainAxisSize: MainAxisSize.min, children: [
                          Text('Buat', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Colors.white)),
                          Icon(Icons.chevron_right_rounded, size: 16, color: Colors.white),
                        ]),
                      )
                    : const Padding(padding: EdgeInsets.only(top: 4), child: _BadgeSiap(false)),
              ]),
            ),
          ),
        ),
      );
}

/// Chip perubahan status gardu: [Gardu baru] -> [AKTIF], atau "Status gardu tetap".
class _AlurChip extends StatelessWidget {
  const _AlurChip(this.j);
  final JenisBa j;

  Widget _chip(String s) {
    final (warna, latar) = warnaStatusGardu(s);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
      child: Text(s.isEmpty ? 'Gardu baru' : s, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: warna)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (j.alur.isEmpty) {
      return const Row(children: [
        Icon(Icons.lock_outline_rounded, size: 13, color: AppColors.neutral500),
        SizedBox(width: 4),
        Text('Status gardu tetap', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.neutral500)),
      ]);
    }
    return Wrap(spacing: 8, runSpacing: 6, children: [
      for (final a in j.alur)
        Row(mainAxisSize: MainAxisSize.min, children: [
          _chip(a.$1),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 3), child: Icon(Icons.arrow_forward_rounded, size: 13, color: AppColors.neutral400)),
          _chip(a.$2),
        ]),
    ]);
  }
}

class _IkonJenis extends StatelessWidget {
  const _IkonJenis(this.j, {required this.ukuran});
  final JenisBa j;
  final double ukuran;

  @override
  Widget build(BuildContext context) => Container(
        width: ukuran,
        height: ukuran,
        decoration: BoxDecoration(color: j.warna.withValues(alpha: .12), borderRadius: BorderRadius.circular(ukuran * .3)),
        child: Icon(j.ikon, color: j.warna, size: ukuran * .52),
      );
}

class _BadgeSiap extends StatelessWidget {
  const _BadgeSiap(this.siap);
  final bool siap;

  @override
  Widget build(BuildContext context) => StatusBadge(siap ? 'BISA DIPAKAI' : 'SEGERA',
      warna: siap ? AppColors.success700 : AppColors.accent700, latar: siap ? AppColors.success100 : AppColors.accent100);
}

class _Judul extends StatelessWidget {
  const _Judul(this.teks, this.ikon);
  final String teks;
  final IconData ikon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8, left: 2),
        child: Row(children: [
          Icon(ikon, size: 17, color: AppColors.cyan600),
          const SizedBox(width: 7),
          Expanded(
            child: Text(teks.toUpperCase(),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .6, color: AppColors.navy700)),
          ),
        ]),
      );
}

class _Butir extends StatelessWidget {
  const _Butir(this.teks, {this.ikon = Icons.check_box_outlined});
  final String teks;
  final IconData ikon;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(ikon, size: 15, color: AppColors.cyan600),
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: const TextStyle(fontSize: 12.5, color: AppColors.neutral700))),
        ]),
      );
}
