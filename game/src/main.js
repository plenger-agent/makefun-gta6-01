// main.js — the boot and the heartbeat of Azahar Heat. It builds the renderer and the game
// context, wires the modules together in dependency order (world, vehicles, player,
// pedestrians, traffic, police, combat, missions, HUD), owns the keyboard and mouse, runs
// the fixed-feel frame loop, and moves between the game's states: title, play, paused,
// busted and wasted. It also owns the save file in localStorage — cash, story progress and
// where Nico was standing — and the screenshot staging hook (?shot=…) the kit's shots use.

import * as THREE from '../vendor/three.module.min.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { createVehicles } from './vehicles.js';
import { createPlayer } from './player.js';
import { createPeds } from './peds.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'azahar-heat-save-v1';
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20240817;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  ctx.camera.aspect = window.innerWidth / window.innerHeight;
  ctx.camera.updateProjectionMatrix();
});

/* ------------------------------------------------------------------ input */

const input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  clicked: false,
};
let mouseDown = false;
window.addEventListener('keydown', (e) => {
  if (!e.repeat) input.pressed.add(e.code);
  input.keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => input.keys.delete(e.code));
window.addEventListener('blur', () => input.keys.clear());
canvas.addEventListener('mousedown', () => {
  mouseDown = true;
  if (ctx.state === 'play' && document.pointerLockElement !== canvas && !shotName) {
    canvas.requestPointerLock();
  } else if (ctx.state === 'play') {
    input.clicked = true;
  }
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || mouseDown) {
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------------------------------------------ context */

const ctx = {
  seed,
  state: 'title',
  cash: 0,
  time: 0,
  input,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1500),
  renderer,
  saveGame,
  addCash,
  gameOver,
};
ctx.world = createWorld(ctx);
ctx.audio = createAudio();
ctx.vehicles = createVehicles(ctx);
ctx.player = createPlayer(ctx);
ctx.peds = createPeds(ctx);
ctx.traffic = createTraffic(ctx);
ctx.police = createPolice(ctx);
ctx.combat = createCombat(ctx);
ctx.missions = createMissions(ctx);
ctx.hud = createHUD(ctx);
ctx.camera.position.set(-96, 26, 96);
ctx.camera.lookAt(40, 4, -20);

/* ------------------------------------------------------------------ save */

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: ctx.cash,
      missionIndex: ctx.missions.index,
      x: Math.round(ctx.player.pos.x * 10) / 10,
      z: Math.round(ctx.player.pos.z * 10) / 10,
    }));
  } catch {
    // Private windows and full storage just mean the save lasts this visit.
  }
}

function addCash(amount) {
  ctx.cash = Math.max(0, ctx.cash + amount);
  saveGame();
}

/* ------------------------------------------------------------------ states */

const screens = {
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  busted: document.getElementById('busted-screen'),
  wasted: document.getElementById('wasted-screen'),
};
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('on', key === name);
}

function startGame(fromSave) {
  ctx.audio.init();
  const save = fromSave ? readSave() : null;
  if (save) {
    ctx.cash = save.cash || 0;
    ctx.missions.index = save.missionIndex || 0;
    ctx.player.pos.set(save.x ?? -50, 0, save.z ?? 57);
  } else {
    ctx.cash = 0;
    ctx.missions.index = 0;
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
  showScreen(null);
  ctx.hud.show();
  ctx.state = 'play';
  if (!shotName) canvas.requestPointerLock();
  document.getElementById('status').textContent = 'Playing Azahar Heat.';
}

function gameOver(kind) {
  if (ctx.state !== 'play') return;
  ctx.state = kind;
  document.exitPointerLock?.();
  if (kind === 'busted') ctx.audio.bustedSting();
  showScreen(kind);
}

function resolveGameOver() {
  if (ctx.state === 'busted') {
    addCash(-Math.floor(ctx.cash * 0.1));
    ctx.police.clearWanted();
    ctx.player.respawn(-23, -50); // outside the Policía Portuaria
  } else if (ctx.state === 'wasted') {
    addCash(-Math.min(ctx.cash, 150));
    ctx.police.clearWanted();
    ctx.player.respawn(58, 52); // outside Hospital Santa María
  }
  showScreen(null);
  ctx.state = 'play';
  saveGame();
}

document.getElementById('btn-new').addEventListener('click', () => startGame(false));
document.getElementById('btn-resume').addEventListener('click', () => {
  showScreen(null);
  ctx.state = 'play';
  if (!shotName) canvas.requestPointerLock();
});
document.getElementById('btn-busted').addEventListener('click', resolveGameOver);
document.getElementById('btn-wasted').addEventListener('click', resolveGameOver);
if (readSave()) document.getElementById('btn-continue').style.display = '';
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));

function togglePause() {
  if (ctx.state === 'play') {
    ctx.state = 'paused';
    showScreen('pause');
    document.exitPointerLock?.();
    saveGame();
  } else if (ctx.state === 'paused') {
    showScreen(null);
    ctx.state = 'play';
    if (!shotName) canvas.requestPointerLock();
  }
}

/* ------------------------------------------------------------------ the loop */

let last = performance.now();
let saveTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (shotName) dt = 1 / 30; // screenshots step in fixed time, however fast the machine is
  ctx.time += dt;
  const t = ctx.time;

  if (input.pressed.has('KeyP') || input.pressed.has('Escape')) {
    if (ctx.state === 'play' || ctx.state === 'paused') togglePause();
  }

  if (ctx.state === 'title') {
    // A slow cinematic drift over the city while the title is up — unless a screenshot
    // staging has pinned the camera to a particular vista.
    if (ctx.shotVista) {
      ctx.camera.position.copy(ctx.shotVista.pos);
      ctx.camera.lookAt(ctx.shotVista.look);
    } else {
      const a = t * 0.045 + 2.2;
      ctx.camera.position.set(Math.cos(a) * 118, 27 + Math.sin(t * 0.11) * 5, Math.sin(a) * 118);
      ctx.camera.lookAt(30, 3, -10);
    }
    ctx.world.update(dt, t);
    ctx.traffic.update(dt, t);
    ctx.peds.update(dt);
  } else if (ctx.state === 'play') {
    ctx.world.update(dt, t);
    ctx.player.update(dt);
    ctx.traffic.update(dt, t);
    ctx.peds.update(dt);
    ctx.police.update(dt, t);
    ctx.combat.update(dt);
    ctx.missions.update(dt, t);
    ctx.hud.update(dt, t);
    saveTimer += dt;
    if (saveTimer > 10) {
      saveTimer = 0;
      saveGame();
    }
  } else {
    // Paused, busted or wasted: the world holds its breath, the sea does not.
    ctx.world.update(dt, t);
    if (ctx.state === 'paused') ctx.hud.update(0, t);
  }
  input.pressed.clear();
  if (ctx.state !== 'play') input.clicked = false;
  renderer.render(ctx.scene, ctx.camera);
  if (shotName) {
    shotFrames += 1;
    if (shotFrames > 55 && !window.__shotReady) window.__shotReady = true;
  }
}

/* ------------------------------------------------------------------ shots */

let shotFrames = 0;
if (shotName) stageShot(shotName, ctx);
requestAnimationFrame(frame);
