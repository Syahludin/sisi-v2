/**
 * v1.0.17 (permintaan Master Guswan 22 Okt 2026): SINKRONISASI ATOMIK modul tim (Hartek, Inspeksi Jaringan, Inspeksi Gardu).
 *
 * Masalah: HP mengirim antrean satu per satu (Laporan Utama, lokasi / penyulang, pekerjaan / temuan, material, foto).
 * Selama antrean belum habis, ringkasan / realisasi di server sudah berubah tetapi rincian dan format WA belum lengkap,
 * dan HP / admin sudah menganggap laporan "terkirim" / "SIAP WA".
 *
 * Pola segel (atomic commit):
 *   1. HP baru menyegel laporan sesudah SEMUA antrean laporan hari itu diterima server (antrean kosong, tanpa ditolak)
 *      dan laporan sudah ditarik ulang dari server.
 *   2. HP mengirim ringkasan laporannya (segelSinkron<Modul>): jumlah baris tiap bagian + jumlah foto + sidik (FNV-1a
 *      dari daftar ID baris yang diurutkan). Server menyusun ringkasan yang SAMA dari sheet (bentuk data = jawaban
 *      get<Modul>Harian) lalu membandingkan. Cocok = LENGKAP, dicatat di log_Sinkron (SiSi_Auth).
 *   3. Status "Semua data tersinkron", tombol WA (HP) dan SIAP WA (admin, Laporan per Tim) hanya diberikan kalau segel
 *      LENGKAP DAN ringkasan saat ini masih sama dengan ringkasan segel. Ada data baru sesudah segel = kembali PROSES
 *      sampai HP menyegel ulang. Tidak ada endpoint tulis lain yang diubah.
 * Rumus ringkasan HP: mobile/lib/core/sinkron_atomik.dart (harus sama persis, diuji tests/backend.test.js + flutter test).
 */

var SEGEL_SHEET_ = 'log_Sinkron';
var SEGEL_HEADER_ = ['nomor', 'modul', 'tanggal', 'tim', 'tim_id', 'kunci', 'ringkas', 'status', 'waktu', 'oleh', 'perangkat', 'segel_id'];
var SEGEL_MODUL_ = ['HARTEK', 'INSJAR', 'INSDU'];
var SEGEL_BAGIAN_ = {
  HARTEK: ['header', 'lokasi', 'pekerjaan', 'material', 'grounding', 'pemerataan', 'foto', 'sidik'],
  INSJAR: ['header', 'realisasi', 'temuan', 'foto', 'sidik'],
  INSDU: ['header', 'realisasi', 'temuan', 'foto', 'sidik']
};

