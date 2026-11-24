import React, { useState } from 'react';
import {
  AreaChart,
  ClipboardCheck,
  Truck,
  Send,
} from 'lucide-react';
import type {
  ForecastResult,
  Order,
  Product,
  PurchaseOrder,
  SupplyPlan,
  UserRole,
} from '../../types/veggiechain';
import { calculateLocalForecast, formatRupiah } from '../../utils/format';

interface OpsAppProps {
  products: Product[];
  supplyPlans: SupplyPlan[];
  purchaseOrders: PurchaseOrder[];
  orders: Order[];
  isPeakSeason: boolean;
  initialSubTab?: 'forecast' | 'qc' | 'logistics';
  onDispatchSupplyPlan: (forecast: ForecastResult) => void;
  onIssuePo: (planId: string) => void;
  onSubmitQcGrading: (poNumber: string, gradeAKg: number, gradeBKg: number) => void;
  onTogglePeakSeason: () => void;
  onAdvanceOrder: (orderId: string) => void;
  onSwitchRole: (role: UserRole) => void;
}

export const OpsApp: React.FC<OpsAppProps> = ({
  products,
  supplyPlans,
  purchaseOrders,
  orders,
  isPeakSeason,
  initialSubTab = 'forecast',
  onDispatchSupplyPlan,
  onIssuePo,
  onSubmitQcGrading,
  onTogglePeakSeason,
  onAdvanceOrder,
  onSwitchRole,
}) => {
  const [activeTab, setActiveTab] = useState<'forecast' | 'qc' | 'logistics'>(
    initialSubTab
  );
  const [selectedCommodityId, setSelectedCommodityId] = useState('PRD-001');
  const [weatherMult, setWeatherMult] = useState(1.15);
  const [holidayMult, setHolidayMult] = useState(1.25);

  const selectedProduct =
    products.find((p) => p.id === selectedCommodityId) || products[0];
  const forecast = calculateLocalForecast(
    selectedProduct,
    weatherMult,
    holidayMult
  );

  const pendingQcPo = purchaseOrders.find(
    (po) => po.status === 'HARVEST_SENT_TO_QC'
  );
  const [gradeASplit, setGradeASplit] = useState<number>(
    pendingQcPo ? Math.round(pendingQcPo.qty * 0.85) : 0
  );

  const maxDailyKg = Math.max(
    ...forecast.dailySeries.map((d) => d.demandKg),
    1
  );
  const maxBar = Math.max(
    forecast.currentStockKg,
    forecast.totalRequiredKg,
    1
  );

  const activeOrders = orders.filter((o) => o.status !== 'COMPLETED');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-200/80">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#117a37] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/70">
                WMS • ML Engine • Sourcing
              </span>
              <h1 className="text-lg font-extrabold text-slate-900 mt-1">
                Operasional Rantai Pasok
              </h1>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-700">Hub Lembang</p>
              <p className="text-[10px] text-emerald-700 font-semibold">
                Cold Storage: 4°C
              </p>
            </div>
          </div>
        </div>

        {/* ==================== TAB 1: DEMAND FORECASTING (ML) ==================== */}
        {activeTab === 'forecast' && (
          <div className="px-5 pt-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Demand Forecasting (ML)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Prediksi kebutuhan stok 7 hari ke depan
                  </p>
                </div>
                <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold">
                  MAPE 18.4%
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Komoditas Cold Storage
                </label>
                <select
                  value={selectedCommodityId}
                  onChange={(e) => setSelectedCommodityId(e.target.value)}
                  className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-[#117a37]"
                >
                  {products
                    .filter((p) => p.grade === 'Grade-A' && p.id !== 'PRD-004')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stok: {p.stockKg} kg)
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Prakiraan Cuaca
                  </label>
                  <select
                    value={weatherMult}
                    onChange={(e) => setWeatherMult(parseFloat(e.target.value))}
                    className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2"
                  >
                    <option value={1.15}>Hujan Tinggi (+15%)</option>
                    <option value={1.0}>Cerah Berawan (Normal)</option>
                    <option value={1.1}>Kemarau Kering (+10%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Kalender & Musim
                  </label>
                  <select
                    value={holidayMult}
                    onChange={(e) => setHolidayMult(parseFloat(e.target.value))}
                    className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2"
                  >
                    <option value={1.25}>Libur Panjang / Akhir Pekan</option>
                    <option value={1.0}>Hari Kerja Normal</option>
                    <option value={1.4}>Musim Perayaan / Nataru</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Output Prediksi & Grafik Harian */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <p className="text-[11px] font-bold text-slate-400">
                    Hasil Prediksi Mingguan
                  </p>
                  <p className="text-sm font-extrabold text-slate-900">
                    {forecast.commodityName}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    forecast.isRestockNeeded
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {forecast.isRestockNeeded
                    ? 'Perlu Tambah Stok'
                    : 'Stok Mencukupi'}
                </span>
              </div>

              {/* Grafik Bar Proyeksi 7 Hari */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70">
                <p className="text-[10px] font-bold text-slate-500 mb-2">
                  Proyeksi Permintaan Harian (7 Hari ke Depan)
                </p>
                <div className="grid grid-cols-7 gap-1.5 items-end h-20 pt-3">
                  {forecast.dailySeries.map((point) => {
                    const heightPct = Math.max(
                      18,
                      Math.round((point.demandKg / maxDailyKg) * 100)
                    );
                    return (
                      <div
                        key={point.dayLabel}
                        className="flex flex-col items-center h-full justify-end"
                      >
                        <span className="text-[9px] font-bold text-slate-700 mb-1 tabular-nums">
                          {point.demandKg}
                        </span>
                        <div
                          className="w-full bg-[#117a37] rounded-t-md transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="text-[9px] font-medium text-slate-500 mt-1">
                          {point.dayLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-600">
                      Stok Cold Storage Saat Ini
                    </span>
                    <span className="text-slate-900 tabular-nums">
                      {forecast.currentStockKg} kg
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-700 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((forecast.currentStockKg / maxBar) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-600">
                      Prediksi Permintaan + Buffer 15%
                    </span>
                    <span className="text-[#117a37] font-bold tabular-nums">
                      {forecast.totalRequiredKg} kg
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#117a37] rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((forecast.totalRequiredKg / maxBar) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">
                  Rekomendasi Pengadaan:
                </span>
                <span className="font-extrabold text-slate-900 tabular-nums">
                  {forecast.isRestockNeeded
                    ? `+${forecast.recommendedRestockKg} kg`
                    : '0 kg (Aman)'}
                </span>
              </div>

              {forecast.isRestockNeeded ? (
                <button
                  type="button"
                  onClick={() => onDispatchSupplyPlan(forecast)}
                  className="w-full py-3 rounded-xl bg-[#117a37] hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Buat Jadwal & Kirim Form ke Petani</span>
                </button>
              ) : (
                <p className="text-[11px] text-center text-slate-400">
                  Stok gudang pendingin mencukupi untuk proyeksi minggu depan.
                </p>
              )}
            </div>

            {/* Daftar Formulir Rencana Pasokan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-extrabold text-slate-800">
                  Status Formulir Rencana Pasokan
                </h3>
                <span className="text-[11px] text-slate-400">
                  Process Requirement
                </span>
              </div>
              <div className="space-y-2.5">
                {supplyPlans.map((plan) => {
                  const isConfirmed = plan.status === 'CONFIRMED_BY_FARMER';
                  const isPoIssued = plan.status === 'PO_ISSUED';
                  return (
                    <div
                      key={plan.id}
                      className="bg-white rounded-2xl p-3.5 border border-slate-200/80 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {plan.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isPoIssued
                              ? 'bg-slate-100 text-slate-600'
                              : isConfirmed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isPoIssued
                            ? 'PO Diterbitkan'
                            : isConfirmed
                            ? 'Disetujui Petani'
                            : 'Menunggu Konfirmasi Petani'}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900">
                        {plan.commodityName} • {plan.confirmedQty} kg
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500">
                          Harga: {formatRupiah(plan.agreedPrice)}/kg
                        </span>
                        {isConfirmed ? (
                          <button
                            type="button"
                            onClick={() => onIssuePo(plan.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#117a37] text-white font-bold text-[11px] cursor-pointer"
                          >
                            Terbitkan PO
                          </button>
                        ) : !isPoIssued ? (
                          <button
                            type="button"
                            onClick={() => onSwitchRole('farmer')}
                            className="text-[11px] font-bold text-[#117a37] cursor-pointer"
                          >
                            Buka Portal Petani →
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: PO & QC GRADING ==================== */}
        {activeTab === 'qc' && (
          <div className="px-5 pt-4 space-y-4">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 mb-1">
                Purchase Order (PO) Mitra Petani
              </h2>
              <p className="text-[11px] text-slate-500 mb-2.5">
                Terbitkan PO setelah petani menyepakati volume & harga
              </p>
              <div className="space-y-2.5">
                {purchaseOrders.map((po) => (
                  <div
                    key={po.poNumber}
                    className="bg-white rounded-2xl p-3.5 border border-slate-200/80 text-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono text-[10px] font-bold text-slate-400">
                        {po.poNumber}
                      </p>
                      <p className="font-bold text-slate-900">
                        {po.commodityName} ({po.qty} kg)
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Nilai: {formatRupiah(po.totalAmount)}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        po.status === 'QC_COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : po.status === 'HARVEST_SENT_TO_QC'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {po.status === 'QC_COMPLETED'
                        ? 'Masuk WMS'
                        : po.status === 'HARVEST_SENT_TO_QC'
                        ? 'Tiba di QC'
                        : 'Diproses Petani'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Inspeksi QC & Grading Gudang
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Pemisahan Grade-A (Segar) & Grade-B (Olahan)
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                  Zero Waste
                </span>
              </div>

              {!pendingQcPo ? (
                <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-200/70">
                  <p className="text-xs font-bold text-slate-700">
                    Tidak ada kiriman panen menunggu QC
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Kirim hasil panen dari tab Petani Mitra untuk melakukan
                    grading.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">
                      {pendingQcPo.commodityName}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-[#117a37]">
                      Total: {pendingQcPo.qty} kg ({pendingQcPo.poNumber})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-emerald-800 mb-1">
                        Grade-A Segar (kg)
                      </label>
                      <input
                        type="number"
                        value={Math.min(gradeASplit, pendingQcPo.qty)}
                        min={0}
                        max={pendingQcPo.qty}
                        onChange={(e) => {
                          const val = Math.min(
                            pendingQcPo.qty,
                            Math.max(0, parseInt(e.target.value, 10) || 0)
                          );
                          setGradeASplit(val);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-800 mb-1">
                        Grade-B Olahan (kg)
                      </label>
                      <input
                        type="number"
                        value={Math.max(
                          0,
                          pendingQcPo.qty -
                            Math.min(gradeASplit, pendingQcPo.qty)
                        )}
                        readOnly
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2 font-bold text-slate-700"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const validA = Math.min(gradeASplit, pendingQcPo.qty);
                      const validB = pendingQcPo.qty - validA;
                      onSubmitQcGrading(pendingQcPo.poNumber, validA, validB);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#117a37] text-white font-bold text-xs cursor-pointer"
                  >
                    Simpan Hasil QC & Update Stok WMS
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: LOGISTIK & 3PL ==================== */}
        {activeTab === 'logistics' && (
          <div className="px-5 pt-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900">
                    Mode Peak Season (3PL)
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      isPeakSeason
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isPeakSeason ? 'PEAK SEASON (3PL)' : 'NORMAL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Otomatis limpahkan pengiriman ke mitra logistik 3PL
                </p>
              </div>
              <button
                type="button"
                onClick={onTogglePeakSeason}
                className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold cursor-pointer ${
                  isPeakSeason ? 'bg-amber-600' : 'bg-slate-800'
                }`}
              >
                {isPeakSeason ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            </div>

            <div>
              <h3 className="text-xs font-extrabold text-slate-800 mb-2">
                Antrean Pengiriman & Scan Barcode QR
              </h3>
              <div className="space-y-3">
                {activeOrders.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/70 text-xs text-slate-500">
                    Semua pesanan pelanggan telah selesai dikirim.
                  </div>
                ) : (
                  activeOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {order.id}
                        </span>
                        <span className="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                          {order.qrCodeResi}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {order.statusLabel}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-[#117a37]" />
                        {order.courier}
                      </p>
                      {order.status !== 'ARRIVED_PENDING_POD' ? (
                        <button
                          type="button"
                          onClick={() => onAdvanceOrder(order.id)}
                          className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
                        >
                          {order.status === 'PACKING_QR'
                            ? 'Scan Label QR & Kirim Kurir'
                            : 'Konfirmasi Kurir Tiba di Tujuan'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSwitchRole('buyer')}
                          className="w-full py-2 rounded-xl bg-emerald-50 text-[#117a37] border border-emerald-200 font-bold text-[11px] cursor-pointer"
                        >
                          Menunggu Tanda Tangan POD Pembeli →
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Nav Gudang & ML */}
      <nav className="floating-nav bg-white rounded-t-[26px] px-4 pt-2.5 pb-4 z-30 border-t border-slate-200/70 shrink-0">
        <div className="grid grid-cols-3 items-center text-center">
          {[
            { id: 'forecast', label: 'Forecast ML', Icon: AreaChart },
            { id: 'qc', label: 'PO & QC Grading', Icon: ClipboardCheck },
            { id: 'logistics', label: 'Logistik & 3PL', Icon: Truck },
          ].map((nav) => {
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() =>
                  setActiveTab(nav.id as 'forecast' | 'qc' | 'logistics')
                }
                className={`flex flex-col items-center justify-center cursor-pointer ${
                  isActive
                    ? 'text-[#117a37] font-bold'
                    : 'text-slate-400 font-medium'
                }`}
              >
                <nav.Icon className="w-4 h-4 mb-1" />
                <span className="text-[11px]">{nav.label}</span>
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
    </div>
  );
};