# AZAHAR HEAT

An original 3D open-world crime game set in Puerto Azahar, a fictional sunset port city,
in the year 1989. Built for the make.fun **"Make GTA 6"** bounty (`gta6-01`). Everything in
it — the city, the people, the cars, the story, the signs, the sounds — was invented for
this game. It plays in a desktop browser straight from static files: no build step, no
server logic, and not a single network request once the folder is served.

## The story

You are **Nico Ferran**, a dock runner with empty pockets. Puerto Azahar runs on fish by
day and contraband by night, and **Lucia Ferrer** — café owner and fixer — is hiring.
Five jobs take Nico across the whole city: a package fetched from the fish market, a gold
sports car "borrowed" from outside the Hotel Azahar, a five-checkpoint sprint against the
clock, a van full of very nervous olive oil delivered under a three-star wanted level, and
a last dash to the marina before the ferry leaves. Between jobs the city is yours: steal a
car, outrun the Policía Portuaria, or just watch the sun sit on the water.

## What is in the game

- **A whole city**: a street grid of pastel blocks with lit windows and neon signs, a
  plaza with a fountain, a fish market, the old docks, a beach promenade with palms, the
  open sea, a marina with moored boats and a lighthouse — all procedural, all generated
  from a seed, all textures painted at runtime (the game ships no image files).
- **On foot and by car**: third-person walking and running with a mouse-orbit camera, and
  six kinds of car to steal and drive (sedans, hatchbacks, a sports coupé, vans, taxis,
  police cruisers), each with its own pace and arcade driving physics.
- **Traffic and pedestrians**: AI drivers who keep their lane, brake for you, stop at red
  lights and turn at corners; strollers who use the sidewalks and run, arms up, when a
  shot is fired or a car comes at them.
- **Wanted system and police**: crimes raise your stars (1–5) only when witnessed.
  Cruisers hunt you, officers chase on foot and can bust you, roadblocks appear at four
  stars, officers shoot back at four stars and up, and breaking line of sight lets the
  heat die down. Get caught and you are **BUSTED**; get flattened and you are **WASTED** —
  both cost you cash and drop you at the station or the hospital.
- **Combat**: a pistol (hitscan, muzzle flash, tracers, sparks) and your fists.
- **A full HUD**: health, cash, wanted stars, objective line with distance, a speedometer
  in cars, dialogue subtitles, mission banners — and a **live minimap** with streets, sea,
  police blips and the mission marker.
- **A start screen and a save**: the title screen tells the story and the controls;
  progress (cash, missions, position) saves to `localStorage` automatically and a
  **Continue** button appears on the title screen when a save exists.
- **Synthesised audio**: engine hum pitched by speed, two-tone sirens, gunshots, punches,
  cash jingles and a slow sunset pad loop — all WebAudio, no audio files.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move (on foot) / drive (in a car) |
| Shift | Run |
| Mouse | Orbit camera / aim |
| E | Enter or steal a car, get out, take a job, talk |
| Left click | Shoot (or punch, up close) |
| F | Punch |
| Space | Handbrake (in a car) |
| P or Esc | Pause |

## How to run it

Play it locally (Node 22):

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Then open <http://localhost:8080> in desktop Chrome. Any static file server pointed at
`game/` works just as well — `game/index.html` is the whole game.

Hand the entry in the way the kit does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes `out/dossier.json` with the
vendored `vendor/makefun-game.ts` library.

## File layout

```
main.ts                  the entry program: copies game/ + screenshots/, writes the dossier
serve.ts                 a tiny static server for game/ (development convenience)
shots.json               the screenshot scenes the kit captures
vendor/makefun-game.ts   the kit's dossier library, unchanged
screenshots/             4 real renders of the game (title, driving, chase, mission)
game/
  index.html             page, HUD DOM and all styling
  vendor/three.module.min.js   three.js r160, vendored minified build
  src/
    main.js              boot, input, the frame loop, game states, saving
    world.js             Puerto Azahar: city, beach, sea, marina, colliders, places
    player.js            Nico: on-foot control, car entry/exit, the third-person camera
    vehicles.js          car factory, driving physics, parked cars, police light bars
    traffic.js           AI drivers on the street grid, lights, lane discipline
    peds.js              pedestrians: strolling, fleeing, falling
    police.js            wanted heat and stars, cruisers, officers, roadblocks, busting
    combat.js            pistol and fists, tracers, muzzle flash, particle sparks
    missions.js          the five-job story campaign, beacons, objectives, rewards
    hud.js               HUD, subtitles, banners and the live minimap
    audio.js             all-synthesised sound and music (WebAudio)
    shots.js             the staged scenes behind the screenshots (?shot=…)
    util.js              seeded RNG, maths, collision and canvas helpers
```

## Screenshots

The four files in `screenshots/` are real renders of this game's own code, captured by
serving `game/` and photographing the staged scenes named in `shots.json`
(`?shot=start|drive|chase|mission`): the title over the city at golden hour, driving the
avenue at dusk, a four-star chase at a roadblock, and the first errand at the fish market.

## License

MIT — see `LICENSE`.
