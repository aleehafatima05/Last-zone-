import * as THREE from 'three';
import { DIFFICULTY_CONFIG, VILLAINS, WEAPONS } from './constants';
import {
  animateOperative,
  createVillainRig,
  equipWeaponVisual,
  type OperativeRig,
} from './models';
import {
  applyCombatDamage,
  applyLootPickup,
  createWeaponSlot,
  isOutsideSafeZone,
  resolveWorldCollision,
  segmentIntersectsAABB,
  walkableHeightAt,
} from './rules';
import type { ProceduralTextureSet } from './textures';
import type {
  AABBCollider,
  DifficultyId,
  EnemyClassId,
  LootSpawn,
  SafeZoneState,
  WeaponSlotState,
} from './types';

export interface CombatantActor {
  id: string;
  name: string;
  isPlayer: boolean;
  enemyClass: EnemyClassId;
  rig: OperativeRig;
  x: number;
  y: number;
  z: number;
  vy: number;
  yaw: number;
  aimPitch: number;
  health: number;
  maxHealth: number;
  armor: number;
  armorTier: 0 | 1 | 2 | 3;
  backpackTier: 1 | 2 | 3;
  medkits: number;
  bandages: number;
  weapons: (WeaponSlotState | null)[];
  activeSlot: number;
  alive: boolean;
  deadTimer: number;
  stridePhase: number;
  recoil: number;
  hitFlash: number;
  fireCooldown: number;
  reloadTimer: number;
  isGrounded: boolean;
  isCrouching: boolean;
  isSprinting: boolean;
  isAiming: boolean;
  aiState: 'loot' | 'patrol' | 'engage' | 'cover' | 'zone_rotate';
  aiTargetId: string | null;
  aiWaypointX: number;
  aiWaypointZ: number;
  aiThinkTimer: number;
  aiStrafeDir: number;
  aiTelegraphTimer: number;
  telegraphBeam: THREE.Mesh | null;
  lastDamagerId: string | null;
}

const RAIDER_CALLSIGNS = [
  'Kestrel',
  'Viper-2',
  'Ash',
  'Bastion',
  'Rook',
  'Jackal',
  'Cobalt',
  'Sable',
  'Specter',
  'Talon',
  'Wraith',
  'Mantis',
  'Onyx',
  'Dagger',
  'Hawke',
  'Vandal',
  'Kodiak',
];

export function selectEnemyClass(index: number, isTrainingDummy: boolean): EnemyClassId {
  if (isTrainingDummy) return index % 2 === 0 ? 'drone' : 'raider';
  if (index === 0) return 'overlord';
  if (index === 1 || index === 5 || index === 11) return 'reaper';
  if (index === 2 || index === 7 || index === 13) return 'brute';
  if (index === 3 || index === 8 || index === 14) return 'drone';
  return 'raider';
}

