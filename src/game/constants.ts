import type {
  BackpackOptionId,
  CareerStats,
  DifficultyId,
  EnemyClassId,
  GameSettings,
  GearColorId,
  GogglesOptionId,
  GraphicsPreset,
  HelmetOptionId,
  MaskOptionId,
  OperativeId,
  OperativeSpec,
  OutfitThemeId,
  SafeZonePhase,
  VestOptionId,
  WeaponId,
  WeaponSkinId,
  WeaponSpec,
} from './types';

export const WORLD_RADIUS = 148;
export const TERRAIN_EXTENT = 360;

export const OUTFIT_THEMES: Record<
  OutfitThemeId,
  {
    label: string;
    primaryHex: string;
    secondaryHex: string;
    accentHex: string;
    pattern: 'solid' | 'digital' | 'woodland' | 'hazard' | 'arctic' | 'urban';
  }
> = {
  black_tactical: {
    label: 'Black Tactical',
    primaryHex: '#1d2026',
    secondaryHex: '#2f343d',
    accentHex: '#d93824',
    pattern: 'solid',
  },
  desert_ops: {
    label: 'Desert Operations',
    primaryHex: '#9d8563',
    secondaryHex: '#63533d',
    accentHex: '#d97724',
    pattern: 'digital',
  },
  arctic_ops: {
    label: 'Arctic Operations',
    primaryHex: '#cfd6dc',
    secondaryHex: '#6a7682',
    accentHex: '#38bdf8',
    pattern: 'arctic',
  },
  woodland_camo: {
    label: 'Woodland Camouflage',
    primaryHex: '#465839',
    secondaryHex: '#2f3a26',
    accentHex: '#b47838',
    pattern: 'woodland',
  },
  hazard_ops: {
    label: 'Hazard Operations',
    primaryHex: '#d49422',
    secondaryHex: '#23262b',
    accentHex: '#d93824',
    pattern: 'hazard',
  },
  urban_ops: {
    label: 'Urban Operations',
    primaryHex: '#4b5563',
    secondaryHex: '#242930',
    accentHex: '#e07a38',
    pattern: 'urban',
  },
};

export const WEAPON_SKINS: Record<
  WeaponSkinId,
  { label: string; bodyHex: number; accentHex: number; metalness: number; roughness: number }
> = {
  standard_matte: {
    label: 'Standard Matte',
    bodyHex: 0x24282e,
    accentHex: 0x4b525c,
    metalness: 0.72,
    roughness: 0.42,
  },
  crimson_collapse: {
    label: 'Crimson Collapse',
    bodyHex: 0x1e2024,
    accentHex: 0xd93824,
    metalness: 0.78,
    roughness: 0.28,
  },
  gilded_ops: {
    label: 'Gilded Ops',
    bodyHex: 0x22201d,
    accentHex: 0xd4a438,
    metalness: 0.88,
    roughness: 0.24,
  },
  arctic_frost: {
    label: 'Arctic Frost',
    bodyHex: 0xc2d4e4,
    accentHex: 0x2563eb,
    metalness: 0.65,
    roughness: 0.3,
  },
};

export const HELMET_OPTIONS: { id: HelmetOptionId; label: string }[] = [
  { id: 'standard', label: 'Combat Helmet' },
  { id: 'ballistic_nvg', label: 'Ballistic NVG' },
  { id: 'tactical_cap', label: 'Tactical Cap & Comms' },
  { id: 'recon_hood', label: 'Armored Hood' },
];

export const MASK_OPTIONS: { id: MaskOptionId; label: string }[] = [
  { id: 'balaclava', label: 'Tactical Balaclava' },
  { id: 'respirator', label: 'Respirator Half-Mask' },
  { id: 'armored_visor', label: 'Armored Face Shield' },
  { id: 'tactical_scarf', label: 'Field Shemagh' },
];

export const GOGGLES_OPTIONS: { id: GogglesOptionId; label: string }[] = [
  { id: 'none', label: 'No Eyewear' },
  { id: 'amber_tactical', label: 'Amber Tactical' },
  { id: 'red_thermal', label: 'Thermal Crimson' },
  { id: 'ballistic_clear', label: 'Ballistic Slate' },
];

