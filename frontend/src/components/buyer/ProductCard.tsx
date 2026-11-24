import React from 'react';
import { CheckCircle2, Star, MapPin, Plus } from 'lucide-react';
import type { BuyerMode, Product } from '../../types/veggiechain';
import { formatRupiah } from '../../utils/format';

interface ProductCardProps {
  product: Product;
  buyerMode: BuyerMode;
  onSelect: (product: Product) => void;
  onAddToCart: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  buyerMode,
  onSelect,
  onAddToCart,
}) => {
  const activePrice = buyerMode === 'B2B' ? product.priceB2B : product.priceB2C;

  return (
    <div
      onClick={() => onSelect(product)}
      className="bg-white rounded-[24px] p-3 shadow-sm border border-slate-200/70 hover:shadow-md transition cursor-pointer"
    >
      <div className="relative h-40 w-full rounded-[18px] overflow-hidden mb-3 bg-slate-100">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
        />
        <div
          className={`absolute top-3 left-3 ${product.badgeColor} px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 shadow-sm`}
        >
          <CheckCircle2 className="w-3 h-3" />
          <span>{product.badgeText}</span>
        </div>
        <div className="absolute bottom-2.5 right-2.5 bg-slate-900/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-[10px] font-semibold tabular-nums">
          Stok Gudang: {product.stockKg} kg
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-extrabold text-[15px] text-slate-900 leading-snug">
          {product.name}
        </h3>
        <div className="flex items-center gap-1 shrink-0 pt-0.5">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-bold text-slate-700">
            {product.rating}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-2.5">
        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="truncate">{product.farmer}</span>
      </div>

      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
        <div>
          {buyerMode === 'B2B' && (
            <span className="text-[10px] line-through text-slate-400 block">
              {formatRupiah(product.priceB2C)}
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-[15px] font-extrabold text-[#117a37]">
              {formatRupiah(activePrice)}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {product.unit}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product.id);
          }}
          className="px-3.5 py-2 rounded-full bg-emerald-50 hover:bg-[#117a37] text-[#117a37] hover:text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Keranjang</span>
        </button>
      </div>
    </div>
  );
};