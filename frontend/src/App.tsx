import { useEffect, useState } from 'react';
import { Wifi, BatteryFull, Signal } from 'lucide-react';
import type {
  BuyerMode,
  CartItem,
  ForecastResult,
  Order,
  Product,
  PurchaseOrder,
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
    } catch {
      // Tetap gunakan state lokal jika backend belum dijalankan
    }
  };

  useEffect(() => {
    refreshState();
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

  const handleAddToCart = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stockKg <= 0) {
      notify('Stok gudang sedang kosong.', true);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { productId, qty: 1 }];
    });
    notify(`${product.name} ditambahkan ke keranjang.`);
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, qty: item.qty + delta }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const handleCheckout = async () => {
    try {
      await veggieApi.checkoutOrder(buyerMode, cart, isPeakSeason);
      await refreshState();
    } catch {
      setProducts((prev) =>
        prev.map((prod) => {
          const bought = cart.find((c) => c.productId === prod.id);
          return bought
            ? { ...prod, stockKg: Math.max(0, prod.stockKg - bought.qty) }
            : prod;
        })
      );
    }
    setCart([]);
    notify('Pembayaran valid! Picking Ticket diterbitkan ke Gudang & Kurir.');
  };

  const handleConfirmPod = async (orderId: string) => {
    try {
      await veggieApi.confirmPod(orderId);
      await refreshState();
    } catch {
      const timeStr = new Date().toTimeString().slice(0, 5);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'COMPLETED',
                statusLabel: 'Selesai • POD Terarsip',
                podSigned: true,
                podTimestamp: `Hari ini, ${timeStr} WIB`,
              }
            : o
        )
      );
    }
    notify('POD ditandatangani & pesanan selesai.');
  };

  // ==================== HANDLERS: GUDANG, AI & SOURCING ====================
  const handleDispatchSupplyPlan = async (forecast: ForecastResult) => {
    try {
      const res = await veggieApi.dispatchSupplyPlan(forecast);
      await refreshState();
      notify(`Formulir ${res.id} dikirim ke Portal Petani Mitra.`);
    } catch {
      notify('Gagal mengirim formulir ke server.', true);
    }
  };

  const handleIssuePo = async (planId: string) => {
    try {
      const res = await veggieApi.issuePurchaseOrder(planId);
      await refreshState();
      notify(`Purchase Order ${res.poNumber} diterbitkan ke Petani Mitra.`);
    } catch {
      notify('Gagal menerbitkan PO.', true);
    }
  };

  const handleSubmitQcGrading = async (
    poNumber: string,
    gradeAKg: number,
    gradeBKg: number
  ) => {
    try {
      await veggieApi.submitQcGrading(poNumber, gradeAKg, gradeBKg);
      await refreshState();
      notify(
        `QC Selesai: +${gradeAKg}kg Grade-A & +${gradeBKg}kg Olahan Grade-B masuk stok WMS.`
      );
    } catch {
      notify('Gagal menyimpan hasil QC.', true);
    }
  };

  const handleTogglePeakSeason = () => {
    setIsPeakSeason((prev) => {
      const next = !prev;
      notify(
        next
          ? 'Peak Season Aktif: Pesanan baru dialihkan ke armada 3PL.'
          : 'Mode Normal: Menggunakan armada Cold-Van internal.'
      );
      return next;
    });
  };

  const handleAdvanceOrder = async (orderId: string) => {
    try {
      await veggieApi.advanceOrder(orderId);
      await refreshState();
      notify('Status pengiriman diperbarui di sistem WMS.');
    } catch {
      notify('Gagal memperbarui status pengiriman.', true);
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
    } catch {
      notify('Gagal mengonfirmasi kesepakatan.', true);
    }
  };

  const handleSendHarvestToQc = async (poNumber: string) => {
    try {
      await veggieApi.sendHarvestToQc(poNumber);
      await refreshState();
      notify(`Hasil panen ${poNumber} dikirim ke Hub Gudang untuk inspeksi QC.`);
    } catch {
      notify('Gagal memperbarui status pengiriman panen.', true);
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