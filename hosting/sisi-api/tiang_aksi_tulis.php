<?php
/**
 * Aksi TULIS modul tiang. simpanVerifikasiTiang = port 99_Verifikasi_Tiang.js simpanVerifikasiTiang_ / isianSirkuit_ / bacaSirkuitKiriman_
 * (aturan bisnis sama), dengan perbedaan yang disetujui (rancangan S§8): semua masalah isian dikumpulkan sekaligus (422), tanpa kunci
 * global (transaksi per tiang), `revision` hanya diperiksa bila dikirim, `opId` membuat kirim ulang tidak menggandakan data.
 * Dimuat oleh tiangAksi() (tiang_lib.php).
 */
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const TIANG_STATUS = ['TERVERIFIKASI', 'PERLU_PERBAIKAN', 'TIDAK_DITEMUKAN'];
const TIANG_SISI_JALAN = ['KIRI', 'KANAN'];
const TIANG_JENIS = ['BETON', 'BESI', 'KAYU'];
const TIANG_TOLERANSI_M = 10;
const TIANG_SIRKUIT_MAKS = 3;
const POLA_ID_TIANG = '/^[0-9A-Za-z._-]{1,40}$/';
const POLA_OP_ID = '/^[0-9A-Za-z._:-]{6,64}$/';

/** Label isian sirkuit untuk pesan galat. */
const LABEL_SIRKUIT = [
    'penyulang' => 'Penyulang', 'posisi' => 'Posisi', 'konstruksiId' => 'Konstruksi', 'sectionId' => 'Section', 'segmenId' => 'Segmen',
    'indukTiangId' => 'Tiang Hulu', 'peranTitik' => 'Peran Titik', 'switchingId' => 'Switching Hulu', 'switchingDiTiang' => 'Switching di Tiang',
    'jenisKabel' => 'Jenis Kabel', 'ukuranMm2' => 'Ukuran mm²', 'indukStatus' => 'Konfirmasi Tiang Hulu', 'indukKeterangan' => 'Keterangan Tiang Hulu',
    'switchingKeterangan' => 'Keterangan Tanpa Switching', 'sirkuitId' => 'ID sirkuit',
];

function skemaSirkuitTiang(): array
{
    return [
        'sirkuitId' => ['t' => 'uuid'],
        'penyulang' => ['t' => 'teks', 'wajib' => true, 'maks' => 80],
        'posisi' => ['t' => 'pilihan', 'pilihan' => TIANG_POSISI],
        'konstruksiId' => ['t' => 'uuid'],
        'sectionId' => ['t' => 'teks', 'maks' => 64, 'pola' => '/^[0-9A-Za-z_-]+$/'],
        'segmenId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SGM-\d{4,}$/'],
        'indukTiangId' => ['t' => 'teks', 'maks' => 40, 'pola' => POLA_ID_TIANG],
        'peranTitik' => ['t' => 'pilihan', 'pilihan' => ['biasa', 'switching', 'gardu', 'percabangan', 'ujung']],
        'switchingId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/'],
        'switchingDiTiang' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/'],
        'jenisKabel' => ['t' => 'teks', 'maks' => 30],
        'ukuranMm2' => ['t' => 'angka', 'min' => 0, 'max' => 1000],
        'indukStatus' => ['t' => 'pilihan', 'pilihan' => TIANG_STATUS_INDUK],
        'indukKeterangan' => ['t' => 'teks', 'maks' => 120],
        'switchingKeterangan' => ['t' => 'teks', 'maks' => 120],
    ];
}

function skemaTiangSimpan(): array
{
    return [
        'opId' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => POLA_OP_ID, 'label' => 'ID operasi'],
        'tiangId' => ['t' => 'teks', 'maks' => 40, 'pola' => POLA_ID_TIANG, 'label' => 'ID tiang'],
        'revision' => ['t' => 'angka', 'bulat' => true, 'min' => 1, 'label' => 'Revisi'],
        'statusVerifikasi' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => TIANG_STATUS, 'label' => 'Hasil Verifikasi'],
        'koordinat' => ['t' => 'koordinat', 'label' => 'Koordinat Tiang'],
        'akurasiM' => ['t' => 'angka', 'min' => 0, 'max' => 500, 'label' => 'Akurasi'],
        'jenisTiang' => ['t' => 'pilihan', 'pilihan' => TIANG_JENIS, 'label' => 'Fisik Tiang'],
        'ukuranTiang' => ['t' => 'teks', 'maks' => 40, 'label' => 'Ukuran Tiang'],
        'konstruksiId' => ['t' => 'uuid', 'label' => 'Konstruksi'],
        'sisiJalan' => ['t' => 'pilihan', 'pilihan' => TIANG_SISI_JALAN, 'label' => 'Lokasi Sisi Tiang'],
        'dasarKoordinat' => ['t' => 'pilihan', 'pilihan' => ['TERDAFTAR', 'LAPANGAN'], 'label' => 'Dasar Koordinat'],
        'sumberKoordinat' => ['t' => 'pilihan', 'pilihan' => ['GPS', 'PETA'], 'label' => 'Sumber Koordinat'],
        'nama' => ['t' => 'teks', 'maks' => 80, 'label' => 'Nama Tiang'],
        'kode' => ['t' => 'teks', 'maks' => 3, 'pola' => '/^[A-Z]{3}$/', 'label' => 'Kode Jalur'],
    ];
}

/** Sirkuit kiriman (1-3, sirkuitId unik) divalidasi dan dikumpulkan masalahnya; hasil daftar sirkuit bersih. */
function bacaSirkuitKiriman($daftar, KumpulGalat $g): array
{
    if ($daftar === null) { $g->tambah('sirkuit0', 'Penyulang wajib diisi.'); return []; }
    if (!is_array($daftar) || !array_is_list($daftar)) { $g->tambah('sirkuit0', 'Data penyulang harus berupa daftar.'); return []; }
    if (!$daftar) { $g->tambah('sirkuit0', 'Penyulang wajib diisi.'); return []; }
    if (count($daftar) > TIANG_SIRKUIT_MAKS) { $g->tambah('sirkuit0', 'Penyulang maksimal ' . TIANG_SIRKUIT_MAKS . '.'); return []; }
    $hasil = [];
    $lihat = [];
    foreach ($daftar as $i => $x) {
        if (!is_array($x) || array_is_list($x) && $x) { $g->tambah('sirkuit' . $i, 'Isian penyulang ' . ($i + 1) . ' tidak sah.'); $hasil[] = []; continue; }
        $awal = count($daftar) > 1 ? 'Penyulang ' . ($i + 1) . ': ' : '';
        $s = [];
        foreach (skemaSirkuitTiang() as $k => $a) {
            $v = validasiTiang(array_intersect_key($x, [$k => 1]), [$k => $a + ['label' => LABEL_SIRKUIT[$k]]], $g, 'sirkuit' . $i, $awal);
            $s += $v;
        }
        foreach (array_diff(array_keys($x), array_keys(skemaSirkuitTiang())) as $k) $g->tambah('sirkuit' . $i, $awal . 'Isian "' . $k . '" tidak dikenal.');
        if (isset($s['sirkuitId'])) {
            if (isset($lihat[$s['sirkuitId']])) $g->tambah('sirkuit' . $i, $awal . 'ID sirkuit ganda.');
            $lihat[$s['sirkuitId']] = true;
        }
        $hasil[] = $s;
    }
    return $hasil;
}

