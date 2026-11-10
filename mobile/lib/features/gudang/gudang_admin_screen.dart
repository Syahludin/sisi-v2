import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_widgets.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/refresh_sisi.dart';
import 'gudang_model.dart';
import 'gudang_widgets.dart';
import 'gudang_repository.dart';

/// v1.0.57 Material Gudang (menu OPS_GUDANG_MATERIAL, ADMIN / SUPER): sama dengan website admin. Tab Stok (saldo gudang + tim,
/// tambah / kirim / tarik / koreksi), Selisih (persetujuan selisih pemeriksaan awal shift), Pemakaian (koreksi / batal), Izin
/// (tim mana boleh memakai material). Semua tulis langsung ke server; stok dihitung server dari buku mutasi.
class GudangAdminScreen extends StatelessWidget {
  const GudangAdminScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const _uuid = Uuid();

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: const Color(0xFFF6F8FC),
        appBar: sisiAppBar('Material Gudang', subjudul: 'Stok MCB gudang dan tim Yandal'),
        body: GudangAdminPanel(repo: deps.gudangRepo, sesi: sesi, idBaru: _uuid.v4),
      );
}

/// Isi layar admin, tanpa Deps (bisa diuji dengan repository palsu).
class GudangAdminPanel extends StatelessWidget {
  const GudangAdminPanel({super.key, required this.repo, required this.sesi, required this.idBaru});
  final GudangRepository repo;
  final Sesi sesi;
  final String Function() idBaru;

  @override
  Widget build(BuildContext context) {
    final ubah = GudangRepository.bolehUbahAdmin(sesi);
    return DefaultTabController(
      length: 4,
      child: Column(children: [
        const TabBar(isScrollable: true, tabAlignment: TabAlignment.start, tabs: [Tab(text: 'Stok'), Tab(text: 'Selisih'), Tab(text: 'Pemakaian'), Tab(text: 'Izin')]),
        if (!ubah)
          const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text('Akun ini hanya bisa melihat. Mengubah stok hanya oleh Admin dengan akses ubah.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral700))),
        Expanded(
          child: TabBarView(children: [
            _TabStok(repo: repo, sesi: sesi, ubah: ubah, idBaru: idBaru),
            _TabSelisih(repo: repo, sesi: sesi, ubah: ubah),
            _TabPemakaian(repo: repo, sesi: sesi, ubah: ubah),
            _TabIzin(repo: repo, sesi: sesi, ubah: ubah),
          ]),
        ),
      ]),
    );
  }
}

/// Kolom pilih (bottom sheet, bukan dropdown bawaan yang tertinggal di layar saat keyboard ditutup).
Widget _kolomPilih(String label, List<PilihanItem> pilihan, String? nilai, ValueChanged<String> onChanged, {Key? key}) =>
    KolomPilih(key: key, label: label, pilihan: pilihan, nilaiAwal: pilihan.any((p) => p.nilai == nilai) ? nilai : null, onChanged: onChanged);

/// Jalankan aksi tulis admin: sukses -> true; galat server/jaringan -> pesan lalu false.
Future<bool> _tulis(BuildContext context, Future<void> Function() aksi, {String? sukses}) async {
  try {
    await aksi();
    if (context.mounted && sukses != null) tampilPesan(context, sukses);
    return true;
  } on ApiException catch (e) {
    if (context.mounted) tampilPesan(context, KodeError.pesan(e.kode));
    return false;
  } catch (_) {
    if (context.mounted) tampilPesan(context, 'Gagal menyimpan. Periksa sinyal lalu coba lagi.');
    return false;
  }
}

/// Muat data tab; galat jadi pesan di layar.
mixin _Muat<T extends StatefulWidget> on State<T> {
  bool memuat = true;
  String galat = '';

  Future<void> ambil();

  Future<void> muat() async {
    setState(() {
      memuat = true;
      galat = '';
    });
    try {
      await ambil();
    } on ApiException catch (e) {
      galat = KodeError.pesan(e.kode);
    } catch (_) {
      galat = 'Gagal memuat. Periksa sinyal lalu coba lagi.';
    }
    if (mounted) setState(() => memuat = false);
  }

  Widget? keadaan(bool adaData) {
    if (memuat && !adaData) return const Center(child: SisiLoader());
    if (!adaData) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(galat.isEmpty ? 'Tidak ada data.' : galat, textAlign: TextAlign.center)));
    return null;
  }
}

