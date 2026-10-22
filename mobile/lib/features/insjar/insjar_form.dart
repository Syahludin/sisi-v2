import 'package:flutter/material.dart';

import '../../core/sesi.dart';
import '../../theme/app_colors.dart';
import '../hartek/foto_lapangan.dart';
import '../hartek/hartek_form.dart';
import '../hartek/hartek_gaya.dart';
import '../row/row_model.dart' show Koordinat;
import '../insdu/insdu_bantu.dart' show GarduInsDu;
import '../row/watermark.dart';
import 'insjar_lokal.dart';

/// v1.0.0: isian form Inspeksi Jaringan, dipakai petugas (HP, offline) dan admin (Input Temuan Inspeksi).
/// Form temuan admin = form petugas + pilihan penyulang (petugas: penyulang dari penyulang utama, hanya dibaca).

/// v1.0.2 (keputusan kvlar 19 Okt 2026): foto temuan + foto tiang WAJIB (petugas dan admin, form sama).
const bool fotoTemuanWajib = true;
const String awalanFotoInsJar = 'foto_';

/// Master dropdown (getMasterInsJar / getMasterTemuanInspeksi).
class MasterInsJar {
  MasterInsJar(Map<String, dynamic> m)
      : penyulang = {
          for (final p in InsJarLokal.daftar(m['penyulang']))
            '${p['nama'] ?? ''}'.trim(): [for (final s in (p['section'] as List<dynamic>? ?? const <dynamic>[])) '$s'],
        }..remove(''),
        jenisTemuan = {
          for (final j in InsJarLokal.daftar(m['jenisTemuan']))
            if ('${j['nama'] ?? ''}'.trim().isNotEmpty) '${j['nama']}'.trim(): '${j['jenisTemuanId'] ?? ''}'.trim(),
        },
        objekJenisTemuan = {
          for (final j in InsJarLokal.daftar(m['jenisTemuan']))
            if ('${j['nama'] ?? ''}'.trim().isNotEmpty)
              '${j['nama']}'.trim(): [
                for (final o in (j['objekInspeksi'] as List<dynamic>? ?? const <dynamic>[])) '$o',
              ],
        },
        tierJenisTemuan = {
          for (final j in InsJarLokal.daftar(m['jenisTemuan']))
            if ('${j['nama'] ?? ''}'.trim().isNotEmpty)
              '${j['nama']}'.trim(): [
                for (final t in (j['tierInspeksi'] as List<dynamic>? ?? const <dynamic>[])) '$t',
              ],
        },
        tier = [for (final t in (m['tier'] as List<dynamic>? ?? const ['Tier 1', 'Tier 2'])) '$t'],
        gardu = {
          for (final g in InsJarLokal.daftar(m['gardu']))
            if ('${g['garduId'] ?? ''}'.trim().isNotEmpty) '${g['garduId']}'.trim(): GarduInsDu(g),
        };

  /// Penyulang -> section urut kolom urutan db_Jaringan.
  final Map<String, List<String>> penyulang;

  /// Nama jenis temuan -> jenisTemuanId.
  final Map<String, String> jenisTemuan;
  final Map<String, List<String>> objekJenisTemuan;
  final Map<String, List<String>> tierJenisTemuan;
  final List<String> tier;

  /// v1.0.11: gardu AKTIF db_Gardu (master admin) untuk temuan object Gardu: garduId -> gardu.
  final Map<String, GarduInsDu> gardu;

  List<String> section(String? penyulang) => this.penyulang[(penyulang ?? '').trim()] ?? const <String>[];

  List<String> jenisUntuk(String? objek, String? tier) => [
        for (final nama in jenisTemuan.keys)
          if ((objekJenisTemuan[nama] ?? const <String>[]).isEmpty ||
              (objek ?? '').trim().isEmpty ||
              objekJenisTemuan[nama]!.contains((objek ?? '').trim()))
            if ((tierJenisTemuan[nama] ?? const <String>[]).isEmpty ||
                (tier ?? '').trim().isEmpty ||
                tierJenisTemuan[nama]!.contains((tier ?? '').trim()))
              nama,
      ];
}