/** Jaringan aktif: penyulang (kunci HURUF BESAR -> nama) dan section. */
function jaringanKonteks(PDO $pdo): array
{
    $jar = ['penyulang' => [], 'section' => []];
    foreach (barisTiang($pdo, 'tiang_jaringan') as $r) {
        $pny = teks($r['penyulang']);
        $id = teks($r['section_id']);
        if ($pny === '' || $id === '' || !aktif($r['aktif'])) continue;
        $jar['penyulang'][strtoupper($pny)] = $pny;
        $jar['section'][$id] = ['penyulang' => $pny, 'section' => teks($r['section'])];
    }
    return $jar;
}

/** Sirkuit kiriman -> kolom DB, dicek terhadap master (isianSirkuit_). Masalah dikumpulkan ke [$g]. */
function isianSirkuitTiang(array $s, int $i, array $ctx, KumpulGalat $g): array
{
    $f = 'sirkuit' . $i;
    $awal = $ctx['banyak'] > 1 ? 'Penyulang ' . ($i + 1) . ': ' : '';
    $u = [];
    foreach (TIANG_ISIAN_SIRKUIT as [$api, $kol]) $u[$kol] = $s[$api] ?? '';
    $pny = $ctx['jar']['penyulang'][strtoupper((string)$u['penyulang'])] ?? null;
    if ($pny === null) { $g->tambah($f, $awal . 'Penyulang "' . $u['penyulang'] . '" tidak dikenal.'); return $u; }
    $u['penyulang'] = $pny;
    if ($u['section_id'] !== '' && (!isset($ctx['jar']['section'][$u['section_id']]) || $ctx['jar']['section'][$u['section_id']]['penyulang'] !== $pny)) {
        $g->tambah($f, $awal . 'Section tidak sesuai penyulang.');
    }
    if ($u['segmen_id'] !== '') {
        $sg = $ctx['segmen'][$u['segmen_id']] ?? null;
        if (!$sg) $g->tambah($f, $awal . 'Segmen ' . $u['segmen_id'] . ' tidak ditemukan.');
        elseif ($sg['penyulang'] !== $pny) $g->tambah($f, $awal . 'Segmen beda penyulang.');
        elseif ($sg['kabelTanah']) $g->tambah($f, $awal . 'Segmen kabel tanah tidak berisi tiang.');
        elseif ($u['section_id'] === '') $u['section_id'] = $sg['sectionId'];
    }
    foreach (['switching_id', 'switching_di_tiang'] as $k) {
        if ($u[$k] !== '' && !isset($ctx['switching'][$u[$k]])) $g->tambah($f, $awal . 'Switching ' . $u[$k] . ' tidak ditemukan.');
    }
    $u['gawang_m'] = '';
    if ($u['induk_tiang_id'] !== '') {
        $p = $ctx['tiang'][$u['induk_tiang_id']] ?? null;
        if ($u['induk_tiang_id'] === $ctx['tiangId']) $g->tambah($f, $awal . 'Tiang Hulu tidak boleh tiang itu sendiri.');
        elseif (!$p) $g->tambah($f, $awal . 'Tiang Hulu ' . $u['induk_tiang_id'] . ' tidak ditemukan.');
        elseif ($ctx['verif'] && teks($p['status_verifikasi']) !== 'TERVERIFIKASI') $g->tambah($f, $awal . 'Tiang Hulu belum terverifikasi.');
        else {
            $la = angka($p['lat']);
            $ga = angka($p['lng']);
            if ($la !== null && $ga !== null && $ctx['lat'] !== null) $u['gawang_m'] = round(jarakMeter((float)$la, (float)$ga, $ctx['lat'], $ctx['lng']) * 10) / 10;
        }
    }
    return $u;
}

/** ID tiang baru BARU-nnnn (4 digit, lebih panjang bila lewat 9999) dari id terbesar yang ada. */
/** Baca mengunci: di MySQL (REPEATABLE READ) SELECT biasa memakai potret awal transaksi, sehingga coba ulang tetap memilih nomor yang sama. */
function idTiangBaru(PDO $pdo): string
{
    $maks = 0;
    foreach ($pdo->query(kunciUntukUbah($pdo, "SELECT tiang_id FROM tiang_tiang WHERE tiang_id LIKE 'BARU-%'"))->fetchAll(PDO::FETCH_COLUMN) as $id) {
        if (preg_match('/^BARU-(\d+)$/', (string)$id, $m) && (int)$m[1] > $maks) $maks = (int)$m[1];
    }
    return 'BARU-' . str_pad((string)($maks + 1), 4, '0', STR_PAD_LEFT);
}

function kunciUntukUbah(PDO $pdo, string $sql): string
{
    return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? $sql . ' FOR UPDATE' : $sql;
}

function bedaKolom(array $lama, array $u): string
{
    $abai = ['diubah_pada' => 1, 'diubah_oleh' => 1, 'verifikasi_terakhir' => 1];
    $b = [];
    foreach ($u as $k => $v) {
        if (isset($abai[$k])) continue;
        $a = teks($lama[$k] ?? null);
        $n = teks(is_float($v) ? angkaTeks($v) : $v);
        if ($a !== $n) $b[] = $k . ': ' . ($a ?: '-') . ' -> ' . ($n ?: '-');
    }
    return implode('; ', $b);
}

function catatAuditTiang(PDO $pdo, string $user, string $aksi, string $objek, string $detail): void
{
    $pdo->prepare('INSERT INTO tiang_audit (waktu, user_id, aksi, objek, detail) VALUES (?, ?, ?, ?, ?)')
        ->execute([sekarangIsoTiang(), $user, $aksi, mb_substr($objek, 0, 120), mb_substr($detail, 0, 500)]);
}

/**
 * simpanVerifikasiTiang { opId, tiangId?, revision?, statusVerifikasi, koordinat?, akurasiM?, jenisTiang?, ukuranTiang?, sisiJalan?, konstruksiId?,
 * dasarKoordinat?, sumberKoordinat?, nama?, kode?, sirkuit: [...] } -> { tiang, selisihM }. Tanpa tiangId = tiang baru (nama + koordinat wajib).
 * TIDAK_DITEMUKAN: hanya status yang dicatat. Terverifikasi = data wajib lengkap + induk dikonfirmasi.
 */
