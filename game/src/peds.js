// peds.js — the people of Puerto Azahar: strollers on the sidewalks, shoppers crossing at
// the corners, fishermen on the promenade. Each pedestrian walks a sidewalk line beside a
// street, turns at corners, and — this being a crime game — runs screaming when danger
// comes near: a shot fired, a punch thrown, a car mounting the pavement at speed. They have
// health, they can be hurt (the wanted system hears about it), and the fallen stay down for
// a while before the city quietly tidies them away and a fresh stroller takes their place.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom, randRange, pick, clamp, turnToward, dist2D } from './util.js';
import { STREET_COORDS } from './world.js';

const SHIRTS = [0xf2f0ea, 0xff8c42, 0x4ee6c3, 0xff5e8a, 0x6db9ff, 0xf7b731, 0x74c69d, 0xe05a4e, 0xb8a2d9];
const SKIN = [0xf2c49b, 0xc98a5e, 0x8a5a34, 0x6e4226];
const SIDEWALK = 8.4;

function buildPed(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const legs = new THREE.MeshLambertMaterial({ color: pick(rng, [0x33415c, 0x5c4a3a, 0xe8e0cc, 0x704214]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.3), shirt);
  torso.position.y = 1.06;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skin);
  head.position.y = 1.62;
  group.add(head);
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
    armL: limb(shirt, 0.15, 0.64, -0.36, 1.38),
    armR: limb(shirt, 0.15, 0.64, 0.36, 1.38),
    legL: limb(legs, 0.19, 0.72, -0.14, 0.72),
    legR: limb(legs, 0.19, 0.72, 0.14, 0.72),
  };
}

