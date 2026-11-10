<?php
/**
 * v1.0.38 API baca SiSi (Hostinger) - pustaka bersama. Lihat docs/rancangan-hybrid-mysql.md.
 * Google Sheet tetap sumber utama: API ini hanya menyimpan salinan yang dikirim Apps Script (sinkron.php, bertanda HMAC)
 * dan melayani baca website admin (tiket bertanda dari Apps Script, getTiketApi).
 *
 * Konfigurasi di LUAR public_html: <folder domain>/<nama folder API>-config.php, mis. sisi-api-staging-config.php:
 *   return ['env' => 'staging', 'rahasia' => '<= MYSQL_API_SECRET>', 'dsn' => 'mysql:host=localhost;dbname=...;charset=utf8mb4',
 *           'user' => '...', 'sandi' => '...', 'origin' => ['https://sisi-ulp-toboali.com']];
 */
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const API_VERSI = '1';
const SELISIH_WAKTU_DETIK = 300;
const JENIS_GGN = ['penyulang', 'ar', 'pickup'];

date_default_timezone_set('Asia/Jakarta');
ini_set('display_errors', '0');

function konfig(): array
{
    static $k = null;
    if ($k !== null) return $k;
    $f = getenv('SISI_API_CONFIG') ?: dirname(__DIR__, 2) . '/' . basename(__DIR__) . '-config.php';
    if (!is_file($f)) galat(503, 'CONFIG_KOSONG');
    $k = require $f;
    if (!is_array($k) || strlen((string)($k['rahasia'] ?? '')) < 32 || empty($k['dsn'])) galat(503, 'CONFIG_TIDAK_VALID');
    $k['origin'] = (array)($k['origin'] ?? []);
    return $k;
}

