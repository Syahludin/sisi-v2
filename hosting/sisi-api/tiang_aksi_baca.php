<?php
/**
 * Aksi BACA modul tiang. Bentuk jawaban sama dengan Apps Script (99_Verifikasi_Tiang.js, 98_Segmen.js, 96_Master_Switching.js);
 * tests/tiang-php.test.js membandingkan keduanya untuk data yang sama. Dimuat oleh tiangAksi() (tiang_lib.php).
 */
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const TIANG_KODE_LAIN = 'LAINNYA';
const TIANG_POSISI = ['ATAS', 'TENGAH', 'BAWAH'];
const TIANG_STATUS_INDUK = ['BENAR', 'DIGANTI', 'TITIK_AWAL'];
const TIANG_MENU = 'OPS_VERIFIKASI_TIANG';
const SWITCHING_MENU = 'OPS_MASTER_SWITCHING';

/** Isian sirkuit: [nama API, kolom, tipe t = teks / a = angka]. Urutan = TIANG_ISIAN_SIRKUIT_ di Apps Script. */
const TIANG_ISIAN_SIRKUIT = [
    ['penyulang', 'penyulang', 't'], ['posisi', 'posisi', 't'], ['konstruksiId', 'konstruksi_id', 't'], ['sectionId', 'section_id', 't'],
    ['segmenId', 'segmen_id', 't'], ['indukTiangId', 'induk_tiang_id', 't'], ['peranTitik', 'peran_titik', 't'], ['switchingId', 'switching_id', 't'],
    ['switchingDiTiang', 'switching_di_tiang', 't'], ['jenisKabel', 'jenis_kabel', 't'], ['ukuranMm2', 'ukuran_mm2', 'a'],
    ['indukStatus', 'induk_status', 't'], ['indukKeterangan', 'induk_keterangan', 't'], ['switchingKeterangan', 'switching_keterangan', 't'],
];

/** Isian segmen: [nama API, kolom, tipe]. */
const SEGMEN_ISIAN = [
    ['nama', 'nama', 't'], ['penyulang', 'penyulang', 't'], ['sectionId', 'section_id', 't'], ['urutan', 'urutan', 'a'], ['indukSegmenId', 'induk_segmen_id', 't'],
    ['awalJenis', 'awal_jenis', 't'], ['awalNama', 'awal_nama', 't'], ['awalSwitchingId', 'awal_switching_id', 't'],
    ['akhirJenis', 'akhir_jenis', 't'], ['akhirNama', 'akhir_nama', 't'], ['akhirSwitchingId', 'akhir_switching_id', 't'],
    ['segmenItb', 'segmen_itb', 't'], ['catatan', 'catatan', 't'], ['jenisSegmen', 'jenis_segmen', 't'], ['jenisKabel', 'jenis_kabel', 't'],
    ['ukuranMm2', 'ukuran_mm2', 'a'], ['panjangKabelM', 'panjang_kabel_m', 'a'], ['penghantarId', 'penghantar_id', 't'],
];

/** Isian switching: [nama API, kolom, tipe t / a / b]. */
const SWITCHING_ISIAN = [
    ['jenis', 'jenis', 't'], ['nama', 'nama', 't'], ['penyulang', 'penyulang', 't'], ['sectionId', 'section_id', 't'], ['kodeAset', 'kode_aset', 't'],
    ['merkKontroler', 'merk_kontroler', 't'], ['tipeKontroler', 'tipe_kontroler', 't'], ['versiFirmware', 'versi_firmware', 't'],
    ['rasioCt', 'rasio_ct', 't'], ['rasioVt', 'rasio_vt', 't'], ['merk', 'merk', 't'], ['tipe', 'tipe', 't'], ['nomorSeri', 'nomor_seri', 't'],
    ['tahunPasang', 'tahun_pasang', 'a'], ['ratingKv', 'rating_kv', 'a'], ['ratingA', 'rating_a', 'a'], ['kapasitasPutusKa', 'kapasitas_putus_ka', 'a'],
    ['media', 'media', 't'], ['penggerak', 'penggerak', 't'], ['tiangId', 'tiang_id', 't'], ['switchingHuluId', 'switching_hulu_id', 't'],
    ['posisiNormal', 'posisi_normal', 't'], ['titikHubung', 'titik_hubung', 'b'], ['tiangSisiA', 'tiang_sisi_a', 't'], ['tiangSisiB', 'tiang_sisi_b', 't'],
    ['penyulangSisiB', 'penyulang_sisi_b', 't'], ['bisaTrip', 'bisa_trip', 'b'], ['catatGangguan', 'catat_gangguan', 'b'], ['bacaArus', 'baca_arus', 'b'],
    ['bacaTegangan', 'baca_tegangan', 'b'], ['terhubungScada', 'terhubung_scada', 'b'], ['kodeRtu', 'kode_rtu', 't'], ['mediaKomunikasi', 'media_komunikasi', 't'],
    ['fungsiFco', 'fungsi_fco', 't'], ['fuseTipe', 'fuse_tipe', 't'], ['fuseRating', 'fuse_rating', 't'], ['statusOperasi', 'status_operasi', 't'],
    ['kondisi', 'kondisi', 't'], ['catatan', 'catatan', 't'],
];

