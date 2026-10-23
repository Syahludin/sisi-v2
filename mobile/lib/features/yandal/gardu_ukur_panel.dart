import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/sisi_widgets.dart';
import '../gardu/gardu_model.dart';
import '../gardu/gardu_widgets.dart';
import '../row/kamera_screen.dart';
import '../row/row_repository.dart' show RowError;
import 'p0_model.dart';
import 'p0_repository.dart';
import '../../widgets/sisi_loader.dart';

/// v0.74.0 (draf disetujui kvlar 9 Okt 2026): Pengecekan Gardu di card Foto detail P0, SATU gardu per P0.
/// Alur: pilih gardu (Master Gardu, AKTIF, penyulang P0, bisa dicari) > isi 10 angka ukur > Simpan Pengukuran >
/// foto tiap nilai (tombol kamera di samping angkanya, Beban R dulu) > Foto Kondisi / Temuan (opsional).
/// Pratinjau hasil (kVA, %, kategori, ketidakseimbangan) dihitung langsung di HP, angka resmi dari server.
/// Sesudah disimpan gardu terkunci; angka + catatan bisa dikoreksi sampai P0 selesai. Foto Sesudah P0 terbuka setelah
/// 10 foto ukur lengkap.
class GarduUkurPanel extends StatefulWidget {
  const GarduUkurPanel({super.key, required this.deps, required this.sesi, required this.p0, required this.onBerubah, this.awalGardu});
  final Deps deps;
  final Sesi sesi;
  final P0Lokal p0;
  final ValueChanged<P0Lokal> onBerubah;
  final Gardu? awalGardu;

  @override
  State<GarduUkurPanel> createState() => _GarduUkurPanelState();
}

/// Warna fasa (kebiasaan PLN): R merah, S kuning, T hitam, N biru.
Color warnaFasa(String f) => switch (f) {
      'R' => const Color(0xFFDC2626),
      'S' => const Color(0xFFCA8A04),
      'T' => const Color(0xFF1F2937),
      _ => const Color(0xFF2563EB),
    };

class _GarduUkurPanelState extends State<GarduUkurPanel> {
  bool _proses = false;
  bool _unduh = false;
  Gardu? _gardu; // pilihan dari Master Gardu (belum ada draf)
  List<Gardu> _master = const [];
  bool _masterSiap = false;
  bool _aturanDuaHari = false;
  bool _semuaPenyulang = false; // v0.75.1: pilihan petugas kalau gardu section kosong / tidak cocok
  final Map<String, TextEditingController> _c = {for (final v in nilaiGardu) v.kunci: TextEditingController()};
  final _catatan = TextEditingController();
  String? _diisiDari; // id pengukuran (+ status simpan) yang isiannya sudah dimuat ke kolom

  P0Lokal get _x => widget.p0;
  GarduUkurLokal? get _g => _x.ukurGardu;
  bool get _habis => widget.sesi.habisShift(widget.deps.jam.sekarang());
  bool get _kunci => _x.selesai || _habis;
  bool get _sebelumDisimpan => _x.foto['SEBELUM']?.terkunci ?? false;

  /// Tanggal operasional shift (shift 3 = kemarin), cadangan tanggal WIB hari ini.
  String get _tglShift {
    final sh = widget.sesi.yandal?['shift'];
    final t = sh is Map<dynamic, dynamic> ? '${sh['tanggal'] ?? ''}' : '';
    return t.length == 10 ? t : Wib.tanggal(widget.deps.jam.sekarang());
  }

  @override
  void initState() {
    super.initState();
    _gardu = widget.awalGardu;
    _isiDariData();
    unawaited(_muatMaster());
  }

  @override
  void didUpdateWidget(GarduUkurPanel lama) {
    super.didUpdateWidget(lama);
    _isiDariData();
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    _catatan.dispose();
    super.dispose();
  }

  void _isiDariData() {
    final g = _g;
    if (g == null) return;
    final kunci = '${g.id}-${g.disimpan}';
    if (_diisiDari == kunci) return;
    final pertama = _diisiDari == null || !_diisiDari!.startsWith(g.id);
    _diisiDari = kunci;
    if (!g.disimpan && !pertama) return; // draf: kolom yang sedang diketik tidak ditimpa
    for (final v in nilaiGardu) {
      final n = g.nilai[v.kunci];
      if (n != null || g.disimpan) _c[v.kunci]!.text = n == null ? '' : teksUkur(n);
    }
    if (g.catatan.isNotEmpty || g.disimpan) _catatan.text = g.catatan;
  }

