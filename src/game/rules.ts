import { SAFE_ZONE_PHASES, SECTOR_LANDMARKS, WEAPONS, WORLD_RADIUS } from './constants';
import type {
  AABBCollider,
  CareerStats,
  DifficultyId,
  LootSpawn,
  MatchStats,
  MissionMode,
  SafeZoneState,
  WeaponId,
  WeaponSlotState,
} from './types';

export const WATER_LEVEL = -0.35;
export const RIVER_HALF_WIDTH = 6.2;

export function getRiverCenterZ(x: number): number {
  return 24 + Math.sin((x + 30) * 0.025) * 11;
}

export function isBridgeCrossing(x: number, z: number): boolean {
  const riverZ = getRiverCenterZ(x);
  if (Math.abs(z - riverZ) > RIVER_HALF_WIDTH + 3.5) return false;
  // Main N-S Highway bridge at x = 0, and West Village bridge at x = -46
  return Math.abs(x) < 4.4 || Math.abs(x + 46) < 4.0;
}

/**
 * Deterministic terrain elevation for The Forgotten Sector.
 * Flattens the 6 core landmark plateaus, carves the meandering river channel,
 * raises the Mountain Outpost ridge, and erects snow-capped perimeter peaks beyond WORLD_RADIUS.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // Rolling macro hills + fine undulation
  const macro =
    Math.sin(x * 0.022) * Math.cos(z * 0.02) * 2.6 +
    Math.sin((x + z) * 0.014) * 1.5;
  const detail = Math.sin(x * 0.085) * Math.cos(z * 0.08) * 0.32;
  let h = macro + detail;

  // Landmark plateaus
  const plateaus = [
    { px: -16, pz: -72, r: 30, targetH: 0.6 }, // Military Base
    { px: 64, pz: -24, r: 29, targetH: 0.4 }, // Industrial Zone
    { px: -64, pz: -12, r: 27, targetH: 0.45 }, // Urban Ruins
    { px: -42, pz: 62, r: 27, targetH: 0.55 }, // Rural Village
    { px: 0, pz: 0, r: 16, targetH: 0.25 }, // Central Crossroads
    { px: 68, pz: 66, r: 26, targetH: 5.4 }, // Mountain Outpost Ridge
  ];

  for (const p of plateaus) {
    const d = Math.hypot(x - p.px, z - p.pz);
    if (d < p.r) {
      const t = smoothstep(p.r, p.r * 0.45, d);
      h = lerp(h, p.targetH, t);
    }
  }

  // Forest Hills gentle elevation boost around (18, 12) north of river bank
  const hillDist = Math.hypot(x - 18, z - 10);
  if (hillDist < 22) {
    h += smoothstep(22, 6, hillDist) * 2.1;
  }

  // Smooth N-S and E-W road corridors
  const roadNS = Math.abs(x);
  if (roadNS < 7.5) {
    const t = smoothstep(7.5, 3.6, roadNS);
    h = lerp(h, clamp(h, 0.2, 0.55), t * 0.8);
  }
  const roadEW = Math.abs(z + 10);
  if (roadEW < 7.5) {
    const t = smoothstep(7.5, 3.6, roadEW);
    h = lerp(h, clamp(h, 0.2, 0.55), t * 0.8);
  }

  // Carve meandering river valley across playable basin
  const riverZ = getRiverCenterZ(x);
  const distToRiver = Math.abs(z - riverZ);
  if (distToRiver < RIVER_HALF_WIDTH + 5.5 && distFromCenter < WORLD_RADIUS + 18) {
    const bankT = smoothstep(RIVER_HALF_WIDTH + 5.5, RIVER_HALF_WIDTH * 0.45, distToRiver);
    h = lerp(h, -1.25, bankT);
  }

  // Natural angular ridged perimeter mountains beyond playable radius
  if (distFromCenter > WORLD_RADIUS - 8) {
    const rimT = Math.min(1, (distFromCenter - (WORLD_RADIUS - 8)) / 46);
    const theta = Math.atan2(z, x);
    const ridgeA = 1 - Math.abs(Math.sin(theta * 7 + x * 0.018));
    const ridgeB = 1 - Math.abs(Math.cos(theta * 13 - z * 0.024));
    const crags = 0.72 + ridgeA * 0.58 + ridgeB * 0.34;
    h += rimT * rimT * 27 * crags;
  }

  return Number(h.toFixed(4));
}

/**
 * Returns walkable surface elevation (terrain or road bridge deck over the river).
 */
export function walkableHeightAt(x: number, z: number): number {
  const th = groundHeightAt(x, z);
  if (isBridgeCrossing(x, z)) {
    return Math.max(th, 0.72);
  }
  return th;
}

