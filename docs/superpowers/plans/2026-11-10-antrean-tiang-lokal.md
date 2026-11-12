# Antrean lokal verifikasi tiang + sinkronTiang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (dikerjakan inline atas permintaan Master Guswan).

**Goal:** Simpan tiang/segmen langsung selesai di HP, dikirim berurutan di latar lewat satu aksi batch `sinkronTiang`.

**Architecture:** Backend: aksi baru `sinkronTiang` memakai ulang inti validasi `simpanVerifikasiTiang_`/`simpanSegmen_` terhadap tabel yang dibaca sekali dalam satu lock. HP: `AntreanTiang` (pola `AntreanTemuanAdmin`) + penggabungan entri, urutan, pemetaan id sementara; didaftarkan di `SyncController`.

**Tech Stack:** Google Apps Script (node --test), Flutter (flutter test).

**Spec:** `docs/superpowers/specs/2026-11-10-antrean-tiang-lokal-design.md`

## Global Constraints
- Versi backend dan app 1.0.71; `VERSI_APP_MINIMUM` tetap 1.0.69; aksi lama `simpanVerifikasiTiang`/`simpanSegmen`/`uploadFotoTiang` tetap ada.
- Maks 25 entri per `sinkronTiang`, batas waktu ±4 menit; sisa dilaporkan `DITUNDA`.
- `opId` dicatat di CacheService 6 jam; kirim ulang = hasil sama tanpa menulis.
- Backend deploy hanya atas perintah Master Guswan.

## Review Focus
- Induk dan anak dalam satu kelompok (induk baru terverifikasi lebih dulu) -> anak lolos.
- Satu entri gagal tidak membatalkan entri lain.
- `opId` ulang tidak menggandakan tiang baru.
- Id sementara `LOKAL-` diganti di anak, foto, dan berkas jalur.
- Gagal jaringan tetap MENUNGGU; ditolak server jadi GALAT dan tidak diulang otomatis.

## Task 1: Backend `sinkronTiang`
**Files:** Modify `backend/src/modules/99_Verifikasi_Tiang.js`, `98_Segmen.js`, router aksi, `09_Versi.js`; Test `tests/sinkronTiang.test.js`.
**Interfaces:** Produces `sinkronTiang_(sesi, data, platform) -> {hasil:[{opId, ok, tiang|segmen|galat:{kode,info}}], idBaru:{LOKAL-..:BARU-..}}`.
- [ ] Tes gagal: batch induk+anak, entri gagal terisolasi, opId ulang, DITUNDA >25.
- [ ] Ekstrak inti simpan tiang/segmen menjadi fungsi terhadap konteks tabel di memori; aksi lama memanggilnya.
- [ ] Implementasi `sinkronTiang_` + daftarkan aksi + kontrak API.
- [ ] `node --test` hijau.

## Task 2: HP `AntreanTiang`
**Files:** Create `mobile/lib/features/tiang/antrean_tiang.dart`; Modify `tiang_repository.dart`, `core/sync_controller.dart`, `core/deps.dart`; Test `mobile/test/antrean_tiang_test.dart`.
**Interfaces:** `AntreanTiang.tambahTiang/tambahSegmen/tambahFoto`, `kirim(Sesi)`, `item(userId, tiangId)`.
- [ ] Tes gagal: penggabungan per tiang, urutan topologis, penggantian id sementara, GALAT vs MENUNGGU.
- [ ] Implementasi + kait ke SyncController.
- [ ] `flutter test` hijau.

## Task 3: Layar memakai antrean
**Files:** Modify `jalur_tiang_screen.dart`, `tiang_form_screen.dart`, `segmen_screen.dart`.
- [ ] Simpan -> antrean + berkas jalur lokal, tanda "menunggu kirim", tombol Kirim ulang/Buang untuk GALAT.
- [ ] `flutter analyze` bersih; bump 1.0.71+245; APK dibangun hanya bila diminta.
