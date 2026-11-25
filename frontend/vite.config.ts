import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Kunci port supaya aplikasi selalu di localhost:5173 (gagal jelas kalau dipakai).
    port: 5173,
    strictPort: true,
    // Listen di semua interface agar bisa dijangkau reverse proxy / perangkat lain.
    host: true,
    // Tanpa ini Vite menolak request dengan Host header domain (403 "Blocked request").
    allowedHosts: ['veggiechain.skews.dev', '.skews.dev'],
    proxy: {
      // Frontend memanggil /api/... (same-origin) lalu diteruskan ke backend-core.
      // Ini menghindari CORS dan membuat API tetap jalan di domain publik.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