export const VEST_OPTIONS: { id: VestOptionId; label: string }[] = [
  { id: 'light_rig', label: 'Light Plate Rig' },
  { id: 'heavy_carrier', label: 'Heavy Assault Carrier' },
  { id: 'recon_vest', label: 'Recon Modular Vest' },
];

export const GEAR_COLOR_OPTIONS: { id: GearColorId; label: string; hex: number }[] = [
  { id: 'stealth_black', label: 'Stealth Black', hex: 0x181a1d },
  { id: 'coyote_tan', label: 'Coyote Brown', hex: 0x6b5742 },
  { id: 'hazard_trim', label: 'Crimson Trim', hex: 0x231d1d },
];

export const BACKPACK_OPTIONS: { id: BackpackOptionId; label: string }[] = [
  { id: 'patrol_pack', label: 'Patrol Pack' },
  { id: 'survival_pack', label: 'Field Survival Pack' },
  { id: 'heavy_assault', label: 'Heavy Assault Pack' },
];

export const OPERATIVES: Record<OperativeId, OperativeSpec> = {
  warden: {
    id: 'warden',
    name: 'Warden',
    callsign: 'VANGUARD-01',
    role: 'Assault Specialist',
    bio: 'Black tactical armor with crimson chevrons, full-face mask, and ballistic NVG helmet built for breaching.',
    gender: 'male',
    defaultCustomization: {
      outfitTheme: 'black_tactical',
      helmet: 'recon_hood',
      mask: 'respirator',
      goggles: 'red_thermal',
      vest: 'heavy_carrier',
      glovesBoots: 'hazard_trim',
      backpack: 'heavy_assault',
      weaponSkin: 'crimson_collapse',
    },
    startingWeapon: 'tactical_pistol',
    speedBonus: 1.0,
    armorBonus: 20,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    callsign: 'PHANTOM-04',
    role: 'Recon & Survival Specialist',
    bio: 'Desert camouflage rig with ballistic NVG helmet, amber tactical goggles, and long-range survival pouches.',
    gender: 'male',
    defaultCustomization: {
      outfitTheme: 'desert_ops',
      helmet: 'ballistic_nvg',
      mask: 'balaclava',
      goggles: 'amber_tactical',
      vest: 'recon_vest',
      glovesBoots: 'coyote_tan',
      backpack: 'survival_pack',
      weaponSkin: 'gilded_ops',
    },
    startingWeapon: 'tactical_pistol',
    speedBonus: 1.05,
    armorBonus: 10,
  },
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    callsign: 'AEGIS-07',
    role: 'Tactical Support Specialist',
    bio: 'Full-sleeved black tactical uniform, protective vest, tactical comms cap, face covering, and combat boots.',
    gender: 'female',
    defaultCustomization: {
      outfitTheme: 'black_tactical',
      helmet: 'tactical_cap',
      mask: 'balaclava',
      goggles: 'none',
      vest: 'light_rig',
      glovesBoots: 'stealth_black',
      backpack: 'patrol_pack',
      weaponSkin: 'standard_matte',
    },
    startingWeapon: 'tactical_pistol',
    speedBonus: 1.04,
    armorBonus: 15,
  },
  nomad: {
    id: 'nomad',
    name: 'Nomad',
    callsign: 'DRIFTER-12',
    role: 'Stealth & Mobility Specialist',
    bio: 'Rugged military-olive and brown field uniform with tactical scarf, eyewear, and expedition survival pack.',
    gender: 'male',
    defaultCustomization: {
      outfitTheme: 'woodland_camo',
      helmet: 'standard',
      mask: 'tactical_scarf',
      goggles: 'ballistic_clear',
      vest: 'recon_vest',
      glovesBoots: 'coyote_tan',
      backpack: 'survival_pack',
      weaponSkin: 'standard_matte',
    },
    startingWeapon: 'tactical_pistol',
    speedBonus: 1.07,
    armorBonus: 10,
  },
};

