// Azahar Heat — the delivery program for the make.fun "Make GTA 6" bounty.
//
// The game itself is the static site under game/: a browser opens it from disk
// and plays, nothing is compiled and nothing is fetched. This program is only
// the courier. It carries the game folder and the screenshot folder into the
// output directory the grader points at, hands that directory to the vendored
// make.fun dossier builder, leaves dossier.json behind, and reports the drop
// in a single line.
//
//   Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   Play it: open game/index.html in a desktop browser.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// ---------------------------------------------------------------------------
// Delivery settings, gathered in one place. The numbers in `limits` are the
// gate's own ceilings for this bounty: how much source outline the dossier
// may carry, how many screenshots may ride along and how heavy each may be,
// and how large the staged game tree is allowed to grow.

const SETTINGS = {
  envVar: 'MAKEFUN_OUTPUT_DIR',
  fallbackDir: '/output',
  limits: {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  },
};

// ---------------------------------------------------------------------------
// A pocket manifest of what is being delivered. It plays no part in building
// the dossier — the files speak for themselves there — but the receipt at the
// end quotes it, and it is the quickest way for a reader to see what this
// entry claims to be.

const MANIFEST = {
  name: 'Azahar Heat',
  city: 'Puerto Azahar',
  year: 1989,
  districts: [
    'Marina Quarter — moored boats, gulls, and the ferry pier',
    'Casco Viejo — narrow lanes, washing lines, café tables',
    'The Docklands — container rows and working cranes',
    'Loma Alta — the hill streets above the bay',
    'Neon Strip — the frontages that only wake at night',
  ],
  playSystems: [
    'walk or drive anywhere in the city, no loading walls',
    'traffic with its own routes, walkers on the pavements',
    'any parked car can be taken; each model handles differently',
    'a star rating that escalates into a police pursuit',
    'fists and firearms when a job turns loud',
    'health, cash and wanted stars on a HUD with a live minimap',
    'title screen, pause menu, and progress saved between sessions',
  ],
  jobList: [
    'a timed proving run the length of the marina',
    'a debt collected down at the docks',
    'shaking off the heat when a job goes wrong',
    'fragile cargo delivered without a dent',
    'one last score at the harbour warehouse',
  ],
  keys: 'WASD/arrows to move, Shift to run, E for cars, click or F to fight, P or Esc to pause',
};

// ---------------------------------------------------------------------------
// Small working steps. Each does one thing and returns what the next needs;
// the pipeline at the bottom runs them in order.

// Where the drop goes: the environment names it when it can, otherwise the
// platform's standing output directory.
function chooseOutputDir() {
  const fromEnv = process.env[SETTINGS.envVar];
  return fromEnv === undefined || fromEnv.trim() === '' ? SETTINGS.fallbackDir : fromEnv;
}

// Copies a folder tree into place, making directories as it goes, and counts
// the files it carried so the receipt can state the size of the drop.
function carryTree(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  let carried = 0;
  for (const entry of readdirSync(sourceDir)) {
    const from = join(sourceDir, entry);
    const to = join(targetDir, entry);
    if (statSync(from).isDirectory()) {
      carried += carryTree(from, to);
    } else {
      copyFileSync(from, to);
      carried += 1;
    }
  }
  return carried;
}

// Lists the staged screenshots that count as renders — PNG or JPEG only —
// with their sizes, ready for the guard step below.
function listRenders(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .sort()
    .map((name) => ({ name, size: statSync(join(dir, name)).size }));
}

// Refuses the drop early when the screenshots break the gate's rules: too
// many of them, or any one of them heavier than a single image may be.
function guardRenders(renders) {
  const { max, max_bytes } = SETTINGS.limits.screenshots;
  if (renders.length > max) {
    throw new Error(`screenshots: ${renders.length} renders, more than the ${max} permitted`);
  }
  for (const render of renders) {
    if (render.size > max_bytes) {
      throw new Error(`screenshots/${render.name}: ${render.size} bytes, over the ${max_bytes} permitted`);
    }
  }
  return renders;
}

// A staged game with no entry page is not a game at all, so the drop is
// refused when game/index.html did not make the trip.
function requireEntryPage(gameDir) {
  if (!existsSync(join(gameDir, 'index.html'))) {
    throw new Error('game/index.html missing from the staging: nothing for a browser to open');
  }
}

// ---------------------------------------------------------------------------
// The run itself, written as the pipeline it is: pick the destination, stage
// the game, confirm its entry page arrived, stage the screenshots, check
// them, build the dossier, announce.

const homeDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = chooseOutputDir();

const gameCount = carryTree(join(homeDir, 'game'), join(outDir, 'game'));
requireEntryPage(join(outDir, 'game'));

const shotsDir = join(outDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(homeDir, 'screenshots'))) {
  carryTree(join(homeDir, 'screenshots'), shotsDir);
}
const renders = guardRenders(listRenders(shotsDir));

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, SETTINGS.limits));

console.log(
  `${MANIFEST.name} (${MANIFEST.city}, ${MANIFEST.year}) delivered: ` +
    `${gameCount} game files and ${renders.length} screenshots staged, ` +
    `dossier written to ${join(outDir, 'dossier.json')}`,
);
