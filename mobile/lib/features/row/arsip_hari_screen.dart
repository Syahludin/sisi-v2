import 'dart:async';

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import 'foto_repository.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// Arsip > Lihat Pekerjaan (v0.37): semua pekerjaan satu tanggal (header > penyulang/realisasi > eksekusi + 3 foto).
/// Pertama kali dibuka butuh sinyal (getArsipHariRow), lalu tersimpan di HP dan bisa dibuka offline.
/// Foto diunduh saat kartu eksekusi dibuka (getFotoArsipRow), juga disimpan di HP.
class ArsipHariScreen extends StatefulWidget {
  const ArsipHariScreen({super.key, required this.deps, required this.sesi, required this.tanggal, this.headerId, this.timId});
  final Deps deps;
  final Sesi sesi;
  final String tanggal; // yyyy-MM-dd
  final String? headerId; // laporan yang ditaruh paling atas (dari kartu arsip)
  final String? timId; // v0.50: menu Operasi > Laporan per Tim (admin). null = tim sesi

  @override
  State<ArsipHariScreen> createState() => _ArsipHariScreenState();
}

class _ArsipHariScreenState extends State<ArsipHariScreen> {
  static const _pesanSinyal = 'Butuh sinyal untuk membuka tanggal ini pertama kali. Coba lagi saat online.';
  Map<String, dynamic>? _data;
  DateTime? _diunduh;
  bool _memuat = true;
  String? _pesan;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat({bool paksa = false}) async {
    setState(() {
      _memuat = true;
      _pesan = null;
    });
    final repo = widget.deps.laporan;
    // v0.50: hari ini (admin) masih berubah, jadi selalu coba server dulu; salinan HP hanya cadangan offline.
    if (!paksa && !_hariIni) {
      final lokal = await repo.arsipHariLokal(widget.sesi.userId, widget.tanggal, timId: widget.timId);
      if (lokal != null) {
        if (!mounted) return;
        setState(() {
          _data = lokal.data;
          _diunduh = lokal.diunduh;
          _memuat = false;
        });
        return;
      }
    }
    try {
      final d = await repo.unduhArsipHari(widget.sesi, widget.tanggal, timId: widget.timId);
      if (!mounted) return;
      setState(() {
        _data = d;
        _diunduh = DateTime.now();
        _memuat = false;
      });
    } on ApiException catch (e) {
      await _cadanganLokal();
      if (!mounted) return;
      setState(() {
        _memuat = false;
        _pesan = e.kode.startsWith('HTTP_') ? _pesanSinyal : KodeError.pesan(e.kode);
      });
    } catch (_) {
      await _cadanganLokal();
      if (!mounted) return;
      setState(() {
        _memuat = false;
        _pesan = _pesanSinyal;
      });
    }
  }

  bool get _hariIni => widget.tanggal == DateFormat('yyyy-MM-dd').format(DateTime.now());

  /// Server gagal: tampilkan salinan HP kalau ada (dipakai mode hari ini).
  Future<void> _cadanganLokal() async {
    if (_data != null) return;
    final lokal = await widget.deps.laporan.arsipHariLokal(widget.sesi.userId, widget.tanggal, timId: widget.timId);
    if (lokal == null || !mounted) return;
    setState(() {
      _data = lokal.data;
      _diunduh = lokal.diunduh;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tgl = DateFormat('EEEE, d MMMM y', 'id_ID').format(DateTime.parse(widget.tanggal));
    final laporan = daftarPeta(_data?['laporan']);
    final fokus = widget.headerId;
    if (fokus != null) {
      laporan.sort((a, b) => (a['headerId'] == fokus ? 0 : 1).compareTo(b['headerId'] == fokus ? 0 : 1));
    }
    Widget isi;
    if (_memuat && _data == null) {
      isi = const Center(child: SisiLoading(pesan: 'Memuat pekerjaan...', ukuran: 60));
    } else if (_data == null) {
      isi = ListView(children: [
        const SizedBox(height: 60),
        SisiKosong(
          ikon: Icons.cloud_off_outlined,
          judul: 'Belum tersimpan di HP',
          pesan: _pesan ?? _pesanSinyal,
          tombol: 'Coba lagi',
          onTombol: () => _muat(paksa: true),
        ),
      ]);
    } else {
      isi = ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        if (_pesan != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_pesan!, style: const TextStyle(fontSize: 12, color: AppColors.red700)),
          ),
        if (_diunduh != null)
          Text('Tersimpan di HP · diperbarui ${DateFormat('d MMM y HH:mm', 'id_ID').format(_diunduh!)}',
              style: const TextStyle(fontSize: 11, color: AppColors.neutral500)),
        const SizedBox(height: 10),
        if (laporan.isEmpty)
          const SisiKosong(
            ikon: Icons.event_busy_outlined,
            judul: 'Tidak ada pekerjaan',
            pesan: 'Tidak ada laporan AKTIF di tanggal ini.',
          ),
        for (final l in laporan) ...[
          _KartuHeader(l: l, deps: widget.deps, sesi: widget.sesi, tanggal: widget.tanggal, timId: widget.timId),
          const SizedBox(height: 14),
        ],
      ]);
    }
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: sisiAppBar('Pekerjaan', subjudul: tgl, actions: [
        TombolSegarkan(sibuk: _memuat, onPressed: () => _muat(paksa: true), tooltip: 'Muat ulang dari server'), // v1.0.22
      ]),
      body: RefreshSisi(onRefresh: () => _muat(paksa: true), child: isi),
    );
  }
}

