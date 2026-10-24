import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/popup_berhasil.dart';
import '../../widgets/status_sinkron.dart';
import '../../widgets/kartu_laporan_tim.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/wa_panel.dart';
import '../gardu/gardu_model.dart';
import '../../widgets/foto_slot.dart' show lihatFoto;
import '../row/row_model.dart' show Koordinat;
import '../row/row_repository.dart' show RowError;
import '../row/watermark.dart';
import 'foto_lapangan.dart';
import 'foto_rincian.dart';
import 'hartek_form.dart';
import 'hartek_gaya.dart';
import 'hartek_lokal.dart';
import 'hartek_repository.dart';
import 'hartek_rincian.dart';
import 'hartek_store.dart';
import '../insjar/insjar_header.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/refresh_sisi.dart';

/// v0.89.0 (permintaan kvlar 14 Okt 2026): desain ulang seluruh Hartek, lebih menarik tanpa chip.
/// Laporan Utama = kartu odometer (KM awal, KM akhir, jarak tempuh) + ringkasan lokasi / pekerjaan / material.
/// Lokasi PG = daftar berikon per jenis. Pekerjaan = garis waktu. Material = daftar bergaya manifest.
/// Grounding = sebelum vs sesudah. Pemerataan = batang beban R / S / T + selisih beban.
/// v0.90.0: halaman utama = kartu laporan tim (pola sama dengan ROW dan kartu shift Yandal). Ketuk kartu = rincian
/// pekerjaan per jenis pekerjaan + rekap material.
/// v0.93.0: rincian = satu layar. Jenis pekerjaan bisa dibuka-tutup; isinya lokasi > pekerjaan > material per pekerjaan
/// (+ Material di tiap pekerjaan, + Pekerjaan di tiap lokasi). Halaman lokasi / pekerjaan tetap ada untuk grounding & beban.
/// Satu layar dipakai untuk 4 tingkat: kartu (default), rincian ([rincian]), lokasi ([pgId]), pekerjaan ([pgId] + [pekerjaanId]).
/// v0.95.0: semua tingkat membaca laporan dari HP (HartekStore), tanpa loading saat pindah menu. Simpan = tulis lokal,
/// dikirim otomatis di latar. Data yang ditolak server tampil dengan alasannya (Coba lagi / Buang).
class HartekScreen extends StatefulWidget {
  const HartekScreen(
      {super.key,
      required this.deps,
      required this.sesi,
      this.pgId,
      this.pekerjaanId,
      this.rincian = false,
      this.jenis});
  final Deps deps;
  final Sesi sesi;
  final String? pgId, pekerjaanId;
  final bool rincian;

  /// v0.97.0: rincian dibatasi satu jenis pekerjaan (ketukan angka di kartu laporan). null = semua jenis.
  final String? jenis;

  @override
  State<HartekScreen> createState() => _HartekScreenState();
}

const _fasaSebelum = {'sebR': 'R', 'sebS': 'S', 'sebT': 'T'};
const _fasaSesudah = {'sesR': 'R', 'sesS': 'S', 'sesT': 'T'};

class _HartekScreenState extends State<HartekScreen> {
  HartekStore get _store => widget.deps.hartek;
  Sesi get _sesi => widget.sesi;

  Map<String, dynamic>? _doc;
  bool _sibuk = false;
  bool _segar = false;
  int _tanggalLain = 0;
  bool get _akses => widget.sesi.aksiMenu(HartekRepository.menu) != null && widget.sesi.petugasHartek;
  bool get _boleh =>
      widget.sesi.petugasHartek && widget.sesi.bisaUbah(HartekRepository.menu) && widget.sesi.bolehInput(DateTime.now());

  Map<String, dynamic>? get _header => _doc?['header'] is Map ? (_doc!['header'] as Map).cast<String, dynamic>() : null;
  List<Map<String, dynamic>> get _objek => _maps(_doc?['objek']);
  String get _tanggal => _teks(_doc?['tanggal']);

  @override
  void initState() {
    super.initState();
    _doc = _store.docInstan(_sesi);
    _store.addListener(_dengar);
    if (!_akses) return;
    unawaited(_bacaLokal());
    // tab utama: kirim antrean + tarik data perangkat lain tim di latar (layar tidak menunggu)
    if (widget.pgId == null && !widget.rincian) unawaited(widget.deps.syncCtl.sinkron());
  }

  @override
  void dispose() {
    _store.removeListener(_dengar);
    super.dispose();
  }