/// Watermark foto temuan (kamera SiSi).
DataWatermark watermarkTemuan(Sesi s, {required String kode, required Map<String, String> nilai, required String slot}) {
  final koor = (nilai['koordinat'] ?? '').trim();
  return DataWatermark(
    kodeEksekusi: kode,
    ulp: s.ulp,
    tim: s.timNama.isEmpty ? 'Admin ULP' : s.timNama,
    subTim: s.nama,
    penyulang: nilai['penyulang'],
    section: [nilai['section'] ?? '', (nilai['nomorTiang'] ?? '').trim().toUpperCase()].where((v) => v.trim().isNotEmpty).join(' · '),
    waktu: DateTime.now(),
    koordinat: koor.isEmpty || Koordinat.cek(koor) != null ? null : koor,
    diameter: null,
    jenis: (nilai['jenisTemuan'] ?? '').trim().isEmpty ? 'Inspeksi Jaringan' : nilai['jenisTemuan'],
    slot: slot == 'TIANG' ? 'Tiang' : 'Temuan',
    labelKode: 'Kode Inspeksi',
    labelSubTim: 'Akun',
    tampilDiameter: false,
  );
}

/// v1.0.5: segmen temuan hanya untuk object inspeksi Jaringan.
const String objekSegmen = 'Jaringan';

bool segmenBerlaku(String? objek) => (objek ?? '').trim() == objekSegmen;

/// Isian temuan. [penyulangTetap] = petugas (penyulang utama, dibaca saja); null = admin memilih penyulang.
/// [kode] = kode di watermark (kode penyulang utama / laporan / kode admin).
/// v1.0.5: [nilai] = isian form saat ini (segmen tampil hanya kalau object = Jaringan). [denganFoto] false = form ubah
/// temuan (foto diatur dari kartu temuan).
/// v1.0.16: [tierOtomatis] (petugas) = tier inspeksi diambil dari tier penyulang utama yang dipilih, tanpa isian
/// tier manual; null = admin memilih tier.
List<IsianHartek> isianTemuan(Sesi s, MasterInsJar m,
    {String? penyulangTetap,
    String? objekTetap,
    String Function(Map<String, String> nilai)? tierOtomatis,
    required String kode,
    String folderFoto = 'insjar',
    Map<String, String> nilai = const {},
    bool denganFoto = true,
    Map<String, String>? pilihanRealisasi,
    bool sectionTetap = false,
    bool pilihGardu = false}) {
  final objek = objekTetap ?? nilai['objekInspeksi'];
  // v1.0.11: admin + object Gardu = pilih gardu (penyulang + section ikut gardu, dibaca saja), tanpa nomor tiang
  final gardu = pilihGardu && penyulangTetap == null && (objek ?? '').trim() == 'Gardu';
  IsianHartek foto(String slot) => IsianHartek('$awalanFotoInsJar$slot', InsJarLokal.labelFoto[slot] ?? slot,
      wajib: fotoTemuanWajib,
      grup: 'Foto',
      baris: 'foto',
      ambilFoto: (ctx, nilai, ada) => FotoLapangan.ambil(ctx,
          label: InsJarLokal.labelFoto[slot] ?? slot,
          pratinjau: watermarkTemuan(s, kode: kode, nilai: nilai, slot: slot),
          folder: folderFoto,
          pathAda: ada,
          bolehGaleri: true)); // v1.0.5: kamera (watermark) atau galeri (tanpa watermark)
  return [
    if (objekTetap != null)
      IsianHartek('objekInspeksi', 'Object inspeksi', bacaSaja: true, grup: 'Kriteria inspeksi')
    else
      IsianHartek('objekInspeksi', 'Object inspeksi',
          wajib: true,
          grup: 'Kriteria inspeksi',
          pilihan: const ['Jaringan', 'Gardu'],
          turunan: const ['tierInspeksi', 'jenisTemuan', 'garduId', 'penyulang', 'section', 'nomorTiang', 'segmen']),
    if (tierOtomatis == null)
      IsianHartek('tierInspeksi', 'Tier inspeksi',
          wajib: true, pilihanDari: (n) => m.tier, turunan: const ['jenisTemuan']),
    IsianHartek('jenisTemuan', 'Jenis temuan',
        wajib: true,
        grup: 'Temuan',
        pilihanDari: (n) => m.jenisUntuk(n['objekInspeksi'], tierOtomatis == null ? n['tierInspeksi'] : tierOtomatis(n)),
        bantuan: m.jenisTemuan.isEmpty ? 'Belum ada jenis temuan aktif di db_Jenis_Temuan.' : null),
    if (gardu) ...[
      IsianHartek('garduId', 'Gardu',
          wajib: true,
          grup: 'Lokasi',
          pilihan: m.gardu.keys.toList(),
          labelPilihan: (id) => m.gardu[id]?.label ?? id,
          isiLain: (id) => {'penyulang': m.gardu[id]?.penyulang ?? '', 'section': m.gardu[id]?.section ?? ''},
          turunan: const ['penyulang', 'section'],
          bantuan: m.gardu.isEmpty ? 'Belum ada gardu AKTIF di Master Gardu.' : 'Ketik nomor gardu atau alamat untuk mencari.'),
      const IsianHartek('penyulang', 'Penyulang', bacaSaja: true, baris: 'lokasiGardu'),
      const IsianHartek('section', 'Section', bacaSaja: true, baris: 'lokasiGardu'),
    ] else if (penyulangTetap != null)
      const IsianHartek('penyulang', 'Penyulang', bacaSaja: true, grup: 'Lokasi')
    else
      IsianHartek('penyulang', 'Penyulang', wajib: true, grup: 'Lokasi', pilihan: m.penyulang.keys.toList(), turunan: const ['section']),
    // v1.0.5: petugas memilih section dari penyulang utama laporan (section mengikuti penyulang utama, bukan master)
    if (gardu)
      ...const <IsianHartek>[]
    else if (pilihanRealisasi != null)
      IsianHartek('realisasiId', 'Section',
          wajib: true,
          grup: 'Lokasi',
          pilihan: pilihanRealisasi.keys.toList(),
          labelPilihan: (id) => pilihanRealisasi[id] ?? id,
          bantuan: 'Temuan masuk ke section penyulang utama yang dipilih.')
    else if (sectionTetap)
      const IsianHartek('section', 'Section', bacaSaja: true, grup: 'Lokasi')
    else
      IsianHartek('section', 'Section', wajib: true, grup: 'Lokasi', pilihanDari: (n) => m.section(n['penyulang'])),
    if (!gardu) IsianHartek('nomorTiang', 'Nomor tiang', maks: 30, baris: segmenBerlaku(objek) ? 'tiang' : null, contoh: 'TB-12'),
    if (segmenBerlaku(objek)) const IsianHartek('segmen', 'Segmen', maks: 60, baris: 'tiang', contoh: 'Opsional'),
    const IsianHartek('deskripsi', 'Deskripsi', multi: true, maks: 500, bantuan: 'Opsional, maksimal 5 baris.'),
    // v1.0.14: koordinat temuan wajib (petugas Inspeksi Jaringan + admin)
    const IsianHartek('koordinat', 'Koordinat temuan', wajib: true, koordinat: true, contoh: '-3.012345, 106.512345'),
    if (denganFoto) ...[
      foto('TEMUAN'),
      foto('TIANG'),
    ],
  ];
}

