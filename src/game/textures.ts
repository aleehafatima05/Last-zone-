import * as THREE from 'three';
import { OUTFIT_THEMES, WEAPON_SKINS } from './constants';
import type { OutfitThemeId, WeaponSkinId } from './types';

export interface OutfitTexturePair {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

export interface ProceduralTextureSet {
  terrainAlbedo: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  roadAlbedo: THREE.CanvasTexture;
  concreteAlbedo: THREE.CanvasTexture;
  concreteBump: THREE.CanvasTexture;
  corrugatedMetalAlbedo: THREE.CanvasTexture;
  corrugatedMetalBump: THREE.CanvasTexture;
  brickFactoryAlbedo: THREE.CanvasTexture;
  timberAlbedo: THREE.CanvasTexture;
  stuccoAlbedo: THREE.CanvasTexture;
  hazardStripeAlbedo: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  tacticalFabricBump: THREE.CanvasTexture;
  grassTuftMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  turntableMap: THREE.CanvasTexture;
  getOutfitTextures: (themeId: OutfitThemeId) => OutfitTexturePair;
  getWeaponSkinTexture: (skinId: WeaponSkinId) => THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
  anisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Deterministic hash PRNG for repeatable textures
function makeSeededRand(seedInit: number): () => number {
  let s = seedInit >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  const disposables: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(t: T): T => {
    disposables.push(t);
    return t;
  };

  // 1. High-Res Terrain Albedo, Bump & Granite Cliff Texture (512x512)
  const [terrC, terrCtx] = makeCanvas(512, 512);
  const randT = makeSeededRand(101);
  terrCtx.fillStyle = '#48523a';
  terrCtx.fillRect(0, 0, 512, 512);
  // Soil & dry moss blotches
  for (let i = 0; i < 2200; i++) {
    const x = randT() * 512;
    const y = randT() * 512;
    const rx = 3 + randT() * 9;
    const ry = 2 + randT() * 6;
    const shade = randT();
    terrCtx.fillStyle =
      shade < 0.36
        ? 'rgba(54, 65, 42, 0.32)'
        : shade < 0.72
          ? 'rgba(84, 90, 58, 0.28)'
          : 'rgba(104, 90, 64, 0.26)';
    terrCtx.fillRect(x, y, rx, ry);
  }
  // Crisp grass-blade micro-strokes (reads cleanly close up!)
  for (let i = 0; i < 9500; i++) {
    const x = randT() * 512;
    const y = randT() * 512;
    const len = 3 + randT() * 6;
    const ang = -Math.PI * 0.5 + (randT() - 0.5) * 0.8;
    const tone = randT();
    terrCtx.strokeStyle =
      tone < 0.35
        ? 'rgba(66, 82, 46, 0.55)'
        : tone < 0.75
          ? 'rgba(98, 112, 66, 0.45)'
          : 'rgba(132, 118, 80, 0.36)';
    terrCtx.lineWidth = 1;
    terrCtx.beginPath();
    terrCtx.moveTo(x, y);
    terrCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    terrCtx.stroke();
  }

  const [terrBumpC, terrBumpCtx] = makeCanvas(512, 512);
  terrBumpCtx.fillStyle = '#808080';
  terrBumpCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const x = randT() * 512;
    const y = randT() * 512;
    const v = 76 + Math.floor(randT() * 108);
    terrBumpCtx.fillStyle = `rgb(${v},${v},${v})`;
    terrBumpCtx.fillRect(x, y, 2, 3);
  }

  // Striated Mountain Granite & Cliff Texture
  const [rockC, rockCtx] = makeCanvas(256, 256);
  rockCtx.fillStyle = '#5a5c59';
  rockCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = randT() * 256;
    const y = randT() * 256;
    const v = 64 + Math.floor(randT() * 62);
    rockCtx.fillStyle = `rgba(${v + 4},${v + 2},${v - 2},0.45)`;
    rockCtx.fillRect(x, y, 4 + randT() * 14, 1 + randT() * 4);
  }
  rockCtx.strokeStyle = 'rgba(26, 28, 30, 0.48)';
  rockCtx.lineWidth = 1.5;
  for (let i = 0; i < 48; i++) {
    const y = randT() * 256;
    rockCtx.beginPath();
    rockCtx.moveTo(0, y);
    rockCtx.lineTo(256, y + (randT() - 0.5) * 32);
    rockCtx.stroke();
  }