export function getLocationNameAt(x: number, z: number): string {
  let closestName = 'The Forgotten Sector';
  let bestDist = Infinity;
  for (const lm of SECTOR_LANDMARKS) {
    const d = Math.hypot(x - lm.x, z - lm.z);
    if (d <= lm.radius + 8 && d < bestDist) {
      bestDist = d;
      closestName = lm.name;
    }
  }
  if (bestDist === Infinity) {
    const riverZ = getRiverCenterZ(x);
    if (Math.abs(z - riverZ) < RIVER_HALF_WIDTH + 6) {
      return 'Ironwash River';
    }
  }
  return closestName;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Resolves horizontal circle vs AABB colliders and keeps entity inside WORLD_RADIUS.
 */
export function resolveWorldCollision(
  x: number,
  z: number,
  y: number,
  radius: number,
  colliders: readonly AABBCollider[],
): { x: number; z: number } {
  let rx = x;
  let rz = z;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (y >= c.maxY - 0.15) continue;
    if (c.minY !== undefined && y + 1.8 <= c.minY) continue;

    const closestX = clamp(rx, c.minX, c.maxX);
    const closestZ = clamp(rz, c.minZ, c.maxZ);
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        rx += (dx / dist) * push;
        rz += (dz / dist) * push;
      } else {
        const penLeft = Math.abs(rx - c.minX);
        const penRight = Math.abs(c.maxX - rx);
        const penTop = Math.abs(rz - c.minZ);
        const penBottom = Math.abs(c.maxZ - rz);
        const minPen = Math.min(penLeft, penRight, penTop, penBottom);
        if (minPen === penLeft) rx = c.minX - radius;
        else if (minPen === penRight) rx = c.maxX + radius;
        else if (minPen === penTop) rz = c.minZ - radius;
        else rz = c.maxZ + radius;
      }
    }
  }

  const maxR = WORLD_RADIUS - 2;
  const dist = Math.hypot(rx, rz);
  if (dist > maxR && dist > 1e-5) {
    rx = (rx / dist) * maxR;
    rz = (rz / dist) * maxR;
  }

  return { x: rx, z: rz };
}

/**
 * 3D segment vs AABB intersection test for line-of-sight & bullet obstruction.
 */
export function segmentIntersectsAABB(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  box: AABBCollider,
): number | null {
  const minY = box.minY ?? -50;
  const maxY = box.maxY;

  let tmin = 0;
  let tmax = 1;

  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  const axes: [number, number, number, number][] = [
    [ax, dx, box.minX, box.maxX],
    [ay, dy, minY, maxY],
    [az, dz, box.minZ, box.maxZ],
  ];

  for (const [origin, dir, bmin, bmax] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < bmin || origin > bmax) return null;
    } else {
      let t1 = (bmin - origin) / dir;
      let t2 = (bmax - origin) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }

  return tmin >= 0 && tmin <= 1 ? tmin : null;
}

export function createInitialSafeZone(seedOffsetX = 0, seedOffsetZ = 0): SafeZoneState {
  const first = SAFE_ZONE_PHASES[0];
  return {
    phaseIndex: 0,
    phaseStatus: 'waiting',
    timer: first.waitTime,
    currentX: 0,
    currentZ: 0,
    currentRadius: WORLD_RADIUS - 4,
    startX: 0,
    startZ: 0,
    startRadius: WORLD_RADIUS - 4,
    nextX: clamp(seedOffsetX, -24, 24),
    nextZ: clamp(seedOffsetZ, -24, 24),
    nextRadius: first.targetRadius,
    dps: first.dps,
  };
}

