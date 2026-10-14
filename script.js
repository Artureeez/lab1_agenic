"use strict";

/* =========================================================
   Typing Defence
   Type the word on an enemy to shoot it before it reaches
   your base. Plain JS + canvas, no build step needed.
   ========================================================= */

// ---------- DOM ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const mobileInput = document.getElementById("mobile-input");

const overlay = document.getElementById("overlay");
const panels = {
  start: document.getElementById("panel-start"),
  pause: document.getElementById("panel-pause"),
  over: document.getElementById("panel-over"),
};

const hud = {
  score: document.getElementById("hud-score"),
  best: document.getElementById("hud-best"),
  wave: document.getElementById("hud-wave"),
  health: document.getElementById("hud-health"),
  combo: document.getElementById("hud-combo"),
  wpm: document.getElementById("hud-wpm"),
  acc: document.getElementById("hud-acc"),
};

const muteBtn = document.getElementById("btn-mute");
const pauseBtn = document.getElementById("btn-pause");

// ---------- Settings ----------
const MAX_HP = 10;
const BULLET_SPEED = 1100; // px per second
const DIFFICULTY = {
  easy: { speed: 0.75, spawn: 1.3 },
  normal: { speed: 1, spawn: 1 },
  hard: { speed: 1.3, spawn: 0.8 },
};

// ---------- Storage (guarded: may be unavailable) ----------
const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

// ---------- Sound (tiny WebAudio blips) ----------
const sound = {
  ctx: null,
  muted: storage.get("td.muted", false),
  init() {
    if (this.ctx) return;
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
};

function updateMuteButton() {
  muteBtn.textContent = sound.muted ? "🔇" : "🔊";
}

// ---------- Canvas sizing ----------
let W = 0;
let H = 0;

function resize() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = rect.width;
  H = rect.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  makeStars();
}

function basePos() {
  return { x: W / 2, y: H - 46 };
}

// ---------- Background stars ----------
let stars = [];
function makeStars() {
  const count = Math.round((W * H) / 6000);
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.4 + 0.2,
    speed: Math.random() * 12 + 4,
  }));
}

// ---------- Game state ----------
let difficulty = storage.get("td.difficulty", "normal");
if (!DIFFICULTY[difficulty]) difficulty = "normal";

let game = null;
let phase = "menu"; // menu | playing | paused | over

function newGame() {
  return {
    score: 0,
    best: storage.get(`td.best.${difficulty}`, 0),
    hp: MAX_HP,
    wave: 0,
    enemies: [],
    bullets: [],
    particles: [],
    texts: [],
    queue: [], // enemies waiting to spawn this wave
    spawnTimer: 0,
    waveDelay: 0,
    banner: null,
    target: null,
    aim: -Math.PI / 2,
    combo: 0,
    bestCombo: 0,
    kills: 0,
    correct: 0,
    keystrokes: 0,
    playTime: 0,
    shake: 0,
    missFlash: 0,
    waveDamaged: false,
  };
}

// ---------- Waves ----------
function startWave(n) {
  const g = game;
  const diff = DIFFICULTY[difficulty];
  g.wave = n;
  g.waveDamaged = false;
  g.waveDelay = 2.2;
  g.spawnTimer = 0;
  g.banner = { text: n % 5 === 0 ? `Wave ${n} · Boss` : `Wave ${n}`, t: 2.2 };

  const count = 5 + n * 2;
  g.spawnInterval = Math.max(0.45, 2.1 - n * 0.12) * diff.spawn;
  g.queue = [];
  for (let i = 0; i < count; i++) g.queue.push({ boss: false });
  if (n % 5 === 0) g.queue.push({ boss: true });

  sound.wave();
}

function pickTier(wave) {
  const easy = Math.max(0.1, 0.75 - wave * 0.08);
  const hard = Math.min(0.45, Math.max(0, wave * 0.05 - 0.1));
  const r = Math.random();
  if (r < easy) return "easy";
  if (r < easy + hard) return "hard";
  return "medium";
}

