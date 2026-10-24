import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/lonceng.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../hartek/foto_lapangan.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_form.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_lokal.dart';
import '../insjar/insjar_header.dart';
import '../row/row_model.dart' show Koordinat;
import '../row/row_repository.dart' show RowError;
import '../row/watermark.dart';
import 'wo_bantu.dart';
import 'wo_foto_server.dart';
import 'wo_store.dart';
import 'wo_tab.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.11 (permintaan kvlar 21 Okt 2026): WO tindak lanjut temuan untuk tim ROW / HARTEK / YANDAL (menu OPS_WO_TIM).
/// Tab "WO" di bottom bar (Yandal: "TO P0"). Alur: WO Terkirim dari admin > Mulai kerjakan > catat pekerjaan + foto
/// Sebelum / Pekerjaan / Sesudah > Selesai. Pekerjaan baru masuk realisasi tim (ROW eksekusi, PG Hartek, P0 Yandal) saat
/// Selesai.
///
/// v1.0.16 (permintaan kvlar 22 Okt 2026):
///  - offline: semua isian tersimpan di HP dulu (WoStore), dikirim di latar tanpa popup; cukup pemberitahuan singkat.
///  - simpan bertahap: pekerjaan boleh disimpan dengan foto Sebelum saja, foto Pekerjaan / Sesudah menyusul dari kartu.
///  - kartu ringkas + aksi cepat (navigasi Google Maps ke lokasi temuan, mulai, tambah pekerjaan, selesai); ketuk kartu
///    = detail lengkap. Kartu Selesai berhierarki: tindak lanjut di depan, kode realisasi + waktu di bawah.
///  - ROW: chip jenis pekerjaan dinamis dari diameter, koordinat wajib. Hartek: banyak pekerjaan + material sekali isi.
///    Yandal: foto kamera saja, koordinat dari GPS HP (petugas di lapangan), hasil = realisasi P0.
///  - WO dipindah admin selama dikerjakan offline: kartu pilihan tetap unggah (verifikasi admin) / batalkan.
class WoTimScreen extends StatefulWidget {
  const WoTimScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_WO_TIM';

  @override
  State<WoTimScreen> createState() => _WoTimScreenState();
}

class _WoTimScreenState extends State<WoTimScreen> {
  static const _uuid = Uuid();

  Map<String, dynamic>? _doc;
  String? _galat;
  bool _muat = false;
  bool _selesai = false; // false = WO aktif, true = Selesai 7 hari

  Sesi get _sesi => widget.sesi;
  WoStore get _store => widget.deps.wo;
  bool get _boleh => _sesi.bisaUbah(WoTimScreen.menu);
  Map<String, dynamic> get _server => petaWo(_doc?['server']);
  String get _jenisTim => teksWo(_server['jenisTim']).isEmpty ? _sesi.jenisTim : teksWo(_server['jenisTim']);
  bool get _yandal => _jenisTim == 'YANDAL';
  List<String> get _slotWajib => [for (final s in (_server['slotWajib'] as List<dynamic>? ?? _slotBawaan)) '$s'];
  List<dynamic> get _slotBawaan => _jenisTim == 'HARTEK' ? const ['SEBELUM', 'SESUDAH'] : const ['SEBELUM', 'PEKERJAAN', 'SESUDAH'];
  Map<String, dynamic> get _master => petaWo(_server['master']);
  List<Map<String, dynamic>> get _wo => _doc == null ? const [] : WoLokal.gabung(_doc!);

  @override
  void initState() {
    super.initState();
    _doc = _store.docInstan(_sesi);
    _store.addListener(_dengar);
    Lonceng.i.tujuanWo.addListener(_bukaTujuan);
    unawaited(_bacaLokal());
  }

  @override
  void dispose() {
    _store.removeListener(_dengar);
    Lonceng.i.tujuanWo.removeListener(_bukaTujuan);
    super.dispose();
  }

  /// v1.0.20: notifikasi WO diketuk = detail WO itu langsung dibuka (sesudah daftar dimuat kalau belum ada).
  void _bukaTujuan() {
    final id = Lonceng.i.tujuanWo.value;
    if (id == null || !mounted) return;
    if (!_wo.any((t) => teksWo(t['temuanId']) == id)) return; // dicoba lagi sesudah daftar diperbarui
    Lonceng.i.tujuanWo.value = null;
    unawaited(_bukaDetail(id));
  }

  void _dengar() {
    if (mounted) setState(() => _doc = _store.docInstan(_sesi) ?? _doc);
  }

  Future<void> _bacaLokal() async {
    final d = await _store.doc(_sesi);
    if (mounted) setState(() => _doc = d);
    await _segarkan();
  }

