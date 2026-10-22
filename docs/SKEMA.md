

### v1.0.19
- SiSi_Auth `log_Notif_Dilihat`: user_id, kunci, waktu. Satu baris per item lonceng yang sudah dibuka akun itu (P0:<p0_id>, TEMUAN:<temuan_id>, WO:<temuan_id>:<waktu_diteruskan>). Dibuat otomatis oleh `tandaiNotifikasi`.
- Script Property `APK_FOLDER_ID`: folder Drive APK update (nama file memuat versi x.y.z). APK versi tertinggi dibuka "siapa saja yang punya link" (hanya lihat) supaya HP bisa mengunduh langsung.
- db_Menu: OPS_PENUGASAN_TIM tidak dipakai (aktif FALSE), OPS_PENERUSAN_WO bernama "Penerusan Tim Temuan Inspeksi".
- HP (master_cache `temuan_offline_<userId>`): + `urutanSection` (urutan section per penyulang).
- HP: izin Android `REQUEST_INSTALL_PACKAGES` (pasang update dari app), APK unduhan sementara di folder cache `update_apk`.
