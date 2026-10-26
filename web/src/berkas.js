/**
 * File dari server (base64) di browser: unduh atau buka di tab baru. Server tidak memberi link Drive (privat),
 * jadi file selalu lewat server lalu jadi Blob URL di sini.
 */
import { dariBase64 } from './beritaAcara.js';

const urlBlob = (b64, mime) => URL.createObjectURL(new Blob([dariBase64(b64)], { type: mime || 'application/octet-stream' }));
const lepasNanti = (url) => setTimeout(() => URL.revokeObjectURL(url), 120000);

export function unduhBase64(b64, mime, namaFile) {
  const url = urlBlob(b64, mime), a = document.createElement('a');
  a.href = url;
  a.download = namaFile || 'berkas';
  document.body.appendChild(a);
  a.click();
  a.remove();
  lepasNanti(url);
}

/**
 * Buka file di tab baru. Tab dibuka SAAT diklik (sebelum menunggu server) supaya tidak diblokir popup blocker;
 * ambil() = Promise<{data, mime}>. Gagal = tab ditutup lagi, galat diteruskan.
 */
export async function bukaDiTabBaru(ambil) {
  const tab = window.open('', '_blank');
  if (tab) tab.document.title = 'Memuat berkas...';
  try {
    const f = await ambil();
    const url = urlBlob(f.data, f.mime);
    if (tab) tab.location.href = url; else window.open(url, '_blank');
    lepasNanti(url);
  } catch (e) {
    if (tab) tab.close();
    throw e;
  }
}
