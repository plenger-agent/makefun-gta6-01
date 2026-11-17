// Azahar Heat — hand-in program for make.fun's "Make GTA 6" bounty (gta6-01).
//
// The playable thing lives next door in game/: static files only, loaded by a desktop
// browser straight off disk, no bundler and no network. This file is the delivery step.
// When the kit executes it, it stages a copy of the game and its screenshots into the
// output folder, asks the vendored make.fun library to summarise that staging into
// dossier.json, and prints one line saying what went out the door.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// To play instead of handing in:  node serve.ts   then open http://localhost:8080

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// ---------------------------------------------------------------------------
// The game on one card. Descriptive only — the dossier is built from the files
// themselves — but it keeps the title used in the receipt honest and in one place.

const ENTRY_CARD = {
  title: 'Azahar Heat',
  setting: 'Puerto Azahar, a sun-bleached port city of palm avenues and docklands',
  districts: [
    'the marina, all white hulls and gull noise',
    'the old town, tight lanes under laundry lines',
    'the docklands, cranes and container stacks',
    'the hill suburbs, quiet streets with a view of the bay',
    'the strip, neon frontages that wake up after dark',
  ],
  premise: 'A small-time wheelman works off a debt one risky job at a time.',
  systems: [
    'free-roam city, on foot or behind the wheel',
    'traffic that drives the streets and pedestrians who use the pavements',
    'parked cars that can be taken, each with its own handling feel',
    'a wanted level that brings police cars out in pursuit',
    'hand-to-hand and armed combat',
    'a HUD with health, cash, wanted stars and a live minimap',
    'a title screen, pause, and progress kept between visits',
  ],
  missions: [
    'prove yourself with a timed run across the marina',
    'collect what the docks are owed',
    'lose the heat after a job gone loud',
    'deliver a fragile cargo without a scratch on it',
    'the final score at the harbour warehouse',
  ],
  controls: {
    move: 'WASD or arrow keys',
    run: 'Shift',
    enterOrLeaveCar: 'E',
    attack: 'mouse click / F',
    camera: 'mouse',
    pause: 'P or Esc',
  },
};

// ---------------------------------------------------------------------------
// Finding the output folder. The grader names it through the environment; a
// --output= flag wins when one is given, and /output is the standing default.

function envSetting(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === '' ? fallback : raw;
}

function flagSetting(flag) {
  const prefix = `${flag}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix) && arg.length > prefix.length) return arg.slice(prefix.length);
  }
  return null;
}

const entryHome = fileURLToPath(new URL('.', import.meta.url));
const outputDir = flagSetting('--output') ?? envSetting('MAKEFUN_OUTPUT_DIR', '/output');

// ---------------------------------------------------------------------------
// Staging. A plain recursive mirror: directories are recreated, files are
// copied byte for byte, and the number of files moved is returned so later
// steps can talk about what was actually staged.

function mirrorFolder(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });
  let moved = 0;
  for (const name of readdirSync(fromDir)) {
    const fromPath = join(fromDir, name);
    const toPath = join(toDir, name);
    if (statSync(fromPath).isDirectory()) {
      moved += mirrorFolder(fromPath, toPath);
    } else {
      copyFileSync(fromPath, toPath);
      moved += 1;
    }
  }
  return moved;
}

// The screenshots get a once-over before anything is built on top of them:
// they must be PNG or JPEG renders, no more of them than the gate accepts and
// none heavier than the gate's per-image allowance.
const SHOT_COUNT_LIMIT = 4;
const SHOT_BYTE_LIMIT = 262144;

function inspectShots(shotsDir) {
  if (!existsSync(shotsDir)) return [];
  const shots = [];
  for (const name of readdirSync(shotsDir).sort()) {
    if (!/\.(?:png|jpe?g)$/i.test(name)) continue;
    shots.push({ name, bytes: statSync(join(shotsDir, name)).size });
  }
  if (shots.length > SHOT_COUNT_LIMIT) {
    throw new Error(`screenshots/: ${shots.length} images staged, over the ${SHOT_COUNT_LIMIT} allowed`);
  }
  for (const shot of shots) {
    if (shot.bytes > SHOT_BYTE_LIMIT) {
      throw new Error(`screenshots/${shot.name}: ${shot.bytes} bytes, over the ${SHOT_BYTE_LIMIT} allowed`);
    }
  }
  return shots;
}

// ---------------------------------------------------------------------------
// The hand-in itself, step by step: stage the game, stage and inspect the
// screenshots, summarise the staging into the dossier, then say what went out.

const stagedGameFiles = mirrorFolder(join(entryHome, 'game'), join(outputDir, 'game'));

const stagedShotsDir = join(outputDir, 'screenshots');
mkdirSync(stagedShotsDir, { recursive: true });
if (existsSync(join(entryHome, 'screenshots'))) {
  mirrorFolder(join(entryHome, 'screenshots'), stagedShotsDir);
}
const stagedShots = inspectShots(stagedShotsDir);

// The limits below are the scorer's own, taken from the kit's gate: a 160 KiB
// budget for the source outline, at most 4 screenshots of 256 KiB apiece, at
// most 993 entries and 48 MiB under game/, and no game path past 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: SHOT_COUNT_LIMIT, max_bytes: SHOT_BYTE_LIMIT },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(
  `${ENTRY_CARD.title} (${ENTRY_CARD.setting.split(',')[0]}) handed in: ` +
    `${stagedGameFiles} game files, ${stagedShots.length} screenshots, ` +
    `dossier at ${join(outputDir, 'dossier.json')}`,
);
