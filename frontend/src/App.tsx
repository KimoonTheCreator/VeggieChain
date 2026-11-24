import { useState } from 'react';
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

export function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('buyer');
  const [opsSubTab, setOpsSubTab] = useState<'forecast' | 'qc' | 'logistics'>(
    'forecast'
  );

  // Shared Domain States (Nantinya akan disinkronkan ke Backend / Supabase)
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

  const handleSwitchRole = (role: UserRole, subTab?: string) => {
    setActiveRole(role);
    if (role === 'ops' && subTab) {
      setOpsSubTab(subTab as 'forecast' | 'qc' | 'logistics');
    }
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

  const handleCheckout = () => {
    const orderItems = cart.map((item) => {
      const prod = products.find((p) => p.id === item.productId)!;
      const price = buyerMode === 'B2B' ? prod.priceB2B : prod.priceB2C;
      return { name: prod.name, qty: item.qty, price };
    });

    const subtotal = orderItems.reduce((s, i) => s + i.price * i.qty, 0);
    const shippingFee = buyerMode === 'B2B' ? 25000 : 10000;

    // Kurangi stok gudang real-time
    setProducts((prev) =>
      prev.map((prod) => {
        const bought = cart.find((c) => c.productId === prod.id);
        return bought
          ? { ...prod, stockKg: Math.max(0, prod.stockKg - bought.qty) }
          : prod;
      })
    );

    const newOrder: Order = {
      id: 'VC-20261124-' + Math.floor(100 + Math.random() * 899),
      date: 'Baru saja',
      status: 'PACKING_QR',
      statusLabel: 'Pembayaran Terverifikasi • Packing & Label QR',
      courier: isPeakSeason
        ? '3PL Segar Express (Peak Season)'
        : 'Armada Cold-Van VC-02',
      qrCodeResi: 'QR-WMS-' + Math.floor(10000 + Math.random() * 89999) + '-BDG',
      paymentMethod: 'QRIS Instan (Terverifikasi)',
      items: orderItems,
      shippingFee,
      total: subtotal + shippingFee,
      podSigned: false,
      podTimestamp: null,
    };

    setOrders((prev) => [newOrder, ...prev]);
    setCart([]);
    notify('Pembayaran valid! Picking Ticket diterbitkan ke Gudang & Kurir.');
  };

  const handleConfirmPod = (orderId: string) => {
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
    notify('POD ditandatangani & pesanan selesai.');
  };

  // ==================== HANDLERS: GUDANG, ML & SOURCING ====================
  const handleDispatchSupplyPlan = (forecast: ForecastResult) => {
    const newPlan: SupplyPlan = {
      id: 'SPF-2026-' + Math.floor(100 + Math.random() * 899),
      commodityId: forecast.commodityId,
      commodityName: forecast.commodityName,
      targetQty: forecast.recommendedRestockKg,
      refPrice: forecast.refFarmerPrice,
      harvestDate: '29 Nov 2026',
      status: 'WAITING_FARMER',
      confirmedQty: forecast.recommendedRestockKg,
      agreedPrice: forecast.refFarmerPrice,
    };
    setSupplyPlans((prev) => [newPlan, ...prev]);
    notify(`Formulir ${newPlan.id} dikirim ke Portal Petani Mitra.`);
  };

  const handleIssuePo = (planId: string) => {
    const plan = supplyPlans.find((p) => p.id === planId);
    if (!plan) return;

    setSupplyPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, status: 'PO_ISSUED' } : p))
    );

    const newPo: PurchaseOrder = {
      poNumber: 'PO-VC-2026-' + Math.floor(100 + Math.random() * 899),
      planId: plan.id,
      commodityId: plan.commodityId,
      commodityName: plan.commodityName,
      qty: plan.confirmedQty,
      agreedPrice: plan.agreedPrice,
      totalAmount: plan.confirmedQty * plan.agreedPrice,
      status: 'PO_ISSUED',
    };

    setPurchaseOrders((prev) => [newPo, ...prev]);
    notify(`Purchase Order ${newPo.poNumber} diterbitkan ke Petani Mitra.`);
  };

  const handleSubmitQcGrading = (
    poNumber: string,
    gradeAKg: number,
    gradeBKg: number
  ) => {
    const po = purchaseOrders.find((p) => p.poNumber === poNumber);
    if (!po) return;

    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id === po.commodityId) {
          return { ...prod, stockKg: prod.stockKg + gradeAKg };
        }
        if (prod.id === 'PRD-003' && gradeBKg > 0) {
          return { ...prod, stockKg: prod.stockKg + gradeBKg };
        }
        return prod;
      })
    );

    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.poNumber === poNumber ? { ...p, status: 'QC_COMPLETED' } : p
      )
    );
    notify(
      `QC Selesai: +${gradeAKg}kg Grade-A & +${gradeBKg}kg Olahan Grade-B masuk stok WMS.`
    );
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

  const handleAdvanceOrder = (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (o.status === 'PACKING_QR') {
          notify(`Resi ${o.qrCodeResi} dipindai. Kurir menuju lokasi pelanggan.`);
          return {
            ...o,
            status: 'IN_TRANSIT',
            statusLabel: 'Dikirim Kurir Berpendingin (Scan QR OK)',
          };
        }
        if (o.status === 'IN_TRANSIT') {
          notify('Kurir tiba di lokasi. Pembeli dapat menandatangani POD.');
          return {
            ...o,
            status: 'ARRIVED_PENDING_POD',
            statusLabel: 'Tiba • Menunggu Tanda Tangan POD',
          };
        }
        return o;
      })
    );
  };

  // ==================== HANDLERS: PETANI MITRA ====================
  const handleConfirmSupply = (planId: string, qty: number, price: number) => {
    setSupplyPlans((prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              confirmedQty: qty,
              agreedPrice: price,
              status: 'CONFIRMED_BY_FARMER',
            }
          : p
      )
    );
    notify(`Kesepakatan ${planId} dikirim ke Tim Sourcing VeggieChain.`);
  };

  const handleSendHarvestToQc = (poNumber: string) => {
    setPurchaseOrders((prev) =>
      prev.map((p) =>
        p.poNumber === poNumber ? { ...p, status: 'HARVEST_SENT_TO_QC' } : p
      )
    );
    notify(`Hasil panen ${poNumber} dikirim ke Hub Gudang untuk inspeksi QC.`);
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