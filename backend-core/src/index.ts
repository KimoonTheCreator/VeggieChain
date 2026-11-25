import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { randomInt } from 'node:crypto';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase.js';
import { generateAiDemandForecast } from './services/aiForecast.js';

dotenv.config();

const app = new Hono();
app.use('/*', cors());

// ==================== HELPER: ERROR & ID ====================

type SupabaseError = { message: string; code?: string };

/**
 * Pastikan Supabase tidak mengembalikan error. Sebelumnya endpoint membalas
 * { success: true } walaupun insert/update gagal, sehingga data hilang diam-diam.
 */
function must<T>(res: { data: T | null; error: SupabaseError | null }, what: string): NonNullable<T> {
  if (res.error) {
    console.error(`[Supabase] ${what}: ${res.error.message} (code=${res.error.code ?? '-'})`);
    throw new HTTPException(502, { message: `${what} gagal: ${res.error.message}` });
  }
  return res.data as NonNullable<T>;
}

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function conflict(message: string): never {
  throw new HTTPException(409, { message });
}

/** Label satuan jual: '/krat 25kg' -> 'krat', '/kg' -> 'kg'. */
function unitLabel(unit: string | null | undefined): string {
  const cleaned = (unit ?? '').replace(/^\//, '').trim();
  return cleaned.split(/\s+/)[0] || 'unit';
}

function toNumber(value: unknown, field: string, { min = 0 } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n)) badRequest(`${field} harus berupa angka`);
  if (n < min) badRequest(`${field} tidak boleh kurang dari ${min}`);
  return n;
}

const pad3 = () => String(randomInt(0, 1000)).padStart(3, '0');
const ymd = (d = new Date()) => d.toISOString().slice(0, 10).replace(/-/g, '');
const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

/** Weekend versi bisnis VeggieChain: Jumat, Sabtu, Minggu. */
function isWeekendIso(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return false;
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 5 || dow === 6;
}

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function formatHarvestDate(daysAhead = 4): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Paket B2B (PRD-004) adalah bundling VIRTUAL 25 kg: stoknya tidak diisi
 * manual, melainkan dihitung otomatis dari stok komoditas segar.
 *
 * Resep 1 krat = 10 kg Brokoli + 8 kg Tomat + 7 kg Wortel (total 25 kg).
 * Kalau komposisi bisnis berubah, cukup ubah konstanta ini (dan salinannya
 * di frontend/src/components/ops/InventoryPanel.tsx untuk tampilan).
 */
const BUNDLE_PRODUCT_ID = 'PRD-004';
const BUNDLE_RECIPE: Readonly<Record<string, number>> = {
  'PRD-001': 10,
  'PRD-002': 8,
  'PRD-005': 7,
};

/** Berapa krat paket yang bisa dirakit dari stok komponen saat ini. */
function deriveBundleStock(
  products: Array<{ id: string; stock_kg: number | null }>
): number {
  let capacity = Number.POSITIVE_INFINITY;
  for (const [componentId, perKrat] of Object.entries(BUNDLE_RECIPE)) {
    const component = products.find((p) => p.id === componentId);
    if (!component) return 0;
    capacity = Math.min(
      capacity,
      Math.floor(Number(component.stock_kg ?? 0) / perKrat)
    );
  }
  return Number.isFinite(capacity) ? Math.max(0, capacity) : 0;
}

/**
 * Sinkronkan kolom stock_kg PRD-004 dengan kapasitas rakitan.
 * Best-effort: kegagalan hanya di-log supaya operasi utama tidak ikut gagal.
 */
