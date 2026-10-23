import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/navigasi.dart';
import 'package:uuid/uuid.dart';

import '../../core/api_client.dart';
import '../../core/deps.dart';
import '../../core/kode_error.dart';
import '../../core/sesi.dart';
import '../../core/wib.dart';
import '../../theme/app_colors.dart';
import '../../widgets/kalender_bulan.dart';
import '../../widgets/kolom_pilih.dart';
import '../../widgets/sisi_loader.dart';
import '../../widgets/sisi_motif.dart';
import '../../widgets/wa_panel.dart';
import '../hartek/hartek_gaya.dart';
import '../insjar/insjar_header.dart';
import 'jadwal_padam_bantu.dart';
import '../../widgets/refresh_sisi.dart';

/// v1.0.18: daftar dikelompokkan per tanggal (baris ringkas, rincian + aksi di lembar bawah), chip penyulang selalu
/// terlihat (master + jadwal), kartu Kirim WA rentang tanggal khusus admin, ENS rupiah bulat.
/// v1.0.17 (permintaan kvlar 22 Okt 2026): Jadwal Padam (menu admin OPS_JADWAL_PADAM), port SiSi_Mobile v1
/// (jadwal_padam_screen.dart, kalender_jadwal_editor.dart, jadwal_padam_calendar.dart) ke v2:
///  - daftar + kalender bulan, filter penyulang / status jadwal / status pekerjaan, ringkasan periode;
///  - jadwal baru / ubah (selama Terjadwal) dengan dampak otomatis dari Master Daerah Padam (gardu, pelanggan, daerah,
///    VIP, beban, durasi, ENS);
///  - tandai Terealisasi / Batal Pemadaman, hapus (hanya Terjadwal);
///  - Format WA rentang tanggal (dari .. sampai), hanya ada di menu admin ini.
class JadwalPadamScreen extends StatefulWidget {
  const JadwalPadamScreen({super.key, required this.deps, required this.sesi});
  final Deps deps;
  final Sesi sesi;

  static const menu = 'OPS_JADWAL_PADAM';

  @override
  State<JadwalPadamScreen> createState() => _JadwalPadamScreenState();
}

class _JadwalPadamScreenState extends State<JadwalPadamScreen> {
  late DateTime _bulan;
  late DateTimeRange _rentang;
  List<Map<String, dynamic>> _master = const [];
  List<Map<String, dynamic>> _jadwal = const [];
  Map<String, dynamic> _ringkas = const {};
  String? _penyulang, _status, _statusPekerjaan;
  bool _kalender = false, _muat = false, _sibuk = false;
  final Set<String> _penyulangDikenal = {};   // v1.0.18: penyulang yang pernah tampil (filter tetap lengkap)
  DateTime? _hari;
  String? _galat;

  Sesi get _sesi => widget.sesi;
  bool get _boleh => _sesi.bisaUbah(JadwalPadamScreen.menu);
  bool get _admin => _sesi.role != 'PETUGAS';   // v1.0.18: WA rentang tanggal khusus admin

  DateTime get _hariIni {
    final k = Wib.dinding(DateTime.now());
    return DateTime(k.year, k.month, k.day);
  }

  @override
  void initState() {
    super.initState();
    final k = _hariIni;
    _bulan = DateTime(k.year, k.month, 1);
    _rentang = DateTimeRange(start: _bulan, end: DateTime(k.year, k.month + 1, 0));
    unawaited(_mulai());
  }

  Future<Map<String, dynamic>> _api(String aksi, Map<String, dynamic> data) =>
      widget.deps.api.call(aksi, token: _sesi.token, data: data);