export function createBotActor(
  index: number,
  x: number,
  z: number,
  yaw: number,
  textures: ProceduralTextureSet,
  castShadows: boolean,
  difficulty: DifficultyId,
  isTrainingDummy = false,
): CombatantActor {
  const enemyClass = selectEnemyClass(index, isTrainingDummy);
  const vSpec = VILLAINS[enemyClass];
  const rig = createVillainRig(enemyClass, textures, castShadows);
  const y = walkableHeightAt(x, z);
  rig.root.position.set(x, y, z);
  rig.root.rotation.y = yaw;

  const beamGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6);
  beamGeo.rotateX(Math.PI / 2);
  beamGeo.translate(0, 0, 0.5);
  const beamMat = new THREE.MeshBasicMaterial({
    color: enemyClass === 'overlord' || enemyClass === 'drone' ? 0xd93824 : 0xd95d24,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const telegraphBeam = new THREE.Mesh(beamGeo, beamMat);
  telegraphBeam.visible = false;
  telegraphBeam.position.set(enemyClass === 'drone' ? 0 : 0.18, enemyClass === 'drone' ? 2.1 : 1.32, 0.45);
  rig.root.add(telegraphBeam);

  const hpScale = isTrainingDummy ? 0.75 : difficulty === 'elite' ? 1.15 : difficulty === 'rookie' ? 0.8 : 1.0;
  const hp = Math.round(vSpec.health * hpScale);
  const armorTier = isTrainingDummy ? 0 : difficulty === 'rookie' ? Math.min(1, vSpec.armorTier) as 0 | 1 : vSpec.armorTier;
  const armor = isTrainingDummy ? 0 : Math.round(vSpec.armor * (difficulty === 'rookie' ? 0.5 : 1));

  equipWeaponVisual(
    rig,
    vSpec.weapon,
    castShadows,
    textures,
    enemyClass === 'overlord' || enemyClass === 'reaper' ? 'crimson_collapse' : 'standard_matte',
  );

  const displayName = isTrainingDummy
    ? enemyClass === 'drone'
      ? `Target Drone #${index + 1}`
      : `Combat Target #${index + 1}`
    : enemyClass === 'overlord'
      ? 'The Overlord'
      : enemyClass === 'reaper' || enemyClass === 'brute' || enemyClass === 'drone'
        ? `${vSpec.label} ${index + 1}`
        : RAIDER_CALLSIGNS[index % RAIDER_CALLSIGNS.length];

  return {
    id: `bot_${index}`,
    name: displayName,
    isPlayer: false,
    enemyClass,
    rig,
    x,
    y,
    z,
    vy: 0,
    yaw,
    aimPitch: 0,
    health: hp,
    maxHealth: hp,
    armor,
    armorTier,
    backpackTier: 1,
    medkits: difficulty === 'rookie' || enemyClass === 'drone' ? 0 : 1,
    bandages: enemyClass === 'drone' ? 0 : 1,
    weapons: [createWeaponSlot(vSpec.weapon), createWeaponSlot('tactical_pistol'), null],
    activeSlot: 0,
    alive: true,
    deadTimer: 0,
    stridePhase: Math.random() * Math.PI * 2,
    recoil: 0,
    hitFlash: 0,
    fireCooldown: 0.6 + Math.random() * 1.2,
    reloadTimer: 0,
    isGrounded: true,
    isCrouching: false,
    isSprinting: false,
    isAiming: false,
    aiState: 'patrol',
    aiTargetId: null,
    aiWaypointX: x + (Math.random() - 0.5) * 30,
    aiWaypointZ: z + (Math.random() - 0.5) * 30,
    aiThinkTimer: Math.random() * 0.6,
    aiStrafeDir: Math.random() < 0.5 ? -1 : 1,
    aiTelegraphTimer: 0,
    telegraphBeam,
    lastDamagerId: null,
  };
}

export interface AIStepCallbacks {
  onFireWeapon: (actor: CombatantActor, targetX: number, targetY: number, targetZ: number) => void;
  onEliminated: (victim: CombatantActor, killer: CombatantActor | null, cause: string) => void;
}

export function stepAIActor(
  bot: CombatantActor,
  allActors: CombatantActor[],
  colliders: readonly AABBCollider[],
  lootSpawns: LootSpawn[],
  safeZone: SafeZoneState,
  difficulty: DifficultyId,
  dt: number,
  elapsedTime: number,
  isTrainingMode: boolean,
  callbacks: AIStepCallbacks,
): void {
  if (!bot.alive) {
    bot.deadTimer = Math.min(1, bot.deadTimer + dt * 2.4);
    animateOperative(
      bot.rig,
      {
        speed: 0,
        maxSpeed: 5,
        stridePhase: bot.stridePhase,
        isSprinting: false,
        isCrouching: false,
        isGrounded: true,
        isAiming: false,
        recoil: 0,
        reloadProgress: 0,
        hitFlash: Math.max(0, bot.hitFlash - dt * 6),
        deadProgress: bot.deadTimer,
        aimPitch: 0,
      },
      elapsedTime,
      dt,
    );
    if (bot.telegraphBeam) bot.telegraphBeam.visible = false;
    return;
  }

  const diffCfg = DIFFICULTY_CONFIG[difficulty];
  const vSpec = VILLAINS[bot.enemyClass];
  bot.hitFlash = Math.max(0, bot.hitFlash - dt * 6.5);
  bot.recoil = Math.max(0, bot.recoil - dt * 5.0);
  bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);

  if (bot.reloadTimer > 0) {
    bot.reloadTimer -= dt;
    if (bot.reloadTimer <= 0) {
      const slot = bot.weapons[bot.activeSlot];
      if (slot) slot.ammoInMag = WEAPONS[slot.weaponId].magSize;
      bot.reloadTimer = 0;
    }
  }

  if (isTrainingMode) {
    bot.isAiming = false;
    bot.isSprinting = false;
    bot.isCrouching = false;
    const paceX = bot.aiWaypointX + Math.sin(elapsedTime * 0.9 + bot.stridePhase) * 2.5;
    const dx = paceX - bot.x;
    const moveStep = Math.sign(dx) * Math.min(Math.abs(dx), 1.6 * dt);
    bot.x += moveStep;
    bot.y = walkableHeightAt(bot.x, bot.z);
    bot.stridePhase += Math.abs(moveStep) * 3.1;
    bot.rig.root.position.set(bot.x, bot.y, bot.z);
    animateOperative(
      bot.rig,
      {
        speed: Math.abs(moveStep) / Math.max(dt, 0.001),
        maxSpeed: 4,
        stridePhase: bot.stridePhase,
        isSprinting: false,
        isCrouching: false,
        isGrounded: true,
        isAiming: false,
        recoil: bot.recoil,
        reloadProgress: 0,
        hitFlash: bot.hitFlash,
        deadProgress: 0,
        aimPitch: 0,
      },
      elapsedTime,
      dt,
    );
    return;
  }

  if (isOutsideSafeZone(bot.x, bot.z, safeZone)) {
    const res = applyCombatDamage(bot.health, bot.armor, bot.armorTier, safeZone.dps * dt, true);
    bot.health = res.health;
    if (bot.health <= 0) {
      bot.alive = false;
      callbacks.onEliminated(bot, null, 'Collapse Zone');
      return;
    }
  }

  if (bot.health < 52 && bot.medkits > 0 && bot.aiState !== 'engage') {
    bot.medkits--;
    bot.health = Math.min(bot.maxHealth, bot.health + 55);
  }

  bot.aiThinkTimer -= dt;
  let nearestEnemy: CombatantActor | null = null;
  let nearestDist = 999;

  for (let i = 0; i < allActors.length; i++) {
    const other = allActors[i];
    if (!other.alive || other.id === bot.id) continue;
    const d = Math.hypot(other.x - bot.x, other.z - bot.z);
    if (d < nearestDist && d < 88) {
      let blocked = false;
      for (let c = 0; c < colliders.length; c++) {
        const col = colliders[c];
        if (!col.blocksSight) continue;
        if (
          segmentIntersectsAABB(
            bot.x,
            bot.y + (bot.enemyClass === 'drone' ? 2.1 : 1.45),
            bot.z,
            other.x,
            other.y + 1.35,
            other.z,
            col,
          ) !== null
        ) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }
  }

  const distToZoneCenter = Math.hypot(bot.x - safeZone.nextX, bot.z - safeZone.nextZ);
  const needsZoneRotate =
    isOutsideSafeZone(bot.x, bot.z, safeZone) ||
    distToZoneCenter > safeZone.currentRadius * 0.84;

  if (bot.aiThinkTimer <= 0) {
    bot.aiThinkTimer = 0.28 + Math.random() * 0.24;
    if (Math.random() < 0.25) bot.aiStrafeDir *= -1;

    if (needsZoneRotate) {
      bot.aiState = 'zone_rotate';
      bot.aiWaypointX = safeZone.nextX + (Math.random() - 0.5) * safeZone.nextRadius * 0.6;
      bot.aiWaypointZ = safeZone.nextZ + (Math.random() - 0.5) * safeZone.nextRadius * 0.6;
    } else if (nearestEnemy) {
      bot.aiTargetId = nearestEnemy.id;
      if (bot.health < 35 && bot.enemyClass !== 'brute' && bot.enemyClass !== 'overlord' && Math.random() < 0.45) {
        bot.aiState = 'cover';
        const awayAngle = Math.atan2(bot.z - nearestEnemy.z, bot.x - nearestEnemy.x);
        bot.aiWaypointX = bot.x + Math.cos(awayAngle) * 14;
        bot.aiWaypointZ = bot.z + Math.sin(awayAngle) * 14;
      } else {
        bot.aiState = 'engage';
      }
    } else {
      let targetLoot: LootSpawn | null = null;
      if (bot.armorTier === 0 && bot.enemyClass === 'raider') {
        let bestLD = 24;
        for (let l = 0; l < lootSpawns.length; l++) {
          const lp = lootSpawns[l];
          if (lp.collected) continue;
          const ld = Math.hypot(lp.x - bot.x, lp.z - bot.z);
          if (ld < bestLD) {
            bestLD = ld;
            targetLoot = lp;
          }
        }
      }
      if (targetLoot) {
        bot.aiState = 'loot';
        bot.aiWaypointX = targetLoot.x;
        bot.aiWaypointZ = targetLoot.z;
      } else {
        bot.aiState = 'patrol';
        if (Math.hypot(bot.aiWaypointX - bot.x, bot.aiWaypointZ - bot.z) < 4) {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * Math.max(15, safeZone.currentRadius * 0.72);
          bot.aiWaypointX = safeZone.currentX + Math.cos(ang) * rad;
          bot.aiWaypointZ = safeZone.currentZ + Math.sin(ang) * rad;
        }
      }
    }
  }

  let moveX = 0;
  let moveZ = 0;
  let speed = vSpec.speed;
  bot.isSprinting = false;
  bot.isCrouching = false;
  bot.isAiming = false;

  if (bot.aiState === 'engage' && nearestEnemy) {
    const dx = nearestEnemy.x - bot.x;
    const dz = nearestEnemy.z - bot.z;
    const dist = Math.max(0.01, Math.hypot(dx, dz));
    const desiredYaw = Math.atan2(dx, dz);
    bot.yaw = lerpAngle(bot.yaw, desiredYaw, Math.min(1, dt * 8 * diffCfg.botReactionSpeed));
    bot.isAiming = true;

    const preferredRange = vSpec.preferredRange;
    if (dist > preferredRange + 4) {
      moveX = dx / dist + (-dz / dist) * bot.aiStrafeDir * 0.45;
      moveZ = dz / dist + (dx / dist) * bot.aiStrafeDir * 0.45;
      speed = vSpec.speed * 1.1;
    } else if (dist < preferredRange - 5) {
      moveX = -dx / dist + (-dz / dist) * bot.aiStrafeDir * 0.75;
      moveZ = -dz / dist + (dx / dist) * bot.aiStrafeDir * 0.75;
      speed = vSpec.speed * 0.85;
    } else {
      moveX = (-dz / dist) * bot.aiStrafeDir;
      moveZ = (dx / dist) * bot.aiStrafeDir;
      speed = vSpec.speed * 0.82;
    }

    const slot = bot.weapons[bot.activeSlot];
    if (slot && bot.reloadTimer <= 0) {
      if (slot.ammoInMag <= 0) {
        bot.reloadTimer = WEAPONS[slot.weaponId].reloadTime;
      } else if (bot.fireCooldown <= 0) {
        if (bot.aiTelegraphTimer <= 0) {
          bot.aiTelegraphTimer = 0.28 / diffCfg.botReactionSpeed;
        } else {
          bot.aiTelegraphTimer -= dt;
          if (bot.telegraphBeam) {
            bot.telegraphBeam.visible = true;
            bot.telegraphBeam.scale.set(1, 1, Math.min(dist, 55));
          }
          if (bot.aiTelegraphTimer <= 0) {
            if (bot.telegraphBeam) bot.telegraphBeam.visible = false;
            callbacks.onFireWeapon(
              bot,
              nearestEnemy.x,
              nearestEnemy.y + (nearestEnemy.isCrouching ? 0.9 : 1.32),
              nearestEnemy.z,
            );
            const spec = WEAPONS[slot.weaponId];
            bot.fireCooldown = spec.fireInterval * (1.75 / diffCfg.botReactionSpeed);
          }
        }
      }
    }
  } else {
    if (bot.telegraphBeam) bot.telegraphBeam.visible = false;
    bot.aiTelegraphTimer = 0;

    const dx = bot.aiWaypointX - bot.x;
    const dz = bot.aiWaypointZ - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.8) {
      moveX = dx / dist;
      moveZ = dz / dist;
      bot.isSprinting = bot.aiState === 'zone_rotate' || bot.aiState === 'cover';
      speed = vSpec.speed * (bot.isSprinting ? 1.25 : 0.95);
      const desiredYaw = Math.atan2(moveX, moveZ);
      bot.yaw = lerpAngle(bot.yaw, desiredYaw, Math.min(1, dt * 6));
    } else {
      speed = 0;
    }

    if (bot.enemyClass === 'raider') {
      for (let l = 0; l < lootSpawns.length; l++) {
        const lp = lootSpawns[l];
        if (!lp.collected && Math.hypot(lp.x - bot.x, lp.z - bot.z) < 2.1) {
          const res = applyLootPickup(lp, {
            weapons: bot.weapons,
            activeSlot: bot.activeSlot,
            armor: bot.armor,
            armorTier: bot.armorTier,
            backpackTier: bot.backpackTier,
            medkits: bot.medkits,
            bandages: bot.bandages,
          });
          if (res.picked) {
            lp.collected = true;
            bot.activeSlot = res.nextActiveSlot;
            const activeW = bot.weapons[bot.activeSlot];
            if (activeW) equipWeaponVisual(bot.rig, activeW.weaponId, false);
          }
        }
      }
    }
  }

  const mLen = Math.hypot(moveX, moveZ);
  let actualSpeed = 0;
  if (mLen > 0.01) {
    const nx = (moveX / mLen) * speed * dt;
    const nz = (moveZ / mLen) * speed * dt;
    if (bot.enemyClass === 'drone') {
      const clamped = resolveWorldCollision(bot.x + nx, bot.z + nz, bot.y + 2.2, 0.5, []);
      actualSpeed = Math.hypot(clamped.x - bot.x, clamped.z - bot.z) / Math.max(dt, 0.001);
      bot.x = clamped.x;
      bot.z = clamped.z;
    } else {
      const resolved = resolveWorldCollision(bot.x + nx, bot.z + nz, bot.y, 0.5, colliders);
      actualSpeed = Math.hypot(resolved.x - bot.x, resolved.z - bot.z) / Math.max(dt, 0.001);
      bot.x = resolved.x;
      bot.z = resolved.z;
    }
  }

  bot.y = walkableHeightAt(bot.x, bot.z);
  bot.stridePhase += actualSpeed * dt * 2.2;
  bot.rig.root.position.set(bot.x, bot.y, bot.z);
  bot.rig.root.rotation.y = bot.yaw;

  const activeW = bot.weapons[bot.activeSlot];
  const reloadNorm =
    bot.reloadTimer > 0 && activeW ? 1 - bot.reloadTimer / WEAPONS[activeW.weaponId].reloadTime : 0;

  animateOperative(
    bot.rig,
    {
      speed: actualSpeed,
      maxSpeed: vSpec.speed * 1.25,
      stridePhase: bot.stridePhase,
      isSprinting: bot.isSprinting,
      isCrouching: bot.isCrouching,
      isGrounded: true,
      isAiming: bot.isAiming,
      recoil: bot.recoil,
      reloadProgress: reloadNorm,
      hitFlash: bot.hitFlash,
      deadProgress: 0,
      aimPitch: 0,
    },
    elapsedTime,
    dt,
  );
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