async function syncBundleStock(): Promise<void> {
  try {
    const { data, error } = await supabase.from('products').select('id, stock_kg');
    if (error) throw error;
    const capacity = deriveBundleStock(
      (data ?? []) as Array<{ id: string; stock_kg: number | null }>
    );
    const { error: updErr } = await supabase
      .from('products')
      .update({ stock_kg: capacity })
      .eq('id', BUNDLE_PRODUCT_ID);
    if (updErr) throw updErr;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[bundle] gagal sinkronisasi stok ${BUNDLE_PRODUCT_ID}: ${message}`);
  }
}

/** Insert dengan retry ketika ID bentrok (Postgres unique_violation = 23505). */
async function insertWithRetry(
  table: string,
  idField: string,
  makeRow: () => Record<string, unknown>,
  what: string
): Promise<Record<string, any>> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const row = makeRow();
    const { error } = await (supabase as any).from(table).insert(row);
    if (!error) return row;
    if (error.code !== '23505') {
      console.error(`[Supabase] ${what}: ${error.message}`);
      throw new HTTPException(502, { message: `${what} gagal: ${error.message}` });
    }
    console.warn(`[Supabase] ${what}: ID ${row[idField]} bentrok, ulangi (${attempt}/5)`);
  }
  throw new HTTPException(503, { message: `${what} gagal: tidak dapat membuat ID unik` });
}

/**
 * Catat penjualan checkout ke `sales_history` sebagai agregat 1 baris per
 * (komoditas, tanggal) — sumber data yang dibaca demand forecasting.
 *
 * Dipanggil SETELAH order tersimpan & stok terpotong. Kegagalan di sini hanya
 * di-log: order yang sudah sah tidak boleh ikut dibatalkan gara-gara tabel
 * analitik. Penulisan bersifat read-modify-write; cukup untuk beban demo
 * (satu operator), dan aman dari duplikasi karena selalu di-upsert per tanggal.
 */
async function recordSalesFromOrder(
  entries: Array<{ commodityId: string; qty: number }>,
  buyerMode: 'B2C' | 'B2B'
): Promise<{ recorded: number; failed: number }> {
  const recordedDate = isoDate();
  let recorded = 0;
  let failed = 0;

  for (const { commodityId, qty } of entries) {
    try {
      const { data: existing, error: findErr } = await supabase
        .from('sales_history')
        .select('id, sold_b2c_kg, sold_b2b_kg')
        .eq('commodity_id', commodityId)
        .eq('recorded_date', recordedDate)
        .maybeSingle();
      if (findErr) throw findErr;

      const prevB2c = Number(existing?.sold_b2c_kg ?? 0);
      const prevB2b = Number(existing?.sold_b2b_kg ?? 0);
      const soldB2c = buyerMode === 'B2C' ? prevB2c + qty : prevB2c;
      const soldB2b = buyerMode === 'B2B' ? prevB2b + qty : prevB2b;
      const totalDemand = Math.round((soldB2c + soldB2b) * 100) / 100;

      if (existing) {
        const { error } = await supabase
          .from('sales_history')
          .update({
            sold_b2c_kg: soldB2c,
            sold_b2b_kg: soldB2b,
            total_demand_kg: totalDemand,
            is_weekend: isWeekendIso(recordedDate),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sales_history').insert({
          recorded_date: recordedDate,
          commodity_id: commodityId,
          sold_b2c_kg: soldB2c,
          sold_b2b_kg: soldB2b,
          total_demand_kg: totalDemand,
          weather_condition: 'cerah',
          is_weekend: isWeekendIso(recordedDate),
        });
        if (error) throw error;
      }

      recorded++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[sales-history] gagal mencatat checkout ${commodityId} ${recordedDate}: ${message}`
      );
    }
  }

  return { recorded, failed };
}

