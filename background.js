// Procedural space backdrop. The static parts (sky, nebula, planets, the
// city on the horizon) are painted once per resize to an offscreen canvas;
// stars and shooting stars animate on top every frame.

const background = {
  layer: document.createElement("canvas"),
  w: 0,
  h: 0,
  t: 0,
  stars: [],
  shooting: [],
  shootTimer: 3,
  ground: { cx: 0, cy: 0, r: 0 },

  build(w, h, dpr) {
    this.w = w;
    this.h = h;
    const c = this.layer;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const r = Math.max(w * 1.3, 900);
    this.ground = { cx: w / 2, cy: h - 26 + r, r };

    paintSky(g, w, h);
    paintNebula(g, w, h);
    paintDust(g, w, h);
    paintMoon(g, w, h);
    paintRingedPlanet(g, w, h);
    paintGroundGlow(g, this.ground);
    paintSkyline(g, w, this);
    paintGround(g, this.ground);

    // Three parallax layers: far stars are small and slow, near ones big and fast.
    this.stars = [];
    const layers = [
      { speed: 6, size: 0.8, alpha: 0.5 },
      { speed: 14, size: 1.2, alpha: 0.7 },
      { speed: 30, size: 1.8, alpha: 0.9 },
    ];
    for (const L of layers) {
      const count = Math.round((w * h) / 9000);
      for (let i = 0; i < count; i++) {
        this.stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          speed: L.speed * (0.8 + Math.random() * 0.4),
          size: L.size,
          alpha: L.alpha,
          tw: 1 + Math.random() * 3,
          ph: Math.random() * Math.PI * 2,
        });
      }
    }
  },

  // Height of the planet surface at x (the base sits on it).
  surfaceY(x) {
    const { cx, cy, r } = this.ground;
    return cy - Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
  },

  // speed: overall motion (slow-mo), warp: >1 stretches stars into streaks.
  draw(ctx, dt, speed = 1, warp = 1) {
    const { w, h } = this;
    this.t += dt;
    ctx.drawImage(this.layer, 0, 0, w, h);

    const horizon = h - 40;
    const streak = warp > 1.2;
    ctx.lineCap = "round";
    for (const s of this.stars) {
      s.y += s.speed * speed * warp * dt;
      if (s.y > horizon) {
        s.y = -4;
        s.x = Math.random() * w;
      }
      const a = s.alpha * (0.6 + 0.4 * Math.sin(this.t * s.tw + s.ph));
      if (streak) {
        ctx.strokeStyle = `rgba(200, 220, 255, ${a})`;
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - s.speed * warp * 0.6);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(210, 225, 255, ${a})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    }

    // Occasional shooting star
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 4 + Math.random() * 6;
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.shooting.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.35,
        vx: dir * (350 + Math.random() * 250),
        vy: 120 + Math.random() * 120,
        life: 0.9,
      });
    }
    for (const s of this.shooting) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const tail = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.15, s.y - s.vy * 0.15);
      tail.addColorStop(0, `rgba(255, 255, 255, ${Math.max(0, s.life)})`);
      tail.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.15, s.y - s.vy * 0.15);
      ctx.stroke();
    }
    this.shooting = this.shooting.filter((s) => s.life > 0);
  },
};

function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function paintSky(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#03020c");
  sky.addColorStop(0.55, "#0a0b2e");
  sky.addColorStop(1, "#1c1145");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
}

