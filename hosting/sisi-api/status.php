<?php
/** GET status.php: API + database hidup, waktu sinkron terakhir (tanpa data, tanpa tiket). */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

jalankan(function (): void {
    cors('GET');
    $info = db()->query("SELECT isi FROM sinkron_info WHERE modul = 'ggn'")->fetchColumn();
    $info = $info ? json_decode($info, true) : null;
    jawab(200, ['ok' => true, 'data' => ['versi' => API_VERSI, 'env' => konfig()['env'] ?? '', 'sinkronGangguan' => $info['waktu'] ?? null]]);
});
