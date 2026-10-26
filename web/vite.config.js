import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' = hasil build bisa ditaruh di root domain maupun subfolder / subdomain Hostinger tanpa diubah.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
});
