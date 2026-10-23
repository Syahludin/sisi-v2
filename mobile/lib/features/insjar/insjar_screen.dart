import 'dart:async';

import 'package:flutter/material.dart';

import '../wo/wo_foto_server.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/status_sinkron.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../../widgets/kartu_laporan_tim.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/wa_panel.dart';
import '../wo/wo_bantu.dart' show temuanTerkunciWo;
import '../hartek/foto_lapangan.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_form.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_lokal.dart';
import '../hartek/hartek_rincian.dart' show IkonCloudHartek, TandaSinkronHartek;
import '../row/row_repository.dart' show RowError;
import 'insjar_form.dart';
import 'insjar_header.dart';
import 'insjar_lokal.dart';
import 'insjar_store.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.0 (permintaan kvlar 19 Okt 2026): Inspeksi Jaringan untuk petugas tim INSPEKSI_JARINGAN (menu OPS_INSJAR_INPUT).
/// Alur sama dengan Hartek dan ROW: Laporan Utama (KM + koordinat) > penyulang utama (penyulang + tier + section +
/// total tiang) > temuan (section, jenis, tiang, deskripsi, koordinat, foto temuan + foto tiang).
/// Tampilan memakai pola Hartek: kartu laporan tim navy, kartu putih, form layar penuh. Semua tersimpan di HP dulu,
/// dikirim otomatis (InsJarStore).
/// v1.0.5 (permintaan kvlar 20 Okt 2026): satu layar untuk 3 halaman ([HalamanInsJar]):
///  - utama: kartu Laporan Utama saja (daftar penyulang utama di halaman utama dihapus).
///  - penyulang (ketuk angka Penyulang): rincian semua penyulang utama + temuannya, tombol Tambah penyulang dan
///    Tambah temuan di tiap penyulang.
///  - temuan (ketuk angka Temuan): temuan dikelompokkan per jenis temuan, hanya lihat / ubah (tanpa tambah).
enum HalamanInsJar { utama, penyulang, temuan }

class InsJarScreen extends StatefulWidget {
  const InsJarScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  @override
  State<InsJarScreen> createState() => _InsJarScreenState();
}

class _InsJarScreenState extends State<InsJarScreen> {
  InsJarStore get _store => widget.deps.insjar;
  Sesi get _sesi => widget.sesi;

  Map<String, dynamic>? _doc;
  bool _sibuk = false, _segar = false;
  int _tanggalLain = 0;

  bool get _akses => _sesi.aksiMenu(InsJarStore.menu) != null && _sesi.petugasInsJar;
  bool get _boleh => _sesi.petugasInsJar && _sesi.bisaUbah(InsJarStore.menu) && _sesi.bolehInput(DateTime.now());

  Map<String, dynamic>? get _header => _doc == null ? null : InsJarLokal.header(_doc!);
  List<Map<String, dynamic>> get _realisasi => InsJarLokal.daftar(_doc?['realisasi']);
  String get _tanggal => _teks(_doc?['tanggal']);
  /// v1.0.5: halaman di dalam tab (footer tetap tampil). Penyulang / temuan dibuka di sini, bukan route baru.
  HalamanInsJar _halaman = HalamanInsJar.utama;
  final ScrollController _scroll = ScrollController();

  /// Penyulang yang kartunya diminimize (default terbuka).
  final Set<String> _tutup = {};

  bool get _utama => _halaman == HalamanInsJar.utama;

  static String _teks(Object? v) => v?.toString().trim() ?? '';

  @override
  void initState() {
    super.initState();
    _doc = _store.docInstan(_sesi);
    _store.addListener(_dengar);
    if (!_akses) return;
    unawaited(_bacaLokal());
    unawaited(widget.deps.syncCtl.sinkron());
  }

  @override
  void dispose() {
    _store.removeListener(_dengar);
    _scroll.dispose();
    super.dispose();
  }

