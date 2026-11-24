import type { ForecastResult, Product } from '../types/veggiechain';

export function formatRupiah(amount: number): string {
  return 'IDR ' + Math.round(amount).toLocaleString('id-ID');
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