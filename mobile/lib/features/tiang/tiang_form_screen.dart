import 'dart:io';

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../core/gps.dart';
import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../../widgets/accurate_gps_button.dart';
import '../../widgets/sisi_widgets.dart';
import '../hartek/foto_lapangan.dart';
import '../row/watermark.dart';
import '../switching/switching_model.dart' show jarakMeter, labelSwitching, proper;
import 'induk_peta.dart';
import 'tiang_model.dart';
import 'tiang_repository.dart';

/// Form verifikasi satu tiang (atau tiang baru dari lapangan). Urutan = urutan kerja di lokasi: hasil verifikasi, GPS, 2 foto, fisik
/// tiang, lalu sirkuit (1-3). Sirkuit kosong diusulkan dari tiang sebelumnya. Simpan = langsung berlaku, lalu foto dikirim.
class TiangFormScreen extends StatefulWidget {
  const TiangFormScreen({
    super.key,
    required this.sesi,
    required this.repo,
    required this.pilihan,
    required this.kode,
    this.tiang,
    this.contoh,
    this.daftar = const [],
    this.indukBaru = '',
  });
  final Sesi sesi;
  final TiangRepository repo;
  final PilihanTiang pilihan;
  final String kode;
  final Tiang? tiang;
  final List<IsianSirkuit>? contoh;
  final List<Tiang> daftar;
  final String indukBaru;

  @override
  State<TiangFormScreen> createState() => _TiangFormScreenState();
}

class _TiangFormScreenState extends State<TiangFormScreen> {
  late final IsianTiang _i = IsianTiang(widget.tiang, kode: widget.kode, contoh: widget.contoh);
  late final TextEditingController _koord = TextEditingController(
      text: widget.tiang?.adaTitik == true && widget.tiang!.teks('sumberKoordinat') == 'lapangan' ? '${widget.tiang!.lat}, ${widget.tiang!.lng}' : '');
  final Map<String, String> _foto = {};
  Map<String, String> _galat = {};

  @override
  void initState() {
    super.initState();
    Gps.mulaiHangat(); // satelit sudah terkunci saat tombol GPS ditekan (lebih cepat dan lebih akurat)
    _i.koordinat = _koord.text;
    if (_i.baru && widget.indukBaru.isNotEmpty) {
      _i.sirkuit.first.t['indukTiangId'] = widget.indukBaru;
      _i.sirkuit.first.indukAsli = widget.indukBaru;
    }
    // tanpa switching hulu = keterangan bawaan terisi (boleh diubah), supaya tidak terlewat
    for (final s in _i.sirkuit) {
      if (s.t['switchingId']!.isEmpty) s.pilihSwitching('');
    }
  }

  Set<String> get _fotoAda => {
        for (final (slot, _) in slotFotoTiang)
          if (_foto[slot] != null || widget.tiang?.adaFoto(slot) == true) slot
      };

  LatLng? get _titikIni {
    final k = uraiKoordinat(_koord.text);
    if (k != null) return LatLng(k.$1, k.$2);
    final t = widget.tiang;
    return t == null ? null : (t.adaTitik ? LatLng(t.lat!, t.lng!) : (t.latAset == null || t.lngAset == null ? null : LatLng(t.latAset!, t.lngAset!)));
  }

  static LatLng? _titik(Tiang x) => x.adaTitik ? LatLng(x.lat!, x.lng!) : (x.latAset == null || x.lngAset == null ? null : LatLng(x.latAset!, x.lngAset!));

  /// Pilihan induk: hanya tiang yang sudah terverifikasi (koordinatnya sudah pasti), terdekat dari tiang ini lebih dulu.
  List<(Tiang, double?)> get _kandidat {
    final ini = _titikIni, diri = widget.tiang?.id;
    final l = [
      for (final x in widget.daftar)
        if (x.id != diri && x.status == 'TERVERIFIKASI')
          (x, ini == null || _titik(x) == null ? null : jarakMeter(ini.latitude, ini.longitude, _titik(x)!.latitude, _titik(x)!.longitude))
    ];
    l.sort((a, b) => a.$2 == null || b.$2 == null ? a.$1.nama.compareTo(b.$1.nama) : a.$2!.compareTo(b.$2!));
    return l;
  }

