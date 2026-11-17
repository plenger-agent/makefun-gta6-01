// world.js — Puerto Azahar: the whole city as one procedural build. A grid of avenues runs
// west-east and north-south; between them sit pastel blocks of apartments, hotels and shops
// with lit windows and neon signs. The east edge of the grid gives up to a promenade, a sandy
// beach and the open sea, with a marina pier and a lighthouse on the rocks. Everything is
// generated from the seed with canvas-painted textures — no image files, no network. The
// module also owns the facts the rest of the game navigates by: the street coordinates, the
// building collision boxes, the parking bays and the named places missions send you to.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom, randRange, randInt, pick, paintCanvas, clamp } from './util.js';

/** Street centre lines, on both axes. Avenues run the full width of the city grid. */
export const STREET_COORDS = [-92, -46, 0, 46, 92];
/** Half the width of a street, kerb to kerb. */
export const ROAD_HALF = 6;
/** The city grid spans -124..124 on both axes; east of that is beach, then sea. */
export const CITY_EDGE = 124;
export const BEACH_X = 126;
export const WATER_X = 152;

/** Named places the story and the map care about. */
export const PLACES = {
  cafeSol: { x: -63, z: 63, label: 'Café Sol' },
  hotelAzahar: { x: 66, z: -66, label: 'Hotel Azahar' },
  policeStation: { x: -23, z: -63, label: 'Policía Portuaria' },
  hospital: { x: 66, z: 63, label: 'Hospital Santa María' },
  garage: { x: -66, z: -66, label: "Rico's Garage" },
  fishMarket: { x: 108, z: -24, label: 'Mercado del Puerto' },
  docks: { x: 104, z: 100, label: 'The old docks' },
  marina: { x: 158, z: 37, label: 'Marina Azahar' },
  warehouse: { x: -104, z: 104, label: 'Almacén 9' },
  plaza: { x: -23, z: 23, label: 'Plaza de la Fuente' },
};

/** True when a point sits on a street (either axis), kerb to kerb. */
export function isOnRoad(x, z) {
  for (const c of STREET_COORDS) {
    if (Math.abs(x - c) <= ROAD_HALF || Math.abs(z - c) <= ROAD_HALF) return true;
  }
  return false;
}

/** The nearest street centre line to a coordinate, for AI that wants to rejoin the road. */
export function nearestStreet(value) {
  let best = STREET_COORDS[0];
  for (const c of STREET_COORDS) if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  return best;
}

/* ------------------------------------------------------------------ textures */

/** A building facade: painted plaster with a grid of windows, some lit for the evening. */
function facadeTexture(rng, base, trim) {
  return new THREE.CanvasTexture(paintCanvas(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = trim;
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 12, w, 12);
    const cols = 4;
    const rows = 8;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let ry = 0; ry < rows; ry += 1) {
        const x = 10 + cx * 29;
        const y = 20 + ry * 28;
        const lit = rng() < 0.42;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd98c' : '#bfe6ff') : '#2c3444';
        g.fillRect(x, y, 18, 20);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, y + 9, 18, 2);
        g.fillStyle = trim;
        g.fillRect(x - 2, y + 20, 22, 3);
      }
    }
  }));
}

