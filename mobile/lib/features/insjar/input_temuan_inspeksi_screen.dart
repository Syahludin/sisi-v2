import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../c4a/c4a_arsip_tab.dart';
import '../c4a/c4a_laporan_tab.dart';
import '../c4a/c4a_model.dart';
import '../wo/wo_foto_server.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../../widgets/popup_berhasil.dart';
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
import '../wo/wo_penerusan.dart';
import '../wo/wo_pilih_tim.dart';
import '../wo/wo_teruskan.dart';
import 'insjar_form.dart';
import 'insjar_header.dart';
import 'insjar_lokal.dart';
import 'insjar_store.dart' show pesanInsJar;
import 'ringkasan_temuan.dart';
import 'temuan_admin_antre.dart';
import 'temuan_offline.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.0 (permintaan Master Guswan 19 Okt 2026): Input Temuan Inspeksi khusus admin (menu OPS_INPUT_TEMUAN).
/// Form sama dengan petugas Inspeksi Jaringan + pilihan penyulang. Online (admin di kantor): simpan langsung ke server
/// (simpanTemuanInspeksi, idBaris dibuat sekali per form, jadi kirim ulang = duplikat, bukan baris kembar), lalu foto
/// temuan / tiang (uploadFotoTemuanInspeksi). Foto yang gagal terkirim ditandai di kartu dan bisa dikirim ulang.
/// v1.0.11: object Gardu memilih gardu AKTIF (db_Gardu); kartu menampilkan status WO + tombol Penerusan WO di header.
/// v1.0.29 (permintaan Master Guswan 24 Okt 2026): Simpan tidak menunggu server. Form langsung tertutup, pop up "Data Berhasil
/// disimpan", temuan masuk daftar HP lalu dikirim di latar (AntreanTemuanAdmin), tanpa chip / pesan kirim.
///
/// v1.0.17 (permintaan Master Guswan 22 Okt 2026): menu bernama "Temuan Inspeksi", dua tab:
///  1. Input: kosong, hanya keterangan + tombol + (kanan bawah) untuk membuka form temuan.
///  2. Daftar Temuan: temuan rentang tanggal diunduh sekali dan disimpan di HP (offline, langsung tampil), filter
///     multi-pilihan (jenis temuan, tanggal inspeksi, penyulang, tim inspeksi), kartu ringkasan jumlah per jenis temuan
///     di bawah filter (ketuk jenis = saring).
class InputTemuanInspeksiScreen extends StatefulWidget {
  const InputTemuanInspeksiScreen({super.key, required this.deps, required this.sesi, this.bukaTemuanId});

  /// v1.0.20: dibuka dari lonceng = tab Daftar + rincian temuan ini langsung tampil.
  final String? bukaTemuanId;
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

  // C4A (15 Nov 2026): tiga tab Laporan C4A / Daftar Temuan / Arsip C4A
  late final TabController _tab = TabController(length: 3, vsync: this)..addListener(_gantiTab);
  late final SimpananTemuanOffline _simpanan = SimpananTemuanOffline(GudangHartekSql(widget.deps.db));

  MasterInsJar? _master;
  Map<String, dynamic>? _offline; // {dari, sampai, diambil, temuan}
  FilterTemuan _filter = const FilterTemuan();
  ModeRingkasTemuan _modeRingkas = ModeRingkasTemuan.jenis; // v1.0.18: per jenis / per section
  String? _galat;
  bool _sibuk = false, _muat = false, _offlineDibaca = false;

