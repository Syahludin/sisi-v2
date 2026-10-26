# Backend Patch Checklist - Platform Parameter

## Overview
Patch 14 fungsi yang hard-code `'MOBILE'` menjadi menerima parameter `platform` dari router.

## Pattern Standar

**BEFORE:**
```javascript
function namaEndpoint_(sesi, data) {
  // ...
  auditLog_(sesi, 'AKSI', target, detail, 'MOBILE', tLog);
}
```

**AFTER:**
```javascript
function namaEndpoint_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'AKSI', target, detail, platform, tLog);
}
```

---

## File: `backend/src/modules/78_JadwalPadam.js`

### ✅ Function 1: `simpanJadwalPadam_`
**Line:** 280-300 (approx line 297)
**Current:**
```javascript
function simpanJadwalPadam_(sesi, data) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_SIMPAN', kode, isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```
**Change:**
```javascript
function simpanJadwalPadam_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_SIMPAN', kode, isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```

### ✅ Function 2: `ubahJadwalPadam_`
**Line:** 310-327 (approx line 323)
**Current:**
```javascript
function ubahJadwalPadam_(sesi, data) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_UBAH', teksJp_(r.kode_jadwal), isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```
**Change:**
```javascript
function ubahJadwalPadam_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_UBAH', teksJp_(r.kode_jadwal), isi.penyulang + ' ' + isi.section + ' ' + d.tanggal, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```

### ✅ Function 3: `ubahStatusJadwalPadam_`
**Line:** 329-350 (approx line 344)
**Current:**
```javascript
function ubahStatusJadwalPadam_(sesi, data) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_STATUS', teksJp_(r.kode_jadwal), status, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```
**Change:**
```javascript
function ubahStatusJadwalPadam_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_STATUS', teksJp_(r.kode_jadwal), status, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```

### ✅ Function 4: `hapusJadwalPadam_`
**Line:** 350-365 (approx line 361)
**Current:**
```javascript
function hapusJadwalPadam_(sesi, data) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_HAPUS', teksJp_(r.kode_jadwal), '', 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```
**Change:**
```javascript
function hapusJadwalPadam_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_HAPUS', teksJp_(r.kode_jadwal), '', platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
}
```

---

## File: `backend/src/modules/63_BA_Gardu.js`

### ✅ Function 5: `simpanBaGardu_` (first occurrence)
**Line:** ~435
**Current:**
```javascript
auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu, 'MOBILE', tLog);
```
**Change:**
```javascript
function simpanBaGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu, platform, tLog);
}
```

### ✅ Function 6: `simpanBaGardu_` (duplikat handling)
**Line:** ~568
**Current:**
```javascript
auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu + ' (' + asal + ')', 'MOBILE', tLog);
```
**Change:**
```javascript
// Same function, just update the hard-code
auditLog_(sesi, 'BA_GARDU_SIMPAN', nomor.idBa, d.jenis + ' ' + noGardu + ' (' + asal + ')', platform, tLog);
```

---

## File: `backend/src/modules/64_BA_Pdf.js`

### ✅ Function 7: `buatPdfBaGardu_` (error handler)
**Line:** ~225
**Current:**
```javascript
auditLog_(sesi, 'BA_GARDU_PDF_GAGAL', teksBa_(awal['ID BA']), (eE && (eE.kode + ' ' + (eE.detail || ''))) || String(eE), 'MOBILE');
```
**Change:**
```javascript
function buatPdfBaGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_PDF_GAGAL', teksBa_(awal['ID BA']), (eE && (eE.kode + ' ' + (eE.detail || ''))) || String(eE), platform);
}
```

### ✅ Function 8: `buatPdfBaGardu_` (success)
**Line:** ~251
**Current:**
```javascript
auditLog_(sesi, 'BA_GARDU_PDF', teksBa_(r['ID BA']), pdfId + ' (' + byte.length + ' byte)' + 
  (foto.hilang.length ? ', foto kosong: ' + foto.hilang.join(', ') : ''), 'MOBILE');
```
**Change:**
```javascript
// Same function, update hard-code
auditLog_(sesi, 'BA_GARDU_PDF', teksBa_(r['ID BA']), pdfId + ' (' + byte.length + ' byte)' + 
  (foto.hilang.length ? ', foto kosong: ' + foto.hilang.join(', ') : ''), platform);
```

---

## File: `backend/src/modules/66_BA_Ubah.js`

### ✅ Function 9: `ubahBaGardu_`
**Line:** ~237
**Current:**
```javascript
function ubahBaGardu_(sesi, data) {
  // ...
  auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), 'MOBILE', tLog);
}
```
**Change:**
```javascript
function ubahBaGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), platform, tLog);
}
```

### ✅ Function 10: Second `ubahBaGardu_` or related function
**Line:** ~354
**Current:**
```javascript
auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), 'MOBILE', tLog);
```
**Change:**
```javascript
// Update hard-code to use platform parameter
auditLog_(sesi, 'BA_GARDU_UBAH', teksBa_(r['ID BA']), beda.join(', ') + (d.alasan ? ' | ' + d.alasan : ''), platform, tLog);
```