async function requireProduct(id: string) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil produk gagal: ${error.message}` });
  if (!data) throw new HTTPException(404, { message: `Komoditas ${id} tidak ditemukan` });
  return data;
}

// ==================== ENDPOINTS ====================

app.get('/health', (c) => c.json({ status: 'ok', service: 'VeggieChain Core + DeepSeek AI' }));

// 1. Ambil seluruh state aplikasi dari Supabase
app.get('/api/v1/state', async (c) => {
  const [prodRes, orderRes, planRes, poRes, salesRes] = await Promise.all([
    supabase.from('products').select('*').order('id', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('supply_plans').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    // Riwayat penjualan ikut di /state supaya panel Ops bisa menampilkannya
    // langsung setelah checkout, tanpa menunggu respons AI.
    supabase
      .from('sales_history')
      .select('id, recorded_date, commodity_id, sold_b2c_kg, sold_b2b_kg, total_demand_kg, weather_condition, is_weekend')
      .order('recorded_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(120),
  ]);

  const productsRaw = must(prodRes, 'Ambil products') ?? [];
  const ordersRaw = must(orderRes, 'Ambil orders') ?? [];
  const plansRaw = must(planRes, 'Ambil supply plans') ?? [];
  const poRaw = must(poRes, 'Ambil purchase orders') ?? [];
  const salesRaw = must(salesRes, 'Ambil sales history') ?? [];

  // PRD-004 selalu ditampilkan sebagai kapasitas rakitan terkini, bukan angka
  // stok lama di DB (bisa basi kalau komponen berubah).
  const bundleCapacity = deriveBundleStock(
    productsRaw as Array<{ id: string; stock_kg: number | null }>
  );

  const products = productsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    grade: p.grade,
    badgeText: p.badge_text,
    badgeColor: p.badge_color,
    farmer: p.farmer,
    warehouse: p.warehouse,
    stockKg: p.id === BUNDLE_PRODUCT_ID ? bundleCapacity : p.stock_kg,
    baseWeeklySales: p.base_weekly_sales,
    baseFarmerPrice: p.base_farmer_price,
    rating: Number(p.rating),
    priceB2C: p.price_b2c,
    priceB2B: p.price_b2b,
    unit: p.unit,
    image: p.image_url,
    qcNotes: p.qc_notes,
  }));

  const orders = ordersRaw.map((o) => ({
    id: o.id,
    date: o.date_label,
    buyerMode: o.buyer_mode,
    status: o.status,
    statusLabel: o.status_label,
    courier: o.courier,
    qrCodeResi: o.qr_code_resi,
    paymentMethod: o.payment_method,
    items: o.items,
    shippingFee: o.shipping_fee,
    total: o.total_amount,
    podSigned: o.pod_signed,
    podTimestamp: o.pod_timestamp,
  }));

  const supplyPlans = plansRaw.map((s) => ({
    id: s.id,
    commodityId: s.commodity_id,
    commodityName: s.commodity_name,
    targetQty: s.target_qty,
    refPrice: s.ref_price,
    harvestDate: s.harvest_date,
    status: s.status,
    confirmedQty: s.confirmed_qty,
    agreedPrice: s.agreed_price,
  }));

  const purchaseOrders = poRaw.map((po) => ({
    poNumber: po.po_number,
    planId: po.plan_id,
    commodityId: po.commodity_id,
    commodityName: po.commodity_name,
    qty: po.qty,
    agreedPrice: po.agreed_price,
    totalAmount: po.total_amount,
    status: po.status,
  }));

  return c.json({ products, orders, supplyPlans, purchaseOrders, salesHistory: salesRaw });
});

// 2. Endpoint DeepSeek AI Demand Forecasting
app.post('/api/v1/forecast/predict', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const commodityId = String(body.commodityId ?? 'PRD-001');

  try {
    const result = await generateAiDemandForecast({
      commodityId,
      weatherCondition: (body.weatherCondition as any) || 'hujan_sedang',
      isHolidayWeek: Boolean(body.isHolidayWeek),
      customNote: typeof body.customNote === 'string' ? body.customNote : '',
    });
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal memproses prediksi';
    console.error('[forecast]', message);
    return c.json({ error: message }, message.includes('tidak ditemukan') ? 404 : 502);
  }
});

// 3. Input Data Penjualan Harian Manual ke Supabase (Konteks Baru untuk DeepSeek AI)
app.post('/api/v1/sales-history', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) badRequest('Body JSON tidak valid');

  const commodityId = String(body.commodityId ?? '').trim();
  if (!commodityId) badRequest('commodityId wajib diisi');
  await requireProduct(commodityId);

  const soldB2c = toNumber(body.soldB2cKg ?? 0, 'soldB2cKg');
  const soldB2b = toNumber(body.soldB2bKg ?? 0, 'soldB2bKg');
  const totalDemand = Math.round((soldB2c + soldB2b) * 100) / 100;
  const recordedDate =
    typeof body.recordedDate === 'string' && body.recordedDate
      ? body.recordedDate
      : new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedDate)) badRequest('Format recordedDate harus YYYY-MM-DD');

  const payload = {
    recorded_date: recordedDate,
    commodity_id: commodityId,
    sold_b2c_kg: soldB2c,
    sold_b2b_kg: soldB2b,
    total_demand_kg: totalDemand,
    weather_condition: typeof body.weatherCondition === 'string' ? body.weatherCondition : 'cerah',
    is_weekend: Boolean(body.isWeekend),
  };

  // Upsert manual: satu baris per (komoditas, tanggal) supaya histori tidak dobel.
  const existing = await supabase
    .from('sales_history')
    .select('id')
    .eq('commodity_id', commodityId)
    .eq('recorded_date', recordedDate)
    .maybeSingle();
  if (existing.error) {
    throw new HTTPException(502, { message: `Cek histori gagal: ${existing.error.message}` });
  }

  if (existing.data) {
    const { error } = await supabase.from('sales_history').update(payload).eq('id', existing.data.id);
    if (error) throw new HTTPException(502, { message: `Update histori gagal: ${error.message}` });
    return c.json({ success: true, mode: 'updated', recordedDate, totalDemandKg: totalDemand });
  }

  const { error } = await supabase.from('sales_history').insert(payload);
  if (error) throw new HTTPException(502, { message: `Simpan histori gagal: ${error.message}` });
  return c.json({ success: true, mode: 'inserted', recordedDate, totalDemandKg: totalDemand });
});

// 4. Update Stok Cold Storage Manual di Supabase
// Catatan: kolom `stock_kg` menyimpan jumlah dalam SATUAN JUAL produk
// (kg / krat / pouch), bukan selalu kilogram.
app.patch('/api/v1/products/:id/stock', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const stockKg = toNumber(body.stockKg, 'stockKg');
  if (!Number.isInteger(stockKg)) {
    badRequest('stockKg harus bilangan bulat karena stok dihitung dalam satuan jual');
  }
  if (id === BUNDLE_PRODUCT_ID) {
    badRequest(
      'Stok Paket B2B dihitung otomatis dari stok komoditas segar dan tidak bisa diubah manual'
    );
  }

  const { data, error } = await supabase
    .from('products')
    .update({ stock_kg: stockKg })
    .eq('id', id)
    .select('id');
  if (error) throw new HTTPException(502, { message: `Update stok gagal: ${error.message}` });
  if (!data || data.length === 0) throw new HTTPException(404, { message: `Komoditas ${id} tidak ditemukan` });

  // Perubahan stok komponen mengubah kapasitas rakitan Paket B2B.
  if (BUNDLE_RECIPE[id] !== undefined) await syncBundleStock();

  return c.json({ success: true, id, stockKg });
});

// 5. Checkout Pesanan Pembeli
app.post('/api/v1/orders', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const buyerMode = body.buyerMode;
  const isPeakSeason = Boolean(body.isPeakSeason);

  if (buyerMode !== 'B2C' && buyerMode !== 'B2B') badRequest("buyerMode harus 'B2C' atau 'B2B'");
  if (!Array.isArray(body.cart) || body.cart.length === 0) badRequest('cart tidak boleh kosong');

  // Gabungkan qty bila produk yang sama muncul lebih dari sekali.
  const requested = new Map<string, number>();
  for (const raw of body.cart as Array<Record<string, unknown>>) {
    const productId = String(raw?.productId ?? '');
    if (!productId) badRequest('Setiap item cart wajib punya productId');
    const qty = toNumber(raw?.qty, `qty untuk ${productId}`, { min: 1 });
    if (!Number.isInteger(qty)) {
      badRequest(`qty untuk ${productId} harus bilangan bulat (satuan jual)`);
    }
    requested.set(productId, (requested.get(productId) ?? 0) + qty);
  }

  const allProducts = must(await supabase.from('products').select('*'), 'Ambil products') ?? [];
  const productMap = new Map(allProducts.map((p) => [p.id, p]));

  const orderItems: Array<{ name: string; qty: number; price: number; unit: string }> = [];
  let subtotal = 0;
  const applied: Array<{ id: string; before: number; after: number }> = [];

  // 1) Validasi item pesanan & hitung nilai. Paket B2B dicatat sebagai item
  //    tersendiri, tetapi stoknya tidak dipotong langsung (virtual bundle).
  for (const [productId, qty] of requested) {
    const prod = productMap.get(productId);
    if (!prod) badRequest(`Produk ${productId} tidak ditemukan`);
    const price = buyerMode === 'B2B' ? prod.price_b2b : prod.price_b2c;
    subtotal += price * qty;
    orderItems.push({ name: prod.name, qty, price, unit: prod.unit });
  }

  // 2) Terjemahkan pesanan menjadi pemotongan stok komponen.
  //    1 krat PRD-004 dirakit otomatis dari 10 kg PRD-001 + 8 kg PRD-002 + 7 kg PRD-005.
  const deductions = new Map<string, number>();
  for (const [productId, qty] of requested) {
    if (productId === BUNDLE_PRODUCT_ID) continue;
    deductions.set(productId, (deductions.get(productId) ?? 0) + qty);
  }
  const bundleQty = requested.get(BUNDLE_PRODUCT_ID) ?? 0;
  if (bundleQty > 0) {
    for (const [componentId, perKrat] of Object.entries(BUNDLE_RECIPE)) {
      deductions.set(
        componentId,
        (deductions.get(componentId) ?? 0) + bundleQty * perKrat
      );
    }
  }

  try {
    for (const [productId, qty] of deductions) {
      const prod = productMap.get(productId);
      if (!prod) {
        throw new HTTPException(409, {
          message: `Komponen Paket B2B ${productId} tidak ditemukan di gudang`,
        });
      }
      if (prod.stock_kg < qty) {
        throw new HTTPException(409, {
          message: `Stok ${prod.name} tidak cukup: tersedia ${prod.stock_kg} ${unitLabel(
            prod.unit
          )}, diminta ${qty} ${unitLabel(prod.unit)}`,
        });
      }

      // Compare-and-swap: update hanya sah kalau stok belum berubah sejak dibaca,
      // sehingga dua checkout bersamaan tidak bisa menjual stok yang sama.
      const { data: updated, error } = await supabase
        .from('products')
        .update({ stock_kg: prod.stock_kg - qty })
        .eq('id', prod.id)
        .eq('stock_kg', prod.stock_kg)
        .select('id');
      if (error) {
        throw new HTTPException(502, { message: `Kurangi stok ${prod.name} gagal: ${error.message}` });
      }
      if (!updated || updated.length === 0) {
        throw new HTTPException(409, {
          message: `Stok ${prod.name} berubah saat checkout. Muat ulang lalu coba lagi.`,
        });
      }
      applied.push({ id: prod.id, before: prod.stock_kg, after: prod.stock_kg - qty });
    }

    const shippingFee = buyerMode === 'B2B' ? 25000 : 10000;
    const newOrderRow = await insertWithRetry(
      'orders',
      'id',
      () => ({
        id: `VC-${ymd()}-${pad3()}`,
        date_label: 'Baru saja',
        buyer_mode: buyerMode,
        status: 'PACKING_QR',
        status_label: 'Pembayaran Terverifikasi • Packing & Label QR',
        courier: isPeakSeason ? '3PL Segar Express (Peak Season)' : 'Armada Cold-Van VC-02',
        qr_code_resi: `QR-WMS-${randomInt(10000, 100000)}-BDG`,
        payment_method: 'QRIS Instan (Terverifikasi)',
        items: orderItems,
        shipping_fee: shippingFee,
        total_amount: Math.round(subtotal + shippingFee),
        pod_signed: false,
        pod_timestamp: null,
      }),
      'Simpan order'
    );

    // Checkout = permintaan nyata, jadi langsung tercatat sebagai data historis.
    // Kalau pencatatan gagal, order tetap dianggap sukses (hanya di-log).
    const sales = await recordSalesFromOrder(
      [...requested].map(([commodityId, qty]) => ({ commodityId, qty })),
      buyerMode
    );

    // Komponen sudah terpotong, jadi kapasitas rakitan Paket B2B ikut turun.
    await syncBundleStock();

    return c.json({ success: true, orderId: newOrderRow.id, salesHistory: sales });
  } catch (err) {
    // Kompensasi: kembalikan stok yang sudah terlanjur dipotong kalau order gagal dibuat.
    for (const a of applied.reverse()) {
      const { error } = await supabase
        .from('products')
        .update({ stock_kg: a.before })
        .eq('id', a.id)
        .eq('stock_kg', a.after);
      if (error) {
        console.error(`[rollback] gagal memulihkan stok ${a.id}: ${error.message}`);
      }
    }
    throw err;
  }
});

// 6. Update Status Logistik Gudang -> Kurir
app.patch('/api/v1/orders/:id/advance', async (c) => {
  const id = c.req.param('id');
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil order gagal: ${error.message}` });
  if (!order) throw new HTTPException(404, { message: 'Order tidak ditemukan' });

  const next =
    order.status === 'PACKING_QR'
      ? { status: 'IN_TRANSIT', status_label: 'Dikirim Kurir Berpendingin (Scan QR OK)' }
      : order.status === 'IN_TRANSIT'
        ? { status: 'ARRIVED_PENDING_POD', status_label: 'Tiba • Menunggu Tanda Tangan POD' }
        : null;

  if (!next) {
    return c.json({ success: true, changed: false, status: order.status });
  }

  const { error: updErr } = await supabase.from('orders').update(next).eq('id', id);
  if (updErr) throw new HTTPException(502, { message: `Update status gagal: ${updErr.message}` });

  return c.json({ success: true, changed: true, status: next.status });
});

