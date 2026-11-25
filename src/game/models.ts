import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  GEAR_COLOR_OPTIONS,
  OPERATIVES,
  OUTFIT_THEMES,
  VILLAINS,
  WEAPON_SKINS,
  WEAPONS,
} from './constants';
import type { ProceduralTextureSet } from './textures';
import type {
  CustomizationState,
  EmoteId,
  EnemyClassId,
  LootKind,
  OperativeId,
  WeaponId,
  WeaponSkinId,
} from './types';

export type GlbRigVariant = 'male' | 'female' | 'overlord' | 'brute' | 'drone';

const GLB_PATHS: Record<GlbRigVariant, string> = {
  male: './assets/models/operative_male.glb',
  female: './assets/models/operative_female.glb',
  overlord: './assets/models/operative_overlord.glb',
  brute: './assets/models/operative_brute.glb',
  drone: './assets/models/scout_drone.glb',
};

const gltfCache = new Map<GlbRigVariant, GLTF>();
let preloadPromise: Promise<void> | null = null;

export function preloadCharacterGlbs(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  const loader = new GLTFLoader();
  const entries = Object.entries(GLB_PATHS) as [GlbRigVariant, string][];
  preloadPromise = Promise.all(
    entries.map(
      ([variant, url]) =>
        new Promise<void>((resolve) => {
          loader.load(
            url,
            (gltf) => {
              gltfCache.set(variant, gltf);
              resolve();
            },
            undefined,
            () => {
              // Fallback gracefully to procedural rig if asset unavailable
              resolve();
            },
          );
        }),
    ),
  ).then(() => undefined);
  return preloadPromise;
}

export interface OperativeRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponMount: THREE.Group;
  backpackGroup: THREE.Group;
  contactShadow: THREE.Mesh;
  armorPlates: THREE.Mesh[];
  hitFlashMeshes: THREE.Mesh[];
  fabricMeshes: THREE.Mesh[];
  accentMeshes: THREE.Mesh[];
  gearMeshes: THREE.Mesh[];
  helmetVariants: Record<string, THREE.Object3D>;
  maskVariants: Record<string, THREE.Object3D>;
  goggleVariants: Record<string, THREE.Object3D>;
  vestVariants: Record<string, THREE.Object3D>;
  backpackVariants: Record<string, THREE.Object3D>;
  rotorDiscs: THREE.Object3D[];
  isDrone: boolean;
  currentWeaponMesh: THREE.Group | null;
  currentWeaponId: WeaponId | null;
  currentWeaponSkin: WeaponSkinId;
  isGlbRig?: boolean;
  mixer?: THREE.AnimationMixer;
  actions?: Partial<Record<'Idle' | 'Run' | 'Aim' | 'Crouch' | 'Hover', THREE.AnimationAction>>;
  activeActionName?: 'Idle' | 'Run' | 'Aim' | 'Crouch' | 'Hover';
  chestBone?: THREE.Object3D;
  headBone?: THREE.Object3D;
}

export interface CharacterAnimState {
  speed: number;
  maxSpeed: number;
  stridePhase: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isGrounded: boolean;
  isAiming: boolean;
  recoil: number; // 0..1
  reloadProgress: number; // 0..1
  hitFlash: number; // 0..1
  deadProgress: number; // 0..1
  aimPitch: number;
  emote?: EmoteId | null;
  emoteProgress?: number; // 0..1
}

function createLatheLimb(
  profile: [number, number][],
  radialSegments = 12,
  scaleX = 1,
  scaleZ = 1,
): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  if (scaleX !== 1 || scaleZ !== 1) {
    geo.scale(scaleX, 1, scaleZ);
  }
  geo.computeVertexNormals();
  return geo;
}

function createRoundedPlateGeo(
  w: number,
  h: number,
  depth: number,
  radius = 0.025,
  bevel = 0.015,
): THREE.ExtrudeGeometry {
  const hw = w * 0.5 - radius;
  const hh = h * 0.5 - radius;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -h * 0.5);
  shape.lineTo(hw, -h * 0.5);
  shape.quadraticCurveTo(w * 0.5, -h * 0.5, w * 0.5, -hh);
  shape.lineTo(w * 0.5, hh);
  shape.quadraticCurveTo(w * 0.5, h * 0.5, hw, h * 0.5);
  shape.lineTo(-hw, h * 0.5);
  shape.quadraticCurveTo(-w * 0.5, h * 0.5, -w * 0.5, hh);
  shape.lineTo(-w * 0.5, -hh);
  shape.quadraticCurveTo(-w * 0.5, -h * 0.5, -hw, -h * 0.5);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export function createWeaponMesh(
  weaponId: WeaponId,
  textures?: ProceduralTextureSet,
  skinId: WeaponSkinId = 'standard_matte',
): THREE.Group {
  const spec = WEAPONS[weaponId];
  const skin = WEAPON_SKINS[skinId];
  const group = new THREE.Group();

  const skinTex = textures ? textures.getWeaponSkinTexture(skinId) : null;
  const receiverMat = new THREE.MeshStandardMaterial({
    color: skinTex ? 0xffffff : skin.bodyHex,
    map: skinTex,
    roughness: skin.roughness,
    metalness: skin.metalness,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x16181c,
    roughness: 0.72,
    metalness: 0.14,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x3b414a,
    roughness: 0.25,
    metalness: 0.9,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skinId === 'standard_matte' ? spec.color : skin.accentHex,
    roughness: 0.36,
    metalness: 0.55,
  });

  if (weaponId === 'tactical_pistol') {
    const slide = new THREE.Mesh(createRoundedPlateGeo(0.036, 0.046, 0.22, 0.008, 0.005), receiverMat);
    slide.position.set(0, 0.04, 0.06);
    const grip = new THREE.Mesh(createRoundedPlateGeo(0.032, 0.11, 0.048, 0.008, 0.004), polymerMat);
    grip.position.set(0, -0.02, -0.01);
    grip.rotation.x = 0.22;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 10), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, 0.18);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.018), accentMat);
    sight.position.set(0, 0.068, 0.14);
    group.add(slide, grip, barrel, sight);
    return group;
  }

  const isDMR = weaponId === 'longshot_dmr';
  const isSMG = weaponId === 'vortex_smg';
  const isShotgun = weaponId === 'breacher_shotgun';

  const recLen = isDMR ? 0.34 : isSMG ? 0.22 : 0.28;
  const receiver = new THREE.Mesh(
    createRoundedPlateGeo(0.054, 0.078, recLen, 0.01, 0.006),
    receiverMat,
  );
  receiver.position.set(0, 0.03, 0.06);
  group.add(receiver);

  const barrelLen = isDMR ? 0.46 : isSMG ? 0.16 : isShotgun ? 0.38 : 0.32;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.015, barrelLen, 10),
    barrelMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.042, 0.06 + recLen * 0.5 + barrelLen * 0.5);
  group.add(barrel);

  // Muzzle brake / compensator
  const comp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.017, 0.055, 8),
    accentMat,
  );
  comp.rotation.x = Math.PI / 2;
  comp.position.set(0, 0.042, 0.06 + recLen * 0.5 + barrelLen + 0.02);
  group.add(comp);

  const shroud = new THREE.Mesh(
    createRoundedPlateGeo(0.048, 0.056, barrelLen * 0.65, 0.008, 0.005),
    receiverMat,
  );
  shroud.position.set(0, 0.032, 0.06 + recLen * 0.5 + barrelLen * 0.32);
  group.add(shroud);

  const stockLen = isSMG ? 0.14 : 0.23;
  const stock = new THREE.Mesh(
    createRoundedPlateGeo(0.042, 0.088, stockLen, 0.01, 0.005),
    polymerMat,
  );
  stock.position.set(0, 0.015, 0.06 - recLen * 0.5 - stockLen * 0.46);
  group.add(stock);

  const grip = new THREE.Mesh(
    createRoundedPlateGeo(0.034, 0.115, 0.048, 0.008, 0.004),
    polymerMat,
  );
  grip.position.set(0, -0.035, 0.01);
  grip.rotation.x = 0.24;
  group.add(grip);

  if (isShotgun) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, barrelLen * 0.78, 10),
      receiverMat,
    );
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.012, 0.06 + recLen * 0.5 + barrelLen * 0.38);
    const pump = new THREE.Mesh(
      createRoundedPlateGeo(0.052, 0.046, 0.14, 0.009, 0.004),
      accentMat,
    );
    pump.position.set(0, 0.008, 0.27);
    group.add(tube, pump);
  } else {
    const magH = isSMG ? 0.16 : isDMR ? 0.11 : 0.16;
    const mag = new THREE.Mesh(
      createRoundedPlateGeo(0.032, magH, 0.056, 0.006, 0.004),
      accentMat,
    );
    mag.position.set(0, -0.058, 0.11);
    mag.rotation.x = isSMG ? -0.15 : -0.24;
    group.add(mag);
  }

  if (isDMR) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 12), barrelMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.095, 0.08);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.095, 0.19);
    group.add(scope, lens);
  } else {
    const holo = new THREE.Mesh(
      createRoundedPlateGeo(0.038, 0.034, 0.068, 0.007, 0.004),
      polymerMat,
    );
    holo.position.set(0, 0.084, 0.06);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.01), accentMat);
    dot.position.set(0, 0.085, 0.06);
    group.add(holo, dot);
  }

  return group;
}

/**
 * Builds an anatomically contoured humanoid tactical rig (zero blocky/Minecraft silhouettes).
 */
export function createOperativeRig(
  operativeId: OperativeId,
  textures: ProceduralTextureSet,
  castShadows: boolean,
  custom?: CustomizationState,
): OperativeRig {
  const spec = OPERATIVES[operativeId];
  const cfg = custom ?? spec.defaultCustomization;
  return buildHumanoidRig({
    gender: spec.gender,
    scale: 1.0,
    textures,
    castShadows,
    customization: cfg,
    startingWeapon: spec.startingWeapon,
    villainType: null,
  });
}