  Future<void> _muatMaster() async {
    try {
      await widget.deps.gardu.segarkanAturanYandal(widget.sesi);
    } catch (_) {/* pakai cache offline */}
    final semua = await widget.deps.gardu.semua();
    final aturan = await widget.deps.gardu.aturanGarduDuaHari();
    final terbaru = await widget.deps.gardu.ukurGarduTerbaru();
    final idShift = P0Repository.shiftIdSesi(widget.sesi);
    final p0Shift = idShift == null ? const <P0Lokal>[] : await widget.deps.p0.daftarShift(widget.sesi.userId, idShift);
    final lokal = [
      for (final p in p0Shift)
        if (p.id != _x.id && p.ukurGardu != null && p.ukurGardu!.disimpan)
          (
            garduId: p.ukurGardu!.garduId,
            noGardu: p.ukurGardu!.noGardu,
            tanggal: _tglShift,
            kva: p.ukurGardu!.kapasitas,
            bebanKva: p.ukurGardu!.hasil.kva,
            persen: p.ukurGardu!.hasil.persen,
            waktuBeban: waktuBebanGardu(p.ukurGardu!.foto['BEBAN_R']?.waktu ?? p.ukurGardu!.dibuat),
            penyulang: p.penyulang,
            section: p.ukurGardu!.section,
            alamat: p.ukurGardu!.alamat,
          ),
    ];
    final gabungan = gabungGarduUkurTerbaru(semua, terbaru, lokal: lokal);
    if (!mounted) return;
    setState(() {
      _master = gabungan;
      _aturanDuaHari = aturan ?? false;
      _masterSiap = true;
    });
  }

  Future<void> _unduhMaster() async {
    if (_unduh) return;
    setState(() => _unduh = true);
    try {
      await widget.deps.gardu.segarkan(widget.sesi);
      await _muatMaster();
      if (mounted) unawaited(tampilPopupBerhasil(context, judul: 'Master Gardu berhasil didownload', keterangan: 'Siap dipakai untuk memilih gardu'));
    } catch (_) {
      if (mounted) tampilPesan(context, 'Master Gardu gagal diunduh. Periksa sinyal.');
    } finally {
      if (mounted) setState(() => _unduh = false);
    }
  }

  String _kunciPny(String v) => v.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

  /// Gardu AKTIF di penyulang P0.
  /// Gardu AKTIF di penyulang P0.
  List<Gardu> get _diPenyulang =>
      [for (final g in _master) if (g.aktif && _kunciPny(g.penyulang) == _kunciPny(_x.penyulang)) g];

  /// v0.75.1 (permintaan kvlar 10 Okt 2026): hanya gardu di SECTION P0 (section_id, cadangan nama Section / PTS-LBS).
  /// P0 tanpa section, atau petugas memilih "Tampilkan semua", = semua gardu penyulang.
  bool get _saringSection => !_semuaPenyulang && (_x.sectionId.isNotEmpty || _x.section.trim().isNotEmpty);

  List<Gardu> get _pilihan {
    final semua = _diPenyulang;
    if (!_saringSection) return semua;
    final id = _x.sectionId, nama = _kunciPny(_x.section);
    bool cocok(Gardu g) =>
        (id.isNotEmpty && g.sectionId == id) ||
        (nama.isNotEmpty && (_kunciPny(g.section) == nama || _kunciPny(g.ptsLbs) == nama));
    return [for (final g in semua) if (cocok(g)) g];
  }

  String get _labelLingkup => _saringSection ? 'section ${_x.section}' : 'penyulang ${_x.penyulang}';

  double? _angka(String kunci) {
    final v = _c[kunci]!.text.trim().replaceAll(',', '.');
    if (v.isEmpty) return null;
    return double.tryParse(v);
  }

  Map<String, double?> get _nilaiIsian => {for (final v in nilaiGardu) v.kunci: _angka(v.kunci)};

  /// Isian yang sudah angka (untuk draf).
  Map<String, double> get _nilaiDraf => {for (final e in _nilaiIsian.entries) if (e.value != null && e.value!.isFinite) e.key: e.value!};

  /// Nilai isian untuk pratinjau (kosong = 0).
  Map<String, double> get _nilaiPratinjau => {for (final e in _nilaiIsian.entries) e.key: e.value ?? 0};

  bool _berubah(GarduUkurLokal g) =>
      _catatan.text.trim() != g.catatan || nilaiGardu.any((v) => _angka(v.kunci) != g.nilai[v.kunci]);

  GarduUkurLokal _templat(Gardu g) => GarduUkurLokal(
      id: '', garduId: g.id, noGardu: g.no, alamat: g.alamat, section: g.section.isNotEmpty ? g.section : g.ptsLbs,
      kapasitas: g.kva, garduLat: g.lat, garduLng: g.lng, nilai: const {}, dibuat: widget.deps.jam.sekarang(), disimpan: false);

