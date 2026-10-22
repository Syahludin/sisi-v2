import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/status_sinkron.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../../widgets/kartu_laporan_tim.dart';
import '../../widgets/wa_panel.dart';
import '../wo/wo_bantu.dart' show temuanTerkunciWo;
import '../hartek/foto_lapangan.dart';
import '../hartek/foto_rincian.dart';
import '../hartek/hartek_form.dart';
import '../hartek/hartek_gaya.dart';
import '../hartek/hartek_lokal.dart';
import '../hartek/hartek_rincian.dart' show IkonCloudHartek, TandaSinkronHartek;
import '../insjar/insjar_form.dart' show KartuTemuan;
import '../insjar/insjar_header.dart';
import '../row/row_model.dart' show Koordinat;
import '../row/row_repository.dart' show RowError;
import '../row/watermark.dart';
import 'insdu_bantu.dart';
import 'insdu_lokal.dart';
import 'insdu_store.dart';
import '../../widgets/sisi_loader.dart';

/// v1.0.11 (permintaan kvlar 21 Okt 2026): Inspeksi Gardu petugas INSPEKSI_GARDU (menu OPS_INSDU_INPUT).
/// Alur: Laporan Utama > gardu (db_Gardu + tier) > pengukuran LWBP + cover (gardu masuk laporan) > WBP > temuan.
/// Laporan baru diblokir selama WBP laporan sebelumnya belum lengkap (tunggakan): gardu tunggakan tampil dengan tombol
/// Isi WBP. Temuan lama gardu yang belum diperbaiki tampil sebagai "temuan tertinggal" (dibaca dari riwayat server).
/// v1.0.12: OFFLINE seperti Inspeksi Jaringan: semua isian disimpan di HP (InsDuStore) lalu dikirim otomatis di latar
/// (SyncController + layanan sinkron latar). Data yang ditolak server ditandai dengan alasan + Coba lagi / Buang.
/// v1.0.14 (kvlar 21 Okt 2026): tampilan sama dengan Inspeksi Jaringan / Hartek. Halaman di dalam tab (footer tetap):
/// utama (kartu Laporan Utama + WA + tombol +), rincian gardu (ketuk angka Gardu), temuan per jenis (ketuk angka Temuan).
enum HalamanInsDu { utama, gardu, temuan }

class InsDuScreen extends StatefulWidget {
  const InsDuScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = InsDuStore.menu;

  @override
  State<InsDuScreen> createState() => _InsDuScreenState();
}

class _InsDuScreenState extends State<InsDuScreen> {
  static const _slotFoto = InsDuLokal.slotFoto;
  static const _labelFoto = InsDuLokal.labelFoto;

  InsDuStore get _store => widget.deps.insdu;
  Sesi get _sesi => widget.sesi;

  Map<String, dynamic>? _doc;
  bool _sibuk = false, _segar = false;
  int _tanggalLain = 0;
  final Set<String> _tutup = {}; // realisasiId kartu yang diciutkan
  HalamanInsDu _halaman = HalamanInsDu.utama;
  final ScrollController _scroll = ScrollController();
  MasterInsDu? _m; // master terakhir (WA: data PHB-TR, temuan: koordinat gardu)

  bool get _akses => _sesi.petugasInsDu;
  bool get _boleh => _akses && _sesi.bisaUbah(InsDuStore.menu) && _sesi.bolehInput(DateTime.now());
  Map<String, dynamic>? get _header => _doc == null ? null : InsDuLokal.header(_doc!);
  List<Map<String, dynamic>> get _realisasi => InsDuLokal.daftar(_doc?['realisasi']);
  Map<String, dynamic>? get _tunggakan => _doc == null ? null : InsDuLokal.tunggakan(_doc!);
  String get _tanggal => teksInsDu(_doc?['tanggal']).isEmpty ? _store.tanggalIni() : teksInsDu(_doc?['tanggal']);

  @override
  void initState() {
    super.initState();
    _doc = _store.docInstan(_sesi);
    _store.addListener(_dengar);
    if (!_akses) return;
    unawaited(_bacaLokal());
    unawaited(_muatMaster());
    _kirimLatar();
  }

