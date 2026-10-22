import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../wo/wo_foto_server.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../../widgets/sisi_loader.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_form.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_lokal.dart';
import '../hartek/hartek_store.dart' show GudangHartekSql;
import '../row/row_repository.dart' show RowError;
import '../wo/wo_admin_screen.dart';
import '../wo/wo_bantu.dart';
import 'insjar_form.dart';
import 'insjar_header.dart';
import 'insjar_lokal.dart';
import 'insjar_store.dart' show pesanInsJar;
import 'ringkasan_temuan.dart';
import 'temuan_offline.dart';

/// v1.0.0 (permintaan kvlar 19 Okt 2026): Input Temuan Inspeksi khusus admin (menu OPS_INPUT_TEMUAN).
/// Form sama dengan petugas Inspeksi Jaringan + pilihan penyulang. Online (admin di kantor): simpan langsung ke server
/// (simpanTemuanInspeksi, idBaris dibuat sekali per form, jadi kirim ulang = duplikat, bukan baris kembar), lalu foto
/// temuan / tiang (uploadFotoTemuanInspeksi). Foto yang gagal terkirim ditandai di kartu dan bisa dikirim ulang.
/// v1.0.11: object Gardu memilih gardu AKTIF (db_Gardu); kartu menampilkan status WO + tombol Penerusan WO di header.
///
/// v1.0.17 (permintaan kvlar 22 Okt 2026): menu bernama "Temuan Inspeksi", dua tab:
///  1. Input: kosong, hanya keterangan + tombol + (kanan bawah) untuk membuka form temuan.
///  2. Daftar Temuan: temuan rentang tanggal diunduh sekali dan disimpan di HP (offline, langsung tampil), filter
///     multi-pilihan (jenis temuan, tanggal inspeksi, penyulang, tim inspeksi), kartu ringkasan jumlah per jenis temuan
///     di bawah filter (ketuk jenis = saring).
class InputTemuanInspeksiScreen extends StatefulWidget {
  const InputTemuanInspeksiScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_INPUT_TEMUAN';

  /// v1.0.17: rentang unduh bawaan (hari ke belakang, termasuk hari ini). Server membatasi 92 hari.
  static const hariBawaan = 30, hariMaks = 92;

  @override
  State<InputTemuanInspeksiScreen> createState() => _InputTemuanInspeksiScreenState();
}

class _InputTemuanInspeksiScreenState extends State<InputTemuanInspeksiScreen> with SingleTickerProviderStateMixin {
  static const _uuid = Uuid();

  late final TabController _tab = TabController(length: 2, vsync: this)..addListener(_gantiTab);
  late final SimpananTemuanOffline _simpanan = SimpananTemuanOffline(GudangHartekSql(widget.deps.db));

  MasterInsJar? _master;
  Map<String, dynamic>? _offline; // {dari, sampai, diambil, temuan}
  FilterTemuan _filter = const FilterTemuan();
  ModeRingkasTemuan _modeRingkas = ModeRingkasTemuan.jenis; // v1.0.18: per jenis / per section
  String? _galat;
  bool _sibuk = false, _muat = false, _offlineDibaca = false;

  /// Foto yang belum diterima server: temuanId -> {SLOT: path}, plus galatnya.
  final Map<String, Map<String, String>> _tertunda = {};
  final Map<String, Map<String, String>> _galatFoto = {};

  Sesi get _sesi => widget.sesi;
  bool get _boleh => _sesi.bisaUbah(InputTemuanInspeksiScreen.menu);

  /// v1.0.11: akun yang punya menu Penerusan WO bisa langsung meneruskan temuan dari layar ini.
  bool get _bolehWo => _sesi.aksiMenu(WoAdminScreen.menu) != null;

  List<Map<String, dynamic>> get _semua => InsJarLokal.daftar(_offline?['temuan']);

  static String _teks(Object? v) => v?.toString().trim() ?? '';

