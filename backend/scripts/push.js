#!/usr/bin/env node
/**
 * Salin .clasp.<env>.json -> .clasp.json lalu clasp push. Production / unit lain wajib --yakin.
 * v1.0.50 multi-unit: env = staging | production | ulpmentok. .clasp.<env>.json boleh berisi "claspUser" (akun Google
 * lain, login sekali: clasp login --user <nama>); tidak ikut ditulis ke .clasp.json.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TARGET = ['staging', 'production', 'ulpmentok'];
const env = process.argv[2];
if (!TARGET.includes(env)) {
  console.error('Pakai: node scripts/push.js <' + TARGET.join('|') + '>');
  process.exit(1);
}
if (env !== 'staging' && !process.argv.includes('--yakin')) {
  console.error(`Push ke ${env.toUpperCase()} butuh flag --yakin`);
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
const { claspUser, ...clasp } = cfg;
if (claspUser !== undefined && !/^[\w-]{1,40}$/.test(String(claspUser))) {
  console.error(`claspUser di .clasp.${env}.json tidak valid`);
  process.exit(1);
}
fs.writeFileSync(path.join(root, '.clasp.json'), JSON.stringify(clasp, null, 2));
console.log(`-> push ke ${env.toUpperCase()} (${clasp.scriptId})${claspUser ? ' sebagai ' + claspUser : ''}`);
const args = [...(claspUser ? ['-u', claspUser] : []), 'push', '--force'];
const r = process.platform === 'win32'
  ? spawnSync(['clasp', ...args].join(' '), { cwd: root, stdio: 'inherit', shell: true })
  : spawnSync('clasp', args, { cwd: root, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