/** A glowing shop or hotel sign: bright lettering on clear, meant for an emissive plane. */
function signTexture(text, colour) {
  const canvas = paintCanvas(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '900 64px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = colour;
    g.shadowBlur = 26;
    g.fillStyle = colour;
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
  });
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/** The city floor: pavement blocks, asphalt avenues with lane dashes and crossings. */
function groundTexture() {
  const SIZE = 2048;
  const EXTENT = 264; // world units the canvas covers, centred on 0
  const px = (v) => ((v + EXTENT / 2) / EXTENT) * SIZE;
  const pw = (v) => (v / EXTENT) * SIZE;
  return new THREE.CanvasTexture(paintCanvas(SIZE, SIZE, (g) => {
    g.fillStyle = '#77685c';
    g.fillRect(0, 0, SIZE, SIZE);
    // Block pavement, slightly varied per block.
    const rng = createRandom(777);
    const edges = [-124, -98, -86, -52, -40, -6, 6, 40, 52, 86, 98, 124];
    for (let i = 0; i < edges.length; i += 2) {
      for (let j = 0; j < edges.length; j += 2) {
        const shade = 0.92 + rng() * 0.16;
        g.fillStyle = `rgb(${Math.round(126 * shade)},${Math.round(108 * shade)},${Math.round(92 * shade)})`;
        g.fillRect(px(edges[i]), px(edges[j]), pw(edges[i + 1] - edges[i]), pw(edges[j + 1] - edges[j]));
      }
    }
    // Sidewalks: pale bands around every street.
    g.fillStyle = '#a08b78';
    for (const c of STREET_COORDS) {
      g.fillRect(px(c - 9), px(-124), pw(18), pw(248));
      g.fillRect(px(-124), px(c - 9), pw(248), pw(18));
    }
    // Asphalt.
    g.fillStyle = '#33303a';
    for (const c of STREET_COORDS) {
      g.fillRect(px(c - ROAD_HALF), px(-124), pw(ROAD_HALF * 2), pw(248));
      g.fillRect(px(-124), px(c - ROAD_HALF), pw(248), pw(ROAD_HALF * 2));
    }
    // Lane dashes.
    g.fillStyle = '#e8c87a';
    for (const c of STREET_COORDS) {
      for (let v = -120; v < 124; v += 10) {
        if (STREET_COORDS.some((o) => Math.abs(v - o) < 10)) continue;
        g.fillRect(px(c - 0.35), px(v), pw(0.7), pw(5));
        g.fillRect(px(v), px(c - 0.35), pw(5), pw(0.7));
      }
    }
    // Crossings at intersections.
    g.fillStyle = 'rgba(240,240,235,0.75)';
    for (const a of STREET_COORDS) {
      for (const b of STREET_COORDS) {
        for (let s = -5; s <= 5; s += 2.5) {
          g.fillRect(px(a + s - 0.8), px(b - ROAD_HALF - 2.2), pw(1.6), pw(2.2));
          g.fillRect(px(a + s - 0.8), px(b + ROAD_HALF), pw(1.6), pw(2.2));
          g.fillRect(px(a - ROAD_HALF - 2.2), px(b + s - 0.8), pw(2.2), pw(1.6));
          g.fillRect(px(a + ROAD_HALF), px(b + s - 0.8), pw(2.2), pw(1.6));
        }
      }
    }
    // The promenade along the beach.
    g.fillStyle = '#b59a7d';
    g.fillRect(px(116), px(-124), pw(10), pw(248));
  }));
}

/** Soft round glow sprite texture, used for lamps and the sun. */
function glowTexture(inner, outer) {
  return new THREE.CanvasTexture(paintCanvas(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }));
}

/* ------------------------------------------------------------------ pieces */

const PASTELS = ['#f2d5b8', '#eec39f', '#e8a98f', '#d98e7e', '#c9d6b8', '#a8c8bc', '#f0e0c0', '#e5b8c8', '#d9c29a', '#bcd0e0'];
const NEON = ['#ff5e8a', '#ffb347', '#4ee6c3', '#6db9ff', '#ffd23e', '#ff7a4e'];
const SIGN_WORDS = ['BAR MAREA', 'CAFÉ SOL', 'HOTEL', 'TABACO', 'DISCO LUNA', 'PANADERÍA', 'FARMACIA', 'CINE AZAHAR', 'BAR EL FARO', 'HELADERÍA', 'TALLER RICO', 'PESCADERÍA'];

