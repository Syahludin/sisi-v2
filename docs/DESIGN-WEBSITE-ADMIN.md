---
judul: SiSi Website Admin - Design Document
versi: 1.0.0
tanggal: 2026-10-26
status: Draft
penulis: Tim SiSi v2
---

# SiSi Website Admin - Design Document

## 1. Executive Summary

Website admin SiSi adalah aplikasi web berbasis React yang memungkinkan Admin dan Admin ES mengelola operasional ULP melalui browser desktop. Website ini terhubung ke backend Apps Script yang sama dengan aplikasi mobile, menggunakan platform identifier `WEB` untuk membedakan request dari mobile (`MOBILE`).

**Tujuan Utama:**
- Menyediakan antarmuka desktop yang lebih nyaman untuk tugas administratif
- Memanfaatkan layar lebar untuk menampilkan data tabular dan form kompleks
- Memudahkan input data dengan keyboard fisik
- Tetap menggunakan backend logic yang sama dengan mobile (konsistensi data)

**Scope Fase 1 (5 Fitur Prioritas):**
1. Laporan Harian UP3
2. Laporan Harian UIW
3. Berita Acara (BA) Gardu
4. Update Hasil Pengukuran Gardu (WBP/LWBP/Cover)
5. Jadwal Padam
6. Approval P0

---

## 2. Arsitektur Sistem

### 2.1 Stack Teknologi

**Frontend:**
- React 19.1.0 (hooks, functional components)
- Vite 6.3.5 (build tool, dev server)
- Vanilla CSS dengan CSS Variables (design tokens dari Linear)
- Hosting: Hostinger (static files)

**Backend:**
- Google Apps Script (existing, shared dengan mobile)
- Platform flag: `WEB` di semua request
- Authentication: Token-based (sama dengan mobile)

**Design System:**
- Base: Linear design language (dark theme, lavender accent #5e6ad2)
- Typography: Inter (fallback untuk Linear custom font)
- Layout: Sidebar collapsible + main content area

### 2.2 Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│  Hostinger (public_html/sisi-web-staging)          │
│  ┌───────────────────────────────────────────────┐ │
│  │  index.html                                    │ │
│  │  assets/ (CSS, JS bundles)                    │ │
│  │  img/ (static images)                         │ │
│  │  config.js (apiUrl, env)                      │ │
│  │  .htaccess (SPA routing)                      │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                        │
                        │ HTTPS POST
                        │ Content-Type: text/plain
                        │ { action, token, data, platform: 'WEB' }
                        ▼
┌─────────────────────────────────────────────────────┐
│  Apps Script Backend (doPost)                       │
│  ┌───────────────────────────────────────────────┐ │
│  │  02_Router.js                                  │ │
│  │  03_Guard.js (platform check)                 │ │
│  │  60_Laporan_UP3.js                            │ │
│  │  25_Yandal_Approval.js                        │ │
│  │  63-68_BA_*.js                                │ │
│  │  70_JadwalPadam.js                            │ │
│  │  34_Gardu_Riwayat.js                          │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                        │
                        │ Read/Write
                        ▼
┌─────────────────────────────────────────────────────┐
│  Google Sheets + Drive                              │
│  - SiSi_Master (db_Users, db_Menu, db_Akses, ...)│
│  - SiSi_Laporan (lap_Harian_UP3, lap_C4A_UP3)   │
│  - SiSi_JadwalPadam (db_jadwal_padam)            │
│  - SiSi_Yandal (yan_P0, yan_Switching, ...)     │
│  - Drive folders (foto BA, foto P0)               │
└─────────────────────────────────────────────────────┘
```

---

## 3. Backend Changes (Patch Platform)

### 3.1 Endpoint yang Perlu Di-patch

**Status:**
- ✅ Sudah siap: `simpanLaporanUp3_`, `simpanLaporanUiw_`, `simpanApprovalP0_`
- ⚠️ Perlu patch: 14 fungsi dengan hard-code `'MOBILE'`

**Daftar Fungsi yang Perlu Diubah:**

#### File: `backend/src/modules/70_JadwalPadam.js`
```javascript
// SEBELUM (line 280-300)
function simpanJadwalPadam_(sesi, data) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_SIMPAN', kode, detail, 'MOBILE', headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  // ...
}

// SESUDAH
function simpanJadwalPadam_(sesi, data, platform) {
  // ...
  auditLog_(sesi, 'JADWAL_PADAM_SIMPAN', kode, detail, platform, headerTabel_('AUTH_SHEET_ID', 'log_Audit'));
  // ...
}
```

**4 fungsi di `70_JadwalPadam.js`:**
1. `simpanJadwalPadam_` (line 280-300)
2. `ubahJadwalPadam_` (line 310-327)
3. `ubahStatusJadwalPadam_` (line 329-350)
4. `hapusJadwalPadam_` (line 350-365)

#### File: `backend/src/modules/40_BA_Gardu.js`
**2 fungsi:**
1. `simpanBaGardu_` (line 435)
2. Function dengan nomor BA duplikat (line 568)

#### File: `backend/src/modules/41_BA_Pdf.js`
**2 fungsi:**
1. `buatPdfBaGardu_` error handler (line 225)
2. `buatPdfBaGardu_` success (line 251)

#### File: `backend/src/modules/43_BA_Ubah.js`
**2 fungsi:**
1. `ubahBaGardu_` (line 237)
2. Function update lainnya (line 354)

#### File: `backend/src/modules/45_BA_Ttd.js`
**3 fungsi:**
1. `uploadTtdBaGardu_` (line 166)
2. `kirimEamBaGardu_` (line 291)
3. `updateMasterGarduBa_` (line 359)

#### File: `backend/src/modules/34_Gardu_Riwayat.js`
**1 fungsi:**
1. `updateUkurMasterGardu_` (line 240)

### 3.2 Pattern untuk Patch

**Standar pattern yang konsisten:**

```javascript
// Fungsi endpoint harus menerima parameter platform dari router
function namaEndpoint_(sesi, data, platform) {
  // ... business logic ...
  
  return denganLock_(function() {
    var tLog = headerTabel_('AUTH_SHEET_ID', 'log_Audit');
    // ... operasi ...
    
    // Gunakan parameter platform, bukan hard-code
    auditLog_(sesi, 'AKSI', target, detail, platform, tLog);
    
    return hasil;
  });
}
```

### 3.3 Optimization - Lazy Loading untuk Endpoint Berat

**Problem:** Beberapa endpoint membaca multiple sheets sekaligus, menyebabkan response lambat.

**Solution:** Implementasi strategi lazy loading untuk data yang tidak selalu dibutuhkan.

#### 3.3.1 Laporan UP3/UIW - Split Endpoint

**Saat ini:** `getLaporanUp3` membaca semua data sekaligus (ROW, Hartek, Inspeksi, C4A)

**Usulan:** Split menjadi 2 calls:

```javascript
// Call 1: Metadata ringan (struktur laporan + ringkasan)
getLaporanUp3Meta({ tanggal })
// Response: { tanggal, bisaUbah, revision, statusTim[], row: { ringkasan }, hartek: { ringkasan } }
// Berat: ~500ms, 5KB

