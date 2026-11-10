part of 'absensi_screen.dart';

// Review 8 Nov 2026: widget pendukung layar Absensi (kotak ikon, panel angka, kartu tim, layar petugas tim, kartu petugas,
// sheet status), dipindah dari absensi_screen.dart tanpa perubahan isi. Sebagai `part` mereka tetap boleh membaca state privat
// _AbsensiPanelState.

class _HasilPilih {
  const _HasilPilih({this.isian, this.batal = false});
  final IsianAbsensi? isian;
  final bool batal;
}

class _KotakIkon extends StatelessWidget {
  const _KotakIkon(this.ikon);
  final IconData ikon;

  @override
  Widget build(BuildContext context) => Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: const Color(0x1FFFFFFF),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.accent400.withValues(alpha: .7), width: 1.4),
        ),
        child: Icon(ikon, color: AppColors.accent400, size: 23),
      );
}

/// Panel tiga angka (Hadir / Tidak hadir / Belum) di kartu gradien, gaya panel ringkasan kartu laporan tim.
class _PanelAngka extends StatelessWidget {
  const _PanelAngka({required this.hadir, required this.tidak, required this.belum});
  final int hadir, tidak, belum;

  Widget _angka(String label, int n, Color warna, Color latar) => Expanded(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: latar, borderRadius: BorderRadius.circular(999)),
            child: Text('$n',
                style: TextStyle(fontSize: 18, height: 1.1, fontWeight: FontWeight.w900, color: warna, fontFeatures: const [FontFeature.tabularFigures()])),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 10.5, height: 1.2, color: Colors.white70)),
        ]),
      );

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(right: 4),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)),
        child: Row(children: [
          _angka('Hadir', hadir, const Color(0xFF86EFAC), const Color(0x3322C55E)),
          _angka('Tidak hadir', tidak, const Color(0xFFFECACA), const Color(0x33EF4444)),
          _angka('Belum', belum, const Color(0xFFFDE68A), const Color(0x33F59E0B)),
        ]),
      );
}

/// Kartu satu tim di layar pertama (gradien Jaringan SiSi, sama dengan kartu laporan tim).
class _KartuTimAbsensi extends StatelessWidget {
  const _KartuTimAbsensi({required this.nama, required this.total, required this.hitung, required this.bergalat, required this.onTap});
  final String nama;
  final int total;
  final ({int hadir, int tidak, int belum}) hitung;
  final int bergalat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bentuk = BorderRadius.circular(22);
    final sudah = total - hitung.belum;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: bentuk,
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: SisiMotif.gradien,
            borderRadius: bentuk,
            boxShadow: [BoxShadow(color: AppColors.navy900.withValues(alpha: .22), blurRadius: 14, offset: const Offset(0, 6))],
          ),
          child: Stack(children: [
            Positioned.fill(
              child: IgnorePointer(child: ClipRRect(borderRadius: bentuk, child: const CustomPaint(painter: PolaJaringanPainter(alpha: .07)))),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const _KotakIkon(Icons.groups_2_outlined),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(nama, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white)),
                      const SizedBox(height: 2),
                      Text('$sudah dari $total petugas sudah diabsen',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                    ]),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: Colors.white70),
                ]),
                const SizedBox(height: 12),
                _PanelAngka(hadir: hitung.hadir, tidak: hitung.tidak, belum: hitung.belum),
                if (bergalat > 0) ...[
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Row(children: [
                      const Icon(Icons.info_outline_rounded, size: 15, color: AppColors.accent400),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text('$bergalat isian ditolak server, ketuk untuk melihat',
                            style: const TextStyle(fontSize: 12.5, color: Color(0xD9FFFFFF))),
                      ),
                    ]),
                  ),
                ],
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Layar petugas satu tim. Membaca draft + antrean milik layar induk.
class _TimAbsensiScreen extends StatelessWidget {
  const _TimAbsensiScreen({required this.induk, required this.timId});
  final _AbsensiPanelState induk;
  final String timId;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: induk._versi,
      builder: (ctx, _) {
        final d = induk._data;
        if (d == null) return const Scaffold(body: Center(child: SisiLoader()));
        final tim = d.tim.where((t) => t.timId == timId).firstOrNull;
        final staf = d.stafDi(timId);
        final h = induk._hitung(staf);
        return Scaffold(
          backgroundColor: const Color(0xFFF6F8FC),
          appBar: sisiAppBar(tim?.nama ?? '-', subjudul: '${staf.length - h.belum} dari ${staf.length} petugas sudah diabsen'),
          bottomNavigationBar: induk._barSimpan(ctx, tutup: ctx),
          body: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 14, 16, 24), children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 0, 4, 10),
              child: Text('Ketuk petugas untuk memilih status. Petugas yang sudah diabsen pengabsen lain terkunci.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
            ),
            for (final s in staf) ...[
              _KartuPetugas(induk: induk, staf: s, ctx: ctx),
              const SizedBox(height: 10),
            ],
          ]),
        );
      },
    );
  }
}

class _KartuPetugas extends StatelessWidget {
  const _KartuPetugas({required this.induk, required this.staf, required this.ctx});
  final _AbsensiPanelState induk;
  final StafAbsensi staf;
  final BuildContext ctx;

