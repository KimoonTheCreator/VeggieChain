import { useEffect, useState } from 'react';
import { Wifi, BatteryFull, Signal } from 'lucide-react';
import type {
  BuyerMode,
  CartItem,
  ForecastResult,
  Order,
  Product,
  PurchaseOrder,
  SalesHistoryRecord,
  SupplyPlan,
  UserRole,
} from './types/veggiechain';
import {
  INITIAL_ORDERS,
  INITIAL_PRODUCTS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SUPPLY_PLANS,
} from './data/mockData';
import { RoleSwitcher } from './components/common/RoleSwitcher';
import { Toast } from './components/common/Toast';
import { BuyerApp } from './components/buyer/BuyerApp';
import { OpsApp } from './components/ops/OpsApp';
import { FarmerApp } from './components/farmer/FarmerApp';
import { veggieApi } from './services/api';
import { stockUnitLabel } from './utils/format';

export function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('buyer');
  const [opsSubTab, setOpsSubTab] = useState<'forecast' | 'qc' | 'logistics'>(
    'forecast'
  );

  // Shared Domain States (Tersinkronisasi dengan Backend & Supabase)
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [buyerMode, setBuyerMode] = useState<BuyerMode>('B2C');
  const [cart, setCart] = useState<CartItem[]>([
    { productId: 'PRD-001', qty: 2 },
  ]);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [supplyPlans, setSupplyPlans] = useState<SupplyPlan[]>(
    INITIAL_SUPPLY_PLANS
  );
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(
    INITIAL_PURCHASE_ORDERS
  );
  const [salesHistory, setSalesHistory] = useState<SalesHistoryRecord[]>([]);
  const [isPeakSeason, setIsPeakSeason] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ msg: string; warn: boolean } | null>(
    null
  );

  const notify = (msg: string, warn = false) => {
    setToast({ msg, warn });
    setTimeout(() => setToast(null), 3000);
  };

  // Ambil data terbaru dari Supabase melalui backend-core
  const refreshState = async () => {
    try {
      const data = await veggieApi.fetchState();
      if (data.products?.length) setProducts(data.products);
      if (data.orders) setOrders(data.orders);
      if (data.supplyPlans) setSupplyPlans(data.supplyPlans);
      if (data.purchaseOrders) setPurchaseOrders(data.purchaseOrders);
      if (data.salesHistory) setSalesHistory(data.salesHistory);
      if (typeof data.isPeakSeason === 'boolean') setIsPeakSeason(data.isPeakSeason);
    } catch (err) {
      // Jangan diam saja: tanpa ini, UI tampak normal memakai data mock.
      notify(
        `Gagal sinkron dengan server: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  // Saat tab/jendela kembali aktif (mis. checkout dilakukan di tab lain),
  // tarik state terbaru supaya stok dan riwayat penjualan tidak basi.
  useEffect(() => {
    const sync = () => refreshState();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleSwitchRole = (role: UserRole, subTab?: string) => {
    setActiveRole(role);
    if (role === 'ops' && subTab) {
      setOpsSubTab(subTab as 'forecast' | 'qc' | 'logistics');
    }
    refreshState();
  };

  // ==================== HANDLERS: PEMBELI ====================
  const handleToggleBuyerMode = () => {
    setBuyerMode((prev) => {
      const next = prev === 'B2C' ? 'B2B' : 'B2C';
      notify(
        next === 'B2B'
          ? 'Mode B2B Aktif: Menampilkan harga grosir mitra.'
          : 'Mode B2C Aktif: Menampilkan harga eceran rumah tangga.'
      );
      return next;
    });
  };

  const handleAddToCart = (productId: string, qty = 1) => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stockKg <= 0) {
      notify('Stok gudang sedang kosong.', true);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      notify('Jumlah yang dimasukkan tidak valid.', true);
      return;
    }
    const existing = cart.find((i) => i.productId === productId);
    const nextQty = (existing?.qty ?? 0) + Math.floor(qty);
    if (nextQty > product.stockKg) {
      notify(
        `Stok ${product.name} hanya ${product.stockKg} ${stockUnitLabel(product.unit)}.`,
        true
      );
      return;
    }
    setCart((prev) =>
      existing
        ? prev.map((i) =>
            i.productId === productId ? { ...i, qty: nextQty } : i
          )
        : [...prev, { productId, qty: Math.floor(qty) }]
    );
    notify(
      `${Math.floor(qty)} ${stockUnitLabel(product.unit)} ${product.name} ditambahkan ke keranjang.`
    );
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    const item = cart.find((i) => i.productId === productId);
    if (!item) return;
    const product = products.find((p) => p.id === productId);
    const nextQty = item.qty + delta;
    if (delta > 0 && product && nextQty > product.stockKg) {
      notify(
        `Stok ${product.name} hanya ${product.stockKg} ${stockUnitLabel(product.unit)}.`,
        true
      );
      return;
    }
    setCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty: nextQty } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const handleCheckout = async () => {
    try {
      await veggieApi.checkoutOrder(buyerMode, cart, isPeakSeason);
      await refreshState();
      setCart([]);
      notify('Pembayaran valid! Picking Ticket diterbitkan ke Gudang & Kurir.');
    } catch (err) {
      // Jangan klaim sukses: dulu kegagalan insert ditutupi dengan mutasi lokal.
      notify(
        `Checkout gagal: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleConfirmPod = async (orderId: string, signatureDataUrl?: string) => {
    try {
      await veggieApi.confirmPod(orderId, signatureDataUrl);
      await refreshState();
      notify('POD ditandatangani & pesanan selesai.');
    } catch (err) {
      notify(
        `Gagal menandatangani POD: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleRequestOrderReturn = async (orderId: string, reason?: string) => {
    try {
      await veggieApi.requestOrderReturn(orderId, reason);
      await refreshState();
      notify('Klaim retur QC berhasil dicatat ke sistem gudang.');
    } catch (err) {
      notify(
        `Gagal mengajukan retur QC: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  // ==================== HANDLERS: GUDANG, AI & SOURCING ====================
  const handleDispatchSupplyPlan = async (forecast: ForecastResult) => {
    try {
      const res = await veggieApi.dispatchSupplyPlan(forecast);
      await refreshState();
      notify(`Formulir ${res.id} dikirim ke Portal Petani Mitra.`);
    } catch (err) {
      notify(
        `Gagal mengirim formulir: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleIssuePo = async (planId: string) => {
    try {
      const res = await veggieApi.issuePurchaseOrder(planId);
      await refreshState();
      notify(`Purchase Order ${res.poNumber} diterbitkan ke Petani Mitra.`);
    } catch (err) {
      notify(
        `Gagal menerbitkan PO: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleSubmitQcGrading = async (
    poNumber: string,
    gradeAKg: number,
    gradeBKg: number
  ) => {
    try {
      const result = await veggieApi.submitQcGrading(
        poNumber,
        gradeAKg,
        gradeBKg
      );
      await refreshState();
      const pouches = Number(result?.gradeBPouches ?? gradeBKg * 2);
      notify(
        `QC Selesai: +${gradeAKg} kg Grade-A & +${pouches} pouch Grade-B (${gradeBKg} kg olahan) masuk stok WMS.`
      );
    } catch (err) {
      notify(
        `Gagal menyimpan hasil QC: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleTogglePeakSeason = async () => {
    const next = !isPeakSeason;
    try {
      await veggieApi.setPeakSeason(next);
      setIsPeakSeason(next);
      notify(
        next
          ? 'Peak Season Aktif: Pesanan baru dialihkan ke armada 3PL.'
          : 'Mode Normal: Menggunakan armada Cold-Van internal.'
      );
    } catch (err) {
      notify(
        `Gagal menyimpan mode Peak Season: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleAdvanceOrder = async (orderId: string) => {
    try {
      await veggieApi.advanceOrder(orderId);
      await refreshState();
      notify('Status pengiriman diperbarui di sistem WMS.');
    } catch (err) {
      notify(
        `Gagal memperbarui status: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  // ==================== HANDLERS: PETANI MITRA ====================
  const handleConfirmSupply = async (
    planId: string,
    qty: number,
    price: number
  ) => {
    try {
      await veggieApi.confirmFarmerSupply(planId, qty, price);
      await refreshState();
      notify(`Kesepakatan ${planId} dikirim ke Tim Sourcing VeggieChain.`);
    } catch (err) {
      notify(
        `Gagal mengonfirmasi kesepakatan: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const handleSendHarvestToQc = async (poNumber: string) => {
    try {
      await veggieApi.sendHarvestToQc(poNumber);
      await refreshState();
      notify(`Hasil panen ${poNumber} dikirim ke Hub Gudang untuk inspeksi QC.`);
    } catch (err) {
      notify(
        `Gagal mengirim hasil panen: ${err instanceof Error ? err.message : 'tidak diketahui'}`,
        true
      );
    }
  };

  const statusBarTheme =
    activeRole === 'buyer'
      ? 'bg-[#98e6b8] text-slate-900'
      : activeRole === 'ops'
      ? 'bg-white text-slate-900'
      : 'bg-emerald-900 text-white';

  return (
    <div className="min-h-screen flex items-center justify-center sm:py-5">
      <div className="relative w-full sm:w-[412px] h-screen sm:h-[850px] bg-slate-50 sm:rounded-[40px] sm:border-[8px] sm:border-slate-900 shadow-2xl overflow-hidden flex flex-col">
        {/* Status Bar */}
        <div
          className={`hidden sm:flex justify-between items-center px-7 pt-3 pb-1 text-xs font-semibold select-none z-30 transition-colors ${statusBarTheme}`}
        >
          <span>09:41</span>
          <div className="w-24 h-5 bg-slate-900 rounded-full" />
          <div className="flex items-center gap-1.5">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <BatteryFull className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Role Switcher */}
        <RoleSwitcher
          activeRole={activeRole}
          onSelectRole={(role) => handleSwitchRole(role)}
          hasOpsPending={purchaseOrders.some(
            (p) => p.status === 'HARVEST_SENT_TO_QC'
          )}
          hasFarmerPending={supplyPlans.some(
            (s) => s.status === 'WAITING_FARMER'
          )}
        />

        {/* Toast Notification */}
        <Toast message={toast?.msg ?? null} isWarning={toast?.warn} />

        {/* Active Role View */}
        {activeRole === 'buyer' && (
          <BuyerApp
            products={products}
            orders={orders}
            cart={cart}
            buyerMode={buyerMode}
            isPeakSeason={isPeakSeason}
            onToggleBuyerMode={handleToggleBuyerMode}
            onAddToCart={handleAddToCart}
            onUpdateCartQty={handleUpdateCartQty}
            onCheckout={handleCheckout}
            onConfirmPod={handleConfirmPod}
            onRequestReturn={handleRequestOrderReturn}
            onSwitchRole={handleSwitchRole}
            onNotify={notify}
          />
        )}

        {activeRole === 'ops' && (
          <OpsApp
            products={products}
            supplyPlans={supplyPlans}
            purchaseOrders={purchaseOrders}
            orders={orders}
            salesHistory={salesHistory}
            isPeakSeason={isPeakSeason}
            initialSubTab={opsSubTab}
            onDispatchSupplyPlan={handleDispatchSupplyPlan}
            onIssuePo={handleIssuePo}
            onSubmitQcGrading={handleSubmitQcGrading}
            onTogglePeakSeason={handleTogglePeakSeason}
            onAdvanceOrder={handleAdvanceOrder}
            onSwitchRole={(role) => handleSwitchRole(role)}
            onRefreshState={refreshState}
            onNotify={notify}
          />
        )}

        {activeRole === 'farmer' && (
          <FarmerApp
            supplyPlans={supplyPlans}
            purchaseOrders={purchaseOrders}
            onConfirmSupply={handleConfirmSupply}
            onSendHarvestToQc={handleSendHarvestToQc}
            onSwitchRole={handleSwitchRole}
          />
        )}
      </div>
    </div>
  );
}

export default App;