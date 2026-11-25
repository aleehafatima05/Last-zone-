import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Minimal Node FileReader polyfill for GLTFExporter binary (.glb) export
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
        this.onloadend?.();
      });
    }
  };
}

const OUT_DIR = path.resolve(process.cwd(), 'public/assets/models');
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Generates a continuous multi-ring lofted mesh with smooth dual-bone skinning weights.
 * rings: Array of { pos: [x,y,z], rx, rz, axis?: 'y'|'x', boneA, boneB, weightA }
 */
function createSkinnedLoft(rings, radialSegs = 16) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const v = r / Math.max(1, rings.length - 1);
    const [cx, cy, cz] = ring.pos;
    const rx = ring.rx;
    const rz = ring.rz;
    const axis = ring.axis ?? 'y';
    const bA = ring.boneA;
    const bB = ring.boneB ?? bA;
    const wA = ring.weightA ?? 1.0;
    const wB = 1.0 - wA;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      let px = cx;
      let py = cy;
      let pz = cz;
      let nx = cos;
      let ny = 0;
      let nz = sin;

      if (axis === 'y') {
        px += cos * rx;
        pz += sin * rz;
      } else {
        // Limb extending vertically from shoulder/hip, ring lies in X-Z plane with slight Z bow
        px += cos * rx;
        pz += sin * rz;
      }

      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      uvs.push(u, v * 2);
      skinIndices.push(bA, bB, 0, 0);
      skinWeights.push(wA, wB, 0, 0);
    }
  }

  const stride = radialSegs + 1;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRoundedPlate(w, h, depth, radius = 0.025, bevel = 0.012) {
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

function buildSkeletonHierarchy() {
  // 15-bone clean humanoid skeleton
  // 0: Hips, 1: Spine, 2: Chest, 3: Neck, 4: Head,
  // 5: UpperArmL, 6: ForearmL, 7: HandL,
  // 8: UpperArmR, 9: ForearmR, 10: HandR,
  // 11: ThighL, 12: ShinL, 13: ThighR, 14: ShinR
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.92, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.14, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.22, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.24, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.08, 0);
  neck.add(head);

  const upperArmL = new THREE.Bone();
  upperArmL.name = 'UpperArmL';
  upperArmL.position.set(-0.22, 0.18, 0);
  chest.add(upperArmL);

  const forearmL = new THREE.Bone();
  forearmL.name = 'ForearmL';
  forearmL.position.set(0, -0.26, 0);
  upperArmL.add(forearmL);

  const handL = new THREE.Bone();
  handL.name = 'HandL';
  handL.position.set(0, -0.24, 0);
  forearmL.add(handL);

  const upperArmR = new THREE.Bone();
  upperArmR.name = 'UpperArmR';
  upperArmR.position.set(0.22, 0.18, 0);
  chest.add(upperArmR);

  const forearmR = new THREE.Bone();
  forearmR.name = 'ForearmR';
  forearmR.position.set(0, -0.26, 0);
  upperArmR.add(forearmR);

  const handR = new THREE.Bone();
  handR.name = 'HandR';
  handR.position.set(0, -0.24, 0);
  forearmR.add(handR);

  const thighL = new THREE.Bone();
  thighL.name = 'ThighL';
  thighL.position.set(-0.105, -0.02, 0);
  hips.add(thighL);

  const shinL = new THREE.Bone();
  shinL.name = 'ShinL';
  shinL.position.set(0, -0.43, 0);
  thighL.add(shinL);

  const thighR = new THREE.Bone();
  thighR.name = 'ThighR';
  thighR.position.set(0.105, -0.02, 0);
  hips.add(thighR);

  const shinR = new THREE.Bone();
  shinR.name = 'ShinR';
  shinR.position.set(0, -0.43, 0);
  thighR.add(shinR);

  const bones = [
    hips,
    spine,
    chest,
    neck,
    head,
    upperArmL,
    forearmL,
    handL,
    upperArmR,
    forearmR,
    handR,
    thighL,
    shinL,
    thighR,
    shinR,
  ];
  return { hips, bones };
}

