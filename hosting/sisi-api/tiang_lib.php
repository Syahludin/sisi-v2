<?php
/**
 * Modul tiang di Hostinger (docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md): pustaka bersama tiang.php.
 * Skema tiang_* (nama kolom = header sheet SiSi_Tiang, tanpa kolom No), izin per aksi, pengumpul galat validasi,
 * rem laju per pengguna. Dimuat setelah _lib.php; db() memanggil skemaTiang() bila fungsi ini ada.
 */
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const SKEMA_TIANG_VERSI = '2';
const TIANG_BODY_MAKS = 6 * 1024 * 1024;   // data + 2 foto (batas keras 2 MB per foto sebelum base64)
const TIANG_LAJU_MENIT = 120;

/** Urutan kolom = header tab (95_Tiang_Master.js TIANG_HEADER_ tanpa 'No'). Tes tiang-php.test.js membandingkan keduanya. */
const TIANG_KOLOM = [
    'tiang_tiang' => ['tiang_id', 'assetnum_lain', 'digabung_ke', 'ssot_number', 'nama', 'kode_nama_aset',
        'lat_aset', 'lng_aset', 'konstruksi_aset', 'jenis_tiang_aset', 'ukuran_tiang_aset', 'kelas_area', 'status_aset', 'bulan_sumber', 'keterangan_sumber',
        'jumlah_sirkuit', 'jenis_tiang', 'ukuran_tiang', 'konstruksi_lapangan', 'lat', 'lng', 'sumber_koordinat', 'akurasi_m', 'gardu_id',
        'foto_tiang_id', 'foto_kepala_id', 'tanda_cek', 'status_verifikasi', 'verifikasi_terakhir', 'diverifikasi_oleh',
        'aktif', 'revision', 'diubah_pada', 'diubah_oleh', 'sisi_jalan'],
    'tiang_sirkuit' => ['sirkuit_id', 'tiang_id', 'penyulang', 'posisi', 'induk_tiang_id', 'gawang_m', 'peran_titik',
        'section_id', 'segmen_id', 'segmen_aset', 'switching_id', 'switching_di_tiang',
        'jenis_kabel', 'ukuran_mm2', 'penghantar_id', 'tanda_cek_gawang', 'status_verifikasi',
        'aktif', 'revision', 'diubah_pada', 'diubah_oleh', 'induk_status', 'induk_keterangan', 'switching_keterangan', 'konstruksi_id'],
    'tiang_segmen' => ['segmen_id', 'nama', 'penyulang', 'section_id', 'urutan', 'induk_segmen_id',
        'awal_jenis', 'awal_nama', 'awal_switching_id', 'awal_gardu_id', 'akhir_jenis', 'akhir_nama', 'akhir_switching_id', 'akhir_gardu_id',
        'segmen_itb', 'tiang_awal_id', 'tiang_akhir_id', 'panjang_m', 'jumlah_tiang', 'jumlah_terverifikasi', 'status_verifikasi', 'catatan',
        'aktif', 'revision', 'diubah_pada', 'diubah_oleh', 'jenis_segmen', 'jenis_kabel', 'ukuran_mm2', 'panjang_kabel_m', 'penghantar_id', 'status_data'],
    'tiang_switching' => ['switching_id', 'nama', 'kode_aset', 'jenis',
        'merk_kontroler', 'tipe_kontroler', 'versi_firmware', 'rasio_ct', 'rasio_vt',
        'merk', 'tipe', 'nomor_seri', 'tahun_pasang', 'rating_kv', 'rating_a', 'kapasitas_putus_ka', 'media', 'penggerak',
        'penyulang', 'section_id', 'tiang_id', 'sirkuit_id', 'lat', 'lng',
        'switching_hulu_id', 'proteksi_hulu_id', 'posisi_normal', 'titik_hubung', 'tiang_sisi_a', 'tiang_sisi_b', 'penyulang_sisi_b',
        'bisa_trip', 'catat_gangguan', 'baca_arus', 'baca_tegangan', 'terhubung_scada', 'kode_rtu', 'media_komunikasi',
        'fungsi_fco', 'gardu_id', 'fuse_tipe', 'fuse_rating',
        'status_operasi', 'status_verifikasi', 'verifikasi_terakhir', 'kondisi', 'catatan',
        'foto_unit_id', 'foto_nameplate_id', 'foto_kontroler_id',
        'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    'tiang_jaringan' => ['section_id', 'penyulang', 'section', 'parent_section_id', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    'tiang_konstruksi' => ['konstruksi_id', 'kode', 'nama', 'keterangan', 'susunan', 'gmd_m', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    'tiang_ukuran' => ['ukuran_id', 'nama', 'keterangan', 'urutan', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
    'tiang_pemetaan' => ['pemetaan_id', 'kolom_logis', 'alias', 'wajib', 'aktif', 'revision', 'diubah_pada', 'diubah_oleh'],
];

const TIANG_KUNCI = [
    'tiang_tiang' => ['tiang_id'], 'tiang_sirkuit' => ['sirkuit_id'], 'tiang_segmen' => ['segmen_id'], 'tiang_switching' => ['switching_id'],
    'tiang_jaringan' => ['section_id'], 'tiang_konstruksi' => ['konstruksi_id'], 'tiang_ukuran' => ['ukuran_id'], 'tiang_pemetaan' => ['pemetaan_id'],
];

const TIANG_INDEKS = [
    'tiang_tiang' => [['status_verifikasi'], ['kode_nama_aset']],
    'tiang_sirkuit' => [['tiang_id'], ['penyulang'], ['induk_tiang_id'], ['segmen_id']],
    'tiang_segmen' => [['penyulang']],
    'tiang_switching' => [['penyulang'], ['tiang_id']],
];

const TIANG_DOUBLE = ['lat_aset', 'lng_aset', 'lat', 'lng', 'akurasi_m', 'gawang_m', 'ukuran_mm2', 'panjang_m', 'panjang_kabel_m', 'gmd_m',
    'tahun_pasang', 'rating_kv', 'rating_a', 'kapasitas_putus_ka'];
const TIANG_INT = ['revision', 'urutan', 'jumlah_sirkuit', 'jumlah_tiang', 'jumlah_terverifikasi'];
const TIANG_BOOL = ['aktif', 'wajib', 'titik_hubung', 'bisa_trip', 'catat_gangguan', 'baca_arus', 'baca_tegangan', 'terhubung_scada'];
const TIANG_TEKS_PANJANG = ['keterangan_sumber', 'catatan', 'keterangan', 'induk_keterangan', 'switching_keterangan'];

/** Tipe kolom: id (*_id selain foto_*) VARCHAR(40); *_pada / verifikasi_terakhir VARCHAR(30) ISO; selebihnya VARCHAR(120). */
function tipeKolomTiang(string $k, bool $mysql): string
{
    if (in_array($k, TIANG_DOUBLE, true)) return 'DOUBLE';
    if (in_array($k, TIANG_INT, true)) return 'INT';
    if (in_array($k, TIANG_BOOL, true)) return $mysql ? 'TINYINT(1)' : 'INTEGER';
    if (in_array($k, TIANG_TEKS_PANJANG, true)) return 'TEXT';
    if (str_ends_with($k, '_pada') || $k === 'verifikasi_terakhir') return 'VARCHAR(30)';
    if (str_ends_with($k, '_id') && !str_starts_with($k, 'foto_')) return 'VARCHAR(40)';
    return 'VARCHAR(120)';
}

/** Tabel tiang_* dibuat bila belum ada. Penanda versi di sinkron_info supaya DDL tidak diulang di tiap permintaan. */
function skemaTiang(PDO $pdo): void
{
    $q = $pdo->prepare('SELECT isi FROM sinkron_info WHERE modul = ?');
    $q->execute(['skema_tiang']);
    if ($q->fetchColumn() === SKEMA_TIANG_VERSI) return;
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $akhir = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    foreach (TIANG_KOLOM as $tabel => $kolom) {
        $def = [];
        foreach ($kolom as $k) $def[] = "$k " . tipeKolomTiang($k, $mysql) . (in_array($k, TIANG_KUNCI[$tabel], true) ? ' NOT NULL' : ' NULL');
        $def[] = 'urut INT NOT NULL DEFAULT 0';   // urutan baris sheet (kolom No): urutan jalur tiang mengikutinya
        $def[] = 'PRIMARY KEY (' . implode(', ', TIANG_KUNCI[$tabel]) . ')';
        $inline = [];
        foreach (TIANG_INDEKS[$tabel] ?? [] as $i) $inline[] = 'INDEX ix_' . $tabel . '_' . implode('_', $i) . ' (' . implode(', ', $i) . ')';
        $pdo->exec("CREATE TABLE IF NOT EXISTS $tabel (" . implode(', ', array_merge($def, $mysql ? $inline : [])) . ")$akhir");
        if (!$mysql) foreach (TIANG_INDEKS[$tabel] ?? [] as $i) {
            $pdo->exec('CREATE INDEX IF NOT EXISTS ix_' . $tabel . '_' . implode('_', $i) . " ON $tabel (" . implode(', ', $i) . ')');
        }
    }
    $pdo->exec('CREATE TABLE IF NOT EXISTS tiang_foto (pemilik VARCHAR(12) NOT NULL, pemilik_id VARCHAR(40) NOT NULL, slot VARCHAR(20) NOT NULL,'
        . ' path VARCHAR(255) NOT NULL, sha256 CHAR(64) NOT NULL, bytes INT NOT NULL, dibuat_pada VARCHAR(30) NOT NULL,'
        . ' diarsip_pada VARCHAR(30) NULL, drive_file_id VARCHAR(120) NULL, PRIMARY KEY (pemilik, pemilik_id, slot)'
        . ($mysql ? ', INDEX ix_tiang_foto_arsip (diarsip_pada)' : '') . ")$akhir");
    $pdo->exec('CREATE TABLE IF NOT EXISTS tiang_op (op_id VARCHAR(64) NOT NULL PRIMARY KEY, hasil MEDIUMTEXT NULL, dibuat_pada VARCHAR(30) NOT NULL)' . $akhir);
    $pdo->exec('CREATE TABLE IF NOT EXISTS tiang_audit (id ' . ($mysql ? 'BIGINT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT')
        . ', waktu VARCHAR(30) NOT NULL, user_id VARCHAR(40) NOT NULL, aksi VARCHAR(40) NOT NULL, objek VARCHAR(120) NOT NULL, detail TEXT NULL, ms INT NULL)' . $akhir);
    $pdo->exec('CREATE TABLE IF NOT EXISTS tiang_cabut (user_id VARCHAR(40) NOT NULL PRIMARY KEY, sejak VARCHAR(30) NOT NULL)' . $akhir);
    $pdo->exec('CREATE TABLE IF NOT EXISTS tiang_laju (user_id VARCHAR(40) NOT NULL, menit INT NOT NULL, jumlah INT NOT NULL, PRIMARY KEY (user_id, menit))' . $akhir);
    if (!$mysql) $pdo->exec('CREATE INDEX IF NOT EXISTS ix_tiang_foto_arsip ON tiang_foto (diarsip_pada)');
    $pdo->prepare('DELETE FROM sinkron_info WHERE modul = ?')->execute(['skema_tiang']);
    $pdo->prepare('INSERT INTO sinkron_info (modul, isi) VALUES (?, ?)')->execute(['skema_tiang', SKEMA_TIANG_VERSI]);
}

/** Nilai sel sheet / baris DB -> teks tanpa spasi tepi ('' bila kosong); sama dengan teksSwc_ di Apps Script. */
function teks($v): string
{
    return $v === null ? '' : trim(is_bool($v) ? ($v ? 'TRUE' : 'FALSE') : (string)$v);
}

/** Angka atau null (kosong / bukan angka); sama dengan angkaSwc_. */
function angka($v): int|float|null
{
    if ($v === null || $v === '' || is_bool($v)) return null;
    return is_numeric($v) ? $v + 0 : null;
}

/** Sama dengan isAktif_: true, 1, atau teks TRUE. */
function aktif($v): bool
{
    return $v === true || $v === 1 || $v === '1' || strtoupper(trim((string)$v)) === 'TRUE';
}

/** Bilangan -> teks seperti JavaScript (-3 -> "-3", 106.5 -> "106.5"). */
function angkaTeks(int|float $n): string
{
    return is_float($n) && floor($n) !== $n ? json_encode($n) : (string)(int)$n;
}

/** Nilai sel sheet -> nilai kolom DB: kosong = NULL, boolean = 1/0, angka = int/float, selebihnya teks. */
function nilaiKolomTiang(string $kolom, $v)
{
    if (in_array($kolom, TIANG_BOOL, true)) return aktif($v) ? 1 : 0;
    if ($v === null || $v === '') return null;
    if (in_array($kolom, TIANG_DOUBLE, true)) return angka($v);
    if (in_array($kolom, TIANG_INT, true)) { $n = angka($v); return $n === null ? null : (int)$n; }
    return is_bool($v) ? ($v ? 'TRUE' : 'FALSE') : (string)$v;
}

/**
 * Upsert baris sheet ke tabel tiang_*. [baris] = objek berkunci nama kolom sheet. `urut` = baris['urut'] / baris['No'] bila ada,
 * selain itu [urutAwal] + indeks. Dipakai impor (Task 6) dan penyemaian uji.
 */
function isiBarisTiang(PDO $pdo, string $tabel, array $baris, int $urutAwal = 1): int
{
    if (!isset(TIANG_KOLOM[$tabel])) throw new InvalidArgumentException("tabel $tabel");
    $kolom = array_merge(TIANG_KOLOM[$tabel], ['urut']);
    $kunci = TIANG_KUNCI[$tabel];
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $ubah = array_values(array_diff($kolom, $kunci));
    $upsert = $mysql
        ? ' ON DUPLICATE KEY UPDATE ' . implode(', ', array_map(fn ($k) => "$k = VALUES($k)", $ubah))
        : ' ON CONFLICT(' . implode(', ', $kunci) . ') DO UPDATE SET ' . implode(', ', array_map(fn ($k) => "$k = excluded.$k", $ubah));
    $q = $pdo->prepare("INSERT INTO $tabel (" . implode(', ', $kolom) . ') VALUES (' . implode(', ', array_fill(0, count($kolom), '?')) . ')' . $upsert);
    $n = 0;
    foreach (array_values($baris) as $i => $b) {
        $nilai = [];
        foreach ($kolom as $k) {
            if ($k === 'urut') $nilai[] = (int)(angka($b['urut'] ?? $b['No'] ?? null) ?? ($urutAwal + $i));
            else $nilai[] = nilaiKolomTiang($k, $b[$k] ?? null);
        }
        foreach ($kunci as $k) if (teks($nilai[array_search($k, $kolom, true)]) === '') continue 2;
        $q->execute($nilai);
        $n++;
    }
    return $n;
}

/** Semua tabel tiang_* (urutan tetap) untuk status dan cadangan. */
function daftarTabelTiang(): array
{
    return array_merge(array_keys(TIANG_KOLOM), ['tiang_foto', 'tiang_op', 'tiang_audit', 'tiang_cabut', 'tiang_laju']);
}

function jawabOk(array $data): void
{
    jawab(200, ['ok' => true, 'data' => $data]);
}

/** Mengumpulkan SEMUA masalah isian lalu menjawab 422 sekali: [{field, pesan}] (bukan berhenti di galat pertama). */
final class KumpulGalat
{
    /** @var array<int, array{field: string, pesan: string}> */
    private array $daftar = [];

    public function tambah(string $field, string $pesan): void
    {
        $this->daftar[] = ['field' => $field, 'pesan' => $pesan];
    }

    public function ada(): bool
    {
        return $this->daftar !== [];
    }

    public function daftar(): array
    {
        return $this->daftar;
    }

    public function keluar(): void
    {
        jawab(422, ['ok' => false, 'kode' => 'DATA_TIDAK_VALID', 'galat' => $this->daftar, 'waktu' => gmdate('Y-m-d\TH:i:s\Z')]);
    }
}

/**
 * Registri aksi: menu = kode menu (satu atau daftar; cukup salah satu), ubah = aksi tulis (butuh menu di daftar `t` tiket), fn = pelaksana.
 * Aksi lain ditambahkan oleh tahap berikutnya (baca: tiang_aksi_baca.php, tulis: tiang_aksi_tulis.php).
 */
function tiangAksi(): array
{
    $aksi = [
        'tiangStatus' => ['menu' => ['OPS_VERIFIKASI_TIANG', 'OPS_MASTER_SWITCHING'], 'ubah' => false, 'fn' => 'aksiTiangStatus'],
    ];
    foreach (['tiang_aksi_baca.php', 'tiang_aksi_tulis.php'] as $berkas) {
        if (is_file(__DIR__ . '/' . $berkas)) $aksi = array_merge($aksi, require_once __DIR__ . '/' . $berkas);
    }
    return $aksi;
}

/** null = boleh; selain itu kode galat. Peran ADMIN / SUPER (wajibAdminTiang_); tulis: menu harus ada di `t`; baca: di `m`. */
function izinkanAksi(array $tiket, array $def): ?string
{
    if (!in_array($tiket['role'] ?? '', ['ADMIN', 'SUPER'], true)) return 'AKSES_DITOLAK';
    $menu = (array)$def['menu'];
    $daftar = !empty($def['ubah']) ? (array)($tiket['t'] ?? []) : (array)($tiket['m'] ?? []);
    return array_intersect($menu, $daftar) ? null : 'AKSES_DITOLAK';
}

function tiketDicabut(PDO $pdo, string $user): bool
{
    $q = $pdo->prepare('SELECT 1 FROM tiang_cabut WHERE user_id = ?');
    $q->execute([$user]);
    return $q->fetchColumn() !== false;
}

/** Maks TIANG_LAJU_MENIT permintaan per menit per pengguna; lewat itu 429 TERLALU_SERING. */
function remLajuTiang(PDO $pdo, string $user): void
{
    $menit = intdiv(time(), 60);
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $pdo->prepare('INSERT INTO tiang_laju (user_id, menit, jumlah) VALUES (?, ?, 1) '
        . ($mysql ? 'ON DUPLICATE KEY UPDATE jumlah = jumlah + 1' : 'ON CONFLICT(user_id, menit) DO UPDATE SET jumlah = jumlah + 1'))->execute([$user, $menit]);
    $q = $pdo->prepare('SELECT jumlah FROM tiang_laju WHERE user_id = ? AND menit = ?');
    $q->execute([$user, $menit]);
    if ((int)$q->fetchColumn() > TIANG_LAJU_MENIT) galat(429, 'TERLALU_SERING');
    if (random_int(1, 50) === 1) $pdo->prepare('DELETE FROM tiang_laju WHERE menit < ?')->execute([$menit - 5]);
}

/** Info cadangan terakhir (sinkron_info 'tiang_cadangan', ditulis cadangan.php) atau null bila belum pernah. */
function infoCadangan(PDO $pdo): ?array
{
    $q = $pdo->prepare('SELECT isi FROM sinkron_info WHERE modul = ?');
    $q->execute(['tiang_cadangan']);
    $isi = $q->fetchColumn();
    return is_string($isi) ? (json_decode($isi, true) ?: null) : null;
}

function aksiTiangStatus(array $d, array $tiket): array
{
    $pdo = db();
    $tabel = [];
    foreach (daftarTabelTiang() as $t) $tabel[$t] = (int)$pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    return ['versi' => API_VERSI, 'skema' => SKEMA_TIANG_VERSI, 'env' => konfig()['env'] ?? '', 'tabel' => $tabel, 'cadangan' => infoCadangan($pdo)];
}

/** Galat domain yang menghentikan aksi (transaksi dibatalkan oleh pemanggil): http + kode + daftar [{field, pesan}] bila validasi. */
final class TiangGalat extends RuntimeException
{
    public function __construct(public int $http, public string $kode, public array $galat = [])
    {
        parent::__construct($kode);
    }

    public function kirim(): void
    {
        jawab($this->http, ['ok' => false, 'kode' => $this->kode] + ($this->galat ? ['galat' => $this->galat] : []) + ['waktu' => gmdate('Y-m-d\TH:i:s\Z')]);
    }
}

/** Lempar TiangGalat 422 bila ada masalah terkumpul (supaya transaksi sempat dibatalkan). */
function lemparBilaAda(KumpulGalat $g): void
{
    if ($g->ada()) throw new TiangGalat(422, 'DATA_TIDAK_VALID', $g->daftar());
}

/** Jalankan [$fn] dalam satu transaksi: commit bila selesai, batal bila ada Throwable. */
function denganTransaksi(PDO $pdo, callable $fn)
{
    $pdo->beginTransaction();
    try {
        $hasil = $fn();
        $pdo->commit();
        return $hasil;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

/** ISO 8601 UTC dengan milidetik, sama dengan new Date().toISOString(). */
function sekarangIsoTiang(): string
{
    $t = microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int)$t) . sprintf('.%03dZ', (int)(($t - floor($t)) * 1000));
}

function uuidV4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/** Teks petugas dibersihkan seperti bersihTeks_: karakter kontrol dibuang, satu baris (kecuali multiBaris), spasi ganda dirapatkan. Null = bukan UTF-8 sah. */
function bersihTeksTiang(string $v, bool $multiBaris = false): ?string
{
    $s = preg_replace('/\r\n?/', "\n", $v);
    $s = $s === null ? null : preg_replace('/[\x00-\x08\x0B-\x1F\x7F\x{2028}\x{2029}]/u', '', $s);
    if ($s === null) return null;
    if ($multiBaris) {
        $baris = array_filter(array_map('trim', explode("\n", str_replace("\t", ' ', $s))), fn ($b) => $b !== '');
        return implode("\n", $baris);
    }
    return trim(preg_replace('/ {2,}/', ' ', preg_replace('/[\n\t]+/', ' ', $s)));
}

const TIANG_AREA = ['latMin' => -3.6, 'latMax' => -1.3, 'lngMin' => 105.0, 'lngMax' => 109.0];

/**
 * Validasi berbasis allowlist, MENGUMPULKAN semua masalah ke [$g] (field = [$awalanField] + nama). Skema: nama => [t, ...opsi]
 * t = teks | angka | pilihan | uuid | koordinat | bool; opsi: wajib, maks, pola, pilihan, min, max, bulat, multiBaris. Kosong (null / '') = tidak ada.
 * Hasil: nilai bersih untuk isian yang ada dan sah.
 */
function validasiTiang(array $data, array $skema, KumpulGalat $g, string $field = '', string $awalan = ''): array
{
    $hasil = [];
    foreach (array_keys($data) as $k) {
        if (!array_key_exists($k, $skema)) $g->tambah($field ?: (string)$k, $awalan . 'Isian "' . $k . '" tidak dikenal.');
    }
    foreach ($skema as $k => $a) {
        $v = $data[$k] ?? null;
        $nama = $awalan . ($a['label'] ?? $k);
        $f = $field ?: $k;
        if ($v === null || (is_string($v) && trim($v) === '')) {
            if (!empty($a['wajib'])) $g->tambah($f, $nama . ' wajib diisi.');
            continue;
        }
        switch ($a['t']) {
            case 'teks':
                $s = is_string($v) ? bersihTeksTiang($v, !empty($a['multiBaris'])) : null;
                if ($s === null) { $g->tambah($f, $nama . ' harus berupa teks.'); break; }
                if (mb_strlen($s) > ($a['maks'] ?? 500)) { $g->tambah($f, $nama . ' terlalu panjang (maks ' . ($a['maks'] ?? 500) . ' karakter).'); break; }
                if (!empty($a['pola']) && !preg_match($a['pola'], $s)) { $g->tambah($f, $nama . ' formatnya tidak sesuai.'); break; }
                $hasil[$k] = $s;
                break;
            case 'angka':
                $n = is_int($v) || is_float($v) ? $v : (is_string($v) && preg_match('/^-?\d+(\.\d+)?$/', trim($v)) ? trim($v) + 0 : null);
                if ($n === null || !is_finite((float)$n)) { $g->tambah($f, $nama . ' harus berupa angka.'); break; }
                if (!empty($a['bulat']) && floor((float)$n) != $n) { $g->tambah($f, $nama . ' harus bilangan bulat.'); break; }
                if ((isset($a['min']) && $n < $a['min']) || (isset($a['max']) && $n > $a['max'])) { $g->tambah($f, $nama . ' di luar rentang yang diizinkan.'); break; }
                $hasil[$k] = $n;
                break;
            case 'pilihan':
                if (!in_array($v, $a['pilihan'], true)) { $g->tambah($f, $nama . ': pilih salah satu pilihan yang tersedia.'); break; }
                $hasil[$k] = $v;
                break;
            case 'uuid':
                if (!is_string($v) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $v)) { $g->tambah($f, $nama . ' formatnya tidak sesuai.'); break; }
                $hasil[$k] = strtolower($v);
                break;
            case 'koordinat':
                if (!is_string($v) || !preg_match('/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/', $v, $m)) { $g->tambah($f, $nama . ' harus berbentuk "lat, lng".'); break; }
                $lat = (float)$m[1];
                $lng = (float)$m[2];
                if ($lat < TIANG_AREA['latMin'] || $lat > TIANG_AREA['latMax'] || $lng < TIANG_AREA['lngMin'] || $lng > TIANG_AREA['lngMax']) { $g->tambah($f, $nama . ' di luar area Bangka Belitung.'); break; }
                $hasil[$k] = ['lat' => $lat, 'lng' => $lng];
                break;
            case 'bool':
                if (!is_bool($v)) { $g->tambah($f, $nama . ' harus ya / tidak.'); break; }
                $hasil[$k] = $v;
                break;
        }
    }
    return $hasil;
}