  static String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  DateTime get _hariIni {
    final k = Wib.dinding(DateTime.now());
    return DateTime(k.year, k.month, k.day);
  }

  @override
  void initState() {
    super.initState();
    unawaited(_mulai());
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _gantiTab() {
    if (!_tab.indexIsChanging && mounted) setState(() {}); // tombol + hanya di tab Input
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data) =>
      widget.deps.api.call(aksi, token: _sesi.token, data: data);

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));

  /// v1.0.18: master form temuan disimpan di HP supaya tombol + langsung membuka form (tanpa menunggu server).
  String get _kunciMaster => 'master_temuan_inspeksi_${_sesi.userId}';

  /// Daftar + master form dari HP dulu (instan), lalu perbarui keduanya di latar kalau ada sinyal.
  Future<void> _mulai() async {
    final o = await _simpanan.baca(_sesi.userId);
    MasterInsJar? m;
    try {
      final c = await GudangHartekSql(widget.deps.db).bacaMaster(_kunciMaster);
      if (c != null) m = MasterInsJar(Map<String, dynamic>.from(jsonDecode(c.json) as Map));
    } catch (_) {/* simpanan rusak = tunggu server */}
    if (!mounted) return;
    setState(() {
      _offline = o;
      _offlineDibaca = true;
      _master ??= m;
    });
    unawaited(_muatMaster());
    await _unduh(diam: o != null);
  }

  /// Master form dari server, disimpan di HP. Gagal (tanpa sinyal) = master simpanan tetap dipakai.
  Future<void> _muatMaster() async {
    try {
      final r = await _api('getMasterTemuanInspeksi', const {});
      final m = MasterInsJar(r);
      unawaited(GudangHartekSql(widget.deps.db).tulisMaster(_kunciMaster, jsonEncode(r)).catchError((Object _) {}));
      if (mounted) setState(() => _master = m);
    } catch (_) {
      // tanpa sinyal: master simpanan HP (kalau ada) tetap dipakai
    }
  }

  /// Unduh temuan rentang [dari]..[sampai] (bawaan = rentang simpanan / 30 hari terakhir) lalu simpan di HP.
  /// [diam] = galat sinyal tidak ditampilkan (daftar offline tetap dipakai).
  Future<void> _unduh({DateTime? dari, DateTime? sampai, bool diam = false}) async {
    if (_muat) return;
    final akhir = sampai ?? _hariIni;
    final awal = dari ??
        (DateTime.tryParse(_teks(_offline?['dari'])) ?? akhir.subtract(const Duration(days: InputTemuanInspeksiScreen.hariBawaan - 1)));
    setState(() {
      _muat = true;
      if (!diam) _galat = null;
    });
    try {
      final r = await _api('getTemuanInspeksi', {'dari': _iso(awal), 'sampai': _iso(akhir)});
      final isi = {
        'dari': _teks(r['dari']),
        'sampai': _teks(r['sampai']),
        'diambil': _teks(r['diambil']),
        'temuan': r['temuan'] ?? const [],
        'urutanSection': r['urutanSection'] ?? const [], // v1.0.19: urutan section db_Jaringan per penyulang
      };
      await _simpanan.tulis(_sesi.userId, isi);
      if (mounted) {
        setState(() {
          _offline = isi;
          _galat = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted && !diam) setState(() => _galat = e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk memperbarui daftar temuan.' : pesanInsJar(e.kode));
    } catch (_) {
      if (mounted && !diam) setState(() => _galat = 'Butuh sinyal untuk memperbarui daftar temuan.');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _pilihRentang() async {
    final akhir = _hariIni;
    final dari = DateTime.tryParse(_teks(_offline?['dari'])) ?? akhir.subtract(const Duration(days: InputTemuanInspeksiScreen.hariBawaan - 1));
    final sampai = DateTime.tryParse(_teks(_offline?['sampai'])) ?? akhir;
    final p = await showDateRangePicker(
      context: context,
      firstDate: akhir.subtract(const Duration(days: 365)),
      lastDate: akhir,
      initialDateRange: DateTimeRange(start: dari.isAfter(sampai) ? sampai : dari, end: sampai.isAfter(akhir) ? akhir : sampai),
      helpText: 'Rentang tanggal temuan (maks ${InputTemuanInspeksiScreen.hariMaks} hari)',
    );
    if (p == null || !mounted) return;
    if (p.end.difference(p.start).inDays + 1 > InputTemuanInspeksiScreen.hariMaks) {
      _pesan('Rentang maksimal ${InputTemuanInspeksiScreen.hariMaks} hari.');
      return;
    }
    setState(() => _filter = const FilterTemuan());
    await _unduh(dari: p.start, sampai: p.end);
  }

  Future<void> _bukaWo() async {
    await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => WoAdminScreen(deps: widget.deps, sesi: _sesi)));
    if (mounted) await _unduh(diam: true);
  }

  /// Status WO temuan di kartu (kosong = belum diteruskan).
  Widget? _statusWo(Map<String, dynamic> t) {
    final wo = petaWo(t['wo']);
    final s = teksWo(wo['status']);
    final teks = s.isEmpty
        ? 'WO: belum diteruskan ke tim'
        : 'WO ${StatusWo.label(s).toLowerCase()}${teksWo(wo['tim']).isEmpty ? '' : ' · ${teksWo(wo['tim'])}'}'
            '${s == StatusWo.selesai && teksWo(wo['tindakLanjut']).isNotEmpty ? '\n${teksWo(wo['tindakLanjut'])}' : ''}';
    final warna = s == StatusWo.selesai
        ? AppColors.success700
        : s == StatusWo.dikerjakan
            ? AppColors.accent700
            : s == StatusWo.terkirim
                ? HartekGaya.merek
                : HartekGaya.redup;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(children: [
        Icon(Icons.assignment_turned_in_outlined, size: 16, color: warna),
        const SizedBox(width: 6),
        Expanded(child: Text(teks, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: warna))),
      ]),
    );
  }

  /// Kirim foto satu slot. true = diterima server.
  Future<bool> _kirimFoto(String temuanId, String slot, String path) async {
    final bytes = await FotoLapangan.baca(path);
    if (bytes == null) {
      _galatFoto.putIfAbsent(temuanId, () => {})[slot] = 'File foto tidak ada lagi di HP. Ambil ulang.';
      return false;
    }
    try {
      await _api('uploadFotoTemuanInspeksi', {'temuanId': temuanId, 'slot': slot, ...FotoLapangan.isiKirim(bytes)});
      _tertunda[temuanId]?.remove(slot);
      _galatFoto[temuanId]?.remove(slot);
      unawaited(FotoLapangan.hapus(path)); // sudah di Drive, salinan HP tidak diperlukan
      return true;
    } on ApiException catch (e) {
      _tertunda.putIfAbsent(temuanId, () => {})[slot] = path;
      _galatFoto.putIfAbsent(temuanId, () => {})[slot] =
          e.kode.startsWith('HTTP_') || e.kode == KodeError.serverSibuk ? 'Belum terkirim (sinyal). Ketuk untuk kirim ulang.' : pesanInsJar(e.kode);
      return false;
    } catch (_) {
      _tertunda.putIfAbsent(temuanId, () => {})[slot] = path;
      _galatFoto.putIfAbsent(temuanId, () => {})[slot] = 'Belum terkirim (sinyal). Ketuk untuk kirim ulang.';
      return false;
    }
  }

  /// Tombol + (tab Input): form temuan. Tanggal temuan = hari ini.
  /// v1.0.18: penanda sibuk dipasang SEBELUM menunggu apa pun (dulu sesudah memuat master dari server, sehingga ketukan
  /// berulang selama jeda membuka beberapa form sekaligus). Master dari HP = form langsung terbuka.
  Future<void> _catat() async {
    if (_sibuk || !_boleh) return;
    setState(() => _sibuk = true);
    try {
      await _catatForm();
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _catatForm() async {
    if (_master == null) await _muatMaster();
    final m = _master;
    if (!mounted) return;
    if (m == null) {
      _pesan('Butuh sinyal sekali untuk memuat pilihan form temuan.');
      return;
    }
    final tanggal = Wib.tanggal(DateTime.now());
    final idBaris = _uuid.v4(); // sekali per form: simpan ulang sesudah gangguan sinyal = duplikat, bukan baris kembar
    var fotoGagal = 0;
    final hasil = await bukaFormHartek(
      context,
      judulApp: 'Temuan Inspeksi',
      judul: 'Temuan inspeksi',
      keterangan: '${tanggalHartek(tanggal)} · ${_sesi.nama}\nTersimpan langsung ke server (butuh sinyal).',
      tombol: 'Simpan temuan',
      catatanBawah: catatanFormOnline,
      // v1.0.5: segmen hanya tampil untuk object Jaringan
      daftar: (n) => isianTemuan(_sesi, m,
          kode: 'Admin ${tanggalHartek(tanggal)}', folderFoto: 'temuan_admin', nilai: n, pilihGardu: true), // v1.0.11: + gardu
      simpan: (n) async {
        final p = pisahTemuan(n, m, admin: true);
        final r = await _api('simpanTemuanInspeksi', {...p.data, 'tanggal': tanggal, 'idBaris': idBaris});
        final id = _teks(r['temuanId']).isEmpty ? idBaris : _teks(r['temuanId']);
        for (final e in p.foto.entries) {
          if (!await _kirimFoto(id, e.key, e.value)) fotoGagal++;
        }
        return {'temuanId': id, 'kodeTemuan': _teks(r['kodeTemuan']), 'tampil': p.tampil};
      },
    );
    if (!mounted || hasil == null) return;
    // daftar offline langsung memuat temuan baru (tanpa menunggu unduh ulang)
    final isi = _offline ?? {'dari': tanggal, 'sampai': tanggal, 'diambil': '', 'temuan': const []};
    final baru = SimpananTemuanOffline.sisipkan(isi, {
      ...Map<String, dynamic>.from(hasil['tampil'] as Map),
      'temuanId': hasil['temuanId'],
      'kodeTemuan': hasil['kodeTemuan'],
      'tanggal': tanggal,
    });
    await _simpanan.tulis(_sesi.userId, baru);
    if (!mounted) return;
    setState(() => _offline = baru);
    _pesan(fotoGagal > 0
        ? 'Temuan ${_teks(hasil['kodeTemuan'])} tersimpan. $fotoGagal foto belum terkirim, ketuk fotonya di tab Daftar Temuan.'
        : 'Temuan ${_teks(hasil['kodeTemuan'])} tersimpan.');
    _tab.animateTo(1);
    unawaited(_unduh(diam: true));
  }

  Map<String, dynamic> _nodeFoto(Map<String, dynamic> t) {
    final id = _teks(t['temuanId']);
    final tunda = _tertunda[id] ?? const <String, String>{};
    return {
      ...t,
      HartekLokal.fotoLokal: tunda,
      HartekLokal.fotoSinkron: {for (final s in tunda.keys) s: HartekLokal.gagal},
      HartekLokal.fotoGalat: _galatFoto[id] ?? const <String, String>{},
    };
  }


  /// v1.0.19: foto temuan di Drive dibaca lewat server (getFotoTemuanInspeksi), dipakai thumbnail kartu + lihat foto penuh.
  Future<Map<String, dynamic>> _muatFotoTemuan(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call('getFotoTemuanInspeksi', token: widget.sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  Future<void> _ketukFoto(Map<String, dynamic> t, String slot) async {
    final id = _teks(t['temuanId']);
    final label = InsJarLokal.labelFoto[slot] ?? slot;
    final tunda = _tertunda[id]?[slot];
    if (tunda != null) {
      final pilih = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('$label belum terkirim'),
          content: Text(_galatFoto[id]?[slot] ?? 'Foto belum diterima server.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, 'BUANG'), child: const Text('Buang foto')),
            TextButton(onPressed: () => Navigator.pop(c, 'LIHAT'), child: const Text('Lihat')),
            FilledButton(onPressed: () => Navigator.pop(c, 'ULANG'), child: const Text('Kirim ulang')),
          ],
        ),
      );
      if (!mounted || pilih == null) return;
      if (pilih == 'LIHAT') {
        await lihatFoto(context, path: tunda, slot: label);
      } else if (pilih == 'BUANG') {
        setState(() {
          _tertunda[id]?.remove(slot);
          _galatFoto[id]?.remove(slot);
        });
        await FotoLapangan.hapus(tunda);
      } else {
        setState(() => _sibuk = true);
        final ok = await _kirimFoto(id, slot, tunda);
        if (!mounted) return;
        setState(() => _sibuk = false);
        _pesan(ok ? '$label terkirim.' : (_galatFoto[id]?[slot] ?? 'Foto belum terkirim.'));
        if (ok) await _unduh(diam: true);
      }
      return;
    }
    if (_teks((t['foto'] is Map ? t['foto'] as Map : const {})[slot]).isNotEmpty) {
      await FotoServerWo.lihat(context, _muatFotoTemuan, {'temuanId': id, 'slot': slot}, label);
      return;
    }
    if (!_boleh || _sibuk || _teks(t['sumber']) != 'ADMIN') return;
    try {
      final nilai = <String, String>{for (final e in t.entries) if (e.value is String) e.key: e.value as String};
      final path = await FotoLapangan.ambil(context,
          label: label,
          pratinjau: watermarkTemuan(_sesi, kode: _teks(t['kodeTemuan']), nilai: nilai, slot: slot),
          folder: 'temuan_admin',
          bolehGaleri: true);
      if (path == null || !mounted) return;
      setState(() => _sibuk = true);
      final ok = await _kirimFoto(id, slot, path);
      if (!mounted) return;
      setState(() => _sibuk = false);
      _pesan(ok ? '$label terkirim.' : (_galatFoto[id]?[slot] ?? 'Foto belum terkirim.'));
      if (ok) await _unduh(diam: true);
    } on RowError catch (e) {
      if (mounted) _pesan(e.pesan);
    }
  }

  // ---------- filter ----------

  Future<void> _bukaFilter(KategoriFilterTemuan k) async {
    final pilihan = pilihanFilterTemuan(_semua, k);
    final jumlah = <String, int>{};
    for (final t in _semua) {
      final v = nilaiFilterTemuan(t, k);
      jumlah[v] = (jumlah[v] ?? 0) + 1;
    }
    final hasil = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) {
        var dipilih = {..._filter.dari(k)};
        return StatefulBuilder(
          builder: (c, setSheet) => ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .8),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 4),
                child: Row(children: [
                  Expanded(child: Text(k.label, style: HartekGaya.judulSeksi)),
                  TextButton(onPressed: dipilih.isEmpty ? null : () => setSheet(() => dipilih = {}), child: const Text('Hapus pilihan')),
                ]),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, 6),
                child: Align(alignment: Alignment.centerLeft, child: Text('Boleh pilih lebih dari satu.', style: HartekGaya.sekunder)),
              ),
              Flexible(
                child: pilihan.isEmpty
                    ? const Padding(padding: EdgeInsets.all(24), child: Text('Belum ada data.', style: HartekGaya.sekunder))
                    : ListView(shrinkWrap: true, children: [
                        for (final v in pilihan)
                          CheckboxListTile(
                            value: dipilih.contains(v),
                            onChanged: (b) => setSheet(() => b == true ? dipilih.add(v) : dipilih.remove(v)),
                            title: Text(k == KategoriFilterTemuan.tanggal && v != '-' ? tanggalHartek(v) : v),
                            secondary: Text('${jumlah[v] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800, color: HartekGaya.redup)),
                            controlAffinity: ListTileControlAffinity.leading,
                          ),
                      ]),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: FilledButton(
                    onPressed: () => Navigator.pop(c, dipilih),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    child: Text(dipilih.isEmpty ? 'Tampilkan semua' : 'Terapkan (${dipilih.length})'),
                  ),
                ),
              ),
            ]),
          ),
        );
      },
    );
    if (hasil == null || !mounted) return;
    setState(() => _filter = _filter.atur(k, hasil));
  }

  Widget _barisFilter() => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final k in KategoriFilterTemuan.values) ...[
            FilterChip(
              selected: _filter.dari(k).isNotEmpty,
              onSelected: (_) => unawaited(_bukaFilter(k)),
              avatar: Icon(
                switch (k) {
                  KategoriFilterTemuan.jenis => Icons.category_outlined,
                  KategoriFilterTemuan.tanggal => Icons.event_rounded,
                  KategoriFilterTemuan.penyulang => Icons.electric_bolt_outlined,
                  KategoriFilterTemuan.tim => Icons.groups_rounded,
                },
                size: 18,
              ),
              label: Text(_filter.dari(k).isEmpty ? k.label : '${k.label} (${_filter.dari(k).length})'),
              showCheckmark: false,
            ),
            const SizedBox(width: 8),
          ],
          if (!_filter.kosong) TextButton(onPressed: () => setState(() => _filter = const FilterTemuan()), child: const Text('Reset')),
        ]),
      );

  // ---------- tampilan ----------

  Widget _tabInput() => LayoutBuilder(
        builder: (context, c) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: c.maxHeight),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(32, 24, 32, 120),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(30)),
                  child: const Icon(Icons.content_paste_search_rounded, size: 46, color: HartekGaya.merek),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Silahkan klik tanda + di kanan bawah untuk membuat temuan inspeksi',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, height: 1.45, fontWeight: FontWeight.w700, color: HartekGaya.tinta),
                ),
              ]),
            ),
          ),
        ),
      );

  Widget _tabDaftar() {
    final semua = _semua;
    final tampil = _filter.saring(semua);
    final o = _offline;
    return RefreshIndicator(
      onRefresh: () => _unduh(),
      child: CustomScrollView(physics: const AlwaysScrollableScrollPhysics(), slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // info data offline + rentang
              Row(children: [
                Icon(o == null ? Icons.cloud_off_outlined : Icons.offline_pin_rounded, size: 18, color: HartekGaya.redup),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    o == null
                        ? (_offlineDibaca ? 'Daftar belum diunduh ke HP.' : 'Membaca daftar di HP...')
                        : 'Offline · ${tanggalHartek(_teks(o['dari']))} s.d. ${tanggalHartek(_teks(o['sampai']))}'
                            '${_teks(o['diambil']).isEmpty ? '' : ' · diunduh ${waktuWo(_teks(o['diambil']))}'}',
                    style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup),
                  ),
                ),
                TextButton.icon(
                  onPressed: _muat ? null : _pilihRentang,
                  icon: const Icon(Icons.date_range_rounded, size: 18),
                  label: const Text('Rentang'),
                ),
              ]),
              if (_galat != null)
                Container(
                  margin: const EdgeInsets.only(top: 6, bottom: 6),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: AppColors.red700, size: 20),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_galat!, style: const TextStyle(fontSize: 13.5, color: AppColors.red700))),
                    TextButton(onPressed: () => unawaited(_unduh()), child: const Text('Coba lagi')),
                  ]),
                ),
              const SizedBox(height: 6),
              _barisFilter(),
              const SizedBox(height: 12),
              if (semua.isNotEmpty)
                KartuRingkasTemuan(
                  // v1.0.19: daftar temuan tidak lagi di halaman ini; ketuk ringkasan = halaman daftar temuan terpisah
                  data: DataRingkasTemuan(temuan: tampil, urutan: urutanSectionTemuan(o?['urutanSection']), kartu: (c, t) => _kartuTemuan(t)),
                  dariSemua: semua.length,
                  mode: _modeRingkas,
                  onMode: (m) => setState(() => _modeRingkas = m),
                ),
              const SizedBox(height: 12),
              if (o == null && !_offlineDibaca)
                const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
              else if (o == null)
                const KosongHartek(
                    ikon: Icons.cloud_download_outlined,
                    judul: 'Daftar temuan belum ada di HP',
                    petunjuk: 'Butuh sinyal sekali untuk mengunduh. Sesudahnya daftar tampil langsung tanpa sinyal.')
              else if (tampil.isEmpty)
                KosongHartek(
                  ikon: Icons.report_gmailerrorred_rounded,
                  judul: semua.isEmpty ? 'Belum ada temuan di rentang ini' : 'Tidak ada temuan yang cocok',
                  petunjuk: semua.isEmpty ? 'Ubah rentang tanggal atau tarik layar untuk memperbarui.' : 'Ubah atau reset filter.',
                ),
            ]),
          ),
        ),
      ]),
    );
  }

  /// v1.0.19: kartu satu temuan (foto server, status WO), dipakai halaman daftar temuan terpisah.
  Widget _kartuTemuan(Map<String, dynamic> t) {
    final wo = _statusWo(t);
    return KartuTemuan(
      t: t,
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: _teks(t['sumber']) == 'ADMIN' ? AppColors.brand100 : AppColors.neutral100,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(timInspeksiTemuan(t), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: HartekGaya.redup)),
      ),
      fotoBawah: FotoRincian(
        node: _nodeFoto(t),
        slot: InsJarLokal.slotFoto,
        label: const {'TEMUAN': 'Temuan', 'TIANG': 'Tiang'},
        bolehTambah: _boleh && _teks(t['sumber']) == 'ADMIN',
        onTap: (s) => unawaited(_ketukFoto(t, s)),
        gambarServer: (s) => GambarServerWo(
            key: ValueKey('temuan-${_teks(t['temuanId'])}-$s'), muat: _muatFotoTemuan, data: {'temuanId': _teks(t['temuanId']), 'slot': s}),
      ),
      bawah: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_teks(t['tanggal']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Tanggal inspeksi: ${tanggalHartek(_teks(t['tanggal']))}', style: HartekGaya.sekunder),
          ),
        if (wo != null) wo,
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final semua = _semua.length;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      floatingActionButton: _tab.index == 0 && _boleh
          ? FloatingActionButton(
              tooltip: 'Buat temuan inspeksi',
              onPressed: _sibuk ? null : () => unawaited(_catat()),
              child: _sibuk ? const SisiLoader(ukuran: 24, warna: Colors.white) : const Icon(Icons.add_rounded, size: 30),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: HeaderInsJar(
              kicker: 'Temuan Inspeksi',
              judul: '$semua temuan',
              sub: 'Tersimpan di HP (offline)',
              ikon: Icons.content_paste_search_rounded,
              aksi: [
                tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
                if (_bolehWo) ...[
                  const SizedBox(width: 6),
                  tombolHeaderInsJar(Icons.alt_route_rounded, 'Penerusan Tim Temuan Inspeksi', _muat || _sibuk ? null : _bukaWo),
                ],
              ],
            ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: HartekGaya.garis)),
            child: TabBar(
              controller: _tab,
              dividerColor: Colors.transparent,
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(gradient: HartekGaya.gradien, borderRadius: BorderRadius.circular(12)),
              labelColor: Colors.white,
              unselectedLabelColor: HartekGaya.redup,
              labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
              tabs: [
                const Tab(height: 42, text: 'Input Temuan'),
                Tab(height: 42, text: semua == 0 ? 'Daftar Temuan' : 'Daftar Temuan ($semua)'),
              ],
            ),
          ),
          Expanded(child: TabBarView(controller: _tab, children: [_tabInput(), _tabDaftar()])),
        ]),
      ),
    );
  }
}