function quatTrack(boneName, times, eulers) {
  const values = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [rx, ry, rz] of eulers) {
    e.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

function posTrack(boneName, times, positions) {
  return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, positions.flat());
}

function buildHumanoidAnimations() {
  const clips = [];

  // 1. Idle (Heroic low-ready tactical breathing stance)
  clips.push(
    new THREE.AnimationClip('Idle', 2.4, [
      posTrack('Hips', [0, 1.2, 2.4], [[0, 0.92, 0], [0, 0.934, 0], [0, 0.92, 0]]),
      quatTrack('Spine', [0, 1.2, 2.4], [[0.02, 0, 0], [0.03, 0, 0], [0.02, 0, 0]]),
      quatTrack('Chest', [0, 1.2, 2.4], [[0.02, 0.06, 0], [0.04, 0.06, 0], [0.02, 0.06, 0]]),
      quatTrack('Head', [0, 1.2, 2.4], [[0, -0.05, 0], [0.01, -0.05, 0], [0, -0.05, 0]]),
      quatTrack('UpperArmR', [0, 1.2, 2.4], [[-0.45, -0.15, 0.14], [-0.47, -0.15, 0.14], [-0.45, -0.15, 0.14]]),
      quatTrack('ForearmR', [0, 1.2, 2.4], [[-0.78, 0.2, 0], [-0.82, 0.2, 0], [-0.78, 0.2, 0]]),
      quatTrack('UpperArmL', [0, 1.2, 2.4], [[-0.58, 0.45, -0.16], [-0.6, 0.45, -0.16], [-0.58, 0.45, -0.16]]),
      quatTrack('ForearmL', [0, 1.2, 2.4], [[-0.92, -0.35, 0], [-0.95, -0.35, 0], [-0.92, -0.35, 0]]),
      quatTrack('ThighL', [0, 2.4], [[-0.06, 0.04, -0.04], [-0.06, 0.04, -0.04]]),
      quatTrack('ShinL', [0, 2.4], [[0.1, 0, 0], [0.1, 0, 0]]),
      quatTrack('ThighR', [0, 2.4], [[0.04, -0.04, 0.04], [0.04, -0.04, 0.04]]),
      quatTrack('ShinR', [0, 2.4], [[0.06, 0, 0], [0.06, 0, 0]]),
    ]),
  );

  // 2. Run (Athletic combat sprint cycle, 0.72s loop)
  clips.push(
    new THREE.AnimationClip('Run', 0.72, [
      posTrack('Hips', [0, 0.18, 0.36, 0.54, 0.72], [
        [0, 0.9, 0], [0, 0.948, 0], [0, 0.9, 0], [0, 0.948, 0], [0, 0.9, 0],
      ]),
      quatTrack('Spine', [0, 0.36, 0.72], [[0.14, 0.04, 0], [0.14, -0.04, 0], [0.14, 0.04, 0]]),
      quatTrack('Chest', [0, 0.36, 0.72], [[0.05, -0.06, 0], [0.05, 0.06, 0], [0.05, -0.06, 0]]),
      quatTrack('Head', [0, 0.36, 0.72], [[-0.1, 0.02, 0], [-0.1, -0.02, 0], [-0.1, 0.02, 0]]),
      quatTrack('ThighL', [0, 0.18, 0.36, 0.54, 0.72], [
        [-0.65, 0, 0], [-0.15, 0, 0], [0.55, 0, 0], [-0.1, 0, 0], [-0.65, 0, 0],
      ]),
      quatTrack('ShinL', [0, 0.18, 0.36, 0.54, 0.72], [
        [0.25, 0, 0], [0.85, 0, 0], [0.2, 0, 0], [0.95, 0, 0], [0.25, 0, 0],
      ]),
      quatTrack('ThighR', [0, 0.18, 0.36, 0.54, 0.72], [
        [0.55, 0, 0], [-0.1, 0, 0], [-0.65, 0, 0], [-0.15, 0, 0], [0.55, 0, 0],
      ]),
      quatTrack('ShinR', [0, 0.18, 0.36, 0.54, 0.72], [
        [0.2, 0, 0], [0.95, 0, 0], [0.25, 0, 0], [0.85, 0, 0], [0.2, 0, 0],
      ]),
      quatTrack('UpperArmR', [0, 0.36, 0.72], [[-0.52, -0.1, 0.12], [-0.32, -0.1, 0.12], [-0.52, -0.1, 0.12]]),
      quatTrack('ForearmR', [0, 0.36, 0.72], [[-0.85, 0.25, 0], [-0.75, 0.25, 0], [-0.85, 0.25, 0]]),
      quatTrack('UpperArmL', [0, 0.36, 0.72], [[-0.55, 0.4, -0.12], [-0.72, 0.4, -0.12], [-0.55, 0.4, -0.12]]),
      quatTrack('ForearmL', [0, 0.36, 0.72], [[-0.9, -0.3, 0], [-0.8, -0.3, 0], [-0.9, -0.3, 0]]),
    ]),
  );

  // 3. Aim (Cheek-weld rifle ADS posture)
  clips.push(
    new THREE.AnimationClip('Aim', 1.0, [
      posTrack('Hips', [0, 1.0], [[0, 0.91, 0], [0, 0.91, 0]]),
      quatTrack('Spine', [0, 1.0], [[0.04, 0, 0], [0.04, 0, 0]]),
      quatTrack('Chest', [0, 1.0], [[0.06, -0.22, 0], [0.06, -0.22, 0]]),
      quatTrack('Head', [0, 1.0], [[0.02, 0.2, 0], [0.02, 0.2, 0]]),
      quatTrack('UpperArmR', [0, 1.0], [[-1.08, -0.12, 0.24], [-1.08, -0.12, 0.24]]),
      quatTrack('ForearmR', [0, 1.0], [[-0.95, 0.12, 0], [-0.95, 0.12, 0]]),
      quatTrack('UpperArmL', [0, 1.0], [[-1.05, 0.48, -0.12], [-1.05, 0.48, -0.12]]),
      quatTrack('ForearmL', [0, 1.0], [[-0.75, -0.25, 0], [-0.75, -0.25, 0]]),
      quatTrack('ThighL', [0, 1.0], [[-0.14, 0.08, -0.06], [-0.14, 0.08, -0.06]]),
      quatTrack('ShinL', [0, 1.0], [[0.24, 0, 0], [0.24, 0, 0]]),
      quatTrack('ThighR', [0, 1.0], [[0.08, -0.08, 0.06], [0.08, -0.08, 0.06]]),
      quatTrack('ShinR', [0, 1.0], [[0.14, 0, 0], [0.14, 0, 0]]),
    ]),
  );

  // 4. Crouch
  clips.push(
    new THREE.AnimationClip('Crouch', 1.0, [
      posTrack('Hips', [0, 1.0], [[0, 0.62, 0], [0, 0.62, 0]]),
      quatTrack('Spine', [0, 1.0], [[0.22, 0, 0], [0.22, 0, 0]]),
      quatTrack('Chest', [0, 1.0], [[0.06, -0.12, 0], [0.06, -0.12, 0]]),
      quatTrack('Head', [0, 1.0], [[-0.14, 0.12, 0], [-0.14, 0.12, 0]]),
      quatTrack('UpperArmR', [0, 1.0], [[-0.95, -0.12, 0.18], [-0.95, -0.12, 0.18]]),
      quatTrack('ForearmR', [0, 1.0], [[-0.88, 0.15, 0], [-0.88, 0.15, 0]]),
      quatTrack('UpperArmL', [0, 1.0], [[-0.95, 0.45, -0.12], [-0.95, 0.45, -0.12]]),
      quatTrack('ForearmL', [0, 1.0], [[-0.8, -0.25, 0], [-0.8, -0.25, 0]]),
      quatTrack('ThighL', [0, 1.0], [[-0.85, 0.08, -0.05], [-0.85, 0.08, -0.05]]),
      quatTrack('ShinL', [0, 1.0], [[1.35, 0, 0], [1.35, 0, 0]]),
      quatTrack('ThighR', [0, 1.0], [[-0.55, -0.08, 0.05], [-0.55, -0.08, 0.05]]),
      quatTrack('ShinR', [0, 1.0], [[1.05, 0, 0], [1.05, 0, 0]]),
    ]),
  );

  return clips;
}

