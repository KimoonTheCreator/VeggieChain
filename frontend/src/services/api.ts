import type { BuyerMode, CartItem, ForecastResult } from '../types/veggiechain';

const API_BASE = 'http://localhost:3000/api/v1';

/** Body JSON helper. */
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/**
 * Semua request lewat sini supaya status non-2xx benar-benar melempar error.
 * Sebelumnya method seperti updateProductStock/advanceOrder mengabaikan `res.ok`,
 * jadi kegagalan database tidak pernah muncul di UI.
 */
async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new Error('Tidak dapat terhubung ke server backend di localhost:3000.');
  }

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const fromBody =
      body && typeof body === 'object' ? body.error ?? body.message : undefined;
    throw new Error(fromBody ?? `Permintaan gagal (HTTP ${res.status}).`);
  }

  return body as T;
}

export const veggieApi = {
  async fetchState() {
    return request('/state');
  },

  async predictDemand(params: {
    commodityId: string;
    weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
    isHolidayWeek: boolean;
    customNote?: string;
  }): Promise<ForecastResult> {
    return request<ForecastResult>('/forecast/predict', json('POST', params));
  },

  async addSalesHistory(params: {
    commodityId: string;
    recordedDate: string;
    soldB2cKg: number;
    soldB2bKg: number;
    weatherCondition: 'cerah' | 'hujan_sedang' | 'hujan_lebat';
    isWeekend: boolean;
  }) {
    return request('/sales-history', json('POST', params));
  },

  async updateProductStock(commodityId: string, stockKg: number) {
    return request(`/products/${commodityId}/stock`, json('PATCH', { stockKg }));
  },

  async checkoutOrder(buyerMode: BuyerMode, cart: CartItem[], isPeakSeason: boolean) {
    return request('/orders', json('POST', { buyerMode, cart, isPeakSeason }));
  },

  async advanceOrder(orderId: string) {
    return request(`/orders/${orderId}/advance`, json('PATCH'));
  },

  async confirmPod(orderId: string) {
    return request(`/orders/${orderId}/pod`, json('POST'));
  },

  async dispatchSupplyPlan(forecast: ForecastResult) {
    return request('/supply-plans', json('POST', forecast));
  },

  async confirmFarmerSupply(planId: string, qty: number, price: number) {
    return request(`/supply-plans/${planId}/confirm`, json('PATCH', { qty, price }));
  },

  async issuePurchaseOrder(planId: string) {
    return request('/purchase-orders', json('POST', { planId }));
  },

  async sendHarvestToQc(poNumber: string) {
    return request(`/purchase-orders/${poNumber}/ship`, json('PATCH'));
  },

  async submitQcGrading(poNumber: string, gradeAKg: number, gradeBKg: number) {
    return request('/qc/grading', json('POST', { poNumber, gradeAKg, gradeBKg }));
  },
};
