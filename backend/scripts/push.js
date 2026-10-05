#!/usr/bin/env node
/** Salin .clasp.<env>.json -> .clasp.json lalu clasp push. Production wajib --yakin. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const env = process.argv[2];
if (!['staging', 'production'].includes(env)) {
  console.error('Pakai: node scripts/push.js <staging|production>');
  process.exit(1);
}
if (env === 'production' && !process.argv.includes('--yakin')) {
  console.error('Push ke PRODUCTION butuh flag --yakin');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const file = path.join(root, `.clasp.${env}.json`);
if (!fs.existsSync(file)) {
  console.error(`.clasp.${env}.json belum ada. Salin dari .clasp.${env}.example.json lalu isi scriptId.`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!cfg.scriptId || cfg.scriptId.startsWith('ISI_')) {
  console.error(`scriptId di .clasp.${env}.json belum diisi`);
  process.exit(1);
}
fs.writeFileSync(path.join(root, '.clasp.json'), JSON.stringify(cfg, null, 2));
console.log(`-> push ke ${env.toUpperCase()} (${cfg.scriptId})`);
const r = process.platform === 'win32'
  ? spawnSync('clasp push --force', { cwd: root, stdio: 'inherit', shell: true })
  : spawnSync('clasp', ['push', '--force'], { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