function paintNebula(g, w, h) {
  const size = Math.max(w, h);
  const clouds = [
    { x: 0.2, y: 0.25, r: 0.5, c: "130, 60, 210", a: 0.16 },
    { x: 0.85, y: 0.12, r: 0.42, c: "40, 140, 220", a: 0.13 },
    { x: 0.6, y: 0.55, r: 0.45, c: "220, 60, 150", a: 0.09 },
    { x: 0.25, y: 0.7, r: 0.38, c: "40, 190, 180", a: 0.07 },
  ];
  g.globalCompositeOperation = "lighter";
  for (const cl of clouds) {
    // Several overlapping puffs make each cloud look soft and uneven.
    for (let i = 0; i < 7; i++) {
      const x = (cl.x + rnd(-0.12, 0.12)) * w;
      const y = (cl.y + rnd(-0.1, 0.1)) * h;
      const r = cl.r * size * rnd(0.35, 0.75);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${cl.c}, ${cl.a})`);
      grad.addColorStop(1, `rgba(${cl.c}, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalCompositeOperation = "source-over";
}

function paintDust(g, w, h) {
  const count = Math.round((w * h) / 900);
  for (let i = 0; i < count; i++) {
    const tint = Math.random();
    const color = tint < 0.1 ? "255, 200, 170" : tint < 0.2 ? "170, 200, 255" : "255, 255, 255";
    g.fillStyle = `rgba(${color}, ${rnd(0.1, 0.55)})`;
    const s = rnd(0.4, 1.1);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function paintRingedPlanet(g, w, h) {
  const R = Math.max(36, Math.min(110, Math.min(w, h) * 0.11));
  const cx = w * 0.84;
  const cy = h * 0.2;
  const tilt = -0.35;

  const ring = (start, end) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt);
    for (const [k, a, lw] of [[2.15, 0.35, 3], [1.9, 0.55, 5], [1.6, 0.3, 3]]) {
      g.strokeStyle = `rgba(240, 200, 170, ${a})`;
      g.lineWidth = lw;
      g.beginPath();
      g.ellipse(0, 0, R * k, R * k * 0.22, 0, start, end);
      g.stroke();
    }
    g.restore();
  };

  ring(Math.PI, Math.PI * 2); // back half, behind the planet

  // Planet body with bands
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
  body.addColorStop(0, "#f2b27a");
  body.addColorStop(0.5, "#b4527e");
  body.addColorStop(1, "#2a1035");
  g.fillStyle = body;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.translate(cx, cy);
  g.rotate(tilt);
  for (let i = -4; i <= 4; i++) {
    g.fillStyle = `rgba(${i % 2 ? "255, 230, 200" : "80, 20, 60"}, 0.12)`;
    g.fillRect(-R, i * R * 0.22 - R * 0.06, R * 2, R * rnd(0.06, 0.14));
  }
  g.restore();

  // Night-side shadow
  const shade = g.createRadialGradient(cx - R * 0.5, cy - R * 0.5, R * 0.6, cx - R * 0.2, cy - R * 0.2, R * 1.6);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(5, 2, 15, 0.85)");
  g.fillStyle = shade;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();

  ring(0, Math.PI); // front half, over the planet

  // Thin atmosphere glow
  g.strokeStyle = "rgba(255, 170, 200, 0.25)";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, R + 1, Math.PI * 0.9, Math.PI * 1.7);
  g.stroke();
}

function paintMoon(g, w, h) {
  const R = Math.max(12, Math.min(34, Math.min(w, h) * 0.035));
  const cx = w * 0.13;
  const cy = h * 0.11;
  const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R);
  body.addColorStop(0, "#d8dcef");
  body.addColorStop(1, "#4b5070");
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(40, 45, 70, 0.35)";
  for (const [dx, dy, r] of [[-0.3, 0.1, 0.22], [0.25, -0.25, 0.15], [0.2, 0.35, 0.12]]) {
    g.beginPath();
    g.arc(cx + dx * R, cy + dy * R, r * R, 0, Math.PI * 2);
    g.fill();
  }
}

function paintSkyline(g, w, bg) {
  // City silhouettes along the horizon, leaving room around the turret.
  let x = 0;
  while (x < w) {
    const bw = rnd(12, 30);
    const mid = x + bw / 2;
    const fromCenter = Math.abs(mid - w / 2);
    if (fromCenter < 70) {
      x += bw;
      continue;
    }
    const hgt = rnd(10, 52) * Math.min(1, 0.3 + (fromCenter - 70) / 160);
    const baseY = bg.surfaceY(mid) + 8;
    const top = baseY - hgt;

    g.fillStyle = "#0a1030";
    g.fillRect(x, top, bw, hgt + 10);
    g.fillStyle = "rgba(120, 180, 255, 0.25)";
    g.fillRect(x, top, bw, 1);

    // Lit windows
    for (let wy = top + 4; wy < baseY - 3; wy += 6) {
      for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
        if (Math.random() < 0.28) {
          g.fillStyle = Math.random() < 0.8 ? "rgba(255, 210, 120, 0.85)" : "rgba(120, 220, 255, 0.85)";
          g.fillRect(wx, wy, 1.8, 1.8);
        }
      }
    }
    // Antenna with a red beacon on some towers
    if (hgt > 35 && Math.random() < 0.5) {
      g.fillStyle = "#0a1030";
      g.fillRect(mid - 0.5, top - 8, 1, 8);
      g.fillStyle = "#ff4d6d";
      g.fillRect(mid - 1, top - 10, 2, 2);
    }
    x += bw + rnd(1, 5);
  }
}

function paintGroundGlow(g, { cx, cy, r }) {
  // Atmosphere glow above the horizon
  const glow = g.createRadialGradient(cx, cy, r - 4, cx, cy, r + 70);
  glow.addColorStop(0, "rgba(76, 201, 240, 0.4)");
  glow.addColorStop(1, "rgba(76, 201, 240, 0)");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, cy, r + 70, 0, Math.PI * 2);
  g.fill();
}

function paintGround(g, { cx, cy, r }) {
  // Planet surface
  const surface = g.createLinearGradient(0, cy - r, 0, cy - r + 80);
  surface.addColorStop(0, "#13254d");
  surface.addColorStop(1, "#050914");
  g.fillStyle = surface;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();

  // Rim light
  g.strokeStyle = "rgba(140, 225, 255, 0.7)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, r, Math.PI * 1.2, Math.PI * 1.8);
  g.stroke();
}