/** Jarak meter (haversine) antara dua titik lat/lng. */
function jarakMeter(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $rad = M_PI / 180;
    $dLat = ($lat2 - $lat1) * $rad;
    $dLng = ($lng2 - $lng1) * $rad;
    $x = sin($dLat / 2) ** 2 + cos($lat1 * $rad) * cos($lat2 * $rad) * sin($dLng / 2) ** 2;
    return 2 * 6371000 * asin(min(1, sqrt($x)));
}

/* ===== Foto tiang (docs/superpowers/specs/2026-11-11-tiang-hostinger-design.md S10) ===== */

const FOTO_MAKS_BYTE = 2 * 1024 * 1024;
const FOTO_SISI_MAKS = 1600;
const FOTO_SISI_KECIL = 320;
const FOTO_SLOT_TIANG = ['TIANG' => 'foto_tiang_id', 'KEPALA' => 'foto_kepala_id'];
const FOTO_SLOT_SWITCHING = ['UNIT' => 'foto_unit_id', 'NAMEPLATE' => 'foto_nameplate_id', 'KONTROLER' => 'foto_kontroler_id'];
const FOTO_LABEL = ['TIANG' => 'Foto Full Tiang', 'KEPALA' => 'Foto Konstruksi SUTM', 'UNIT' => 'Foto Unit', 'NAMEPLATE' => 'Foto Nameplate', 'KONTROLER' => 'Foto Kontroler'];