  void _pesan(String p) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(p)));

  String _galatDari(Object e) => e is ApiException
      ? (e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk Jadwal Padam.' : KodeError.pesan(e.kode))
      : 'Butuh sinyal untuk Jadwal Padam.';

  Future<void> _mulai() async {
    try {
      final m = await _api('getMasterJadwalPadam', const {});
      if (mounted) setState(() => _master = daftarJp(m['daerah']));
    } catch (_) {/* daftar tetap dicoba */}
    await _muatJadwal();
  }

  Future<void> _muatJadwal() async {
    if (_muat) return;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await _api('getJadwalPadam', {
        'dari': isoHari(_rentang.start),
        'sampai': isoHari(_rentang.end),
        if (_penyulang != null) 'penyulang': _penyulang,
        if (_status != null) 'status': _status,
        if (_statusPekerjaan != null) 'statusPekerjaan': _statusPekerjaan,
      });
      if (!mounted) return;
      setState(() {
        _jadwal = daftarJp(r['jadwal']);
        _penyulangDikenal.addAll(_jadwal.map((j) => teksJp(j['penyulang'])));
        _ringkas = r['ringkas'] is Map ? Map<String, dynamic>.from(r['ringkas'] as Map) : const {};
      });
    } catch (e) {
      if (mounted) setState(() => _galat = _galatDari(e));
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  Future<void> _pilihRentang() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: DateTime(_hariIni.year + 2, 12, 31),
      initialDateRange: _rentang,
      helpText: 'Periode jadwal padam',
    );
    if (r == null || !mounted) return;
    setState(() {
      _rentang = r;
      _bulan = DateTime(r.start.year, r.start.month, 1);
      _hari = null;
    });
    await _muatJadwal();
  }

  Future<void> _gantiBulan(DateTime b) async {
    setState(() {
      _bulan = b;
      _rentang = DateTimeRange(start: b, end: DateTime(b.year, b.month + 1, 0));
      _hari = null;
    });
    await _muatJadwal();
  }

  Future<void> _pilihFilter(String judul, List<String> pilihan, String? kini, ValueChanged<String?> atur) async {
    final hasil = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(judul, style: HartekGaya.judulSeksi)),
          ListTile(
            leading: Icon(kini == null ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: HartekGaya.merek),
            title: const Text('Semua'),
            onTap: () => Navigator.pop(c, ''),
          ),
          for (final p in pilihan)
            ListTile(
              leading: Icon(kini == p ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: HartekGaya.merek),
              title: Text(p),
              onTap: () => Navigator.pop(c, p),
            ),
        ]),
      ),
    );
    if (hasil == null || !mounted) return;
    setState(() => atur(hasil.isEmpty ? null : hasil));
    await _muatJadwal();
  }

  Future<void> _bukaForm({Map<String, dynamic>? jadwal}) async {
    if (_master.isEmpty) {
      _pesan('Master Daerah Padam belum termuat / kosong. Periksa sinyal atau isi db_Daerah_Padam.');
      return;
    }
    final ok = await bukaForm<bool>(
      context,
      MaterialPageRoute(builder: (_) => FormJadwalPadam(deps: widget.deps, sesi: _sesi, master: _master, jadwal: jadwal)),
    );
    if (ok == true && mounted) await _muatJadwal();
  }

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

  Future<void> _aksi(Map<String, dynamic> j, String aksi) async {
    final kode = teksJp(j['kode']);
    final rev = num.tryParse(teksJp(j['revision']))?.toInt() ?? 1;
    final id = teksJp(j['jadwalId']);
    try {
      switch (aksi) {
        case 'UBAH':
          await _bukaForm(jadwal: j);
          return;
        case 'REALISASI':
          if (!await _yakin('Tandai terealisasi?', 'Jadwal $kode ditandai Terealisasi dan tidak bisa diubah lagi.', 'Terealisasi')) return;
          setState(() => _sibuk = true);
          await _api('ubahStatusJadwalPadam', {'jadwalId': id, 'revision': rev, 'status': StatusJadwalPadam.realisasi});
          _pesan('Jadwal $kode terealisasi.');
        case 'BATAL':
          if (!await _yakin('Batalkan pemadaman?', 'Jadwal $kode ditandai Batal Pemadaman.', 'Batalkan', warna: AppColors.red700)) return;
          setState(() => _sibuk = true);
          await _api('ubahStatusJadwalPadam', {'jadwalId': id, 'revision': rev, 'status': StatusJadwalPadam.batal});
          _pesan('Jadwal $kode dibatalkan.');
        case 'HAPUS':
          if (!await _yakin('Hapus jadwal padam?', '$kode · ${teksJp(j['penyulang'])} ${teksJp(j['section'])}\n${labelTanggalJp(teksJp(j['tanggal']))}',
              'Hapus',
              warna: AppColors.red700)) {
            return;
          }
          setState(() => _sibuk = true);
          await _api('hapusJadwalPadam', {'jadwalId': id, 'revision': rev});
          _pesan('Jadwal $kode dihapus.');
      }
      await _muatJadwal();
    } catch (e) {
      if (mounted) _pesan(_galatDari(e));
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  /// Format WA rentang tanggal (khusus menu admin Jadwal Padam).
  Future<void> _formatWa() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: DateTime(_hariIni.year + 2, 12, 31),
      initialDateRange: _rentang,
      helpText: 'Rentang tanggal untuk format WA',
      saveText: 'Buat WA',
    );
    if (r == null || !mounted) return;
    setState(() => _sibuk = true);
    try {
      final w = await _api('getWaJadwalPadam', {
        'dari': isoHari(r.start),
        'sampai': isoHari(r.end),
        if (_penyulang != null) 'penyulang': _penyulang,
      });
      if (!mounted) return;
      await tampilkanWa(context, judul: 'WA Jadwal Padam (${teksJp(w['jumlah'])} jadwal)', teks: teksJp(w['teks']));
    } catch (e) {
      if (mounted) _pesan(_galatDari(e));
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _chip(String label, String? nilai, IconData ikon, VoidCallback onTap) => FilterChip(
        selected: nilai != null,
        onSelected: (_) => onTap(),
        avatar: Icon(ikon, size: 18),
        showCheckmark: false,
        label: Text(nilai == null ? label : '$label: $nilai'),
      );

  // ---------- tampilan (v1.0.18: daftar ringkas per tanggal, rincian di lembar bawah) ----------

  /// v1.0.18: daftar penyulang filter = master Daerah Padam + penyulang yang pernah tampil di jadwal (master kosong /
  /// gagal dimuat tetap ada rincian penyulang).
  List<String> get _daftarPenyulang =>
      ({for (final d in _master) teksJp(d['penyulang']), ..._penyulangDikenal}..remove('')).toList()..sort();

  Map<String, int> get _jumlahPerPenyulang {
    final m = <String, int>{};
    for (final j in _jadwal) {
      final p = teksJp(j['penyulang']);
      m[p] = (m[p] ?? 0) + 1;
    }
    return m;
  }

  (Color, Color) _warnaStatus(String status) => switch (status) {
        StatusJadwalPadam.realisasi => (AppColors.success700, AppColors.success100),
        StatusJadwalPadam.batal => (AppColors.red700, AppColors.red100),
        _ => (HartekGaya.merek, AppColors.brand100),
      };

  Widget _pil(String t, Color warna, Color latar) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
        child: Text(t, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: warna)),
      );

  Widget _chipPenyulang(List<String> semua) {
    final n = _jumlahPerPenyulang;
    Widget chip(String label, String? nilai, int? jumlah) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            selected: _penyulang == nilai,
            showCheckmark: false,
            avatar: nilai == null ? const Icon(Icons.electric_bolt_rounded, size: 16) : null,
            label: Text(jumlah == null ? label : '$label · $jumlah'),
            onSelected: _muat
                ? null
                : (_) {
                    setState(() => _penyulang = nilai);
                    unawaited(_muatJadwal());
                  },
          ),
        );
    return SizedBox(
      height: 40,
      child: ListView(scrollDirection: Axis.horizontal, children: [
        chip('Semua penyulang', null, null),
        for (final p in semua) chip(p, p, _penyulang == null ? (n[p] ?? 0) : null),
      ]),
    );
  }

  Widget _ringkasan() {
    int n(String k) => num.tryParse(teksJp(_ringkas[k]))?.toInt() ?? 0;
    return Column(children: [
      Row(children: [
        Expanded(child: AngkaSisi(label: 'Terjadwal', nilai: '${n('terjadwal')}', ikon: Icons.event_note_rounded)),
        const SizedBox(width: 8),
        Expanded(child: AngkaSisi(label: 'Terealisasi', nilai: '${n('terealisasi')}', ikon: Icons.task_alt_rounded, warna: AppColors.success700)),
        const SizedBox(width: 8),
        Expanded(child: AngkaSisi(label: 'Batal', nilai: '${n('batal')}', ikon: Icons.cancel_outlined, warna: AppColors.red700)),
      ]),
      const SizedBox(height: 8),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: AppColors.accent100, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFF6E3A1))),
        child: Wrap(spacing: 14, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          _fakta(Icons.power_off_outlined, '${n('padam')} pemadaman'),
          _fakta(Icons.people_alt_outlined, '${angkaIdJp(n('pelanggan'))} pelanggan'),
          _fakta(Icons.payments_outlined, 'ENS ${rupiahJp(_ringkas['ens'])}'),
        ]),
      ),
    ]);
  }

  Widget _fakta(IconData i, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(i, size: 16, color: AppColors.accent700),
        const SizedBox(width: 5),
        Text(t, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
      ]);

  /// Kartu admin: kirim WA rentang tanggal (fitur v1), selalu terlihat (bukan ikon tersembunyi di header).
  Widget _kartuWa() => Material(
        color: const Color(0xFFE7F7EE),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFBFE8D0))),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: _sibuk ? null : () => unawaited(_formatWa()),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
            child: Row(children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: const Color(0xFF1E9E5A), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.chat_rounded, color: Colors.white, size: 21),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Kirim WA jadwal padam', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: Color(0xFF0F5132))),
                  Text(
                    _penyulang == null ? 'Pilih rentang tanggal · semua penyulang' : 'Pilih rentang tanggal · penyulang $_penyulang',
                    style: const TextStyle(fontSize: 12.5, color: Color(0xFF2F6B4C)),
                  ),
                ]),
              ),
              const Icon(Icons.date_range_rounded, color: Color(0xFF1E9E5A)),
            ]),
          ),
        ),
      );

  /// Satu jadwal = satu baris ringkas (jam, penyulang · section, jenis, status). Ketuk = rincian + aksi.
  Widget _baris(Map<String, dynamic> j) {
    final status = teksJp(j['status']);
    final padam = teksJp(j['statusPekerjaan']) != 'Tanpa Padam';
    final (w, l) = _warnaStatus(status);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: KartuHartek(
        padding: EdgeInsets.zero,
        onTap: () => unawaited(_rincian(j)),
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 4, color: padam ? WarnaKalender.padam : WarnaKalender.pekerjaan),
            Container(
              width: 66,
              padding: const EdgeInsets.symmetric(vertical: 10),
              color: padam ? const Color(0xFFFDF1EB) : AppColors.brand50,
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(teksJp(j['jamPadam']),
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: HartekGaya.tinta, fontFeatures: HartekGaya.tabular)),
                Text(teksJp(j['jamNyala']), style: const TextStyle(fontSize: 12, color: HartekGaya.redup, fontFeatures: HartekGaya.tabular)),
              ]),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('${teksJp(j['penyulang'])} · ${teksJp(j['section'])}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                  Text(teksJp(j['jenis']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
                  const SizedBox(height: 5),
                  Row(children: [
                    _pil(status == StatusJadwalPadam.batal ? 'Batal' : status, w, l),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text('${angkaIdJp(num.tryParse(teksJp(j['jumlahPelanggan'])) ?? 0)} plg · ${teksJp(j['jumlahGardu'])} gardu',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
                    ),
                  ]),
                ]),
              ),
            ),
            const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.chevron_right_rounded, color: AppColors.neutral400)),
          ]),
        ),
      ),
    );
  }

  /// Rincian satu jadwal + aksi (ubah / terealisasi / batal / hapus) di lembar bawah.
  Future<void> _rincian(Map<String, dynamic> j) async {
    final status = teksJp(j['status']);
    final terjadwal = status == StatusJadwalPadam.jadwal;
    final (w, l) = _warnaStatus(status);
    Widget baris(IconData i, String label, String nilai) => nilai.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(i, size: 18, color: HartekGaya.merek),
              const SizedBox(width: 10),
              SizedBox(width: 92, child: Text(label, style: const TextStyle(fontSize: 13, color: HartekGaya.redup))),
              Expanded(child: Text(nilai, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta))),
            ]),
          );
    final aksi = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .85),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 0, 20, 16), children: [
            Text('${teksJp(j['penyulang'])} · ${teksJp(j['section'])}', style: HartekGaya.judulSeksi),
            const SizedBox(height: 4),
            Text('${teksJp(j['hari'])}, ${labelTanggalJp(teksJp(j['tanggal']))}', style: HartekGaya.sekunder),
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              _pil(status, w, l),
              _pil(teksJp(j['statusPekerjaan']).isEmpty ? 'Padam' : teksJp(j['statusPekerjaan']), const Color(0xFFB4451B), const Color(0xFFFDEBE3)),
            ]),
            const SizedBox(height: 16),
            baris(Icons.schedule_rounded, 'Jam', '${teksJp(j['jamPadam'])} – ${teksJp(j['jamNyala'])} WIB · ${durasiTeksJp(j['durasi'])}'),
            baris(Icons.handyman_outlined, 'Pekerjaan', teksJp(j['jenis'])),
            baris(Icons.place_outlined, 'Lokasi', teksJp(j['lokasi'])),
            baris(Icons.map_outlined, 'Daerah padam', teksJp(j['daerah'])),
            baris(Icons.electrical_services_outlined, 'Gardu', '${teksJp(j['jumlahGardu'])} unit'),
            baris(Icons.people_alt_outlined, 'Pelanggan', angkaIdJp(num.tryParse(teksJp(j['jumlahPelanggan'])) ?? 0)),
            baris(Icons.star_outline_rounded, 'Pelanggan VIP', teksJp(j['vip'])),
            baris(Icons.bolt_outlined, 'Beban', '${angkaIdJp(num.tryParse(teksJp(j['bebanA'])) ?? 0, 2)} A'),
            baris(Icons.payments_outlined, 'ENS', rupiahJp(j['ensRupiah'])),
            baris(Icons.tag_rounded, 'Kode', teksJp(j['kode'])),
            if (_boleh) ...[
              const SizedBox(height: 8),
              if (!terjadwal)
                const Text('Jadwal sudah final (terkunci).', style: TextStyle(fontSize: 13, color: HartekGaya.redup))
              else ...[
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                        onPressed: () => Navigator.pop(c, 'UBAH'), icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Ubah')),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: AppColors.success700),
                        onPressed: () => Navigator.pop(c, 'REALISASI'),
                        icon: const Icon(Icons.task_alt_rounded, size: 18),
                        label: const Text('Terealisasi')),
                  ),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.red700),
                        onPressed: () => Navigator.pop(c, 'BATAL'),
                        icon: const Icon(Icons.cancel_outlined, size: 18),
                        label: const Text('Batal padam')),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(foregroundColor: AppColors.red700),
                        onPressed: () => Navigator.pop(c, 'HAPUS'),
                        icon: const Icon(Icons.delete_outline_rounded, size: 18),
                        label: const Text('Hapus')),
                  ),
                ]),
              ],
            ],
          ]),
        ),
      ),
    );
    if (aksi != null && mounted) await _aksi(j, aksi);
  }

  /// Daftar dikelompokkan per tanggal: judul tanggal + jumlah, lalu baris ringkas.
  List<Widget> _perTanggal(List<Map<String, dynamic>> daftar) {
    final grup = <String, List<Map<String, dynamic>>>{};
    for (final j in daftar) {
      grup.putIfAbsent(teksJp(j['tanggal']), () => []).add(j);
    }
    final hariIni = isoHari(_hariIni);
    return [
      for (final e in grup.entries) ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 6, 2, 8),
          child: Row(children: [
            Text(
                e.key == hariIni
                    ? 'Hari ini · ${labelTanggalJp(e.key)}'
                    : '${teksJp(e.value.first['hari'])}, ${labelTanggalJp(e.key)}',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: e.key == hariIni ? HartekGaya.merek : HartekGaya.tinta)),
            const SizedBox(width: 8),
            Expanded(child: Container(height: 1, color: HartekGaya.garis)),
            const SizedBox(width: 8),
            Text('${e.value.length} jadwal', style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
          ]),
        ),
        for (final j in e.value) _baris(j),
      ],
    ];
  }

  Map<String, List<TandaHari>> _tanda() {
    final m = <String, ({int padam, int tanpa})>{};
    for (final j in _jadwal) {
      if (teksJp(j['status']) == StatusJadwalPadam.batal) continue;
      final k = teksJp(j['tanggal']);
      final x = m[k] ?? (padam: 0, tanpa: 0);
      m[k] = teksJp(j['statusPekerjaan']) == 'Tanpa Padam' ? (padam: x.padam, tanpa: x.tanpa + 1) : (padam: x.padam + 1, tanpa: x.tanpa);
    }
    return {
      for (final e in m.entries)
        e.key: [
          if (e.value.padam > 0) TandaHari(WarnaKalender.padam, e.value.padam, 'padam'),
          if (e.value.tanpa > 0) TandaHari(WarnaKalender.pekerjaan, e.value.tanpa, 'tanpa padam'),
        ],
    };
  }

  @override
  Widget build(BuildContext context) {
    final penyulang = _daftarPenyulang;
    final tampil = _kalender && _hari != null ? _jadwal.where((j) => teksJp(j['tanggal']) == isoHari(_hari!)).toList() : _jadwal;
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      floatingActionButton: _boleh
          ? FloatingActionButton.extended(
              onPressed: _sibuk ? null : () => unawaited(_bukaForm()),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Jadwal baru'),
            )
          : null,
      body: SafeArea(
        bottom: false,
        child: RefreshSisi(
          onRefresh: _muatJadwal,
          child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 10, 16, 110), children: [
            HeaderInsJar(
              kicker: 'Jadwal Padam',
              judul: _penyulang ?? 'Semua penyulang',
              sub: '${_jadwal.length} jadwal · ${labelTanggalJp(isoHari(_rentang.start))} – ${labelTanggalJp(isoHari(_rentang.end))}',
              ikon: Icons.calendar_month_rounded,
              aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
            ),
            if (_admin) ...[_kartuWa(), const SizedBox(height: 12)],
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _muat ? null : _pilihRentang,
                  icon: const Icon(Icons.date_range_rounded, size: 18),
                  label: Text('${labelTanggalJp(isoHari(_rentang.start))} – ${labelTanggalJp(isoHari(_rentang.end))}', overflow: TextOverflow.ellipsis),
                ),
              ),
              const SizedBox(width: 8),
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: false, icon: Icon(Icons.view_agenda_outlined), tooltip: 'Daftar per tanggal'),
                  ButtonSegment(value: true, icon: Icon(Icons.calendar_view_month_rounded), tooltip: 'Kalender bulan'),
                ],
                selected: {_kalender},
                onSelectionChanged: (v) => setState(() {
                  _kalender = v.first;
                  _hari = null;
                }),
              ),
            ]),
            const SizedBox(height: 10),
            _chipPenyulang(penyulang),
            const SizedBox(height: 6),
            Row(children: [
              _chip('Status', _status, Icons.flag_outlined,
                  () => unawaited(_pilihFilter('Status jadwal', StatusJadwalPadam.semua, _status, (v) => _status = v))),
              const SizedBox(width: 8),
              _chip('Pekerjaan', _statusPekerjaan, Icons.power_off_outlined,
                  () => unawaited(_pilihFilter('Status pekerjaan', const ['Padam', 'Tanpa Padam'], _statusPekerjaan, (v) => _statusPekerjaan = v))),
            ]),
            const SizedBox(height: 12),
            _ringkasan(),
            const SizedBox(height: 14),
            if (_kalender) ...[
              KalenderBulan(
                bulan: _bulan,
                tanda: _tanda(),
                dipilih: _hari,
                hariIni: _hariIni,
                sibuk: _muat,
                onPilih: (d) => setState(() => _hari = _hari != null && isoHari(_hari!) == isoHari(d) ? null : d),
                onGantiBulan: (b) => unawaited(_gantiBulan(b)),
              ),
              const SizedBox(height: 8),
              const LegendaKalender(butir: [(WarnaKalender.padam, 'Padam'), (WarnaKalender.pekerjaan, 'Tanpa padam')]),
              const SizedBox(height: 8),
            ],
            if (_galat != null)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(14)),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded, color: AppColors.red700),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_galat!, style: const TextStyle(color: AppColors.red700))),
                  TextButton(onPressed: _muatJadwal, child: const Text('Coba lagi')),
                ]),
              ),
            if (_muat && _jadwal.isEmpty)
              const Padding(padding: EdgeInsets.only(top: 30), child: Center(child: SisiLoader()))
            else if (tampil.isEmpty)
              KosongHartek(
                ikon: Icons.event_busy_outlined,
                judul: _hari != null ? 'Tidak ada jadwal di tanggal ini' : 'Tidak ada jadwal padam',
                petunjuk: 'Ubah periode / filter, atau ketuk Jadwal baru.',
              )
            else
              ..._perTanggal(tampil),
          ]),
        ),
      ),
    );
  }
}