// 7. Konfirmasi Tanda Tangan Digital POD
app.post('/api/v1/orders/:id/pod', async (c) => {
  const id = c.req.param('id');
  const timeStr = new Date().toTimeString().slice(0, 5);

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      status_label: 'Selesai • POD Terarsip',
      pod_signed: true,
      pod_timestamp: `Hari ini, ${timeStr} WIB`,
    })
    .eq('id', id)
    .select('id');
  if (error) throw new HTTPException(502, { message: `Simpan POD gagal: ${error.message}` });
  if (!data || data.length === 0) throw new HTTPException(404, { message: 'Order tidak ditemukan' });

  return c.json({ success: true });
});

// 8. Kirim Formulir Rencana Pasokan ke Petani Mitra
app.post('/api/v1/supply-plans', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const commodityId = String(body.commodityId ?? '').trim();
  if (!commodityId) badRequest('commodityId wajib diisi');
  const product = await requireProduct(commodityId);

  const targetQty = Math.round(toNumber(body.recommendedRestockKg, 'recommendedRestockKg', { min: 1 }));
  const refPrice = Math.round(
    toNumber(body.refFarmerPrice ?? product.base_farmer_price, 'refFarmerPrice', { min: 1 })
  );

  const newPlan = await insertWithRetry(
    'supply_plans',
    'id',
    () => ({
      id: `SPF-${new Date().getFullYear()}-${pad3()}`,
      commodity_id: commodityId,
      commodity_name: product.name,
      target_qty: targetQty,
      ref_price: refPrice,
      harvest_date: formatHarvestDate(),
      status: 'WAITING_FARMER',
      confirmed_qty: targetQty,
      agreed_price: refPrice,
    }),
    'Simpan rencana pasokan'
  );

  return c.json({ success: true, id: newPlan.id });
});

