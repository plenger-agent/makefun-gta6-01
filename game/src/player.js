// player.js — Nico Ferran, the player character: a box-built man in a teal shirt and white
// trousers, animated by swinging limbs, and the third-person camera that follows him. On
// foot he walks and runs with WASD relative to the camera, the mouse orbits (pointer lock
// while playing), and E climbs into the nearest car — stealing it, if it isn't his — or
// climbs out again. While he drives, this module feeds the driving inputs to vehicles.js
// and the camera pulls back behind the car.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, turnToward, angleDelta, collideCircle, dist2D } from './util.js';

function buildNico() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x14b8a6 });
  const pants = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const hairM = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skin);
  head.position.y = 1.72;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.13, 0.37), hairM);
  hair.position.y = 1.9;
  group.add(hair);

  function limb(mat, w, len, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const armL = limb(shirt, 0.17, 0.72, -0.42, 1.46);
  const armR = limb(shirt, 0.17, 0.72, 0.42, 1.46);
  const legL = limb(pants, 0.21, 0.78, -0.16, 0.76);
  const legR = limb(pants, 0.21, 0.78, 0.16, 0.76);
  // The pistol appears in his right hand whenever he is on foot and armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x22242a }));
  gun.position.set(0, -0.78, 0.1);
  armR.add(gun);
  return { group, armL, armR, legL, legR, gun };
}