Widget _kartu(List<Widget> anak) => Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.neutral200)),
      // Material transparan: ListTile / Checkbox di dalam kartu berlatar memerlukan Material sendiri
      child: Material(type: MaterialType.transparency, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: anak)),
    );

// ---------- Stok

class _TabStok extends StatefulWidget {
  const _TabStok({required this.repo, required this.sesi, required this.ubah, required this.idBaru});
  final GudangRepository repo;
  final Sesi sesi;
  final bool ubah;
  final String Function() idBaru;
  @override
  State<_TabStok> createState() => _TabStokState();
}

class _TabStokState extends State<_TabStok> with _Muat<_TabStok> {
  StokGudang? _stok;
  List<Map<String, dynamic>> _material = const [], _tim = const [];
  List<String> _merk = const [];

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  @override
  Future<void> ambil() async {
    final s = await widget.repo.stokGudang(widget.sesi);
    final m = await widget.repo.izin(widget.sesi);
    _stok = s;
    _material = [for (final x in (m['material'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
    _tim = [for (final x in (m['tim'] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];
    _merk = daftarMerk(m);
  }

  Future<void> _form(String mode, Map<String, String> isi) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => _SheetStok(mode: mode, awal: isi, material: _material, tim: _tim, merk: _merk, idOperasi: widget.idBaru(), simpan: (aksi, data) => _tulis(context, () => widget.repo.ubahStok(widget.sesi, aksi, data).then((_) {}), sukses: 'Tersimpan.')),
    );
    if (ok == true) await muat();
  }

  String _nama(String id) => _material.firstWhere((m) => m['materialId'] == id, orElse: () => const {'nama': '-'})['nama'] as String;

  Map<String, String> _isiJenis(JenisMcb j, {String? timId, String? lokasi, String? jumlah}) => {
        'materialId': j.materialId,
        'daya': j.daya,
        'merk': j.merk,
        'statusMcb': j.statusMcb,
        if (timId != null) 'timId': timId,
        if (lokasi != null) 'lokasi': lokasi,
        if (jumlah != null) ...{'jumlah': jumlah, 'jumlahBaru': jumlah},
      };

  Widget _tombol(Key key, String teks, IconData ikon, VoidCallback onTap, {bool bahaya = false}) => TextButton.icon(
        key: key,
        onPressed: onTap,
        style: TextButton.styleFrom(foregroundColor: bahaya ? AppColors.red700 : AppColors.brand700, visualDensity: VisualDensity.compact, textStyle: const TextStyle(fontWeight: FontWeight.w800)),
        icon: Icon(ikon, size: 18),
        label: Text(teks),
      );

  Widget _riwayat(Map<String, dynamic> m) {
    final jumlah = (m['jumlah'] as num? ?? 0).toInt();
    final naik = jumlah > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: naik ? AppColors.success100 : AppColors.red100, borderRadius: BorderRadius.circular(12)),
          child: Text('${naik ? '+' : ''}$jumlah', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: naik ? AppColors.success700 : AppColors.red700)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${labelMutasi['${m['jenisMutasi']}'] ?? m['jenisMutasi']} · ${teksDaya('${m['daya']}')} ${m['merk']} ${m['statusMcb']}', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
            Text('${m['waktu']}${'${m['catatan'] ?? ''}'.isEmpty ? '' : ' · ${m['catatan']}'}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
          ]),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = _stok;
    final k = keadaan(s != null);
    if (k != null) return k;
    final st = s!;
    final diTim = st.tim.fold<int>(0, (a, t) => a + totalJenis(t.stok));
    final tanpaIzin = st.tim.fold<int>(0, (a, t) => a + totalJenis(t.tanpaIzin));
    return RefreshSisi(
      onRefresh: muat,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [
        Row(children: [
          Expanded(child: KpiGudang(label: 'MCB di gudang', nilai: totalJenis(st.gudang), ikon: Icons.warehouse_outlined)),
          const SizedBox(width: 10),
          Expanded(child: KpiGudang(label: 'MCB di tim', nilai: diTim, ikon: Icons.groups_rounded, warna: AppColors.success700)),
          const SizedBox(width: 10),
          Expanded(
              child: KpiGudang(
                  label: 'Tanpa izin', nilai: tanpaIzin, ikon: Icons.report_gmailerrorred_rounded, warna: tanpaIzin > 0 ? AppColors.red700 : AppColors.neutral400, latar: tanpaIzin > 0 ? const Color(0xFFFFF5F5) : Colors.white)),
        ]),
        const SizedBox(height: 16),
        _kartu([
          JudulBagian('Gudang', ikon: Icons.warehouse_outlined),
          if (st.gudang.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Gudang kosong.', style: TextStyle(color: AppColors.neutral500))),
          for (final j in st.gudang)
            BarisJenis(j: j, material: _nama(j.materialId), aksi: [
              if (widget.ubah) _tombol(Key('kirim-${j.kunci}'), 'Kirim ke tim', Icons.north_east_rounded, () => _form('kirim', _isiJenis(j))),
              if (widget.ubah) _tombol(Key('koreksi-gudang-${j.kunci}'), 'Koreksi', Icons.edit_outlined, () => _form('koreksi', _isiJenis(j, lokasi: 'GUDANG', jumlah: '${j.jumlah}'))),
            ]),
          if (widget.ubah) ...[
            const SizedBox(height: 12),
            SizedBox(height: 46, child: FilledButton.icon(key: const Key('tambah-stok'), style: FilledButton.styleFrom(backgroundColor: AppColors.navy700), onPressed: () => _form('tambah', const {}), icon: const Icon(Icons.add_rounded), label: const Text('Tambah stok gudang'))),
          ],
        ]),
        for (final t in st.tim)
          _kartu([
            JudulBagian(t.nama, ikon: Icons.groups_rounded, kanan: Text('${totalJenis(t.stok)} unit', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.neutral700))),
            if (t.stok.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Tidak ada stok.', style: TextStyle(color: AppColors.neutral500))),
            for (final j in t.stok)
              BarisJenis(j: j, material: _nama(j.materialId), aksi: [
                if (widget.ubah) _tombol(Key('tarik-${t.timId}|${j.daya}'), 'Tarik', Icons.south_west_rounded, () => _form('tarik', _isiJenis(j, timId: t.timId, jumlah: '${j.jumlah}'))),
                if (widget.ubah) _tombol(Key('koreksi-${t.timId}|${j.daya}'), 'Koreksi', Icons.edit_outlined, () => _form('koreksi', _isiJenis(j, lokasi: t.timId, jumlah: '${j.jumlah}'))),
              ]),
            if (t.tanpaIzin.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFFF5F5), borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.red600.withValues(alpha: .4))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    const Icon(Icons.report_gmailerrorred_rounded, color: AppColors.red700, size: 20),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Stok tanpa izin (${totalJenis(t.tanpaIzin)} unit)', style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.red700))),
                  ]),
                  const SizedBox(height: 2),
                  const Text('Tim ini tidak boleh memakainya lagi. Tarik ke gudang atau beri izin lagi di tab Izin.', style: TextStyle(fontSize: 12, color: AppColors.neutral700)),
                  for (final j in t.tanpaIzin)
                    BarisJenis(j: j, material: _nama(j.materialId), peringatan: true, aksi: [
                      if (widget.ubah)
                        _tombol(Key('tarik-${t.timId}|${j.daya}'), 'Tarik ke gudang', Icons.south_west_rounded, () => _form('tarik', {..._isiJenis(j, timId: t.timId, jumlah: '${j.jumlah}'), 'alasan': 'Izin material dicabut'}), bahaya: true),
                    ]),
                ]),
              ),
            ],
            if (widget.ubah) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => _form('kirim', {'timId': t.timId}), icon: const Icon(Icons.north_east_rounded, size: 18), label: const Text('Kirim stok ke tim ini'))),
          ]),
        _kartu([
          const JudulBagian('Riwayat terbaru', ikon: Icons.history_rounded),
          if (st.mutasi.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Belum ada mutasi.', style: TextStyle(color: AppColors.neutral500))),
          for (final m in st.mutasi.take(30)) _riwayat(m),
        ]),
      ]),
    );
  }
}