function aksiSimpanVerifikasiTiang(array $data, array $tiket): array
{
    $pdo = db();
    $user = (string)$tiket['u'];
    $g = new KumpulGalat();
    $kiriman = $data['sirkuit'] ?? null;
    $sisa = $data;
    unset($sisa['sirkuit'], $sisa['foto']);
    $d = validasiTiang($sisa, skemaTiangSimpan(), $g);
    $hilang = ($d['statusVerifikasi'] ?? '') === 'TIDAK_DITEMUKAN';
    $baru = empty($d['tiangId']);
    if ($baru && ($hilang || empty($d['nama']))) $g->tambah($hilang ? 'status' : 'nama', $hilang ? 'Tiang tidak ditemukan harus dipilih dari tiang yang ada.' : 'Nama Tiang wajib diisi.');
    if (!$hilang && isset($d['statusVerifikasi']) && empty($d['koordinat'])) $g->tambah('koordinat', 'Koordinat Tiang wajib diisi.');
    $sirkuitKirim = $hilang && $kiriman === null ? [] : bacaSirkuitKiriman($kiriman, $g);
    foreach ($sirkuitKirim as &$s) if (empty($s['konstruksiId']) && !empty($d['konstruksiId'])) $s['konstruksiId'] = $d['konstruksiId'];
    unset($s);
    $fotoBaru = bacaFotoKiriman($data['foto'] ?? null, $g);
    lemparBilaAda($g);

    $dibuat = [];
    $hapusNanti = [];
    try {
    $hasil = denganOperasi($pdo, $d['opId'], function () use ($pdo, $d, $sirkuitKirim, $hilang, $baru, $user, $g, $fotoBaru, &$dibuat, &$hapusNanti) {
        $konstruksi = array_column(daftarKonstruksi($pdo), 'konstruksiId', 'konstruksiId');
        foreach ($sirkuitKirim as $i => $s) if (!empty($s['konstruksiId']) && !isset($konstruksi[$s['konstruksiId']])) $g->tambah('sirkuit' . $i, 'Konstruksi tidak ditemukan.');
        $segmen = [];
        foreach (barisTiang($pdo, 'tiang_segmen') as $r) {
            if (teks($r['segmen_id']) !== '' && aktif($r['aktif'])) {
                $segmen[teks($r['segmen_id'])] = ['penyulang' => teks($r['penyulang']), 'sectionId' => teks($r['section_id']), 'kabelTanah' => teks($r['jenis_segmen']) === 'KABEL_TANAH'];
            }
        }
        $switching = [];
        foreach (barisTiang($pdo, 'tiang_switching') as $r) if (aktif($r['aktif']) && teks($r['switching_id']) !== '') $switching[teks($r['switching_id'])] = true;
        $jar = jaringanKonteks($pdo);

        $id = $d['tiangId'] ?? '';
        $lama = null;
        if (!$baru) {
            $q = $pdo->prepare(kunciUntukUbah($pdo, 'SELECT * FROM tiang_tiang WHERE tiang_id = ?'));
            $q->execute([$id]);
            $lama = $q->fetch() ?: null;
            if (!$lama) throw new TiangGalat(404, 'DATA_TIDAK_DITEMUKAN');
            if (isset($d['revision']) && (int)$lama['revision'] !== (int)$d['revision']) throw new TiangGalat(409, 'KONFLIK_REVISION');
        }
        $tiang = [];
        foreach ($pdo->query('SELECT tiang_id, status_verifikasi, lat, lng FROM tiang_tiang')->fetchAll() as $r) $tiang[teks($r['tiang_id'])] = $r;
        $sekarang = sekarangIsoTiang();
        $u = ['status_verifikasi' => $d['statusVerifikasi'], 'verifikasi_terakhir' => $sekarang, 'diverifikasi_oleh' => $user, 'diubah_pada' => $sekarang, 'diubah_oleh' => $user];
        $selisih = null;
        $pakaiAset = false;
        if (!$hilang) {
            $jarak = null;
            $terdaftar = $lama ? koordinatTerdaftar($lama) : null;
            if ($terdaftar) $jarak = jarakMeter($terdaftar[0], $terdaftar[1], $d['koordinat']['lat'], $d['koordinat']['lng']);
            if ($jarak !== null && $jarak > TIANG_TOLERANSI_M) {
                if (empty($d['dasarKoordinat'])) $g->tambah('dasar', 'Selisih koordinat lebih dari ' . TIANG_TOLERANSI_M . ' m: pilih koordinat yang dipakai.');
                $pakaiAset = ($d['dasarKoordinat'] ?? '') === 'TERDAFTAR';
            }
            $selisih = $jarak === null ? null : (int)round($jarak);
            $u['lat'] = $pakaiAset ? $terdaftar[0] : $d['koordinat']['lat'];
            $u['lng'] = $pakaiAset ? $terdaftar[1] : $d['koordinat']['lng'];
            $dariPeta = !$pakaiAset && ($d['sumberKoordinat'] ?? '') === 'PETA';
            $u['sumber_koordinat'] = $pakaiAset ? 'aset' : ($dariPeta ? 'peta' : 'lapangan');
            $u['akurasi_m'] = $pakaiAset || $dariPeta || !isset($d['akurasiM']) ? null : $d['akurasiM'];
            $u['jenis_tiang'] = $d['jenisTiang'] ?? '';
            $u['ukuran_tiang'] = $d['ukuranTiang'] ?? '';
            $u['sisi_jalan'] = $d['sisiJalan'] ?? '';
            $u['jumlah_sirkuit'] = count($sirkuitKirim);
        }
        if ($d['statusVerifikasi'] === 'TERVERIFIKASI') $u['tanda_cek'] = '';

        $milik = $id !== '' ? barisTiang($pdo, 'tiang_sirkuit', 'tiang_id = ?', [$id]) : [];
        $petaSirkuit = [];
        foreach ($milik as $r) $petaSirkuit[teks($r['sirkuit_id'])] = $r;
        $verif = $d['statusVerifikasi'] === 'TERVERIFIKASI';
        // foto yang sudah ada di server (atau diimpor) dihitung; foto baru dalam paket ini menambah / mengganti
        $fotoAda = ['TIANG' => isset($fotoBaru['TIANG']) || ($lama && teks($lama['foto_tiang_id']) !== ''), 'KEPALA' => isset($fotoBaru['KEPALA']) || ($lama && teks($lama['foto_kepala_id']) !== '')];
        $ctx = ['jar' => $jar, 'segmen' => $segmen, 'switching' => $switching, 'tiang' => $tiang, 'tiangId' => $id, 'banyak' => count($sirkuitKirim),
            'lat' => $hilang ? null : $u['lat'], 'lng' => $hilang ? null : $u['lng'], 'verif' => $verif];
        $usSemua = [];
        foreach ($sirkuitKirim as $i => $s) $usSemua[] = isianSirkuitTiang($s, $i, $ctx, $g);
        if (count($usSemua) === 1) $usSemua[0]['posisi'] = TIANG_POSISI[0];
        else foreach ($usSemua as $n => $us) {
            foreach ($usSemua as $m => $o) if ($m < $n && $us['posisi'] !== '' && $o['posisi'] === $us['posisi']) { $g->tambah('posisi', 'Posisi penyulang tidak boleh kembar.'); break; }
        }
        foreach ($sirkuitKirim as $i => $s) {
            if (isset($s['sirkuitId']) && !isset($petaSirkuit[$s['sirkuitId']])) $g->tambah('sirkuit' . $i, 'Sirkuit tidak ditemukan pada tiang ini.');
        }
        // Terverifikasi = data wajib lengkap + induk dikonfirmasi (nilai sesudah section diisi dari segmen) + kedua foto
        if ($verif && !$g->ada()) {
            $api = [];
            foreach ($usSemua as $us) {
                $o = [];
                foreach (TIANG_ISIAN_SIRKUIT as [$nama, $kol, $tipe]) $o[$nama] = $tipe === 'a' ? angka($us[$kol]) : teks($us[$kol]);
                $api[] = $o;
            }
            foreach (kurangTiangField(['jenisTiang' => $d['jenisTiang'] ?? '', 'ukuranTiang' => $d['ukuranTiang'] ?? '', 'sisiJalan' => $d['sisiJalan'] ?? '', 'foto' => $fotoAda, 'sirkuit' => $api]) as [$field, $label]) {
                $g->tambah($field, $label . ' wajib diisi.');
            }
        }
        lemparBilaAda($g);

        $ubahS = [];
        $baruS = [];
        $dipakai = [];
        foreach ($sirkuitKirim as $n => $s) {
            $us = $usSemua[$n];
            $us['status_verifikasi'] = $d['statusVerifikasi'];
            if ($verif) $us['tanda_cek_gawang'] = '';
            $us['aktif'] = true;
            $us['diubah_pada'] = $sekarang;
            $us['diubah_oleh'] = $user;
            if (isset($s['sirkuitId'])) { $dipakai[$s['sirkuitId']] = true; $ubahS[] = [$petaSirkuit[$s['sirkuitId']], $us]; }
            else $baruS[] = $us;
        }
        if (!$hilang) {
            foreach ($milik as $r) if (!isset($dipakai[teks($r['sirkuit_id'])]) && aktif($r['aktif'])) $ubahS[] = [$r, ['aktif' => false, 'diubah_pada' => $sekarang, 'diubah_oleh' => $user]];
        } elseif (!$sirkuitKirim) {
            foreach ($milik as $r) if (aktif($r['aktif'])) $ubahS[] = [$r, ['status_verifikasi' => 'TIDAK_DITEMUKAN', 'diubah_pada' => $sekarang, 'diubah_oleh' => $user]];
        }

        if ($lama) {
            $beda = bedaKolom($lama, $u);
            ubahBarisTiang($pdo, 'tiang_tiang', 'tiang_id', $id, $u + ['revision' => (int)$lama['revision'] + 1]);
            catatAuditTiang($pdo, $user, 'TIANG_VERIFIKASI', $id,
                $id . ' ' . $d['statusVerifikasi'] . ($selisih !== null ? ' selisih ' . $selisih . ' m' : '') . ($pakaiAset ? ' dasar koordinat terdaftar' : '') . ($beda ? ': ' . $beda : ''));
        } else {
            for ($coba = 0;; $coba++) {
                $id = idTiangBaru($pdo);
                try {
                    sisipBarisTiang($pdo, 'tiang_tiang', ['tiang_id' => $id, 'nama' => $d['nama'], 'kode_nama_aset' => $d['kode'] ?? '', 'lat_aset' => '', 'lng_aset' => '', 'status_aset' => 'BARU',
                        'keterangan_sumber' => 'Tiang baru dari lapangan', 'tanda_cek' => '', 'aktif' => true, 'revision' => 1, 'urut' => urutBerikut($pdo, 'tiang_tiang')] + $u);
                    break;
                } catch (PDOException $e) {
                    if ((string)$e->getCode() !== '23000' || $coba >= 3) throw $e;
                }
            }
            catatAuditTiang($pdo, $user, 'TIANG_BARU', $id, $id . ' ' . $d['nama'] . ' (' . ($d['kode'] ?? TIANG_KODE_LAIN) . ')');
        }
        foreach ($ubahS as [$r, $us]) ubahBarisTiang($pdo, 'tiang_sirkuit', 'sirkuit_id', teks($r['sirkuit_id']), $us + ['revision' => (int)$r['revision'] + 1]);
        foreach ($baruS as $us) {
            sisipBarisTiang($pdo, 'tiang_sirkuit', ['sirkuit_id' => uuidV4(), 'tiang_id' => $id, 'segmen_aset' => '', 'revision' => 1, 'urut' => urutBerikut($pdo, 'tiang_sirkuit')] + $us);
        }

        $konfirmasi = $fotoBaru ? simpanFotoPaket($pdo, 'TIANG', $id, $lama ? kodeJalurTiang($lama) : ($d['kode'] ?? TIANG_KODE_LAIN), $fotoBaru, FOTO_SLOT_TIANG, 'tiang_tiang', 'tiang_id', $sekarang, $dibuat, $hapusNanti) : [];
        $q = $pdo->prepare('SELECT * FROM tiang_tiang WHERE tiang_id = ?');
        $q->execute([$id]);
        $hasil = ['tiang' => tiangKeApi($q->fetch(), barisTiang($pdo, 'tiang_sirkuit', 'tiang_id = ? AND aktif = 1', [$id])), 'selisihM' => $selisih, 'foto' => (object)$konfirmasi];
        return $hasil;
    });
    } catch (Throwable $e) {
        foreach ($dibuat as $f) @unlink($f);   // paket gagal: berkas baru ikut dibuang
        throw $e;
    }
    foreach ($hapusNanti as $rel) hapusBerkasFotoBilaYatim($pdo, $rel);
    return $hasil;
}