// Call 2: Data lengkap untuk edit (hanya saat tombol Edit diklik)
getLaporanUp3Data({ tanggal, revision })
// Response: { c4a[], row: { perPenyulang, komulatif }, hartek: { perPenyulang, komulatif } }
// Berat: ~800ms, 20KB
```

**Benefit:**
- Halaman daftar laporan load 60% lebih cepat (hanya meta)
- Data detail di-fetch on-demand
- Revisi check dilakukan 2 kali (mencegah stale edit)

#### 3.3.2 Approval P0 - Pagination + Lazy Photos

**Saat ini:** `getApprovalP0` return semua P0 dalam 1 tanggal (bisa 50+ items)

**Usulan:** Server-side pagination

```javascript
getApprovalP0({
  tanggal: '2026-10-26',
  status: 'Menunggu',  // optional filter
  limit: 20,           // NEW: items per page
  offset: 0            // NEW: pagination offset
})

// Response:
{
  tanggal: '2026-10-26',
  total: 45,
  limit: 20,
  offset: 0,
  jumlah: { Menunggu: 12, Approved: 30, Rejected: 3 },
  list: [...20 items...],
  hasMore: true
}
```

**Foto Approval:** Load thumbnail dulu, full image on-demand

```javascript
getFotoApprovalP0({
  p0Id: '...',
  jenis: 'P0',
  slot: 'SEBELUM',
  ukuran: 'KECIL'    // Default KECIL (thumbnail), PENUH on click
})
```

#### 3.3.3 BA Gardu - Incremental Fetch

**Saat ini:** `getDaftarBaGardu` load semua BA dalam rentang

**Usulan:** Load summary dulu, detail on-expand

```javascript
// Call 1: List BA (summary only)
getDaftarBaGardu({
  dari: '2026-10-01',
  sampai: '2026-10-31',
  jenis: 'SEMUA',
  fields: 'summary'  // NEW: 'summary' | 'full'
})
// Response: [{ idBa, nomor, jenis, noGardu, tanggal, status }] (10KB)

// Call 2: Detail BA (when row expanded)
getBaGardu({ idBa: '...' })
// Response: { full BA object with all fields } (50KB)
```

#### 3.3.4 Jadwal Padam - Calendar Optimization

**Saat ini:** `getJadwalPadam` fetch all jadwal in range, bisa ratusan

**Usulan:** Month-based chunking dengan cache

```javascript
getJadwalPadamBulan({
  bulan: '2026-10',  // yyyy-MM
  penyulang: '',     // optional filter
  status: ''         // optional filter
})

// Response di-cache 5 menit di browser
// Server response: 200ms untuk 1 bulan (~30-50 jadwal)
```

---

## 4. Frontend Architecture

### 4.1 Project Structure

```
web/
├── public/
│   ├── config.js              # API URL (staging/production)
│   ├── config.example.js      # Template
│   └── .htaccess              # SPA routing
├── src/
│   ├── main.jsx               # Entry point
│   ├── App.jsx                # Root component (routing)
│   ├── config.js              # Config loader
│   ├── api.js                 # API client (POST to Apps Script)
│   ├── sesi.js                # Session management
│   ├── perangkat.js           # Device ID generator
│   ├── pesan.js               # Error messages (KodeError)
│   │
│   ├── styles/
│   │   ├── tokens.css         # Design tokens (Linear palette)
│   │   └── umum.css           # Global styles
│   │
│   ├── components/
│   │   ├── SisiLoader.jsx     # Loading spinner
│   │   ├── MotifJaringan.jsx  # Decorative pattern
│   │   ├── Ikon.jsx           # Icon component
│   │   ├── Sidebar.jsx        # NEW: Collapsible sidebar
│   │   ├── Header.jsx         # NEW: Top bar (user info, logout)
│   │   ├── Table.jsx          # NEW: Reusable table component
│   │   ├── Modal.jsx          # NEW: Modal dialog
│   │   ├── Form.jsx           # NEW: Form components
│   │   └── Toast.jsx          # NEW: Toast notifications
│   │
│   ├── pages/
│   │   ├── Login.jsx          # ✅ Existing
│   │   ├── login.css
│   │   ├── Dashboard.jsx      # ✅ Existing (empty shell)
│   │   ├── dashboard.css
│   │   │
│   │   ├── LaporanUp3.jsx     # NEW: Laporan UP3
│   │   ├── LaporanUiw.jsx     # NEW: Laporan UIW
│   │   ├── BeritaAcara.jsx    # NEW: BA Gardu list
│   │   ├── FormBa.jsx         # NEW: BA form (create/edit)
│   │   ├── PengukuranGardu.jsx # NEW: Riwayat & update gardu
│   │   ├── JadwalPadam.jsx    # NEW: Jadwal padam calendar + list
│   │   ├── ApprovalP0.jsx     # NEW: Approval P0 list + detail
│   │   └── ...
│   │
│   └── hooks/
│       ├── useApi.js          # NEW: API call hook dengan loading state
│       ├── usePagination.js   # NEW: Pagination logic
│       ├── useTable.js        # NEW: Table state (sort, filter)
│       └── useDebounce.js     # NEW: Debounce hook
│
├── test/
│   └── inti.test.js           # ✅ Existing (6 tests passing)
│
├── dist/                      # Build output (generated)
├── package.json
├── vite.config.js
└── README.md
```

### 4.2 Routing Structure

```jsx
// App.jsx
import { useState, useEffect } from 'react';
import { muatSesi, simpanSesi, hapusSesi } from './sesi.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const [sesi, setSesi] = useState(() => muatSesi());
  const [halaman, setHalaman] = useState('dashboard'); // routing state

  useEffect(() => {
    if (sesi) simpanSesi(sesi);
    else hapusSesi();
  }, [sesi]);

  if (!sesi) {
    return <Login onLogin={setSesi} />;
  }

  return (
    <Dashboard
      sesi={sesi}
      halaman={halaman}
      onNavigate={setHalaman}
      onLogout={() => setSesi(null)}
    />
  );
}
```

### 4.3 Sidebar Component

**Design mengikuti mobile bottom bar, tapi vertikal di kiri:**

```
┌────────────────────────────────────────────────────┐
│ [☰] SiSi ULP TOBOALI              Admin · [Keluar]│ ← Header (60px)
├──────────┬─────────────────────────────────────────┤
│          │                                         │
│ Monito   │                                         │
│ ring     │        Main Content Area                │
│          │                                         │
│ 📊 Lap   │                                         │
│ UP3      │                                         │
│          │                                         │
│ 📊 Lap   │                                         │
│ UIW      │                                         │
│          │                                         │
│ Pekerjaan│                                         │
│ Teknik   │                                         │
│          │                                         │
│ ⚡ Jadwal│                                         │
│ Padam    │                                         │
│          │                                         │
│ ✓ Appro  │                                         │
│ val P0   │                                         │
│          │                                         │
│ Jaringan │                                         │
│ & Gardu  │                                         │
│          │                                         │
│ 📄 BA    │                                         │
│          │                                         │
│ 📏 Ukur  │                                         │
│ Gardu    │                                         │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
  240px      Flex 1 (min 800px)