/// Form tambah / kirim / tarik / koreksi stok. Nilai awal dari baris yang diketuk. idOperasi dibuat sekali per pembukaan.
class _SheetStok extends StatefulWidget {
  const _SheetStok({required this.mode, required this.awal, required this.material, required this.tim, required this.merk, required this.idOperasi, required this.simpan});
  final String mode, idOperasi;
  final Map<String, String> awal;
  final List<Map<String, dynamic>> material, tim;
  final List<String> merk;
  final Future<bool> Function(String aksi, Map<String, dynamic> data) simpan;
  @override
  State<_SheetStok> createState() => _SheetStokState();
}

class _SheetStokState extends State<_SheetStok> {
  late String _materialId = widget.awal['materialId'] ?? (widget.material.isEmpty ? '' : widget.material.first['materialId'] as String);
  late String _status = widget.awal['statusMcb'] ?? statusMcb.first;
  late String _timId = widget.awal['timId'] ?? '';
  late String _lokasi = widget.awal['lokasi'] ?? 'GUDANG';
  late final _daya = TextEditingController(text: widget.awal['daya'] ?? '');
  late final _merk = TextEditingController(text: widget.awal['merk'] ?? '');
  late final _jumlah = TextEditingController(text: widget.mode == 'koreksi' ? (widget.awal['jumlahBaru'] ?? '') : (widget.awal['jumlah'] ?? ''));
  late final _alasan = TextEditingController(text: widget.awal['alasan'] ?? '');
  late final _catatan = TextEditingController();
  String _galat = '';
  bool _sibuk = false;