  /// Kirim antrean + tarik daftar WO. Tanpa sinyal = tetap tampil dari HP.
  Future<void> _segarkan() async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      await _store.kirim(_sesi);
      // v1.0.17: foto temuan kartu WO disimpan di HP selagi ada sinyal (tampil saat offline)
      unawaited(FotoServerWo.praMuat(_muatFoto, [
        for (final t in _wo)
          if (statusWoDari(t) != StatusWo.selesai && teksWo(petaWo(t['foto'])['TEMUAN']).isNotEmpty)
            {'temuanId': teksWo(t['temuanId']), 'slot': 'TEMUAN'},
      ]));
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.kode.startsWith('HTTP_') ? null : pesanWo(e.kode));
    } catch (_) {
      // offline: daftar dari HP
    } finally {
      if (mounted) setState(() => _muat = false);
      unawaited(widget.deps.syncCtl.hitungUlang());
      _bukaTujuan();
    }
  }

  /// Kirim di latar sesudah simpan lokal (tanpa menunggu, tanpa popup).
  void _kirimLatar() => unawaited(_segarkan());

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p), duration: const Duration(seconds: 2)));


  Future<Map<String, dynamic>> _muatFoto(Map<String, dynamic> data, {Duration? timeout}) =>
      widget.deps.api.call('getFotoWoTim', token: _sesi.token, data: data, timeout: timeout ?? const Duration(seconds: 60));

  Map<String, dynamic> _dataFoto(Map<String, dynamic> t, Map<String, dynamic> p, String slot) =>
      {'temuanId': teksWo(t['temuanId']), 'tlId': teksWo(p['tlId']), 'slot': slot};

  Future<bool> _yakin(String judul, String isi, String tombol, {Color? warna}) async =>
      await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(judul),
          content: Text(isi),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(
                style: warna == null ? null : FilledButton.styleFrom(backgroundColor: warna),
                onPressed: () => Navigator.pop(c, true),
                child: Text(tombol)),
          ],
        ),
      ) ==
      true;

  Map<String, dynamic>? _cari(String id) {
    for (final t in _wo) {
      if (teksWo(t['temuanId']) == id) return t;
    }
    return null;
  }

  // ---------- aksi WO ----------

  bool _bisaKerja(Map<String, dynamic> t) {
    final sel = teksWo(petaWo(t['_selesai'])['status']);
    return _boleh &&
        statusWoDari(t) == StatusWo.dikerjakan &&
        t['_konflik'] == null &&
        sel != 'VERIFIKASI' &&
        sel != HartekLokal.lokal &&
        sel != 'TERKIRIM';
  }

  Future<void> _mulai(Map<String, dynamic> t) async {
    final ya = await _yakin('Mulai kerjakan WO?', 'Sesudah dimulai, WO ${teksWo(t['kodeTemuan'])} tidak bisa dipindah admin ke tim lain. '
        'Bisa dikerjakan tanpa sinyal.', 'Mulai kerjakan');
    if (!ya || !mounted) return;
    await _store.mulai(_sesi, t);
    if (mounted) _pesan('WO dimulai. Catat pekerjaan dan fotonya.');
    _kirimLatar();
  }

  Future<void> _navigasi(Map<String, dynamic> t) async {
    final uri = uriNavigasiWo(teksWo(t['koordinat']));
    if (uri == null) {
      _pesan('Koordinat lokasi temuan belum ada.');
      return;
    }
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) _pesan('Google Maps tidak bisa dibuka.');
    } catch (_) {
      if (mounted) _pesan('Google Maps tidak bisa dibuka.');
    }
  }

  DataWatermark _watermark(Map<String, dynamic> t, Map<String, String> n, String slot) {
    final koor = (n['koordinat'] ?? t['koordinat'] ?? '').toString().trim();
    final dia = int.tryParse((n['diameter'] ?? '').trim());
    final jenis = _jenisTim == 'ROW'
        ? teksWo(jenisRowDariDiameter(daftarWo(_master['jenis']), dia)?['nama'])
        : _jenisTim == 'HARTEK'
            ? teksWo(_jenisHartek(t)[(n['pekerjaan_1'] ?? n['jenisId'] ?? '').trim()]?['nama'])
            : (n['namaPekerjaan'] ?? '').trim();
    return DataWatermark(
      kodeEksekusi: teksWo(t['kodeTemuan']),
      ulp: _sesi.ulp,
      tim: _sesi.timNama,
      subTim: _sesi.petugasShift.isEmpty ? _sesi.nama : _sesi.petugasShift.join(', '),
      penyulang: teksWo(t['penyulang']),
      section: [teksWo(t['section']), if (teksWo(t['noGardu']).isNotEmpty) 'Gardu ${teksWo(t['noGardu'])}'].where((x) => x.isNotEmpty).join(' · '),
      waktu: DateTime.now(),
      koordinat: koor.isEmpty || Koordinat.cek(koor) != null ? null : koor,
      diameter: _jenisTim == 'ROW' ? dia : null,
      jenis: jenis.isEmpty ? 'Tindak lanjut ${teksWo(t['jenisTemuan'])}' : jenis,
      slot: labelFotoWo[slot] ?? slot,
      labelKode: 'Kode Temuan',
      labelSubTim: 'Petugas',
      tampilDiameter: _jenisTim == 'ROW',
    );
  }

  /// Pekerjaan Hartek untuk jenis lokasi temuan: jenisId -> node master.
  Map<String, Map<String, dynamic>> _jenisHartek(Map<String, dynamic> t) => {
        for (final j in jenisHartekUntuk(daftarWo(_master['jenis']), jenisPgTemuan(t))) teksWo(j['jenisId']): j,
      };

  Map<String, Map<String, dynamic>> get _materialHartek => {for (final m in daftarWo(_master['material'])) teksWo(m['materialId']): m};

  List<String> get _kepemilikan => [for (final k in daftarWo(_master['kepemilikan'])) teksWo(k['nama'])]..removeWhere((x) => x.isEmpty);

  /// Section ROW penyulang temuan: sectionId -> nama section.
  Map<String, String> _sectionRow(Map<String, dynamic> t) => {
        for (final s in daftarWo(_master['section']))
          if (teksWo(s['penyulang']).toLowerCase() == teksWo(t['penyulang']).toLowerCase()) teksWo(s['sectionId']): teksWo(s['section']),
      };

  /// v1.0.17: sectionId master ROW yang sama dengan section temuan (input petugas inspeksi). null = tidak terkunci.
  String? _sectionTemuan(Map<String, dynamic> t) {
    for (final e in _sectionRow(t).entries) {
      if (e.value == teksWo(t['section'])) return e.key;
    }
    return null;
  }

  /// v1.0.16: chip jenis pekerjaan ROW dari diameter, warna sama dengan ringkasan laporan ROW.
  /// v1.0.17: tanpa chip sebelum diameter diisi (cukup placeholder di kolom), chip muncul sesudah diisi.
  InfoIsianHartek? _infoDiameter(Map<String, String> n) {
    final d = angkaDari(n['diameter']);
    if (d == null) return null;
    final j = jenisRowDariDiameter(daftarWo(_master['jenis']), d);
    if (j == null) return (teks: 'Di luar kategori pekerjaan ROW', warna: AppColors.red700, latar: AppColors.red100, ikon: Icons.error_outline_rounded);
    final nama = teksWo(j['nama']);
    final min = teksWo(j['diameterMin']), max = teksWo(j['diameterMax']);
    final rentang = min.isNotEmpty && max.isNotEmpty ? (min == max ? '$min cm' : '$min-$max cm') : min.isNotEmpty ? '≥ $min cm' : '≤ $max cm';
    final l = nama.toLowerCase();
    final (Color w, Color b, IconData i) = l.contains('besar')
        ? (AppColors.red700, AppColors.red100, Icons.forest_rounded)
        : l.contains('sedang')
            ? (const Color(0xFF835800), AppColors.accent100, Icons.park_rounded)
            : (AppColors.brand700, AppColors.brand100, Icons.content_cut_rounded);
    return (teks: '$nama · $rentang', warna: w, latar: b, ikon: i);
  }

  List<IsianHartek> _isianPekerjaan(Map<String, dynamic> t, Map<String, String> n) {
    final foto = [
      for (final s in slotFotoWo)
        IsianHartek('foto_$s', labelFotoWo[s]!,
            // v1.0.16: simpan bertahap, cukup foto Sebelum dulu; foto wajib lain dicek saat Selesai
            wajib: s == 'SEBELUM',
            grup: s == 'SEBELUM' ? 'Foto' : null,
            baris: 'foto',
            ambilFoto: (ctx, nilai, ada) => FotoLapangan.ambil(ctx,
                label: labelFotoWo[s]!, pratinjau: _watermark(t, nilai, s), folder: WoStore.folderFoto, pathAda: ada, bolehGaleri: !_yandal)),
    ];
    final lokasi = [
      IsianHartek('koordinat', 'Koordinat pekerjaan',
          wajib: true, // v1.0.16
          koordinat: true,
          gpsSaja: _yandal, // v1.0.16: Yandal = GPS HP saja
          grup: 'Lokasi',
          contoh: '-3.012345, 106.512345',
          bantuan: _yandal ? 'Diambil otomatis dari GPS HP di lokasi pekerjaan, tidak bisa diketik.' : null), // v1.0.28
      const IsianHartek('catatan', 'Catatan', multi: true, maks: 300, bantuan: 'Opsional, maksimal 5 baris.'),
    ];
    switch (_jenisTim) {
      case 'ROW':
        final sec = _sectionRow(t);
        // v1.0.17: section + nomor tiang hasil input petugas inspeksi terkunci (dibaca saja, server SECTION_TERKUNCI /
        // TIANG_TERKUNCI)
        final secKunci = _sectionTemuan(t) != null;
        final tiangKunci = teksWo(t['nomorTiang']).isNotEmpty;
        return [
          IsianHartek('diameter', 'Diameter batang',
              wajib: true,
              angka: true,
              bulat: true,
              max: 1000,
              akhiran: 'cm',
              grup: 'Pekerjaan ROW',
              contoh: placeholderDiameterRow, // v1.0.17
              infoDari: _infoDiameter),
          if (secKunci)
            const IsianHartek('sectionTampil', 'Section', bacaSaja: true, bantuan: 'Dari temuan petugas inspeksi, tidak bisa diubah.')
          else
            IsianHartek('sectionId', 'Section',
                wajib: true,
                pilihan: sec.keys.toList(),
                labelPilihan: (id) => sec[id] ?? id,
                bantuan: sec.isEmpty ? 'Section penyulang ${teksWo(t['penyulang'])} tidak ada di master ROW.' : null),
          if (tiangKunci)
            const IsianHartek('nomorTiang', 'Nomor tiang', bacaSaja: true)
          else
            const IsianHartek('nomorTiang', 'Nomor tiang', maks: 40, contoh: 'TB-12'),
          ...lokasi,
          ...foto,
        ];
      case 'HARTEK':
        return [..._isianHartek(t, n), ...lokasi, ...foto];
      default:
        final nama = [for (final j in daftarWo(_master['jenis'])) teksWo(j['nama'])]..removeWhere((x) => x.isEmpty);
        return [
          IsianHartek('namaPekerjaan', 'Pekerjaan', wajib: true, grup: 'Pekerjaan Yandal (P0)', pilihan: nama, turunan: const ['pekerjaanLainnya']),
          if ((n['namaPekerjaan'] ?? '').trim() == pekerjaanLainYandal)
            const IsianHartek('pekerjaanLainnya', 'Keterangan pekerjaan', wajib: true, maks: 100),
          ...lokasi,
          ...foto,
        ];
    }
  }

  /// v1.0.17: material dibatasi per pekerjaan (10) dan per isian (30, sama dengan server).
  static const _maksPekerjaan = 15, _maksMaterial = 10, _maksMaterialIsian = 30;

  /// v1.0.16: Hartek banyak pekerjaan + material dalam satu isian. Baris berikutnya muncul sesudah baris sebelumnya diisi.
  /// v1.0.17 (permintaan kvlar 22 Okt 2026): material tidak lagi di kolom terpisah. Tiap pekerjaan punya kartu sendiri
  /// berisi pekerjaan + jumlah, lalu material yang dipakai PEKERJAAN ITU (jumlah, satuan, kepemilikan dari
  /// db_Kepemilikan_Material). Pembaca laporan tahu pasti material dipakai untuk pekerjaan apa.
  /// v1.0.23 (permintaan kvlar 23 Okt 2026): pekerjaan + materialnya dalam SATU kartu. Kolom material (jumlah, satuan,
  /// kepemilikan) baru muncul sesudah tombol + Tambah material diketuk; pekerjaan berikutnya sesudah + Tambah pekerjaan
  /// (pekerjaan pertama langsung tampil).
  /// v1.0.26 (permintaan kvlar 23 Okt 2026): tiap pekerjaan kartu sendiri (aksen merek, bisa dibuka / ditutup), tiap
  /// material kartu kecil di dalamnya (aksen kuning, bisa dibuka / ditutup).
  List<IsianHartek> _isianHartek(Map<String, dynamic> t, Map<String, String> n) {
    final jh = _jenisHartek(t), mt = _materialHartek, milik = _kepemilikan;
    final nPk = barisDitambahWo(n, 'pekerjaan', _maksPekerjaan, kunciTambah: '_tambahPekerjaan', awal: 1);
    bool isi(String k) => (n[k] ?? '').trim().isNotEmpty;
    String nama(Map<String, Map<String, dynamic>> m, String k) => teksWo(m[(n[k] ?? '').trim()]?['nama']);
    return [
      for (var i = 1; i <= nPk; i++) ...[
        IsianHartek('pekerjaan_$i', i == 1 ? 'Jenis pekerjaan (lokasi ${jenisPgTemuan(t)})' : 'Jenis pekerjaan',
            wajib: i == 1,
            grup: ['Pekerjaan $i', if (nama(jh, 'pekerjaan_$i').isNotEmpty) nama(jh, 'pekerjaan_$i')].join(' · '),
            lipat: true,
            pilihan: jh.keys.toList(),
            labelPilihan: (id) => teksWo(jh[id]?['nama']),
            isiLain: (id) => {'satuan_$i': teksWo(jh[id]?['satuan'])},
            bantuan: i == 1 && jh.isEmpty ? 'Belum ada pekerjaan Hartek ${jenisPgTemuan(t)} aktif di master.' : null),
        if (isi('pekerjaan_$i')) ...[
          IsianHartek('jumlah_$i', 'Jumlah', wajib: true, angka: true, max: 999999, baris: 'pk$i'),
          IsianHartek('satuan_$i', 'Satuan', bacaSaja: true, baris: 'pk$i', contoh: 'Otomatis'),
          for (var j = 1; j <= barisDitambahWo(n, 'material_$i', _maksMaterial, kunciTambah: '_tambahMaterial_$i'); j++) ...[
            IsianHartek(kunciMaterialWo('material', i, j), 'Nama material',
                sub: _subMaterial(n, mt, i, j),
                pilihan: mt.keys.toList(),
                labelPilihan: (id) => teksWo(mt[id]?['nama']),
                isiLain: (id) => {kunciMaterialWo('satuanMaterial', i, j): teksWo(mt[id]?['satuan'])},
                turunan: [kunciMaterialWo('jumlahMaterial', i, j), kunciMaterialWo('kepemilikan', i, j)],
                bantuan: j == 1 && mt.isEmpty ? 'Belum ada material aktif di master (db_Material).' : null),
            if (isi(kunciMaterialWo('material', i, j))) ...[
              IsianHartek(kunciMaterialWo('jumlahMaterial', i, j), 'Jumlah',
                  wajib: true, angka: true, max: 999999, baris: 'mt${i}_$j', sub: _subMaterial(n, mt, i, j)),
              IsianHartek(kunciMaterialWo('satuanMaterial', i, j), 'Satuan',
                  bacaSaja: true, baris: 'mt${i}_$j', contoh: 'Otomatis', sub: _subMaterial(n, mt, i, j)),
              // v1.0.18: kepemilikan dari db_Kepemilikan_Material (tanpa isian bebas)
              IsianHartek(kunciMaterialWo('kepemilikan', i, j), 'Kepemilikan',
                  sub: _subMaterial(n, mt, i, j),
                  wajib: true,
                  pilihan: milik,
                  bantuan: milik.isEmpty ? 'Belum ada kepemilikan aktif di db_Kepemilikan_Material. Hubungi admin.' : null),
            ],
          ],
          if (barisDitambahWo(n, 'material_$i', _maksMaterial, kunciTambah: '_tambahMaterial_$i') < _maksMaterial)
            IsianHartek('_tambahMaterial_$i', 'Tambah material', tambah: true),
        ],
      ],
      if (nPk < _maksPekerjaan && isi('pekerjaan_$nPk')) const IsianHartek('_tambahPekerjaan', 'Tambah pekerjaan', tambah: true, grup: ''),
    ];
  }

  /// Judul kartu kecil material (sama untuk semua isian material itu supaya satu kartu).
  String _subMaterial(Map<String, String> n, Map<String, Map<String, dynamic>> mt, int i, int j) {
    final nm = teksWo(mt[(n[kunciMaterialWo('material', i, j)] ?? '').trim()]?['nama']);
    return ['Material $j', if (nm.isNotEmpty) nm].join(' · ');
  }

  Map<String, String> _cekPekerjaan(Map<String, String> n) {
    final e = <String, String>{};
    if (_jenisTim == 'ROW') {
      final d = angkaDari(n['diameter']);
      if (d != null && jenisRowDariDiameter(daftarWo(_master['jenis']), d) == null) e['diameter'] = 'Diameter tidak masuk kategori pekerjaan ROW';
    }
    if (_jenisTim == 'HARTEK') {
      final dipakai = <String>{};
      for (var i = 1; i <= _maksPekerjaan; i++) {
        final j = (n['pekerjaan_$i'] ?? '').trim();
        if (j.isEmpty) continue;
        if (!dipakai.add(j)) e['pekerjaan_$i'] = 'Pekerjaan ini sudah dipilih di baris lain';
        final x = angkaDari(n['jumlah_$i']);
        if (x != null && x <= 0) e['jumlah_$i'] = 'Jumlah harus lebih dari 0';
      }
      var totalMt = 0;
      for (var i = 1; i <= _maksPekerjaan; i++) {
        if ((n['pekerjaan_$i'] ?? '').trim().isEmpty) continue;
        for (var j = 1; j <= _maksMaterial; j++) {
          if ((n[kunciMaterialWo('material', i, j)] ?? '').trim().isEmpty) continue;
          totalMt++;
          final x = angkaDari(n[kunciMaterialWo('jumlahMaterial', i, j)]);
          if (x != null && x <= 0) e[kunciMaterialWo('jumlahMaterial', i, j)] = 'Jumlah harus lebih dari 0';
          if (totalMt > _maksMaterialIsian) e[kunciMaterialWo('material', i, j)] = 'Maksimal $_maksMaterialIsian material per isian WO';
        }
      }
    }
    return e;
  }

  /// Isian kirim (simpanPekerjaanWo) + isian tampil kartu sebelum server menjawab.
  (Map<String, dynamic>, Map<String, dynamic>) _dataPekerjaan(Map<String, dynamic> t, Map<String, String> n) {
    String v(String k) => (n[k] ?? '').trim();
    final umum = {'koordinat': v('koordinat'), if (v('catatan').isNotEmpty) 'catatan': v('catatan')};
    switch (_jenisTim) {
      case 'ROW':
        final dia = angkaDari(v('diameter'))?.toInt();
        final j = jenisRowDariDiameter(daftarWo(_master['jenis']), dia);
        final sec = _sectionRow(t);
        return (
          {...umum, 'diameter': dia, if (v('sectionId').isNotEmpty) 'sectionId': v('sectionId'), if (v('nomorTiang').isNotEmpty) 'nomorTiang': v('nomorTiang')},
          {...umum, 'pekerjaan': teksWo(j?['nama']), 'satuan': teksWo(j?['satuan']), 'jumlah': 1, 'diameter': dia,
           'section': sec[v('sectionId')] ?? '', 'sectionId': v('sectionId'), 'nomorTiang': v('nomorTiang').toUpperCase()},
        );
      case 'HARTEK':
        final r = rincianHartekWo(n, _uuid.v4, maksPekerjaan: _maksPekerjaan, maksMaterial: _maksMaterial);
        final jh = _jenisHartek(t), mt = _materialHartek;
        // v1.0.17: tampilan kartu sebelum server menjawab, material di dalam pekerjaannya
        final pk = [
          for (final p in daftarWo(r['pekerjaan']))
            {
              'nama': teksWo(jh[teksWo(p['jenisId'])]?['nama']),
              'jumlah': p['jumlah'],
              'satuan': teksWo(jh[teksWo(p['jenisId'])]?['satuan']),
              'material': [
                for (final x in daftarWo(p['material']))
                  {'nama': teksWo(mt[teksWo(x['materialId'])]?['nama']), 'jumlah': x['jumlah'], 'satuan': teksWo(mt[teksWo(x['materialId'])]?['satuan']),
                   'kepemilikan': x['kepemilikan']},
              ],
            },
        ];
        return (
          {...umum, 'rincian': jsonEncode(r)},
          {...umum, 'pekerjaan': pk.isEmpty ? '' : pk.first['nama'], 'jumlah': pk.isEmpty ? 0 : pk.first['jumlah'],
           'satuan': pk.isEmpty ? '' : pk.first['satuan'], 'rincian': {'pekerjaan': pk}},
        );
      default:
        return (
          {...umum, 'namaPekerjaan': v('namaPekerjaan'), if (v('pekerjaanLainnya').isNotEmpty) 'pekerjaanLainnya': v('pekerjaanLainnya')},
          {...umum, 'pekerjaan': v('namaPekerjaan'), 'pekerjaanLainnya': v('pekerjaanLainnya'), 'jumlah': 1},
        );
    }
  }

  Future<void> _tambahPekerjaan(Map<String, dynamic> t) async {
    if (!_bisaKerja(t)) return;
    final tlId = _uuid.v4();
    final secAwal = _sectionTemuan(t);
    final hasil = await bukaFormHartek(
      context,
      judulApp: _yandal ? 'TO P0' : 'WO Tindak Lanjut',
      judul: 'Pekerjaan tindak lanjut',
      keterangan: '${teksWo(t['kodeTemuan'])} · ${teksWo(t['jenisTemuan'])}\n${lokasiTemuanWo(t)}', // v1.0.17: chip "Cukup foto Sebelum dulu" dihapus
      tombol: 'Simpan pekerjaan',
      awal: {
        if (secAwal != null) 'sectionId': secAwal,
        if (secAwal != null) 'sectionTampil': teksWo(t['section']),
        if (teksWo(t['nomorTiang']).isNotEmpty && _jenisTim == 'ROW') 'nomorTiang': teksWo(t['nomorTiang']),
      },
      daftar: (n) => _isianPekerjaan(t, n),
      cekTambahan: _cekPekerjaan,
      simpan: (n) async {
        final (data, tampil) = _dataPekerjaan(t, n);
        final foto = <String, String>{
          for (final s in slotFotoWo)
            if ((n['foto_$s'] ?? '').trim().isNotEmpty) s: n['foto_$s']!.trim(),
        };
        await _store.simpanPekerjaan(_sesi, t, tlId, data, tampil, foto, isian: _isianSimpan(n));
        return const {'lokal': true};
      },
    );
    if (hasil == null || !mounted) return;
    unawaited(tampilDataTersimpan(context));
    _kirimLatar();
  }

  /// v1.0.26: isian form yang disimpan untuk Ubah pekerjaan (foto dikelola di kartu, tidak ikut).
  static Map<String, String> _isianSimpan(Map<String, String> n) => {
        for (final e in n.entries)
          if (!e.key.startsWith('foto_')) e.key: e.value,
      };

  /// v1.0.26 (permintaan kvlar 23 Okt 2026): pekerjaan boleh diubah selama DRAFT, foto Sebelum sudah ada, foto Sesudah
  /// belum (server juga mengecek: FOTO_SEBELUM_BELUM_ADA / FOTO_SESUDAH_SUDAH_ADA).
  bool _bisaUbah(Map<String, dynamic> t, Map<String, dynamic> p) {
    if (!_bisaKerja(t) || teksWo(p['status']) != 'DRAFT') return false;
    final hp = HartekLokal.fotoDiHp(p), srv = HartekLokal.fotoDiServer(p);
    return (hp['SEBELUM'] != null || srv['SEBELUM'] != null) && hp['SESUDAH'] == null && srv['SESUDAH'] == null;
  }

  static String _angkaIsian(Object? v) {
    final x = num.tryParse(teksWo(v));
    return x == null ? '' : (x == x.roundToDouble() ? '${x.toInt()}' : '$x'.replaceAll('.', ','));
  }

  /// Isian awal form Ubah: isian HP terakhir (belum / baru diterima server) atau dari data server.
  Map<String, String> _awalUbah(Map<String, dynamic> t, Map<String, dynamic> p) {
    final hp = petaWo(p['_isian']);
    if (hp.isNotEmpty) return {for (final e in hp.entries) if (!e.key.startsWith('foto_')) e.key: teksWo(e.value)};
    final n = <String, String>{'koordinat': teksWo(p['koordinat']), 'catatan': teksWo(p['catatan'])};
    switch (_jenisTim) {
      case 'ROW':
        n['diameter'] = _angkaIsian(p['diameter']);
        n['sectionId'] = teksWo(p['sectionId']);
        n['nomorTiang'] = teksWo(p['nomorTiang']);
        final sec = _sectionTemuan(t);
        if (sec != null) {
          n['sectionId'] = sec;
          n['sectionTampil'] = teksWo(t['section']);
        }
      case 'HARTEK':
        final rinci = petaWo(p['rincian']);
        final pk = daftarWo(rinci['pekerjaan']), mt = materialPerPekerjaanWo(rinci);
        for (var i = 0; i < pk.length; i++) {
          n['pekerjaan_${i + 1}'] = teksWo(pk[i]['jenisId']);
          n['jumlah_${i + 1}'] = _angkaIsian(pk[i]['jumlah']);
          n['satuan_${i + 1}'] = teksWo(pk[i]['satuan']);
          final m = i < mt.length ? mt[i] : const <Map<String, dynamic>>[];
          for (var j = 0; j < m.length; j++) {
            n[kunciMaterialWo('material', i + 1, j + 1)] = teksWo(m[j]['materialId']);
            n[kunciMaterialWo('jumlahMaterial', i + 1, j + 1)] = _angkaIsian(m[j]['jumlah']);
            n[kunciMaterialWo('satuanMaterial', i + 1, j + 1)] = teksWo(m[j]['satuan']);
            n[kunciMaterialWo('kepemilikan', i + 1, j + 1)] = teksWo(m[j]['kepemilikan']);
          }
        }
        if (pk.isEmpty) {
          n['pekerjaan_1'] = teksWo(p['jenisId']);
          n['jumlah_1'] = _angkaIsian(p['jumlah']);
          n['satuan_1'] = teksWo(p['satuan']);
        }
      default:
        n['namaPekerjaan'] = teksWo(p['pekerjaan']);
        n['pekerjaanLainnya'] = teksWo(p['pekerjaanLainnya']);
    }
    n.removeWhere((k, v) => v.isEmpty);
    return n;
  }

  Future<void> _ubahPekerjaan(Map<String, dynamic> t, Map<String, dynamic> p) async {
    if (!_bisaUbah(t, p)) return;
    final hasil = await bukaFormHartek(
      context,
      judulApp: _yandal ? 'TO P0' : 'WO Tindak Lanjut',
      judul: 'Ubah pekerjaan',
      keterangan: '${teksWo(p['kodeTl']).isEmpty ? teksWo(t['kodeTemuan']) : teksWo(p['kodeTl'])} · ${teksWo(t['jenisTemuan'])}\n'
          'Foto tidak berubah; foto Pekerjaan / Sesudah diambil dari kartu pekerjaan.',
      tombol: 'Simpan perubahan',
      awal: _awalUbah(t, p),
      daftar: (n) => _isianPekerjaan(t, n).where((i) => !i.foto).toList(),
      cekTambahan: _cekPekerjaan,
      simpan: (n) async {
        final (data, tampil) = _dataPekerjaan(t, n);
        await _store.ubahPekerjaan(_sesi, t, p, data, tampil, _isianSimpan(n));
        return const {'lokal': true};
      },
    );
    if (hasil == null || !mounted) return;
    unawaited(tampilDataTersimpan(context));
    _kirimLatar();
  }

  Future<void> _hapusPekerjaan(Map<String, dynamic> t, Map<String, dynamic> p) async {
    final ya = await _yakin('Hapus pekerjaan?', '${teksWo(p['kodeTl']).isEmpty ? 'Pekerjaan' : teksWo(p['kodeTl'])} ${teksWo(p['pekerjaan'])} dibatalkan.', 'Hapus',
        warna: AppColors.red700);
    if (!ya || !mounted) return;
    await _store.hapusPekerjaan(_sesi, teksWo(t['temuanId']), p);
    if (mounted) _pesan('Pekerjaan dihapus.');
    _kirimLatar();
  }

  /// v1.0.28 (permintaan kvlar 23 Okt 2026): foto / kamera sedang dibuka; ketukan berulang selama jeda diabaikan
  /// (dulu foto bisa terbuka berkali-kali).
  bool _fotoDibuka = false;

  Future<void> _ketukFoto(Map<String, dynamic> t, Map<String, dynamic> p, String slot) async {
    if (_fotoDibuka) return;
    _fotoDibuka = true;
    try {
      await _bukaFoto(t, p, slot);
    } finally {
      _fotoDibuka = false;
    }
  }

  Future<void> _bukaFoto(Map<String, dynamic> t, Map<String, dynamic> p, String slot) async {
    final id = teksWo(t['temuanId']), tlId = teksWo(p['tlId']);
    final label = labelFotoWo[slot] ?? slot;
    final hp = HartekLokal.fotoDiHp(p)[slot];
    if (hp != null && hp.isNotEmpty) {
      if (HartekLokal.statusFoto(p, slot) == HartekLokal.gagal) {
        final pilih = await showDialog<String>(
          context: context,
          builder: (c) => AlertDialog(
            title: Text('$label belum terkirim'),
            content: Text(HartekLokal.galatFoto(p, slot) ?? 'Foto ditolak server.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, 'BUANG'), child: const Text('Buang foto')),
              TextButton(onPressed: () => Navigator.pop(c, 'LIHAT'), child: const Text('Lihat')),
              FilledButton(onPressed: () => Navigator.pop(c, 'ULANG'), child: const Text('Kirim ulang')),
            ],
          ),
        );
        if (!mounted || pilih == null) return;
        if (pilih == 'BUANG') {
          await _store.buangFoto(_sesi, id, tlId, slot);
        } else if (pilih == 'ULANG') {
          await _store.cobaUlang(_sesi, id);
          _kirimLatar();
        } else {
          await lihatFoto(context, path: hp, slot: label);
        }
        return;
      }
      await lihatFoto(context, path: hp, slot: label);
      return;
    }
    if (teksWo(petaWo(p['foto'])[slot]).isNotEmpty) {
      await FotoServerWo.lihat(context, _muatFoto, _dataFoto(t, p, slot), label); // v1.0.15: foto penuh dari server
      return;
    }
    if (!_bisaKerja(t) || teksWo(p['status']) != 'DRAFT') return;
    try {
      final nilai = <String, String>{
        if (p['diameter'] != null) 'diameter': '${p['diameter']}',
        'koordinat': teksWo(p['koordinat']),
        if (_jenisTim == 'YANDAL') 'namaPekerjaan': teksWo(p['pekerjaan']),
      };
      final path = await FotoLapangan.ambil(context,
          label: label, pratinjau: _watermark(t, nilai, slot), folder: WoStore.folderFoto, bolehGaleri: !_yandal);
      if (path == null || !mounted) return;
      await _store.tambahFoto(_sesi, t, tlId, slot, path);
      // v1.0.17: hanya foto slot ini yang diantre; status lengkap baru muncul sesudah diterima server
      if (mounted) _pesan('Foto $label tersimpan di HP, sedang proses sinkron.');
      _kirimLatar();
    } on RowError catch (e) {
      if (mounted) _pesan(e.pesan);
    }
  }

  Future<void> _selesaiWo(Map<String, dynamic> t) async {
    final alasan = alasanBelumSelesai(t, _slotWajib);
    if (alasan != null) {
      _pesan(alasan);
      return;
    }
    var isi = const <String, dynamic>{};
    if (_jenisTim == 'HARTEK' && jenisPgTemuan(t) == 'Jaringan') {
      // v1.0.16: istilah "PG" diganti bahasa lapangan: lokasi jaringan di laporan Hartek hari ini
      final hasil = await bukaFormHartek(
        context,
        judulApp: 'WO Tindak Lanjut',
        judul: 'Selesaikan WO',
        keterangan: '${teksWo(t['kodeTemuan'])}\nPekerjaan dicatat ke lokasi jaringan penyulang ${teksWo(t['penyulang'])} '
            '(${teksWo(t['section'])}) di laporan Hartek hari ini.',
        tombol: 'Selesai',
        daftar: (_) => const [
          IsianHartek('daerah', 'Daerah / nama jalan', maks: 200, grup: 'Lokasi pekerjaan di laporan Hartek',
              contoh: 'Nama jalan atau desa', bantuan: 'Wajib kalau lokasi ini belum ada di laporan Hartek hari ini.'),
          IsianHartek('jumlahGawang', 'Jumlah gawang', angka: true, bulat: true, max: 9999, akhiran: 'gawang'),
        ],
        simpan: (n) async => {
          if ((n['daerah'] ?? '').trim().isNotEmpty) 'daerah': n['daerah']!.trim(),
          if (angkaDari(n['jumlahGawang']) != null) 'jumlahGawang': angkaDari(n['jumlahGawang'])!.toInt(),
        },
      );
      if (hasil == null || !mounted) return;
      isi = hasil;
    } else {
      final ya = await _yakin(
          'Selesaikan WO?',
          'Semua pekerjaan ${teksWo(t['kodeTemuan'])} masuk realisasi '
              '${_jenisTim == 'ROW' ? 'laporan ROW' : _yandal ? 'P0 shift ini' : 'laporan Hartek'} hari ini dan tidak bisa diubah lagi.',
          'Selesai',
          warna: AppColors.success700);
      if (!ya || !mounted) return;
    }
    await _store.selesai(_sesi, t, isi);
    // Laporan Utama / P0 di HP dikirim juga supaya server mengenal laporan hari ini
    unawaited(widget.deps.syncCtl.sinkron());
  }

  Future<void> _lanjutKonflik(Map<String, dynamic> t) async {
    final ya = await _yakin(
        'Tetap unggah WO ini?',
        'Admin sudah memindahkan WO ${teksWo(t['kodeTemuan'])}. Hasil kerja tim Anda tetap diunggah, lalu admin memverifikasi tim mana '
            'yang sah. Selesai baru masuk realisasi setelah diverifikasi.',
        'Tetap unggah');
    if (!ya || !mounted) return;
    await _store.lanjutkanKonflik(_sesi, teksWo(t['temuanId']));
    _kirimLatar();
  }

  Future<void> _batalkanWo(Map<String, dynamic> t) async {
    final ya = await _yakin('Batalkan WO ini?', 'Semua isian dan foto WO ${teksWo(t['kodeTemuan'])} di HP ini dihapus.', 'Hapus dari HP',
        warna: AppColors.red700);
    if (!ya || !mounted) return;
    await _store.batalkanWo(_sesi, teksWo(t['temuanId']));
    if (mounted) _pesan('WO dihapus dari HP.');
  }

  // ---------- tampilan: bagian kecil ----------

  (Color, Color, IconData) _gaya(Map<String, dynamic> t) {
    if (t['_konflik'] != null) return (AppColors.red700, AppColors.red100, Icons.swap_horiz_rounded);
    final sel = teksWo(petaWo(t['_selesai'])['status']);
    if (sel == 'VERIFIKASI') return (AppColors.cyan600, AppColors.cyan100, Icons.how_to_reg_rounded);
    switch (statusWoDari(t)) {
      case StatusWo.dikerjakan:
        return sel == HartekLokal.lokal
            ? (AppColors.accent700, AppColors.accent100, Icons.sync_rounded) // v1.0.17: proses sinkron, belum Selesai
            : (AppColors.accent700, AppColors.accent100, Icons.construction_rounded);
      case StatusWo.selesai:
        return (AppColors.success700, AppColors.success100, Icons.task_alt_rounded);
      default:
        return (HartekGaya.merek, AppColors.brand100, Icons.assignment_late_outlined);
    }
  }

  Widget _pil(String teks, Color warna, Color latar, {IconData? ikon}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (ikon != null) ...[Icon(ikon, size: 13, color: warna), const SizedBox(width: 4)],
          Text(teks, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: warna)),
        ]),
      );

  Widget _tombolNavigasi(Map<String, dynamic> t, {bool lebar = false}) {
    final ada = uriNavigasiWo(teksWo(t['koordinat'])) != null;
    if (lebar) {
      return OutlinedButton.icon(
        onPressed: ada ? () => unawaited(_navigasi(t)) : null,
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
        icon: const Icon(Icons.directions_rounded, size: 20),
        label: const Text('Rute'),
      );
    }
    return IconButton.filledTonal(
      tooltip: ada ? 'Rute ke lokasi (Google Maps)' : 'Koordinat temuan belum ada',
      onPressed: ada ? () => unawaited(_navigasi(t)) : null,
      icon: const Icon(Icons.directions_rounded),
    );
  }

  /// Tombol aksi utama sesuai status (dipakai kartu ringkas dan halaman detail).
  Widget? _aksiUtama(Map<String, dynamic> t, {required bool padat}) {
    if (!_boleh || t['_konflik'] != null) return null;
    final s = statusWoDari(t);
    final h = padat ? 42.0 : 50.0;
    if (s == StatusWo.terkirim) {
      return FilledButton.icon(
        onPressed: () => unawaited(_mulai(t)),
        style: FilledButton.styleFrom(minimumSize: Size.fromHeight(h)),
        icon: const Icon(Icons.play_arrow_rounded),
        label: const Text('Mulai kerjakan'),
      );
    }
    if (!_bisaKerja(t)) return null;
    final alasan = alasanBelumSelesai(t, _slotWajib);
    return Row(children: [
      Expanded(
        child: OutlinedButton.icon(
          onPressed: () => unawaited(_tambahPekerjaan(t)),
          style: OutlinedButton.styleFrom(minimumSize: Size.fromHeight(h)),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Pekerjaan'),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: FilledButton.icon(
          onPressed: alasan == null ? () => unawaited(_selesaiWo(t)) : null,
          style: FilledButton.styleFrom(minimumSize: Size.fromHeight(h), backgroundColor: AppColors.success700),
          icon: const Icon(Icons.task_alt_rounded),
          label: const Text('Selesai'),
        ),
      ),
    ]);
  }

  /// Kartu keadaan khusus (WO dipindah / menunggu verifikasi / Selesai menunggu kirim / ditolak).
  Widget? _kartuKeadaan(Map<String, dynamic> t) {
    final k = teksWo(t['_konflik']);
    if (k.isNotEmpty) {
      final bisaLanjut = k == 'WO_DIPINDAH';
      return _kotak(
        AppColors.red700,
        AppColors.red100,
        Icons.swap_horiz_rounded,
        bisaLanjut ? 'WO dipindahkan admin ke tim lain' : pesanWo(k),
        bisaLanjut
            ? 'Hasil kerja tim Anda belum terkirim. Tetap unggah = admin memverifikasi tim yang sah; batalkan = isian di HP dihapus.'
            : 'Isian WO ini di HP tidak bisa dikirim lagi.',
        aksi: [
          TextButton(onPressed: () => unawaited(_batalkanWo(t)), child: Text(bisaLanjut ? 'Batalkan' : 'Hapus dari HP')),
          if (bisaLanjut) FilledButton(onPressed: () => unawaited(_lanjutKonflik(t)), child: const Text('Tetap unggah')),
        ],
      );
    }
    final sel = petaWo(t['_selesai']);
    final g = petaWo(petaWo(t['wo'])['ganda']);
    if (teksWo(sel['status']) == 'VERIFIKASI' || (g['menunggu'] == true && statusWoDari(t) != StatusWo.selesai)) {
      return _kotak(AppColors.cyan600, AppColors.cyan100, Icons.how_to_reg_rounded, 'Menunggu verifikasi admin',
          'WO ini juga diunggah tim lain. ${teksWo(sel['status']) == 'VERIFIKASI' ? 'Selesai tim Anda ditahan' : 'Selesai akan ditahan'} sampai admin '
              'memilih tim yang sah, lalu HP memperbarui laporan otomatis.');
    }
    if (teksWo(sel['status']) == HartekLokal.gagal) {
      return _kotak(AppColors.red700, AppColors.red100, Icons.error_outline_rounded, 'Selesai belum diterima server', teksWo(sel['galat']),
          aksi: [FilledButton(onPressed: () => unawaited(_cobaUlang(t)), child: const Text('Kirim ulang'))]);
    }
    // v1.0.27 (permintaan kvlar 23 Okt 2026): kartu "Sedang Proses Sinkron" dihapus (sinkron otomatis di latar). Hanya
    // tampil bila Selesai tertahan karena ada data WO ini yang ditolak server (petugas perlu bertindak).
    if (teksWo(sel['status']) == HartekLokal.lokal && teksWo(sel['galat']).isNotEmpty) {
      return _kotak(AppColors.red700, AppColors.red100, Icons.error_outline_rounded, 'Selesai tertahan', teksWo(sel['galat']),
          aksi: [FilledButton(onPressed: () => unawaited(_cobaUlang(t)), child: const Text('Kirim ulang'))]);
    }
    return null;
  }

  Future<void> _cobaUlang(Map<String, dynamic> t) async {
    await _store.cobaUlang(_sesi, teksWo(t['temuanId']));
    _kirimLatar();
  }

  Widget _kotak(Color warna, Color latar, IconData ikon, String judul, String isi, {List<Widget> aksi = const []}) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ikon, size: 20, color: warna),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(judul, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: warna)),
                if (isi.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(isi, style: TextStyle(fontSize: 12.5, height: 1.35, color: warna)),
                ],
              ]),
            ),
          ]),
          if (aksi.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Wrap(alignment: WrapAlignment.end, spacing: 8, children: aksi)),
          if (aksi.isEmpty) const SizedBox(height: 4),
        ]),
      );

  // ---------- kartu ringkas (daftar) ----------

  Widget _kartuRingkas(Map<String, dynamic> t) {
    final s = statusWoDari(t);
    if (s == StatusWo.selesai) return _kartuSelesai(t);
    final (warna, latar, ikon) = _gaya(t);
    final pekerjaan = daftarWo(t['pekerjaanWo']);
    final fp = progresFotoWo(t, _slotWajib);
    final wo = petaWo(t['wo']);
    final aksi = _aksiUtama(t, padat: true);
    final keadaan = _kartuKeadaan(t);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: KartuHartek(
        padding: EdgeInsets.zero,
        onTap: () => unawaited(_bukaDetail(teksWo(t['temuanId']))),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 5, color: warna),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 12, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _fotoKartu(t, warna, latar, ikon),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teksWo(t['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(t['jenisTemuan']),
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                        if (lokasiTemuanWo(t).isNotEmpty)
                          Text(lokasiTemuanWo(t), maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.sekunder),
                      ]),
                    ),
                    _tombolNavigasi(t),
                  ]),
                  const SizedBox(height: 10),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    _pil(statusTampilWo(t), warna, latar),
                    if (pekerjaan.isNotEmpty) _pil('${pekerjaan.length} pekerjaan', HartekGaya.tinta, AppColors.neutral100, ikon: Icons.handyman_outlined),
                    // v1.0.17: hijau hanya kalau semua foto wajib SUDAH diterima server
                    if (fp.wajib > 0)
                      _pil('Foto ${fp.ada}/${fp.wajib}', fp.ada == fp.wajib ? AppColors.success700 : AppColors.accent700,
                          fp.ada == fp.wajib ? AppColors.success100 : AppColors.accent100, ikon: Icons.photo_camera_outlined),
                    if (t['_klaim'] == true) _pil('Diunggah ulang', AppColors.cyan600, AppColors.cyan100, ikon: Icons.how_to_reg_rounded),
                  ]),
                  if (teksWo(wo['catatanAdmin']).isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Catatan admin: ${teksWo(wo['catatanAdmin'])}',
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: HartekGaya.merek)),
                  ],
                  if (keadaan != null) keadaan,
                  if (aksi != null) ...[const SizedBox(height: 12), aksi],
                  const SizedBox(height: 2),
                  Row(children: [
                    Expanded(child: Text(teksWo(t['kodeTemuan']), maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.kode)),
                    const Text('Detail', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: HartekGaya.merek)),
                    const Icon(Icons.chevron_right_rounded, size: 18, color: HartekGaya.merek),
                  ]),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// v1.0.17 (permintaan kvlar 22 Okt 2026): foto temuan di kartu utama WO (ketuk = foto penuh), supaya petugas melihat
  /// kondisi temuan sebelum mulai. Tanpa foto = ikon status seperti sebelumnya. Lencana status kecil di pojok foto.
  Widget _fotoKartu(Map<String, dynamic> t, Color warna, Color latar, IconData ikon) {
    final id = teksWo(t['temuanId']);
    if (teksWo(petaWo(t['foto'])['TEMUAN']).isEmpty) {
      return Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(13)),
        child: Icon(ikon, color: warna, size: 22),
      );
    }
    final data = {'temuanId': id, 'slot': 'TEMUAN'};
    return Semantics(
      button: true,
      label: 'Foto temuan, ketuk untuk memperbesar',
      child: GestureDetector(
        onTap: () => unawaited(FotoServerWo.lihat(context, _muatFoto, data, 'Foto temuan')),
        child: SizedBox(
          width: 76,
          height: 76,
          child: Stack(clipBehavior: Clip.none, children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: ColoredBox(color: AppColors.neutral100, child: GambarServerWo(key: ValueKey('wo-kartu-$id'), muat: _muatFoto, data: data)),
              ),
            ),
            Positioned(
              right: -4,
              bottom: -4,
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(color: latar, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                child: Icon(ikon, color: warna, size: 14),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// v1.0.16: kartu Selesai: pita hijau (selesai + waktu) > jenis temuan + lokasi > tindak lanjut > kode realisasi.
  Widget _kartuSelesai(Map<String, dynamic> t) {
    final wo = petaWo(t['wo']);
    final kode = [
      for (final p in daftarWo(t['pekerjaanWo']))
        for (final k in teksWo(p['kodeRealisasiModul']).split(','))
          if (k.trim().isNotEmpty) k.trim(),
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: KartuHartek(
        padding: EdgeInsets.zero,
        onTap: () => unawaited(_bukaDetail(teksWo(t['temuanId']))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            decoration: const BoxDecoration(gradient: LinearGradient(colors: [AppColors.success700, Color(0xFF15803D)])),
            child: Row(children: [
              const Icon(Icons.task_alt_rounded, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              const Expanded(child: Text('SELESAI', style: TextStyle(fontSize: 12, letterSpacing: 1.2, fontWeight: FontWeight.w900, color: Colors.white))),
              if (teksWo(wo['waktuSelesai']).isNotEmpty)
                Text(waktuWo(teksWo(wo['waktuSelesai'])), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: Colors.white)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(teksWo(t['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(t['jenisTemuan']),
                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
              if (lokasiTemuanWo(t).isNotEmpty) Text(lokasiTemuanWo(t), maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.sekunder),
              if (teksWo(wo['tindakLanjut']).isNotEmpty) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.success100, borderRadius: BorderRadius.circular(12)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.handyman_rounded, size: 18, color: AppColors.success700),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(teksWo(wo['tindakLanjut']),
                          style: const TextStyle(fontSize: 14, height: 1.35, fontWeight: FontWeight.w700, color: AppColors.success700)),
                    ),
                  ]),
                ),
              ],
              if (kode.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final k in kode) _pil(k, HartekGaya.redup, AppColors.neutral100, ikon: Icons.receipt_long_rounded),
                ]),
              ],
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: Text(
                      [teksWo(t['kodeTemuan']), if (teksWo(wo['diselesaikanOleh']).isNotEmpty) 'oleh ${teksWo(wo['diselesaikanOleh'])}'].join(' · '),
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: HartekGaya.kode),
                ),
                const Icon(Icons.chevron_right_rounded, size: 18, color: HartekGaya.redup),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }

  // ---------- halaman detail ----------

  Future<void> _bukaDetail(String id) => Navigator.of(context).push<void>(MaterialPageRoute(
        builder: (_) => ListenableBuilder(
          listenable: _store,
          builder: (ctx, _) {
            final t = _cari(id);
            return Scaffold(
              backgroundColor: HartekGaya.latar,
              body: SafeArea(
                child: t == null
                    ? ListView(padding: const EdgeInsets.all(16), children: [
                        HeaderInsJar(
                            kicker: 'WO Tindak Lanjut', judul: 'WO tidak ada', ikon: Icons.inbox_outlined,
                            aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(ctx))]),
                        const KosongHartek(ikon: Icons.inbox_outlined, judul: 'WO sudah tidak ada', petunjuk: 'WO ini sudah dihapus dari HP atau dipindah admin.'),
                      ])
                    : _isiDetail(ctx, t),
              ),
            );
          },
        ),
      ));

  Widget _isiDetail(BuildContext ctx, Map<String, dynamic> t) {
    final (warna, latar, ikon) = _gaya(t);
    final wo = petaWo(t['wo']);
    final pekerjaan = daftarWo(t['pekerjaanWo']);
    final aksi = _aksiUtama(t, padat: false);
    final keadaan = _kartuKeadaan(t);
    final waktu = [
      if (teksWo(wo['waktuDiteruskan']).isNotEmpty) ('Diteruskan', waktuWo(teksWo(wo['waktuDiteruskan'])), teksWo(wo['diteruskanOleh'])),
      if (teksWo(wo['waktuMulai']).isNotEmpty) ('Dimulai', waktuWo(teksWo(wo['waktuMulai'])), teksWo(wo['dimulaiOleh'])),
      if (t['_lokalMulai'] == true) ('Dimulai', 'di HP', 'menunggu kirim'),
      if (teksWo(wo['waktuSelesai']).isNotEmpty) ('Selesai', waktuWo(teksWo(wo['waktuSelesai'])), teksWo(wo['diselesaikanOleh'])),
    ];
    return Column(children: [
      Expanded(
        child: HalamanHeaderTetap(
          // v1.0.28: header tetap, isi bergulir
          header: HeaderInsJar(
                kicker: _yandal ? 'TO P0' : 'WO Tindak Lanjut',
                judul: teksWo(t['jenisTemuan']).isEmpty ? 'Temuan' : teksWo(t['jenisTemuan']),
                sub: teksWo(t['kodeTemuan']),
                ikon: ikon,
                aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(ctx))],
              ),
          isi: RefreshSisi(
          onRefresh: _segarkan,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              KartuHartek(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    _pil(statusTampilWo(t), warna, latar),
                    const Spacer(),
                    Text(teksWo(t['objekInspeksi']).isEmpty ? '' : 'Objek ${teksWo(t['objekInspeksi'])}', style: HartekGaya.sekunder),
                  ]),
                  const SizedBox(height: 10),
                  Text(lokasiTemuanWo(t).isEmpty ? '-' : lokasiTemuanWo(t),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                  if (teksWo(t['koordinat']).isNotEmpty) Text(teksWo(t['koordinat']), style: HartekGaya.kode),
                  const SizedBox(height: 10),
                  _tombolNavigasi(t, lebar: true),
                  if (teksWo(t['deskripsi']).isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(teksWo(t['deskripsi']), style: HartekGaya.sekunder),
                  ],
                  if (teksWo(wo['catatanAdmin']).isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 10),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(12)),
                      child: Text('Catatan admin: ${teksWo(wo['catatanAdmin'])}',
                          style: const TextStyle(fontSize: 13, color: HartekGaya.tinta, fontWeight: FontWeight.w600)),
                    ),
                  if (keadaan != null) keadaan,
                  FotoTemuanWo(t: t, muat: _muatFoto),
                  if (waktu.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    for (final w in waktu)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(children: [
                          SizedBox(width: 82, child: Text(w.$1, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup))),
                          Expanded(
                            child: Text('${w.$2}${w.$3.isEmpty ? '' : ' · ${w.$3}'}',
                                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
                          ),
                        ]),
                      ),
                  ],
                ]),
              ),
              if (statusWoDari(t) == StatusWo.selesai && teksWo(wo['tindakLanjut']).isNotEmpty) ...[
                const SizedBox(height: 12),
                _kotak(AppColors.success700, AppColors.success100, Icons.handyman_rounded, 'Tindak lanjut', teksWo(wo['tindakLanjut'])),
              ],
              const SizedBox(height: 16),
              Row(children: [
                Expanded(child: Text('Pekerjaan (${pekerjaan.length})', style: HartekGaya.judulSeksi)),
                if (_bisaKerja(t))
                  TextButton.icon(onPressed: () => unawaited(_tambahPekerjaan(t)), icon: const Icon(Icons.add_rounded), label: const Text('Tambah')),
              ]),
              if (pekerjaan.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: KosongHartek(ikon: Icons.handyman_outlined, judul: 'Belum ada pekerjaan', petunjuk: 'Mulai kerjakan, lalu tambah pekerjaan dan fotonya.'),
                ),
              for (final p in pekerjaan) _blokPekerjaan(t, p),
            ],
          ),
        ),
        ),
      ),
      if (aksi != null)
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: HartekGaya.garis))),
          child: SafeArea(top: false, child: aksi),
        ),
    ]);
  }

  /// v1.0.26 (permintaan kvlar 23 Okt 2026): kartu rincian pekerjaan baru. Kepala bertint merek (judul, kode, status,
  /// Ubah / Hapus), tiap pekerjaan Hartek blok beraksen merek dengan material beraksen kuning di dalamnya, info lokasi /
  /// catatan, lalu foto.
  Widget _blokPekerjaan(Map<String, dynamic> t, Map<String, dynamic> p) {
    final draft = teksWo(p['status']) == 'DRAFT';
    final bisa = _bisaKerja(t) && draft;
    final jml = num.tryParse(teksWo(p['jumlah']));
    final rinci = petaWo(p['rincian']);
    final pkR = daftarWo(rinci['pekerjaan']), mtR = materialPerPekerjaanWo(rinci); // v1.0.17: material per pekerjaan
    final chip = [
      if (p['diameter'] != null && teksWo(p['diameter']).isNotEmpty) ('Ø ${p['diameter']} cm', Icons.straighten_rounded),
      if (jml != null && _jenisTim != 'HARTEK') ('${angkaHartek(jml)} ${teksWo(p['satuan'])}'.trim(), Icons.tag_rounded),
      if (teksWo(p['section']).isNotEmpty) (teksWo(p['section']), Icons.route_rounded),
      if (teksWo(p['nomorTiang']).isNotEmpty) ('Tiang ${teksWo(p['nomorTiang'])}', Icons.cell_tower_rounded),
    ];
    final kurang = draft ? fotoKurangWo(p, _slotWajib).length : 0;
    final sinkron = teksWo(p[HartekLokal.sinkron]);
    final gagal = sinkron == HartekLokal.gagal;
    final judul = pkR.length > 1
        ? '${pkR.length} pekerjaan'
        : [teksWo(p['pekerjaan']), if (teksWo(p['pekerjaanLainnya']).isNotEmpty) '(${teksWo(p['pekerjaanLainnya'])})'].join(' ');
    Widget info(IconData ikon, String teks) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ikon, size: 16, color: HartekGaya.redup),
            const SizedBox(width: 6),
            Expanded(child: Text(teks, style: const TextStyle(fontSize: 12.5, height: 1.35, color: HartekGaya.tinta))),
          ]),
        );
    return Container(
      margin: const EdgeInsets.only(top: 12),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: gagal ? AppColors.red600 : HartekGaya.garis, width: gagal ? 1.4 : 1),
        boxShadow: [BoxShadow(color: AppColors.brand950.withValues(alpha: .06), blurRadius: 14, offset: const Offset(0, 5))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // kepala
        Container(
          color: HartekGaya.merek.withValues(alpha: .07),
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Row(children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: HartekGaya.merek, borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.handyman_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(judul.trim().isEmpty ? 'Pekerjaan' : judul,
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: HartekGaya.tinta)),
                Text(
                  [
                    if (teksWo(p['kodeTl']).isNotEmpty) teksWo(p['kodeTl']),
                    if (!draft && teksWo(p['kodeRealisasiModul']).isNotEmpty) '→ ${teksWo(p['kodeRealisasiModul'])}',
                  ].join('  '),
                  style: HartekGaya.kode,
                ),
              ]),
            ),
            if (gagal)
              IconButton(tooltip: 'Kirim ulang', onPressed: () => unawaited(_cobaUlang(t)), icon: const Icon(Icons.refresh_rounded, color: AppColors.red700)),
            if (_bisaUbah(t, p))
              IconButton(
                tooltip: 'Ubah pekerjaan',
                onPressed: () => unawaited(_ubahPekerjaan(t, p)),
                icon: const Icon(Icons.edit_outlined, color: HartekGaya.merek),
              ),
            if (bisa)
              IconButton(
                tooltip: 'Hapus pekerjaan',
                onPressed: () => unawaited(_hapusPekerjaan(t, p)),
                icon: const Icon(Icons.delete_outline_rounded, color: AppColors.red700),
              ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (sinkron == HartekLokal.lokal || gagal || kurang > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Wrap(spacing: 8, runSpacing: 6, children: [
                  if (sinkron == HartekLokal.lokal) _pil('Menunggu kirim', AppColors.accent700, AppColors.accent100, ikon: Icons.schedule_rounded),
                  if (gagal) _pil('Ditolak server', AppColors.red700, AppColors.red100, ikon: Icons.error_outline_rounded),
                  if (kurang > 0) _pil('$kurang foto wajib belum ada', AppColors.accent700, AppColors.accent100, ikon: Icons.add_a_photo_outlined),
                ]),
              ),
            if (gagal && teksWo(p[HartekLokal.galat]).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(teksWo(p[HartekLokal.galat]), style: const TextStyle(fontSize: 12.5, color: AppColors.red700)),
              ),
            if (chip.isNotEmpty)
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final (teks, ikon) in chip) _pil(teks, HartekGaya.merek, HartekGaya.merek.withValues(alpha: .08), ikon: ikon),
              ]),
            // v1.0.17: tiap pekerjaan diikuti material yang dipakainya
            for (var i = 0; i < pkR.length; i++) _blokRincianHartek(pkR[i], i < mtR.length ? mtR[i] : const []),
            if (teksWo(p['koordinat']).isNotEmpty) info(Icons.place_outlined, teksWo(p['koordinat'])),
            if (teksWo(p['catatan']).isNotEmpty) info(Icons.notes_rounded, teksWo(p['catatan'])),
            const SizedBox(height: 4),
            FotoRincian(
              node: p,
              slot: slotFotoWo,
              label: labelFotoWo,
              bolehTambah: bisa,
              onTap: (s) => unawaited(_ketukFoto(t, p, s)),
              gambarServer: p['_lokal'] == true && teksWo(p[HartekLokal.sinkron]).isNotEmpty
                  ? null
                  : (s) => GambarServerWo(key: ValueKey('wo-foto-${teksWo(p['tlId'])}-$s'), muat: _muatFoto, data: _dataFoto(t, p, s)),
            ),
          ]),
        ),
      ]),
    );
  }

  /// Satu pekerjaan Hartek (aksen merek) + materialnya (aksen kuning).
  Widget _blokRincianHartek(Map<String, dynamic> pk, List<Map<String, dynamic>> mt) {
    String angka(Object? v) => angkaHartek(num.tryParse(teksWo(v)) ?? 0);
    return KotakAksen(
      aksen: HartekGaya.merek,
      latar: HartekGaya.merek.withValues(alpha: .05),
      radius: 14,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(teksWo(pk['nama']), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta))),
          Text('${angka(pk['jumlah'])} ${teksWo(pk['satuan'])}'.trim(),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: HartekGaya.merek)),
        ]),
        for (final x in mt)
          KotakAksen(
            aksen: AppColors.accent700,
            latar: AppColors.accent100.withValues(alpha: .55),
            radius: 10,
            lebarAksen: 3,
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
            child: Row(children: [
              const Icon(Icons.inventory_2_outlined, size: 15, color: AppColors.accent700),
              const SizedBox(width: 6),
              Expanded(
                child: Text(teksWo(x['nama']), style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
              ),
              Text('${angka(x['jumlah'])} ${teksWo(x['satuan'])}'.trim(),
                  style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: AppColors.accent700)),
              if (teksWo(x['kepemilikan']).isNotEmpty) ...[
                const SizedBox(width: 6),
                Text('· ${teksWo(x['kepemilikan'])}', style: const TextStyle(fontSize: 11.5, color: HartekGaya.redup)),
              ],
            ]),
          ),
      ]),
    );
  }

  // ---------- halaman utama ----------

  String _teksLaporanUtama() {
    switch (_jenisTim) {
      case 'ROW':
        return 'Laporan Utama ROW hari ini belum ada di server. WO tetap bisa dikerjakan, Selesai terkirim sesudah Laporan Utama ada.';
      case 'HARTEK':
        return 'Laporan Utama Hartek hari ini belum ada di server. Buat dari tab Hartek; Selesai WO terkirim sesudahnya.';
      default:
        return 'Shift Yandal belum aktif di server. Selesai TO P0 terkirim saat shift berjalan.';
    }
  }

  Widget _kabar(Map<String, dynamic> k) => _kotak(
        AppColors.cyan600,
        AppColors.cyan100,
        Icons.notifications_active_outlined,
        teksWo(k['judul']),
        teksWo(k['isi']),
        aksi: [TextButton(onPressed: () => unawaited(_store.tutupKabar(_sesi, teksWo(k['kunci']))), child: const Text('Tutup'))],
      );

  @override
  Widget build(BuildContext context) {
    final semua = _wo;
    final n = ringkasWoTim(semua);
    final tampil = semua.where((t) => (statusWoDari(t) == StatusWo.selesai) == _selesai).toList()
      ..sort((a, b) {
        int o(Map<String, dynamic> t) => t['_konflik'] != null ? 0 : statusWoDari(t) == StatusWo.dikerjakan ? 1 : 2;
        return o(a) - o(b);
      });
    final kabar = daftarWo(_doc?['kabar']);
    final judulTab = _yandal ? 'TO P0' : 'WO Tindak Lanjut';
    return Scaffold(
      backgroundColor: Colors.transparent, // v1.0.19: latar bg-sisi
      body: SafeArea(
        bottom: false,
        child: HalamanHeaderTetap(
          // v1.0.28: header tetap, isi bergulir
          header: HeaderInsJar(
                kicker: judulTab,
                lonceng: true, // v1.0.19
                judul: _sesi.timNama.isEmpty ? 'WO tim' : _sesi.timNama,
                sub: '${n.baru} baru · ${n.dikerjakan} dikerjakan · ${n.selesai} selesai',
                ikon: Icons.assignment_turned_in_outlined,
                aksi: [tombolSegarkanHeader(_segarkan, sibuk: _muat)],
              ),
          isi: RefreshSisi(
          onRefresh: _segarkan,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
            children: [
              for (final k in kabar) _kabar(k),
              if (_galat != null)
                _kotak(AppColors.red700, AppColors.red100, Icons.error_outline_rounded, 'WO belum bisa dimuat', _galat!,
                    aksi: [TextButton(onPressed: _segarkan, child: const Text('Coba lagi'))]),
              if (_server['laporanUtamaAda'] == false && n.dikerjakan > 0)
                _kotak(AppColors.accent700, AppColors.accent100, Icons.info_outline_rounded, 'Laporan Utama belum ada', _teksLaporanUtama()),
              const SizedBox(height: 14),
              // v1.0.17: tab Aktif / Selesai baru (kartu gradasi + jumlah), sama untuk WO ROW / Hartek / Yandal
              TabStatusWo(
                selesai: _selesai,
                onPilih: (v) => setState(() => _selesai = v),
                jumlahAktif: n.baru + n.dikerjakan,
                jumlahSelesai: n.selesai,
                keteranganAktif: '${n.baru} baru · ${n.dikerjakan} dikerjakan',
              ),
              const SizedBox(height: 14),
              if (_doc == null || (_server.isEmpty && _muat))
                const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
              else if (_server.isEmpty && tampil.isEmpty)
                const KosongHartek(
                    ikon: Icons.cloud_off_outlined, judul: 'Daftar WO belum ada di HP', petunjuk: 'Butuh sinyal sekali untuk memuat WO, sesudahnya bisa dikerjakan offline.')
              else if (tampil.isEmpty)
                KosongHartek(
                  ikon: _selesai ? Icons.task_alt_rounded : Icons.inbox_outlined,
                  judul: _selesai ? 'Belum ada WO selesai' : 'Belum ada WO',
                  petunjuk: _selesai ? 'WO yang selesai tampil di sini selama 7 hari.' : 'WO dari admin (temuan inspeksi yang diteruskan ke tim ini) muncul di sini.',
                )
              else
                for (final t in tampil) _kartuRingkas(t),
            ],
          ),
        ),
        ),
      ),
    );
  }
}