/// List JSON jadi `List<Map<String, dynamic>>` (aman untuk null / isi bukan map).
List<Map<String, dynamic>> daftarPeta(Object? v) =>
    ((v as List?) ?? const []).whereType<Map<dynamic, dynamic>>().map((e) => Map<String, dynamic>.from(e)).toList();

String _teks(Object? v) {
  final s = v?.toString().trim() ?? '';
  return s.isEmpty ? '-' : s;
}

int _angka(Object? v) => (v as num?)?.toInt() ?? 0;

Widget _baris(String label, String nilai) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 118, child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.neutral500))),
        Expanded(child: Text(nilai, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700))),
      ]),
    );

Widget _hitung(int r, int s, int b, {bool kecil = false}) {
  Widget kotak(String l, int n) => Expanded(
        child: Column(children: [
          Text('$n', style: TextStyle(fontSize: kecil ? 13 : 16, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          Text(l, style: const TextStyle(fontSize: 10, color: AppColors.neutral500)),
        ]),
      );
  return Container(
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(11)),
    child: Row(children: [kotak('Rabas', r), kotak('Sedang', s), kotak('Besar', b)]),
  );
}

class _KartuHeader extends StatelessWidget {
  const _KartuHeader({required this.l, required this.deps, required this.sesi, required this.tanggal, this.timId});
  final Map<String, dynamic> l;
  final Deps deps;
  final Sesi sesi;
  final String tanggal;
  final String? timId;

  @override
  Widget build(BuildContext context) {
    final t = (l['total'] as Map?) ?? const {};
    final real = daftarPeta(l['realisasi']);
    String km(Object? v) => v == null ? '-' : '$v';
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.neutral200),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.cyan100, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.assignment_outlined, color: AppColors.navy700, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_teks(l['subTim']), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
              Text(_teks(l['kodeHeader']), style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
            ]),
          ),
          l['siapKirim'] == true
              ? const StatusBadge('SIAP WA', warna: AppColors.success700, latar: AppColors.success100)
              : const StatusBadge('TANPA WA', warna: AppColors.neutral700, latar: AppColors.neutral100),
        ]),
        const SizedBox(height: 10),
        _baris('KM', '${km(l['kmAwal'])} – ${km(l['kmAkhir'])}'),
        _baris('Koordinat awal', _teks(l['koordinatAwal'])),
        _baris('Koordinat akhir', _teks(l['koordinatAkhir'])),
        _baris('Kendala', _teks(l['kendala'])),
        _baris('Input oleh', _teks(l['inputOleh'])),
        const SizedBox(height: 8),
        _hitung(_angka(t['rabas']), _angka(t['sedang']), _angka(t['besar'])),
        const SizedBox(height: 10),
        _UnduhFotoArsip(
          daftar: [
            for (final r in real)
              for (final e in daftarPeta(r['eksekusi']))
                for (final f in daftarPeta(e['foto'])) (foto: f, kode: _teks(e['kode'])),
          ],
          deps: deps,
          sesi: sesi,
          tanggal: tanggal,
          timId: timId,
        ),
        const SizedBox(height: 10),
        Text('${real.length} penyulang', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.neutral700)),
        if (real.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Belum ada realisasi.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
          ),
        for (final r in real) ...[
          const SizedBox(height: 8),
          _KartuRealisasi(r: r, deps: deps, sesi: sesi, tanggal: tanggal, timId: timId),
        ],
      ]),
    );
  }
}

class _KartuRealisasi extends StatelessWidget {
  const _KartuRealisasi({required this.r, required this.deps, required this.sesi, required this.tanggal, this.timId});
  final Map<String, dynamic> r;
  final Deps deps;
  final Sesi sesi;
  final String tanggal;
  final String? timId;