function makeBuilding(rng, w, d, hgt, facadeMats) {
  const group = new THREE.Group();
  const mat = pick(rng, facadeMats);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), mat);
  body.position.y = hgt / 2;
  group.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.7, 0.6, d + 0.7),
    new THREE.MeshLambertMaterial({ color: 0x8a5a44 }),
  );
  roof.position.y = hgt + 0.3;
  group.add(roof);
  // Rooftop clutter: a water tank or an air-con box reads well against the sky.
  if (rng() < 0.6) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 2.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x9a8f84 }),
    );
    tank.position.set(randRange(rng, -w / 4, w / 4), hgt + 1.7, randRange(rng, -d / 4, d / 4));
    group.add(tank);
  }
  return group;
}

function makePalm(rng) {
  const group = new THREE.Group();
  const lean = randRange(rng, -0.14, 0.14);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4e });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6), trunkMat);
  trunk.position.y = 3.2;
  trunk.rotation.z = lean;
  group.add(trunk);
  const topX = -Math.sin(lean) * 6.2;
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 3.6), frondMat);
    const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
    frond.position.set(topX + Math.cos(a) * 1.5, 6.55 - 0.35, Math.sin(a) * 1.5);
    frond.rotation.y = -a;
    frond.rotation.z = 0.5;
    group.add(frond);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6a4a2e }));
  nut.position.set(topX, 6.25, 0);
  group.add(nut);
  return group;
}

function makeLamp(glowTex) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
  pole.position.y = 3;
  group.add(pole);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  );
  head.position.y = 6;
  group.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc98a, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  glow.scale.set(4.5, 4.5, 1);
  glow.position.y = 6;
  group.add(glow);
  return group;
}

function makeBoat(rng) {
  const group = new THREE.Group();
  const hullColour = pick(rng, [0xf2f0ea, 0x3f7fbf, 0xe05a4e, 0x2ea89a]);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 2.6), new THREE.MeshLambertMaterial({ color: hullColour }));
  hull.position.y = 0.6;
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 3, 1), new THREE.MeshLambertMaterial({ color: hullColour }));
  bow.rotation.y = Math.PI;
  bow.position.set(4.1, 0.6, 0);
  group.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.9), new THREE.MeshLambertMaterial({ color: 0xf7f4ec }));
  cabin.position.set(-0.6, 2, 0);
  group.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.4, 5), new THREE.MeshLambertMaterial({ color: 0x8a6a4e }));
  mast.position.set(1.2, 4.6, 0);
  group.add(mast);
  return group;
}

/* ------------------------------------------------------------------ build */