function nilaiIsian(array $r, string $kolom, string $tipe)
{
    return match ($tipe) { 'a' => angka($r[$kolom] ?? null), 'b' => aktif($r[$kolom] ?? null), default => teks($r[$kolom] ?? null) };
}

/** Semua baris tabel, urut baris sheet (urut) lalu kunci. */
function barisTiang(PDO $pdo, string $tabel, string $where = '', array $param = []): array
{
    $q = $pdo->prepare("SELECT * FROM $tabel" . ($where !== '' ? " WHERE $where" : '') . ' ORDER BY urut, ' . TIANG_KUNCI[$tabel][0]);
    $q->execute($param);
    return $q->fetchAll();
}

/** Sirkuit aktif dikelompokkan per tiang_id. [$idTiang] = batasi ke tiang itu (null = semua). */
function sirkuitAktifPerTiang(PDO $pdo, ?string $subKueriTiang = null, array $param = []): array
{
    $per = [];
    $where = 'aktif = 1' . ($subKueriTiang !== null ? " AND tiang_id IN ($subKueriTiang)" : '');
    foreach (barisTiang($pdo, 'tiang_sirkuit', $where, $param) as $r) $per[teks($r['tiang_id'])][] = $r;
    return $per;
}

function kodeJalurTiang(array $r): string
{
    return teks($r['kode_nama_aset'] ?? null) ?: TIANG_KODE_LAIN;
}

function sirkuitKeApi(array $r, ?array $tiang): array
{
    $o = ['sirkuitId' => teks($r['sirkuit_id'])];
    foreach (TIANG_ISIAN_SIRKUIT as [$api, $kol, $tipe]) $o[$api] = nilaiIsian($r, $kol, $tipe);
    // data lama: konstruksi satu per tiang disalin ke tiap penyulang; posisi lama (KIRI / KANAN) dikosongkan agar dipilih ulang
    if (!$o['konstruksiId'] && $tiang) $o['konstruksiId'] = teks($tiang['konstruksi_lapangan'] ?? null);
    if (!in_array($o['posisi'], TIANG_POSISI, true)) $o['posisi'] = '';
    $o['gawangM'] = angka($r['gawang_m'] ?? null);
    $o['segmenAset'] = teks($r['segmen_aset'] ?? null);
    $o['tandaCekGawang'] = teks($r['tanda_cek_gawang'] ?? null);
    $o['statusVerifikasi'] = teks($r['status_verifikasi'] ?? null) ?: 'BELUM';
    return $o;
}

/**
 * Kekurangan data satu tiang (bentuk API) agar boleh Terverifikasi: [[field form, label]]; [] = lengkap (kurangLengkapTiang_).
 * Field mengikuti kunci form HP: jenis, ukuran, sisi, foto, posisi, sirkuit<i>.
 */