/** Folder foto di LUAR public_html (config: foto_dir; bawaan <folder domain>/sisi-tiang-foto). */
function fotoDirTiang(): string
{
    $d = rtrim((string)(konfig()['foto_dir'] ?? dirname(__DIR__, 2) . '/sisi-tiang-foto'), '/' . chr(92));
    if (!is_dir($d) && !@mkdir($d, 0755, true) && !is_dir($d)) throw new RuntimeException('folder foto tidak bisa dibuat');
    return $d;
}

function jpegDariGd($im, int $mutu): string
{
    ob_start();
    imagejpeg($im, null, $mutu);
    return (string)ob_get_clean();
}

/** Perkecil [$im] agar sisi panjang <= [$maks] (null = sudah cukup kecil). */
function perkecilGd($im, int $maks)
{
    $w = imagesx($im);
    $h = imagesy($im);
    if (max($w, $h) <= $maks) return null;
    $r = $maks / max($w, $h);
    return imagescale($im, max(1, (int)round($w * $r)), max(1, (int)round($h * $r)));
}

/**
 * Foto kiriman {sha256, ukuranByte, data base64} -> ['sha256', 'simpan' (jpeg disimpan), 'thumb' (jpeg kecil | null)] atau null + galat di [$g].
 * Diperiksa: base64 sah, ukuran cocok dan <= 2 MB, JPEG, sidik cocok, bisa dibuka; sisi panjang > 1600 px diperkecil.
 */