  @override
  void dispose() {
    Gps.hentiHangat();
    _koord.dispose();
    super.dispose();
  }

  String get _nama => widget.tiang?.nama ?? _i.nama;

  Future<void> _ambilFoto(String slot, String label) async {
    try {
      final p = await FotoLapangan.ambil(context,
          label: label,
          folder: 'tiang',
          pathAda: _foto[slot],
          pratinjau: DataWatermark(
            kodeEksekusi: _nama.isEmpty ? 'Tiang' : _nama,
            ulp: widget.sesi.ulp,
            tim: widget.sesi.timNama.isEmpty ? 'Admin' : widget.sesi.timNama,
            subTim: widget.sesi.nama,
            penyulang: _i.sirkuit.first.t['penyulang']!.isEmpty ? null : _i.sirkuit.first.t['penyulang'],
            section: null,
            waktu: DateTime.now(),
            koordinat: _i.koordinat.isEmpty ? null : _i.koordinat,
            diameter: null,
            jenis: 'Verifikasi Tiang',
            slot: label,
            labelKode: 'Tiang',
            tampilDiameter: false,
          ));
      if (p != null && mounted) setState(() => _foto[slot] = p);
    } catch (e) {
      if (mounted) tampilPesan(context, '$e'.replaceFirst('Exception: ', ''));
    }
  }

