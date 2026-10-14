"use strict";

/* =========================================================
   Typing Defense
   Type the word on an enemy to shoot it before it reaches
   your base. Plain JS + canvas, no build step needed.
   Depends on: storage.js, words.js, i18n.js, audio.js,
               background.js, sprites.js, leaderboard.js
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

// Enemy look depends on how hard its word is.
const LOOKS = {
  easy: { look: "meteor", radius: 14, sway: 0 },
  medium: { look: "fighter", radius: 15, sway: 45 },
  hard: { look: "saucer", radius: 17, sway: 70 },
  boss: { look: "mothership", radius: 32, sway: 25 },
};

// Power-ups drop from the sky carrying an easy word; type it to collect.
const HEAL_AMOUNT = 3;
const SLOW_FACTOR = 0.3; // enemies move at 30% speed during slow-mo
const POWERUPS = {
  heal: { icon: "❤", color: "#06d6a0", hue: 160, weight: 45 },
  slow: { icon: "❄", color: "#4cc9f0", hue: 195, weight: 40, duration: 10 },
  cheat: { icon: "★", color: "#ffd166", hue: 45, weight: 15, duration: 10 }, // rare
};
const POWERUP_INTERVAL = [10, 18]; // seconds between drops (min, max)

// Powerdowns: rolled on a timer, announced, then forced on the player.
const POWERDOWN_ROLL_EVERY = 10; // seconds
const POWERDOWN_CHANCE = 0.15;
const POWERDOWN_WARNING = 5; // seconds of warning before it hits
const FAST_FACTOR = 1.8; // enemy speed and spawn rate during "faster words"
const POWERDOWNS = {
  blind: { icon: "👁", color: "#b388ff", duration: 10 },
  fast: { icon: "⏩", color: "#ff9f43", duration: 10 },
  fatal: { icon: "☠", color: "#ef476f", duration: 10 },
};

// Everything shown as a countdown bar, in display order.
const TIMED_EFFECTS = { slow: POWERUPS.slow, cheat: POWERUPS.cheat, ...POWERDOWNS };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
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
  background.build(W, H, dpr);
}

function basePos() {
  return { x: W / 2, y: H - 46 };
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
    time: 0,
    enemies: [], // regular enemies, bosses and power-ups
    bullets: [],
    particles: [],
    rings: [], // explosion shockwaves
    texts: [],
    queue: [], // enemies waiting to spawn this wave
    spawnTimer: 0,
    waveDelay: 0,
    powerupTimer: rand(...POWERUP_INTERVAL),
    powerdownTimer: POWERDOWN_ROLL_EVERY,
    incoming: null, // { kind, t } while a powerdown warning is on screen
    effects: { slow: 0, cheat: 0, blind: 0, fast: 0, fatal: 0 }, // seconds left
    banner: null,
    target: null,
    aim: -Math.PI / 2,
    muzzle: 0,
    combo: 0,
    bestCombo: 0,
    kills: 0,
    correct: 0,
    keystrokes: 0,
    playTime: 0,
    shake: 0,
    missFlash: 0,
    waveDamaged: false,
    deathCause: null,
  };
}

// Combined movement multiplier from slow-mo and "faster words".
function speedFactor(g) {
  return (g.effects.slow > 0 ? SLOW_FACTOR : 1) * (g.effects.fast > 0 ? FAST_FACTOR : 1);
}

// Music speeds up with each wave, drags in slow-mo, races in fast mode.
music.tempo = () => {
  if (!game) return 108;
  let bpm = Math.min(150, 104 + game.wave * 2);
  if (game.effects.slow > 0) bpm *= 0.7;
  if (game.effects.fast > 0) bpm *= 1.3;
  return bpm;
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
    const w = pick(pool);
    if (!usedLetters.has(w[0]) && !usedWords.has(w)) return w;
  }
  for (let i = 0; i < 30; i++) {
    const w = pick(pool);
    if (!usedWords.has(w)) return w;
  }
  return pick(pool);
}

function spawnEnemy({ boss }) {
  const g = game;
  const diff = DIFFICULTY[difficulty];
  const tier = boss ? "boss" : pickTier(g.wave);
  const style = LOOKS[tier];

  // Speed is expressed as "seconds to cross the screen" so it feels
  // the same on tall and short screens.
  const travelTime = Math.max(5.5, 15 - g.wave * 0.6) / diff.speed;
  const speed = (H / travelTime) * rand(0.85, 1.15) * (boss ? 0.45 : 1);

  const margin = Math.min(80, W * 0.12);
  g.enemies.push({
    kind: boss ? "boss" : "enemy",
    look: style.look,
    x: rand(margin, W - margin),
    y: -40,
    word: pickWord(tier),
    typed: 0,
    hits: 0,
    speed,
    boss,
    radius: style.radius * (style.look === "meteor" ? rand(0.9, 1.15) : 1),
    hue: boss ? 330 : style.look === "fighter" ? pick([0, 25, 200, 280]) : rand(90, 200),
    swayAmp: style.sway * rand(0.7, 1.3) * (Math.random() < 0.5 ? -1 : 1),
    sway: Math.random() * Math.PI * 2,
    angle: Math.PI / 2,
    spin: Math.random() * Math.PI * 2,
    trail: 0,
    doomed: false,
    flash: 0,
    hit: 0,
    // Meteor shape: jagged outline and a few craters
    shape: Array.from({ length: 9 }, () => rand(0.75, 1.1)),
    craters: Array.from({ length: 3 }, () => ({ x: rand(-0.4, 0.4), y: rand(-0.4, 0.4), r: rand(0.12, 0.22) })),
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
    hit: 0,
    spin: 0,
  });
}

// ---------- Powerdowns ----------
function updatePowerdowns(dt) {
  const g = game;
  const active = Object.keys(POWERDOWNS).some((k) => g.effects[k] > 0);

  if (g.incoming) {
    const before = Math.ceil(g.incoming.t);
    g.incoming.t -= dt;
    if (g.incoming.t <= 0) {
      const kind = g.incoming.kind;
      g.incoming = null;
      g.effects[kind] = POWERDOWNS[kind].duration;
      g.shake = 0.3;
      sound.powerdown();
      announce(kind);
    } else if (Math.ceil(g.incoming.t) !== before) {
      sound.alarm(); // one beep per second of countdown
    }
    return;
  }

  // Only roll while nothing is active, so powerdowns never stack.
  if (active) return;
  g.powerdownTimer -= dt;
  if (g.powerdownTimer <= 0) {
    g.powerdownTimer = POWERDOWN_ROLL_EVERY;
    if (Math.random() < POWERDOWN_CHANCE) {
      g.incoming = { kind: pick(Object.keys(POWERDOWNS)), t: POWERDOWN_WARNING };
      sound.alarm();
    }
  }
}

// Instant game over: fatal impact powerdown, or a boss reaching the base.
function fatalHit(cause = "fatal") {
  const g = game;
  const base = basePos();
  g.deathCause = cause;
  g.hp = 0;
  g.shake = 0.6;
  burst(base.x, base.y, 350, 70, 1.8);
  addRing(base.x, base.y, "239, 71, 111", 160);
  sound.hurt();
  endGame();
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
  if (game.effects.fatal > 0) return fatalHit();
  game.combo = 0;
  game.missFlash = 0.25;
  sound.miss();
}

function fire(target) {
  const base = basePos();
  const a = game.aim;
  // Bullets leave from the barrel tip
  game.bullets.push({ x: base.x + Math.cos(a) * 30, y: base.y + Math.sin(a) * 30, dx: 0, dy: -1, target });
  game.muzzle = 0.06;
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
      size: rand(1, 3.2),
      hue,
    });
  }
}

function addRing(x, y, rgb, maxR) {
  game.rings.push({ x, y, rgb, r: 4, maxR, life: 0.5 });
}

// Exhaust / fire trail behind a moving enemy.
function emitTrail(e, vx, vy) {
  const v = Math.hypot(vx, vy) || 1;
  const nx = vx / v;
  const ny = vy / v;
  const hue = e.look === "meteor" ? rand(10, 45) : e.look === "mothership" ? 320 : e.hue;
  game.particles.push({
    x: e.x - nx * e.radius * 0.9 + rand(-2, 2),
    y: e.y - ny * e.radius * 0.9 + rand(-2, 2),
    vx: -nx * rand(20, 60) + rand(-12, 12),
    vy: -ny * rand(20, 60) + rand(-12, 12),
    life: rand(0.25, 0.5),
    max: 0.5,
    size: rand(1.2, e.look === "meteor" ? 3.6 : 2.4),
    hue,
  });
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
  const hue = e.look === "meteor" ? 30 : e.hue;
  burst(e.x, e.y, hue, e.boss ? 80 : 28, e.boss ? 1.8 : 1);
  burst(e.x, e.y, 45, e.boss ? 30 : 10, 0.6);
  addRing(e.x, e.y, "255, 220, 150", e.boss ? 140 : 55);
  floatText(e.x, e.y, `+${points}`, "#ffd166");
  if (e.boss) g.shake = 0.35;
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
  addRing(e.x, e.y, "255, 255, 255", 60);
  floatText(e.x, e.y, `${p.icon} ${lang().text[e.power]}`, p.color);
  removeEnemy(e);
  sound.powerup();
  announce(e.power);
}

// Voice line, e.g. "Power up! Cheat code!". Powerdowns use a lower, grimmer pitch.
function announce(kind) {
  voice.say(lang().announce[kind], lang().voiceLang, {
    pitch: kind in POWERDOWNS ? 0.75 : 1.2,
    fallback: LANGS.en.announce[kind],
  });
}

function removeEnemy(e) {
  const g = game;
  g.enemies = g.enemies.filter((x) => x !== e);
  g.bullets = g.bullets.filter((b) => b.target !== e);
  if (g.target === e) g.target = null;
}

function damageBase(e) {
  const g = game;
  if (e.boss) {
    removeEnemy(e);
    return fatalHit("boss"); // a boss reaching the base is always lethal
  }
  if (g.effects.fatal > 0) {
    removeEnemy(e);
    return fatalHit();
  }
  const dmg = 1;
  g.hp = Math.max(0, g.hp - dmg);
  g.combo = 0;
  g.waveDamaged = true;
  g.shake = 0.4;
  burst(e.x, e.y, 0, 40, 1.3);
  addRing(e.x, e.y, "239, 71, 111", 70);
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

  g.time += dt;
  g.playTime += dt;
  g.shake = Math.max(0, g.shake - dt);
  g.missFlash = Math.max(0, g.missFlash - dt);
  g.muzzle = Math.max(0, g.muzzle - dt);
  for (const k of Object.keys(g.effects)) g.effects[k] = Math.max(0, g.effects[k] - dt);
  if (g.banner) {
    g.banner.t -= dt;
    if (g.banner.t <= 0) g.banner = null;
  }

  updatePowerdowns(dt);

  // Spawning (faster during the "faster words" powerdown)
  if (g.waveDelay > 0) {
    g.waveDelay -= dt;
  } else {
    if (g.queue.length > 0) {
      g.spawnTimer -= dt * (g.effects.fast > 0 ? FAST_FACTOR : 1);
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
  const sf = speedFactor(g);
  for (const e of [...g.enemies]) {
    e.flash = Math.max(0, e.flash - dt);
    e.hit = Math.max(0, e.hit - dt);

    if (e.kind === "powerup") {
      e.y += e.speed * dt;
      e.spin += dt;
      if (e.y > H + 30) {
        if (e.doomed) collectPowerup(e);
        else removeEnemy(e);
      }
      continue;
    }

    // Head for the base, weaving side to side
    const dx = base.x - e.x;
    const dy = base.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    e.sway += dt * sf * 1.8;
    const side = Math.sin(e.sway) * e.swayAmp * Math.min(1, d / 150); // settle near the base
    const vx = (ux * e.speed - uy * side) * sf;
    const vy = (uy * e.speed + ux * side) * sf;
    e.x = Math.max(12, Math.min(W - 12, e.x + vx * dt));
    e.y += vy * dt;
    e.angle = Math.atan2(vy, vx);
    e.spin += dt * (e.look === "meteor" ? 1.5 : 1) * Math.max(0.5, sf);

    if (e.look !== "saucer") {
      e.trail -= dt;
      if (e.trail <= 0) {
        e.trail = e.look === "meteor" ? 0.025 : 0.04;
        emitTrail(e, vx, vy);
      }
    }

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
      e.hit = 0.06;
      if (e.kind !== "powerup") {
        // Knock the enemy back a little on every hit
        const kx = e.x - base.x;
        const ky = e.y - base.y;
        const kd = Math.hypot(kx, ky) || 1;
        e.x += (kx / kd) * (e.boss ? 2 : 5);
        e.y += (ky / kd) * (e.boss ? 2 : 5);
      }
      burst(b.x, b.y, 45, 5, 0.5);
      if (e.doomed && e.hits >= e.word.length) killEnemy(e);
    } else {
      b.dx = (e.x - b.x) / d;
      b.dy = (e.y - b.y) / d;
      b.x += b.dx * step;
      b.y += b.dy * step;
    }
  }

  // Particles, rings & floating text
  for (const p of g.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);

  for (const r of g.rings) {
    r.life -= dt;
    r.r += (r.maxR - r.r) * Math.min(1, dt * 9);
  }
  g.rings = g.rings.filter((r) => r.life > 0);

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

  const g = game;
  const warp = g && g.effects.fast > 0 ? FAST_FACTOR * 2 : 1;
  background.draw(ctx, dt, g && g.effects.slow > 0 ? SLOW_FACTOR : 1, warp);

  if (!g) {
    ctx.restore();
    return;
  }

  // Power-up tints
  if (g.effects.slow > 0) {
    ctx.fillStyle = "rgba(76, 201, 240, 0.08)";
    ctx.fillRect(0, 0, W, H);
  }
  if (g.effects.cheat > 0) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.05)";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.save();
  if (g.shake > 0) {
    const m = g.shake * 14;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }

  // Additive particles (trails, sparks, explosions) behind the ships
  ctx.globalCompositeOperation = "lighter";
  for (const p of g.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  for (const r of g.rings) {
    ctx.strokeStyle = `rgba(${r.rgb}, ${Math.max(0, r.life * 2)})`;
    ctx.lineWidth = 3 * r.life * 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawBase(g);

  // Enemies (current target drawn last so its label is on top)
  const order = g.enemies.filter((e) => e !== g.target);
  if (g.target) order.push(g.target);
  for (const e of order) {
    if (e.kind === "powerup") sprites.orb(ctx, e, POWERUPS[e.power]);
    else sprites.draw(ctx, e);
    if (e === g.target) sprites.reticle(ctx, e, g.time);
  }
  for (const e of order) drawLabel(e, e === g.target);

  // Laser bolts
  ctx.lineCap = "round";
  for (const b of g.bullets) {
    const tx = b.x - b.dx * 16;
    const ty = b.y - b.dy * 16;
    ctx.strokeStyle = "rgba(255, 200, 80, 0.35)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = "#fff4cf";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore(); // end shake

  if (g.effects.blind > 0) drawBlindMask(g);
  if (g.effects.fatal > 0) drawFatalVignette(g);

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
    ctx.shadowColor = "rgba(76, 201, 240, 0.8)";
    ctx.shadowBlur = 20;
    ctx.font = `800 ${Math.min(48, W / 10)}px system-ui, sans-serif`;
    ctx.fillText(g.banner.text, W / 2, H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  drawEffectTimers(g);
  drawPowerdownAlert(g);

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
  const hpRatio = g.hp / MAX_HP;

  // Shield dome, fades as HP drops
  const shield = ctx.createRadialGradient(base.x, base.y, 20, base.x, base.y, 46);
  shield.addColorStop(0, "rgba(76, 201, 240, 0)");
  shield.addColorStop(1, `rgba(76, 201, 240, ${0.08 + hpRatio * 0.18})`);
  ctx.fillStyle = shield;
  ctx.beginPath();
  ctx.arc(base.x, base.y, 46, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(140, 225, 255, ${0.2 + hpRatio * 0.5})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Platform
  ctx.fillStyle = "#16224a";
  ctx.strokeStyle = "rgba(140, 225, 255, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(base.x - 34, base.y + 22);
  ctx.lineTo(base.x - 22, base.y + 4);
  ctx.lineTo(base.x + 22, base.y + 4);
  ctx.lineTo(base.x + 34, base.y + 22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Barrel (gold while cheat mode is on) and muzzle flash
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(g.aim);
  const barrel = ctx.createLinearGradient(0, -5, 0, 5);
  const tone = g.effects.cheat > 0 ? ["#fff1c2", "#ffd166", "#a67c1a"] : ["#eef3ff", "#9fb0d9", "#4a5a85"];
  barrel.addColorStop(0, tone[0]);
  barrel.addColorStop(0.5, tone[1]);
  barrel.addColorStop(1, tone[2]);
  ctx.fillStyle = barrel;
  ctx.fillRect(4, -5, 28, 10);
  ctx.fillStyle = "#2b3a6b";
  ctx.fillRect(26, -6, 6, 12);
  if (g.muzzle > 0) {
    ctx.globalCompositeOperation = "lighter";
    const flash = ctx.createRadialGradient(36, 0, 0, 36, 0, 14);
    flash.addColorStop(0, "rgba(255, 245, 200, 1)");
    flash.addColorStop(1, "rgba(255, 180, 60, 0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(36, 0, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Turret head
  const head = ctx.createRadialGradient(base.x - 5, base.y - 6, 2, base.x, base.y, 18);
  head.addColorStop(0, "#5f7bd6");
  head.addColorStop(1, "#18244f");
  ctx.fillStyle = head;
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(base.x, base.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = g.effects.fatal > 0 ? "#ef476f" : "#4cc9f0";
  ctx.beginPath();
  ctx.arc(base.x, base.y, 4 + Math.sin(g.time * 4), 0, Math.PI * 2);
  ctx.fill();
}

function drawLabel(e, isTarget) {
  // Spaces in boss sentences are shown as "·" so players can see them.
  const display = e.word.replace(/ /g, "·");
  const padX = 9;
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
  const labelH = fontSize + 12;
  const lx = Math.max(4, Math.min(W - labelW - 4, e.x - labelW / 2));
  const ly = e.y + e.radius + 12;

  // Pointer from the tag up to its ship
  const px = Math.max(lx + 8, Math.min(lx + labelW - 8, e.x));
  ctx.fillStyle = isTarget ? "rgba(60, 42, 0, 0.92)" : "rgba(8, 12, 32, 0.85)";
  ctx.beginPath();
  ctx.moveTo(px - 6, ly + 1);
  ctx.lineTo(px, ly - 6);
  ctx.lineTo(px + 6, ly + 1);
  ctx.fill();

  // Tag body
  if (isTarget) {
    ctx.shadowColor = "rgba(255, 209, 102, 0.6)";
    ctx.shadowBlur = 14;
  }
  roundRect(lx, ly, labelW, labelH, labelH / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isTarget || e.kind === "powerup" ? accent : "rgba(160, 190, 255, 0.25)";
  ctx.lineWidth = isTarget ? 2 : 1;
  ctx.stroke();

  // Typed progress bar along the bottom of the tag
  if (e.typed > 0) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.35)";
    const pw = (labelW - labelH) * (e.typed / e.word.length);
    const rtl = lang().dir === "rtl";
    ctx.fillRect(rtl ? lx + labelW - labelH / 2 - pw : lx + labelH / 2, ly + labelH - 3, pw, 2);
  }

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

// Blind mode: darkness everywhere except a circle around the base.
function drawBlindMask(g) {
  const base = basePos();
  const left = g.effects.blind;
  const elapsed = POWERDOWNS.blind.duration - left;
  const k = Math.min(1, elapsed / 0.8, left / 0.8); // ease in and out
  const small = Math.max(140, Math.min(W, H) * 0.36);
  const big = Math.hypot(W, H);
  const r = big + (small - big) * k * k * (3 - 2 * k);

  const mask = ctx.createRadialGradient(base.x, base.y, r * 0.75, base.x, base.y, r);
  mask.addColorStop(0, "rgba(2, 3, 10, 0)");
  mask.addColorStop(1, "rgba(2, 3, 10, 0.98)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, W, H);
}

// Fatal impact: pulsing red edges.
function drawFatalVignette(g) {
  const pulse = 0.3 + Math.sin(g.time * 6) * 0.12;
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
  v.addColorStop(0, "rgba(239, 71, 111, 0)");
  v.addColorStop(1, `rgba(239, 71, 111, ${pulse})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// Warning box shown during the countdown before a powerdown hits.
function drawPowerdownAlert(g) {
  const inc = g.incoming;
  if (!inc) return;
  const L = lang();
  const p = POWERDOWNS[inc.kind];
  const blink = Math.sin(g.time * 12) > 0;
  const w = Math.min(W - 32, 420);
  const h = 118;
  const x = (W - w) / 2;
  const y = Math.max(70, H * 0.16);

  ctx.save();
  ctx.fillStyle = "rgba(28, 4, 12, 0.9)";
  ctx.shadowColor = p.color;
  ctx.shadowBlur = blink ? 30 : 12;
  roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = blink ? p.color : "rgba(239, 71, 111, 0.6)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.direction = L.dir;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = blink ? "#ff8fa3" : "#ffd0da";
  ctx.font = "800 14px system-ui, sans-serif";
  ctx.fillText(`⚠ ${L.text.powerdownIncoming} · ${Math.ceil(inc.t)} ⚠`, W / 2, y + 24);
  ctx.fillStyle = p.color;
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText(`${p.icon} ${L.text[inc.kind]}`, W / 2, y + 58);
  ctx.fillStyle = "#c9d1ec";
  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillText(L.text[`${inc.kind}Desc`], W / 2, y + 88);

  // Countdown bar
  ctx.fillStyle = p.color;
  ctx.fillRect(x + 14, y + h - 10, (w - 28) * (inc.t / POWERDOWN_WARNING), 3);
  ctx.restore();
}

// Countdown bars for active timed effects, in the top corner.
function drawEffectTimers(g) {
  const rtl = lang().dir === "rtl";
  const w = 180;
  const h = 26;
  let y = 12;
  for (const [kind, meta] of Object.entries(TIMED_EFFECTS)) {
    const left = g.effects[kind];
    if (left <= 0) continue;
    const x = rtl ? W - 12 - w : 12;
    const bad = kind in POWERDOWNS;

    ctx.fillStyle = bad ? "rgba(30, 5, 12, 0.85)" : "rgba(5, 8, 20, 0.8)";
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = 0.3;
    const fillW = w * (left / meta.duration);
    roundRect(rtl ? x + w - fillW : x, y, fillW, h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 6);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.direction = lang().dir;
    ctx.textAlign = rtl ? "right" : "left";
    const label = `${meta.icon} ${lang().text[kind]} · ${lang().seconds(Math.ceil(left))}`;
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
  voice.stop();
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
  voice.stop();
  syncMenuButtons();
  showPanel("start");
}

function endGame() {
  const g = game;
  phase = "over";
  music.stop();
  voice.stop();
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
  const deathMessages = { fatal: L.text.fatalDeath, boss: L.text.bossDeath };
  let msg = deathMessages[g.deathCause] || L.heldOut(g.wave);
  if (isRecord) msg += ` ${L.newBest(L.text[difficulty])}`;
  else if (rank) msg += ` ${L.rank(rank)}`;
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
  }, 900);
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
  if (sound.muted) voice.stop();
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
voice.init();
updateSoundButtons();
applyLanguage();
showPanel("start");
requestAnimationFrame(frame);
