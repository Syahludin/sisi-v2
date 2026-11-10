#!/usr/bin/env node
/**
 * Push + redeploy ke deployment web app yang SAMA (URL /exec tidak berubah).
 * Pakai: npm run deploy:staging -- "deskripsi versi"
 * Deployment ID dibaca dari backend/.deploy.json (tidak ikut git/zip; contoh di .deploy.example.json).
 * Production / unit lain (ulpmentok) wajib --yakin. claspUser di .clasp.<env>.json ikut dipakai (lihat push.js).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const env = process.argv[2];
const yakin = process.argv.includes('--yakin');
const desk = process.argv.slice(3).filter((a) => a !== '--yakin').join(' ').trim();
const TARGET = ['staging', 'production', 'ulpmentok'];
if (!TARGET.includes(env)) {
  console.error('Pakai: node scripts/deploy.js <' + TARGET.join('|') + '> "deskripsi"');
  process.exit(1);
}
if (env !== 'staging' && !yakin) {
  console.error(`Deploy ke ${env.toUpperCase()} butuh flag --yakin`);
  process.exit(1);
}
if (!desk) {
  console.error('Deskripsi versi wajib, contoh: npm run deploy:staging -- "staging v0.20 · cek platform"');
  process.exit(1);
}
const root = path.join(__dirname, '..');
const file = path.join(root, '.deploy.json');
if (!fs.existsSync(file)) {
  console.error('backend/.deploy.json belum ada. Salin dari .deploy.example.json lalu isi deployment ID (bagian di antara /s/ dan /exec pada URL).');
  process.exit(1);
}
const id = String(JSON.parse(fs.readFileSync(file, 'utf8'))[env] || '');
if (!/^AKfy[0-9A-Za-z_-]{20,}$/.test(id)) {
  console.error(`Deployment ID ${env} di .deploy.json belum diisi / tidak valid`);
  process.exit(1);
}
const shell = process.platform === 'win32';
// Windows butuh shell (clasp = clasp.cmd). Satu string perintah, argumen dikutip sendiri (hindari DEP0190).
const kutip = (a) => (/^[\w./:@-]+$/.test(a) ? a : '"' + String(a).replace(/"/g, '\\"') + '"');
const jalan = (cmd, args) => {
  const r = shell
    ? spawnSync([cmd, ...args].map(kutip).join(' '), { cwd: root, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);
};
jalan('node', [path.join('scripts', 'push.js'), env, ...(yakin ? ['--yakin'] : [])]);
console.log(`-> redeploy ${env.toUpperCase()} ke deployment ${id.slice(0, 12)}...`);
const claspFile = path.join(root, `.clasp.${env}.json`);
const claspUser = fs.existsSync(claspFile) ? JSON.parse(fs.readFileSync(claspFile, 'utf8')).claspUser : undefined;
jalan('clasp', [...(claspUser ? ['-u', String(claspUser)] : []), 'deploy', '-i', id, '-d', desk]);
console.log('Selesai. URL /exec tetap sama.');
