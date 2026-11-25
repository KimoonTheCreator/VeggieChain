import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { randomInt } from 'node:crypto';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase.js';
import type { Database } from './lib/database.types.js';
import { generateAiDemandForecast } from './services/aiForecast.js';

dotenv.config();

const app = new Hono();

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://veggiechain.skews.dev',
];

const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;

app.use(
  '/*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return origin;
      if (/^https:\/\/[a-z0-9-]+\.skews\.dev$/i.test(origin)) return origin;
      return '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// ==================== HELPER: ERROR, TIMEZONE & ID ====================

type SupabaseError = { message: string; code?: string; details?: string | null };

const MIGRATION_PATH = 'supabase/migrations/20261125_001_schema_hardening_and_rpcs.sql';

function must<T>(res: { data: T | null; error: SupabaseError | null }, what: string): NonNullable<T> {
  if (res.error) {
    console.error(`[Supabase] ${what}: ${res.error.message} (code=${res.error.code ?? '-'})`);
    throw new HTTPException(502, { message: `${what} gagal: ${res.error.message}` });
  }
  return res.data as NonNullable<T>;
}

function isMissingRelationOrFunction(error: SupabaseError | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205'
  );
}

/** Map Postgres RPC exceptions (RAISE EXCEPTION 'CODE: msg') to HTTP status codes. */
function throwRpcError(error: SupabaseError, what: string): never {
  if (error.code === 'PGRST202') {
    console.error(`[Supabase] ${what}: RPC belum terpasang (${error.message})`);
    throw new HTTPException(503, {
      message: `Fungsi database belum terpasang. Jalankan migrasi ${MIGRATION_PATH} di SQL Editor Supabase.`,
    });
  }

  if (error.code === 'P0001') {
    const match = error.message.match(/^([A-Z_]+):\s*(.+)$/);
    const tag = match?.[1] ?? '';
    const cleanMsg = match?.[2] ?? error.message;

    if (
      tag === 'PRODUCT_NOT_FOUND' ||
      tag === 'PLAN_NOT_FOUND' ||
      tag === 'PO_NOT_FOUND'
    ) {
      throw new HTTPException(404, { message: cleanMsg });
    }
    if (
      tag === 'INSUFFICIENT_STOCK' ||
      tag === 'COMPONENT_NOT_FOUND' ||
      tag === 'PO_ALREADY_EXISTS' ||
      tag === 'PLAN_NOT_CONFIRMED' ||
      tag === 'INVALID_PLAN_STATUS' ||
      tag === 'PO_ALREADY_QC' ||
      tag === 'INVALID_PO_STATUS'
    ) {
      throw new HTTPException(409, { message: cleanMsg });
    }
    if (
      tag === 'BUNDLE_READONLY' ||
      tag === 'INVALID_STOCK' ||
      tag === 'INVALID_BUYER_MODE' ||
      tag === 'EMPTY_CART' ||
      tag === 'INVALID_CART_ITEM' ||
      tag === 'INVALID_QTY' ||
      tag === 'INVALID_GRADE' ||
      tag === 'GRADE_SUM_MISMATCH'
    ) {
      throw new HTTPException(400, { message: cleanMsg });
    }
  }

  console.error(`[Supabase] ${what}: ${error.message} (code=${error.code ?? '-'})`);
  throw new HTTPException(502, { message: `${what} gagal: ${error.message}` });
}

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function conflict(message: string): never {
  throw new HTTPException(409, { message });
}

function toNumber(value: unknown, field: string, { min = 0 } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n)) badRequest(`${field} harus berupa angka`);
  if (n < min) badRequest(`${field} tidak boleh kurang dari ${min}`);
  return n;
}

const pad3 = () => String(randomInt(0, 1000)).padStart(3, '0');
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Bagian tanggal & jam di zona waktu WIB (Asia/Jakarta, UTC+7). */
function getWibParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === '24' ? '00' : parts.hour,
    minute: parts.minute,
  };
}

