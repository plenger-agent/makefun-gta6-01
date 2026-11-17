// audio.js — every sound in Azahar Heat is synthesised with WebAudio at the moment it is
// needed; there are no audio files. A small synth engine: an oscillator-and-noise toolkit,
// then the voices built from it — the car's engine hum pitched by speed, the two-tone police
// siren, a gunshot crack, a punch thud, the cash-register jingle when a mission pays, and a
// slow sunset pad loop that plays under free roam. Browsers only let audio start after a
// gesture, so init() is called from the start button; every call is safe before that too.

export function createAudio() {
  let ac = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
    startMusic();
  }

  function now() {
    return ac ? ac.currentTime : 0;
  }

  /** A short pitched blip with an envelope — the building block for jingles and UI sounds. */
  function blip(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ac) return;
    const t0 = now() + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of filtered noise — gunshots, punches, crashes, surf. */
  function noiseBurst(dur, vol, filterFreq, when = 0, type = 'lowpass') {
    if (!ac) return;
    const t0 = now() + when;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  /* ---------------------------------------------------------- continuous voices */

  /** Engine: a sawtooth growl whose pitch and volume follow the car's speed. */
  function engine(speedRatio, running) {
    if (!ac) return;
    if (running && !engineOsc) {
      engineOsc = ac.createOscillator();
      engineGain = ac.createGain();
      engineOsc.type = 'sawtooth';
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineGain.gain.value = 0;
      engineOsc.connect(lp).connect(engineGain).connect(master);
      engineOsc.start();
    }
    if (!engineOsc) return;
    const t = now();
    if (running) {
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.06);
      engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, t, 0.08);
    } else {
      engineGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  /** Siren: a square wave alternating between two tones while the police are active. */
  function siren(active, dt) {
    if (!ac) return;
    if (active && !sirenOsc) {
      sirenOsc = ac.createOscillator();
      sirenGain = ac.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0.028;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    }
    if (!sirenOsc) return;
    if (active) {
      sirenTimer += dt;
      sirenOsc.frequency.value = sirenTimer % 0.72 < 0.36 ? 660 : 880;
    } else {
      sirenOsc.stop();
      sirenOsc.disconnect();
      sirenOsc = null;
      sirenGain = null;
    }
  }

  /* ---------------------------------------------------------- one-shots */

  function gunshot() {
    noiseBurst(0.16, 0.5, 3200, 0, 'highpass');
    noiseBurst(0.22, 0.35, 700);
    blip(160, 0.1, 'square', 0.12, 0, 40);
  }

  function punch() {
    noiseBurst(0.09, 0.3, 300);
    blip(90, 0.09, 'sine', 0.3, 0, 45);
  }

  function crash(strength) {
    noiseBurst(0.3, Math.min(0.5, 0.15 + strength * 0.4), 500);
    blip(70, 0.25, 'sawtooth', 0.15, 0, 30);
  }

  function doorSlam() {
    noiseBurst(0.07, 0.22, 900);
    blip(120, 0.07, 'square', 0.1, 0, 70);
  }

  /** The happy sound of money: a little two-note register ring with a sparkle on top. */
  function cashJingle() {
    blip(880, 0.12, 'square', 0.12);
    blip(1318, 0.22, 'square', 0.12, 0.09);
    blip(1760, 0.3, 'triangle', 0.1, 0.18);
  }

  function missionStart() {
    blip(392, 0.16, 'triangle', 0.14);
    blip(523, 0.16, 'triangle', 0.14, 0.12);
    blip(659, 0.3, 'triangle', 0.14, 0.24);
  }

  function checkpoint() {
    blip(1046, 0.1, 'square', 0.1);
    blip(1568, 0.16, 'square', 0.1, 0.07);
  }

  function bustedSting() {
    blip(220, 0.5, 'sawtooth', 0.16, 0, 110);
    blip(233, 0.6, 'sawtooth', 0.12, 0.1, 98);
  }

  /* ---------------------------------------------------------- ambient music */

  /**
   * A lazy sunset pad: two detuned triangles through a lowpass, changing chord every four
   * seconds (Am7 — F maj7 — C maj7 — G6, the sound of every 1989 marina at dusk), with a
   * soft bass note under each change. Scheduled on an interval; quiet enough to sit under
   * the sirens.
   */
  function startMusic() {
    if (!ac || musicTimer) return;
    const chords = [
      [220, 261.6, 329.6, 392],
      [174.6, 220, 261.6, 329.6],
      [130.8, 196, 261.6, 329.6],
      [196, 246.9, 293.7, 392],
    ];
    let step = 0;
    const playChord = () => {
      if (!ac) return;
      const chord = chords[step % chords.length];
      step += 1;
      const t0 = now();
      for (const freq of chord) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        const lp = ac.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.002);
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.028, t0 + 0.8);
        gain.gain.setValueAtTime(0.028, t0 + 3.1);
        gain.gain.linearRampToValueAtTime(0, t0 + 4.1);
        osc.connect(lp).connect(gain).connect(master);
        osc.start(t0);
        osc.stop(t0 + 4.2);
      }
      blip(chord[0] / 2, 2.8, 'sine', 0.05);
    };
    playChord();
    musicTimer = setInterval(playChord, 4000);
  }

  return { init, engine, siren, gunshot, punch, crash, doorSlam, cashJingle, missionStart, checkpoint, bustedSting };
}
