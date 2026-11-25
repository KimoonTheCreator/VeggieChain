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

## Stok & inventaris

- Tab **Inventaris** (role Gudang & ML) menampilkan semua SKU dalam satuan jual
  (`kg`, `krat`, `pouch`) dan bisa dikoreksi per baris.
- **Olahan Grade-B**: 1 kg Grade-B dari QC diolah menjadi 2 pouch 500g
  (stok PRD-003 bertambah dalam pouch, bukan kg).
- **Paket B2B (PRD-004)** adalah bundling virtual 25 kg. Resep 1 krat =
  10 kg Brokoli + 8 kg Tomat + 7 kg Wortel. Stoknya dihitung otomatis dari stok
  komponen dan tidak bisa diubah manual; checkout paket otomatis memotong stok
  komponen segar.

### Audit QC (opsional)

Kalau ingin menyimpan split Grade-A/Grade-B per PO, jalankan sekali di SQL
Editor Supabase:

```sql
alter table public.purchase_orders
  add column if not exists grade_a_kg numeric,
  add column if not exists grade_b_kg numeric,
  add column if not exists grade_b_pouches numeric,
  add column if not exists qc_completed_at timestamptz;
```

Tanpa kolom ini QC tetap berjalan; audit hanya dicatat di log server.
