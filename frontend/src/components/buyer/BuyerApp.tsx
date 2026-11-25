import React, { useRef, useState } from 'react';
import {
  User,
  ShoppingBasket,
  Search,
  SlidersHorizontal,
  Snowflake,
  RotateCcw,
  Home,
  ClipboardList,
  X,
  Sprout,
  ClipboardCheck,
  QrCode,
  Truck,
  ChevronRight,
  LineChart,
  Tractor,
} from 'lucide-react';
import type {
  BuyerMode,
  CartItem,
  Order,
  Product,
  ProductGrade,
  UserRole,
} from '../../types/veggiechain';
import { formatRupiah, stockUnitLabel } from '../../utils/format';
import { ProductCard } from './ProductCard';

interface BuyerAppProps {
  products: Product[];
  orders: Order[];
  cart: CartItem[];
  buyerMode: BuyerMode;
  isPeakSeason: boolean;
  onToggleBuyerMode: () => void;
  onAddToCart: (productId: string, qty?: number) => void;
  onUpdateCartQty: (productId: string, delta: number) => void;
  onCheckout: () => void;
  onConfirmPod: (orderId: string, signatureDataUrl?: string) => void;
  onRequestReturn: (orderId: string, reason?: string) => void;
  onSwitchRole: (role: UserRole, subTab?: string) => void;
  onNotify: (msg: string, isWarning?: boolean) => void;
}

type BuyerTab = 'beranda' | 'katalog' | 'pesanan' | 'profil';

