// shots.js — the four screenshot scenes behind ?shot=start|drive|chase|mission. Each one
// stages the real game — the actual world, cars, police and mission state, nothing faked —
// and lets main.js run its normal loop in fixed steps, so the frame the screenshot captures
// is a frame the game itself produced. start: the title screen over a sunset vista of the
// city and the sea. drive: Nico at the wheel on the avenue at dusk. chase: four stars, three
// cruisers behind and a roadblock ahead. mission: on foot, the gold beacon of the first
// errand ahead, Lucia's words still on the subtitle bar.

import * as THREE from '../vendor/three.module.min.js';
import { PLACES } from './world.js';

function hideTitleShowHud(ctx) {
  document.getElementById('title-screen').classList.remove('on');
  ctx.hud.show();
}

function putPlayerInCar(ctx, car, speed) {
  const player = ctx.player;
  car.driver = 'player';
  car.parked = false;
  car.ownedByPlayer = true;
  car.speed = speed;
  player.inCar = true;
  player.car = car;
  player.group.visible = false;
  player.pos.copy(car.pos);
  player.camYaw = car.heading;
  player.camPitch = 0.3;
  ctx.camera.position.set(
    car.pos.x - Math.sin(car.heading) * 11,
    4.2,
    car.pos.z - Math.cos(car.heading) * 11,
  );
}

export function stageShot(name, ctx) {
  if (name === 'drive') {
    hideTitleShowHud(ctx);
    ctx.state = 'play';
    // Eastbound on the grand avenue (z = 0), in the right-hand lane, mid-evening traffic.
    const car = ctx.vehicles.spawnCar('sedan', -34, -2.9, Math.PI / 2, 0x3f7fbf);
    putPlayerInCar(ctx, car, 13);
    const ahead1 = ctx.vehicles.spawnCar('taxi', 6, -2.9, Math.PI / 2);
    ahead1.parked = false;
    const ahead2 = ctx.vehicles.spawnCar('sedan', -12, 2.9, -Math.PI / 2, 0xe05a4e);
    ahead2.parked = false;
    ctx.vehicles.spawnCar('hatch', -52, -8.2, Math.PI / 2, 0x74c69d);
    return;
  }
  if (name === 'chase') {
    hideTitleShowHud(ctx);
    ctx.state = 'play';
    // Southbound on the east avenue with the whole portuaria behind him.
    const car = ctx.vehicles.spawnCar('sports', 48.9, 34, Math.PI, 0xe05a4e);
    putPlayerInCar(ctx, car, 17);
    const spots = [[48.2, 47], [51.5, 55], [46.8, 58]];
    for (const [x, z] of spots) {
      const cop = ctx.vehicles.spawnCar('police', x, z, Math.PI);
      cop.driver = 'police';
      cop.parked = false;
      cop.speed = 16;
    }
    ctx.police.setWanted(4);
    ctx.police.makeRoadblock();
    ctx.hud.say('El Faro', 'Four stars, Nico. Whatever you do — do not stop.', 30);
    return;
  }
  if (name === 'mission') {
    hideTitleShowHud(ctx);
    ctx.state = 'play';
    ctx.missions.startMissionByIndex(0);
    // Nico on the promenade street, the fish market and its gold beacon ahead of him.
    ctx.player.pos.set(94, 0, -6);
    ctx.player.heading = Math.atan2(PLACES.fishMarket.x - 94, PLACES.fishMarket.z + 6);
    ctx.player.camYaw = ctx.player.heading;
    ctx.player.camPitch = 0.26;
    ctx.camera.position.set(94 - Math.sin(ctx.player.heading) * 8, 3.4, -6 - Math.cos(ctx.player.heading) * 8);
    return;
  }
  // start (and anything else): the title over the city at golden hour.
  ctx.state = 'title';
  ctx.shotVista = {
    pos: new THREE.Vector3(-108, 31, 92),
    look: new THREE.Vector3(90, 2, -34),
  };
}