function siapkanFotoTiang($f, string $slot, KumpulGalat $g): ?array
{
    $nama = FOTO_LABEL[$slot] ?? $slot;
    if (!is_array($f)) { $g->tambah('foto', $nama . ' tidak sah.'); return null; }
    $n0 = count($g->daftar());
    $v = validasiTiang($f, [
        'sha256' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => '/^[0-9a-f]{64}$/', 'label' => 'Sidik'],
        'ukuranByte' => ['t' => 'angka', 'wajib' => true, 'bulat' => true, 'min' => 1, 'max' => FOTO_MAKS_BYTE, 'label' => 'Ukuran'],
        'data' => ['t' => 'teks', 'wajib' => true, 'maks' => (int)(ceil(FOTO_MAKS_BYTE / 3) * 4 + 4), 'mentah' => true, 'label' => 'Isi'],
    ], $g, 'foto', $nama . ': ');
    if (count($g->daftar()) > $n0) return null;
    $bytes = base64_decode((string)$f['data'], true);
    if ($bytes === false) { $g->tambah('foto', $nama . ' rusak (isi tidak terbaca). Ambil ulang.'); return null; }
    if (strlen($bytes) !== (int)$v['ukuranByte']) { $g->tambah('foto', $nama . ' rusak (ukuran tidak cocok). Ambil ulang.'); return null; }
    if (strlen($bytes) > FOTO_MAKS_BYTE) { $g->tambah('foto', $nama . ' lebih dari 2 MB. Ambil ulang.'); return null; }
    if (substr($bytes, 0, 2) !== "\xFF\xD8") { $g->tambah('foto', $nama . ' harus JPEG. Ambil ulang pakai kamera.'); return null; }
    if (!hash_equals($v['sha256'], hash('sha256', $bytes))) { $g->tambah('foto', $nama . ' rusak (sidik tidak cocok). Ambil ulang.'); return null; }
    $simpan = $bytes;
    $thumb = null;
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($bytes);
        if ($im === false) { $g->tambah('foto', $nama . ' rusak (tidak bisa dibuka). Ambil ulang.'); return null; }
        $kecil = perkecilGd($im, FOTO_SISI_MAKS);
        if ($kecil !== null) { $simpan = jpegDariGd($kecil, 82); $im = $kecil; }
        $th = perkecilGd($im, FOTO_SISI_KECIL) ?? $im;
        $thumb = jpegDariGd($th, 75);
    }
    return ['sha256' => $v['sha256'], 'simpan' => $simpan, 'thumb' => $thumb];
}