function pickWord(tier) {
  const pool = WORDS[tier];
  const active = game.enemies.filter((e) => !e.doomed);
  const usedLetters = new Set(active.map((e) => e.word[0]));
  const usedWords = new Set(active.map((e) => e.word));
  // Prefer words whose first letter is not already on screen,
  // so the first keypress always picks an obvious target.
  for (let i = 0; i < 30; i++) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!usedLetters.has(w[0]) && !usedWords.has(w)) return w;
  }
  for (let i = 0; i < 30; i++) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (!usedWords.has(w)) return w;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnEnemy({ boss }) {
  const g = game;
  const diff = DIFFICULTY[difficulty];
  const word = boss ? pickWord("boss") : pickWord(pickTier(g.wave));

  // Speed is expressed as "seconds to cross the screen" so it feels
  // the same on tall and short screens.
  const travelTime = Math.max(5.5, 15 - g.wave * 0.6) / diff.speed;
  const speed = (H / travelTime) * (0.85 + Math.random() * 0.3) * (boss ? 0.55 : 1);

  const margin = Math.min(80, W * 0.12);
  g.enemies.push({
    x: margin + Math.random() * (W - margin * 2),
    y: -30,
    word,
    typed: 0,
    hits: 0,
    speed,
    boss,
    radius: boss ? 26 : 14,
    hue: boss ? 340 : 180 + Math.random() * 100,
    doomed: false,
    flash: 0,
    spin: Math.random() * Math.PI * 2,
  });
}

// ---------- Typing ----------
function handleChar(raw) {
  if (phase !== "playing") return;
  const ch = raw.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;

  const g = game;
  g.keystrokes++;

  if (!g.target) {
    const base = basePos();
    const candidates = g.enemies.filter((e) => !e.doomed && e.word[0] === ch);
    if (candidates.length === 0) return miss();
    candidates.sort((a, b) => dist(a, base) - dist(b, base));
    g.target = candidates[0];
  }

  const t = g.target;
  if (t.word[t.typed] === ch) {
    t.typed++;
    g.correct++;
    fire(t);
    if (t.typed === t.word.length) {
      t.doomed = true;
      g.target = null;
    }
  } else {
    t.flash = 0.2;
    miss();
  }
}

function miss() {
  game.combo = 0;
  game.missFlash = 0.25;
  sound.miss();
}

function fire(target) {
  const base = basePos();
  game.bullets.push({ x: base.x, y: base.y - 18, target });
  sound.shoot();
}

// ---------- Effects ----------
function burst(x, y, hue, count, power = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (Math.random() * 180 + 40) * power;
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5,
      max: 0.9,
      size: Math.random() * 2.5 + 1,
      hue,
    });
  }
}

function floatText(x, y, text, color) {
  game.texts.push({ x, y, text, color, t: 1 });
}

function killEnemy(e) {
  const g = game;
  g.combo++;
  g.bestCombo = Math.max(g.bestCombo, g.combo);
  g.kills++;
  const multiplier = 1 + Math.min(g.combo, 20) * 0.1;
  const points = Math.round(e.word.length * 10 * multiplier * (e.boss ? 3 : 1));
  g.score += points;
  burst(e.x, e.y, e.hue, e.boss ? 60 : 24, e.boss ? 1.6 : 1);
  floatText(e.x, e.y, `+${points}`, "#ffd166");
  if (e.boss) g.shake = 0.3;
  removeEnemy(e);
  sound.kill();
}

function removeEnemy(e) {
  const g = game;
  g.enemies = g.enemies.filter((x) => x !== e);
  g.bullets = g.bullets.filter((b) => b.target !== e);
  if (g.target === e) g.target = null;
}

function damageBase(e) {
  const g = game;
  const dmg = e.boss ? 3 : 1;
  g.hp = Math.max(0, g.hp - dmg);
  g.combo = 0;
  g.waveDamaged = true;
  g.shake = 0.4;
  burst(e.x, e.y, 0, 40, 1.3);
  floatText(e.x, e.y - 20, `-${dmg} HP`, "#ef476f");
  removeEnemy(e);
  sound.hurt();
  if (g.hp <= 0) endGame();
}