  void _dengar() {
    final d = _store.docInstan(_sesi);
    if (mounted && d != null && !identical(d, _doc)) setState(() => _doc = d);
    if (widget.pgId == null && !widget.rincian) unawaited(_hitungTanggalLain());
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

  /// Tombol segarkan / tarik ke bawah: kirim antrean, tarik laporan tim, perbarui master dropdown.
  Future<void> _segarkan() async {
    if (_segar || !_akses) return;
    setState(() => _segar = true);
    try {
      await widget.deps.syncCtl.sinkron();
      try {
        await _store.segarkanMaster(_sesi, paksa: true);
      } catch (_) {/* master lama tetap dipakai */}
      final p = widget.deps.syncCtl.pesan;
      if (mounted && p != null) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));
    } finally {
      if (mounted) setState(() => _segar = false);
    }
  }

  /// Galat isian tetap di form. Ini hanya menangani persiapan (dropdown) dan hasil navigasi.
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(pesanHartek(e.kode))));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Daftar pilihan belum ada di HP. Sambungkan internet sekali untuk mengunduhnya.')));
      }
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _cobaUlang(String id, {bool ubahHeader = false}) async {
    await _store.cobaUlang(_sesi, id, ubahHeader: ubahHeader);
    _kirimLatar();
  }

  Future<void> _buang(String id, {bool ubahHeader = false}) async {
    final n = HartekLokal.cari(_doc ?? const {}, id);
    final turunan = _doc == null ? 1 : HartekLokal.idTurunan(_doc!, id).length;
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(ubahHeader ? 'Batalkan perubahan?' : 'Buang data ini?'),
        content: Text(ubahHeader
            ? 'Perubahan Laporan Utama yang ditolak dibuang. Isian dari server dipakai lagi.'
            : turunan > 1
                ? 'Data ini dan ${turunan - 1} data di bawahnya belum diterima server dan akan dihapus dari HP.'
                : 'Data ini belum diterima server dan akan dihapus dari HP.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ubahHeader ? 'Batalkan perubahan' : 'Buang')),
        ],
      ),
    );
    if (ya != true || !mounted) return;
    await _store.buang(_sesi, id, ubahHeader: ubahHeader);
    if (ubahHeader || n == null) _kirimLatar();
  }

  Future<void> _buangTanggalLain() async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Buang laporan hari sebelumnya?'),
        content: Text('$_tanggalLain data Hartek dari hari sebelumnya tidak terkirim. Server hanya menerima laporan hari ini.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buang')),
        ],
      ),
    );
    if (ya == true) await _store.buangTanggalLain(_sesi);
  }

  // ---------- header ----------

  List<IsianHartek> _isianHeader() => isianLaporanUtama; // v1.0.16: gaya header ROW

  Map<String, dynamic> _bersihHeader(Map<String, String> n) {
    final d = <String, dynamic>{};
    final koor1 = (n['koordinatAwal'] ?? '').trim();
    final koor2 = (n['koordinatAkhir'] ?? '').trim();
    final km1 = angkaDari(n['kmAwal']);
    final km2 = angkaDari(n['kmAkhir']);
    final ak1 = angkaDari(n['_akurasi_koordinatAwal'])?.toDouble();
    final ak2 = angkaDari(n['_akurasi_koordinatAkhir'])?.toDouble();
    if (koor1.isNotEmpty) d['koordinatAwal'] = koor1;
    if (koor2.isNotEmpty) d['koordinatAkhir'] = koor2;
    if (km1 != null) d['kmAwal'] = km1;
    if (km2 != null) d['kmAkhir'] = km2;
    if (n.containsKey('kendala')) d['kendala'] = n['kendala']!.trim();
    if (koor1.isNotEmpty && ak1 != null && ak1 > 0) d['_akurasi_koordinatAwal'] = ak1;
    if (koor2.isNotEmpty && ak2 != null && ak2 > 0) d['_akurasi_koordinatAkhir'] = ak2;
    return d;
  }

  Map<String, String> _cekHeader(Map<String, String> n) {
    final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
    final errors = <String, String>{};
    if (a != null && b != null && b < a) errors['kmAkhir'] = 'KM akhir tidak boleh lebih kecil dari KM awal';
    // Server mengabaikan koordinat / KM kosong saat ubah. Jangan menjanjikan pengosongan nilai.
    for (final k in ['koordinatAwal', 'koordinatAkhir', 'kmAwal', 'kmAkhir']) {
      if (_header != null && _teks(_header![k]).isNotEmpty && (n[k] ?? '').trim().isEmpty) {
        errors[k] = 'Nilai yang sudah tersimpan tidak boleh dikosongkan';
      }
    }
    return errors;
  }

  static String? _ringkasHeader(Map<String, String> n) {
    final a = angkaDari(n['kmAwal']), b = angkaDari(n['kmAkhir']);
    if (a == null || b == null || b < a) return null;
    return 'Jarak tempuh ${angkaHartek(b - a)} km';
  }

  Future<void> _buatHeader() => _form(() => bukaFormHartek(
        context,
        judul: 'Laporan Utama',
        keterangan: '${widget.sesi.timNama} · ${tanggalHartek(_tanggal)}\nSatu laporan untuk seluruh pekerjaan tim hari ini.',
        daftar: (_) => _isianHeader(),
        tombol: 'Buat Laporan Utama',
        cekTambahan: _cekHeader,
        ringkasan: _ringkasHeader,
        simpan: (n) async {
          await _store.buatHeader(_sesi, _bersihHeader(n));
          return const {'lokal': true};
        },
      ));

  /// [fokus] = kunci isian yang langsung disorot (ketukan area KM / koordinat di kartu laporan).
  Future<void> _ubahHeader({String? fokus}) async {
    final h = _header!;
    final awal = {
      'koordinatAwal': _teks(h['koordinatAwal']),
      'koordinatAkhir': _teks(h['koordinatAkhir']),
      'kmAwal': _teks(h['kmAwal']),
      'kmAkhir': _teks(h['kmAkhir']),
      'kendala': _teks(h['kendala']),
      if (_teks(h['_akurasi_koordinatAwal']).isNotEmpty) '_akurasi_koordinatAwal': _teks(h['_akurasi_koordinatAwal']),
      if (_teks(h['_akurasi_koordinatAkhir']).isNotEmpty) '_akurasi_koordinatAkhir': _teks(h['_akurasi_koordinatAkhir']),
    };
    await _form(() => bukaFormHartek(
          context,
          judul: 'Ubah Laporan Utama',
          keterangan: '${widget.sesi.timNama} · ${tanggalHartek(_tanggal)}',
          daftar: (_) => _isianHeader(),
          awal: awal,
          cekTambahan: _cekHeader,
          ringkasan: _ringkasHeader,
          tombol: 'Simpan perubahan',
          fokus: fokus,
          simpan: (n) async {
            final d = _bersihHeader(n)..removeWhere((k, v) => !k.startsWith('_akurasi_') && _teks(v).isEmpty);
            if (d.keys.where((k) => !k.startsWith('_akurasi_')).isEmpty) return null;
            await _store.ubahHeader(_sesi, _bersihHeader(n));
            return const {'lokal': true};
          },
        ));
  }

  // ---------- PG ----------

  /// v0.95.0: koordinat gardu dari master (kosong kalau master tidak punya titik / di luar area).
  static String _titikGardu(Gardu? g) {
    if (g == null || g.lat == null || g.lng == null) return '';
    final t = Koordinat.format(g.lat!, g.lng!);
    return Koordinat.cek(t) == null ? t : '';
  }

  /// Master Gardu di HP (diunduh sekali kalau belum ada). Kunci = nomor gardu huruf besar.
  Future<Map<String, Gardu>> _masterGardu() async {
    var semua = await widget.deps.gardu.semua();
    if (semua.isEmpty) {
      try {
        await widget.deps.gardu.segarkan(_sesi);
        semua = await widget.deps.gardu.semua();
      } catch (_) {/* tanpa sinyal: nomor gardu diketik */}
    }
    final peta = <String, Gardu>{};
    for (final g in semua) {
      final no = g.no.trim().toUpperCase();
      if (no.isEmpty) continue;
      if (peta[no] == null || (peta[no]!.status != 'AKTIF' && g.status == 'AKTIF')) peta[no] = g;
    }
    return peta;
  }

  /// "Tambah Pekerjaan" (v0.95.0, dulu Tambah lokasi PG): jenis + lokasi pekerjaan.
  /// v0.97.4: [jenisTetap] diisi saat dibuka dari sub jenis pekerjaan tertentu (Jaringan / Gardu / Non - Teknik),
  /// sehingga langsung menambahkan PG jenis itu tanpa memilih jenis utama lagi.
  Future<void> _tambahPg({String? jenisTetap}) => _form(() async {
        final jaringan = await _store.master(_sesi, 'jaringan');
        final gardu = await _masterGardu();
        if (!mounted) return null;
        // urutan section mengikuti kolom urutan db_Jaringan (diurutkan server)
        final penyulang = <String, List<String>>{
          for (final p in _maps(jaringan['penyulang']))
            _teks(p['nama']): [for (final s in p['section'] as List<dynamic>? ?? <dynamic>[]) '$s'],
        };
        final nomorGardu = gardu.keys.toList()..sort();
        // v0.97.0 (kvlar 15 Okt 2026): pemilihan gardu BERJENJANG dari Master Gardu: penyulang > section > gardu.
        final pohon = <String, Map<String, List<String>>>{};
        for (final no in nomorGardu) {
          final g = gardu[no]!;
          final pen = g.penyulang.trim().isEmpty ? _tanpaPenyulang : g.penyulang.trim();
          final sec = g.section.trim().isEmpty ? _tanpaSection : g.section.trim();
          pohon.putIfAbsent(pen, () => <String, List<String>>{}).putIfAbsent(sec, () => <String>[]).add(no);
        }
        final penyulangGardu = pohon.keys.toList()..sort();
        String labelGardu(String no) {
          final g = gardu[no];
          if (g == null) return no;
          final alamat = g.alamat.trim();
          return [no, if (alamat.isNotEmpty) alamat, if (g.status != 'AKTIF' && g.status.isNotEmpty) g.status.toLowerCase()].join(' · ');
        }

        final namaJenisTetap = jenisTetap == 'Non - Teknik' ? 'Non-Teknik' : jenisTetap;
        return bukaFormHartek(
          context,
          judul: namaJenisTetap == null ? 'Tambah Pekerjaan' : 'Tambah Pekerjaan $namaJenisTetap',
          keterangan: namaJenisTetap == null
              ? 'Pilih jenis dan lokasi pekerjaan. Rincian pekerjaan dan material dicatat sesudahnya.'
              : 'Pilih lokasi pekerjaan $namaJenisTetap. Rincian pekerjaan dan material dicatat sesudahnya.',
          tombol: 'Simpan',
          awal: jenisTetap == null ? const {} : {'jenisPekerjaan': jenisTetap},
          cekTambahan: (n) {
            final jenis = jenisTetap ?? n['jenisPekerjaan'] ?? '';
            final no = (n['noGardu'] ?? '').trim();
            if (jenis.isEmpty || jenis == 'Jaringan' || no.isEmpty || _doc == null) return const {};
            return HartekLokal.garduGanda(_doc!, no, jenis) ? {'noGardu': pesanHartek('GARDU_GANDA')} : const {};
          },
          daftar: (nilai) {
            final jenis = jenisTetap ?? nilai['jenisPekerjaan'] ?? '';
            return [
              if (jenisTetap == null)
                const IsianHartek('jenisPekerjaan', 'Jenis pekerjaan',
                    wajib: true, segmen: true, pilihan: ['Jaringan', 'Gardu', 'Non - Teknik']),
              if (jenis == 'Jaringan') ...[
                IsianHartek('penyulang', 'Penyulang',
                    wajib: true,
                    grup: 'Lokasi jaringan',
                    pilihan: penyulang.keys.toList()..sort(),
                    turunan: const ['section']),
                IsianHartek('section', 'Section', wajib: true, pilihanDari: (v) => penyulang[v['penyulang']] ?? const []),
                // v0.97.0: daerah + jumlah gawang WAJIB untuk lokasi jaringan
                const IsianHartek('daerah', 'Daerah', wajib: true, maks: 200, contoh: 'Nama jalan atau desa'),
                const IsianHartek('jumlahGawang', 'Jumlah gawang',
                    wajib: true, angka: true, bulat: true, max: 9999, akhiran: 'gawang'),
              ] else if (jenis.isNotEmpty && penyulangGardu.isNotEmpty) ...[
                // v0.97.0: berjenjang penyulang > section > gardu, semuanya dari Master Gardu
                IsianHartek('penyulangGardu', 'Penyulang',
                    wajib: true,
                    grup: 'Gardu',
                    pilihan: penyulangGardu,
                    turunan: const ['sectionGardu', 'noGardu', 'koordinat']),
                IsianHartek('sectionGardu', 'Section',
                    wajib: true,
                    pilihanDari: (v) =>
                        (pohon[v['penyulangGardu']] ?? const <String, List<String>>{}).keys.toList()..sort(),
                    turunan: const ['noGardu', 'koordinat']),
                IsianHartek('noGardu', 'Nomor gardu',
                    wajib: true,
                    pilihanDari: (v) => pohon[v['penyulangGardu']]?[v['sectionGardu']] ?? const <String>[],
                    labelPilihan: labelGardu,
                    isiLain: (v) => {'koordinat': _titikGardu(gardu[v])}),
              ] else if (jenis.isNotEmpty)
                const IsianHartek('noGardu', 'Nomor gardu', wajib: true, maks: 20, grup: 'Gardu', contoh: 'TB0001'),
              // v0.91.0: titik lokasi PG. v0.97.0: untuk gardu TIDAK bisa diubah (selalu titik Master Gardu).
              if (jenis == 'Jaringan')
                const IsianHartek('koordinat', 'Titik lokasi',
                    koordinat: true, grup: 'Titik', contoh: '-3.012345, 106.512345')
              else if (jenis.isNotEmpty)
                const IsianHartek('koordinat', 'Titik lokasi dari Master Gardu',
                    bacaSaja: true, grup: 'Titik', contoh: 'Terisi setelah gardu dipilih'),
            ];
          },
          simpan: (n) async {
            final jenis = jenisTetap ?? n['jenisPekerjaan']!;
            final titik = (n['koordinat'] ?? '').trim();
            final d = <String, dynamic>{'jenisPekerjaan': jenis};
            final tampil = <String, dynamic>{'jenisPekerjaan': jenis, 'koordinat': titik};
            if (jenis == 'Jaringan') {
              final isi = _payload(n, angka: {'jumlahGawang'})..remove('jenisPekerjaan');
              d.addAll(isi);
              tampil.addAll({'noGardu': '', 'jumlahGawang': '', 'daerah': '', ...isi});
            } else {
              final no = (n['noGardu'] ?? '').trim().toUpperCase();
              if (HartekLokal.garduGanda(_doc ?? const {}, no, jenis)) throw ApiException('GARDU_GANDA', kolom: 'noGardu');
              final g = gardu[no];
              d['noGardu'] = no;
              if (titik.isNotEmpty) d['koordinat'] = titik;
              tampil.addAll({
                'noGardu': no,
                'penyulang': g?.penyulang ?? '',
                'section': g?.section ?? '',
                'daerah': g?.alamat ?? '',
                'jumlahGawang': '',
                if (titik.isEmpty) 'koordinat': _titikGardu(g),
              });
            }
            await _store.tambahPg(_sesi, d, tampil);
            return const {'lokal': true};
          },
        );
      });

  // ---------- pekerjaan ----------

  /// v0.91.0: pekerjaan dipilih dari db_Jenis_Pekerjaan modul HARTEK. Nama tampil, jenisId yang dikirim.
  /// v0.94.0 (sama dengan v1): pilihan disaring jenis lokasi (Jaringan / Gardu / Non - Teknik), satuan dari master
  /// (tidak diketik lagi kalau master mengisinya), klasifikasi GASPOL tampil sebelum simpan, jumlah wajib kalau masuk GASPOL.
  Future<void> _tambahPekerjaan(Map<String, dynamic> pg) => _form(() async {
        final sumber = await _store.master(_sesi, 'jenis');
        if (!mounted) return null;
        final jenisPg = _teks(pg['jenisPekerjaan']);
        final jenis = HartekRepository.pekerjaanUntukJenis(_maps(sumber['jenis']), jenisPg);
        if (jenis.isEmpty) {
          await _masterKosong('Daftar pekerjaan belum tersedia',
              'Belum ada pekerjaan $jenisPg aktif. Minta admin mengisi db_Jenis_Pekerjaan di SiSi_Master (modul HARTEK, jenis_pekerjaan $jenisPg).');
          return null;
        }
        if (!mounted) return null;
        String satuan(Map<String, String> n) => _teks(jenis[n['pekerjaan']]?['satuan']);
        return bukaFormHartek(
          context,
          judul: 'Tambah Rincian Pekerjaan',
          keterangan: '$jenisPg · ${_lokasi(pg)}',
          tombol: 'Simpan rincian',
          daftar: (_) => [
            IsianHartek('pekerjaan', 'Pekerjaan',
                wajib: true,
                grup: 'Pekerjaan',
                pilihan: jenis.keys.toList(),
                isiLain: (v) => {'satuanPekerjaan': _teks(jenis[v]?['satuan'])},
                bantuan: 'Daftar pekerjaan $jenisPg. Pemerataan / Pembagian Beban Gardu membuka isian beban R / S / T.'),
            // v0.97.0: jumlah WAJIB untuk semua pekerjaan (dulu hanya yang masuk GASPOL)
            const IsianHartek('jumlahPekerjaan', 'Jumlah', angka: true, wajib: true, grup: 'Hasil', baris: 'hasil'),
            const IsianHartek('satuanPekerjaan', 'Satuan',
                bacaSaja: true,
                baris: 'hasil',
                contoh: 'Otomatis'),
          ],
          simpan: (n) async {
            final d = _payload(n, angka: {'jumlahPekerjaan'})
              ..remove('pekerjaan')
              ..remove('satuanPekerjaan');
            final j = jenis[n['pekerjaan']];
            final sat = satuan(n);
            if (sat.isNotEmpty) d['satuanPekerjaan'] = sat;
            await _store.tambahPekerjaan(_sesi, _teks(pg['pgId']), {'jenisId': _teks(j?['jenisId']), ...d}, {
              'pekerjaan': n['pekerjaan'],
              'jenisId': _teks(j?['jenisId']),
              'jumlahPekerjaan': d['jumlahPekerjaan'] ?? '',
              'satuanPekerjaan': sat,
              'kolomGaspol': _teks(j?['kolomGaspol']),
              'labelGaspol': _teks(j?['labelGaspol']),
            });
            return const {'lokal': true};
          },
        );
      });

  Future<void> _masterKosong(String judul, String isi) => showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(judul),
          content: Text(isi),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti'))],
        ),
      );

  Future<void> _tambahMaterial(Map<String, dynamic> pk) => _form(() async {
        final sumber = await _store.master(_sesi, 'material');
        if (!mounted) return null;
        // v0.91.0: nama tampil, materialId dikirim (disimpan sebagai master_material_id), satuan terisi otomatis
        final master = <String, Map<String, dynamic>>{
          for (final m in _maps(sumber['material']))
            if (_teks(m['nama']).isNotEmpty && _teks(m['materialId']).isNotEmpty) _teks(m['nama']): m,
        };
        final material = master.keys.toList()..sort();
        if (material.isEmpty) {
          await _masterKosong('Material belum tersedia',
              'Minta admin melengkapi material aktif di db_Material pada SiSi_Master, termasuk material_id dan satuan.');
          return null;
        }
        final kepemilikan = <String>[
          for (final k in _maps(sumber['kepemilikan']))
            if (_teks(k['nama']).isNotEmpty) _teks(k['nama']),
        ];
        if (!mounted) return null;
        return bukaFormHartek(
          context,
          judul: 'Material terpakai',
          keterangan: _teks(pk['pekerjaan']),
          tombol: 'Simpan material',
          daftar: (_) => [
            IsianHartek('material', 'Material',
                wajib: true, grup: 'Material', pilihan: material, isiLain: (v) => {'satuan': _teks(master[v]?['satuan'])}),
            const IsianHartek('jumlah', 'Jumlah', wajib: true, angka: true, baris: 'jumlah'),
            const IsianHartek('satuan', 'Satuan', bacaSaja: true, baris: 'jumlah', contoh: 'Otomatis'),
            // v0.97.0: kepemilikan WAJIB diisi, dipilih dari db_Kepemilikan_Material
            IsianHartek('kepemilikan', 'Kepemilikan', wajib: true, maks: 60, pilihan: kepemilikan),
          ],
          simpan: (n) async {
            final sat = _teks(master[n['material']]?['satuan']);
            final d = _payload(n, angka: {'jumlah'})
              ..remove('material')
              ..remove('satuan');
            if (sat.isNotEmpty) d['satuan'] = sat;
            final id = _teks(master[n['material']]?['materialId']);
            await _store.tambahAnak(_sesi, 'material', _teks(pk['pekerjaanId']), {'materialId': id, ...d}, {
              'material': n['material'],
              'masterMaterialId': id,
              'jumlah': d['jumlah'],
              'satuan': sat,
              'kepemilikan': _teks(d['kepemilikan']),
            });
            return const {'lokal': true};
          },
        );
      });

  /// v0.97.0 (kvlar 15 Okt 2026): rincian grounding hanya untuk pekerjaan grounding. "Pasang Grounding" =
  /// grounding baru, jadi hanya nilai SESUDAH; perbaikan = sebelum + sesudah, keduanya wajib.
  /// v0.98.11: jenis peralatan dari db_jenis_peralatan (SiSi_Master); nama peralatan otomatis dari lokasi PG
  /// (Jaringan = nama switching sesuai section penyulang, Gardu = nomor gardu).
  Future<void> _tambahGrounding(Map<String, dynamic> pg, Map<String, dynamic> pk) => _form(() async {
        final sumber = await _store.master(_sesi, 'material');
        if (!mounted) return null;
        final jenisPeralatan = <String>[
          for (final p in _maps(sumber['jenisPeralatan']))
            if (_teks(p['nama']).isNotEmpty) _teks(p['nama']),
        ];
        final nama = _teks(pk['pekerjaan']);
        final hanyaSesudah = HartekRepository.groundingHanyaSesudah(nama);
        final namaAlat = HartekRepository.namaPeralatanGrounding(
          jenisPekerjaan: _teks(pg['jenisPekerjaan']),
          section: _teks(pg['section']),
          noGardu: _teks(pg['noGardu']),
        );
        return bukaFormHartek(
          context,
          judul: 'Hasil grounding',
          keterangan: hanyaSesudah ? '$nama · hanya nilai sesudah pemasangan' : '$nama · nilai sebelum dan sesudah perbaikan',
          tombol: 'Simpan grounding',
          awal: namaAlat.isEmpty ? const {} : {'namaPeralatan': namaAlat},
          daftar: (_) => [
            IsianHartek('jenisPeralatan', 'Jenis peralatan',
                wajib: true,
                maks: 80,
                grup: 'Peralatan',
                pilihan: jenisPeralatan.isEmpty ? null : jenisPeralatan,
                contoh: 'Trafo, LA, arrester'),
            IsianHartek('namaPeralatan', 'Nama peralatan',
                bacaSaja: namaAlat.isNotEmpty,
                maks: 120,
                contoh: 'Otomatis'),
            const IsianHartek('kondisiTanah', 'Kondisi tanah', maks: 120, contoh: 'Kering, lembab, berbatu'),
            // v0.91.0: hasil ukur tahanan = angka ohm
            if (!hanyaSesudah)
              const IsianHartek('hasilSebelum', 'Sebelum',
                  wajib: true, angka: true, max: 99999, akhiran: 'Ω', grup: 'Hasil ukur', baris: 'hasil', contoh: '12'),
            IsianHartek('hasilSesudah', 'Sesudah',
                wajib: true,
                angka: true,
                max: 99999,
                akhiran: 'Ω',
                grup: hanyaSesudah ? 'Hasil ukur' : null,
                baris: 'hasil',
                contoh: '4'),
            // v1.0.0: foto alat ukur grounding (pasang grounding = hanya sesudah)
            for (final slot in HartekLokal.slotFoto['grounding']!)
              if (!(hanyaSesudah && slot == 'SEBELUM')) _isianFoto(pg, pk, slot, grup: 'Foto hasil ukur', baris: 'foto'),
          ],
          simpan: (n) async {
            final foto = _fotoDari(n);
            final d = _payload(_tanpaFoto(n), angka: {'hasilSebelum', 'hasilSesudah'});
            if (namaAlat.isNotEmpty) d['namaPeralatan'] = namaAlat;
            await _store.tambahAnak(_sesi, 'grounding', _teks(pk['pekerjaanId']), d, {
              'jenisPeralatan': '', 'namaPeralatan': '', 'kondisiTanah': '', 'hasilSebelum': '', 'hasilSesudah': '', ...d,
            }, foto: foto);
            return const {'lokal': true};
          },
        );
      });

  // ---------- ubah pekerjaan (v0.97.0) ----------

  /// v0.97.4 (kvlar 15 Okt 2026): ubah pekerjaan & jumlah pekerjaan yang sudah diisi. Pilihan pekerjaan disaring
  /// sesuai jenis lokasi PG, satuan otomatis mengikuti master pekerjaan yang dipilih.
  Future<void> _ubahPekerjaan(Map<String, dynamic> pg, Map<String, dynamic> pk) => _form(() async {
        final sumber = await _store.master(_sesi, 'jenis');
        if (!mounted) return null;
        final jenisPg = _teks(pg['jenisPekerjaan']);
        final jenis = HartekRepository.pekerjaanUntukJenis(_maps(sumber['jenis']), jenisPg);
        final namaLama = _teks(pk['pekerjaan']);
        final satuanLama = _teks(pk['satuanPekerjaan']);
        final pilihan = <String>[
          ...jenis.keys,
          if (namaLama.isNotEmpty && !jenis.containsKey(namaLama)) namaLama,
        ];
        final id = _teks(pk['pekerjaanId']);
        return bukaFormHartek(
          context,
          judul: 'Ubah Rincian Pekerjaan',
          keterangan: '$jenisPg · ${_lokasi(pg)}',
          tombol: 'Simpan perubahan',
          awal: {
            'pekerjaan': namaLama,
            'jumlahPekerjaan': _teks(pk['jumlahPekerjaan']),
            'satuanPekerjaan': satuanLama,
          },
          daftar: (_) => [
            IsianHartek('pekerjaan', 'Pekerjaan',
                wajib: true,
                grup: 'Pekerjaan',
                pilihan: pilihan,
                isiLain: (v) => {'satuanPekerjaan': _teks(jenis[v]?['satuan']).isEmpty ? satuanLama : _teks(jenis[v]?['satuan'])}),
            const IsianHartek('jumlahPekerjaan', 'Jumlah', wajib: true, angka: true, grup: 'Hasil', baris: 'hasil'),
            const IsianHartek('satuanPekerjaan', 'Satuan', bacaSaja: true, baris: 'hasil', contoh: 'Dari master'),
          ],
          simpan: (n) async {
            final jumlah = angkaDari(n['jumlahPekerjaan']);
            if (jumlah == null) return null;
            final namaBaru = (n['pekerjaan'] ?? '').trim();
            final j = jenis[namaBaru];
            final jenisIdBaru = _teks(j?['jenisId']).isNotEmpty ? _teks(j?['jenisId']) : _teks(pk['jenisId']);
            final satBaru = _teks(j?['satuan']).isNotEmpty ? _teks(j?['satuan']) : satuanLama;
            final data = <String, dynamic>{
              'jumlahPekerjaan': jumlah,
              if (jenisIdBaru.isNotEmpty) 'jenisId': jenisIdBaru,
              if (namaBaru.isNotEmpty) 'pekerjaan': namaBaru,
              if (satBaru.isNotEmpty) 'satuanPekerjaan': satBaru,
            };
            final tampil = <String, dynamic>{
              'pekerjaan': namaBaru,
              'jenisId': jenisIdBaru,
              'jumlahPekerjaan': jumlah,
              'satuanPekerjaan': satBaru,
              if (j != null) 'kolomGaspol': _teks(j['kolomGaspol']),
              if (j != null) 'labelGaspol': _teks(j['labelGaspol']),
            };
            await _store.ubahPekerjaan(_sesi, id, data, tampil);
            return const {'lokal': true};
          },
        );
      });

  static String? _ringkasPemerataan(Map<String, String> n) {
    final a = HartekRepository.ketidakseimbangan([for (final k in _fasaSebelum.keys) angkaDari(n[k])]);
    final b = HartekRepository.ketidakseimbangan([for (final k in _fasaSesudah.keys) angkaDari(n[k])]);
    if (a == null && b == null) return null;
    return 'Selisih beban: sebelum ${_persen(a)} · sesudah ${_persen(b)}';
  }

  /// v1.0.0: + foto arus dan tegangan, sebelum dan sesudah pemerataan.
  Future<void> _tambahPemerataan(Map<String, dynamic> pg, Map<String, dynamic> pk) => _form(() => bukaFormHartek(
        context,
        judul: 'Pemerataan beban',
        keterangan: _teks(pk['pekerjaan']),
        tombol: 'Simpan pemerataan',
        ringkasan: _ringkasPemerataan,
        daftar: (_) => [
          const IsianHartek('alamat', 'Alamat', grup: 'Lokasi gardu', contoh: 'Nama jalan atau patokan'),
          for (final e in _fasaSebelum.entries)
            IsianHartek(e.key, e.value, angka: true, max: 99999, akhiran: 'A', baris: 'seb', grup: 'Beban sebelum'),
          _isianFoto(pg, pk, 'ARUS_SEBELUM', grup: 'Beban sebelum', baris: 'fotoSeb'),
          _isianFoto(pg, pk, 'TEGANGAN_SEBELUM', grup: 'Beban sebelum', baris: 'fotoSeb'),
          for (final e in _fasaSesudah.entries)
            IsianHartek(e.key, e.value, angka: true, max: 99999, akhiran: 'A', baris: 'ses', grup: 'Beban sesudah'),
          _isianFoto(pg, pk, 'ARUS_SESUDAH', grup: 'Beban sesudah', baris: 'fotoSes'),
          _isianFoto(pg, pk, 'TEGANGAN_SESUDAH', grup: 'Beban sesudah', baris: 'fotoSes'),
        ],
        simpan: (n) async {
          final foto = _fotoDari(n);
          final d = _payload(_tanpaFoto(n), angka: {..._fasaSebelum.keys, ..._fasaSesudah.keys});
          await _store.tambahAnak(_sesi, 'pemerataan', _teks(pk['pekerjaanId']), d, {'alamat': '', ...d}, foto: foto);
          return const {'lokal': true};
        },
      ));

  // ---------- foto lapangan (v1.0.0) ----------

  /// v1.0.1 (keputusan kvlar 19 Okt 2026): foto grounding / pemerataan WAJIB diambil sebelum rincian disimpan.
  static const _fotoWajib = true;
  static const _awalanFoto = 'foto_';

  /// Teks slot di watermark, misalnya "Foto sebelum".
  static const _slotWatermark = {
    'SEBELUM': 'Grounding Sebelum',
    'SESUDAH': 'Grounding Sesudah',
    'ARUS_SEBELUM': 'Arus Sebelum',
    'TEGANGAN_SEBELUM': 'Tegangan Sebelum',
    'ARUS_SESUDAH': 'Arus Sesudah',
    'TEGANGAN_SESUDAH': 'Tegangan Sesudah',
  };

  static Map<String, String> _fotoDari(Map<String, String> n) => {
        for (final e in n.entries)
          if (e.key.startsWith(_awalanFoto) && e.value.trim().isNotEmpty) e.key.substring(_awalanFoto.length): e.value.trim(),
      };

  static Map<String, String> _tanpaFoto(Map<String, String> n) =>
      {for (final e in n.entries) if (!e.key.startsWith(_awalanFoto)) e.key: e.value};

  DataWatermark _watermark(Map<String, dynamic> pg, Map<String, dynamic> pk, String slot, {String kode = ''}) {
    final kodePk = _teks(pk['kodePekerjaan']), kodeH = _teks(_header?['kodeHeader']);
    final koor = _teks(pg['koordinat']);
    return DataWatermark(
      kodeEksekusi: kode.isNotEmpty ? kode : kodePk.isNotEmpty ? kodePk : kodeH.isNotEmpty ? kodeH : 'Hartek ${tanggalHartek(_tanggal)}',
      ulp: _sesi.ulp,
      tim: _sesi.timNama,
      subTim: _sesi.nama,
      penyulang: _teks(pg['penyulang']),
      section: [_teks(pg['section']), _teks(pg['noGardu'])].where((v) => v.isNotEmpty).join(' · '),
      waktu: DateTime.now(),
      koordinat: koor.isEmpty || Koordinat.cek(koor) != null ? null : koor,
      diameter: null,
      jenis: _teks(pk['pekerjaan']),
      slot: _slotWatermark[slot] ?? slot,
      labelKode: kode.isNotEmpty ? 'Kode Rincian' : 'Kode Pekerjaan',
      labelSubTim: 'Akun',
      tampilDiameter: false,
    );
  }

  IsianHartek _isianFoto(Map<String, dynamic> pg, Map<String, dynamic> pk, String slot, {String? grup, String? baris}) =>
      IsianHartek('$_awalanFoto$slot', HartekLokal.labelFoto[slot] ?? slot,
          wajib: _fotoWajib,
          grup: grup,
          baris: baris,
          ambilFoto: (ctx, _, ada) => FotoLapangan.ambil(ctx,
              label: HartekLokal.labelFoto[slot] ?? slot, pratinjau: _watermark(pg, pk, slot), folder: 'hartek', pathAda: ada));

  /// Ketuk kotak foto di kartu: lihat / coba lagi / buang (ditolak) / ambil foto susulan (slot kosong).
  Future<void> _ketukFoto(String jenis, Map<String, dynamic> pg, Map<String, dynamic> pk, Map<String, dynamic> n, String slot) async {
    final id = _teks(n['idBaris']);
    final label = HartekLokal.labelFoto[slot] ?? slot;
    final path = HartekLokal.fotoDiHp(n)[slot];
    final status = HartekLokal.statusFoto(n, slot);
    if (status == HartekLokal.gagal) {
      final pilih = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('$label ditolak'),
          content: Text(HartekLokal.galatFoto(n, slot) ?? 'Foto ditolak server.'),
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
    if (HartekLokal.fotoDiServer(n)[slot] != null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Foto sudah tersimpan di Drive (diambil dari perangkat lain).')));
      return;
    }
    if (!_boleh || _sibuk) return;
    try {
      final kodeRincian = _teks(n[jenis == 'grounding' ? 'kodeGrounding' : 'kodePemerataan']);
      final baru = await FotoLapangan.ambil(context,
          label: label, pratinjau: _watermark(pg, pk, slot, kode: kodeRincian), folder: 'hartek');
      if (baru == null || !mounted) return;
      await _store.tambahFoto(_sesi, jenis, id, slot, baru);
      _kirimLatar();
    } on RowError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.pesan)));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(pesanHartek(e.kode))));
    }
  }

  /// 'Foto arus sebelum' -> 'Arus sebelum' (label kotak kecil di kartu).
  static String _labelPendek(String slot) {
    final l = (HartekLokal.labelFoto[slot] ?? slot).replaceFirst('Foto ', '');
    return l.isEmpty ? l : l[0].toUpperCase() + l.substring(1);
  }

  Widget _fotoKartu(String jenis, Map<String, dynamic> pg, Map<String, dynamic> pk, Map<String, dynamic> n) {
    final slot = HartekLokal.slotWajib(jenis, n);
    return FotoRincian(
      node: n,
      slot: slot,
      label: {for (final s in slot) s: _labelPendek(s)},
      bolehTambah: _boleh && _teks(n['idBaris']).isNotEmpty,
      onTap: (s) => unawaited(_ketukFoto(jenis, pg, pk, n, s)),
    );
  }

  // ---------- pembantu ----------

  static const _tanpaPenyulang = 'Tanpa penyulang';
  static const _tanpaSection = 'Tanpa section';

  static String _teks(Object? v) => v?.toString().trim() ?? '';
  static String _persen(double? v) => v == null ? '–' : '${v.round()}%';
  static List<Map<String, dynamic>> _maps(Object? v) => v is List<dynamic>
      ? v.whereType<Map<dynamic, dynamic>>().map((m) => Map<String, dynamic>.from(m)).toList()
      : <Map<String, dynamic>>[];
  static String _lokasi(Map<String, dynamic> pg) => lokasiHartek(pg);
  static Map<String, dynamic> _payload(Map<String, String> n, {Set<String> angka = const {}}) => {
        for (final e in n.entries)
          if (e.value.trim().isNotEmpty) e.key: angka.contains(e.key) ? angkaDari(e.value)! : e.value.trim(),
      };

  int get _jumlahPekerjaan => _objek.fold<int>(0, (a, pg) => a + _maps(pg['pekerjaan']).length);
  int get _jumlahMaterial => _objek.fold<int>(
      0, (a, pg) => a + _maps(pg['pekerjaan']).fold<int>(0, (b, pk) => b + _maps(pk['material']).length));

  Future<void> _bukaDetail(String pgId, [String? pekerjaanId]) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => HartekScreen(deps: widget.deps, sesi: widget.sesi, pgId: pgId, pekerjaanId: pekerjaanId),
      ),
    );
  }

  // ---------- potongan tampilan ----------

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
        padding: const EdgeInsets.only(top: 28, bottom: 12),
        child: Row(children: [
          Expanded(child: Text(judul, style: HartekGaya.judulSeksi)),
          if (info != null) Text(info, style: HartekGaya.sekunder),
          if (aksi != null) aksi,
        ]),
      );

  Widget _tombolCatat(VoidCallback aksi) => TextButton.icon(
        onPressed: _sibuk ? null : aksi,
        style: TextButton.styleFrom(
          visualDensity: VisualDensity.compact,
          textStyle: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700),
        ),
        icon: const Icon(Icons.add_rounded, size: 18),
        label: const Text('Catat'),
      );

  Widget _kosongKecil(String teks) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(14)),
        child: Text(teks, style: HartekGaya.sekunder),
      );

  Widget _kode(Object? kode) => Padding(
        padding: const EdgeInsets.only(top: 26),
        child: Center(child: SelectableText(_teks(kode).isEmpty ? 'Menunggu kirim ke server' : _teks(kode), style: HartekGaya.kode)),
      );

  // ---------- halaman: belum ada laporan ----------

  /// v1.0.20 (permintaan kvlar 23 Okt 2026): belum ada laporan = kartu Mulai pekerjaan (pola Laporan ROW).
  List<Widget> _halamanAwal() => [
        const SizedBox(height: 4),
        JudulSeksiSisi('Laporan hari ini', keterangan: tanggalHartek(_tanggal)),
        KartuMulaiLaporan(
          judul: 'Belum ada laporan Hartek hari ini',
          ikon: Icons.engineering_rounded,
          langkah: const ['Laporan Utama: KM + koordinat berangkat', 'Lokasi: penyulang, gardu, atau non-teknik', 'Pekerjaan + material yang dipakai'],
          onMulai: _boleh && !_sibuk ? _buatHeader : null,
        ),
      ];

  // ---------- halaman: laporan hari ini ----------

  static const _urutJenis = ['Jaringan', 'Gardu', 'Non - Teknik'];

  List<Map<String, dynamic>> _lokasiJenis(String jenis) =>
      _objek.where((pg) => _teks(pg['jenisPekerjaan']) == jenis).toList();

  int _pekerjaanJenis(String jenis) => _lokasiJenis(jenis).fold<int>(0, (a, pg) => a + _maps(pg['pekerjaan']).length);

  /// [jenis] null = semua pekerjaan (Total Pekerjaan). Diisi = hanya jenis itu, supaya petugas tidak membuka
  /// rincian jenis lain tanpa sengaja (v0.97.0).
  Future<void> _bukaRincian({String? jenis}) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => HartekScreen(deps: widget.deps, sesi: widget.sesi, rincian: true, jenis: jenis)),
    );
  }

  /// Kunci isian pertama di header yang masih kosong (untuk fokus otomatis saat lengkapi data WA).
  String? _kunciKurangHeader(Map<String, dynamic> h) {
    if (_teks(h['koordinatAwal']).isEmpty) return 'koordinatAwal';
    if (angkaDari(_teks(h['kmAwal'])) == null) return 'kmAwal';
    if (_teks(h['koordinatAkhir']).isEmpty) return 'koordinatAkhir';
    if (angkaDari(_teks(h['kmAkhir'])) == null) return 'kmAkhir';
    return null;
  }

  /// v0.97.0 / v0.97.5: laporan harian untuk WhatsApp. Bila data KM / koordinat / pekerjaan belum lengkap,
  /// tampilkan kartu pemberitahuan berisi daftar data yang perlu dilengkapi.
  Future<void> _kirimWa() async {
    final h = _header;
    if (h == null) return;
    final kurang = <String>[
      if (_teks(h['koordinatAwal']).isEmpty) 'Koordinat awal',
      if (angkaDari(_teks(h['kmAwal'])) == null) 'KM awal',
      if (_teks(h['koordinatAkhir']).isEmpty) 'Koordinat akhir',
      if (angkaDari(_teks(h['kmAkhir'])) == null) 'KM akhir',
      if (_jumlahPekerjaan == 0) 'Rincian pekerjaan (minimal 1 pekerjaan)',
      // v1.0.2: foto grounding / pemerataan wajib (rincian lama tanpa foto dilengkapi lewat kotak foto di kartunya)
      if (HartekLokal.rincianFotoKurang(_doc) > 0) 'Foto grounding / pemerataan (${HartekLokal.rincianFotoKurang(_doc)} rincian belum lengkap)',
    ];
    if (kurang.isNotEmpty) {
      final fokus = _kunciKurangHeader(h);
      await tampilkanWaBelumSiap(
        context,
        kurang: kurang,
        onLengkapi: !_boleh || _sibuk
            ? null
            : () {
                if (fokus != null) {
                  unawaited(_ubahHeader(fokus: fokus));
                } else {
                  unawaited(_tambahPg());
                }
              },
      );
      return;
    }
    // v1.0.17 (sinkron atomik): WA hanya sesudah semua data laporan diterima + divalidasi server
    final n = HartekLokal.hitung(_doc);
    if (!await pastikanTersinkron(context, _store.tahapSinkronLaporan(widget.sesi, _doc),
        menunggu: n.menunggu, gagal: n.gagal, onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()))) {
      return;
    }
    if (!mounted) return;
    final teks = waTeksHartek(
      kodeHeader: _teks(h['kodeHeader']),
      tanggal: _tanggal,
      tim: widget.sesi.timNama,
      ulp: widget.sesi.ulp,
      header: h,
      objek: _objek,
    );
    await tampilkanWa(context, judul: 'Kirim laporan Hartek ke WA', teks: teks);
  }

  /// v0.95.0 / v0.96.0: status kirim seluruh laporan dengan ikon cloud hijau saat semua terkirim.
  /// v1.0.17 (sinkron atomik): hijau hanya sesudah laporan disegel server (ringkasan = rincian = WA).
  Widget _statusKirim() {
    final n = HartekLokal.hitung(_doc);
    return KartuStatusSinkron(
      tahap: _store.tahapSinkronLaporan(widget.sesi, _doc),
      menunggu: n.menunggu,
      gagal: n.gagal,
      keteranganTolak: 'Buka rincian untuk alasannya.',
      onSinkron: () => unawaited(widget.deps.syncCtl.sinkron()),
    );
  }

  /// Kartu laporan tim: info singkat KM + koordinat, angka per jenis pekerjaan, pensil = ubah, + = tambah lokasi PG.
  List<Widget> _halamanLaporan() {
    final h = _header!;
    final kurang = [
      if (angkaDari(_teks(h['kmAwal'])) == null) 'KM awal',
      if (_teks(h['koordinatAwal']).isEmpty) 'koordinat awal',
      if (angkaDari(_teks(h['kmAkhir'])) == null) 'KM akhir',
      if (_teks(h['koordinatAkhir']).isEmpty) 'koordinat akhir',
    ];
    return [
      const SizedBox(height: 4),
      KartuLaporanTim(
        judul: _teks(h['kodeHeader']).isEmpty ? 'Laporan Utama' : _teks(h['kodeHeader']),
        sub: tanggalHartek(_tanggal),
        ikon: Icons.engineering_outlined,
        kmAwal: angkaDari(_teks(h['kmAwal'])),
        kmAkhir: angkaDari(_teks(h['kmAkhir'])),
        koordinatAwal: _teks(h['koordinatAwal']),
        koordinatAkhir: _teks(h['koordinatAkhir']),
        akurasiAwal: angkaDari(_teks(h['_akurasi_koordinatAwal']))?.toDouble(),
        akurasiAkhir: angkaDari(_teks(h['_akurasi_koordinatAkhir']))?.toDouble(),
        angka: [
          // v0.97.0: ketuk satu jenis = rincian jenis itu saja; Total Pekerjaan = seluruh pekerjaan
          for (final j in _urutJenis)
            AngkaRingkas(j == 'Non - Teknik' ? 'Non-Teknik' : j, _pekerjaanJenis(j),
                onTap: _sibuk ? null : () => _bukaRincian(jenis: j)),
          AngkaRingkas('Total Pekerjaan', _jumlahPekerjaan, onTap: _sibuk ? null : () => _bukaRincian()),
        ],
        onTapNilai: _boleh && !_sibuk ? (k) => _ubahHeader(fokus: k) : null,
        catatan: kurang.isEmpty ? null : 'Belum diisi: ${kurang.join(', ')}.',
        bawahKiri: Row(children: [
          Icon(
            HartekLokal.hitung(_doc).gagal > 0
                ? Icons.error_outline_rounded
                : HartekLokal.hitung(_doc).menunggu > 0
                    ? Icons.cloud_upload_outlined
                    : Icons.cloud_done_rounded,
            size: 16,
            color: HartekLokal.hitung(_doc).gagal > 0
                ? AppColors.red100
                : HartekLokal.hitung(_doc).menunggu > 0
                    ? AppColors.accent400
                    : const Color(0xFF4ADE80),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text('${_objek.length} lokasi · $_jumlahPekerjaan pekerjaan · $_jumlahMaterial material',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, color: Colors.white70)),
          ),
        ]),
        // v0.97.5: ketuk sembarang di dalam kartu TIDAK membuka rincian; rincian hanya dibuka dari summary jenis pekerjaan
        onUbah: _boleh && !_sibuk ? _ubahHeader : null,
        tampilWa: true,
        waSiap: kurang.isEmpty && _jumlahPekerjaan > 0,
        onKirimWa: _sibuk ? null : _kirimWa,
        onTambah: _boleh && !_sibuk ? () => _tambahPg() : null,
        labelTambah: 'Tambah Pekerjaan',
      ),
      TandaSinkronHartek(
          node: h,
          onCobaUlang: () => _cobaUlang(_teks(h['headerId'])),
          onBuang: () => _buang(_teks(h['headerId'])),
          padding: const EdgeInsets.only(top: 12)),
      TandaSinkronHartek(
          node: h,
          ubahHeader: true,
          onCobaUlang: () => _cobaUlang(_teks(h['headerId']), ubahHeader: true),
          onBuang: () => _buang(_teks(h['headerId']), ubahHeader: true),
          padding: const EdgeInsets.only(top: 12)),
      _statusKirim(),
      if (_tanggalLain > 0)
        TextButton.icon(
          onPressed: _buangTanggalLain,
          icon: const Icon(Icons.history_rounded, size: 18),
          label: Text('$_tanggalLain data hari sebelumnya tidak terkirim · Buang'),
        ),
      // v1.0.23 (permintaan kvlar 23 Okt 2026): rincian lokasi / pekerjaan tidak lagi di halaman utama, cukup di dalam
      // kartu laporan (ringkasan jenis pekerjaan membuka rincian), sama dengan Inspeksi Jaringan / Gardu v1.0.21.
    ];
  }

  // ---------- halaman: rincian per jenis pekerjaan ----------

  // v0.93.1: isi rincian ada di hartek_rincian.dart (diuji terpisah). Status buka-tutup tetap di sini supaya
  // tidak hilang saat laporan dimuat ulang sesudah simpan.
  final Set<String> _jenisTerbuka = {};
  final Set<String> _lokasiTertutup = {};
  bool _jenisAwal = false;

  List<Widget> _halamanRincian() {
    final saring = widget.jenis;
    final data = saring == null ? _objek : _objek.where((pg) => _teks(pg['jenisPekerjaan']) == saring).toList();
    if (!_jenisAwal && data.isNotEmpty) {
      _jenisAwal = true;   // cukup sekali, supaya ketukan tutup petugas tidak dibatalkan saat muat ulang
      _jenisTerbuka.addAll(saring != null ? <String>{saring} : jenisAwalTerbukaHartek(data));
    }
    return [
      RincianHartek(
        objek: data,
        jenis: saring,
        kodeHeader: _teks(_header!['kodeHeader']),
        terbuka: _jenisTerbuka,
        lokasiTertutup: _lokasiTertutup,
        boleh: _boleh,
        sibuk: _sibuk,
        onBukaTutup: (j) => setState(() {
          if (!_jenisTerbuka.remove(j)) _jenisTerbuka.add(j);
        }),
        onBukaTutupLokasi: (pgId) => setState(() {
          if (!_lokasiTertutup.remove(pgId)) _lokasiTertutup.add(pgId);
        }),
        onBukaLokasi: (pgId) => _bukaDetail(pgId),
        onBukaPekerjaan: (pgId, pkId) => _bukaDetail(pgId, pkId),
        onTambahLokasi: () => _tambahPg(jenisTetap: saring),
        onTambahPekerjaan: _tambahPekerjaan,
        onTambahMaterial: _tambahMaterial,
        onCobaUlang: (id) => _cobaUlang(id),
        onBuang: (id) => _buang(id),
        onUbahPekerjaan: _boleh ? _ubahPekerjaan : null,
        onCobaUlangUbah: (id) => unawaited(_store.cobaUlangUbahPekerjaan(_sesi, id).then((_) => _kirimLatar())),
        onBuangUbah: (id) => unawaited(_store.buangUbahPekerjaan(_sesi, id)),
      ),
    ];
  }

  // ---------- halaman: lokasi PG ----------

  Widget _infoBaris(String label, String nilai) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 116, child: Text(label, style: HartekGaya.sekunder)),
          Expanded(
            child: Text(nilai,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
          ),
        ]),
      );

  Widget _nodePekerjaan(Map<String, dynamic> pk, bool akhir) {
    final hasil = '${_teks(pk['jumlahPekerjaan'])} ${_teks(pk['satuanPekerjaan'])}'.trim();
    final gr = _maps(pk['grounding']).length, pm = _maps(pk['pemerataan']).length;
    final ringkas = [
      if (hasil.isNotEmpty) hasil,
      '${_maps(pk['material']).length} material',
      if (gr > 0) '$gr grounding',
      if (pm > 0) '$pm pemerataan',
    ].join(' · ');
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 22,
          child: Column(children: [
            const SizedBox(height: 24),
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: HartekGaya.merek,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.brand100, width: 3),
              ),
            ),
            Expanded(
              child: akhir
                  ? const SizedBox.shrink()
                  : Container(width: 2, margin: const EdgeInsets.only(top: 4), color: AppColors.brand100),
            ),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: KartuHartek(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
            onTap: _sibuk ? null : () => _bukaDetail(widget.pgId!, _teks(pk['pekerjaanId'])),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_teks(pk['pekerjaan']),
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
                  const SizedBox(height: 4),
                  Text(ringkas, style: HartekGaya.sekunder),
                ]),
              ),
              IkonCloudHartek(node: pk, ukuran: 16),
              const SizedBox(width: 4),
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
            ]),
          ),
        ),
      ]),
    );
  }

  List<Widget> _halamanPg(Map<String, dynamic> pg) {
    final jenis = _teks(pg['jenisPekerjaan']);
    final j = JenisPg.dari(jenis);
    final jobs = _maps(pg['pekerjaan']);
    final info = <(String, String)>[
      if (jenis != 'Jaringan') ('Nomor gardu', _teks(pg['noGardu'])),
      ('Penyulang', _teks(pg['penyulang'])),
      ('Section', _teks(pg['section'])),
      ('Daerah', _teks(pg['daerah'])),
      ('Jumlah gawang', _teks(pg['jumlahGawang'])),
      ('Titik', _teks(pg['koordinat']).isEmpty ? '' : koordinatSingkat(_teks(pg['koordinat']))),   // v0.91.0
    ].where((e) => e.$2.isNotEmpty).toList();
    return [
      const SizedBox(height: 4),
      Row(children: [
        KotakIkon(j, ukuran: 56),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(jenis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: j.warna)),
            const SizedBox(height: 4),
            Text(_lokasi(pg), style: HartekGaya.judulBesar.copyWith(fontSize: 24)),
          ]),
        ),
      ]),
      const SizedBox(height: 18),
      if (info.isNotEmpty)
        KartuHartek(
          padding: const EdgeInsets.fromLTRB(18, 4, 18, 4),
          child: Column(children: [
            for (var n = 0; n < info.length; n++) ...[
              if (n > 0) const Divider(height: 1, color: HartekGaya.garis),
              _infoBaris(info[n].$1, info[n].$2),
            ],
          ]),
        ),
      _judulSeksi('Pekerjaan', info: jobs.isEmpty ? null : '${jobs.length} pekerjaan'),
      if (jobs.isEmpty) ...[
        const KosongHartek(
            ikon: Icons.construction,
            judul: 'Belum ada pekerjaan',
            petunjuk: 'Catat pekerjaan di lokasi ini, lalu material yang dipakai.'),
        const SizedBox(height: 12),
      ],
      for (var n = 0; n < jobs.length; n++) _nodePekerjaan(jobs[n], n == jobs.length - 1),
      _aksiUtama('Tambah Rincian Pekerjaan', () => _tambahPekerjaan(pg)),
      _kode(pg['kodePg']),
    ];
  }

  // ---------- halaman: detail pekerjaan ----------

  Widget _barisMaterial(Map<String, dynamic> m) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(children: [
          Expanded(
            child: Text(_teks(m['material']),
                style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: HartekGaya.tinta)),
          ),
          const SizedBox(width: 12),
          Text(_teks(m['jumlah']),
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: HartekGaya.merek, fontFeatures: HartekGaya.tabular)),
          if (_teks(m['satuan']).isNotEmpty) ...[
            const SizedBox(width: 5),
            Text(_teks(m['satuan']), style: HartekGaya.sekunder),
          ],
          const SizedBox(width: 8),
          IkonCloudHartek(node: m, ukuran: 16),
        ]),
      );

  Widget _ukur(String label, Object? v, bool utama) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
        const SizedBox(height: 2),
        Text(_teks(v).isEmpty ? '–' : (angkaDari(_teks(v)) != null ? '${_teks(v)} Ω' : _teks(v)),
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: utama ? HartekGaya.merek : HartekGaya.tinta,
                fontFeatures: HartekGaya.tabular)),
      ]);

  Widget _kartuGrounding(Map<String, dynamic> pg, Map<String, dynamic> pk, Map<String, dynamic> g) {
    final judul = [_teks(g['jenisPeralatan']), _teks(g['namaPeralatan'])].where((s) => s.isNotEmpty).join(' · ');
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(judul, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta))),
          IkonCloudHartek(node: g, ukuran: 16),
        ]),
        if (_teks(g['kondisiTanah']).isNotEmpty) ...[
          const SizedBox(height: 3),
          Text('Tanah ${_teks(g['kondisiTanah']).toLowerCase()}', style: HartekGaya.sekunder),
        ],
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            Expanded(child: _ukur('Sebelum', g['hasilSebelum'], false)),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 10),
              child: Icon(Icons.arrow_forward_rounded, size: 18, color: AppColors.neutral400),
            ),
            Expanded(child: _ukur('Sesudah', g['hasilSesudah'], true)),
          ]),
        ),
        _fotoKartu('grounding', pg, pk, g),
      ]),
    );
  }

  Widget _batang(num? v, num maks, Color warna) => Container(
        height: 8,
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(color: AppColors.neutral100, borderRadius: BorderRadius.circular(4)),
        child: FractionallySizedBox(
          widthFactor: v == null || maks <= 0 ? 0 : (v / maks).clamp(0, 1).toDouble(),
          child: Container(decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(4))),
        ),
      );

  Widget _fasa(String f, num? seb, num? ses, num maks) {
    String a(num? v) => v == null ? '–' : angkaHartek(v);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(children: [
        SizedBox(
          width: 20,
          child: Text(f, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
        ),
        Expanded(
          child: Column(children: [
            _batang(seb, maks, AppColors.neutral300),
            const SizedBox(height: 5),
            _batang(ses, maks, HartekGaya.merek),
          ]),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 100,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text('${a(seb)} → ${a(ses)} A',
                maxLines: 1,
                style: const TextStyle(fontSize: 13.5, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
          ),
        ),
      ]),
    );
  }

  Widget _legenda(Color warna, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
      ]);

  Widget _kartuPemerataan(Map<String, dynamic> pg, Map<String, dynamic> pk, Map<String, dynamic> p) {
    final seb = [for (final f in _fasaSebelum.values) angkaDari(_teks(p['seb$f']))];
    final ses = [for (final f in _fasaSesudah.values) angkaDari(_teks(p['ses$f']))];
    final maks = [...seb, ...ses].whereType<num>().fold<num>(0, (a, b) => b > a ? b : a);
    final x1 = HartekRepository.ketidakseimbangan(seb), x2 = HartekRepository.ketidakseimbangan(ses);
    final membaik = x1 != null && x2 != null && x2 < x1;
    final fasa = _fasaSebelum.values.toList();
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_teks(p['alamat']).isNotEmpty) ...[
          Text(_teks(p['alamat']), style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
          const SizedBox(height: 10),
        ],
        for (var n = 0; n < 3; n++) _fasa(fasa[n], seb[n], ses[n], maks),
        const SizedBox(height: 8),
        Row(children: [
          _legenda(AppColors.neutral300, 'Sebelum'),
          const SizedBox(width: 16),
          _legenda(HartekGaya.merek, 'Sesudah'),
          const Spacer(),
          IkonCloudHartek(node: p, ukuran: 16),
        ]),
        if (x1 != null || x2 != null) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: membaik ? AppColors.success100 : AppColors.neutral100,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              Icon(Icons.balance, size: 18, color: membaik ? AppColors.success700 : HartekGaya.redup),
              const SizedBox(width: 10),
              Expanded(
                child: Text('Selisih beban ${_persen(x1)} → ${_persen(x2)}',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: membaik ? AppColors.success700 : HartekGaya.tinta,
                        fontFeatures: HartekGaya.tabular)),
              ),
            ]),
          ),
        ],
        _fotoKartu('pemerataan', pg, pk, p),
      ]),
    );
  }

  List<Widget> _halamanPekerjaan(Map<String, dynamic> pg, Map<String, dynamic> pk) {
    final mat = _maps(pk['material']), gr = _maps(pk['grounding']), pm = _maps(pk['pemerataan']);
    final j = JenisPg.dari(_teks(pg['jenisPekerjaan']));
    final hasil = '${_teks(pk['jumlahPekerjaan'])} ${_teks(pk['satuanPekerjaan'])}'.trim();
    return [
      const SizedBox(height: 4),
      Row(children: [
        Icon(j.ikon, size: 18, color: j.warna),
        const SizedBox(width: 8),
        Expanded(
          child: Text(_lokasi(pg),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: j.warna)),
        ),
        IkonCloudHartek(node: pk, ukuran: 18),
      ]),
      const SizedBox(height: 10),
      Text(_teks(pk['pekerjaan']), style: HartekGaya.judulBesar),
      TandaSinkronHartek(
          node: pk,
          ubahHeader: true,
          onCobaUlang: () => unawaited(_store.cobaUlangUbahPekerjaan(_sesi, _teks(pk['pekerjaanId'])).then((_) => _kirimLatar())),
          onBuang: () => unawaited(_store.buangUbahPekerjaan(_sesi, _teks(pk['pekerjaanId']))),
          padding: const EdgeInsets.only(top: 10)),
      if (hasil.isNotEmpty) ...[
        const SizedBox(height: 16),
        KartuHartek(
          padding: const EdgeInsets.fromLTRB(18, 14, 8, 14),
          onTap: _boleh && !_sibuk ? () => _ubahPekerjaan(pg, pk) : null,
          child: Row(children: [
            const Expanded(child: Text('Hasil pekerjaan', style: HartekGaya.sekunder)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(color: j.latar, borderRadius: BorderRadius.circular(999)),
              child: Text(hasil,
                  style: TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800, color: j.warna, fontFeatures: HartekGaya.tabular)),
            ),
            if (_boleh)
              IconButton(
                key: const ValueKey('ubah-hasil-pekerjaan'),
                tooltip: 'Ubah pekerjaan',
                onPressed: _sibuk ? null : () => _ubahPekerjaan(pg, pk),
                icon: const Icon(Icons.edit_outlined, size: 18, color: HartekGaya.redup),
              )
            else
              const SizedBox(width: 10),
          ]),
        ),
      ],

      _judulSeksi('Material terpakai', info: mat.isEmpty ? null : '${mat.length} item'),
      if (mat.isEmpty)
        const KosongHartek(
            ikon: Icons.inventory_2_outlined,
            judul: 'Belum ada material',
            petunjuk: 'Catat material yang benar-benar dipakai untuk pekerjaan ini.')
      else
        KartuHartek(
          padding: const EdgeInsets.fromLTRB(18, 2, 18, 2),
          child: Column(children: [
            for (var n = 0; n < mat.length; n++) ...[
              if (n > 0) const Divider(height: 1, color: HartekGaya.garis),
              _barisMaterial(mat[n]),
            ],
          ]),
        ),
      const SizedBox(height: 12),
      _aksiUtama('Tambah material', () => _tambahMaterial(pk)),
      // v0.97.0: rincian hasil grounding hanya muncul kalau pekerjaannya mengandung kata "grounding"
      if (HartekRepository.groundingBoleh(_teks(pk['pekerjaan'])) || gr.isNotEmpty) ...[
        _judulSeksi('Hasil grounding',
            aksi: _boleh && HartekRepository.groundingBoleh(_teks(pk['pekerjaan']))
                ? _tombolCatat(() => _tambahGrounding(pg, pk))
                : null),
        if (gr.isEmpty)
          _kosongKecil(HartekRepository.groundingHanyaSesudah(_teks(pk['pekerjaan']))
              ? 'Belum ada hasil ukur. Pasang grounding hanya butuh nilai sesudah.'
              : 'Belum ada hasil ukur sebelum dan sesudah perbaikan.'),
        for (final g in gr) _kartuGrounding(pg, pk, g),
      ],
      if (HartekRepository.pemerataanBoleh(_teks(pk['pekerjaan']))) ...[
        _judulSeksi('Pemerataan beban', aksi: _boleh ? _tombolCatat(() => _tambahPemerataan(pg, pk)) : null),
        if (pm.isEmpty) _kosongKecil('Belum ada pengukuran beban R / S / T.'),
        for (final p in pm) _kartuPemerataan(pg, pk, p),
      ],
      _kode(pk['kodePekerjaan']),
    ];
  }

  // ---------- susunan ----------

  List<Widget> _konten() {
    if (!_akses) {
      return [
        const SizedBox(height: 12),
        KosongHartek(ikon: Icons.cloud_off_outlined, judul: 'Laporan belum bisa dimuat', petunjuk: 'Akses Input Hartek belum tersedia untuk akun ini.'),
        const SizedBox(height: 14),
        OutlinedButton(
          onPressed: _segarkan,
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          child: const Text('Coba lagi'),
        ),
      ];
    }
    if (_header == null) return _halamanAwal();
    if (widget.rincian) return _halamanRincian();
    if (widget.pgId == null) return _halamanLaporan();
    final pilih = _objek.where((pg) => pg['pgId'] == widget.pgId).toList();
    if (pilih.isEmpty) {
      return const [
        KosongHartek(
            ikon: Icons.place_outlined,
            judul: 'Lokasi tidak ada di laporan hari ini',
            petunjuk: 'Kembali ke laporan untuk melihat data terbaru. Hari laporan mungkin sudah berganti.'),
      ];
    }
    final pg = pilih.first;
    if (widget.pekerjaanId == null) return _halamanPg(pg);
    final pk = _maps(pg['pekerjaan']).where((p) => p['pekerjaanId'] == widget.pekerjaanId).toList();
    if (pk.isEmpty) {
      return const [
        KosongHartek(
            ikon: Icons.construction, judul: 'Pekerjaan tidak ditemukan', petunjuk: 'Kembali dan segarkan lokasi pekerjaan.'),
      ];
    }
    return _halamanPekerjaan(pg, pk.first);
  }

  @override
  Widget build(BuildContext context) {
    final bertingkat = widget.pgId != null || widget.rincian;
    final judul = widget.pekerjaanId != null
        ? 'Detail pekerjaan'
        : widget.pgId != null
            ? 'Lokasi pekerjaan'
            : widget.rincian
                ? 'Rincian pekerjaan'
                : 'Hartek';
    final sub = [widget.sesi.timNama, if (_tanggal.isNotEmpty) tanggalHartek(_tanggal)].where((s) => s.isNotEmpty).join(' · ');
    // v1.0.28 (permintaan kvlar 23 Okt 2026): header kartu Jaringan SiSi (siluet jaringan) seperti modul lain, tetap di
    // atas layar; halaman utama = menu Laporan Hartek.
    final header = HeaderInsJar(
      kicker: 'Laporan Hartek',
      judul: bertingkat ? judul : (widget.sesi.timNama.isEmpty ? 'Hartek' : widget.sesi.timNama),
      sub: bertingkat ? sub : (_tanggal.isEmpty ? '' : tanggalHartek(_tanggal)),
      ikon: widget.pekerjaanId != null
          ? Icons.construction_rounded
          : widget.pgId != null
              ? Icons.place_outlined
              : widget.rincian
                  ? Icons.list_alt_rounded
                  : Icons.handyman_rounded,
      lonceng: !bertingkat, // v1.0.19
      aksi: [
        tombolSegarkanHeader(_segarkan, tip: 'Segarkan laporan', sibuk: _segar || _sibuk), // v1.0.22
        if (bertingkat) ...[
          const SizedBox(width: 6),
          tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context)),
        ],
      ],
    );
    return Scaffold(
      backgroundColor: bertingkat ? HartekGaya.latar : Colors.transparent, // v1.0.19: tab utama = latar bg-sisi
      body: SafeArea(
        bottom: false,
        child: HalamanHeaderTetap(
          header: header,
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
          lebarMaks: 680,
          isi: _doc == null && _akses
          ? const Center(child: SisiLoader())
          : RefreshSisi(
              onRefresh: () async {
                if (!_sibuk) await _segarkan();
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(20, 0, 20, bertingkat ? 32 : 120),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 680),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _konten()),
                    ),
                  ),
                ],
              ),
            ),
        ),
      ),
    );
  }
}
