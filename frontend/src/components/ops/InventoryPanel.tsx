import React, { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, Save, Snowflake } from 'lucide-react';
import type { Product } from '../../types/veggiechain';
import { veggieApi } from '../../services/api';
import { formatRupiah, stockUnitLabel } from '../../utils/format';

interface InventoryPanelProps {
  products: Product[];
  onRefreshState: () => Promise<void>;
  onNotify: (msg: string, warn?: boolean) => void;
}

/** Ambang stok rendah per SKU (dalam satuan jual). */
const LOW_STOCK_THRESHOLD: Record<string, number> = {
  'PRD-003': 10, // pouch
  'PRD-004': 5, // krat
};

/**
 * Paket B2B adalah bundling virtual: 1 krat 25 kg dirakit otomatis dari
 * komponen segar. Salinan dari BUNDLE_RECIPE di backend-core/src/index.ts.
 */
const BUNDLE_PRODUCT_ID = 'PRD-004';
const BUNDLE_RECIPE: Array<{ id: string; kg: number }> = [
  { id: 'PRD-001', kg: 10 },
  { id: 'PRD-002', kg: 8 },
  { id: 'PRD-005', kg: 7 },
];

/** Penjelasan singkat asal-usul stok untuk SKU non-segar. */
const STOCK_NOTES: Record<string, string> = {
  'PRD-003':
    'Masuk otomatis dari QC: 1 kg Grade-B diolah menjadi 2 pouch 500g.',
  'PRD-004':
    'Stok dihitung otomatis dari komponen segar. Tidak bisa diubah manual.',
};

const InventoryRow: React.FC<{
  product: Product;
  allProducts: Product[];
  onRefreshState: () => Promise<void>;
  onNotify: (msg: string, warn?: boolean) => void;
}> = ({ product, allProducts, onRefreshState, onNotify }) => {
  const [draft, setDraft] = useState(String(product.stockKg));
  const [saving, setSaving] = useState(false);

  // Ikuti nilai terbaru dari server setelah refreshState / edit di tempat lain.
  useEffect(() => {
    setDraft(String(product.stockKg));
  }, [product.stockKg]);

  const unit = stockUnitLabel(product.unit);
  const parsed = Number(draft);
  const isValid =
    draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;
  const isDirty = isValid && parsed !== product.stockKg;
  const isLowStock =
    LOW_STOCK_THRESHOLD[product.id] !== undefined &&
    product.stockKg < LOW_STOCK_THRESHOLD[product.id];
  const note = STOCK_NOTES[product.id];
  const isBundle = product.id === BUNDLE_PRODUCT_ID;

  const handleSave = async () => {
    if (isBundle) return;
    if (!isValid) {
      onNotify(`Stok harus bilangan bulat ${unit} dan tidak boleh negatif.`, true);
      return;
    }
    setSaving(true);
    try {
      await veggieApi.updateProductStock(product.id, parsed);
      await onRefreshState();
      onNotify(`Stok ${product.name} diperbarui menjadi ${parsed} ${unit}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'kesalahan tidak dikenal';
      onNotify(`Gagal memperbarui stok: ${message}`, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-sm space-y-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900 leading-snug">{product.name}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {product.category} • {product.grade}
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${
            product.grade === 'Grade-B'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {product.grade}
        </span>
      </div>

      <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
        <Snowflake className="w-3 h-3 text-sky-600 shrink-0" />
        {product.warehouse}
      </p>

      {isBundle ? (
        <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl px-2.5 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-900">
              Kapasitas rakitan otomatis
            </span>
            <span className="text-sm font-extrabold text-[#117a37] tabular-nums">
              {product.stockKg} {unit}
            </span>
          </div>
          <p className="text-[10px] text-emerald-800 leading-relaxed">
            Resep per krat (25 kg):
          </p>
          <ul className="text-[10px] text-emerald-900 space-y-0.5">
            {BUNDLE_RECIPE.map(({ id, kg }) => {
              const component = allProducts.find((p) => p.id === id);
              const shortName = component?.name.split(' ')[0] ?? id;
              return (
                <li key={id} className="flex justify-between gap-2">
                  <span>• {kg} kg {shortName}</span>
                  <span className="text-emerald-700/80 tabular-nums">
                    sisa {component?.stockKg ?? 0} kg
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Stok Fisik ({unit})
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                step={1}
                min={0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-[#117a37]"
              />
              <span className="text-[10px] font-bold text-slate-500 pb-2 shrink-0">
                {unit}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isValid || !isDirty}
            className="px-3 py-2 rounded-lg bg-[#117a37] text-white text-[11px] font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <p className="text-[10px] text-slate-500">
          B2C {formatRupiah(product.priceB2C)}
          {product.unit} • B2B {formatRupiah(product.priceB2B)}
          {product.unit}
        </p>
        {isLowStock && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            Stok rendah
          </span>
        )}
      </div>

      {note && (
        <p className="text-[10px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-200/70 rounded-lg px-2 py-1.5">
          {note}
        </p>
      )}
    </div>
  );
};

/**
 * Inventaris WMS: satu tempat untuk melihat & mengoreksi stok semua SKU,
 * termasuk Olahan Grade-B (pouch) dan Paket B2B (krat) yang tidak masuk
 * dropdown forecast karena bukan komoditas segar.
 */
export const InventoryPanel: React.FC<InventoryPanelProps> = ({
  products,
  onRefreshState,
  onNotify,
}) => {
  return (
    <div className="px-5 pt-4 space-y-3">
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#117a37] flex items-center justify-center">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              Inventaris WMS
            </h2>
            <p className="text-[11px] text-slate-500">
              Stok seluruh SKU dalam satuan jual (kg / krat / pouch)
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-2">
          Stok komoditas segar bertambah dari <strong>QC grading</strong>. Stok
          Olahan Grade-B ikut bertambah otomatis dari Grade-B. Paket B2B dirakit
          otomatis dari komoditas segar, jadi stoknya dihitung dari komponen.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/70 text-xs text-slate-500">
          Belum ada produk di gudang.
        </div>
      ) : (
        products.map((product) => (
          <InventoryRow
            key={product.id}
            product={product}
            allProducts={products}
            onRefreshState={onRefreshState}
            onNotify={onNotify}
          />
        ))
      )}
    </div>
  );
};
