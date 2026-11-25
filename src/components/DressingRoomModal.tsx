import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Footprints,
  HardHat,
  Package,
  RotateCw,
  Shield,
  Shirt,
  Smile,
  X,
} from 'lucide-react';
import {
  BACKPACK_OPTIONS,
  GEAR_COLOR_OPTIONS,
  GOGGLES_OPTIONS,
  HELMET_OPTIONS,
  MASK_OPTIONS,
  OPERATIVES,
  OUTFIT_THEMES,
  VEST_OPTIONS,
  WEAPON_SKINS,
} from '../game/constants';
import type {
  CustomizationState,
  EmoteId,
  GameSettings,
  OutfitThemeId,
  WeaponSkinId,
} from '../game/types';

interface DressingRoomModalProps {
  settings: GameSettings;
  onUpdateCustomization: (patch: Partial<CustomizationState>) => void;
  onRotateTurntable: (deltaYaw: number) => void;
  onTriggerEmote: (emote: EmoteId) => void;
  onClose: () => void;
}

type CategoryId =
  | 'outfits'
  | 'helmets'
  | 'masks'
  | 'goggles'
  | 'vests'
  | 'gear'
  | 'backpacks'
  | 'skins'
  | 'emotes';

const CATEGORIES: { id: CategoryId; label: string; icon: React.ReactNode }[] = [
  { id: 'outfits', label: 'Outfits', icon: <Shirt className="w-4 h-4" /> },
  { id: 'helmets', label: 'Helmets', icon: <HardHat className="w-4 h-4" /> },
  { id: 'masks', label: 'Masks', icon: <Shield className="w-4 h-4" /> },
  { id: 'goggles', label: 'Goggles', icon: <Eye className="w-4 h-4" /> },
  { id: 'vests', label: 'Tactical Vests', icon: <Shield className="w-4 h-4" /> },
  { id: 'gear', label: 'Gloves & Boots', icon: <Footprints className="w-4 h-4" /> },
  { id: 'backpacks', label: 'Backpacks', icon: <Package className="w-4 h-4" /> },
  { id: 'skins', label: 'Weapon Skins', icon: <Crosshair className="w-4 h-4" /> },
  { id: 'emotes', label: 'Emotes', icon: <Smile className="w-4 h-4" /> },
];

const EMOTES: { id: EmoteId; label: string }[] = [
  { id: 'combat_ready', label: 'Combat Ready' },
  { id: 'salute', label: 'Tactical Salute' },
  { id: 'weapon_inspect', label: 'Inspect Rifle' },
  { id: 'victory_fist', label: 'Victory Signal' },
];