// 9. Petani Konfirmasi Volume & Harga
app.patch('/api/v1/supply-plans/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const qty = Math.round(toNumber(body.qty, 'qty', { min: 1 }));
  const price = Math.round(toNumber(body.price, 'price', { min: 1 }));

  const { data: plan, error: readErr } = await supabase
    .from('supply_plans')
    .select('id,status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new HTTPException(502, { message: `Ambil rencana gagal: ${readErr.message}` });
  if (!plan) throw new HTTPException(404, { message: `Rencana ${id} tidak ditemukan` });

  // Sekali PO terbit, rencana tidak boleh dikonfirmasi ulang (status akan mundur).
  const { data: existingPo, error: poErr } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .eq('plan_id', id)
    .maybeSingle();
  if (poErr) throw new HTTPException(502, { message: `Cek PO gagal: ${poErr.message}` });
  if (existingPo) {
    conflict(`PO ${existingPo.po_number} sudah diterbitkan untuk rencana ${id}`);
  }

  const { data, error } = await supabase
    .from('supply_plans')
    .update({ confirmed_qty: qty, agreed_price: price, status: 'CONFIRMED_BY_FARMER' })
    .eq('id', id)
    .eq('status', 'WAITING_FARMER')
    .select('id');
  if (error) throw new HTTPException(502, { message: `Konfirmasi gagal: ${error.message}` });
  if (!data || data.length === 0) {
    conflict(`Rencana ${id} sudah dikonfirmasi sebelumnya (status ${plan.status})`);
  }

  return c.json({ success: true });
});

