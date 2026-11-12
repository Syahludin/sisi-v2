<?php
/**
 * POST cabut.php (khusus Apps Script, bertanda HMAC) - 102_Tiang_Hostinger.js sinkronCabutTiketTiang_.
 * Body { cabut: [user_id, ...] } = DAFTAR LENGKAP akun nonaktif. tiang_cabut diganti menjadi persis daftar itu dalam satu transaksi
 * (akun yang tidak ada lagi di daftar = diaktifkan kembali). Tiket HP milik akun tercabut ditolak tiang.php (TIKET_DICABUT).
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/tiang_lib.php';

const CABUT_MAKS = 5000;

jalankan(function (): void {
    cors('POST');
    $d = json_decode(wajibTandaAppsScript(), true);
    if (!is_array($d) || !is_array($d['cabut'] ?? null) || count($d['cabut']) > CABUT_MAKS) galat(400, 'DATA_TIDAK_VALID');
    $ids = [];
    foreach ($d['cabut'] as $id) {
        if (!is_string($id) || !preg_match('/^[0-9A-Za-z._:-]{1,40}$/', $id)) galat(400, 'DATA_TIDAK_VALID');
        $ids[$id] = true;
    }
    $pdo = db();
    $sekarang = gmdate('Y-m-d\TH:i:s\Z');
    $pdo->beginTransaction();
    try {
        $ada = array_flip($pdo->query('SELECT user_id FROM tiang_cabut')->fetchAll(PDO::FETCH_COLUMN));
        $hapus = $pdo->prepare('DELETE FROM tiang_cabut WHERE user_id = ?');
        foreach (array_keys($ada) as $id) if (!isset($ids[(string)$id])) $hapus->execute([(string)$id]);
        $tambah = $pdo->prepare('INSERT INTO tiang_cabut (user_id, sejak) VALUES (?, ?)');
        foreach (array_keys($ids) as $id) if (!isset($ada[(string)$id])) $tambah->execute([(string)$id, $sekarang]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    jawab(200, ['ok' => true, 'data' => ['jumlah' => count($ids)]]);
});