  /// Gardu yang sedang dipakai: draf / pengukuran yang ada, atau pilihan master.
  GarduUkurLokal? get _aktif => _g ?? (_gardu == null ? null : _templat(_gardu!));

  Future<void> _pilihGardu() async {
    if (!_masterSiap) return;
    final draf = _g;
    if (draf != null && draf.disimpan) return;
    final g = await showModalBottomSheet<Gardu>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _SheetPilihGardu(
        penyulang: _saringSection ? _x.section : _x.penyulang,
        daftar: _pilihan,
        terpilih: draf?.garduId ?? _gardu?.id,
        tglShift: _aturanDuaHari ? _tglShift : null,
      ),
    );
    if (g == null || !mounted) return;
    if (draf != null && draf.garduId != g.id) {
      // ganti gardu = foto draf (watermark No Gardu lama) dihapus
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('Ganti ke ${g.no}?'),
          content: Text('${draf.foto.length} foto ${draf.noGardu} yang belum disimpan akan dihapus (watermark memakai No Gardu lama).'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Ganti gardu')),
          ],
        ),
      );
      if (ok != true || !mounted) return;
      try {
        final baru = await widget.deps.p0.buangDrafGardu(widget.sesi, _x);
        _diisiDari = null;
        if (mounted) widget.onBerubah(baru);
      } on RowError catch (e) {
        if (mounted) tampilPesan(context, e.pesan);
        return;
      }
    }
    if (mounted) setState(() => _gardu = g);
  }

  Future<void> _simpanBaru() async {
    final g = _g;
    if (_proses) return;
    if (_aktif == null) {
      tampilPesan(context, 'Pilih gardu dulu.');
      return;
    }
    final salah = P0Repository.cekNilaiGardu(_nilaiIsian);
    if (salah != null) {
      tampilPesan(context, salah);
      return;
    }
    if (g == null || !g.lengkapFotoWajib) {
      tampilPesan(context, 'Lengkapi foto ukur dulu (${g?.jumlahFotoWajib ?? 0} dari ${slotGarduWajib.length}).');
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Simpan pengukuran ${g.noGardu}?'),
        content: Text('10 angka dan ${g.foto.length} foto disimpan bersamaan. Gardu tidak bisa diganti setelah disimpan; '
            'angka masih bisa dikoreksi sampai P0 selesai.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cek lagi')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _proses = true);
    try {
      final baru = await widget.deps.p0.tambahUkurGardu(widget.sesi, _x, nilai: _nilaiIsian, catatan: _catatan.text);
      if (!mounted) return;
      widget.onBerubah(baru);
      tampilPesan(context, 'Pengukuran + foto disimpan. Foto Sesudah P0 sudah bisa diambil.');
      unawaited(widget.deps.syncCtl.sinkron());
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } catch (_) {
      if (mounted) tampilPesan(context, 'Pengukuran gagal disimpan. Coba lagi.');
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  Future<void> _simpanKoreksi() async {
    if (_g == null || _proses) return;
    final salah = P0Repository.cekNilaiGardu(_nilaiIsian);
    if (salah != null) {
      tampilPesan(context, salah);
      return;
    }
    setState(() => _proses = true);
    try {
      final baru = await widget.deps.p0.ubahUkurGardu(widget.sesi, _x, nilai: _nilaiIsian, catatan: _catatan.text);
      if (!mounted) return;
      widget.onBerubah(baru);
      tampilPesan(context, 'Koreksi pengukuran disimpan.');
      unawaited(widget.deps.syncCtl.sinkron());
    } on RowError catch (e) {
      if (mounted) tampilPesan(context, e.pesan);
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  bool _bolehFoto(String slot) {
    final a = _aktif;
    return a != null && a.foto[slot] == null && !_kunci && _sebelumDisimpan;
  }

  Future<void> _foto(String slot) async {
    final x = _x, a = _aktif;
    if (_proses) return;
    if (a == null) {
      tampilPesan(context, 'Pilih gardu dulu.');
      return;
    }
    final ada = a.foto[slot];
    if (ada != null) {
      await lihatFoto(context, path: ada.path, slot: labelSlotGardu[slot] ?? slot, keterangan: '${a.noGardu} · ${a.kodeTampil(x)}');
      return;
    }
    if (_kunci) {
      tampilPesan(context, x.selesai ? 'P0 sudah selesai.' : 'Jam shift sudah habis.');
      return;
    }
    if (!_sebelumDisimpan) {
      tampilPesan(context, 'Simpan foto Sebelum dulu.');
      return;
    }
    final pilih = _gardu;
    P0Lokal? baru;
    final f = await ambilFotoRow(context,
        slot: labelSlotGardu[slot] ?? slot,
        pratinjau: P0Repository.watermarkGardu(widget.sesi, x, a, slot, widget.deps.jam.sekarang()),
        bolehGaleri: false,
        p0: true,
        simpan: (foto) async {
          baru = await widget.deps.p0.simpanFotoGardu(widget.sesi, x, slot, foto,
              drafBaru: _g == null ? a : null,
              penyulangGardu: pilih?.penyulang ?? x.penyulang,
              nilaiDraf: _nilaiDraf,
              catatanDraf: _catatan.text.trim());
        });
    final b = baru;
    if (f == null || b == null || !mounted) {
      if (mounted) {
        final kini = await widget.deps.p0.satu(x.userId, x.id);
        if (kini != null && mounted) widget.onBerubah(kini);
      }
      return;
    }
    widget.onBerubah(b);
    final g = b.ukurGardu!;
    final teks = g.disimpan
        ? 'Foto ${labelSlotGardu[slot]} disimpan.'
        : g.lengkapFotoWajib
            ? 'Foto ukur lengkap. Tekan Simpan Pengukuran.'
            : 'Foto ${labelSlotGardu[slot]} diambil (${g.jumlahFotoWajib}/${slotGarduWajib.length}).';
    tampilPesan(context, '$teks${f.lat == null ? ' TANPA koordinat.' : ''}');
    if (g.disimpan) unawaited(widget.deps.syncCtl.sinkron());
  }

  // ---------------- tampilan ----------------

  Widget _judul() => Row(children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(9)),
          child: const Icon(Icons.electrical_services_rounded, size: 18, color: AppColors.brand700),
        ),
        const SizedBox(width: 8),
        const Expanded(child: Text('Pengecekan Gardu', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy900))),
        if (_proses) const SisiLoader(ukuran: 16),
      ]);

  Widget _kotakPilihGardu() {
    final draf = _g;
    if (draf != null) {
      return SorotGardu(
        noGardu: draf.noGardu,
        kva: draf.kapasitas,
        alamat: draf.alamat,
        penyulang: _x.penyulang,
        section: draf.section,
        terakhir: 'Draf · ${draf.foto.length} foto belum disimpan',
        trailing: _kunci
            ? null
            : IconButton(
                tooltip: 'Ganti gardu',
                onPressed: () => unawaited(_pilihGardu()),
                icon: const Icon(Icons.swap_horiz_rounded, color: Colors.white),
              ),
      );
    }
    if (!_masterSiap) return const Padding(padding: EdgeInsets.all(12), child: Center(child: SisiLoader()));
    if (_master.isEmpty) {
      return _Info(
        ikon: Icons.cloud_download_outlined,
        teks: 'Master Gardu belum ada di HP. Unduh dulu untuk memilih gardu.',
        aksi: TextButton.icon(
          onPressed: _unduh ? null : () => unawaited(_unduhMaster()),
          icon: _unduh
              ? const SisiLoader(ukuran: 14)
              : const Icon(Icons.download_rounded, size: 18),
          label: const Text('Unduh'),
        ),
      );
    }
    final g = _gardu;
    if (g != null) {
      return SorotGardu(
        noGardu: g.no,
        kva: g.kva,
        alamat: g.alamat,
        penyulang: g.penyulang,
        section: g.section.isNotEmpty ? g.section : g.ptsLbs,
        terakhir: g.tglUkur.isEmpty ? 'Belum pernah diukur' : 'Ukur terakhir ${tanggalPendek(g.tglUkur)} · ${angkaId(g.persen)}%',
        trailing: _kunci
            ? null
            : IconButton(
                tooltip: 'Ganti gardu',
                onPressed: () => unawaited(_pilihGardu()),
                icon: const Icon(Icons.swap_horiz_rounded, color: Colors.white),
              ),
      );
    }
    final n = _pilihan.length;
    return Material(
      color: AppColors.brand50,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: _kunci || n == 0 ? null : () => unawaited(_pilihGardu()),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.brand600, width: 1.4),
          ),
          child: Row(children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.brand600, borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.search_rounded, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Pilih gardu', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
                Text(
                  n == 0
                      ? 'Tidak ada gardu AKTIF di $_labelLingkup.${_saringSection ? '' : ' Perbarui Master Gardu.'}'
                      : '$n gardu AKTIF di $_labelLingkup${_aturanDuaHari ? ' · aturan 2 hari aktif' : ''}',
                  style: const TextStyle(fontSize: 12, color: AppColors.neutral700),
                ),
                if (n == 0 && _saringSection && _diPenyulang.isNotEmpty)
                  TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                    onPressed: _kunci ? null : () => setState(() => _semuaPenyulang = true),
                    child: Text('Tampilkan ${_diPenyulang.length} gardu penyulang ${_x.penyulang}'),
                  )
                else if (_semuaPenyulang)
                  TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
                    onPressed: () => setState(() => _semuaPenyulang = false),
                    child: Text('Kembali ke section ${_x.section}'),
                  ),
              ]),
            ),
            if (n == 0)
              TombolSegarkan(sibuk: _unduh, onPressed: _unduhMaster, tooltip: 'Perbarui Master Gardu', warna: AppColors.navy700) // v1.0.22
            else
              const Icon(Icons.chevron_right_rounded, color: AppColors.brand700),
          ]),
        ),
      ),
    );
  }

  /// Satu baris nilai: badge fasa + kolom angka + tombol kamera / foto.
  Widget _barisNilai(NilaiUkurGardu v, {required bool bisaUbah}) {
    final fasa = v.label.split(' ').last; // "R" / "R-S"
    final f = _aktif?.foto[v.slot];
    final boleh = _bolehFoto(v.slot);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        _BadgeFasa(fasa),
        const SizedBox(width: 10),
        Expanded(
          child: TextField(
            controller: _c[v.kunci],
            enabled: bisaUbah,
            onChanged: (_) => setState(() {}),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: sisiInput('${v.label} (${v.satuan})'),
          ),
        ),
        const SizedBox(width: 8),
        _TombolFoto(
          foto: f,
          draf: !(_g?.disimpan ?? false),
          aktif: f != null || boleh,
          onTap: _proses ? null : () => unawaited(_foto(v.slot)),
        ),
      ]),
    );
  }

  Widget _grupNilai(String judul, IconData ikon, bool beban, {required bool bisaUbah}) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(ikon, size: 16, color: AppColors.brand700),
          const SizedBox(width: 6),
          Text(judul, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: .8, color: AppColors.brand700)),
        ]),
        const SizedBox(height: 8),
        for (final v in nilaiGardu)
          if (v.beban == beban) _barisNilai(v, bisaUbah: bisaUbah),
      ]);

  Widget _hasil({double? kapasitas, GarduUkurLokal? g}) {
    final h = hasilUkurGardu(_nilaiPratinjau, kapasitas);
    final k = KategoriBeban.dari(h.persen);
    final jamUkur = g?.foto['BEBAN_R']?.waktu;
    final jarak = g?.jarakM;
    final diterapkan = '${g?.server['diterapkan'] ?? ''}';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: k.latar.withValues(alpha: .55), borderRadius: BorderRadius.circular(16), border: Border.all(color: k.warna.withValues(alpha: .25))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          CincinBeban(persen: h.persen, ukuran: 62, tebal: 7),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Text('HASIL UKUR', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 1, color: AppColors.neutral700)),
                const SizedBox(width: 8),
                BadgeKategori(k),
              ]),
              const SizedBox(height: 4),
              Text('${angkaId(h.kva, desimal: 2)} kVA',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: k == KategoriBeban.belum ? AppColors.navy900 : k.warna)),
              Text(kapasitas == null ? 'Kapasitas trafo kosong di master: persen tidak dihitung' : 'dari ${angkaId(kapasitas)} kVA',
                  style: const TextStyle(fontSize: 11.5, color: AppColors.neutral700)),
            ]),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: _Metrik(
              label: 'Arus maks/fasa',
              nilai: h.arusMaks == null ? '- A' : '${angkaId(h.arusMaks)} A',
              bawah: 'beban tertinggi ${angkaId(h.bebanMaks)} A',
              peringatan: h.arusMaks != null && h.bebanMaks > h.arusMaks!,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Metrik(label: 'Tidak seimbang', nilai: '${angkaId(h.tidakSeimbang)}%', peringatan: h.tidakSeimbang >= 25),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Metrik(
              label: 'Waktu beban',
              nilai: waktuBebanGardu(jamUkur ?? widget.deps.jam.sekarang()),
              bawah: jamUkur == null ? 'perkiraan' : 'dari foto Beban R',
            ),
          ),
        ]),
        if (jarak != null) ...[
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.social_distance_rounded, size: 16, color: jarak > 100 ? AppColors.amber700 : AppColors.success700),
            const SizedBox(width: 6),
            Expanded(
              child: Text('Jarak foto Beban R ke titik gardu: $jarak m${jarak > 100 ? ' (jauh dari titik master)' : ''}',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: jarak > 100 ? AppColors.amber700 : AppColors.neutral700)),
            ),
          ]),
        ],
        if (diterapkan == 'YA') ...[
          const SizedBox(height: 8),
          const Row(children: [
            Icon(Icons.verified_rounded, size: 16, color: AppColors.success700),
            SizedBox(width: 6),
            Text('Sudah masuk Master Gardu', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.success700)),
          ]),
        ],
      ]),
    );
  }

  Widget _progresFoto(GarduUkurLokal? g) {
    final n = g?.jumlahFotoWajib ?? 0, total = slotGarduWajib.length;
    final selesai = n == total;
    final draf = !(g?.disimpan ?? false);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: selesai ? AppColors.success100 : AppColors.accent100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(selesai ? Icons.task_alt_rounded : Icons.photo_camera_outlined, size: 18, color: selesai ? AppColors.success700 : AppColors.accent700),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              selesai
                  ? (draf ? 'Foto ukur lengkap ($n/$total) · tekan Simpan Pengukuran' : 'Foto ukur lengkap ($n/$total)')
                  : 'Foto ukur $n/$total · ketuk kamera di samping tiap angka',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: selesai ? AppColors.success700 : AppColors.accent700),
            ),
          ),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: n / total,
            minHeight: 6,
            backgroundColor: Colors.white.withValues(alpha: .7),
            color: selesai ? AppColors.success600 : AppColors.accent600,
          ),
        ),
      ]),
    );
  }

  Widget _fotoKondisi() {
    final a = _aktif;
    final f = a?.foto[slotKondisiGardu];
    final boleh = _bolehFoto(slotKondisiGardu);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: _proses || (f == null && !boleh) ? null : () => unawaited(_foto(slotKondisiGardu)),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral200)),
        child: Row(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 56,
              height: 56,
              child: f == null
                  ? Container(
                      color: boleh ? AppColors.brand50 : Colors.white,
                      child: Icon(Icons.add_a_photo_outlined, color: boleh ? AppColors.brand700 : AppColors.neutral300),
                    )
                  : Image.file(File(f.path), fit: BoxFit.cover,
                      errorBuilder: (context, error, stack) => const Icon(Icons.broken_image_outlined, color: AppColors.neutral400)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Foto Kondisi / Temuan Gardu', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy900)),
              Text(
                f != null ? (f.terkirim ? 'Disimpan · terkirim' : ((_g?.disimpan ?? false) ? 'Disimpan' : 'Belum disimpan')) : 'Opsional',
                style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: f != null ? AppColors.success700 : AppColors.neutral500),
              ),
            ]),
          ),
          if (f != null) const Icon(Icons.visibility_outlined, size: 18, color: AppColors.neutral500),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final x = _x, g = _g;

    // ---------- belum disimpan (kosong / draf foto) ----------
    if (g == null || !g.disimpan) {
      if (x.selesai) {
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _judul(),
          const SizedBox(height: 6),
          const Text('Tidak ada data pengukuran gardu.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
        ]);
      }
      final a = _aktif;
      final siap = (g?.lengkapFotoWajib ?? false) && P0Repository.cekNilaiGardu(_nilaiIsian) == null;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _judul(),
        const SizedBox(height: 10),
        _kotakPilihGardu(),
        if (a != null) ...[
          const SizedBox(height: 10),
          _progresFoto(g),
          if (!_sebelumDisimpan)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text('Simpan foto Sebelum dulu, baru foto ukur bisa diambil.', style: TextStyle(fontSize: 11.5, color: AppColors.accent700)),
            ),
          const SizedBox(height: 14),
          _grupNilai('BEBAN (A)', Icons.bolt_rounded, true, bisaUbah: !_kunci),
          const SizedBox(height: 6),
          _grupNilai('TEGANGAN (V)', Icons.electric_meter_outlined, false, bisaUbah: !_kunci),
          const SizedBox(height: 4),
          _hasil(kapasitas: a.kapasitas, g: g),
          const SizedBox(height: 12),
          _fotoKondisi(),
          const SizedBox(height: 12),
          TextField(controller: _catatan, maxLines: 3, minLines: 2, maxLength: 300, decoration: sisiInput('Catatan')),
          SizedBox(
            height: 48,
            child: FilledButton.icon(
              onPressed: _proses || _kunci || !_sebelumDisimpan || !siap ? null : () => unawaited(_simpanBaru()),
              icon: const Icon(Icons.save_rounded),
              label: Text(g == null || g.foto.isEmpty ? 'Simpan Pengukuran' : 'Simpan Pengukuran + ${g.foto.length} foto'),
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Angka dan foto disimpan bersamaan. Simpan aktif setelah 10 angka terisi dan 10 foto ukur lengkap.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: AppColors.neutral500)),
          ),
        ],
      ]);
    }

    // ---------- sudah disimpan ----------
    final bisaUbah = !_kunci;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _judul(),
      const SizedBox(height: 10),
      SorotGardu(
        noGardu: g.noGardu,
        kva: g.kapasitas,
        alamat: g.alamat,
        penyulang: x.penyulang,
        section: g.section,
        terakhir: g.kodeTampil(x),
        trailing: const Icon(Icons.lock_rounded, size: 18, color: Color(0xCCFFFFFF)),
      ),
      const SizedBox(height: 10),
      _progresFoto(g),
      const SizedBox(height: 14),
      _grupNilai('BEBAN (A)', Icons.bolt_rounded, true, bisaUbah: bisaUbah),
      const SizedBox(height: 6),
      _grupNilai('TEGANGAN (V)', Icons.electric_meter_outlined, false, bisaUbah: bisaUbah),
      const SizedBox(height: 4),
      _hasil(kapasitas: g.kapasitas, g: g),
      const SizedBox(height: 12),
      _fotoKondisi(),
      const SizedBox(height: 12),
      TextField(
          controller: _catatan,
          enabled: bisaUbah,
          onChanged: (_) => setState(() {}),
          maxLines: 3,
          minLines: 2,
          maxLength: 300,
          decoration: sisiInput('Catatan')),
      if (bisaUbah && _berubah(g))
        SizedBox(
          height: 46,
          child: FilledButton.tonalIcon(
            onPressed: _proses ? null : () => unawaited(_simpanKoreksi()),
            icon: const Icon(Icons.save_outlined, size: 18),
            label: const Text('Simpan koreksi'),
          ),
        ),
    ]);
  }
}