export function createVillainRig(
  enemyClass: EnemyClassId,
  textures: ProceduralTextureSet,
  castShadows: boolean,
): OperativeRig {
  if (enemyClass === 'drone') {
    return createScoutDroneRig(textures, castShadows);
  }

  const villain = VILLAINS[enemyClass];
  const customization: CustomizationState =
    enemyClass === 'overlord'
      ? {
          outfitTheme: 'black_tactical',
          helmet: 'recon_hood',
          mask: 'armored_visor',
          goggles: 'red_thermal',
          vest: 'heavy_carrier',
          glovesBoots: 'hazard_trim',
          backpack: 'heavy_assault',
          weaponSkin: 'crimson_collapse',
        }
      : enemyClass === 'reaper'
        ? {
            outfitTheme: 'urban_ops',
            helmet: 'ballistic_nvg',
            mask: 'respirator',
            goggles: 'red_thermal',
            vest: 'heavy_carrier',
            glovesBoots: 'stealth_black',
            backpack: 'patrol_pack',
            weaponSkin: 'crimson_collapse',
          }
        : enemyClass === 'brute'
          ? {
              outfitTheme: 'black_tactical',
              helmet: 'standard',
              mask: 'respirator',
              goggles: 'none',
              vest: 'heavy_carrier',
              glovesBoots: 'hazard_trim',
              backpack: 'heavy_assault',
              weaponSkin: 'standard_matte',
            }
          : {
              outfitTheme: 'woodland_camo',
              helmet: 'standard',
              mask: 'balaclava',
              goggles: 'amber_tactical',
              vest: 'light_rig',
              glovesBoots: 'coyote_tan',
              backpack: 'patrol_pack',
              weaponSkin: 'standard_matte',
            };

  return buildHumanoidRig({
    gender: 'male',
    scale: villain.scale,
    textures,
    castShadows,
    customization,
    startingWeapon: villain.weapon,
    villainType: enemyClass,
  });
}

function createScoutDroneRig(
  textures: ProceduralTextureSet,
  castShadows: boolean,
): OperativeRig {
  const cachedDrone = gltfCache.get('drone');
  if (cachedDrone) {
    const root = new THREE.Group();
    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    const cloned = SkeletonUtils.clone(cachedDrone.scene);
    bodyPivot.add(cloned);

    const hitFlashMeshes: THREE.Mesh[] = [];
    const rotorDiscs: THREE.Object3D[] = [];
    const droneRoot = cloned.getObjectByName('DroneRoot') ?? cloned;

    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = castShadows;
        m.receiveShadow = castShadows;
        hitFlashMeshes.push(m);
      }
      if (obj.name.startsWith('Rotor_')) {
        rotorDiscs.push(obj);
      }
    });

    // Add searchlight cone beneath DroneRoot
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.72, 2.2, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xd93824,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cone.position.set(0, -1.15, 0.28);
    cone.rotation.x = 0.25;
    droneRoot.add(cone);

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 18),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadowMap,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      }),
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.03;
    root.add(contactShadow);

    const mixer = new THREE.AnimationMixer(cloned);
    const hoverClip = THREE.AnimationClip.findByName(cachedDrone.animations, 'Hover');
    const actions: OperativeRig['actions'] = {};
    if (hoverClip) {
      const act = mixer.clipAction(hoverClip);
      act.play();
      actions.Hover = act;
    }

    const hips = (droneRoot as THREE.Group) ?? new THREE.Group();
    const torso = (droneRoot as THREE.Group) ?? new THREE.Group();
    const head = new THREE.Group();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const weaponMount = new THREE.Group();
    weaponMount.position.set(0, -0.18, 0.25);
    torso.add(weaponMount);
    const backpackGroup = new THREE.Group();

    return {
      root,
      bodyPivot,
      hips,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      weaponMount,
      backpackGroup,
      contactShadow,
      armorPlates: [],
      hitFlashMeshes,
      fabricMeshes: [],
      accentMeshes: [],
      gearMeshes: [],
      helmetVariants: {},
      maskVariants: {},
      goggleVariants: {},
      vestVariants: {},
      backpackVariants: {},
      rotorDiscs,
      isDrone: true,
      currentWeaponMesh: null,
      currentWeaponId: null,
      currentWeaponSkin: 'standard_matte',
      isGlbRig: true,
      mixer,
      actions,
      activeActionName: 'Hover',
    };
  }

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hips = new THREE.Group();
  hips.position.y = 2.25;
  bodyPivot.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  const head = new THREE.Group();
  torso.add(head);
  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.18, 0.25);
  torso.add(weaponMount);
  const backpackGroup = new THREE.Group();

  const hitFlashMeshes: THREE.Mesh[] = [];
  const armorPlates: THREE.Mesh[] = [];
  const rotorDiscs: THREE.Object3D[] = [];

  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x20242a,
    roughness: 0.35,
    metalness: 0.78,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd93824,
    roughness: 0.4,
    metalness: 0.5,
  });
  const glowEyeMat = new THREE.MeshStandardMaterial({
    color: 0xff2a1a,
    emissive: 0xff2a1a,
    emissiveIntensity: 1.6,
    roughness: 0.15,
  });
  const rotorMat = new THREE.MeshBasicMaterial({
    color: 0x9ca3af,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });

  const reg = (m: THREE.Mesh) => {
    m.castShadow = castShadows;
    hitFlashMeshes.push(m);
    torso.add(m);
    return m;
  };

  // Sculpted central hull
  const hull = reg(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), chassisMat));
  hull.scale.set(1.2, 0.58, 1.45);
  const brow = reg(new THREE.Mesh(createRoundedPlateGeo(0.46, 0.14, 0.52, 0.04, 0.015), trimMat));
  brow.position.set(0, 0.08, 0.04);
  const sensorEye = reg(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), glowEyeMat));
  sensorEye.position.set(0, -0.02, 0.42);

  // 4 Thruster Booms & Spinning Rotors
  const armOffsets: [number, number][] = [
    [-0.46, 0.42],
    [0.46, 0.42],
    [-0.46, -0.42],
    [0.46, -0.42],
  ];
  armOffsets.forEach(([ax, az]) => {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.62, 8), chassisMat);
    boom.position.set(ax * 0.55, 0.06, az * 0.55);
    boom.rotation.z = Math.atan2(ax, 0.01) * 0.45;
    boom.rotation.y = Math.atan2(ax, az);
    boom.rotation.x = Math.PI / 2;
    torso.add(boom);

    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 10), trimMat);
    motor.position.set(ax, 0.1, az);
    torso.add(motor);

    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(ax, 0.16, az);
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.045), chassisMat);
    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.42), chassisMat);
    const blurDisc = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.22, 18), rotorMat);
    blurDisc.rotation.x = -Math.PI / 2;
    rotorGroup.add(bladeA, bladeB, blurDisc);
    torso.add(rotorGroup);
    rotorDiscs.push(rotorGroup);
  });

  // Searchlight cone beneath drone
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 2.2, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xd93824,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  cone.position.set(0, -1.15, 0.28);
  cone.rotation.x = 0.25;
  torso.add(cone);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 18),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  return {
    root,
    bodyPivot,
    hips,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    backpackGroup,
    contactShadow,
    armorPlates,
    hitFlashMeshes,
    fabricMeshes: [],
    accentMeshes: [],
    gearMeshes: [],
    helmetVariants: {},
    maskVariants: {},
    goggleVariants: {},
    vestVariants: {},
    backpackVariants: {},
    rotorDiscs,
    isDrone: true,
    currentWeaponMesh: null,
    currentWeaponId: null,
    currentWeaponSkin: 'standard_matte',
  };
}