export function createPlayer(ctx) {
  const rig = buildNico();
  const group = rig.group;
  group.position.set(-50, 0, 57);
  ctx.scene.add(group);

  const player = {
    rig, group,
    pos: group.position,
    heading: 2.6,
    health: 100,
    maxHealth: 100,
    inCar: false,
    car: null,
    speedNow: 0,
    walkPhase: 0,
    armTimer: 0,
    hurtTimer: 0,
    camYaw: 2.6,
    camPitch: 0.32,
    bustMeter: 0,

    hurt(amount) {
      if (ctx.state !== 'play') return;
      this.health -= amount;
      this.hurtTimer = 5;
      ctx.hud.flashDamage();
      if (this.health <= 0) {
        this.health = 0;
        ctx.gameOver('wasted');
      }
    },

    respawn(x, z) {
      this.health = this.maxHealth;
      this.bustMeter = 0;
      if (this.inCar) this.exitCar(true);
      this.pos.set(x, 0, z);
      this.group.visible = true;
    },

    enterCar(car) {
      car.driver = 'player';
      car.parked = false;
      this.inCar = true;
      this.car = car;
      this.group.visible = false;
      ctx.audio.doorSlam();
      if (!car.ownedByPlayer && !car.stolenByPlayer) {
        car.stolenByPlayer = true;
        ctx.police.addCrime('steal', car.pos);
      }
      ctx.hud.prompt(null);
    },

    exitCar(silent = false) {
      const car = this.car;
      if (!car) return;
      car.driver = null;
      if (Math.abs(car.speed) < 0.5) car.parked = true;
      car.speed = 0;
      this.inCar = false;
      this.car = null;
      // Step out on the left side of the car.
      const sx = Math.cos(car.heading);
      const sz = -Math.sin(car.heading);
      this.pos.set(car.pos.x + sx * 2.2, 0, car.pos.z + sz * 2.2);
      collideCircle(this.pos, 0.55, ctx.world.colliders);
      this.group.visible = true;
      if (!silent) ctx.audio.doorSlam();
      ctx.audio.engine(0, false);
    },

    swingArm() {
      this.armTimer = 0.22;
    },

    update(dt) {
      const input = ctx.input;
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      if (this.hurtTimer <= 0 && this.health > 0 && this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + 2.2 * dt);
      }
      // Camera orbit from mouse movement (pointer lock) — consumed once per frame.
      this.camYaw -= input.mouseDX * 0.0032;
      this.camPitch = clamp(this.camPitch + input.mouseDY * 0.0026, 0.04, 1.15);
      input.mouseDX = 0;
      input.mouseDY = 0;

      if (this.inCar && this.car) {
        const car = this.car;
        const throttle = (input.keys.has('KeyW') || input.keys.has('ArrowUp') ? 1 : 0) + (input.keys.has('KeyS') || input.keys.has('ArrowDown') ? -1 : 0);
        const steer = (input.keys.has('KeyA') || input.keys.has('ArrowLeft') ? 1 : 0) + (input.keys.has('KeyD') || input.keys.has('ArrowRight') ? -1 : 0);
        ctx.vehicles.drive(car, dt, throttle, steer, input.keys.has('Space'));
        this.pos.copy(car.pos);
        this.heading = car.heading;
        this.speedNow = Math.abs(car.speed);
        ctx.audio.engine(clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1), true);
        if (input.pressed.has('KeyE')) {
          input.pressed.delete('KeyE');
          if (Math.abs(car.speed) < 6) this.exitCar();
        }
        this.updateCamera(dt, 10.6, 3.6);
        return;
      }

      /* On foot. */
      ctx.audio.engine(0, false);
      const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
      const speed = run ? 7.6 : 4.3;
      let mx = 0;
      let mz = 0;
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) { mx += sin; mz += cos; }
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) { mx -= sin; mz -= cos; }
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) { mx += cos; mz -= sin; }
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) { mx -= cos; mz += sin; }
      const moving = Math.hypot(mx, mz) > 0.01;
      if (moving) {
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
        this.heading = turnToward(this.heading, Math.atan2(mx, mz), dt * 11);
        this.pos.x += mx * speed * dt;
        this.pos.z += mz * speed * dt;
        this.speedNow = speed;
      } else {
        this.speedNow = 0;
      }
      this.pos.x = clamp(this.pos.x, -122, 150);
      this.pos.z = clamp(this.pos.z, -122, 122);
      collideCircle(this.pos, 0.55, ctx.world.colliders);
      // Cars are solid to walk into, too.
      for (const car of ctx.vehicles.list) {
        const d = dist2D(this.pos, car.pos);
        if (d < car.radius + 0.2 && d > 0.001) {
          const push = (car.radius + 0.2 - d);
          this.pos.x += ((this.pos.x - car.pos.x) / d) * push;
          this.pos.z += ((this.pos.z - car.pos.z) / d) * push;
        }
      }
      // Getting run over is bad for you, whoever is driving.
      for (const car of ctx.vehicles.list) {
        if ((car.driver === 'traffic' || car.driver === 'police') && Math.abs(car.speed) > 6 && dist2D(this.pos, car.pos) < 2.1) {
          this.hurt(Math.abs(car.speed) * 0.9);
          const d = Math.max(0.5, dist2D(this.pos, car.pos));
          this.pos.x += ((this.pos.x - car.pos.x) / d) * 2.4;
          this.pos.z += ((this.pos.z - car.pos.z) / d) * 2.4;
        }
      }

      /* Animate the little man. */
      this.walkPhase += dt * (this.speedNow > 5 ? 11 : 7.5) * (this.speedNow > 0 ? 1 : 0);
      const swing = this.speedNow > 0 ? Math.sin(this.walkPhase) * 0.62 : 0;
      rig.legL.rotation.x = swing;
      rig.legR.rotation.x = -swing;
      rig.armL.rotation.x = -swing * 0.8;
      if (this.armTimer > 0) {
        this.armTimer -= dt;
        rig.armR.rotation.x = -1.7 + Math.sin((0.22 - this.armTimer) / 0.22 * Math.PI) * 0.5;
      } else if (ctx.combat.armed) {
        rig.armR.rotation.x = -1.35; // pistol held out toward the camera's aim
      } else {
        rig.armR.rotation.x = swing * 0.8;
      }
      rig.gun.visible = ctx.combat.armed;
      group.rotation.y = this.heading;
      group.position.copy(this.pos);
      group.position.y = this.speedNow > 0 ? Math.abs(Math.sin(this.walkPhase)) * 0.07 : 0;

      /* Enter a car. */
      const near = ctx.vehicles.nearestCar(this.pos, 3.4);
      if (near && ctx.state === 'play') {
        ctx.hud.prompt(`<b>E</b> — ${near.driver === null && near.wasPlayerCar ? 'Get back in' : 'Steal'} the ${near.spec.name}`);
        if (input.pressed.has('KeyE')) {
          input.pressed.delete('KeyE');
          this.enterCar(near);
        }
      } else if (ctx.state === 'play' && !ctx.missions.nearInteract) {
        ctx.hud.prompt(null);
      }
      this.updateCamera(dt, 7.4, 2.4);
    },

    /** Third-person camera: behind and above the target, looking where the player aims. */
    updateCamera(dt, dist, height) {
      const cam = ctx.camera;
      const target = this.inCar && this.car ? this.car.pos : this.pos;
      if (this.inCar && this.car) {
        // While driving the camera settles behind the car unless the player orbits it.
        const behind = this.car.heading + Math.PI;
        const delta = angleDelta(this.camYaw, behind + Math.PI);
        if (Math.abs(ctx.input.mouseDX) < 0.01) this.camYaw += clamp(delta, -dt * 1.6, dt * 1.6) * 0.4;
      }
      const cx = target.x - Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
      const cz = target.z - Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
      const cy = target.y + height + Math.sin(this.camPitch) * dist * 0.72;
      const k = 1 - Math.pow(0.0001, dt); // smooth, frame-rate independent
      cam.position.x += (cx - cam.position.x) * k;
      cam.position.y += (Math.max(1.1, cy) - cam.position.y) * k;
      cam.position.z += (cz - cam.position.z) * k;
      cam.lookAt(target.x + Math.sin(this.camYaw) * 6, target.y + 1.6, target.z + Math.cos(this.camYaw) * 6);
    },
  };
  return player;
}
