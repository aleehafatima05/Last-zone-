import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Check,
  Crosshair,
  Info,
  Shirt,
  Sliders,
  Sun,
  Sunset,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  DIFFICULTY_CONFIG,
  GRAPHICS_CONFIG,
  OPERATIVES,
  OUTFIT_THEMES,
  WEAPON_SKINS,
} from '../game/constants';
import { formatTimeClock, getOperativeRankLabel } from '../game/rules';
import type {
  CareerStats,
  CustomizationState,
  DifficultyId,
  EmoteId,
  GameScreenState,
  GameSettings,
  GraphicsPreset,
  MissionMode,
  OperativeId,
  TimeOfDay,
  WeaponSkinId,
} from '../game/types';
import { DressingRoomModal } from './DressingRoomModal';
import { Wordmark } from './Wordmark';

function OperativeRoleBadge({ id, className = 'w-7 h-7' }: { id: OperativeId; className?: string }) {
  if (id === 'warden') {
    return (
      <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
        <path d="M5 7 L14 13 L23 7 V11 L14 17 L5 11 Z M5 14 L14 20 L23 14 V18 L14 24 L5 18 Z" fill="#D93824" />
      </svg>
    );
  }
  if (id === 'ranger') {
    return (
      <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
        <circle cx="14" cy="14" r="8" fill="none" stroke="#D95D24" strokeWidth="2" />
        <circle cx="14" cy="14" r="2.5" fill="#D95D24" />
        <path d="M14 2 V8 M14 20 V26 M2 14 H8 M20 14 H26" stroke="#D95D24" strokeWidth="2" />
      </svg>
    );
  }
  if (id === 'sentinel') {
    return (
      <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
        <path d="M14 3 L23 7 V14 C23 19.5 18.8 23.5 14 25 C9.2 23.5 5 19.5 5 14 V7 Z" fill="none" stroke="#eab308" strokeWidth="2" />
        <path d="M9 12 L14 16 L19 12" fill="none" stroke="#eab308" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <path d="M4 10 L11 14 L14 8 L17 14 L24 10 L19 19 L14 16 L9 19 Z" fill="#f59e0b" />
    </svg>
  );
}

interface LobbyOverlayProps {
  screenState: GameScreenState;
  settings: GameSettings;
  careerStats: CareerStats;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onUpdateCustomization: (patch: Partial<CustomizationState>) => void;
  onSetLobbyMode: (mode: 'main' | 'dressing') => void;
  onRotateTurntable: (deltaYaw: number) => void;
  onTriggerEmote: (emote: EmoteId) => void;
  onDeploy: () => void;
}

type LobbyPanel =
  | 'none'
  | 'operatives'
  | 'missions'
  | 'dressing'
  | 'ranks'
  | 'settings'
  | 'stats'
  | 'credits';

export const LobbyOverlay: React.FC<LobbyOverlayProps> = ({
  screenState,
  settings,
  careerStats,
  onUpdateSettings,
  onUpdateCustomization,
  onSetLobbyMode,
  onRotateTurntable,
  onTriggerEmote,
  onDeploy,
}) => {
  const [panel, setPanel] = useState<LobbyPanel>('none');

  const openPanel = (next: LobbyPanel) => {
    setPanel(next);
    onSetLobbyMode(next === 'dressing' ? 'dressing' : 'main');
  };

  useEffect(() => {
    if (screenState !== 'title') {
      if (panel !== 'none') {
        setPanel('none');
        onSetLobbyMode('main');
      }
      return;
    }
    if (panel === 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        openPanel('none');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screenState, panel]);

  if (screenState === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-[#141619] flex flex-col items-center justify-center p-6">
        <Wordmark />
        <div className="w-56 h-1.5 bg-[#25292E] rounded-full overflow-hidden mt-6">
          <div className="h-full w-3/4 bg-[#D95D24] transition-all duration-300" />
        </div>
        <p className="text-xs tracking-[0.22em] uppercase text-[#9AA0A6] mt-3">
          Initializing The Forgotten Sector
        </p>
      </div>
    );
  }

  if (screenState !== 'title') return null;

  const activeOp = OPERATIVES[settings.operative];
  const activeDiff = DIFFICULTY_CONFIG[settings.difficulty];
  const activeGfx = GRAPHICS_CONFIG[settings.graphics];
  const rankInfo = getOperativeRankLabel(careerStats);
  const outfitInfo = OUTFIT_THEMES[settings.customization.outfitTheme];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* Soft edge scrims leaving center-left 3D operative crystal clear */}
      {panel === 'none' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(16,18,21,0.78) 0%, rgba(16,18,21,0.16) 36%, rgba(16,18,21,0.12) 64%, rgba(16,18,21,0.82) 100%)',
          }}
        />
      )}

      {/* MAIN LOBBY OVERLAY */}
      {panel === 'none' && (
        <>
          {/* Top Bar: Wordmark + Quick Audio/Credits */}
          <div className="relative z-10 flex items-start justify-between px-4 sm:px-8 pt-4 sm:pt-6">
            <div className="pointer-events-auto">
              <Wordmark />
              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-[#C7C6C0]">
                <span className="px-2 py-0.5 rounded bg-[#141619]/90 border border-white/10 font-semibold text-[#ECEBE6]">
                  {rankInfo.title} · Tier {rankInfo.tier}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#141619]/90 border border-white/10">
                  {settings.mode === 'training' ? 'Training Grounds' : 'Battle Royale'} ·{' '}
                  {activeDiff.label}
                </span>
                <span className="hidden sm:inline px-2 py-0.5 rounded bg-[#141619]/90 border border-white/10 text-[#9AA0A6]">
                  {settings.timeOfDay === 'sunset' ? 'Sunset Ops' : 'Daylight Ops'} ·{' '}
                  {activeGfx.label}
                </span>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ muted: !settings.muted })}
                aria-label={settings.muted ? 'Unmute Audio' : 'Mute Audio'}
                className="px-2.5 py-1.5 rounded bg-[#141619]/90 hover:bg-[#23272c] border border-white/15 text-xs text-[#C7C6C0] inline-flex items-center gap-1.5"
              >
                {settings.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-[#D93824]" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#D95D24]" />
                )}
                <span className="hidden sm:inline">{settings.muted ? 'Muted' : 'Audio'}</span>
              </button>
              <button
                type="button"
                onClick={() => openPanel('credits')}
                className="px-2.5 py-1.5 rounded bg-[#141619]/90 hover:bg-[#23272c] border border-white/15 text-xs text-[#C7C6C0] inline-flex items-center gap-1.5"
              >
                <Info className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Credits</span>
              </button>
            </div>
          </div>

          {/* Center-Right Tactical Menu Column + Bottom-Left Operative & Deploy */}
          <div className="relative z-10 flex-1 flex items-end justify-between px-4 sm:px-8 pb-3 sm:pb-5 gap-4">
            {/* Bottom-Left Operative Plate + Deploy CTA */}
            <div className="pointer-events-auto max-w-sm">
              <div className="bg-[#141619]/88 border border-white/12 rounded p-3 sm:p-3.5 mb-3 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <OperativeRoleBadge id={settings.operative} className="w-8 h-8 shrink-0" />
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[#D95D24] font-semibold">
                        {activeOp.callsign} · {activeOp.role}
                      </span>
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-[#ECEBE6] leading-none mt-0.5">
                        {activeOp.name}
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPanel('operatives')}
                    className="px-3 py-1.5 rounded bg-[#1D2024] hover:bg-[#2a2f36] border border-white/15 text-xs font-semibold text-[#ECEBE6] inline-flex items-center gap-1.5 shrink-0"
                  >
                    <Users className="w-3.5 h-3.5 text-[#D95D24]" />
                    Switch
                  </button>
                </div>
                <p className="hidden sm:block text-xs text-[#9AA0A6] mt-1.5 leading-relaxed">
                  {activeOp.bio}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-mono-num text-[#C7C6C0]">
                  <span>Kit: {outfitInfo.label}</span>
                  <span className="text-white/20">|</span>
                  <span>Skin: {WEAPON_SKINS[settings.customization.weaponSkin].label}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  data-start="true"
                  onClick={onDeploy}
                  className="px-7 sm:px-9 py-3 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-[0.14em] uppercase text-xl sm:text-2xl shadow-xl transition-colors whitespace-nowrap"
                >
                  Deploy Now
                </button>
                <button
                  type="button"
                  onClick={() => openPanel('dressing')}
                  className="px-4 py-3 rounded bg-[#141619]/92 hover:bg-[#23272c] border border-white/15 text-[#ECEBE6] text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <Shirt className="w-4 h-4 text-[#D95D24]" />
                  Dressing Room
                </button>
              </div>
            </div>

            {/* Right Tactical Menu Column (matches art direction) */}
            <div className="pointer-events-auto w-48 sm:w-60 flex flex-col gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => openPanel('missions')}
                className="w-full px-3.5 py-2.5 rounded bg-[#141619]/92 hover:bg-[#1e2228] border border-white/15 hover:border-[#D95D24] flex items-center gap-3 text-left transition-colors shadow-lg"
              >
                <Crosshair className="w-4 h-4 text-[#eab308] shrink-0" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-[#ECEBE6] leading-none">
                    Missions
                  </div>
                  <div className="text-[10px] text-[#9AA0A6] mt-0.5">
                    {settings.mode === 'training' ? 'Training' : 'Battle Royale'} ·{' '}
                    {activeDiff.label}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openPanel('ranks')}
                className="w-full px-3.5 py-2.5 rounded bg-[#141619]/92 hover:bg-[#1e2228] border border-white/15 hover:border-[#D95D24] flex items-center gap-3 text-left transition-colors shadow-lg"
              >
                <Award className="w-4 h-4 text-[#f59e0b] shrink-0" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-[#ECEBE6] leading-none">
                    Rank & Rewards
                  </div>
                  <div className="text-[10px] text-[#9AA0A6] mt-0.5">{rankInfo.title}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openPanel('dressing')}
                className="w-full px-3.5 py-2.5 rounded bg-[#141619]/92 hover:bg-[#1e2228] border border-white/15 hover:border-[#D95D24] flex items-center gap-3 text-left transition-colors shadow-lg"
              >
                <Shirt className="w-4 h-4 text-[#D95D24] shrink-0" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-[#ECEBE6] leading-none">
                    Customize Outfit
                  </div>
                  <div className="text-[10px] text-[#9AA0A6] mt-0.5">360° Gear & Skins</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openPanel('settings')}
                className="w-full px-3.5 py-2.5 rounded bg-[#141619]/92 hover:bg-[#1e2228] border border-white/15 hover:border-[#D95D24] flex items-center gap-3 text-left transition-colors shadow-lg"
              >
                <Sliders className="w-4 h-4 text-[#9AA0A6] shrink-0" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-[#ECEBE6] leading-none">
                    Settings
                  </div>
                  <div className="text-[10px] text-[#9AA0A6] mt-0.5">
                    {activeGfx.label} · Touch {settings.touchEnabled}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openPanel('stats')}
                className="w-full px-3.5 py-2.5 rounded bg-[#141619]/92 hover:bg-[#1e2228] border border-white/15 hover:border-[#D95D24] flex items-center gap-3 text-left transition-colors shadow-lg"
              >
                <BarChart3 className="w-4 h-4 text-[#38bdf8] shrink-0" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold uppercase tracking-wider text-[#ECEBE6] leading-none">
                    Statistics
                  </div>
                  <div className="text-[10px] text-[#9AA0A6] mt-0.5 font-mono-num">
                    {careerStats.wins} Wins · {careerStats.totalKills} Kills
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Quiet Footer Hint */}
          <div className="relative z-10 px-4 sm:px-8 pb-2.5 flex items-center justify-between text-[10px] text-[#9AA0A6]">
            <span className="truncate">
              WASD Move · Mouse Aim & Fire · C Crouch · E Loot · R Reload · H Medkit · X Map · I
              Inventory
            </span>
            <span className="hidden sm:inline font-mono-num text-[#6B7280] ml-4">v1.0</span>
          </div>
        </>
      )}

      {/* 360° DRESSING ROOM */}
      {panel === 'dressing' && (
        <DressingRoomModal
          settings={settings}
          onUpdateCustomization={onUpdateCustomization}
          onRotateTurntable={onRotateTurntable}
          onTriggerEmote={onTriggerEmote}
          onClose={() => openPanel('none')}
        />
      )}

      {/* OPERATIVE SELECTION MODAL */}
      {panel === 'operatives' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/65 flex items-center justify-start p-4 sm:p-10 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Select Operative"
            className="w-full max-w-md bg-[#141619] border border-white/15 rounded-md p-5 shadow-2xl max-h-[88vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Select Operative
              </h2>
              <button
                type="button"
                aria-label="Close Operatives"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {(Object.keys(OPERATIVES) as OperativeId[]).map((opId) => {
                const op = OPERATIVES[opId];
                const selected = settings.operative === opId;
                return (
                  <button
                    key={opId}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        operative: opId,
                        customization: { ...op.defaultCustomization },
                      })
                    }
                    className={`w-full text-left p-3.5 rounded border transition-colors ${
                      selected
                        ? 'bg-[#1f261c] border-[#D95D24]'
                        : 'bg-[#1D2024] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <OperativeRoleBadge id={opId} className="w-6 h-6 shrink-0" />
                        <span className="font-display text-xl font-bold uppercase tracking-wide text-[#ECEBE6]">
                          {op.name}
                        </span>
                      </div>
                      <span className="font-mono-num text-[11px] text-[#D95D24]">
                        {op.callsign}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-[#9AA0A6] mt-0.5">
                      {op.role} · Speed {Math.round(op.speedBonus * 100)}% · Base Armor +
                      {op.armorBonus}
                    </div>
                    <p className="text-xs text-[#C7C6C0] mt-1.5 leading-relaxed">{op.bio}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => openPanel('dressing')}
                className="flex-1 py-2.5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-semibold text-sm"
              >
                Customize Outfit
              </button>
              <button
                type="button"
                onClick={() => openPanel('none')}
                className="flex-1 py-2.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-base"
              >
                Confirm Operative
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MISSIONS & DIFFICULTY MODAL */}
      {panel === 'missions' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Missions and Combat Difficulty"
            className="w-full max-w-lg bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Missions & Briefing
              </h2>
              <button
                type="button"
                aria-label="Close Missions"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
                  Operation Mode
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      ['battle_royale', 'Battle Royale', 'Full 6-district sector + collapsing zone'],
                      ['training', 'Training Grounds', 'Armed loadout + combat drills'],
                    ] as [MissionMode, string, string][]
                  ).map(([mId, label, sub]) => (
                    <button
                      key={mId}
                      type="button"
                      onClick={() => onUpdateSettings({ mode: mId })}
                      className={`p-3 rounded border text-left transition-colors ${
                        settings.mode === mId
                          ? 'bg-[#21291e] border-[#D95D24] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0] hover:border-white/25'
                      }`}
                    >
                      <div className="text-sm font-bold">{label}</div>
                      <div className="text-[11px] text-[#9AA0A6] mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
                  Combat Difficulty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['rookie', 'veteran', 'elite'] as DifficultyId[]).map((dId) => (
                    <button
                      key={dId}
                      type="button"
                      onClick={() => onUpdateSettings({ difficulty: dId })}
                      className={`py-2.5 px-3 rounded border text-sm font-semibold transition-colors ${
                        settings.difficulty === dId
                          ? 'bg-[#4D5D42] border-[#6b7f5d] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0] hover:border-white/25'
                      }`}
                    >
                      {DIFFICULTY_CONFIG[dId].label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#9AA0A6] mt-2">
                  {DIFFICULTY_CONFIG[settings.difficulty].description}
                </p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
                  Sector Lighting
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      ['sunset', 'Sunset Collapse', <Sunset key="s" className="w-4 h-4" />],
                      ['daylight', 'Clear Daylight', <Sun key="d" className="w-4 h-4" />],
                    ] as [TimeOfDay, string, React.ReactNode][]
                  ).map(([tod, label, icon]) => (
                    <button
                      key={tod}
                      type="button"
                      onClick={() => onUpdateSettings({ timeOfDay: tod })}
                      className={`py-2.5 px-3 rounded border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                        settings.timeOfDay === tod
                          ? 'bg-[#D95D24] border-[#D95D24] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => openPanel('none')}
                className="flex-1 py-2.5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-semibold text-sm"
              >
                Save & Back
              </button>
              <button
                type="button"
                onClick={onDeploy}
                className="flex-1 py-2.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-base"
              >
                Deploy Mission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RANK & REWARDS MODAL */}
      {panel === 'ranks' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Rank and Rewards"
            className="w-full max-w-lg bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Rank & Progression
              </h2>
              <button
                type="button"
                aria-label="Close Rank and Rewards"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#1D2024] border border-white/10 rounded p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Trophy className="w-7 h-7 text-[#eab308]" />
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">
                      Current Standing
                    </div>
                    <div className="font-display text-2xl font-bold uppercase text-[#ECEBE6]">
                      {rankInfo.title} (Tier {rankInfo.tier})
                    </div>
                  </div>
                </div>
                <span className="font-mono-num text-xs text-[#D95D24]">
                  {Math.round(rankInfo.nextProgress * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-black/40 rounded overflow-hidden mt-3">
                <div
                  className="h-full bg-[#D95D24]"
                  style={{ width: `${Math.round(rankInfo.nextProgress * 100)}%` }}
                />
              </div>
            </div>

            <h3 className="text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
              Quick-Equip Weapon Skins
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(Object.keys(WEAPON_SKINS) as WeaponSkinId[]).map((skinId) => {
                const sk = WEAPON_SKINS[skinId];
                const active = settings.customization.weaponSkin === skinId;
                return (
                  <button
                    key={skinId}
                    type="button"
                    onClick={() => onUpdateCustomization({ weaponSkin: skinId })}
                    className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-between ${
                      active
                        ? 'bg-[#21291e] border-[#D95D24] text-white'
                        : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-3 rounded-sm border border-white/25"
                        style={{
                          backgroundColor: `#${sk.accentHex.toString(16).padStart(6, '0')}`,
                        }}
                      />
                      <span>{sk.label}</span>
                    </div>
                    {active && <Check className="w-3.5 h-3.5 text-[#D95D24]" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => openPanel('none')}
              className="w-full py-2.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-base"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {panel === 'settings' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Graphics and Audio Settings"
            className="w-full max-w-lg bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Settings
              </h2>
              <button
                type="button"
                aria-label="Close Settings"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
                  Graphics Quality
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['performance', 'balanced', 'ultra'] as GraphicsPreset[]).map((gId) => (
                    <button
                      key={gId}
                      type="button"
                      onClick={() => onUpdateSettings({ graphics: gId })}
                      className={`py-2 px-3 rounded border text-sm font-semibold transition-colors ${
                        settings.graphics === gId
                          ? 'bg-[#D95D24] border-[#D95D24] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0] hover:border-white/25'
                      }`}
                    >
                      {GRAPHICS_CONFIG[gId].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs text-[#C7C6C0] mb-1">
                    <span>Camera Sensitivity</span>
                    <span className="font-mono-num">{settings.sensitivity.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="2.0"
                    step="0.05"
                    value={settings.sensitivity}
                    onChange={(e) =>
                      onUpdateSettings({ sensitivity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#D95D24]"
                    aria-label="Camera Sensitivity"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-[#C7C6C0] mb-1">
                    <span>Master Volume</span>
                    <span className="font-mono-num">
                      {Math.round(settings.masterVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.masterVolume}
                    onChange={(e) =>
                      onUpdateSettings({ masterVolume: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#D95D24]"
                    aria-label="Master Volume"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-[#C7C6C0] mb-1">
                    <span>SFX Volume</span>
                    <span className="font-mono-num">{Math.round(settings.sfxVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.sfxVolume}
                    onChange={(e) => onUpdateSettings({ sfxVolume: parseFloat(e.target.value) })}
                    className="w-full accent-[#D95D24]"
                    aria-label="SFX Volume"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-[#C7C6C0] mb-1">
                    <span>Music Volume</span>
                    <span className="font-mono-num">{Math.round(settings.musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.musicVolume}
                    onChange={(e) =>
                      onUpdateSettings({ musicVolume: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#D95D24]"
                    aria-label="Music Volume"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#9AA0A6] mb-2">
                  Mobile Touch Controls
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['auto', 'Auto'],
                      ['on', 'Always On'],
                      ['off', 'Off'],
                    ] as [GameSettings['touchEnabled'], string][]
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onUpdateSettings({ touchEnabled: val })}
                      className={`py-2 px-3 rounded border text-xs font-semibold transition-colors ${
                        settings.touchEnabled === val
                          ? 'bg-[#4D5D42] border-[#6b7f5d] text-white'
                          : 'bg-[#1D2024] border-white/10 text-[#C7C6C0]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openPanel('none')}
              className="mt-6 w-full py-2.5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-base"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* CAREER STATISTICS MODAL */}
      {panel === 'stats' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Career Statistics"
            className="w-full max-w-md bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Combat Statistics
              </h2>
              <button
                type="button"
                aria-label="Close Statistics"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Matches</div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6]">
                  {careerStats.matchesPlayed}
                </div>
              </div>
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Victories</div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#7fa365]">
                  {careerStats.wins}
                </div>
              </div>
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">
                  Total Eliminations
                </div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#D95D24]">
                  {careerStats.totalKills}
                </div>
              </div>
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Best Rank</div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6]">
                  {careerStats.matchesPlayed > 0 ? `#${careerStats.bestRank}` : '—'}
                </div>
              </div>
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">
                  Total Damage
                </div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6]">
                  {careerStats.totalDamage}
                </div>
              </div>
              <div className="bg-[#1D2024] border border-white/10 rounded p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">
                  Longest Survival
                </div>
                <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6]">
                  {formatTimeClock(careerStats.bestSurvivalTime)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openPanel('none')}
              className="w-full py-2.5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-semibold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* CREDITS & ATTRIBUTION MODAL */}
      {panel === 'credits' && (
        <div className="fixed inset-0 z-30 bg-[#0d0e11]/75 flex items-center justify-center p-4 pointer-events-auto">
          <div
            role="dialog"
            aria-label="Credits and Asset Attribution"
            className="w-full max-w-md bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#ECEBE6]">
                Credits & Attribution
              </h2>
              <button
                type="button"
                aria-label="Close Credits"
                onClick={() => openPanel('none')}
                className="p-1.5 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#C7C6C0] leading-relaxed">
              <p>
                <strong className="text-[#ECEBE6]">LAST ZONE 1.0 — Survive the Collapse</strong> is
                an original static-web 3D tactical survival shooter built with zero paid external
                APIs or runtime server dependencies.
              </p>
              <p>
                <strong className="text-[#ECEBE6]">3D Rendering & Characters:</strong> Three.js (MIT
                License) featuring procedurally contoured anatomical humanoid rigs, custom PBR
                canvas textures, reflective Ironwash River water shaders, and instanced foliage.
              </p>
              <p>
                <strong className="text-[#ECEBE6]">Audio Synthesis:</strong> Original zero-asset Web
                Audio API procedural sound engine.
              </p>
              <p>
                <strong className="text-[#ECEBE6]">UI & Typography:</strong> React, Tailwind CSS,
                Lucide Icons (ISC License), Barlow Condensed, Plus Jakarta Sans & JetBrains Mono.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPanel('none')}
              className="mt-5 w-full py-2.5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-semibold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