---

## File: `backend/src/modules/68_BA_Ttd.js`

### ✅ Function 11: `uploadTtdBaGardu_`
**Line:** ~166
**Current:**
```javascript
function uploadTtdBaGardu_(sesi, data) {
  // ...
  auditLog_(sesi, 'BA_GARDU_TTD', teksBa_(x2['ID BA']), (lama ? 'upload ulang ' : 'upload ') + namaTtd + ' (' + semua.length + ' byte)', 'MOBILE', tLog);
}
```
**Change:**
```javascript
function uploadTtdBaGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_TTD', teksBa_(x2['ID BA']), (lama ? 'upload ulang ' : 'upload ') + namaTtd + ' (' + semua.length + ' byte)', platform, tLog);
}
```

### ✅ Function 12: `kirimEamBaGardu_`
**Line:** ~291
**Current:**
```javascript
function kirimEamBaGardu_(sesi, data) {
  // ...
  auditLog_(sesi, 'BA_GARDU_EAM', teksBa_(r['ID BA']), 'kirim EAM ke-' + rw.eam.kali, 'MOBILE', tLog);
}
```
**Change:**
```javascript
function kirimEamBaGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_EAM', teksBa_(r['ID BA']), 'kirim EAM ke-' + rw.eam.kali, platform, tLog);
}
```

### ✅ Function 13: `updateMasterGarduBa_`
**Line:** ~359
**Current:**
```javascript
function updateMasterGarduBa_(sesi, data) {
  // ...
  auditLog_(sesi, 'BA_GARDU_MASTER', teksBa_(r['ID BA']), teksRg_(g['No Gardu']) + ': ' + 
    (diubah.length ? diubah.map(function (x) { return x.kolom; }).join(', ') : 'sudah sama'), 'MOBILE', tLog);
}
```
**Change:**
```javascript
function updateMasterGarduBa_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'BA_GARDU_MASTER', teksBa_(r['ID BA']), teksRg_(g['No Gardu']) + ': ' + 
    (diubah.length ? diubah.map(function (x) { return x.kolom; }).join(', ') : 'sudah sama'), platform, tLog);
}
```

---

## File: `backend/src/modules/80_Riwayat_Gardu.js`

### ✅ Function 14: `updateUkurMasterGardu_`
**Line:** ~240
**Current:**
```javascript
function updateUkurMasterGardu_(sesi, data) {
  // ...
  auditLog_(sesi, 'UPDATE_UKUR_GARDU', teksRg_(g['No Gardu']), u.sumber + ' ' + u.kode + ' ' + u.periode + ' ' + u.tanggal, 'MOBILE', tLog);
}
```
**Change:**
```javascript
function updateUkurMasterGardu_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'UPDATE_UKUR_GARDU', teksRg_(g['No Gardu']), u.sumber + ' ' + u.kode + ' ' + u.periode + ' ' + u.tanggal, platform, tLog);
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Test each patched function dengan `platform: 'WEB'`
- [ ] Test each patched function dengan `platform: 'MOBILE'`
- [ ] Verify audit log mencatat platform yang benar

### Integration Tests
- [ ] Test dari website (platform should be 'WEB')
- [ ] Test dari mobile app (platform should be 'MOBILE')
- [ ] Check log_Audit untuk memastikan platform tercatat

### Regression Tests
- [ ] Mobile app functionality tidak broken
- [ ] Existing MOBILE audit logs tetap valid
- [ ] Backward compatibility maintained

---

## Deployment Steps

1. **Create feature branch:**
   ```bash
   git checkout -b feature/platform-parameter-patch
   ```

2. **Apply patches:**
   - Edit 6 files dengan 14 function changes
   - Test locally

3. **Commit:**
   ```bash
   git add backend/src/modules/
   git commit -m "fix: Add platform parameter to audit logging

   - Patch 14 functions hard-coding 'MOBILE'
   - Now accept platform param from router
   - Enables proper WEB vs MOBILE tracking

   Files changed:
   - 78_JadwalPadam.js (4 functions)
   - 63_BA_Gardu.js (2 functions)
   - 64_BA_Pdf.js (2 functions)
   - 66_BA_Ubah.js (2 functions)
   - 68_BA_Ttd.js (3 functions)
   - 80_Riwayat_Gardu.js (1 function)

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   ```

4. **Deploy to staging:**
   - Test dengan mobile staging app
   - Test dengan website staging

5. **Deploy to production:**
   - Schedule maintenance window
   - Deploy
   - Monitor logs for 30 minutes
   - Rollback plan ready

---

## Rollback Plan

If critical issues found after deployment:

1. **Revert commit:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

2. **Or redeploy previous version:**
   - Via Apps Script editor: restore from version history
   - Previous deployment ID: @104

3. **Communicate:**
   - Notify team
   - Update status page
   - Schedule new deployment after fix

---

**Estimated Time:** 4-6 hours
**Risk Level:** Low (backward compatible, mobile app unaffected)
**Reviewers:** Tech Lead
**Testing Required:** Yes (regression test mobile app mandatory)
