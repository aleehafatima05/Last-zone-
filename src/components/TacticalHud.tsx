import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Backpack,
  Heart,
  Map as MapIcon,
  Maximize2,
  Pause,
  Shield,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WEAPONS, WORLD_RADIUS } from '../game/constants';
import { formatTimeClock, getRiverCenterZ } from '../game/rules';
import type { GameSettings, HudSnapshot, WeaponId } from '../game/types';

function WeaponSilhouette({ weaponId }: { weaponId: WeaponId }) {
  if (weaponId === 'tactical_pistol') {
    return (
      <svg viewBox="0 0 48 20" className="w-8 h-3.5 shrink-0 opacity-90" aria-hidden="true">
        <path d="M10 4 H36 V9 H24 L20 17 H13 L16 9 H10 Z" fill="currentColor" />
      </svg>
    );
  }
  if (weaponId === 'longshot_dmr') {
    return (
      <svg viewBox="0 0 64 20" className="w-11 h-3.5 shrink-0 opacity-90" aria-hidden="true">
        <path d="M4 9 H16 L18 7 H38 V8 H60 V10 H38 L34 12 H28 L26 16 H23 L24 12 H15 L6 14 Z M23 3 H35 V6 H23 Z" fill="currentColor" />
      </svg>
    );
  }
  if (weaponId === 'breacher_shotgun') {
    return (
      <svg viewBox="0 0 60 20" className="w-10 h-3.5 shrink-0 opacity-90" aria-hidden="true">
        <path d="M4 11 L15 8 H54 V10 H34 V12 H24 L18 15 H14 L17 11 L6 15 Z M28 11 H42 V13 H28 Z" fill="currentColor" />
      </svg>
    );
  }
  if (weaponId === 'vortex_smg') {
    return (
      <svg viewBox="0 0 54 20" className="w-9 h-3.5 shrink-0 opacity-90" aria-hidden="true">
        <path d="M8 8 H16 V6 H32 V7 H48 V10 H34 L31 16 H27 L28 11 H20 L18 15 H14 L16 11 H8 Z M22 4 H28 V6 H22 Z" fill="currentColor" />
      </svg>
    );
  }
  // mk47_carbine
  return (
    <svg viewBox="0 0 60 20" className="w-10 h-3.5 shrink-0 opacity-90" aria-hidden="true">
      <path d="M4 8 H16 L18 6 H36 V7 H56 V9 H38 V11 H33 L35 17 H30 L28 11 H21 L19 16 H15 L17 11 L5 14 Z M24 3 H31 V6 H24 Z" fill="currentColor" />
    </svg>
  );
}

interface TacticalHudProps {
  hud: HudSnapshot;
  settings: GameSettings;
  minimapBuildings: { x: number; z: number; w: number; d: number; color: string }[];
  touchActive: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  onToggleTouch: () => void;
  onToggleFullscreen: () => void;
  onOpenMap: () => void;
  onOpenInventory: () => void;
  onSwitchWeapon: (slot: number) => void;
  onUseHeal: (kind: 'medkit' | 'bandage') => void;
  onLoot: () => void;
}

const COMPASS_TICKS = [
  { deg: 0, label: 'N' },
  { deg: 15, label: '15' },
  { deg: 30, label: '30' },
  { deg: 45, label: 'NE' },
  { deg: 60, label: '60' },
  { deg: 75, label: '75' },
  { deg: 90, label: 'E' },
  { deg: 105, label: '105' },
  { deg: 120, label: '120' },
  { deg: 135, label: 'SE' },
  { deg: 150, label: '150' },
  { deg: 165, label: '165' },
  { deg: 180, label: 'S' },
  { deg: 195, label: '195' },
  { deg: 210, label: '210' },
  { deg: 225, label: 'SW' },
  { deg: 240, label: '240' },
  { deg: 255, label: '255' },
  { deg: 270, label: 'W' },
  { deg: 285, label: '285' },
  { deg: 300, label: '300' },
  { deg: 315, label: 'NW' },
  { deg: 330, label: '330' },
  { deg: 345, label: '345' },
];

