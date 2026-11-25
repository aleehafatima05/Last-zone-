import * as THREE from 'three';
import { GRAPHICS_CONFIG, TERRAIN_EXTENT, WORLD_RADIUS } from './constants';
import { createAbandonedSedan, createArmoredTruck } from './models';
import {
  getRiverCenterZ,
  groundHeightAt,
  isBridgeCrossing,
  RIVER_HALF_WIDTH,
  walkableHeightAt,
  WATER_LEVEL,
} from './rules';
import type { ProceduralTextureSet } from './textures';
import type { AABBCollider, GraphicsPreset, LootSpawn, WeaponId } from './types';

export interface SmokePuff {
  mesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
}

export interface BattlefieldBuildResult {
  group: THREE.Group;
  colliders: AABBCollider[];
  raycastTargets: THREE.Object3D[];
  lootSpawns: LootSpawn[];
  minimapBuildings: { x: number; z: number; w: number; d: number; color: string }[];
  spawnPoints: { x: number; z: number; yaw: number }[];
  trainingTargets: { x: number; z: number }[];
  radarDish: THREE.Object3D | null;
  waterMaterial: THREE.MeshStandardMaterial;
  windUniforms: { uTime: { value: number } };
  smokePuffs: SmokePuff[];
  dispose: () => void;
}