function buildHumanoidRig(params: {
  gender: 'male' | 'female';
  scale: number;
  textures: ProceduralTextureSet;
  castShadows: boolean;
  customization: CustomizationState;
  startingWeapon: WeaponId;
  villainType: EnemyClassId | null;
}): OperativeRig {
  const { gender, scale, textures, castShadows, customization, startingWeapon, villainType } = params;
  const isFemale = gender === 'female';
  const isBrute = villainType === 'brute';
  const isOverlord = villainType === 'overlord';

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.scale.setScalar(scale);
  root.add(bodyPivot);

  const hitFlashMeshes: THREE.Mesh[] = [];
  const armorPlates: THREE.Mesh[] = [];
  const fabricMeshes: THREE.Mesh[] = [];
  const accentMeshes: THREE.Mesh[] = [];
  const gearMeshes: THREE.Mesh[] = [];

  const outfitSpec = OUTFIT_THEMES[customization.outfitTheme];
  const outfitTex = textures.getOutfitTextures(customization.outfitTheme);
  const gearSpec =
    GEAR_COLOR_OPTIONS.find((g) => g.id === customization.glovesBoots) ?? GEAR_COLOR_OPTIONS[0];

  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: outfitTex.albedo,
    bumpMap: outfitTex.bump,
    bumpScale: 0.025,
    roughness: 0.84,
    metalness: 0.08,
  });
  const darkGearMat = new THREE.MeshStandardMaterial({
    color: gearSpec.hex,
    roughness: 0.55,
    metalness: 0.35,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: isOverlord || villainType === 'reaper' ? 0xd93824 : outfitSpec.accentHex,
    roughness: 0.38,
    metalness: 0.45,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: isBrute ? 0xa38572 : 0xc79b80,
    roughness: 0.68,
    metalness: 0.03,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x261d17,
    roughness: 0.78,
    metalness: 0.05,
  });

  const reg = (
    mesh: THREE.Mesh,
    role: 'fabric' | 'gear' | 'accent' | 'skin' | 'armor' = 'gear',
  ) => {
    mesh.castShadow = castShadows;
    mesh.receiveShadow = castShadows;
    hitFlashMeshes.push(mesh);
    if (role === 'fabric') fabricMeshes.push(mesh);
    if (role === 'gear' || role === 'armor') gearMeshes.push(mesh);
    if (role === 'accent') accentMeshes.push(mesh);
    if (role === 'armor') armorPlates.push(mesh);
    return mesh;
  };

  // Sculpted Hips / Pelvis (y = 0.89m)
  const hips = new THREE.Group();
  hips.position.set(0, 0.89, 0);
  bodyPivot.add(hips);

  const hipWidth = isFemale ? 1.02 : isBrute ? 1.15 : 1.04;
  const pelvisGeo = createLatheLimb(
    [
      [0.01, -0.09],
      [0.145, -0.06],
      [0.165, 0.02],
      [0.148, 0.09],
      [0.01, 0.1],
    ],
    14,
    hipWidth,
    0.76,
  );
  hips.add(reg(new THREE.Mesh(pelvisGeo, fabricMat), 'fabric'));

  // Tactical Belt + Pouches + Holster
  const belt = reg(
    new THREE.Mesh(createRoundedPlateGeo(0.35 * hipWidth, 0.065, 0.25, 0.02, 0.01), darkGearMat),
    'gear',
  );
  belt.position.y = 0.055;
  hips.add(belt);

  const buckle = reg(new THREE.Mesh(createRoundedPlateGeo(0.075, 0.052, 0.04, 0.008, 0.005), accentMat), 'accent');
  buckle.position.set(0, 0.055, 0.125);
  hips.add(buckle);

  const pouchL = reg(new THREE.Mesh(createRoundedPlateGeo(0.065, 0.11, 0.095, 0.012, 0.006), darkGearMat), 'gear');
  pouchL.position.set(-0.185 * hipWidth, 0.02, 0.03);
  const pouchR = reg(new THREE.Mesh(createRoundedPlateGeo(0.065, 0.11, 0.095, 0.012, 0.006), darkGearMat), 'gear');
  pouchR.position.set(0.185 * hipWidth, 0.02, 0.03);
  hips.add(pouchL, pouchR);

  // Sculpted Anatomical Legs (thigh -> knee -> contoured calf -> boot)
  const thighProfile: [number, number][] = [
    [0.055, -0.42],
    [0.068, -0.32],
    [0.082, -0.14],
    [0.086, -0.03],
    [0.04, 0.01],
  ];
  const shinProfile: [number, number][] = [
    [0.046, -0.35],
    [0.054, -0.24],
    [0.066, -0.12],
    [0.06, -0.02],
    [0.042, 0.01],
  ];

  const thighScale = isFemale ? 0.92 : isBrute ? 1.15 : 1.0;
  const thighGeo = createLatheLimb(thighProfile, 12, thighScale, thighScale * 1.05);
  const shinGeo = createLatheLimb(shinProfile, 12, thighScale, thighScale * 1.05);

  const buildLeg = (side: -1 | 1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.105 * hipWidth, -0.04, 0);

    const thigh = reg(new THREE.Mesh(thighGeo, fabricMat), 'fabric');
    legGroup.add(thigh);

    // Thigh tactical holster/strap on right leg
    if (side === 1) {
      const holster = reg(new THREE.Mesh(createRoundedPlateGeo(0.055, 0.14, 0.09, 0.01, 0.005), darkGearMat), 'gear');
      holster.position.set(0.075 * thighScale, -0.22, 0.01);
      legGroup.add(holster);
    }

    // Sculpted Knee Pad
    const kneePad = reg(new THREE.Mesh(createRoundedPlateGeo(0.105, 0.1, 0.07, 0.02, 0.008), darkGearMat), 'gear');
    kneePad.position.set(0, -0.41, 0.045);
    legGroup.add(kneePad);

    const shin = reg(new THREE.Mesh(shinGeo, fabricMat), 'fabric');
    shin.position.y = -0.41;
    legGroup.add(shin);

    // Sculpted Combat Boot (upper shaft + contoured toe cap + lugged sole)
    const bootShaft = reg(new THREE.Mesh(createRoundedPlateGeo(0.1, 0.12, 0.12, 0.025, 0.008), darkGearMat), 'gear');
    bootShaft.position.set(0, -0.74, 0);
    const bootFoot = reg(new THREE.Mesh(createRoundedPlateGeo(0.108, 0.075, 0.22, 0.028, 0.01), darkGearMat), 'gear');
    bootFoot.position.set(0, -0.81, 0.045);
    const bootTrim = reg(new THREE.Mesh(createRoundedPlateGeo(0.112, 0.024, 0.225, 0.01, 0.004), accentMat), 'accent');
    bootTrim.position.set(0, -0.84, 0.045);
    legGroup.add(bootShaft, bootFoot, bootTrim);

    return legGroup;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  hips.add(leftLeg, rightLeg);

  // Sculpted Torso (athletic chest taper via LatheGeometry)
  const torso = new THREE.Group();
  torso.position.set(0, 0.08, 0);
  hips.add(torso);

  const chestW = isFemale ? 0.92 : isBrute ? 1.24 : 1.06;
  const chestD = isFemale ? 0.68 : isBrute ? 0.82 : 0.72;
  const torsoProfile: [number, number][] = isFemale
    ? [
        [0.135, 0.0],
        [0.128, 0.12],
        [0.158, 0.26],
        [0.175, 0.39],
        [0.145, 0.47],
        [0.06, 0.51],
      ]
    : [
        [0.15, 0.0],
        [0.155, 0.12],
        [0.182, 0.27],
        [0.205, 0.4],
        [0.165, 0.48],
        [0.07, 0.52],
      ];
  const torsoGeo = createLatheLimb(torsoProfile, 16, chestW, chestD);
  const chest = reg(new THREE.Mesh(torsoGeo, fabricMat), 'fabric');
  torso.add(chest);

  // Tactical Vest Variants
  const vestVariants: Record<string, THREE.Object3D> = {};

  // 1) Light Plate Rig
  const lightRig = new THREE.Group();
  const lPlateF = reg(new THREE.Mesh(createRoundedPlateGeo(0.28 * chestW, 0.28, 0.06, 0.03, 0.01), darkGearMat), 'armor');
  lPlateF.position.set(0, 0.3, 0.115 * chestD * 1.4);
  const lPlateB = reg(new THREE.Mesh(createRoundedPlateGeo(0.28 * chestW, 0.28, 0.06, 0.03, 0.01), darkGearMat), 'armor');
  lPlateB.position.set(0, 0.3, -0.115 * chestD * 1.4);
  const lChevron = reg(new THREE.Mesh(createRoundedPlateGeo(0.18, 0.045, 0.02, 0.008, 0.004), accentMat), 'accent');
  lChevron.position.set(0, 0.36, 0.145 * chestD * 1.4);
  lightRig.add(lPlateF, lPlateB, lChevron);
  torso.add(lightRig);
  vestVariants['light_rig'] = lightRig;

  // 2) Heavy Assault Carrier
  const heavyCarrier = new THREE.Group();
  const hShell = reg(new THREE.Mesh(createRoundedPlateGeo(0.36 * chestW, 0.33, 0.25 * chestD * 1.45, 0.04, 0.015), darkGearMat), 'armor');
  hShell.position.set(0, 0.29, 0.01);
  const hMag1 = reg(new THREE.Mesh(createRoundedPlateGeo(0.07, 0.12, 0.055, 0.01, 0.005), darkGearMat), 'gear');
  hMag1.position.set(-0.085, 0.22, 0.155);
  const hMag2 = reg(new THREE.Mesh(createRoundedPlateGeo(0.07, 0.12, 0.055, 0.01, 0.005), darkGearMat), 'gear');
  hMag2.position.set(0.0, 0.22, 0.155);
  const hMag3 = reg(new THREE.Mesh(createRoundedPlateGeo(0.07, 0.12, 0.055, 0.01, 0.005), darkGearMat), 'gear');
  hMag3.position.set(0.085, 0.22, 0.155);
  const hStripe = reg(new THREE.Mesh(createRoundedPlateGeo(0.28 * chestW, 0.04, 0.27 * chestD * 1.45, 0.01, 0.005), accentMat), 'accent');
  hStripe.position.set(0, 0.37, 0.01);
  heavyCarrier.add(hShell, hMag1, hMag2, hMag3, hStripe);
  torso.add(heavyCarrier);
  vestVariants['heavy_carrier'] = heavyCarrier;

  // 3) Recon Modular Vest
  const reconVest = new THREE.Group();
  const rMain = reg(new THREE.Mesh(createRoundedPlateGeo(0.33 * chestW, 0.3, 0.23 * chestD * 1.4, 0.035, 0.012), darkGearMat), 'armor');
  rMain.position.set(0, 0.28, 0.005);
  const rRadio = reg(new THREE.Mesh(createRoundedPlateGeo(0.06, 0.11, 0.045, 0.01, 0.004), accentMat), 'accent');
  rRadio.position.set(-0.12, 0.35, 0.13);
  reconVest.add(rMain, rRadio);
  torso.add(reconVest);
  vestVariants['recon_vest'] = reconVest;

  // Villain Special Torso Attachments
  if (isOverlord) {
    // Flowing crimson-lined armored cape
    const capeGeo = createRoundedPlateGeo(0.56, 1.05, 0.035, 0.04, 0.008);
    const capeMat = new THREE.MeshStandardMaterial({
      color: 0x3b0d0c,
      emissive: 0x240404,
      roughness: 0.72,
      metalness: 0.18,
    });
    const cape = reg(new THREE.Mesh(capeGeo, capeMat), 'accent');
    cape.position.set(0, -0.02, -0.19);
    cape.rotation.x = 0.14;
    torso.add(cape);

    // Chest reactor emblem
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.045, 0),
      new THREE.MeshStandardMaterial({
        color: 0xff2b1a,
        emissive: 0xff2b1a,
        emissiveIntensity: 1.5,
      }),
    );
    core.position.set(0, 0.34, 0.165);
    torso.add(core);
  }

  if (isBrute) {
    // Diagonal brass ammo bandolier across chest
    const strap = reg(new THREE.Mesh(createRoundedPlateGeo(0.42, 0.07, 0.27, 0.015, 0.006), darkGearMat), 'gear');
    strap.position.set(0, 0.3, 0.01);
    strap.rotation.z = -0.58;
    torso.add(strap);
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a438, metalness: 0.85, roughness: 0.25 });
    for (let s = -3; s <= 3; s++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.052, 8), brassMat);
      shell.position.set(s * 0.042, 0.3 + s * -0.026, 0.155);
      shell.rotation.z = 0.35;
      torso.add(shell);
    }
  }

  // Backpack Group & Variants
  const backpackGroup = new THREE.Group();
  backpackGroup.position.set(0, 0.3, -0.17);
  torso.add(backpackGroup);

  const backpackVariants: Record<string, THREE.Object3D> = {};

  const patrolPack = new THREE.Group();
  const pBody = reg(new THREE.Mesh(createRoundedPlateGeo(0.25, 0.31, 0.12, 0.035, 0.012), darkGearMat), 'gear');
  const pTrim = reg(new THREE.Mesh(createRoundedPlateGeo(0.21, 0.055, 0.13, 0.015, 0.005), accentMat), 'accent');
  pTrim.position.y = 0.08;
  patrolPack.add(pBody, pTrim);
  backpackGroup.add(patrolPack);
  backpackVariants['patrol_pack'] = patrolPack;

  const survivalPack = new THREE.Group();
  const sBody = reg(new THREE.Mesh(createRoundedPlateGeo(0.28, 0.35, 0.15, 0.04, 0.014), darkGearMat), 'gear');
  const sRoll = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.28, 12), accentMat), 'accent');
  sRoll.rotation.z = Math.PI / 2;
  sRoll.position.y = 0.21;
  survivalPack.add(sBody, sRoll);
  backpackGroup.add(survivalPack);
  backpackVariants['survival_pack'] = survivalPack;

  const heavyAssaultPack = new THREE.Group();
  const haBody = reg(new THREE.Mesh(createRoundedPlateGeo(0.32, 0.38, 0.18, 0.045, 0.016), darkGearMat), 'gear');
  const haPlate = reg(new THREE.Mesh(createRoundedPlateGeo(0.24, 0.18, 0.05, 0.02, 0.008), accentMat), 'accent');
  haPlate.position.z = -0.08;
  const haAnt = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.3, 8), darkGearMat), 'gear');
  haAnt.position.set(-0.14, 0.28, -0.02);
  heavyAssaultPack.add(haBody, haPlate, haAnt);
  backpackGroup.add(heavyAssaultPack);
  backpackVariants['heavy_assault'] = heavyAssaultPack;

  // Sculpted Head & Neck
  const head = new THREE.Group();
  head.position.set(0, 0.51, 0);
  torso.add(head);

  const neckGeo = createLatheLimb(
    [
      [0.064, 0.0],
      [0.056, 0.04],
      [0.054, 0.09],
    ],
    12,
  );
  head.add(reg(new THREE.Mesh(neckGeo, isFemale ? darkGearMat : skinMat), isFemale ? 'gear' : 'skin'));

  // Contoured anatomical cranium & jaw
  const craniumGeo = createLatheLimb(
    [
      [0.01, 0.06],
      [0.062, 0.08],
      [0.084, 0.14],
      [0.092, 0.2],
      [0.082, 0.255],
      [0.045, 0.285],
      [0.0, 0.292],
    ],
    16,
    isFemale ? 0.94 : 1.0,
    1.08,
  );
  const skull = reg(new THREE.Mesh(craniumGeo, skinMat), 'skin');
  head.add(skull);

  // Subtle eyebrows/eyes shadow strip
  const browBridge = new THREE.Mesh(
    createRoundedPlateGeo(0.11, 0.025, 0.04, 0.006, 0.003),
    new THREE.MeshStandardMaterial({ color: 0x241d19, roughness: 0.8 }),
  );
  browBridge.position.set(0, 0.2, 0.082);
  head.add(browBridge);

  if (isOverlord || villainType === 'reaper') {
    const eyeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff2211,
      emissive: 0xff2211,
      emissiveIntensity: 1.8,
    });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeGlowMat);
    eyeL.position.set(-0.032, 0.19, 0.092);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.032;
    head.add(eyeL, eyeR);
  }

  // Helmet Variants
  const helmetVariants: Record<string, THREE.Object3D> = {};

  // 1) Standard Combat Helmet
  const stdHelm = new THREE.Group();
  const domeGeo = new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const dome = reg(new THREE.Mesh(domeGeo, fabricMat), 'fabric');
  dome.scale.set(1.02, 1.0, 1.1);
  dome.position.set(0, 0.195, -0.005);
  const nape = reg(new THREE.Mesh(createRoundedPlateGeo(0.18, 0.07, 0.09, 0.02, 0.008), fabricMat), 'fabric');
  nape.position.set(0, 0.155, -0.075);
  stdHelm.add(dome, nape);
  head.add(stdHelm);
  helmetVariants['standard'] = stdHelm;

  // 2) Ballistic NVG Helmet
  const nvgHelm = new THREE.Group();
  const nDome = reg(new THREE.Mesh(domeGeo, fabricMat), 'fabric');
  nDome.scale.set(1.04, 1.02, 1.12);
  nDome.position.set(0, 0.198, -0.005);
  const mount = reg(new THREE.Mesh(createRoundedPlateGeo(0.048, 0.042, 0.055, 0.008, 0.004), darkGearMat), 'gear');
  mount.position.set(0, 0.255, 0.11);
  const nvgTubeL = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.065, 10), darkGearMat), 'gear');
  nvgTubeL.rotation.x = Math.PI / 2 - 0.3;
  nvgTubeL.position.set(-0.03, 0.235, 0.135);
  const nvgTubeR = nvgTubeL.clone();
  nvgTubeR.position.x = 0.03;
  nvgHelm.add(nDome, mount, nvgTubeL, nvgTubeR);
  head.add(nvgHelm);
  helmetVariants['ballistic_nvg'] = nvgHelm;

  // 3) Tactical Cap & Comms (with Sentinel ponytail if female)
  const capHelm = new THREE.Group();
  const capCrown = reg(new THREE.Mesh(new THREE.SphereGeometry(0.106, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), darkGearMat), 'gear');
  capCrown.scale.set(1.0, 0.92, 1.08);
  capCrown.position.set(0, 0.205, -0.004);
  const brim = reg(new THREE.Mesh(createRoundedPlateGeo(0.16, 0.016, 0.1, 0.03, 0.004), darkGearMat), 'gear');
  brim.position.set(0, 0.222, 0.115);
  brim.rotation.x = 0.14;
  const earCupL = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.028, 12), darkGearMat), 'gear');
  earCupL.rotation.z = Math.PI / 2;
  earCupL.position.set(-0.1, 0.175, -0.005);
  const earCupR = earCupL.clone();
  earCupR.position.x = 0.1;
  capHelm.add(capCrown, brim, earCupL, earCupR);
  if (isFemale) {
    const tailGeo = createLatheLimb(
      [
        [0.015, -0.22],
        [0.032, -0.13],
        [0.044, -0.05],
        [0.03, 0.0],
      ],
      10,
      0.85,
      1.0,
    );
    const ponytail = reg(new THREE.Mesh(tailGeo, hairMat), 'gear');
    ponytail.position.set(0.05, 0.175, -0.095);
    ponytail.rotation.x = 0.26;
    ponytail.rotation.z = 0.28;
    capHelm.add(ponytail);
  }
  head.add(capHelm);
  helmetVariants['tactical_cap'] = capHelm;

  // 4) Armored Recon Hood
  const hoodHelm = new THREE.Group();
  const hoodOuter = reg(
    new THREE.Mesh(
      createLatheLimb(
        [
          [0.105, 0.07],
          [0.128, 0.14],
          [0.132, 0.22],
          [0.112, 0.285],
          [0.055, 0.31],
          [0.0, 0.315],
        ],
        16,
        1.02,
        1.14,
      ),
      fabricMat,
    ),
    'fabric',
  );
  hoodOuter.position.set(0, 0.01, -0.018);
  const hoodTrim = reg(new THREE.Mesh(createRoundedPlateGeo(0.17, 0.03, 0.06, 0.01, 0.004), accentMat), 'accent');
  hoodTrim.position.set(0, 0.28, 0.075);
  hoodHelm.add(hoodOuter, hoodTrim);
  head.add(hoodHelm);
  helmetVariants['recon_hood'] = hoodHelm;

  // Mask Variants
  const maskVariants: Record<string, THREE.Object3D> = {};

  const balaclava = reg(
    new THREE.Mesh(
      createLatheLimb(
        [
          [0.07, 0.05],
          [0.088, 0.1],
          [0.092, 0.165],
          [0.02, 0.175],
        ],
        14,
        1.02,
        1.12,
      ),
      darkGearMat,
    ),
    'gear',
  );
  head.add(balaclava);
  maskVariants['balaclava'] = balaclava;

  const respirator = new THREE.Group();
  const respBody = reg(new THREE.Mesh(createRoundedPlateGeo(0.14, 0.085, 0.11, 0.025, 0.01), darkGearMat), 'gear');
  respBody.position.set(0, 0.125, 0.068);
  const filterMat = new THREE.MeshStandardMaterial({
    color: 0x3a404a,
    roughness: 0.42,
    metalness: 0.72,
  });
  const canL = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.036, 12), darkGearMat), 'gear');
  canL.rotation.x = Math.PI / 2;
  canL.position.set(-0.045, 0.115, 0.12);
  const rimL = reg(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.008, 12), filterMat), 'gear');
  rimL.rotation.x = Math.PI / 2;
  rimL.position.set(-0.045, 0.115, 0.138);
  const canR = canL.clone();
  canR.position.x = 0.045;
  const rimR = rimL.clone();
  rimR.position.x = 0.045;
  respirator.add(respBody, canL, rimL, canR, rimR);
  head.add(respirator);
  maskVariants['respirator'] = respirator;

  const armoredVisor = new THREE.Group();
  const facePlate = reg(new THREE.Mesh(createRoundedPlateGeo(0.17, 0.16, 0.11, 0.035, 0.012), darkGearMat), 'gear');
  facePlate.position.set(0, 0.155, 0.065);
  const visorGlow = reg(
    new THREE.Mesh(
      createRoundedPlateGeo(0.135, 0.034, 0.03, 0.008, 0.003),
      new THREE.MeshStandardMaterial({
        color: isOverlord ? 0xff2b1a : outfitSpec.accentHex,
        emissive: isOverlord ? 0xff2211 : outfitSpec.accentHex,
        emissiveIntensity: 0.9,
      }),
    ),
    'accent',
  );
  visorGlow.position.set(0, 0.188, 0.115);
  armoredVisor.add(facePlate, visorGlow);
  head.add(armoredVisor);
  maskVariants['armored_visor'] = armoredVisor;

  const tacticalScarf = reg(
    new THREE.Mesh(
      createLatheLimb(
        [
          [0.095, 0.0],
          [0.11, 0.055],
          [0.105, 0.115],
          [0.088, 0.15],
        ],
        14,
        1.05,
        1.14,
      ),
      accentMat,
    ),
    'accent',
  );
  head.add(tacticalScarf);
  maskVariants['tactical_scarf'] = tacticalScarf;

  // Goggles Variants
  const goggleVariants: Record<string, THREE.Object3D> = {};
  const makeGoggles = (lensHex: number, emissiveInt: number) => {
    const g = new THREE.Group();
    const frame = reg(new THREE.Mesh(createRoundedPlateGeo(0.17, 0.052, 0.048, 0.015, 0.006), darkGearMat), 'gear');
    frame.position.set(0, 0.194, 0.096);
    const lensMat = new THREE.MeshStandardMaterial({
      color: lensHex,
      emissive: lensHex,
      emissiveIntensity: emissiveInt,
      roughness: 0.12,
      metalness: 0.75,
    });
    const lens = new THREE.Mesh(createRoundedPlateGeo(0.145, 0.036, 0.02, 0.01, 0.003), lensMat);
    lens.position.set(0, 0.194, 0.115);
    g.add(frame, lens);
    head.add(g);
    return g;
  };
  goggleVariants['amber_tactical'] = makeGoggles(0xf59e0b, 0.25);
  goggleVariants['red_thermal'] = makeGoggles(0xd93824, 0.75);
  goggleVariants['ballistic_clear'] = makeGoggles(0x94a3b8, 0.15);

  // Sculpted Anatomical Arms (Full-sleeved for all operatives including Sentinel)
  const armW = isFemale ? 0.88 : isBrute ? 1.2 : 1.0;
  const upperArmGeo = createLatheLimb(
    [
      [0.044, -0.25],
      [0.05, -0.14],
      [0.055, -0.04],
      [0.042, 0.01],
    ],
    10,
    armW,
    armW,
  );
  const forearmGeo = createLatheLimb(
    [
      [0.036, -0.23],
      [0.042, -0.12],
      [0.047, -0.02],
      [0.038, 0.01],
    ],
    10,
    armW,
    armW,
  );

  const buildArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * (isFemale ? 0.21 : isBrute ? 0.29 : 0.24), 0.44, 0);

    // Shoulder Pauldron Armor
    const pauldron = reg(
      new THREE.Mesh(
        createRoundedPlateGeo(0.12 * armW, 0.13, 0.14, 0.03, 0.012),
        isOverlord || isBrute ? darkGearMat : fabricMat,
      ),
      isOverlord || isBrute ? 'gear' : 'fabric',
    );
    pauldron.position.set(side * 0.008, -0.048, 0);
    pauldron.rotation.z = -side * 0.18;
    arm.add(pauldron);

    if (isOverlord) {
      // Spiked shoulder crest
      const spike = reg(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), accentMat), 'accent');
      spike.position.set(side * 0.05, 0.06, 0);
      spike.rotation.z = -side * 0.55;
      arm.add(spike);
    }

    const upperArm = reg(new THREE.Mesh(upperArmGeo, fabricMat), 'fabric');
    arm.add(upperArm);

    const elbowPad = reg(new THREE.Mesh(createRoundedPlateGeo(0.075, 0.075, 0.06, 0.018, 0.006), darkGearMat), 'gear');
    elbowPad.position.set(0, -0.25, -0.025);
    arm.add(elbowPad);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.25, 0);
    forearmPivot.rotation.x = -0.45;
    arm.add(forearmPivot);

    const forearm = reg(new THREE.Mesh(forearmGeo, fabricMat), 'fabric');
    forearmPivot.add(forearm);

    const wristGuard = reg(new THREE.Mesh(createRoundedPlateGeo(0.08, 0.09, 0.08, 0.02, 0.006), darkGearMat), 'gear');
    wristGuard.position.set(0, -0.17, 0);
    forearmPivot.add(wristGuard);

    // Sculpted Gloved Hand
    const glove = reg(new THREE.Mesh(createRoundedPlateGeo(0.068, 0.082, 0.075, 0.02, 0.008), darkGearMat), 'gear');
    glove.position.set(0, -0.26, 0.01);
    forearmPivot.add(glove);

    return arm;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  torso.add(leftArm, rightArm);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.18 * armW, 0.3, 0.22);
  torso.add(weaponMount);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.54 * scale, 18),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  root.add(contactShadow);

  const rig: OperativeRig = {
    root,
    bodyPivot,
    hips,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    backpackGroup,
    contactShadow,
    armorPlates,
    hitFlashMeshes,
    fabricMeshes,
    accentMeshes,
    gearMeshes,
    helmetVariants,
    maskVariants,
    goggleVariants,
    vestVariants,
    backpackVariants,
    rotorDiscs: [],
    isDrone: false,
    currentWeaponMesh: null,
    currentWeaponId: null,
    currentWeaponSkin: customization.weaponSkin,
  };

  // If the rigged .glb SkinnedMesh asset is preloaded, swap the visible character body
  // to the skinned GLB rig and mount all procedural vests, backpacks, helmets, masks,
  // goggles, and weapons directly onto its Skeleton bone sockets.
  const glbVariant: GlbRigVariant = isOverlord
    ? 'overlord'
    : isBrute
      ? 'brute'
      : isFemale
        ? 'female'
        : 'male';
  const cachedGltf = gltfCache.get(glbVariant);
  if (cachedGltf) {
    const glbClone = SkeletonUtils.clone(cachedGltf.scene);
    const glbHeadSocket = glbClone.getObjectByName('HeadSocket');
    const glbChestSocket = glbClone.getObjectByName('ChestSocket');
    const glbWeaponSocket = glbClone.getObjectByName('WeaponSocket');
    const glbChestBone = glbClone.getObjectByName('Chest');
    const glbHeadBone = glbClone.getObjectByName('Head');

    if (glbHeadSocket && glbChestSocket && glbWeaponSocket) {
      // Detach procedural body while retaining its tuned gear/variant groups
      bodyPivot.remove(hips);
      bodyPivot.add(glbClone);

      const glbHitFlash: THREE.Mesh[] = [];
      const glbFabric: THREE.Mesh[] = [];
      const glbGear: THREE.Mesh[] = [];
      const glbAccent: THREE.Mesh[] = [];

      glbClone.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.castShadow = castShadows;
          m.receiveShadow = castShadows;
          m.frustumCulled = false;
          glbHitFlash.push(m);
          if (m.name.startsWith('BodySuit_') && !m.name.endsWith('_Glove') && !m.name.endsWith('_Boot')) {
            m.material = fabricMat;
            glbFabric.push(m);
          } else if (m.name.endsWith('_Glove') || m.name.endsWith('_Boot') || m.name.startsWith('Gear_')) {
            m.material = darkGearMat;
            glbGear.push(m);
          } else if (m.name.startsWith('Accent_')) {
            m.material = accentMat;
            glbAccent.push(m);
          } else if (m.name === 'Head_Skin') {
            m.material = skinMat;
          }
        }
      });

      // Re-parent Chest gear variants & backpack & villain props into ChestSocket
      // Procedural torso origin was y = 0.97m; ChestSocket world y is 1.34m -> offset -0.37m
      const chestGearOffset = new THREE.Group();
      chestGearOffset.position.set(0, -0.37, 0);
      glbChestSocket.add(chestGearOffset);

      Object.values(vestVariants).forEach((v) => chestGearOffset.add(v));
      chestGearOffset.add(backpackGroup);
      // Move any villain chest props (Overlord cape/core, Brute bandolier)
      const chestExtras = torso.children.filter(
        (ch) =>
          ch !== chest &&
          ch !== head &&
          ch !== leftArm &&
          ch !== rightArm &&
          ch !== weaponMount &&
          ch !== backpackGroup &&
          !Object.values(vestVariants).includes(ch),
      );
      chestExtras.forEach((ex) => chestGearOffset.add(ex));

      // Re-parent Head gear variants into HeadSocket
      // Procedural head origin was y = 1.48m; HeadSocket world y is 1.60m -> offset -0.12m
      const headGearOffset = new THREE.Group();
      headGearOffset.position.set(0, -0.12, 0);
      glbHeadSocket.add(headGearOffset);

      Object.values(helmetVariants).forEach((hObj) => headGearOffset.add(hObj));
      Object.values(maskVariants).forEach((mObj) => headGearOffset.add(mObj));
      Object.values(goggleVariants).forEach((gObj) => headGearOffset.add(gObj));
      headGearOffset.add(browBridge);
      if (isOverlord || villainType === 'reaper') {
        head.children
          .filter(
            (ch) =>
              ch !== skull &&
              ch !== browBridge &&
              !Object.values(helmetVariants).includes(ch) &&
              !Object.values(maskVariants).includes(ch) &&
              !Object.values(goggleVariants).includes(ch) &&
              (ch as THREE.Mesh).geometry?.type === 'SphereGeometry',
          )
          .forEach((eye) => headGearOffset.add(eye));
      }

      // Mount weapon inside GLB WeaponSocket with local recoil/ADS pivot
      weaponMount.position.set(0.06, -0.04, 0.02);
      glbWeaponSocket.add(weaponMount);

      // Keep attached gear meshes in flash/material arrays
      rig.hitFlashMeshes = [...glbHitFlash, ...hitFlashMeshes.filter((m) => !m.name.startsWith('Body'))];
      rig.fabricMeshes = [...glbFabric, ...fabricMeshes.filter((m) => m.parent !== hips && m.parent !== torso)];
      rig.gearMeshes = [...glbGear, ...gearMeshes];
      rig.accentMeshes = [...glbAccent, ...accentMeshes];

      const mixer = new THREE.AnimationMixer(glbClone);
      const actions: OperativeRig['actions'] = {};
      (['Idle', 'Run', 'Aim', 'Crouch'] as const).forEach((clipName) => {
        const clip = THREE.AnimationClip.findByName(cachedGltf.animations, clipName);
        if (clip) {
          actions[clipName] = mixer.clipAction(clip);
        }
      });
      actions.Idle?.play();

      rig.isGlbRig = true;
      rig.mixer = mixer;
      rig.actions = actions;
      rig.activeActionName = 'Idle';
      rig.chestBone = glbChestBone;
      rig.headBone = glbHeadBone;
      rig.hips = (glbClone.getObjectByName('Hips') as THREE.Group) ?? hips;
      rig.torso = (glbChestBone as THREE.Group) ?? torso;
      rig.head = (glbHeadBone as THREE.Group) ?? head;
      rig.leftArm = (glbClone.getObjectByName('UpperArmL') as THREE.Group) ?? leftArm;
      rig.rightArm = (glbClone.getObjectByName('UpperArmR') as THREE.Group) ?? rightArm;
    }
  }

  applyCustomizationToRig(rig, customization, textures, castShadows);
  equipWeaponVisual(rig, startingWeapon, castShadows, textures, customization.weaponSkin);
  return rig;
}

