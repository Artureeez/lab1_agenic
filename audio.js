// Sound effects and background music, generated live with WebAudio,
// so the game needs no audio files.

const sound = {
  ctx: null,
  muted: storage.get("td.muted", false),

  // Must be called from a user gesture (browsers block autoplay).
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
    }
  },

  play(freq, duration = 0.06, type = "square", volume = 0.05, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  },

  shoot() { this.play(880, 0.05, "square", 0.03, 400); },
  miss() { this.play(140, 0.12, "sawtooth", 0.05, -60); },
  kill() { this.play(520, 0.18, "triangle", 0.08, -380); },
  hurt() { this.play(90, 0.35, "sawtooth", 0.09, -40); },
  wave() { this.play(440, 0.12, "triangle", 0.06, 220); },
  powerup() {
    this.play(660, 0.1, "triangle", 0.07, 0);
    setTimeout(() => this.play(990, 0.18, "triangle", 0.07, 300), 90);
  },
};

// ---------- Background music ----------
// A looping synth track: bass, arpeggio and hi-hat over Am - F - C - G.
// Uses a look-ahead scheduler so timing stays tight.
const music = {
  enabled: storage.get("td.music", true),
  playing: false,
  timer: null,
  out: null,
  noise: null,
  step: 0,
  nextTime: 0,
  tempo: () => 108, // replaced by the game to follow wave / slow-mo

  progression: [
    { root: 45, chord: [57, 60, 64] }, // Am
    { root: 41, chord: [53, 57, 60] }, // F
    { root: 48, chord: [55, 60, 64] }, // C
    { root: 43, chord: [55, 59, 62] }, // G
  ],
  arp: [0, 1, 2, 1, 0, 2, 1, 2],

  start() {
    const ac = sound.ctx;
    if (!this.enabled || !ac || this.playing) return;
    this.playing = true;
    this.out = ac.createGain();
    this.out.gain.setValueAtTime(0.0001, ac.currentTime);
    this.out.gain.exponentialRampToValueAtTime(0.6, ac.currentTime + 0.8);
    this.out.connect(ac.destination);
    if (!this.noise) this.noise = makeNoise(ac);
    this.nextTime = ac.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const out = this.out;
    const ac = sound.ctx;
    out.gain.cancelScheduledValues(ac.currentTime);
    out.gain.setValueAtTime(out.gain.value, ac.currentTime);
    out.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.3);
    setTimeout(() => out.disconnect(), 400);
  },

  schedule() {
    const ac = sound.ctx;
    while (this.nextTime < ac.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.tempo() / 4; // 16th notes
      this.step++;
    }
  },

  playStep(step, t) {
    const bar = this.progression[Math.floor(step / 16) % this.progression.length];
    const s = step % 16;
    if (s % 4 === 0) this.note(bar.root, t, 0.28, "triangle", 0.16);
    if (s % 2 === 0) this.note(bar.chord[this.arp[s / 2]] + 12, t, 0.11, "square", 0.018);
    if (s % 4 === 2) this.hat(t);
  },

  note(midi, t, dur, type, vol) {
    const ac = sound.ctx;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(440 * Math.pow(2, (midi - 69) / 12), t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + dur);
  },

  hat(t) {
    const ac = sound.ctx;
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t);
    src.stop(t + 0.06);
  },
};

function makeNoise(ac) {
  const buffer = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
