// traffic.js — the ordinary drivers of Puerto Azahar. Each traffic car follows the street
// grid in the right-hand lane, slows for whatever is ahead of it — the player, another car,
// a pedestrian crossing — stops at red lights, and sometimes turns at intersections. Cars
// far from the player are quietly recycled to streets near the player (but never in sight),
// so the city feels populated wherever you go without simulating the whole map.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom, randRange, pick, clamp, angleDelta, dist2D } from './util.js';
import { STREET_COORDS, ROAD_HALF, nearestStreet } from './world.js';

const CRUISE_SPEED = 11;
const LANE = 2.9;

export function createTraffic(ctx) {
  const rng = createRandom(ctx.seed ^ 0x7ea5);
  const drivers = [];
  const COUNT = 14;

  /** The heading for travelling `dir` along `axis`, and the lane offset to the right. */
  function headingFor(axis, dir) {
    if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return dir > 0 ? 0 : Math.PI;
  }
  /** The lane centre coordinate for a driver: right-hand traffic, so the lane sits to the
   *  right of the street centre line for its direction of travel. */
  function laneCentre(driver) {
    if (driver.axis === 'x') return driver.cross + (driver.dir > 0 ? -LANE : LANE);
    return driver.cross + (driver.dir > 0 ? LANE : -LANE);
  }

  function lanePoint(driver, ahead) {
    // A point `ahead` metres in front of the car, held on its lane centre line.
    const fx = Math.sin(driver.car.heading);
    const fz = Math.cos(driver.car.heading);
    const p = { x: driver.car.pos.x + fx * ahead, z: driver.car.pos.z + fz * ahead };
    if (driver.axis === 'x') p.z = laneCentre(driver);
    else p.x = laneCentre(driver);
    return p;
  }

  function placeOnStreet(car, nearPos) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const dir = rng() < 0.5 ? 1 : -1;
    const cross = pick(rng, STREET_COORDS);
    const along = clamp((nearPos ? (axis === 'x' ? nearPos.x : nearPos.z) : 0) + randRange(rng, -70, 70), -112, 112);
    const driver = { car, axis, dir, cross, turnAt: null, decided: new Set() };
    car.heading = headingFor(axis, dir);
    if (axis === 'x') car.pos.set(along, 0, laneCentre(driver));
    else car.pos.set(laneCentre(driver), 0, along);
    car.group.position.copy(car.pos);
    car.group.rotation.y = car.heading;
    car.driver = 'traffic';
    car.parked = false;
    return driver;
  }

  for (let i = 0; i < COUNT; i += 1) {
    const car = ctx.vehicles.spawnCar(pick(rng, ['sedan', 'sedan', 'hatch', 'taxi', 'van', 'sedan']), 0, 0, 0);
    drivers.push(placeOnStreet(car, ctx.player.pos));
  }

  /** Is something solid in the braking zone ahead of this car? */
  function blockedAhead(driver) {
    const car = driver.car;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const nose = { x: car.pos.x + fx * 5.2, z: car.pos.z + fz * 5.2 };
    for (const other of ctx.vehicles.list) {
      if (other === car) continue;
      if (dist2D(nose, other.pos) < other.radius + 1.6) return true;
    }
    if (!ctx.player.inCar && dist2D(nose, ctx.player.pos) < 2.4) return true;
    for (const ped of ctx.peds.list) {
      if (ped.alive && dist2D(nose, ped.pos) < 2.2) return true;
    }
    return false;
  }

  /** Traffic lights: avenues along x run green while avenues along z wait, then swap. */
  function lightIsRed(driver, t) {
    const car = driver.car;
    const along = driver.axis === 'x' ? car.pos.x : car.pos.z;
    for (const crossStreet of STREET_COORDS) {
      const gap = (crossStreet - along) * driver.dir;
      if (gap > 3 && gap < 13) {
        const xGreen = Math.floor(t / 7) % 2 === 0;
        return driver.axis === 'x' ? !xGreen : xGreen;
      }
    }
    return false;
  }

  function update(dt, t) {
    for (const driver of drivers) {
      const car = driver.car;
      if (car.driver !== 'traffic') {
        // The player stole a traffic car: replace it elsewhere so traffic never thins out.
        const fresh = ctx.vehicles.spawnCar(pick(rng, ['sedan', 'hatch', 'taxi', 'van']), 0, 0, 0);
        drivers[drivers.indexOf(driver)] = placeOnStreet(fresh, ctx.player.pos);
        continue;
      }
      // Recycle cars that have fallen far behind the action.
      if (dist2D(car.pos, ctx.player.pos) > 200) {
        placeOnStreet(car, ctx.player.pos);
        continue;
      }
      /* Turning: near an intersection we have not yet decided about, sometimes turn. */
      const along = driver.axis === 'x' ? car.pos.x : car.pos.z;
      for (const crossStreet of STREET_COORDS) {
        const gap = (crossStreet - along) * driver.dir;
        const key = `${crossStreet}:${driver.axis}`;
        if (gap > 0 && gap < 10 && !driver.decided.has(key)) {
          driver.decided.add(key);
          if (rng() < 0.38) driver.turnAt = crossStreet;
        }
        if (gap < -14) driver.decided.delete(key);
      }
      let targetHeading = headingFor(driver.axis, driver.dir);
      let target = lanePoint(driver, 13);
      if (driver.turnAt !== null) {
        const crossStreet = driver.turnAt;
        const centre = driver.axis === 'x' ? { x: crossStreet, z: driver.cross } : { x: driver.cross, z: crossStreet };
        const distCentre = dist2D(car.pos, centre);
        if (distCentre < 7.5) {
          // Swing onto the crossing street.
          const newDir = rng() < 0.5 ? 1 : -1;
          driver.axis = driver.axis === 'x' ? 'z' : 'x';
          driver.cross = crossStreet;
          driver.dir = newDir;
          driver.turnAt = null;
          targetHeading = headingFor(driver.axis, driver.dir);
          target = lanePoint(driver, 13);
        } else {
          target = centre;
          targetHeading = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
        }
      }
      const steer = clamp(angleDelta(car.heading, targetHeading) * 2.2, -1, 1);
      let throttle = 0.75;
      if (blockedAhead(driver) || lightIsRed(driver, t)) throttle = car.speed > 0.4 ? -1 : 0;
      const speedRatio = Math.abs(car.speed) / CRUISE_SPEED;
      if (speedRatio > 1) throttle = 0;
      ctx.vehicles.drive(car, dt, throttle, steer, false);
      // Keep the car glued to its lane when running straight.
      if (driver.turnAt === null) {
        if (driver.axis === 'x') car.pos.z += (target.z - car.pos.z) * Math.min(1, dt * 1.4);
        else car.pos.x += (target.x - car.pos.x) * Math.min(1, dt * 1.4);
      }
    }
  }

  return { drivers, update };
}