  static const _judul = {'tambah': 'Tambah stok gudang', 'kirim': 'Kirim stok ke tim', 'tarik': 'Tarik stok ke gudang', 'koreksi': 'Koreksi stok'};
  static const _aksi = {'tambah': 'tambahStokGudang', 'kirim': 'kirimStokTim', 'tarik': 'tarikStokTim', 'koreksi': 'koreksiStok'};

  @override
  void dispose() {
    for (final c in [_daya, _merk, _jumlah, _alasan, _catatan]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _kirim() async {
    final f = {
      'materialId': _materialId,
      'daya': _daya.text,
      'merk': _merk.text,
      'statusMcb': _status,
      'timId': _timId,
      'lokasi': _lokasi,
      'jumlah': _jumlah.text,
      'jumlahBaru': _jumlah.text,
      'alasan': _alasan.text,
      'catatan': _catatan.text,
    };
    final h = susunStok(widget.mode, f, widget.idOperasi);
    if (h.galat != null) {
      setState(() => _galat = h.galat!);
      return;
    }
    setState(() {
      _galat = '';
      _sibuk = true;
    });
    final ok = await widget.simpan(_aksi[widget.mode]!, h.data!);
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = widget.mode;
    final teksAlasan = mode == 'tarik' || mode == 'koreksi';
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(_judul[mode]!, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: AppColors.navy900)),
          const SizedBox(height: 10),
          _kolomPilih('Material', [for (final m in widget.material) PilihanItem(m['materialId'] as String, '${m['nama']}')], _materialId, (v) => setState(() => _materialId = v)),
          const SizedBox(height: 8),
          KeyedSubtree(key: const Key('f-daya'), child: KolomDaya(controller: _daya)),
          KolomDaftar(key: const Key('f-merk'), controller: _merk, daftar: widget.merk, label: 'Merk'),
          const SizedBox(height: 8),
          PilihStatusMcb(nilai: _status, onChanged: (v) => setState(() => _status = v)),
          if (mode == 'kirim' || mode == 'tarik') ...[
            const SizedBox(height: 8),
            _kolomPilih('Tim', [for (final t in widget.tim) PilihanItem(t['timId'] as String, '${t['nama']}')], _timId, (v) => setState(() => _timId = v)),
          ],
          if (mode == 'koreksi') ...[
            const SizedBox(height: 8),
            _kolomPilih('Lokasi stok', [const PilihanItem('GUDANG', 'Gudang'), for (final t in widget.tim) PilihanItem(t['timId'] as String, '${t['nama']}')], _lokasi, (v) => setState(() => _lokasi = v)),
          ],
          const SizedBox(height: 8),
          TextField(key: const Key('f-jumlah'), controller: _jumlah, keyboardType: TextInputType.number, decoration: sisiInput(mode == 'koreksi' ? 'Jumlah yang benar' : 'Jumlah')),
          const SizedBox(height: 8),
          TextField(
              key: Key(teksAlasan ? 'f-alasan' : 'f-catatan'),
              controller: teksAlasan ? _alasan : _catatan,
              maxLength: 200,
              decoration: sisiInput(teksAlasan ? 'Alasan (wajib, tercatat)' : 'Catatan (boleh kosong)')),
          if (_galat.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5))),
          const SizedBox(height: 12),
          SizedBox(height: 48, child: FilledButton(key: const Key('f-simpan'), onPressed: _sibuk ? null : _kirim, child: _sibuk ? const SisiLoader(ukuran: 18, warna: Colors.white) : const Text('Simpan'))),
        ]),
      ),
    );
  }
}