export function stepSafeZone(
  zone: SafeZoneState,
  dt: number,
  rng: () => number = Math.random,
): SafeZoneState {
  if (zone.phaseStatus === 'final') return zone;

  const phase = SAFE_ZONE_PHASES[zone.phaseIndex];
  if (!phase) {
    return { ...zone, phaseStatus: 'final', timer: 0 };
  }

  const nextTimer = zone.timer - dt;

  if (zone.phaseStatus === 'waiting') {
    if (nextTimer <= 0) {
      return {
        ...zone,
        phaseStatus: 'shrinking',
        timer: phase.shrinkTime,
        startX: zone.currentX,
        startZ: zone.currentZ,
        startRadius: zone.currentRadius,
        dps: phase.dps,
      };
    }
    return { ...zone, timer: nextTimer };
  }

  const progress = clamp(1 - nextTimer / phase.shrinkTime, 0, 1);
  const currentX = lerp(zone.startX, zone.nextX, progress);
  const currentZ = lerp(zone.startZ, zone.nextZ, progress);
  const currentRadius = lerp(zone.startRadius, zone.nextRadius, progress);

  if (nextTimer <= 0) {
    const nextPhaseIndex = zone.phaseIndex + 1;
    const nextPhase = SAFE_ZONE_PHASES[nextPhaseIndex];
    if (!nextPhase) {
      return {
        ...zone,
        phaseStatus: 'final',
        timer: 0,
        currentX: zone.nextX,
        currentZ: zone.nextZ,
        currentRadius: zone.nextRadius,
      };
    }
    const maxShift = Math.max(0, zone.nextRadius - nextPhase.targetRadius) * 0.45;
    const angle = rng() * Math.PI * 2;
    const shift = rng() * maxShift;
    return {
      phaseIndex: nextPhaseIndex,
      phaseStatus: 'waiting',
      timer: nextPhase.waitTime,
      currentX: zone.nextX,
      currentZ: zone.nextZ,
      currentRadius: zone.nextRadius,
      startX: zone.nextX,
      startZ: zone.nextZ,
      startRadius: zone.nextRadius,
      nextX: clamp(zone.nextX + Math.cos(angle) * shift, -45, 45),
      nextZ: clamp(zone.nextZ + Math.sin(angle) * shift, -45, 45),
      nextRadius: nextPhase.targetRadius,
      dps: nextPhase.dps,
    };
  }

  return {
    ...zone,
    timer: nextTimer,
    currentX,
    currentZ,
    currentRadius,
  };
}

export function isOutsideSafeZone(x: number, z: number, zone: SafeZoneState): boolean {
  return Math.hypot(x - zone.currentX, z - zone.currentZ) > zone.currentRadius;
}

/**
 * Computes health and armor damage after armor tier mitigation.
 * Tier 1 absorbs 25%, Tier 2 absorbs 40%, Tier 3 absorbs 55%.
 */
export function applyCombatDamage(
  health: number,
  armor: number,
  armorTier: 0 | 1 | 2 | 3,
  rawDamage: number,
  ignoreArmor = false,
): { health: number; armor: number; armorBroken: boolean; damageTaken: number } {
  if (rawDamage <= 0 || health <= 0) {
    return { health, armor, armorBroken: false, damageTaken: 0 };
  }

  let effectiveDamage = rawDamage;
  let nextArmor = armor;
  let armorBroken = false;

  if (!ignoreArmor && armor > 0 && armorTier > 0) {
    const mitigation = armorTier === 1 ? 0.25 : armorTier === 2 ? 0.4 : 0.55;
    const absorbed = Math.min(armor, rawDamage * mitigation);
    nextArmor = Math.max(0, armor - absorbed * 1.15);
    effectiveDamage = Math.max(1, rawDamage - absorbed);
    if (nextArmor <= 0) {
      nextArmor = 0;
      armorBroken = true;
    }
  }

  const nextHealth = Math.max(0, health - effectiveDamage);
  return {
    health: nextHealth,
    armor: nextArmor,
    armorBroken,
    damageTaken: health - nextHealth,
  };
}

export function getBackpackMaxMedkits(tier: 1 | 2 | 3): number {
  return tier === 1 ? 2 : tier === 2 ? 4 : 6;
}

export function getBackpackMaxBandages(tier: 1 | 2 | 3): number {
  return tier === 1 ? 4 : tier === 2 ? 8 : 12;
}

export function createWeaponSlot(weaponId: WeaponId): WeaponSlotState {
  const spec = WEAPONS[weaponId];
  return {
    weaponId,
    ammoInMag: spec.magSize,
    reserveAmmo: Math.round(spec.magSize * 2),
  };
}

