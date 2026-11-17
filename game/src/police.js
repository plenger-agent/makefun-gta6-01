// police.js — the Policía Portuaria and the wanted system they enforce. Crimes add heat;
// heat shows as one to five stars. A crime only counts when somebody could have seen it —
// an officer nearby, or (for loud crimes) a pedestrian — which is why a quiet theft on an
// empty street gets away clean and a shootout outside the market does not. While any officer
// can see the player the heat holds; break line of sight and stay hidden and it drains.
// Cruisers spawn on streets out of sight and hunt the player's position; officers on foot
// run him down and fill the bust meter when they can hold him; at four stars a roadblock
// of parked cruisers waits at the next intersection. Officers at four stars and up shoot.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom, randRange, clamp, turnToward, angleDelta, dist2D } from './util.js';
import { STREET_COORDS, nearestStreet } from './world.js';

const CRIME_HEAT = {
  steal: 75,
  punch: 65,
  shoot: 20,
  hitPed: 75,
  killPed: 170,
  hitCar: 40,
  hitPolice: 120,
  assaultOfficer: 130,
};
const STAR_STEP = 88; // heat per star

function buildOfficer() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x24406e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.76, 0.32), uniform);
  torso.position.y = 1.1;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.32), skin);
  head.position.y = 1.68;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), uniform);
  cap.position.y = 1.88;
  group.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.24), uniform);
  brim.position.set(0, 1.83, 0.28);
  group.add(brim);
  function limb(mat, w, len, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  return {
    group,
    armL: limb(uniform, 0.16, 0.7, -0.4, 1.44),
    armR: limb(uniform, 0.16, 0.7, 0.4, 1.44),
    legL: limb(uniform, 0.2, 0.76, -0.15, 0.74),
    legR: limb(uniform, 0.2, 0.76, 0.15, 0.74),
  };
}