/** FNV-1a 32 bit atas kode UTF-16, hasil 8 digit hex (sama dengan sidikSinkron di HP). */
function fnv1aSegel_(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/** Ringkasan laporan dari dokumen bentuk get<Modul>Harian (header + anak). */
function ringkasSegel_(modul, doc) {
  var r = {}, id = [], foto = 0;
  SEGEL_BAGIAN_[modul].forEach(function (k) { if (k !== 'sidik') r[k] = 0; });
  var teks = function (v) { return v === null || v === undefined ? '' : String(v).trim(); };
  var hitFoto = function (n) {
    var f = n && n.foto;
    if (!f || typeof f !== 'object') return;
    Object.keys(f).forEach(function (k) { if (teks(f[k])) foto++; });
  };
  var h = doc && doc.header;
  if (h) { r.header = 1; id.push('H:' + teks(h.headerId)); }
  if (modul === 'HARTEK') {
    ((doc && doc.objek) || []).forEach(function (pg) {
      r.lokasi++;
      id.push('P:' + teks(pg.pgId));
      (pg.pekerjaan || []).forEach(function (pk) {
        r.pekerjaan++;
        id.push('K:' + teks(pk.pekerjaanId));
        ['material', 'grounding', 'pemerataan'].forEach(function (j) {
          (pk[j] || []).forEach(function (a) {
            r[j]++;
            id.push(j.charAt(0).toUpperCase() + ':' + teks(a.idBaris));
            hitFoto(a);
          });
        });
      });
    });
  } else {
    ((doc && doc.realisasi) || []).forEach(function (re) {
      r.realisasi++;
      id.push('R:' + teks(re.realisasiId));
      (re.temuan || []).forEach(function (t) {
        r.temuan++;
        id.push('T:' + teks(t.temuanId));
        hitFoto(t);
      });
    });
  }
  r.foto = foto;
  id.sort();
  r.sidik = fnv1aSegel_(id.join('|'));
  return r;
}

function samaRingkasSegel_(modul, a, b) {
  return SEGEL_BAGIAN_[modul].every(function (k) { return String(a && a[k]) === String(b && b[k]); });
}

/** Tab log_Sinkron (belum dibuat ADMIN_siapkanSheetSinkron = null; segel tetap divalidasi, hanya tidak dicatat). */
function tabelSegel_() {
  try { return tabel_('AUTH_SHEET_ID', SEGEL_SHEET_); } catch (e) {
    if (e && e.kode === 'SHEET_TIDAK_ADA') return null;
    throw e;
  }
}

/** Segel terakhir (status LENGKAP) satu laporan: {ringkas, waktu} atau null. */
function segelTerakhir_(rows, modul, tanggal, timId, kunci) {
  var r = (rows || []).filter(function (x) {
    return String(x.modul) === modul && tglSel_(x.tanggal) === tanggal && String(x.tim_id) === String(timId) &&
      String(x.kunci) === String(kunci) && String(x.status) === 'LENGKAP';
  }).pop();
  if (!r) return null;
  var o = null;
  try { o = JSON.parse(String(r.ringkas || '')); } catch (e) { o = null; }
  return o ? { ringkas: o, waktu: String(r.waktu || '') } : null;
}

/**
 * Status sinkron atomik untuk tampilan admin: LENGKAP (segel cocok dengan isi server sekarang), PROSES (belum disegel /
 * isi berubah sesudah segel), '' (log_Sinkron belum disiapkan: perilaku lama).
 */
function statusSegel_(rowsSegel, modul, tanggal, timId, kunci, ringkasSekarang) {
  if (rowsSegel === null) return '';
  var s = segelTerakhir_(rowsSegel, modul, tanggal, timId, kunci);
  return s && samaRingkasSegel_(modul, s.ringkas, ringkasSekarang) ? 'LENGKAP' : 'PROSES';
}

function dokHarianSegel_(modul, sesi) {
  if (modul === 'HARTEK') return getHartekHarian_(sesi, {});
  if (modul === 'INSJAR') return getInsJarHarian_(sesi, {});
  return getInsDuHarian_(sesi, {});
}

/** Segel satu laporan hari ini milik tim sesi. data.ringkas = JSON ringkasan HP (ringkasSinkron di HP). */
function segelSinkron_(modul, sesi, data) {
  var d = validasi_(data, { ringkas: { tipe: 'teks', wajib: true, maks: 2000 } });
  var hp;
  try { hp = JSON.parse(d.ringkas); } catch (e) { throw new SisiError_('FORMAT_SALAH', 'ringkas'); }
  if (!hp || typeof hp !== 'object' || Array.isArray(hp)) throw new SisiError_('FORMAT_SALAH', 'ringkas');
  var doc = dokHarianSegel_(modul, sesi);   // peran petugas modul dicek fungsi harian modul
  if (!doc.header) throw new SisiError_('DATA_TIDAK_DITEMUKAN', 'Laporan Utama');
  var srv = ringkasSegel_(modul, doc);
  var cocok = samaRingkasSegel_(modul, hp, srv);
  var sekarang = sekarangIso_(), disimpan = false;
  if (cocok) {
    var t = tabelSegel_();
    if (t) {
      denganLock_(function () {
        var t2 = tabelSegel_();
        var kunci = String(doc.header.headerId);
        var ada = t2.rows.filter(function (x) {
          return String(x.modul) === modul && String(x.kunci) === kunci && String(x.tim_id) === String(sesi.timId);
        })[0];
        var isi = { tanggal: doc.tanggal, ringkas: JSON.stringify(srv), status: 'LENGKAP', waktu: sekarang, oleh: sesi.username || sesi.userId,
                    perangkat: String(sesi.deviceId || '') };
        if (ada) {
          ubahBaris_(t2, 'segel_id', ada.segel_id, isi);
        } else {
          tambahBaris_(t2, Object.assign({ nomor: t2.rows.length + 1, modul: modul, tim: sesi.timNama || '', tim_id: sesi.timId,
                                           kunci: kunci, segel_id: uuid_() }, isi));
        }
      }, 15000);
      disimpan = true;
    }
  }
  return { modul: modul, cocok: cocok, status: cocok ? 'LENGKAP' : 'TIDAK_COCOK', ringkasServer: srv, waktu: sekarang, disimpan: disimpan };
}

/** Endpoint per modul: peran petugas modul dicek PALING AWAL (aturan audit guard), lalu segel. */
function segelSinkronHartek_(sesi, data) {
  wajibPetugasHartek_(sesi);
  return segelSinkron_('HARTEK', sesi, data);
}

function segelSinkronInsJar_(sesi, data) {
  wajibPetugasInsJar_(sesi);
  return segelSinkron_('INSJAR', sesi, data);
}

function segelSinkronInsDu_(sesi, data) {
  wajibPetugasInsDu_(sesi);
  return segelSinkron_('INSDU', sesi, data);
}

/** Ringkasan laporan Hartek dari baris sheet (admin, Laporan per Tim). Susunan sama dengan getHartekHarian_. */
function ringkasHartekBaris_(h, pgH, pkH, mtH, grH, pmH) {
  var doc = {
    header: { headerId: String(h.header_id) },
    objek: pgH.map(function (p) {
      return {
        pgId: String(p.pg_id),
        pekerjaan: pkH.filter(function (x) { return String(x.pg_id) === String(p.pg_id); }).map(function (x) {
          var anak = function (rows, kol, jenis) {
            return rows.filter(function (a) { return String(a.pekerjaan_id) === String(x.pekerjaan_id); }).map(function (a) {
              return { idBaris: String(a[kol]), foto: jenis ? fotoLinkHartek_(jenis, a) : null };
            });
          };
          return { pekerjaanId: String(x.pekerjaan_id), material: anak(mtH, 'material_id', ''), grounding: anak(grH, 'grounding_id', 'grounding'),
                   pemerataan: anak(pmH, 'pemerataan_id', 'pemerataan') };
        })
      };
    })
  };
  return ringkasSegel_('HARTEK', doc);
}

/** Buat tab log_Sinkron di SiSi_Auth (sekali, dari editor Apps Script). */
function ADMIN_siapkanSheetSinkron() {
  pastikanPemilik_();
  var ss = bukaSpreadsheet_(cfg_().AUTH_SHEET_ID);
  var sh = ss.getSheetByName(SEGEL_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(SEGEL_SHEET_);
    sh.getRange(1, 1, 1, SEGEL_HEADER_.length).setValues([SEGEL_HEADER_]);
    sh.setFrozenRows(1);
    console.log('log_Sinkron dibuat di SiSi_Auth');
    return;
  }
  var ada = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  var kurang = SEGEL_HEADER_.filter(function (k) { return ada.indexOf(k) === -1; });
  if (kurang.length) sh.getRange(1, ada.filter(function (x) { return x; }).length + 1, 1, kurang.length).setValues([kurang]);
  console.log(kurang.length ? 'log_Sinkron: kolom ditambah ' + kurang.join(', ') : 'log_Sinkron sudah lengkap');
}