export function buildBattlefield(
  textures: ProceduralTextureSet,
  preset: GraphicsPreset,
  castShadows: boolean,
): BattlefieldBuildResult {
  const group = new THREE.Group();
  const colliders: AABBCollider[] = [];
  const raycastTargets: THREE.Object3D[] = [];
  const lootSpawns: LootSpawn[] = [];
  const minimapBuildings: { x: number; z: number; w: number; d: number; color: string }[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Shared Architectural Materials
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.concreteAlbedo,
      bumpMap: textures.concreteBump,
      bumpScale: 0.045,
      roughness: 0.85,
      metalness: 0.08,
    }),
  );
  const darkConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x45494d,
      map: textures.concreteAlbedo,
      roughness: 0.88,
      metalness: 0.1,
    }),
  );
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.corrugatedMetalAlbedo,
      bumpMap: textures.corrugatedMetalBump,
      bumpScale: 0.05,
      roughness: 0.54,
      metalness: 0.65,
    }),
  );
  const rustSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b4e2b,
      map: textures.corrugatedMetalAlbedo,
      roughness: 0.66,
      metalness: 0.5,
    }),
  );
  const oliveMetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4d5d42,
      map: textures.corrugatedMetalAlbedo,
      roughness: 0.62,
      metalness: 0.45,
    }),
  );
  const factoryBrickMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.brickFactoryAlbedo,
      roughness: 0.86,
      metalness: 0.06,
    }),
  );
  const hazardStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.hazardStripeAlbedo,
      roughness: 0.68,
      metalness: 0.15,
    }),
  );
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.timberAlbedo,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const stuccoMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.stuccoAlbedo,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  const sandbagMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8f8266, roughness: 0.92, metalness: 0.02 }),
  );
  const crateMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x4b5740, roughness: 0.72, metalness: 0.2 }),
  );
  const hazardMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd95d24, roughness: 0.45, metalness: 0.3 }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2a1a,
      emissive: 0xff2a1a,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    }),
  );

  // 1. Sculpted Terrain Mesh (with snow-capped outer mountains & sandy riverbanks)
  const segs = preset === 'performance' ? 96 : preset === 'balanced' ? 132 : 160;
  const terrainGeo = trackGeo(
    new THREE.PlaneGeometry(TERRAIN_EXTENT * 2, TERRAIN_EXTENT * 2, segs, segs),
  );
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = groundHeightAt(vx, vz);
    posAttr.setY(i, vy);

    const dist = Math.hypot(vx, vz);
    const riverDist = Math.abs(vz - getRiverCenterZ(vx));
    if (vy > 14.5) {
      // Snow-dusted alpine peaks
      const snowT = Math.min(1, (vy - 14.5) / 8);
      cTmp.setRGB(0.62 + snowT * 0.32, 0.64 + snowT * 0.32, 0.66 + snowT * 0.32);
    } else if (dist > WORLD_RADIUS - 4 || vy > 5.0) {
      // Rocky granite ridge
      cTmp.setRGB(0.55, 0.54, 0.51);
    } else if (riverDist < RIVER_HALF_WIDTH + 3.2) {
      // Damp river gravel / silt bank
      cTmp.setRGB(0.52, 0.48, 0.4);
    } else if (Math.abs(vx) < 7.5 || Math.abs(vz + 10) < 7.5) {
      // Dusty roadside ochre
      cTmp.setRGB(0.74, 0.68, 0.58);
    } else {
      const n = 0.86 + Math.sin(vx * 0.07) * Math.cos(vz * 0.07) * 0.14;
      cTmp.setRGB(0.74 * n, 0.8 * n, 0.67 * n);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainAlbedo,
      bumpMap: textures.terrainBump,
      bumpScale: 0.09,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uRockMap = { value: textures.rockAlbedo };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uRockMap;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 rockUv = vTerrainWorldPos.xz * 0.068 + vTerrainWorldPos.xy * 0.025;
        vec3 rockCol = texture2D(uRockMap, rockUv).rgb;
        float slopeRock = 1.0 - smoothstep(0.68, 0.87, vTerrainWorldNorm.y);
        float ridgeRock = smoothstep(5.5, 11.5, vTerrainWorldPos.y) * 0.72;
        float rockMix = clamp(max(slopeRock, ridgeRock), 0.0, 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockCol * 0.94, rockMix);
        float snowMask = smoothstep(13.8, 19.5, vTerrainWorldPos.y) * smoothstep(0.58, 0.85, vTerrainWorldNorm.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.93), clamp(snowMask, 0.0, 0.9));`,
      );
  };
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = castShadows;
  group.add(terrainMesh);
  raycastTargets.push(terrainMesh);

  // 2. Winding River Surface
  const riverGeo = trackGeo(new THREE.PlaneGeometry(WORLD_RADIUS * 2.2, RIVER_HALF_WIDTH * 2.5, 96, 6));
  riverGeo.rotateX(-Math.PI / 2);
  const rAttr = riverGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rAttr.count; i++) {
    const rx = rAttr.getX(i);
    const rzOff = rAttr.getZ(i);
    rAttr.setXYZ(i, rx, WATER_LEVEL, getRiverCenterZ(rx) + rzOff);
  }
  riverGeo.computeVertexNormals();
  const waterMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x264b56,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.18,
      metalness: 0.65,
      transparent: true,
      opacity: 0.88,
    }),
  );
  const riverMesh = new THREE.Mesh(riverGeo, waterMaterial);
  riverMesh.receiveShadow = castShadows;
  group.add(riverMesh);

  // 3. Roads (N-S, E-W, plus Village Spur) & Bridges over River
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.roadAlbedo,
      roughness: 0.86,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const buildRoadStrip = (
    length: number,
    width: number,
    isEastWest: boolean,
    centerOffset: number,
  ) => {
    const rSegs = 76;
    const geo = trackGeo(new THREE.PlaneGeometry(width, length, 4, rSegs));
    geo.rotateX(-Math.PI / 2);
    if (isEastWest) geo.rotateY(Math.PI / 2);
    const attr = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      const px = attr.getX(i) + (isEastWest ? 0 : centerOffset);
      const pz = attr.getZ(i) + (isEastWest ? centerOffset : 0);
      attr.setXYZ(i, px, walkableHeightAt(px, pz) + 0.045, pz);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.receiveShadow = castShadows;
    group.add(mesh);
  };

  buildRoadStrip(264, 7.6, false, 0); // N-S main highway
  buildRoadStrip(264, 7.6, true, -10); // E-W highway connecting Urban Ruins <-> Crossroads <-> Industrial
  buildRoadStrip(190, 5.8, false, -46); // West road connecting Urban Ruins <-> Bridge <-> Rural Village

  // Concrete & Steel Bridges at x=0 and x=-46
  const addBridge = (bx: number, width: number) => {
    const bz = getRiverCenterZ(bx);
    const deckLen = RIVER_HALF_WIDTH * 2 + 7;
    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width, 0.35, deckLen)), darkConcreteMat);
    deck.position.set(bx, 0.56, bz);
    deck.castShadow = castShadows;
    deck.receiveShadow = castShadows;
    group.add(deck);
    raycastTargets.push(deck);

    // Bridge side guardrails
    for (const sx of [-width * 0.48, width * 0.48]) {
      const rail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.9, deckLen)), steelMat);
      rail.position.set(bx + sx, 1.15, bz);
      rail.castShadow = castShadows;
      group.add(rail);
      colliders.push({
        id: `bridge_rail_${bx}_${sx}`,
        minX: bx + sx - 0.2,
        maxX: bx + sx + 0.2,
        minZ: bz - deckLen * 0.5,
        maxZ: bz + deckLen * 0.5,
        maxY: 1.7,
        blocksSight: false,
      });
    }
    minimapBuildings.push({ x: bx, z: bz, w: width, d: deckLen, color: '#525860' });
  };
  addBridge(0, 8.2);
  addBridge(-46, 6.4);

  // Helper to place solid collider box
  const addBox = (
    id: string,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    collide = true,
    blocksSight = true,
  ) => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy + h * 0.5, cz);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = castShadows;
    group.add(mesh);
    raycastTargets.push(mesh);
    if (collide) {
      colliders.push({
        id,
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
        minY: cy,
        maxY: cy + h,
        blocksSight,
      });
    }
    return mesh;
  };

  // Enterable Building Helper (supports optional pitched cottage roof)
  const addEnterableBuilding = (
    prefix: string,
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    wallMat: THREE.Material,
    roofMat: THREE.Material,
    mapColor: string,
    doorWidth = 2.6,
    pitchedRoof = false,
  ) => {
    const baseY = groundHeightAt(cx, cz);
    const t = 0.4;

    addBox(`${prefix}_floor`, cx, baseY - 0.1, cz, w, 0.2, d, darkConcreteMat, false, false);

    if (pitchedRoof) {
      const roofH = Math.min(w, d) * 0.34;
      const roofShape = new THREE.Shape();
      roofShape.moveTo(-w * 0.54, 0);
      roofShape.lineTo(0, roofH);
      roofShape.lineTo(w * 0.54, 0);
      roofShape.closePath();
      const roofGeo = trackGeo(
        new THREE.ExtrudeGeometry(roofShape, { depth: d * 1.06, bevelEnabled: false }),
      );
      roofGeo.translate(0, 0, -d * 0.53);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.set(cx, baseY + h, cz);
      roofMesh.castShadow = castShadows;
      roofMesh.receiveShadow = castShadows;
      group.add(roofMesh);
      raycastTargets.push(roofMesh);
    } else {
      addBox(`${prefix}_roof`, cx, baseY + h, cz, w + 0.5, 0.3, d + 0.5, roofMat, false, true);
    }

    addBox(`${prefix}_w`, cx - w * 0.5 + t * 0.5, baseY, cz, t, h, d, wallMat);
    addBox(`${prefix}_e`, cx + w * 0.5 - t * 0.5, baseY, cz, t, h, d, wallMat);

    const segW = (w - doorWidth) * 0.5;
    if (segW > 0.2) {
      addBox(`${prefix}_n1`, cx - w * 0.5 + segW * 0.5, baseY, cz - d * 0.5 + t * 0.5, segW, h, t, wallMat);
      addBox(`${prefix}_n2`, cx + w * 0.5 - segW * 0.5, baseY, cz - d * 0.5 + t * 0.5, segW, h, t, wallMat);
      addBox(`${prefix}_s1`, cx - w * 0.5 + segW * 0.5, baseY, cz + d * 0.5 - t * 0.5, segW, h, t, wallMat);
      addBox(`${prefix}_s2`, cx + w * 0.5 - segW * 0.5, baseY, cz + d * 0.5 - t * 0.5, segW, h, t, wallMat);
    }
    addBox(`${prefix}_nl`, cx, baseY + 2.45, cz - d * 0.5 + t * 0.5, doorWidth, h - 2.45, t, wallMat, false);
    addBox(`${prefix}_sl`, cx, baseY + 2.45, cz + d * 0.5 - t * 0.5, doorWidth, h - 2.45, t, wallMat, false);

    minimapBuildings.push({ x: cx, z: cz, w, d, color: mapColor });
  };

  // =====================================================
  // 1. MILITARY BASE (-16, -72)
  // =====================================================
  // Arched Quonset Hangar (-18, -74)
  const qx = -18;
  const qz = -74;
  const qy = groundHeightAt(qx, qz);
  addBox('hangar_floor', qx, qy - 0.1, qz, 13, 0.2, 16, darkConcreteMat, false, false);
  const archGeo = trackGeo(new THREE.CylinderGeometry(6.5, 6.5, 16, 18, 1, true, 0, Math.PI));
  archGeo.rotateZ(Math.PI / 2);
  archGeo.rotateY(Math.PI / 2);
  const archMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x566251,
      map: textures.corrugatedMetalAlbedo,
      roughness: 0.6,
      metalness: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  const hangarArch = new THREE.Mesh(archGeo, archMat);
  hangarArch.position.set(qx, qy, qz);
  hangarArch.castShadow = castShadows;
  hangarArch.receiveShadow = castShadows;
  group.add(hangarArch);
  raycastTargets.push(hangarArch);
  // Hangar side collision walls + interior structural steel rib arches & work lights
  addBox('hangar_w', qx - 6.2, qy, qz, 0.6, 4.2, 16, oliveMetalMat);
  addBox('hangar_e', qx + 6.2, qy, qz, 0.6, 4.2, 16, oliveMetalMat);
  const ribGeo = trackGeo(new THREE.TorusGeometry(6.15, 0.14, 6, 18, Math.PI));
  const amberWorkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    }),
  );
  for (const rz of [-5.2, 0, 5.2]) {
    const rib = new THREE.Mesh(ribGeo, steelMat);
    rib.position.set(qx, qy, qz + rz);
    group.add(rib);
    const bulb = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 0.12, 0.25)), amberWorkMat);
    bulb.position.set(qx, qy + 5.85, qz + rz);
    group.add(bulb);
  }
  minimapBuildings.push({ x: qx, z: qz, w: 13, d: 16, color: '#566251' });

  // Tall Military Watchtower (-3, -60) + Diagonal Cross-Bracing + Ladder + Parapet
  const wtX = -3;
  const wtZ = -60;
  const wtY = groundHeightAt(wtX, wtZ);
  for (const [lx, lz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4],
  ]) {
    addBox(`wt_leg_${lx}_${lz}`, wtX + lx, wtY, wtZ + lz, 0.35, 9.8, 0.35, steelMat, true, false);
  }
  // Diagonal cross-bracing struts on front & sides
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.12, 4.1, 0.12));
  for (const tierY of [2.1, 4.9]) {
    for (const sideZ of [-1.4, 1.4]) {
      for (const dir of [-1, 1]) {
        const strut = new THREE.Mesh(strutGeo, steelMat);
        strut.position.set(wtX, wtY + tierY, wtZ + sideZ);
        strut.rotation.z = dir * 0.72;
        strut.castShadow = castShadows;
        group.add(strut);
      }
    }
    for (const sideX of [-1.4, 1.4]) {
      for (const dir of [-1, 1]) {
        const strut = new THREE.Mesh(strutGeo, steelMat);
        strut.position.set(wtX + sideX, wtY + tierY, wtZ);
        strut.rotation.x = dir * 0.72;
        strut.castShadow = castShadows;
        group.add(strut);
      }
    }
  }
  // Access ladder on north face
  for (const rx of [-0.28, 0.28]) {
    addBox(`wt_lad_${rx}`, wtX + rx, wtY, wtZ - 1.58, 0.08, 6.7, 0.08, steelMat, false, false);
  }
  for (let rung = 0.6; rung <= 6.2; rung += 0.55) {
    addBox(`wt_rung_${rung.toFixed(1)}`, wtX, wtY + rung, wtZ - 1.58, 0.6, 0.06, 0.08, steelMat, false, false);
  }
  addBox('wt_deck', wtX, wtY + 6.5, wtZ, 4.1, 0.32, 4.1, darkConcreteMat, false, false);
  // Sandbag parapet & railings
  addBox('wt_rail1', wtX, wtY + 6.82, wtZ - 1.85, 4.0, 0.95, 0.28, sandbagMat, false, false);
  addBox('wt_rail2', wtX, wtY + 6.82, wtZ + 1.85, 4.0, 0.95, 0.28, sandbagMat, false, false);
  addBox('wt_rail3', wtX - 1.85, wtY + 6.82, wtZ, 0.28, 0.95, 3.6, sandbagMat, false, false);
  addBox('wt_rail4', wtX + 1.85, wtY + 6.82, wtZ, 0.28, 0.95, 3.6, sandbagMat, false, false);
  addBox('wt_roof', wtX, wtY + 9.8, wtZ, 4.6, 0.28, 4.6, oliveMetalMat, false, false);

  // Rotating Radar Dish Assembly on Watchtower/Base
  const radarPivot = new THREE.Group();
  radarPivot.position.set(-34, groundHeightAt(-34, -68) + 4.4, -68);
  addBox('radar_base', -34, groundHeightAt(-34, -68), -68, 3.2, 4.2, 3.2, concreteMat);
  const dish = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(2.1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.38)),
    steelMat,
  );
  dish.rotation.x = Math.PI * 0.36;
  dish.position.y = 0.6;
  const feed = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 1.6, 8)), hazardMat);
  feed.rotation.x = -Math.PI * 0.15;
  feed.position.set(0, 1.2, 0.7);
  radarPivot.add(dish, feed);
  group.add(radarPivot);

  // Helipad (-34, -84)
  const padY = groundHeightAt(-34, -84);
  addBox('helipad', -34, padY - 0.05, -84, 10, 0.14, 10, darkConcreteMat, false, false);
  addBox('helipad_h1', -35.4, padY + 0.06, -84, 0.65, 0.04, 4.8, hazardMat, false, false);
  addBox('helipad_h2', -32.6, padY + 0.06, -84, 0.65, 0.04, 4.8, hazardMat, false, false);
  addBox('helipad_h3', -34, padY + 0.06, -84, 2.8, 0.04, 0.65, hazardMat, false, false);

  const truck1 = createArmoredTruck(textures, castShadows);
  truck1.position.set(-10, groundHeightAt(-10, -56), -56);
  truck1.rotation.y = 0.45;
  group.add(truck1);
  colliders.push({ id: 'truck1', minX: -12.5, maxX: -7.5, minZ: -58.5, maxZ: -53.5, maxY: 2.5 });

  // =====================================================
  // 2. URBAN RUINS (-64, -12)
  // =====================================================
  // Multi-story ruined concrete building 1
  addEnterableBuilding('ruin_1', -64, -22, 11, 9, 4.2, concreteMat, darkConcreteMat, '#6b7280', 3.0);
  // Broken second story corner walls for vertical skyline silhouette
  const r1Y = groundHeightAt(-64, -22) + 4.5;
  addBox('ruin_1_up1', -68.5, r1Y, -22, 1.6, 3.2, 8.6, concreteMat, false, true);
  addBox('ruin_1_up2', -64, r1Y, -26, 10.6, 2.6, 0.5, darkConcreteMat, false, true);

  // Multi-story ruined building 2
  addEnterableBuilding('ruin_2', -72, 2, 10, 8, 3.8, concreteMat, darkConcreteMat, '#6b7280', 2.8);
  addBox('ruin_2_up', -72, groundHeightAt(-72, 2) + 4.0, 5.5, 9.6, 2.8, 0.5, concreteMat, false, true);

  // Wrecked cars & street barricade in Urban Ruins
  const sedanU = createAbandonedSedan(castShadows, 0x5c4738);
  sedanU.position.set(-53, groundHeightAt(-53, -10), -10);
  sedanU.rotation.y = 1.15;
  group.add(sedanU);
  colliders.push({ id: 'sedan_u', minX: -55, maxX: -51, minZ: -12, maxZ: -8, maxY: 1.7 });

  // =====================================================
  // 3. INDUSTRIAL ZONE / FACTORY & POWER PLANT (64, -24)
  // =====================================================
  addEnterableBuilding(
    'factory_main',
    62,
    -24,
    15,
    12,
    5.8,
    factoryBrickMat,
    rustSteelMat,
    '#7c6855',
    4.2,
    true,
  );
  // Recessed amber-lit industrial windows + roof vents on Factory
  const fBaseY = groundHeightAt(62, -24);
  for (const wx of [-4.6, 4.6]) {
    for (const sideZ of [-6.05, 6.05]) {
      const win = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 1.4, 0.14)), amberWorkMat);
      win.position.set(62 + wx, fBaseY + 3.4, -24 + sideZ);
      group.add(win);
    }
  }
  addBox('factory_vent1', 59, fBaseY + 8.3, -24, 1.4, 1.1, 1.4, steelMat, false, false);
  addBox('factory_vent2', 65, fBaseY + 8.3, -24, 1.4, 1.1, 1.4, steelMat, false, false);

  // Twin Striped Smokestacks + Animated Rising Smoke Puff Spheres
  const smokePuffs: SmokePuff[] = [];
  const smokeGeo = trackGeo(new THREE.SphereGeometry(1.1, 9, 7));
  const smokeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3f45,
      transparent: true,
      opacity: 0.32,
      roughness: 0.95,
      depthWrite: false,
    }),
  );
  for (const [sx, sz] of [
    [73, -34],
    [78, -28],
  ]) {
    const sy = groundHeightAt(sx, sz);
    const stack = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(1.15, 1.65, 16.5, 14)),
      hazardStripeMat,
    );
    stack.position.set(sx, sy + 8.25, sz);
    stack.castShadow = castShadows;
    stack.receiveShadow = castShadows;
    group.add(stack);
    raycastTargets.push(stack);
    colliders.push({
      id: `stack_${sx}`,
      minX: sx - 1.6,
      maxX: sx + 1.6,
      minZ: sz - 1.6,
      maxZ: sz + 1.6,
      maxY: sy + 16,
    });

    for (let p = 0; p < 7; p++) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      const phase = p / 7;
      puff.position.set(sx, sy + 16.8 + phase * 12, sz);
      group.add(puff);
      smokePuffs.push({
        mesh: puff,
        baseX: sx,
        baseY: sy + 16.8,
        baseZ: sz,
        phase,
        speed: 0.16 + (p % 3) * 0.025,
      });
    }
  }

  // Shipping containers & Silos
  const addContainer = (id: string, cx: number, cz: number, rot90: boolean, mat: THREE.Material) => {
    const y = groundHeightAt(cx, cz);
    const w = rot90 ? 2.5 : 6.2;
    const d = rot90 ? 6.2 : 2.5;
    addBox(id, cx, y, cz, w, 2.65, d, mat, true, true);
    minimapBuildings.push({ x: cx, z: cz, w, d, color: '#9a5833' });
  };
  addContainer('cont_1', 46, -30, false, rustSteelMat);
  addContainer('cont_2', 44, -14, true, oliveMetalMat);
  addContainer('cont_3', 74, -12, true, steelMat);

  for (const [sx, sz] of [
    [54, -40],
    [60, -40],
  ]) {
    const sy = groundHeightAt(sx, sz);
    const silo = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.2, 2.2, 6.8, 16)), steelMat);
    silo.position.set(sx, sy + 3.4, sz);
    silo.castShadow = castShadows;
    silo.receiveShadow = castShadows;
    group.add(silo);
    raycastTargets.push(silo);
    colliders.push({
      id: `silo_${sx}`,
      minX: sx - 2.2,
      maxX: sx + 2.2,
      minZ: sz - 2.2,
      maxZ: sz + 2.2,
      maxY: sy + 6.8,
    });
  }

  // =====================================================
  // 4. RURAL VILLAGE (-42, 62)
  // =====================================================
  addEnterableBuilding('cottage_1', -52, 56, 7.6, 6.4, 3.0, stuccoMat, rustSteelMat, '#8c7258', 2.4, true);
  addEnterableBuilding('cottage_2', -34, 58, 7.2, 6.0, 3.0, timberMat, darkConcreteMat, '#7a6148', 2.4, true);
  addEnterableBuilding('cottage_3', -44, 72, 7.4, 6.2, 3.0, stuccoMat, oliveMetalMat, '#8c7258', 2.4, true);

  // Elevated Village Water Tower (-26, 70)
  const wtx = -26;
  const wtz = 70;
  const wty = groundHeightAt(wtx, wtz);
  for (const [lx, lz] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [1.2, 1.2],
  ]) {
    addBox(`wtower_leg_${lx}_${lz}`, wtx + lx, wty, wtz + lz, 0.28, 7.5, 0.28, steelMat, true, false);
  }
  const tank = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(2.1, 2.1, 3.2, 14)), rustSteelMat);
  tank.position.set(wtx, wty + 9.0, wtz);
  tank.castShadow = castShadows;
  const tankCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.3, 1.5, 14)), darkConcreteMat);
  tankCap.position.set(wtx, wty + 11.35, wtz);
  group.add(tank, tankCap);
  minimapBuildings.push({ x: wtx, z: wtz, w: 4, d: 4, color: '#9a5833' });

  // =====================================================
  // 5. MOUNTAIN OUTPOST & RADIO TOWER (68, 66)
  // =====================================================
  addEnterableBuilding('outpost_bunker', 68, 66, 9.2, 7.4, 3.3, concreteMat, darkConcreteMat, '#6b7280');
  const rtx = 76;
  const rtz = 56;
  const rty = groundHeightAt(rtx, rtz);
  const mast = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.18, 0.72, 17.5, 8)),
    hazardStripeMat,
  );
  mast.position.set(rtx, rty + 8.75, rtz);
  mast.castShadow = castShadows;
  const beacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.32, 10, 8)), beaconMat);
  beacon.position.set(rtx, rty + 17.7, rtz);
  group.add(mast, beacon);
  colliders.push({ id: 'radio_tower', minX: rtx - 0.8, maxX: rtx + 0.8, minZ: rtz - 0.8, maxZ: rtz + 0.8, maxY: rty + 16 });
  minimapBuildings.push({ x: rtx, z: rtz, w: 3, d: 3, color: '#d93824' });

  // =====================================================
  // 6. CENTRAL CROSSROADS (0, -8) & PROPS
  // =====================================================
  addBox('xr_barrier1', -5.5, groundHeightAt(-5.5, -2), -2, 0.8, 1.15, 3.6, concreteMat);
  addBox('xr_barrier2', 5.5, groundHeightAt(5.5, -14), -14, 3.4, 1.15, 0.8, sandbagMat);
  const sedan2 = createAbandonedSedan(castShadows, 0x454f59);
  sedan2.position.set(2.8, groundHeightAt(2.8, 4), 4);
  sedan2.rotation.y = 0.28;
  group.add(sedan2);
  colliders.push({ id: 'sedan2', minX: 1.2, maxX: 4.4, minZ: 2, maxZ: 6, maxY: 1.7 });

  const truck2 = createArmoredTruck(textures, castShadows);
  truck2.position.set(-7, groundHeightAt(-7, -14), -14);
  truck2.rotation.y = 1.45;
  group.add(truck2);
  colliders.push({ id: 'truck2', minX: -9.5, maxX: -4.5, minZ: -16, maxZ: -12, maxY: 2.5 });

  // =====================================================
  // NATURAL VEGETATION & ROCKS (Forest Hills + Sector-wide InstancedMesh)
  // =====================================================
  const gCfg = GRAPHICS_CONFIG[preset];
  let seed = 42197;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const isClearOfStructures = (x: number, z: number, minPad = 5.5) => {
    if (Math.abs(x) < 6.5 || Math.abs(z + 10) < 6.5) return false;
    if (Math.abs(z - getRiverCenterZ(x)) < RIVER_HALF_WIDTH + 3.2) return false;
    if (isBridgeCrossing(x, z)) return false;
    for (const b of minimapBuildings) {
      if (Math.abs(x - b.x) < b.w * 0.5 + minPad && Math.abs(z - b.z) < b.d * 0.5 + minPad) {
        return false;
      }
    }
    return true;
  };

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.3, 3.2, 8));
  trunkGeo.translate(0, 1.6, 0);
  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5d4432,
      map: textures.timberAlbedo,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );

  // 4-Tier Layered Jagged Conifer Canopy
  const makeJaggedConeGeo = (r: number, h: number, yOff: number, segsCount = 12) => {
    const g = trackGeo(new THREE.ConeGeometry(r, h, segsCount, 1));
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const py = p.getY(i);
      if (py < 0) {
        const px = p.getX(i);
        const pz = p.getZ(i);
        const ang = Math.atan2(pz, px);
        const jag = 0.8 + 0.26 * Math.sin(ang * 5.0 + yOff);
        p.setXYZ(i, px * jag, py - (jag - 0.85) * 0.4, pz * jag);
      }
    }
    g.translate(0, yOff, 0);
    g.computeVertexNormals();
    return g;
  };

  const coneTierGeos = [
    makeJaggedConeGeo(2.05, 2.2, 2.65, 12),
    makeJaggedConeGeo(1.65, 2.0, 3.9, 12),
    makeJaggedConeGeo(1.22, 1.85, 5.05, 10),
    makeJaggedConeGeo(0.75, 1.55, 6.1, 8),
  ];
  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x35492e, roughness: 0.85, metalness: 0.02 }),
  );

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, gCfg.treeCount);
  const coneInsts = coneTierGeos.map(
    (geo) => new THREE.InstancedMesh(geo, foliageMat, gCfg.treeCount),
  );
  trunkInst.castShadow = castShadows;
  coneInsts.forEach((ci, idx) => {
    ci.castShadow = castShadows;
    ci.receiveShadow = castShadows || idx === 0;
  });

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placedTrees = 0;
  let attempts = 0;
  while (placedTrees < gCfg.treeCount && attempts < gCfg.treeCount * 10) {
    attempts++;
    // Bias 32% of trees into Forest Hills (18, 10) for lush forest cover
    let tx: number;
    let tz: number;
    if (placedTrees < gCfg.treeCount * 0.32) {
      const a = rand() * Math.PI * 2;
      const r = 4 + rand() * 34;
      tx = 18 + Math.cos(a) * r;
      tz = 10 + Math.sin(a) * r;
    } else {
      const angle = rand() * Math.PI * 2;
      const rad = 16 + rand() * (WORLD_RADIUS + 20);
      tx = Math.cos(angle) * rad;
      tz = Math.sin(angle) * rad;
    }
    if (!isClearOfStructures(tx, tz, 6.0)) continue;
    const ty = groundHeightAt(tx, tz);
    if (ty > 14 || ty < 0.05) continue;
    const scale = 0.84 + rand() * 0.48;
    dummy.position.set(tx, ty - 0.1, tz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    trunkInst.setMatrixAt(placedTrees, dummy.matrix);
    coneInsts.forEach((ci) => ci.setMatrixAt(placedTrees, dummy.matrix));

    const gShade = 0.84 + rand() * 0.36;
    tint.setRGB(gShade * 0.9, gShade, gShade * 0.86);
    coneInsts.forEach((ci) => ci.setColorAt(placedTrees, tint));

    if (Math.hypot(tx, tz) < WORLD_RADIUS - 2) {
      colliders.push({
        id: `tree_${placedTrees}`,
        minX: tx - 0.45 * scale,
        maxX: tx + 0.45 * scale,
        minZ: tz - 0.45 * scale,
        maxZ: tz + 0.45 * scale,
        maxY: ty + 5 * scale,
        blocksSight: false,
      });
    }
    placedTrees++;
  }
  trunkInst.count = placedTrees;
  trunkInst.instanceMatrix.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  coneInsts.forEach((ci) => {
    ci.count = placedTrees;
    ci.instanceMatrix.needsUpdate = true;
    if (ci.instanceColor) ci.instanceColor.needsUpdate = true;
    ci.computeBoundingSphere();
  });
  group.add(trunkInst, ...coneInsts);

  // Wind-Swaying Instanced Grass Tufts (alpha-cutout multi-blade silhouettes)
  const windUniforms = { uTime: { value: 0 } };
  const grassCount = preset === 'performance' ? 550 : preset === 'balanced' ? 1100 : 1650;
  const bladeA = new THREE.PlaneGeometry(0.62, 0.42);
  bladeA.translate(0, 0.21, 0);
  const bladeB = bladeA.clone();
  bladeB.rotateY(Math.PI * 0.5);
  // Merge bladeA + bladeB manually into one lightweight tuft BufferGeometry
  const posA = bladeA.attributes.position.array as Float32Array;
  const posB = bladeB.attributes.position.array as Float32Array;
  const normA = bladeA.attributes.normal.array as Float32Array;
  const normB = bladeB.attributes.normal.array as Float32Array;
  const uvA = bladeA.attributes.uv.array as Float32Array;
  const uvB = bladeB.attributes.uv.array as Float32Array;
  const idxA = Array.from(bladeA.index!.array);
  const idxB = Array.from(bladeB.index!.array).map((v) => v + 4);
  const grassGeo = trackGeo(new THREE.BufferGeometry());
  grassGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...posA, ...posB], 3),
  );
  grassGeo.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([...normA, ...normB], 3),
  );
  grassGeo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([...uvA, ...uvB], 2),
  );
  grassGeo.setIndex([...idxA, ...idxB]);
  bladeA.dispose();
  bladeB.dispose();

  const grassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd4dec2,
      map: textures.grassTuftMap,
      alphaTest: 0.42,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),
  );
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float tipWeight = smoothstep(0.05, 0.56, position.y);
        vec3 instOrigin = vec3(0.0);
        #ifdef USE_INSTANCING
          instOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float gust = sin(uTime * 2.1 + instOrigin.x * 0.19 + instOrigin.z * 0.14) * 0.12
                   + cos(uTime * 3.5 + instOrigin.x * 0.34) * 0.045;
        transformed.x += gust * tipWeight;
        transformed.z += gust * 0.55 * tipWeight;`,
      );
  };

  const grassInst = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grassInst.receiveShadow = castShadows;
  let placedGrass = 0;
  attempts = 0;
  while (placedGrass < grassCount && attempts < grassCount * 6) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const rad = 5 + rand() * (WORLD_RADIUS - 8);
    const gx = Math.cos(angle) * rad;
    const gz = Math.sin(angle) * rad;
    if (!isClearOfStructures(gx, gz, 2.2)) continue;
    const gy = groundHeightAt(gx, gz);
    if (gy < 0.12 || gy > 8.5) continue;
    const s = 0.72 + rand() * 0.65;
    dummy.position.set(gx, gy - 0.04, gz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(s, s * (0.85 + rand() * 0.45), s);
    dummy.updateMatrix();
    grassInst.setMatrixAt(placedGrass, dummy.matrix);
    const gs = 0.8 + rand() * 0.42;
    tint.setRGB(gs * 0.94, gs, gs * 0.82);
    grassInst.setColorAt(placedGrass, tint);
    placedGrass++;
  }
  grassInst.count = placedGrass;
  grassInst.instanceMatrix.needsUpdate = true;
  if (grassInst.instanceColor) grassInst.instanceColor.needsUpdate = true;
  grassInst.computeBoundingSphere();
  group.add(grassInst);

  // Fractured Granite Rocks & Boulders
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.15, 1));
  const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const crag = 0.84 + 0.24 * Math.sin(vx * 3.1 + vy * 2.7 + vz * 2.2);
    rPos.setXYZ(i, vx * crag, vy * crag, vz * crag);
  }
  rockGeo.computeVertexNormals();
  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.rockAlbedo,
      roughness: 0.9,
      metalness: 0.08,
    }),
  );
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, gCfg.rockCount);
  rockInst.castShadow = castShadows;
  rockInst.receiveShadow = castShadows;

  let placedRocks = 0;
  attempts = 0;
  while (placedRocks < gCfg.rockCount && attempts < gCfg.rockCount * 10) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const rad = 14 + rand() * (WORLD_RADIUS + 12);
    const rx = Math.cos(angle) * rad;
    const rz = Math.sin(angle) * rad;
    if (!isClearOfStructures(rx, rz, 4.5)) continue;
    const ry = groundHeightAt(rx, rz);
    const sx = 0.8 + rand() * 1.4;
    const sy = 0.6 + rand() * 0.9;
    const sz = 0.8 + rand() * 1.3;
    dummy.position.set(rx, ry + sy * 0.35, rz);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(placedRocks, dummy.matrix);

    const shade = 0.78 + rand() * 0.36;
    tint.setRGB(shade, shade * 0.98, shade * 0.95);
    rockInst.setColorAt(placedRocks, tint);

    if (rad < WORLD_RADIUS - 2) {
      const rRad = Math.max(sx, sz) * 0.85;
      colliders.push({
        id: `rock_${placedRocks}`,
        minX: rx - rRad,
        maxX: rx + rRad,
        minZ: rz - rRad,
        maxZ: rz + rRad,
        maxY: ry + sy * 1.2,
        blocksSight: sy > 0.95,
      });
    }
    placedRocks++;
  }
  rockInst.count = placedRocks;
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // =====================================================
  // DETERMINISTIC LOOT ACROSS ALL 6 DISTRICTS
  // =====================================================
  const weaponPool: WeaponId[] = [
    'mk47_carbine',
    'vortex_smg',
    'longshot_dmr',
    'breacher_shotgun',
  ];
  const pushLoot = (
    id: string,
    kind: LootSpawn['kind'],
    x: number,
    z: number,
    weaponId?: WeaponId,
    tier?: 1 | 2 | 3,
    amount = 1,
  ) => {
    lootSpawns.push({
      id,
      kind,
      x,
      y: walkableHeightAt(x, z),
      z,
      weaponId,
      tier,
      amount,
      collected: false,
    });
  };

  // Near player spawn (-10, 6) so immediate looting works smoothly
  pushLoot('loot_spawn_1', 'weapon', -8, 0, 'mk47_carbine');
  pushLoot('loot_spawn_2', 'armor', -12, 2, undefined, 1);
  pushLoot('loot_spawn_3', 'medkit', -6, -3, undefined, undefined, 1);

  // Military Base
  pushLoot('loot_mb_1', 'weapon', -18, -74, 'mk47_carbine');
  pushLoot('loot_mb_2', 'armor', -16, -70, undefined, 3);
  pushLoot('loot_mb_3', 'backpack', -20, -72, undefined, 3);
  pushLoot('loot_mb_4', 'weapon', -3, -58, 'longshot_dmr');
  pushLoot('loot_mb_5', 'ammo', -34, -82, undefined, undefined, 1);

  // Urban Ruins
  pushLoot('loot_ur_1', 'weapon', -64, -22, 'vortex_smg');
  pushLoot('loot_ur_2', 'armor', -62, -20, undefined, 2);
  pushLoot('loot_ur_3', 'weapon', -72, 2, 'breacher_shotgun');
  pushLoot('loot_ur_4', 'medkit', -70, 0, undefined, undefined, 1);

  // Industrial Zone
  pushLoot('loot_ind_1', 'weapon', 62, -24, 'mk47_carbine');
  pushLoot('loot_ind_2', 'backpack', 64, -22, undefined, 2);
  pushLoot('loot_ind_3', 'armor', 60, -26, undefined, 2);
  pushLoot('loot_ind_4', 'weapon', 48, -28, 'breacher_shotgun');
  pushLoot('loot_ind_5', 'ammo', 57, -36, undefined, undefined, 1);

  // Rural Village
  pushLoot('loot_vil_1', 'weapon', -52, 56, 'vortex_smg');
  pushLoot('loot_vil_2', 'bandage', -34, 58, undefined, undefined, 2);
  pushLoot('loot_vil_3', 'medkit', -44, 72, undefined, undefined, 1);
  pushLoot('loot_vil_4', 'armor', -26, 68, undefined, 2);

  // Mountain Outpost & Forest Hills
  pushLoot('loot_mo_1', 'weapon', 68, 66, 'longshot_dmr');
  pushLoot('loot_mo_2', 'armor', 70, 64, undefined, 3);
  pushLoot('loot_mo_3', 'medkit', 66, 68, undefined, undefined, 1);
  pushLoot('loot_fh_1', 'weapon', 18, 12, 'mk47_carbine');
  pushLoot('loot_fh_2', 'bandage', 16, 14, undefined, undefined, 2);

  // Perimeter supply caches
  const cacheCoords: [number, number][] = [
    [-78, -56],
    [16, -78],
    [82, -58],
    [88, 14],
    [-82, 34],
    [-12, 86],
    [32, 74],
    [14, -32],
  ];
  cacheCoords.forEach(([cx, cz], idx) => {
    pushLoot(`loot_cache_w_${idx}`, 'weapon', cx, cz, weaponPool[idx % weaponPool.length]);
    pushLoot(
      `loot_cache_s_${idx}`,
      idx % 3 === 0 ? 'armor' : idx % 3 === 1 ? 'medkit' : 'ammo',
      cx + 1.8,
      cz - 1.2,
      undefined,
      idx % 2 === 0 ? 2 : 1,
      1,
    );
  });

  // Combatant Spawn Ring (well outside river & colliders)
  const spawnPoints: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + 0.3;
    const rad = 52 + (i % 3) * 20;
    let sx = Math.cos(angle) * rad;
    let sz = Math.sin(angle) * rad;
    if (Math.abs(sz - getRiverCenterZ(sx)) < RIVER_HALF_WIDTH + 4) {
      sz += 14;
    }
    spawnPoints.push({ x: sx, z: sz, yaw: Math.atan2(-sx, -sz) });
  }

  const trainingTargets = [
    { x: -12, z: -8 },
    { x: -18, z: -18 },
    { x: -24, z: -10 },
    { x: 10, z: -14 },
    { x: 16, z: 2 },
    { x: -4, z: -20 },
  ];

  return {
    group,
    colliders,
    raycastTargets,
    lootSpawns,
    minimapBuildings,
    spawnPoints,
    trainingTargets,
    radarDish: radarPivot,
    waterMaterial,
    windUniforms,
    smokePuffs,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
