"use strict";

/* =========================================================
   Typing Defence
   Type the word on an enemy to shoot it before it reaches
   your base. Plain JS + canvas, no build step needed.
   Depends on: storage.js, words.js, i18n.js, audio.js, leaderboard.js
   ========================================================= */

// ---------- DOM ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stage = document.getElementById("stage");
const mobileInput = document.getElementById("mobile-input");
const nameInput = document.getElementById("player-name");

const overlay = document.getElementById("overlay");
const panels = {
  start: document.getElementById("panel-start"),
  board: document.getElementById("panel-board"),
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

const musicBtn = document.getElementById("btn-music");
const muteBtn = document.getElementById("btn-mute");
const pauseBtn = document.getElementById("btn-pause");

// ---------- Settings ----------
const MAX_HP = 10;
const BULLET_SPEED = 1100; // px per second
const MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace";
const DIFFICULTY = {
  easy: { speed: 0.75, spawn: 1.3 },
  normal: { speed: 1, spawn: 1 },
  hard: { speed: 1.3, spawn: 0.8 },
};

// Power-ups drop from the sky carrying an easy word; type it to collect.
const HEAL_AMOUNT = 3;
const SLOW_FACTOR = 0.3; // enemies move at 30% speed during slow-mo
const POWERUPS = {
  heal: { icon: "❤", color: "#06d6a0", hue: 160, weight: 45 },
  slow: { icon: "❄", color: "#4cc9f0", hue: 195, weight: 40, duration: 10 },
  cheat: { icon: "★", color: "#ffd166", hue: 45, weight: 15, duration: 20 }, // rare
};
const POWERUP_INTERVAL = [10, 18]; // seconds between drops (min, max)

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function updateSoundButtons() {
  muteBtn.textContent = sound.muted ? "🔇" : "🔊";
  musicBtn.classList.toggle("off", !music.enabled);
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

// ---------- Settings state ----------
let difficulty = storage.get("td.difficulty", "normal");
if (!DIFFICULTY[difficulty]) difficulty = "normal";

let language = storage.get("td.language", "en");
if (!LANGS[language]) language = "en";

nameInput.value = storage.get("td.name", "");

function lang() {
  return LANGS[language];
}

function playerName() {
  return nameInput.value.trim() || lang().text.defaultName;
}

function bestKey() {
  return `td.best.${language}.${difficulty}`;
}

function loadBest() {
  // English scores used to be stored without a language in the key.
  const legacy = language === "en" ? storage.get(`td.best.${difficulty}`, 0) : 0;
  return Math.max(storage.get(bestKey(), legacy), leaderboard.topScore(language, difficulty));
}

// ---------- Game state ----------
let game = null;
let phase = "menu"; // menu | playing | paused | over
let currentPanel = "start";

function newGame() {
  return {
    score: 0,
    best: loadBest(),
    hp: MAX_HP,
    wave: 0,
    enemies: [], // regular enemies, bosses and power-ups
    bullets: [],
    particles: [],
    texts: [],
    queue: [], // enemies waiting to spawn this wave
    spawnTimer: 0,
    waveDelay: 0,
    powerupTimer: rand(...POWERUP_INTERVAL),
    effects: { slow: 0, cheat: 0 }, // seconds left
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

// Music speeds up with each wave and drags during slow-mo.
music.tempo = () => {
  if (!game) return 108;
  const base = Math.min(150, 104 + game.wave * 2);
  return game.effects.slow > 0 ? base * 0.7 : base;
};

// ---------- Waves ----------
function startWave(n) {
  const g = game;
  const diff = DIFFICULTY[difficulty];
  g.wave = n;
  g.waveDamaged = false;
  g.waveDelay = 2.2;
  g.spawnTimer = 0;
  g.banner = { text: lang().waveBanner(n, n % 5 === 0), t: 2.2 };

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
  const pool = WORDS[language][tier];
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
  const speed = (H / travelTime) * rand(0.85, 1.15) * (boss ? 0.45 : 1);

  const margin = Math.min(80, W * 0.12);
  g.enemies.push({
    kind: boss ? "boss" : "enemy",
    x: rand(margin, W - margin),
    y: -30,
    word,
    typed: 0,
    hits: 0,
    speed,
    boss,
    radius: boss ? 26 : 14,
    hue: boss ? 340 : rand(180, 280),
    doomed: false,
    flash: 0,
    spin: Math.random() * Math.PI * 2,
  });
}

function pickPowerup() {
  const options = Object.entries(POWERUPS).filter(([kind]) => kind !== "heal" || game.hp < MAX_HP);
  const total = options.reduce((sum, [, p]) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const [kind, p] of options) {
    r -= p.weight;
    if (r <= 0) return kind;
  }
  return options[0][0];
}

function spawnPowerup() {
  const power = pickPowerup();
  const margin = Math.min(80, W * 0.12);
  game.enemies.push({
    kind: "powerup",
    power,
    x: rand(margin, W - margin),
    y: -30,
    word: pickWord("easy"),
    typed: 0,
    hits: 0,
    speed: H / 9, // falls straight down; never damages the base
    boss: false,
    radius: 16,
    hue: POWERUPS[power].hue,
    doomed: false,
    flash: 0,
    spin: 0,
  });
}

// ---------- Typing ----------
function handleChar(raw) {
  if (phase !== "playing") return;
  const g = game;
  const ch = raw.toLowerCase();

  // Cheat mode: any key counts as the next correct letter.
  if (g.effects.cheat > 0) {
    if (!g.target) {
      const base = basePos();
      const candidates = g.enemies.filter((e) => !e.doomed);
      if (candidates.length === 0) return;
      candidates.sort((a, b) => dist(a, base) - dist(b, base));
      g.target = candidates[0];
    }
    g.keystrokes++;
    advance(g.target);
    return;
  }

  const isSpace = ch === " ";
  if (!isSpace && !lang().alphabet.test(ch)) return;
  if (isSpace && !g.target) return; // stray spaces between words are harmless

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
    advance(t);
  } else {
    t.flash = 0.2;
    miss();
  }
}

function advance(t) {
  t.typed++;
  game.correct++;
  fire(t);
  if (t.typed === t.word.length) {
    t.doomed = true;
    game.target = null;
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
    const s = rand(40, 220) * power;
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.4, 0.9),
      max: 0.9,
      size: rand(1, 3.5),
      hue,
    });
  }
}

