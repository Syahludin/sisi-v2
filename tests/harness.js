/**
 * Muat semua file backend/src ke satu konteks VM dengan stub layanan Apps Script.
 * File dimuat dalam urutan TERBALIK dengan sengaja: membuktikan aturan v2
 * "tidak ada kode top-level yang bergantung pada file lain".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const keSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const keBuffer = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map((b) => b & 0xff)));

function buatKonteks(props = {}) {
  const cache = new Map();
  const ctx = {
    console,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg, v) => keSigned(crypto.createHash('sha256').update(keBuffer(v)).digest()),
      computeHmacSha256Signature: (v, k) => keSigned(crypto.createHmac('sha256', keBuffer(k)).update(keBuffer(v)).digest()),
      newBlob: (s) => ({ getBytes: () => keSigned(Buffer.from(s, 'utf8')) }),
      base64Encode: (b) => keBuffer(b).toString('base64'),
      base64Decode: (s) => keSigned(Buffer.from(s, 'base64')),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ ...props }) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  };
  vm.createContext(ctx);
  const src = path.join(__dirname, '..', 'backend', 'src');
  const files = [];
  (function jalan(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) jalan(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  })(src);
  files.sort().reverse().forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  return ctx;
}

module.exports = { buatKonteks };