/// Sorotan gardu terpilih (gaya sama dengan SorotSwitching): kapasitas, No Gardu, alamat, penyulang · section.
class SorotGardu extends StatelessWidget {
  const SorotGardu({
    super.key,
    required this.noGardu,
    required this.kva,
    required this.alamat,
    required this.penyulang,
    required this.section,
    this.terakhir,
    this.trailing,
  });
  final String noGardu;
  final double? kva;
  final String alamat;
  final String penyulang;
  final String section;
  final String? terakhir;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppColors.brand800, AppColors.brand600], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: AppColors.brand700.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(angkaId(kva), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.plnYellow, height: 1)),
              const Text('kVA', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.plnYellow)),
            ]),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('GARDU', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: Color(0xCCFFFFFF))),
              Text(noGardu, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: Colors.white)),
              if (alamat.isNotEmpty)
                Text(alamat, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xEEFFFFFF))),
              Text([if (penyulang.isNotEmpty) 'Penyulang $penyulang', if (section.isNotEmpty) section].join(' · '),
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Color(0xCCFFFFFF))),
              if (terakhir != null && terakhir!.isNotEmpty)
                Text(terakhir!, style: const TextStyle(fontSize: 10.5, color: Color(0xB3FFFFFF))),
            ]),
          ),
          if (trailing != null) trailing!,
        ]),
      );
}

