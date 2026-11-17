// vehicles.js — every car in Puerto Azahar is built here from boxes and cylinders: sedans,
// hatchbacks, a low sports coupé, panel vans, yellow taxis and the white-and-black cruisers
// of the Policía Portuaria. The module owns the car list, the arcade driving physics (shared
// by the player, the traffic and the police — only the hands on the wheel differ), parked
// cars for the streets and parking lots, and the enter/steal/exit bookkeeping.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom, randRange, pick, clamp, collideCircle, dist2D } from './util.js';
import { STREET_COORDS, ROAD_HALF } from './world.js';

/** Per-type shape and pace. length/width in metres, topSpeed in m/s. */
export const CAR_TYPES = {
  sedan: { length: 4.3, width: 1.85, height: 0.62, cabin: 0.52, topSpeed: 31, accel: 13, name: 'Berlina sedan' },
  hatch: { length: 3.7, width: 1.75, height: 0.66, cabin: 0.6, topSpeed: 27, accel: 12, name: 'Utilitario hatchback' },
  sports: { length: 4.4, width: 1.95, height: 0.44, cabin: 0.4, topSpeed: 42, accel: 19, name: 'Fuego GT coupé' },
  van: { length: 5.1, width: 2.0, height: 1.5, cabin: 0.2, topSpeed: 24, accel: 9, name: 'Furgoneta van' },
  taxi: { length: 4.3, width: 1.85, height: 0.62, cabin: 0.52, topSpeed: 30, accel: 13, name: 'Taxi Azahar' },
  police: { length: 4.5, width: 1.9, height: 0.6, cabin: 0.52, topSpeed: 36, accel: 16, name: 'Policía cruiser' },
};
const PAINT = [0xe05a4e, 0x3f7fbf, 0xf2c14e, 0x2ea89a, 0xf2f0ea, 0x8a5fb0, 0xe88ca0, 0x4a4a55, 0x74c69d, 0xff8c42];

function buildCarMesh(type, colour) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colour });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1c2a3a, shininess: 90 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), paint);
  body.position.y = 0.38 + spec.height / 2;
  group.add(body);

  if (type === 'van') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, 0.62, 1.1), glass);
    cab.position.set(0, 0.38 + spec.height + 0.28, spec.length / 2 - 0.75);
    group.add(cab);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.86, spec.cabin, spec.length * 0.48), glass);
    cabin.position.set(0, 0.38 + spec.height + spec.cabin / 2 - 0.04, -spec.length * 0.05);
    group.add(cabin);
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 0.08, 0.42), dark);
    spoiler.position.set(0, 1.06, -spec.length / 2 + 0.3);
    group.add(spoiler);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffe98a }));
    sign.position.set(0, 0.38 + spec.height + spec.cabin + 0.1, -spec.length * 0.05);
    group.add(sign);
  }
  // Headlights and tail lights: lit boxes, cheap and very visible at dusk.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(sx * spec.width * 0.32, 0.72, spec.length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    tail.position.set(sx * spec.width * 0.32, 0.76, -spec.length / 2 - 0.02);
    group.add(tail);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9bec9 });
  for (const [wx, wz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx * (spec.width / 2 - 0.05), 0.36, wz * (spec.length / 2 - 0.85));
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    pivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    pivot.add(hub);
    group.add(pivot);
    wheels.push({ pivot, wheel, front: wz > 0 });
  }

  let lightBar = null;
  if (type === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.04, 0.3, spec.length * 0.9), dark);
    stripe.position.y = 0.72;
    group.add(stripe);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 0.38 + spec.height + spec.cabin + 0.08, -spec.length * 0.05);
    group.add(lightBar);
    lightBar.userData = { red, blue };
  }
  return { group, wheels, lightBar };
}

