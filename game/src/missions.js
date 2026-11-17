// missions.js — the story of Azahar Heat: five jobs that take Nico Ferran from dock runner
// to the man who caught the last ferry out. Lucia Ferrer (café owner, fixer), Rico Alvarez
// (garage man, fence) and the voice on the phone they call El Faro hand out the work. Between
// jobs a gold beacon marks where the next one starts; walk in and press E. Each mission is a
// small script of steps — go somewhere, take something, be somewhere in a particular car,
// beat the clock — with dialogue lines played as subtitles, a 3D beacon and a minimap marker
// on the current objective, and cash on completion. Free roam fills the gaps.

import * as THREE from '../vendor/three.module.min.js';
import { dist2D } from './util.js';
import { PLACES } from './world.js';

export function createMissions(ctx) {
  /* The beacon: a column of golden light over the current objective, visible across town. */
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 34, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.position.y = 17;
  beacon.visible = false;
  ctx.scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.1, 0.14, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.position.y = 0.25;
  beaconRing.visible = false;
  ctx.scene.add(beaconRing);

  const state = {
    index: 0, // next mission to offer
    active: null, // the running mission instance
    target: null, // {x, z} the beacon and minimap point at
    objectiveText: '',
    nearInteract: false,
    done: false,
  };

  function say(lines) {
    for (const [who, text, secs] of lines) ctx.hud.say(who, text, secs ?? 4.2);
  }

  function setObjective(text, target) {
    state.objectiveText = text;
    state.target = target;
    if (target) {
      beacon.visible = true;
      beaconRing.visible = true;
      beacon.position.x = target.x;
      beacon.position.z = target.z;
      beaconRing.position.x = target.x;
      beaconRing.position.z = target.z;
    } else {
      beacon.visible = false;
      beaconRing.visible = false;
    }
  }

  function completeMission(reward, bannerText) {
    const m = state.active;
    ctx.addCash(reward);
    ctx.audio.cashJingle();
    ctx.hud.banner(bannerText ?? 'MISSION COMPLETE', `${m.def.title} — +$${reward}`);
    say(m.def.outro ?? []);
    state.active = null;
    state.index += 1;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      setObjective('<b>Free roam</b> — Puerto Azahar is yours, Nico.', null);
    }
    ctx.saveGame();
  }

  function failMission(reason) {
    ctx.hud.banner('MISSION FAILED', reason);
    say([['El Faro', 'It happens. Come back when you are ready to try again.', 4]]);
    state.active = null;
    ctx.police.heatFloor = 0;
    ctx.saveGame();
  }

  /* ------------------------------------------------------------ the five jobs */

  const MISSIONS = [
    {
      id: 'errand',
      title: 'First Errand',
      giver: 'Lucia Ferrer',
      startAt: PLACES.cafeSol,
      intro: [
        ['Lucia Ferrer', 'Nico. You look like a man who can carry a box and keep his mouth shut.'],
        ['Lucia Ferrer', 'The fish market owes me a package — a blue crate, at the Mercado del Puerto. Fetch it, bring it back here.'],
        ['Nico Ferran', 'And if they ask questions?'],
        ['Lucia Ferrer', 'Then smile, cariño. Smiling is free.'],
      ],
      steps: [
        { text: 'Pick up the <b>package</b> at the Mercado del Puerto', at: PLACES.fishMarket, radius: 6,
          arrive: (m) => say([['Old Tomás', 'For Lucia? Take it, take it. Tell her the sardines were excellent this year.', 4.5]]) },
        { text: 'Bring the package back to <b>Lucia</b> at Café Sol', at: PLACES.cafeSol, radius: 6 },
      ],
      outro: [['Lucia Ferrer', 'Good boy. There is more work where this came from — Rico at the garage asked for you.', 5]],
      reward: 250,
    },
    {
      id: 'wheels',
      title: 'Borrowed Wheels',
      giver: 'Rico Alvarez',
      startAt: PLACES.garage,
      intro: [
        ['Rico Alvarez', 'You see that gold Fuego GT outside the Hotel Azahar? A wedding present that was never paid for.'],
        ['Rico Alvarez', 'Bring it to my garage. Keys are in it — the owner is careless, and tonight, so are you.'],
      ],
      steps: [
        { text: 'Go to the <b>Hotel Azahar</b>', at: PLACES.hotelAzahar, radius: 14 },
        { text: 'Steal the <b>gold Fuego GT</b> outside the hotel', at: null, radius: 0,
          check: (m) => ctx.player.inCar && ctx.player.car === ctx.vehicles.goldCar,
          arrive: (m) => say([['Rico Alvarez', 'That is the one! Now bring her home — and try not to gift-wrap her around a palm tree.', 5]]) },
        { text: "Deliver the Fuego GT to <b>Rico's Garage</b>", at: PLACES.garage, radius: 8,
          check: (m) => ctx.player.inCar && ctx.player.car === ctx.vehicles.goldCar },
      ],
      outro: [['Rico Alvarez', 'Beautiful. She purrs like a kitten and nobody saw a thing. Almost nobody.', 5]],
      reward: 400,
      finish: () => {
        // Rico keeps the car.
        if (ctx.player.inCar && ctx.player.car === ctx.vehicles.goldCar) ctx.player.exitCar(true);
        ctx.vehicles.removeCar(ctx.vehicles.goldCar);
      },
    },
    {
      id: 'sprint',
      title: 'Harbour Sprint',
      giver: 'El Faro',
      startAt: PLACES.plaza,
      intro: [
        ['El Faro', 'A buyer at the marina pays by the minute, and the minutes are not kind.'],
        ['El Faro', 'Five checkpoints across the city, in order, before the clock dies. Any car. Any route. Go.'],
      ],
      race: {
        time: 165,
        points: [
          { x: 46, z: 46, label: 'the east avenue' },
          { x: 92, z: -46, label: 'the hotel corner' },
          { x: 0, z: -92, label: 'the north road' },
          { x: -92, z: 0, label: 'the west gate' },
          { x: 120, z: 37, label: 'the marina' },
        ],
      },
      steps: [], // generated from the race table on start
      outro: [['El Faro', 'The buyer is impressed. Impressed men pay, Nico. Remember that.', 5]],
      reward: 600,
    },
    {
      id: 'cargo',
      title: 'Hot Cargo',
      giver: 'Lucia Ferrer',
      startAt: PLACES.docks,
      intro: [
        ['Lucia Ferrer', 'The white van at the old docks is full of — let us say — olive oil. Very nervous olive oil.'],
        ['Lucia Ferrer', 'Drive it to Almacén 9, the warehouse by the west gate. The Policía will object. Object louder.'],
      ],
      steps: [
        { text: 'Take the <b>white van</b> at the old docks', at: PLACES.docks, radius: 7,
          check: (m) => ctx.player.inCar && ctx.player.car === m.cargoVan,
          arrive: (m) => {
            ctx.police.heatFloor = 3 * 88 - 10;
            ctx.police.setWanted(3);
            say([['Lucia Ferrer', 'They are coming, cariño. DRIVE.', 3.2]]);
          } },
        { text: 'Deliver the van to <b>Almacén 9</b> — and lose the heat', at: PLACES.warehouse, radius: 9,
          check: (m) => ctx.player.inCar && ctx.player.car === m.cargoVan },
      ],
      outro: [['Lucia Ferrer', 'The olive oil is safe, and so are you. You are getting good at this, Nico.', 5]],
      reward: 900,
      finish: () => { ctx.police.heatFloor = 0; },
    },
    {
      id: 'ferry',
      title: 'The Last Ferry',
      giver: 'Lucia Ferrer',
      startAt: PLACES.cafeSol,
      intro: [
        ['Lucia Ferrer', 'Everything ends, Nico. A boat leaves the Marina Azahar tonight and half the city wants to be on it.'],
        ['Lucia Ferrer', 'I saved you a place. Get to the pier — whatever it takes, whoever is watching.'],
        ['Nico Ferran', 'And you?'],
        ['Lucia Ferrer', 'I own the café, the boat can wait. GO.'],
      ],
      steps: [
        { text: 'Reach the boat at <b>Marina Azahar</b>', at: PLACES.marina, radius: 7 },
      ],
      outro: [
        ['Nico Ferran', 'Puerto Azahar shrinks behind the stern rail, all neon and trouble.'],
        ['Nico Ferran', 'Whatever comes next, it starts somewhere else. THE END — free roam is yours.'],
      ],
      reward: 1500,
    },
  ];

  function startMission(def) {
    const m = { def, stepIndex: 0, timer: null, cargoVan: null, racePoint: 0 };
    if (def.id === 'cargo') {
      m.cargoVan = ctx.vehicles.spawnCar('van', PLACES.docks.x, PLACES.docks.z, Math.PI / 2, 0xf2f0ea);
      m.cargoVan.isMissionVan = true;
    }
    if (def.race) {
      m.timer = def.race.time;
      m.steps = def.race.points.map((p, i) => ({
        text: `Checkpoint <b>${i + 1}/${def.race.points.length}</b> — ${p.label}`,
        at: p, radius: 8,
      }));
    } else {
      m.steps = def.steps;
    }
    state.active = m;
    ctx.audio.missionStart();
    ctx.hud.banner(def.title.toUpperCase(), `A job from ${def.giver}`);
    say(def.intro);
    applyStep(m);
  }

  function applyStep(m) {
    const step = m.steps[m.stepIndex];
    if (!step) return;
    if (step.at) setObjective(step.text, step.at);
    else setObjective(step.text, m.def.id === 'wheels' ? { x: ctx.vehicles.goldCar.pos.x, z: ctx.vehicles.goldCar.pos.z } : null);
  }

  function advanceStep(m) {
    const step = m.steps[m.stepIndex];
    if (step && step.arrive) step.arrive(m);
    m.stepIndex += 1;
    if (m.stepIndex >= m.steps.length) {
      if (m.def.finish) m.def.finish();
      completeMission(m.def.reward, m.def.id === 'ferry' ? 'STORY COMPLETE' : 'MISSION COMPLETE');
    } else {
      if (m.def.race) ctx.audio.checkpoint();
      applyStep(m);
    }
  }

  function update(dt, t) {
    beacon.material.opacity = 0.24 + Math.sin(t * 3.2) * 0.1;
    beaconRing.rotation.z = t * 1.4;
    state.nearInteract = false;

    const m = state.active;
    if (!m) {
      if (state.done) return;
      const def = MISSIONS[state.index];
      if (!def) return;
      setObjective(`New job: <b>${def.title}</b> — meet ${def.giver}`, def.startAt);
      const d = dist2D(ctx.player.pos, def.startAt);
      if (d < 4.5 && !ctx.player.inCar) {
        state.nearInteract = true;
        ctx.hud.prompt(`<b>E</b> — Take the job: <b>${def.title}</b>`);
        if (ctx.input.pressed.has('KeyE')) {
          ctx.input.pressed.delete('KeyE');
          startMission(def);
        }
      }
      return;
    }

    /* A running mission. */
    const step = m.steps[m.stepIndex];
    if (!step) return;
    if (m.def.race) {
      m.timer -= dt;
      state.objectiveText = `${step.text} — <span class="dist">${Math.max(0, Math.ceil(m.timer))}s</span>`;
      if (m.timer <= 0) {
        state.active = null;
        failMission('The buyer stopped waiting.');
        return;
      }
    } else if (step.text) {
      state.objectiveText = step.text;
    }
    if (step.at) {
      state.target = step.at;
      beacon.visible = true;
      beaconRing.visible = true;
      beacon.position.x = step.at.x;
      beacon.position.z = step.at.z;
      beaconRing.position.x = step.at.x;
      beaconRing.position.z = step.at.z;
    }
    const arrived = step.check
      ? step.check(m)
      : (step.at && dist2D(ctx.player.pos, step.at) < step.radius);
    if (arrived) advanceStep(m);
  }

  return {
    state,
    get index() { return state.index; },
    set index(v) {
      state.index = v;
      state.done = v >= MISSIONS.length;
      if (state.done) setObjective('<b>Free roam</b> — Puerto Azahar is yours, Nico.', null);
    },
    get target() { return state.target; },
    get objectiveText() { return state.objectiveText; },
    startMissionByIndex(i) {
      if (MISSIONS[i]) startMission(MISSIONS[i]);
    },
    update,
    MISSIONS,
  };
}