  @override
  Widget build(BuildContext context) {
    final eks = daftarPeta(r['eksekusi']);
    final kurang = eks.where((e) => e['fotoLengkap'] != true).length;
    return Container(
      decoration: BoxDecoration(
        color: kurang == 0 && eks.isNotEmpty ? const Color(0xFFF3FBF6) : const Color(0xFFFFF9EE),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: kurang == 0 && eks.isNotEmpty ? AppColors.success100 : AppColors.accent100),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          title: Text(_teks(r['penyulang']), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Section: ${_teks(r['section'])}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
            Text('${eks.length} eksekusi${kurang > 0 ? ' · $kurang foto belum lengkap' : ''}',
                style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          ]),
          children: [
            if (eks.isEmpty) const Text('Belum ada eksekusi.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
            for (final e in eks) ...[
              _KartuEksekusi(e: e, deps: deps, sesi: sesi, tanggal: tanggal, timId: timId),
              const SizedBox(height: 8),
            ],
          ],
        ),
      ),
    );
  }
}

class _KartuEksekusi extends StatelessWidget {
  const _KartuEksekusi({required this.e, required this.deps, required this.sesi, required this.tanggal, this.timId});
  final Map<String, dynamic> e;
  final Deps deps;
  final Sesi sesi;
  final String tanggal;
  final String? timId;

  @override
  Widget build(BuildContext context) {
    final kode = _teks(e['kode']);
    final pendek = kode.split('-').last;
    final foto = {for (final f in daftarPeta(e['foto'])) f['slot'] as String: f};
    final waktu = DateTime.tryParse((e['waktu'] as String?) ?? '');
    final diameter = e['diameter'] == null ? '-' : 'Ø ${e['diameter']} cm';
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.neutral200),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 12),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          title: Text('$pendek · ${_teks(e['jenis'])}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          subtitle: Text('$diameter · ${_teks(e['section'])}', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
          trailing: e['fotoLengkap'] == true
              ? const Icon(Icons.photo_library_rounded, color: AppColors.success600, size: 20)
              : const Icon(Icons.hide_image_outlined, color: AppColors.amber600, size: 20),
          children: [
            _baris('Kode', kode),
            _baris('Section', _teks(e['section'])),
            _baris('Nomor tiang', _teks(e['nomorTiang'])),
            _baris('Koordinat tiang', _teks(e['koordinatTiang'])),
            _baris('Koordinat pekerjaan', _teks(e['koordinatPekerjaan'])),
            _baris('Diameter', diameter),
            _baris('Jenis', _teks(e['jenis'])),
            _baris('Input oleh', _teks(e['inputOleh'])),
            _baris('Diterima server', waktu == null ? '-' : DateFormat('d MMM y HH:mm', 'id_ID').format(waktu.toLocal())),
            const SizedBox(height: 10),
            Row(children: [
              for (final s in FotoRepository.slot) ...[
                Expanded(
                  child: _FotoArsip(
                    foto: foto[s],
                    slotFoto: s,
                    kodeEksekusi: kode,
                    deps: deps,
                    sesi: sesi,
                    tanggal: tanggal,
                    timId: timId,
                  ),
                ),
                if (s != FotoRepository.slot.last) const SizedBox(width: 8),
              ],
            ]),
          ],
        ),
      ),
    );
  }
}

/// Satu kotak foto arsip: unduh otomatis saat kartu eksekusi dibuka, ketuk = layar penuh (+ Simpan ke Galeri).
class _FotoArsip extends StatefulWidget {
  const _FotoArsip({
    required this.foto,
    required this.slotFoto,
    required this.kodeEksekusi,
    required this.deps,
    required this.sesi,
    required this.tanggal,
    this.timId,
  });
  final Map<String, dynamic>? foto;
  final String slotFoto;
  final String kodeEksekusi;
  final Deps deps;
  final Sesi sesi;
  final String tanggal;
  final String? timId;

  @override
  State<_FotoArsip> createState() => _FotoArsipState();
}

class _FotoArsipState extends State<_FotoArsip> {
  String? _path;
  bool _memuat = false;
  bool _gagal = false;

  @override
  void initState() {
    super.initState();
    if (widget.foto != null) _muat();
  }

  Future<void> _muat() async {
    setState(() {
      _memuat = true;
      _gagal = false;
    });
    try {
      final path = await widget.deps.laporan.fotoArsip(widget.sesi, widget.foto!, tanggal: widget.tanggal, timId: widget.timId);
      if (!mounted) return;
      setState(() {
        _path = path;
        _memuat = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _memuat = false;
        _gagal = true;
      });
    }
  }