function kurangTiangField(array $t): array
{
    $k = [];
    if (!$t['jenisTiang']) $k[] = ['jenis', 'Jenis Tiang'];
    if (!$t['ukuranTiang']) $k[] = ['ukuran', 'Ukuran Tiang'];
    if (!$t['sisiJalan']) $k[] = ['sisi', 'Sisi Jalan'];
    if (isset($t['foto'])) {
        if (!$t['foto']['TIANG']) $k[] = ['foto', 'Foto Full Tiang'];
        if (!$t['foto']['KEPALA']) $k[] = ['foto', 'Foto Konstruksi SUTM'];
    }
    $s = $t['sirkuit'] ?? [];
    if (!$s) $k[] = ['sirkuit0', 'Penyulang'];
    foreach ($s as $i => $c) {
        $p = count($s) > 1 ? 'Penyulang ' . ($i + 1) . ': ' : '';
        $f = 'sirkuit' . $i;
        foreach ([['penyulang', 'Penyulang'], ['sectionId', 'Section'], ['segmenId', 'Segmen'], ['konstruksiId', 'Konstruksi'], ['peranTitik', 'Peran Titik'], ['jenisKabel', 'Jenis Kabel']] as [$kunci, $n]) {
            if (!$c[$kunci]) $k[] = [$f, $p . $n];
        }
        if (count($s) > 1 && !$c['posisi']) $k[] = ['posisi', $p . 'Posisi'];
        if (!$c['ukuranMm2']) $k[] = [$f, $p . 'Ukuran mm²'];
        if ($c['indukStatus'] === 'TITIK_AWAL') {
            if ($c['indukTiangId']) $k[] = [$f, $p . 'Tiang Awal Tidak Boleh Punya Induk'];
            if (!$c['indukKeterangan']) $k[] = [$f, $p . 'Keterangan Tiang Awal SKTM'];
        } elseif (!in_array($c['indukStatus'], TIANG_STATUS_INDUK, true) || !$c['indukTiangId']) {
            $k[] = [$f, $p . 'Konfirmasi Tiang Hulu'];
        }
        if (!$c['switchingId'] && !$c['switchingKeterangan']) $k[] = [$f, $p . 'Switching Hulu atau Keterangan Tanpa Switching'];
    }
    return $k;
}

/** Label kekurangan saja (kurangLengkapTiang_). */
function kurangLengkapTiang(array $t): array
{
    return array_column(kurangTiangField($t), 1);
}

function tiangKeApi(array $r, array $sirkuit): array
{
    $o = [
        'tiangId' => teks($r['tiang_id']), 'nama' => teks($r['nama']), 'kode' => kodeJalurTiang($r),
        'latAset' => angka($r['lat_aset']), 'lngAset' => angka($r['lng_aset']), 'lat' => angka($r['lat']), 'lng' => angka($r['lng']),
        'sumberKoordinat' => teks($r['sumber_koordinat']), 'jenisTiangAset' => teks($r['jenis_tiang_aset']), 'ukuranTiangAset' => teks($r['ukuran_tiang_aset']),
        'jenisTiang' => teks($r['jenis_tiang']), 'ukuranTiang' => teks($r['ukuran_tiang']), 'sisiJalan' => teks($r['sisi_jalan']),
        'jumlahSirkuit' => angka($r['jumlah_sirkuit']) ?: 1, 'tandaCek' => teks($r['tanda_cek']), 'statusVerifikasi' => teks($r['status_verifikasi']) ?: 'BELUM',
        'verifikasiTerakhir' => teks($r['verifikasi_terakhir']), 'keteranganSumber' => teks($r['keterangan_sumber']),
        'foto' => ['TIANG' => teks($r['foto_tiang_id']) !== '', 'KEPALA' => teks($r['foto_kepala_id']) !== ''], 'revision' => (int)($r['revision'] ?? 0),
        'sirkuit' => array_map(fn ($c) => sirkuitKeApi($c, $r), $sirkuit),
    ];
    if (count($o['sirkuit']) === 1) $o['sirkuit'][0]['posisi'] = TIANG_POSISI[0];
    if ($o['statusVerifikasi'] === 'TERVERIFIKASI') $o['kurang'] = kurangLengkapTiang($o);   // hijau di HP hanya bila kosong
    return $o;
}

function daftarKonstruksi(PDO $pdo): array
{
    $rows = array_filter(barisTiang($pdo, 'tiang_konstruksi'), fn ($r) => teks($r['konstruksi_id']) !== '' && teks($r['kode']) !== '' && aktif($r['aktif']));
    usort($rows, fn ($a, $b) => (angka($a['urutan']) ?: 0) <=> (angka($b['urutan']) ?: 0));
    return array_map(fn ($r) => ['konstruksiId' => teks($r['konstruksi_id']), 'kode' => teks($r['kode']), 'nama' => teks($r['nama']) ?: teks($r['kode'])], $rows);
}