/// Pisahkan isian form temuan: data kirim server, data tampil di HP, foto {SLOT: path}.
({Map<String, dynamic> data, Map<String, dynamic> tampil, Map<String, String> foto}) pisahTemuan(
    Map<String, String> n, MasterInsJar m, {bool admin = false}) {
  String v(String k) => (n[k] ?? '').trim();
  final jenis = v('jenisTemuan');
  final objek = v('objekInspeksi').isEmpty ? objekSegmen : v('objekInspeksi');
  final segmen = segmenBerlaku(objek) ? v('segmen') : ''; // v1.0.5: segmen hanya object Jaringan
  // v1.0.5: section tidak dikirim petugas (diambil dari penyulang utama di server); admin memilih section
  // v1.0.11: admin object Gardu kirim garduId (penyulang + section diambil server dari db_Gardu)
  final gardu = admin && objek == 'Gardu' && v('garduId').isNotEmpty;
  final data = <String, dynamic>{
    'objekInspeksi': v('objekInspeksi').isEmpty ? 'Jaringan' : v('objekInspeksi'),
    if (v('tierInspeksi').isNotEmpty) 'tierInspeksi': v('tierInspeksi'),
    if (admin && !gardu) 'section': v('section'),
    if (gardu) 'garduId': v('garduId'),
    'jenisTemuanId': m.jenisTemuan[jenis] ?? '',
    if (v('nomorTiang').isNotEmpty) 'nomorTiang': v('nomorTiang'),
    if (segmen.isNotEmpty) 'segmen': segmen,
    if (v('deskripsi').isNotEmpty) 'deskripsi': v('deskripsi'),
    if (v('koordinat').isNotEmpty) 'koordinat': v('koordinat'),
    if (admin && !gardu) 'penyulang': v('penyulang'),
  };
  final tampil = <String, dynamic>{
    'objekInspeksi': v('objekInspeksi').isEmpty ? 'Jaringan' : v('objekInspeksi'),
    'tierInspeksi': v('tierInspeksi'),
    'penyulang': v('penyulang'),
    'section': v('section'), // petugas: diisi layar dari penyulang utama
    'jenisTemuan': jenis,
    'jenisTemuanId': m.jenisTemuan[jenis] ?? '',
    'nomorTiang': v('nomorTiang').toUpperCase(),
    if (gardu) 'garduId': v('garduId'),
    if (gardu) 'noGardu': m.gardu[v('garduId')]?.noGardu ?? '',
    'segmen': segmen,
    'deskripsi': v('deskripsi'),
    'koordinat': v('koordinat'),
    'status': 'Penugasan Tim',
    'sumber': admin ? 'ADMIN' : 'INSPEKSI',
  };
  final foto = <String, String>{
    for (final e in n.entries)
      if (e.key.startsWith(awalanFotoInsJar) && e.value.trim().isNotEmpty) e.key.substring(awalanFotoInsJar.length): e.value.trim(),
  };
  return (data: data, tampil: tampil, foto: foto);
}