/* ===== simpanSegmen (98_Segmen.js simpanSegmen_) ===== */

const SGM_AWAL = ['GI', 'SWITCHING', 'GARDU', 'PERCABANGAN', 'UJUNG_KABEL'];
const SGM_AKHIR = ['SWITCHING', 'GARDU', 'PERCABANGAN', 'UJUNG_KABEL', 'UJUNG'];
const SGM_KABEL = ['N2XSEBY - 1 CORE', 'NA2XSEYBY - 3 CORE'];
const SGM_MAKS_BARIS = 5000;
const SWC_MAKS_BARIS = 3000;

function skemaSegmenSimpan(): array
{
    return [
        'opId' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => POLA_OP_ID, 'label' => 'ID operasi'],
        'segmenId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SGM-\d{4,}$/', 'label' => 'ID segmen'],
        'revision' => ['t' => 'angka', 'bulat' => true, 'min' => 1, 'label' => 'Revisi'],
        'aktif' => ['t' => 'bool', 'label' => 'Aktif'],
        'nama' => ['t' => 'teks', 'wajib' => true, 'maks' => 100, 'label' => 'Nama Segmen'],
        'penyulang' => ['t' => 'teks', 'wajib' => true, 'maks' => 80, 'label' => 'Penyulang'],
        'sectionId' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => '/^[0-9A-Za-z_-]+$/', 'label' => 'Section'],
        'urutan' => ['t' => 'angka', 'bulat' => true, 'min' => 1, 'max' => 99999, 'label' => 'Urutan'],
        'indukSegmenId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SGM-\d{4,}$/', 'label' => 'Segmen Induk'],
        'awalJenis' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => SGM_AWAL, 'label' => 'Jenis Titik Awal'],
        'awalNama' => ['t' => 'teks', 'wajib' => true, 'maks' => 80, 'label' => 'Nama Titik Awal'],
        'awalSwitchingId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/', 'label' => 'Switching Awal'],
        'akhirJenis' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => SGM_AKHIR, 'label' => 'Jenis Titik Akhir'],
        'akhirNama' => ['t' => 'teks', 'wajib' => true, 'maks' => 80, 'label' => 'Nama Titik Akhir'],
        'akhirSwitchingId' => ['t' => 'teks', 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/', 'label' => 'Switching Akhir'],
        'segmenItb' => ['t' => 'teks', 'maks' => 200, 'label' => 'Segmen ITB'],
        'catatan' => ['t' => 'teks', 'maks' => 300, 'multiBaris' => true, 'maksBaris' => 6, 'label' => 'Catatan'],
        'jenisSegmen' => ['t' => 'pilihan', 'pilihan' => ['UDARA', 'KABEL_TANAH'], 'label' => 'Jenis Segmen'],
        'jenisKabel' => ['t' => 'pilihan', 'pilihan' => SGM_KABEL, 'label' => 'Jenis Kabel'],
        'ukuranMm2' => ['t' => 'angka', 'min' => 1, 'max' => 2000, 'label' => 'Ukuran mm²'],
        'panjangKabelM' => ['t' => 'angka', 'min' => 0.1, 'max' => 100000, 'label' => 'Panjang Kabel'],
        'penghantarId' => ['t' => 'teks', 'maks' => 40, 'pola' => '/^[0-9A-Za-z._-]+$/', 'label' => 'Penghantar'],
    ];
}