/** `foto` kiriman: {TIANG?: {...}, KEPALA?: {...}} -> [slot => hasil siapkanFotoTiang]. */
function bacaFotoKiriman($foto, KumpulGalat $g, array $slotSah = FOTO_SLOT_TIANG): array
{
    if ($foto === null) return [];
    if (!is_array($foto) || ($foto && array_is_list($foto))) { $g->tambah('foto', 'Data foto tidak sah.'); return []; }
    $hasil = [];
    foreach ($foto as $slot => $f) {
        if (!isset($slotSah[$slot])) { $g->tambah('foto', 'Slot foto "' . $slot . '" tidak dikenal.'); continue; }
        $p = siapkanFotoTiang($f, (string)$slot, $g);
        if ($p !== null) $hasil[$slot] = $p;
    }
    return $hasil;
}

function pathThumbFoto(string $rel): string
{
    return preg_replace('/\.jpg$/', '_k.jpg', $rel);
}

/** Tulis berkas foto (+ thumbnail) secara atomik (tmp + rename). Berkas yang BARU dibuat ditambahkan ke [$dibuat] agar bisa dihapus bila transaksi gagal. */
function tulisBerkasFoto(string $rel, array $p, array &$dibuat): void
{
    $dir = fotoDirTiang();
    $bagian = [[$rel, $p['simpan']]];
    if ($p['thumb'] !== null) $bagian[] = [pathThumbFoto($rel), $p['thumb']];
    foreach ($bagian as [$r, $isi]) {
        $abs = $dir . '/' . $r;
        if (is_file($abs)) continue;   // nama memuat sidik: isi sama dengan yang sudah ada
        if (!is_dir(dirname($abs)) && !@mkdir(dirname($abs), 0755, true) && !is_dir(dirname($abs))) throw new RuntimeException('folder foto tidak bisa dibuat');
        $tmp = $abs . '.tmp-' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $isi) !== strlen($isi)) { @unlink($tmp); throw new RuntimeException('berkas foto tidak bisa ditulis'); }
        if (!rename($tmp, $abs)) { @unlink($tmp); throw new RuntimeException('berkas foto tidak bisa dipindah'); }
        $dibuat[] = $abs;
    }
}