// 10. Terbitkan Purchase Order (PO) ke Petani
app.post('/api/v1/purchase-orders', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = String(body.planId ?? '').trim();
  if (!planId) badRequest('planId wajib diisi');

  const { data: plan, error } = await supabase.from('supply_plans').select('*').eq('id', planId).maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil rencana gagal: ${error.message}` });
  if (!plan) throw new HTTPException(404, { message: 'Rencana pasokan tidak ditemukan' });

  if (plan.status === 'WAITING_FARMER') {
    conflict('Petani belum mengonfirmasi volume & harga untuk rencana ini');
  }
  if (plan.status !== 'CONFIRMED_BY_FARMER') {
    conflict(`Rencana berstatus ${plan.status}; PO hanya bisa diterbitkan setelah konfirmasi petani`);
  }
  if (!Number.isInteger(plan.confirmed_qty) || plan.confirmed_qty <= 0) {
    conflict('Jumlah yang disepakati petani tidak valid');
  }

  const existing = await supabase.from('purchase_orders').select('po_number').eq('plan_id', planId).maybeSingle();
  if (existing.error) throw new HTTPException(502, { message: `Cek PO gagal: ${existing.error.message}` });
  if (existing.data) {
    throw new HTTPException(409, {
      message: `PO ${existing.data.po_number} sudah diterbitkan untuk rencana ${planId}`,
    });
  }

  const poNumber = await insertWithRetry(
    'purchase_orders',
    'po_number',
    () => ({
      po_number: `PO-VC-${new Date().getFullYear()}-${pad3()}`,
      plan_id: plan.id,
      commodity_id: plan.commodity_id,
      commodity_name: plan.commodity_name,
      qty: plan.confirmed_qty,
      agreed_price: plan.agreed_price,
      total_amount: Math.round(plan.confirmed_qty * plan.agreed_price),
      status: 'PO_ISSUED',
    }),
    'Simpan purchase order'
  );

  const { error: planErr } = await supabase
    .from('supply_plans')
    .update({ status: 'PO_ISSUED' })
    .eq('id', planId);
  if (planErr) {
    // Kompensasi: jangan tinggalkan PO tanpa status rencana yang sinkron.
    await supabase.from('purchase_orders').delete().eq('po_number', poNumber.po_number);
    throw new HTTPException(502, { message: `Update status rencana gagal: ${planErr.message}` });
  }

  return c.json({ success: true, poNumber: poNumber.po_number });
});

// 11. Petani Kirim Hasil Panen ke Gudang QC
app.patch('/api/v1/purchase-orders/:poNumber/ship', async (c) => {
  const poNumber = c.req.param('poNumber');

  const { data: po, error: readErr } = await supabase
    .from('purchase_orders')
    .select('po_number,status')
    .eq('po_number', poNumber)
    .maybeSingle();
  if (readErr) throw new HTTPException(502, { message: `Ambil PO gagal: ${readErr.message}` });
  if (!po) throw new HTTPException(404, { message: `PO ${poNumber} tidak ditemukan` });

  if (po.status === 'QC_COMPLETED') {
    conflict(`PO ${poNumber} sudah selesai QC dan tidak bisa dikirim ulang`);
  }
  if (po.status === 'HARVEST_SENT_TO_QC') {
    return c.json({ success: true, changed: false, status: po.status });
  }
  if (po.status !== 'PO_ISSUED') {
    conflict(`PO ${poNumber} berstatus ${po.status}; tidak bisa dikirim ke QC`);
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update({ status: 'HARVEST_SENT_TO_QC' })
    .eq('po_number', poNumber)
    .eq('status', 'PO_ISSUED')
    .select('po_number');
  if (error) throw new HTTPException(502, { message: `Update PO gagal: ${error.message}` });
  if (!data || data.length === 0) {
    conflict(`Status PO ${poNumber} berubah saat diproses. Muat ulang lalu coba lagi.`);
  }

  return c.json({ success: true, changed: true });
});

// 12. Inspeksi QC & Grading (Grade-A Segar + Grade-B Zero Waste)
// 1 kg Grade-B diolah menjadi 2 pouch puree 500g (asumsi massa 1:1),
// sesuai satuan jual PRD-003 (`/pouch 500g`) — bukan kg.
const POUCHES_PER_KG_GRADE_B = 2;

app.post('/api/v1/qc/grading', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const poNumber = String(body.poNumber ?? '').trim();
  if (!poNumber) badRequest('poNumber wajib diisi');

  const gradeA = Math.round(toNumber(body.gradeAKg, 'gradeAKg'));
  const gradeB = Math.round(toNumber(body.gradeBKg, 'gradeBKg'));

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('po_number', poNumber)
    .maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil PO gagal: ${error.message}` });
  if (!po) throw new HTTPException(404, { message: 'PO tidak ditemukan' });
  if (po.status === 'QC_COMPLETED') {
    conflict(`PO ${poNumber} sudah selesai QC`);
  }
  if (po.status !== 'HARVEST_SENT_TO_QC') {
    conflict(`PO ${poNumber} berstatus ${po.status}; kirim hasil panen ke QC terlebih dahulu`);
  }
  if (gradeA + gradeB !== po.qty) {
    badRequest(
      `Total Grade-A + Grade-B (${gradeA + gradeB}) harus sama dengan qty PO (${po.qty}) agar tidak ada kg yang hilang`
    );
  }

  const freshProduct = await requireProduct(po.commodity_id);
  const { error: aErr } = await supabase
    .from('products')
    .update({ stock_kg: freshProduct.stock_kg + gradeA })
    .eq('id', po.commodity_id);
  if (aErr) throw new HTTPException(502, { message: `Tambah stok Grade-A gagal: ${aErr.message}` });

  const gradeBPouches = gradeB * POUCHES_PER_KG_GRADE_B;

  if (gradeB > 0) {
    const { data: processed, error: bReadErr } = await supabase
      .from('products')
      .select('stock_kg')
      .eq('id', 'PRD-003')
      .maybeSingle();
    if (bReadErr) throw new HTTPException(502, { message: `Ambil produk olahan gagal: ${bReadErr.message}` });
    if (!processed) throw new HTTPException(404, { message: 'Komoditas olahan PRD-003 tidak ditemukan' });

    const { error: bErr } = await supabase
      .from('products')
      .update({ stock_kg: processed.stock_kg + gradeBPouches })
      .eq('id', 'PRD-003');
    if (bErr) throw new HTTPException(502, { message: `Tambah stok Grade-B gagal: ${bErr.message}` });
  }

  const { error: poErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'QC_COMPLETED' })
    .eq('po_number', poNumber);
  if (poErr) throw new HTTPException(502, { message: `Update status QC gagal: ${poErr.message}` });

  // Audit split grading. Best-effort: kalau kolom audit belum dibuat di Supabase,
  // QC tetap sukses dan hanya dicatat di log.
  try {
    const { error: auditErr } = await supabase
      .from('purchase_orders')
      .update({
        grade_a_kg: gradeA,
        grade_b_kg: gradeB,
        grade_b_pouches: gradeBPouches,
        qc_completed_at: new Date().toISOString(),
      })
      .eq('po_number', poNumber);
    if (auditErr) throw auditErr;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
    console.warn(`[qc] audit grading ${poNumber} tidak tersimpan: ${message}`);
  }

  // Grade-A yang baru masuk bisa menambah kapasitas rakitan Paket B2B.
  await syncBundleStock();

  return c.json({ success: true, gradeAKg: gradeA, gradeBKg: gradeB, gradeBPouches, processedProductId: 'PRD-003' });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error('[Unhandled]', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.notFound((c) => c.json({ error: `Endpoint ${c.req.method} ${c.req.path} tidak ada` }, 404));

const port = Number(process.env.PORT) || 3000;
console.log(`VeggieChain Backend Core berjalan di http://localhost:${port}`);
serve({ fetch: app.fetch, port });