  /// Validasi lalu tutup: penyimpanan berjalan di latar belakang (layar jalur, simpanLatar).
  void _simpan() {
    _i.koordinat = _koord.text.trim();
    final g = _i.cek(widget.pilihan.penyulang, _fotoAda);
    setState(() => _galat = g);
    if (g.isNotEmpty) {
      tampilPesan(context, g.values.first);
      return;
    }
    Navigator.pop(context, (_i, Map<String, String>.of(_foto)));
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.tiang;
    final k = uraiKoordinat(_koord.text);
    final selisih = t == null || k == null ? null : selisihAset(t, k.$1, k.$2);
    return PopScope(
      child: Scaffold(
        appBar: AppBar(title: Text(_i.baru ? 'Tambah Tiang' : _nama)),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: AppColors.brand700),
              onPressed: _simpan,
              icon: const Icon(Icons.verified_outlined),
              label: const Text('Simpan Verifikasi'),
            ),
          ),
        ),
        body: ColoredBox(
          color: Colors.transparent,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
            if (t != null) _InfoAset(t: t),
            const _Judul('Hasil Verifikasi'),
            SegmentedButton<String>(
              segments: [for (final (kode, label) in statusTiang) ButtonSegment(value: kode, label: Text(label, textAlign: TextAlign.center))],
              selected: {_i.status},
              showSelectedIcon: false,
              onSelectionChanged: (v) => setState(() => _i.status = v.first),
            ),
            const SizedBox(height: 16),
            if (_i.baru)
              _jarak(TextFormField(
                initialValue: _i.nama,
                decoration: InputDecoration(
                    labelText: 'Nama Tiang *', hintText: 'mis. ${widget.kode}0003A', errorText: _galat['nama'], border: const OutlineInputBorder()),
                textCapitalization: TextCapitalization.characters,
                onChanged: (v) => _i.nama = v,
              )),
            if (_i.hilang)
              const Text('Tiang tidak ditemukan di lokasi. Hanya status yang dicatat, data lama tetap.', style: TextStyle(color: AppColors.neutral700)),
            if (!_i.hilang) ...[
              KolomKoordinat(
                controller: _koord,
                label: 'Koordinat Tiang',
                akurasiM: _i.akurasiM,
                wajib: true,
                onHasil: (h) => setState(() {
                  _i.akurasiM = h.akurasiM;
                  _i.koordinat = h.koordinat;
                  _i.dasarKoordinat = '';
                }),
                onChanged: (v) => setState(() {
                  _i.koordinat = v;
                  _i.akurasiM = null;
                  _i.dasarKoordinat = '';
                }),
              ),
              if (_galat['koordinat'] != null) Text(_galat['koordinat']!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700)),
              if (selisih != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Selisih dari koordinat terdaftar: ${selisih.round()} m (batas ${toleransiKoordinatM.round()} m)',
                      style: TextStyle(fontWeight: FontWeight.w700, color: selisih > toleransiKoordinatM ? AppColors.red700 : AppColors.neutral500)),
                ),
              if (_i.perluDasar) _PilihDasar(nilai: _i.dasarKoordinat, galat: _galat['dasar'], ubah: (v) => setState(() => _i.dasarKoordinat = v)),
              const SizedBox(height: 16),
              const _Judul('Foto (Wajib 2)'),
              Row(children: [
                for (final (slot, label) in slotFotoTiang) ...[
                  Expanded(child: _kotakFoto(slot, label)),
                  if (slot != slotFotoTiang.last.$1) const SizedBox(width: 12),
                ],
              ]),
              const SizedBox(height: 16),
              const _Judul('Fisik Tiang (Jenis Wajib)'),
              Wrap(spacing: 8, children: [
                for (final j in jenisTiang)
                  ChoiceChip(label: Text(proper(j.toLowerCase())), selected: _i.jenis == j, onSelected: (_) => setState(() => _i.jenis = j)),
              ]),
              const SizedBox(height: 12),
              _pilih(
                  'Ukuran Tiang *',
                  _i.ukuran,
                  [
                    for (final u in {...widget.pilihan.pilihanUkuran, if (_i.ukuran.isNotEmpty) _i.ukuran}) (u, u)
                  ],
                  (v) => _i.ukuran = v),
              _pilih('Konstruksi *', _i.konstruksiId, widget.pilihan.konstruksi, (v) => _i.konstruksiId = v,
                  kosong: widget.pilihan.konstruksi.isEmpty ? 'Daftar konstruksi belum diisi admin' : 'Pilih konstruksi'),
              const _Judul('Jumlah Sirkuit'),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 1, label: Text('1')),
                  ButtonSegment(value: 2, label: Text('2')),
                  ButtonSegment(value: 3, label: Text('3'))
                ],
                selected: {_i.sirkuit.length},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _i.aturJumlahSirkuit(v.first)),
              ),
              const SizedBox(height: 12),
              for (var n = 0; n < _i.sirkuit.length; n++)
                _KartuSirkuit(
                    no: n,
                    s: _i.sirkuit[n],
                    pilihan: widget.pilihan,
                    galat: _galat['sirkuit$n'],
                    ubah: () => setState(() {}),
                    kandidat: _kandidat,
                    daftar: widget.daftar,
                    ini: _titikIni),
              if (_galat['lengkap'] != null)
                Text(_galat['lengkap']!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700)),
            ],
          ]),
        ),
      ),
    );
  }

  Widget _kotakFoto(String slot, String label) {
    final path = _foto[slot], server = widget.tiang?.adaFoto(slot) ?? false;
    return Column(children: [
      AspectRatio(
        aspectRatio: 4 / 3,
        child: Material(
          color: AppColors.neutral100,
          borderRadius: BorderRadius.circular(10),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: () => _ambilFoto(slot, label),
            child: path != null
                ? Image.file(File(path), fit: BoxFit.cover)
                : Center(
                    child: Icon(server ? Icons.cloud_done_outlined : Icons.add_a_photo_outlined, color: server ? AppColors.success600 : AppColors.neutral400)),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Text(
          path != null
              ? '$label (Baru)'
              : server
                  ? '$label ✓'
                  : label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.neutral700)),
    ]);
  }

  Widget _pilih(String label, String nilai, List<(String, String)> isi, void Function(String) ubah, {String kosong = 'Pilih'}) =>
      _jarak(DropdownButtonFormField<String>(
        key: ValueKey('$label|${isi.length}|$nilai'),
        initialValue: isi.any((x) => x.$1 == nilai) ? nilai : '',
        isExpanded: true,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
        items: [
          DropdownMenuItem(value: '', child: Text(kosong, style: const TextStyle(color: AppColors.neutral500))),
          for (final (k, v) in isi) DropdownMenuItem(value: k, child: Text(v, overflow: TextOverflow.ellipsis)),
        ],
        onChanged: (v) => setState(() => ubah(v ?? '')),
      ));
}