/** Hapus berkas foto lama (+ thumbnail) bila tidak ada lagi baris tiang_foto yang menunjuknya. */
function hapusBerkasFotoBilaYatim(PDO $pdo, string $rel): void
{
    $q = $pdo->prepare('SELECT COUNT(*) FROM tiang_foto WHERE path = ?');
    $q->execute([$rel]);
    if ((int)$q->fetchColumn() > 0) return;
    foreach ([$rel, pathThumbFoto($rel)] as $r) @unlink(fotoDirTiang() . '/' . $r);
}

/**
 * Pemulung: berkas di folder foto yang tidak ditunjuk tiang_foto dan lebih tua dari [$umurDetik] (sisa proses yang mati sebelum
 * commit, atau .tmp) dihapus. Hasil jumlah berkas dihapus.
 */
function bersihkanYatim(PDO $pdo, int $umurDetik = 3600): int
{
    $ditunjuk = [];
    foreach ($pdo->query('SELECT path FROM tiang_foto')->fetchAll(PDO::FETCH_COLUMN) as $p) {
        $ditunjuk[(string)$p] = true;
        $ditunjuk[pathThumbFoto((string)$p)] = true;
    }
    $dir = fotoDirTiang();
    $hapus = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = ltrim(str_replace(chr(92), '/', substr($f->getPathname(), strlen($dir))), '/');
        if (isset($ditunjuk[$rel]) || time() - $f->getMTime() < $umurDetik) continue;
        if (@unlink($f->getPathname())) $hapus++;
    }
    return $hapus;
}