```

**Collapsed state (60px):**

```
┌────────────────────────────────────────────────────┐
│ [☰]  SiSi ULP TOBOALI              Admin · [Keluar]│
├───┬────────────────────────────────────────────────┤
│   │                                                │
│ 📊│                                                │
│   │                                                │
│ 📊│         Main Content (wider)                   │
│   │                                                │
│ ⚡│                                                │
│   │                                                │
│ ✓ │                                                │
│   │                                                │
│ 📄│                                                │
│   │                                                │
│ 📏│                                                │
│   │                                                │
└───┴────────────────────────────────────────────────┘
 60px
```

**Implementation:**

```jsx
// components/Sidebar.jsx
import { useState } from 'react';
import './sidebar.css';

const MENU_ITEMS = [
  { grup: 'Monitoring', items: [
    { kode: 'OPS_LAP_UP3', label: 'Laporan UP3', ikon: '📊', halaman: 'laporan-up3' },
    { kode: 'OPS_LAP_UIW', label: 'Laporan UIW', ikon: '📊', halaman: 'laporan-uiw' },
  ]},
  { grup: 'Pekerjaan Teknik', items: [
    { kode: 'OPS_JADWAL_PADAM', label: 'Jadwal Padam', ikon: '⚡', halaman: 'jadwal-padam' },
    { kode: 'OPS_VERIFIKASI_P0', label: 'Approval P0', ikon: '✓', halaman: 'approval-p0' },
  ]},
  { grup: 'Jaringan & Gardu', items: [
    { kode: 'OPS_BA_GARDU', label: 'Berita Acara', ikon: '📄', halaman: 'berita-acara' },
    { kode: 'OPS_PENGUKURAN_GARDU', label: 'Ukur Gardu', ikon: '📏', halaman: 'ukur-gardu' },
  ]},
];