function floatText(x, y, text, color) {
  game.texts.push({ x, y, text, color, t: 1 });
}

function killEnemy(e) {
  if (e.kind === "powerup") return collectPowerup(e);
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

function collectPowerup(e) {
  const g = game;
  const p = POWERUPS[e.power];
  if (e.power === "heal") g.hp = Math.min(MAX_HP, g.hp + HEAL_AMOUNT);
  else g.effects[e.power] = p.duration;
  g.score += 25;
  burst(e.x, e.y, p.hue, 36, 1.2);
  floatText(e.x, e.y, `${p.icon} ${lang().text[e.power]}`, p.color);
  removeEnemy(e);
  sound.powerup();
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
  g.effects.slow = Math.max(0, g.effects.slow - dt);
  g.effects.cheat = Math.max(0, g.effects.cheat - dt);
  if (g.banner) {
    g.banner.t -= dt;
    if (g.banner.t <= 0) g.banner = null;
  }

  // Spawning
  if (g.waveDelay > 0) {
    g.waveDelay -= dt;
  } else {
    if (g.queue.length > 0) {
      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0) {
        spawnEnemy(g.queue.shift());
        g.spawnTimer = g.spawnInterval * rand(0.7, 1.3);
      }
    }
    g.powerupTimer -= dt;
    if (g.powerupTimer <= 0) {
      if (!g.enemies.some((e) => e.kind === "powerup")) spawnPowerup();
      g.powerupTimer = rand(...POWERUP_INTERVAL);
    }
  }

  // Movement
  const slow = g.effects.slow > 0 ? SLOW_FACTOR : 1;
  for (const e of [...g.enemies]) {
    e.flash = Math.max(0, e.flash - dt);

    if (e.kind === "powerup") {
      e.y += e.speed * dt;
      e.spin += dt;
      if (e.y > H + 30) {
        if (e.doomed) collectPowerup(e);
        else removeEnemy(e);
      }
      continue;
    }

    const dx = base.x - e.x;
    const dy = base.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * slow * dt;
    e.y += (dy / d) * e.speed * slow * dt;
    e.spin += dt * (e.boss ? 0.8 : 2) * slow;

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
      if (e.kind !== "powerup") {
        // Knock the enemy back a little on every hit
        const kx = e.x - base.x;
        const ky = e.y - base.y;
        const kd = Math.hypot(kx, ky) || 1;
        e.x += (kx / kd) * (e.boss ? 2 : 5);
        e.y += (ky / kd) * (e.boss ? 2 : 5);
      }
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

  // Turret aim follows current target (or whatever the last shot is chasing)
  const aimAt = g.target || g.bullets[g.bullets.length - 1]?.target;
  const desired = aimAt ? Math.atan2(aimAt.y - base.y, aimAt.x - base.x) : -Math.PI / 2;
  g.aim += (desired - g.aim) * Math.min(1, dt * 18);

  // Wave cleared (power-ups still floating don't hold the wave up)
  if (g.waveDelay <= 0 && g.queue.length === 0 && g.enemies.every((e) => e.kind === "powerup")) {
    if (!g.waveDamaged && g.hp < MAX_HP) {
      g.hp++;
      floatText(base.x, base.y - 40, "+1 HP", "#06d6a0");
    }
    const bonus = g.wave * 50;
    g.score += bonus;
    floatText(W / 2, H / 2 + 40, lang().waveClear(bonus), "#4cc9f0");
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

  const starSpeed = game && game.effects.slow > 0 ? SLOW_FACTOR : 1;
  for (const s of stars) {
    s.y += s.speed * dt * starSpeed;
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

  // Power-up tints
  if (g.effects.slow > 0) {
    ctx.fillStyle = "rgba(76, 201, 240, 0.07)";
    ctx.fillRect(0, 0, W, H);
  }
  if (g.effects.cheat > 0) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.05)";
    ctx.fillRect(0, 0, W, H);
  }

  if (g.shake > 0) {
    const m = g.shake * 14;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }

  drawBase(g);

  // Enemies (current target drawn last so its label is on top)
  const order = g.enemies.filter((e) => e !== g.target);
  if (g.target) order.push(g.target);
  for (const e of order) {
    if (e.kind === "powerup") drawPowerup(e);
    else drawEnemy(e, e === g.target);
    drawLabel(e, e === g.target);
  }

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
  ctx.direction = lang().dir;
  ctx.textAlign = "center";
  ctx.font = `700 16px ${MONO}`;
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

  drawEffectTimers(g);

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

  // Turret barrel (gold while cheat mode is on)
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(g.aim);
  ctx.fillStyle = g.effects.cheat > 0 ? "#ffd166" : "#c8d3f5";
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
}

function drawPowerup(e) {
  const p = POWERUPS[e.power];
  const r = e.radius * (1 + Math.sin(e.spin * 5) * 0.08);
  ctx.save();
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = `hsla(${p.hue}, 80%, 22%, 0.9)`;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = p.color;
  ctx.font = "16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(p.icon, e.x, e.y + 1);
  ctx.restore();
}

function drawLabel(e, isTarget) {
  // Spaces in boss sentences are shown as "·" so players can see them.
  const display = e.word.replace(/ /g, "·");
  const padX = 8;
  const accent = e.kind === "powerup" ? POWERUPS[e.power].color : "#ffd166";

  let fontSize = e.boss ? 18 : 15;
  ctx.font = `700 ${fontSize}px ${MONO}`;
  let full = ctx.measureText(display).width;
  const maxText = W - 8 - padX * 2;
  if (full > maxText) {
    // Long sentences on narrow screens: shrink to fit.
    fontSize = Math.max(9, Math.floor((fontSize * maxText) / full));
    ctx.font = `700 ${fontSize}px ${MONO}`;
    full = ctx.measureText(display).width;
  }

  const typed = display.slice(0, e.typed);
  const rest = display.slice(e.typed);
  const typedW = ctx.measureText(typed).width;
  const labelW = full + padX * 2;
  const labelH = fontSize + 10;
  const lx = Math.max(4, Math.min(W - labelW - 4, e.x - labelW / 2));
  const ly = e.y + e.radius + 8;

  ctx.fillStyle = isTarget ? "rgba(40, 30, 0, 0.9)" : "rgba(5, 8, 20, 0.8)";
  ctx.strokeStyle = isTarget || e.kind === "powerup" ? accent : "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = isTarget ? 2 : 1;
  roundRect(lx, ly, labelW, labelH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = "middle";
  const ty = ly + labelH / 2 + 1;
  const restColor = e.doomed ? "rgba(255,255,255,0.3)" : "#ffffff";
  if (lang().dir === "rtl") {
    // Right-to-left: the typed part sits on the right edge.
    const right = lx + labelW - padX;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(typed, right, ty);
    ctx.fillStyle = restColor;
    ctx.fillText(rest, right - typedW, ty);
  } else {
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd166";
    ctx.fillText(typed, lx + padX, ty);
    ctx.fillStyle = restColor;
    ctx.fillText(rest, lx + padX + typedW, ty);
  }
  ctx.textBaseline = "alphabetic";
}

// Countdown bars for active timed power-ups, in the top corner.
function drawEffectTimers(g) {
  const rtl = lang().dir === "rtl";
  const w = 170;
  const h = 26;
  let y = 12;
  for (const kind of ["slow", "cheat"]) {
    const left = g.effects[kind];
    if (left <= 0) continue;
    const p = POWERUPS[kind];
    const x = rtl ? W - 12 - w : 12;

    ctx.fillStyle = "rgba(5, 8, 20, 0.8)";
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.3;
    const fillW = w * (left / p.duration);
    roundRect(rtl ? x + w - fillW : x, y, fillW, h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 6);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 13px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.direction = lang().dir;
    ctx.textAlign = rtl ? "right" : "left";
    const label = `${p.icon} ${lang().text[kind]} · ${lang().seconds(Math.ceil(left))}`;
    ctx.fillText(label, rtl ? x + w - 10 : x + 10, y + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
    y += h + 6;
  }
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
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

// ---------- Leaderboard view ----------
function renderBoard(container, { limit = LEADERBOARD_SIZE, highlightRank = 0 } = {}) {
  const T = lang().text;
  container.textContent = "";
  const list = leaderboard.load(language, difficulty).slice(0, limit);
  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = T.emptyBoard;
    container.append(p);
    return;
  }

  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  for (const [text, cls] of [["#", "num"], [T.colName, ""], [T.score, "num"], [T.wave, "num"], [T.wpm, "num"]]) {
    const th = document.createElement("th");
    th.textContent = text;
    if (cls) th.className = cls;
    head.append(th);
  }
  const body = table.createTBody();
  list.forEach((entry, i) => {
    const row = body.insertRow();
    if (i + 1 === highlightRank) row.className = "me";
    const cells = [[i + 1, "num"], [entry.name, "name"], [entry.score, "num"], [entry.wave, "num"], [entry.wpm, "num"]];
    for (const [value, cls] of cells) {
      const td = row.insertCell();
      td.textContent = value; // names are user input, so never innerHTML
      td.className = cls;
    }
  });
  container.append(table);
}

function openBoard() {
  document.getElementById("board-subtitle").textContent =
    `${lang().text.langName} · ${lang().text[difficulty]}`;
  renderBoard(document.getElementById("board-full"));
  showPanel("board");
}

// ---------- Flow ----------
function showPanel(name) {
  currentPanel = name;
  for (const [key, el] of Object.entries(panels)) el.classList.toggle("hidden", key !== name);
  overlay.classList.toggle("hidden", name === null);
}

function startGame() {
  sound.init();
  storage.set("td.name", nameInput.value.trim());
  game = newGame();
  phase = "playing";
  showPanel(null);
  startWave(1);
  updateHud();
  music.start();
  focusInput();
}

function pauseGame() {
  if (phase !== "playing") return;
  phase = "paused";
  music.stop();
  showPanel("pause");
}

function resumeGame() {
  if (phase !== "paused") return;
  phase = "playing";
  showPanel(null);
  music.start();
  focusInput();
}

function quitToMenu() {
  phase = "menu";
  game = null;
  music.stop();
  syncMenuButtons();
  showPanel("start");
}

function endGame() {
  const g = game;
  phase = "over";
  music.stop();
  const { wpm, acc } = stats();
  const isRecord = g.score > g.best;
  if (isRecord) storage.set(bestKey(), g.score);
  const rank = leaderboard.add(language, difficulty, {
    name: playerName(),
    score: g.score,
    wave: g.wave,
    wpm,
    acc,
  });
  updateHud();

  const L = lang();
  let msg = L.heldOut(g.wave);
  if (isRecord) msg = L.newBest(L.text[difficulty]);
  else if (rank) msg = L.rank(rank);
  document.getElementById("over-msg").textContent = msg;
  document.getElementById("res-score").textContent = g.score;
  document.getElementById("res-wave").textContent = g.wave;
  document.getElementById("res-kills").textContent = g.kills;
  document.getElementById("res-wpm").textContent = wpm;
  document.getElementById("res-acc").textContent = `${acc}%`;
  document.getElementById("res-combo").textContent = g.bestCombo;
  renderBoard(document.getElementById("board-over"), { limit: Math.max(5, rank), highlightRank: rank });

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
    else if (currentPanel === "board") showPanel("start");
    return;
  }

  if (ev.key === "Enter") {
    // Let focused buttons (e.g. Leaderboard) handle Enter themselves.
    if (ev.target instanceof HTMLButtonElement) return;
    if ((phase === "menu" && currentPanel === "start") || phase === "over") {
      ev.preventDefault();
      startGame();
    }
    return;
  }

  if (phase === "playing" && ev.key.length === 1) {
    ev.preventDefault(); // stops the hidden input from also receiving it
    if (ev.repeat) return;
    // If the OS keyboard is set to another language, fall back to the
    // physical key position (e.g. the "A" key types "ש" in Hebrew mode).
    let ch = ev.key.toLowerCase();
    if (!lang().alphabet.test(ch) && lang().keys[ev.code]) ch = lang().keys[ev.code];
    handleChar(ch);
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

nameInput.addEventListener("input", () => storage.set("td.name", nameInput.value.trim()));

window.addEventListener("blur", pauseGame);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);
document.getElementById("btn-resume").addEventListener("click", resumeGame);
document.getElementById("btn-quit").addEventListener("click", quitToMenu);
document.getElementById("btn-menu").addEventListener("click", quitToMenu);
document.getElementById("btn-board").addEventListener("click", openBoard);
document.getElementById("btn-board-back").addEventListener("click", () => showPanel("start"));

pauseBtn.addEventListener("click", () => {
  if (phase === "playing") pauseGame();
  else if (phase === "paused") resumeGame();
});

muteBtn.addEventListener("click", () => {
  sound.muted = !sound.muted;
  storage.set("td.muted", sound.muted);
  updateSoundButtons();
  if (phase === "playing") focusInput();
});

musicBtn.addEventListener("click", () => {
  music.enabled = !music.enabled;
  storage.set("td.music", music.enabled);
  updateSoundButtons();
  if (music.enabled && phase === "playing") music.start();
  else music.stop();
  if (phase === "playing") focusInput();
});

for (const btn of document.querySelectorAll(".diff")) {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.diff;
    storage.set("td.difficulty", difficulty);
    syncMenuButtons();
  });
}

for (const btn of document.querySelectorAll(".lang")) {
  btn.addEventListener("click", () => {
    language = btn.dataset.lang;
    storage.set("td.language", language);
    applyLanguage();
  });
}

function setActive(selector, attr, value) {
  for (const b of document.querySelectorAll(selector)) {
    const on = b.dataset[attr] === value;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
}

function syncMenuButtons() {
  setActive(".diff", "diff", difficulty);
  setActive(".lang", "lang", language);
  hud.best.textContent = loadBest();
}

function applyLanguage() {
  const L = lang();
  document.documentElement.lang = language;
  document.documentElement.dir = L.dir;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.innerHTML = L.text[el.dataset.i18n];
  }
  nameInput.placeholder = L.text.defaultName;
  document.title = L.text.title.replace(/<[^>]+>/g, "");
  syncMenuButtons();
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
updateSoundButtons();
applyLanguage();
showPanel("start");
requestAnimationFrame(frame);