  void _ke(HalamanInsJar h) {
    setState(() => _halaman = h);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _dengar() {
    final d = _store.docInstan(_sesi);
    if (mounted && d != null && !identical(d, _doc)) setState(() => _doc = d);
    if (_utama) unawaited(_hitungTanggalLain());
  }

  Future<void> _bacaLokal() async {
    final d = await _store.doc(_sesi);
    if (mounted) setState(() => _doc = d);
    await _hitungTanggalLain();
  }

  Future<void> _hitungTanggalLain() async {
    final n = await _store.jumlahTanggalLain(_sesi.userId);
    if (mounted && n != _tanggalLain) setState(() => _tanggalLain = n);
  }

  void _kirimLatar() => unawaited(widget.deps.syncCtl.sinkron());

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));

  Future<void> _segarkan() async {
    if (_segar || !_akses) return;
    setState(() => _segar = true);
    try {
      await widget.deps.syncCtl.sinkron();
      try {
        await _store.segarkanMaster(_sesi, paksa: true);
      } catch (_) {/* master lama tetap dipakai */}
      final p = widget.deps.syncCtl.pesan;
      if (mounted && p != null) _pesan(p);
    } finally {
      if (mounted) setState(() => _segar = false);
    }
  }

  Future<void> _form(Future<Map<String, dynamic>?> Function() buka) async {
    if (_sibuk || !_boleh) return;
    setState(() => _sibuk = true);
    try {
      final hasil = await buka();
      if (!mounted) return;
      if (hasil != null) {
        unawaited(tampilDataTersimpan(context));
        _kirimLatar();
      }
    } on ApiException catch (e) {
      if (mounted) _pesan(pesanInsJar(e.kode));
    } catch (_) {
      if (mounted) _pesan('Daftar pilihan belum ada di HP. Sambungkan internet sekali untuk mengunduhnya.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<MasterInsJar> _master() async => MasterInsJar(await _store.master(_sesi));

  Future<void> _cobaUlang(String id, {bool ubah = false}) async {
    await _store.cobaUlang(_sesi, id, ubah: ubah);
    _kirimLatar();
  }

  Future<void> _buang(String id, {bool ubah = false}) async {
    final turunan = _doc == null ? 1 : InsJarLokal.idTurunan(_doc!, id).length;
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(ubah ? 'Batalkan perubahan?' : 'Buang data ini?'),
        content: Text(ubah
            ? 'Perubahan yang ditolak dibuang. Isian dari server dipakai lagi.'
            : turunan > 1
                ? 'Data ini dan ${turunan - 1} data di bawahnya belum diterima server dan akan dihapus dari HP.'
                : 'Data ini belum diterima server dan akan dihapus dari HP.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ubah ? 'Batalkan perubahan' : 'Buang')),
        ],
      ),
    );
    if (ya != true || !mounted) return;
    await _store.buang(_sesi, id, ubah: ubah);
    if (ubah) _kirimLatar();
  }

  Future<void> _buangTanggalLain() async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang laporan hari sebelumnya?'),
        content: Text('$_tanggalLain data inspeksi dari hari sebelumnya tidak terkirim. Server hanya menerima laporan hari ini.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    if (ya == true) await _store.buangTanggalLain(_sesi);
  }

  // ---------- Laporan Utama ----------

  List<IsianHartek> _isianHeader() => isianLaporanUtama; // v1.0.16: gaya header ROW

  Map<String, dynamic> _bersihHeader(Map<String, String> n) {
    final d = <String, dynamic>{};
    for (final k in const ['koordinatAwal', 'koordinatAkhir']) {
      final v = (n[k] ?? '').trim();
      if (v.isEmpty) continue;
      d[k] = v;
      final a = angkaDari(n['_akurasi_$k'])?.toDouble();
      if (a != null && a > 0) d['_akurasi_$k'] = a;
    }
    for (final k in const ['kmAwal', 'kmAkhir']) {
      final v = angkaDari(n[k]);
      if (v != null) d[k] = v;
    }
    if (n.containsKey('kendala')) d['kendala'] = n['kendala']!.trim();
    return d;
  }

  Map<String, String> _cekHeader(Map<String, String> n) {
    final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
    final e = <String, String>{};
    if (a != null && b != null && b < a) e['kmAkhir'] = 'KM akhir tidak boleh lebih kecil dari KM awal';
    final h = _header;
    for (final k in ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir']) {
      if (h != null && _teks(h[k]).isNotEmpty && (n[k] ?? '').trim().isEmpty) e[k] = 'Nilai yang sudah tersimpan tidak boleh dikosongkan';
    }
    return e;
  }

  static String? _ringkasHeader(Map<String, String> n) {
    final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
    if (a == null || b == null || b < a) return null;
    return 'Jarak tempuh ${angkaHartek(b - a)} km';
  }

  Future<void> _buatHeader() => _form(() => bukaFormHartek(
        context,
        judulApp: 'Input Inspeksi Jaringan',
        judul: 'Laporan Utama',
        keterangan: '${_sesi.timNama} · ${tanggalHartek(_tanggal)}\nSatu laporan untuk seluruh inspeksi tim hari ini.',
        daftar: (_) => _isianHeader(),
        tombol: 'Buat Laporan Utama',
        cekTambahan: _cekHeader,
        ringkasan: _ringkasHeader,
        simpan: (n) async {
          await _store.buatHeader(_sesi, _bersihHeader(n));
          return const {'lokal': true};
        },
      ));

  Future<void> _ubahHeader({String? fokus}) async {
    final h = _header;
    if (h == null) return;
    final awal = <String, String>{
      for (final k in const ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir', 'kendala']) k: _teks(h[k]),
      for (final k in const ['_akurasi_koordinatAwal', '_akurasi_koordinatAkhir'])
        if (_teks(h[k]).isNotEmpty) k: _teks(h[k]),
    };
    await _form(() => bukaFormHartek(
          context,
          judulApp: 'Input Inspeksi Jaringan',
          judul: 'Ubah Laporan Utama',
          keterangan: '${_sesi.timNama} · ${tanggalHartek(_tanggal)}',
          daftar: (_) => _isianHeader(),
          awal: awal,
          cekTambahan: _cekHeader,
          ringkasan: _ringkasHeader,
          tombol: 'Simpan perubahan',
          fokus: fokus,
          simpan: (n) async {
            final d = _bersihHeader(n);
            if (d.keys.where((k) => !k.startsWith('_akurasi_')).isEmpty) return null;
            await _store.ubahHeader(_sesi, d);
            return const {'lokal': true};
          },
        ));
  }

  // ---------- penyulang utama (v1.0.5: satu section per baris, dikelompokkan per penyulang) ----------

  List<IsianHartek> _isianRealisasi(MasterInsJar m, {bool ubah = false, String? penyulangTetap, String? tierTetap, bool sectionTerkunci = false}) => [
        if (ubah || penyulangTetap != null)
          const IsianHartek('penyulang', 'Penyulang', bacaSaja: true, grup: 'Penyulang utama')
        else
          IsianHartek('penyulang', 'Penyulang',
              wajib: true, grup: 'Penyulang utama', pilihan: m.penyulang.keys.toList(), turunan: const ['section']),
        if (tierTetap != null)
          const IsianHartek('tier', 'Tier', bacaSaja: true, grup: 'Penyulang utama')
        else
          IsianHartek('tier', 'Tier', wajib: true, grup: 'Penyulang utama', pilihan: m.tier),
        IsianHartek('section', 'Section',
            wajib: true,
            bacaSaja: sectionTerkunci,
            grup: 'Section yang diinspeksi',
            pilihanDari: (n) => m.section(n['penyulang'])),
        const IsianHartek('totalTiang', 'Total tiang',
            wajib: true, angka: true, bulat: true, max: 9999, akhiran: 'tiang', grup: 'Hasil'),
      ];

  Map<String, dynamic> _dataRealisasi(Map<String, String> n, {bool ubah = false}) {
    String v(String k) => (n[k] ?? '').trim();
    return {
      if (!ubah) 'penyulang': v('penyulang'),
      'tier': v('tier'),
      if (v('section').isNotEmpty) 'section': v('section'),
      'totalTiang': angkaDari(v('totalTiang'))?.round() ?? 0,
    };
  }

  /// v1.0.5: penyulang + tier + section sama tidak boleh dobel (REALISASI_GANDA).
  Map<String, String> Function(Map<String, String>) _cekRealisasi({String? kecuali, String? penyulangTetap}) => (n) {
        final pen = (penyulangTetap ?? n['penyulang'] ?? '').trim();
        final tier = (n['tier'] ?? '').trim(), sec = (n['section'] ?? '').trim();
        if (_doc != null && pen.isNotEmpty && tier.isNotEmpty && sec.isNotEmpty &&
            InsJarLokal.realisasiGanda(_doc!, pen, tier, sec, kecuali: kecuali)) {
          return {'section': pesanInsJar('REALISASI_GANDA')};
        }
        return const {};
      };

  /// Tambah penyulang utama (penyulangTetap null) atau tambah section di penyulang yang sama (tier ikut).
  Future<void> _tambahRealisasi({String? penyulangTetap, String? tierTetap}) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        return bukaFormHartek(
          context,
          judulApp: 'Input Inspeksi Jaringan',
          judul: penyulangTetap == null ? 'Penyulang utama' : 'Tambah section',
          keterangan: penyulangTetap == null
              ? 'Penyulang, tier, dan section yang diinspeksi hari ini.'
              : '$penyulangTetap · section baru. Temuan dicatat per section.',
          tombol: penyulangTetap == null ? 'Simpan penyulang' : 'Simpan section',
          awal: {
            if (penyulangTetap != null) 'penyulang': penyulangTetap,
            if (tierTetap != null) 'tier': tierTetap,
          },
          daftar: (_) => _isianRealisasi(m, penyulangTetap: penyulangTetap, tierTetap: tierTetap),
          cekTambahan: _cekRealisasi(penyulangTetap: penyulangTetap),
          simpan: (n) async {
            final d = _dataRealisasi(n);
            await _store.tambahRealisasi(_sesi, d, {...d, 'section': '${d['section'] ?? ''}', 'jumlahTemuan': 0});
            return const {'lokal': true};
          },
        );
      });

  Future<void> _ubahRealisasi(Map<String, dynamic> r) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        final id = _teks(r['realisasiId']);
        final terkunci = InsJarLokal.temuanRealisasi(r) > 0;
        return bukaFormHartek(
          context,
          judulApp: 'Input Inspeksi Jaringan',
          judul: 'Ubah penyulang utama',
          keterangan: terkunci
              ? 'Section terkunci karena sudah ada temuan. Tier dan total tiang masih bisa diubah.'
              : 'Penyulang tidak bisa diubah. Section terkunci setelah ada temuan.',
          tombol: 'Simpan perubahan',
          awal: {
            for (final k in const ['penyulang', 'tier', 'section', 'totalTiang']) k: _teks(r[k]),
          },
          daftar: (_) => _isianRealisasi(m, ubah: true, sectionTerkunci: terkunci),
          cekTambahan: _cekRealisasi(kecuali: id, penyulangTetap: _teks(r['penyulang'])),
          simpan: (n) async {
            final d = _dataRealisasi(n, ubah: true);
            await _store.ubahRealisasi(_sesi, id, d, {...d, if (d['section'] == null) 'section': _teks(r['section'])});
            return const {'lokal': true};
          },
        );
      });

  /// v1.0.5: tambah temuan dari tombol + di kartu penyulang. Petugas memilih section (penyulang utama) penyulang itu;
  /// temuan mengikuti section tersebut, tidak diisi dari master.
  Future<void> _tambahTemuan(String pen) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        final rows = InsJarLokal.realisasiPenyulang(_doc, pen);
        if (rows.isEmpty) return null;
        final pilihan = {
          for (final r in rows) _teks(r['realisasiId']): '${_teks(r['section'])} · ${_teks(r['tier'])}',
        };
        final awal = rows.length == 1 ? {'realisasiId': _teks(rows.first['realisasiId'])} : <String, String>{};
        return bukaFormHartek(
          context,
          judulApp: 'Input Inspeksi Jaringan',
          judul: 'Temuan',
          keterangan: '$pen\nPilih section, temuan masuk ke section itu.',
          tombol: 'Simpan temuan',
          awal: {'objekInspeksi': 'Jaringan', 'penyulang': pen, ...awal},
          daftar: (n) => isianTemuan(_sesi, m,
              penyulangTetap: pen,
              objekTetap: 'Jaringan',
              tierOtomatis: (n) => _tierRealisasi((n['realisasiId'] ?? '').trim()), // v1.0.16: tier ikut penyulang utama
              kode: _kodeRealisasi((n['realisasiId'] ?? '').trim()),
              nilai: n,
              pilihanRealisasi: pilihan),
          simpan: (n) async {
            final realId = (n['realisasiId'] ?? '').trim();
            final r = _doc == null || realId.isEmpty ? null : InsJarLokal.realisasi(_doc!, realId);
            if (r == null) throw ApiException('DATA_TIDAK_DITEMUKAN');
            final p = pisahTemuan({...n, 'tierInspeksi': _teks(r['tier'])}, m);
            await _store.tambahTemuan(_sesi, realId, p.data,
                {...p.tampil, 'tier': _teks(r['tier']), 'section': _teks(r['section'])},
                foto: p.foto);
            return const {'lokal': true};
          },
        );
      });

  /// v1.0.16: tier temuan = tier penyulang utama (section) yang dipilih.
  String _tierRealisasi(String id) {
    final r = _doc == null || id.isEmpty ? null : InsJarLokal.realisasi(_doc!, id);
    return _teks(r?['tier']);
  }

  String _kodeRealisasi(String id) {
    final r = _doc == null || id.isEmpty ? null : InsJarLokal.realisasi(_doc!, id);
    return _kodeWatermark(r ?? const <String, dynamic>{});
  }

  /// v1.0.5: ubah temuan. Section tidak bisa diganti (mengikuti penyulang utama); foto diatur dari kartu temuan.
  Future<void> _ubahTemuan(Map<String, dynamic> r, Map<String, dynamic> t) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        final pen = _teks(r['penyulang']);
        final id = _teks(t['temuanId']);
        final kode = _teks(t['kodeTemuan']).isNotEmpty ? _teks(t['kodeTemuan']) : _kodeWatermark(r);
        return bukaFormHartek(
          context,
          judulApp: 'Input Inspeksi Jaringan',
          judul: 'Ubah temuan',
          keterangan: '$pen · ${_teks(t['section'])}\nSection mengikuti penyulang utama. Foto diatur dari kartu temuan.',
          tombol: 'Simpan perubahan',
          awal: {
            ...awalTemuan(t),
            'objekInspeksi': 'Jaringan',
            'penyulang': pen,
            'section': _teks(t['section']),
          },
          daftar: (n) => isianTemuan(_sesi, m,
              penyulangTetap: pen,
              objekTetap: 'Jaringan',
              tierOtomatis: (_) => _teks(r['tier']), // v1.0.16: tier ikut penyulang utama
              kode: kode,
              nilai: n,
              denganFoto: false,
              sectionTetap: true),
          simpan: (n) async {
            final p = pisahTemuan({...n, 'tierInspeksi': _teks(r['tier'])}, m);
            final sama = InsJarLokal.isianTemuan.every((k) => _teks(p.tampil[k]) == _teks(t[k]));
            if (sama) return null;
            await _store.ubahTemuan(_sesi, id, p.data, p.tampil);
            return const {'lokal': true};
          },
        );
      });

  String _kodeWatermark(Map<String, dynamic> r) {
    final k = _teks(r['kodeRealisasi']);
    if (k.isNotEmpty) return k;
    final h = _teks(_header?['kodeHeader']);
    return h.isNotEmpty ? h : 'Inspeksi ${tanggalHartek(_tanggal)}';
  }


  /// v1.0.19: foto temuan di Drive dibaca lewat server (getFotoTemuanInsJar), dipakai thumbnail kartu + lihat foto penuh.
  Future<Map<String, dynamic>> _muatFotoTemuan(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call('getFotoTemuanInsJar', token: widget.sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  Future<void> _ketukFoto(Map<String, dynamic> r, Map<String, dynamic> t, String slot) async {
    final id = _teks(t['temuanId']);
    final label = InsJarLokal.labelFoto[slot] ?? slot;
    final path = HartekLokal.fotoDiHp(t)[slot];
    final status = HartekLokal.statusFoto(t, slot);
    if (status == HartekLokal.gagal) {
      final pilih = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('$label ditolak'),
          content: Text(HartekLokal.galatFoto(t, slot) ?? 'Foto ditolak server.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, 'BUANG'), child: const Text('Buang foto')),
            if (path != null) TextButton(onPressed: () => Navigator.pop(c, 'LIHAT'), child: const Text('Lihat')),
            FilledButton(onPressed: () => Navigator.pop(c, 'ULANG'), child: const Text('Coba lagi')),
          ],
        ),
      );
      if (!mounted || pilih == null) return;
      if (pilih == 'ULANG') {
        await _store.cobaUlangFoto(_sesi, id, slot);
        _kirimLatar();
      } else if (pilih == 'BUANG') {
        await _store.buangFoto(_sesi, id, slot);
      } else if (path != null) {
        await lihatFoto(context, path: path, slot: label);
      }
      return;
    }
    if (path != null && path.isNotEmpty) {
      await lihatFoto(context, path: path, slot: label);
      return;
    }
    if (HartekLokal.fotoDiServer(t)[slot] != null) {
      await FotoServerWo.lihat(context, _muatFotoTemuan, {'temuanId': id, 'slot': slot}, label);
      return;
    }
    if (!_boleh || _sibuk) return;
    try {
      final nilai = <String, String>{for (final e in t.entries) if (e.value is String) e.key: e.value as String};
      final kode = _teks(t['kodeTemuan']).isNotEmpty ? _teks(t['kodeTemuan']) : _kodeWatermark(r);
      final baru = await FotoLapangan.ambil(context,
          label: label, pratinjau: watermarkTemuan(_sesi, kode: kode, nilai: nilai, slot: slot), folder: 'insjar', bolehGaleri: true);
      if (baru == null || !mounted) return;
      await _store.tambahFoto(_sesi, id, slot, baru);
      _kirimLatar();
    } on RowError catch (e) {
      if (mounted) _pesan(e.pesan);
    } on ApiException catch (e) {
      if (mounted) _pesan(pesanInsJar(e.kode));
    }
  }

  // ---------- WA ----------

  Future<void> _kirimWa() async {
    final h = _header;
    if (h == null) return;
    final kurang = <String>[
      if (_teks(h['koordinatAwal']).isEmpty) 'Koordinat awal',
      if (angkaDari(_teks(h['kmAwal'])) == null) 'KM awal',
      if (_teks(h['koordinatAkhir']).isEmpty) 'Koordinat akhir',
      if (angkaDari(_teks(h['kmAkhir'])) == null) 'KM akhir',
      if (_realisasi.isEmpty) 'Penyulang utama (minimal 1 penyulang)',
      // v1.0.2: foto temuan + tiang wajib
      if (InsJarLokal.temuanFotoKurang(_doc) > 0) 'Foto temuan / tiang (${InsJarLokal.temuanFotoKurang(_doc)} temuan belum lengkap)',
    ];
    if (kurang.isNotEmpty) {
      String? fokus;
      for (final k in const ['koordinatAwal', 'kmAwal', 'koordinatAkhir', 'kmAkhir']) {
        if (_teks(h[k]).isEmpty) {
          fokus = k;
          break;
        }
      }
      await tampilkanWaBelumSiap(context,
          kurang: kurang,
          onLengkapi: !_boleh || _sibuk ? null : () => unawaited(fokus != null ? _ubahHeader(fokus: fokus) : _tambahRealisasi()));
      return;
    }
    // v1.0.17 (sinkron atomik): WA hanya sesudah semua data laporan diterima + divalidasi server
    final n = InsJarLokal.hitung(_doc);
    if (!await pastikanTersinkron(context, _store.tahapSinkronLaporan(widget.sesi, _doc),
        menunggu: n.menunggu, gagal: n.gagal, onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()))) {
      return;
    }
    if (!mounted) return;
    await tampilkanWa(context,
        judul: 'Kirim laporan Inspeksi Jaringan ke WA',
        teks: waTeksInsJar(tanggalTampil: tanggalHartek(_tanggal), header: h, realisasi: _realisasi));
  }

  Widget _aksiUtama(String label, VoidCallback aksi, {IconData ikon = Icons.add_rounded}) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 4),
        child: FilledButton.icon(
          onPressed: _sibuk || !_boleh ? null : aksi,
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(54),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          icon: Icon(ikon, size: 20),
          label: Text(label),
        ),
      );

  Widget _judulSeksi(String judul, {String? info, Widget? aksi}) => Padding(
        padding: const EdgeInsets.only(top: 26, bottom: 12),
        child: Row(children: [
          Expanded(child: Text(judul, style: HartekGaya.judulSeksi)),
          if (info != null) Text(info, style: HartekGaya.sekunder),
          if (aksi != null) aksi,
        ]),
      );

  /// v1.0.20: belum ada laporan = kartu Mulai inspeksi (pola Laporan ROW).
  List<Widget> _halamanAwal() => [
        JudulSeksiSisi('Laporan hari ini', keterangan: tanggalHartek(_tanggal)),
        KartuMulaiLaporan(
          judul: 'Belum ada inspeksi jaringan hari ini',
          ikon: Icons.travel_explore_rounded,
          langkah: const ['Laporan Utama: KM + koordinat berangkat', 'Penyulang utama: tier, section, total tiang', 'Temuan + foto temuan dan tiang'],
          labelMulai: 'Mulai inspeksi hari ini',
          onMulai: _boleh && !_sibuk ? _buatHeader : null,
        ),
      ];

  /// v1.0.17 (sinkron atomik): hijau hanya sesudah laporan disegel server (ringkasan = rincian = WA).
  Widget _statusKirim() {
    final n = InsJarLokal.hitung(_doc);
    return KartuStatusSinkron(
      tahap: _store.tahapSinkronLaporan(widget.sesi, _doc),
      menunggu: n.menunggu,
      gagal: n.gagal,
      keteranganTolak: 'Ketuk angka Penyulang untuk alasannya.',
      onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()),
    );
  }

  // ---------- v1.0.5: halaman utama, penyulang, temuan ----------

  Widget _kartuPenyulang(String pen, List<Map<String, dynamic>> rows) {
    final terbuka = !_tutup.contains(pen);
    final bisa = _boleh && !_sibuk;
    final temuan = rows.fold<int>(0, (a, r) => a + InsJarLokal.temuanRealisasi(r));
    final tiang = rows.fold<int>(0, (a, r) => a + (num.tryParse(_teks(r['totalTiang']))?.round() ?? 0));
    final tierAwal = rows.isEmpty ? '' : _teks(rows.first['tier']);
    final tiers = {for (final r in rows) if (_teks(r['tier']).isNotEmpty) _teks(r['tier'])}.join(' · ');
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 16),
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(HartekGaya.radius),
          onTap: () => setState(() {
            if (terbuka) {
              _tutup.add(pen);
            } else {
              _tutup.remove(pen);
            }
          }),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(gradient: HartekGaya.gradien, borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.cable, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(pen.isEmpty ? 'Tanpa penyulang' : pen,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                  const SizedBox(height: 3),
                  Text('${rows.length} section · $temuan temuan · $tiang tiang', style: HartekGaya.sekunder),
                  if (tiers.isNotEmpty)
                    Text(tiers, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: HartekGaya.merek)),
                ]),
              ),
              Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: HartekGaya.tinta),
            ]),
          ),
        ),
        if (terbuka) ...[
          const Divider(height: 1, color: HartekGaya.garis),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final r in rows) _blokSection(r),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
            child: Row(children: [
              if (_boleh)
                OutlinedButton.icon(
                  onPressed: bisa
                      ? () => unawaited(_tambahRealisasi(penyulangTetap: pen, tierTetap: tierAwal.isEmpty ? null : tierAwal))
                      : null,
                  icon: const Icon(Icons.layers_outlined, size: 18),
                  label: const Text('Tambah section'),
                ),
              const Spacer(),
              if (_boleh)
                Tooltip(
                  message: 'Tambah temuan',
                  child: Material(
                    color: HartekGaya.merek,
                    elevation: 2,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: bisa ? () => unawaited(_tambahTemuan(pen)) : null,
                      child: const SizedBox(
                        width: 48,
                        height: 48,
                        child: Icon(Icons.add_rounded, color: Colors.white, size: 26),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        ],
      ]),
    );
  }

  /// Satu section (penyulang utama) di dalam kartu penyulang: status, ubah, dan temuannya.
  Widget _blokSection(Map<String, dynamic> r) {
    final id = _teks(r['realisasiId']);
    final temuan = InsJarLokal.daftar(r['temuan']);
    final tiang = _teks(r['totalTiang']);
    final bisa = _boleh && !_sibuk;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      decoration: BoxDecoration(
        color: HartekGaya.latar,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: HartekGaya.garis),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_teks(r['section']).isEmpty ? 'Section belum dipilih' : _teks(r['section']),
                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
              const SizedBox(height: 2),
              Text(
                [_teks(r['tier']), if (tiang.isNotEmpty) '$tiang tiang', '${temuan.length} temuan']
                    .where((x) => x.isNotEmpty)
                    .join(' · '),
                style: HartekGaya.sekunder,
              ),
              const SizedBox(height: 2),
              Text(_teks(r['kodeRealisasi']).isEmpty ? 'Menunggu kirim ke server' : _teks(r['kodeRealisasi']), style: HartekGaya.kode),
            ]),
          ),
          IkonCloudHartek(node: r, ukuran: 16),
          if (_boleh)
            IconButton(
              tooltip: 'Ubah penyulang utama',
              visualDensity: VisualDensity.compact,
              onPressed: bisa ? () => unawaited(_ubahRealisasi(r)) : null,
              icon: const Icon(Icons.edit_outlined, size: 18, color: HartekGaya.redup),
            ),
        ]),
        TandaSinkronHartek(
            node: r, onCobaUlang: () => _cobaUlang(id), onBuang: () => _buang(id), padding: const EdgeInsets.only(top: 6, right: 8)),
        TandaSinkronHartek(
            node: r,
            ubahHeader: true,
            onCobaUlang: () => _cobaUlang(id, ubah: true),
            onBuang: () => _buang(id, ubah: true),
            padding: const EdgeInsets.only(top: 6, right: 8)),
        const SizedBox(height: 10),
        if (temuan.isEmpty)
          const Padding(
            padding: EdgeInsets.only(right: 8, bottom: 4),
            child: Text('Belum ada temuan di section ini.', style: HartekGaya.sekunder),
          )
        else
          for (final t in temuan) _kartuTemuan(r, t),
      ]),
    );
  }

  /// Kartu satu temuan. Ketuk = ubah temuan. Foto temuan + tiang dari kartu.
  Widget _kartuTemuan(Map<String, dynamic> r, Map<String, dynamic> t) {
    final id = _teks(t['temuanId']);
    final bisa = _boleh && !_sibuk && !temuanTerkunciWo(t); // v1.0.17: diteruskan ke tim = terkunci
    return KartuTemuan(
      t: t,
      onTap: bisa ? () => unawaited(_ubahTemuan(r, t)) : null,
      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
        IkonCloudHartek(node: t, ukuran: 16),
        if (_boleh)
          IconButton(
            tooltip: 'Ubah temuan',
            visualDensity: VisualDensity.compact,
            onPressed: bisa ? () => unawaited(_ubahTemuan(r, t)) : null,
            icon: const Icon(Icons.edit_outlined, size: 18, color: HartekGaya.redup),
          ),
      ]),
      fotoBawah: FotoRincian(
        node: t,
        slot: InsJarLokal.slotFoto,
        label: const {'TEMUAN': 'Temuan', 'TIANG': 'Tiang'},
        bolehTambah: _boleh,
        onTap: (s) => unawaited(_ketukFoto(r, t, s)),
        gambarServer: (s) => GambarServerWo(key: ValueKey('insjar-$id-$s'), muat: _muatFotoTemuan, data: {'temuanId': id, 'slot': s}),
      ),
      bawah: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TandaSinkronHartek(
            node: t, onCobaUlang: () => _cobaUlang(id), onBuang: () => _buang(id), padding: const EdgeInsets.only(top: 10)),
        TandaSinkronHartek(
            node: t,
            ubahHeader: true,
            onCobaUlang: () => _cobaUlang(id, ubah: true),
            onBuang: () => _buang(id, ubah: true),
            padding: const EdgeInsets.only(top: 10)),
      ]),
    );
  }

  List<Widget> _halamanPenyulang() {
    final grup = InsJarLokal.grupPenyulang(_doc);
    return [
      _aksiUtama('Tambah penyulang', () => unawaited(_tambahRealisasi())),
      const SizedBox(height: 8),
      if (grup.isEmpty)
        const KosongHartek(
            ikon: Icons.cable,
            judul: 'Belum ada penyulang utama',
            petunjuk: 'Tambah penyulang yang diinspeksi, lalu catat temuan di section-nya.')
      else
        for (final g in grup) _kartuPenyulang(g.penyulang, g.realisasi),
    ];
  }

  /// Temuan dikelompokkan per jenis temuan. Hanya lihat / ubah, tanpa tambah temuan.
  List<Widget> _halamanTemuan() {
    final grup = InsJarLokal.grupTemuan(_doc);
    return [
      if (grup.isEmpty)
        const KosongHartek(
            ikon: Icons.report_gmailerrorred_rounded,
            judul: 'Belum ada temuan',
            petunjuk: 'Temuan dicatat dari kartu penyulang (tombol + di bawah kanan).')
      else
        for (final g in grup) ...[
          _judulSeksi(g.jenis, info: '${g.isi.length} titik'),
          for (final x in g.isi) _kartuTemuan(x.realisasi, x.temuan),
        ],
    ];
  }

  List<Widget> _halamanLaporan() {
    final h = _header!;
    final kurang = [
      if (angkaDari(_teks(h['kmAwal'])) == null) 'KM awal',
      if (_teks(h['koordinatAwal']).isEmpty) 'koordinat awal',
      if (angkaDari(_teks(h['kmAkhir'])) == null) 'KM akhir',
      if (_teks(h['koordinatAkhir']).isEmpty) 'koordinat akhir',
    ];
    final n = InsJarLokal.hitung(_doc);
    return [
      KartuLaporanTim(
        judul: _teks(h['kodeHeader']).isEmpty ? 'Laporan Utama' : _teks(h['kodeHeader']),
        sub: tanggalHartek(_tanggal),
        ikon: Icons.travel_explore_rounded,
        kmAwal: angkaDari(_teks(h['kmAwal'])),
        kmAkhir: angkaDari(_teks(h['kmAkhir'])),
        koordinatAwal: _teks(h['koordinatAwal']),
        koordinatAkhir: _teks(h['koordinatAkhir']),
        akurasiAwal: angkaDari(_teks(h['_akurasi_koordinatAwal']))?.toDouble(),
        akurasiAkhir: angkaDari(_teks(h['_akurasi_koordinatAkhir']))?.toDouble(),
        angka: [
          AngkaRingkas('Penyulang', _realisasi.length, onTap: () => _ke(HalamanInsJar.penyulang)),
          AngkaRingkas('Temuan', InsJarLokal.jumlahTemuan(_doc), onTap: () => _ke(HalamanInsJar.temuan)),
          AngkaRingkas('Total Tiang', InsJarLokal.totalTiang(_doc)),
        ],
        onTapNilai: _boleh && !_sibuk ? (k) => _ubahHeader(fokus: k) : null,
        catatan: kurang.isEmpty ? null : 'Belum diisi: ${kurang.join(', ')}.',
        bawahKiri: Row(children: [
          Icon(
            n.gagal > 0
                ? Icons.error_outline_rounded
                : n.menunggu > 0
                    ? Icons.cloud_upload_outlined
                    : Icons.cloud_done_rounded,
            size: 16,
            color: n.gagal > 0
                ? AppColors.red100
                : n.menunggu > 0
                    ? AppColors.accent400
                    : const Color(0xFF4ADE80),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text('${_realisasi.length} penyulang · ${InsJarLokal.jumlahTemuan(_doc)} temuan',
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
          ),
        ]),
        onUbah: _boleh && !_sibuk ? _ubahHeader : null,
        tampilWa: true,
        waSiap: kurang.isEmpty && _realisasi.isNotEmpty,
        onKirimWa: _sibuk ? null : _kirimWa,
        onTambah: _boleh && !_sibuk ? () => unawaited(_tambahRealisasi()) : null,
        labelTambah: 'Tambah penyulang',
      ),
      TandaSinkronHartek(
          node: h,
          onCobaUlang: () => _cobaUlang(_teks(h['headerId'])),
          onBuang: () => _buang(_teks(h['headerId'])),
          padding: const EdgeInsets.only(top: 12)),
      TandaSinkronHartek(
          node: h,
          ubahHeader: true,
          onCobaUlang: () => _cobaUlang(_teks(h['headerId']), ubah: true),
          onBuang: () => _buang(_teks(h['headerId']), ubah: true),
          padding: const EdgeInsets.only(top: 12)),
      _statusKirim(),
      if (_tanggalLain > 0)
        TextButton.icon(
          onPressed: _buangTanggalLain,
          icon: const Icon(Icons.history_rounded, size: 18),
          label: Text('$_tanggalLain data hari sebelumnya tidak terkirim · Buang'),
        ),
    ];
  }

  List<Widget> _konten() {
    if (!_akses) {
      return [
        const SizedBox(height: 12),
        const KosongHartek(
            ikon: Icons.cloud_off_outlined,
            judul: 'Laporan belum bisa dimuat',
            petunjuk: 'Akses Input Inspeksi Jaringan belum tersedia untuk akun ini.'),
        const SizedBox(height: 14),
        OutlinedButton(
          onPressed: _segarkan,
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          child: const Text('Coba lagi'),
        ),
      ];
    }
    if (_header == null) {
      if (_utama) return _halamanAwal();
      return const [
        KosongHartek(
            ikon: Icons.travel_explore_rounded,
            judul: 'Laporan Utama hari ini belum ada',
            petunjuk: 'Kembali ke halaman utama untuk membuat Laporan Utama. Hari laporan mungkin sudah berganti.'),
      ];
    }
    return switch (_halaman) {
      HalamanInsJar.utama => _halamanLaporan(),
      HalamanInsJar.penyulang => _halamanPenyulang(),
      HalamanInsJar.temuan => _halamanTemuan(),
    };
  }

  Widget _headerHalaman() {
    final String kicker, judul;
    final IconData ikon;
    if (_halaman == HalamanInsJar.utama) {
      kicker = 'Inspeksi Jaringan';
      judul = 'Laporan Utama';
      ikon = Icons.travel_explore_rounded;
    } else if (_halaman == HalamanInsJar.penyulang) {
      kicker = 'Rincian';
      judul = 'Penyulang utama';
      ikon = Icons.cable;
    } else {
      kicker = 'Rincian';
      judul = 'Temuan per jenis';
      ikon = Icons.report_gmailerrorred_rounded;
    }
    final sub = [
      if (_halaman == HalamanInsJar.utama) _sesi.timNama,
      if (_tanggal.isNotEmpty) tanggalHartek(_tanggal),
    ].where((s) => s.isNotEmpty).join(' · ');
    return HeaderInsJar(
      kicker: kicker,
      judul: judul,
      sub: sub,
      ikon: ikon,
      lonceng: _halaman == HalamanInsJar.utama, // v1.0.19
      aksi: [
        if (_halaman == HalamanInsJar.utama)
          tombolSegarkanHeader(_segarkan, tip: 'Segarkan laporan', sibuk: _sibuk || _segar)
        else
          tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => _ke(HalamanInsJar.utama)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi
      body: SafeArea(
        bottom: false,
        child: RefreshSisi(
          onRefresh: () async {
            if (!_sibuk && _halaman == HalamanInsJar.utama) await _segarkan();
          },
          child: ListView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 120),
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 680),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    _headerHalaman(),
                    if (_doc == null && _akses)
                      const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
                    else
                      ..._konten(),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
