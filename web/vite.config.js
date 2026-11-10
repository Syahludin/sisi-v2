import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v1.0.36: alamat per halaman (/sisi/laporan-up3, /sisi/ukur-gardu/TB0002) butuh base ABSOLUT (dulu './').
// Folder di hosting: SISI_BASE (default /sisi/ = https://sisi-ulp-toboali.com/sisi/). Root domain: SISI_BASE=/ npm run build
const BASE = (process.env.SISI_BASE || '/sisi/').replace(/\/?$/, '/');
// Git Bash di Windows mengubah "/x/" jadi path Windows: tolak, pakai PowerShell / MSYS_NO_PATHCONV=1
if (!/^\/[A-Za-z0-9._\-/]*$/.test(BASE)) throw new Error('SISI_BASE tidak valid: ' + BASE);

/** RewriteBase .htaccess ikut BASE (alamat halaman yang di-refresh dibuka lewat index.html folder itu). */
function htaccessBase() {
  return {
    name: 'sisi-htaccess-base',
    apply: 'build',
    closeBundle() {
      const f = path.resolve('dist', '.htaccess');
      if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/__BASE__/g, BASE));
    },
  };
}

export default defineConfig({
  plugins: [react(), htaccessBase()],
  base: BASE,
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
});
