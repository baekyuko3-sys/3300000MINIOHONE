import { Plus, X } from 'lucide-react';

export interface Persona {
  id: string;
  name: string;
  title: string;
  bio: string;
  avatar: string;
  themeColor: string;
}

export const DEFAULT_PERSONAS: Persona[] = [];

interface LinePersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePersona: Persona;
  onSelectPersona: (p: Persona) => void;
}

export function LinePersonaModal({
  isOpen,
  onClose,
}: LinePersonaModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[390px] rounded-t-[32px] bg-white p-5 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-mono tracking-[1.5px] text-[#aaa]">PERSONA MASKS · LOCAL</div>
            <div className="mt-1 font-semibold text-[15px] text-[#222]">身份面具</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-black/5 grid place-items-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-10 text-center">
          <div className="text-[9px] font-mono tracking-[1.6px] text-[#aaa]">EMPTY PERSONA LIBRARY</div>
          <div className="mt-2 font-serif text-[15px] text-[#333]">还没有身份面具</div>
          <div className="mt-1 text-[10px] text-[#999]">创建后，面具会保存在这台设备。</div>
        </div>

        <button className="w-full py-2.5 rounded-2xl border border-dashed border-neutral-300 text-[10px] text-neutral-500 font-mono flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          定制新面具
        </button>
      </div>
    </div>
  );
}
