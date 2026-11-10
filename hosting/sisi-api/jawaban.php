<?php
/**
 * v1.0.38 jawaban jadi endpoint baca website (Pengukuran Gardu). Logika tetap di Apps Script (modules/93_Mysql.js);
 * di sini hanya disimpan / dikembalikan.
 *   GET  jawaban.php?aksi=<aksi>&data=<JSON kanonik>  (X-SiSi-Tiket) -> { ok, data: jawaban Apps Script } atau 404 BELUM_ADA
 *   POST jawaban.php (bertanda HMAC Apps Script) { hapus?: { grup: ver }, simpan?: { aksi, data, grup, ver, isi } }
 *        hapus dulu, lalu simpan. Grup 'gardu:*' = semua jawaban berawalan 'gardu:'. Jawaban dengan ver lebih tua dari
 *        hapus terakhir grupnya (atau 'gardu:*') ditolak diam (simpan: false): pembacaan lambat tidak menimpa data baru.
 */
declare(strict_types=1);
require __DIR__ . '/_lib.php';

// aksi -> menu tiket (salah satu)
const AKSI_JAWABAN = [
    'getRiwayatGardu' => ['OPS_PENGUKURAN_GARDU'],
    'getHiGardu' => ['OPS_PENGUKURAN_GARDU'],
    'getMaster' => ['OPS_PENGUKURAN_GARDU', 'OPS_BA_GARDU'],
    'getPetaTemuan' => ['OPS_PETA_TEMUAN'],
    'getWoAdmin' => ['OPS_PENERUSAN_WO'],
    // Review 8 Nov 2026: menu admin lain (jawaban tidak bergantung pengguna; lihat MYSQL_JAWABAN_ di 94_Mysql_Jawaban.js)
    'getRekapJenisTemuan' => ['OPS_PETA_TEMUAN'],
    'getCheckpoint' => ['OPS_CHECKPOINT'],
    'getCoverGardu' => ['OPS_REKAP_GANGGUAN'],
    'getDataAset' => ['OPS_DATA_ASET'],
    'getJadwalPadam' => ['OPS_JADWAL_PADAM'],
    'getMasterJadwalPadam' => ['OPS_JADWAL_PADAM'],
    'getApprovalP0' => ['OPS_VERIFIKASI_P0'],
    'getDaftarBaGardu' => ['OPS_BA_GARDU'],
    'getBaGardu' => ['OPS_BA_GARDU'],
    'getGudangStok' => ['OPS_GUDANG_MATERIAL'],
    'getSelisihGudang' => ['OPS_GUDANG_MATERIAL'],
    'getPemakaianGudang' => ['OPS_GUDANG_MATERIAL'],
    'getIzinMaterial' => ['OPS_GUDANG_MATERIAL'],
    'getWorkplanUp3' => ['OPS_WORKPLAN_UP3'],
    'getGaspolUp3' => ['OPS_GASPOL_UP3'],
];
// umur maksimal jawaban (detik) per awalan grup: data yang diubah lewat sheet / editor (tanpa kiriman) tetap segar.
// Grup lain tetap dibatasi UMUR_MAKS sebagai pengaman perubahan sheet manual.
const UMUR_GRUP = [
    'master' => 3600, 'temuan' => 3600,   // temuan: pengaman ubah sheet manual
    // Review 8 Nov 2026: data yang juga berubah lewat sheet / pemicu / editor tanpa kiriman penghapus
    'aset' => 3600, 'jadwal' => 900, 'gudang' => 900, 'p0' => 900, 'ba' => 900, 'checkpoint' => 900,
    'laporan' => 300,   // Workplan / GASPOL: dari data harian ROW + Hartek, tanpa penghapus (umur pendek saja)
];
const UMUR_MAKS = 86400;

function kunciJawaban(string $aksi, string $data): string { return hash('sha256', $aksi . '|' . $data); }

/** Grup induk 'awalan:*' dari grup 'awalan:x'. */
function grupSemua(string $grup): string { return substr($grup, 0, (int)strpos($grup, ':')) . ':*'; }