export default function Sidebar({ sesi, halamanAktif, onNavigate, collapsed, onToggle }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button className="sidebar-toggle" onClick={onToggle} aria-label="Toggle sidebar">
        <span className="hamburger-icon">☰</span>
      </button>

      <nav className="sidebar-nav">
        {MENU_ITEMS.map(grup => (
          <div key={grup.grup} className="sidebar-group">
            {!collapsed && <div className="sidebar-group-title">{grup.grup}</div>}
            {grup.items.map(item => {
              // Filter berdasarkan akses menu dari sesi
              const aksi = sesi.menu.find(m => m.kode === item.kode)?.aksi;
              if (!aksi) return null;

              const aktif = halamanAktif === item.halaman;
              return (
                <button
                  key={item.kode}
                  className={`sidebar-item ${aktif ? 'active' : ''}`}
                  onClick={() => onNavigate(item.halaman)}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-item-icon">{item.ikon}</span>
                  {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

### 4.4 API Client Enhancement

**Current:** `web/src/api.js` (basic POST wrapper)

**Enhancement:** Add caching, retry, and request deduplication

```javascript
// api.js (enhanced)
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map();
const pendingRequests = new Map();

export async function panggil(action, data = {}) {
  const cacheKey = action + ':' + JSON.stringify(data);

  // Check cache for GET-like operations
  if (shouldCache(action)) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  // Deduplicate identical pending requests
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const sesi = muatSesi();
  const request = fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      token: sesi?.token || '',
      data,
      platform: 'WEB'  // ← Platform identifier
    })
  })
  .then(async res => {
    const json = await res.json();
    if (!json.ok) {
      const err = new Error(json.kode || 'KESALAHAN_SERVER');
      err.kode = json.kode;
      err.kolom = json.kolom;
      throw err;
    }
    return json.data;
  })
  .finally(() => {
    pendingRequests.delete(cacheKey);
  });

  pendingRequests.set(cacheKey, request);

  const result = await request;

  // Cache result
  if (shouldCache(action)) {
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
}

function shouldCache(action) {
  // Cache GET-like operations
  return action.startsWith('get') && !action.includes('Foto');
}

export function clearCache(pattern) {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.startsWith(pattern)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
```

---

## 5. Feature Implementation Details

### 5.1 Laporan UP3 / UIW

**User Flow:**
1. Pilih menu "Laporan UP3" atau "Laporan UIW" dari sidebar
2. Lihat laporan hari ini (default) atau pilih tanggal lain
3. Tab view: "Preview WA" | "Edit C4A" | "Status Tim"
4. Edit C4A: table editable dengan inline validation
5. Simpan → konfirmasi → refresh data

**UI Layout:**

```
┌────────────────────────────────────────────────────────┐
│ Laporan UP3                                    [Refresh]│
├────────────────────────────────────────────────────────┤
│  📅 [<] 26 Oktober 2026 [>]       [Hari Ini]          │
│                                                        │
│  ┌─ Tab: [Preview WA] Edit C4A  Status Tim ──────┐   │
│  │                                                 │   │
│  │ *Laporan Harian Keandalan Distribusi*         │   │
│  │ Hari Kamis, 26 Oktober 2026                   │   │
│  │                                                 │   │
│  │ ULP TOBOALI                                    │   │
│  │                                                 │   │
│  │ *A. GANGGUAN PENYULANG* ⚡                     │   │
│  │ - PMT : - Kali                                 │   │
│  │ - Section : - kali                             │   │
│  │ ...                                            │   │
│  │                                                 │   │
│  │ [📋 Salin ke Clipboard]  [📱 Kirim WA]        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                        │
│  ┌─ Tab: Preview WA [Edit C4A] Status Tim ──────┐   │
│  │ E. C4A (Care for Asset)                        │   │
│  │                                                 │   │
│  │ [+ Tambah Penyulang]                           │   │
│  │                                                 │   │
│  │ ┌─────────────────────────────────────────────┐│   │
│  │ │ Penyulang  │ Realisasi │ Temuan │ TL │ Eks ││   │
│  │ ├─────────────────────────────────────────────┤│   │
│  │ │ PLN 01     │ [12,5] km │ [...]  │[..]│[..] ││   │
│  │ │ PLN 02     │ [8,3] km  │ [...]  │[..]│[..] ││   │
│  │ └─────────────────────────────────────────────┘│   │
│  │                                                 │   │
│  │ [Batal]                             [💾 Simpan]│   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

**Implementation:**

```jsx
// pages/LaporanUp3.jsx
import { useState, useEffect } from 'react';
import { panggil } from '../api.js';
import Table from '../components/Table.jsx';
import Modal from '../components/Modal.jsx';

export default function LaporanUp3({ sesi }) {
  const [tanggal, setTanggal] = useState(hariIni());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('preview'); // preview | edit | status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    muatLaporan();
  }, [tanggal]);

  async function muatLaporan() {
    setLoading(true);
    setError(null);
    try {
      const hasil = await panggil('getLaporanUp3', { tanggal });
      setData(hasil);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function simpan(c4a) {
    try {
      const hasil = await panggil('simpanLaporanUp3', {
        tanggal,
        revision: data.revision,
        c4a
      });
      setData(hasil);
      setTab('preview');
      tampilkanToast('Laporan berhasil disimpan');
    } catch (err) {
      if (err.kode === 'KONFLIK_REVISION') {
        // Reload data terbaru
        await muatLaporan();
        tampilkanToast('Data berubah. Silakan edit ulang.', 'warning');
      } else {
        tampilkanToast(err.message, 'error');
      }
    }
  }

  if (loading) return <div className="loader">Memuat...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  return (
    <div className="laporan-up3">
      <header className="laporan-header">
        <h1>Laporan UP3</h1>
        <button onClick={muatLaporan}>🔄 Refresh</button>
      </header>

      <div className="tanggal-picker">
        <button onClick={() => setTanggal(tambahHari(tanggal, -1))}>◀</button>
        <span>{formatTanggal(tanggal)}</span>
        <button onClick={() => setTanggal(tambahHari(tanggal, 1))}>▶</button>
        <button onClick={() => setTanggal(hariIni())}>Hari Ini</button>
      </div>

      <div className="tabs">
        <button
          className={tab === 'preview' ? 'active' : ''}
          onClick={() => setTab('preview')}
        >
          Preview WA
        </button>
        <button
          className={tab === 'edit' ? 'active' : ''}
          onClick={() => setTab('edit')}
          disabled={!data.bisaUbah}
        >
          Edit C4A
        </button>
        <button
          className={tab === 'status' ? 'active' : ''}
          onClick={() => setTab('status')}
        >
          Status Tim
        </button>
      </div>

      <div className="tab-content">
        {tab === 'preview' && <PreviewWa teks={data.waText} />}
        {tab === 'edit' && <EditC4a c4a={data.c4a} onSimpan={simpan} />}
        {tab === 'status' && <StatusTim statusTim={data.statusTim} />}
      </div>
    </div>
  );
}

function EditC4a({ c4a, onSimpan }) {
  const [rows, setRows] = useState(c4a);

  const columns = [
    { key: 'penyulang', label: 'Penyulang', type: 'text', width: '200px' },
    { key: 'realisasiKms', label: 'Realisasi (kmS)', type: 'number', width: '120px' },
    { key: 'temuan', label: 'Temuan', type: 'textarea', width: '200px' },
    { key: 'tindakLanjut', label: 'Tindak Lanjut', type: 'textarea', width: '200px' },
    { key: 'eksekusi', label: 'Eksekusi', type: 'text', width: '150px' },
  ];

  function tambahBaris() {
    setRows([...rows, {
      id: generateUuid(),
      penyulang: '',
      realisasiKms: 0,
      temuan: '',
      tindakLanjut: '',
      eksekusi: '',
      keterangan: ''
    }]);
  }

  function hapusBaris(id) {
    setRows(rows.filter(r => r.id !== id));
  }

  function ubahBaris(id, field, value) {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  return (
    <div className="edit-c4a">
      <button className="btn-tambah" onClick={tambahBaris}>
        + Tambah Penyulang
      </button>

      <Table
        columns={columns}
        data={rows}
        editable
        onChange={ubahBaris}
        onDelete={hapusBaris}
      />

      <div className="form-actions">
        <button className="btn-secondary">Batal</button>
        <button className="btn-primary" onClick={() => onSimpan(rows)}>
          💾 Simpan
        </button>
      </div>
    </div>
  );
}
```

### 5.2 Jadwal Padam

**User Flow:**
1. Pilih menu "Jadwal Padam"
2. View: Calendar (default) | List
3. Calendar: klik tanggal → lihat jadwal hari itu
4. List: filter by rentang tanggal, penyulang, status
5. Actions: Tambah, Edit, Ubah Status, Hapus, Export WA

**UI Layout - Calendar View:**

```
┌─────────────────────────────────────────────────────────┐
│ Jadwal Padam                 [+ Tambah]  [📋 Format WA] │
├─────────────────────────────────────────────────────────┤
│ View: [Calendar] List                                   │
│                                                         │
│  [<] Oktober 2026 [>]                                  │
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │  S   M   T   W   T   F   S                         ││
│  │      1   2   3   4   5   6                         ││
│  │  7   8   9  10  11  12  13                         ││
│  │ 14  15  16  17  18  19  20                         ││
│  │ 21  22  23  24 [25] 26  27     ← 25 punya jadwal  ││
│  │ 28  29  30  31                                      ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
│  Jadwal Tanggal 25 Oktober 2026: (3 jadwal)           │
│  ┌────────────────────────────────────────────────────┐│
│  │ 08:00-12:00 │ PLN 01 - Sec A │ Padam │ [Edit][X] ││
│  │ 13:00-15:00 │ PLN 02 - Sec B │ Padam │ [Edit][X] ││
│  │ 14:00-16:00 │ PLN 03 - Sec C │ Tanpa │ [Edit][X] ││
│  └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**UI Layout - List View:**

```
┌─────────────────────────────────────────────────────────┐
│ Jadwal Padam                 [+ Tambah]  [📋 Format WA] │
├─────────────────────────────────────────────────────────┤
│ View: Calendar [List]                                   │
│                                                         │
│ Filter:                                                 │
│ Dari: [01/10/2026]  Sampai: [31/10/2026]  [Terapkan]  │
│ Penyulang: [Semua ▼]  Status: [Semua ▼]               │
│                                                         │
│ Ringkasan: 45 total (12 Terjadwal, 30 Terealisasi, 3  │
│            Batal) · 42 Padam · 1.250 Pelanggan         │
│                                                         │
│ ┌──────────────────────────────────────────────────────┐│
│ │Tgl │Peny│Section│Jam   │Durasi│Pel│Status│Actions ││
│ ├──────────────────────────────────────────────────────┤│
│ │01 │PLN│Sec A  │08-12 │240' │250│✓Terreal│[👁][✏]││
│ │02 │PLN│Sec B  │13-15 │120' │180│⏳Terjad│[✏][🗑]││
│ │...│   │       │      │     │   │        │        ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ Halaman: [1] 2 3 ... 10 (45 jadwal, 10/halaman)       │
└─────────────────────────────────────────────────────────┘
```

**Form Tambah/Edit Jadwal:**

```
┌─────────────────────────────────────────────────────────┐
│ [X] Tambah Jadwal Padam                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Penyulang: [PLN 01 ▼]                                  │
│ Section:   [Section A ▼]  ← Auto-populate from master │
│                                                         │
│ Jenis Pekerjaan:                                       │
│ [Pemeliharaan Penyulang_______________________________]│
│                                                         │
│ Tanggal: [26/10/2026 📅]                               │
│ Jam Padam:  [08:00]  Jam Nyala: [12:00]               │
│ Durasi: 4 jam (auto-calculate)                         │
│                                                         │
│ Status Pekerjaan: ○ Padam  ○ Tanpa Padam              │
│                                                         │
│ Lokasi Pekerjaan:                                      │
│ [_____________________________________________________]│
│ [_____________________________________________________]│
│                                                         │
│ ── Data dari Master (read-only) ──                     │
│ Jumlah Gardu:     25 Unit                              │
│ Jumlah Pelanggan: 350 Pelanggan                        │
│ Daerah Padam:     Kec. Toboali, Kel. Tanjung          │
│ Beban:            125,50 A                             │
│ ENS:              Rp 1.250.000                         │
│                                                         │
│            [Batal]                          [💾 Simpan]│
└─────────────────────────────────────────────────────────┘
```

**Implementation:**

```jsx
// pages/JadwalPadam.jsx
import { useState, useEffect } from 'react';
import { panggil, clearCache } from '../api.js';
import Calendar from '../components/Calendar.jsx';
import Modal from '../components/Modal.jsx';

export default function JadwalPadam({ sesi }) {
  const [view, setView] = useState('calendar'); // calendar | list
  const [bulan, setBulan] = useState(bulanIni()); // yyyy-MM
  const [jadwal, setJadwal] = useState([]);
  const [master, setMaster] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  useEffect(() => {
    muatMaster();
  }, []);

  useEffect(() => {
    if (view === 'calendar') {
      muatJadwalBulan();
    }
  }, [bulan, view]);

  async function muatMaster() {
    const m = await panggil('getMasterJadwalPadam');
    setMaster(m);
  }

  async function muatJadwalBulan() {
    const [tahun, bln] = bulan.split('-');
    const akhir = new Date(+tahun, +bln, 0).getDate();
    const dari = `${bulan}-01`;
    const sampai = `${bulan}-${String(akhir).padStart(2, '0')}`;

    const data = await panggil('getJadwalPadam', { dari, sampai });
    setJadwal(data.jadwal);
  }

  async function simpan(data) {
    const action = editItem ? 'ubahJadwalPadam' : 'simpanJadwalPadam';
    const payload = editItem
      ? { ...data, jadwalId: editItem.jadwalId, revision: editItem.revision }
      : data;

    await panggil(action, payload);
    clearCache('getJadwalPadam');
    await muatJadwalBulan();
    setShowForm(false);
    setEditItem(null);
  }

  async function hapus(item) {
    if (!confirm(`Hapus jadwal ${item.kode}?`)) return;
    await panggil('hapusJadwalPadam', {
      jadwalId: item.jadwalId,
      revision: item.revision
    });
    clearCache('getJadwalPadam');
    await muatJadwalBulan();
  }

  return (
    <div className="jadwal-padam">
      <header>
        <h1>Jadwal Padam</h1>
        <div>
          <button onClick={() => setShowForm(true)}>+ Tambah</button>
          <button onClick={exportWa}>📋 Format WA</button>
        </div>
      </header>

      <div className="view-toggle">
        <button
          className={view === 'calendar' ? 'active' : ''}
          onClick={() => setView('calendar')}
        >
          Calendar
        </button>
        <button
          className={view === 'list' ? 'active' : ''}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>

      {view === 'calendar' && (
        <CalendarView
          bulan={bulan}
          onBulanChange={setBulan}
          jadwal={jadwal}
          onEdit={item => { setEditItem(item); setShowForm(true); }}
          onDelete={hapus}
        />
      )}

      {view === 'list' && (
        <ListView
          jadwal={jadwal}
          onEdit={item => { setEditItem(item); setShowForm(true); }}
          onDelete={hapus}
        />
      )}

      {showForm && (
        <Modal onClose={() => { setShowForm(false); setEditItem(null); }}>
          <FormJadwal
            master={master}
            initial={editItem}
            onSimpan={simpan}
            onBatal={() => { setShowForm(false); setEditItem(null); }}
          />
        </Modal>
      )}
    </div>
  );
}
```

### 5.3 Approval P0

**User Flow:**
1. Pilih menu "Approval P0"
2. Pilih tanggal (default: hari ini)
3. Tab: Menunggu | Approved | Rejected
4. Klik item → Detail modal (foto + data lengkap)
5. Action: Setujui / Tolak (dengan alasan)

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Approval P0                                     [Refresh]│
├─────────────────────────────────────────────────────────┤
│  📅 [<] 26 Oktober 2026 [>]       [Hari Ini]           │
│                                                         │
│  Status: [Menunggu (12)] Approved (30)  Rejected (3)   │
│                                                         │
│ ┌───────────────────────────────────────────────────────┐│
│ │ [📸] P0-T01-261026-001 │ 08:15 │ Rabas │ 45' │ [👁] ││
│ │      Penyulang PLN 01 - Section A                    ││
│ │      Tim 01 · Petugas: Budi S                        ││
│ ├───────────────────────────────────────────────────────┤│
│ │ [📸] P0-T02-261026-002 │ 09:30 │ Tebang │ 60' │ [👁]││
│ │      Penyulang PLN 02 - Section B                    ││
│ │      Tim 02 · Petugas: Agus P                        ││
│ └───────────────────────────────────────────────────────┘│
│                                                         │
│ Halaman: [1] 2 (12 P0, 20/halaman)                     │
└─────────────────────────────────────────────────────────┘
```

**Modal Detail P0:**

```
┌─────────────────────────────────────────────────────────┐
│ [X] Detail P0 - P0-T01-261026-001                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌──────────┬──────────┬──────────┐                     │
│ │ SEBELUM  │ PEKERJAAN│ SESUDAH  │ ← Tab foto          │
│ ├──────────┴──────────┴──────────┤                     │
│ │  [        Foto preview        ] │                     │
│ │  [   Click untuk perbesar     ] │                     │
│ └─────────────────────────────────┘                     │
│                                                         │
│ Jenis Pekerjaan:  Rabas                                │
│ Bobot:            10 (dari master)                     │
│ Durasi:           45 menit                             │
│ Point:            450 (belum dihitung)                 │
│                                                         │
│ Lokasi:           Penyulang PLN 01 - Section A         │
│ Koordinat Awal:   -2.5123, 107.6234                    │
│ Koordinat Akhir:  -2.5145, 107.6256                    │
│                                                         │
│ Waktu Dibuat:     26 Okt 2026 08:15 WIB               │
│ Waktu Pekerjaan:  26 Okt 2026 08:30-09:15             │
│                                                         │
│ Tim:              TIM ROW 01                           │
│ Petugas:          Budi Santoso                         │
│                                                         │
│ ┌─ Lampiran Pengecekan ────────────────────────────┐   │
│ │ □ Switching: 1 pengecekan (lihat detail)         │   │
│ │ □ Gardu: 2 pengukuran (lihat detail)             │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ Keputusan:                                             │
│ ○ Setujui  ○ Tolak                                     │
│                                                         │
│ Alasan (wajib jika Tolak):                            │
│ [_____________________________________________________]│
│ [_____________________________________________________]│
│                                                         │
│            [Batal]                        [💾 Putuskan]│
└─────────────────────────────────────────────────────────┘
```

### 5.4 Berita Acara Gardu

**User Flow:**
1. Pilih menu "Berita Acara"
2. View: Daftar BA (filter by jenis, status, rentang tanggal)
3. Actions: Tambah BA, Edit, Upload TTD, Buat PDF, Kirim EAM
4. Form BA: Multi-step wizard (Data Umum → Peralatan → Review)

**UI - Daftar BA:**

```
┌─────────────────────────────────────────────────────────┐
│ Berita Acara Gardu                          [+ Tambah]  │
├─────────────────────────────────────────────────────────┤
│ Filter:                                                 │
│ Dari: [01/10/2026]  Sampai: [31/10/2026]              │
│ Jenis: [Semua ▼]  Status: [Semua ▼]  [Terapkan]      │
│                                                         │
│ ┌──────────────────────────────────────────────────────┐│
│ │BA  │Jenis     │No Gardu│Tgl  │Status│PDF│Actions  ││
│ ├──────────────────────────────────────────────────────┤│
│ │001 │Pengopera │G-001   │01/10│✓TTD  │📄│[👁][✏]  ││
│ │002 │Pengganti │G-002   │03/10│Draft │  │[✏][🗑]  ││
│ │...│          │        │     │      │  │          ││
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 5.5 Pengukuran Gardu

**User Flow:**
1. Pilih menu "Pengukuran Gardu"
2. Cari gardu (by nomor, penyulang, section)
3. Lihat riwayat pengukuran (3 sumber: Yandal, Inspeksi, Master)
4. Pilih pengukuran → Update ke Master Gardu

**UI Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Pengukuran Gardu                                        │
├─────────────────────────────────────────────────────────┤
│ Cari Gardu:                                             │
│ [No Gardu / Penyulang / Section_______________] [🔍]    │
│                                                         │
│ ┌───────────────────────────────────────────────────────┐│
│ │ Hasil Pencarian: 5 gardu                             ││
│ ├───────────────────────────────────────────────────────┤│
│ │ G-001 │ PLN 01 │ Section A │ 315 kVA │ [Lihat]     ││
│ │ G-002 │ PLN 01 │ Section B │ 200 kVA │ [Lihat]     ││
│ └───────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘

Detail Gardu G-001:
┌─────────────────────────────────────────────────────────┐
│ Master Gardu - Pengukuran Terbaru:                     │
│ ┌─ WBP ────────────────────────────────────────────┐   │
│ │ Tanggal: 20 Okt 2026  │  Sumber: Yandal          │   │
│ │ Beban: 245 kVA (78%)  │  Kategori: NORMAL        │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌─ LWBP ───────────────────────────────────────────┐   │
│ │ Tanggal: 21 Okt 2026  │  Sumber: Inspeksi Gardu  │   │
│ │ Beban: 180 kVA (57%)  │  Kategori: NORMAL        │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ Riwayat Pengukuran: (10 pengukuran)                    │
│ ┌──────────────────────────────────────────────────────┐│
│ │Tgl  │Waktu│Sumber   │kVA│%  │Kategori│Update      ││
│ ├──────────────────────────────────────────────────────┤│
│ │25/10│WBP  │Yandal   │250│79 │NORMAL  │[📤 Update] ││
│ │24/10│LWBP │InspekGar│185│59 │NORMAL  │[📤 Update] ││
│ │...  │     │         │   │   │        │            ││
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Plan

### 6.1 Phase 1 - Backend Patch (Week 1)

**Sprint 1.1: Platform Parameter Patch (2 days)**
- [ ] Patch 14 fungsi hard-code `'MOBILE'` → parameter `platform`
- [ ] Test semua endpoint dengan `platform: 'WEB'`
- [ ] Deploy ke staging backend
- [ ] Regression test mobile app (pastikan tidak broken)

**Sprint 1.2: Endpoint Optimization (3 days)**
- [ ] Implement lazy loading untuk Laporan UP3/UIW
  - [ ] Split `getLaporanUp3` → `getLaporanUp3Meta` + `getLaporanUp3Data`
  - [ ] Split `getLaporanUiw` → `getLaporanUiwMeta` + `getLaporanUiwData`
- [ ] Add pagination ke `getApprovalP0`
- [ ] Add summary mode ke `getDaftarBaGardu`
- [ ] Test performance improvement (target: 60% faster load)

### 6.2 Phase 2 - Frontend Core (Week 2-3)

**Sprint 2.1: Layout & Navigation (3 days)**
- [ ] Implement Sidebar component dengan collapse
- [ ] Implement Header component (user info, logout)
- [ ] Setup routing state management
- [ ] Responsive layout (min 1024px)

**Sprint 2.2: Shared Components (4 days)**
- [ ] Table component (editable, sortable, pagination)
- [ ] Modal/Dialog component
- [ ] Form components (input, select, textarea, datepicker)
- [ ] Toast notification system
- [ ] Loading states & error boundaries

**Sprint 2.3: API Client Enhancement (2 days)**
- [ ] Request caching dengan TTL
- [ ] Request deduplication
- [ ] Retry logic untuk network errors
- [ ] Progress indicator untuk long operations

### 6.3 Phase 3 - Feature Implementation (Week 4-6)

**Sprint 3.1: Laporan UP3/UIW (5 days)**
- [ ] Page layout dengan tab (Preview WA, Edit C4A, Status Tim)
- [ ] Editable table untuk C4A
- [ ] WA preview dengan copy to clipboard
- [ ] Date navigation
- [ ] Save with revision check & conflict handling

**Sprint 3.2: Jadwal Padam (5 days)**
- [ ] Calendar view component
- [ ] List view dengan filter
- [ ] Form tambah/edit jadwal
- [ ] Master data integration (penyulang/section)
- [ ] Export format WA

**Sprint 3.3: Approval P0 (4 days)**
- [ ] List dengan tab filter (Menunggu/Approved/Rejected)
- [ ] Detail modal dengan foto (lazy load thumbnail)
- [ ] Form keputusan (Setujui/Tolak)
- [ ] Pagination

**Sprint 3.4: Berita Acara (6 days)**
- [ ] Daftar BA dengan filter
- [ ] Multi-step form wizard
- [ ] Upload foto BA
- [ ] PDF generation trigger
- [ ] TTD upload & EAM integration

**Sprint 3.5: Pengukuran Gardu (4 days)**
- [ ] Search gardu (nomor/penyulang/section)
- [ ] Riwayat pengukuran dari 3 sumber
- [ ] Update ke Master Gardu action
- [ ] Detail view dengan WBP/LWBP tabs

### 6.4 Phase 4 - Testing & Deployment (Week 7)

**Sprint 4.1: Integration Testing (3 days)**
- [ ] End-to-end test semua fitur
- [ ] Cross-browser testing (Chrome, Firefox, Edge)
- [ ] Mobile tablet testing (iPad landscape, min 768px)
- [ ] Performance testing (load time, API calls)

**Sprint 4.2: UAT & Bug Fixes (2 days)**
- [ ] User acceptance testing dengan admin
- [ ] Fix bugs dari UAT
- [ ] Final polish (UI/UX improvements)

**Sprint 4.3: Production Deployment (2 days)**
- [ ] Deploy backend ke production
- [ ] Build frontend production
- [ ] Upload ke Hostinger
- [ ] Update config.js ke production URL
- [ ] Smoke test production
- [ ] Documentation & training materials

---

## 7. Technical Specifications

### 7.1 Browser Support

**Minimum:**
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+

**Screen Resolution:**
- Minimum: 1024x768
- Optimal: 1920x1080

### 7.2 Performance Targets

**Page Load:**
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Total bundle size: < 500KB (gzipped)

**API Response:**
- Get operations: < 2s (p95)
- Save operations: < 3s (p95)
- Photo fetch: < 5s for thumbnail, < 10s for full

**User Experience:**
- No blocking operations > 5s without progress indicator
- Optimistic UI updates where possible
- Auto-save drafts every 30s (for long forms)

### 7.3 Security Considerations

**Authentication:**
- Token stored in localStorage (same as mobile)
- Token expires after 30 days idle
- Re-login required on token expiry

**Authorization:**
- Role check: Only ADMIN and ADMIN_ES can access website
- Menu filtering based on db_Akses
- Action-level permission (LIHAT vs UBAH)

**Data Validation:**
- Client-side validation for UX
- Server-side validation (primary security boundary)
- XSS prevention: React auto-escapes by default
- CSRF not applicable (stateless API, no cookies)

**Audit Trail:**
- All write operations logged with platform='WEB'
- User, timestamp, action, target tracked
- Cannot be disabled

### 7.4 Error Handling Strategy

**Network Errors:**
- Retry 3x with exponential backoff
- Show user-friendly message after final failure
- Cache last successful data for offline view (read-only)

**Validation Errors:**
- Field-level error messages (using `kolom` from backend)
- Scroll to first error field
- Prevent submission until fixed

**Conflict Errors:**
- `KONFLIK_REVISION`: Reload fresh data, show diff, let user re-edit
- `DATA_BERUBAH`: Similar handling with user notification

**Session Errors:**
- `SESI_TIDAK_VALID` / `SESI_KEDALUWARSA`: Auto-logout, redirect to login
- `AKSES_DITOLAK`: Show error, log out if role changed

---

## 8. Migration & Rollout Strategy

### 8.1 Backend Deployment

**Staging:**
1. Deploy patch ke staging backend (@105)
2. Test dengan website staging (sisi-web-staging)
3. Regression test mobile staging app
4. QA sign-off

**Production:**
1. Schedule maintenance window (low-traffic time)
2. Deploy backend production
3. Monitor logs for errors (30 min)
4. Rollback plan: revert to previous version if critical errors

### 8.2 Frontend Deployment

**Staging:**
- URL: `https://yourdomain.com/sisi-web-staging/`
- Zip staging WAJIB dibuat dengan `npm run zip:staging` (base `/sisi-web-staging/`); lihat web/README.md
- Auto-deploy on git push to `staging` branch
- Test with staging backend

**Production:**
- URL: `https://yourdomain.com/sisi-web/` (or main domain)
- Manual deploy after UAT approval
- Smoke test checklist:
  - [ ] Login works
  - [ ] Menu tampil sesuai role
  - [ ] Minimal 1 fitur per group works
  - [ ] Logout works

### 8.3 User Training

**Materials:**
- [ ] User guide (PDF dengan screenshots)
- [ ] Video tutorial per fitur (5-10 min each)
- [ ] Quick reference card (printable)

**Training Sessions:**
- Week 1: Admin training (hands-on, 2 hours)
- Week 2: Admin ES training (hands-on, 2 hours)
- Week 3: Q&A session & feedback collection

---

## 9. Maintenance & Monitoring

### 9.1 Monitoring Metrics

**Backend:**
- API error rate (target: < 1%)
- p95 response time per endpoint
- Platform breakdown (WEB vs MOBILE usage)
- Audit log analysis (most used features)

**Frontend:**
- Google Analytics: Page views, user sessions
- Error tracking: Sentry or similar
- Performance: Core Web Vitals
- Browser/device breakdown

### 9.2 Support Model

**L1 Support:**
- User guide & FAQ
- Email: support@sisi.ulp.id
- Response time: 24h (business days)

**L2 Support:**
- Technical issues escalation
- Bug reports & feature requests
- Response time: 48h

**L3 Support:**
- Critical production issues
- Backend/infrastructure problems
- Response time: 4h

---

## 10. Future Enhancements (Post-Launch)

### Phase 2 Features (Q1 2027)
- [ ] Laporan per Tim (monitoring semua tim)
- [ ] Peta Temuan (geographic visualization)
- [ ] Rekap Gangguan (dashboard)
- [ ] Input Temuan Inspeksi (admin input)
- [ ] Penerusan WO (admin workflow)

### Technical Improvements
- [ ] PWA support (offline mode)
- [ ] Real-time updates (WebSocket/SSE untuk notifikasi)
- [ ] Export ke Excel untuk semua laporan
- [ ] Bulk operations (approve multiple P0, delete multiple jadwal)
- [ ] Advanced filtering & search
- [ ] Dark mode toggle

### UX Enhancements
- [ ] Keyboard shortcuts
- [ ] Breadcrumb navigation
- [ ] Recent items quick access
- [ ] Favorites/bookmarks
- [ ] Customizable dashboard

---

## 11. Conclusion

Website admin SiSi memberikan antarmuka desktop yang powerful untuk admin mengelola operasional ULP. Dengan memanfaatkan endpoint backend yang sudah mature dari mobile app, development bisa fokus ke UX yang optimal untuk layar lebar dan input keyboard.

**Key Success Factors:**
1. ✅ Reuse backend logic (konsistensi & maintainability)
2. ✅ Optimization untuk performa (lazy loading, pagination, caching)
3. ✅ Progressive implementation (5 fitur prioritas dulu, iterasi cepat)
4. ✅ Comprehensive testing (unit, integration, UAT)
5. ✅ User-centric design (mengikuti mental model mobile, tapi optimized untuk desktop)

**Timeline Summary:**
- Week 1: Backend patch & optimization
- Week 2-3: Frontend core (layout, components, API)
- Week 4-6: Feature implementation (5 prioritas)
- Week 7: Testing, UAT, deployment

**Go/No-Go Criteria untuk Production:**
- [ ] All 5 priority features working end-to-end
- [ ] Zero critical bugs in UAT
- [ ] Performance targets met (< 3s load time)
- [ ] Mobile app regression tests passing
- [ ] Admin training completed
- [ ] Rollback plan tested

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-10-26  
**Next Review:** After Phase 1 completion  
**Owner:** Tim SiSi v2  
**Approvers:** Admin ULP Toboali, Tech Lead
