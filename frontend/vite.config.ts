import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Kunci port supaya aplikasi selalu di localhost:5173 (gagal jelas kalau dipakai).
  server: {
    port: 5173,
    strictPort: true,
  },
});