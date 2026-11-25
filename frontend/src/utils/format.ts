import type { ForecastResult, Product } from '../types/veggiechain';

export function formatRupiah(amount: number): string {
  return 'IDR ' + Math.round(amount).toLocaleString('id-ID');
}

/**
 * Satuan stok mengikuti satuan jual produk.
 * '/krat 25kg' -> 'krat', '/pouch 500g' -> 'pouch', '/kg' -> 'kg'.
 * Catatan: kolom `stock_kg` menyimpan jumlah dalam satuan ini, bukan selalu kg.
 */
export function stockUnitLabel(unit: string): string {
  const cleaned = (unit ?? '').replace(/^\//, '').trim();
  return cleaned.split(/\s+/)[0] || 'kg';
}

/**
 * Hari "weekend" versi bisnis VeggieChain: Jumat, Sabtu, Minggu.
 * Diparse sebagai UTC agar tidak bergeser satu hari di zona waktu tertentu.
 */
export function isWeekendDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return false;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
}

export function calculateLocalForecast(
  product: Product,
  weatherMultiplier: number,
  holidayMultiplier: number
): ForecastResult {
  const predictedDemandKg = Math.round(
    product.baseWeeklySales * weatherMultiplier * holidayMultiplier
  );
  const safetyBufferKg = Math.round(predictedDemandKg * 0.15);
  const totalRequiredKg = predictedDemandKg + safetyBufferKg;
  const recommendedRestockKg = Math.max(0, totalRequiredKg - product.stockKg);

  // Distribusi 7 hari (lonjakan alami pada hari Jumat-Minggu)
  const dayWeights = [0.11, 0.12, 0.12, 0.13, 0.17, 0.19, 0.16];
  const dayLabels = ['Rab', 'Kam', 'Jum', 'Sab', 'Min', 'Sen', 'Sel'];
  const dailySeries = dayLabels.map((dayLabel, idx) => ({
    dayLabel,
    demandKg: Math.round(predictedDemandKg * dayWeights[idx]),
  }));

  return {
    commodityId: product.id,
    commodityName: product.name,
    currentStockKg: product.stockKg,
    predictedDemandKg,
    safetyBufferKg,
    totalRequiredKg,
    recommendedRestockKg,
    isRestockNeeded: recommendedRestockKg > 0,
    refFarmerPrice: product.baseFarmerPrice,
    dailySeries,
  };
}