// ---------- Selisih

class _TabSelisih extends StatefulWidget {
  const _TabSelisih({required this.repo, required this.sesi, required this.ubah});
  final GudangRepository repo;
  final Sesi sesi;
  final bool ubah;
  @override
  State<_TabSelisih> createState() => _TabSelisihState();
}

class _TabSelisihState extends State<_TabSelisih> with _Muat<_TabSelisih> {
  List<SelisihStok>? _daftar;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  @override
  Future<void> ambil() async => _daftar = await widget.repo.selisih(widget.sesi, status: 'MENUNGGU');

  Future<void> _selesaikan(SelisihStok s) async {
    var perlu = const <String>[];
    try {
      perlu = daftarKeperluan(await widget.repo.izin(widget.sesi));
    } catch (_) {
      // master keperluan tidak terbaca: susulan tetap bisa, keperluan diketik (server tetap memeriksa)
    }
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _DialogSelisih(selisih: s, keperluan: perlu, simpan: (data) => _tulis(context, () => widget.repo.selesaikanSelisih(widget.sesi, data).then((_) {}), sukses: 'Selisih diselesaikan.')),
    );
    if (ok == true) await muat();
  }

  @override
  Widget build(BuildContext context) {
    final k = keadaan(_daftar != null);
    if (k != null) return k;
    final l = _daftar!;
    return RefreshSisi(
      onRefresh: muat,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [
        Text('Menunggu persetujuan (${l.length})', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.navy900)),
        const SizedBox(height: 8),
        if (l.isEmpty) const Text('Tidak ada selisih yang menunggu.'),
        for (final s in l)
          _kartu([
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: s.kurang ? AppColors.red100 : AppColors.accent100, borderRadius: BorderRadius.circular(14)),
                child: Text('${s.selisih > 0 ? '+' : ''}${s.selisih}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: s.kurang ? AppColors.red700 : AppColors.accent700)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    LencanaStatus(s.kurang ? 'KURANG' : 'LEBIH', warna: s.kurang ? AppColors.red700 : AppColors.accent700, latar: s.kurang ? AppColors.red100 : AppColors.accent100),
                    const SizedBox(width: 8),
                    Expanded(child: Text('${s.timNama} · shift ${s.shift} · ${s.tanggal}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500, fontWeight: FontWeight.w700))),
                  ]),
                  const SizedBox(height: 6),
                  Text(s.teks, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                ]),
              ),
            ]),
            if (widget.ubah)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: SizedBox(height: 44, child: FilledButton.tonalIcon(key: Key('selesaikan-${s.selisihId}'), onPressed: () => _selesaikan(s), icon: const Icon(Icons.fact_check_outlined), label: const Text('Selesaikan selisih'))),
              ),
          ]),
      ]),
    );
  }
}

class _DialogSelisih extends StatefulWidget {
  const _DialogSelisih({required this.selisih, required this.keperluan, required this.simpan});
  final SelisihStok selisih;
  final List<String> keperluan;
  final Future<bool> Function(Map<String, dynamic> data) simpan;
  @override
  State<_DialogSelisih> createState() => _DialogSelisihState();
}

class _DialogSelisihState extends State<_DialogSelisih> {
  late String _cara = pilihanCara(widget.selisih.arah).first;
  final _catatan = TextEditingController();
  final _meter = TextEditingController();
  final _perlu = TextEditingController();
  String _galat = '';
  bool _sibuk = false;