export function createVehicles(ctx) {
  const rng = createRandom(ctx.seed ^ 0x51ab);
  const list = [];

  function spawnCar(type, x, z, heading, colour) {
    const spec = CAR_TYPES[type];
    const paintColour = colour ?? (type === 'taxi' ? 0xf7b731 : type === 'police' ? 0xf2f2f2 : pick(rng, PAINT));
    const { group, wheels, lightBar } = buildCarMesh(type, paintColour);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    ctx.scene.add(group);
    const car = {
      type, spec, group, wheels, lightBar,
      pos: group.position,
      heading, speed: 0, steer: 0,
      health: 100, driver: null, parked: true,
      sirenPhase: randRange(rng, 0, 6),
      radius: Math.max(spec.length, spec.width) / 2,
    };
    list.push(car);
    return car;
  }

  /* Parked cars: fill about half the parking bays, and nose-to-kerb rows along streets. */
  for (const bay of ctx.world.parkingBays) {
    if (rng() < 0.52) {
      const car = spawnCar(pick(rng, ['sedan', 'sedan', 'hatch', 'van', 'sports', 'taxi']), bay.x, bay.z, bay.heading + randRange(rng, -0.05, 0.05));
      car.parked = true;
    }
  }
  for (const c of STREET_COORDS) {
    for (let v = -108; v < 112; v += randRange(rng, 22, 40)) {
      if (STREET_COORDS.some((o) => Math.abs(v - o) < 12)) continue;
      if (rng() < 0.4) continue;
      const side = rng() < 0.5 ? -1 : 1;
      if (rng() < 0.5) spawnCar(pick(rng, ['sedan', 'hatch', 'sedan', 'van']), c + side * (ROAD_HALF + 1.6), v, side > 0 ? 0 : Math.PI);
      else spawnCar(pick(rng, ['sedan', 'hatch', 'sports']), v, c + side * (ROAD_HALF + 1.6), side > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // The gold Fuego GT that mission two is about, parked brazenly outside the Hotel Azahar.
  const goldCar = spawnCar('sports', 84, -58, Math.PI / 2, 0xffc93c);
  goldCar.isMissionCar = true;

  function nearestCar(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of list) {
      if (car.driver === 'traffic' || car.driver === 'police') continue;
      const d = dist2D(pos, car.pos);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function removeCar(car) {
    ctx.scene.remove(car.group);
    const i = list.indexOf(car);
    if (i >= 0) list.splice(i, 1);
  }

  /**
   * The shared driving model. throttle in [-1, 1], steer in [-1, 1] (left positive),
   * handbrake a boolean. Everything with a wheel — player, traffic, police — moves by this.
   */
  function drive(car, dt, throttle, steer, handbrake) {
    const spec = car.spec;
    const disabled = car.health <= 0;
    const power = disabled ? 0 : throttle;
    if (power > 0) car.speed += spec.accel * power * dt * (1 - Math.max(0, car.speed) / (spec.topSpeed * 1.15));
    else if (power < 0) {
      if (car.speed > 0.5) car.speed -= 26 * dt; // braking
      else car.speed = Math.max(car.speed + spec.accel * 0.55 * power * dt, -spec.topSpeed * 0.32); // reverse
    } else {
      car.speed -= car.speed * 0.55 * dt; // engine drag
      if (Math.abs(car.speed) < 0.04) car.speed = 0;
    }
    if (handbrake) car.speed -= car.speed * 2.6 * dt;
    car.speed = clamp(car.speed, -spec.topSpeed * 0.35, spec.topSpeed);
    car.steer = steer;
    const grip = clamp(Math.abs(car.speed) / 6, 0, 1);
    const turnRate = steer * (handbrake ? 1.5 : 1.05) * grip * Math.sign(car.speed || 1);
    car.heading += turnRate * dt * (Math.abs(car.speed) > 0.1 ? 1 : 0);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    car.pos.x += fx * car.speed * dt;
    car.pos.z += fz * car.speed * dt;
    // Buildings are solid; the city edge and the sea are too.
    const before = Math.abs(car.speed);
    if (collideCircle(car.pos, 1.7, ctx.world.colliders)) {
      if (before > 7 && car.driver === 'player') ctx.audio.crash(Math.min(1, before / 30));
      if (before > 12) car.health -= (before - 10) * 1.4;
      car.speed = -car.speed * 0.18;
    }
    car.pos.x = clamp(car.pos.x, -122, 148);
    car.pos.z = clamp(car.pos.z, -122, 122);
    // Cars push each other out of the way rather than overlap.
    for (const other of list) {
      if (other === car) continue;
      const d = dist2D(car.pos, other.pos);
      const min = car.radius + other.radius - 0.7;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (car.pos.x - other.pos.x) / d;
        const nz = (car.pos.z - other.pos.z) / d;
        car.pos.x += nx * push;
        car.pos.z += nz * push;
        if (!other.driver) { other.pos.x -= nx * push; other.pos.z -= nz * push; }
        if (Math.abs(car.speed) > 8 && car.driver === 'player') {
          ctx.audio.crash(0.4);
          if (other.type === 'police') ctx.police.addCrime('hitPolice', car.pos);
          else ctx.police.addCrime('hitCar', car.pos);
        }
        car.speed *= 0.72;
      }
    }
    // Pose the mesh: body roll in corners, wheel spin and front-wheel yaw.
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    car.group.rotation.z = -steer * grip * 0.045 * Math.sign(car.speed || 1);
    for (const w of car.wheels) {
      w.wheel.rotation.x += (car.speed * dt) / 0.36;
      if (w.front) w.pivot.rotation.y = steer * 0.42;
    }
  }

  /** Police light bars strobing — red/blue alternate, the classic portuaria flash. */
  function updateLights(dt, t) {
    for (const car of list) {
      if (!car.lightBar) continue;
      const on = car.driver === 'police' && ctx.police.wanted > 0;
      const phase = Math.floor((t + car.sirenPhase) * 5) % 2 === 0;
      car.lightBar.userData.red.material.color.setHex(on && phase ? 0xff2222 : 0x551111);
      car.lightBar.userData.blue.material.color.setHex(on && !phase ? 0x3388ff : 0x112255);
    }
  }

  return { list, spawnCar, nearestCar, removeCar, drive, updateLights, goldCar };
}