Widget _jarak(Widget w) => Padding(padding: const EdgeInsets.only(bottom: 14), child: w);

class _Judul extends StatelessWidget {
  const _Judul(this.teks);
  final String teks;

  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(teks, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: AppColors.brand950)));
}

/// Ringkasan data aset (hasil migrasi ITB) + tanda cek, sebagai pembanding di lokasi.
class _InfoAset extends StatelessWidget {
  const _InfoAset({required this.t});
  final Tiang t;

  @override
  Widget build(BuildContext context) {
    final baris = [
      ('ID Aset', t.id),
      ('Jenis / Ukuran (Aset)', [t.teks('jenisTiangAset'), t.teks('ukuranTiangAset')].where((x) => x.isNotEmpty).join(' / ')),
      ('Segmen (Aset)', t.sirkuit.isEmpty ? '' : t.sirkuit.first.teks('segmenAset')),
      ('Induk Usulan', t.induk),
      ('Gawang', t.sirkuit.isEmpty || t.sirkuit.first.angka('gawangM') == null ? '' : '${t.sirkuit.first.angka('gawangM')} m'),
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final (k, v) in baris)
          if (v.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 140, child: Text(k, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.neutral500))),
                const SizedBox(width: 12),
                Expanded(child: Text(v, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.brand950))),
              ]),
            ),
        if (t.tanda.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final k in t.tanda)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: AppColors.red100, borderRadius: BorderRadius.circular(99)),
                child: Text(labelTanda(k), style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.red700)),
              ),
          ]),
        ],
      ]),
    );
  }
}

/// Isian satu sirkuit: penyulang wajib; section / segmen disaring menurut penyulang; induk diusulkan dari jalur.
class _KartuSirkuit extends StatelessWidget {
  const _KartuSirkuit(
      {required this.no,
      required this.s,
      required this.pilihan,
      required this.ubah,
      required this.kandidat,
      required this.daftar,
      required this.ini,
      this.galat});
  final List<(Tiang, double?)> kandidat;
  final List<Tiang> daftar;
  final LatLng? ini;
  final int no;
  final IsianSirkuit s;
  final PilihanTiang pilihan;
  final VoidCallback ubah;
  final String? galat;