// ---------- Update ----------
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function update(dt) {
  const g = game;
  const base = basePos();

  g.playTime += dt;
  g.shake = Math.max(0, g.shake - dt);
  g.missFlash = Math.max(0, g.missFlash - dt);
  if (g.banner) {
    g.banner.t -= dt;
    if (g.banner.t <= 0) g.banner = null;
  }

  // Spawning
  if (g.waveDelay > 0) {
    g.waveDelay -= dt;
  } else if (g.queue.length > 0) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnEnemy(g.queue.shift());
      g.spawnTimer = g.spawnInterval * (0.7 + Math.random() * 0.6);
    }
  }

  // Enemies move toward the base
  for (const e of [...g.enemies]) {
    const dx = base.x - e.x;
    const dy = base.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    e.spin += dt * (e.boss ? 0.8 : 2);
    e.flash = Math.max(0, e.flash - dt);

    if (d < e.radius + 24) {
      // A word that was already finished still counts as a kill.
      if (e.doomed) killEnemy(e);
      else damageBase(e);
      if (phase !== "playing") return;
    }
  }

  // Bullets home in on their target
  for (const b of [...g.bullets]) {
    if (!g.bullets.includes(b)) continue; // its target died earlier this frame
    const e = b.target;
    const d = dist(b, e);
    const step = BULLET_SPEED * dt;
    if (d <= step + e.radius * 0.5) {
      g.bullets = g.bullets.filter((x) => x !== b);
      e.hits++;
      // Knock the enemy back a little on every hit
      const kx = e.x - base.x;
      const ky = e.y - base.y;
      const kd = Math.hypot(kx, ky) || 1;
      e.x += (kx / kd) * (e.boss ? 2 : 5);
      e.y += (ky / kd) * (e.boss ? 2 : 5);
      burst(e.x, e.y, 45, 4, 0.5);
      if (e.doomed && e.hits >= e.word.length) killEnemy(e);
    } else {
      b.x += ((e.x - b.x) / d) * step;
      b.y += ((e.y - b.y) / d) * step;
    }
  }

  // Particles & floating text
  for (const p of g.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);

  for (const t of g.texts) {
    t.y -= 40 * dt;
    t.t -= dt;
  }
  g.texts = g.texts.filter((t) => t.t > 0);

  // Turret aim follows current target (or the nearest doomed enemy)
  const aimAt = g.target || g.bullets[g.bullets.length - 1]?.target;
  const desired = aimAt ? Math.atan2(aimAt.y - base.y, aimAt.x - base.x) : -Math.PI / 2;
  g.aim += (desired - g.aim) * Math.min(1, dt * 18);

  // Wave cleared
  if (g.waveDelay <= 0 && g.queue.length === 0 && g.enemies.length === 0) {
    if (!g.waveDamaged && g.hp < MAX_HP) {
      g.hp++;
      floatText(base.x, base.y - 40, "+1 HP", "#06d6a0");
    }
    const bonus = g.wave * 50;
    g.score += bonus;
    floatText(W / 2, H / 2 + 40, `Wave clear +${bonus}`, "#4cc9f0");
    startWave(g.wave + 1);
  }

  updateHud();
}