function idBerikutTiang(PDO $pdo, string $tabel, string $kolom, string $awalan): string
{
    $maks = 0;
    foreach ($pdo->query(kunciUntukUbah($pdo, "SELECT $kolom FROM $tabel"))->fetchAll(PDO::FETCH_COLUMN) as $v) {
        if (preg_match('/^' . $awalan . '-(\d+)$/', teks($v), $m) && (int)$m[1] > $maks) $maks = (int)$m[1];
    }
    return $awalan . '-' . str_pad((string)($maks + 1), 4, '0', STR_PAD_LEFT);
}

/** simpanSegmen { opId, segmenId?, revision?, aktif?, ...isian } -> { segmen } (jumlah tiang 0 di jawaban simpan, seperti Apps Script). */
function aksiSimpanSegmen(array $data, array $tiket): array
{
    $pdo = db();
    $user = (string)$tiket['u'];
    $g = new KumpulGalat();
    $d = validasiTiang($data, skemaSegmenSimpan(), $g);
    if (isset($data['catatan']) && is_string($data['catatan']) && isset($d['catatan']) && count(explode("\n", $d['catatan'])) > 6) $g->tambah('catatan', 'Catatan maksimal 6 baris.');
    lemparBilaAda($g);
    $hasil = denganOperasi($pdo, $d['opId'], function () use ($pdo, $d, $user, $g) {
        $jar = jaringanKonteks($pdo);
        $switching = [];
        foreach (barisTiang($pdo, 'tiang_switching') as $r) if (aktif($r['aktif'])) $switching[teks($r['switching_id'])] = true;
        $rows = array_values(array_filter(barisTiang($pdo, 'tiang_segmen'), fn ($r) => teks($r['segmen_id']) !== ''));
        $baru = empty($d['segmenId']);
        $lama = null;
        if (!$baru) {
            $q = $pdo->prepare(kunciUntukUbah($pdo, 'SELECT * FROM tiang_segmen WHERE segmen_id = ?'));
            $q->execute([$d['segmenId']]);
            $lama = $q->fetch() ?: null;
            if (!$lama) throw new TiangGalat(404, 'DATA_TIDAK_DITEMUKAN');
            if (isset($d['revision']) && (int)$lama['revision'] !== (int)$d['revision']) throw new TiangGalat(409, 'KONFLIK_REVISION');
        } elseif (count($rows) >= SGM_MAKS_BARIS) throw new TiangGalat(422, 'TERLALU_BANYAK');
        $id = $baru ? idBerikutTiang($pdo, 'tiang_segmen', 'segmen_id', 'SGM') : $d['segmenId'];
        $u = [];
        foreach (SEGMEN_ISIAN as [$api, $kol]) $u[$kol] = $d[$api] ?? '';
        $pny = $jar['penyulang'][strtoupper((string)$u['penyulang'])] ?? null;
        if ($pny === null) { $g->tambah('penyulang', 'Penyulang "' . $u['penyulang'] . '" tidak dikenal.'); lemparBilaAda($g); }
        $u['penyulang'] = $pny;
        $sec = $jar['section'][$u['section_id']] ?? null;
        if (!$sec) $g->tambah('sectionId', 'Section tidak ditemukan.');
        elseif ($sec['penyulang'] !== $pny) $g->tambah('sectionId', 'Section tidak sesuai penyulang.');
        foreach (['awal_switching_id' => 'awalSwitchingId', 'akhir_switching_id' => 'akhirSwitchingId'] as $kol => $api) {
            if ($u[$kol] !== '' && !isset($switching[$u[$kol]])) $g->tambah($api, 'Switching ' . $u[$kol] . ' tidak ditemukan.');
        }
        if ($u['induk_segmen_id'] !== '') {
            $induk = null;
            foreach ($rows as $r) if (teks($r['segmen_id']) === $u['induk_segmen_id'] && aktif($r['aktif'])) { $induk = $r; break; }
            if (!$induk || $u['induk_segmen_id'] === $id) $g->tambah('indukSegmenId', 'Segmen induk tidak valid.');
            elseif (teks($induk['penyulang']) !== $pny) $g->tambah('indukSegmenId', 'Segmen induk beda penyulang.');
        }
        $nama = mb_strtoupper((string)$u['nama']);
        foreach ($rows as $r) {
            if (teks($r['segmen_id']) === $id || !aktif($r['aktif'])) continue;
            if (teks($r['section_id']) === $u['section_id'] && mb_strtoupper(teks($r['nama'])) === $nama) $g->tambah('nama', 'Nama segmen "' . $u['nama'] . '" sudah dipakai di section ini.');
        }
        if ($u['urutan'] === '') {
            $maks = 0;
            foreach ($rows as $r) if (teks($r['penyulang']) === $pny) $maks = max($maks, (int)(angka($r['urutan']) ?? 0));
            $u['urutan'] = $maks + 10;
        }
        $u['jenis_segmen'] = $u['jenis_segmen'] ?: 'UDARA';
        if ($u['jenis_segmen'] === 'KABEL_TANAH') {
            $q = $pdo->prepare('SELECT COUNT(*) FROM tiang_sirkuit WHERE aktif = 1 AND segmen_id = ?');
            $q->execute([$id]);
            $isi = (int)$q->fetchColumn();
            if ($isi) $g->tambah('jenisSegmen', 'Segmen kabel tanah tidak boleh berisi tiang (' . $isi . ' tiang terdaftar).');
            $u['status_data'] = $u['jenis_kabel'] !== '' && $u['ukuran_mm2'] !== '' && $u['panjang_kabel_m'] !== '' ? 'LENGKAP' : 'KURANG';
        } else {
            foreach (['jenis_kabel', 'ukuran_mm2', 'panjang_kabel_m', 'penghantar_id'] as $k) $u[$k] = '';
            $u['status_data'] = '';
        }
        lemparBilaAda($g);
        $u['aktif'] = $d['aktif'] ?? ($lama ? aktif($lama['aktif']) : true);
        $u['diubah_pada'] = sekarangIsoTiang();
        $u['diubah_oleh'] = $user;
        if ($lama) {
            $beda = bedaKolom($lama, $u);
            ubahBarisTiang($pdo, 'tiang_segmen', 'segmen_id', $id, $u + ['revision' => (int)$lama['revision'] + 1]);
            catatAuditTiang($pdo, $user, 'SEGMEN_UBAH', $id, $id . ': ' . ($beda ?: 'tanpa perubahan isian'));
        } else {
            sisipBarisTiang($pdo, 'tiang_segmen', ['segmen_id' => $id, 'revision' => 1, 'status_verifikasi' => 'BELUM', 'urut' => urutBerikut($pdo, 'tiang_segmen')] + $u);
            catatAuditTiang($pdo, $user, 'SEGMEN_BARU', $id, $id . ' ' . $u['nama'] . ' (' . $pny . ')');
        }
        $q = $pdo->prepare('SELECT * FROM tiang_segmen WHERE segmen_id = ?');
        $q->execute([$id]);
        return ['segmen' => segmenKeApi($q->fetch(), [])];
    });
    return $hasil;
}