export const TacticalHud: React.FC<TacticalHudProps> = ({
  hud,
  settings,
  minimapBuildings,
  touchActive,
  onPause,
  onToggleMute,
  onToggleTouch,
  onToggleFullscreen,
  onOpenMap,
  onOpenInventory,
  onSwitchWeapon,
  onUseHeal,
  onLoot,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const ghostHpRef = useRef<number>(hud.health);

  if (hud.health > ghostHpRef.current) {
    ghostHpRef.current = hud.health;
  } else {
    ghostHpRef.current += (hud.health - ghostHpRef.current) * 0.16;
  }

  // Draw top-right tactical minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size * 0.5;
    const scale = (size * 0.45) / WORLD_RADIUS;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#18211b';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let g = 28; g < size; g += 28) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, size);
      ctx.moveTo(0, g);
      ctx.lineTo(size, g);
      ctx.stroke();
    }

    // Ironwash River
    ctx.strokeStyle = '#255263';
    ctx.lineWidth = Math.max(3, 10 * scale);
    ctx.beginPath();
    for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx += 10) {
      const sx = half + rx * scale;
      const sy = half + getRiverCenterZ(rx) * scale;
      if (rx === -WORLD_RADIUS) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Roads
    ctx.fillStyle = '#30343a';
    ctx.fillRect(half - 2.5, 0, 5, size);
    ctx.fillRect(0, half + -10 * scale - 2.5, size, 5);

    // Buildings
    for (let i = 0; i < minimapBuildings.length; i++) {
      const b = minimapBuildings[i];
      ctx.fillStyle = b.color;
      ctx.fillRect(
        half + (b.x - b.w * 0.5) * scale,
        half + (b.z - b.d * 0.5) * scale,
        Math.max(2.5, b.w * scale),
        Math.max(2.5, b.d * scale),
      );
    }

    // Safe Zone & Danger Perimeter
    if (settings.mode === 'battle_royale') {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(217, 56, 36, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        half + hud.safeZone.currentX * scale,
        half + hud.safeZone.currentZ * scale,
        hud.safeZone.currentRadius * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = 'rgba(236, 235, 230, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        half + hud.safeZone.nextX * scale,
        half + hud.safeZone.nextZ * scale,
        hud.safeZone.nextRadius * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    // Supply Drop markers
    for (const drop of hud.supplyDrops) {
      const dx = half + drop.x * scale;
      const dy = half + drop.z * scale;
      ctx.fillStyle = '#D93824';
      ctx.fillRect(dx - 3, dy - 3, 6, 6);
    }

    // Gunfire blips
    for (let i = 0; i < hud.gunfireBlips.length; i++) {
      const blip = hud.gunfireBlips[i];
      const alpha = Math.max(0, 1 - blip.age / 3.2);
      ctx.fillStyle = `rgba(217, 93, 36, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(half + blip.x * scale, half + blip.z * scale, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player cone & marker
    const px = half + hud.playerX * scale;
    const pz = half + hud.playerZ * scale;
    const lookAngle = -hud.playerYaw - Math.PI / 2;

    ctx.fillStyle = 'rgba(236, 235, 230, 0.25)';
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, 12, lookAngle - 0.45, lookAngle + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(px, pz, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }, [hud, minimapBuildings, settings.mode]);

  const activeWeapon = hud.weapons[hud.activeSlot];
  const weaponSpec = activeWeapon ? WEAPONS[activeWeapon.weaponId] : null;
  const crosshairGap = Math.round(6 + hud.spreadAngle * 220);

  // Heading in degrees [0..360)
  const deg = (((-hud.playerYaw * 180) / Math.PI) % 360 + 360) % 360;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {/* Damage / Collapse Zone Vignette */}
      {(hud.outsideZone || hud.damageFlash > 0.02 || hud.health <= 28) && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            boxShadow: `inset 0 0 90px rgba(217, 56, 36, ${Math.min(
              0.84,
              Math.max(
                hud.damageFlash * 0.72,
                hud.outsideZone ? 0.46 : 0,
                hud.health <= 28 ? 0.34 : 0,
              ),
            )})`,
          }}
        />
      )}

      {/* TOP-LEFT: Remaining / Kills + Location + Kill Feed */}
      <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-4 flex flex-col items-start gap-1.5">
        <div className="bg-[#141619]/90 border border-white/15 rounded px-2.5 py-1 flex items-center gap-3 shadow-lg">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#9AA0A6]">Remaining</span>
            <span className="font-display text-lg sm:text-xl font-bold font-mono-num text-[#ECEBE6] leading-none">
              {hud.aliveCount}
            </span>
          </div>
          <div className="w-px h-4 bg-white/15" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#9AA0A6]">Kills</span>
            <span className="font-display text-lg sm:text-xl font-bold font-mono-num text-[#D95D24] leading-none">
              {hud.kills}
            </span>
          </div>
        </div>

        <div className="bg-[#141619]/82 border border-white/10 rounded px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#C7C6C0]">
          {hud.locationName}
        </div>

        {hud.killFeed.length > 0 && (
          <div className="flex flex-col items-start gap-1 mt-0.5">
            {hud.killFeed.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className={`px-2 py-0.5 rounded text-[10px] bg-[#141619]/85 border ${
                  entry.isPlayerInvolved
                    ? 'border-[#D95D24]/75 text-[#ECEBE6]'
                    : 'border-white/10 text-[#C7C6C0]'
                }`}
              >
                <span className="font-semibold">{entry.killer}</span>{' '}
                <span className="text-[#9AA0A6]">[{entry.weapon}]</span>{' '}
                <span className="font-semibold text-[#D95D24]">{entry.victim}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOP-CENTER: Scrolling Degree Compass + Safe Zone Banner */}
      <div className="absolute top-2.5 sm:top-3.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 w-52 sm:w-80">
        <div className="w-full h-6 bg-[#141619]/88 border border-white/15 rounded relative overflow-hidden">
          {/* Center chevron */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-0.5 h-2 bg-[#D95D24] z-10" />
          {COMPASS_TICKS.map((tick) => {
            let delta = tick.deg - deg;
            if (delta > 180) delta -= 360;
            if (delta < -180) delta += 360;
            if (Math.abs(delta) > 78) return null;
            const pct = 50 + (delta / 75) * 50;
            const isCardinal = ['N', 'E', 'S', 'W'].includes(tick.label);
            return (
              <span
                key={tick.deg}
                style={{ left: `${pct}%` }}
                className={`absolute top-1 -translate-x-1/2 font-mono-num leading-none ${
                  isCardinal
                    ? 'text-[11px] font-bold text-[#ECEBE6]'
                    : 'text-[9px] text-[#9AA0A6]'
                }`}
              >
                {tick.label}
              </span>
            );
          })}
        </div>

        {/* Zone Alert / Timer */}
        {settings.mode === 'training' ? (
          <div className="bg-[#141619]/88 border border-white/15 rounded px-2.5 py-0.5 text-[11px] font-semibold text-[#ECEBE6]">
            Training Targets:{' '}
            <span className="font-mono-num text-[#D95D24]">{hud.trainingTargetsRemaining}</span>
          </div>
        ) : hud.outsideZone ? (
          <div className="bg-[#9e2f16]/95 border border-[#f97316] rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Outside Safe Zone · {formatTimeClock(hud.safeZone.timer)}
          </div>
        ) : hud.safeZone.phaseStatus === 'shrinking' ? (
          <div className="bg-[#141619]/92 border border-[#D93824] rounded px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#ECEBE6] inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D93824]" />
            Safe Zone is Shrinking!{' '}
            <span className="font-mono-num text-[#D95D24]">
              {formatTimeClock(hud.safeZone.timer)}
            </span>
          </div>
        ) : (
          <div className="bg-[#141619]/85 border border-white/10 rounded px-2.5 py-0.5 text-[10px] text-[#C7C6C0] font-mono-num">
            Zone {hud.safeZone.phaseIndex + 1} · {formatTimeClock(hud.safeZone.timer)}
          </div>
        )}
      </div>

      {/* TOP-RIGHT: Clickable Minimap + Compact Utility Strip Underneath */}
      <div className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-4 flex flex-col items-end gap-1.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenMap();
          }}
          aria-label="Enlarge Tactical Map"
          className="pointer-events-auto bg-[#141619]/92 border border-white/20 rounded p-1 shadow-xl hover:border-[#D95D24] transition-colors"
        >
          <canvas
            ref={minimapRef}
            width={116}
            height={116}
            className={`${touchActive ? 'w-20 h-20' : 'w-24 h-24 sm:w-28 sm:h-28'} rounded-sm block`}
          />
          <div className="flex items-center justify-between text-[9px] font-mono-num text-[#9AA0A6] px-0.5 pt-0.5">
            <span>MAP [X]</span>
            <span>Z{hud.safeZone.phaseIndex + 1}</span>
          </div>
        </button>

        <div className="pointer-events-auto flex items-center gap-1">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Tactical Map"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenMap();
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#141619]/90 border border-white/15 hover:bg-[#23272c] text-[#ECEBE6] flex items-center justify-center"
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Inventory"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenInventory();
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#141619]/90 border border-white/15 hover:bg-[#23272c] text-[#ECEBE6] flex items-center justify-center"
          >
            <Backpack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle Mute"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#141619]/90 border border-white/15 hover:bg-[#23272c] text-[#ECEBE6] flex items-center justify-center"
          >
            {settings.muted ? (
              <VolumeX className="w-3.5 h-3.5 text-[#D93824]" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle Touch Controls"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleTouch();
            }}
            className={`w-7 h-7 sm:w-8 sm:h-8 rounded border flex items-center justify-center ${
              touchActive
                ? 'bg-[#4D5D42] border-[#6b7f5d] text-white'
                : 'bg-[#141619]/90 border-white/15 text-[#9AA0A6] hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle Fullscreen"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleFullscreen();
            }}
            className="hidden sm:flex w-8 h-8 rounded bg-[#141619]/90 border border-white/15 hover:bg-[#23272c] text-[#ECEBE6] items-center justify-center"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#141619]/90 border border-white/15 hover:bg-[#23272c] text-[#ECEBE6] flex items-center justify-center"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CENTER: Dynamic Crosshair & Hitmarker */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <div className="w-1 h-1 rounded-full bg-[#ECEBE6]" />
          <div
            className="absolute w-0.5 h-2.5 bg-[#ECEBE6]/90"
            style={{ transform: `translateY(-${crosshairGap}px)` }}
          />
          <div
            className="absolute w-0.5 h-2.5 bg-[#ECEBE6]/90"
            style={{ transform: `translateY(${crosshairGap}px)` }}
          />
          <div
            className="absolute h-0.5 w-2.5 bg-[#ECEBE6]/90"
            style={{ transform: `translateX(-${crosshairGap}px)` }}
          />
          <div
            className="absolute h-0.5 w-2.5 bg-[#ECEBE6]/90"
            style={{ transform: `translateX(${crosshairGap}px)` }}
          />
          {hud.hitmarkerKind !== 'none' && (
            <svg viewBox="0 0 24 24" className="absolute w-6 h-6" aria-hidden="true">
              <path
                d="M5 5 L9 9 M19 5 L15 9 M5 19 L9 15 M19 19 L15 15"
                stroke={hud.hitmarkerKind === 'kill' ? '#D95D24' : '#ECEBE6'}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Center Heal / Loot Prompt */}
      <div className="fixed left-1/2 bottom-24 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none">
        {hud.healingLabel && (
          <div className="bg-[#141619]/92 border border-[#4ade80]/50 rounded px-3.5 py-1 text-xs text-[#ECEBE6]">
            <div className="flex justify-between gap-4 mb-1">
              <span>{hud.healingLabel}</span>
              <span className="font-mono-num">{Math.round(hud.healProgress * 100)}%</span>
            </div>
            <div className="w-36 h-1.5 bg-white/10 rounded overflow-hidden">
              <div
                className="h-full bg-[#4ade80]"
                style={{ width: `${Math.round(hud.healProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hud.nearbyLootLabel && !touchActive && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onLoot}
            className="pointer-events-auto bg-[#141619]/92 border border-[#D95D24] rounded px-3 py-1 text-xs font-semibold text-[#ECEBE6] shadow-md"
          >
            [E] Collect <span className="text-[#D95D24]">{hud.nearbyLootLabel}</span>
          </button>
        )}
      </div>

      {/* BOTTOM-CENTER UNIFIED TACTICAL BAR (keeps bottom-left joystick & bottom-right action buttons completely clear) */}
      <div
        className={`absolute bottom-2.5 -translate-x-1/2 bg-[#141619]/90 border border-white/15 rounded shadow-xl flex items-center ${
          touchActive
            ? 'left-[41%] px-2 py-1 gap-1.5 max-w-[395px]'
            : 'left-1/2 px-3 py-2 gap-3'
        }`}
      >
        {/* Health, Armor & Meds */}
        <div className={touchActive ? 'w-26' : 'w-44 sm:w-52'}>
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="inline-flex items-center gap-1 text-[#C7C6C0]">
              <Heart className="w-3 h-3 text-[#4ade80]" />
              HP
            </span>
            <span className="font-mono-num font-bold text-[#ECEBE6]">
              {hud.health}
              <span className="text-[#6B7280] font-normal">/{hud.maxHealth}</span>
            </span>
          </div>
          <div className="relative h-1.5 bg-white/10 rounded-sm overflow-hidden mb-1">
            <div
              className="absolute inset-y-0 left-0 bg-[#D95D24]/55"
              style={{ width: `${Math.max(0, Math.min(100, ghostHpRef.current))}%` }}
            />
            <div
              className={`absolute inset-y-0 left-0 ${
                hud.health <= 30 ? 'bg-[#ef4444]' : 'bg-[#ecebe6]'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px]">
            <span className="inline-flex items-center gap-1 text-[#9AA0A6]">
              <Shield className="w-3 h-3 text-[#38bdf8]" />
              {hud.armorTier > 0 ? `Lv.${hud.armorTier} (${hud.armor})` : 'No Armor'}
            </span>
            <div className="pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onUseHeal('medkit');
                }}
                className="px-1.5 py-0.5 rounded bg-[#1D2024] hover:bg-[#2a2f35] border border-white/10 text-[9px] text-[#4ade80] font-mono-num"
              >
                H:{hud.medkits}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onUseHeal('bandage');
                }}
                className="px-1.5 py-0.5 rounded bg-[#1D2024] hover:bg-[#2a2f35] border border-white/10 text-[9px] text-[#C7C6C0] font-mono-num"
              >
                G:{hud.bandages}
              </button>
            </div>
          </div>
        </div>

        <div className="w-px h-10 bg-white/10 shrink-0" />

        {/* Weapon Slots */}
        <div className="pointer-events-auto flex items-center gap-1">
          {hud.weapons.map((slot, idx) => {
            const isActive = idx === hud.activeSlot;
            const spec = slot ? WEAPONS[slot.weaponId] : null;
            return (
              <button
                key={idx}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSwitchWeapon(idx);
                }}
                className={`px-1.5 sm:px-2.5 py-1 rounded border text-left transition-colors ${
                  touchActive ? 'min-w-[46px]' : 'min-w-[78px]'
                } ${
                  isActive
                    ? 'bg-[#D95D24]/92 border-[#f58a57] text-white'
                    : slot
                      ? 'bg-[#1D2024] border-white/15 text-[#C7C6C0] hover:border-white/35'
                      : 'bg-[#1D2024]/50 border-white/5 text-[#6B7280]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] font-mono-num opacity-80">[{idx + 1}]</span>
                  {slot && !touchActive && <WeaponSilhouette weaponId={slot.weaponId} />}
                </div>
                <div className="text-[10px] sm:text-[11px] font-semibold truncate">
                  {spec ? spec.shortName : 'Empty'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Ammo Readout */}
        {activeWeapon && weaponSpec && (
          <>
            <div className="w-px h-9 bg-white/10 shrink-0" />
            <div className={`text-right ${touchActive ? 'min-w-[48px]' : 'min-w-[68px] sm:min-w-[82px]'}`}>
              {hud.isReloading ? (
                <div>
                  <div className="text-[10px] font-mono-num text-[#D95D24]">
                    RELOAD {Math.round(hud.reloadProgress * 100)}%
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded overflow-hidden mt-1">
                    <div
                      className="h-full bg-[#D95D24]"
                      style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-[9px] uppercase tracking-wider text-[#9AA0A6] truncate">
                    {weaponSpec.shortName}
                  </div>
                  <div className="font-display font-bold font-mono-num text-xl sm:text-2xl text-[#ECEBE6] leading-none">
                    {activeWeapon.ammoInMag}
                    <span className="text-xs text-[#6B7280] font-normal ml-1">
                      /{activeWeapon.reserveAmmo}
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
