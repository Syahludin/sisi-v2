<?php
/**
 * POST impor.php (khusus Apps Script, bertanda HMAC) - 102_Tiang_Hostinger.js ADMIN_imporTiangKeHostinger / ADMIN_imporFotoTiang.
 * Impor awal (dan impor ulang) modul tiang dari spreadsheet ke MySQL. Idempoten: upsert per kunci, bisa diulang.
 *   { jenis: 'tabel', tabel, baris: [{kolom sheet...}], urutAwal? }  -> { ditulis, ditolak: [{baris, alasan}] }
 *       Baris yang kolom kuncinya bukan teks utuh (angka, tanggal, notasi ilmiah hasil Sheets) DITOLAK, bukan diperbaiki diam-diam.
 *   { jenis: 'foto_ada', pemilik: TIANG | SWITCHING }                  -> { ada: ['<id>|<slot>', ...] }
 *   { jenis: 'foto', pemilik, id, slot, sha256, ukuranByte, data }     -> { path, sha256, bytes, sudah }  (tanpa menaikkan revision)
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/tiang_lib.php';
require_once __DIR__ . '/tiang_aksi_baca.php';   // kodeJalurTiang

const IMPOR_BARIS_MAKS = 500;
const IMPOR_BODY_MAKS = 8 * 1024 * 1024;
const IMPOR_POLA_ID = '/^[0-9A-Za-z._-]{1,40}$/';
const IMPOR_FOTO = [
    'TIANG' => ['tabel' => 'tiang_tiang', 'kunci' => 'tiang_id', 'slot' => FOTO_SLOT_TIANG],
    'SWITCHING' => ['tabel' => 'tiang_switching', 'kunci' => 'switching_id', 'slot' => FOTO_SLOT_SWITCHING],
];

jalankan(function (): void {
    cors('POST');
    $body = wajibTandaAppsScript();
    if (strlen($body) > IMPOR_BODY_MAKS) galat(413, 'PAYLOAD_TERLALU_BESAR');
    $d = json_decode($body, true);
    if (!is_array($d) || !is_string($d['jenis'] ?? null)) galat(400, 'DATA_TIDAK_VALID');
    $pdo = db();
    try {
        $hasil = match ($d['jenis']) {
            'tabel' => imporTabel($pdo, $d),
            'foto_ada' => imporFotoAda($pdo, $d),
            'foto' => imporFoto($pdo, $d),
            default => throw new TiangGalat(400, 'DATA_TIDAK_VALID'),
        };
    } catch (TiangGalat $e) {
        $e->kirim();
    }
    jawab(200, ['ok' => true, 'data' => $hasil]);
});

function imporTabel(PDO $pdo, array $d): array
{
    $tabel = $d['tabel'] ?? null;
    if (!is_string($tabel) || !isset(TIANG_KOLOM[$tabel]) || !is_array($d['baris'] ?? null) || count($d['baris']) > IMPOR_BARIS_MAKS) throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    $kunci = TIANG_KUNCI[$tabel];
    $terima = [];
    $ditolak = [];
    foreach (array_values($d['baris']) as $i => $b) {
        if (!is_array($b) || array_is_list($b) && $b) { $ditolak[] = ['baris' => $i + 1, 'alasan' => 'baris bukan objek']; continue; }
        foreach ($kunci as $k) {
            $v = $b[$k] ?? null;
            if ($v === null || $v === '') continue 2;   // baris kosong dilewati tanpa laporan (sheet punya baris kosong di bawah)
            if (!is_string($v) || !preg_match(IMPOR_POLA_ID, $v) || preg_match('/^\d+(\.\d+)?[eE][+-]?\d+$/', $v)) {
                $ditolak[] = ['baris' => $i + 1, 'alasan' => "kolom $k bukan teks utuh (" . (is_string($v) ? mb_substr($v, 0, 30) : gettype($v)) . '): periksa format kolom di Sheet'];
                continue 2;
            }
        }
        $terima[] = $b;
    }
    $urutAwal = max(1, (int)($d['urutAwal'] ?? 1));
    $ditulis = $terima ? denganTransaksi($pdo, fn () => isiBarisTiang($pdo, $tabel, $terima, $urutAwal)) : 0;
    return ['ditulis' => $ditulis, 'ditolak' => $ditolak];
}

function imporFotoAda(PDO $pdo, array $d): array
{
    $pemilik = $d['pemilik'] ?? null;
    if (!is_string($pemilik) || !isset(IMPOR_FOTO[$pemilik])) throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    $q = $pdo->prepare('SELECT pemilik_id, slot FROM tiang_foto WHERE pemilik = ?');
    $q->execute([$pemilik]);
    return ['ada' => array_map(fn ($r) => $r['pemilik_id'] . '|' . $r['slot'], $q->fetchAll())];
}

function imporFoto(PDO $pdo, array $d): array
{
    $pemilik = $d['pemilik'] ?? null;
    $id = $d['id'] ?? null;
    $slot = $d['slot'] ?? null;
    if (!is_string($pemilik) || !isset(IMPOR_FOTO[$pemilik]) || !is_string($id) || !preg_match(IMPOR_POLA_ID, $id) || !is_string($slot) || !isset(IMPOR_FOTO[$pemilik]['slot'][$slot])) {
        throw new TiangGalat(400, 'DATA_TIDAK_VALID');
    }
    $cfg = IMPOR_FOTO[$pemilik];
    $q = $pdo->prepare("SELECT * FROM {$cfg['tabel']} WHERE {$cfg['kunci']} = ?");
    $q->execute([$id]);
    $baris = $q->fetch();
    if (!$baris) throw new TiangGalat(404, 'DATA_TIDAK_DITEMUKAN');
    $sudah = $pdo->prepare('SELECT path, sha256, bytes FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?');
    $sudah->execute([$pemilik, $id, $slot]);
    $ada = $sudah->fetch();
    $g = new KumpulGalat();
    $p = siapkanFotoTiang(['sha256' => $d['sha256'] ?? null, 'ukuranByte' => $d['ukuranByte'] ?? null, 'data' => $d['data'] ?? null], $slot, $g);
    lemparBilaAda($g);
    if ($ada && $ada['sha256'] === $p['sha256']) return ['path' => $ada['path'], 'sha256' => $ada['sha256'], 'bytes' => (int)$ada['bytes'], 'sudah' => true];
    $folder = $pemilik === 'TIANG' ? kodeJalurTiang($baris) : 'Switching';
    $dibuat = [];
    $hapusNanti = [];
    try {
        $konf = denganTransaksi($pdo, fn () => simpanFotoPaket($pdo, $pemilik, $id, $folder, [$slot => $p], $cfg['slot'], $cfg['tabel'], $cfg['kunci'], sekarangIsoTiang(), $dibuat, $hapusNanti));
    } catch (Throwable $e) {
        foreach ($dibuat as $f) @unlink($f);
        throw $e;
    }
    foreach ($hapusNanti as $rel) hapusBerkasFotoBilaYatim($pdo, $rel);
    $q = $pdo->prepare('SELECT path FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?');
    $q->execute([$pemilik, $id, $slot]);
    return ['path' => (string)$q->fetchColumn()] + $konf[$slot] + ['sudah' => false];
}
