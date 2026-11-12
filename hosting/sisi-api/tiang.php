<?php
/**
 * POST tiang.php { action, data } (header X-SiSi-Tiket): pintu tunggal modul tiang (HP dan web admin).
 * Urutan: tiket sah -> tiket tidak dicabut -> badan <= 4 MB dan JSON sah -> aksi dikenal -> izin menu / hak ubah -> rem laju -> aksi.
 * Nama aksi dan bentuk jawaban mengikuti kontrak Apps Script (docs/API-CONTRACT.md); galat validasi = 422 dengan daftar [{field, pesan}].
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/tiang_lib.php';

jalankan(function (): void {
    cors('POST');
    $tiket = bacaTiket();
    $user = (string)($tiket['u'] ?? '');
    if ($user === '' || strlen($user) > 40) galat(401, 'TIKET_TIDAK_VALID');
    $pdo = db();
    if (tiketDicabut($pdo, $user)) galat(401, 'TIKET_DICABUT');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > TIANG_BODY_MAKS) galat(413, 'PAYLOAD_TERLALU_BESAR');
    $body = (string)file_get_contents('php://input');
    if (strlen($body) > TIANG_BODY_MAKS) galat(413, 'PAYLOAD_TERLALU_BESAR');
    $p = json_decode($body, true);
    if (!is_array($p) || !is_string($p['action'] ?? null) || !is_array($p['data'] ?? []) ) galat(400, 'DATA_TIDAK_VALID');
    $aksi = tiangAksi();
    $nama = $p['action'];
    if (!isset($aksi[$nama])) galat(400, 'AKSI_TIDAK_DIKENAL');
    $kode = izinkanAksi($tiket, $aksi[$nama]);
    if ($kode !== null) galat(403, $kode);
    remLajuTiang($pdo, $user);
    try {
        $hasil = ($aksi[$nama]['fn'])($p['data'] ?? [], $tiket);
    } catch (TiangGalat $e) {
        $e->kirim();
    }
    jawabOk($hasil);
});