export const VILLAINS: Record<
  EnemyClassId,
  {
    label: string;
    title: string;
    health: number;
    armor: number;
    armorTier: 0 | 1 | 2 | 3;
    speed: number;
    scale: number;
    preferredRange: number;
    weapon: WeaponId;
  }
> = {
  overlord: {
    label: 'The Overlord',
    title: 'Main Villain · Sector Commander',
    health: 220,
    armor: 115,
    armorTier: 3,
    speed: 4.5,
    scale: 1.12,
    preferredRange: 26,
    weapon: 'mk47_carbine',
  },
  reaper: {
    label: 'Reaper',
    title: 'Elite Enemy Commander',
    health: 145,
    armor: 80,
    armorTier: 2,
    speed: 5.2,
    scale: 1.03,
    preferredRange: 22,
    weapon: 'vortex_smg',
  },
  brute: {
    label: 'Brute',
    title: 'Heavy Enemy Enforcer',
    health: 185,
    armor: 100,
    armorTier: 3,
    speed: 3.7,
    scale: 1.18,
    preferredRange: 14,
    weapon: 'breacher_shotgun',
  },
  drone: {
    label: 'Scout Drone',
    title: 'AI Hunter Reconnaissance Unit',
    health: 75,
    armor: 25,
    armorTier: 1,
    speed: 6.4,
    scale: 1.0,
    preferredRange: 30,
    weapon: 'vortex_smg',
  },
  raider: {
    label: 'Sector Raider',
    title: 'Hostile Infantry',
    health: 95,
    armor: 35,
    armorTier: 1,
    speed: 4.3,
    scale: 1.0,
    preferredRange: 24,
    weapon: 'mk47_carbine',
  },
};

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  mk47_carbine: {
    id: 'mk47_carbine',
    name: 'MK-47 Carbine',
    shortName: 'MK-47',
    category: 'Carbine',
    damage: 25,
    fireInterval: 0.115,
    range: 138,
    hipSpread: 0.034,
    adsSpread: 0.0085,
    magSize: 30,
    reserveMax: 180,
    reloadTime: 1.85,
    pellets: 1,
    muzzleSpeed: 205,
    recoilPitch: 0.015,
    color: 0xd95d24,
    automatic: true,
  },
  vortex_smg: {
    id: 'vortex_smg',
    name: 'Vortex-9 SMG',
    shortName: 'VORTEX-9',
    category: 'SMG',
    damage: 17,
    fireInterval: 0.075,
    range: 88,
    hipSpread: 0.042,
    adsSpread: 0.015,
    magSize: 35,
    reserveMax: 175,
    reloadTime: 1.45,
    pellets: 1,
    muzzleSpeed: 170,
    recoilPitch: 0.01,
    color: 0xe09f3e,
    automatic: true,
  },
  longshot_dmr: {
    id: 'longshot_dmr',
    name: 'Longshot M24 DMR',
    shortName: 'M24 DMR',
    category: 'DMR',
    damage: 56,
    fireInterval: 0.46,
    range: 200,
    hipSpread: 0.052,
    adsSpread: 0.0022,
    magSize: 10,
    reserveMax: 60,
    reloadTime: 2.1,
    pellets: 1,
    muzzleSpeed: 270,
    recoilPitch: 0.036,
    color: 0xf4a261,
    automatic: false,
  },
  breacher_shotgun: {
    id: 'breacher_shotgun',
    name: 'SG-12 Breacher',
    shortName: 'SG-12',
    category: 'Shotgun',
    damage: 16,
    fireInterval: 0.65,
    range: 38,
    hipSpread: 0.085,
    adsSpread: 0.052,
    magSize: 8,
    reserveMax: 48,
    reloadTime: 2.0,
    pellets: 7,
    muzzleSpeed: 150,
    recoilPitch: 0.045,
    color: 0xff6b35,
    automatic: false,
  },
  tactical_pistol: {
    id: 'tactical_pistol',
    name: 'P-19 Sidearm',
    shortName: 'P-19',
    category: 'Sidearm',
    damage: 21,
    fireInterval: 0.21,
    range: 74,
    hipSpread: 0.03,
    adsSpread: 0.011,
    magSize: 15,
    reserveMax: 90,
    reloadTime: 1.2,
    pellets: 1,
    muzzleSpeed: 165,
    recoilPitch: 0.013,
    color: 0xcbd5e1,
    automatic: false,
  },
};