function wibIsoDate(d = new Date()): string {
  const p = getWibParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function wibYmd(d = new Date()): string {
  const p = getWibParts(d);
  return `${p.year}${p.month}${p.day}`;
}

function formatWibTimestamp(iso: string | null | undefined, fallback = '-'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const p = getWibParts(d);
  const monthIdx = Math.max(0, Math.min(11, Number(p.month) - 1));
  return `${Number(p.day)} ${MONTHS_ID[monthIdx]} ${p.year}, ${p.hour}:${p.minute} WIB`;
}

function formatHarvestDate(daysAhead = 4): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const p = getWibParts(d);
  const monthIdx = Math.max(0, Math.min(11, Number(p.month) - 1));
  return `${Number(p.day)} ${MONTHS_ID[monthIdx]} ${p.year}`;
}

/** Weekend versi bisnis VeggieChain: Jumat, Sabtu, Minggu. */
function isWeekendIso(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return false;
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 5 || dow === 6;
}

/**
 * Paket B2B (PRD-004) adalah bundling VIRTUAL 25 kg: stoknya dihitung otomatis
 * dari komponen segar (10 kg Brokoli + 8 kg Tomat + 7 kg Wortel).
 */
const BUNDLE_PRODUCT_ID = 'PRD-004';
const BUNDLE_RECIPE: Readonly<Record<string, number>> = {
  'PRD-001': 10,
  'PRD-002': 8,
  'PRD-005': 7,
};
const POUCHES_PER_KG_GRADE_B = 2;
const PROCESSED_GRADE_B_PRODUCT_ID = 'PRD-003';

function deriveBundleStock(products: Array<{ id: string; stock_kg: number | null }>): number {
  let capacity = Number.POSITIVE_INFINITY;
  for (const [componentId, perKrat] of Object.entries(BUNDLE_RECIPE)) {
    const component = products.find((p) => p.id === componentId);
    if (!component) return 0;
    capacity = Math.min(capacity, Math.floor(Number(component.stock_kg ?? 0) / perKrat));
  }
  return Number.isFinite(capacity) ? Math.max(0, capacity) : 0;
}