/// Form jadwal baru / ubah (port _JadwalForm v1): penyulang + section dari Master Daerah Padam, dampak otomatis.
class FormJadwalPadam extends StatefulWidget {
  const FormJadwalPadam({super.key, required this.deps, required this.sesi, required this.master, this.jadwal});
  final Deps deps;
  final Sesi sesi;
  final List<Map<String, dynamic>> master;
  final Map<String, dynamic>? jadwal;

  @override
  State<FormJadwalPadam> createState() => _FormJadwalPadamState();
}

class _FormJadwalPadamState extends State<FormJadwalPadam> {
  static const _uuid = Uuid();
  final _form = GlobalKey<FormState>();
  late final TextEditingController _jenis = TextEditingController(text: teksJp(widget.jadwal?['jenis']));
  late final TextEditingController _lokasi = TextEditingController(text: teksJp(widget.jadwal?['lokasi']));
  late String _penyulang = teksJp(widget.jadwal?['penyulang']);
  late String _section = teksJp(widget.jadwal?['section']);
  late String _kerja = teksJp(widget.jadwal?['statusPekerjaan']).isEmpty ? 'Padam' : teksJp(widget.jadwal?['statusPekerjaan']);
  late DateTime _tanggal = DateTime.tryParse(teksJp(widget.jadwal?['tanggal'])) ?? DateTime.now();
  late TimeOfDay _padam = jamDariTeksJp(teksJp(widget.jadwal?['jamPadam']), const TimeOfDay(hour: 9, minute: 0));
  late TimeOfDay _nyala = jamDariTeksJp(teksJp(widget.jadwal?['jamNyala']), const TimeOfDay(hour: 12, minute: 0));
  late final String _idBaris = _uuid.v4();
  bool _simpan = false;