function buildHumanoidGlbScene(variant) {
  const isFemale = variant === 'female';
  const isBrute = variant === 'brute';
  const isOverlord = variant === 'overlord';

  const scene = new THREE.Scene();
  scene.name = `Operative_${variant}`;
  const root = new THREE.Group();
  root.name = 'RigRoot';
  scene.add(root);

  const { hips, bones } = buildSkeletonHierarchy();
  root.add(hips);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  const fabricMat = new THREE.MeshStandardMaterial({
    name: 'FabricMat',
    color: 0x262930,
    roughness: 0.82,
    metalness: 0.08,
  });
  const gearMat = new THREE.MeshStandardMaterial({
    name: 'GearMat',
    color: 0x181a1e,
    roughness: 0.52,
    metalness: 0.38,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    name: 'SkinMat',
    color: isBrute ? 0x9b7e6b : 0xc49578,
    roughness: 0.65,
    metalness: 0.02,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    name: 'AccentMat',
    color: isOverlord ? 0xd93824 : 0xd95d24,
    roughness: 0.36,
    metalness: 0.45,
  });

  const wScale = isFemale ? 0.91 : isBrute ? 1.24 : isOverlord ? 1.1 : 1.04;
  const dScale = isFemale ? 0.88 : isBrute ? 1.16 : 1.0;

  // 1. CONTINUOUS SKINNED TORSO + WAIST + HIGH COLLAR (Bones 0=Hips, 1=Spine, 2=Chest, 3=Neck)
  const torsoGeo = createSkinnedLoft(
    [
      { pos: [0, 0.83, 0], rx: 0.145 * wScale, rz: 0.105 * dScale, boneA: 0, boneB: 0, weightA: 1.0 },
      { pos: [0, 0.91, 0], rx: 0.162 * wScale, rz: 0.118 * dScale, boneA: 0, boneB: 1, weightA: 0.7 },
      { pos: [0, 1.02, 0], rx: 0.148 * (isFemale ? 0.86 : wScale), rz: 0.11 * dScale, boneA: 1, boneB: 0, weightA: 0.75 },
      { pos: [0, 1.15, 0], rx: 0.172 * wScale, rz: 0.125 * dScale, boneA: 1, boneB: 2, weightA: 0.45 },
      { pos: [0, 1.31, 0], rx: 0.198 * wScale, rz: 0.132 * dScale, boneA: 2, boneB: 1, weightA: 0.85 },
      { pos: [0, 1.44, 0], rx: 0.175 * wScale, rz: 0.115 * dScale, boneA: 2, boneB: 3, weightA: 0.8 },
      { pos: [0, 1.5, 0], rx: 0.082, rz: 0.082, boneA: 3, boneB: 2, weightA: 0.75 },
      { pos: [0, 1.57, 0], rx: 0.072, rz: 0.074, boneA: 3, boneB: 4, weightA: 0.6 },
    ],
    18,
  );
  const torsoMesh = new THREE.SkinnedMesh(torsoGeo, fabricMat);
  torsoMesh.name = 'BodySuit_Torso';
  torsoMesh.bind(skeleton);
  root.add(torsoMesh);

  // 2. CONTINUOUS SKINNED SLEEVED ARMS (Left & Right)
  const buildArmMesh = (side, boneUpper, boneFore, boneHand, name) => {
    const sx = side * 0.22;
    const armW = isFemale ? 0.86 : isBrute ? 1.22 : 1.0;
    const armGeo = createSkinnedLoft(
      [
        { pos: [sx * 0.85, 1.43, 0], rx: 0.068 * armW, rz: 0.068 * armW, boneA: 2, boneB: boneUpper, weightA: 0.55 },
        { pos: [sx, 1.36, 0], rx: 0.066 * armW, rz: 0.068 * armW, boneA: boneUpper, boneB: 2, weightA: 0.8 },
        { pos: [sx, 1.24, 0], rx: 0.058 * armW, rz: 0.06 * armW, boneA: boneUpper, boneB: boneUpper, weightA: 1.0 },
        { pos: [sx, 1.12, -0.01], rx: 0.048 * armW, rz: 0.05 * armW, boneA: boneUpper, boneB: boneFore, weightA: 0.55 },
        { pos: [sx, 1.01, 0], rx: 0.052 * armW, rz: 0.052 * armW, boneA: boneFore, boneB: boneUpper, weightA: 0.82 },
        { pos: [sx, 0.9, 0.005], rx: 0.041 * armW, rz: 0.042 * armW, boneA: boneFore, boneB: boneHand, weightA: 0.78 },
      ],
      12,
    );
    const armMesh = new THREE.SkinnedMesh(armGeo, fabricMat);
    armMesh.name = name;
    armMesh.bind(skeleton);
    root.add(armMesh);

    // Gloved Hand bound to Hand bone
    const gloveGeo = createSkinnedLoft(
      [
        { pos: [sx, 0.91, 0], rx: 0.042 * armW, rz: 0.042 * armW, boneA: boneFore, boneB: boneHand, weightA: 0.35 },
        { pos: [sx, 0.85, 0.008], rx: 0.04 * armW, rz: 0.036 * armW, boneA: boneHand, boneB: boneHand, weightA: 1.0 },
        { pos: [sx, 0.79, 0.014], rx: 0.032 * armW, rz: 0.025 * armW, boneA: boneHand, boneB: boneHand, weightA: 1.0 },
      ],
      10,
    );
    const gloveMesh = new THREE.SkinnedMesh(gloveGeo, gearMat);
    gloveMesh.name = `${name}_Glove`;
    gloveMesh.bind(skeleton);
    root.add(gloveMesh);
  };
  buildArmMesh(-1, 5, 6, 7, 'BodySuit_ArmL');
  buildArmMesh(1, 8, 9, 10, 'BodySuit_ArmR');

  // 3. CONTINUOUS SKINNED CARGO TROUSERS & BOOTS (Left & Right)
  const buildLegMesh = (side, boneThigh, boneShin, name) => {
    const lx = side * 0.105;
    const legW = isFemale ? 0.92 : isBrute ? 1.18 : 1.02;
    const legGeo = createSkinnedLoft(
      [
        { pos: [lx, 0.91, 0], rx: 0.095 * legW, rz: 0.098 * legW, boneA: 0, boneB: boneThigh, weightA: 0.5 },
        { pos: [lx, 0.76, 0.005], rx: 0.088 * legW, rz: 0.092 * legW, boneA: boneThigh, boneB: 0, weightA: 0.9 },
        { pos: [lx, 0.58, 0.005], rx: 0.072 * legW, rz: 0.075 * legW, boneA: boneThigh, boneB: boneShin, weightA: 0.85 },
        { pos: [lx, 0.48, 0.012], rx: 0.062 * legW, rz: 0.066 * legW, boneA: boneThigh, boneB: boneShin, weightA: 0.5 },
        { pos: [lx, 0.35, -0.005], rx: 0.064 * legW, rz: 0.068 * legW, boneA: boneShin, boneB: boneThigh, weightA: 0.88 },
        { pos: [lx, 0.18, 0], rx: 0.052 * legW, rz: 0.056 * legW, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
      ],
      14,
    );
    const legMesh = new THREE.SkinnedMesh(legGeo, fabricMat);
    legMesh.name = name;
    legMesh.bind(skeleton);
    root.add(legMesh);

    // Combat Boot (shin -> ankle -> boot foot)
    const bootGeo = createSkinnedLoft(
      [
        { pos: [lx, 0.21, 0], rx: 0.058 * legW, rz: 0.062 * legW, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
        { pos: [lx, 0.1, 0.015], rx: 0.056 * legW, rz: 0.075 * legW, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
        { pos: [lx, 0.03, 0.045], rx: 0.058 * legW, rz: 0.115 * legW, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
        { pos: [lx, 0.0, 0.045], rx: 0.055 * legW, rz: 0.11 * legW, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
        { pos: [lx, 0.0, 0.045], rx: 0.002, rz: 0.002, boneA: boneShin, boneB: boneShin, weightA: 1.0 },
      ],
      12,
    );
    const bootMesh = new THREE.SkinnedMesh(bootGeo, gearMat);
    bootMesh.name = `${name}_Boot`;
    bootMesh.bind(skeleton);
    root.add(bootMesh);
  };
  buildLegMesh(-1, 11, 12, 'BodySuit_LegL');
  buildLegMesh(1, 13, 14, 'BodySuit_LegR');

  // 4. SCULPTED HEAD (Attached to Head bone)
  const headBone = bones[4];
  const skullGeo = createSkinnedLoft(
    [
      { pos: [0, -0.02, 0], rx: 0.068, rz: 0.072, boneA: 3, boneB: 4, weightA: 0.45 },
      { pos: [0, 0.04, 0.015], rx: 0.082, rz: 0.095, boneA: 4, boneB: 4, weightA: 1.0 },
      { pos: [0, 0.11, 0.01], rx: 0.09, rz: 0.104, boneA: 4, boneB: 4, weightA: 1.0 },
      { pos: [0, 0.18, -0.005], rx: 0.086, rz: 0.102, boneA: 4, boneB: 4, weightA: 1.0 },
      { pos: [0, 0.22, -0.01], rx: 0.048, rz: 0.056, boneA: 4, boneB: 4, weightA: 1.0 },
      { pos: [0, 0.23, -0.01], rx: 0.002, rz: 0.002, boneA: 4, boneB: 4, weightA: 1.0 },
    ],
    16,
  );
  // Note: bone 4 world y is 0.92+0.14+0.22+0.24+0.08 = 1.60, so translate head geometry into world bind pose (+1.60)
  skullGeo.translate(0, 1.56, 0);
  const headMesh = new THREE.SkinnedMesh(skullGeo, skinMat);
  headMesh.name = 'Head_Skin';
  headMesh.bind(skeleton);
  root.add(headMesh);

  // Tactical Belt & Knee Pads attached to Hips / Shin bones
  const belt = new THREE.Mesh(createRoundedPlate(0.36 * wScale, 0.065, 0.26 * dScale, 0.02, 0.008), gearMat);
  belt.name = 'Gear_Belt';
  belt.position.set(0, 0.03, 0);
  bones[0].add(belt);

  const buckle = new THREE.Mesh(createRoundedPlate(0.072, 0.05, 0.04, 0.008, 0.004), accentMat);
  buckle.name = 'Accent_Buckle';
  buckle.position.set(0, 0.03, 0.135 * dScale);
  bones[0].add(buckle);

  const kpL = new THREE.Mesh(createRoundedPlate(0.1, 0.095, 0.065, 0.02, 0.008), gearMat);
  kpL.name = 'Gear_KneePadL';
  kpL.position.set(0, 0, 0.055);
  bones[12].add(kpL);

  const kpR = kpL.clone();
  kpR.name = 'Gear_KneePadR';
  bones[14].add(kpR);

  // Shoulder Pauldrons attached cleanly onto UpperArm bones
  const pGeo = createRoundedPlate(0.115, 0.13, 0.14, 0.028, 0.012);
  const pL = new THREE.Mesh(pGeo, gearMat);
  pL.name = 'Gear_PauldronL';
  pL.position.set(-0.01, -0.05, 0);
  pL.rotation.z = 0.14;
  bones[5].add(pL);

  const pR = new THREE.Mesh(pGeo, gearMat);
  pR.name = 'Gear_PauldronR';
  pR.position.set(0.01, -0.05, 0);
  pR.rotation.z = -0.14;
  bones[8].add(pR);

  // Store weapon socket on Chest / Right Hand
  const weaponSocket = new THREE.Group();
  weaponSocket.name = 'WeaponSocket';
  weaponSocket.position.set(0.1, 0.08, 0.22);
  bones[2].add(weaponSocket);

  // Store Head & Chest equipment sockets
  const headSocket = new THREE.Group();
  headSocket.name = 'HeadSocket';
  headBone.add(headSocket);

  const chestSocket = new THREE.Group();
  chestSocket.name = 'ChestSocket';
  chestSocket.position.set(0, 0.06, 0);
  bones[2].add(chestSocket);

  const animations = buildHumanoidAnimations();
  return { scene, animations };
}

function buildScoutDroneGlbScene() {
  const scene = new THREE.Scene();
  scene.name = 'ScoutDrone';
  const root = new THREE.Group();
  root.name = 'DroneRoot';
  scene.add(root);

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.42, metalness: 0.72 });
  const redMat = new THREE.MeshStandardMaterial({
    color: 0xd93824,
    emissive: 0x991b1b,
    emissiveIntensity: 0.75,
    roughness: 0.35,
  });

  const body = new THREE.Mesh(createRoundedPlate(0.46, 0.16, 0.62, 0.08, 0.03), hullMat);
  body.name = 'DroneHull';
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), redMat);
  eye.name = 'DroneOptic';
  eye.position.set(0, -0.04, 0.28);
  root.add(body, eye);

  const offsets = [
    [-0.44, 0.04, -0.44],
    [0.44, 0.04, -0.44],
    [-0.44, 0.04, 0.44],
    [0.44, 0.04, 0.44],
  ];
  offsets.forEach(([ox, oy, oz], idx) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.035, 0.045), hullMat);
    arm.position.set(ox * 0.5, oy - 0.02, oz * 0.5);
    arm.rotation.y = Math.atan2(ox, oz) + Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.075, 10), redMat);
    hub.position.set(ox, oy, oz);
    const rotor = new THREE.Group();
    rotor.name = `Rotor_${idx}`;
    rotor.position.set(ox, oy + 0.05, oz);
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.008, 0.03), hullMat);
    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.42), hullMat);
    rotor.add(bladeA, bladeB);
    root.add(arm, hub, rotor);
  });

  const hoverClip = new THREE.AnimationClip('Hover', 1.6, [
    posTrack('DroneRoot', [0, 0.8, 1.6], [[0, 2.2, 0], [0, 2.38, 0], [0, 2.2, 0]]),
  ]);
  return { scene, animations: [hoverClip] };
}

async function exportGlb(filename, scene, animations) {
  const exporter = new GLTFExporter();
  const ab = await exporter.parseAsync(scene, { binary: true, animations });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(ab));
  console.log(`Exported ${filename}: ${(ab.byteLength / 1024).toFixed(1)} KB (${animations.length} clips)`);
}

async function main() {
  for (const variant of ['male', 'female', 'overlord', 'brute']) {
    const { scene, animations } = buildHumanoidGlbScene(variant);
    await exportGlb(`operative_${variant}.glb`, scene, animations);
  }
  const drone = buildScoutDroneGlbScene();
  await exportGlb('scout_drone.glb', drone.scene, drone.animations);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