jalankan(function (): void {
    $metode = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($metode === 'GET' || $metode === 'OPTIONS') {
        cors('GET');
        $aksi = $_GET['aksi'] ?? '';
        $data = $_GET['data'] ?? '';
        if (!is_string($aksi) || !isset(AKSI_JAWABAN[$aksi]) || !is_string($data) || strlen($data) > 2000) galat(400, 'DATA_TIDAK_VALID');
        foreach (array_keys($_GET) as $k) if (!in_array($k, ['aksi', 'data'], true)) galat(400, 'FIELD_TIDAK_DIKENAL');
        wajibTiket(AKSI_JAWABAN[$aksi]);
        $q = db()->prepare('SELECT isi, grup, ver FROM jawaban WHERE kunci = ?');
        $q->execute([kunciJawaban($aksi, $data)]);
        $r = $q->fetch();
        $umur = $r ? (UMUR_GRUP[substr($r['grup'], 0, (int)strpos($r['grup'], ':'))] ?? UMUR_MAKS) : 0;
        if (!$r || (int)$r['ver'] < (time() - $umur) * 1000) galat(404, 'BELUM_ADA');
        jawab(200, '{"ok":true,"sumber":"mysql","waktu":' . json_encode(gmdate('Y-m-d\TH:i:s\Z')) . ',"data":' . $r['isi'] . '}');
    }

    cors('POST');
    $d = json_decode(wajibTandaAppsScript(), true);
    if (!is_array($d)) galat(400, 'DATA_TIDAK_VALID');
    $hapus = $d['hapus'] ?? [];
    $simpan = $d['simpan'] ?? null;
    $grupSah = fn ($g) => is_string($g) && preg_match('/^[a-z]{1,20}:[A-Za-z0-9_*-]{1,70}$/', $g);
    if (!is_array($hapus)) galat(400, 'DATA_TIDAK_VALID');
    foreach ($hapus as $g => $ver) if (!$grupSah($g) || !is_int($ver)) galat(400, 'DATA_TIDAK_VALID');
    if ($simpan !== null && (!is_array($simpan) || !isset(AKSI_JAWABAN[$simpan['aksi'] ?? '']) || !is_string($simpan['data'] ?? null)
        || strlen($simpan['data']) > 2000 || !$grupSah($simpan['grup'] ?? null) || !is_int($simpan['ver'] ?? null) || !array_key_exists('isi', $simpan))) galat(400, 'DATA_TIDAK_VALID');

    $pdo = db();
    $hasil = ['dihapus' => 0, 'simpan' => null];
    $pdo->beginTransaction();
    try {
        foreach ($hapus as $g => $ver) {
            if (str_ends_with($g, ':*')) {
                $q = $pdo->prepare('DELETE FROM jawaban WHERE grup LIKE ?');
                $q->execute([substr($g, 0, -1) . '%']);
            } else {
                $q = $pdo->prepare('DELETE FROM jawaban WHERE grup = ?');
                $q->execute([$g]);
            }
            $hasil['dihapus'] += $q->rowCount();
            $q = $pdo->prepare('SELECT ver FROM jawaban_hapus WHERE grup = ?');
            $q->execute([$g]);
            $lama = $q->fetchColumn();
            if ($lama === false) $pdo->prepare('INSERT INTO jawaban_hapus (grup, ver) VALUES (?, ?)')->execute([$g, $ver]);
            elseif ((int)$lama < $ver) $pdo->prepare('UPDATE jawaban_hapus SET ver = ? WHERE grup = ?')->execute([$ver, $g]);
        }
        if ($simpan !== null) {
            $q = $pdo->prepare('SELECT MAX(ver) FROM jawaban_hapus WHERE grup IN (?, ?)');
            $q->execute([$simpan['grup'], grupSemua($simpan['grup'])]);
            $batas = (int)$q->fetchColumn();
            if ($simpan['ver'] < $batas) {
                $hasil['simpan'] = false;
            } else {
                $kunci = kunciJawaban($simpan['aksi'], $simpan['data']);
                $pdo->prepare('DELETE FROM jawaban WHERE kunci = ?')->execute([$kunci]);
                $pdo->prepare('INSERT INTO jawaban (kunci, aksi, grup, ver, isi) VALUES (?, ?, ?, ?, ?)')->execute([
                    $kunci, $simpan['aksi'], $simpan['grup'], $simpan['ver'],
                    json_encode($simpan['isi'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
                $hasil['simpan'] = true;
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    jawab(200, ['ok' => true, 'data' => $hasil]);
});