  /// v1.0.20: pilihan penyulang / section = db_Daerah_Padam, dimuat ulang saat form dibuka (baris master baru langsung muncul).
  late List<Map<String, dynamic>> _master = widget.master;

  @override
  void initState() {
    super.initState();
    unawaited(_segarkanMaster());
  }

  Future<void> _segarkanMaster() async {
    try {
      final m = await widget.deps.api.call('getMasterJadwalPadam', token: widget.sesi.token, data: const {});
      final baru = daftarJp(m['daerah']);
      if (mounted && baru.isNotEmpty) setState(() => _master = baru);
    } catch (_) {/* tanpa sinyal: master dari layar daftar */}
  }

  @override
  void dispose() {
    _jenis.dispose();
    _lokasi.dispose();
    super.dispose();
  }

  Map<String, dynamic>? get _daerah {
    for (final d in _master) {
      if (teksJp(d['penyulang']) == _penyulang && teksJp(d['section']) == _section) return d;
    }
    return null;
  }

  Future<void> _kirim() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _simpan = true);
    final ubah = widget.jadwal != null;
    final data = <String, dynamic>{
      'penyulang': _penyulang,
      'section': _section,
      'jenis': _jenis.text.trim(),
      'tanggal': isoHari(_tanggal),
      'jamPadam': jamTeksJp(_padam),
      'jamNyala': jamTeksJp(_nyala),
      'statusPekerjaan': _kerja,
      if (_lokasi.text.trim().isNotEmpty) 'lokasi': _lokasi.text.trim(),
      if (ubah) 'jadwalId': teksJp(widget.jadwal!['jadwalId']),
      if (ubah) 'revision': num.tryParse(teksJp(widget.jadwal!['revision']))?.toInt() ?? 1,
      if (!ubah) 'idBaris': _idBaris,
    };
    try {
      final r = await widget.deps.api.call(ubah ? 'ubahJadwalPadam' : 'simpanJadwalPadam', token: widget.sesi.token, data: data);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Jadwal ${teksJp(r['kode'])} tersimpan.')));
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.kode.startsWith('HTTP_') ? 'Butuh sinyal untuk menyimpan jadwal.' : KodeError.pesan(e.kode)),
            backgroundColor: AppColors.red600));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Butuh sinyal untuk menyimpan jadwal.')));
    } finally {
      if (mounted) setState(() => _simpan = false);
    }
  }

  Widget _tile(String label, String nilai, IconData ikon, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: ListTile(
          tileColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13), side: const BorderSide(color: HartekGaya.garis)),
          title: Text(label, style: const TextStyle(fontSize: 12, color: HartekGaya.redup)),
          subtitle: Text(nilai, style: const TextStyle(fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
          trailing: Icon(ikon),
          onTap: onTap,
        ),
      );

  @override
  Widget build(BuildContext context) {
    final penyulang = ({for (final d in _master) teksJp(d['penyulang'])}..remove('')).toList()..sort();
    final section = [for (final d in _master) if (teksJp(d['penyulang']) == _penyulang) teksJp(d['section'])]..sort();
    final d = _daerah;
    final durasi = durasiJamJp(jamTeksJp(_padam), jamTeksJp(_nyala));
    InputDecoration dekor(String l) => InputDecoration(
          labelText: l,
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: const BorderSide(color: HartekGaya.garis)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(13), borderSide: const BorderSide(color: HartekGaya.garis)),
        );
    return Scaffold(
      backgroundColor: HartekGaya.latar,
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 24), children: [
            HeaderInsJar(
              kicker: 'Jadwal Padam',
              judul: widget.jadwal == null ? 'Jadwal baru' : 'Ubah jadwal',
              sub: widget.jadwal == null ? 'Dampak dihitung dari Master Daerah Padam' : teksJp(widget.jadwal!['kode']),
              ikon: Icons.edit_calendar_rounded,
              aksi: [tombolHeaderInsJar(Icons.arrow_back_rounded, 'Kembali', () => Navigator.maybePop(context))],
            ),
            KolomPilih(
              key: const ValueKey('jp-penyulang'),
              label: 'Penyulang',
              pilihan: [for (final p in penyulang) PilihanItem(p, p)],
              nilaiAwal: _penyulang.isEmpty ? null : _penyulang,
              onChanged: (v) => setState(() {
                _penyulang = v;
                _section = '';
              }),
              validator: (v) => (v ?? '').isEmpty ? 'Penyulang wajib dipilih' : null,
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text('${penyulang.length} penyulang dari db_Daerah_Padam', style: const TextStyle(fontSize: 11.5, color: HartekGaya.redup)),
            ),
            const SizedBox(height: 14),
            KolomPilih(
              key: ValueKey('jp-section-$_penyulang'),
              label: 'Section',
              pilihan: [for (final s in section) PilihanItem(s, s)],
              nilaiAwal: _section.isEmpty ? null : _section,
              onChanged: (v) => setState(() => _section = v),
              validator: (v) => (v ?? '').isEmpty ? 'Section wajib dipilih' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _jenis,
              maxLines: 2,
              maxLength: 200,
              decoration: dekor('Jenis pekerjaan'),
              validator: (v) => (v ?? '').trim().isEmpty ? 'Jenis pekerjaan wajib diisi' : null,
            ),
            _tile('Tanggal', labelTanggalJp(isoHari(_tanggal)), Icons.calendar_today_outlined, () async {
              // v1.0.20: kalender bertitik merah di tanggal yang sudah punya jadwal padam + rincian di bawahnya
              final v = await pilihTanggalJadwalPadam(context, widget.deps, widget.sesi, _tanggal, kecuali: teksJp(widget.jadwal?['jadwalId']));
              if (v != null) setState(() => _tanggal = v);
            }),
            Row(children: [
              Expanded(
                child: _tile('Jam padam', '${jamTeksJp(_padam)} WIB', Icons.schedule_rounded, () async {
                  final v = await showTimePicker(context: context, initialTime: _padam);
                  if (v != null) setState(() => _padam = v);
                }),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _tile('Jam nyala', '${jamTeksJp(_nyala)} WIB', Icons.schedule_rounded, () async {
                  final v = await showTimePicker(context: context, initialTime: _nyala);
                  if (v != null) setState(() => _nyala = v);
                }),
              ),
            ]),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'Padam', label: Text('Padam'), icon: Icon(Icons.power_off_outlined)),
                ButtonSegment(value: 'Tanpa Padam', label: Text('Tanpa Padam'), icon: Icon(Icons.power_outlined)),
              ],
              selected: {_kerja},
              onSelectionChanged: (v) => setState(() => _kerja = v.first),
            ),
            const SizedBox(height: 14),
            TextFormField(controller: _lokasi, maxLines: 2, maxLength: 300, decoration: dekor('Lokasi pekerjaan (opsional)')),
            if (d != null)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(15)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('DAMPAK OTOMATIS', style: TextStyle(fontSize: 10.5, letterSpacing: 1, fontWeight: FontWeight.w900, color: HartekGaya.merek)),
                  const SizedBox(height: 8),
                  Text(
                      '${teksJp(d['jumlahGardu'])} gardu · ${angkaIdJp(num.tryParse(teksJp(d['jumlahPelanggan'])) ?? 0)} pelanggan · '
                      '${angkaIdJp(num.tryParse(teksJp(d['arus'])) ?? 0, 2)} A',
                      style: const TextStyle(fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                  const SizedBox(height: 4),
                  Text('Durasi ${durasiTeksJp(durasi)} · ENS ± ${rupiahJp(ensJp(num.tryParse(teksJp(d['bebanMw'])) ?? 0, durasi))}',
                      style: HartekGaya.sekunder),
                  if (teksJp(d['daerahSection']).isNotEmpty) Text(teksJp(d['daerahSection']), style: HartekGaya.sekunder),
                  if (teksJp(d['pelangganVip']).isNotEmpty)
                    Text('VIP: ${teksJp(d['pelangganVip'])}', style: const TextStyle(fontSize: 13, color: AppColors.accent700)),
                ]),
              ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _simpan ? null : _kirim,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: _simpan
                  ? const SisiLoader(ukuran: 24, warna: Colors.white)
                  : Text(widget.jadwal == null ? 'Simpan jadwal' : 'Simpan perubahan', style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
          ]),
        ),
      ),
    );
  }
}