  String get _inisial {
    final p = staf.nama.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
    if (p.isEmpty) return '?';
    return (p.first[0] + (p.length > 1 ? p[1][0] : '')).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final s = staf;
    final draft = induk._draft[s.petugasId];
    final a = induk._itemAntre(s);
    final bergalat = a != null && a.galat.isNotEmpty && draft == null;
    // pilihan sesi ini > antrean HP > isian server
    final IsianAbsensi? isian = draft ?? (a != null ? a.isian : (s.status == null ? null : IsianAbsensi(s.status!, s.keterangan)));
    final String ket;
    Color tepi = AppColors.neutral200;
    if (draft != null) {
      ket = 'Dipilih, belum disimpan';
      tepi = AppColors.accent400;
    } else if (a != null) {
      ket = a.galat.isEmpty ? 'Menunggu kirim ke server' : 'Ditolak: ${KodeError.pesan(a.galat)}';
      tepi = a.galat.isEmpty ? AppColors.accent400 : AppColors.red600;
    } else {
      ket = ''; // isian yang sudah di server: tidak perlu diberitahu siapa yang mengisi
    }
    final terkunci = s.terkunci && draft == null && (a == null || a.galat.isNotEmpty);
    final warna = isian == null ? null : _warnaStatus(isian.status);
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: tepi)),
      child: InkWell(
        onTap: () => unawaited(induk._pilih(s, ctx: ctx)),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            CircleAvatar(
              radius: 21,
              backgroundColor: warna?.$2 ?? AppColors.neutral150,
              child: Text(_inisial, style: TextStyle(fontWeight: FontWeight.w800, color: warna?.$1 ?? AppColors.neutral700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.nama, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy900)),
                const SizedBox(height: 3),
                if (isian != null)
                  StatusBadge('${isian.status.simbol} ${isian.status.label}', warna: warna!.$1, latar: warna.$2)
                else
                  const Text('Belum diabsen', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.neutral500)),
                if (isian != null && isian.status.wajibKeterangan && isian.keterangan.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text('Alasan: ${isian.keterangan}', style: const TextStyle(fontSize: 12, color: AppColors.neutral700)),
                  ),
                if (ket.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(ket, style: TextStyle(fontSize: 11.5, color: bergalat ? AppColors.red700 : AppColors.neutral500)),
                  ),
              ]),
            ),
            if (bergalat)
              IconButton(tooltip: 'Buang isian ini', icon: const Icon(Icons.delete_outline_rounded), onPressed: () => unawaited(induk._buang(a)))
            else if (terkunci)
              const Icon(Icons.lock_outline_rounded, size: 20, color: AppColors.neutral500)
            else
              const Icon(Icons.chevron_right_rounded, color: AppColors.neutral400),
          ]),
        ),
      ),
    );
  }
}

/// Pilihan status satu petugas. Daftar 8 status DAPAT DIGULIR (layar kecil / keyboard terbuka), tombol tetap di bawah.
class _SheetStatus extends StatefulWidget {
  const _SheetStatus({required this.nama, required this.awal, required this.bisaBatal});
  final String nama;
  final IsianAbsensi? awal;
  final bool bisaBatal;

  @override
  State<_SheetStatus> createState() => _SheetStatusState();
}

class _SheetStatusState extends State<_SheetStatus> {
  late StatusAbsensi? _status = widget.awal?.status;
  late final TextEditingController _alasan = TextEditingController(text: widget.awal?.keterangan ?? '');

  @override
  void dispose() {
    _alasan.dispose();
    super.dispose();
  }

  bool get _sah => _status != null && (!_status!.wajibKeterangan || _alasan.text.trim().isNotEmpty);

  @override
  Widget build(BuildContext context) {
    final st = _status;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .92),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10),
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.neutral300, borderRadius: BorderRadius.circular(4)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
            child: Text(widget.nama, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy900)),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Pilih status kehadiran', style: TextStyle(fontSize: 12.5, color: AppColors.neutral500)),
          ),
          Flexible(
            child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), children: [
              for (final s in StatusAbsensi.values) _kartuStatus(s),
              if (st != null && st.wajibKeterangan)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: TextField(
                    controller: _alasan,
                    maxLength: 200,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: sisiInput('Alasan (wajib)', hint: 'Mis. Mobil masuk bengkel'),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(children: [
              if (widget.bisaBatal) ...[
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: () => Navigator.pop(context, const _HasilPilih(batal: true)),
                    child: const Text('Batalkan pilihan'),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: _sah ? () => Navigator.pop(context, _HasilPilih(isian: IsianAbsensi(st!, st.wajibKeterangan ? _alasan.text.trim() : ''))) : null,
                  child: const Text('Pilih'),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _kartuStatus(StatusAbsensi s) {
    final (fg, bg) = _warnaStatus(s);
    final dipilih = _status == s;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: dipilih ? bg : Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: dipilih ? fg : AppColors.neutral200, width: dipilih ? 1.6 : 1)),
        child: InkWell(
          onTap: () => setState(() => _status = s),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Text(s.simbol, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 12),
              Expanded(child: Text(s.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: dipilih ? fg : AppColors.navy900))),
              if (s.wajibKeterangan) const Padding(padding: EdgeInsets.only(right: 6), child: Icon(Icons.edit_note_rounded, size: 18, color: AppColors.neutral400)),
              if (dipilih) Icon(Icons.check_circle_rounded, color: fg) else const Icon(Icons.radio_button_unchecked_rounded, color: AppColors.neutral300),
            ]),
          ),
        ),
      ),
    );
  }
}