class _BadgeFasa extends StatelessWidget {
  const _BadgeFasa(this.fasa);
  final String fasa; // "R" atau "R-S"

  @override
  Widget build(BuildContext context) {
    final bagian = fasa.split('-');
    return Container(
      width: 46,
      height: 46,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.neutral200)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < bagian.length; i++) ...[
          if (i > 0) const Text('-', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.neutral400)),
          Text(bagian[i], style: TextStyle(fontSize: bagian.length > 1 ? 13 : 17, fontWeight: FontWeight.w900, color: warnaFasa(bagian[i]))),
        ],
      ]),
    );
  }
}

/// Tombol kamera di samping angka: kosong = ikon kamera, sudah ada = thumbnail + tanda (centang draf / gembok / terkirim).
class _TombolFoto extends StatelessWidget {
  const _TombolFoto({required this.foto, required this.aktif, required this.draf, this.onTap});
  final FotoP0? foto;
  final bool aktif;
  final bool draf;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final f = foto;
    return SizedBox(
      width: 50,
      height: 50,
      child: Material(
        color: f != null ? Colors.white : (aktif ? AppColors.brand600 : AppColors.neutral100),
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: aktif ? onTap : null,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: f == null ? Colors.transparent : (draf ? AppColors.accent600 : AppColors.success600), width: 2),
            ),
            child: f == null
                ? Icon(Icons.photo_camera_rounded, size: 22, color: aktif ? Colors.white : AppColors.neutral300)
                : Stack(fit: StackFit.expand, children: [
                    Image.file(File(f.path), fit: BoxFit.cover,
                        errorBuilder: (context, error, stack) => const Icon(Icons.broken_image_outlined, color: AppColors.neutral400)),
                    Positioned(
                      right: 2,
                      bottom: 2,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(color: draf ? AppColors.accent600 : AppColors.success700, shape: BoxShape.circle),
                        child: Icon(f.terkirim ? Icons.cloud_done_rounded : (draf ? Icons.check_rounded : Icons.lock_rounded),
                            size: 11, color: Colors.white),
                      ),
                    ),
                  ]),
          ),
        ),
      ),
    );
  }
}