/** Jawaban JSON (isi sudah berupa teks JSON = dikirim apa adanya, dipakai untuk baris besar). */
function jawab(int $http, $isi): void
{
    http_response_code($http);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo is_string($isi) ? $isi : json_encode($isi, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function galat(int $http, string $kode): void
{
    jawab($http, ['ok' => false, 'kode' => $kode, 'waktu' => gmdate('Y-m-d\TH:i:s\Z')]);
}

/** CORS hanya untuk origin di config (website di domain yang sama tidak butuh). OPTIONS dijawab di sini. */
function cors(string $metode): void
{
    $o = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($o !== '' && in_array($o, konfig()['origin'], true)) {
        header('Access-Control-Allow-Origin: ' . $o);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: X-SiSi-Tiket');
        header('Access-Control-Allow-Methods: ' . $metode);
        header('Access-Control-Max-Age: 600');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $metode) galat(405, 'METODE_TIDAK_DIDUKUNG');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $k = konfig();
    // galat database dijawab dengan kode + SQLSTATE / nomor galat driver (tanpa pesan: bisa memuat nama user / host)
    try {
        $pdo = new PDO($k['dsn'], $k['user'] ?? null, $k['sandi'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('sisi-api: koneksi DB gagal: ' . $e->getMessage());
        galat(503, str_contains($e->getMessage(), 'could not find driver') ? 'DB_DRIVER_TIDAK_ADA' : 'DB_TIDAK_TERHUBUNG_' . kodeDb($e));
    }
    try { skema($pdo); } catch (PDOException $e) {
        error_log('sisi-api: skema DB gagal: ' . $e->getMessage());
        galat(503, 'DB_SKEMA_GAGAL_' . kodeDb($e));
    }
    return $pdo;
}

/** SQLSTATE + nomor galat driver (mis. 1045 = user / password salah, 1049 = database tidak ada, 2002 = host salah). */
function kodeDb(PDOException $e): string
{
    $info = $e->errorInfo ?? null;
    $no = is_array($info) && isset($info[1]) ? (string)$info[1] : (preg_match('/\[(\d{4})\]/', $e->getMessage(), $m) ? $m[1] : '');
    return preg_replace('/[^A-Z0-9]/', '', strtoupper((string)$e->getCode())) . ($no !== '' ? '_' . $no : '');
}

/** Tabel dibuat sendiri bila belum ada (MySQL di Hostinger; SQLite untuk uji lokal). */
function skema(PDO $pdo): void
{
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $akhir = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    foreach (JENIS_GGN as $j) {
        $t = 'ggn_' . $j;
        $pdo->exec("CREATE TABLE IF NOT EXISTS $t (urut INTEGER NOT NULL PRIMARY KEY, penyulang VARCHAR(80) NOT NULL,"
            . " tgl CHAR(10) NULL, tahun SMALLINT NULL, isi LONGTEXT NOT NULL"
            . ($mysql ? ", INDEX ix_{$t}_tgl (tgl), INDEX ix_{$t}_tahun (tahun, penyulang)" : '') . ")$akhir");
        if (!$mysql) {
            $pdo->exec("CREATE INDEX IF NOT EXISTS ix_{$t}_tgl ON $t (tgl)");
            $pdo->exec("CREATE INDEX IF NOT EXISTS ix_{$t}_tahun ON $t (tahun, penyulang)");
        }
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS sinkron_info (modul VARCHAR(40) NOT NULL PRIMARY KEY, isi TEXT NOT NULL)$akhir");
    // v1.0.38 jawaban jadi (jawaban.php): ver = ms waktu mulai disusun Apps Script; jawaban_hapus = ver hapus terakhir per grup
    $pdo->exec("CREATE TABLE IF NOT EXISTS jawaban (kunci CHAR(64) NOT NULL PRIMARY KEY, aksi VARCHAR(40) NOT NULL, grup VARCHAR(100) NOT NULL,"
        . " ver BIGINT NOT NULL, isi LONGTEXT NOT NULL" . ($mysql ? ', INDEX ix_jawaban_grup (grup)' : '') . ")$akhir");
    if (!$mysql) $pdo->exec('CREATE INDEX IF NOT EXISTS ix_jawaban_grup ON jawaban (grup)');
    $pdo->exec("CREATE TABLE IF NOT EXISTS jawaban_hapus (grup VARCHAR(100) NOT NULL PRIMARY KEY, ver BIGINT NOT NULL)$akhir");
}

/** Kiriman Apps Script: X-SiSi-Waktu + X-SiSi-Tanda = hex HMAC(rahasia, waktu + '.' + sha256 hex body). Hasil body. */
function wajibTandaAppsScript(): string
{
    $body = (string)file_get_contents('php://input');
    $waktu = $_SERVER['HTTP_X_SISI_WAKTU'] ?? '';
    $tanda = $_SERVER['HTTP_X_SISI_TANDA'] ?? '';
    if (!preg_match('/^\d{9,11}$/', $waktu) || abs(time() - (int)$waktu) > SELISIH_WAKTU_DETIK) galat(401, 'TANDA_KEDALUWARSA');
    $benar = hash_hmac('sha256', $waktu . '.' . hash('sha256', $body), konfig()['rahasia']);
    if (!is_string($tanda) || !hash_equals($benar, strtolower($tanda))) galat(401, 'TANDA_TIDAK_VALID');
    return $body;
}

function base64UrlDecode(string $s): string
{
    $d = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $d === false ? '' : $d;
}

/** Tiket website (getTiketApi): base64url(json) + '.' + hex HMAC(rahasia, 'tiket.' + bagian 1). Hasil isi tiket.
 *  $menu = satu kode menu, atau daftar (cukup salah satu). */
function wajibTiket($menu): array
{
    $t = $_SERVER['HTTP_X_SISI_TIKET'] ?? '';
    if (!is_string($t) || !preg_match('/^([A-Za-z0-9_-]{10,4000})\.([0-9a-f]{64})$/', $t, $m)) galat(401, 'TIKET_TIDAK_VALID');
    if (!hash_equals(hash_hmac('sha256', 'tiket.' . $m[1], konfig()['rahasia']), $m[2])) galat(401, 'TIKET_TIDAK_VALID');
    $isi = json_decode(base64UrlDecode($m[1]), true);
    if (!is_array($isi) || !is_int($isi['exp'] ?? null) || !is_array($isi['m'] ?? null)) galat(401, 'TIKET_TIDAK_VALID');
    if ($isi['exp'] <= time()) galat(401, 'TIKET_KEDALUWARSA');
    if (($isi['env'] ?? '') !== (konfig()['env'] ?? '')) galat(401, 'TIKET_TIDAK_VALID');
    if (!array_intersect((array)$menu, $isi['m'])) galat(403, 'AKSES_DITOLAK');
    return $isi;
}

/** Semua titik masuk: galat tak terduga = 500 tanpa detail ke klien (detail ke error_log Hostinger). */
function jalankan(callable $fn): void
{
    try { $fn(); } catch (Throwable $e) {
        error_log('sisi-api: ' . get_class($e) . ': ' . $e->getMessage());
        galat(500, 'KESALAHAN_SERVER');
    }
}