export const DressingRoomModal: React.FC<DressingRoomModalProps> = ({
  settings,
  onUpdateCustomization,
  onRotateTurntable,
  onTriggerEmote,
  onClose,
}) => {
  const [category, setCategory] = useState<CategoryId>('outfits');
  const dragging = useRef(false);
  const lastX = useRef(0);
  const c = settings.customization;
  const op = OPERATIVES[settings.operative];

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-3 sm:p-6 pointer-events-none"
      role="dialog"
      aria-label="Outfit Customization Dressing Room"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between bg-[#141619]/92 border border-white/15 rounded px-4 py-2.5 pointer-events-auto shadow-xl">
        <div>
          <span className="text-[11px] uppercase tracking-[0.22em] text-[#D95D24] font-semibold">
            360° Tactical Dressing Room
          </span>
          <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-[#ECEBE6] leading-tight">
            {op.name} — {op.role}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdateCustomization({ ...op.defaultCustomization })}
            className="px-3 py-1.5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-xs text-[#C7C6C0] inline-flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Default Kit
          </button>
          <button
            type="button"
            aria-label="Close Customization"
            onClick={onClose}
            className="p-1.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Middle 3-Column Dressing Room Layout */}
      <div className="flex-1 flex items-stretch justify-between gap-3 my-3 min-h-0">
        {/* Left Category Rail */}
        <div className="w-44 sm:w-52 bg-[#141619]/92 border border-white/15 rounded p-2 flex flex-col gap-1 overflow-y-auto pointer-events-auto shadow-xl">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-2 rounded text-left text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                category === cat.id
                  ? 'bg-[#D95D24] text-white'
                  : 'bg-[#1D2024]/80 text-[#C7C6C0] hover:bg-[#272b30] border border-white/5'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Center Transparent Drag-to-Rotate 3D Viewport */}
        <div
          className="flex-1 flex flex-col items-center justify-end pb-2 pointer-events-auto cursor-grab active:cursor-grabbing select-none"
          onPointerDown={(e) => {
            dragging.current = true;
            lastX.current = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            const dx = e.clientX - lastX.current;
            lastX.current = e.clientX;
            onRotateTurntable(dx * 0.012);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          aria-label="Drag to rotate operative 360 degrees"
        >
          <div className="flex items-center gap-2 bg-[#141619]/88 border border-white/15 rounded px-3 py-1.5">
            <button
              type="button"
              aria-label="Rotate Left"
              onClick={(e) => {
                e.stopPropagation();
                onRotateTurntable(-0.6);
              }}
              className="p-1 rounded hover:bg-white/10 text-[#ECEBE6]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">
              Drag to Rotate 360°
            </span>
            <button
              type="button"
              aria-label="Rotate Right"
              onClick={(e) => {
                e.stopPropagation();
                onRotateTurntable(0.6);
              }}
              className="p-1 rounded hover:bg-white/10 text-[#ECEBE6]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Options Grid */}
        <div className="w-56 sm:w-72 bg-[#141619]/92 border border-white/15 rounded p-3 flex flex-col justify-between overflow-y-auto pointer-events-auto shadow-xl">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[#9AA0A6] mb-2.5">
              {CATEGORIES.find((x) => x.id === category)?.label}
            </h3>

            {category === 'outfits' && (
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(OUTFIT_THEMES) as OutfitThemeId[]).map((id) => {
                  const theme = OUTFIT_THEMES[id];
                  const active = c.outfitTheme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onUpdateCustomization({ outfitTheme: id })}
                      className={`p-2 rounded border flex flex-col items-center text-center gap-1.5 relative transition-colors ${
                        active
                          ? 'bg-[#21291e] border-[#D95D24] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0] hover:border-white/25'
                      }`}
                    >
                      {active && (
                        <Check className="w-3.5 h-3.5 text-[#D95D24] absolute top-1.5 right-1.5" />
                      )}
                      <svg viewBox="0 0 40 48" className="w-9 h-11 shrink-0" aria-hidden="true">
                        <circle cx="20" cy="8" r="5" fill={theme.secondaryHex} stroke={theme.accentHex} strokeWidth="1.2" />
                        <path
                          d="M11 15 L29 15 L33 27 L28 29 L26 20 L25 32 L27 45 L21 45 L20 34 L19 45 L13 45 L15 32 L14 20 L12 29 L7 27 Z"
                          fill={theme.primaryHex}
                          stroke="rgba(255,255,255,0.22)"
                          strokeWidth="1"
                        />
                        <rect x="15" y="17" width="10" height="9" rx="1.5" fill={theme.secondaryHex} />
                        <path d="M16 20 H24" stroke={theme.accentHex} strokeWidth="2" />
                      </svg>
                      <span className="text-[11px] font-semibold leading-tight">{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {category === 'helmets' && (
              <div className="space-y-2">
                {HELMET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ helmet: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.helmet === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.helmet === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'masks' && (
              <div className="space-y-2">
                {MASK_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ mask: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.mask === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.mask === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'goggles' && (
              <div className="space-y-2">
                {GOGGLES_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ goggles: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.goggles === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.goggles === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'vests' && (
              <div className="space-y-2">
                {VEST_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ vest: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.vest === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.vest === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'gear' && (
              <div className="space-y-2">
                {GEAR_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ glovesBoots: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.glovesBoots === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.glovesBoots === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'backpacks' && (
              <div className="space-y-2">
                {BACKPACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateCustomization({ backpack: opt.id })}
                    className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      c.backpack === opt.id
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {c.backpack === opt.id && <Check className="w-4 h-4 text-[#D95D24]" />}
                  </button>
                ))}
              </div>
            )}

            {category === 'skins' && (
              <div className="space-y-2">
                {(Object.keys(WEAPON_SKINS) as WeaponSkinId[]).map((skinId) => {
                  const sk = WEAPON_SKINS[skinId];
                  const active = c.weaponSkin === skinId;
                  return (
                    <button
                      key={skinId}
                      type="button"
                      onClick={() => onUpdateCustomization({ weaponSkin: skinId })}
                      className={`w-full p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                        active
                          ? 'bg-[#21291e] border-[#D95D24] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-5 h-3.5 rounded-sm border border-white/25"
                          style={{
                            backgroundColor: `#${sk.accentHex.toString(16).padStart(6, '0')}`,
                          }}
                        />
                        <span>{sk.label}</span>
                      </div>
                      {active && <Check className="w-4 h-4 text-[#D95D24]" />}
                    </button>
                  );
                })}
              </div>
            )}

            {category === 'emotes' && (
              <div className="space-y-2">
                {EMOTES.map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => onTriggerEmote(em.id)}
                    className="w-full p-2.5 rounded border bg-[#1D2024] hover:bg-[#2a2f36] border-white/10 hover:border-[#D95D24] text-xs font-semibold text-[#ECEBE6] text-left"
                  >
                    Trigger: {em.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full py-2.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-base"
          >
            Confirm Loadout
          </button>
        </div>
      </div>
    </div>
  );
};