/// v1.0.5: isian awal form ubah temuan dari node temuan (HP / server).
Map<String, String> awalTemuan(Map<String, dynamic> t) => {
      for (final k in const ['objekInspeksi', 'tierInspeksi', 'jenisTemuan', 'penyulang', 'section', 'nomorTiang', 'segmen', 'deskripsi', 'koordinat'])
        if ('${t[k] ?? ''}'.trim().isNotEmpty) k: '${t[k]}'.trim(),
      if ('${t['objekInspeksi'] ?? ''}'.trim().isEmpty) 'objekInspeksi': objekSegmen,
    };

/// Kartu satu temuan (dipakai petugas dan admin). v1.0.2: gaya sama dengan kartu rincian Hartek (KartuHartek,
/// warna HartekGaya, ikon berlatar seperti ikon jenis lokasi). [fotoBawah] = deret foto (FotoRincian).
class KartuTemuan extends StatelessWidget {
  const KartuTemuan({super.key, required this.t, this.trailing, this.fotoBawah, this.bawah, this.onTap});
  final Map<String, dynamic> t;
  final Widget? trailing, fotoBawah, bawah;

  /// v1.0.5: ketuk kartu = ubah temuan (null = hanya tampilan).
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    String v(String k) => '${t[k] ?? ''}'.trim();
    final lokasi = [
      v('penyulang'),
      v('section'),
      if (v('noGardu').isNotEmpty) 'Gardu ${v('noGardu')}', // v1.0.11
      if (v('nomorTiang').isNotEmpty) 'Tiang ${v('nomorTiang')}',
    ]
        .where((x) => x.isNotEmpty)
        .join(' · ');
    return KartuHartek(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.accent400, AppColors.accent600], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(Icons.report_gmailerrorred_rounded, size: 21, color: AppColors.brand950),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(v('jenisTemuan').isEmpty ? 'Temuan' : v('jenisTemuan'),
                  style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: HartekGaya.tinta)),
              if (lokasi.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(lokasi, style: HartekGaya.sekunder),
              ],
              if (v('deskripsi').isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(v('deskripsi'), maxLines: 3, overflow: TextOverflow.ellipsis, style: HartekGaya.sekunder),
              ],
              const SizedBox(height: 4),
              Text(v('kodeTemuan').isEmpty ? 'Menunggu kirim ke server' : v('kodeTemuan'), style: HartekGaya.kode),
            ]),
          ),
          if (trailing != null) trailing!,
        ]),
        if (fotoBawah != null) fotoBawah!,
        if (bawah != null) bawah!,
      ]),
    );
  }
}