export const SAFE_ZONE_PHASES: SafeZonePhase[] = [
  { phase: 1, waitTime: 24, shrinkTime: 24, targetRadius: 105, dps: 3 },
  { phase: 2, waitTime: 18, shrinkTime: 22, targetRadius: 68, dps: 6 },
  { phase: 3, waitTime: 15, shrinkTime: 18, targetRadius: 38, dps: 10 },
  { phase: 4, waitTime: 12, shrinkTime: 16, targetRadius: 16, dps: 16 },
  { phase: 5, waitTime: 10, shrinkTime: 14, targetRadius: 5, dps: 24 },
];

export const DIFFICULTY_CONFIG: Record<
  DifficultyId,
  {
    label: string;
    description: string;
    botCount: number;
    botAccuracy: number;
    botReactionSpeed: number;
    botDamageScale: number;
  }
> = {
  rookie: {
    label: 'Rookie',
    description: '12 AI combatants · Forgiving sightlines & tactical pacing.',
    botCount: 12,
    botAccuracy: 0.54,
    botReactionSpeed: 0.8,
    botDamageScale: 0.65,
  },
  veteran: {
    label: 'Veteran',
    description: '16 AI combatants · Reaper, Brute, Scout Drones & Overlord.',
    botCount: 16,
    botAccuracy: 0.72,
    botReactionSpeed: 1.0,
    botDamageScale: 0.9,
  },
  elite: {
    label: 'Elite',
    description: '20 AI combatants · Aggressive flanking & relentless zone pressure.',
    botCount: 20,
    botAccuracy: 0.88,
    botReactionSpeed: 1.24,
    botDamageScale: 1.15,
  },
};

export const GRAPHICS_CONFIG: Record<
  GraphicsPreset,
  {
    label: string;
    resolutionScale: number;
    maxPixelRatio: number;
    shadows: boolean;
    shadowMapSize: number;
    treeCount: number;
    rockCount: number;
    farClip: number;
  }
> = {
  performance: {
    label: 'Performance',
    resolutionScale: 0.78,
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 512,
    treeCount: 75,
    rockCount: 45,
    farClip: 260,
  },
  balanced: {
    label: 'Balanced',
    resolutionScale: 0.92,
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    treeCount: 120,
    rockCount: 72,
    farClip: 330,
  },
  ultra: {
    label: 'Ultra',
    resolutionScale: 1.0,
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMapSize: 2048,
    treeCount: 170,
    rockCount: 100,
    farClip: 410,
  },
};

export const SECTOR_LANDMARKS = [
  { id: 'military_base', name: 'Military Base', x: -16, z: -72, radius: 34 },
  { id: 'industrial_zone', name: 'Industrial Zone', x: 64, z: -24, radius: 32 },
  { id: 'urban_ruins', name: 'Urban Ruins', x: -64, z: -12, radius: 30 },
  { id: 'rural_village', name: 'Rural Village', x: -42, z: 62, radius: 30 },
  { id: 'forest_hills', name: 'Forest Hills', x: 18, z: 24, radius: 28 },
  { id: 'mountain_outpost', name: 'Mountain Outpost', x: 68, z: 66, radius: 28 },
] as const;

export const DEFAULT_CAREER_STATS: CareerStats = {
  matchesPlayed: 0,
  wins: 0,
  totalKills: 0,
  bestRank: 99,
  totalDamage: 0,
  bestSurvivalTime: 0,
};

export const DEFAULT_SETTINGS: GameSettings = {
  operative: 'warden',
  customization: { ...OPERATIVES.warden.defaultCustomization },
  mode: 'battle_royale',
  difficulty: 'veteran',
  graphics: 'balanced',
  timeOfDay: 'sunset',
  sensitivity: 1.0,
  masterVolume: 0.75,
  sfxVolume: 0.85,
  musicVolume: 0.55,
  muted: false,
  touchEnabled: 'auto',
};