// ---------- Rendering ----------
function draw(dt) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#050816");
  bg.addColorStop(1, "#0d1530");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > H) {
      s.y = 0;
      s.x = Math.random() * W;
    }
    ctx.fillStyle = `rgba(200, 215, 255, ${0.3 + s.r * 0.3})`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }

  if (!game) {
    ctx.restore();
    return;
  }
  const g = game;

  if (g.shake > 0) {
    const m = g.shake * 14;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }

  drawBase(g);

  // Enemies (current target drawn last so its label is on top)
  const order = g.enemies.filter((e) => e !== g.target);
  if (g.target) order.push(g.target);
  for (const e of order) drawEnemy(e, e === g.target);

  // Bullets
  ctx.fillStyle = "#ffd166";
  ctx.shadowColor = "#ffd166";
  ctx.shadowBlur = 10;
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Particles
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Floating text
  ctx.textAlign = "center";
  ctx.font = "700 16px ui-monospace, Menlo, Consolas, monospace";
  for (const t of g.texts) {
    ctx.globalAlpha = Math.max(0, t.t);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // Wave banner
  if (g.banner) {
    const a = Math.min(1, g.banner.t, 2.2 - g.banner.t + 0.2);
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = "#e6ecff";
    ctx.font = `800 ${Math.min(48, W / 10)}px system-ui, sans-serif`;
    ctx.fillText(g.banner.text, W / 2, H / 2 - 20);
    ctx.globalAlpha = 1;
  }

  // Red edge flash on typo
  if (g.missFlash > 0) {
    ctx.strokeStyle = `rgba(239, 71, 111, ${g.missFlash * 2})`;
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, W, H);
  }

  ctx.restore();
}

