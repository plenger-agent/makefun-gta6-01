// Shared helpers for Azahar Heat: a seeded random number generator (so a given seed always
// builds the same Puerto Azahar), small maths helpers, a circle-versus-boxes collision solver
// used by the player, the cars and the police, and a helper for painting canvas textures —
// every texture in the game is drawn at runtime by these functions, so the game ships no
// image files at all and loads nothing from the network.

/** Mulberry32: a tiny fast seeded PRNG. Returns a function giving floats in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max) drawn from rng. */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** A random integer in [min, max] inclusive drawn from rng. */
export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/** Pick one element of an array with rng. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length) % items.length];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Horizontal distance between two objects with x/z positions. */
export function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Push a circle (position object with x/z, mutated in place) out of every axis-aligned box
 * in `colliders` ({x0, z0, x1, z1}). Returns true if any box was touched. Buildings are the
 * boxes; the ground plane is flat everywhere in Puerto Azahar, so 2D is the whole problem.
 */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const box = colliders[i];
    const nearX = clamp(pos.x, box.x0, box.x1);
    const nearZ = clamp(pos.z, box.z0, box.z1);
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.000001) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest face.
      const left = pos.x - box.x0;
      const right = box.x1 - pos.x;
      const near = pos.z - box.z0;
      const far = box.z1 - pos.z;
      const min = Math.min(left, right, near, far);
      if (min === left) pos.x = box.x0 - radius;
      else if (min === right) pos.x = box.x1 + radius;
      else if (min === near) pos.z = box.z0 - radius;
      else pos.z = box.z1 + radius;
    }
  }
  return hit;
}

/** Make a canvas of the given size, run the painter on it, and return it. */
export function paintCanvas(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  painter(canvas.getContext('2d'), width, height);
  return canvas;
}
