import React from 'react';
import { formatTimeClock } from '../game/rules';
import type { GameSettings, MatchStats } from '../game/types';

interface PauseModalProps {
  settings: GameSettings;
  onResume: () => void;
  onRestart: () => void;
  onQuitToLobby: () => void;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  onResume,
  onRestart,
  onQuitToLobby,
  onUpdateSettings,
}) => {
  return (
    <div className="fixed inset-0 z-40 bg-[#0d0e11]/82 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label="Match Paused"
        className="w-full max-w-md bg-[#141619] border border-white/15 rounded-md p-6 shadow-2xl"
      >
        <div className="flex items-baseline justify-between border-b border-white/10 pb-3 mb-5">
          <h2 className="font-display text-3xl font-bold tracking-wider uppercase text-[#ECEBE6]">
            Match Paused
          </h2>
          <span className="text-xs text-[#9AA0A6]">Esc / P</span>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <div className="flex justify-between text-xs text-[#C7C6C0] mb-1.5">
              <span>Camera Sensitivity</span>
              <span className="font-mono-num">{settings.sensitivity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2.0"
              step="0.05"
              value={settings.sensitivity}
              onChange={(e) => onUpdateSettings({ sensitivity: parseFloat(e.target.value) })}
              className="w-full accent-[#D95D24]"
              aria-label="Camera Sensitivity"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-[#C7C6C0] mb-1.5">
              <span>Master Audio</span>
              <span className="font-mono-num">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.masterVolume}
              onChange={(e) => onUpdateSettings({ masterVolume: parseFloat(e.target.value) })}
              className="w-full accent-[#D95D24]"
              aria-label="Master Audio Volume"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 px-4 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-lg transition-colors whitespace-nowrap"
          >
            Resume Match
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-medium text-sm transition-colors whitespace-nowrap"
          >
            Restart Deployment
          </button>
          <button
            type="button"
            onClick={onQuitToLobby}
            className="w-full py-2.5 px-4 rounded bg-transparent hover:bg-white/5 border border-white/10 text-[#9AA0A6] hover:text-[#ECEBE6] font-medium text-sm transition-colors whitespace-nowrap"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

interface AfterActionModalProps {
  stats: MatchStats;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
}

export const AfterActionModal: React.FC<AfterActionModalProps> = ({
  stats,
  onPlayAgain,
  onReturnToLobby,
}) => {
  const accuracy =
    stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;

  return (
    <div className="fixed inset-0 z-40 bg-[#0c0d10]/86 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label="After-Action Report"
        className="w-full max-w-lg bg-[#141619] border border-white/15 rounded-md p-6 sm:p-7 shadow-2xl"
      >
        <div className="border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wider uppercase text-[#9AA0A6]">
                {stats.operativeName} ·{' '}
                {stats.mode === 'training' ? 'Training Grounds' : 'The Forgotten Sector'} ·{' '}
                {stats.difficulty}
              </p>
              <h2
                className={`font-display text-4xl sm:text-5xl font-extrabold tracking-wider uppercase mt-1 ${
                  stats.victory ? 'text-[#7fa365]' : 'text-[#D95D24]'
                }`}
              >
                {stats.victory ? 'Sector Secured' : 'Eliminated'}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-[#9AA0A6]">Rank</div>
              <div className="font-display font-extrabold text-4xl font-mono-num text-[#ECEBE6]">
                #{stats.rank}
                <span className="text-lg text-[#6B7280]">/{stats.totalCombatants}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2">
            {!stats.victory && (
              <p className="text-xs text-[#C7C6C0]">
                Eliminated by{' '}
                <span className="text-[#ECEBE6] font-semibold">{stats.causeOfDeath}</span>
              </p>
            )}
            {stats.bossKills > 0 && (
              <span className="px-2 py-0.5 rounded bg-[#D93824]/20 border border-[#D93824]/50 text-[11px] font-semibold text-[#fca5a5]">
                High-Value Targets Neutralized: {stats.bossKills}
              </span>
            )}
          </div>
        </div>

        {/* Stat Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Eliminations</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              {stats.kills}
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Damage Dealt</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              {stats.damageDealt}
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Accuracy</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              {accuracy}%
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Survival Time</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              {formatTimeClock(stats.survivalTime)}
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Gear Looted</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              {stats.lootCollected}
            </div>
          </div>
          <div className="bg-[#1D2024] border border-white/10 rounded p-3">
            <div className="text-[11px] uppercase tracking-wider text-[#9AA0A6]">Zone Phase</div>
            <div className="font-display text-2xl font-bold font-mono-num text-[#ECEBE6] mt-0.5">
              Phase {stats.zonePhaseReached}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-3 px-5 rounded bg-[#D95D24] hover:bg-[#e56b32] text-white font-display font-bold tracking-wider uppercase text-lg transition-colors whitespace-nowrap"
          >
            Deploy Again
          </button>
          <button
            type="button"
            onClick={onReturnToLobby}
            className="py-3 px-5 rounded bg-[#1D2024] hover:bg-[#272b30] border border-white/15 text-[#ECEBE6] font-medium text-sm transition-colors whitespace-nowrap"
          >
            Main Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
