#!/usr/bin/env node
/**
 * Build + zip website per lingkungan, base folder otomatis benar (asset memakai alamat absolut dari SISI_BASE).
 * Pakai: npm run zip:staging | npm run zip:production
 *   staging    -> base /sisi-web-staging/, sisi-web-staging.zip (config.js ikut: env staging, backend staging)
 *   production -> base /sisi/,             sisi-web-production.zip (config.js TIDAK ikut: pakai config.js di server)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LINGKUNGAN = {
  staging: { base: '/sisi-web-staging/', zip: 'sisi-web-staging.zip', config: true },
  production: { base: '/sisi/', zip: 'sisi-web-production.zip', config: false },
};
const env = process.argv[2], l = LINGKUNGAN[env];
if (!l) { console.error('Pakai: node scripts/zip.cjs <' + Object.keys(LINGKUNGAN).join('|') + '>'); process.exit(1); }

const root = path.join(__dirname, '..'), dist = path.join(root, 'dist'), zip = path.join(root, l.zip);
const jalan = (cmd, args, extra) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...extra } });
  if (r.status !== 0) process.exit(r.status || 1);
};
jalan('npx', ['vite', 'build'], { SISI_BASE: l.base });
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('src="' + l.base + 'assets/')) { console.error('index.html tidak memakai base ' + l.base + ', zip dibatalkan'); process.exit(1); }
if (!l.config) fs.rmSync(path.join(dist, 'config.js'), { force: true });
fs.rmSync(zip, { force: true });
if (process.platform === 'win32') {
  jalan('powershell', ['-NoProfile', '-Command', `"Compress-Archive -Path '${path.join(dist, '*')}' -DestinationPath '${zip}' -Force"`]);
} else {
  spawnSync("zip", ["-qr", zip, "."], { cwd: dist, stdio: "inherit" });
}
console.log('Selesai: ' + l.zip + ' (base ' + l.base + '). Upload, Extract di folder hosting ' + l.base);
