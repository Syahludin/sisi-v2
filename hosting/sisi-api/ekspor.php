<?php
/**
 * POST ekspor.php (khusus Apps Script, bertanda HMAC) - 102_Tiang_Hostinger.js ADMIN_tarikDataTiang / ADMIN_arsipFotoTiang.
 * Sheet SiSi_Tiang hanyalah SALINAN: Apps Script MENARIK data dari sini (tidak ada yang mendorong ke Sheet).
 *   { jenis: 'tabel', tabel, kursor?: {urut, id}, batas? }          -> { baris: [...kolom sheet + No], kursor, selesai, total }
 *   { jenis: 'foto_belum_arsip', batas?, lewati? }                 -> { foto: [{pemilik, id, slot, sha256, bytes}], sisa }  (lewati = jumlah yang gagal diarsip di proses ini)
 *   { jenis: 'foto_unduh', pemilik, id, slot }                     -> { sha256, mime, ukuranByte, data base64, folder }
 *   { jenis: 'tandai_arsip', pemilik, id, slot, sha256, drive_file_id } -> { ditandai }  (hanya bila sidik masih sama)
 *   { jenis: 'ruang' }                                              -> { foto_berkas, foto_bytes, belum_arsip }
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/tiang_lib.php';
require_once __DIR__ . '/tiang_aksi_baca.php';   // kodeJalurTiang

const EKSPOR_BATAS_MAKS = 500;
const EKSPOR_FOTO_BATAS_MAKS = 50;
const EKSPOR_POLA_ID = '/^[0-9A-Za-z._-]{1,40}$/';
const EKSPOR_FOTO = [
    'TIANG' => ['tabel' => 'tiang_tiang', 'kunci' => 'tiang_id', 'slot' => FOTO_SLOT_TIANG],
    'SWITCHING' => ['tabel' => 'tiang_switching', 'kunci' => 'switching_id', 'slot' => FOTO_SLOT_SWITCHING],
];

jalankan(function (): void {
    cors('POST');
    $d = json_decode(wajibTandaAppsScript(), true);
    if (!is_array($d) || !is_string($d['jenis'] ?? null)) galat(400, 'DATA_TIDAK_VALID');
    $pdo = db();
    try {
        $hasil = match ($d['jenis']) {
            'tabel' => eksporTabel($pdo, $d),
            'foto_belum_arsip' => eksporFotoBelumArsip($pdo, $d),
            'foto_unduh' => eksporFotoUnduh($pdo, $d),
            'tandai_arsip' => eksporTandaiArsip($pdo, $d),
            'ruang' => eksporRuang($pdo),
            default => throw new TiangGalat(400, 'DATA_TIDAK_VALID'),
        };
    } catch (TiangGalat $e) {
        $e->kirim();
    }
    jawab(200, ['ok' => true, 'data' => $hasil]);
});

/** Nilai DB -> nilai sel Sheet: NULL = '', boolean aktif / wajib = true / false, selebihnya apa adanya. */
function nilaiSel(string $kolom, $v)
{
    if (in_array($kolom, TIANG_BOOL, true)) return aktif($v);
    return $v ?? '';
}

function eksporTabel(PDO $pdo, array $d): array
{
    $tabel = $d['tabel'] ?? null;
    if (!is_string($tabel) || !isset(TIANG_KOLOM[$tabel])) throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    $batas = min(EKSPOR_BATAS_MAKS, max(1, (int)($d['batas'] ?? EKSPOR_BATAS_MAKS)));
    $pk = TIANG_KUNCI[$tabel][0];
    $kursor = $d['kursor'] ?? null;
    if ($kursor !== null && (!is_array($kursor) || !is_int($kursor['urut'] ?? null) || !is_string($kursor['id'] ?? null))) throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    $sql = "SELECT * FROM $tabel" . ($kursor ? " WHERE (urut > ? OR (urut = ? AND $pk > ?))" : '') . " ORDER BY urut, $pk LIMIT " . ($batas + 1);
    $q = $pdo->prepare($sql);
    $q->execute($kursor ? [$kursor['urut'], $kursor['urut'], $kursor['id']] : []);
    $rows = $q->fetchAll();
    $selesai = count($rows) <= $batas;
    $rows = array_slice($rows, 0, $batas);
    // kolom foto_*_id: id berkas Drive bila foto sudah diarsip (kompatibel dengan Sheet lama), selain itu path di Hostinger
    $drive = [];
    foreach (EKSPOR_FOTO as $pemilik => $cfg) {
        if ($cfg['tabel'] !== $tabel) continue;
        $f = $pdo->prepare('SELECT pemilik_id, slot, drive_file_id FROM tiang_foto WHERE pemilik = ? AND drive_file_id IS NOT NULL');
        $f->execute([$pemilik]);
        foreach ($f->fetchAll() as $r) $drive[$r['pemilik_id'] . '|' . $r['slot']] = $r['drive_file_id'];
    }
    $baris = [];
    foreach ($rows as $r) {
        $o = ['No' => (int)$r['urut']];
        foreach (TIANG_KOLOM[$tabel] as $k) $o[$k] = nilaiSel($k, $r[$k]);
        foreach (EKSPOR_FOTO as $pemilik => $cfg) {
            if ($cfg['tabel'] !== $tabel) continue;
            foreach ($cfg['slot'] as $slot => $kol) if (isset($drive[$r[$cfg['kunci']] . '|' . $slot])) $o[$kol] = $drive[$r[$cfg['kunci']] . '|' . $slot];
        }
        $baris[] = $o;
    }
    $akhir = $rows ? $rows[count($rows) - 1] : null;
    return [
        'tabel' => $tabel, 'baris' => $baris, 'selesai' => $selesai,
        'kursor' => $akhir && !$selesai ? ['urut' => (int)$akhir['urut'], 'id' => (string)$akhir[$pk]] : null,
        'total' => (int)$pdo->query("SELECT COUNT(*) FROM $tabel")->fetchColumn(),
    ];
}

