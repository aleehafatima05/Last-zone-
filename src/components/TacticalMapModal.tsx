import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SECTOR_LANDMARKS, WORLD_RADIUS } from '../game/constants';
import { formatTimeClock, getRiverCenterZ } from '../game/rules';
import type { GameSettings, HudSnapshot } from '../game/types';

interface TacticalMapModalProps {
  hud: HudSnapshot;
  settings: GameSettings;
  minimapBuildings: { x: number; z: number; w: number; d: number; color: string }[];
  onClose: () => void;
}

export const TacticalMapModal: React.FC<TacticalMapModalProps> = ({
  hud,
  settings,
  minimapBuildings,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const halfX = w * 0.5;
    const halfY = h * 0.5;
    const scale = (Math.min(w, h) * 0.44) / WORLD_RADIUS;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#18211b';
    ctx.fillRect(0, 0, w, h);

    // Outer mountain ring
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(halfX, halfY, WORLD_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Grid coordinates
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Winding Ironwash River
    ctx.strokeStyle = '#255263';
    ctx.lineWidth = 12 * scale;
    ctx.beginPath();
    for (let rx = -WORLD_RADIUS; rx <= WORLD_RADIUS; rx += 6) {
      const sx = halfX + rx * scale;
      const sy = halfY + getRiverCenterZ(rx) * scale;
      if (rx === -WORLD_RADIUS) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // Roads
    ctx.fillStyle = '#33383e';
    ctx.fillRect(halfX - 4, halfY - WORLD_RADIUS * scale, 8, WORLD_RADIUS * 2 * scale);
    ctx.fillRect(halfX - WORLD_RADIUS * scale, halfY + -10 * scale - 4, WORLD_RADIUS * 2 * scale, 8);
    ctx.fillRect(halfX + -46 * scale - 3, halfY - 95 * scale, 6, 190 * scale);

    // Buildings
    for (const b of minimapBuildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(
        halfX + (b.x - b.w * 0.5) * scale,
        halfY + (b.z - b.d * 0.5) * scale,
        Math.max(4, b.w * scale),
        Math.max(4, b.d * scale),
      );
    }

    // Safe Zone & Danger Zone
    if (settings.mode === 'battle_royale') {
      // Danger Zone (red dashed outer / current ring)
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#D93824';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        halfX + hud.safeZone.currentX * scale,
        halfY + hud.safeZone.currentZ * scale,
        hud.safeZone.currentRadius * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();

      // Target Safe Zone (white solid ring)
      ctx.strokeStyle = '#ECEBE6';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(
        halfX + hud.safeZone.nextX * scale,
        halfY + hud.safeZone.nextZ * scale,
        hud.safeZone.nextRadius * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    // Supply Drop markers
    for (const drop of hud.supplyDrops) {
      const dx = halfX + drop.x * scale;
      const dy = halfY + drop.z * scale;
      ctx.fillStyle = '#D93824';
      ctx.fillRect(dx - 5, dy - 5, 10, 10);
      ctx.strokeStyle = '#ECEBE6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(dx - 5, dy - 5, 10, 10);
    }

    // Landmark pins + labels
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    for (const lm of SECTOR_LANDMARKS) {
      const lx = halfX + lm.x * scale;
      const ly = halfY + lm.z * scale;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 22, 25, 0.85)';
      const tw = ctx.measureText(lm.name).width + 12;
      ctx.fillRect(lx - tw * 0.5, ly - 22, tw, 15);
      ctx.fillStyle = '#ECEBE6';
      ctx.fillText(lm.name, lx, ly - 11);
    }

    // Player marker
    const px = halfX + hud.playerX * scale;
    const py = halfY + hud.playerZ * scale;
    const lookAngle = -hud.playerYaw - Math.PI / 2;
    ctx.fillStyle = 'rgba(236, 235, 230, 0.28)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 20, lookAngle - 0.45, lookAngle + 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [hud, settings.mode, minimapBuildings]);

  return (
    <div className="fixed inset-0 z-40 bg-[#0d0e11]/86 flex items-center justify-center p-3 sm:p-6">
      <div
        role="dialog"
        aria-label="Battlefield Map The Forgotten Sector"
        className="w-full max-w-2xl bg-[#141619] border border-white/15 rounded-md p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
          <div>
            <span className="text-[10px] uppercase tracking-[0.22em] text-[#D95D24] font-semibold">
              Battlefield Map
            </span>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-[#ECEBE6]">
              The Forgotten Sector
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {settings.mode === 'battle_royale' && (
              <div className="text-xs font-mono-num bg-[#1D2024] border border-white/10 rounded px-2.5 py-1 text-[#ECEBE6]">
                Zone {hud.safeZone.phaseIndex + 1} · {formatTimeClock(hud.safeZone.timer)}
              </div>
            )}
            <button
              type="button"
              aria-label="Close Tactical Map"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative bg-[#101512] border border-white/10 rounded overflow-hidden flex justify-center">
          <canvas ref={canvasRef} width={560} height={420} className="w-full max-w-[560px] h-auto" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-xs text-[#C7C6C0]">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-[#ECEBE6] inline-block" />
              Safe Zone
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-dashed border-[#D93824] inline-block" />
              Danger Perimeter
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#D93824] border border-white inline-block" />
              Supply Drop
            </span>
          </div>
          <span className="text-[#9AA0A6]">Current Location: {hud.locationName}</span>
        </div>
      </div>
    </div>
  );
};
