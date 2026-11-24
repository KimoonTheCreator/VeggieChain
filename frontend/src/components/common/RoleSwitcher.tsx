import React from 'react';
import { ShoppingBag, LineChart, Tractor } from 'lucide-react';
import type { UserRole } from '../../types/veggiechain';

interface RoleSwitcherProps {
  activeRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  hasOpsPending: boolean;
  hasFarmerPending: boolean;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  activeRole,
  onSelectRole,
  hasOpsPending,
  hasFarmerPending,
}) => {
  return (
    <div className="bg-slate-900 text-white px-3 py-2 z-30 shrink-0 border-b border-slate-800">
      <div className="flex items-center justify-between gap-1 bg-slate-800/90 p-1 rounded-xl text-[11px] font-bold">
        <button
          type="button"
          onClick={() => onSelectRole('buyer')}
          className={`flex-1 py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
            activeRole === 'buyer'
              ? 'bg-[#117a37] text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Pembeli</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectRole('ops')}
          className={`flex-1 py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 relative cursor-pointer ${
            activeRole === 'ops'
              ? 'bg-[#117a37] text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <LineChart className="w-3.5 h-3.5" />
          <span>Gudang & ML</span>
          {hasOpsPending && (
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectRole('farmer')}
          className={`flex-1 py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1.5 relative cursor-pointer ${
            activeRole === 'farmer'
              ? 'bg-[#117a37] text-white'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Tractor className="w-3.5 h-3.5" />
          <span>Petani Mitra</span>
          {hasFarmerPending && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>
    </div>
  );
};