export function applyLootPickup(
  loot: LootSpawn,
  state: {
    weapons: (WeaponSlotState | null)[];
    activeSlot: number;
    armor: number;
    armorTier: 0 | 1 | 2 | 3;
    backpackTier: 1 | 2 | 3;
    medkits: number;
    bandages: number;
  },
): { picked: boolean; label: string; nextActiveSlot: number } {
  if (loot.collected) {
    return { picked: false, label: '', nextActiveSlot: state.activeSlot };
  }

  if (loot.kind === 'weapon' && loot.weaponId) {
    const spec = WEAPONS[loot.weaponId];
    for (let i = 0; i < state.weapons.length; i++) {
      const slot = state.weapons[i];
      if (slot && slot.weaponId === loot.weaponId) {
        slot.reserveAmmo = Math.min(spec.reserveMax, slot.reserveAmmo + spec.magSize);
        return { picked: true, label: `${spec.name} Ammo`, nextActiveSlot: state.activeSlot };
      }
    }
    const targetSlot =
      state.weapons[0] === null
        ? 0
        : state.weapons[1] === null
          ? 1
          : state.activeSlot === 2
            ? 0
            : state.activeSlot;
    state.weapons[targetSlot] = createWeaponSlot(loot.weaponId);
    return { picked: true, label: spec.name, nextActiveSlot: targetSlot };
  }

  if (loot.kind === 'armor') {
    const tier = loot.tier ?? 1;
    const maxArmor = tier === 1 ? 50 : tier === 2 ? 80 : 115;
    if (tier > state.armorTier || state.armor < maxArmor) {
      state.armorTier = Math.max(state.armorTier, tier) as 0 | 1 | 2 | 3;
      state.armor = Math.max(state.armor, maxArmor);
      return { picked: true, label: `Tactical Armor Lv.${tier}`, nextActiveSlot: state.activeSlot };
    }
    return { picked: false, label: 'Armor Full', nextActiveSlot: state.activeSlot };
  }

  if (loot.kind === 'backpack') {
    const tier = (loot.tier ?? 2) as 1 | 2 | 3;
    if (tier > state.backpackTier) {
      state.backpackTier = tier;
      return { picked: true, label: `Tactical Pack Lv.${tier}`, nextActiveSlot: state.activeSlot };
    }
    return { picked: false, label: 'Pack Already Equipped', nextActiveSlot: state.activeSlot };
  }

  if (loot.kind === 'medkit') {
    const cap = getBackpackMaxMedkits(state.backpackTier);
    if (state.medkits >= cap) {
      return { picked: false, label: 'Medkit Capacity Full', nextActiveSlot: state.activeSlot };
    }
    state.medkits = Math.min(cap, state.medkits + loot.amount);
    return { picked: true, label: 'Field Medkit', nextActiveSlot: state.activeSlot };
  }

  if (loot.kind === 'bandage') {
    const cap = getBackpackMaxBandages(state.backpackTier);
    if (state.bandages >= cap) {
      return { picked: false, label: 'Bandage Capacity Full', nextActiveSlot: state.activeSlot };
    }
    state.bandages = Math.min(cap, state.bandages + loot.amount);
    return { picked: true, label: 'Combat Bandage', nextActiveSlot: state.activeSlot };
  }

  if (loot.kind === 'ammo') {
    let added = false;
    for (const slot of state.weapons) {
      if (!slot) continue;
      const spec = WEAPONS[slot.weaponId];
      if (slot.reserveAmmo < spec.reserveMax) {
        slot.reserveAmmo = Math.min(spec.reserveMax, slot.reserveAmmo + spec.magSize);
        added = true;
      }
    }
    return {
      picked: added,
      label: added ? 'Munitions Pack' : 'Ammo Full',
      nextActiveSlot: state.activeSlot,
    };
  }

  return { picked: false, label: '', nextActiveSlot: state.activeSlot };
}

export function buildMatchStats(params: {
  victory: boolean;
  aliveCount: number;
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
}): MatchStats {
  const rank = params.victory ? 1 : clamp(params.aliveCount, 2, params.totalCombatants);
  return {
    ...params,
    rank,
    damageDealt: Math.round(params.damageDealt),
    survivalTime: Math.round(params.survivalTime),
  };
}

export function updateCareerStats(career: CareerStats, match: MatchStats): CareerStats {
  if (match.mode === 'training') return career;
  return {
    matchesPlayed: career.matchesPlayed + 1,
    wins: career.wins + (match.victory ? 1 : 0),
    totalKills: career.totalKills + match.kills,
    bestRank: Math.min(career.bestRank, match.rank),
    totalDamage: career.totalDamage + match.damageDealt,
    bestSurvivalTime: Math.max(career.bestSurvivalTime, match.survivalTime),
  };
}

export function getOperativeRankLabel(career: CareerStats): {
  title: string;
  tier: number;
  nextProgress: number;
} {
  const score = career.wins * 120 + career.totalKills * 18 + career.matchesPlayed * 15;
  if (score >= 900) return { title: 'Apex Commander', tier: 5, nextProgress: 1 };
  if (score >= 520) return { title: 'Sector Marshal', tier: 4, nextProgress: (score - 520) / 380 };
  if (score >= 260) return { title: 'Vanguard Captain', tier: 3, nextProgress: (score - 260) / 260 };
  if (score >= 90) return { title: 'Field Sergeant', tier: 2, nextProgress: (score - 90) / 170 };
  return { title: 'Sector Recruit', tier: 1, nextProgress: score / 90 };
}

export function formatTimeClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