  @override
  Widget build(BuildContext context) {
    final pny = s.t['penyulang']!;
    Widget pilih(String label, String kunci, List<(String, String)> isi, {String kosong = 'Pilih', VoidCallback? sesudah}) =>
        _jarak(DropdownButtonFormField<String>(
          key: ValueKey('$no|$kunci|${isi.length}|${s.t[kunci]}'),
          initialValue: isi.any((x) => x.$1 == s.t[kunci]) ? s.t[kunci] : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: label, errorText: kunci == 'penyulang' ? galat : null, border: const OutlineInputBorder()),
          items: [
            DropdownMenuItem(value: '', child: Text(kosong, style: const TextStyle(color: AppColors.neutral500))),
            for (final (k, v) in isi) DropdownMenuItem(value: k, child: Text(v, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) {
            s.t[kunci] = v ?? '';
            sesudah?.call();
            ubah();
          },
        ));
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
      decoration: BoxDecoration(color: AppColors.neutral50, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.neutral150)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Sirkuit ${no + 1}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppColors.brand900)),
        const SizedBox(height: 10),
        pilih('Penyulang *', 'penyulang', [for (final p in pilihan.penyulang) (p, p)], sesudah: () {
          s.t['sectionId'] = '';
          s.t['segmenId'] = '';
          s.t['switchingId'] = '';
        }),
        pilih('Section *', 'sectionId', [for (final x in pilihan.sectionDari(pny)) (x.sectionId, x.section)],
            kosong: pny.isEmpty ? 'Pilih penyulang dulu' : 'Pilih section', sesudah: () => s.t['segmenId'] = ''),
        pilih('Segmen *', 'segmenId', [for (final g in pilihan.segmenDari(pny, s.t['sectionId']!)) ('${g['segmenId']}', '${g['nama']}')],
            kosong: pilihan.segmenDari(pny, s.t['sectionId']!).isEmpty ? 'Belum ada segmen' : 'Pilih segmen'),
        Row(children: [
          Expanded(child: pilih('Posisi *', 'posisi', posisiSirkuit)),
          const SizedBox(width: 14),
          Expanded(child: pilih('Peran Titik *', 'peranTitik', peranTitik)),
        ]),
        _BlokInduk(no: no, s: s, kandidat: kandidat, daftar: daftar, ini: ini, ubah: ubah),
        pilih('Switching Hulu *', 'switchingId',
            [for (final w in pilihan.switchingDari(pny)) ('${w['switchingId']}', labelSwitching('${w['jenis']}', '${w['nama']}'))],
            kosong: 'Tidak ada / langsung dari GI', sesudah: () => s.pilihSwitching(s.t['switchingId']!)),
        if (s.t['switchingId']!.isEmpty)
          _jarak(TextFormField(
            key: ValueKey('$no|ketswitching'),
            initialValue: s.t['switchingKeterangan'],
            decoration: const InputDecoration(labelText: 'Keterangan Tanpa Switching *', border: OutlineInputBorder()),
            onChanged: (v) => s.t['switchingKeterangan'] = v,
          )),
        pilih('Switching di Tiang Ini', 'switchingDiTiang',
            [for (final w in pilihan.switchingDari(pny)) ('${w['switchingId']}', labelSwitching('${w['jenis']}', '${w['nama']}'))],
            kosong: 'Tidak ada'),
        Row(children: [
          Expanded(child: pilih('Jenis Kabel *', 'jenisKabel', [for (final x in jenisKabel) (x, x)])),
          const SizedBox(width: 14),
          Expanded(
            child: _jarak(DropdownButtonFormField<num>(
              key: ValueKey('$no|mm2|${s.ukuranMm2}'),
              initialValue: ukuranKabel.contains(s.ukuranMm2) ? s.ukuranMm2 : null,
              decoration: const InputDecoration(labelText: 'Ukuran mm² *', border: OutlineInputBorder()),
              items: [for (final u in ukuranKabel) DropdownMenuItem(value: u, child: Text('$u'))],
              onChanged: (v) {
                s.ukuranMm2 = v;
                ubah();
              },
            )),
          ),
        ]),
      ]),
    );
  }
}

/// Penentuan induk satu sirkuit: Induk Tiang (pilih dari tiang terverifikasi + peta; Induk Benar / Diganti) atau Tiang Awal SKTM
/// (tanpa induk, keterangan wajib).
class _BlokInduk extends StatelessWidget {
  const _BlokInduk({required this.no, required this.s, required this.kandidat, required this.daftar, required this.ini, required this.ubah});
  final int no;
  final IsianSirkuit s;
  final List<(Tiang, double?)> kandidat;
  final List<Tiang> daftar;
  final LatLng? ini;
  final VoidCallback ubah;

  static String _jarakTeks(double? m) => m == null ? '' : (m >= 1000 ? '${(m / 1000).toStringAsFixed(1)} km' : '${m.round()} m');

