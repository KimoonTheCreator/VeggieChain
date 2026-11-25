# VeggieChain

Tugas Besar Lasti — simulasi rantai pasok sayur (backend Hono + Supabase + DeepSeek, frontend React + Vite).

## Menjalankan

```bash
# sekali saja, pasang dependency tiap paket
cd backend-core && npm install && cd ..
cd frontend && npm install && cd ..

# jalankan backend (:3000) + frontend (:5173) sekaligus
npm run dev
```

Buka **http://localhost:5173**.

`Ctrl+C` menghentikan kedua service.

### Konfigurasi

`backend-core/.env` (tidak ikut git):

```env
PORT=3000
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DEEPSEEK_API_KEY=...
```

Tanpa `DEEPSEEK_API_KEY`, prediksi permintaan otomatis memakai fallback statistik.
