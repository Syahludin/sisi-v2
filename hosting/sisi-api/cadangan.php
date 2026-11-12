<?php
/**
 * Cadangan harian modul tiang (jalankan dari cron Hostinger, BUKAN dari web: lewat HTTP dijawab 404).
 *   php cadangan.php                         -> tulis <cadangan_dir>/tiang-YYYYMMDD.jsonl.gz (14 terakhir disimpan), bersihkan berkas foto yatim,
 *                                               catat hasil di sinkron_info 'tiang_cadangan'
 *   php cadangan.php pulihkan=<berkas> --ya  -> KOSONGKAN tabel tiang_* lalu isi dari berkas cadangan (pemulihan; tanpa --ya ditolak)
 * Format: JSON Lines (baris pertama {"meta":...}, lalu {"t": tabel, "r": baris}) digzip. Dipilih sebagai pengganti mysqldump karena exec /
 * proc_open dimatikan di hosting dan karena bisa dipulihkan ke MySQL maupun SQLite tanpa pelarian kutip. Data dibaca dalam satu transaksi
 * (gambaran konsisten). Foto TIDAK ikut (berkas di foto_dir; arsip kedua di Drive lewat ADMIN_arsipFotoTiang).
 * config (di luar public_html): cadangan_dir (bawaan <folder domain>/sisi-tiang-cadangan).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/_lib.php';
require __DIR__ . '/tiang_lib.php';

const CADANGAN_SIMPAN = 14;
const CADANGAN_FORMAT = 'sisi-tiang-cadangan-1';

/** Tabel yang dicadangkan: semua tiang_* kecuali rem laju (data sementara). */
function tabelCadangan(): array
{
    return array_values(array_filter(daftarTabelTiang(), fn ($t) => $t !== 'tiang_laju'));
}

function folderCadangan(): string
{
    $d = rtrim((string)(konfig()['cadangan_dir'] ?? dirname(__DIR__, 2) . '/sisi-tiang-cadangan'), '/' . chr(92));
    if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw new RuntimeException('folder cadangan tidak bisa dibuat');
    return $d;
}