export function applyCustomizationToRig(
  rig: OperativeRig,
  custom: CustomizationState,
  textures: ProceduralTextureSet,
  castShadows: boolean,
): void {
  if (rig.isDrone) return;

  const outfitSpec = OUTFIT_THEMES[custom.outfitTheme];
  const outfitTex = textures.getOutfitTextures(custom.outfitTheme);
  const gearSpec =
    GEAR_COLOR_OPTIONS.find((g) => g.id === custom.glovesBoots) ?? GEAR_COLOR_OPTIONS[0];

  for (const m of rig.fabricMeshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.map = outfitTex.albedo;
    mat.bumpMap = outfitTex.bump;
    mat.needsUpdate = true;
  }
  for (const m of rig.accentMeshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!mat.emissiveIntensity || mat.emissiveIntensity < 0.5) {
      mat.color.set(outfitSpec.accentHex);
    }
  }
  for (const m of rig.gearMeshes) {
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.color.setHex(gearSpec.hex);
  }

  Object.entries(rig.helmetVariants).forEach(([id, obj]) => {
    obj.visible = id === custom.helmet;
  });
  Object.entries(rig.maskVariants).forEach(([id, obj]) => {
    obj.visible = id === custom.mask;
  });
  Object.entries(rig.goggleVariants).forEach(([id, obj]) => {
    obj.visible = id === custom.goggles;
  });
  Object.entries(rig.vestVariants).forEach(([id, obj]) => {
    obj.visible = id === custom.vest;
  });
  Object.entries(rig.backpackVariants).forEach(([id, obj]) => {
    obj.visible = id === custom.backpack;
  });

  if (rig.currentWeaponId && rig.currentWeaponSkin !== custom.weaponSkin) {
    const wId = rig.currentWeaponId;
    rig.currentWeaponId = null;
    equipWeaponVisual(rig, wId, castShadows, textures, custom.weaponSkin);
  }
}