/* ===== simpanSwitching (96_Master_Switching.js simpanSwitching_ / isianSwitching_) ===== */

const SWC_JENIS = ['PMT', 'ACR', 'SSO', 'LBS', 'FCO', 'DS'];
const SWC_BISA_TRIP = ['PMT' => true, 'ACR' => true, 'FCO' => true];
const SWC_KOLOM_FCO = ['fungsi_fco', 'fuse_tipe', 'fuse_rating'];
const SWC_BOOL = ['titik_hubung', 'bisa_trip', 'catat_gangguan', 'baca_arus', 'baca_tegangan', 'terhubung_scada'];

function skemaSwitchingSimpan(): array
{
    $p = fn ($m, $o = []) => ['t' => 'teks', 'maks' => $m] + $o;
    return [
        'opId' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => POLA_OP_ID, 'label' => 'ID operasi'],
        'switchingId' => $p(20, ['pola' => '/^SWC-\d{4,}$/', 'label' => 'ID switching']),
        'revision' => ['t' => 'angka', 'bulat' => true, 'min' => 1, 'label' => 'Revisi'],
        'koordinat' => ['t' => 'koordinat', 'wajib' => true, 'label' => 'Koordinat'],
        'statusVerifikasi' => ['t' => 'pilihan', 'pilihan' => ['TERVERIFIKASI', 'PERLU_PERBAIKAN'], 'label' => 'Status Verifikasi'],
        'aktif' => ['t' => 'bool', 'label' => 'Aktif'],
        'jenis' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => SWC_JENIS, 'label' => 'Jenis'],
        'nama' => $p(80, ['wajib' => true, 'label' => 'Nama']),
        'penyulang' => $p(80, ['wajib' => true, 'label' => 'Penyulang']),
        'sectionId' => $p(64, ['pola' => '/^[0-9A-Za-z_-]+$/', 'label' => 'Section']),
        'kodeAset' => $p(40, ['label' => 'Kode Aset']), 'merkKontroler' => $p(60, ['label' => 'Merk Kontroler']), 'tipeKontroler' => $p(60, ['label' => 'Tipe Kontroler']),
        'versiFirmware' => $p(40, ['label' => 'Versi Firmware']), 'rasioCt' => $p(30, ['label' => 'Rasio CT']), 'rasioVt' => $p(30, ['label' => 'Rasio VT']),
        'merk' => $p(60, ['label' => 'Merk']), 'tipe' => $p(60, ['label' => 'Tipe']), 'nomorSeri' => $p(60, ['label' => 'Nomor Seri']),
        'tahunPasang' => ['t' => 'angka', 'bulat' => true, 'min' => 1950, 'max' => 2100, 'label' => 'Tahun Pasang'],
        'ratingKv' => ['t' => 'angka', 'min' => 0, 'max' => 1000, 'label' => 'Rating kV'],
        'ratingA' => ['t' => 'angka', 'min' => 0, 'max' => 100000, 'label' => 'Rating A'],
        'kapasitasPutusKa' => ['t' => 'angka', 'min' => 0, 'max' => 1000, 'label' => 'Kapasitas Putus'],
        'media' => ['t' => 'pilihan', 'pilihan' => ['VAKUM', 'SF6', 'MINYAK', 'UDARA'], 'label' => 'Media'],
        'penggerak' => ['t' => 'pilihan', 'pilihan' => ['MANUAL', 'MOTOR'], 'label' => 'Penggerak'],
        'tiangId' => $p(40, ['pola' => POLA_ID_TIANG, 'label' => 'Tiang']),
        'switchingHuluId' => $p(20, ['pola' => '/^SWC-\d{4,}$/', 'label' => 'Switching Hulu']),
        'posisiNormal' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => ['NC', 'NO'], 'label' => 'Posisi Normal'],
        'titikHubung' => ['t' => 'bool', 'label' => 'Titik Hubung'],
        'tiangSisiA' => $p(40, ['pola' => POLA_ID_TIANG, 'label' => 'Tiang Sisi A']), 'tiangSisiB' => $p(40, ['pola' => POLA_ID_TIANG, 'label' => 'Tiang Sisi B']),
        'penyulangSisiB' => $p(80, ['label' => 'Penyulang Sisi B']),
        'bisaTrip' => ['t' => 'bool', 'label' => 'Bisa Trip'], 'catatGangguan' => ['t' => 'bool', 'label' => 'Catat Gangguan'], 'bacaArus' => ['t' => 'bool', 'label' => 'Baca Arus'],
        'bacaTegangan' => ['t' => 'bool', 'label' => 'Baca Tegangan'], 'terhubungScada' => ['t' => 'bool', 'label' => 'Terhubung SCADA'],
        'kodeRtu' => $p(40, ['label' => 'Kode RTU']),
        'mediaKomunikasi' => ['t' => 'pilihan', 'pilihan' => ['GSM', 'RADIO', 'FO'], 'label' => 'Media Komunikasi'],
        'fungsiFco' => ['t' => 'pilihan', 'pilihan' => ['CABANG', 'GARDU'], 'label' => 'Fungsi FCO'],
        'fuseTipe' => ['t' => 'pilihan', 'pilihan' => ['K', 'T', 'H'], 'label' => 'Tipe Fuse'], 'fuseRating' => $p(20, ['label' => 'Rating Fuse']),
        'statusOperasi' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => ['OPERASI', 'TIDAK_OPERASI', 'DIBONGKAR'], 'label' => 'Status Operasi'],
        'kondisi' => ['t' => 'pilihan', 'pilihan' => ['BAIK', 'PERLU_PERBAIKAN', 'RUSAK'], 'label' => 'Kondisi'],
        'catatan' => ['t' => 'teks', 'maks' => 300, 'multiBaris' => true, 'maksBaris' => 6, 'label' => 'Catatan'],
    ];
}