export function createPolice(ctx) {
  const rng = createRandom(ctx.seed ^ 0xb017);
  const cruisers = []; // cars with driver 'police'
  const officers = []; // on-foot officers
  let roadblock = [];
  let roadblockForStars = 0;

  const police = {
    heat: 0,
    wanted: 0,
    seenTimer: 0,
    heatFloor: 0, // missions can hold the heat up (Hot Cargo)
    episode: 0,

    /** Report a crime at a position. Unwitnessed quiet crimes are free. */
    addCrime(kind, pos) {
      if (ctx.state !== 'play') return;
      const loud = kind === 'shoot' || kind === 'killPed' || kind === 'hitPolice';
      let witnessed = false;
      for (const car of cruisers) if (dist2D(car.pos, pos) < (loud ? 70 : 46)) { witnessed = true; break; }
      if (!witnessed) for (const cop of officers) if (cop.alive && dist2D(cop.pos, pos) < (loud ? 55 : 38)) { witnessed = true; break; }
      if (!witnessed && this.wanted > 0) witnessed = true; // already known to the police
      if (!witnessed) {
        for (const ped of ctx.peds.list) {
          if (ped.alive && dist2D(ped.pos, pos) < (loud ? 34 : 17)) { witnessed = true; break; }
        }
      }
      if (!witnessed) return;
      this.heat = Math.min(STAR_STEP * 5 + 40, this.heat + (CRIME_HEAT[kind] ?? 30));
      this.seenTimer = 0;
    },

    /** Force the wanted level (mission beats and screenshot staging). */
    setWanted(stars) {
      this.heat = Math.max(this.heat, stars * STAR_STEP - 10);
      this.wanted = stars;
    },

    clearWanted() {
      this.heat = 0;
      this.wanted = 0;
      this.heatFloor = 0;
      this.seenTimer = 0;
    },

    /** Can any officer or cruiser currently see the player? */
    playerSeen() {
      const p = ctx.player.pos;
      for (const car of cruisers) if (dist2D(car.pos, p) < 52) return true;
      for (const cop of officers) if (cop.alive && dist2D(cop.pos, p) < 34) return true;
      return false;
    },
  };

  function spawnCruiser() {
    // On a street, out of the player's sight but close enough to matter.
    const p = ctx.player.pos;
    for (let tries = 0; tries < 12; tries += 1) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const street = STREET_COORDS[Math.floor(rng() * STREET_COORDS.length)];
      const along = clamp((axis === 'x' ? p.x : p.z) + randRange(rng, 55, 85) * (rng() < 0.5 ? -1 : 1), -112, 112);
      const x = axis === 'x' ? along : street;
      const z = axis === 'x' ? street : along;
      if (Math.hypot(x - p.x, z - p.z) < 48) continue;
      const car = ctx.vehicles.spawnCar('police', x, z, 0);
      car.driver = 'police';
      car.parked = false;
      cruisers.push(car);
      return car;
    }
    return null;
  }

  function spawnOfficer(nearCar) {
    const rig = buildOfficer();
    const x = nearCar ? nearCar.pos.x + randRange(rng, -3, 3) : ctx.player.pos.x + randRange(rng, 20, 30);
    const z = nearCar ? nearCar.pos.z + randRange(rng, -3, 3) : ctx.player.pos.z + randRange(rng, 20, 30);
    rig.group.position.set(x, 0, z);
    ctx.scene.add(rig.group);
    const cop = {
      rig, group: rig.group, pos: rig.group.position,
      heading: 0, health: 60, alive: true, deadTimer: 0,
      shootTimer: randRange(rng, 0.5, 1.6), phase: randRange(rng, 0, 9),
      hurt(amount) {
        if (!this.alive) return;
        this.health -= amount;
        police.addCrime('assaultOfficer', this.pos);
        if (this.health <= 0) { this.alive = false; this.deadTimer = 8; }
      },
    };
    officers.push(cop);
    return cop;
  }

  function makeRoadblock() {
    clearRoadblock();
    const p = ctx.player;
    // The intersection ahead of the player's travel gets two cruisers parked across it.
    const fx = p.inCar ? Math.sin(p.car.heading) : Math.sin(p.heading);
    const fz = p.inCar ? Math.cos(p.car.heading) : Math.cos(p.heading);
    const aheadX = p.pos.x + fx * 55;
    const aheadZ = p.pos.z + fz * 55;
    const ix = nearestStreet(clamp(aheadX, -110, 110));
    const iz = nearestStreet(clamp(aheadZ, -110, 110));
    for (const off of [-3.4, 3.4]) {
      const car = ctx.vehicles.spawnCar('police', ix + off, iz, Math.PI / 2 + randRange(rng, -0.16, 0.16));
      car.driver = null;
      car.parked = true;
      car.isRoadblock = true;
      roadblock.push(car);
    }
    roadblockForStars = police.wanted;
  }

  function clearRoadblock() {
    for (const car of roadblock) ctx.vehicles.removeCar(car);
    roadblock = [];
    roadblockForStars = 0;
  }

  function update(dt, t) {
    /* Heat and stars. */
    const seen = police.playerSeen();
    if (seen) police.seenTimer = 0;
    else police.seenTimer += dt;
    if (police.seenTimer > 5 && police.wanted > 0) {
      police.heat = Math.max(police.heatFloor, police.heat - 7.5 * dt);
    }
    if (police.heat < police.heatFloor) police.heat = police.heatFloor;
    const newWanted = clamp(Math.ceil(police.heat / STAR_STEP), 0, 5);
    if (newWanted !== police.wanted) {
      police.wanted = newWanted;
      if (newWanted === 0) {
        police.episode += 1;
        clearRoadblock();
        ctx.hud.banner('HEAT OFF', 'The Policía Portuaria lose your trail.');
      }
    }

    /* Cruisers: keep as many hunting as there are stars. */
    for (let i = cruisers.length - 1; i >= 0; i -= 1) {
      if (cruisers[i].driver !== 'police') cruisers.splice(i, 1); // stolen or abandoned
    }
    if (police.wanted > 0) {
      while (cruisers.length < police.wanted) {
        if (!spawnCruiser()) break;
      }
    }
    for (let i = cruisers.length - 1; i >= 0; i -= 1) {
      const car = cruisers[i];
      if (police.wanted === 0 && dist2D(car.pos, ctx.player.pos) > 110) {
        ctx.vehicles.removeCar(car);
        cruisers.splice(i, 1);
      }
    }

    /* Cruiser driving: pure pursuit of the player, patient near a player on foot. */
    for (const car of cruisers) {
      const target = ctx.player.pos;
      const d = dist2D(car.pos, target);
      const desired = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
      const steer = clamp(angleDelta(car.heading, desired) * 2.4, -1, 1);
      let throttle = 1;
      if (!ctx.player.inCar && d < 9) throttle = 0.25; // circle a suspect on foot, don't flatten him
      if (car.health <= 0) throttle = 0;
      ctx.vehicles.drive(car, dt, throttle, steer, false);
      // An officer bails out when close to a player on foot at higher heat.
      if (!ctx.player.inCar && d < 11 && police.wanted >= 2 && officers.filter((o) => o.alive).length < 2 && rng() < dt * 0.25) {
        car.driver = null;
        car.parked = true;
        cruisers.splice(cruisers.indexOf(car), 1);
        spawnOfficer(car);
        spawnOfficer(car);
      }
    }

    /* Officers on foot. */
    if (police.wanted >= 2 && !ctx.player.inCar && officers.filter((o) => o.alive).length === 0 && cruisers.length === 0) {
      spawnOfficer(null);
    }
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      const cop = officers[i];
      if (!cop.alive) {
        cop.deadTimer -= dt;
        cop.group.rotation.x = Math.max(-Math.PI / 2, cop.group.rotation.x - dt * 5);
        if (cop.deadTimer <= 0) {
          ctx.scene.remove(cop.group);
          officers.splice(i, 1);
        }
        continue;
      }
      if (police.wanted === 0 && dist2D(cop.pos, ctx.player.pos) > 60) {
        ctx.scene.remove(cop.group);
        officers.splice(i, 1);
        continue;
      }
      const target = ctx.player.pos;
      const d = dist2D(cop.pos, target);
      const speed = 6.9;
      cop.heading = turnToward(cop.heading, Math.atan2(target.x - cop.pos.x, target.z - cop.pos.z), dt * 9);
      if (d > 1.6) {
        cop.pos.x += Math.sin(cop.heading) * speed * dt;
        cop.pos.z += Math.cos(cop.heading) * speed * dt;
      }
      cop.phase += dt * 12;
      const swing = Math.sin(cop.phase) * 0.6;
      cop.rig.legL.rotation.x = swing;
      cop.rig.legR.rotation.x = -swing;
      cop.rig.armL.rotation.x = -swing * 0.7;
      cop.group.rotation.y = cop.heading;
      /* The bust: hold the player (or his stopped car) and the meter fills. */
      const playerStill = ctx.player.inCar ? Math.abs(ctx.player.car.speed) < 1.2 : ctx.player.speedNow < 2.2;
      const reach = ctx.player.inCar ? 3.4 : 1.9;
      if (d < reach && playerStill && police.wanted > 0) {
        ctx.player.bustMeter += dt;
        cop.rig.armR.rotation.x = -2.4;
        if (ctx.player.bustMeter > 1.6) {
          ctx.player.bustMeter = 0;
          ctx.gameOver('busted');
        }
      }
      /* At four stars and up, officers shoot at an armed, resisting player. */
      if (police.wanted >= 4 && d < 30 && d > 3 && ctx.combat.armed) {
        cop.shootTimer -= dt;
        cop.rig.armR.rotation.x = -1.35;
        if (cop.shootTimer <= 0) {
          cop.shootTimer = randRange(rng, 1.1, 1.9);
          ctx.audio.gunshot();
          if (rng() < clamp(0.55 - d * 0.011, 0.12, 0.5)) ctx.player.hurt(6);
        }
      } else {
        cop.rig.armR.rotation.x = swing * 0.7;
      }
    }

    /* Roadblocks at four stars. */
    if (police.wanted >= 4 && roadblockForStars < 4) makeRoadblock();
    if (police.wanted < 3 && roadblock.length) clearRoadblock();

    ctx.vehicles.updateLights(dt, t);
    ctx.audio.siren(police.wanted > 0 && (cruisers.length > 0 || officers.length > 0), dt);
  }

  police.cruisers = cruisers;
  police.officers = officers;
  police.makeRoadblock = makeRoadblock;
  police.update = update;
  return police;
}
