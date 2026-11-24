import type { Order, Product, PurchaseOrder, SupplyPlan } from '../types/veggiechain';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'PRD-001',
    name: 'Brokoli Organik Hidroponik',
    category: 'Sayur Segar',
    grade: 'Grade-A',
    badgeText: 'Panen Pagi • Grade-A',
    badgeColor: 'bg-[#117a37] text-white',
    farmer: 'Gapoktan Tani Makmur, Lembang',
    warehouse: 'Cold Storage Hub Lembang (4°C)',
    stockKg: 145,
    baseWeeklySales: 180,
    baseFarmerPrice: 14500,
    rating: 4.9,
    priceB2C: 24000,
    priceB2B: 19500,
    unit: '/kg',
    image:
      'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&w=800&q=80',
    qcNotes:
      'Lolos inspeksi QC fisik: kuntum hijau padat, bebas ulat, sudah dicuci air ozon dan dikemas plastik berpori.',
  },
  {
    id: 'PRD-002',
    name: 'Tomat Beefsteak Merah Segar',
    category: 'Buah Lokal',
    grade: 'Grade-A',
    badgeText: 'Terpopuler • Grade-A',
    badgeColor: 'bg-[#117a37] text-white',
    farmer: 'Kelompok Tani Subur, Ciwidey',
    warehouse: 'Cold Storage Hub Ciwidey (8°C)',
    stockKg: 210,
    baseWeeklySales: 220,
    baseFarmerPrice: 10500,
    rating: 4.8,
    priceB2C: 18000,
    priceB2B: 14500,
    unit: '/kg',
    image:
      'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=800&q=80',
    qcNotes:
      'Tingkat kematangan 85%, diameter seragam 7-8 cm, kulit mulus tanpa memar.',
  },
  {
    id: 'PRD-003',
    name: 'Puree & Pasta Tomat Alami (Zero Waste)',
    category: 'Olahan Grade-B',
    grade: 'Grade-B',
    badgeText: 'Olahan Grade-B • Hemat 30%',
    badgeColor: 'bg-amber-500 text-white',
    farmer: 'Unit Pengolahan Mitra VeggieChain',
    warehouse: 'Gudang Olahan Bandung (5°C)',
    stockKg: 88,
    baseWeeklySales: 75,
    baseFarmerPrice: 8000,
    rating: 4.7,
    priceB2C: 15000,
    priceB2B: 12000,
    unit: '/pouch 500g',
    image:
      'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?auto=format&fit=crop&w=800&q=80',
    qcNotes:
      'Diproduksi dari hasil sortasi Grade-B (ukuran tidak seragam namun nutrisi & kesegaran terjaga). Menekan pemborosan pangan.',
  },
  {
    id: 'PRD-004',
    name: 'Paket Pasokan Sayur Resto & Kafe (25 Kg)',
    category: 'Paket B2B',
    grade: 'Grade-A',
    badgeText: 'Paket B2B • Kontrak Pasokan',
    badgeColor: 'bg-teal-700 text-white',
    farmer: 'Konsorsium Gapoktan Bandung Raya',
    warehouse: 'Central Cold Storage Bandung (4°C)',
    stockKg: 32,
    baseWeeklySales: 28,
    baseFarmerPrice: 280000,
    rating: 5.0,
    priceB2C: 420000,
    priceB2B: 365000,
    unit: '/krat 25kg',
    image:
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
    qcNotes:
      'Berisi campuran Selada Romaine, Wortel Brastagi, Bawang Daun, dan Kentang Dieng. Termasuk prioritas armada pendingin.',
  },
  {
    id: 'PRD-005',
    name: 'Wortel Baby Manis Lembang',
    category: 'Sayur Segar',
    grade: 'Grade-A',
    badgeText: 'Stok Melimpah • Grade-A',
    badgeColor: 'bg-[#117a37] text-white',
    farmer: 'Mitra Tani Cikole, Lembang',
    warehouse: 'Cold Storage Hub Lembang (4°C)',
    stockKg: 310,
    baseWeeklySales: 240,
    baseFarmerPrice: 9500,
    rating: 4.8,
    priceB2C: 16500,
    priceB2B: 13000,
    unit: '/kg',
    image:
      'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=800&q=80',
    qcNotes:
      'Sudah melalui pencucian sikat halus (washed carrot), manis alami, siap masak.',
  },
];

export const INITIAL_SUPPLY_PLANS: SupplyPlan[] = [
  {
    id: 'SPF-2026-014',
    commodityId: 'PRD-002',
    commodityName: 'Tomat Beefsteak Merah Segar',
    targetQty: 120,
    refPrice: 10500,
    harvestDate: '28 Nov 2026',
    status: 'WAITING_FARMER',
    confirmedQty: 120,
    agreedPrice: 10500,
  },
];

export const INITIAL_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    poNumber: 'PO-VC-2026-088',
    planId: 'SPF-2026-011',
    commodityId: 'PRD-001',
    commodityName: 'Brokoli Organik Hidroponik',
    qty: 90,
    agreedPrice: 14500,
    totalAmount: 1305000,
    status: 'HARVEST_SENT_TO_QC',
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'VC-20261124-089',
    date: 'Hari ini, 08:15 WIB',
    status: 'ARRIVED_PENDING_POD',
    statusLabel: 'Tiba • Menunggu Tanda Tangan POD',
    courier: 'Armada Cold-Van VC-04 (Kang Asep)',
    qrCodeResi: 'QR-WMS-88921-BDG',
    paymentMethod: 'QRIS Instan (Terverifikasi)',
    items: [
      { name: 'Brokoli Organik Hidroponik', qty: 2, price: 24000 },
      { name: 'Tomat Beefsteak Merah Segar', qty: 1, price: 18000 },
    ],
    shippingFee: 10000,
    total: 76000,
    podSigned: false,
    podTimestamp: null,
  },
  {
    id: 'VC-20261120-042',
    date: '20 Nov 2026, 10:30 WIB',
    status: 'COMPLETED',
    statusLabel: 'Selesai • POD Terarsip',
    courier: '3PL Logistik Segar Express',
    qrCodeResi: 'QR-WMS-88104-BDG',
    paymentMethod: 'Virtual Account BCA',
    items: [
      { name: 'Puree & Pasta Tomat Alami (Zero Waste)', qty: 3, price: 15000 },
    ],
    shippingFee: 10000,
    total: 55000,
    podSigned: true,
    podTimestamp: '20 Nov 2026, 14:12 WIB',
  },
];