  Sesi get _sesi => widget.sesi;
  AntreanTemuanAdmin get _antre => widget.deps.temuanAdmin;
  int _jumlahAntre = 0;
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
    _antre.addListener(_antreBerubah);
    PenerusanWo.i.addListener(_woBerubah);
    unawaited(_mulai());
  }

  @override
  void dispose() {
    _antre.removeListener(_antreBerubah);
    PenerusanWo.i.removeListener(_woBerubah);
    _tab.dispose();
    super.dispose();
  }

  /// v1.0.29: antrean kirim berubah (kode temuan dari server / foto terkirim): daftar HP dibaca ulang; ada temuan yang
  /// selesai terkirim = daftar diperbarui diam-diam dari server (foto + kode tampil).
  void _antreBerubah() {
    if (!mounted) return;
    final n = _hitungAntre();
    final berkurang = n < _jumlahAntre;
    _jumlahAntre = n;
    unawaited(_simpanan.baca(_sesi.userId).then((o) {
      if (mounted && o != null) setState(() => _offline = o);
    }));
    if (berkurang) unawaited(_unduh(diam: true));
  }

  /// v1.0.58: antrean penerusan WO berubah: kartu temuan menampilkan "sedang dikirim" / tombol lagi.
  void _woBerubah() {
    if (mounted) setState(() {});
  }

  /// v1.0.58: Teruskan ke tim dari kartu temuan (hanya akun UBAH di Penerusan WO). Pemilih tim sama dengan layar Penerusan WO;
  /// pengiriman lewat antrean latar yang sama, daftar temuan diperbarui diam-diam sesudah berhasil.
  Future<void> _teruskanKeTim(Map<String, dynamic> t) async {
    List<Map<String, dynamic>> tim;
    try {
      tim = await timTujuanWo(userId: _sesi.userId, api: _api);
    } catch (_) {
      if (mounted) _pesan('Butuh sinyal untuk memuat daftar tim.');
      return;
    }
    if (!mounted) return;
    final p = await pilihTimWo(context, temuan: t, tim: tim);
    if (p == null || !mounted) return;
    final nama = _teks(tim.where((x) => _teks(x['timId']) == p.$1).map((x) => x['nama']).firstOrNull);
    teruskanWoKeAntre(
      userId: _sesi.userId,
      api: _api,
      temuan: t,
      timId: p.$1,
      namaTim: nama,
      catatan: p.$2,
      selesai: (ok) {
        if (ok && mounted) unawaited(_unduh(diam: true));
      },
    );
    // v1.0.58: kirim di latar tanpa chip proses, hanya kartu berhasil
    unawaited(tampilPopupBerhasil(context, judul: 'Data berhasil disimpan', keterangan: keteranganKirimWo(_teks(t['kodeTemuan']), nama), tembus: true));
  }

  int _hitungAntre() => _semua.where((t) => _antre.item(_sesi.userId, _teks(t['temuanId'])) != null).length;

  void _gantiTab() {
    if (!_tab.indexIsChanging && mounted) setState(() {}); // tombol + hanya di tab Input
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data) =>
      widget.deps.api.call(aksi, token: _sesi.token, data: data);

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));

  /// v1.0.18: master form temuan disimpan di HP supaya tombol + langsung membuka form (tanpa menunggu server).
  String get _kunciMaster => AntreanTemuanAdmin.kunciMaster(_sesi.userId);

  /// Daftar + master form dari HP dulu (instan), lalu perbarui keduanya di latar kalau ada sinyal.
  Future<void> _mulai() async {
    await _antre.daftar(_sesi.userId);
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
      _jumlahAntre = _hitungAntre();
    });
    unawaited(_antre.kirim(_sesi)); // v1.0.29: sisa antrean (mis. app ditutup sebelum terkirim)
    unawaited(_muatMaster());
    unawaited(_muatLaporan());
    if (!_bukaTujuan()) {
      await _unduh(diam: o != null);
      _bukaTujuan();
    } else {
      unawaited(_unduh(diam: true));
    }
  }

  bool _tujuanDibuka = false;

  /// v1.0.20: temuan dari lonceng = pindah ke tab Daftar Temuan lalu buka rinciannya. true = sudah dibuka.
  bool _bukaTujuan() {
    final id = widget.bukaTemuanId ?? '';
    if (id.isEmpty || _tujuanDibuka || !mounted) return _tujuanDibuka;
    final t = _semua.where((x) => _teks(x['temuanId']) == id).firstOrNull;
    if (t == null) return false;
    _tujuanDibuka = true;
    _tab.animateTo(1);
    unawaited(bukaDaftarTemuan(context, DataRingkasTemuan(temuan: [t], urutan: const {}, kartu: (c, x) => _kartuTemuan(x)),
        judul: _teks(t['jenisTemuan']).isEmpty ? 'Temuan' : _teks(t['jenisTemuan']), sub: _teks(t['kodeTemuan'])));
    return true;
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

  /// C4A: riwayat laporan selesai hari ini dari server (kode C4A, jarak) digabung ke salinan HP. Gagal = salinan HP tetap.
  Future<void> _muatLaporan() async {
    try {
      final r = await _api('getLaporanC4A', const {});
      final l = [for (final x in (r['riwayat'] as List<dynamic>? ?? const [])) if (x is Map) LaporanC4A.fromJson(Map<String, dynamic>.from(x))];
      await _antre.gabungRiwayat(_sesi.userId, _iso(_hariIni), l);
    } catch (_) {
      // tanpa sinyal: riwayat HP tetap dipakai
    }
  }

  /// C4A: tarik layar tab Laporan C4A = kirim antrean, lalu perbarui master, temuan, dan riwayat laporan.
  Future<void> _segarkanLaporan() async {
    await _antre.kirim(_sesi);
    await Future.wait([_muatMaster(), _unduh(), _muatLaporan()]);
  }

  /// C4A: ketuk kartu laporan (aktif / riwayat) = SEMUA temuan C4A penyulang + tanggal laporan itu (termasuk laporan lain hari itu).
  void _lihatLaporan(LaporanC4A l) {
    final t = [
      for (final x in _semua)
        if (_teks(x['c4aId']).isNotEmpty && _teks(x['penyulang']) == l.penyulang && _teks(x['tanggal']) == l.tanggal) x
    ];
    if (t.isEmpty) {
      _pesan('Belum ada temuan di laporan ini.');
      return;
    }
    unawaited(bukaDaftarTemuan(context, DataRingkasTemuan(temuan: t, urutan: const {}, kartu: (c, x) => _kartuTemuan(x)),
        judul: l.kodeC4a.isEmpty ? 'Laporan C4A' : l.kodeC4a, sub: '${l.penyulang} · ${tanggalHartek(l.tanggal)}'));
  }

  /// C4A: ketuk angka ringkasan = temuan C4A hari ini pada kategori UIW itu.
  void _lihatKategori(String kategori) {
    final peta = _master?.kategoriUiw ?? const <String, String>{};
    final hariIni = _iso(_hariIni);
    final t = [
      for (final x in _semua)
        if (_teks(x['tanggal']) == hariIni && _teks(x['c4aId']).isNotEmpty && peta[_teks(x['jenisTemuanId'])] == kategori) x
    ];
    if (t.isEmpty) {
      _pesan('Belum ada temuan $kategori hari ini.');
      return;
    }
    unawaited(bukaDaftarTemuan(context, DataRingkasTemuan(temuan: t, urutan: const {}, kartu: (c, x) => _kartuTemuan(x)),
        judul: 'C4A $kategori', sub: tanggalHartek(hariIni)));
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
      var isi = <String, dynamic>{
        'dari': _teks(r['dari']),
        'sampai': _teks(r['sampai']),
        'diambil': _teks(r['diambil']),
        'temuan': r['temuan'] ?? const [],
        'urutanSection': r['urutanSection'] ?? const [], // v1.0.19: urutan section db_Jaringan per penyulang
      };
      // v1.0.29: temuan yang masih di antrean kirim (belum di server) tetap tampil
      for (final t in _antre.belumDiServer(_sesi.userId)) {
        isi = SimpananTemuanOffline.sisipkan(isi, t);
      }
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
    // v1.0.58: antrean kirim WO tiap temuan: sedang dikirim = keterangan tim tujuan; gagal = galat merah (tombol tetap ada)
    final item = PenerusanWo.i.antre.where((x) => x.temuanId == _teks(t['temuanId'])).firstOrNull;
    final dikirim = item != null && item.status != PenerusanWo.gagal;
    final gagal = item != null && item.status == PenerusanWo.gagal;
    final isiKotak = dikirim
        ? 'WO: ${item.judul}'
        : gagal
            ? 'WO gagal dikirim: ${item.judul}${(item.galat ?? '').isEmpty ? '' : '\n${item.galat}'}'
            : teks;
    final warna = gagal
        ? AppColors.red700
        : s == StatusWo.selesai
        ? AppColors.success700
        : s == StatusWo.dikerjakan
            ? AppColors.accent700
            : s == StatusWo.terkirim
                ? HartekGaya.merek
                : HartekGaya.redup;
    // v1.0.58: WO belum diteruskan + akun berhak = tombol Teruskan ke tim
    final tombol = !dikirim && bolehTeruskanDariDaftar(_sesi, t);
    final kotak = Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
      decoration: BoxDecoration(color: warna.withValues(alpha: .08), borderRadius: BorderRadius.circular(12)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.assignment_turned_in_outlined, size: 17, color: warna),
        const SizedBox(width: 8),
        Expanded(child: Text(isiKotak, style: TextStyle(fontSize: 13, height: 1.35, fontWeight: FontWeight.w700, color: warna))),
      ]),
    );
    if (!tombol) return kotak;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      kotak,
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: FilledButton.icon(
          onPressed: _sibuk ? null : () => unawaited(_teruskanKeTim(t)),
          icon: const Icon(Icons.send_rounded, size: 18),
          label: const Text('Teruskan ke tim'),
        ),
      ),
    ]);
  }

  /// Tombol + (tab Input): form temuan. Tanggal temuan = hari ini.
  /// v1.0.18: penanda sibuk dipasang SEBELUM menunggu apa pun (dulu sesudah memuat master dari server, sehingga ketukan
  /// berulang selama jeda membuka beberapa form sekaligus). Master dari HP = form langsung terbuka.
  Future<void> _catat(LaporanC4A l) async {
    if (_sibuk || !_boleh) return;
    setState(() => _sibuk = true);
    try {
      await _catatForm(l);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  /// C4A (15 Nov 2026): temuan selalu di dalam Laporan C4A [l]. Penyulang + section ikut laporan (dibaca saja, tidak dikirim:
  /// server mengambilnya dari laporan), object Jaringan; c4aId + uniqueid (8 hex) ikut dikirim.
  Future<void> _catatForm(LaporanC4A l) async {
    if (_master == null) await _muatMaster();
    final m = _master;
    if (!mounted) return;
    if (m == null) {
      _pesan('Butuh sinyal sekali untuk memuat pilihan form temuan.');
      return;
    }
    final tanggal = l.tanggal;
    final idBaris = _uuid.v4(); // sekali per form: simpan ulang sesudah gangguan sinyal = duplikat, bukan baris kembar
    final uniqueid = buatUniqueIdC4a();
    final hasil = await bukaFormHartek(
      context,
      judulApp: 'C4A',
      judul: 'Temuan C4A',
      keterangan: '${tanggalHartek(tanggal)} · ${l.penyulang} · ${l.section}\nTersimpan di HP, dikirim otomatis ke server.',
      tombol: 'Simpan temuan',
      awal: {'objekInspeksi': objekSegmen, 'penyulang': l.penyulang, 'section': l.section},
      daftar: (n) => isianTemuan(_sesi, m,
          objekTetap: objekSegmen,
          penyulangTetap: l.penyulang,
          sectionTetap: true,
          denganKetTindakLanjut: true,
          kode: l.kodeC4a.isEmpty ? 'C4A ${tanggalHartek(tanggal)}' : l.kodeC4a,
          folderFoto: AntreanTemuanAdmin.folderFoto,
          nilai: n),
      // v1.0.29: simpan = tulis HP + antre, tanpa menunggu server
      simpan: (n) async {
        final p = pisahTemuan(n, m, admin: true);
        final data = {...p.data, 'c4aId': l.c4aId, 'uniqueid': uniqueid}
          ..remove('penyulang')
          ..remove('section');
        return {'data': data, 'tampil': {...p.tampil, 'c4aId': l.c4aId, 'uniqueid': uniqueid}, 'foto': p.foto};
      },
    );
    if (!mounted || hasil == null) return;
    final node = <String, dynamic>{
      ...Map<String, dynamic>.from(hasil['tampil'] as Map),
      'temuanId': idBaris,
      'kodeTemuan': '',
      'tanggal': tanggal,
    };
    await _antre.tambahTemuan(_sesi,
        idBaris: idBaris,
        data: Map<String, dynamic>.from(hasil['data'] as Map),
        tampil: node,
        tanggal: tanggal,
        foto: Map<String, String>.from(hasil['foto'] as Map));
    final isi = _offline ?? {'dari': tanggal, 'sampai': tanggal, 'diambil': '', 'temuan': const []};
    final baru = SimpananTemuanOffline.sisipkan(isi, node);
    await _simpanan.tulis(_sesi.userId, baru);
    if (!mounted) return;
    setState(() {
      _offline = baru;
      _jumlahAntre = _hitungAntre();
    });
    unawaited(tampilDataTersimpan(context));
    unawaited(_antre.kirim(_sesi)); // C4A: tetap di tab Laporan C4A (admin lanjut mencatat temuan berikutnya)
  }

  /// v1.0.29: foto yang masih di antrean kirim (jam = menunggu, merah = ditolak server).
  Map<String, String> _fotoAntre(Map<String, dynamic>? x) => x == null ? const {} : Map<String, String>.from(x['foto'] as Map? ?? const {});

  Map<String, dynamic> _nodeFoto(Map<String, dynamic> t) {
    final x = _antre.item(_sesi.userId, _teks(t['temuanId']));
    final tunda = _fotoAntre(x);
    final galat = _teks(x?['galat']);
    return {
      ...t,
      HartekLokal.fotoLokal: tunda,
      HartekLokal.fotoSinkron: {for (final s in tunda.keys) s: galat.isEmpty ? HartekLokal.lokal : HartekLokal.gagal},
      HartekLokal.fotoGalat: {if (galat.isNotEmpty) for (final s in tunda.keys) s: galat},
    };
  }


  /// v1.0.19: foto temuan di Drive dibaca lewat server (getFotoTemuanInspeksi), dipakai thumbnail kartu + lihat foto penuh.
  Future<Map<String, dynamic>> _muatFotoTemuan(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call('getFotoTemuanInspeksi', token: widget.sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  Future<void> _ketukFoto(Map<String, dynamic> t, String slot) async {
    final id = _teks(t['temuanId']);
    final label = InsJarLokal.labelFoto[slot] ?? slot;
    final x = _antre.item(_sesi.userId, id);
    final tunda = _fotoAntre(x)[slot];
    if (tunda != null) {
      final galat = _teks(x?['galat']);
      if (galat.isEmpty) {
        await lihatFoto(context, path: tunda, slot: label); // menunggu kirim di latar
        return;
      }
      final pilih = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('$label belum terkirim'),
          content: Text(galat),
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
        await _antre.buang(_sesi, id, slot: slot);
      } else {
        await _antre.kirimUlang(_sesi, id);
        unawaited(_antre.kirim(_sesi));
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
          folder: AntreanTemuanAdmin.folderFoto,
          bolehGaleri: true);
      if (path == null || !mounted) return;
      // v1.0.29: foto susulan ikut antrean latar
      await _antre.tambahFoto(_sesi, id, _teks(t['kodeTemuan']), slot, path);
      unawaited(_antre.kirim(_sesi));
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
                            dense: true,
                            checkboxShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            // satu baris seperti dropdown: nama panjang dipotong (...), tidak turun ke baris berikutnya
                            title: Text(
                              k == KategoriFilterTemuan.tanggal && v != '-' ? tanggalHartek(v) : v,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              softWrap: false,
                            ),
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

  /// C4A (15 Nov 2026): tab Laporan C4A (ringkasan hari ini + laporan aktif). Temuan hari ini = temuan C4A di daftar HP.
  Widget _tabInput() {
    final hariIni = _iso(_hariIni);
    return LaporanC4ATab(
      sesi: _sesi,
      antre: _antre,
      master: _master,
      hariIni: hariIni,
      temuanHariIni: [for (final t in _semua) if (_teks(t['tanggal']) == hariIni && _teks(t['c4aId']).isNotEmpty) t],
      onTambahTemuan: _catat,
      onLihatLaporan: _lihatLaporan,
      onLihatKategori: _lihatKategori,
      onRefresh: _segarkanLaporan,
    );
  }

  /// C4A (15 Nov 2026): tab Arsip C4A (hari sebelum hari ini, butuh sinyal).
  Widget _tabArsip() => ArsipC4ATab(
        hariIni: _iso(_hariIni),
        muatArsip: (dari, sampai) => _api('getArsipC4A', {'dari': dari, 'sampai': sampai}),
        muatRincian: (tanggal) async => InsJarLokal.daftar((await _api('getTemuanInspeksi', {'tanggal': tanggal}))['temuan']),
        kartuTemuan: _kartuTemuan,
      );

  Widget _tabDaftar() {
    final semua = _semua;
    final tampil = _filter.saring(semua);
    final o = _offline;
    return RefreshSisi(
      onRefresh: () => _unduh(),
      child: CustomScrollView(physics: const AlwaysScrollableScrollPhysics(), slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // v1.0.21 (permintaan Master Guswan 23 Okt 2026): keterangan offline / diunduh diganti satu kolom rentang tanggal selebar layar
              Material(
                color: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: HartekGaya.garis)),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: _muat ? null : _pilihRentang,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
                    child: Row(children: [
                      const Icon(Icons.date_range_rounded, color: HartekGaya.merek),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('Rentang tanggal temuan', style: TextStyle(fontSize: 11.5, color: HartekGaya.redup)),
                          Text(
                            o == null
                                ? (_offlineDibaca ? 'Pilih rentang tanggal' : 'Membaca daftar di HP...')
                                : '${tanggalHartek(_teks(o['dari']))}  –  ${tanggalHartek(_teks(o['sampai']))}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: HartekGaya.tinta),
                          ),
                        ]),
                      ),
                      _muat ? const SisiLoader(ukuran: 20) : const Icon(Icons.expand_more_rounded, color: HartekGaya.redup),
                    ]),
                  ),
                ),
              ),
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

  /// v1.0.29: temuan ditolak server saat dikirim di latar (bukan sinyal): alasan + Kirim ulang / Buang.
  Widget? _galatKirim(Map<String, dynamic> t) {
    final id = _teks(t['temuanId']);
    final x = _antre.item(_sesi.userId, id);
    final galat = _teks(x?['galat']);
    if (x == null || galat.isEmpty || x['data'] is! Map) return null;
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.fromLTRB(10, 9, 6, 4),
      decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.red700),
          const SizedBox(width: 8),
          Expanded(child: Text('Belum diterima server. $galat', style: const TextStyle(fontSize: 13, height: 1.35, color: AppColors.red700))),
        ]),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          TextButton(onPressed: () => unawaited(_buangTemuan(t)), child: const Text('Buang')),
          TextButton(
            onPressed: () async {
              await _antre.kirimUlang(_sesi, id);
              unawaited(_antre.kirim(_sesi));
            },
            child: const Text('Kirim ulang'),
          ),
        ]),
      ]),
    );
  }

  Future<void> _buangTemuan(Map<String, dynamic> t) async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang temuan ini?'),
        content: const Text('Temuan ini belum diterima server dan akan dihapus dari HP beserta fotonya.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    if (ya != true || !mounted) return;
    await _antre.buang(_sesi, _teks(t['temuanId']));
    if (mounted) Navigator.maybePop(context); // daftar temuan dibangun dari data saat dibuka
  }

  /// v1.0.19: kartu satu temuan (foto server, status WO), dipakai halaman daftar temuan terpisah.
  /// v1.0.29: desain baru (KartuDaftarTemuan).
  /// 16 Nov 2026 (permintaan Master Guswan): temuan C4A yang sudah diterima server bisa diubah admin (online) selama WO belum dimulai.
  bool _bisaUbah(Map<String, dynamic> t) =>
      _boleh &&
      _teks(t['sumber']) == 'ADMIN' &&
      _teks(t['c4aId']).isNotEmpty &&
      _teks(t['kodeTemuan']).isNotEmpty &&
      !{'DIKERJAKAN', 'SELESAI'}.contains(_teks((t['wo'] is Map ? (t['wo'] as Map)['status'] : '')));

  Future<void> _ubahTemuan(Map<String, dynamic> t) async {
    if (_master == null) await _muatMaster();
    final m = _master;
    if (!mounted) return;
    if (m == null) {
      _pesan('Butuh sinyal untuk memuat pilihan form temuan.');
      return;
    }
    final hasil = await bukaFormHartek(
      context,
      judulApp: 'C4A',
      judul: 'Ubah temuan',
      keterangan: '${_teks(t['penyulang'])} · ${_teks(t['section'])}\nPerubahan langsung dikirim ke server (butuh sinyal). Foto diatur dari kartu temuan.',
      tombol: 'Simpan perubahan',
      awal: {...awalTemuan(t), 'objekInspeksi': objekSegmen, 'penyulang': _teks(t['penyulang']), 'section': _teks(t['section'])},
      daftar: (n) => isianTemuan(_sesi, m,
          objekTetap: objekSegmen,
          penyulangTetap: _teks(t['penyulang']),
          sectionTetap: true,
          denganKetTindakLanjut: true,
          kode: _teks(t['kodeTemuan']),
          nilai: n,
          denganFoto: false),
      simpan: (n) async {
        final p = pisahTemuan(n, m, admin: true).data;
        final r = await _api('ubahTemuanInspeksi', {
          'temuanId': _teks(t['temuanId']),
          'revision': int.tryParse(_teks(t['revision'])) ?? 0,
          for (final k in const ['jenisTemuanId', 'nomorTiang', 'deskripsi', 'koordinat', 'ketTindakLanjut'])
            if (p[k] != null) k: p[k],
        });
        return {'temuan': r['temuan']};
      },
    );
    if (!mounted || hasil == null || hasil['temuan'] is! Map) return;
    final node = {...t, ...Map<String, dynamic>.from(hasil['temuan'] as Map)};
    final baru = SimpananTemuanOffline.sisipkan(_offline ?? {'dari': '', 'sampai': '', 'diambil': '', 'temuan': const []}, node);
    await _simpanan.tulis(_sesi.userId, baru);
    if (!mounted) return;
    setState(() => _offline = baru);
    unawaited(tampilDataTersimpan(context));
  }

  Widget _kartuTemuan(Map<String, dynamic> t) {
    final wo = _statusWo(t);
    final galat = _galatKirim(t);
    final kartu = _kartuDasar(t, wo, galat);
    return _bisaUbah(t) ? InkWell(borderRadius: BorderRadius.circular(18), onTap: () => unawaited(_ubahTemuan(t)), child: kartu) : kartu;
  }

  Widget _kartuDasar(Map<String, dynamic> t, Widget? wo, Widget? galat) {
    return KartuDaftarTemuan(
      t: t,
      foto: FotoRincian(
        node: _nodeFoto(t),
        slot: InsJarLokal.slotFoto,
        label: const {'TEMUAN': 'Temuan', 'TIANG': 'Tiang'},
        bolehTambah: _boleh && _teks(t['sumber']) == 'ADMIN',
        onTap: (s) => unawaited(_ketukFoto(t, s)),
        gambarServer: (s) => GambarServerWo(
            key: ValueKey('temuan-${_teks(t['temuanId'])}-$s'), muat: _muatFotoTemuan, data: {'temuanId': _teks(t['temuanId']), 'slot': s}),
      ),
      bawah: galat == null && wo == null
          ? null
          : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [if (galat != null) galat, if (wo != null) wo]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final semua = _semua.length;
    // C4A (15 Nov 2026): tanpa tombol + mengambang; temuan dibuat dari kartu Laporan C4A (+ Tambah Temuan)
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: HeaderInsJar(
              kicker: 'C4A',
              judul: '$semua temuan',
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
              labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
              labelPadding: const EdgeInsets.symmetric(horizontal: 4),
              tabs: [
                const Tab(height: 42, text: 'Laporan C4A'),
                Tab(height: 42, text: semua == 0 ? 'Daftar Temuan' : 'Daftar Temuan ($semua)'),
                const Tab(height: 42, text: 'Arsip C4A'),
              ],
            ),
          ),
          Expanded(child: TabBarView(controller: _tab, children: [_tabInput(), _tabDaftar(), _tabArsip()])),
        ]),
      ),
    );
  }
}