  void _buka() {
    final path = _path;
    if (path == null) return;
    final label = FotoRepository.label[widget.slotFoto] ?? widget.slotFoto;
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => LihatFotoScreen(
        path: path,
        judul: 'Foto $label',
        keterangan: widget.kodeEksekusi,
        namaGaleri: '${widget.kodeEksekusi}_${widget.slotFoto}',
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final label = FotoRepository.label[widget.slotFoto] ?? widget.slotFoto;
    Widget isi;
    if (widget.foto == null) {
      isi = const Center(child: Icon(Icons.image_not_supported_outlined, color: AppColors.neutral400));
    } else if (_path != null) {
      isi = Image.file(File(_path!), fit: BoxFit.cover, cacheWidth: 480,
          errorBuilder: (context, error, stack) => const Center(child: Icon(Icons.broken_image_outlined, color: AppColors.red600)));
    } else if (_memuat) {
      isi = const Center(child: SisiLoader(ukuran: 22));
    } else {
      isi = Center(
        child: Icon(_gagal ? Icons.refresh_rounded : Icons.download_rounded, color: _gagal ? AppColors.red600 : AppColors.cyan600),
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AspectRatio(
        aspectRatio: 4 / 3,
        child: Material(
          color: AppColors.neutral100,
          borderRadius: BorderRadius.circular(10),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: widget.foto == null ? null : (_path != null ? _buka : (_memuat ? null : _muat)),
            child: isi,
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text(
        widget.foto == null ? '$label (tidak ada)' : (_gagal ? '$label · gagal, ketuk ulang' : label),
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 10.5, color: _gagal ? AppColors.red700 : AppColors.neutral700),
      ),
    ]);
  }
}

/// Tombol "Download semua foto" satu laporan (v0.37.2): unduh semua foto arsip ke HP (bisa dibuka offline)
/// lalu salin ke galeri HP (album SiSi ROW, nama Kode Eksekusi_SLOT). Foto yang sudah ada di HP tidak diunduh ulang.
/// Izin galeri ditolak = foto tetap tersimpan di HP, hanya tidak masuk galeri.
class _UnduhFotoArsip extends StatefulWidget {
  const _UnduhFotoArsip({required this.daftar, required this.deps, required this.sesi, required this.tanggal, this.timId});
  final List<({Map<String, dynamic> foto, String kode})> daftar;
  final Deps deps;
  final Sesi sesi;
  final String tanggal;
  final String? timId;

  @override
  State<_UnduhFotoArsip> createState() => _UnduhFotoArsipState();
}

class _UnduhFotoArsipState extends State<_UnduhFotoArsip> {
  int? _selesai; // null = tidak sedang mengunduh
  String? _hasil;

  Future<void> _unduh() async {
    final daftar = widget.daftar;
    setState(() {
      _selesai = 0;
      _hasil = null;
    });
    final izin = await FotoRepository.izinGaleri();
    var ok = 0, galeri = 0, gagal = 0;
    for (final x in daftar) {
      try {
        final path = await widget.deps.laporan.fotoArsip(widget.sesi, x.foto, tanggal: widget.tanggal, timId: widget.timId);
        ok++;
        if (izin) {
          try {
            await FotoRepository.keGaleri(path, nama: '${x.kode}_${x.foto['slot']}');
            galeri++;
          } catch (_) {
            // gagal galeri tidak membatalkan unduhan
          }
        }
      } catch (_) {
        gagal++;
      }
      if (!mounted) return;
      setState(() => _selesai = (_selesai ?? 0) + 1);
    }
    if (!mounted) return;
    setState(() {
      _selesai = null;
      _hasil = [
        '$ok dari ${daftar.length} foto tersimpan di HP',
        if (izin) '$galeri masuk galeri (album ${FotoRepository.albumGaleri})' else 'izin galeri ditolak, foto tidak masuk galeri',
        if (gagal > 0) '$gagal gagal (cek sinyal lalu ulangi)',
      ].join(' · ');
    });
    // v0.92.1: pop up hanya kalau semua foto berhasil; sebagian gagal cukup ringkasan di bawah tombol
    if (ok > 0 && gagal == 0) {
      unawaited(tampilPopupBerhasil(context,
          judul: 'Foto berhasil didownload',
          keterangan: izin
              ? '$ok foto, $galeri masuk galeri\nalbum ${FotoRepository.albumGaleri}'
              : '$ok foto tersimpan di HP\nIzin galeri ditolak, foto tidak masuk galeri'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.daftar.length;
    final jalan = _selesai;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      OutlinedButton.icon(
        onPressed: n == 0 || jalan != null ? null : _unduh,
        icon: const Icon(Icons.download_rounded, size: 18),
        label: Text(n == 0 ? 'Tidak ada foto' : 'Download semua foto ($n)'),
      ),
      if (jalan != null) ...[
        const SizedBox(height: 8),
        LinearProgressIndicator(value: n == 0 ? null : jalan / n, minHeight: 6, borderRadius: BorderRadius.circular(6)),
        const SizedBox(height: 4),
        Text('Mengunduh foto $jalan/$n...', style: const TextStyle(fontSize: 11.5, color: AppColors.neutral500)),
      ],
      if (_hasil != null) ...[
        const SizedBox(height: 6),
        Text(_hasil!, style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
      ],
    ]);
  }
}