  // 2. Asphalt Road Albedo
  const [roadC, roadCtx] = makeCanvas(256, 256);
  const randR = makeSeededRand(202);
  roadCtx.fillStyle = '#2b2e33';
  roadCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2800; i++) {
    const x = randR() * 256;
    const y = randR() * 256;
    const v = 32 + Math.floor(randR() * 28);
    roadCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    roadCtx.fillRect(x, y, 2, 2);
  }
  roadCtx.fillStyle = 'rgba(88, 78, 60, 0.42)';
  roadCtx.fillRect(0, 0, 18, 256);
  roadCtx.fillRect(238, 0, 18, 256);
  roadCtx.fillStyle = 'rgba(215, 152, 62, 0.72)';
  roadCtx.fillRect(124, 16, 8, 76);
  roadCtx.fillRect(124, 144, 8, 76);

  // 3. Weathered Military Concrete
  const [concC, concCtx] = makeCanvas(256, 256);
  const randC = makeSeededRand(303);
  concCtx.fillStyle = '#737671';
  concCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const x = randC() * 256;
    const y = randC() * 256;
    const v = 96 + Math.floor(randC() * 34);
    concCtx.fillStyle = `rgba(${v},${v + 2},${v - 2},0.35)`;
    concCtx.fillRect(x, y, 3, 3);
  }
  concCtx.strokeStyle = 'rgba(38, 40, 38, 0.48)';
  concCtx.lineWidth = 2;
  concCtx.strokeRect(2, 2, 252, 124);
  concCtx.strokeRect(2, 130, 252, 124);

  const [concBumpC, concBumpCtx] = makeCanvas(256, 256);
  concBumpCtx.fillStyle = '#888888';
  concBumpCtx.fillRect(0, 0, 256, 256);
  concBumpCtx.strokeStyle = '#323232';
  concBumpCtx.lineWidth = 3;
  concBumpCtx.strokeRect(2, 2, 252, 124);
  concBumpCtx.strokeRect(2, 130, 252, 124);

  // 4. Rusted Corrugated Steel
  const [steelC, steelCtx] = makeCanvas(256, 256);
  const randS = makeSeededRand(404);
  steelCtx.fillStyle = '#474e54';
  steelCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const grad = steelCtx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, '#343a3f');
    grad.addColorStop(0.5, '#5d666d');
    grad.addColorStop(1, '#343a3f');
    steelCtx.fillStyle = grad;
    steelCtx.fillRect(x, 0, 16, 256);
  }
  for (let i = 0; i < 42; i++) {
    steelCtx.fillStyle = 'rgba(165, 76, 36, 0.36)';
    steelCtx.fillRect(randS() * 240, randS() * 220, 6 + randS() * 14, 18 + randS() * 34);
  }

  const [steelBumpC, steelBumpCtx] = makeCanvas(256, 256);
  for (let x = 0; x < 256; x += 16) {
    const grad = steelBumpCtx.createLinearGradient(x, 0, x + 16, 0);
    grad.addColorStop(0, '#444444');
    grad.addColorStop(0.5, '#dcdcdc');
    grad.addColorStop(1, '#444444');
    steelBumpCtx.fillStyle = grad;
    steelBumpCtx.fillRect(x, 0, 16, 256);
  }

  // 5. Industrial Factory Brick & Steel Framing
  const [brickC, brickCtx] = makeCanvas(256, 256);
  const randB = makeSeededRand(505);
  brickCtx.fillStyle = '#6c493b';
  brickCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const offset = (y / 16) % 2 === 0 ? 0 : 16;
    for (let x = -16; x < 256; x += 32) {
      const tone = 82 + Math.floor(randB() * 26);
      brickCtx.fillStyle = `rgb(${tone + 26}, ${tone - 6}, ${tone - 22})`;
      brickCtx.fillRect(x + offset + 1, y + 1, 30, 14);
    }
  }
  // Soots & grime
  brickCtx.fillStyle = 'rgba(20, 22, 24, 0.28)';
  brickCtx.fillRect(0, 190, 256, 66);

  // 6. Timber Cabin Plank Albedo
  const [timberC, timberCtx] = makeCanvas(256, 256);
  const randW = makeSeededRand(606);
  timberCtx.fillStyle = '#654c38';
  timberCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const tone = 84 + Math.floor(randW() * 24);
    timberCtx.fillStyle = `rgb(${tone + 18}, ${tone}, ${tone - 18})`;
    timberCtx.fillRect(0, y, 256, 30);
    timberCtx.fillStyle = '#2d2118';
    timberCtx.fillRect(0, y + 30, 256, 2);
  }

  // 7. Cottage Stucco Wall
  const [stuccoC, stuccoCtx] = makeCanvas(256, 256);
  stuccoCtx.fillStyle = '#a49b88';
  stuccoCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const v = 135 + Math.floor(randW() * 34);
    stuccoCtx.fillStyle = `rgba(${v},${v - 8},${v - 18},0.35)`;
    stuccoCtx.fillRect(randW() * 256, randW() * 256, 3, 3);
  }

  // 8. Industrial Hazard Stripes (smokestacks & barricades)
  const [hazC, hazCtx] = makeCanvas(128, 128);
  hazCtx.fillStyle = '#cfd3d7';
  hazCtx.fillRect(0, 0, 128, 128);
  hazCtx.fillStyle = '#b93822';
  hazCtx.fillRect(0, 0, 128, 32);
  hazCtx.fillRect(0, 64, 128, 32);

  // 9. Ripstop Fabric Bump Map
  const [fabBumpC, fabBumpCtx] = makeCanvas(128, 128);
  fabBumpCtx.fillStyle = '#808080';
  fabBumpCtx.fillRect(0, 0, 128, 128);
  fabBumpCtx.strokeStyle = '#a8a8a8';
  fabBumpCtx.lineWidth = 1;
  for (let i = 0; i < 128; i += 6) {
    fabBumpCtx.beginPath();
    fabBumpCtx.moveTo(i, 0);
    fabBumpCtx.lineTo(i, 128);
    fabBumpCtx.moveTo(0, i);
    fabBumpCtx.lineTo(128, i);
    fabBumpCtx.stroke();
  }

  // 10. Water Surface Normal Map
  const [waterC, waterCtx] = makeCanvas(256, 256);
  waterCtx.fillStyle = 'rgb(128,128,255)';
  waterCtx.fillRect(0, 0, 256, 256);
  const imgData = waterCtx.getImageData(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const nx =
        Math.sin((x / 256) * Math.PI * 8 + Math.cos((y / 256) * Math.PI * 4)) * 22 +
        Math.sin((x / 256) * Math.PI * 18) * 10;
      const ny =
        Math.cos((y / 256) * Math.PI * 8 + Math.sin((x / 256) * Math.PI * 6)) * 22;
      imgData.data[idx] = Math.round(128 + nx);
      imgData.data[idx + 1] = Math.round(128 + ny);
      imgData.data[idx + 2] = 245;
      imgData.data[idx + 3] = 255;
    }
  }
  waterCtx.putImageData(imgData, 0, 0);

  // 11. Contact Shadow Disc
  const [shadC, shadCtx] = makeCanvas(128, 128);
  const shadGrad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  shadGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  shadGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  shadGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = shadGrad;
  shadCtx.fillRect(0, 0, 128, 128);

  // 12. Holographic Dressing Room Turntable Ring
  const [turnC, turnCtx] = makeCanvas(256, 256);
  turnCtx.clearRect(0, 0, 256, 256);
  const tGrad = turnCtx.createRadialGradient(128, 128, 32, 128, 128, 124);
  tGrad.addColorStop(0, 'rgba(217, 130, 36, 0.14)');
  tGrad.addColorStop(0.68, 'rgba(56, 189, 248, 0.22)');
  tGrad.addColorStop(0.84, 'rgba(56, 189, 248, 0.85)');
  tGrad.addColorStop(0.92, 'rgba(217, 93, 36, 0.65)');
  tGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  turnCtx.fillStyle = tGrad;
  turnCtx.fillRect(0, 0, 256, 256);
  turnCtx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
  turnCtx.lineWidth = 3;
  turnCtx.beginPath();
  turnCtx.arc(128, 128, 108, 0, Math.PI * 2);
  turnCtx.stroke();

  const terrainAlbedo = track(configureTexture(terrC, 96, 96, true, aniso));
  const terrainBump = track(configureTexture(terrBumpC, 96, 96, false, aniso));
  const rockAlbedo = track(configureTexture(rockC, 4, 4, true, aniso));
  const roadAlbedo = track(configureTexture(roadC, 1, 20, true, aniso));
  const concreteAlbedo = track(configureTexture(concC, 2, 2, true, aniso));
  const concreteBump = track(configureTexture(concBumpC, 2, 2, false, aniso));
  const corrugatedMetalAlbedo = track(configureTexture(steelC, 3, 2, true, aniso));
  const corrugatedMetalBump = track(configureTexture(steelBumpC, 3, 2, false, aniso));
  const brickFactoryAlbedo = track(configureTexture(brickC, 3, 2, true, aniso));
  const timberAlbedo = track(configureTexture(timberC, 2, 2, true, aniso));
  const stuccoAlbedo = track(configureTexture(stuccoC, 2, 2, true, aniso));
  const hazardStripeAlbedo = track(configureTexture(hazC, 1, 3, true, aniso));
  const waterNormal = track(configureTexture(waterC, 14, 4, false, aniso));
  const tacticalFabricBump = track(configureTexture(fabBumpC, 4, 4, false, aniso));

  const contactShadowMap = track(new THREE.CanvasTexture(shadC));
  contactShadowMap.needsUpdate = true;

  const turntableMap = track(new THREE.CanvasTexture(turnC));
  turntableMap.colorSpace = THREE.SRGBColorSpace;
  turntableMap.needsUpdate = true;

  const outfitCache = new Map<OutfitThemeId, OutfitTexturePair>();
  const getOutfitTextures = (themeId: OutfitThemeId): OutfitTexturePair => {
    const cached = outfitCache.get(themeId);
    if (cached) return cached;

    const spec = OUTFIT_THEMES[themeId];
    const [oc, octx] = makeCanvas(512, 512);
    const randO = makeSeededRand(700 + themeId.length * 37);

    octx.fillStyle = spec.primaryHex;
    octx.fillRect(0, 0, 512, 512);

    if (spec.pattern === 'digital' || spec.pattern === 'urban' || spec.pattern === 'arctic') {
      for (let i = 0; i < 620; i++) {
        octx.fillStyle = i % 3 === 0 ? spec.secondaryHex : 'rgba(255,255,255,0.10)';
        const pw = 10 + Math.floor(randO() * 4) * 8;
        const ph = 8 + Math.floor(randO() * 3) * 8;
        octx.fillRect(randO() * 512, randO() * 512, pw, ph);
      }
    } else if (spec.pattern === 'woodland') {
      for (let i = 0; i < 180; i++) {
        octx.fillStyle = i % 2 === 0 ? spec.secondaryHex : '#5d6944';
        octx.beginPath();
        octx.ellipse(
          randO() * 512,
          randO() * 512,
          20 + randO() * 34,
          12 + randO() * 20,
          randO() * Math.PI,
          0,
          Math.PI * 2,
        );
        octx.fill();
      }
    } else if (spec.pattern === 'hazard') {
      octx.fillStyle = spec.secondaryHex;
      for (let y = 0; y < 512; y += 64) {
        octx.fillRect(0, y, 512, 24);
      }
    } else {
      // Sleek matte Kevlar weave with subtle tonal variation
      for (let i = 0; i < 900; i++) {
        octx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.16)';
        octx.fillRect(randO() * 512, randO() * 512, 6 + randO() * 12, 4 + randO() * 8);
      }
    }

    // Fine ripstop weave + reinforced tactical stitching lines
    octx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    octx.lineWidth = 1;
    for (let i = 0; i < 512; i += 8) {
      octx.beginPath();
      octx.moveTo(i, 0);
      octx.lineTo(i, 512);
      octx.moveTo(0, i);
      octx.lineTo(512, i);
      octx.stroke();
    }
    octx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    octx.setLineDash([4, 3]);
    octx.lineWidth = 1.5;
    octx.strokeRect(10, 10, 492, 492);
    octx.beginPath();
    octx.moveTo(256, 0);
    octx.lineTo(256, 512);
    octx.moveTo(0, 256);
    octx.lineTo(512, 256);
    octx.stroke();
    octx.setLineDash([]);

    const albedo = track(configureTexture(oc, 2, 2, true, aniso));
    const pair = { albedo, bump: tacticalFabricBump };
    outfitCache.set(themeId, pair);
    return pair;
  };

  const weaponSkinCache = new Map<WeaponSkinId, THREE.CanvasTexture>();
  const getWeaponSkinTexture = (skinId: WeaponSkinId): THREE.CanvasTexture => {
    const cached = weaponSkinCache.get(skinId);
    if (cached) return cached;

    const skin = WEAPON_SKINS[skinId];
    const [wc, wctx] = makeCanvas(256, 128);
    const bodyCol = `#${skin.bodyHex.toString(16).padStart(6, '0')}`;
    const accCol = `#${skin.accentHex.toString(16).padStart(6, '0')}`;

    wctx.fillStyle = bodyCol;
    wctx.fillRect(0, 0, 256, 128);

    // Brushed alloy lines
    wctx.strokeStyle = 'rgba(255,255,255,0.06)';
    wctx.lineWidth = 1;
    for (let y = 0; y < 128; y += 4) {
      wctx.beginPath();
      wctx.moveTo(0, y);
      wctx.lineTo(256, y);
      wctx.stroke();
    }

    // Diagonal tactical racing stripes / topographic accent pattern
    wctx.fillStyle = accCol;
    if (skinId === 'crimson_collapse' || skinId === 'gilded_ops') {
      for (let x = -40; x < 290; x += 44) {
        wctx.beginPath();
        wctx.moveTo(x, 128);
        wctx.lineTo(x + 14, 128);
        wctx.lineTo(x + 62, 0);
        wctx.lineTo(x + 48, 0);
        wctx.closePath();
        wctx.fill();
      }
    } else if (skinId === 'arctic_frost') {
      const randA = makeSeededRand(909);
      for (let i = 0; i < 42; i++) {
        wctx.fillStyle = i % 2 === 0 ? accCol : '#ffffff';
        wctx.beginPath();
        wctx.moveTo(randA() * 256, randA() * 128);
        wctx.lineTo(randA() * 256, randA() * 128);
        wctx.lineTo(randA() * 256, randA() * 128);
        wctx.closePath();
        wctx.fill();
      }
    } else {
      wctx.fillRect(0, 58, 256, 10);
    }

    const tex = track(configureTexture(wc, 1, 1, true, aniso));
    weaponSkinCache.set(skinId, tex);
    return tex;
  };

  // Alpha-cutout multi-blade grass tuft texture (128x128)
  const [gtC, gtCtx] = makeCanvas(128, 128);
  gtCtx.clearRect(0, 0, 128, 128);
  const randG = makeSeededRand(733);
  for (let b = 0; b < 18; b++) {
    const baseX = 14 + randG() * 100;
    const tipX = baseX + (randG() - 0.5) * 34;
    const tipY = 8 + randG() * 52;
    const halfW = 3.5 + randG() * 3.5;
    const grad = gtCtx.createLinearGradient(baseX, 128, tipX, tipY);
    grad.addColorStop(0, '#3a4a2a');
    grad.addColorStop(0.6, '#627644');
    grad.addColorStop(1, '#859a58');
    gtCtx.fillStyle = grad;
    gtCtx.beginPath();
    gtCtx.moveTo(baseX - halfW, 128);
    gtCtx.quadraticCurveTo(baseX + (tipX - baseX) * 0.45 - halfW * 0.4, (128 + tipY) * 0.5, tipX, tipY);
    gtCtx.quadraticCurveTo(baseX + (tipX - baseX) * 0.45 + halfW * 0.4, (128 + tipY) * 0.5, baseX + halfW, 128);
    gtCtx.closePath();
    gtCtx.fill();
  }
  const grassTuftMap = track(configureTexture(gtC, 1, 1, true, aniso));
  grassTuftMap.wrapS = THREE.ClampToEdgeWrapping;
  grassTuftMap.wrapT = THREE.ClampToEdgeWrapping;

  return {
    terrainAlbedo,
    terrainBump,
    rockAlbedo,
    roadAlbedo,
    concreteAlbedo,
    concreteBump,
    corrugatedMetalAlbedo,
    corrugatedMetalBump,
    brickFactoryAlbedo,
    timberAlbedo,
    stuccoAlbedo,
    hazardStripeAlbedo,
    waterNormal,
    tacticalFabricBump,
    grassTuftMap,
    contactShadowMap,
    turntableMap,
    getOutfitTextures,
    getWeaponSkinTexture,
    dispose: () => {
      disposables.forEach((t) => t.dispose());
    },
  };
}
