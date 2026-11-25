export type UserRole = 'buyer' | 'ops' | 'farmer';
export type BuyerMode = 'B2C' | 'B2B';
export type ProductGrade = 'Grade-A' | 'Grade-B';

export interface Product {
  id: string;
  name: string;
  category: 'Sayur Segar' | 'Buah Lokal' | 'Olahan Grade-B' | 'Paket B2B';
  grade: ProductGrade;
  badgeText: string;
  badgeColor: string;
  farmer: string;
  warehouse: string;
  stockKg: number;
  baseWeeklySales: number;
  baseFarmerPrice: number;
  rating: number;
  priceB2C: number;
  priceB2B: number;
  unit: string;
  image: string;
  qcNotes: string;
}

export interface CartItem {
  productId: string;
  qty: number;
}

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
}

export type OrderStatus =
  | 'PACKING_QR'
  | 'IN_TRANSIT'
  | 'ARRIVED_PENDING_POD'
  | 'COMPLETED';

export interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  statusLabel: string;
  courier: string;
  qrCodeResi: string;
  paymentMethod: string;
  items: OrderItem[];
  shippingFee: number;
  total: number;
  podSigned: boolean;
  podTimestamp: string | null;
}

export interface SupplyPlan {
  id: string;
  commodityId: string;
  commodityName: string;
  targetQty: number;
  refPrice: number;
  harvestDate: string;
  status: 'WAITING_FARMER' | 'CONFIRMED_BY_FARMER' | 'PO_ISSUED';
  confirmedQty: number;
  agreedPrice: number;
}

export interface PurchaseOrder {
  poNumber: string;
  planId: string;
  commodityId: string;
  commodityName: string;
  qty: number;
  agreedPrice: number;
  totalAmount: number;
  status: 'PO_ISSUED' | 'HARVEST_SENT_TO_QC' | 'QC_COMPLETED';
}

export interface DailyForecastPoint {
  dayLabel: string;
  demandKg: number;
}

export interface SalesHistoryRecord {
  id: number;
  recorded_date: string;
  sold_b2c_kg: number;
  sold_b2b_kg: number;
  total_demand_kg: number;
  weather_condition: string;
  is_weekend: boolean;
}

export interface ForecastResult {
  commodityId: string;
  commodityName: string;
  currentStockKg: number;
  predictedDemandKg: number;
  safetyBufferKg: number;
  totalRequiredKg: number;
  recommendedRestockKg: number;
  isRestockNeeded: boolean;
  refFarmerPrice: number;
  dailySeries: DailyForecastPoint[];
  aiInsight?: string;
  aiModel?: string;
  /** Rata-rata harian setelah transaksi one-off dikeluarkan. */
  baselineDailyKg?: number;
  /** Total kg transaksi one-off (pembelian bulk) yang tidak dipakai sebagai baseline. */
  oneOffExcludedKg?: number;
  oneOffExcludedCount?: number;
  recentHistory?: SalesHistoryRecord[];
}