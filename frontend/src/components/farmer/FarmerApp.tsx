import React, { useState } from 'react';
import { FileText, PackageCheck } from 'lucide-react';
import type { PurchaseOrder, SupplyPlan, UserRole } from '../../types/veggiechain';
import { formatRupiah } from '../../utils/format';

interface FarmerAppProps {
  supplyPlans: SupplyPlan[];
  purchaseOrders: PurchaseOrder[];
  onConfirmSupply: (planId: string, qty: number, price: number) => void;
  onSendHarvestToQc: (poNumber: string) => void;
  onSwitchRole: (role: UserRole, subTab?: string) => void;
}

export const FarmerApp: React.FC<FarmerAppProps> = ({
  supplyPlans,
  purchaseOrders,
  onConfirmSupply,
  onSendHarvestToQc,
  onSwitchRole,
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'po'>('plans');
  const [draftEdits, setDraftEdits] = useState<
    Record<string, { qty: number; price: number }>
  >({});

  const getDraft = (plan: SupplyPlan) =>
    draftEdits[plan.id] || { qty: plan.targetQty, price: plan.refPrice };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <div className="bg-emerald-900 text-white px-5 pt-4 pb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-800 text-emerald-200 text-[10px] font-bold">
              Mitra Off-Taker Terverifikasi
            </span>
            <span className="text-[11px] text-emerald-300">ID: GPT-LMB-01</span>
          </div>
          <h1 className="text-lg font-extrabold">Gapoktan Tani Makmur</h1>
          <p className="text-xs text-emerald-200/90">
            Desa Cikole, Lembang • Komoditas Sayur & Buah
          </p>
        </div>

        {/* ==================== TAB 1: RENCANA PASOKAN ==================== */}
        {activeTab === 'plans' && (
          <div className="px-5 pt-4 space-y-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Formulir Rencana Pasokan Masuk
              </h2>
              <p className="text-[11px] text-slate-500">
                Konfirmasi kesanggupan volume & harga sebelum PO diterbitkan
              </p>
            </div>

            {supplyPlans.map((plan) => {
              const isWaiting = plan.status === 'WAITING_FARMER';
              const draft = getDraft(plan);

              return (
                <div
                  key={plan.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="font-mono text-[10px] font-bold text-slate-400">
                      {plan.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isWaiting
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isWaiting ? 'Perlu Konfirmasi' : 'Terkonfirmasi'}
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-extrabold text-slate-900">
                      {plan.commodityName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Target Panen: {plan.harvestDate}
                    </p>
                  </div>

                  {isWaiting ? (
                    <>
                      <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Volume Sanggup (kg)
                          </label>
                          <input
                            type="number"
                            value={draft.qty}
                            onChange={(e) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [plan.id]: {
                                  ...draft,
                                  qty: parseInt(e.target.value, 10) || 0,
                                },
                              }))
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Harga Sepakat (/kg)
                          </label>
                          <input
                            type="number"
                            value={draft.price}
                            onChange={(e) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [plan.id]: {
                                  ...draft,
                                  price: parseInt(e.target.value, 10) || 0,
                                },
                              }))
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 font-bold text-slate-900"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onConfirmSupply(plan.id, draft.qty, draft.price)
                        }
                        className="w-full py-2.5 rounded-xl bg-[#117a37] text-white font-bold text-xs cursor-pointer"
                      >
                        Konfirmasi Volume & Harga Kesepakatan
                      </button>
                    </>
                  ) : (
                    <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/70 text-emerald-900">
                      <p>
                        Disepakati: <strong>{plan.confirmedQty} kg</strong> @{' '}
                        <strong>{formatRupiah(plan.agreedPrice)}/kg</strong>
                      </p>
                      <button
                        type="button"
                        onClick={() => onSwitchRole('ops', 'forecast')}
                        className="mt-1.5 text-[11px] font-bold text-[#117a37] underline cursor-pointer"
                      >
                        Menunggu Tim Ops menerbitkan PO →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== TAB 2: PURCHASE ORDER ==================== */}
        {activeTab === 'po' && (
          <div className="px-5 pt-4 space-y-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">
                Purchase Order (PO) Aktif
              </h2>
              <p className="text-[11px] text-slate-500">
                Siapkan hasil panen dan kirimkan ke Gudang Hub VeggieChain
              </p>
            </div>

            {purchaseOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/70 text-xs text-slate-500">
                Belum ada Purchase Order aktif.
              </div>
            ) : (
              purchaseOrders.map((po) => (
                <div
                  key={po.poNumber}
                  className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold text-slate-500">
                      {po.poNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        po.status === 'PO_ISSUED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {po.status === 'PO_ISSUED'
                        ? 'Siap Panen'
                        : 'Terkirim ke Gudang'}
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-slate-900">
                    {po.commodityName}
                  </p>
                  <p className="text-slate-600">
                    Kuantitas: <strong>{po.qty} kg</strong> • Total:{' '}
                    <strong>{formatRupiah(po.totalAmount)}</strong>
                  </p>
                  {po.status === 'PO_ISSUED' ? (
                    <button
                      type="button"
                      onClick={() => onSendHarvestToQc(po.poNumber)}
                      className="w-full py-2.5 rounded-xl bg-[#117a37] text-white font-bold text-xs cursor-pointer"
                    >
                      Selesai Panen & Kirim ke Gudang QC
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSwitchRole('ops', 'qc')}
                      className="w-full py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-[11px] cursor-pointer"
                    >
                      Lihat Proses Inspeksi QC di Gudang →
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Bottom Nav Petani */}
      <nav className="floating-nav bg-white rounded-t-[26px] px-4 pt-2.5 pb-4 z-30 border-t border-slate-200/70 shrink-0">
        <div className="grid grid-cols-2 items-center text-center">
          {[
            { id: 'plans', label: 'Rencana Pasokan', Icon: FileText },
            { id: 'po', label: 'Purchase Order', Icon: PackageCheck },
          ].map((nav) => {
            const isActive = activeTab === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => setActiveTab(nav.id as 'plans' | 'po')}
                className={`flex flex-col items-center justify-center cursor-pointer ${
                  isActive
                    ? 'text-[#117a37] font-bold'
                    : 'text-slate-400 font-medium'
                }`}
              >
                <nav.Icon className="w-4 h-4 mb-1" />
                <span className="text-[11px]">{nav.label}</span>
                <div
                  className={`h-[3px] rounded-full bg-[#117a37] w-10 mt-1 transition-opacity ${
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