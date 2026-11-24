import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import dotenv from 'dotenv';
import { supabase } from './lib/supabase.js';
import { generateAiDemandForecast } from './services/aiForecast.js';

dotenv.config();

const app = new Hono();
app.use('/*', cors());

app.get('/health', (c) => c.json({ status: 'ok', service: 'VeggieChain Core + Gemini AI' }));

// 1. Ambil seluruh state aplikasi dari Supabase
app.get('/api/v1/state', async (c) => {
  const [prodRes, orderRes, planRes, poRes] = await Promise.all([
    supabase.from('products').select('*').order('id', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('supply_plans').select('*').order('created_at', { ascending: false }),
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
  ]);

  const products = (prodRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    grade: p.grade,
    badgeText: p.badge_text,
    badgeColor: p.badge_color,
    farmer: p.farmer,
    warehouse: p.warehouse,
    stockKg: p.stock_kg,
    baseWeeklySales: p.base_weekly_sales,
    baseFarmerPrice: p.base_farmer_price,
    rating: Number(p.rating),
    priceB2C: p.price_b2c,
    priceB2B: p.price_b2b,
    unit: p.unit,
    image: p.image_url,
    qcNotes: p.qc_notes,
  }));

  const orders = (orderRes.data || []).map((o) => ({
    id: o.id,
    date: o.date_label,
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

  const supplyPlans = (planRes.data || []).map((s) => ({
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

  const purchaseOrders = (poRes.data || []).map((po) => ({
    poNumber: po.po_number,
    planId: po.plan_id,
    commodityId: po.commodity_id,
    commodityName: po.commodity_name,
    qty: po.qty,
    agreedPrice: po.agreed_price,
    totalAmount: po.total_amount,
    status: po.status,
  }));

  return c.json({ products, orders, supplyPlans, purchaseOrders });
});

// 2. Endpoint Gemini AI Demand Forecasting
app.post('/api/v1/forecast/predict', async (c) => {
  const body = await c.req.json();
  const result = await generateAiDemandForecast({
    commodityId: body.commodityId || 'PRD-001',
    weatherCondition: body.weatherCondition || 'hujan_sedang',
    isHolidayWeek: Boolean(body.isHolidayWeek),
    customNote: body.customNote || '',
  });
  return c.json(result);
});

// 3. Input Data Penjualan Harian Manual ke Supabase (Konteks Baru untuk Gemini AI)
app.post('/api/v1/sales-history', async (c) => {
  const body = await c.req.json();
  const soldB2c = Number(body.soldB2cKg) || 0;
  const soldB2b = Number(body.soldB2bKg) || 0;
  const totalDemand = Number((soldB2c + soldB2b).toFixed(2));
  const recordedDate = body.recordedDate || new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from('sales_history').insert({
    recorded_date: recordedDate,
    commodity_id: body.commodityId,
    sold_b2c_kg: soldB2c,
    sold_b2b_kg: soldB2b,
    total_demand_kg: totalDemand,
    weather_condition: body.weatherCondition || 'cerah',
    is_weekend: Boolean(body.isWeekend),
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ success: true });
});

// 4. Update Stok Cold Storage Manual di Supabase
app.patch('/api/v1/products/:id/stock', async (c) => {
  const id = c.req.param('id');
  const { stockKg } = await c.req.json();
  await supabase.from('products').update({ stock_kg: Math.max(0, Number(stockKg) || 0) }).eq('id', id);
  return c.json({ success: true });
});

// 5. Checkout Pesanan Pembeli
app.post('/api/v1/orders', async (c) => {
  const { buyerMode, cart, isPeakSeason } = await c.req.json();
  const { data: allProducts } = await supabase.from('products').select('*');
  const productMap = new Map((allProducts || []).map((p) => [p.id, p]));

  const orderItems = [];
  let subtotal = 0;

  for (const item of cart) {
    const prod = productMap.get(item.productId);
    if (!prod) continue;
    const price = buyerMode === 'B2B' ? prod.price_b2b : prod.price_b2c;
    subtotal += price * item.qty;
    orderItems.push({ name: prod.name, qty: item.qty, price });

    const nextStock = Math.max(0, prod.stock_kg - item.qty);
    await supabase.from('products').update({ stock_kg: nextStock }).eq('id', prod.id);
  }

  const shippingFee = buyerMode === 'B2B' ? 25000 : 10000;
  const newOrderRow = {
    id: 'VC-20261125-' + Math.floor(100 + Math.random() * 899),
    date_label: 'Baru saja',
    buyer_mode: buyerMode,
    status: 'PACKING_QR',
    status_label: 'Pembayaran Terverifikasi • Packing & Label QR',
    courier: isPeakSeason ? '3PL Segar Express (Peak Season)' : 'Armada Cold-Van VC-02',
    qr_code_resi: 'QR-WMS-' + Math.floor(10000 + Math.random() * 89999) + '-BDG',
    payment_method: 'QRIS Instan (Terverifikasi)',
    items: orderItems,
    shipping_fee: shippingFee,
    total_amount: subtotal + shippingFee,
    pod_signed: false,
    pod_timestamp: null,
  };

  await supabase.from('orders').insert(newOrderRow);
  return c.json({ success: true, orderId: newOrderRow.id });
});

// 6. Update Status Logistik Gudang -> Kurir
app.patch('/api/v1/orders/:id/advance', async (c) => {
  const id = c.req.param('id');
  const { data: order } = await supabase.from('orders').select('*').eq('id', id).single();
  if (!order) return c.json({ error: 'Order tidak ditemukan' }, 404);

  if (order.status === 'PACKING_QR') {
    await supabase
      .from('orders')
      .update({ status: 'IN_TRANSIT', status_label: 'Dikirim Kurir Berpendingin (Scan QR OK)' })
      .eq('id', id);
  } else if (order.status === 'IN_TRANSIT') {
    await supabase
      .from('orders')
      .update({ status: 'ARRIVED_PENDING_POD', status_label: 'Tiba • Menunggu Tanda Tangan POD' })
      .eq('id', id);
  }
  return c.json({ success: true });
});

// 7. Konfirmasi Tanda Tangan Digital POD
app.post('/api/v1/orders/:id/pod', async (c) => {
  const id = c.req.param('id');
  const timeStr = new Date().toTimeString().slice(0, 5);
  await supabase
    .from('orders')
    .update({
      status: 'COMPLETED',
      status_label: 'Selesai • POD Terarsip',
      pod_signed: true,
      pod_timestamp: `Hari ini, ${timeStr} WIB`,
    })
    .eq('id', id);
  return c.json({ success: true });
});

// 8. Kirim Formulir Rencana Pasokan ke Petani Mitra
app.post('/api/v1/supply-plans', async (c) => {
  const body = await c.req.json();
  const newPlan = {
    id: 'SPF-2026-' + Math.floor(100 + Math.random() * 899),
    commodity_id: body.commodityId,
    commodity_name: body.commodityName,
    target_qty: body.recommendedRestockKg,
    ref_price: body.refFarmerPrice,
    harvest_date: '29 Nov 2026',
    status: 'WAITING_FARMER',
    confirmed_qty: body.recommendedRestockKg,
    agreed_price: body.refFarmerPrice,
  };
  await supabase.from('supply_plans').insert(newPlan);
  return c.json({ success: true, id: newPlan.id });
});

// 9. Petani Konfirmasi Volume & Harga
app.patch('/api/v1/supply-plans/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const { qty, price } = await c.req.json();
  await supabase
    .from('supply_plans')
    .update({ confirmed_qty: qty, agreed_price: price, status: 'CONFIRMED_BY_FARMER' })
    .eq('id', id);
  return c.json({ success: true });
});

// 10. Terbitkan Purchase Order (PO) ke Petani
app.post('/api/v1/purchase-orders', async (c) => {
  const { planId } = await c.req.json();
  const { data: plan } = await supabase.from('supply_plans').select('*').eq('id', planId).single();
  if (!plan) return c.json({ error: 'Rencana pasokan tidak ditemukan' }, 404);

  await supabase.from('supply_plans').update({ status: 'PO_ISSUED' }).eq('id', planId);

  const poNumber = 'PO-VC-2026-' + Math.floor(100 + Math.random() * 899);
  await supabase.from('purchase_orders').insert({
    po_number: poNumber,
    plan_id: plan.id,
    commodity_id: plan.commodity_id,
    commodity_name: plan.commodity_name,
    qty: plan.confirmed_qty,
    agreed_price: plan.agreed_price,
    total_amount: plan.confirmed_qty * plan.agreed_price,
    status: 'PO_ISSUED',
  });

  return c.json({ success: true, poNumber });
});

// 11. Petani Kirim Hasil Panen ke Gudang QC
app.patch('/api/v1/purchase-orders/:poNumber/ship', async (c) => {
  const poNumber = c.req.param('poNumber');
  await supabase
    .from('purchase_orders')
    .update({ status: 'HARVEST_SENT_TO_QC' })
    .eq('po_number', poNumber);
  return c.json({ success: true });
});

// 12. Inspeksi QC & Grading (Grade-A Segar + Grade-B Zero Waste)
app.post('/api/v1/qc/grading', async (c) => {
  const { poNumber, gradeAKg, gradeBKg } = await c.req.json();
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('po_number', poNumber)
    .single();
  if (!po) return c.json({ error: 'PO tidak ditemukan' }, 404);

  const { data: freshProd } = await supabase
    .from('products')
    .select('stock_kg')
    .eq('id', po.commodity_id)
    .single();

  if (freshProd) {
    await supabase
      .from('products')
      .update({ stock_kg: freshProd.stock_kg + gradeAKg })
      .eq('id', po.commodity_id);
  }

  if (gradeBKg > 0) {
    const { data: processedProd } = await supabase
      .from('products')
      .select('stock_kg')
      .eq('id', 'PRD-003')
      .single();
    if (processedProd) {
      await supabase
        .from('products')
        .update({ stock_kg: processedProd.stock_kg + gradeBKg })
        .eq('id', 'PRD-003');
    }
  }

  await supabase
    .from('purchase_orders')
    .update({ status: 'QC_COMPLETED' })
    .eq('po_number', poNumber);

  return c.json({ success: true });
});

const port = Number(process.env.PORT) || 3000;
console.log(`VeggieChain Backend Core berjalan di http://localhost:${port}`);
serve({ fetch: app.fetch, port });