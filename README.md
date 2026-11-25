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

### Migrasi Database Supabase (Wajib)

Jalankan sekali isi file
`supabase/migrations/20261125_001_schema_hardening_and_rpcs.sql` di **SQL Editor
Supabase**. Migrasi ini bersifat idempoten (aman dijalankan ulang tanpa
menghapus data yang sudah ada) dan menambahkan:

- Constraint integritas (`NOT NULL`, `UNIQUE`, `CHECK`, `bigint` untuk nominal,
  dan trigger `updated_at`)
- Kolom audit QC pada `purchase_orders`, arsip tanda tangan & `timestamptz` POD
  pada `orders`, serta tabel `stock_movements`, `app_settings`, dan
  `order_returns`
- Row Level Security (RLS) pada seluruh tabel publik
- Fungsi RPC atomik (`checkout_order`, `issue_purchase_order`,
  `complete_qc_grading`, `adjust_product_stock`, `sync_bundle_stock`)