/** simpanSwitching { opId, switchingId?, revision?, koordinat, statusVerifikasi?, aktif?, foto?, ...isian } -> { switching, foto }. */
function aksiSimpanSwitching(array $data, array $tiket): array
{
    $pdo = db();
    $user = (string)$tiket['u'];
    $g = new KumpulGalat();
    $sisa = $data;
    unset($sisa['foto']);
    $d = validasiTiang($sisa, skemaSwitchingSimpan(), $g);
    if (isset($d['catatan']) && count(explode("\n", $d['catatan'])) > 6) $g->tambah('catatan', 'Catatan maksimal 6 baris.');
    $fotoBaru = bacaFotoKiriman($data['foto'] ?? null, $g, FOTO_SLOT_SWITCHING);
    lemparBilaAda($g);
    $dibuat = [];
    $hapusNanti = [];
    try {
        $hasil = denganOperasi($pdo, $d['opId'], function () use ($pdo, $d, $user, $g, $fotoBaru, &$dibuat, &$hapusNanti) {
            $jar = jaringanKonteks($pdo);
            $rows = array_values(array_filter(barisTiang($pdo, 'tiang_switching'), fn ($r) => teks($r['switching_id']) !== ''));
            $baru = empty($d['switchingId']);
            $lama = null;
            if (!$baru) {
                $q = $pdo->prepare(kunciUntukUbah($pdo, 'SELECT * FROM tiang_switching WHERE switching_id = ?'));
                $q->execute([$d['switchingId']]);
                $lama = $q->fetch() ?: null;
                if (!$lama) throw new TiangGalat(404, 'DATA_TIDAK_DITEMUKAN');
                if (isset($d['revision']) && (int)$lama['revision'] !== (int)$d['revision']) throw new TiangGalat(409, 'KONFLIK_REVISION');
            } elseif (count($rows) >= SWC_MAKS_BARIS) throw new TiangGalat(422, 'TERLALU_BANYAK');
            $id = $baru ? idBerikutTiang($pdo, 'tiang_switching', 'switching_id', 'SWC') : $d['switchingId'];
            $u = [];
            foreach (SWITCHING_ISIAN as [$api, $kol, $tipe]) {
                $v = $d[$api] ?? null;
                $u[$kol] = $v ?? ($tipe === 'b' ? false : '');
            }
            $pny = $jar['penyulang'][strtoupper((string)$u['penyulang'])] ?? null;
            if ($pny === null) { $g->tambah('penyulang', 'Penyulang "' . $u['penyulang'] . '" tidak dikenal.'); lemparBilaAda($g); }
            $u['penyulang'] = $pny;
            if ($u['section_id'] !== '') {
                $sec = $jar['section'][$u['section_id']] ?? null;
                if (!$sec) $g->tambah('sectionId', 'Section tidak ditemukan.');
                elseif ($sec['penyulang'] !== $pny) $g->tambah('sectionId', 'Section tidak sesuai penyulang.');
            }
            if ($u['titik_hubung']) {
                $b = $jar['penyulang'][strtoupper((string)$u['penyulang_sisi_b'])] ?? null;
                if ($b === null) $g->tambah('penyulangSisiB', 'Penyulang sisi B tidak dikenal.');
                elseif ($b === $pny) $g->tambah('penyulangSisiB', 'Penyulang sisi B sama dengan penyulang.');
                else $u['penyulang_sisi_b'] = $b;
            } else {
                $u['tiang_sisi_a'] = '';
                $u['tiang_sisi_b'] = '';
                $u['penyulang_sisi_b'] = '';
            }
            if (!array_key_exists('bisaTrip', $d)) $u['bisa_trip'] = !empty(SWC_BISA_TRIP[$u['jenis']]);
            if ($u['jenis'] !== 'FCO') foreach (SWC_KOLOM_FCO as $k) $u[$k] = '';
            if (!$u['terhubung_scada']) { $u['kode_rtu'] = ''; $u['media_komunikasi'] = ''; }
            $peta = [];
            foreach ($rows as $r) $peta[teks($r['switching_id'])] = $r;
            if ($u['switching_hulu_id'] !== '') {
                if ($u['switching_hulu_id'] === ($d['switchingId'] ?? '')) $g->tambah('switchingHuluId', 'Switching hulu tidak boleh diri sendiri.');
                elseif (!isset($peta[$u['switching_hulu_id']]) || !aktif($peta[$u['switching_hulu_id']]['aktif'])) $g->tambah('switchingHuluId', 'Switching hulu tidak ditemukan.');
                else {
                    $lihat = [];
                    $cur = $u['switching_hulu_id'];
                    while ($cur !== '' && isset($peta[$cur]) && !isset($lihat[$cur])) {
                        if (!empty($d['switchingId']) && $cur === $d['switchingId']) { $g->tambah('switchingHuluId', 'Rantai hulu berputar.'); break; }
                        $lihat[$cur] = true;
                        $cur = teks($peta[$cur]['switching_hulu_id']);
                    }
                }
            }
            $nama = mb_strtoupper((string)$u['nama']);
            foreach ($rows as $r) {
                if (teks($r['switching_id']) === $id || !aktif($r['aktif'])) continue;
                if (mb_strtoupper(teks($r['penyulang'])) === mb_strtoupper($pny) && mb_strtoupper(teks($r['nama'])) === $nama) $g->tambah('nama', 'Nama switching "' . $u['nama'] . '" sudah dipakai di penyulang ini.');
            }
            lemparBilaAda($g);
            $sekarang = sekarangIsoTiang();
            $u['lat'] = $d['koordinat']['lat'];
            $u['lng'] = $d['koordinat']['lng'];
            $u['status_verifikasi'] = $d['statusVerifikasi'] ?? 'TERVERIFIKASI';
            $u['verifikasi_terakhir'] = $sekarang;
            $u['aktif'] = $d['aktif'] ?? ($lama ? aktif($lama['aktif']) : true);
            $u['diubah_pada'] = $sekarang;
            $u['diubah_oleh'] = $user;
            $semua = array_map(fn ($r) => $lama && teks($r['switching_id']) === $id ? array_merge($r, $u) : $r, $rows);
            if (!$lama) $semua[] = array_merge(['switching_id' => $id], $u);
            $u['proteksi_hulu_id'] = proteksiHuluSwitching($semua)[$id] ?? '';
            if ($lama) {
                $beda = bedaKolom($lama, $u);
                ubahBarisTiang($pdo, 'tiang_switching', 'switching_id', $id, $u + ['revision' => (int)$lama['revision'] + 1]);
                catatAuditTiang($pdo, $user, 'SWITCHING_UBAH', $id, $id . ': ' . ($beda ?: 'tanpa perubahan isian (verifikasi ulang)'));
            } else {
                sisipBarisTiang($pdo, 'tiang_switching', ['switching_id' => $id, 'revision' => 1, 'foto_unit_id' => '', 'foto_nameplate_id' => '', 'foto_kontroler_id' => '', 'sirkuit_id' => '',
                    'urut' => urutBerikut($pdo, 'tiang_switching')] + $u);
                catatAuditTiang($pdo, $user, 'SWITCHING_BARU', $id, $id . ' ' . $u['jenis'] . ' ' . $u['nama'] . ' (' . $u['penyulang'] . ')');
            }
            $konfirmasi = $fotoBaru ? simpanFotoPaket($pdo, 'SWITCHING', $id, 'Switching', $fotoBaru, FOTO_SLOT_SWITCHING, 'tiang_switching', 'switching_id', $sekarang, $dibuat, $hapusNanti) : [];
            $q = $pdo->prepare('SELECT * FROM tiang_switching WHERE switching_id = ?');
            $q->execute([$id]);
            return ['switching' => switchingKeApi($q->fetch(), $u['proteksi_hulu_id']), 'foto' => (object)$konfirmasi];
        });
    } catch (Throwable $e) {
        foreach ($dibuat as $f) @unlink($f);
        throw $e;
    }
    foreach ($hapusNanti as $rel) hapusBerkasFotoBilaYatim($pdo, $rel);
    return $hasil;
}