function daftarUkuranTiang(PDO $pdo): array
{
    $rows = array_filter(barisTiang($pdo, 'tiang_ukuran'), fn ($r) => teks($r['nama']) !== '' && aktif($r['aktif']));
    usort($rows, fn ($a, $b) => (angka($a['urutan']) ?: 0) <=> (angka($b['urutan']) ?: 0));
    return array_map(fn ($r) => teks($r['nama']), array_values($rows));
}

/** Perbandingan nama seperti localeCompare untuk huruf Latin: tanpa beda besar-kecil dulu, lalu besar-kecil. */
function bandingNama(string $a, string $b): int
{
    return strcasecmp($a, $b) ?: strcmp($b, $a);
}

/** Penyulang + section aktif dari tiang_jaringan (jaringanSwitching_). */
function jaringanTiang(PDO $pdo): array
{
    $daftar = [];
    foreach (barisTiang($pdo, 'tiang_jaringan') as $r) {
        $pny = teks($r['penyulang']);
        $id = teks($r['section_id']);
        if ($pny === '' || $id === '' || !aktif($r['aktif'])) continue;
        $daftar[] = ['sectionId' => $id, 'penyulang' => $pny, 'section' => teks($r['section']), 'urutan' => angka($r['urutan'])];
    }
    usort($daftar, fn ($a, $b) => bandingNama($a['penyulang'], $b['penyulang']) ?: (($a['urutan'] ?: 0) <=> ($b['urutan'] ?: 0)) ?: bandingNama($a['section'], $b['section']));
    return array_map(fn ($x) => ['sectionId' => $x['sectionId'], 'penyulang' => $x['penyulang'], 'section' => $x['section']], $daftar);
}

function switchingAktifRingkas(PDO $pdo): array
{
    $o = [];
    foreach (barisTiang($pdo, 'tiang_switching') as $r) {
        if (teks($r['switching_id']) === '' || !aktif($r['aktif'])) continue;
        $o[] = ['switchingId' => teks($r['switching_id']), 'jenis' => teks($r['jenis']), 'nama' => teks($r['nama']), 'penyulang' => teks($r['penyulang'])];
    }
    return $o;
}

function segmenKeApi(array $r, array $hitung): array
{
    $o = ['segmenId' => teks($r['segmen_id'])];
    foreach (SEGMEN_ISIAN as [$api, $kol, $tipe]) $o[$api] = nilaiIsian($r, $kol, $tipe);
    $o['jenisSegmen'] = $o['jenisSegmen'] ?: 'UDARA';
    $o['statusData'] = teks($r['status_data']);
    $o['jumlahTiang'] = $hitung[$o['segmenId']]['jumlah'] ?? 0;
    $o['jumlahTerverifikasi'] = $hitung[$o['segmenId']]['terverifikasi'] ?? 0;
    $o['aktif'] = aktif($r['aktif']);
    $o['revision'] = (int)($r['revision'] ?? 0);
    return $o;
}

function aksiGetSegmen(array $d, array $tiket): array
{
    $pdo = db();
    $hitung = [];
    foreach (barisTiang($pdo, 'tiang_sirkuit', 'aktif = 1') as $r) {
        $id = teks($r['segmen_id']);
        if ($id === '') continue;
        $hitung[$id]['jumlah'] = ($hitung[$id]['jumlah'] ?? 0) + 1;
        $hitung[$id]['terverifikasi'] = ($hitung[$id]['terverifikasi'] ?? 0) + (teks($r['status_verifikasi']) === 'TERVERIFIKASI' ? 1 : 0);
    }
    $segmen = [];
    foreach (barisTiang($pdo, 'tiang_segmen') as $r) {
        if (teks($r['segmen_id']) === '') continue;
        $segmen[] = segmenKeApi($r, $hitung);
    }
    return ['segmen' => $segmen, 'jaringan' => jaringanTiang($pdo), 'switching' => switchingAktifRingkas($pdo)];
}