export function equipWeaponVisual(
  rig: OperativeRig,
  weaponId: WeaponId | null,
  castShadows: boolean,
  textures?: ProceduralTextureSet,
  skinId: WeaponSkinId = 'standard_matte',
): void {
  if (rig.currentWeaponId === weaponId && rig.currentWeaponSkin === skinId) return;
  if (rig.currentWeaponMesh) {
    rig.weaponMount.remove(rig.currentWeaponMesh);
    rig.currentWeaponMesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else m.material.dispose();
      }
    });
    rig.currentWeaponMesh = null;
  }
  rig.currentWeaponId = weaponId;
  rig.currentWeaponSkin = skinId;
  if (weaponId) {
    const mesh = createWeaponMesh(weaponId, textures, skinId);
    mesh.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = castShadows;
      }
    });
    rig.weaponMount.add(mesh);
    rig.currentWeaponMesh = mesh;
  }
}

export function animateOperative(
  rig: OperativeRig,
  anim: CharacterAnimState,
  elapsedTime: number,
  dt: number,
): void {
  const k = 1 - Math.exp(-14 * dt);
  const shadowMat = rig.contactShadow.material as THREE.MeshBasicMaterial;

  // Scout Drone hover + rotor spin animation
  if (rig.isDrone) {
    for (let i = 0; i < rig.rotorDiscs.length; i++) {
      rig.rotorDiscs[i].rotation.y += dt * (i % 2 === 0 ? 28 : -28);
    }
    if (rig.isGlbRig && rig.mixer) {
      if (anim.deadProgress > 0) {
        const fall = Math.min(1, anim.deadProgress);
        rig.bodyPivot.position.y = THREE.MathUtils.lerp(0, -1.85, fall);
        rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(0, 0.85, fall);
        rig.bodyPivot.rotation.z = THREE.MathUtils.lerp(0, 0.65, fall);
        shadowMat.opacity = 0.35 * (1 - fall);
        return;
      }
      rig.mixer.update(dt);
      rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(
        rig.bodyPivot.rotation.x,
        Math.min(0.28, (anim.speed / Math.max(1, anim.maxSpeed)) * 0.24),
        k,
      );
      rig.bodyPivot.rotation.z = Math.sin(elapsedTime * 2.1) * 0.06;
      return;
    }

    if (anim.deadProgress > 0) {
      const fall = Math.min(1, anim.deadProgress);
      rig.hips.position.y = THREE.MathUtils.lerp(2.25, 0.35, fall);
      rig.torso.rotation.x = THREE.MathUtils.lerp(0, 0.85, fall);
      rig.torso.rotation.z = THREE.MathUtils.lerp(0, 0.65, fall);
      shadowMat.opacity = 0.35 * (1 - fall);
      return;
    }
    rig.hips.position.y = 2.2 + Math.sin(elapsedTime * 3.4 + anim.stridePhase) * 0.22;
    rig.torso.rotation.x = THREE.MathUtils.lerp(
      rig.torso.rotation.x,
      Math.min(0.28, (anim.speed / Math.max(1, anim.maxSpeed)) * 0.24),
      k,
    );
    rig.torso.rotation.z = Math.sin(elapsedTime * 2.1) * 0.06;
    return;
  }

  if (anim.deadProgress > 0) {
    const fall = Math.min(1, anim.deadProgress);
    rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(0, -Math.PI * 0.48, fall);
    rig.bodyPivot.position.y = THREE.MathUtils.lerp(0, 0.16, fall);
    shadowMat.opacity = 0.45 * (1 - fall * 0.7);
    return;
  }

  rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(rig.bodyPivot.rotation.x, 0, k);
  rig.bodyPivot.position.y = THREE.MathUtils.lerp(rig.bodyPivot.position.y, 0, k);
  shadowMat.opacity = anim.isGrounded ? 0.46 : 0.2;

  // GLB SkinnedMesh AnimationMixer path
  if (rig.isGlbRig && rig.mixer && rig.actions) {
    const targetClip: 'Idle' | 'Run' | 'Aim' | 'Crouch' = anim.isCrouching
      ? 'Crouch'
      : anim.speed > 0.35
        ? 'Run'
        : anim.isAiming
          ? 'Aim'
          : 'Idle';

    if (targetClip !== rig.activeActionName) {
      const nextAct = rig.actions[targetClip];
      const prevAct = rig.activeActionName ? rig.actions[rig.activeActionName] : undefined;
      if (nextAct) {
        nextAct.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if (prevAct && prevAct !== nextAct) {
          prevAct.crossFadeTo(nextAct, 0.16, true);
        }
        rig.activeActionName = targetClip;
      }
    }

    if (targetClip === 'Run' && rig.actions.Run) {
      rig.actions.Run.setEffectiveTimeScale(
        THREE.MathUtils.clamp(anim.speed / 4.8, 0.55, 1.45),
      );
    }

    rig.mixer.update(dt);

    // Layer Dressing Room Emotes on top of skeletal pose
    if (anim.emote && (anim.emoteProgress ?? 0) > 0) {
      const p = anim.emoteProgress ?? 0;
      const bell = Math.sin(p * Math.PI);
      if (anim.emote === 'salute') {
        rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -2.0 * bell, k);
        rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, 0.32 * bell, k);
        rig.weaponMount.position.y = -0.18;
      } else if (anim.emote === 'victory_fist') {
        rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -2.35 * bell, k);
        rig.leftArm.rotation.z = THREE.MathUtils.lerp(rig.leftArm.rotation.z, -0.22 * bell, k);
        rig.torso.rotation.y += 0.24 * bell;
      } else if (anim.emote === 'weapon_inspect') {
        rig.torso.rotation.y -= 0.3 * bell;
        rig.weaponMount.rotation.y = 0.72 * bell;
      }
    } else {
      const reloadDip = anim.reloadProgress > 0 ? Math.sin(anim.reloadProgress * Math.PI) * 0.55 : 0;
      const recoilKick = anim.recoil * 0.18;
      const isLowReadyIdle =
        anim.speed < 0.25 && !anim.isAiming && anim.recoil <= 0.05 && anim.reloadProgress <= 0;

      if (rig.chestBone) {
        rig.chestBone.rotation.x += anim.aimPitch * 0.35;
      }
      if (rig.headBone) {
        rig.headBone.rotation.x += anim.aimPitch * 0.45;
      }

      if (isLowReadyIdle) {
        rig.weaponMount.position.set(0.0, -0.06, 0.02);
        rig.weaponMount.rotation.set(0.32, -0.78, 0.14);
      } else if (anim.isAiming || !anim.isSprinting || anim.recoil > 0.05) {
        rig.weaponMount.position.set(0.06, -0.01, 0.04 - anim.recoil * 0.06);
        rig.weaponMount.rotation.set(anim.aimPitch * 0.55 - recoilKick + reloadDip * 0.8, 0, 0);
      } else {
        rig.weaponMount.position.set(0.04, -0.03, 0.02);
        rig.weaponMount.rotation.set(0.18, -0.35, 0);
      }
    }

    const flashVal = anim.hitFlash;
    for (let i = 0; i < Math.min(10, rig.hitFlashMeshes.length); i++) {
      const mat = rig.hitFlashMeshes[i].material as THREE.MeshStandardMaterial;
      if (mat && mat.emissive && (!mat.emissiveIntensity || mat.emissiveIntensity < 0.6)) {
        if (flashVal > 0.02) {
          mat.emissive.setRGB(flashVal * 0.85, flashVal * 0.35, flashVal * 0.15);
        } else {
          mat.emissive.setRGB(0, 0, 0);
        }
      }
    }
    return;
  }

  // Dressing Room Emotes
  if (anim.emote && (anim.emoteProgress ?? 0) > 0) {
    const p = anim.emoteProgress ?? 0;
    const bell = Math.sin(p * Math.PI);
    rig.hips.position.y = 0.89 + Math.sin(elapsedTime * 2.2) * 0.01;
    rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x, -0.06, k);
    rig.rightLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.rotation.x, 0.06, k);

    if (anim.emote === 'salute') {
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -2.1 * bell - 0.5 * (1 - bell), k);
      rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, 0.35 * bell, k);
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -0.25, k);
      rig.weaponMount.position.y = 0.12;
      return;
    } else if (anim.emote === 'victory_fist') {
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -2.55 * bell, k);
      rig.leftArm.rotation.z = THREE.MathUtils.lerp(rig.leftArm.rotation.z, -0.25 * bell, k);
      rig.torso.rotation.y = THREE.MathUtils.lerp(rig.torso.rotation.y, 0.25 * bell, k);
      return;
    } else if (anim.emote === 'weapon_inspect') {
      rig.torso.rotation.y = THREE.MathUtils.lerp(rig.torso.rotation.y, -0.35 * bell, k);
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -1.15, k);
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -1.25, k);
      rig.weaponMount.rotation.y = 0.65 * bell;
      return;
    }
  }
  rig.weaponMount.rotation.y = THREE.MathUtils.lerp(rig.weaponMount.rotation.y, 0, k);
  rig.weaponMount.position.y = THREE.MathUtils.lerp(rig.weaponMount.position.y, 0.3, k);

  const moveRatio = anim.maxSpeed > 0 ? Math.min(1.2, anim.speed / anim.maxSpeed) : 0;
  const targetCrouchY = anim.isCrouching ? 0.62 : 0.89;
  const idleBob = Math.sin(elapsedTime * 2.2) * 0.013;
  const runBob = Math.abs(Math.sin(anim.stridePhase)) * 0.055 * moveRatio;
  rig.hips.position.y = THREE.MathUtils.lerp(
    rig.hips.position.y,
    targetCrouchY + idleBob + runBob,
    k,
  );

  const legAmp = (anim.isCrouching ? 0.42 : anim.isSprinting ? 0.84 : 0.62) * moveRatio;
  const airBend = anim.isGrounded ? 0 : 0.35;
  rig.leftLeg.rotation.x = THREE.MathUtils.lerp(
    rig.leftLeg.rotation.x,
    Math.sin(anim.stridePhase) * legAmp + airBend,
    k,
  );
  rig.rightLeg.rotation.x = THREE.MathUtils.lerp(
    rig.rightLeg.rotation.x,
    -Math.sin(anim.stridePhase) * legAmp - airBend * 0.5,
    k,
  );

  const targetLean =
    (anim.isCrouching ? 0.22 : anim.isSprinting ? 0.18 : 0.05 * moveRatio) +
    anim.aimPitch * 0.35;
  rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, targetLean, k);
  rig.torso.rotation.y = THREE.MathUtils.lerp(
    rig.torso.rotation.y,
    anim.isAiming ? -0.18 : 0.04 * Math.sin(anim.stridePhase),
    k,
  );

  const reloadDip = anim.reloadProgress > 0 ? Math.sin(anim.reloadProgress * Math.PI) * 0.55 : 0;
  const recoilKick = anim.recoil * 0.18;

  const isLowReadyIdle =
    anim.speed < 0.25 && !anim.isAiming && anim.recoil <= 0.05 && anim.reloadProgress <= 0;

  if (isLowReadyIdle) {
    // Heroic tactical low-ready across-chest weapon carry so chest, arms, and rifle silhouette read cleanly
    rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, -0.44, k);
    rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, 0.16, k);
    rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, -0.58, k);
    rig.leftArm.rotation.y = THREE.MathUtils.lerp(rig.leftArm.rotation.y, 0.62, k);
    rig.weaponMount.position.x = THREE.MathUtils.lerp(rig.weaponMount.position.x, 0.08, k);
    rig.weaponMount.position.y = THREE.MathUtils.lerp(rig.weaponMount.position.y, 0.24, k);
    rig.weaponMount.position.z = THREE.MathUtils.lerp(rig.weaponMount.position.z, 0.22, k);
    rig.weaponMount.rotation.x = THREE.MathUtils.lerp(rig.weaponMount.rotation.x, 0.34, k);
    rig.weaponMount.rotation.y = THREE.MathUtils.lerp(rig.weaponMount.rotation.y, -0.78, k);
    rig.weaponMount.rotation.z = THREE.MathUtils.lerp(rig.weaponMount.rotation.z, 0.12, k);
  } else if (anim.isAiming || !anim.isSprinting || anim.recoil > 0.05) {
    rig.rightArm.rotation.x = THREE.MathUtils.lerp(
      rig.rightArm.rotation.x,
      -0.95 - recoilKick + reloadDip + anim.aimPitch * 0.6,
      k,
    );
    rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, 0.12, k);

    rig.leftArm.rotation.x = THREE.MathUtils.lerp(
      rig.leftArm.rotation.x,
      -1.02 - recoilKick * 0.7 + reloadDip * 1.15 + anim.aimPitch * 0.6,
      k,
    );
    rig.leftArm.rotation.y = THREE.MathUtils.lerp(rig.leftArm.rotation.y, 0.45, k);
    rig.weaponMount.position.x = THREE.MathUtils.lerp(rig.weaponMount.position.x, 0.17, k);
    rig.weaponMount.position.y = THREE.MathUtils.lerp(rig.weaponMount.position.y, 0.3, k);
    rig.weaponMount.position.z = THREE.MathUtils.lerp(
      rig.weaponMount.position.z,
      0.22 - anim.recoil * 0.06,
      k,
    );
    rig.weaponMount.rotation.x = THREE.MathUtils.lerp(
      rig.weaponMount.rotation.x,
      anim.aimPitch * 0.55 - recoilKick + reloadDip * 0.8,
      k,
    );
    rig.weaponMount.rotation.y = THREE.MathUtils.lerp(rig.weaponMount.rotation.y, 0, k);
    rig.weaponMount.rotation.z = THREE.MathUtils.lerp(rig.weaponMount.rotation.z, 0, k);
  } else {
    rig.rightArm.rotation.x = THREE.MathUtils.lerp(
      rig.rightArm.rotation.x,
      -0.55 + Math.sin(anim.stridePhase) * 0.25,
      k,
    );
    rig.leftArm.rotation.x = THREE.MathUtils.lerp(
      rig.leftArm.rotation.x,
      -0.45 - Math.sin(anim.stridePhase) * 0.35,
      k,
    );
    rig.leftArm.rotation.y = THREE.MathUtils.lerp(rig.leftArm.rotation.y, 0.15, k);
    rig.weaponMount.position.x = THREE.MathUtils.lerp(rig.weaponMount.position.x, 0.17, k);
    rig.weaponMount.position.y = THREE.MathUtils.lerp(rig.weaponMount.position.y, 0.3, k);
    rig.weaponMount.position.z = THREE.MathUtils.lerp(rig.weaponMount.position.z, 0.22, k);
    rig.weaponMount.rotation.x = THREE.MathUtils.lerp(rig.weaponMount.rotation.x, 0.15, k);
    rig.weaponMount.rotation.y = THREE.MathUtils.lerp(rig.weaponMount.rotation.y, -0.32, k);
    rig.weaponMount.rotation.z = THREE.MathUtils.lerp(rig.weaponMount.rotation.z, 0, k);
  }

  rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, anim.aimPitch * 0.45, k);

  const flashVal = anim.hitFlash;
  for (let i = 0; i < Math.min(8, rig.hitFlashMeshes.length); i++) {
    const mat = rig.hitFlashMeshes[i].material as THREE.MeshStandardMaterial;
    if (mat && mat.emissive && (!mat.emissiveIntensity || mat.emissiveIntensity < 0.6)) {
      if (flashVal > 0.02) {
        mat.emissive.setRGB(flashVal * 0.85, flashVal * 0.35, flashVal * 0.15);
      } else {
        mat.emissive.setRGB(0, 0, 0);
      }
    }
  }
}