/// v1.0.20 (permintaan kvlar 23 Okt 2026): pemilih tanggal jadwal padam. Kalender satu bulan, titik merah = tanggal yang
/// sudah punya jadwal padam (data getJadwalPadam bulan itu); ketuk tanggal = rincian jadwal tanggal itu di bawah kalender,
/// tombol Pilih = pakai tanggal. [kecuali] = jadwal yang sedang diubah (tidak dihitung).
Future<DateTime?> pilihTanggalJadwalPadam(BuildContext context, Deps deps, Sesi sesi, DateTime awal, {String kecuali = ''}) =>
    showModalBottomSheet<DateTime>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useRootNavigator: true,
      builder: (_) => _PemilihTanggalJp(deps: deps, sesi: sesi, awal: awal, kecuali: kecuali),
    );

class _PemilihTanggalJp extends StatefulWidget {
  const _PemilihTanggalJp({required this.deps, required this.sesi, required this.awal, required this.kecuali});
  final Deps deps;
  final Sesi sesi;
  final DateTime awal;
  final String kecuali;

  @override
  State<_PemilihTanggalJp> createState() => _PemilihTanggalJpState();
}

class _PemilihTanggalJpState extends State<_PemilihTanggalJp> {
  late DateTime _bulan = DateTime(widget.awal.year, widget.awal.month, 1);
  late DateTime _hari = DateTime(widget.awal.year, widget.awal.month, widget.awal.day);
  final Map<String, List<Map<String, dynamic>>> _perBulan = {};
  bool _muat = false;
  String? _galat;