function aksiGetVerifikasiTiang(array $d, array $tiket): array
{
    $pdo = db();
    $sirkuit = sirkuitAktifPerTiang($pdo);
    $jalur = [];
    foreach (barisTiang($pdo, 'tiang_tiang', 'aktif = 1') as $r) {
        $id = teks($r['tiang_id']);
        if ($id === '') continue;
        $k = kodeJalurTiang($r);
        $jalur[$k] ??= ['kode' => $k, 'jumlah' => 0, 'terverifikasi' => 0, 'perluDilengkapi' => 0, 'perluPerbaikan' => 0, 'tidakDitemukan' => 0, 'bertanda' => 0];
        $st = teks($r['status_verifikasi']);
        $jalur[$k]['jumlah']++;
        // Terverifikasi dihitung hanya bila datanya lengkap (termasuk foto); kurang = Perlu Dilengkapi, bukan progres
        if ($st === 'TERVERIFIKASI') {
            if (tiangKeApi($r, $sirkuit[$id] ?? [])['kurang']) $jalur[$k]['perluDilengkapi']++; else $jalur[$k]['terverifikasi']++;
        } elseif ($st === 'PERLU_PERBAIKAN') $jalur[$k]['perluPerbaikan']++;
        elseif ($st === 'TIDAK_DITEMUKAN') $jalur[$k]['tidakDitemukan']++;
        if (teks($r['tanda_cek']) !== '') $jalur[$k]['bertanda']++;
    }
    $kunci = array_keys($jalur);
    sort($kunci, SORT_STRING);
    $s = aksiGetSegmen([], $tiket);
    return [
        'jalur' => array_map(fn ($k) => $jalur[$k], $kunci),
        'konstruksi' => daftarKonstruksi($pdo),
        'ukuran' => daftarUkuranTiang($pdo),
        'jaringan' => $s['jaringan'],
        'segmen' => array_values(array_map(fn ($x) => ['segmenId' => $x['segmenId'], 'nama' => $x['nama'], 'penyulang' => $x['penyulang'], 'sectionId' => $x['sectionId']],
            array_filter($s['segmen'], fn ($x) => $x['aktif']))),
        'switching' => $s['switching'],
    ];
}

function aksiGetTiangJalur(array $d, array $tiket): array
{
    $kode = $d['kode'] ?? null;
    if (!is_string($kode) || !preg_match('/^([A-Z]{3}|LAINNYA)$/', $kode)) {
        $g = new KumpulGalat();
        $g->tambah('kode', 'Kode jalur wajib berupa 3 huruf besar atau LAINNYA.');
        $g->keluar();
    }
    $pdo = db();
    $filter = $kode === TIANG_KODE_LAIN
        ? "aktif = 1 AND COALESCE(TRIM(kode_nama_aset), '') IN ('', 'LAINNYA')"
        : 'aktif = 1 AND TRIM(kode_nama_aset) = ?';
    $param = $kode === TIANG_KODE_LAIN ? [] : [$kode];
    $sirkuit = sirkuitAktifPerTiang($pdo, "SELECT tiang_id FROM tiang_tiang WHERE $filter", $param);
    $tiang = [];
    foreach (barisTiang($pdo, 'tiang_tiang', $filter, $param) as $r) {
        if (teks($r['tiang_id']) !== '') $tiang[] = tiangKeApi($r, $sirkuit[teks($r['tiang_id'])] ?? []);
    }
    return ['kode' => $kode, 'tiang' => $tiang];
}

function aksiGetPetaTiang(array $d, array $tiket): array
{
    $pdo = db();
    $filter = "aktif = 1 AND status_verifikasi = 'TERVERIFIKASI'";
    $sirkuit = sirkuitAktifPerTiang($pdo, "SELECT tiang_id FROM tiang_tiang WHERE $filter");
    $titik = [];
    $ada = [];
    $tanpa = 0;
    foreach (barisTiang($pdo, 'tiang_tiang', $filter) as $r) {
        $id = teks($r['tiang_id']);
        if ($id === '') continue;
        $lat = angka($r['lat']);
        $lng = angka($r['lng']);
        if ($lat === null || $lng === null) { $lat = angka($r['lat_aset']); $lng = angka($r['lng_aset']); }
        if ($lat === null || $lng === null) { $tanpa++; continue; }
        $pny = [];
        foreach ($sirkuit[$id] ?? [] as $c) {
            $p = teks($c['penyulang']);
            if ($p !== '' && !in_array($p, $pny, true)) $pny[] = $p;
        }
        $ada[$id] = true;
        $titik[] = ['tiangId' => $id, 'nama' => teks($r['nama']), 'kode' => kodeJalurTiang($r), 'lat' => $lat, 'lng' => $lng, 'penyulang' => $pny];
    }
    $garis = [];
    foreach ($titik as $t) {
        foreach ($sirkuit[$t['tiangId']] ?? [] as $c) {
            $induk = teks($c['induk_tiang_id']);
            $p = teks($c['penyulang']);
            if ($induk !== '' && $p !== '' && isset($ada[$induk])) $garis[] = ['tiangId' => $t['tiangId'], 'indukTiangId' => $induk, 'penyulang' => $p];
        }
    }
    return ['titik' => $titik, 'garis' => $garis, 'tanpaKoordinat' => $tanpa];
}

