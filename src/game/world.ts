import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createBotActor, stepAIActor, type CombatantActor } from './ai';
import { soundEngine } from './audio';
import { buildBattlefield, type BattlefieldBuildResult } from './battlefield';
import { DIFFICULTY_CONFIG, GRAPHICS_CONFIG, OPERATIVES, WEAPONS } from './constants';
import {
  animateOperative,
  applyCustomizationToRig,
  createLootPickupMesh,
  createOperativeRig,
  createSupplyDropMesh,
  equipWeaponVisual,
  preloadCharacterGlbs,
  type OperativeRig,
} from './models';
import {
  applyCombatDamage,
  applyLootPickup,
  buildMatchStats,
  clamp,
  createInitialSafeZone,
  createWeaponSlot,
  getBackpackMaxMedkits,
  getLocationNameAt,
  isOutsideSafeZone,
  resolveWorldCollision,
  segmentIntersectsAABB,
  stepSafeZone,
  walkableHeightAt,
} from './rules';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import type {
  EmoteId,
  GameScreenState,
  GameSettings,
  HudSnapshot,
  KillFeedEntry,
  LootSpawn,
  MatchStats,
  MinimapBlip,
  SafeZoneState,
  SupplyDropState,
  TimeOfDay,
  WeaponSlotState,
} from './types';

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

interface ProjectileBolt {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  damage: number;
  ownerId: string;
  color: number;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (stats: MatchStats) => void;
  onReady: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class LastZoneEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sky: Sky;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private textures: ProceduralTextureSet;
  private battlefield: BattlefieldBuildResult | null = null;
  private isSoftwareGl: boolean;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private muzzleLight: THREE.PointLight;
  private muzzleLightTimer = 0;

  private settings: GameSettings;
  private screenState: GameScreenState = 'loading';
  private lobbyMode: 'main' | 'dressing' = 'main';
  private turntableYaw = 0;
  private turntableMesh: THREE.Mesh;
  private activeEmote: EmoteId | null = null;
  private emoteTimer = 0;

  private rafId = 0;
  private timeoutId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private hudAccumulator = 0;

  // Player & Actors
  private playerRig: OperativeRig | null = null;
  private playerWeapons: (WeaponSlotState | null)[] = [null, null, null];
  private playerActiveSlot = 0;
  private playerHealth = 100;
  private playerMaxHealth = 100;
  private playerArmor = 0;
  private playerArmorTier: 0 | 1 | 2 | 3 = 0;
  private playerBackpackTier: 1 | 2 | 3 = 1;
  private playerMedkits = 1;
  private playerBandages = 2;
  private playerStamina = 100;
  private playerX = -8;
  private playerY = 0;
  private playerZ = 6;
  private playerVy = 0;
  private playerYaw = 0.28;
  private playerPitch = -0.06;
  private playerGrounded = true;
  private playerCrouching = false;
  private playerSprinting = false;
  private playerAiming = false;
  private playerStride = 0;
  private playerRecoil = 0;
  private playerHitFlash = 0;
  private playerFireCooldown = 0;
  private playerReloadTimer = 0;
  private playerHealTimer = 0;
  private playerHealDuration = 0;
  private playerHealKind: 'medkit' | 'bandage' | null = null;
  private playerKills = 0;
  private playerBossKills = 0;
  private playerDamageDealt = 0;
  private playerShotsFired = 0;
  private playerShotsHit = 0;
  private playerLootCollected = 0;
  private playerDeadTimer = 0;
  private playerLastDamagerName = 'Collapse Zone';

  private bots: CombatantActor[] = [];
  private lootMeshes = new Map<string, THREE.Group>();
  private supplyDrops: SupplyDropState[] = [];
  private supplyDropMeshes = new Map<string, THREE.Group>();
  private nextSupplyDropTime = 16;

  private safeZone: SafeZoneState = createInitialSafeZone(0, 0);
  private zoneRingMesh: THREE.Mesh;
  private zoneWarningTimer = 0;
  private matchTime = 0;
  private totalCombatants = 17;
  private killFeed: KillFeedEntry[] = [];
  private nextKillId = 1;
  private gunfireBlips: MinimapBlip[] = [];
  private hitmarkerKind: 'none' | 'hit' | 'kill' = 'none';
  private hitmarkerTimer = 0;
  private damageFlash = 0;
  private cameraTrauma = 0;
  private hitstopTimer = 0;
  private footstepAccum = 0;

  private camCurrentPos = new THREE.Vector3(-8, 3, 12);
  private camCurrentLook = new THREE.Vector3(-8, 1.4, 6);
  private camRaycaster = new THREE.Raycaster();

  private bolts: ProjectileBolt[] = [];
  private boltInst: THREE.InstancedMesh;
  private particles: PooledParticle[] = [];
  private particleInst: THREE.InstancedMesh;