export function createSupplyDropMesh(textures: ProceduralTextureSet, castShadows: boolean): THREE.Group {
  const g = new THREE.Group();

  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x2a333f,
    map: textures.corrugatedMetalAlbedo,
    roughness: 0.45,
    metalness: 0.65,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd93824,
    emissive: 0x6b180c,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.45,
  });
  const chuteMat = new THREE.MeshStandardMaterial({
    color: 0xb9321e,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  const crate = new THREE.Mesh(createRoundedPlateGeo(1.2, 1.05, 1.2, 0.08, 0.03), crateMat);
  crate.position.y = 0.54;
  crate.castShadow = castShadows;
  crate.receiveShadow = castShadows;

  const band = new THREE.Mesh(createRoundedPlateGeo(1.24, 0.22, 1.24, 0.06, 0.02), trimMat);
  band.position.y = 0.54;

  // Parachute canopy + shroud lines
  const chuteGroup = new THREE.Group();
  chuteGroup.name = 'chute';
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
    chuteMat,
  );
  canopy.position.y = 4.2;
  chuteGroup.add(canopy);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x9ca3af });
  for (const [lx, lz] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ]) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.8, 4), lineMat);
    line.position.set(lx * 1.4, 2.7, lz * 1.4);
    line.rotation.z = -lx * 0.35;
    line.rotation.x = lz * 0.35;
    chuteGroup.add(line);
  }

  // Rising Red Smoke Flare Plume
  const smoke = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.08, 12, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xd93824,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  smoke.name = 'flareSmoke';
  smoke.position.y = 6.5;

  g.add(crate, band, chuteGroup, smoke);
  return g;
}