export const BuyerApp: React.FC<BuyerAppProps> = ({
  products,
  orders,
  cart,
  buyerMode,
  isPeakSeason,
  onToggleBuyerMode,
  onAddToCart,
  onUpdateCartQty,
  onCheckout,
  onConfirmPod,
  onRequestReturn,
  onSwitchRole,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<BuyerTab>('beranda');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedGrade, setSelectedGrade] = useState<'ALL' | ProductGrade>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderFilter, setOrderFilter] = useState<'active' | 'completed'>('active');

  // Modal States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [podOrder, setPodOrder] = useState<Order | null>(null);
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyDraft, setQtyDraft] = useState<string>('1');

  // Signature Pad Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const totalCartItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const hasPendingPod = orders.some((o) => o.status === 'ARRIVED_PENDING_POD');

  const filteredHomeProducts = products.filter((p) => {
    const matchCat =
      selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchGrade = selectedGrade === 'ALL' || p.grade === selectedGrade;
    const matchQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.farmer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchGrade && matchQuery;
  });

  const filteredCatalogProducts = products.filter(
    (p) => selectedGrade === 'ALL' || p.grade === selectedGrade
  );

  const filteredOrders = orders.filter((o) =>
    orderFilter === 'active'
      ? o.status !== 'COMPLETED'
      : o.status === 'COMPLETED'
  );

  // Canvas Signature Handlers
  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSigned(false);
  };

  const handlePodSubmit = () => {
    if (!podOrder) return;
    if (!hasSigned) {
      onNotify('Mohon bubuhkan tanda tangan terlebih dahulu.', true);
      return;
    }
    const signatureDataUrl = canvasRef.current?.toDataURL('image/png');
    onConfirmPod(podOrder.id, signatureDataUrl);
    setPodOrder(null);
    setHasSigned(false);
  };

  const cartSubtotal = cart.reduce((sum, item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return sum;
    const price = buyerMode === 'B2B' ? prod.priceB2B : prod.priceB2C;
    return sum + price * item.qty;
  }, 0);

  const shippingFee = buyerMode === 'B2B' ? 25000 : 10000;

  // ---- Dialog jumlah sebelum masuk keranjang ----
  const openQtyPrompt = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod || prod.stockKg <= 0) {
      onNotify('Stok gudang sedang kosong.', true);
      return;
    }
    const inCart = cart.find((i) => i.productId === productId)?.qty ?? 0;
    if (inCart >= prod.stockKg) {
      onNotify(
        `Stok ${prod.name} hanya ${prod.stockKg} ${stockUnitLabel(prod.unit)} dan semuanya sudah ada di keranjang.`,
        true
      );
      return;
    }
    setQtyDraft('1');
    setQtyProduct(prod);
  };

  const qtyInCart = qtyProduct
    ? cart.find((i) => i.productId === qtyProduct.id)?.qty ?? 0
    : 0;
  const qtyRemaining = qtyProduct ? Math.max(0, qtyProduct.stockKg - qtyInCart) : 0;
  const qtyPrice = qtyProduct
    ? buyerMode === 'B2B'
      ? qtyProduct.priceB2B
      : qtyProduct.priceB2C
    : 0;
  const qtyNumber = Math.floor(Number(qtyDraft));
  const qtyValid =
    Number.isFinite(qtyNumber) && qtyNumber > 0 && qtyNumber <= qtyRemaining;

  const confirmQty = () => {
    if (!qtyProduct) return;
    if (!qtyValid) {
      onNotify(
        `Jumlah harus antara 1 dan ${qtyRemaining} ${stockUnitLabel(qtyProduct.unit)}.`,
        true
      );
      return;
    }
    onAddToCart(qtyProduct.id, qtyNumber);
    setQtyProduct(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <main className="flex-1 overflow-y-auto no-scrollbar pb-28">
        {/* ==================== TAB 1: BERANDA ==================== */}
        {activeTab === 'beranda' && (
          <div>
            <div className="veggie-header-gradient px-5 pt-4 pb-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-white/90 border border-emerald-200/70 flex items-center justify-center shadow-sm p-1">
                    <img
                      src="/favicon.svg"
                      alt="Logo VeggieChain"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="font-extrabold text-lg tracking-tight text-slate-900">
                    Veggie<span className="text-[#117a37]">Chain</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleBuyerMode}
                    className="px-2.5 py-1 rounded-full bg-white/85 backdrop-blur-sm border border-emerald-200 text-[11px] font-bold text-emerald-800 shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    <User className="w-3 h-3" />
                    <span>
                      {buyerMode === 'B2B'
                        ? 'B2B Mitra Resto'
                        : 'B2C Rumah Tangga'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(true)}
                    className="relative w-10 h-10 rounded-full bg-white/90 text-slate-800 flex items-center justify-center shadow-sm cursor-pointer"
                  >
                    <ShoppingBasket className="w-4 h-4 text-[#117a37]" />
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                      {totalCartItems}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-5 relative z-10">
                <div>
                  <h1 className="text-[22px] font-extrabold text-slate-900 leading-tight">
                    Selamat Datang,
                  </h1>
                  <p className="text-base font-semibold text-slate-600">
                    {buyerMode === 'B2B'
                      ? 'Budi (Resto Daun Hijau)'
                      : 'Budi Santoso'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('profil')}
                  className="w-11 h-11 rounded-full bg-emerald-100/90 border-2 border-white text-emerald-800 font-bold text-base flex items-center justify-center shadow-sm cursor-pointer"
                >
                  B
                </button>
              </div>

              <div className="relative z-10 flex items-center bg-white rounded-full p-1.5 pl-4 shadow-sm border border-slate-200/70">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari sayur segar, buah, atau olahan..."
                  className="w-full text-sm text-slate-700 placeholder-slate-400 focus:outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(true)}
                  className="w-10 h-10 rounded-full bg-[#117a37] hover:bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-sm cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 4 Kategori */}
            <div className="px-5 pt-1 pb-5">
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Sayur Segar', icon: '🥬', bg: 'bg-emerald-100/80 border-emerald-200/60' },
                  { label: 'Buah Lokal', icon: '🍅', bg: 'bg-rose-100/70 border-rose-200/60' },
                  { label: 'Olahan Grade-B', icon: '🥫', bg: 'bg-amber-100/80 border-amber-200/60' },
                  { label: 'Paket B2B', icon: '📦', bg: 'bg-teal-100/80 border-teal-200/60' },
                ].map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() =>
                      setSelectedCategory((prev) =>
                        prev === cat.label ? 'ALL' : cat.label
                      )
                    }
                    className="group flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-1.5 transition ${
                        cat.bg
                      } ${
                        selectedCategory === cat.label
                          ? 'ring-2 ring-[#117a37]'
                          : ''
                      }`}
                    >
                      <span className="text-2xl">{cat.icon}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 leading-tight">
                      {cat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Header Section */}
            <div className="px-5 flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Rekomendasi Panen Segar
                </h2>
                <p className="text-[11px] text-slate-500">
                  {selectedCategory === 'ALL'
                    ? 'Semua Kategori'
                    : selectedCategory}{' '}
                  •{' '}
                  {selectedGrade === 'ALL'
                    ? 'Grade-A & Grade-B'
                    : selectedGrade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSelectedGrade('ALL');
                  setSearchQuery('');
                }}
                className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#117a37] text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Reset</span>
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <div className="px-5 space-y-4">
              {filteredHomeProducts.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/70">
                  <p className="text-sm font-bold text-slate-800">
                    Produk tidak ditemukan
                  </p>
                </div>
              ) : (
                filteredHomeProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    buyerMode={buyerMode}
                    onSelect={setSelectedProduct}
                    onAddToCart={openQtyPrompt}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: KATALOG ==================== */}
        {activeTab === 'katalog' && (
          <div className="px-5 pt-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  Katalog Hasil Tani
                </h1>
                <p className="text-xs text-slate-500">
                  Tersinkronisasi langsung dengan WMS Gudang
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="relative w-10 h-10 rounded-full bg-white text-slate-800 flex items-center justify-center shadow-sm border border-slate-200/70 cursor-pointer"
              >
                <ShoppingBasket className="w-4 h-4 text-[#117a37]" />
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalCartItems}
                </span>
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-3">
              {(['ALL', 'Grade-A', 'Grade-B'] as const).map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => setSelectedGrade(grade)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                    selectedGrade === grade
                      ? 'bg-[#117a37] text-white'
                      : 'bg-white text-slate-600 border border-slate-200'
                  }`}
                >
                  {grade === 'ALL'
                    ? 'Semua Grade'
                    : grade === 'Grade-A'
                    ? 'Grade-A (Segar)'
                    : 'Grade-B (Olahan Zero-Waste)'}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {filteredCatalogProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  buyerMode={buyerMode}
                  onSelect={setSelectedProduct}
                  onAddToCart={openQtyPrompt}
                />
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: PESANAN & POD ==================== */}
        {activeTab === 'pesanan' && (
          <div className="px-5 pt-5">
            <div className="mb-4">
              <h1 className="text-xl font-extrabold text-slate-900">
                Pelacakan Pesanan & POD
              </h1>
              <p className="text-xs text-slate-500">
                Alur Fulfillment, Label QR & Proof of Delivery Digital
              </p>
            </div>

            <div className="grid grid-cols-2 bg-slate-200/70 p-1 rounded-2xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => setOrderFilter('active')}
                className={`py-2 rounded-xl transition cursor-pointer ${
                  orderFilter === 'active'
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Dalam Proses
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('completed')}
                className={`py-2 rounded-xl transition cursor-pointer ${
                  orderFilter === 'completed'
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Selesai (POD)
              </button>
            </div>

            <div className="space-y-4">
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/70">
                  <p className="text-sm font-bold text-slate-800">
                    Belum ada pesanan di kategori ini
                  </p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const step =
                    order.status === 'PACKING_QR'
                      ? 2
                      : order.status === 'IN_TRANSIT'
                      ? 3
                      : 4;
                  const summary = order.items
                    .map((i) => `${i.qty}x ${i.name}`)
                    .join(', ');

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/70 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400">
                            {order.id}
                          </p>
                          <p className="text-xs font-extrabold text-[#117a37]">
                            {order.statusLabel}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-[10px] font-bold flex items-center gap-1">
                          <QrCode className="w-3 h-3" />
                          {order.qrCodeResi}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1 text-center text-[9px] font-bold">
                        {['1. Bayar', '2. QC & QR', '3. Kurir', '4. POD'].map(
                          (label, idx) => (
                            <div
                              key={label}
                              className={`p-1.5 rounded-lg ${
                                step >= idx + 1
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {label}
                            </div>
                          )
                        )}
                      </div>

                      <div className="text-xs text-slate-600">
                        <p className="font-semibold text-slate-800">{summary}</p>
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-[#117a37]" />
                          {order.courier}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          <p className="text-[10px] text-slate-400">
                            Total Bayar
                          </p>
                          <p className="text-sm font-extrabold text-slate-900">
                            {formatRupiah(order.total)}
                          </p>
                        </div>
                        {order.status === 'ARRIVED_PENDING_POD' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setHasSigned(false);
                              setPodOrder(order);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[#117a37] text-white text-xs font-bold cursor-pointer"
                          >
                            Tanda Tangan POD
                          </button>
                        ) : order.status === 'COMPLETED' ? (
                          <button
                            type="button"
                            onClick={() => setPodOrder(order)}
                            className="px-3 py-2 rounded-xl bg-emerald-50 text-[#117a37] border border-emerald-200 text-xs font-bold cursor-pointer"
                          >
                            Lihat Bukti POD
                          </button>
                        ) : order.status === 'RETURN_REQUESTED' ? (
                          <span className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                            Retur QC Diproses
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSwitchRole('ops', 'logistics')}
                            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Proses di Gudang →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: PROFIL ==================== */}
        {activeTab === 'profil' && (
          <div className="px-5 pt-5">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/70 mb-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xl flex items-center justify-center border border-emerald-200">
                  B
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Budi Santoso
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      Terverifikasi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    budi.santoso@email.com • Bandung
                  </p>
                  <p className="text-xs font-semibold text-[#117a37] mt-1">
                    {buyerMode === 'B2B'
                      ? 'Akun Mitra Bisnis / Resto (B2B - Harga Grosir)'
                      : 'Akun Konsumen Rumah Tangga (B2C)'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Mode Akun Pembeli
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Aktifkan B2B untuk harga grosir & kontrak pasokan
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleBuyerMode}
                  className="px-3 py-1.5 rounded-xl bg-[#117a37] text-white text-xs font-bold cursor-pointer"
                >
                  Ubah Mode
                </button>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 px-1">
              Akses Cepat Peran Sistem
            </h3>
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200/70 divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => onSwitchRole('ops')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#117a37] flex items-center justify-center">
                    <LineChart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Dasbor Gudang, ML & QC
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Jalankan Demand Forecasting & inspeksi Grade-A/B
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onSwitchRole('farmer')}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Tractor className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Portal Kemitraan Petani
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Konfirmasi rencana pasokan & kelola Purchase Order
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav Pembeli */}
      <nav className="floating-nav bg-white rounded-t-[26px] px-4 pt-2.5 pb-4 z-30 border-t border-slate-200/70 shrink-0">
        <div className="grid grid-cols-4 items-center text-center">
          {[
            { id: 'beranda', label: 'Beranda', Icon: Home },
            { id: 'katalog', label: 'Jelajahi', Icon: Search },
            { id: 'pesanan', label: 'Pesanan', Icon: ClipboardList, badge: hasPendingPod },
            { id: 'profil', label: 'Profil', Icon: User },
          ].map((nav) => {
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => setActiveTab(nav.id as BuyerTab)}
                className={`relative flex flex-col items-center justify-center cursor-pointer ${
                  isActive
                    ? 'text-[#117a37] font-bold'
                    : 'text-slate-400 font-medium'
                }`}
              >
                <nav.Icon className="w-4 h-4 mb-1" />
                <span className="text-[11px]">{nav.label}</span>
                {nav.badge && (
                  <span className="absolute top-0 right-5 w-2 h-2 rounded-full bg-rose-500" />
                )}
                <div
                  className={`h-[3px] rounded-full bg-[#117a37] w-8 mt-1 transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </nav>

      {/* ==================== MODAL: PRODUCT DETAIL ==================== */}
      {selectedProduct && (
        <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[32px] max-h-[90%] overflow-y-auto no-scrollbar p-5">
            <div className="relative h-44 rounded-2xl overflow-hidden mb-4">
              <img
                src={selectedProduct.image}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
              <span
                className={`absolute top-3 left-3 ${selectedProduct.badgeColor} px-3 py-1 rounded-full text-xs font-bold`}
              >
                {selectedProduct.badgeText}
              </span>
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 mb-1">
              {selectedProduct.name}
            </h2>
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className="text-xl font-extrabold text-[#117a37]">
                {formatRupiah(
                  buyerMode === 'B2B'
                    ? selectedProduct.priceB2B
                    : selectedProduct.priceB2C
                )}
              </span>
              <span className="text-xs text-slate-500">
                {selectedProduct.unit}
              </span>
            </div>
            <div className="space-y-2.5 mb-5">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-start gap-3">
                <Sprout className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-slate-700">
                    Asal Petani Mitra
                  </p>
                  <p className="text-xs text-slate-600">
                    {selectedProduct.farmer}
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-start gap-3">
                <Snowflake className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-slate-700">
                    Inventaris Cold Storage (Real-Time WMS)
                  </p>
                  <p className="text-xs text-slate-600">
                    {selectedProduct.warehouse} • Tersedia{' '}
                    <strong>
                      {selectedProduct.stockKg} {stockUnitLabel(selectedProduct.unit)}
                    </strong>
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-start gap-3">
                <ClipboardCheck className="w-4 h-4 text-[#117a37] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-emerald-900">
                    Hasil Inspeksi QC ({selectedProduct.grade})
                  </p>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    {selectedProduct.qcNotes}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  openQtyPrompt(selectedProduct.id);
                  setSelectedProduct(null);
                }}
                className="flex-1 py-3 rounded-2xl bg-[#117a37] text-white font-bold text-sm cursor-pointer"
              >
                + Tambah ke Keranjang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: FILTER ==================== */}
      {isFilterOpen && (
        <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[32px] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-extrabold text-slate-900">
                Filter Katalog & Grading QC
              </h3>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              {(['ALL', 'Grade-A', 'Grade-B'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setSelectedGrade(g);
                    setIsFilterOpen(false);
                  }}
                  className={`py-2.5 rounded-xl border cursor-pointer ${
                    selectedGrade === g
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 text-slate-700'
                  }`}
                >
                  {g === 'ALL' ? 'Semua' : g}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CART & CHECKOUT ==================== */}
      {isCartOpen && (
        <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[32px] max-h-[92%] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Keranjang & Checkout
                </h3>
                <p className="text-[11px] text-[#117a37] font-semibold">
                  {buyerMode === 'B2B'
                    ? 'Mode Mitra Bisnis (B2B) • Harga Grosir'
                    : 'Mode Konsumen Rumah Tangga (B2C)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto no-scrollbar flex-1 space-y-4">
              {cart.length === 0 ? (
                <p className="py-10 text-center text-sm font-bold text-slate-800">
                  Keranjang belanja kosong
                </p>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {cart.map((item) => {
                      const prod = products.find((p) => p.id === item.productId);
                      if (!prod) return null;
                      const price =
                        buyerMode === 'B2B' ? prod.priceB2B : prod.priceB2C;

                      return (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/70"
                        >
                          <img
                            src={prod.image}
                            alt={prod.name}
                            className="w-12 h-12 rounded-xl object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {prod.name}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatRupiah(price)}
                              {prod.unit}
                            </p>
                            <p className="text-xs font-extrabold text-[#117a37]">
                              {formatRupiah(price * item.qty)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => onUpdateCartQty(prod.id, -1)}
                              className="w-5 h-5 text-slate-600 font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold text-slate-800 w-4 text-center">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateCartQty(prod.id, 1)}
                              className="w-5 h-5 text-[#117a37] font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70">
                    <p className="text-xs font-bold text-slate-800 mb-1">
                      Armada Pengiriman
                    </p>
                    <p className="text-xs text-slate-600 font-medium">
                      {isPeakSeason
                        ? '3PL Segar Express (Peak Season Auto-Assign)'
                        : 'Armada Cold-Van Internal VeggieChain'}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-semibold text-slate-800">
                        {formatRupiah(cartSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Biaya Pengiriman</span>
                      <span className="font-semibold text-slate-800">
                        {formatRupiah(shippingFee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1">
                      <span>Total Bayar</span>
                      <span className="text-[#117a37]">
                        {formatRupiah(cartSubtotal + shippingFee)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onCheckout();
                      setIsCartOpen(false);
                      setActiveTab('pesanan');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-[#117a37] text-white font-bold text-sm cursor-pointer"
                  >
                    Bayar & Terbitkan Picking Ticket
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: JUMLAH SEBELUM MASUK KERANJANG ==================== */}
      {qtyProduct && (
        <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[32px] p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Mau berapa {stockUnitLabel(qtyProduct.unit)}?
                </h3>
                <p className="text-[11px] text-slate-500">{qtyProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQtyProduct(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3 mb-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Harga</span>
                <span className="font-semibold text-slate-800">
                  {formatRupiah(qtyPrice)} {qtyProduct.unit}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Stok tersedia</span>
                <span className="font-semibold text-slate-800">
                  {qtyRemaining} {stockUnitLabel(qtyProduct.unit)}
                  {qtyInCart > 0 && (
                    <span className="text-slate-400"> ({qtyInCart} di keranjang)</span>
                  )}
                </span>
              </div>
            </div>

            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Jumlah yang ingin dibeli ({stockUnitLabel(qtyProduct.unit)})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setQtyDraft(String(Math.max(1, (Number(qtyDraft) || 1) - 1)))
                }
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-lg cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={qtyRemaining}
                value={qtyDraft}
                autoFocus
                onChange={(e) => setQtyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmQty();
                }}
                className="flex-1 text-center text-lg font-extrabold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl py-2 focus:outline-none focus:border-[#117a37]"
              />
              <button
                type="button"
                onClick={() =>
                  setQtyDraft(
                    String(Math.min(qtyRemaining, (Number(qtyDraft) || 0) + 1))
                  )
                }
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold text-lg cursor-pointer"
              >
                +
              </button>
            </div>

            {!qtyValid && (
              <p className="text-[11px] text-rose-600 font-semibold mt-2">
                Jumlah harus antara 1 dan {qtyRemaining}{' '}
                {stockUnitLabel(qtyProduct.unit)}.
              </p>
            )}

            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-extrabold text-[#117a37] text-sm">
                {formatRupiah(qtyPrice * (qtyValid ? qtyNumber : 0))}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setQtyProduct(null)}
                className="py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmQty}
                disabled={!qtyValid}
                className={`py-3 rounded-2xl font-bold text-xs ${
                  qtyValid
                    ? 'bg-[#117a37] text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Masukkan Keranjang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: DIGITAL POD ==================== */}
      {podOrder && (
        <div className="absolute inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[32px] max-h-[92%] overflow-y-auto no-scrollbar p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  PROOF OF DELIVERY (POD)
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">
                  Konfirmasi Penerimaan Barang
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPodOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {podOrder.status === 'COMPLETED' ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1.5 text-xs">
                  <p className="font-extrabold text-emerald-900 text-sm">
                    Proof of Delivery (POD) Terarsip
                  </p>
                  <p className="text-emerald-800">
                    No. Pesanan: <strong>{podOrder.id}</strong>
                  </p>
                  <p className="text-emerald-800">
                    Resi WMS QR: <strong>{podOrder.qrCodeResi}</strong>
                  </p>
                  <p className="text-emerald-800">
                    Waktu Serah Terima: <strong>{podOrder.podTimestamp}</strong>
                  </p>
                  {podOrder.podSignatureData && (
                    <div className="pt-2">
                      <p className="text-[10px] font-bold text-emerald-700 mb-1">
                        Arsip Tanda Tangan Digital:
                      </p>
                      <img
                        src={podOrder.podSignatureData}
                        alt="Tanda tangan POD"
                        className="w-full h-24 object-contain bg-white rounded-xl border border-emerald-200 p-1"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPodOrder(null)}
                  className="w-full py-3 rounded-2xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-600 mb-3">
                  Bubuhkan tanda tangan digital sebagai bukti serah terima
                  barang dari <strong>{podOrder.courier}</strong>.
                </p>
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-2 mb-2">
                  <canvas
                    ref={canvasRef}
                    width={330}
                    height={130}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ touchAction: 'none' }}
                    className="w-full h-[130px] bg-white rounded-xl cursor-crosshair"
                  />
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] text-slate-400">
                    Goreskan jari/mouse di kotak putih
                  </span>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-xs font-bold text-rose-600 cursor-pointer"
                  >
                    Hapus Ulang
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = podOrder.id;
                      setPodOrder(null);
                      onRequestReturn(
                        targetId,
                        'Klaim mutu / ketidaksesuaian QC saat serah terima'
                      );
                    }}
                    className="py-3 rounded-2xl bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer"
                  >
                    Ajukan Retur QC
                  </button>
                  <button
                    type="button"
                    onClick={handlePodSubmit}
                    className="py-3 rounded-2xl bg-[#117a37] text-white font-bold text-xs cursor-pointer"
                  >
                    Konfirmasi Terima
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};