  @override
  void dispose() {
    for (final c in [_catatan, _meter, _perlu]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _kirim() async {
    if (_catatan.text.trim().isEmpty) return setState(() => _galat = 'Isi catatan.');
    if (_cara == 'SUSULAN' && (_meter.text.trim().isEmpty || _perlu.text.trim().isEmpty)) return setState(() => _galat = 'Isi nomor meter dan keperluan.');
    setState(() {
      _galat = '';
      _sibuk = true;
    });
    final ok = await widget.simpan({
      'selisihId': widget.selisih.selisihId,
      'cara': _cara,
      'catatan': _catatan.text.trim(),
      if (_cara == 'SUSULAN') ...{'nomorMeter': _meter.text.trim(), 'keperluan': _perlu.text.trim()},
    });
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Selesaikan selisih'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(widget.selisih.teks, style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            _kolomPilih('Cara penyelesaian', [for (final c in pilihanCara(widget.selisih.arah)) PilihanItem(c, labelCara(c))], _cara, (v) => setState(() => _cara = v), key: const Key('cara')),
            const SizedBox(height: 12),
            if (_cara == 'SUSULAN') ...[
              TextField(key: const Key('f-meter'), controller: _meter, maxLength: 30, decoration: sisiInput('Nomor meter')),
              const SizedBox(height: 8),
              KolomDaftar(key: const Key('f-keperluan'), controller: _perlu, daftar: widget.keperluan, label: 'Keperluan', maks: 200),
              const Text('Dicatat atas nama shift dan petugas sebelumnya, satu MCB per simpan.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
              const SizedBox(height: 8),
            ],
            TextField(key: const Key('f-catatan'), controller: _catatan, maxLength: 200, decoration: sisiInput('Catatan (wajib)')),
            if (_galat.isNotEmpty) Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5)),
          ]),
        ),
        actions: [
          TextButton(onPressed: _sibuk ? null : () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(key: const Key('simpan-selisih'), onPressed: _sibuk ? null : _kirim, child: const Text('Selesaikan')),
        ],
      );
}

// ---------- Pemakaian

class _TabPemakaian extends StatefulWidget {
  const _TabPemakaian({required this.repo, required this.sesi, required this.ubah});
  final GudangRepository repo;
  final Sesi sesi;
  final bool ubah;
  @override
  State<_TabPemakaian> createState() => _TabPemakaianState();
}

class _TabPemakaianState extends State<_TabPemakaian> with _Muat<_TabPemakaian> {
  List<Map<String, dynamic>>? _daftar;
  int _hari = 7;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  static String _tgl(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Future<void> ambil() async {
    final sekarang = DateTime.now().toUtc().add(const Duration(hours: 7));
    _daftar = await widget.repo.pemakaian(widget.sesi, dari: _tgl(sekarang.subtract(Duration(days: _hari - 1))), sampai: _tgl(sekarang));
  }

  Future<void> _ubah(Map<String, dynamic> p, bool batal) async {
    var merk = const <String>[], perlu = const <String>[];
    if (!batal) {
      try {
        final m = await widget.repo.izin(widget.sesi);
        merk = daftarMerk(m);
        perlu = daftarKeperluan(m);
      } catch (_) {
        // master merk tidak terbaca: koreksi tetap bisa, merk diketik (server tetap memeriksa)
      }
    }
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _DialogPemakaian(
          p: p,
          batal: batal,
          merk: merk,
          keperluan: perlu,
          simpan: (data) => _tulis(context, () => (batal ? widget.repo.batalkanPemakaian(widget.sesi, data) : widget.repo.koreksiPemakaian(widget.sesi, data)).then((_) {}), sukses: batal ? 'Pemakaian dibatalkan.' : 'Koreksi tersimpan.')),
    );
    if (ok == true) await muat();
  }