export function createLootPickupMesh(
  kind: LootKind,
  weaponId: WeaponId | undefined,
  tier: 1 | 2 | 3 | undefined,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();

  const accentHex =
    kind === 'weapon'
      ? 0xd95d24
      : kind === 'medkit'
        ? 0x22c55e
        : kind === 'bandage'
          ? 0x86efac
          : kind === 'armor'
            ? 0x38bdf8
            : kind === 'backpack'
              ? 0xeab308
              : 0xf59e0b;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.48, 24),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  const itemHolder = new THREE.Group();
  itemHolder.position.y = 0.36;
  itemHolder.name = 'spinItem';
  group.add(itemHolder);

  if (kind === 'weapon' && weaponId) {
    const wMesh = createWeaponMesh(weaponId, textures, 'standard_matte');
    wMesh.scale.setScalar(1.35);
    wMesh.rotation.y = Math.PI / 3;
    wMesh.rotation.z = 0.15;
    itemHolder.add(wMesh);
  } else if (kind === 'medkit' || kind === 'bandage') {
    const caseMesh = new THREE.Mesh(
      createRoundedPlateGeo(0.42, 0.24, 0.3, 0.03, 0.01),
      new THREE.MeshStandardMaterial({
        color: kind === 'medkit' ? 0x2d4a36 : 0xd6d3c9,
        roughness: 0.55,
        metalness: 0.15,
      }),
    );
    const crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.03, 0.06),
      new THREE.MeshStandardMaterial({
        color: kind === 'medkit' ? 0x4ade80 : 0xd95d24,
        emissive: kind === 'medkit' ? 0x15803d : 0x7c2d12,
        emissiveIntensity: 0.5,
      }),
    );
    crossH.position.y = 0.13;
    const crossV = crossH.clone();
    crossV.rotation.y = Math.PI / 2;
    itemHolder.add(caseMesh, crossH, crossV);
  } else if (kind === 'armor') {
    const vestColor = tier === 3 ? 0x1e293b : tier === 2 ? 0x334155 : 0x475569;
    const plate = new THREE.Mesh(
      createRoundedPlateGeo(0.42, 0.46, 0.2, 0.04, 0.015),
      new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.45, metalness: 0.55 }),
    );
    const trim = new THREE.Mesh(
      createRoundedPlateGeo(0.36, 0.1, 0.22, 0.02, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.6 }),
    );
    itemHolder.add(plate, trim);
  } else if (kind === 'backpack') {
    const packColor = tier === 3 ? 0x5c4625 : 0x4d5d42;
    const pack = new THREE.Mesh(
      createRoundedPlateGeo(0.38, 0.44, 0.22, 0.04, 0.015),
      new THREE.MeshStandardMaterial({
        color: packColor,
        bumpMap: textures.tacticalFabricBump,
        roughness: 0.8,
      }),
    );
    const strap = new THREE.Mesh(
      createRoundedPlateGeo(0.4, 0.08, 0.24, 0.02, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xd95d24, roughness: 0.5 }),
    );
    strap.position.y = 0.08;
    itemHolder.add(pack, strap);
  } else {
    const crate = new THREE.Mesh(
      createRoundedPlateGeo(0.38, 0.24, 0.26, 0.025, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x4d5d42, roughness: 0.65, metalness: 0.35 }),
    );
    const band = new THREE.Mesh(
      createRoundedPlateGeo(0.4, 0.06, 0.28, 0.015, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.6 }),
    );
    itemHolder.add(crate, band);
  }

  return group;
}

