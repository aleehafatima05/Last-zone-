export type GameScreenState = 'loading' | 'title' | 'playing' | 'paused' | 'gameover';

export type OperativeId = 'warden' | 'ranger' | 'sentinel' | 'nomad';

export type EnemyClassId = 'overlord' | 'reaper' | 'brute' | 'drone' | 'raider';

export type WeaponId =
  | 'mk47_carbine'
  | 'vortex_smg'
  | 'longshot_dmr'
  | 'breacher_shotgun'
  | 'tactical_pistol';

export type DifficultyId = 'rookie' | 'veteran' | 'elite';
export type MissionMode = 'battle_royale' | 'training';
export type GraphicsPreset = 'performance' | 'balanced' | 'ultra';
export type TimeOfDay = 'daylight' | 'sunset';

export type OutfitThemeId =
  | 'black_tactical'
  | 'desert_ops'
  | 'arctic_ops'
  | 'woodland_camo'
  | 'hazard_ops'
  | 'urban_ops';

export type HelmetOptionId = 'standard' | 'ballistic_nvg' | 'tactical_cap' | 'recon_hood';
export type MaskOptionId = 'balaclava' | 'respirator' | 'armored_visor' | 'tactical_scarf';
export type GogglesOptionId = 'none' | 'amber_tactical' | 'red_thermal' | 'ballistic_clear';
export type VestOptionId = 'light_rig' | 'heavy_carrier' | 'recon_vest';
export type GearColorId = 'stealth_black' | 'coyote_tan' | 'hazard_trim';
export type BackpackOptionId = 'patrol_pack' | 'survival_pack' | 'heavy_assault';
export type WeaponSkinId = 'standard_matte' | 'crimson_collapse' | 'gilded_ops' | 'arctic_frost';
export type EmoteId = 'combat_ready' | 'salute' | 'weapon_inspect' | 'victory_fist';

export interface CustomizationState {
  outfitTheme: OutfitThemeId;
  helmet: HelmetOptionId;
  mask: MaskOptionId;
  goggles: GogglesOptionId;
  vest: VestOptionId;
  glovesBoots: GearColorId;
  backpack: BackpackOptionId;
  weaponSkin: WeaponSkinId;
}

export interface OperativeSpec {
  id: OperativeId;
  name: string;
  callsign: string;
  role: string;
  bio: string;
  gender: 'male' | 'female';
  defaultCustomization: CustomizationState;
  startingWeapon: WeaponId;
  speedBonus: number;
  armorBonus: number;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  category: 'Carbine' | 'SMG' | 'DMR' | 'Shotgun' | 'Sidearm';
  damage: number;
  fireInterval: number;
  range: number;
  hipSpread: number;
  adsSpread: number;
  magSize: number;
  reserveMax: number;
  reloadTime: number;
  pellets: number;
  muzzleSpeed: number;
  recoilPitch: number;
  color: number;
  automatic: boolean;
}

export interface WeaponSlotState {
  weaponId: WeaponId;
  ammoInMag: number;
  reserveAmmo: number;
}

export type LootKind = 'weapon' | 'armor' | 'backpack' | 'medkit' | 'bandage' | 'ammo';

export interface LootSpawn {
  id: string;
  kind: LootKind;
  x: number;
  y: number;
  z: number;
  weaponId?: WeaponId;
  tier?: 1 | 2 | 3;
  amount: number;
  collected: boolean;
}

export interface SupplyDropState {
  id: string;
  x: number;
  y: number;
  z: number;
  groundY: number;
  landed: boolean;
  opened: boolean;
}

export interface AABBCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  minY?: number;
  blocksSight?: boolean;
  label?: string;
}

export interface SafeZonePhase {
  phase: number;
  waitTime: number;
  shrinkTime: number;
  targetRadius: number;
  dps: number;
}

export interface SafeZoneState {
  phaseIndex: number;
  phaseStatus: 'waiting' | 'shrinking' | 'final';
  timer: number;
  currentX: number;
  currentZ: number;
  currentRadius: number;
  startX: number;
  startZ: number;
  startRadius: number;
  nextX: number;
  nextZ: number;
  nextRadius: number;
  dps: number;
}

export interface GameSettings {
  operative: OperativeId;
  customization: CustomizationState;
  mode: MissionMode;
  difficulty: DifficultyId;
  graphics: GraphicsPreset;
  timeOfDay: TimeOfDay;
  sensitivity: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  touchEnabled: 'auto' | 'on' | 'off';
}

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  isPlayerInvolved: boolean;
  timestamp: number;
}

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'gunfire' | 'supply_drop';
  age: number;
}

export interface MatchStats {
  victory: boolean;
  rank: number;
  totalCombatants: number;
  kills: number;
  bossKills: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  survivalTime: number;
  lootCollected: number;
  zonePhaseReached: number;
  causeOfDeath: string;
  operativeName: string;
  mode: MissionMode;
  difficulty: DifficultyId;
}

export interface CareerStats {
  matchesPlayed: number;
  wins: number;
  totalKills: number;
  bestRank: number;
  totalDamage: number;
  bestSurvivalTime: number;
}

export interface HudSnapshot {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  armorTier: 0 | 1 | 2 | 3;
  backpackTier: 1 | 2 | 3;
  medkits: number;
  bandages: number;
  weapons: (WeaponSlotState | null)[];
  activeSlot: number;
  isReloading: boolean;
  reloadProgress: number;
  isAiming: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  stamina: number;
  aliveCount: number;
  totalCount: number;
  kills: number;
  damageDealt: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  safeZone: SafeZoneState;
  outsideZone: boolean;
  nearbyLootLabel: string | null;
  hitmarkerKind: 'none' | 'hit' | 'kill';
  damageFlash: number;
  healProgress: number;
  healingLabel: string | null;
  killFeed: KillFeedEntry[];
  gunfireBlips: MinimapBlip[];
  supplyDrops: SupplyDropState[];
  spreadAngle: number;
  matchTime: number;
  trainingTargetsRemaining: number;
  locationName: string;
}
