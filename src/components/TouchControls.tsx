import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  Backpack,
  Crosshair,
  Heart,
  RotateCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';

interface TouchControlsProps {
  onMove: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onFire: (firing: boolean) => void;
  onToggleAim: () => void;
  onToggleSprint: () => void;
  onSprintChange?: (sprinting: boolean) => void;
  onJump: () => void;
  onCrouch: () => void;
  onReload: () => void;
  onLoot: () => void;
  onHeal: () => void;
  onOpenInventory: () => void;
  isAiming: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  hasNearbyLoot: boolean;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onMove,
  onLookDelta,
  onFire,
  onToggleAim,
  onToggleSprint,
  onSprintChange,
  onJump,
  onCrouch,
  onReload,
  onLoot,
  onHeal,
  onOpenInventory,
  isAiming,
  isSprinting,
  isCrouching,
  hasNearbyLoot,
}) => {
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyTouchId = useRef<number | null>(null);
  const lookTouchId = useRef<number | null>(null);
  const fireTouchId = useRef<number | null>(null);
  const autoSprintActive = useRef(false);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastFirePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFiring, setIsFiring] = useState(false);

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    const nx = dx / maxR;
    const ny = -dy / maxR;
    setKnob({ x: dx, y: dy });
    onMove(nx, ny);

    const wantsAutoSprint = dist / maxR > 0.78 && ny > 0.65;
    if (wantsAutoSprint !== autoSprintActive.current) {
      autoSprintActive.current = wantsAutoSprint;
      onSprintChange?.(wantsAutoSprint);
    }
  };

  const releaseJoystick = (pointerId: number) => {
    if (joyTouchId.current !== pointerId) return;
    joyTouchId.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
    if (autoSprintActive.current) {
      autoSprintActive.current = false;
      onSprintChange?.(false);
    }
  };

  return (
    <>
      {/* Full-Viewport Background Camera Look Pad (below HUD buttons z-20 & action cluster z-30) */}
      <div
        className="fixed inset-0 z-10 pointer-events-auto touch-none select-none"
        onPointerDown={(e) => {
          if (lookTouchId.current !== null) return;
          lookTouchId.current = e.pointerId;
          lastLookPos.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (lookTouchId.current !== e.pointerId) return;
          const dx = e.clientX - lastLookPos.current.x;
          const dy = e.clientY - lastLookPos.current.y;
          lastLookPos.current = { x: e.clientX, y: e.clientY };
          onLookDelta(dx, dy);
        }}
        onPointerUp={(e) => {
          if (lookTouchId.current === e.pointerId) lookTouchId.current = null;
        }}
        onPointerCancel={(e) => {
          if (lookTouchId.current === e.pointerId) lookTouchId.current = null;
        }}
        aria-label="Camera Look Pad"
      />

      {/* Foreground Multitouch Joystick & Action Controls */}
      <div className="fixed inset-0 z-30 pointer-events-none select-none">
        {/* Left Virtual 360° Dual-Ring Movement Joystick */}
        <div
          ref={joyRef}
          className={`pointer-events-auto absolute bottom-3 left-3 w-28 h-28 rounded-full border-2 flex items-center justify-center touch-none transition-colors ${
            isSprinting
              ? 'border-[#D95D24]/80 bg-[#141619]/78'
              : 'border-white/25 bg-[#141619]/70'
          }`}
          onPointerDown={(e) => {
            e.stopPropagation();
            joyTouchId.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateJoystick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (joyTouchId.current !== e.pointerId) return;
            updateJoystick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => releaseJoystick(e.pointerId)}
          onPointerCancel={(e) => releaseJoystick(e.pointerId)}
          aria-label="Movement Joystick"
        >
          {/* Inner directional guide ring */}
          <div className="w-16 h-16 rounded-full border border-white/12 pointer-events-none flex items-center justify-center">
            <div
              className="w-10 h-10 rounded-full bg-[#ECEBE6]/90 border-2 border-[#D95D24] shadow-md"
              style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
            />
          </div>
        </div>

        {/* Right Action Cluster */}
        <div className="pointer-events-auto absolute bottom-3 right-3 flex items-end gap-2">
          <div className="flex flex-col gap-1.5 items-end">
            {hasNearbyLoot && (
              <button
                type="button"
                onClick={onLoot}
                className="px-3 py-1.5 rounded bg-[#D95D24] text-white font-display font-bold tracking-wider uppercase text-xs shadow-lg active:scale-95 touch-manipulation"
              >
                Collect
              </button>
            )}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={onOpenInventory}
                aria-label="Open Inventory"
                className="w-10 h-10 rounded-full bg-[#141619]/85 border border-white/20 text-[#ECEBE6] flex items-center justify-center active:scale-95 touch-manipulation"
              >
                <Backpack className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onHeal}
                aria-label="Use Medkit"
                className="w-10 h-10 rounded-full bg-[#141619]/85 border border-white/20 text-[#4ade80] flex items-center justify-center active:scale-95 touch-manipulation"
              >
                <Heart className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onReload}
                aria-label="Reload Weapon"
                className="w-10 h-10 rounded-full bg-[#141619]/85 border border-white/20 text-[#ECEBE6] flex items-center justify-center active:scale-95 touch-manipulation"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onCrouch}
                aria-label="Toggle Crouch"
                className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 touch-manipulation ${
                  isCrouching
                    ? 'bg-[#D95D24] border-[#D95D24] text-white'
                    : 'bg-[#141619]/85 border-white/20 text-[#ECEBE6]'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-1.5 items-center">
              <button
                type="button"
                onClick={onToggleSprint}
                aria-label="Toggle Sprint"
                className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 touch-manipulation ${
                  isSprinting
                    ? 'bg-[#4D5D42] border-[#6b7f5d] text-white'
                    : 'bg-[#141619]/85 border-white/20 text-[#ECEBE6]'
                }`}
              >
                <Zap className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onJump}
                aria-label="Jump"
                className="w-10 h-10 rounded-full bg-[#141619]/85 border border-white/20 text-[#ECEBE6] flex items-center justify-center active:scale-95 touch-manipulation"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggleAim}
                aria-label="Toggle Aim"
                className={`w-11 h-11 rounded-full border flex items-center justify-center active:scale-95 touch-manipulation ${
                  isAiming
                    ? 'bg-[#D95D24] border-[#D95D24] text-white'
                    : 'bg-[#141619]/85 border-white/25 text-[#ECEBE6]'
                }`}
              >
                <Crosshair className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Primary Fire Button with Pointer Capture + Simultaneous Aim-While-Firing */}
          <button
            type="button"
            aria-label="Fire Weapon"
            onPointerDown={(e) => {
              e.stopPropagation();
              fireTouchId.current = e.pointerId;
              lastFirePos.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsFiring(true);
              onFire(true);
            }}
            onPointerMove={(e) => {
              if (fireTouchId.current !== e.pointerId) return;
              const dx = e.clientX - lastFirePos.current.x;
              const dy = e.clientY - lastFirePos.current.y;
              lastFirePos.current = { x: e.clientX, y: e.clientY };
              onLookDelta(dx, dy);
            }}
            onPointerUp={(e) => {
              if (fireTouchId.current !== e.pointerId) return;
              e.stopPropagation();
              fireTouchId.current = null;
              setIsFiring(false);
              onFire(false);
            }}
            onPointerCancel={(e) => {
              if (fireTouchId.current !== e.pointerId) return;
              fireTouchId.current = null;
              setIsFiring(false);
              onFire(false);
            }}
            className={`w-16 h-16 rounded-full border-2 text-white font-display font-bold tracking-widest uppercase text-xs shadow-xl flex items-center justify-center touch-none transition-transform ${
              isFiring
                ? 'bg-[#D93824] border-white scale-95'
                : 'bg-[#D95D24]/95 border-[#ECEBE6]/80'
            }`}
          >
            FIRE
          </button>
        </div>
      </div>
    </>
  );
};