function eksporFotoBelumArsip(PDO $pdo, array $d): array
{
    $batas = min(EKSPOR_FOTO_BATAS_MAKS, max(1, (int)($d['batas'] ?? 20)));
    $q = $pdo->query('SELECT pemilik, pemilik_id, slot, sha256, bytes FROM tiang_foto WHERE diarsip_pada IS NULL ORDER BY dibuat_pada, pemilik, pemilik_id, slot LIMIT ' . $batas . ' OFFSET ' . max(0, (int)($d['lewati'] ?? 0)));
    return [
        'foto' => array_map(fn ($r) => ['pemilik' => $r['pemilik'], 'id' => $r['pemilik_id'], 'slot' => $r['slot'], 'sha256' => $r['sha256'], 'bytes' => (int)$r['bytes']], $q->fetchAll()),
        'sisa' => (int)$pdo->query('SELECT COUNT(*) FROM tiang_foto WHERE diarsip_pada IS NULL')->fetchColumn(),
    ];
}

/** Pemilik + id + slot sah -> baris tiang_foto (404 FOTO_TIDAK_ADA bila tidak ada). */
function barisFotoEkspor(PDO $pdo, array $d): array
{
    $pemilik = $d['pemilik'] ?? null;
    $id = $d['id'] ?? null;
    $slot = $d['slot'] ?? null;
    if (!is_string($pemilik) || !isset(EKSPOR_FOTO[$pemilik]) || !is_string($id) || !preg_match(EKSPOR_POLA_ID, $id) || !is_string($slot) || !isset(EKSPOR_FOTO[$pemilik]['slot'][$slot])) {
        throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    }
    $q = $pdo->prepare('SELECT * FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?');
    $q->execute([$pemilik, $id, $slot]);
    $r = $q->fetch();
    if (!$r) throw new TiangGalat(404, 'FOTO_TIDAK_ADA');
    return $r;
}

function eksporFotoUnduh(PDO $pdo, array $d): array
{
    $r = barisFotoEkspor($pdo, $d);
    $abs = fotoDirTiang() . '/' . $r['path'];
    $isi = is_file($abs) ? file_get_contents($abs) : false;
    if ($isi === false) throw new TiangGalat(404, 'FOTO_TIDAK_ADA');
    $folder = 'Switching';
    if ($r['pemilik'] === 'TIANG') {
        $t = $pdo->prepare('SELECT * FROM tiang_tiang WHERE tiang_id = ?');
        $t->execute([$r['pemilik_id']]);
        $baris = $t->fetch();
        $folder = $baris ? kodeJalurTiang($baris) : TIANG_KODE_LAIN;
    }
    return ['sha256' => $r['sha256'], 'mime' => 'image/jpeg', 'ukuranByte' => strlen($isi), 'data' => base64_encode($isi), 'folder' => $folder];
}

function eksporTandaiArsip(PDO $pdo, array $d): array
{
    $r = barisFotoEkspor($pdo, $d);
    $driveId = $d['drive_file_id'] ?? null;
    if (!is_string($driveId) || !preg_match('/^[0-9A-Za-z_-]{10,120}$/', $driveId) || !is_string($d['sha256'] ?? null)) throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    // foto diganti sejak diunduh (sidik beda): jangan ditandai, akan diarsip lagi
    if (!hash_equals((string)$r['sha256'], $d['sha256'])) return ['ditandai' => false];
    $pdo->prepare('UPDATE tiang_foto SET diarsip_pada = ?, drive_file_id = ? WHERE pemilik = ? AND pemilik_id = ? AND slot = ? AND sha256 = ?')
        ->execute([sekarangIsoTiang(), $driveId, $r['pemilik'], $r['pemilik_id'], $r['slot'], $r['sha256']]);
    return ['ditandai' => true];
}

function eksporRuang(PDO $pdo): array
{
    $q = $pdo->query('SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM tiang_foto')->fetch();
    return ['foto_berkas' => (int)$q['n'], 'foto_bytes' => (int)$q['b'], 'belum_arsip' => (int)$pdo->query('SELECT COUNT(*) FROM tiang_foto WHERE diarsip_pada IS NULL')->fetchColumn(), 'cadangan' => infoCadangan($pdo)];
}