export function createArmoredTruck(
  textures: ProceduralTextureSet,
  castShadows: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x454f3d,
    map: textures.corrugatedMetalAlbedo,
    roughness: 0.64,
    metalness: 0.38,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1d2024,
    roughness: 0.55,
    metalness: 0.72,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e2c36,
    roughness: 0.1,
    metalness: 0.88,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141517,
    roughness: 0.9,
    metalness: 0.05,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x70563c,
    bumpMap: textures.tacticalFabricBump,
    roughness: 0.85,
  });

  const add = (m: THREE.Mesh) => {
    m.castShadow = castShadows;
    m.receiveShadow = castShadows;
    g.add(m);
    return m;
  };

  add(new THREE.Mesh(createRoundedPlateGeo(2.35, 0.45, 5.2, 0.08, 0.03), chassisMat)).position.set(0, 0.68, 0);
  add(new THREE.Mesh(createRoundedPlateGeo(2.26, 1.35, 1.95, 0.12, 0.04), bodyMat)).position.set(0, 1.45, 1.35);
  const hood = add(new THREE.Mesh(createRoundedPlateGeo(2.14, 0.75, 1.25, 0.1, 0.04), bodyMat));
  hood.position.set(0, 1.22, 2.35);
  hood.rotation.x = 0.14;
  add(new THREE.Mesh(createRoundedPlateGeo(1.96, 0.52, 0.12, 0.04, 0.01), glassMat)).position.set(0, 1.72, 2.32);

  // Radiator grille + horizontal slats + dual headlights + side mirrors
  const grille = add(new THREE.Mesh(createRoundedPlateGeo(1.12, 0.44, 0.12, 0.03, 0.01), chassisMat));
  grille.position.set(0, 1.24, 2.98);
  for (let sl = -1; sl <= 1; sl++) {
    const louver = add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.045, 0.05), bodyMat));
    louver.position.set(0, 1.24 + sl * 0.11, 3.03);
  }
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.55,
    roughness: 0.15,
    metalness: 0.5,
  });
  for (const hx of [-0.78, 0.78]) {
    const lamp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), headlightMat));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(hx, 1.24, 2.98);
    const mirror = add(new THREE.Mesh(createRoundedPlateGeo(0.12, 0.24, 0.06, 0.02, 0.008), chassisMat));
    mirror.position.set(hx < 0 ? -1.24 : 1.24, 1.66, 2.15);
  }

  // Curved canvas troop canopy
  const canopyGeo = new THREE.CylinderGeometry(1.18, 1.18, 2.9, 12, 1, false, 0, Math.PI);
  canopyGeo.rotateZ(Math.PI / 2);
  canopyGeo.rotateY(Math.PI / 2);
  add(new THREE.Mesh(canopyGeo, canopyMat)).position.set(0, 1.78, -1.05);
  add(new THREE.Mesh(createRoundedPlateGeo(2.28, 0.88, 2.9, 0.06, 0.02), bodyMat)).position.set(0, 1.32, -1.05);
  add(new THREE.Mesh(createRoundedPlateGeo(2.32, 0.42, 0.22, 0.05, 0.02), chassisMat)).position.set(0, 0.9, 3.05);

  const wheelGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.42, 16);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.44, 10);
  for (const [wx, wz] of [
    [-1.18, 1.95],
    [1.18, 1.95],
    [-1.18, -1.6],
    [1.18, -1.6],
  ]) {
    const tire = add(new THREE.Mesh(wheelGeo, tireMat));
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, 0.56, wz);
    const rim = add(new THREE.Mesh(rimGeo, chassisMat));
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, 0.56, wz);
  }
  return g;
}

export function createAbandonedSedan(castShadows: boolean, colorHex = 0x6b4f3b): THREE.Group {
  const g = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.55,
    metalness: 0.48,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x22303c,
    roughness: 0.1,
    metalness: 0.85,
  });

  const add = (m: THREE.Mesh) => {
    m.castShadow = castShadows;
    m.receiveShadow = castShadows;
    g.add(m);
    return m;
  };

  add(new THREE.Mesh(createRoundedPlateGeo(1.9, 0.68, 4.3, 0.14, 0.04), paintMat)).position.set(0, 0.66, 0);
  add(new THREE.Mesh(createRoundedPlateGeo(1.66, 0.62, 2.15, 0.16, 0.04), paintMat)).position.set(0, 1.24, -0.15);
  add(new THREE.Mesh(createRoundedPlateGeo(1.52, 0.44, 1.95, 0.1, 0.02), glassMat)).position.set(0, 1.26, -0.12);
  add(new THREE.Mesh(createRoundedPlateGeo(1.94, 0.22, 0.24, 0.04, 0.01), trimMat)).position.set(0, 0.46, 2.12);
  add(new THREE.Mesh(createRoundedPlateGeo(1.94, 0.22, 0.24, 0.04, 0.01), trimMat)).position.set(0, 0.46, -2.12);

  const wGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 14);
  for (const [wx, wz] of [
    [-0.92, 1.35],
    [0.92, 1.35],
    [-0.92, -1.35],
    [0.92, -1.35],
  ]) {
    const w = add(new THREE.Mesh(wGeo, trimMat));
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
  }
  return g;
}