  @override
  Widget build(BuildContext context) {
    final awal = s.t['indukStatus'] == 'TITIK_AWAL';
    final id = s.t['indukTiangId']!, status = s.t['indukStatus']!;
    final induk = daftar.where((x) => x.id == id).firstOrNull;
    final titikInduk = induk == null
        ? null
        : induk.adaTitik
            ? LatLng(induk.lat!, induk.lng!)
            : (induk.latAset == null || induk.lngAset == null ? null : LatLng(induk.latAset!, induk.lngAset!));
    final jarak = ini == null || titikInduk == null ? null : jarakMeter(ini!.latitude, ini!.longitude, titikInduk.latitude, titikInduk.longitude);
    final dikenal = kandidat.any((k) => k.$1.id == id);
    final (labelStatus, warna) = switch (status) {
      'BENAR' => ('Induk Benar', AppColors.success600),
      'DIGANTI' => ('Induk Diganti', AppColors.success600),
      _ => ('Belum Dikonfirmasi', AppColors.red600),
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _Judul('Induk Tiang *'),
      Wrap(spacing: 8, children: [
        ChoiceChip(
            label: const Text('Induk Tiang'),
            selected: !awal,
            onSelected: (_) {
              if (awal) s.pilihInduk(s.indukAsli);
              ubah();
            }),
        ChoiceChip(
            label: const Text(ketTitikAwal),
            selected: awal,
            onSelected: (_) {
              s.jadikanTiangAwal();
              ubah();
            }),
      ]),
      const SizedBox(height: 10),
      if (awal)
        _jarak(TextFormField(
          key: ValueKey('$no|ketawal'),
          initialValue: s.t['indukKeterangan'],
          decoration: const InputDecoration(labelText: 'Keterangan Tiang Awal *', border: OutlineInputBorder()),
          onChanged: (v) => s.t['indukKeterangan'] = v,
        ))
      else ...[
        _jarak(DropdownButtonFormField<String>(
          key: ValueKey('$no|induk|${kandidat.length}|$id'),
          initialValue: id.isEmpty ? '' : id,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Pilih Induk Tiang', border: OutlineInputBorder()),
          items: [
            const DropdownMenuItem(value: '', child: Text('Pilih induk tiang', style: TextStyle(color: AppColors.neutral500))),
            if (id.isNotEmpty && !dikenal)
              DropdownMenuItem(value: id, child: Text('${induk?.nama.isNotEmpty == true ? induk!.nama : id} (Belum Terverifikasi)', overflow: TextOverflow.ellipsis)),
            for (final (t, m) in kandidat)
              DropdownMenuItem(value: t.id, child: Text([t.nama, _jarakTeks(m)].where((x) => x.isNotEmpty).join(' · '), overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) {
            s.pilihInduk(v ?? '');
            ubah();
          },
        )),
        if (id.isNotEmpty && induk != null && titikInduk == null)
          const Padding(padding: EdgeInsets.only(bottom: 10), child: Text('Induk belum punya koordinat, peta tidak bisa ditampilkan.')),
        IndukPeta(ini: ini, induk: titikInduk),
        if (jarak != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text('Jarak ke induk: ${_jarakTeks(jarak)}${jarak > 250 ? ' · Jauh, periksa lagi' : ''}',
                style: TextStyle(fontWeight: FontWeight.w700, color: jarak > 250 ? AppColors.accent700 : AppColors.neutral500)),
          ),
        _jarak(Row(children: [
          Icon(status.isEmpty ? Icons.help_outline : Icons.check_circle, size: 18, color: warna),
          const SizedBox(width: 6),
          Expanded(child: Text(labelStatus, style: TextStyle(fontWeight: FontWeight.w800, color: warna))),
          if (status.isEmpty && id.isNotEmpty)
            FilledButton.tonal(
                onPressed: () {
                  s.t['indukStatus'] = 'BENAR';
                  ubah();
                },
                child: const Text('Induk Benar')),
        ])),
      ],
    ]);
  }
}

/// Selisih GPS dari koordinat terdaftar melebihi batas: admin memilih koordinat mana yang dipakai sebagai dasar tiang.
class _PilihDasar extends StatelessWidget {
  const _PilihDasar({required this.nilai, required this.ubah, this.galat});
  final String nilai;
  final String? galat;
  final void Function(String) ubah;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _Judul('Pilih Koordinat yang Dipakai *'),
          SegmentedButton<String>(
            emptySelectionAllowed: true,
            segments: const [
              ButtonSegment(value: 'TERDAFTAR', label: Text('Koordinat Terdaftar', textAlign: TextAlign.center)),
              ButtonSegment(value: 'LAPANGAN', label: Text('Koordinat GPS', textAlign: TextAlign.center)),
            ],
            selected: {if (nilai.isNotEmpty) nilai},
            showSelectedIcon: false,
            onSelectionChanged: (v) => ubah(v.isEmpty ? '' : v.first),
          ),
          if (galat != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(galat!, style: const TextStyle(color: AppColors.red700, fontWeight: FontWeight.w700))),
        ]),
      );
}
