// Azahar Heat — entry program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// The game itself is the game/ folder beside this file: plain static files (an index.html,
// ES modules, and one vendored three.js build) that a desktop browser plays offline with no
// build step and no network. This program is the courier, not the game: when the kit runs
// it, it carries the finished entry to the output directory and writes the dossier the
// judge reads.
//
// What it does, in order:
//   1. Works out where /output is (MAKEFUN_OUTPUT_DIR stands in for it outside the grader).
//   2. Copies game/ across wholesale, then screenshots/ (the 4 real renders of the game).
//   3. Writes dossier.json with buildDossier from vendor/makefun-game.ts — the kit's own
//      library, byte for byte the scorer's copy, so the dossier I write is the dossier the
//      gate rebuilds and compares.
//
// The caps passed to buildDossier are the scorer's own (reference/gate.json): at most 4
// screenshots of at most 256 KiB each, at most 993 files and 48 MiB under game/, no game
// path longer than 1000 bytes, and the source text budget that shapes the outline.
//
// Run it the way the kit does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game goes across exactly as it sits in the repository — the same files a player
// would be served — and the screenshots beside it.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier: one JSON summary of the whole entry — file tree, source outline, screenshot
// metadata — built by the vendored library under the scorer's caps.
const dossierJson = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierJson);

// A one-line receipt for whoever ran this: what was handed in, and where it went. The
// dossier itself stays exactly as the library built it — this only reads the output back.
function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return n;
}
const gameFiles = countFiles(join(outputDir, 'game'));
const shotFiles = existsSync(join(outputDir, 'screenshots')) ? readdirSync(join(outputDir, 'screenshots')).length : 0;
console.log(`Azahar Heat handed in: ${gameFiles} game files, ${shotFiles} screenshots, dossier at ${join(outputDir, 'dossier.json')}`);