  String get _kunci => '${_bulan.year}-${_bulan.month}';

  @override
  void initState() {
    super.initState();
    unawaited(_muatBulan());
  }

  Future<void> _muatBulan() async {
    final k = _kunci, b = _bulan;
    if (_perBulan.containsKey(k)) return;
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final r = await widget.deps.api.call('getJadwalPadam', token: widget.sesi.token, data: {
        'dari': isoHari(b),
        'sampai': isoHari(DateTime(b.year, b.month + 1, 0)),
      });
      _perBulan[k] = [
        for (final j in daftarJp(r['jadwal']))
          if (teksJp(j['jadwalId']) != widget.kecuali && teksJp(j['status']) != StatusJadwalPadam.batal) j,
      ];
    } catch (_) {
      _galat = 'Jadwal bulan ini belum termuat (butuh sinyal). Tanggal tetap bisa dipilih.';
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jadwal = _perBulan[_kunci] ?? const <Map<String, dynamic>>[];
    final per = <String, int>{};
    for (final j in jadwal) {
      per[teksJp(j['tanggal'])] = (per[teksJp(j['tanggal'])] ?? 0) + 1;
    }
    final hariIni = jadwal.where((j) => teksJp(j['tanggal']) == isoHari(_hari)).toList();
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .9),
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          const Text('Pilih tanggal padam', style: HartekGaya.judulSeksi),
          const SizedBox(height: 4),
          const Text('Titik merah = tanggal yang sudah ada jadwal padam.', style: TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
          const SizedBox(height: 10),
          KalenderBulan(
            bulan: _bulan,
            tanda: {for (final e in per.entries) e.key: [TandaHari(AppColors.red600, e.value, 'jadwal padam')]},
            dipilih: _hari,
            hariIni: DateTime.now(),
            sibuk: _muat,
            onPilih: (d) => setState(() => _hari = d),
            onGantiBulan: (b) {
              setState(() => _bulan = b);
              unawaited(_muatBulan());
            },
          ),
          if (_galat != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat!, style: const TextStyle(fontSize: 12.5, color: AppColors.accent700))),
          const SizedBox(height: 12),
          Text(hariIni.isEmpty ? '${labelTanggalJp(isoHari(_hari))}: belum ada jadwal padam' : '${labelTanggalJp(isoHari(_hari))}: ${hariIni.length} jadwal padam',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
          for (final j in hariIni)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: AppColors.red100.withValues(alpha: .5),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.red100),
              ),
              child: Row(children: [
                const Icon(Icons.power_off_rounded, color: AppColors.red700, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${teksJp(j['penyulang'])} · ${teksJp(j['section'])}',
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: HartekGaya.tinta)),
                    Text('${teksJp(j['jamPadam'])} – ${teksJp(j['jamNyala'])} WIB · ${teksJp(j['jenis'])}',
                        maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: HartekGaya.redup)),
                  ]),
                ),
              ]),
            ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, _hari),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            icon: const Icon(Icons.check_rounded),
            label: Text('Pilih ${labelTanggalJp(isoHari(_hari))}'),
          ),
        ]),
      ),
    );
  }
}