/** Proteksi hulu tiap switching: ke hulu lewat switching_hulu_id sampai switching aktif yang bisa_trip (proteksiHuluSwc_). */
function proteksiHuluSwitching(array $rows): array
{
    $peta = [];
    foreach ($rows as $r) if (teks($r['switching_id']) !== '') $peta[teks($r['switching_id'])] = $r;
    $hasil = [];
    foreach (array_keys($peta) as $id) {
        $lihat = [$id => true];
        $cur = teks($peta[$id]['switching_hulu_id']);
        $dapat = '';
        while ($cur !== '' && !isset($lihat[$cur]) && isset($peta[$cur])) {
            $lihat[$cur] = true;
            if (aktif($peta[$cur]['aktif']) && aktif($peta[$cur]['bisa_trip'])) { $dapat = $cur; break; }
            $cur = teks($peta[$cur]['switching_hulu_id']);
        }
        $hasil[$id] = $dapat;
    }
    return $hasil;
}

function switchingKeApi(array $r, string $proteksiHulu): array
{
    $o = ['switchingId' => teks($r['switching_id'])];
    foreach (SWITCHING_ISIAN as [$api, $kol, $tipe]) $o[$api] = nilaiIsian($r, $kol, $tipe);
    $o['lat'] = angka($r['lat']);
    $o['lng'] = angka($r['lng']);
    $o['koordinat'] = $o['lat'] !== null && $o['lng'] !== null ? angkaTeks($o['lat']) . ', ' . angkaTeks($o['lng']) : '';
    $o['proteksiHuluId'] = $proteksiHulu;
    $o['statusVerifikasi'] = teks($r['status_verifikasi']) ?: 'BELUM';
    $o['verifikasiTerakhir'] = teks($r['verifikasi_terakhir']);
    $o['foto'] = ['UNIT' => teks($r['foto_unit_id']) !== '', 'NAMEPLATE' => teks($r['foto_nameplate_id']) !== '', 'KONTROLER' => teks($r['foto_kontroler_id']) !== ''];
    $o['aktif'] = aktif($r['aktif']);
    $o['revision'] = (int)($r['revision'] ?? 0);
    $o['diubahPada'] = teks($r['diubah_pada']);
    return $o;
}

function aksiGetMasterSwitching(array $d, array $tiket): array
{
    $pdo = db();
    $rows = array_values(array_filter(barisTiang($pdo, 'tiang_switching'), fn ($r) => teks($r['switching_id']) !== ''));
    $hulu = proteksiHuluSwitching($rows);
    return [
        'switching' => array_map(fn ($r) => switchingKeApi($r, $hulu[teks($r['switching_id'])]), $rows),
        'jaringan' => jaringanTiang($pdo),
        'waktu' => gmdate('Y-m-d\TH:i:s\Z'),
    ];
}

return [
    'getVerifikasiTiang' => ['menu' => TIANG_MENU, 'ubah' => false, 'fn' => 'aksiGetVerifikasiTiang'],
    'getTiangJalur' => ['menu' => TIANG_MENU, 'ubah' => false, 'fn' => 'aksiGetTiangJalur'],
    'getPetaTiang' => ['menu' => SWITCHING_MENU, 'ubah' => false, 'fn' => 'aksiGetPetaTiang'],
    'getSegmen' => ['menu' => SWITCHING_MENU, 'ubah' => false, 'fn' => 'aksiGetSegmen'],
    'getMasterSwitching' => ['menu' => SWITCHING_MENU, 'ubah' => false, 'fn' => 'aksiGetMasterSwitching'],
];
