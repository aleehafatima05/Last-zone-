import { useCallback, useEffect, useRef, useState } from 'react';
import { InventoryModal } from './components/InventoryModal';
import { LobbyOverlay } from './components/LobbyOverlay';
import { AfterActionModal, PauseModal } from './components/MatchModals';
import { TacticalHud } from './components/TacticalHud';
import { TacticalMapModal } from './components/TacticalMapModal';
import { TouchControls } from './components/TouchControls';
import { soundEngine } from './game/audio';
import { DEFAULT_CAREER_STATS, DEFAULT_SETTINGS, OPERATIVES } from './game/constants';
import { createInitialSafeZone, updateCareerStats } from './game/rules';
import type {
  CareerStats,
  CustomizationState,
  EmoteId,
  GameScreenState,
  GameSettings,
  HudSnapshot,
  MatchStats,
} from './game/types';
import { LastZoneEngine } from './game/world';

const SETTINGS_KEY = 'last_zone_settings_v2';
const CAREER_KEY = 'last_zone_career_v1';

function loadSavedSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const op =
      parsed.operative && OPERATIVES[parsed.operative as keyof typeof OPERATIVES]
        ? (parsed.operative as keyof typeof OPERATIVES)
        : DEFAULT_SETTINGS.operative;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      operative: op,
      customization: {
        ...OPERATIVES[op].defaultCustomization,
        ...(parsed.customization ?? {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadCareerStats(): CareerStats {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    if (!raw) return DEFAULT_CAREER_STATS;
    return { ...DEFAULT_CAREER_STATS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CAREER_STATS;
  }
}

const INITIAL_HUD: HudSnapshot = {
  health: 100,
  maxHealth: 100,
  armor: 0,
  maxArmor: 50,
  armorTier: 0,
  backpackTier: 1,
  medkits: 1,
  bandages: 2,
  weapons: [null, null, null],
  activeSlot: 2,
  isReloading: false,
  reloadProgress: 0,
  isAiming: false,
  isSprinting: false,
  isCrouching: false,
  stamina: 100,
  aliveCount: 17,
  totalCount: 17,
  kills: 0,
  damageDealt: 0,
  playerX: -8,
  playerZ: 6,
  playerYaw: 0.28,
  safeZone: createInitialSafeZone(),
  outsideZone: false,
  nearbyLootLabel: null,
  hitmarkerKind: 'none',
  damageFlash: 0,
  healProgress: 0,
  healingLabel: null,
  killFeed: [],
  gunfireBlips: [],
  supplyDrops: [],
  spreadAngle: 0.03,
  matchTime: 0,
  trainingTargetsRemaining: 0,
  locationName: 'The Forgotten Sector',
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<LastZoneEngine | null>(null);

  const [settings, setSettings] = useState<GameSettings>(loadSavedSettings);
  const [careerStats, setCareerStats] = useState<CareerStats>(loadCareerStats);
  const [screenState, setScreenState] = useState<GameScreenState>('loading');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [minimapBuildings, setMinimapBuildings] = useState<
    { x: number; z: number; w: number; d: number; color: string }[]
  >([]);
  const [isCoarsePointer, setIsCoarsePointer] = useState<boolean>(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);

  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const showMapRef = useRef(showMapModal);
  showMapRef.current = showMapModal;

  const showInvRef = useRef(showInventoryModal);
  showInvRef.current = showInventoryModal;

  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

  useEffect(() => {
    const checkTouch = () => {
      const coarse =
        window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
      setIsCoarsePointer(Boolean(coarse));
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next: GameSettings = {
        ...prev,
        ...patch,
        customization: patch.customization
          ? { ...patch.customization }
          : { ...prev.customization },
      };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
      engineRef.current?.updateSettings(next);
      return next;
    });
  }, []);

  const updateCustomization = useCallback(
    (patch: Partial<CustomizationState>) => {
      updateSettings({
        customization: {
          ...settingsRef.current.customization,
          ...patch,
        },
      });
    },
    [updateSettings],
  );

  const handleDeploy = useCallback(() => {
    if (!engineRef.current) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setShowMapModal(false);
    setShowInventoryModal(false);
    setMatchStats(null);
    setScreenState('playing');
    document.body.dataset.state = 'playing';
    engineRef.current.startNewMatch();
    setMinimapBuildings(engineRef.current.getMinimapBuildings());
  }, []);

  const handlePause = useCallback(() => {
    if (screenStateRef.current !== 'playing') return;
    setShowMapModal(false);
    setShowInventoryModal(false);
    setScreenState('paused');
    engineRef.current?.setScreenState('paused');
  }, []);

  const handleResume = useCallback(() => {
    if (screenStateRef.current !== 'paused') return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setScreenState('playing');
    engineRef.current?.setScreenState('playing');
  }, []);

  const handleReturnToLobby = useCallback(() => {
    setShowMapModal(false);
    setShowInventoryModal(false);
    setMatchStats(null);
    setScreenState('title');
    engineRef.current?.setScreenState('title');
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      // Ignore fullscreen denial in sandboxed iframes
    }
  }, []);

  const toggleMapModal = useCallback(() => {
    setShowInventoryModal(false);
    setShowMapModal((prev) => {
      const next = !prev;
      if (next && document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      return next;
    });
  }, []);

  const toggleInventoryModal = useCallback(() => {
    setShowMapModal(false);
    setShowInventoryModal((prev) => {
      const next = !prev;
      if (next && document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      return next;
    });
  }, []);

  // Initialize Three.js Engine once
  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const autostart = new URLSearchParams(window.location.search).get('autostart') === '1';

    let engine: LastZoneEngine;
    engine = new LastZoneEngine(mountEl, settingsRef.current, {
      onHudUpdate: (snapshot) => setHud(snapshot),
      onMatchEnd: (stats) => {
        setShowMapModal(false);
        setShowInventoryModal(false);
        setMatchStats(stats);
        setScreenState('gameover');
        setCareerStats((prev) => {
          const updated = updateCareerStats(prev, stats);
          try {
            localStorage.setItem(CAREER_KEY, JSON.stringify(updated));
          } catch {
            // Ignore storage errors
          }
          return updated;
        });
      },
      onReady: () => {
        setMinimapBuildings(engine.getMinimapBuildings());
        if (autostart) {
          setScreenState('playing');
          document.body.dataset.state = 'playing';
          engine.startNewMatch(false);
        } else {
          setScreenState('title');
          engine.setScreenState('title');
        }
      },
    });
    engineRef.current = engine;
    soundEngine.syncSettings(settingsRef.current);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screenStateRef.current === 'title') {
        if (e.code === 'KeyM') {
          updateSettings({ muted: !settingsRef.current.muted });
        }
      } else if (screenStateRef.current === 'playing') {
        if (e.code === 'KeyX') {
          e.preventDefault();
          toggleMapModal();
        } else if (e.code === 'KeyI' || e.code === 'Tab') {
          e.preventDefault();
          toggleInventoryModal();
        } else if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          if (showMapRef.current) {
            setShowMapModal(false);
          } else if (showInvRef.current) {
            setShowInventoryModal(false);
          } else {
            handlePause();
          }
        } else if (e.code === 'KeyM') {
          updateSettings({ muted: !settingsRef.current.muted });
        } else if (e.code === 'KeyT') {
          const nextMode = settingsRef.current.touchEnabled === 'on' ? 'off' : 'on';
          updateSettings({ touchEnabled: nextMode });
        }
      } else if (screenStateRef.current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          handleResume();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePause, handleResume, toggleInventoryModal, toggleMapModal, updateSettings]);

  const touchActive =
    settings.touchEnabled === 'on' || (settings.touchEnabled === 'auto' && isCoarsePointer);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#141619]">
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={mountRef}
        data-testid="game-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      {/* Loading & Main Lobby Overlay + 360° Dressing Room */}
      <LobbyOverlay
        screenState={screenState}
        settings={settings}
        careerStats={careerStats}
        onUpdateSettings={(patch) => {
          soundEngine.unlock();
          soundEngine.playUiClick();
          updateSettings(patch);
        }}
        onUpdateCustomization={(patch) => {
          soundEngine.unlock();
          soundEngine.playUiClick();
          updateCustomization(patch);
        }}
        onSetLobbyMode={(mode) => engineRef.current?.setLobbyMode(mode)}
        onRotateTurntable={(dyaw) => engineRef.current?.rotateTurntable(dyaw)}
        onTriggerEmote={(emote: EmoteId) => {
          soundEngine.unlock();
          engineRef.current?.triggerEmote(emote);
        }}
        onDeploy={handleDeploy}
      />

      {/* Active Gameplay Tactical HUD */}
      {screenState === 'playing' && (
        <TacticalHud
          hud={hud}
          settings={settings}
          minimapBuildings={minimapBuildings}
          touchActive={touchActive}
          onPause={handlePause}
          onToggleMute={() => updateSettings({ muted: !settings.muted })}
          onToggleTouch={() =>
            updateSettings({ touchEnabled: touchActive ? 'off' : 'on' })
          }
          onToggleFullscreen={handleToggleFullscreen}
          onOpenMap={toggleMapModal}
          onOpenInventory={toggleInventoryModal}
          onSwitchWeapon={(slot) => engineRef.current?.switchWeaponSlot(slot)}
          onUseHeal={(kind) => engineRef.current?.startHeal(kind)}
          onLoot={() => engineRef.current?.tryPickupNearbyLoot()}
        />
      )}

      {/* Mobile Multitouch Controls */}
      {screenState === 'playing' && touchActive && !showMapModal && !showInventoryModal && (
        <TouchControls
          onMove={(x, y) => engineRef.current?.setTouchMove(x, y)}
          onLookDelta={(dx, dy) => engineRef.current?.addTouchLookDelta(dx, dy)}
          onFire={(f) => engineRef.current?.setTouchFire(f)}
          onToggleAim={() => engineRef.current?.setTouchAim(!hud.isAiming)}
          onToggleSprint={() => engineRef.current?.setTouchSprint(!hud.isSprinting)}
          onSprintChange={(s) => engineRef.current?.setTouchSprint(s)}
          onJump={() => engineRef.current?.triggerJump()}
          onCrouch={() => engineRef.current?.toggleCrouch()}
          onReload={() => engineRef.current?.startReload()}
          onLoot={() => engineRef.current?.tryPickupNearbyLoot()}
          onHeal={() => engineRef.current?.startHeal('medkit')}
          onOpenInventory={toggleInventoryModal}
          isAiming={hud.isAiming}
          isSprinting={hud.isSprinting}
          isCrouching={hud.isCrouching}
          hasNearbyLoot={Boolean(hud.nearbyLootLabel)}
        />
      )}

      {/* Interactive Tactical Battlefield Map Modal */}
      {screenState === 'playing' && showMapModal && (
        <TacticalMapModal
          hud={hud}
          settings={settings}
          minimapBuildings={minimapBuildings}
          onClose={() => setShowMapModal(false)}
        />
      )}

      {/* Field Inventory Modal */}
      {screenState === 'playing' && showInventoryModal && (
        <InventoryModal
          hud={hud}
          settings={settings}
          onSwitchWeapon={(slot) => engineRef.current?.switchWeaponSlot(slot)}
          onDropWeapon={(slot) => engineRef.current?.dropWeapon(slot)}
          onUseHeal={(kind) => engineRef.current?.startHeal(kind)}
          onClose={() => setShowInventoryModal(false)}
        />
      )}

      {/* Pause Modal */}
      {screenState === 'paused' && (
        <PauseModal
          settings={settings}
          onResume={handleResume}
          onRestart={handleDeploy}
          onQuitToLobby={handleReturnToLobby}
          onUpdateSettings={updateSettings}
        />
      )}

      {/* Victory / Defeat After-Action Report */}
      {screenState === 'gameover' && matchStats && (
        <AfterActionModal
          stats={matchStats}
          onPlayAgain={handleDeploy}
          onReturnToLobby={handleReturnToLobby}
        />
      )}
    </div>
  );
}