  @override
  Widget build(BuildContext context) {
    final k = keadaan(_daftar != null);
    if (k != null) return k;
    final l = _daftar!;
    return RefreshSisi(
      onRefresh: muat,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [
        Wrap(spacing: 8, children: [
          for (final h in const [7, 30, 90])
            ChoiceChip(
                label: Text('$h hari'),
                selected: _hari == h,
                onSelected: (_) {
                  setState(() => _hari = h);
                  unawaited(muat());
                }),
        ]),
        const SizedBox(height: 8),
        if (l.isEmpty) const Text('Tidak ada pemakaian pada rentang ini.'),
        for (final p in l)
          _kartu([
            Row(children: [
              Expanded(child: Text('${p['nomorPemakaian']}', style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w900, color: AppColors.navy900))),
              if ('${p['jenisCatatan']}' != 'NORMAL')
                LencanaStatus('${p['jenisCatatan']}',
                    warna: '${p['jenisCatatan']}' == 'BATAL' ? AppColors.red700 : AppColors.accent700, latar: '${p['jenisCatatan']}' == 'BATAL' ? AppColors.red100 : AppColors.accent100),
            ]),
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 6, children: [
              LencanaStatus('${teksDaya('${p['daya']}')} ${p['merk']}', warna: AppColors.navy700, latar: AppColors.brand50),
              LencanaStatus.mcb('${p['statusMcb']}'),
              LencanaStatus('Meter ${p['nomorMeter']}', warna: AppColors.neutral700, latar: AppColors.neutral100),
            ]),
            const SizedBox(height: 6),
            Text('${p['keperluan']}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.navy900)),
            Text('${p['tanggal']} · shift ${p['shift']}', style: const TextStyle(fontSize: 12, color: AppColors.neutral500)),
            if (widget.ubah && '${p['jenisCatatan']}' != 'BATAL')
              Align(
                alignment: Alignment.centerRight,
                child: Wrap(spacing: 4, children: [
                  TextButton.icon(key: Key('koreksi-${p['pemakaianId']}'), onPressed: () => _ubah(p, false), icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Koreksi')),
                  TextButton.icon(key: Key('batal-${p['pemakaianId']}'), onPressed: () => _ubah(p, true), style: TextButton.styleFrom(foregroundColor: AppColors.red700), icon: const Icon(Icons.block_rounded, size: 18), label: const Text('Batalkan')),
                ]),
              ),
          ]),
      ]),
    );
  }
}

class _DialogPemakaian extends StatefulWidget {
  const _DialogPemakaian({required this.p, required this.batal, required this.merk, required this.keperluan, required this.simpan});
  final Map<String, dynamic> p;
  final bool batal;
  final List<String> merk, keperluan;
  final Future<bool> Function(Map<String, dynamic> data) simpan;
  @override
  State<_DialogPemakaian> createState() => _DialogPemakaianState();
}

class _DialogPemakaianState extends State<_DialogPemakaian> {
  late final _meter = TextEditingController(text: '${widget.p['nomorMeter']}');
  late final _perlu = TextEditingController(text: '${widget.p['keperluan']}');
  late final _daya = TextEditingController(text: '${widget.p['daya']}');
  late final _merk = TextEditingController(text: '${widget.p['merk']}');
  late String _status = '${widget.p['statusMcb']}';
  final _alasan = TextEditingController();
  String _galat = '';
  bool _sibuk = false;

  @override
  void dispose() {
    for (final c in [_meter, _perlu, _daya, _merk, _alasan]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _kirim() async {
    if (_alasan.text.trim().isEmpty) return setState(() => _galat = 'Isi alasan.');
    setState(() {
      _galat = '';
      _sibuk = true;
    });
    final dasar = {'pemakaianId': widget.p['pemakaianId'], 'revision': (widget.p['revision'] as num?)?.toInt() ?? 1, 'alasan': _alasan.text.trim()};
    final data = widget.batal
        ? dasar
        : {...dasar, 'nomorMeter': _meter.text.trim(), 'keperluan': _perlu.text.trim(), 'daya': _daya.text.trim(), 'merk': _merk.text.trim(), 'statusMcb': _status};
    final ok = await widget.simpan(data);
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.batal ? 'Batalkan pemakaian' : 'Koreksi pemakaian'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${widget.p['nomorPemakaian']}', style: const TextStyle(fontWeight: FontWeight.w800)),
            if (widget.batal)
              const Text('MCB kembali ke stok tim. Nomor pemakaian ini tidak dipakai ulang.', style: TextStyle(fontSize: 12.5))
            else ...[
              TextField(controller: _meter, maxLength: 30, decoration: sisiInput('Nomor meter')),
              KolomDaftar(controller: _perlu, daftar: widget.keperluan, label: 'Keperluan', maks: 200),
              KolomDaya(controller: _daya),
              KolomDaftar(controller: _merk, daftar: widget.merk, label: 'Merk'),
              PilihStatusMcb(nilai: _status, onChanged: (v) => setState(() => _status = v)),
              const Text('Mengganti daya / merk / status memindahkan stok.', style: TextStyle(fontSize: 12, color: AppColors.neutral500)),
            ],
            TextField(key: const Key('f-alasan'), controller: _alasan, maxLength: 200, decoration: sisiInput('Alasan (wajib, tercatat)')),
            if (_galat.isNotEmpty) Text(_galat, style: const TextStyle(color: AppColors.red700, fontSize: 12.5)),
          ]),
        ),
        actions: [
          TextButton(onPressed: _sibuk ? null : () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(key: const Key('f-simpan'), onPressed: _sibuk ? null : _kirim, child: Text(widget.batal ? 'Batalkan pemakaian' : 'Simpan koreksi')),
        ],
      );
}

