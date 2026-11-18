/**
 * Peta cek koordinat tiang (tab Peta Koordinat di Master Jaringan): logika murni, diuji di test/petaKoordinat.test.js.
 * Baris dari getPetaKoordinatTiang = larik: [tiangId, nama, latAset, lngAset, latGis, lngGis, latTaksir, lngTaksir, latLap, lngLap,
 * sumberKoordinat, indukTiangId, gawangM, tandaGawang, statusVerifikasi]; kosong = ''. Koordinat terdaftar = GIS, lalu taksiran, lalu ITB
 * (sama dengan koordinatTerdaftarTiang_ di server).
 */

export const SUMBER_PETA = ['GIS', 'TAKSIRAN', 'ITB'];
export const WARNA_SUMBER = { GIS: '#1a8f3c', TAKSIRAN: '#f08a00', ITB: '#6b7280' };
export const BERGESER_M = 200;

const pasang = (a, b) => {
  const la = a === '' || a == null ? NaN : Number(a), ln = b === '' || b == null ? NaN : Number(b);
  return Number.isFinite(la) && Number.isFinite(ln) ? [la, ln] : null;
};

export function jarakM(a, b) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function bacaTiangPeta(baris) {
  return (baris || []).map((r) => {
    const itb = pasang(r[2], r[3]), gis = pasang(r[4], r[5]), taksir = pasang(r[6], r[7]);
    const sumber = gis ? 'GIS' : taksir ? 'TAKSIRAN' : itb ? 'ITB' : null;
    const terdaftar = gis || taksir || itb;
    return {
      id: String(r[0]), nama: r[1], itb, gis, taksir, lapangan: pasang(r[8], r[9]), sumberKoordinat: r[10] || '', indukId: r[11] || '',
      gawangM: r[12] === '' || r[12] == null ? null : Number(r[12]), tanda: r[13] ? String(r[13]).split('|').filter(Boolean) : [], status: r[14] || '',
      sumber, terdaftar, selisihM: itb && terdaftar && sumber !== 'ITB' ? jarakM(itb, terdaftar) : null,
    };
  });
}

/** Saring: sumber (daftar), hanyaTanda (gawang bertanda), hanyaBergeser (terdaftar > 200 m dari ITB), cari (nama mengandung). */
export function saringPeta(daftar, { sumber = SUMBER_PETA, hanyaTanda = false, hanyaBergeser = false, cari = '' } = {}) {
  const q = String(cari || '').trim().toUpperCase();
  return daftar.filter((t) => t.terdaftar && sumber.includes(t.sumber) && (!hanyaTanda || t.tanda.length) && (!hanyaBergeser || (t.selisihM || 0) > BERGESER_M)
    && (!q || String(t.nama).toUpperCase().includes(q)));
}

export function ringkasPeta(daftar) {
  const r = { total: daftar.length, GIS: 0, TAKSIRAN: 0, ITB: 0, tanpa: 0, bertanda: 0, bergeser: 0, lapangan: 0 };
  daftar.forEach((t) => {
    if (t.sumber) r[t.sumber]++; else r.tanpa++;
    if (t.tanda.length) r.bertanda++;
    if ((t.selisihM || 0) > BERGESER_M) r.bergeser++;
    if (t.lapangan) r.lapangan++;
  });
  return r;
}