async function requireProduct(id: string) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil produk gagal: ${error.message}` });
  if (!data) throw new HTTPException(404, { message: `Komoditas ${id} tidak ditemukan` });
  return data;
}

// ==================== ENDPOINTS ====================

app.get('/health', async (c) => {
  const { error } = await supabase.from('products').select('id', { head: true, count: 'exact' });
  if (error) {
    return c.json(
      {
        status: 'degraded',
        db: 'error',
        error: error.message,
        service: 'VeggieChain Core + DeepSeek AI',
      },
      503
    );
  }
  return c.json({
    status: 'ok',
    db: 'connected',
    service: 'VeggieChain Core + DeepSeek AI',
  });
});

// 1. Ambil seluruh state aplikasi dari Supabase (bounded queries + optional settings/ledger)
app.get('/api/v1/state', async (c) => {
  const [prodRes, orderRes, planRes, poRes, salesRes, settingsRes, movementsRes] = await Promise.all([
    supabase.from('products').select('*').order('id', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('supply_plans').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(100),
    supabase
      .from('sales_history')
      .select('id, recorded_date, commodity_id, sold_b2c_kg, sold_b2b_kg, total_demand_kg, weather_condition, is_weekend')
      .order('recorded_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(200),
    supabase.from('app_settings').select('key, value').eq('key', 'is_peak_season').maybeSingle(),
    supabase
      .from('stock_movements')
      .select('id, product_id, delta, stock_before, stock_after, reason, reference_id, note, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const productsRaw = must(prodRes, 'Ambil products') ?? [];
  const ordersRaw = must(orderRes, 'Ambil orders') ?? [];
  const plansRaw = must(planRes, 'Ambil supply plans') ?? [];
  const poRaw = must(poRes, 'Ambil purchase orders') ?? [];
  const salesRaw = must(salesRes, 'Ambil sales history') ?? [];

  let isPeakSeason = false;
  if (!settingsRes.error && settingsRes.data) {
    isPeakSeason = Boolean(settingsRes.data.value);
  } else if (settingsRes.error && !isMissingRelationOrFunction(settingsRes.error)) {
    console.warn(`[Supabase] Ambil app_settings: ${settingsRes.error.message}`);
  }

  let stockMovements: Database['public']['Tables']['stock_movements']['Row'][] = [];
  if (!movementsRes.error && movementsRes.data) {
    stockMovements = movementsRes.data;
  } else if (movementsRes.error && !isMissingRelationOrFunction(movementsRes.error)) {
    console.warn(`[Supabase] Ambil stock_movements: ${movementsRes.error.message}`);
  }

  const bundleCapacity = deriveBundleStock(productsRaw);

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
    date: o.created_at ? formatWibTimestamp(o.created_at, o.date_label) : o.date_label,
    buyerMode: o.buyer_mode,
    status: o.status,
    statusLabel: o.status_label,
    courier: o.courier,
    qrCodeResi: o.qr_code_resi,
    paymentMethod: o.payment_method,
    items: o.items,
    shippingFee: Number(o.shipping_fee),
    total: Number(o.total_amount),
    podSigned: o.pod_signed,
    podTimestamp: o.pod_signed_at
      ? formatWibTimestamp(o.pod_signed_at, o.pod_timestamp ?? '-')
      : o.pod_timestamp,
    podSignatureData: o.pod_signature_data ?? null,
    returnRequested: Boolean(o.return_requested),
    returnReason: o.return_reason ?? null,
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
    totalAmount: Number(po.total_amount),
    status: po.status,
    gradeAKg: po.grade_a_kg ?? null,
    gradeBKg: po.grade_b_kg ?? null,
    gradeBPouches: po.grade_b_pouches ?? null,
    qcCompletedAt: po.qc_completed_at ? formatWibTimestamp(po.qc_completed_at) : null,
  }));

  return c.json({
    products,
    orders,
    supplyPlans,
    purchaseOrders,
    salesHistory: salesRaw,
    isPeakSeason,
    stockMovements,
  });
});

// 1b. Simpan konfigurasi Peak Season (3PL) ke Supabase
app.patch('/api/v1/settings/peak-season', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.enabled !== 'boolean') {
    badRequest('enabled harus berupa boolean');
  }

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: 'is_peak_season',
      value: body.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    if (isMissingRelationOrFunction(error)) {
      throw new HTTPException(503, {
        message: `Tabel app_settings belum ada. Jalankan migrasi ${MIGRATION_PATH} di SQL Editor Supabase.`,
      });
    }
    throw new HTTPException(502, { message: `Simpan pengaturan peak season gagal: ${error.message}` });
  }

  return c.json({ success: true, isPeakSeason: body.enabled });
});

// 2. Endpoint DeepSeek AI Demand Forecasting
app.post('/api/v1/forecast/predict', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const commodityId = String(body.commodityId ?? 'PRD-001');

  try {
    const result = await generateAiDemandForecast({
      commodityId,
      weatherCondition: (body.weatherCondition as 'cerah' | 'hujan_sedang' | 'hujan_lebat') || 'hujan_sedang',
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

// 3. Input Data Penjualan Harian Manual ke Supabase (atomic upsert by commodity_id + recorded_date)
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
      : wibIsoDate();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordedDate)) badRequest('Format recordedDate harus YYYY-MM-DD');

  const payload: Database['public']['Tables']['sales_history']['Insert'] = {
    recorded_date: recordedDate,
    commodity_id: commodityId,
    sold_b2c_kg: soldB2c,
    sold_b2b_kg: soldB2b,
    total_demand_kg: totalDemand,
    weather_condition: typeof body.weatherCondition === 'string' ? body.weatherCondition : 'cerah',
    is_weekend: body.isWeekend === undefined ? isWeekendIso(recordedDate) : Boolean(body.isWeekend),
  };

  const { error } = await supabase
    .from('sales_history')
    .upsert(payload, { onConflict: 'commodity_id,recorded_date' });

  if (error) {
    throw new HTTPException(502, { message: `Simpan histori gagal: ${error.message}` });
  }

  return c.json({ success: true, mode: 'upserted', recordedDate, totalDemandKg: totalDemand });
});

// 4. Update Stok Cold Storage Manual secara atomik (tercatat di stock_movements + sync PRD-004)
app.patch('/api/v1/products/:id/stock', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const stockKg = toNumber(body.stockKg, 'stockKg');
  if (!Number.isInteger(stockKg)) {
    badRequest('stockKg harus bilangan bulat karena stok dihitung dalam satuan jual');
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 200) : null;

  const { data, error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: id,
    p_new_stock: stockKg,
    p_note: note,
  });

  if (error) throwRpcError(error, 'Update stok');

  return c.json({ success: true, ...(typeof data === 'object' && data !== null ? data : { id, stockKg }) });
});

// 5. Checkout Pesanan Pembeli secara atomik via RPC checkout_order
app.post('/api/v1/orders', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const buyerMode = body.buyerMode;
  const isPeakSeason = Boolean(body.isPeakSeason);

  if (buyerMode !== 'B2C' && buyerMode !== 'B2B') badRequest("buyerMode harus 'B2C' atau 'B2B'");
  if (!Array.isArray(body.cart) || body.cart.length === 0) badRequest('cart tidak boleh kosong');

  const cartPayload: Array<{ productId: string; qty: number }> = [];
  for (const raw of body.cart as Array<Record<string, unknown>>) {
    const productId = String(raw?.productId ?? '').trim();
    if (!productId) badRequest('Setiap item cart wajib punya productId');
    const qty = toNumber(raw?.qty, `qty untuk ${productId}`, { min: 1 });
    if (!Number.isInteger(qty)) {
      badRequest(`qty untuk ${productId} harus bilangan bulat (satuan jual)`);
    }
    cartPayload.push({ productId, qty });
  }

  const shippingFee = buyerMode === 'B2B' ? 25000 : 10000;
  const courier = isPeakSeason ? '3PL Segar Express (Peak Season)' : 'Armada Cold-Van VC-02';
  const recordedDate = wibIsoDate();
  const isWeekend = isWeekendIso(recordedDate);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const orderId = `VC-${wibYmd()}-${pad3()}`;
    const qrCodeResi = `QR-WMS-${randomInt(10000, 100000)}-BDG`;

    const { data, error } = await supabase.rpc('checkout_order', {
      p_order_id: orderId,
      p_buyer_mode: buyerMode,
      p_courier: courier,
      p_qr_code_resi: qrCodeResi,
      p_payment_method: 'QRIS Instan (Terverifikasi)',
      p_shipping_fee: shippingFee,
      p_cart: cartPayload,
      p_recorded_date: recordedDate,
      p_is_weekend: isWeekend,
    });

    if (!error) {
      const result = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
      return c.json({
        success: true,
        orderId: result.orderId ?? orderId,
        totalAmount: result.totalAmount,
        bundleCapacity: result.bundleCapacity,
      });
    }

    if (error.code === '23505') {
      console.warn(`[Supabase] Checkout: ID ${orderId} bentrok, ulangi (${attempt}/5)`);
      continue;
    }

    throwRpcError(error, 'Checkout order');
  }

  throw new HTTPException(503, { message: 'Simpan order gagal: tidak dapat membuat ID unik' });
});

// 6. Update Status Logistik Gudang -> Kurir (compare-and-swap pada status)
app.patch('/api/v1/orders/:id/advance', async (c) => {
  const id = c.req.param('id');
  const { data: order, error } = await supabase.from('orders').select('id, status').eq('id', id).maybeSingle();
  if (error) throw new HTTPException(502, { message: `Ambil order gagal: ${error.message}` });
  if (!order) throw new HTTPException(404, { message: 'Order tidak ditemukan' });

  const next =
    order.status === 'PACKING_QR'
      ? { status: 'IN_TRANSIT' as const, status_label: 'Dikirim Kurir Berpendingin (Scan QR OK)' }
      : order.status === 'IN_TRANSIT'
        ? { status: 'ARRIVED_PENDING_POD' as const, status_label: 'Tiba • Menunggu Tanda Tangan POD' }
        : null;

  if (!next) {
    return c.json({ success: true, changed: false, status: order.status });
  }

  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update(next)
    .eq('id', id)
    .eq('status', order.status)
    .select('id');

  if (updErr) throw new HTTPException(502, { message: `Update status gagal: ${updErr.message}` });
  if (!updated || updated.length === 0) {
    conflict(`Status order ${id} berubah saat diproses. Muat ulang lalu coba lagi.`);
  }

  return c.json({ success: true, changed: true, status: next.status });
});

// 7. Konfirmasi Tanda Tangan Digital POD (validasi status + arsipkan tanda tangan & timestamptz)
app.post('/api/v1/orders/:id/pod', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  let signatureDataUrl: string | null = null;
  if (typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.trim() !== '') {
    const raw = body.signatureDataUrl.trim();
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw)) {
      badRequest('Format tanda tangan digital tidak valid');
    }
    if (raw.length > 250_000) {
      badRequest('Ukuran gambar tanda tangan melebihi batas (250 KB)');
    }
    signatureDataUrl = raw;
  }

  const { data: order, error: readErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new HTTPException(502, { message: `Ambil order gagal: ${readErr.message}` });
  if (!order) throw new HTTPException(404, { message: 'Order tidak ditemukan' });

  if (order.status === 'COMPLETED') {
    conflict(`Order ${id} sudah selesai dan POD sudah ditandatangani`);
  }
  if (order.status !== 'ARRIVED_PENDING_POD') {
    conflict(`Order ${id} berstatus ${order.status}; POD hanya bisa ditandatangani setelah kurir tiba`);
  }

  const nowIso = new Date().toISOString();
  const formattedTs = formatWibTimestamp(nowIso);

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      status_label: 'Selesai • POD Terarsip',
      pod_signed: true,
      pod_timestamp: formattedTs,
      pod_signed_at: nowIso,
      pod_signature_data: signatureDataUrl,
    })
    .eq('id', id)
    .eq('status', 'ARRIVED_PENDING_POD')
    .select('id');

  if (error) {
    if (isMissingRelationOrFunction(error)) {
      throw new HTTPException(503, {
        message: `Kolom POD baru belum ada di database. Jalankan migrasi ${MIGRATION_PATH} di SQL Editor Supabase.`,
      });
    }
    throw new HTTPException(502, { message: `Simpan POD gagal: ${error.message}` });
  }
  if (!data || data.length === 0) {
    conflict(`Status order ${id} berubah saat menandatangani POD. Muat ulang lalu coba lagi.`);
  }

  return c.json({ success: true, podTimestamp: formattedTs });
});

// 7b. Ajukan Klaim Retur QC untuk pesanan yang tiba / selesai
app.post('/api/v1/orders/:id/return', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : 'Klaim mutu / ketidaksesuaian QC saat serah terima';

  const { data: order, error: readErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new HTTPException(502, { message: `Ambil order gagal: ${readErr.message}` });
  if (!order) throw new HTTPException(404, { message: 'Order tidak ditemukan' });

  if (order.status === 'RETURN_REQUESTED') {
    conflict(`Retur QC untuk order ${id} sudah diajukan sebelumnya`);
  }
  if (order.status !== 'ARRIVED_PENDING_POD' && order.status !== 'COMPLETED') {
    conflict(`Retur QC hanya bisa diajukan setelah pesanan tiba (status saat ini: ${order.status})`);
  }

  const nowIso = new Date().toISOString();

  const { error: retErr } = await supabase.from('order_returns').insert({
    order_id: id,
    reason,
    status: 'OPEN',
  });
  if (retErr) {
    if (isMissingRelationOrFunction(retErr)) {
      throw new HTTPException(503, {
        message: `Tabel order_returns belum ada. Jalankan migrasi ${MIGRATION_PATH} di SQL Editor Supabase.`,
      });
    }
    throw new HTTPException(502, { message: `Simpan klaim retur gagal: ${retErr.message}` });
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update({
      status: 'RETURN_REQUESTED',
      status_label: 'Retur QC Diajukan • Ditinjau Tim Gudang',
      return_requested: true,
      return_reason: reason,
      return_requested_at: nowIso,
    })
    .eq('id', id);

  if (updErr) {
    throw new HTTPException(502, { message: `Update status retur order gagal: ${updErr.message}` });
  }

  return c.json({ success: true, orderId: id, status: 'RETURN_REQUESTED' });
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

  const year = getWibParts().year;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const id = `SPF-${year}-${pad3()}`;
    const { error } = await supabase.from('supply_plans').insert({
      id,
      commodity_id: commodityId,
      commodity_name: product.name,
      target_qty: targetQty,
      ref_price: refPrice,
      harvest_date: formatHarvestDate(),
      status: 'WAITING_FARMER',
      confirmed_qty: targetQty,
      agreed_price: refPrice,
    });
    if (!error) return c.json({ success: true, id });
    if (error.code === '23505') {
      console.warn(`[Supabase] Supply plan ID ${id} bentrok, ulangi (${attempt}/5)`);
      continue;
    }
    throw new HTTPException(502, { message: `Simpan rencana pasokan gagal: ${error.message}` });
  }

  throw new HTTPException(503, { message: 'Simpan rencana pasokan gagal: tidak dapat membuat ID unik' });
});

// 9. Petani Konfirmasi Volume & Harga
app.patch('/api/v1/supply-plans/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const qty = Math.round(toNumber(body.qty, 'qty', { min: 1 }));
  const price = Math.round(toNumber(body.price, 'price', { min: 1 }));

  const { data: plan, error: readErr } = await supabase
    .from('supply_plans')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw new HTTPException(502, { message: `Ambil rencana gagal: ${readErr.message}` });
  if (!plan) throw new HTTPException(404, { message: `Rencana ${id} tidak ditemukan` });

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

// 10. Terbitkan Purchase Order (PO) ke Petani secara atomik via RPC issue_purchase_order
app.post('/api/v1/purchase-orders', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = String(body.planId ?? '').trim();
  if (!planId) badRequest('planId wajib diisi');

  const year = getWibParts().year;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const poNumber = `PO-VC-${year}-${pad3()}`;
    const { data, error } = await supabase.rpc('issue_purchase_order', {
      p_plan_id: planId,
      p_po_number: poNumber,
    });

    if (!error) {
      const result = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
      return c.json({ success: true, poNumber: result.poNumber ?? poNumber });
    }

    if (error.code === '23505') {
      if (error.message.includes('plan_id')) {
        conflict(`PO sudah diterbitkan untuk rencana ${planId}`);
      }
      console.warn(`[Supabase] PO number ${poNumber} bentrok, ulangi (${attempt}/5)`);
      continue;
    }

    throwRpcError(error, 'Terbitkan purchase order');
  }

  throw new HTTPException(503, { message: 'Simpan purchase order gagal: tidak dapat membuat nomor PO unik' });
});

// 11. Petani Kirim Hasil Panen ke Gudang QC
app.patch('/api/v1/purchase-orders/:poNumber/ship', async (c) => {
  const poNumber = c.req.param('poNumber');

  const { data: po, error: readErr } = await supabase
    .from('purchase_orders')
    .select('po_number, status')
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

// 12. Inspeksi QC & Grading secara atomik via RPC complete_qc_grading
app.post('/api/v1/qc/grading', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const poNumber = String(body.poNumber ?? '').trim();
  if (!poNumber) badRequest('poNumber wajib diisi');

  const gradeA = Math.round(toNumber(body.gradeAKg, 'gradeAKg'));
  const gradeB = Math.round(toNumber(body.gradeBKg, 'gradeBKg'));

  const { data, error } = await supabase.rpc('complete_qc_grading', {
    p_po_number: poNumber,
    p_grade_a_kg: gradeA,
    p_grade_b_kg: gradeB,
    p_pouches_per_kg: POUCHES_PER_KG_GRADE_B,
    p_processed_product_id: PROCESSED_GRADE_B_PRODUCT_ID,
  });

  if (error) throwRpcError(error, 'Simpan hasil QC');

  const result = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return c.json({
    success: true,
    gradeAKg: result.gradeAKg ?? gradeA,
    gradeBKg: result.gradeBKg ?? gradeB,
    gradeBPouches: result.gradeBPouches ?? gradeB * POUCHES_PER_KG_GRADE_B,
    processedProductId: result.processedProductId ?? PROCESSED_GRADE_B_PRODUCT_ID,
  });
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