export function createWorld(ctx) {
  const rng = createRandom(ctx.seed ^ 0x9e3779b9);
  const scene = ctx.scene;
  const colliders = [];
  const parkingBays = [];
  const animated = { water: null, beacon: null, palms: [] };

  /* Sky, sun and light: golden hour, fixed forever over Puerto Azahar. */
  const skyTex = new THREE.CanvasTexture(paintCanvas(64, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#26355e');
    grad.addColorStop(0.42, '#7a4a7e');
    grad.addColorStop(0.62, '#e2603f');
    grad.addColorStop(0.78, '#ff9a5a');
    grad.addColorStop(0.92, '#ffd9a0');
    grad.addColorStop(1, '#ffe9c0');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }));
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(640, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const glowTex = glowTexture('rgba(255,240,210,1)', 'rgba(255,160,80,0.35)');
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe2ae, transparent: true, fog: false, depthWrite: false }));
  sun.scale.set(190, 190, 1);
  sun.position.set(430, 62, -120);
  scene.add(sun);

  const sunLight = new THREE.DirectionalLight(0xffb37a, 2.4);
  sunLight.position.set(180, 90, -60);
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0xffdcb0, 0x51384a, 0.95));
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.35);
  fill.position.set(-120, 140, 120);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xdd8a5e, 150, 560);

  // A few slow pink clouds.
  const cloudTex = glowTexture('rgba(255,205,200,0.85)', 'rgba(255,150,140,0.25)');
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
    cloud.scale.set(randRange(rng, 120, 240), randRange(rng, 22, 40), 1);
    cloud.position.set(randRange(rng, -420, 460), randRange(rng, 120, 210), randRange(rng, -380, 300));
    scene.add(cloud);
  }

  /* Ground, beach and sea. */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(264, 264),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(560, 700), new THREE.MeshLambertMaterial({ color: 0x77685c }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.05, 0);
  scene.add(apron);

  const sandTex = new THREE.CanvasTexture(paintCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#e8c88f';
    g.fillRect(0, 0, w, h);
    const r2 = createRandom(42);
    for (let i = 0; i < 2600; i += 1) {
      g.fillStyle = r2() < 0.5 ? 'rgba(190,150,90,0.25)' : 'rgba(255,240,200,0.25)';
      g.fillRect(r2() * w, r2() * h, 2, 2);
    }
  }));
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(3, 24);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(30, 340), new THREE.MeshLambertMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(139, 0.02, 0);
  scene.add(sand);

  const waterTex = new THREE.CanvasTexture(paintCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#2a7d9e';
    g.fillRect(0, 0, w, h);
    const r2 = createRandom(99);
    for (let i = 0; i < 300; i += 1) {
      g.strokeStyle = `rgba(255,${180 + Math.floor(r2() * 60)},140,${0.12 + r2() * 0.2})`;
      g.lineWidth = 1.5;
      const y = r2() * h;
      g.beginPath();
      g.moveTo(r2() * w, y);
      g.lineTo(r2() * w, y);
      g.stroke();
    }
  }));
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 12);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 420),
    new THREE.MeshPhongMaterial({ map: waterTex, color: 0xe8a06a, shininess: 90, specular: 0xffcc99 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X + 168, 0.12, 0);
  scene.add(water);
  animated.water = waterTex;

  /* Buildings block by block. */
  const facadeMats = PASTELS.map((c) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, c, '#8a5a44') }));
  const edges = [-124, -98, -86, -52, -40, -6, 6, 40, 52, 86, 98, 124];
  const spans = [];
  for (let i = 0; i < edges.length; i += 2) spans.push([edges[i] + 3, edges[i + 1] - 3]);

  const namedSigns = [
    { at: PLACES.hotelAzahar, text: 'HOTEL AZAHAR', colour: '#ffd23e' },
    { at: PLACES.cafeSol, text: 'CAFÉ SOL', colour: '#4ee6c3' },
    { at: PLACES.policeStation, text: 'POLICÍA', colour: '#6db9ff' },
    { at: PLACES.hospital, text: 'HOSPITAL', colour: '#ff8a8a' },
    { at: PLACES.garage, text: 'TALLER RICO', colour: '#ff7a4e' },
    { at: PLACES.fishMarket, text: 'MERCADO', colour: '#ffb347' },
  ];

  for (const [bx0, bx1] of spans) {
    for (const [bz0, bz1] of spans) {
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      const roll = rng();
      const isPlaza = (cx === -23 && cz === 23);
      const isMarket = (cx > 90 && cz < -10 && cz > -40);
      if (isPlaza) {
        // Plaza de la Fuente: a fountain, palms and benches, no buildings.
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 0.9, 18), new THREE.MeshLambertMaterial({ color: 0xb8a888 }));
        basin.position.set(cx, 0.45, cz);
        scene.add(basin);
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.3, 18), new THREE.MeshPhongMaterial({ color: 0x3f9ec9, shininess: 80 }));
        pool.position.set(cx, 0.95, cz);
        scene.add(pool);
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 3.4, 6), new THREE.MeshLambertMaterial({ color: 0xcfeaf5 }));
        jet.position.set(cx, 2.4, cz);
        scene.add(jet);
        colliders.push({ x0: cx - 5, z0: cz - 5, x1: cx + 5, z1: cz + 5 });
        for (let i = 0; i < 5; i += 1) {
          const palm = makePalm(rng);
          palm.position.set(cx + randRange(rng, -11, 11), 0, cz + randRange(rng, -11, 11));
          scene.add(palm);
          animated.palms.push(palm);
        }
        continue;
      }
      if (roll < 0.14) {
        // Open parking: painted bays the vehicles module fills with parked cars.
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0, bz1 - bz0), new THREE.MeshLambertMaterial({ color: 0x3c3942 }));
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.03, cz);
        scene.add(lot);
        for (let lx = bx0 + 4; lx < bx1 - 3; lx += 6.5) {
          parkingBays.push({ x: lx, z: bz0 + 4, heading: Math.PI / 2 });
          parkingBays.push({ x: lx, z: bz1 - 4, heading: -Math.PI / 2 });
        }
        continue;
      }
      // One to four buildings share the block.
      const lots = roll < 0.4 ? 1 : roll < 0.75 ? 2 : 4;
      const cellW = (bx1 - bx0) / (lots === 4 ? 2 : lots);
      const cellD = (bz1 - bz0) / (lots === 4 ? 2 : 1);
      for (let li = 0; li < lots; li += 1) {
        const lx = bx0 + cellW * (lots === 4 ? li % 2 : li) + cellW / 2;
        const lz = bz0 + cellD * (lots === 4 ? Math.floor(li / 2) : 0) + cellD / 2;
        const centrePull = 1 - Math.min(1, Math.hypot(lx, lz) / 170);
        const hgt = Math.round(randRange(rng, 9, 17) + centrePull * randRange(rng, 4, 22));
        const w = cellW - randRange(rng, 3, 6);
        const d = cellD - randRange(rng, 3, 6);
        const building = makeBuilding(rng, w, d, hgt, facadeMats);
        building.position.set(lx, 0, lz);
        scene.add(building);
        colliders.push({ x0: lx - w / 2, z0: lz - d / 2, x1: lx + w / 2, z1: lz + d / 2 });
        // Ground-floor shops on street faces get neon.
        if (rng() < 0.5) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(w * 0.8, 11), 2.4),
            new THREE.MeshBasicMaterial({ map: signTexture(pick(rng, SIGN_WORDS), pick(rng, NEON)), transparent: true, side: THREE.DoubleSide }),
          );
          const face = randInt(rng, 0, 3);
          const dist = (face < 2 ? d : w) / 2 + 0.15;
          sign.position.set(lx + (face === 2 ? dist : face === 3 ? -dist : 0), 3.6, lz + (face === 0 ? dist : face === 1 ? -dist : 0));
          if (face >= 2) sign.rotation.y = Math.PI / 2;
          scene.add(sign);
        }
      }
      // A named place in this block gets its landmark sign on a fresh tower.
      for (const named of namedSigns) {
        if (Math.abs(named.at.x - cx) < 20 && Math.abs(named.at.z - cz) < 20) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(15, 3.4),
            new THREE.MeshBasicMaterial({ map: signTexture(named.text, named.colour), transparent: true, side: THREE.DoubleSide }),
          );
          sign.position.set(named.at.x, 13.5, named.at.z - 14.6);
          scene.add(sign);
        }
      }
      if (isMarket) {
        // Fish-market stalls: striped awnings on poles along the block's east face.
        for (let s = 0; s < 4; s += 1) {
          const stall = new THREE.Group();
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(5.4, 0.25, 4.4),
            new THREE.MeshLambertMaterial({ color: s % 2 ? 0xe05a4e : 0xf2f0ea }),
          );
          awning.position.y = 2.7;
          awning.rotation.z = 0.16;
          stall.add(awning);
          const counter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.6), new THREE.MeshLambertMaterial({ color: 0x9a7a56 }));
          counter.position.y = 0.55;
          stall.add(counter);
          stall.position.set(bx1 + 6.5, 0, bz0 + 5 + s * 7.5);
          scene.add(stall);
          colliders.push({ x0: stall.position.x - 2.6, z0: stall.position.z - 2, x1: stall.position.x + 2.6, z1: stall.position.z + 2 });
        }
      }
    }
  }

  /* Palms along the promenade and the central avenue; lamps on every street. */
  for (let z = -118; z <= 118; z += 13) {
    const palm = makePalm(rng);
    palm.position.set(120.5, 0, z + randRange(rng, -2, 2));
    scene.add(palm);
    animated.palms.push(palm);
    if (z % 26 === 0) {
      const palm2 = makePalm(rng);
      palm2.position.set(randRange(rng, 128, 146), 0, z + 6);
      scene.add(palm2);
      animated.palms.push(palm2);
    }
  }
  for (const c of STREET_COORDS) {
    for (let v = -112; v <= 112; v += 28) {
      const lampA = makeLamp(glowTex);
      lampA.position.set(c + 7.6, 0, v);
      scene.add(lampA);
      const lampB = makeLamp(glowTex);
      lampB.position.set(v, 0, c - 7.6);
      scene.add(lampB);
    }
  }

  /* The marina: a pier reaching into the water, moored boats, the lighthouse beyond. */
  const pier = new THREE.Mesh(new THREE.BoxGeometry(38, 0.7, 9), new THREE.MeshLambertMaterial({ color: 0x9a7a56 }));
  pier.position.set(WATER_X + 17, 0.55, PLACES.marina.z);
  scene.add(pier);
  for (let i = 0; i < 4; i += 1) {
    const boat = makeBoat(rng);
    boat.position.set(WATER_X + randRange(rng, 4, 30), 0.25, PLACES.marina.z + (i % 2 ? 9 : -9));
    boat.rotation.y = randRange(rng, -0.2, 0.2);
    scene.add(boat);
  }
  const lighthouse = new THREE.Group();
  const lhBody = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 15, 10), new THREE.MeshLambertMaterial({ color: 0xf2f0ea }));
  lhBody.position.y = 7.5;
  lighthouse.add(lhBody);
  const lhBand = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.6, 3.4, 10), new THREE.MeshLambertMaterial({ color: 0xd93a2e }));
  lhBand.position.y = 10.6;
  lighthouse.add(lhBand);
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lhLamp.position.y = 15.8;
  lighthouse.add(lhLamp);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(-13, 15.8, 0);
  lighthouse.add(beam);
  lighthouse.position.set(196, 0, -118);
  scene.add(lighthouse);
  animated.beacon = lighthouse;

  /* Dockside clutter near the old docks: crates, barrels and a container or two. */
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8793f });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
  for (let i = 0; i < 16; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), crateMat);
    crate.position.set(randRange(rng, 96, 118), 0.8 + (rng() < 0.3 ? 1.6 : 0), randRange(rng, 92, 116));
    crate.rotation.y = rng() * Math.PI;
    scene.add(crate);
  }
  for (let i = 0; i < 10; i += 1) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 8), barrelMat);
    barrel.position.set(randRange(rng, 94, 116), 0.65, randRange(rng, 90, 114));
    scene.add(barrel);
  }
  const container = new THREE.Mesh(new THREE.BoxGeometry(11, 3.4, 3.4), new THREE.MeshLambertMaterial({ color: 0xc2543a }));
  container.position.set(104, 1.7, 108);
  container.rotation.y = 0.4;
  scene.add(container);
  colliders.push({ x0: 98, z0: 105, x1: 110, z1: 111 });

  return {
    colliders,
    parkingBays,
    /** Slow life: the sea shimmers toward the sun, the lighthouse sweeps, palms breathe. */
    update(dt, t) {
      animated.water.offset.x = (t * 0.014) % 1;
      animated.water.offset.y = Math.sin(t * 0.24) * 0.02;
      if (animated.beacon) animated.beacon.rotation.y = t * 0.35;
      for (let i = 0; i < animated.palms.length; i += 1) {
        animated.palms[i].rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.012;
      }
    },
  };
}