class _Metrik extends StatelessWidget {
  const _Metrik({required this.label, required this.nilai, this.bawah, this.peringatan = false});
  final String label;
  final String nilai;
  final String? bawah;
  final bool peringatan;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10.5, color: AppColors.neutral500)),
          Text(nilai,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: peringatan ? AppColors.amber700 : AppColors.navy900)),
          if (bawah != null) Text(bawah!, style: const TextStyle(fontSize: 9.5, color: AppColors.neutral400)),
        ]),
      );
}

class _Info extends StatelessWidget {
  const _Info({required this.ikon, required this.teks, this.aksi});
  final IconData ikon;
  final String teks;
  final Widget? aksi;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(ikon, size: 20, color: AppColors.accent700),
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: const TextStyle(fontSize: 12, color: AppColors.neutral900))),
          if (aksi != null) aksi!,
        ]),
      );
}

/// Pilih gardu: AKTIF di penyulang P0, cari No Gardu / alamat / section, kartu dengan beban terakhir.
/// v0.75.0: [tglShift] terisi = aturan "Pengukuran Gardu 2 Hari Sekali" aktif: gardu yang baru diukur (Master Gardu)
/// ditandai dan tidak bisa dipilih (server tetap memeriksa ulang, termasuk pengukuran tim lain hari ini).
class _SheetPilihGardu extends StatefulWidget {
  const _SheetPilihGardu({required this.penyulang, required this.daftar, this.terpilih, this.tglShift});
  final String penyulang;
  final List<Gardu> daftar;
  final String? terpilih;
  final String? tglShift;