function drawBase(g) {
  const base = basePos();

  // Ground glow
  const ground = ctx.createLinearGradient(0, H - 70, 0, H);
  ground.addColorStop(0, "rgba(76, 201, 240, 0)");
  ground.addColorStop(1, "rgba(76, 201, 240, 0.15)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, H - 70, W, 70);

  // Shield arc, fades as HP drops
  const hpRatio = g.hp / MAX_HP;
  ctx.strokeStyle = `rgba(76, 201, 240, ${0.15 + hpRatio * 0.45})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(base.x, base.y, 40, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Turret barrel
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(g.aim);
  ctx.fillStyle = "#c8d3f5";
  ctx.fillRect(0, -4, 30, 8);
  ctx.restore();

  // Turret body
  ctx.fillStyle = "#1c2a52";
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(base.x, base.y, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawEnemy(e, isTarget) {
  // Body
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.spin);
  const sides = e.boss ? 6 : 4;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * e.radius, Math.sin(a) * e.radius);
  }
  ctx.closePath();
  const color = e.flash > 0 ? "#ef476f" : `hsl(${e.hue}, 80%, 60%)`;
  ctx.fillStyle = `hsla(${e.hue}, 80%, 30%, 0.8)`;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = isTarget ? 18 : 8;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Word label
  const fontSize = e.boss ? 18 : 15;
  ctx.font = `700 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const typed = e.word.slice(0, e.typed);
  const rest = e.word.slice(e.typed);
  const full = ctx.measureText(e.word).width;
  const typedW = ctx.measureText(typed).width;
  const padX = 8;
  const labelW = full + padX * 2;
  const labelH = fontSize + 10;
  let lx = e.x - labelW / 2;
  lx = Math.max(4, Math.min(W - labelW - 4, lx));
  const ly = e.y + e.radius + 8;

  ctx.fillStyle = isTarget ? "rgba(40, 30, 0, 0.9)" : "rgba(5, 8, 20, 0.8)";
  ctx.strokeStyle = isTarget ? "#ffd166" : "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = isTarget ? 2 : 1;
  roundRect(lx, ly, labelW, labelH, 6);
  ctx.fill();
  ctx.stroke();

  const ty = ly + labelH / 2 + 1;
  ctx.fillStyle = "#ffd166";
  ctx.fillText(typed, lx + padX, ty);
  ctx.fillStyle = e.doomed ? "rgba(255,255,255,0.3)" : "#ffffff";
  ctx.fillText(rest, lx + padX + typedW, ty);
  ctx.textBaseline = "alphabetic";
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- HUD ----------
function stats() {
  const g = game;
  const minutes = g.playTime / 60;
  const wpm = g.playTime > 3 ? Math.round(g.correct / 5 / minutes) : 0;
  const acc = g.keystrokes ? Math.round((g.correct / g.keystrokes) * 100) : 100;
  return { wpm, acc };
}

function updateHud() {
  const g = game;
  const { wpm, acc } = stats();
  hud.score.textContent = g.score;
  hud.best.textContent = Math.max(g.best, g.score);
  hud.wave.textContent = g.wave;
  hud.combo.textContent = `x${g.combo}`;
  hud.wpm.textContent = wpm;
  hud.acc.textContent = `${acc}%`;
  hud.health.style.width = `${(g.hp / MAX_HP) * 100}%`;
  hud.health.classList.toggle("low", g.hp <= 3);
}

// ---------- Flow ----------
function showPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.classList.toggle("hidden", key !== name);
  overlay.classList.toggle("hidden", name === null);
}

function startGame() {
  sound.init();
  game = newGame();
  phase = "playing";
  showPanel(null);
  startWave(1);
  updateHud();
  focusInput();
}

function pauseGame() {
  if (phase !== "playing") return;
  phase = "paused";
  showPanel("pause");
}

function resumeGame() {
  if (phase !== "paused") return;
  phase = "playing";
  showPanel(null);
  focusInput();
}

function quitToMenu() {
  phase = "menu";
  game = null;
  showPanel("start");
}

function endGame() {
  const g = game;
  phase = "over";
  const { wpm, acc } = stats();
  const isRecord = g.score > g.best;
  if (isRecord) storage.set(`td.best.${difficulty}`, g.score);
  updateHud();

  document.getElementById("over-msg").textContent = isRecord
    ? `New best score on ${difficulty}!`
    : `You held out until wave ${g.wave}.`;
  document.getElementById("res-score").textContent = g.score;
  document.getElementById("res-wave").textContent = g.wave;
  document.getElementById("res-kills").textContent = g.kills;
  document.getElementById("res-wpm").textContent = wpm;
  document.getElementById("res-acc").textContent = `${acc}%`;
  document.getElementById("res-combo").textContent = g.bestCombo;

  // Small delay so the final explosion is visible
  setTimeout(() => {
    if (phase === "over") showPanel("over");
  }, 700);
}

function focusInput() {
  // Opens the on-screen keyboard on phones; harmless on desktop.
  mobileInput.value = "";
  mobileInput.focus({ preventScroll: true });
}

// ---------- Input ----------
document.addEventListener("keydown", (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

  if (ev.key === "Escape") {
    if (phase === "playing") pauseGame();
    else if (phase === "paused") resumeGame();
    return;
  }

  if (ev.key === "Enter") {
    if (phase === "menu" || phase === "over") {
      ev.preventDefault();
      startGame();
    }
    return;
  }

  if (phase === "playing" && ev.key.length === 1) {
    ev.preventDefault(); // stops the hidden input from also receiving it
    if (!ev.repeat) handleChar(ev.key);
  }
});

// Mobile keyboards often send "Unidentified" keydowns, so read the input instead.
mobileInput.addEventListener("input", () => {
  const value = mobileInput.value;
  mobileInput.value = "";
  for (const ch of value) handleChar(ch);
});

canvas.addEventListener("pointerdown", () => {
  if (phase === "playing") focusInput();
});

window.addEventListener("blur", pauseGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-quit").addEventListener("click", quitToMenu);
document.getElementById("btn-menu").addEventListener("click", quitToMenu);

pauseBtn.addEventListener("click", () => {
  if (phase === "playing") pauseGame();
  else if (phase === "paused") resumeGame();
});

muteBtn.addEventListener("click", () => {
  sound.muted = !sound.muted;
  storage.set("td.muted", sound.muted);
  updateMuteButton();
  if (phase === "playing") focusInput();
});

for (const btn of document.querySelectorAll(".diff")) {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.diff;
    storage.set("td.difficulty", difficulty);
    syncDifficultyButtons();
  });
}

function syncDifficultyButtons() {
  for (const b of document.querySelectorAll(".diff")) {
    const on = b.dataset.diff === difficulty;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
  hud.best.textContent = storage.get(`td.best.${difficulty}`, 0);
}

// ---------- Main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (phase === "playing") update(dt);
  draw(phase === "paused" ? 0 : dt);
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
resize();
updateMuteButton();
syncDifficultyButtons();
showPanel("start");
requestAnimationFrame(frame);