/* ===== Helper tulis bersama (dipakai aksi tulis, impor) ===== */

/** Tulis (INSERT / UPDATE) satu baris tabel tiang_* dari [kolom => nilai]; nilai dinormalkan seperti impor. */
function ubahBarisTiang(PDO $pdo, string $tabel, string $kunciKol, string $kunci, array $u): void
{
    $kol = array_keys($u);
    $nilai = array_map(fn ($k) => nilaiKolomTiang($k, $u[$k]), $kol);
    $pdo->prepare("UPDATE $tabel SET " . implode(', ', array_map(fn ($k) => "$k = ?", $kol)) . " WHERE $kunciKol = ?")->execute([...$nilai, $kunci]);
}

function sisipBarisTiang(PDO $pdo, string $tabel, array $baris): void
{
    $kol = array_keys($baris);
    $pdo->prepare("INSERT INTO $tabel (" . implode(', ', $kol) . ') VALUES (' . implode(', ', array_fill(0, count($kol), '?')) . ')')
        ->execute(array_map(fn ($k) => nilaiKolomTiang($k, $baris[$k]), $kol));
}

function urutBerikut(PDO $pdo, string $tabel): int
{
    // MySQL: baca mengunci (FOR UPDATE) agar transaksi bersamaan melihat baris terbaru, bukan potret REPEATABLE READ yang sama.
    $kunci = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    return (int)$pdo->query("SELECT COALESCE(MAX(urut), 0) FROM $tabel$kunci")->fetchColumn() + 1;
}


