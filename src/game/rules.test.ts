import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCombatDamage,
  applyLootPickup,
  buildMatchStats,
  createInitialSafeZone,
  createWeaponSlot,
  formatTimeClock,
  getLocationNameAt,
  getOperativeRankLabel,
  getRiverCenterZ,
  groundHeightAt,
  isOutsideSafeZone,
  resolveWorldCollision,
  segmentIntersectsAABB,
  stepSafeZone,
  updateCareerStats,
  walkableHeightAt,
  WATER_LEVEL,
} from './rules';
import { DEFAULT_CAREER_STATS } from './constants';
import type { AABBCollider, LootSpawn, WeaponSlotState } from './types';

test('groundHeightAt builds landmarks, carves river below water level, and supports bridges', () => {
  const baseH = groundHeightAt(-16, -72);
  const ridgeH = groundHeightAt(68, 66);
  const rimH = groundHeightAt(180, 0);
  assert.ok(Math.abs(baseH - 0.6) < 0.3);
  assert.ok(ridgeH > 4.5, `Expected Mountain Outpost elevation > 4.5m, got ${ridgeH}`);
  assert.ok(rimH > 15, `Expected perimeter mountain rim > 15m, got ${rimH}`);

  const rz = getRiverCenterZ(0);
  const riverbedH = groundHeightAt(0, rz);
  const bridgeH = walkableHeightAt(0, rz);
  assert.ok(riverbedH < WATER_LEVEL, `Expected riverbed < ${WATER_LEVEL}, got ${riverbedH}`);
  assert.ok(bridgeH > 0.6, `Expected bridge deck > 0.6m over river, got ${bridgeH}`);
});

test('getLocationNameAt resolves all 6 Forgotten Sector locations', () => {
  assert.equal(getLocationNameAt(-16, -72), 'Military Base');
  assert.equal(getLocationNameAt(64, -24), 'Industrial Zone');
  assert.equal(getLocationNameAt(-64, -12), 'Urban Ruins');
  assert.equal(getLocationNameAt(-42, 62), 'Rural Village');
  assert.equal(getLocationNameAt(18, 24), 'Forest Hills');
  assert.equal(getLocationNameAt(68, 66), 'Mountain Outpost');
});

test('resolveWorldCollision pushes entity outside AABB collider and world radius', () => {
  const walls: AABBCollider[] = [
    { id: 'bunker', minX: -5, maxX: 5, minZ: -5, maxZ: 5, maxY: 4 },
  ];
  const pushed = resolveWorldCollision(4.5, 0, 0, 1.0, walls);
  assert.ok(pushed.x >= 5.99, `Expected x >= 6.0, got ${pushed.x}`);

  const clamped = resolveWorldCollision(250, 0, 0, 0.5, []);
  assert.ok(Math.hypot(clamped.x, clamped.z) <= 146.1);
});

test('segmentIntersectsAABB detects obstructed line of sight', () => {
  const wall: AABBCollider = { id: 'wall', minX: 4, maxX: 6, minZ: -4, maxZ: 4, maxY: 5 };
  const hitT = segmentIntersectsAABB(0, 1.5, 0, 12, 1.5, 0, wall);
  assert.ok(hitT !== null && hitT > 0.3 && hitT < 0.4);

  const missT = segmentIntersectsAABB(0, 1.5, 10, 12, 1.5, 10, wall);
  assert.equal(missT, null);
});

test('safe zone transitions from waiting to shrinking and detects outside zone', () => {
  let zone = createInitialSafeZone(5, -5);
  assert.equal(zone.phaseStatus, 'waiting');
  assert.equal(isOutsideSafeZone(0, 0, zone), false);
  assert.equal(isOutsideSafeZone(152, 0, zone), true);

  zone = stepSafeZone(zone, 25, () => 0.5);
  assert.equal(zone.phaseStatus, 'shrinking');

  const rBefore = zone.currentRadius;
  zone = stepSafeZone(zone, 12, () => 0.5);
  assert.ok(zone.currentRadius < rBefore);
});

test('applyCombatDamage mitigates damage with armor and triggers armor break', () => {
  const hit1 = applyCombatDamage(100, 50, 2, 40);
  assert.equal(hit1.health, 76);
  assert.ok(hit1.armor < 50);
  assert.equal(hit1.armorBroken, false);

  const hit2 = applyCombatDamage(100, 5, 1, 40);
  assert.equal(hit2.armor, 0);
  assert.equal(hit2.armorBroken, true);

  const zoneHit = applyCombatDamage(100, 80, 3, 10, true);
  assert.equal(zoneHit.health, 90);
  assert.equal(zoneHit.armor, 80);
});

test('applyLootPickup equips weapons, upgrades backpack, and respects medkit caps', () => {
  const state = {
    weapons: [createWeaponSlot('tactical_pistol'), null, null] as (WeaponSlotState | null)[],
    activeSlot: 0,
    armor: 0,
    armorTier: 0 as 0 | 1 | 2 | 3,
    backpackTier: 1 as 1 | 2 | 3,
    medkits: 2,
    bandages: 1,
  };

  const fullMed: LootSpawn = {
    id: 'm1',
    kind: 'medkit',
    x: 0,
    y: 0,
    z: 0,
    amount: 1,
    collected: false,
  };
  assert.equal(applyLootPickup(fullMed, state).picked, false);

  const pack2: LootSpawn = {
    id: 'bp2',
    kind: 'backpack',
    x: 0,
    y: 0,
    z: 0,
    tier: 2,
    amount: 1,
    collected: false,
  };
  assert.equal(applyLootPickup(pack2, state).picked, true);
  assert.equal(state.backpackTier, 2);
  assert.equal(applyLootPickup(fullMed, state).picked, true);
  assert.equal(state.medkits, 3);
});

test('buildMatchStats, career accumulation, and rank progression behave cleanly', () => {
  const stats = buildMatchStats({
    victory: true,
    aliveCount: 1,
    totalCombatants: 17,
    kills: 8,
    bossKills: 1,
    damageDealt: 984.6,
    shotsFired: 40,
    shotsHit: 22,
    survivalTime: 184.4,
    lootCollected: 9,
    zonePhaseReached: 3,
    causeOfDeath: 'Survived',
    operativeName: 'Warden',
    mode: 'battle_royale',
    difficulty: 'veteran',
  });
  assert.equal(stats.rank, 1);
  assert.equal(stats.damageDealt, 985);
  assert.equal(formatTimeClock(stats.survivalTime), '03:04');

  const nextCareer = updateCareerStats(DEFAULT_CAREER_STATS, stats);
  assert.equal(nextCareer.matchesPlayed, 1);
  assert.equal(nextCareer.wins, 1);
  assert.equal(nextCareer.totalKills, 8);
  assert.equal(nextCareer.bestRank, 1);
  assert.equal(getOperativeRankLabel(nextCareer).tier, 3);
});
