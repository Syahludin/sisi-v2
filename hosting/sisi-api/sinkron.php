<?php
/**
 * POST sinkron.php (khusus Apps Script, bertanda HMAC) - modules/93_Mysql.js sinkronMysqlGgn_.
 * Body { modul: 'ggn', sinkron: { waktu, sumber, jumlah }, jenis: { penyulang|ar|pickup: [{ penyulang, tgl, isi }] } }.
 * Tiap jenis yang dikirim DIGANTI UTUH (urutan = urutan sheet) dalam satu transaksi bersama info sinkron.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

const SINKRON_BATCH = 300;

jalankan(function (): void {
    cors('POST');
    $d = json_decode(wajibTandaAppsScript(), true);
    if (!is_array($d) || ($d['modul'] ?? '') !== 'ggn' || !is_array($d['jenis'] ?? null) || !is_array($d['sinkron'] ?? null)) galat(400, 'DATA_TIDAK_VALID');
    foreach ($d['jenis'] as $j => $baris) {
        if (!in_array($j, JENIS_GGN, true) || !is_array($baris)) galat(400, 'DATA_TIDAK_VALID');
        foreach ($baris as $b) {
            if (!is_array($b) || !is_string($b['penyulang'] ?? null) || !is_string($b['tgl'] ?? null) || !is_array($b['isi'] ?? null)
                || ($b['tgl'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $b['tgl']))) galat(400, 'DATA_TIDAK_VALID');
        }
    }
    $pdo = db();
    $jumlah = [];
    $pdo->beginTransaction();
    try {
        foreach ($d['jenis'] as $j => $baris) {
            $t = 'ggn_' . $j;   // $j sudah dicek ada di JENIS_GGN
            $pdo->exec("DELETE FROM $t");
            foreach (array_chunk($baris, SINKRON_BATCH, true) as $potong) {
                $nilai = [];
                foreach ($potong as $i => $b) {
                    array_push($nilai, $i + 1, mb_substr($b['penyulang'], 0, 80), $b['tgl'] === '' ? null : $b['tgl'],
                        $b['tgl'] === '' ? null : (int)substr($b['tgl'], 0, 4), json_encode($b['isi'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                }
                $tanya = implode(',', array_fill(0, count($potong), '(?,?,?,?,?)'));
                $pdo->prepare("INSERT INTO $t (urut, penyulang, tgl, tahun, isi) VALUES $tanya")->execute($nilai);
            }
            $jumlah[$j] = count($baris);
        }
        $info = json_encode(['waktu' => (string)($d['sinkron']['waktu'] ?? ''), 'sumber' => (string)($d['sinkron']['sumber'] ?? ''),
            'jumlah' => $d['sinkron']['jumlah'] ?? null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $pdo->prepare('DELETE FROM sinkron_info WHERE modul = ?')->execute(['ggn']);
        $pdo->prepare('INSERT INTO sinkron_info (modul, isi) VALUES (?, ?)')->execute(['ggn', $info]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    jawab(200, ['ok' => true, 'data' => ['ditulis' => array_keys($jumlah), 'jumlah' => $jumlah]]);
});
