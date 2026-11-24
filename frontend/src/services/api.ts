import type { BuyerMode, CartItem, ForecastResult } from '../types/veggiechain';

const API_BASE = 'http://localhost:3000/api/v1';

export const veggieApi = {
  async fetchState() {
    const res = await fetch(`${API_BASE}/state`);
    if (!res.ok) throw new Error('Gagal mengambil data dari server');
    return res.json();
  },

  async predictDemand(params: {
    commodityId: string;
    weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
    isHolidayWeek: boolean;
    customNote?: string;
  }): Promise<ForecastResult> {
    const res = await fetch(`${API_BASE}/forecast/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Gagal menjalankan AI Forecast');
    return res.json();
  },

  async addSalesHistory(params: {
    commodityId: string;
    recordedDate: string;
    soldB2cKg: number;
    soldB2bKg: number;
    weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
    isWeekend: boolean;
  }) {
    const res = await fetch(`${API_BASE}/sales-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Gagal menyimpan histori penjualan');
    return res.json();
  },

  async updateProductStock(commodityId: string, stockKg: number) {
    await fetch(`${API_BASE}/products/${commodityId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockKg }),
    });
  },

  async checkoutOrder(buyerMode: BuyerMode, cart: CartItem[], isPeakSeason: boolean) {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerMode, cart, isPeakSeason }),
    });
    return res.json();
  },

  async advanceOrder(orderId: string) {
    await fetch(`${API_BASE}/orders/${orderId}/advance`, { method: 'PATCH' });
  },

  async confirmPod(orderId: string) {
    await fetch(`${API_BASE}/orders/${orderId}/pod`, { method: 'POST' });
  },

  async dispatchSupplyPlan(forecast: ForecastResult) {
    const res = await fetch(`${API_BASE}/supply-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forecast),
    });
    return res.json();
  },

  async confirmFarmerSupply(planId: string, qty: number, price: number) {
    await fetch(`${API_BASE}/supply-plans/${planId}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty, price }),
    });
  },

  async issuePurchaseOrder(planId: string) {
    const res = await fetch(`${API_BASE}/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
    return res.json();
  },

  async sendHarvestToQc(poNumber: string) {
    await fetch(`${API_BASE}/purchase-orders/${poNumber}/ship`, { method: 'PATCH' });
  },

  async submitQcGrading(poNumber: string, gradeAKg: number, gradeBKg: number) {
    await fetch(`${API_BASE}/qc/grading`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poNumber, gradeAKg, gradeBKg }),
    });
  },
};