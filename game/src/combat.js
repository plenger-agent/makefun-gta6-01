// combat.js — Nico's two arguments: his fists and a pistol. Left click fires a hitscan shot
// from the camera through the crosshair (or punches, when someone is close enough to deserve
// it); F always punches. Shots are loud — the wanted system hears them — and they spark off
// cars, drop pedestrians and officers, and light a muzzle flash. A small pooled particle
// system throws sparks and dust so hits read clearly without allocating per shot.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, dist2D } from './util.js';

const MAX_PARTICLES = 420;

export function createCombat(ctx) {
  /* Particle pool: positions and velocities in flat arrays, one THREE.Points cloud. */
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const lifetimes = new Float32Array(MAX_PARTICLES);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffc46b, size: 0.16, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  points.frustumCulled = false;
  ctx.scene.add(points);
  let cursor = 0;

  function burst(x, y, z, count, colour, spread = 2.6, up = 2.4) {
    points.material.color.setHex(colour);
    for (let n = 0; n < count; n += 1) {
      const i = cursor;
      cursor = (cursor + 1) % MAX_PARTICLES;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities[i * 3] = (Math.random() - 0.5) * spread * 2;
      velocities[i * 3 + 1] = Math.random() * up;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      lifetimes[i] = 0.45 + Math.random() * 0.4;
    }
  }

  /* Muzzle flash: a point light and a star sprite at the gun, alive for a frame or two. */
  const flashLight = new THREE.PointLight(0xffb45e, 0, 16);
  ctx.scene.add(flashLight);
  const flashTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.4, 'rgba(255,170,80,0.7)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(1.1, 1.1, 1);
  ctx.scene.add(flashSprite);
  let flashTimer = 0;

  /* Tracer: a line that lives for a blink, from the muzzle to wherever the shot landed. */
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  ctx.scene.add(tracer);
  let tracerTimer = 0;

  const combat = {
    armed: true,
    cooldown: 0,

    /** The nearest living thing (or car) within `range` in front of the player. */
    meleeTarget(range) {
      const p = ctx.player;
      let best = null;
      let bestD = range;
      const consider = (pos, thing) => {
        const d = dist2D(p.pos, pos);
        if (d >= bestD) return;
        const ang = Math.atan2(pos.x - p.pos.x, pos.z - p.pos.z);
        let diff = Math.abs(ang - p.camYaw);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 1.1) { bestD = d; best = thing; }
      };
      for (const ped of ctx.peds.list) if (ped.alive) consider(ped.pos, { kind: 'ped', ref: ped });
      for (const cop of ctx.police.officers) if (cop.alive) consider(cop.pos, { kind: 'cop', ref: cop });
      return best;
    },

    punch() {
      const p = ctx.player;
      p.swingArm();
      ctx.audio.punch();
      const target = this.meleeTarget(2.4);
      if (target) {
        target.ref.hurt(34, p.pos);
        burst(target.ref.pos.x, 1.3, target.ref.pos.z, 6, 0xd9c9a8, 1.4, 1.4);
        ctx.police.addCrime('punch', p.pos);
        ctx.peds.panicAt(p.pos, 9);
      }
    },

    shoot() {
      const p = ctx.player;
      const cam = ctx.camera;
      ctx.audio.gunshot();
      ctx.police.addCrime('shoot', p.pos);
      ctx.peds.panicAt(p.pos, 26);
      p.armTimer = 0.14;
      // Muzzle position: just under the camera, toward where Nico stands.
      const origin = new THREE.Vector3();
      cam.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const muzzle = p.pos.clone();
      muzzle.y += 1.45;
      muzzle.x += Math.sin(p.camYaw) * 0.4;
      muzzle.z += Math.cos(p.camYaw) * 0.4;
      flashLight.position.copy(muzzle);
      flashLight.intensity = 26;
      flashSprite.position.copy(muzzle).addScaledVector(dir, 0.7);
      flashSprite.material.opacity = 0.95;
      flashTimer = 0.05;

      /* March the ray in small steps; the first thing it meets — wall, person, car — wins. */
      const step = 0.7;
      let hitPoint = origin.clone().addScaledVector(dir, 90);
      let hitThing = null;
      for (let d = 1; d < 90; d += step) {
        const x = origin.x + dir.x * d;
        const y = origin.y + dir.y * d;
        const z = origin.z + dir.z * d;
        if (y < 0) { hitPoint.set(x, 0, z); break; }
        let blocked = false;
        for (const box of ctx.world.colliders) {
          if (x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 && y < 42) { blocked = true; break; }
        }
        if (blocked) { hitPoint.set(x, y, z); break; }
        for (const ped of ctx.peds.list) {
          if (ped.alive && Math.hypot(ped.pos.x - x, ped.pos.z - z) < 0.62 && y > 0.1 && y < 1.85) {
            hitThing = { kind: 'ped', ref: ped };
            hitPoint.set(x, y, z);
            blocked = true;
            break;
          }
        }
        if (blocked) break;
        for (const cop of ctx.police.officers) {
          if (cop.alive && Math.hypot(cop.pos.x - x, cop.pos.z - z) < 0.62 && y > 0.1 && y < 1.85) {
            hitThing = { kind: 'cop', ref: cop };
            hitPoint.set(x, y, z);
            blocked = true;
            break;
          }
        }
        if (blocked) break;
        for (const car of ctx.vehicles.list) {
          if (Math.hypot(car.pos.x - x, car.pos.z - z) < car.radius && y > 0.05 && y < 1.9) {
            hitThing = { kind: 'car', ref: car };
            hitPoint.set(x, y, z);
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }
      // Draw the tracer.
      const posAttr = tracer.geometry.getAttribute('position');
      posAttr.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
      posAttr.setXYZ(1, hitPoint.x, hitPoint.y, hitPoint.z);
      posAttr.needsUpdate = true;
      tracer.material.opacity = 0.85;
      tracerTimer = 0.06;
      // Resolve the hit.
      if (hitThing) {
        if (hitThing.kind === 'car') {
          hitThing.ref.health -= 11;
          burst(hitPoint.x, hitPoint.y, hitPoint.z, 10, 0xffc46b);
          if (hitThing.ref.type === 'police') ctx.police.addCrime('hitPolice', p.pos);
        } else {
          hitThing.ref.hurt(40, p.pos);
          burst(hitPoint.x, hitPoint.y, hitPoint.z, 8, 0xff9a7a, 1.8, 1.8);
        }
      } else {
        burst(hitPoint.x, Math.max(0.15, hitPoint.y), hitPoint.z, 5, 0xd9c9a8, 1.2, 1.2);
      }
    },

    update(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          flashLight.intensity = 0;
          flashSprite.material.opacity = 0;
        }
      }
      if (tracerTimer > 0) {
        tracerTimer -= dt;
        if (tracerTimer <= 0) tracer.material.opacity = 0;
      }
      // Particles fall and fade.
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (lifetimes[i] <= 0) {
          positions[i * 3 + 1] = -10;
          continue;
        }
        lifetimes[i] -= dt;
        velocities[i * 3 + 1] -= 6.5 * dt;
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.03) positions[i * 3 + 1] = 0.03;
      }
      geo.getAttribute('position').needsUpdate = true;
      /* Player input: click shoots (or punches up close), F punches. */
      if (ctx.state !== 'play' || ctx.player.inCar) return;
      if (ctx.input.pressed.has('KeyF')) {
        ctx.input.pressed.delete('KeyF');
        if (this.cooldown <= 0) {
          this.punch();
          this.cooldown = 0.34;
        }
      }
      if (ctx.input.clicked && this.cooldown <= 0) {
        ctx.input.clicked = false;
        const close = this.meleeTarget(2.3);
        if (close) this.punch();
        else this.shoot();
        this.cooldown = 0.27;
      }
    },
  };
  return combat;
}