/**
 * Operasi idempoten: INSERT tiang_op LEBIH DULU di dalam transaksi (kembaran yang bersamaan menunggu di kunci unik); opId yang sudah
 * selesai dijawab dari hasil tersimpan tanpa menulis lagi. Galat di [$fn] membatalkan semuanya termasuk baris op (opId boleh dipakai ulang).
 */
function denganOperasi(PDO $pdo, string $opId, callable $fn): array
{
    return denganTransaksi($pdo, function () use ($pdo, $opId, $fn) {
        try {
            $pdo->prepare('INSERT INTO tiang_op (op_id, hasil, dibuat_pada) VALUES (?, ?, ?)')->execute([$opId, null, sekarangIsoTiang()]);
        } catch (PDOException $e) {
            if ((string)$e->getCode() !== '23000') throw $e;
            $q = $pdo->prepare('SELECT hasil FROM tiang_op WHERE op_id = ?');
            $q->execute([$opId]);
            $lama = $q->fetchColumn();
            if (is_string($lama) && $lama !== '') {
                $r = json_decode($lama, true);
                if (($r['foto'] ?? null) === []) $r['foto'] = (object)[];   // {} tetap objek JSON, bukan []
                return $r;
            }
            throw new TiangGalat(409, 'OPERASI_BERJALAN');
        }
        $hasil = $fn();
        $pdo->prepare('UPDATE tiang_op SET hasil = ? WHERE op_id = ?')->execute([json_encode($hasil, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $opId]);
        return $hasil;
    });
}

/**
 * Simpan foto paket [$fotoBaru] (hasil bacaFotoKiriman) milik [$pemilik] [$id]: berkas atomik, baris tiang_foto, kolom foto_*_id pada [$tabel].
 * Berkas baru dicatat di [$dibuat] (dihapus pemanggil bila transaksi gagal), berkas lama yang diganti di [$hapusNanti] (dihapus sesudah commit).
 * Hasil [slot => {sha256, bytes}] = konfirmasi untuk HP.
 */
function simpanFotoPaket(PDO $pdo, string $pemilik, string $id, string $folder, array $fotoBaru, array $slotKolom, string $tabel, string $kunciKol, string $sekarang, array &$dibuat, array &$hapusNanti): array
{
    $kolom = [];
    $konfirmasi = [];
    foreach ($fotoBaru as $slot => $p) {
        $rel = $folder . '/' . $id . '_' . $slot . '_' . substr($p['sha256'], 0, 8) . '.jpg';
        $q = $pdo->prepare('SELECT path FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?');
        $q->execute([$pemilik, $id, $slot]);
        $pathLama = $q->fetchColumn();
        tulisBerkasFoto($rel, $p, $dibuat);
        $pdo->prepare('DELETE FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?')->execute([$pemilik, $id, $slot]);
        $pdo->prepare('INSERT INTO tiang_foto (pemilik, pemilik_id, slot, path, sha256, bytes, dibuat_pada) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$pemilik, $id, $slot, $rel, $p['sha256'], strlen($p['simpan']), $sekarang]);
        $kolom[$slotKolom[$slot]] = $rel;
        $konfirmasi[$slot] = ['sha256' => $p['sha256'], 'bytes' => strlen($p['simpan'])];
        if (is_string($pathLama) && $pathLama !== '' && $pathLama !== $rel) $hapusNanti[] = $pathLama;
    }
    ubahBarisTiang($pdo, $tabel, $kunciKol, $id, $kolom);
    return $konfirmasi;
}

/** Jawaban foto { slot, mime, kecil, ukuranByte, data } untuk getFotoTiang / getFotoSwitching; belum ada = 404 FOTO_TIDAK_ADA. */
function jawabFotoBerkas(PDO $pdo, string $pemilik, string $id, string $slot, string $ukuran): array
{
    $q = $pdo->prepare('SELECT path FROM tiang_foto WHERE pemilik = ? AND pemilik_id = ? AND slot = ?');
    $q->execute([$pemilik, $id, $slot]);
    $rel = $q->fetchColumn();
    if (!is_string($rel) || $rel === '') throw new TiangGalat(404, 'FOTO_TIDAK_ADA');
    $kecil = $ukuran !== 'PENUH' && is_file(fotoDirTiang() . '/' . pathThumbFoto($rel));
    $abs = fotoDirTiang() . '/' . ($kecil ? pathThumbFoto($rel) : $rel);
    $isi = is_file($abs) ? file_get_contents($abs) : false;
    if ($isi === false) throw new TiangGalat(404, 'FOTO_TIDAK_ADA');
    return ['slot' => $slot, 'mime' => 'image/jpeg', 'kecil' => $kecil, 'ukuranByte' => strlen($isi), 'data' => base64_encode($isi)];
}
