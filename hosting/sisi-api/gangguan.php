<?php
/**
 * GET gangguan.php?dari=yyyy-MM-dd&sampai=yyyy-MM-dd (header X-SiSi-Tiket, menu OPS_REKAP_GANGGUAN).
 * Jawaban SAMA dengan getHistoriGangguan Apps Script (modules/63_Gangguan.js): { dari, sampai, tahunTop, sinkron, top, penyulang,
 * ar, pickup }; rentang bawaan 1 Januari tahun ini s.d. hari ini (WIB), maks 731 hari; top = 12 penyulang terbanyak tahun
 * berjalan (tidak ikut rentang), urut jumlah lalu nama.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

const RENTANG_MAKS_HARI = 731;

function tanggalGet(string $k, string $bawaan): string
{
    $v = $_GET[$k] ?? '';
    $v = is_string($v) && $v !== '' ? $v : $bawaan;
    $d = DateTime::createFromFormat('!Y-m-d', $v, new DateTimeZone('UTC'));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !$d || $d->format('Y-m-d') !== $v) galat(400, 'FORMAT_SALAH');
    return $v;
}

jalankan(function (): void {
    cors('GET');
    wajibTiket('OPS_REKAP_GANGGUAN');
    foreach (array_keys($_GET) as $k) if (!in_array($k, ['dari', 'sampai'], true)) galat(400, 'FIELD_TIDAK_DIKENAL');
    $hariIni = date('Y-m-d');
    $tahunIni = (int)substr($hariIni, 0, 4);
    $dari = tanggalGet('dari', $tahunIni . '-01-01');
    $sampai = tanggalGet('sampai', $hariIni);
    if ($dari > $sampai) galat(400, 'DI_LUAR_RENTANG');
    if ((strtotime($sampai . 'T00:00:00Z') - strtotime($dari . 'T00:00:00Z')) / 86400 > RENTANG_MAKS_HARI) galat(400, 'DI_LUAR_RENTANG');

    $pdo = db();
    $info = $pdo->query("SELECT isi FROM sinkron_info WHERE modul = 'ggn'")->fetchColumn();
    $bagian = [];
    $top = [];
    foreach (JENIS_GGN as $j) {
        $q = $pdo->prepare("SELECT isi FROM ggn_$j WHERE tgl >= ? AND tgl <= ? ORDER BY urut");
        $q->execute([$dari, $sampai]);
        $bagian[] = json_encode($j) . ':[' . implode(',', $q->fetchAll(PDO::FETCH_COLUMN)) . ']';
        $q = $pdo->prepare("SELECT penyulang, COUNT(*) AS n FROM ggn_$j WHERE tahun = ? AND penyulang <> '' GROUP BY penyulang");
        $q->execute([$tahunIni]);
        $hitung = array_map(fn ($r) => ['nama' => $r['penyulang'], 'jumlah' => (int)$r['n']], $q->fetchAll());
        usort($hitung, fn ($a, $b) => $b['jumlah'] <=> $a['jumlah'] ?: strcmp($a['nama'], $b['nama']));
        $top[$j] = array_slice($hitung, 0, 12);
    }
    $kepala = ['dari' => $dari, 'sampai' => $sampai, 'tahunTop' => $tahunIni, 'sinkron' => $info ? json_decode($info, true) : null, 'top' => $top];
    $kepala = substr(json_encode($kepala, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 0, -1);
    if (!headers_sent() && str_contains($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip')) ob_start('ob_gzhandler');
    jawab(200, '{"ok":true,"sumber":"mysql","waktu":' . json_encode(gmdate('Y-m-d\TH:i:s\Z')) . ',"data":' . $kepala . ',' . implode(',', $bagian) . '}}');
});