// ---------- Izin

class _TabIzin extends StatefulWidget {
  const _TabIzin({required this.repo, required this.sesi, required this.ubah});
  final GudangRepository repo;
  final Sesi sesi;
  final bool ubah;
  @override
  State<_TabIzin> createState() => _TabIzinState();
}

class _TabIzinState extends State<_TabIzin> with _Muat<_TabIzin> {
  Map<String, dynamic>? _data;
  String _materialId = '';
  Set<String> _pilih = {};
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    unawaited(muat());
  }

  List<Map<String, dynamic>> _daftar(String k) => [for (final x in (_data?[k] as List? ?? const []).whereType<Map<dynamic, dynamic>>()) Map<String, dynamic>.from(x)];

  void _pilihMaterial(String id) {
    _materialId = id;
    _pilih = {for (final i in _daftar('izin')) if (i['materialId'] == id && i['aktif'] == true) '${i['timId']}'};
  }

  @override
  Future<void> ambil() async {
    _data = await widget.repo.izin(widget.sesi);
    final m = _daftar('material');
    _pilihMaterial(m.any((x) => x['materialId'] == _materialId) ? _materialId : (m.isEmpty ? '' : m.first['materialId'] as String));
  }

  Future<void> _simpan() async {
    setState(() => _sibuk = true);
    var peringatan = '';
    final ok = await _tulis(context, () async {
      final h = await widget.repo.simpanIzin(widget.sesi, _materialId, _pilih.toList());
      final sisa = (h['stokTertinggal'] as List? ?? const []).whereType<Map<dynamic, dynamic>>().toList();
      if (sisa.isNotEmpty) peringatan = ' Stok masih tertinggal di ${sisa.length} tim: tarik ke gudang di tab Stok.';
    });
    if (mounted) {
      setState(() => _sibuk = false);
      if (ok) tampilPesan(context, 'Izin tersimpan.$peringatan');
      if (ok) await muat();
    }
  }

  @override
  Widget build(BuildContext context) {
    final k = keadaan(_data != null);
    if (k != null) return k;
    final material = _daftar('material'), tim = _daftar('tim');
    final kelompok = <String, List<Map<String, dynamic>>>{};
    for (final t in tim) {
      (kelompok['${t['jenis']}'] ??= []).add(t);
    }
    return RefreshSisi(
      onRefresh: muat,
      child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(16), children: [
        _kolomPilih('Material', [for (final m in material) PilihanItem(m['materialId'] as String, '${m['nama']}')], _materialId, (v) => setState(() => _pilihMaterial(v))),
        const SizedBox(height: 6),
        const Text('Material tanpa izin tidak boleh dipakai tim mana pun. Centang tim yang boleh memakainya.', style: TextStyle(fontSize: 12.5, color: AppColors.neutral700)),
        for (final e in (kelompok.entries.toList()..sort((a, b) => a.key.compareTo(b.key))))
          _kartu([
            Text(e.key, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.navy900)),
            for (final t in e.value)
              CheckboxListTile(
                key: Key('izin-${t['timId']}'),
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${t['nama']}'),
                value: _pilih.contains('${t['timId']}'),
                onChanged: !widget.ubah || _sibuk
                    ? null
                    : (v) => setState(() {
                          if (v == true) {
                            _pilih.add('${t['timId']}');
                          } else {
                            _pilih.remove('${t['timId']}');
                          }
                        }),
              ),
          ]),
        if (widget.ubah)
          SizedBox(height: 48, child: FilledButton(key: const Key('simpan-izin'), onPressed: _sibuk || _materialId.isEmpty ? null : _simpan, child: const Text('Simpan izin'))),
      ]),
    );
  }
}