  // Input State
  private keys = new Set<string>();
  private mouseDown = false;
  private rightMouseDown = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchFire = false;
  private touchAim = false;
  private touchSprint = false;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.settings = { ...initialSettings, customization: { ...initialSettings.customization } };
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && initialSettings.graphics !== 'performance',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const fogColor = new THREE.Color(0xb2bbb4);
    this.scene.background = fogColor;
    this.scene.fog = new THREE.FogExp2(0xb2bbb4, 0.0034);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.15, 440);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmrem.dispose();

    this.sky = new Sky();
    this.sky.scale.setScalar(800);
    this.sky.material.fog = false;
    this.scene.add(this.sky);

    this.hemiLight = new THREE.HemisphereLight(0xc2d4e6, 0x4e4636, 0.78);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffe1b5, 2.2);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 90;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.applyGraphicsSettings();
    this.applyTimeOfDay(this.settings.timeOfDay);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Holographic Dressing Room Turntable Pedestal
    this.turntableMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 36),
      new THREE.MeshBasicMaterial({
        map: this.textures.turntableMap,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    this.turntableMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.turntableMesh);

    const zoneGradCanvas = document.createElement('canvas');
    zoneGradCanvas.width = 4;
    zoneGradCanvas.height = 128;
    const zCtx = zoneGradCanvas.getContext('2d')!;
    const zGrad = zCtx.createLinearGradient(0, 0, 0, 128);
    zGrad.addColorStop(0.0, 'rgba(217, 56, 36, 0.0)');
    zGrad.addColorStop(0.55, 'rgba(217, 56, 36, 0.08)');
    zGrad.addColorStop(0.88, 'rgba(217, 56, 36, 0.36)');
    zGrad.addColorStop(1.0, 'rgba(217, 56, 36, 0.55)');
    zCtx.fillStyle = zGrad;
    zCtx.fillRect(0, 0, 4, 128);
    const zoneTex = new THREE.CanvasTexture(zoneGradCanvas);
    zoneTex.colorSpace = THREE.SRGBColorSpace;

    const zoneGeo = new THREE.CylinderGeometry(1, 1, 130, 64, 1, true);
    const zoneMat = new THREE.MeshBasicMaterial({
      map: zoneTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.zoneRingMesh = new THREE.Mesh(zoneGeo, zoneMat);
    this.zoneRingMesh.visible = false;
    this.scene.add(this.zoneRingMesh);

    const boltGeo = new THREE.BoxGeometry(0.06, 0.06, 1.35);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.boltInst = new THREE.InstancedMesh(boltGeo, boltMat, 48);
    this.boltInst.frustumCulled = false;
    this.boltInst.count = 0;
    this.scene.add(this.boltInst);
    for (let i = 0; i < 48; i++) {
      this.bolts.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        damage: 10,
        ownerId: '',
        color: 0xffa64d,
      });
    }

    const pGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInst = new THREE.InstancedMesh(pGeo, pMat, 110);
    this.particleInst.frustumCulled = false;
    this.particleInst.count = 0;
    this.scene.add(this.particleInst);
    for (let i = 0; i < 110; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        size: 1,
        color: new THREE.Color(0xd95d24),
      });
    }

    this.muzzleLight = new THREE.PointLight(0xffb347, 0, 11);
    this.scene.add(this.muzzleLight);

    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.42, 0.92);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    this.rebuildWorld(true);
    this.rebuildPlayerRig();

    this.bindInputListeners();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.lastTimestamp = performance.now();
    this.scheduleNextTick();

    preloadCharacterGlbs().finally(() => {
      if (this.disposed) return;
      this.rebuildPlayerRig();
      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }
      this.callbacks.onReady();
    });
  }

  private applyGraphicsSettings(): void {
    const cfg = GRAPHICS_CONFIG[this.settings.graphics];
    const dpr = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio) * cfg.resolutionScale;
    this.renderer.setPixelRatio(Math.max(0.65, dpr));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && cfg.shadows;
    if (this.sunLight) {
      this.sunLight.castShadow = !this.isSoftwareGl && cfg.shadows;
      this.sunLight.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    if (this.camera) {
      this.camera.far = Math.max(1200, cfg.farClip + 600);
      this.camera.updateProjectionMatrix();
    }
  }

  private applyTimeOfDay(tod: TimeOfDay): void {
    const uniforms = this.sky.material.uniforms;
    const sunVec = new THREE.Vector3();
    if (tod === 'daylight') {
      uniforms['turbidity'].value = 3.8;
      uniforms['rayleigh'].value = 1.25;
      uniforms['mieCoefficient'].value = 0.004;
      uniforms['mieDirectionalG'].value = 0.78;
      sunVec.setFromSphericalCoords(1, THREE.MathUtils.degToRad(46), THREE.MathUtils.degToRad(142));
      this.sunLight.color.setHex(0xfff4df);
      this.sunLight.intensity = 2.4;
      this.hemiLight.color.setHex(0xc8dcf0);
      this.hemiLight.groundColor.setHex(0x524c3e);
      this.hemiLight.intensity = 0.85;
      (this.scene.fog as THREE.FogExp2).color.setHex(0xb4c4cf);
      (this.scene.fog as THREE.FogExp2).density = 0.0028;
      this.scene.background = new THREE.Color(0xb4c4cf);
    } else {
      uniforms['turbidity'].value = 7.4;
      uniforms['rayleigh'].value = 2.05;
      uniforms['mieCoefficient'].value = 0.007;
      uniforms['mieDirectionalG'].value = 0.84;
      sunVec.setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(136));
      this.sunLight.color.setHex(0xffcb8c);
      this.sunLight.intensity = 2.2;
      this.hemiLight.color.setHex(0xc2c8dc);
      this.hemiLight.groundColor.setHex(0x4b4032);
      this.hemiLight.intensity = 0.76;
      (this.scene.fog as THREE.FogExp2).color.setHex(0xa8a59b);
      (this.scene.fog as THREE.FogExp2).density = 0.0034;
      this.scene.background = new THREE.Color(0xa8a59b);
    }
    uniforms['sunPosition'].value.copy(sunVec);
    this.sunLight.position.copy(sunVec).multiplyScalar(115);
  }

  public updateSettings(next: GameSettings): void {
    const graphicsChanged = next.graphics !== this.settings.graphics;
    const opChanged = next.operative !== this.settings.operative;
    const todChanged = next.timeOfDay !== this.settings.timeOfDay;
    const customChanged =
      JSON.stringify(next.customization) !== JSON.stringify(this.settings.customization);

    this.settings = { ...next, customization: { ...next.customization } };
    soundEngine.syncSettings(this.settings);

    if (todChanged) {
      this.applyTimeOfDay(this.settings.timeOfDay);
    }
    if (graphicsChanged) {
      this.applyGraphicsSettings();
      this.handleResize();
      if (this.screenState === 'title') {
        this.rebuildWorld(true);
      }
    }
    if (opChanged && this.screenState === 'title') {
      this.rebuildPlayerRig();
    } else if (customChanged && this.playerRig) {
      const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
      applyCustomizationToRig(this.playerRig, this.settings.customization, this.textures, castShadows);
    }
  }

  public setLobbyMode(mode: 'main' | 'dressing'): void {
    this.lobbyMode = mode;
    if (mode === 'dressing') {
      this.turntableYaw = 0;
    }
  }

  public rotateTurntable(deltaYaw: number): void {
    this.turntableYaw += deltaYaw;
  }

  public triggerEmote(emote: EmoteId): void {
    this.activeEmote = emote;
    this.emoteTimer = 1.65;
  }

  public setScreenState(state: GameScreenState): void {
    this.screenState = state;
    if (state !== 'playing') {
      this.clearInputs();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    if (state === 'title') {
      this.zoneRingMesh.visible = false;
      this.turntableMesh.visible = true;
      this.clearBots();
      this.clearSupplyDrops();
      this.playerX = -8;
      this.playerZ = 6;
      this.playerY = walkableHeightAt(this.playerX, this.playerZ);
      this.playerYaw = 0.25;
      this.rebuildPlayerRig();
    } else {
      this.turntableMesh.visible = false;
    }
  }

  public startNewMatch(fromUserGesture = true): void {
    if (fromUserGesture) {
      soundEngine.unlock();
      soundEngine.stopLobbyPulse();
      soundEngine.startAmbience();
    }

    this.clearInputs();
    this.lobbyMode = 'main';
    this.turntableMesh.visible = false;
    this.rebuildWorld(false);
    this.resetPlayerForMatch();
    this.spawnBotsForMatch();
    this.clearSupplyDrops();
    this.nextSupplyDropTime = 16;

    this.safeZone = createInitialSafeZone((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26);
    this.zoneRingMesh.visible = this.settings.mode === 'battle_royale';
    this.matchTime = 0;
    this.killFeed = [];
    this.gunfireBlips = [];
    this.hitmarkerKind = 'none';
    this.hitmarkerTimer = 0;
    this.damageFlash = 0;
    this.cameraTrauma = 0;
    this.hitstopTimer = 0;
    this.zoneWarningTimer = 0;
    this.clearBoltsAndParticles();

    this.screenState = 'playing';
    this.emitHudSnapshot();
  }

  private rebuildWorld(clearOnly: boolean): void {
    if (this.battlefield) {
      this.scene.remove(this.battlefield.group);
      this.battlefield.dispose();
      this.battlefield = null;
    }
    this.lootMeshes.forEach((m) => this.scene.remove(m));
    this.lootMeshes.clear();

    const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
    this.battlefield = buildBattlefield(this.textures, this.settings.graphics, castShadows);
    this.scene.add(this.battlefield.group);

    if (!clearOnly) {
      for (const loot of this.battlefield.lootSpawns) {
        const mesh = createLootPickupMesh(loot.kind, loot.weaponId, loot.tier, this.textures);
        mesh.position.set(loot.x, loot.y, loot.z);
        this.scene.add(mesh);
        this.lootMeshes.set(loot.id, mesh);
      }
    }
  }

  private rebuildPlayerRig(): void {
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
    }
    const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
    this.playerRig = createOperativeRig(
      this.settings.operative,
      this.textures,
      castShadows,
      this.settings.customization,
    );
    this.playerY = walkableHeightAt(this.playerX, this.playerZ);
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.turntableMesh.position.set(this.playerX, this.playerY + 0.04, this.playerZ);

    const activeW = this.playerWeapons[this.playerActiveSlot];
    equipWeaponVisual(
      this.playerRig,
      activeW ? activeW.weaponId : 'mk47_carbine',
      castShadows,
      this.textures,
      this.settings.customization.weaponSkin,
    );
    this.scene.add(this.playerRig.root);
  }

  private resetPlayerForMatch(): void {
    const op = OPERATIVES[this.settings.operative];
    this.playerX = -8;
    this.playerZ = 6;
    this.playerY = walkableHeightAt(this.playerX, this.playerZ);
    this.playerVy = 0;
    this.playerYaw = Math.atan2(8, 36); // Facing north-northwest toward Military Base Watchtower & Crossroads
    this.playerPitch = -0.02;
    this.playerGrounded = true;
    this.playerCrouching = false;
    this.playerSprinting = false;
    this.playerAiming = false;
    this.playerStride = 0;
    this.playerRecoil = 0;
    this.playerHitFlash = 0;
    this.playerFireCooldown = 0;
    this.playerReloadTimer = 0;
    this.playerHealTimer = 0;
    this.playerHealDuration = 0;
    this.playerHealKind = null;

    this.playerHealth = 100;
    this.playerMaxHealth = 100;
    this.playerArmor = op.armorBonus;
    this.playerArmorTier = op.armorBonus > 0 ? 1 : 0;
    this.playerBackpackTier = 1;
    this.playerMedkits = 1;
    this.playerBandages = 2;
    this.playerStamina = 100;

    if (this.settings.mode === 'training') {
      this.playerWeapons = [
        createWeaponSlot('mk47_carbine'),
        createWeaponSlot('longshot_dmr'),
        createWeaponSlot('tactical_pistol'),
      ];
      this.playerActiveSlot = 0;
      this.playerMedkits = 3;
    } else {
      this.playerWeapons = [null, null, createWeaponSlot(op.startingWeapon)];
      this.playerActiveSlot = 2;
    }

    this.playerKills = 0;
    this.playerBossKills = 0;
    this.playerDamageDealt = 0;
    this.playerShotsFired = 0;
    this.playerShotsHit = 0;
    this.playerLootCollected = 0;
    this.playerDeadTimer = 0;
    this.playerLastDamagerName = 'Collapse Zone';

    this.rebuildPlayerRig();
    this.camCurrentPos.set(this.playerX + 1.5, this.playerY + 2.6, this.playerZ + 4.5);
    this.camCurrentLook.set(this.playerX, this.playerY + 1.5, this.playerZ - 5);
  }

  private clearBots(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.rig.root);
    }
    this.bots = [];
  }

  private clearSupplyDrops(): void {
    this.supplyDropMeshes.forEach((m) => this.scene.remove(m));
    this.supplyDropMeshes.clear();
    this.supplyDrops = [];
  }

  private spawnBotsForMatch(): void {
    this.clearBots();
    if (!this.battlefield) return;
    const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;

    if (this.settings.mode === 'training') {
      this.battlefield.trainingTargets.forEach((pt, idx) => {
        const bot = createBotActor(
          idx,
          pt.x,
          pt.z,
          Math.atan2(this.playerX - pt.x, this.playerZ - pt.z),
          this.textures,
          castShadows,
          this.settings.difficulty,
          true,
        );
        this.bots.push(bot);
        this.scene.add(bot.rig.root);
      });
      this.totalCombatants = this.bots.length + 1;
      return;
    }

    const diffCfg = DIFFICULTY_CONFIG[this.settings.difficulty];
    const count = Math.min(diffCfg.botCount, this.battlefield.spawnPoints.length);
    for (let i = 0; i < count; i++) {
      const sp = this.battlefield.spawnPoints[i];
      const bot = createBotActor(
        i,
        sp.x,
        sp.z,
        sp.yaw,
        this.textures,
        castShadows,
        this.settings.difficulty,
        false,
      );
      this.bots.push(bot);
      this.scene.add(bot.rig.root);
    }
    this.totalCombatants = this.bots.length + 1;
  }

  private spawnSupplyDrop(): void {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * Math.max(12, this.safeZone.nextRadius * 0.55);
    const sx = this.safeZone.nextX + Math.cos(angle) * rad;
    const sz = this.safeZone.nextZ + Math.sin(angle) * rad;
    const groundY = walkableHeightAt(sx, sz);
    const id = `airdrop_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;

    const drop: SupplyDropState = {
      id,
      x: sx,
      y: groundY + 26,
      z: sz,
      groundY,
      landed: false,
      opened: false,
    };
    this.supplyDrops.push(drop);

    const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
    const mesh = createSupplyDropMesh(this.textures, castShadows);
    mesh.position.set(sx, drop.y, sz);
    this.scene.add(mesh);
    this.supplyDropMeshes.set(id, mesh);
    soundEngine.playSupplyDrop();
  }

  private clearBoltsAndParticles(): void {
    for (const b of this.bolts) b.active = false;
    for (const p of this.particles) p.active = false;
    this.boltInst.count = 0;
    this.particleInst.count = 0;
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.timeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timeoutId = window.setTimeout(cb, 80);
        }
      };
      this.timeoutId = window.setTimeout(poll, 5);
    } else {
      this.timeoutId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedTime += dt;

    // Environmental animations (river ripple, Military Base radar, grass wind, factory smoke)
    if (this.battlefield) {
      this.battlefield.windUniforms.uTime.value = this.elapsedTime;
      for (let i = 0; i < this.battlefield.smokePuffs.length; i++) {
        const puff = this.battlefield.smokePuffs[i];
        puff.phase = (puff.phase + dt * puff.speed) % 1;
        const t = puff.phase;
        puff.mesh.position.set(
          puff.baseX + t * 3.8 + Math.sin(this.elapsedTime * 1.4 + t * 5) * 0.45,
          puff.baseY + t * 14.5,
          puff.baseZ + t * 1.6,
        );
        puff.mesh.scale.setScalar(0.8 + t * 2.1);
      }
      if (this.battlefield.radarDish) {
        this.battlefield.radarDish.rotation.y += dt * 0.48;
      }
      if (this.battlefield.waterMaterial.normalMap) {
        this.battlefield.waterMaterial.normalMap.offset.x += dt * 0.045;
        this.battlefield.waterMaterial.normalMap.offset.y += dt * 0.018;
      }
    }

    if (this.muzzleLightTimer > 0) {
      this.muzzleLightTimer = Math.max(0, this.muzzleLightTimer - dt);
      this.muzzleLight.intensity = (this.muzzleLightTimer / 0.06) * 3.2;
    } else {
      this.muzzleLight.intensity = 0;
    }

    if (this.screenState === 'title') {
      this.updateLobbyCamera(dt);
    } else if (this.screenState === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.updateGameplay(dt);
      }
    } else if (this.screenState === 'gameover') {
      this.updateGameOverCamera(dt);
    }

    if (!this.isSoftwareGl && this.composer && this.settings.graphics !== 'performance') {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.scheduleNextTick();
  }

  private updateLobbyCamera(dt: number): void {
    if (!this.playerRig) return;

    if (this.emoteTimer > 0) {
      this.emoteTimer = Math.max(0, this.emoteTimer - dt);
      if (this.emoteTimer <= 0) this.activeEmote = null;
    }

    const isDressing = this.lobbyMode === 'dressing';
    const baseYaw = isDressing ? this.turntableYaw : 0.25 + Math.sin(this.elapsedTime * 0.25) * 0.14;
    this.playerRig.root.rotation.y = isDressing ? this.turntableYaw : 0.15;
    this.turntableMesh.rotation.z += dt * 0.35;

    const camDist = isDressing ? 2.85 : 3.35;
    const orbitYaw = isDressing ? 0.08 : baseYaw;
    const targetX = this.playerX + Math.sin(orbitYaw) * camDist;
    const targetZ = this.playerZ + Math.cos(orbitYaw) * camDist;
    const targetY = this.playerY + (isDressing ? 1.24 : 1.38);

    const k = 1 - Math.exp(-6 * dt);
    this.camCurrentPos.x = THREE.MathUtils.lerp(this.camCurrentPos.x, targetX, k);
    this.camCurrentPos.y = THREE.MathUtils.lerp(this.camCurrentPos.y, targetY, k);
    this.camCurrentPos.z = THREE.MathUtils.lerp(this.camCurrentPos.z, targetZ, k);

    // Frame operative on left-center in main lobby (menu on right) or center in dressing room
    const shiftX = isDressing ? 0.05 : 0.42;
    this.camCurrentLook.set(this.playerX + shiftX, this.playerY + 1.15, this.playerZ);

    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, isDressing ? 44 : 48, k);
    this.camera.updateProjectionMatrix();

    animateOperative(
      this.playerRig,
      {
        speed: 0,
        maxSpeed: 5,
        stridePhase: 0,
        isSprinting: false,
        isCrouching: false,
        isGrounded: true,
        isAiming: false,
        recoil: 0,
        reloadProgress: 0,
        hitFlash: 0,
        deadProgress: 0,
        aimPitch: 0,
        emote: this.activeEmote,
        emoteProgress: this.activeEmote ? 1 - this.emoteTimer / 1.65 : 0,
      },
      this.elapsedTime,
      dt,
    );
  }

  private updateGameOverCamera(dt: number): void {
    if (!this.playerRig) return;
    if (this.playerHealth <= 0) {
      this.playerDeadTimer = Math.min(1, this.playerDeadTimer + dt * 2.2);
      animateOperative(
        this.playerRig,
        {
          speed: 0,
          maxSpeed: 5,
          stridePhase: 0,
          isSprinting: false,
          isCrouching: false,
          isGrounded: true,
          isAiming: false,
          recoil: 0,
          reloadProgress: 0,
          hitFlash: 0,
          deadProgress: this.playerDeadTimer,
          aimPitch: 0,
        },
        this.elapsedTime,
        dt,
      );
    }
    this.updateParticlesAndBolts(dt);
  }

  private updateGameplay(dt: number): void {
    if (!this.battlefield || !this.playerRig) return;

    this.matchTime += dt;
    this.playerRecoil = Math.max(0, this.playerRecoil - dt * 6);
    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt * 6.5);
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);
    this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
    if (this.hitmarkerTimer <= 0) this.hitmarkerKind = 'none';
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.2);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.4);

    // 1. Player Movement & Physics
    const op = OPERATIVES[this.settings.operative];
    let inForward = 0;
    let inRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inRight -= 1;

    inForward += this.touchMoveY;
    inRight += this.touchMoveX;

    const inputMag = Math.hypot(inForward, inRight);
    if (inputMag > 1) {
      inForward /= inputMag;
      inRight /= inputMag;
    }

    this.playerAiming = this.rightMouseDown || this.keys.has('KeyV') || this.touchAim;
    const wantsSprint =
      (this.keys.has('ShiftLeft') ||
        this.keys.has('ShiftRight') ||
        this.touchSprint ||
        (inputMag > 0.88 && this.touchMoveY > 0.72)) &&
      inForward > 0.25 &&
      !this.playerCrouching &&
      !this.playerAiming &&
      this.playerHealTimer <= 0 &&
      this.playerStamina > 4;

    this.playerSprinting = wantsSprint;
    if (this.playerSprinting) {
      this.playerStamina = Math.max(0, this.playerStamina - 22 * dt);
    } else {
      this.playerStamina = Math.min(100, this.playerStamina + 16 * dt);
    }

    const baseSpeed = this.playerCrouching
      ? 2.6
      : this.playerAiming
        ? 3.1
        : this.playerSprinting
          ? 7.0
          : 4.9;
    const moveSpeed = baseSpeed * op.speedBonus * (this.playerHealTimer > 0 ? 0.55 : 1);

    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);
    const dirX = -sinY * inForward + cosY * inRight;
    const dirZ = -cosY * inForward - sinY * inRight;

    let actualSpeed = 0;
    if (Math.hypot(dirX, dirZ) > 0.01) {
      const stepX = dirX * moveSpeed * dt;
      const stepZ = dirZ * moveSpeed * dt;
      const res = resolveWorldCollision(
        this.playerX + stepX,
        this.playerZ + stepZ,
        this.playerY,
        0.48,
        this.battlefield.colliders,
      );
      actualSpeed = Math.hypot(res.x - this.playerX, res.z - this.playerZ) / Math.max(dt, 0.001);
      this.playerX = res.x;
      this.playerZ = res.z;
    }

    const floorY = walkableHeightAt(this.playerX, this.playerZ);
    if (!this.playerGrounded) {
      this.playerVy -= 20 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= floorY) {
        this.playerY = floorY;
        this.playerVy = 0;
        this.playerGrounded = true;
        soundEngine.playFootstep(true);
      }
    } else {
      this.playerY = floorY;
    }

    this.playerStride += actualSpeed * dt * 2.15;
    if (actualSpeed > 0.7 && this.playerGrounded) {
      this.footstepAccum += actualSpeed * dt;
      if (this.footstepAccum > (this.playerSprinting ? 2.15 : 1.75)) {
        this.footstepAccum = 0;
        soundEngine.playFootstep(this.playerSprinting);
      }
    }

    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw + Math.PI;

    const activeSlot = this.playerWeapons[this.playerActiveSlot];
    if (this.playerReloadTimer > 0 && activeSlot) {
      this.playerReloadTimer -= dt;
      if (this.playerReloadTimer <= 0) {
        const spec = WEAPONS[activeSlot.weaponId];
        const needed = spec.magSize - activeSlot.ammoInMag;
        const transfer = Math.min(needed, activeSlot.reserveAmmo);
        activeSlot.ammoInMag += transfer;
        activeSlot.reserveAmmo -= transfer;
        this.playerReloadTimer = 0;
      }
    }

    if (this.playerHealTimer > 0) {
      this.playerHealTimer -= dt;
      if (this.playerHealTimer <= 0) {
        if (this.playerHealKind === 'medkit' && this.playerMedkits > 0) {
          this.playerMedkits--;
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 75);
        } else if (this.playerHealKind === 'bandage' && this.playerBandages > 0) {
          this.playerBandages--;
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 25);
        }
        this.playerHealKind = null;
        this.playerHealTimer = 0;
      }
    }

    if ((this.mouseDown || this.touchFire || this.keys.has('KeyF')) && activeSlot) {
      const spec = WEAPONS[activeSlot.weaponId];
      if (spec.automatic) {
        this.tryFirePlayerWeapon();
      }
    }

    const reloadNorm =
      this.playerReloadTimer > 0 && activeSlot
        ? 1 - this.playerReloadTimer / WEAPONS[activeSlot.weaponId].reloadTime
        : 0;

    animateOperative(
      this.playerRig,
      {
        speed: actualSpeed,
        maxSpeed: 7.0,
        stridePhase: this.playerStride,
        isSprinting: this.playerSprinting,
        isCrouching: this.playerCrouching,
        isGrounded: this.playerGrounded,
        isAiming: this.playerAiming,
        recoil: this.playerRecoil,
        reloadProgress: reloadNorm,
        hitFlash: this.playerHitFlash,
        deadProgress: 0,
        aimPitch: this.playerPitch,
      },
      this.elapsedTime,
      dt,
    );

    // 2. Spin Loot & Animate Parachute Supply Drops
    for (const loot of this.battlefield.lootSpawns) {
      if (loot.collected) continue;
      const mesh = this.lootMeshes.get(loot.id);
      if (mesh) {
        const spin = mesh.getObjectByName('spinItem');
        if (spin) {
          spin.rotation.y += dt * 1.4;
          spin.position.y = 0.38 + Math.sin(this.elapsedTime * 2.6 + loot.x) * 0.06;
        }
      }
    }

    if (this.settings.mode === 'battle_royale') {
      if (this.matchTime >= this.nextSupplyDropTime && this.supplyDrops.length < 4) {
        this.nextSupplyDropTime += 26;
        this.spawnSupplyDrop();
      }
      for (const drop of this.supplyDrops) {
        if (drop.opened) continue;
        const mesh = this.supplyDropMeshes.get(drop.id);
        if (!drop.landed) {
          drop.y = Math.max(drop.groundY, drop.y - 3.6 * dt);
          if (drop.y <= drop.groundY + 0.02) {
            drop.y = drop.groundY;
            drop.landed = true;
            if (mesh) {
              const chute = mesh.getObjectByName('chute');
              if (chute) chute.visible = false;
            }
          }
          if (mesh) mesh.position.set(drop.x, drop.y, drop.z);
        }
        if (Math.random() < 0.35) {
          this.spawnParticles(drop.x, drop.y + 1.1, drop.z, 1, 0xd93824, 1.4, 0.85);
        }
      }
    }

    // 3. Safe Zone Progression & Zone Damage
    if (this.settings.mode === 'battle_royale') {
      const prevStatus = this.safeZone.phaseStatus;
      this.safeZone = stepSafeZone(this.safeZone, dt);
      if (prevStatus === 'waiting' && this.safeZone.phaseStatus === 'shrinking') {
        soundEngine.playZoneWarning();
      }
      this.zoneRingMesh.position.set(this.safeZone.currentX, 61, this.safeZone.currentZ);
      this.zoneRingMesh.scale.set(this.safeZone.currentRadius, 1, this.safeZone.currentRadius);

      if (isOutsideSafeZone(this.playerX, this.playerZ, this.safeZone)) {
        const res = applyCombatDamage(
          this.playerHealth,
          this.playerArmor,
          this.playerArmorTier,
          this.safeZone.dps * dt,
          true,
        );
        this.playerHealth = res.health;
        this.playerLastDamagerName = 'Collapse Zone';
        this.zoneWarningTimer -= dt;
        if (this.zoneWarningTimer <= 0) {
          this.zoneWarningTimer = 2.4;
          soundEngine.playZoneWarning();
          this.damageFlash = Math.max(this.damageFlash, 0.4);
        }
      }
    }

    // 4. AI Step
    const playerProxy: CombatantActor = {
      id: 'player',
      name: op.name,
      isPlayer: true,
      enemyClass: 'raider',
      rig: this.playerRig,
      x: this.playerX,
      y: this.playerY,
      z: this.playerZ,
      vy: this.playerVy,
      yaw: this.playerYaw + Math.PI,
      aimPitch: this.playerPitch,
      health: this.playerHealth,
      maxHealth: this.playerMaxHealth,
      armor: this.playerArmor,
      armorTier: this.playerArmorTier,
      backpackTier: this.playerBackpackTier,
      medkits: this.playerMedkits,
      bandages: this.playerBandages,
      weapons: this.playerWeapons,
      activeSlot: this.playerActiveSlot,
      alive: this.playerHealth > 0,
      deadTimer: 0,
      stridePhase: this.playerStride,
      recoil: this.playerRecoil,
      hitFlash: this.playerHitFlash,
      fireCooldown: 0,
      reloadTimer: 0,
      isGrounded: this.playerGrounded,
      isCrouching: this.playerCrouching,
      isSprinting: this.playerSprinting,
      isAiming: this.playerAiming,
      aiState: 'engage',
      aiTargetId: null,
      aiWaypointX: 0,
      aiWaypointZ: 0,
      aiThinkTimer: 0,
      aiStrafeDir: 1,
      aiTelegraphTimer: 0,
      telegraphBeam: null,
      lastDamagerId: null,
    };

    const allActors = [playerProxy, ...this.bots];
    for (let i = 0; i < this.bots.length; i++) {
      stepAIActor(
        this.bots[i],
        allActors,
        this.battlefield.colliders,
        this.battlefield.lootSpawns,
        this.safeZone,
        this.settings.difficulty,
        dt,
        this.elapsedTime,
        this.settings.mode === 'training',
        {
          onFireWeapon: (bot, tx, ty, tz) => this.fireBotWeapon(bot, tx, ty, tz),
          onEliminated: (victim, killer, cause) => this.handleElimination(victim, killer, cause),
        },
      );
    }

    // 5. Update Projectiles & Particles
    this.updateProjectiles(dt);
    this.updateParticlesAndBolts(dt);

    // 6. Age gunfire blips
    this.gunfireBlips = this.gunfireBlips
      .map((b) => ({ ...b, age: b.age + dt }))
      .filter((b) => b.age < 3.2);

    // 7. Update Third-Person Camera
    this.updateGameplayCamera(dt);
    this.sunLight.target.position.set(this.playerX, this.playerY, this.playerZ);

    // 8. Check Match Outcome
    const aliveBots = this.bots.filter((b) => b.alive).length;
    if (this.playerHealth <= 0) {
      this.finishMatch(false, this.playerLastDamagerName);
      return;
    }
    if (aliveBots === 0) {
      this.finishMatch(true, 'Survived');
      return;
    }

    this.hudAccumulator += dt;
    if (this.hudAccumulator >= 0.08) {
      this.hudAccumulator = 0;
      this.emitHudSnapshot();
    }
  }

  private updateGameplayCamera(dt: number): void {
    if (!this.battlefield) return;
    const isADS = this.playerAiming;
    const eyeH = this.playerCrouching ? 1.12 : 1.48;
    const shoulderOffset = isADS ? 0.46 : 0.62;
    const desiredDist = isADS ? 2.1 : 3.55;

    const cosY = Math.cos(this.playerYaw);
    const sinY = Math.sin(this.playerYaw);
    const cosP = Math.cos(this.playerPitch);
    const sinP = Math.sin(this.playerPitch);

    const anchorX = this.playerX + cosY * shoulderOffset;
    const anchorY = this.playerY + eyeH;
    const anchorZ = this.playerZ - sinY * shoulderOffset;

    const backX = sinY * cosP;
    const backY = -sinP;
    const backZ = cosY * cosP;

    let safeDist = desiredDist;
    _vecA.set(anchorX, anchorY, anchorZ);
    _vecB.set(backX, backY, backZ).normalize();
    this.camRaycaster.set(_vecA, _vecB);
    this.camRaycaster.far = desiredDist;
    const hits = this.camRaycaster.intersectObjects(this.battlefield.raycastTargets, false);
    if (hits.length > 0 && hits[0].distance < safeDist) {
      safeDist = Math.max(0.75, hits[0].distance - 0.25);
    }

    const desiredPosX = anchorX + backX * safeDist;
    const desiredPosZ = anchorZ + backZ * safeDist;
    const desiredPosY = Math.max(
      walkableHeightAt(desiredPosX, desiredPosZ) + 0.45,
      anchorY + backY * safeDist,
    );

    const k = 1 - Math.exp(-16 * dt);
    this.camCurrentPos.x = THREE.MathUtils.lerp(this.camCurrentPos.x, desiredPosX, k);
    this.camCurrentPos.y = THREE.MathUtils.lerp(this.camCurrentPos.y, desiredPosY, k);
    this.camCurrentPos.z = THREE.MathUtils.lerp(this.camCurrentPos.z, desiredPosZ, k);

    const lookForwardDist = 28;
    this.camCurrentLook.set(
      anchorX - sinY * cosP * lookForwardDist,
      anchorY + sinP * lookForwardDist,
      anchorZ - cosY * cosP * lookForwardDist,
    );

    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    if (this.cameraTrauma > 0.01) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.032;
      this.camera.rotation.z += (Math.random() - 0.5) * shake;
      this.camera.rotation.x += (Math.random() - 0.5) * shake;
    }

    const targetFov = isADS ? 44 : this.playerSprinting ? 67 : 60;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-10 * dt));
    this.camera.updateProjectionMatrix();
  }

  private tryFirePlayerWeapon(): void {
    const slot = this.playerWeapons[this.playerActiveSlot];
    if (!slot || this.playerFireCooldown > 0 || this.playerReloadTimer > 0) return;

    if (slot.ammoInMag <= 0) {
      this.startReload();
      return;
    }

    const spec = WEAPONS[slot.weaponId];
    slot.ammoInMag--;
    this.playerFireCooldown = spec.fireInterval;
    this.playerRecoil = 1.0;
    this.playerPitch = clamp(
      this.playerPitch + spec.recoilPitch * (this.playerAiming ? 0.55 : 1),
      -0.9,
      0.9,
    );
    this.cameraTrauma = Math.min(0.65, this.cameraTrauma + 0.16);
    this.playerShotsFired++;
    this.playerHealTimer = 0;
    this.playerHealKind = null;

    soundEngine.playGunshot(slot.weaponId, 0);
    this.gunfireBlips.push({ x: this.playerX, z: this.playerZ, kind: 'gunfire', age: 0 });

    _vecA.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const muzzleX = this.playerX + Math.cos(this.playerYaw) * 0.25 - Math.sin(this.playerYaw) * 0.5;
    const muzzleY = this.playerY + (this.playerCrouching ? 1.02 : 1.38);
    const muzzleZ = this.playerZ - Math.sin(this.playerYaw) * 0.25 - Math.cos(this.playerYaw) * 0.5;

    const targetPointX = this.camera.position.x + _vecA.x * 75;
    const targetPointY = this.camera.position.y + _vecA.y * 75;
    const targetPointZ = this.camera.position.z + _vecA.z * 75;

    _vecB.set(targetPointX - muzzleX, targetPointY - muzzleY, targetPointZ - muzzleZ).normalize();
    const spread = this.playerAiming ? spec.adsSpread : spec.hipSpread;

    for (let p = 0; p < spec.pellets; p++) {
      _vecC
        .set(
          _vecB.x + (Math.random() - 0.5) * spread * 2,
          _vecB.y + (Math.random() - 0.5) * spread * 2,
          _vecB.z + (Math.random() - 0.5) * spread * 2,
        )
        .normalize();
      this.spawnBolt(
        muzzleX,
        muzzleY,
        muzzleZ,
        _vecC.x * spec.muzzleSpeed,
        _vecC.y * spec.muzzleSpeed,
        _vecC.z * spec.muzzleSpeed,
        spec.range / spec.muzzleSpeed,
        spec.damage,
        'player',
        spec.color,
      );
    }
    this.spawnParticles(muzzleX, muzzleY, muzzleZ, 4, 0xfbbf24, 2.5, 0.14);
    this.muzzleLight.position.set(muzzleX, muzzleY, muzzleZ);
    this.muzzleLightTimer = 0.06;

    if (slot.ammoInMag === 0 && slot.reserveAmmo > 0) {
      this.startReload();
    }
    this.emitHudSnapshot();
  }

  private fireBotWeapon(bot: CombatantActor, tx: number, ty: number, tz: number): void {
    const slot = bot.weapons[bot.activeSlot];
    if (!slot || slot.ammoInMag <= 0) return;

    const spec = WEAPONS[slot.weaponId];
    const diffCfg = DIFFICULTY_CONFIG[this.settings.difficulty];
    slot.ammoInMag--;
    bot.recoil = 0.85;

    const distToPlayer = Math.hypot(bot.x - this.playerX, bot.z - this.playerZ);
    soundEngine.playGunshot(slot.weaponId, distToPlayer);
    this.gunfireBlips.push({ x: bot.x, z: bot.z, kind: 'gunfire', age: 0 });

    const mx = bot.x + Math.sin(bot.yaw) * 0.55;
    const my = bot.y + (bot.enemyClass === 'drone' ? 2.05 : bot.isCrouching ? 0.96 : 1.32);
    const mz = bot.z + Math.cos(bot.yaw) * 0.55;

    _vecB.set(tx - mx, ty - my, tz - mz).normalize();
    const botSpread = (1 - diffCfg.botAccuracy) * 0.11 + 0.018;

    for (let p = 0; p < spec.pellets; p++) {
      _vecC
        .set(
          _vecB.x + (Math.random() - 0.5) * botSpread * 2,
          _vecB.y + (Math.random() - 0.5) * botSpread * 1.4,
          _vecB.z + (Math.random() - 0.5) * botSpread * 2,
        )
        .normalize();
      this.spawnBolt(
        mx,
        my,
        mz,
        _vecC.x * spec.muzzleSpeed,
        _vecC.y * spec.muzzleSpeed,
        _vecC.z * spec.muzzleSpeed,
        spec.range / spec.muzzleSpeed,
        spec.damage * diffCfg.botDamageScale,
        bot.id,
        spec.color,
      );
    }
    this.spawnParticles(mx, my, mz, 3, 0xfbbf24, 2.0, 0.12);
  }

  private spawnBolt(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    damage: number,
    ownerId: string,
    color: number,
  ): void {
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.active) {
        b.active = true;
        b.x = x;
        b.y = y;
        b.z = z;
        b.vx = vx;
        b.vy = vy;
        b.vz = vz;
        b.life = 0;
        b.maxLife = maxLife;
        b.damage = damage;
        b.ownerId = ownerId;
        b.color = color;
        return;
      }
    }
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    hex: number,
    speed: number,
    life: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = (Math.random() - 0.5) * speed * 2;
        p.vy = Math.random() * speed * 1.3;
        p.vz = (Math.random() - 0.5) * speed * 2;
        p.life = 0;
        p.maxLife = life * (0.7 + Math.random() * 0.6);
        p.size = 0.65 + Math.random() * 0.7;
        p.color.setHex(hex);
        spawned++;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    if (!this.battlefield) return;

    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.active) continue;
      b.life += dt;
      if (b.life >= b.maxLife) {
        b.active = false;
        continue;
      }

      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      const nz = b.z + b.vz * dt;

      const gh = walkableHeightAt(nx, nz);
      if (ny <= gh) {
        this.spawnParticles(nx, gh + 0.05, nz, 4, 0x9c8c72, 3.0, 0.25);
        b.active = false;
        continue;
      }

      let hitWall = false;
      for (let c = 0; c < this.battlefield.colliders.length; c++) {
        const col = this.battlefield.colliders[c];
        if (!col.blocksSight) continue;
        if (segmentIntersectsAABB(b.x, b.y, b.z, nx, ny, nz, col) !== null) {
          this.spawnParticles(b.x, b.y, b.z, 5, 0xfbbf24, 3.5, 0.22);
          b.active = false;
          hitWall = true;
          break;
        }
      }
      if (hitWall) continue;

      if (b.ownerId !== 'player' && this.playerHealth > 0) {
        const pTop = this.playerY + (this.playerCrouching ? 1.2 : 1.72);
        if (
          ny >= this.playerY &&
          ny <= pTop &&
          this.segmentDistSq2D(b.x, b.z, nx, nz, this.playerX, this.playerZ) < 0.38
        ) {
          const res = applyCombatDamage(
            this.playerHealth,
            this.playerArmor,
            this.playerArmorTier,
            b.damage,
          );
          this.playerHealth = res.health;
          this.playerArmor = res.armor;
          if (res.armorBroken) this.playerArmorTier = 0;
          this.playerHitFlash = 1.0;
          this.damageFlash = 0.85;
          this.cameraTrauma = Math.min(0.85, this.cameraTrauma + 0.35);
          soundEngine.playPlayerHurt();
          const attacker = this.bots.find((bot) => bot.id === b.ownerId);
          if (attacker) this.playerLastDamagerName = attacker.name;
          this.spawnParticles(nx, ny, nz, 6, 0xd95d24, 3.2, 0.25);
          b.active = false;
          this.emitHudSnapshot();
          continue;
        }
      }

      for (let j = 0; j < this.bots.length; j++) {
        const bot = this.bots[j];
        if (!bot.alive || b.ownerId === bot.id) continue;
        const bBot = bot.enemyClass === 'drone' ? bot.y + 1.65 : bot.y;
        const bTop = bot.enemyClass === 'drone' ? bot.y + 2.75 : bot.y + (bot.isCrouching ? 1.25 : 1.85);
        if (
          ny >= bBot &&
          ny <= bTop &&
          this.segmentDistSq2D(b.x, b.z, nx, nz, bot.x, bot.z) < 0.45
        ) {
          const isHeadshot = bot.enemyClass !== 'drone' && ny >= bot.y + 1.45;
          const dmg = b.damage * (isHeadshot ? 1.45 : 1.0);
          const res = applyCombatDamage(bot.health, bot.armor, bot.armorTier, dmg);
          bot.health = res.health;
          bot.armor = res.armor;
          if (res.armorBroken) bot.armorTier = 0;
          bot.hitFlash = 1.0;
          bot.lastDamagerId = b.ownerId;

          if (b.ownerId === 'player') {
            this.playerDamageDealt += dmg;
            this.playerShotsHit++;
            const isKill = bot.health <= 0;
            this.hitmarkerKind = isKill ? 'kill' : 'hit';
            this.hitmarkerTimer = isKill ? 0.32 : 0.16;
            soundEngine.playHitmarker(isKill);
            if (isKill) {
              this.hitstopTimer = 0.04;
              this.cameraTrauma = Math.min(0.55, this.cameraTrauma + 0.15);
            }
          }

          this.spawnParticles(nx, ny, nz, isHeadshot ? 12 : 7, 0xd95d24, 3.8, 0.28);

          if (bot.health <= 0) {
            const killer =
              b.ownerId === 'player'
                ? null
                : this.bots.find((kBot) => kBot.id === b.ownerId) || null;
            if (b.ownerId === 'player') {
              this.playerKills++;
              if (
                bot.enemyClass === 'overlord' ||
                bot.enemyClass === 'reaper' ||
                bot.enemyClass === 'brute'
              ) {
                this.playerBossKills++;
              }
              const wSlot = this.playerWeapons[this.playerActiveSlot];
              this.pushKillFeed(
                OPERATIVES[this.settings.operative].name,
                bot.name,
                wSlot ? WEAPONS[wSlot.weaponId].shortName : 'Firearm',
                true,
              );
            } else if (killer) {
              const kw = killer.weapons[killer.activeSlot];
              this.pushKillFeed(
                killer.name,
                bot.name,
                kw ? WEAPONS[kw.weaponId].shortName : 'Firearm',
                false,
              );
            }
            bot.alive = false;
            this.dropBotLoot(bot);
          }

          b.active = false;
          break;
        }
      }

      if (b.active) {
        b.x = nx;
        b.y = ny;
        b.z = nz;
      }
    }
  }

  private handleElimination(victim: CombatantActor, killer: CombatantActor | null, cause: string): void {
    this.pushKillFeed(killer ? killer.name : cause, victim.name, cause, false);
    this.dropBotLoot(victim);
  }

  private dropBotLoot(bot: CombatantActor): void {
    if (!this.battlefield || this.settings.mode === 'training') return;
    const slot = bot.weapons[0];
    if (!slot) return;
    const loot: LootSpawn = {
      id: `drop_${bot.id}_${Math.random().toString(36).slice(2, 6)}`,
      kind: bot.enemyClass === 'overlord' ? 'armor' : Math.random() < 0.52 ? 'medkit' : 'weapon',
      weaponId: slot.weaponId,
      tier: bot.enemyClass === 'overlord' ? 3 : undefined,
      x: bot.x,
      y: walkableHeightAt(bot.x, bot.z),
      z: bot.z,
      amount: 1,
      collected: false,
    };
    this.battlefield.lootSpawns.push(loot);
    const mesh = createLootPickupMesh(loot.kind, loot.weaponId, loot.tier, this.textures);
    mesh.position.set(loot.x, loot.y, loot.z);
    this.scene.add(mesh);
    this.lootMeshes.set(loot.id, mesh);
  }

  private pushKillFeed(killer: string, victim: string, weapon: string, isPlayerInvolved: boolean): void {
    this.killFeed = [
      {
        id: this.nextKillId++,
        killer,
        victim,
        weapon,
        isPlayerInvolved,
        timestamp: this.matchTime,
      },
      ...this.killFeed.slice(0, 4),
    ];
  }

  private segmentDistSq2D(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    px: number,
    pz: number,
  ): number {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) return (px - ax) ** 2 + (pz - az) ** 2;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
    const cx = ax + t * dx;
    const cz = az + t * dz;
    return (px - cx) ** 2 + (pz - cz) ** 2;
  }

  private updateParticlesAndBolts(dt: number): void {
    let boltCount = 0;
    const tmpColor = new THREE.Color();
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.active) continue;
      _vecA.set(b.x, b.y, b.z);
      _vecB.set(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      _mat4.lookAt(_vecB, _vecA, _vecC.set(0, 1, 0));
      _quat.setFromRotationMatrix(_mat4);
      _scale.set(1, 1, 1);
      _mat4.compose(_vecA, _quat, _scale);
      this.boltInst.setMatrixAt(boltCount, _mat4);
      tmpColor.setHex(b.color);
      this.boltInst.setColorAt(boltCount, tmpColor);
      boltCount++;
    }
    this.boltInst.count = boltCount;
    this.boltInst.instanceMatrix.needsUpdate = true;
    if (this.boltInst.instanceColor) this.boltInst.instanceColor.needsUpdate = true;

    let pCount = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.vy -= 4.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const s = p.size * (1 - p.life / p.maxLife);
      _vecA.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.setScalar(Math.max(0.05, s));
      _mat4.compose(_vecA, _quat, _scale);
      this.particleInst.setMatrixAt(pCount, _mat4);
      this.particleInst.setColorAt(pCount, p.color);
      pCount++;
    }
    this.particleInst.count = pCount;
    this.particleInst.instanceMatrix.needsUpdate = true;
    if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
  }

  private finishMatch(victory: boolean, causeOfDeath: string): void {
    this.screenState = 'gameover';
    this.clearInputs();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    soundEngine.stopAmbience();
    soundEngine.playOutcomeSting(victory);

    const aliveBots = this.bots.filter((b) => b.alive).length;
    const stats = buildMatchStats({
      victory,
      aliveCount: aliveBots + 1,
      totalCombatants: this.totalCombatants,
      kills: this.playerKills,
      bossKills: this.playerBossKills,
      damageDealt: this.playerDamageDealt,
      shotsFired: this.playerShotsFired,
      shotsHit: this.playerShotsHit,
      survivalTime: this.matchTime,
      lootCollected: this.playerLootCollected,
      zonePhaseReached: this.safeZone.phaseIndex + 1,
      causeOfDeath,
      operativeName: OPERATIVES[this.settings.operative].name,
      mode: this.settings.mode,
      difficulty: this.settings.difficulty,
    });
    this.emitHudSnapshot();
    this.callbacks.onMatchEnd(stats);
  }

  public startReload(): void {
    const slot = this.playerWeapons[this.playerActiveSlot];
    if (!slot || this.playerReloadTimer > 0) return;
    const spec = WEAPONS[slot.weaponId];
    if (slot.ammoInMag >= spec.magSize || slot.reserveAmmo <= 0) return;
    this.playerReloadTimer = spec.reloadTime;
    soundEngine.playReload();
    this.emitHudSnapshot();
  }

  public switchWeaponSlot(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx > 2 || slotIdx === this.playerActiveSlot) return;
    const nextW = this.playerWeapons[slotIdx];
    if (!nextW) return;
    this.playerActiveSlot = slotIdx;
    this.playerReloadTimer = 0;
    if (this.playerRig) {
      const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
      equipWeaponVisual(
        this.playerRig,
        nextW.weaponId,
        castShadows,
        this.textures,
        this.settings.customization.weaponSkin,
      );
    }
    this.emitHudSnapshot();
  }

  public dropWeapon(slotIdx: number): void {
    if (slotIdx < 0 || slotIdx > 1 || !this.playerWeapons[slotIdx]) return;
    this.playerWeapons[slotIdx] = null;
    if (this.playerActiveSlot === slotIdx) {
      const fallback = this.playerWeapons[0] ? 0 : this.playerWeapons[1] ? 1 : 2;
      this.playerActiveSlot = fallback;
      const w = this.playerWeapons[fallback];
      if (this.playerRig) {
        const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
        equipWeaponVisual(
          this.playerRig,
          w ? w.weaponId : null,
          castShadows,
          this.textures,
          this.settings.customization.weaponSkin,
        );
      }
    }
    this.emitHudSnapshot();
  }

  public tryPickupNearbyLoot(): void {
    if (!this.battlefield) return;

    // First check landed Supply Drops within 3.8m
    for (const drop of this.supplyDrops) {
      if (!drop.landed || drop.opened) continue;
      if (Math.hypot(drop.x - this.playerX, drop.z - this.playerZ) < 3.8) {
        drop.opened = true;
        this.playerArmorTier = 3;
        this.playerArmor = 115;
        this.playerBackpackTier = 3;
        this.playerMedkits = Math.min(getBackpackMaxMedkits(3), this.playerMedkits + 2);
        if (!this.playerWeapons[0]) {
          this.playerWeapons[0] = createWeaponSlot('longshot_dmr');
          this.playerActiveSlot = 0;
        } else if (!this.playerWeapons[1]) {
          this.playerWeapons[1] = createWeaponSlot('mk47_carbine');
          this.playerActiveSlot = 1;
        }
        const mesh = this.supplyDropMeshes.get(drop.id);
        if (mesh) {
          this.scene.remove(mesh);
          this.supplyDropMeshes.delete(drop.id);
        }
        if (this.playerRig) {
          const w = this.playerWeapons[this.playerActiveSlot];
          const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
          equipWeaponVisual(
            this.playerRig,
            w ? w.weaponId : null,
            castShadows,
            this.textures,
            this.settings.customization.weaponSkin,
          );
        }
        this.playerLootCollected += 3;
        soundEngine.playPickup();
        this.emitHudSnapshot();
        return;
      }
    }

    let closest: LootSpawn | null = null;
    let bestD = 3.2;
    for (const loot of this.battlefield.lootSpawns) {
      if (loot.collected) continue;
      const d = Math.hypot(loot.x - this.playerX, loot.z - this.playerZ);
      if (d < bestD) {
        bestD = d;
        closest = loot;
      }
    }
    if (!closest) return;

    const invState = {
      weapons: this.playerWeapons,
      activeSlot: this.playerActiveSlot,
      armor: this.playerArmor,
      armorTier: this.playerArmorTier,
      backpackTier: this.playerBackpackTier,
      medkits: this.playerMedkits,
      bandages: this.playerBandages,
    };
    const res = applyLootPickup(closest, invState);
    if (res.picked) {
      closest.collected = true;
      this.playerArmor = invState.armor;
      this.playerArmorTier = invState.armorTier;
      this.playerBackpackTier = invState.backpackTier;
      this.playerMedkits = invState.medkits;
      this.playerBandages = invState.bandages;
      this.playerActiveSlot = res.nextActiveSlot;
      this.playerLootCollected++;
      const mesh = this.lootMeshes.get(closest.id);
      if (mesh) {
        this.scene.remove(mesh);
        this.lootMeshes.delete(closest.id);
      }
      if (this.playerRig) {
        const w = this.playerWeapons[this.playerActiveSlot];
        const castShadows = !this.isSoftwareGl && GRAPHICS_CONFIG[this.settings.graphics].shadows;
        equipWeaponVisual(
          this.playerRig,
          w ? w.weaponId : null,
          castShadows,
          this.textures,
          this.settings.customization.weaponSkin,
        );
      }
      soundEngine.playPickup();
      this.emitHudSnapshot();
    }
  }

  public startHeal(kind: 'medkit' | 'bandage'): void {
    if (this.playerHealTimer > 0 || this.playerHealth >= this.playerMaxHealth) return;
    if (kind === 'medkit' && this.playerMedkits > 0) {
      this.playerHealKind = 'medkit';
      this.playerHealDuration = 2.6;
      this.playerHealTimer = 2.6;
      soundEngine.playPickup();
    } else if (kind === 'bandage' && this.playerBandages > 0) {
      this.playerHealKind = 'bandage';
      this.playerHealDuration = 1.4;
      this.playerHealTimer = 1.4;
      soundEngine.playPickup();
    }
    this.emitHudSnapshot();
  }

  public triggerJump(): void {
    if (this.playerGrounded) {
      this.playerVy = 7.4;
      this.playerGrounded = false;
      this.playerCrouching = false;
      soundEngine.playFootstep(false);
    }
  }

  public toggleCrouch(): void {
    this.playerCrouching = !this.playerCrouching;
    this.emitHudSnapshot();
  }

  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = clamp(x, -1, 1);
    this.touchMoveY = clamp(y, -1, 1);
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    const sens = 0.0042 * this.settings.sensitivity;
    this.playerYaw -= dx * sens;
    this.playerPitch = clamp(this.playerPitch - dy * sens, -0.85, 0.78);
  }

  public setTouchFire(firing: boolean): void {
    const wasFiring = this.touchFire;
    this.touchFire = firing;
    if (firing && !wasFiring) {
      this.tryFirePlayerWeapon();
    }
  }

  public setTouchAim(aiming: boolean): void {
    this.touchAim = aiming;
  }

  public setTouchSprint(sprinting: boolean): void {
    this.touchSprint = sprinting;
  }

  public getMinimapBuildings() {
    return this.battlefield ? this.battlefield.minimapBuildings : [];
  }

  private getNearbyLootLabel(): string | null {
    if (!this.battlefield) return null;
    for (const drop of this.supplyDrops) {
      if (drop.landed && !drop.opened && Math.hypot(drop.x - this.playerX, drop.z - this.playerZ) < 3.8) {
        return 'Tactical Supply Drop Crate';
      }
    }
    let best: LootSpawn | null = null;
    let bestD = 3.2;
    for (const loot of this.battlefield.lootSpawns) {
      if (loot.collected) continue;
      const d = Math.hypot(loot.x - this.playerX, loot.z - this.playerZ);
      if (d < bestD) {
        bestD = d;
        best = loot;
      }
    }
    if (!best) return null;
    if (best.kind === 'weapon' && best.weaponId) return WEAPONS[best.weaponId].name;
    if (best.kind === 'armor') return `Armor Vest Lv.${best.tier ?? 1}`;
    if (best.kind === 'backpack') return `Tactical Pack Lv.${best.tier ?? 2}`;
    if (best.kind === 'medkit') return 'Field Medkit';
    if (best.kind === 'bandage') return 'Combat Bandage';
    return 'Munitions Pack';
  }

  private emitHudSnapshot(): void {
    const activeW = this.playerWeapons[this.playerActiveSlot];
    const spec = activeW ? WEAPONS[activeW.weaponId] : null;
    const aliveBots = this.bots.filter((b) => b.alive).length;

    this.callbacks.onHudUpdate({
      health: Math.round(this.playerHealth),
      maxHealth: this.playerMaxHealth,
      armor: Math.round(this.playerArmor),
      maxArmor: this.playerArmorTier === 3 ? 115 : this.playerArmorTier === 2 ? 80 : 50,
      armorTier: this.playerArmorTier,
      backpackTier: this.playerBackpackTier,
      medkits: this.playerMedkits,
      bandages: this.playerBandages,
      weapons: this.playerWeapons.map((w) => (w ? { ...w } : null)),
      activeSlot: this.playerActiveSlot,
      isReloading: this.playerReloadTimer > 0,
      reloadProgress:
        this.playerReloadTimer > 0 && spec ? 1 - this.playerReloadTimer / spec.reloadTime : 0,
      isAiming: this.playerAiming,
      isSprinting: this.playerSprinting,
      isCrouching: this.playerCrouching,
      stamina: Math.round(this.playerStamina),
      aliveCount: aliveBots + (this.playerHealth > 0 ? 1 : 0),
      totalCount: this.totalCombatants,
      kills: this.playerKills,
      damageDealt: Math.round(this.playerDamageDealt),
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerYaw: this.playerYaw,
      safeZone: { ...this.safeZone },
      outsideZone:
        this.settings.mode === 'battle_royale' &&
        isOutsideSafeZone(this.playerX, this.playerZ, this.safeZone),
      nearbyLootLabel: this.getNearbyLootLabel(),
      hitmarkerKind: this.hitmarkerKind,
      damageFlash: this.damageFlash,
      healProgress:
        this.playerHealTimer > 0 && this.playerHealDuration > 0
          ? 1 - this.playerHealTimer / this.playerHealDuration
          : 0,
      healingLabel:
        this.playerHealKind === 'medkit'
          ? 'Applying Medkit'
          : this.playerHealKind === 'bandage'
            ? 'Wrapping Bandage'
            : null,
      killFeed: this.killFeed,
      gunfireBlips: this.gunfireBlips,
      supplyDrops: this.supplyDrops.filter((d) => !d.opened).map((d) => ({ ...d })),
      spreadAngle: spec ? (this.playerAiming ? spec.adsSpread : spec.hipSpread) : 0.03,
      matchTime: this.matchTime,
      trainingTargetsRemaining: this.settings.mode === 'training' ? aliveBots : 0,
      locationName: getLocationNameAt(this.playerX, this.playerZ),
    });
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.screenState !== 'playing') return;
    soundEngine.unlock();
    this.keys.add(e.code);

    if (e.code === 'Space') {
      e.preventDefault();
      this.triggerJump();
    } else if (e.code === 'KeyC') {
      this.toggleCrouch();
    } else if (e.code === 'KeyR') {
      this.startReload();
    } else if (e.code === 'KeyE') {
      this.tryPickupNearbyLoot();
    } else if (e.code === 'KeyH') {
      this.startHeal('medkit');
    } else if (e.code === 'KeyG') {
      this.startHeal('bandage');
    } else if (e.code === 'KeyF') {
      this.tryFirePlayerWeapon();
    } else if (e.code === 'Digit1') {
      this.switchWeaponSlot(0);
    } else if (e.code === 'Digit2') {
      this.switchWeaponSlot(1);
    } else if (e.code === 'Digit3') {
      this.switchWeaponSlot(2);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.screenState !== 'playing') return;
    if (e.target !== this.renderer.domElement) return;
    soundEngine.unlock();

    if (e.button === 0) {
      this.mouseDown = true;
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.tryFirePlayerWeapon();
      if (document.pointerLockElement !== this.renderer.domElement && !this.isSoftwareGl) {
        this.renderer.domElement.requestPointerLock?.();
      }
    } else if (e.button === 2) {
      this.rightMouseDown = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.mouseDown = false;
      this.isDraggingLook = false;
    } else if (e.button === 2) {
      this.rightMouseDown = false;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.screenState !== 'playing') return;
    const sens = 0.0024 * this.settings.sensitivity;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.playerYaw -= e.movementX * sens;
      this.playerPitch = clamp(this.playerPitch - e.movementY * sens, -0.85, 0.78);
    } else if (this.isDraggingLook) {
      const dx = e.movementX || (this.lastPointerX ? e.clientX - this.lastPointerX : 0);
      const dy = e.movementY || (this.lastPointerY ? e.clientY - this.lastPointerY : 0);
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      if (Math.abs(dx) < 120 && Math.abs(dy) < 120) {
        this.playerYaw -= dx * sens;
        this.playerPitch = clamp(this.playerPitch - dy * sens, -0.85, 0.78);
      }
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.screenState === 'playing') e.preventDefault();
  };

  private clearInputs = () => {
    this.keys.clear();
    this.mouseDown = false;
    this.rightMouseDown = false;
    this.isDraggingLook = false;
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchFire = false;
    this.touchAim = false;
    this.touchSprint = false;
  };

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloomPass?.resolution.set(w, h);
  }

  private bindInputListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.clearInputs);
    document.addEventListener('visibilitychange', this.clearInputs);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.timeoutId);
    this.resizeObserver.disconnect();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.clearInputs);
    document.removeEventListener('visibilitychange', this.clearInputs);

    soundEngine.stopAmbience();
    soundEngine.stopLobbyPulse();
    if (this.battlefield) this.battlefield.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