/** Tulis cadangan ke [$tmp] (gzip JSON Lines) dalam satu transaksi baca. Hasil jumlah baris per tabel. */
function tulisCadangan(PDO $pdo, string $tmp): array
{
    $gz = gzopen($tmp, 'wb9');
    if ($gz === false) throw new RuntimeException('berkas cadangan tidak bisa dibuat');
    $baris = [];
    $pdo->beginTransaction();
    try {
        gzwrite($gz, json_encode(['meta' => ['format' => CADANGAN_FORMAT, 'skema' => SKEMA_TIANG_VERSI, 'waktu' => gmdate('Y-m-d\TH:i:s\Z')]], JSON_UNESCAPED_UNICODE) . "\n");
        foreach (tabelCadangan() as $t) {
            $baris[$t] = 0;
            foreach ($pdo->query("SELECT * FROM $t") as $r) {
                $j = json_encode(['t' => $t, 'r' => $r], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
                if ($j === false) throw new RuntimeException("baris $t tidak bisa dikodekan");
                gzwrite($gz, $j . "\n");
                $baris[$t]++;
            }
        }
    } finally {
        $pdo->commit();   // hanya membaca: commit = melepas gambaran
        gzclose($gz);
    }
    return $baris;
}

/** Simpan 14 cadangan terbaru, hapus yang lebih lama. Hasil jumlah berkas dihapus. */
function putarCadangan(string $dir, int $simpan = CADANGAN_SIMPAN): int
{
    $berkas = glob($dir . '/tiang-*.jsonl.gz') ?: [];
    rsort($berkas);
    $hapus = 0;
    foreach (array_slice($berkas, $simpan) as $f) if (@unlink($f)) $hapus++;
    return $hapus;
}

/** Kosongkan tabel tiang_* (kecuali rem laju) lalu isi dari [$berkas]. Hasil jumlah baris per tabel. Satu transaksi: gagal = tidak ada yang berubah. */
function pulihkanCadangan(PDO $pdo, string $berkas): array
{
    $gz = gzopen($berkas, 'rb');
    if ($gz === false) throw new RuntimeException('berkas cadangan tidak terbaca');
    try {
        $meta = json_decode((string)gzgets($gz), true);
        if (($meta['meta']['format'] ?? '') !== CADANGAN_FORMAT) throw new RuntimeException('format cadangan tidak dikenal');
        if ((string)($meta['meta']['skema'] ?? '') !== SKEMA_TIANG_VERSI) throw new RuntimeException('versi skema cadangan ' . ($meta['meta']['skema'] ?? '?') . ' beda dari server ' . SKEMA_TIANG_VERSI);
        $sah = array_flip(tabelCadangan());
        return denganTransaksi($pdo, function () use ($pdo, $gz, $sah) {
            foreach (array_keys($sah) as $t) $pdo->exec("DELETE FROM $t");
            $hitung = array_fill_keys(array_keys($sah), 0);
            $stmt = [];
            while (($baris = gzgets($gz)) !== false) {
                if (trim($baris) === '') continue;
                $o = json_decode($baris, true);
                if (!is_array($o) || !isset($o['t'], $o['r']) || !isset($sah[$o['t']]) || !is_array($o['r'])) throw new RuntimeException('baris cadangan tidak sah');
                $kolom = array_keys($o['r']);
                foreach ($kolom as $k) if (!preg_match('/^[a-z_0-9]+$/', (string)$k)) throw new RuntimeException('nama kolom tidak sah');
                $kunci = $o['t'] . '|' . implode(',', $kolom);
                $stmt[$kunci] ??= $pdo->prepare("INSERT INTO {$o['t']} (" . implode(', ', $kolom) . ') VALUES (' . implode(', ', array_fill(0, count($kolom), '?')) . ')');
                $stmt[$kunci]->execute(array_values($o['r']));
                $hitung[$o['t']]++;
            }
            return $hitung;
        });
    } finally {
        gzclose($gz);
    }
}

function jalankanCadangan(): int
{
    $pdo = db();
    $dir = folderCadangan();
    $akhir = $dir . '/tiang-' . gmdate('Ymd') . '.jsonl.gz';
    $tmp = $akhir . '.tmp-' . bin2hex(random_bytes(4));
    try {
        $baris = tulisCadangan($pdo, $tmp);
        if (!rename($tmp, $akhir)) throw new RuntimeException('berkas cadangan tidak bisa dipindah');
    } catch (Throwable $e) {
        @unlink($tmp);
        throw $e;
    }
    $dihapus = putarCadangan($dir);
    $yatim = bersihkanYatim($pdo);
    $info = ['waktu' => gmdate('Y-m-d\TH:i:s\Z'), 'berkas' => basename($akhir), 'bytes' => filesize($akhir), 'baris' => $baris, 'cadangan_dihapus' => $dihapus, 'foto_yatim_dihapus' => $yatim];
    $pdo->prepare('DELETE FROM sinkron_info WHERE modul = ?')->execute(['tiang_cadangan']);
    $pdo->prepare('INSERT INTO sinkron_info (modul, isi) VALUES (?, ?)')->execute(['tiang_cadangan', json_encode($info)]);
    echo 'Cadangan tiang OK: ' . $info['berkas'] . ' (' . $info['bytes'] . " byte), baris: " . array_sum($baris) . ", cadangan lama dihapus: $dihapus, foto yatim dihapus: $yatim\n";
    return 0;
}

$sukses = false;
register_shutdown_function(function () use (&$sukses) { if (!$sukses) exit(1); });   // galat database dari _lib.php (galat() lalu exit) tetap berstatus gagal untuk cron

try {
    $berkas = null;
    $ya = false;
    foreach (array_slice($argv ?? [], 1) as $a) {
        if (str_starts_with($a, 'pulihkan=')) $berkas = substr($a, 9);
        elseif ($a === '--ya') $ya = true;
        else { fwrite(STDERR, "Argumen tidak dikenal: $a\n"); $sukses = true; exit(2); }
    }
    if ($berkas !== null) {
        if (!$ya) { fwrite(STDERR, "Pemulihan MENGOSONGKAN tabel tiang_*. Ulangi dengan --ya bila yakin.\n"); $sukses = true; exit(2); }
        $h = pulihkanCadangan(db(), $berkas);
        echo 'Pemulihan OK: ' . json_encode($h) . "\n";
        $kode = 0;
    } else {
        $kode = jalankanCadangan();
    }
    $sukses = true;
    exit($kode);
} catch (Throwable $e) {
    fwrite(STDERR, 'Cadangan GAGAL: ' . $e->getMessage() . "\n");
    exit(1);
}