export function createPeds(ctx) {
  const rng = createRandom(ctx.seed ^ 0x9ed5);
  const list = [];
  const COUNT = 26;

  function spawnPed(nearPos) {
    const rig = buildPed(rng);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const street = pick(rng, STREET_COORDS);
    const side = rng() < 0.5 ? -SIDEWALK : SIDEWALK;
    const along = clamp((nearPos ? (axis === 'x' ? nearPos.x : nearPos.z) : 0) + randRange(rng, -80, 80), -118, 118);
    if (axis === 'x') rig.group.position.set(along, 0, street + side);
    else rig.group.position.set(street + side, 0, along);
    ctx.scene.add(rig.group);
    const ped = {
      rig,
      group: rig.group,
      pos: rig.group.position,
      heading: randRange(rng, 0, Math.PI * 2),
      axis, street, side,
      speed: randRange(rng, 1.1, 1.7),
      health: 30,
      alive: true,
      deadTimer: 0,
      fleeTimer: 0,
      fleeFrom: null,
      phase: randRange(rng, 0, 9),
      hurt(amount, fromPos) {
        if (!this.alive) return;
        this.health -= amount;
        this.fleeFrom = fromPos;
        this.fleeTimer = 3.2;
        if (this.health <= 0) {
          this.alive = false;
          this.deadTimer = 9;
          ctx.police.addCrime('killPed', this.pos);
        } else {
          ctx.police.addCrime('hitPed', this.pos);
        }
      },
    };
    list.push(ped);
    return ped;
  }

  for (let i = 0; i < COUNT; i += 1) spawnPed(ctx.player.pos);

  /** Everyone within `radius` of a frightening event runs from it. */
  function panicAt(pos, radius) {
    for (const ped of list) {
      if (ped.alive && dist2D(ped.pos, pos) < radius) {
        ped.fleeFrom = pos;
        ped.fleeTimer = Math.max(ped.fleeTimer, 2.6);
      }
    }
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const ped = list[i];
      if (!ped.alive) {
        ped.deadTimer -= dt;
        ped.group.rotation.x = Math.max(-Math.PI / 2, ped.group.rotation.x - dt * 5);
        ped.group.position.y = Math.max(-0.25, ped.group.position.y - dt * 0.05);
        if (ped.deadTimer <= 0) {
          ctx.scene.remove(ped.group);
          list.splice(i, 1);
          spawnPed(ctx.player.pos);
        }
        continue;
      }
      // Recycle strollers who have wandered far from the action.
      if (dist2D(ped.pos, ctx.player.pos) > 210) {
        const axis = rng() < 0.5 ? 'x' : 'z';
        ped.axis = axis;
        ped.street = pick(rng, STREET_COORDS);
        ped.side = rng() < 0.5 ? -SIDEWALK : SIDEWALK;
        const along = clamp((axis === 'x' ? ctx.player.pos.x : ctx.player.pos.z) + randRange(rng, 40, 90) * (rng() < 0.5 ? -1 : 1), -118, 118);
        if (axis === 'x') ped.pos.set(along, 0, ped.street + ped.side);
        else ped.pos.set(ped.street + ped.side, 0, along);
      }

      let moveX = 0;
      let moveZ = 0;
      let speed = ped.speed;
      if (ped.fleeTimer > 0 && ped.fleeFrom) {
        ped.fleeTimer -= dt;
        const d = Math.max(0.6, dist2D(ped.pos, ped.fleeFrom));
        moveX = (ped.pos.x - ped.fleeFrom.x) / d;
        moveZ = (ped.pos.z - ped.fleeFrom.z) / d;
        speed = 5.6;
        // Raised arms: the universal Azahar sign for "not my problem".
        ped.rig.armL.rotation.x = -2.6;
        ped.rig.armR.rotation.x = -2.6;
      } else {
        ped.rig.armL.rotation.x = 0;
        ped.rig.armR.rotation.x = 0;
        // Stroll the sidewalk; at a crossing street, sometimes turn onto it.
        if (ped.axis === 'x') moveX = Math.sign(Math.cos(ped.heading)) || 1;
        else moveZ = Math.sign(Math.cos(ped.heading)) || 1;
        // Simpler: keep a signed direction per ped on its axis.
        if (ped.dir === undefined) ped.dir = rng() < 0.5 ? 1 : -1;
        if (ped.axis === 'x') { moveX = ped.dir; moveZ = 0; } else { moveX = 0; moveZ = ped.dir; }
        const along = ped.axis === 'x' ? ped.pos.x : ped.pos.z;
        for (const cross of STREET_COORDS) {
          if (Math.abs(along - cross) < 0.8 && rng() < 0.012) {
            // Turn the corner: swap axis, adopt the crossing street's sidewalk.
            const oldStreet = ped.street;
            ped.street = cross;
            ped.axis = ped.axis === 'x' ? 'z' : 'x';
            ped.side = (rng() < 0.5 ? -SIDEWALK : SIDEWALK);
            if (ped.axis === 'x') ped.pos.z = ped.street + ped.side;
            else ped.pos.x = ped.street + ped.side;
            ped.dir = rng() < 0.5 ? 1 : -1;
            void oldStreet;
            break;
          }
        }
        if (along > 120) ped.dir = -1;
        if (along < -120) ped.dir = 1;
        // Keep to the sidewalk line.
        if (ped.axis === 'x') ped.pos.z += ((ped.street + ped.side) - ped.pos.z) * Math.min(1, dt * 3);
        else ped.pos.x += ((ped.street + ped.side) - ped.pos.x) * Math.min(1, dt * 3);
      }
      const targetHeading = Math.atan2(moveX, moveZ);
      ped.heading = turnToward(ped.heading, targetHeading, dt * 8);
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      ped.pos.x = clamp(ped.pos.x, -122, 148);
      ped.pos.z = clamp(ped.pos.z, -122, 122);
      // A car coming fast and close is worth running from even before it hits anyone.
      for (const car of ctx.vehicles.list) {
        if (car.driver && Math.abs(car.speed) > 9 && dist2D(ped.pos, car.pos) < 6) {
          ped.fleeFrom = car.pos;
          ped.fleeTimer = Math.max(ped.fleeTimer, 1.6);
        }
      }
      // Animate.
      ped.phase += dt * (speed > 3 ? 12 : 7);
      const swing = Math.sin(ped.phase) * (speed > 3 ? 0.7 : 0.45);
      ped.rig.legL.rotation.x = swing;
      ped.rig.legR.rotation.x = -swing;
      if (ped.fleeTimer <= 0) {
        ped.rig.armL.rotation.x = -swing * 0.7;
        ped.rig.armR.rotation.x = swing * 0.7;
      }
      ped.group.rotation.y = ped.heading;
    }
  }

  return { list, panicAt, update };
}