/**
 * uploadFotoSwitching { opId, switchingId, slot UNIT | NAMEPLATE | KONTROLER, sha256, ukuranByte, data } -> { switching, foto }.
 * Foto susulan untuk switching yang sudah ada (rincian switching). Tidak menaikkan `revision`; foto yang diganti dibuang berkasnya.
 */
function aksiUploadFotoSwitching(array $data, array $tiket): array
{
    $pdo = db();
    $user = (string)$tiket['u'];
    $g = new KumpulGalat();
    $fotoKolom = ['sha256' => 1, 'ukuranByte' => 1, 'data' => 1];
    $d = validasiTiang(array_diff_key($data, $fotoKolom), [
        'opId' => ['t' => 'teks', 'wajib' => true, 'maks' => 64, 'pola' => POLA_OP_ID, 'label' => 'ID operasi'],
        'switchingId' => ['t' => 'teks', 'wajib' => true, 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/', 'label' => 'ID switching'],
        'slot' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => array_keys(FOTO_SLOT_SWITCHING), 'label' => 'Slot foto'],
    ], $g);
    $fotoBaru = isset($d['slot']) ? bacaFotoKiriman([$d['slot'] => array_intersect_key($data, $fotoKolom)], $g, FOTO_SLOT_SWITCHING) : [];
    lemparBilaAda($g);
    $dibuat = [];
    $hapusNanti = [];
    try {
        $hasil = denganOperasi($pdo, $d['opId'], function () use ($pdo, $d, $user, $fotoBaru, &$dibuat, &$hapusNanti) {
            $q = $pdo->prepare(kunciUntukUbah($pdo, 'SELECT * FROM tiang_switching WHERE switching_id = ?'));
            $q->execute([$d['switchingId']]);
            if (!$q->fetch()) throw new TiangGalat(404, 'DATA_TIDAK_DITEMUKAN');
            $sekarang = sekarangIsoTiang();
            $konfirmasi = simpanFotoPaket($pdo, 'SWITCHING', $d['switchingId'], 'Switching', $fotoBaru, FOTO_SLOT_SWITCHING, 'tiang_switching', 'switching_id', $sekarang, $dibuat, $hapusNanti);
            ubahBarisTiang($pdo, 'tiang_switching', 'switching_id', $d['switchingId'], ['diubah_pada' => $sekarang, 'diubah_oleh' => $user]);
            catatAuditTiang($pdo, $user, 'SWITCHING_FOTO', $d['switchingId'], $d['switchingId'] . ' foto ' . $d['slot']);
            $rows = array_values(array_filter(barisTiang($pdo, 'tiang_switching'), fn ($r) => teks($r['switching_id']) !== ''));
            $hulu = proteksiHuluSwitching($rows);
            $q = $pdo->prepare('SELECT * FROM tiang_switching WHERE switching_id = ?');
            $q->execute([$d['switchingId']]);
            return ['switching' => switchingKeApi($q->fetch(), $hulu[$d['switchingId']] ?? ''), 'foto' => (object)$konfirmasi];
        });
    } catch (Throwable $e) {
        foreach ($dibuat as $f) @unlink($f);
        throw $e;
    }
    foreach ($hapusNanti as $rel) hapusBerkasFotoBilaYatim($pdo, $rel);
    return $hasil;
}

/** getFotoSwitching { switchingId, slot UNIT | NAMEPLATE | KONTROLER, ukuran? } -> foto (bentuk sama getFotoTiang). */
function aksiGetFotoSwitching(array $data, array $tiket): array
{
    $g = new KumpulGalat();
    $d = validasiTiang($data, [
        'switchingId' => ['t' => 'teks', 'wajib' => true, 'maks' => 20, 'pola' => '/^SWC-\d{4,}$/', 'label' => 'ID switching'],
        'slot' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => array_keys(FOTO_SLOT_SWITCHING), 'label' => 'Slot foto'],
        'ukuran' => ['t' => 'pilihan', 'pilihan' => ['KECIL', 'PENUH'], 'label' => 'Ukuran'],
    ], $g);
    lemparBilaAda($g);
    return jawabFotoBerkas(db(), 'SWITCHING', $d['switchingId'], $d['slot'], $d['ukuran'] ?? 'KECIL') + ['switchingId' => $d['switchingId']];
}

/** getFotoTiang { tiangId, slot TIANG | KEPALA, ukuran? KECIL | PENUH } -> { tiangId, slot, mime, kecil, ukuranByte, data base64 }. */
function aksiGetFotoTiang(array $data, array $tiket): array
{
    $g = new KumpulGalat();
    $d = validasiTiang($data, [
        'tiangId' => ['t' => 'teks', 'wajib' => true, 'maks' => 40, 'pola' => POLA_ID_TIANG, 'label' => 'ID tiang'],
        'slot' => ['t' => 'pilihan', 'wajib' => true, 'pilihan' => array_keys(FOTO_SLOT_TIANG), 'label' => 'Slot foto'],
        'ukuran' => ['t' => 'pilihan', 'pilihan' => ['KECIL', 'PENUH'], 'label' => 'Ukuran'],
    ], $g);
    lemparBilaAda($g);
    return jawabFotoBerkas(db(), 'TIANG', $d['tiangId'], $d['slot'], $d['ukuran'] ?? 'KECIL') + ['tiangId' => $d['tiangId']];
}

return [
    'getFotoTiang' => ['menu' => TIANG_MENU, 'ubah' => false, 'fn' => 'aksiGetFotoTiang'],
    'simpanVerifikasiTiang' => ['menu' => TIANG_MENU, 'ubah' => true, 'fn' => 'aksiSimpanVerifikasiTiang'],
    'simpanSegmen' => ['menu' => SWITCHING_MENU, 'ubah' => true, 'fn' => 'aksiSimpanSegmen'],
    'simpanSwitching' => ['menu' => SWITCHING_MENU, 'ubah' => true, 'fn' => 'aksiSimpanSwitching'],
    'getFotoSwitching' => ['menu' => SWITCHING_MENU, 'ubah' => false, 'fn' => 'aksiGetFotoSwitching'],
    'uploadFotoSwitching' => ['menu' => SWITCHING_MENU, 'ubah' => true, 'fn' => 'aksiUploadFotoSwitching'],
];
