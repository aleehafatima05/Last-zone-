import React from 'react';
import { Heart, Package, Shield, Trash2, X } from 'lucide-react';
import { OPERATIVES, WEAPONS } from '../game/constants';
import { getBackpackMaxBandages, getBackpackMaxMedkits } from '../game/rules';
import type { GameSettings, HudSnapshot } from '../game/types';

interface InventoryModalProps {
  hud: HudSnapshot;
  settings: GameSettings;
  onSwitchWeapon: (slot: number) => void;
  onDropWeapon: (slot: number) => void;
  onUseHeal: (kind: 'medkit' | 'bandage') => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  hud,
  settings,
  onSwitchWeapon,
  onDropWeapon,
  onUseHeal,
  onClose,
}) => {
  const op = OPERATIVES[settings.operative];
  return (
    <div className="fixed inset-0 z-40 bg-[#0d0e11]/82 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label="Field Inventory"
        className="w-full max-w-lg bg-[#141619] border border-white/15 rounded-md p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.22em] text-[#D95D24] font-semibold">
              {op.name} · {hud.locationName}
            </span>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-[#ECEBE6]">
              Field Inventory
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Inventory"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Armor & Backpack Status */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#1D2024] border border-white/10 rounded p-3 flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#38bdf8]" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Body Armor</div>
              <div className="text-sm font-bold text-[#ECEBE6] font-mono-num">
                {hud.armorTier > 0 ? `Lv.${hud.armorTier} (${hud.armor}/${hud.maxArmor})` : 'None'}
              </div>
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3 flex items-center gap-3">
            <Package className="w-5 h-5 text-[#eab308]" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Tactical Pack</div>
              <div className="text-sm font-bold text-[#ECEBE6] font-mono-num">
                Level {hud.backpackTier}
              </div>
            </div>
          </div>
        </div>

        {/* Weapons */}
        <h3 className="text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">Equipped Weapons</h3>
        <div className="space-y-2 mb-4">
          {hud.weapons.map((slot, idx) => {
            const spec = slot ? WEAPONS[slot.weaponId] : null;
            const active = idx === hud.activeSlot;
            return (
              <div
                key={idx}
                className={`p-3 rounded border flex items-center justify-between ${
                  active
                    ? 'bg-[#21291e] border-[#D95D24]'
                    : 'bg-[#1D2024] border-white/10'
                }`}
              >
                <button
                  type="button"
                  disabled={!slot}
                  onClick={() => {
                    onSwitchWeapon(idx);
                    onClose();
                  }}
                  className="flex-1 text-left"
                >
                  <div className="text-xs font-mono-num text-[#9AA0A6]">
                    Slot [{idx + 1}] {idx === 2 ? '· Sidearm' : '· Primary'}
                  </div>
                  <div className="text-sm font-bold text-[#ECEBE6]">
                    {spec ? spec.name : 'Empty Slot'}
                  </div>
                  {slot && spec && (
                    <div className="text-xs text-[#C7C6C0] font-mono-num">
                      {slot.ammoInMag} / {slot.reserveAmmo} rounds · {spec.category}
                    </div>
                  )}
                </button>
                {slot && idx < 2 && (
                  <button
                    type="button"
                    aria-label={`Drop ${spec?.name}`}
                    onClick={() => onDropWeapon(idx)}
                    className="p-2 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-[#D93824]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Medical Supplies */}
        <h3 className="text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">Medical Supplies</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={hud.medkits <= 0 || hud.health >= hud.maxHealth}
            onClick={() => {
              onUseHeal('medkit');
              onClose();
            }}
            className="p-3 rounded border bg-[#1D2024] hover:bg-[#272b30] disabled:opacity-45 border-white/10 text-left flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-bold text-[#ECEBE6]">Field Medkit</div>
              <div className="text-[11px] text-[#9AA0A6] font-mono-num">
                {hud.medkits} / {getBackpackMaxMedkits(hud.backpackTier)} (+75 HP)
              </div>
            </div>
            <Heart className="w-4 h-4 text-[#4ade80]" />
          </button>

          <button
            type="button"
            disabled={hud.bandages <= 0 || hud.health >= hud.maxHealth}
            onClick={() => {
              onUseHeal('bandage');
              onClose();
            }}
            className="p-3 rounded border bg-[#1D2024] hover:bg-[#272b30] disabled:opacity-45 border-white/10 text-left flex items-center justify-between"
          >
            <div>
              <div className="text-xs font-bold text-[#ECEBE6]">Combat Bandage</div>
              <div className="text-[11px] text-[#9AA0A6] font-mono-num">
                {hud.bandages} / {getBackpackMaxBandages(hud.backpackTier)} (+25 HP)
              </div>
            </div>
            <Heart className="w-4 h-4 text-[#86efac]" />
          </button>
        </div>
      </div>
    </div>
  );
};