  @override
  State<_SheetPilihGardu> createState() => _SheetPilihGarduState();
}

class _SheetPilihGarduState extends State<_SheetPilihGardu> {
  String _kata = '';

  String? _lagi(Gardu g) => widget.tglShift == null || g.tglUkur.isEmpty ? null : bisaUkurLagi(g.tglUkur, widget.tglShift!);

  @override
  Widget build(BuildContext context) {
    final kata = _kata.trim().toLowerCase();
    final hasil = [for (final g in widget.daftar) if (kata.isEmpty || g.kunciCari.contains(kata)) g];
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: .85,
      minChildSize: .5,
      maxChildSize: .95,
      builder: (context, scroll) => Column(children: [
        const SizedBox(height: 8),
        Container(width: 44, height: 4, decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(99))),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(children: [
            Expanded(
              child: Text('Pilih gardu (${widget.penyulang})',
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            ),
            Text('${hasil.length}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.neutral500)),
          ]),
        ),
        if (widget.tglShift != null)
          Container(
            margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(12)),
            child: const Row(children: [
              Icon(Icons.event_repeat_rounded, size: 18, color: AppColors.accent700),
              SizedBox(width: 8),
              Expanded(
                child: Text('Pengukuran Gardu 2 Hari Sekali aktif: gardu yang baru diukur belum bisa diukur lagi.',
                    style: TextStyle(fontSize: 11.5, color: AppColors.neutral900)),
              ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _kata = v),
            decoration: sisiInput('Cari No Gardu, alamat, section', suffix: const Icon(Icons.search_rounded)),
          ),
        ),
        Expanded(
          child: hasil.isEmpty
              ? const Center(child: Text('Tidak ada gardu yang cocok.', style: TextStyle(color: AppColors.neutral500)))
              : ListView.separated(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: hasil.length,
                  separatorBuilder: (context, i) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final g = hasil[i];
                    final dipilih = g.id == widget.terpilih;
                    final lagi = _lagi(g);
                    final kartu = DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: dipilih ? Border.all(color: AppColors.brand600, width: 2) : null,
                      ),
                      child: KartuGardu(
                        gardu: g,
                        onTap: lagi != null
                            ? () => tampilPesan(context, '${g.no} baru diukur ${tanggalPendek(g.tglUkur)}. Bisa diukur lagi ${tanggalPendek(lagi)}.')
                            : () => Navigator.pop(context, g),
                      ),
                    );
                    if (lagi == null) return kartu;
                    return Stack(children: [
                      Opacity(opacity: .45, child: kartu),
                      Positioned(
                        right: 12,
                        top: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: AppColors.accent700, borderRadius: BorderRadius.circular(99)),
                          child: Text('Bisa lagi ${tanggalPendek(lagi)}',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                        ),
                      ),
                    ]);
                  },
                ),
        ),
      ]),
    );
  }
}
