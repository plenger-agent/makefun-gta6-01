// hud.js — everything drawn over the 3D world: health and cash, the wanted stars, the
// objective line, the speedometer, the subtitle bar where the story talks, prompts and
// mission banners, the red flash when Nico is hurt — and the live minimap, a top-down
// canvas painting of Puerto Azahar with the streets, the sea, the player arrow, police
// blips and the gold mission marker, redrawn every frame from the real game state.

import { STREET_COORDS, BEACH_X, WATER_X } from './world.js';

export function createHUD(ctx) {
  const $ = (id) => document.getElementById(id);
  const hudEl = $('hud');
  const healthFill = $('healthfill');
  const cashEl = $('cash');
  const wantedEl = $('wanted');
  const objectiveEl = $('objective');
  const speedoEl = $('speedo');
  const speedNum = speedoEl.querySelector('.num');
  const subtitleEl = $('subtitle');
  const promptEl = $('prompt');
  const bannerEl = $('banner');
  const bannerBig = bannerEl.querySelector('.big');
  const bannerSmall = bannerEl.querySelector('.small');
  const crosshairEl = $('crosshair');
  const map = $('minimap').getContext('2d');

  const dmg = document.createElement('div');
  dmg.style.cssText = 'position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center, transparent 55%, rgba(255,30,20,0.5) 100%);opacity:0;z-index:3;';
  document.body.appendChild(dmg);
  let dmgLevel = 0;

  const subtitles = [];
  let bannerTimer = 0;
  let lastCash = -1;
  let lastHealth = -1;
  let lastStars = -1;

  function say(who, text, secs = 4.2) {
    subtitles.push({ who, text, left: secs });
  }

  function banner(big, small) {
    bannerBig.textContent = big;
    bannerSmall.textContent = small ?? '';
    bannerEl.classList.add('on');
    bannerTimer = 3.6;
  }

  function prompt(html) {
    if (html) {
      promptEl.innerHTML = html;
      promptEl.classList.add('on');
    } else {
      promptEl.classList.remove('on');
    }
  }

  function flashDamage() {
    dmgLevel = 0.9;
  }

  /* ------------------------------------------------------------ the minimap */

  const MAP = 376;
  const WORLD_MIN = -168;
  const WORLD_SPAN = 368;
  const toMap = (x, z) => [((x - WORLD_MIN) / WORLD_SPAN) * MAP, ((z - WORLD_MIN) / WORLD_SPAN) * MAP];

  function drawMinimap(t) {
    const g = map;
    g.clearRect(0, 0, MAP, MAP);
    // Land and sea.
    const [beachPx] = toMap(BEACH_X, 0);
    const [waterPx] = toMap(WATER_X, 0);
    g.fillStyle = '#4a3f38';
    g.fillRect(0, 0, MAP, MAP);
    g.fillStyle = '#e8c88f';
    g.fillRect(beachPx, 0, waterPx - beachPx, MAP);
    g.fillStyle = '#2a7d9e';
    g.fillRect(waterPx, 0, MAP - waterPx, MAP);
    // Streets.
    g.strokeStyle = '#191922';
    g.lineWidth = 7;
    for (const c of STREET_COORDS) {
      const [x0, y0] = toMap(c, WORLD_MIN);
      const [x1, y1] = toMap(c, WORLD_MIN + WORLD_SPAN);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const [a0, b0] = toMap(WORLD_MIN, c);
      const [a1, b1] = toMap(WORLD_MIN + WORLD_SPAN, c);
      g.beginPath(); g.moveTo(a0, b0); g.lineTo(a1, b1); g.stroke();
    }
    g.strokeStyle = '#e8c87a';
    g.lineWidth = 1;
    g.setLineDash([5, 5]);
    for (const c of STREET_COORDS) {
      const [x0, y0] = toMap(c, WORLD_MIN);
      const [x1, y1] = toMap(c, WORLD_MIN + WORLD_SPAN);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const [a0, b0] = toMap(WORLD_MIN, c);
      const [a1, b1] = toMap(WORLD_MIN + WORLD_SPAN, c);
      g.beginPath(); g.moveTo(a0, b0); g.lineTo(a1, b1); g.stroke();
    }
    g.setLineDash([]);
    // Police blips, flashing red and blue like their light bars.
    const flash = Math.floor(t * 4) % 2 === 0;
    for (const car of ctx.vehicles.list) {
      if (car.type !== 'police') continue;
      const [x, y] = toMap(car.pos.x, car.pos.z);
      g.fillStyle = flash ? '#ff4747' : '#4d9fff';
      g.beginPath(); g.arc(x, y, 4.4, 0, Math.PI * 2); g.fill();
    }
    for (const cop of ctx.police.officers) {
      if (!cop.alive) continue;
      const [x, y] = toMap(cop.pos.x, cop.pos.z);
      g.fillStyle = flash ? '#ff4747' : '#4d9fff';
      g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
    }
    // The mission marker: a gold ring that breathes.
    const target = ctx.missions.target;
    if (target) {
      const [x, y] = toMap(target.x, target.z);
      g.strokeStyle = '#ffd23e';
      g.lineWidth = 2.6;
      g.beginPath(); g.arc(x, y, 7 + Math.sin(t * 4) * 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
    }
    // The player: a white arrow on his heading (or his car's).
    const p = ctx.player;
    const [px, py] = toMap(p.pos.x, p.pos.z);
    const heading = p.inCar && p.car ? p.car.heading : p.heading;
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#14141c';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.4, 6.4);
    g.lineTo(0, 3.4);
    g.lineTo(-5.4, 6.4);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  /* ------------------------------------------------------------ per-frame */

  function update(dt, t) {
    if (ctx.cash !== lastCash) {
      lastCash = ctx.cash;
      cashEl.innerHTML = `<small>PUERTO AZAHAR</small>$${lastCash.toLocaleString('en-US')}`;
    }
    const hp = Math.round(ctx.player.health);
    if (hp !== lastHealth) {
      lastHealth = hp;
      healthFill.style.width = `${Math.max(0, hp)}%`;
    }
    const stars = ctx.police.wanted;
    if (stars !== lastStars) {
      lastStars = stars;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<span class="${i < stars ? 'on' : 'off'}">★</span>`;
      wantedEl.innerHTML = html;
    }
    wantedEl.classList.toggle('flash', stars > 0 && ctx.police.seenTimer < 0.6);
    // Bust meter shows as a draining health bar tint — reuse the subtitle line for clarity.
    if (ctx.player.bustMeter > 0.1) {
      objectiveEl.innerHTML = '<b>THE POLICE HAVE YOU — MOVE!</b>';
    } else if (ctx.missions.objectiveText) {
      let html = ctx.missions.objectiveText;
      const target = ctx.missions.target;
      if (target) {
        const d = Math.hypot(ctx.player.pos.x - target.x, ctx.player.pos.z - target.z);
        html += ` <span class="dist">${Math.round(d)} m</span>`;
      }
      objectiveEl.innerHTML = html;
    }
    if (ctx.player.inCar && ctx.player.car) {
      speedoEl.classList.add('on');
      speedNum.textContent = String(Math.round(Math.abs(ctx.player.car.speed) * 3.6));
    } else {
      speedoEl.classList.remove('on');
    }
    crosshairEl.classList.toggle('on', ctx.state === 'play' && !ctx.player.inCar && ctx.combat.armed);
    // Subtitles: one at a time, each for its seconds.
    if (subtitles.length) {
      const cur = subtitles[0];
      cur.left -= dt;
      subtitleEl.innerHTML = `<span class="who">${cur.who}:</span> ${cur.text}`;
      subtitleEl.classList.add('on');
      if (cur.left <= 0) subtitles.shift();
    } else {
      subtitleEl.classList.remove('on');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.classList.remove('on');
    }
    if (dmgLevel > 0) {
      dmgLevel = Math.max(0, dmgLevel - dt * 1.6);
      dmg.style.opacity = String(dmgLevel * 0.85);
    }
    drawMinimap(t);
  }

  return {
    say, banner, prompt, flashDamage, update,
    show() { hudEl.classList.add('on'); },
    hide() { hudEl.classList.remove('on'); },
  };
}