  @override
  void dispose() {
    _store.removeListener(_dengar);
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _muatMaster() async {
    try {
      final m = await _master();
      if (mounted) setState(() => _m = m);
    } catch (_) {/* belum ada master di HP: diunduh saat sinyal ada */}
  }

  void _ke(HalamanInsDu h) {
    setState(() => _halaman = h);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _dengar() {
    final d = _store.docInstan(_sesi);
    if (mounted && d != null && !identical(d, _doc)) setState(() => _doc = d);
    unawaited(_hitungTanggalLain());
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

  /// Buka form (layar penuh). Simpan = tulis ke HP lalu kirim di latar.
  Future<void> _form(Future<Map<String, dynamic>?> Function() buka, {String? berhasil}) async {
    if (_sibuk || !_boleh) return;
    setState(() => _sibuk = true);
    try {
      final hasil = await buka();
      if (!mounted) return;
      if (hasil != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(berhasil ?? 'Tersimpan di HP. Dikirim otomatis ke server.'), duration: const Duration(seconds: 2)));
        _kirimLatar();
      }
    } on ApiException catch (e) {
      if (mounted) _pesan(pesanInsDu(e.kode));
    } catch (_) {
      if (mounted) _pesan('Daftar gardu / jenis temuan belum ada di HP. Sambungkan internet sekali untuk mengunduhnya.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<MasterInsDu> _master() async {
    final m = MasterInsDu(await _store.master(_sesi));
    _m = m;
    return m;
  }

  Future<void> _cobaUlang(String id, {bool ubah = false}) async {
    await _store.cobaUlang(_sesi, id, ubah: ubah);
    _kirimLatar();
  }

  Future<void> _buang(String id, {bool ubah = false}) async {
    final turunan = _doc == null ? 1 : InsDuLokal.idTurunan(_doc!, id).length;
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
        content: Text('$_tanggalLain data inspeksi gardu dari hari sebelumnya tidak terkirim. Server hanya menerima laporan hari ini '
            '(WBP susulan tetap dikirim).'),
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

  /// Isian header untuk server (tanpa _akurasi_ dari tombol GPS).
  Map<String, dynamic> _bersihHeader(Map<String, String> n) => {
        for (final k in const ['koordinatAwal', 'koordinatAkhir'])
          if ((n[k] ?? '').trim().isNotEmpty) k: n[k]!.trim(),
        for (final k in const ['kmAwal', 'kmAkhir'])
          if (angkaDari(n[k]) != null) k: angkaDari(n[k]),
        if (n.containsKey('kendala')) 'kendala': n['kendala']!.trim(),
      };

  Map<String, String> _cekHeader(Map<String, String> n) {
    final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
    final e = <String, String>{};
    if (a != null && b != null && b < a) e['kmAkhir'] = 'KM akhir tidak boleh lebih kecil dari KM awal';
    final h = _header;
    for (final k in const ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir']) {
      if (h != null && teksInsDu(h[k]).isNotEmpty && (n[k] ?? '').trim().isEmpty) e[k] = 'Nilai yang sudah tersimpan tidak boleh dikosongkan';
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
        judulApp: 'Inspeksi Gardu',
        judul: 'Laporan Utama',
        keterangan: '${_sesi.timNama} · ${tanggalHartek(_tanggal)}\nSatu laporan untuk seluruh gardu yang diinspeksi hari ini.',
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
    await _form(() => bukaFormHartek(
          context,
          fokus: fokus,
          judulApp: 'Inspeksi Gardu',
          judul: 'Ubah Laporan Utama',
          keterangan: '${teksInsDu(h['kodeHeader']).isEmpty ? 'Menunggu kirim' : teksInsDu(h['kodeHeader'])} · ${tanggalHartek(_tanggal)}',
          daftar: (_) => _isianHeader(),
          awal: {for (final k in const ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir', 'kendala']) k: teksInsDu(h[k])},
          tombol: 'Simpan',
          cekTambahan: _cekHeader,
          ringkasan: _ringkasHeader,
          simpan: (n) async {
            await _store.ubahHeader(_sesi, _bersihHeader(n));
            return const {'lokal': true};
          },
        ));
  }

  // ---------- gardu ----------

  /// Isian form gardu (tambah / ubah). [garduTetap] = gardu tidak boleh diganti (sudah ada pengukuran / temuan).
  List<IsianHartek> _isianGardu(MasterInsDu m, Map<String, String> label, {bool garduTetap = false}) => [
        if (garduTetap)
          const IsianHartek('garduLabel', 'Gardu',
              bacaSaja: true, grup: 'Gardu', bantuan: 'Gardu terkunci karena sudah ada pengukuran / temuan. Tier masih bisa diubah.')
        else
          IsianHartek('garduId', 'Gardu',
              wajib: true,
              grup: 'Gardu',
              pilihan: label.keys.toList(),
              labelPilihan: (id) => label[id] ?? id,
              isiLain: (id) {
                final g = m.garduDari(id);
                return {
                  'penyulang': g?.penyulang ?? '',
                  'section': g?.section ?? '',
                  'kapasitas': g?.kapasitasKva == null ? '' : '${angkaInsDuTampil(g!.kapasitasKva)} kVA',
                  'merk': g?.merk ?? '',
                };
              },
              turunan: const ['penyulang', 'section', 'kapasitas', 'merk'],
              bantuan: 'Gardu AKTIF di Master Gardu. Ketik nomor atau alamat untuk mencari.'),
        const IsianHartek('penyulang', 'Penyulang', bacaSaja: true, baris: 'lokasi'),
        const IsianHartek('section', 'Section', bacaSaja: true, baris: 'lokasi'),
        const IsianHartek('kapasitas', 'Kapasitas', bacaSaja: true, baris: 'trafo'),
        const IsianHartek('merk', 'Merk trafo', bacaSaja: true, baris: 'trafo'),
        // v1.0.15: checklist Tier 1 / Tier 2 (centang keduanya = 'Tier 1 & Tier 2'), tanpa keterangan "Pilih"
        IsianHartek('tier', 'Tier inspeksi',
            wajib: true, grup: 'Inspeksi', segmen: true, pilihBanyak: true, pilihan: [for (final t in m.tierGardu) if (!t.contains('&')) t]),
      ];

  Map<String, String> _awalGardu(MasterInsDu m, String garduId, String tier) {
    final g = m.garduDari(garduId);
    return {
      'garduId': garduId,
      'tier': tier,
      'penyulang': g?.penyulang ?? '',
      'section': g?.section ?? '',
      'kapasitas': g?.kapasitasKva == null ? '' : '${angkaInsDuTampil(g!.kapasitasKva)} kVA',
      'merk': g?.merk ?? '',
    };
  }

  Future<void> _tambahGardu() => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        final pilihan = garduBelumDipakai(m, _realisasi);
        if (pilihan.isEmpty) {
          _pesan(m.gardu.isEmpty ? 'Belum ada gardu AKTIF di Master Gardu.' : 'Semua gardu aktif sudah ada di laporan hari ini.');
          return null;
        }
        final label = {for (final g in pilihan) g.garduId: g.label};
        return bukaFormHartek(
          context,
          judulApp: 'Inspeksi Gardu',
          judul: 'Gardu yang diinspeksi',
          keterangan: '${_sesi.timNama} · ${tanggalHartek(_tanggal)}',
          tombol: 'Tambah gardu',
          daftar: (_) => _isianGardu(m, label),
          simpan: (n) async {
            final g = m.garduDari((n['garduId'] ?? '').trim());
            if (g == null) throw ApiException('GARDU_TIDAK_DIKENAL', kolom: 'garduId');
            await _store.tambahGardu(_sesi, g.garduId, (n['tier'] ?? '').trim(), tampilGarduInsDu(g));
            return const {'lokal': true};
          },
        );
      }, berhasil: 'Gardu tersimpan di HP.');

  /// v1.0.14: ubah gardu / tier gardu yang sudah diinput.
  Future<void> _ubahGardu(Map<String, dynamic> r) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        final id = teksInsDu(r['realisasiId']);
        final garduId = teksInsDu(r['garduId']);
        final pk = petaInsDu(r['pengukuran']);
        final tetap = InsDuLokal.daftar(r['temuan']).isNotEmpty || pk?['lwbp'] != null || pk?['wbp'] != null;
        final label = {
          for (final g in garduBelumDipakai(m, _realisasi)) g.garduId: g.label,
          garduId: m.garduDari(garduId)?.label ?? 'Gardu ${teksInsDu(r['noGardu'])}',
        };
        return bukaFormHartek(
          context,
          judulApp: 'Inspeksi Gardu',
          judul: 'Ubah gardu ${teksInsDu(r['noGardu'])}',
          keterangan: teksInsDu(r['kodeRealisasi']).isEmpty ? 'Menunggu kirim' : teksInsDu(r['kodeRealisasi']),
          tombol: 'Simpan perubahan',
          awal: {..._awalGardu(m, garduId, teksInsDu(r['tier'])), 'garduLabel': label[garduId] ?? teksInsDu(r['noGardu'])},
          daftar: (_) => _isianGardu(m, label, garduTetap: tetap),
          simpan: (n) async {
            final g = tetap ? null : m.garduDari((n['garduId'] ?? '').trim());
            await _store.ubahGardu(_sesi, id, (n['tier'] ?? '').trim(), g: g);
            return const {'lokal': true};
          },
        );
      });

  // ---------- pengukuran ----------

  List<IsianHartek> _isianUkur(String periode, Map<String, List<String>> cover) {
    IsianHartek nilai((String, String, String) n, String grup, String baris) => IsianHartek(n.$1, n.$2,
        wajib: true,
        angka: true,
        max: n.$3 == 'A' ? bebanMaksInsDu : teganganMaksInsDu,
        akhiran: n.$3,
        grup: grup.isEmpty ? null : grup,
        baris: baris);
    return [
      for (var i = 0; i < 3; i++) nilai(nilaiUkurInsDu[i], i == 0 ? 'Tegangan fasa-fasa' : '', 'vff'),
      for (var i = 3; i < 6; i++) nilai(nilaiUkurInsDu[i], i == 3 ? 'Tegangan fasa-netral' : '', 'vfn'),
      for (var i = 6; i < 8; i++) nilai(nilaiUkurInsDu[i], i == 6 ? 'Beban' : '', 'a1'),
      for (var i = 8; i < 10; i++) nilai(nilaiUkurInsDu[i], '', 'a2'),
      if (periode == 'LWBP')
        for (final e in labelCoverInsDu.entries)
          IsianHartek(e.key, e.value,
              wajib: true,
              segmen: true,
              centang: true, // v1.0.15: checklist, bukan ikon peralatan
              grup: e.key == 'coverFcoAtas' ? 'Hasil inspeksi cover' : null,
              pilihan: cover[e.key] ??
                  (e.key.startsWith('jumperan') ? const ['A3C', 'A3CS', 'Protective Sleeve'] : const ['Lengkap', 'Belum Lengkap', 'Tidak Ada'])),
      const IsianHartek('catatan', 'Catatan', multi: true, maks: 300, grup: 'Catatan', bantuan: 'Opsional, maksimal 5 baris.'),
    ];
  }

  Future<void> _ukur(Map<String, dynamic> r, String periode, {bool susulan = false}) => _form(() async {
        Map<String, List<String>> cover = const {};
        if (periode == 'LWBP') {
          try {
            cover = (await _master()).cover;
          } catch (_) {/* pilihan cover bawaan */}
        }
        if (!mounted) return null;
        final p = petaInsDu(r['pengukuran']);
        final ada = petaInsDu(p?[periode.toLowerCase()]);
        final kap = angkaInsDu(r['kapasitasKva']);
        final awal = <String, String>{
          if (ada != null)
            for (final n in nilaiUkurInsDu)
              if (ada[n.$1] != null) n.$1: angkaInsDuTampil(angkaInsDu(ada[n.$1])),
          if (periode == 'LWBP' && p != null)
            for (final k in labelCoverInsDu.keys)
              if (teksInsDu(petaInsDu(p['cover'])?[k]).isNotEmpty) k: teksInsDu(petaInsDu(p['cover'])?[k]),
          if (p != null && teksInsDu(p['catatan']).isNotEmpty) 'catatan': teksInsDu(p['catatan']),
        };
        return bukaFormHartek(
          context,
          judulApp: 'Inspeksi Gardu',
          judul: 'Pengukuran $periode${susulan ? ' (susulan)' : ''}',
          keterangan: 'Gardu ${teksInsDu(r['noGardu'])}${kap == null ? '' : ' · ${angkaInsDuTampil(kap)} kVA'}\n'
              '${periode == 'LWBP' ? 'Luar waktu beban puncak. Wajib bersama hasil inspeksi cover.' : 'Waktu beban puncak (malam).'}',
          daftar: (_) => _isianUkur(periode, cover),
          awal: awal,
          tombol: ada == null ? 'Simpan $periode' : 'Simpan perubahan',
          // v1.0.15: tanpa ringkasan beban / ketidakseimbangan di form LWBP / WBP (hasil tetap tampil di kartu gardu)
          simpan: (n) async {
            await _store.simpanUkur(
              _sesi,
              teksInsDu(r['realisasiId']),
              periode,
              {for (final x in nilaiUkurInsDu) x.$1: angkaDari(n[x.$1]) ?? 0},
              cover: periode == 'LWBP' ? {for (final k in labelCoverInsDu.keys) k: (n[k] ?? '').trim()} : const {},
              catatan: (n['catatan'] ?? '').trim(),
            );
            return const {'lokal': true};
          },
        );
      });

  // ---------- temuan ----------

  DataWatermark _watermark(Map<String, dynamic> r, Map<String, String> n, String slot) {
    final koor = (n['koordinat'] ?? '').trim();
    final jenis = (n['jenisTemuan'] ?? '').trim();
    return DataWatermark(
      kodeEksekusi: teksInsDu(r['kodeRealisasi']).isEmpty ? 'Inspeksi Gardu ${teksInsDu(r['noGardu'])}' : teksInsDu(r['kodeRealisasi']),
      ulp: _sesi.ulp,
      tim: _sesi.timNama,
      subTim: _sesi.nama,
      penyulang: teksInsDu(r['penyulang']),
      section: 'Gardu ${teksInsDu(r['noGardu'])}',
      waktu: DateTime.now(),
      koordinat: koor.isEmpty || Koordinat.cek(koor) != null ? null : koor,
      diameter: null,
      jenis: jenis.isEmpty ? 'Inspeksi Gardu' : jenis,
      slot: _labelFoto[slot] ?? slot,
      labelKode: 'Kode Inspeksi',
      labelSubTim: 'Akun',
      tampilDiameter: false,
    );
  }

  /// v1.0.14: tier temuan dari tier gardu (satu tier = otomatis, dua tier = pilih). Koordinat wajib, awalnya
  /// koordinat gardu di Master Gardu; petugas boleh ambil GPS baru.
  List<IsianHartek> _isianTemuan(Map<String, dynamic> r, MasterInsDu m, {bool denganFoto = true}) {
    final tiers = tierDaftarInsDu(r['tier']);
    return [
      if (tiers.length == 1)
        const IsianHartek('tierInspeksi', 'Tier inspeksi', bacaSaja: true, grup: 'Temuan')
      else
        IsianHartek('tierInspeksi', 'Tier inspeksi',
            wajib: true, grup: 'Temuan', segmen: true, centang: true, pilihan: tiers.isEmpty ? m.tier : tiers, turunan: const ['jenisTemuan']),
      IsianHartek('jenisTemuan', 'Jenis temuan',
          wajib: true,
          pilihanDari: (n) => m.jenisUntuk(n['tierInspeksi']),
          bantuan: m.jenisTemuan.isEmpty ? 'Belum ada jenis temuan object Gardu aktif di db_Jenis_Temuan.' : null),
      const IsianHartek('deskripsi', 'Deskripsi', multi: true, maks: 500, bantuan: 'Opsional, maksimal 5 baris.'),
      const IsianHartek('koordinat', 'Koordinat temuan',
          wajib: true,
          koordinat: true,
          grup: 'Lokasi',
          contoh: '-3.012345, 106.512345',
          bantuan: 'Terisi dari koordinat gardu (Master Gardu). Ambil GPS baru kalau lokasi temuan berbeda.'),
      if (denganFoto)
        for (final s in _slotFoto)
          IsianHartek('foto_$s', _labelFoto[s]!,
              wajib: true,
              grup: s == 'TEMUAN' ? 'Foto' : null,
              baris: 'foto',
              ambilFoto: (ctx, nilai, ada) => FotoLapangan.ambil(ctx,
                  label: _labelFoto[s]!, pratinjau: _watermark(r, nilai, s), folder: 'insdu', pathAda: ada, bolehGaleri: true)),
    ];
  }

  /// Isian awal temuan baru: tier (gardu satu tier) + koordinat gardu.
  Map<String, String> _awalTemuan(Map<String, dynamic> r, MasterInsDu m) {
    final tiers = tierDaftarInsDu(r['tier']);
    final koor = m.garduDari(teksInsDu(r['garduId']))?.koordinat ?? '';
    return {
      if (tiers.length == 1) 'tierInspeksi': tiers.first,
      if (koor.isNotEmpty) 'koordinat': koor,
    };
  }

  /// Isian temuan: data kirim server (isian lengkap) + data tampil di HP.
  ({Map<String, dynamic> data, Map<String, dynamic> tampil}) _pisahTemuan(Map<String, String> n, MasterInsDu m) {
    String v(String k) => (n[k] ?? '').trim();
    final id = m.jenisTemuan[v('jenisTemuan')] ?? '';
    return (
      data: {
        'jenisTemuanId': id,
        if (v('tierInspeksi').isNotEmpty) 'tierInspeksi': v('tierInspeksi'),
        if (v('deskripsi').isNotEmpty) 'deskripsi': v('deskripsi'),
        if (v('koordinat').isNotEmpty) 'koordinat': v('koordinat'),
      },
      tampil: {
        'tierInspeksi': v('tierInspeksi'),
        'jenisTemuan': v('jenisTemuan'),
        'jenisTemuanId': id,
        'deskripsi': v('deskripsi'),
        'koordinat': v('koordinat'),
      },
    );
  }

  Future<void> _tambahTemuan(Map<String, dynamic> r) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        return bukaFormHartek(
          context,
          judulApp: 'Inspeksi Gardu',
          judul: 'Temuan gardu ${teksInsDu(r['noGardu'])}',
          keterangan: [teksInsDu(r['kodeRealisasi']), teksInsDu(r['penyulang'])].where((x) => x.isNotEmpty).join(' · '),
          tombol: 'Simpan temuan',
          awal: _awalTemuan(r, m),
          daftar: (_) => _isianTemuan(r, m),
          simpan: (n) async {
            final p = _pisahTemuan(n, m);
            await _store.tambahTemuan(
              _sesi,
              teksInsDu(r['realisasiId']),
              p.data,
              {
                ...p.tampil,
                'objekInspeksi': 'Gardu',
                'penyulang': teksInsDu(r['penyulang']),
                'section': teksInsDu(r['section']),
                'noGardu': teksInsDu(r['noGardu']),
                'garduId': teksInsDu(r['garduId']),
                'status': 'Penugasan Tim',
                'sumber': 'INSPEKSI',
              },
              foto: {
                for (final s in _slotFoto)
                  if ((n['foto_$s'] ?? '').trim().isNotEmpty) s: n['foto_$s']!.trim(),
              },
            );
            return const {'lokal': true};
          },
        );
      });

  Future<void> _ubahTemuan(Map<String, dynamic> r, Map<String, dynamic> t) => _form(() async {
        final m = await _master();
        if (!mounted) return null;
        return bukaFormHartek(
          context,
          judulApp: 'Inspeksi Gardu',
          judul: 'Ubah temuan',
          keterangan: teksInsDu(t['kodeTemuan']).isEmpty ? 'Menunggu kirim' : teksInsDu(t['kodeTemuan']),
          tombol: 'Simpan perubahan',
          awal: {
            ..._awalTemuan(r, m),
            for (final k in const ['tierInspeksi', 'jenisTemuan', 'deskripsi', 'koordinat'])
              if (teksInsDu(t[k]).isNotEmpty) k: teksInsDu(t[k]),
          },
          daftar: (_) => _isianTemuan(r, m, denganFoto: false),
          simpan: (n) async {
            final p = _pisahTemuan(n, m);
            await _store.ubahTemuan(_sesi, teksInsDu(t['temuanId']), p.data, p.tampil);
            return const {'lokal': true};
          },
        );
      });

  Future<void> _ketukFoto(Map<String, dynamic> r, Map<String, dynamic> t, String slot) async {
    final id = teksInsDu(t['temuanId']);
    final label = _labelFoto[slot] ?? slot;
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
    if (teksInsDu(HartekLokal.fotoDiServer(t)[slot]).isNotEmpty) {
      _pesan('Foto sudah tersimpan di Drive.');
      return;
    }
    if (!_boleh || _sibuk) return;
    try {
      final nilai = <String, String>{for (final e in t.entries) if (e.value is String) e.key: e.value as String};
      final baru = await FotoLapangan.ambil(context,
          label: label, pratinjau: _watermark(r, nilai, slot), folder: 'insdu', bolehGaleri: true);
      if (baru == null || !mounted) return;
      await _store.tambahFoto(_sesi, id, slot, baru);
      _kirimLatar();
    } on RowError catch (e) {
      if (mounted) _pesan(e.pesan);
    } on ApiException catch (e) {
      if (mounted) _pesan(pesanInsDu(e.kode));
    }
  }

  Future<void> _aksiUkur(Map<String, dynamic> r, String periode) async {
    final id = teksInsDu(r['realisasiId']);
    final status = r[InsDuLokal.kunciUkur(periode)];
    if (status != InsDuLokal.gagal) {
      await _ukur(r, periode, susulan: InsDuLokal.garduTunggakan(_doc ?? const {}, id));
      return;
    }
    final pilih = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('$periode ditolak'),
        content: Text(teksInsDu(r[InsDuLokal.kunciGalatUkur(periode)]).isEmpty ? 'Pengukuran ditolak server.' : teksInsDu(r[InsDuLokal.kunciGalatUkur(periode)])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, 'BUANG'), child: const Text('Buang')),
          TextButton(onPressed: () => Navigator.pop(c, 'UBAH'), child: const Text('Perbaiki')),
          FilledButton(onPressed: () => Navigator.pop(c, 'ULANG'), child: const Text('Coba lagi')),
        ],
      ),
    );
    if (!mounted || pilih == null) return;
    if (pilih == 'ULANG') {
      await _store.cobaUlangUkur(_sesi, id, periode);
      _kirimLatar();
    } else if (pilih == 'BUANG') {
      await _store.buangUkur(_sesi, id, periode);
    } else {
      await _ukur(r, periode, susulan: InsDuLokal.garduTunggakan(_doc ?? const {}, id));
    }
  }

  // ---------- tampilan ----------

  Widget _tombolUtama(String label, VoidCallback? aksi, {IconData ikon = Icons.add_rounded}) => Padding(
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

  Widget _kotakInfo(IconData ikon, String teks, Color warna, Color latar, {Widget? bawah}) => Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ikon, color: warna, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(teks, style: TextStyle(fontSize: 13.5, height: 1.4, fontWeight: FontWeight.w600, color: warna))),
          ]),
          if (bawah != null) bawah,
        ]),
      );

  /// v1.0.17 (sinkron atomik): hijau hanya sesudah laporan disegel server (ringkasan = rincian = WA).
  Widget _statusKirim() {
    final n = InsDuLokal.hitung(_doc);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: KartuStatusSinkron(
        tahap: _store.tahapSinkronLaporan(widget.sesi, _doc),
        menunggu: n.menunggu,
        gagal: n.gagal,
        keteranganTolak: 'Lihat tanda merah di kartu untuk alasannya.',
        onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()),
      ),
    );
  }

  Widget _langkah(int n, String judul, String sub) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: AppColors.brand100, shape: BoxShape.circle),
            child: Text('$n', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.merek)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(judul, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
              const SizedBox(height: 2),
              Text(sub, style: HartekGaya.sekunder),
            ]),
          ),
        ]),
      );

  /// Tunggakan laporan sebelumnya. v1.0.16 (kvlar 22 Okt 2026): satu kartu per gardu yang pengukurannya belum
  /// lengkap (LWBP dan / atau WBP), dengan 2 pilihan: isi LWBP + WBP susulan (masuk realisasi tanggal laporan itu)
  /// atau hapus gardu itu dari laporan. Gardu yang sudah lengkap di HP tampil "menunggu kirim".
  Widget _blokTunggakan(Map<String, dynamic> t) {
    final terbuka = _doc == null ? const <Map<String, dynamic>>[] : InsDuLokal.tunggakanTerbuka(_doc!);
    final semua = InsDuLokal.daftar(t['realisasi']);
    if (semua.isEmpty) return const SizedBox.shrink();
    final selesaiHp = terbuka.isEmpty;
    return _kotakInfo(
      selesaiHp ? Icons.task_alt_rounded : Icons.event_repeat_rounded,
      selesaiHp
          ? 'Pengukuran tunggakan laporan ${teksInsDu(t['kodeHeader'])} sudah diisi. Laporan baru boleh dibuat.'
          : teksTunggakanInsDu({...t, 'realisasi': terbuka}),
      selesaiHp ? AppColors.success700 : AppColors.red700,
      selesaiHp ? AppColors.success100 : AppColors.red100,
      bawah: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final r in semua) _kartuTunggakan(t, r),
      ]),
    );
  }

  /// Satu gardu tunggakan: status LWBP / WBP + tombol Isi susulan / Hapus gardu.
  Widget _kartuTunggakan(Map<String, dynamic> t, Map<String, dynamic> r) {
    final periode = periodeSusulanInsDu(r);
    final tanda = [for (final p in InsDuLokal.periode) r[InsDuLokal.kunciUkur(p)]];
    final gagal = tanda.contains(InsDuLokal.gagal);
    final kirim = !gagal && tanda.contains(InsDuLokal.lokal);
    final bisa = !_sibuk && _boleh;
    Widget petak(String p) {
      final ada = petaInsDu(petaInsDu(r['pengukuran'])?[p.toLowerCase()]) != null;
      return Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(color: ada ? AppColors.success100 : AppColors.neutral100, borderRadius: BorderRadius.circular(10)),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(ada ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                size: 16, color: ada ? AppColors.success700 : AppColors.neutral500),
            const SizedBox(width: 6),
            Text(p, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: ada ? AppColors.success700 : AppColors.neutral700)),
          ]),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Icon(Icons.electrical_services_rounded, size: 20, color: HartekGaya.merek),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Gardu ${teksInsDu(r['noGardu'])}',
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
              Text(
                  [teksInsDu(t['tanggal']), teksInsDu(r['penyulang']), teksInsDu(r['tier'])].where((x) => x.isNotEmpty).join(' · '),
                  style: HartekGaya.sekunder),
            ]),
          ),
          if (gagal)
            const Icon(Icons.error_outline_rounded, color: AppColors.red700)
          else if (kirim)
            const Icon(Icons.cloud_upload_outlined, color: AppColors.accent700),
        ]),
        const SizedBox(height: 10),
        Row(children: [petak('LWBP'), const SizedBox(width: 8), petak('WBP')]),
        if (periode != null) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: bisa ? () => unawaited(_hapusTunggakan(r)) : null,
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.red700, minimumSize: const Size.fromHeight(44)),
                icon: const Icon(Icons.delete_outline_rounded, size: 18),
                label: const Text('Hapus gardu'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: FilledButton.icon(
                onPressed: bisa ? () => unawaited(_aksiUkur(r, periode)) : null,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
                icon: Icon(periode == 'LWBP' ? Icons.wb_sunny_outlined : Icons.nightlight_outlined, size: 18),
                label: Text('Isi $periode susulan'),
              ),
            ),
          ]),
        ] else if (gagal)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: bisa ? () => unawaited(_aksiUkur(r, r[InsDuLokal.kunciUkur('LWBP')] == InsDuLokal.gagal ? 'LWBP' : 'WBP')) : null,
              child: const Text('Lihat galat'),
            ),
          ),
      ]),
    );
  }

  Future<void> _hapusTunggakan(Map<String, dynamic> r) async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Hapus gardu ${teksInsDu(r['noGardu'])}?'),
        content: const Text('Gardu ini dihapus dari realisasi laporan sebelumnya dan tidak dihitung di laporan. '
            'Pengukuran yang belum terkirim untuk gardu ini ikut dibuang. Butuh sinyal.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.red700),
              onPressed: () => Navigator.pop(c, true),
              child: const Text('Hapus')),
        ],
      ),
    );
    if (ya != true || !mounted) return;
    setState(() => _sibuk = true);
    try {
      await _store.hapusTunggakan(_sesi, teksInsDu(r['realisasiId']));
      if (mounted) _pesan('Gardu ${teksInsDu(r['noGardu'])} dihapus dari laporan sebelumnya.');
    } on ApiException catch (e) {
      if (mounted) _pesan(e.kode.startsWith('HTTP_') || e.kode == 'TIMEOUT' ? 'Butuh sinyal untuk menghapus gardu.' : pesanInsDu(e.kode));
    } catch (_) {
      if (mounted) _pesan('Butuh sinyal untuk menghapus gardu.');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  List<Widget> _halamanAwal() {
    final tunggak = _tunggakan;
    final blok = _doc != null && InsDuLokal.tunggakanTerbuka(_doc!).isNotEmpty;
    return [
      if (tunggak != null) _blokTunggakan(tunggak),
      KartuHartek(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 2),
        child: Column(children: [
          _langkah(1, 'Laporan Utama', 'KM dan koordinat awal perjalanan.'),
          _langkah(2, 'Gardu + tier', 'Pilih gardu dan tier (Tier 1, Tier 2, atau keduanya). Tier 1 = ukur LWBP + cover, lalu WBP malam.'),
          _langkah(3, 'Temuan', 'Dicatat di kartu gardu, koordinat terisi dari Master Gardu, foto temuan + gardu.'),
        ]),
      ),
      const SizedBox(height: 10),
      const Text('Bisa tanpa sinyal: data tersimpan di HP dan terkirim otomatis.', textAlign: TextAlign.center, style: HartekGaya.sekunder),
      const SizedBox(height: 10),
      _tombolUtama(blok ? 'Lengkapi tunggakan dulu' : 'Buat Laporan Utama', blok ? null : _buatHeader, ikon: Icons.arrow_forward_rounded),
    ];
  }

  // ---------- WA ----------

  Future<void> _kirimWa() async {
    final h = _header;
    if (h == null) return;
    final belumUkur = [
      for (final r in _realisasi)
        if (r['masukLaporan'] != true) teksInsDu(r['noGardu']),
    ];
    final fotoKurang = [
      for (final r in _realisasi)
        for (final t in InsDuLokal.daftar(r['temuan']))
          if (HartekLokal.fotoKurang(InsDuLokal.slotFoto, t).isNotEmpty) t,
    ].length;
    final kurang = <String>[
      if (teksInsDu(h['koordinatAwal']).isEmpty) 'Koordinat awal',
      if (angkaInsDu(h['kmAwal']) == null) 'KM awal',
      if (teksInsDu(h['koordinatAkhir']).isEmpty) 'Koordinat akhir',
      if (angkaInsDu(h['kmAkhir']) == null) 'KM akhir',
      if (_realisasi.isEmpty) 'Gardu (minimal 1 gardu)',
      if (belumUkur.isNotEmpty) 'Pengukuran LWBP gardu ${belumUkur.join(', ')}',
      if (fotoKurang > 0) 'Foto temuan / gardu ($fotoKurang temuan belum lengkap)',
    ];
    if (kurang.isNotEmpty) {
      String? fokus;
      for (final k in const ['koordinatAwal', 'kmAwal', 'koordinatAkhir', 'kmAkhir']) {
        if (teksInsDu(h[k]).isEmpty) {
          fokus = k;
          break;
        }
      }
      await tampilkanWaBelumSiap(context,
          kurang: kurang,
          onLengkapi: !_boleh || _sibuk
              ? null
              : () {
                  if (fokus != null) {
                    unawaited(_ubahHeader(fokus: fokus));
                  } else if (_realisasi.isEmpty) {
                    unawaited(_tambahGardu());
                  } else {
                    _ke(HalamanInsDu.gardu);
                  }
                });
      return;
    }
    // v1.0.17 (sinkron atomik): WA hanya sesudah semua data laporan diterima + divalidasi server
    final n = InsDuLokal.hitung(_doc);
    if (!await pastikanTersinkron(context, _store.tahapSinkronLaporan(widget.sesi, _doc),
        menunggu: n.menunggu, gagal: n.gagal, onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()))) {
      return;
    }
    if (!mounted) return;
    final m = _m;
    await tampilkanWa(context,
        judul: 'Kirim laporan Inspeksi Gardu ke WA',
        teks: waTeksInsDu(
          tanggalTampil: tanggalHartek(_tanggal),
          header: h,
          realisasi: _realisasi,
          gardu: m == null ? const {} : {for (final g in m.gardu) g.garduId: g},
        ));
  }

  // ---------- halaman ----------

  List<Widget> _halamanLaporan() {
    final h = _header!;
    final id = teksInsDu(h['headerId']);
    final ring = ringkasInsDu(_realisasi);
    final belumIsi = [
      if (angkaInsDu(h['kmAwal']) == null) 'KM awal',
      if (teksInsDu(h['koordinatAwal']).isEmpty) 'koordinat awal',
      if (angkaInsDu(h['kmAkhir']) == null) 'KM akhir',
      if (teksInsDu(h['koordinatAkhir']).isEmpty) 'koordinat akhir',
    ];
    final n = InsDuLokal.hitung(_doc);
    final tunggak = _tunggakan;
    return [
      if (tunggak != null) _blokTunggakan(tunggak),
      KartuLaporanTim(
        judul: teksInsDu(h['kodeHeader']).isEmpty ? 'Laporan Utama' : teksInsDu(h['kodeHeader']),
        sub: tanggalHartek(_tanggal),
        ikon: Icons.electrical_services_rounded,
        kmAwal: angkaInsDu(h['kmAwal']),
        kmAkhir: angkaInsDu(h['kmAkhir']),
        koordinatAwal: teksInsDu(h['koordinatAwal']),
        koordinatAkhir: teksInsDu(h['koordinatAkhir']),
        angka: [
          AngkaRingkas('Gardu', ring.gardu, onTap: () => _ke(HalamanInsDu.gardu)),
          AngkaRingkas('Temuan', ring.temuan + ring.tertinggal, onTap: () => _ke(HalamanInsDu.temuan)),
          AngkaRingkas('Masuk laporan', ring.masuk),
        ],
        onTapNilai: _boleh && !_sibuk ? (k) => unawaited(_ubahHeader(fokus: k)) : null,
        catatan: belumIsi.isEmpty ? null : 'Belum diisi: ${belumIsi.join(', ')}.',
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
            child: Text('${ring.masuk} gardu masuk laporan · ${ring.lengkap} WBP lengkap',
                maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
          ),
        ]),
        onUbah: _boleh && !_sibuk ? () => unawaited(_ubahHeader()) : null,
        tampilWa: true,
        waSiap: belumIsi.isEmpty && _realisasi.isNotEmpty && _realisasi.every((r) => r['masukLaporan'] == true),
        onKirimWa: _sibuk ? null : () => unawaited(_kirimWa()),
        onTambah: _boleh && !_sibuk ? () => unawaited(_tambahGardu()) : null,
        labelTambah: 'Tambah gardu',
      ),
      TandaSinkronHartek(node: h, onCobaUlang: () => _cobaUlang(id), onBuang: () => _buang(id), padding: const EdgeInsets.only(top: 12)),
      TandaSinkronHartek(
          node: h, ubahHeader: true, onCobaUlang: () => _cobaUlang(id, ubah: true), onBuang: () => _buang(id, ubah: true), padding: const EdgeInsets.only(top: 12)),
      const SizedBox(height: 14),
      _statusKirim(),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.touch_app_outlined, size: 18, color: HartekGaya.redup),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
                _realisasi.isEmpty
                    ? 'Ketuk + untuk menambah gardu. Ketuk angka Gardu untuk rincian, pengukuran, dan temuan tiap gardu.'
                    : 'Ketuk angka Gardu untuk rincian, pengukuran, dan temuan tiap gardu; angka Temuan untuk temuan per jenis.',
                style: HartekGaya.sekunder),
          ),
        ]),
      ),
    ];
  }

  List<Widget> _halamanGardu() => [
        if (_realisasi.isEmpty)
          const KosongHartek(
              ikon: Icons.electrical_services_outlined,
              judul: 'Belum ada gardu',
              petunjuk: 'Kembali ke halaman utama lalu ketuk + untuk menambah gardu.')
        else
          for (final r in _realisasi) _kartuGardu(r),
        if (_boleh) ...[
          const SizedBox(height: 4),
          _tombolUtama('Tambah gardu', _tambahGardu),
        ],
      ];

  List<Widget> _halamanTemuan() {
    final urut = <String>[];
    final per = <String, List<(Map<String, dynamic>, Map<String, dynamic>)>>{};
    for (final r in _realisasi) {
      for (final t in InsDuLokal.daftar(r['temuan'])) {
        final j = teksInsDu(t['jenisTemuan']).isEmpty ? 'Tanpa jenis' : teksInsDu(t['jenisTemuan']);
        if (!per.containsKey(j)) urut.add(j);
        per.putIfAbsent(j, () => []).add((r, t));
      }
    }
    urut.sort((a, b) {
      final x = per[b]!.length.compareTo(per[a]!.length);
      return x != 0 ? x : a.compareTo(b);
    });
    final tinggal = [
      for (final r in _realisasi)
        for (final t in InsDuLokal.daftar(r['temuanTertinggal'])) (r, t),
    ];
    return [
      if (urut.isEmpty && tinggal.isEmpty)
        const KosongHartek(
            ikon: Icons.report_gmailerrorred_rounded,
            judul: 'Belum ada temuan',
            petunjuk: 'Temuan dicatat dari kartu gardu (tombol + di bawah kanan).'),
      for (final j in urut) ...[
        Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 10),
          child: Row(children: [
            Expanded(child: Text(j, style: HartekGaya.judulSeksi)),
            Text('${per[j]!.length} titik', style: HartekGaya.sekunder),
          ]),
        ),
        for (final x in per[j]!) _kartuTemuan(x.$1, x.$2),
      ],
      if (tinggal.isNotEmpty) ...[
        Padding(
          padding: const EdgeInsets.only(top: 18, bottom: 10),
          child: Row(children: [
            const Expanded(child: Text('Belum diperbaiki (inspeksi sebelumnya)', style: HartekGaya.judulSeksi)),
            Text('${tinggal.length} titik', style: HartekGaya.sekunder),
          ]),
        ),
        for (final x in tinggal) KartuTemuan(t: x.$2, trailing: Text('Gardu ${teksInsDu(x.$1['noGardu'])}', style: HartekGaya.sekunder)),
      ],
    ];
  }

  Widget _headerHalaman() {
    final (String kicker, String judul, IconData ikon) = switch (_halaman) {
      HalamanInsDu.utama => ('Inspeksi Gardu', 'Laporan Utama', Icons.electrical_services_rounded),
      HalamanInsDu.gardu => ('Rincian', 'Gardu diinspeksi', Icons.electrical_services_outlined),
      HalamanInsDu.temuan => ('Rincian', 'Temuan per jenis', Icons.report_gmailerrorred_rounded),
    };
    final sub = [
      if (_halaman == HalamanInsDu.utama) _sesi.timNama,
      tanggalHartek(_tanggal),
    ].where((x) => x.isNotEmpty).join(' · ');
    return HeaderInsJar(
      kicker: kicker,
      judul: judul,
      sub: sub,
      ikon: ikon,
      aksi: [
        if (_halaman == HalamanInsDu.utama)
          tombolHeaderInsJar(Icons.refresh_rounded, 'Segarkan laporan', _segar || _sibuk ? null : _segarkan)
        else
          tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => _ke(HalamanInsDu.utama)),
      ],
    );
  }

  /// Satu periode ukur (LWBP / WBP) di kartu gardu, dengan tanda kirim per periode.
  Widget _petakUkur(Map<String, dynamic> r, String periode) {
    final p = petaInsDu(petaInsDu(r['pengukuran'])?[periode.toLowerCase()]);
    final adaLwbp = petaInsDu(petaInsDu(r['pengukuran'])?['lwbp']) != null;
    final bisa = _boleh && !_sibuk && (periode == 'LWBP' || adaLwbp);
    final isi = p != null;
    final tanda = r[InsDuLokal.kunciUkur(periode)];
    final gagal = tanda == InsDuLokal.gagal;
    return Expanded(
      child: Material(
        color: gagal ? AppColors.red100 : (isi ? AppColors.success100 : HartekGaya.latar),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: bisa || gagal ? () => unawaited(_aksiUkur(r, periode)) : null,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(periode == 'LWBP' ? Icons.wb_sunny_outlined : Icons.nightlight_outlined,
                    size: 16, color: isi ? AppColors.success700 : HartekGaya.redup),
                const SizedBox(width: 6),
                Text(periode, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: isi ? AppColors.success700 : HartekGaya.tinta)),
                const Spacer(),
                if (gagal)
                  const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.red700)
                else if (tanda == InsDuLokal.lokal)
                  const Icon(Icons.cloud_upload_outlined, size: 18, color: AppColors.accent700)
                else
                  Icon(isi ? Icons.check_circle_rounded : Icons.add_circle_outline_rounded,
                      size: 18, color: isi ? AppColors.success700 : (bisa ? HartekGaya.merek : AppColors.neutral400)),
              ]),
              const SizedBox(height: 6),
              if (isi) ...[
                Text('${angkaInsDuTampil(angkaInsDu(p['kva']))} kVA',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                Text(
                    [
                      if (angkaInsDu(p['persen']) != null) '${angkaInsDuTampil(angkaInsDu(p['persen']))}%',
                      if (teksInsDu(p['kategori']).isNotEmpty) teksInsDu(p['kategori']),
                    ].join(' · '),
                    style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
              ] else
                Text(periode == 'WBP' && !adaLwbp ? 'Isi LWBP dulu' : 'Ketuk untuk isi', style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
              if (gagal) const Text('Ditolak, ketuk', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.red700)),
              if (tanda == InsDuLokal.lokal) const Text('Menunggu kirim', style: TextStyle(fontSize: 12, color: AppColors.accent700)),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _cover(Map<String, dynamic> r) {
    final c = petaInsDu(petaInsDu(r['pengukuran'])?['cover']) ?? const <String, dynamic>{};
    final isi = [
      for (final e in labelCoverInsDu.entries)
        if (teksInsDu(c[e.key]).isNotEmpty) (e.value, teksInsDu(c[e.key])),
    ];
    if (isi.isEmpty) return const SizedBox.shrink();
    Color warna(String v) => v == 'Lengkap' || v.startsWith('A3') || v == 'Protective Sleeve'
        ? AppColors.success700
        : v == 'Tidak Ada'
            ? AppColors.red700
            : AppColors.accent700;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Cover gardu', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
        const SizedBox(height: 6),
        Wrap(spacing: 14, runSpacing: 4, children: [
          for (final x in isi)
            Text.rich(TextSpan(children: [
              TextSpan(text: '${x.$1}: ', style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
              TextSpan(text: x.$2, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: warna(x.$2))),
            ])),
        ]),
      ]),
    );
  }

  Widget _tertinggal(List<Map<String, dynamic>> l) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Icon(Icons.history_rounded, size: 18, color: AppColors.accent700),
            const SizedBox(width: 8),
            Expanded(
              child: Text('${l.length} temuan sebelumnya belum diperbaiki',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.accent700)),
            ),
          ]),
          const SizedBox(height: 6),
          for (final t in l)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '• ${teksInsDu(t['jenisTemuan'])} (${tanggalHartek(teksInsDu(t['tanggal']))})'
                '${teksInsDu(petaInsDu(t['wo'])?['tim']).isEmpty ? '' : ' · WO ${teksInsDu(petaInsDu(t['wo'])?['tim'])}'}',
                style: const TextStyle(fontSize: 12.5, height: 1.35, color: HartekGaya.tinta),
              ),
            ),
          const SizedBox(height: 4),
          const Text('Otomatis tercatat sebagai temuan gardu ini sampai diperbaiki.', style: TextStyle(fontSize: 11.5, color: HartekGaya.redup)),
        ]),
      );

  Widget _kartuTemuan(Map<String, dynamic> r, Map<String, dynamic> t) {
    final id = teksInsDu(t['temuanId']);
    final bisa = _boleh && !_sibuk && !temuanTerkunciWo(t); // v1.0.17: diteruskan ke tim = terkunci
    return KartuTemuan(
      t: t,
      onTap: bisa ? () => unawaited(_ubahTemuan(r, t)) : null,
      trailing: IkonCloudHartek(node: t, ukuran: 16),
      fotoBawah: FotoRincian(
        node: t,
        slot: _slotFoto,
        label: _labelFoto,
        bolehTambah: _boleh,
        onTap: (s) => unawaited(_ketukFoto(r, t, s)),
      ),
      bawah: Column(children: [
        TandaSinkronHartek(node: t, onCobaUlang: () => _cobaUlang(id), onBuang: () => _buang(id), padding: const EdgeInsets.only(top: 8)),
        TandaSinkronHartek(
            node: t, ubahHeader: true, onCobaUlang: () => _cobaUlang(id, ubah: true), onBuang: () => _buang(id, ubah: true), padding: const EdgeInsets.only(top: 8)),
      ]),
    );
  }

  Widget _kartuGardu(Map<String, dynamic> r) {
    final id = teksInsDu(r['realisasiId']);
    final terbuka = !_tutup.contains(id);
    final masuk = r['masukLaporan'] == true;
    final temuan = InsDuLokal.daftar(r['temuan']);
    final tinggal = InsDuLokal.daftar(r['temuanTertinggal']);
    final kap = angkaInsDu(r['kapasitasKva']);
    final bisa = _boleh && !_sibuk;
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 16),
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(HartekGaya.radius),
          onTap: () => setState(() => terbuka ? _tutup.add(id) : _tutup.remove(id)),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
            child: Row(children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(gradient: HartekGaya.gradien, borderRadius: BorderRadius.circular(14)),
                child: const Icon(Icons.electrical_services_rounded, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(
                      child: Text('Gardu ${teksInsDu(r['noGardu'])}',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                    ),
                    const SizedBox(width: 6),
                    IkonCloudHartek(node: r, ukuran: 15),
                  ]),
                  const SizedBox(height: 2),
                  Text(
                      [teksInsDu(r['penyulang']), teksInsDu(r['section']), if (kap != null) '${angkaInsDuTampil(kap)} kVA', teksInsDu(r['tier'])]
                          .where((x) => x.isNotEmpty)
                          .join(' · '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: HartekGaya.sekunder),
                  const SizedBox(height: 2),
                  Text(labelStatusUkur(teksInsDu(r['statusUkur'])),
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: masuk ? AppColors.success700 : HartekGaya.redup)),
                ]),
              ),
              Column(children: [
                Text('${temuan.length + tinggal.length}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.accent700, fontFeatures: HartekGaya.tabular)),
                const Text('temuan', style: TextStyle(fontSize: 11, color: HartekGaya.redup)),
              ]),
              const SizedBox(width: 4),
              Icon(terbuka ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: HartekGaya.tinta),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Column(children: [
            TandaSinkronHartek(node: r, onCobaUlang: () => _cobaUlang(id), onBuang: () => _buang(id), padding: const EdgeInsets.only(bottom: 10)),
            TandaSinkronHartek(
                node: r, ubahHeader: true, onCobaUlang: () => _cobaUlang(id, ubah: true), onBuang: () => _buang(id, ubah: true),
                padding: const EdgeInsets.only(bottom: 10)),
          ]),
        ),
        if (terbuka) ...[
          const Divider(height: 1, color: HartekGaya.garis),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (teksInsDu(r['alamat']).isNotEmpty) ...[
                Text(teksInsDu(r['alamat']), style: HartekGaya.sekunder),
                const SizedBox(height: 10),
              ],
              // v1.0.14: Tier 2 saja = tanpa LWBP / WBP / cover
              if (perluUkurInsDu(r['tier'])) ...[
                Row(children: [_petakUkur(r, 'LWBP'), const SizedBox(width: 10), _petakUkur(r, 'WBP')]),
                _cover(r),
              ],
              if (tinggal.isNotEmpty) _tertinggal(tinggal),
              if (temuan.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text('Temuan hari ini', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                const SizedBox(height: 8),
                for (final t in temuan) _kartuTemuan(r, t),
              ],
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
            child: Row(children: [
              if (_boleh)
                OutlinedButton.icon(
                  onPressed: bisa ? () => unawaited(_ubahGardu(r)) : null,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Ubah gardu'),
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
                      onTap: bisa ? () => unawaited(_tambahTemuan(r)) : null,
                      child: const SizedBox(width: 48, height: 48, child: Icon(Icons.add_rounded, color: Colors.white, size: 26)),
                    ),
                  ),
                ),
            ]),
          ),
        ],
      ]),
    );
  }

  List<Widget> _konten() {
    if (!_akses) {
      return [_kotakInfo(Icons.lock_outline_rounded, 'Akun ini belum punya akses menu Inspeksi Gardu. Hubungi admin.', AppColors.red700, AppColors.red100)];
    }
    final h = _header;
    return [
      if (_tanggalLain > 0)
        _kotakInfo(Icons.event_busy_rounded, '$_tanggalLain data inspeksi gardu dari hari sebelumnya belum terkirim.', AppColors.red700, AppColors.red100,
            bawah: Align(alignment: Alignment.centerRight, child: TextButton(onPressed: _buangTanggalLain, child: const Text('Buang')))),
      if (!_sesi.bolehInput(DateTime.now()))
        _kotakInfo(Icons.wifi_off_rounded, 'Batas kerja offline habis. Sambungkan internet lalu buka app supaya sesi diperbarui.',
            AppColors.accent700, AppColors.accent100),
      if (_doc == null)
        const Padding(padding: EdgeInsets.only(top: 40), child: Center(child: SisiLoader()))
      else if (h == null)
        ...(_halaman == HalamanInsDu.utama
            ? _halamanAwal()
            : const [
                KosongHartek(
                    ikon: Icons.electrical_services_rounded,
                    judul: 'Laporan Utama hari ini belum ada',
                    petunjuk: 'Kembali ke halaman utama untuk membuat Laporan Utama. Hari laporan mungkin sudah berganti.'),
              ])
      else
        ...switch (_halaman) {
          HalamanInsDu.utama => _halamanLaporan(),
          HalamanInsDu.gardu => _halamanGardu(),
          HalamanInsDu.temuan => _halamanTemuan(),
        },
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        backgroundColor: HartekGaya.latar,
        body: SafeArea(
          bottom: false,
          child: RefreshIndicator(
            onRefresh: () async {
              if (!_sibuk && _halaman == HalamanInsDu.utama) await _segarkan();
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
