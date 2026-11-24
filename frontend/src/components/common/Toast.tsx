import React from 'react';
import { Check, AlertTriangle } from 'lucide-react';

interface ToastProps {
  message: string | null;
  isWarning?: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isWarning = false }) => {
  if (!message) return null;

  return (
    <div className="fixed sm:absolute top-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[360px] transition-all">
      <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-medium border border-slate-700">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            isWarning
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}
        >
          {isWarning ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
        </span>
        <span className="leading-snug">{message}</span>
      </div>
    </div>
  );
};