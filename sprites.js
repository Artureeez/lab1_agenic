// Drawing code for enemies, power-up orbs and the lock-on marker.
// Each function draws one entity centred on (e.x, e.y).
//   e.look   "meteor" | "fighter" | "saucer" | "mothership"
//   e.angle  heading in radians (fighters point where they fly)
//   e.spin   running animation clock

const sprites = {
  draw(ctx, e) {
    this[e.look](ctx, e);
    // Typo flash (red) and bullet-hit flash (white)
    if (e.flash > 0 || e.hit > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = e.flash > 0 ? `rgba(255, 60, 90, ${e.flash * 2.5})` : `rgba(255, 255, 255, ${e.hit * 5})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  meteor(ctx, e) {
    const r = e.radius;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Heat glow on the leading side
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2);
    glow.addColorStop(0, "rgba(255, 130, 50, 0.35)");
    glow.addColorStop(1, "rgba(255, 130, 50, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(e.spin);
    ctx.beginPath();
    e.shape.forEach((k, i) => {
      const a = (i / e.shape.length) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k);
    });
    ctx.closePath();
    const rock = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    rock.addColorStop(0, "#b39a82");
    rock.addColorStop(0.55, "#6b5240");
    rock.addColorStop(1, "#2a1e17");
    ctx.fillStyle = rock;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 170, 90, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "rgba(20, 10, 5, 0.35)";
    for (const c of e.craters) {
      ctx.beginPath();
      ctx.arc(c.x * r, c.y * r, c.r * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  fighter(ctx, e) {
    const r = e.radius;
    const main = `hsl(${e.hue}, 75%, 58%)`;
    const dark = `hsl(${e.hue}, 60%, 22%)`;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    // Engine flame (flickers)
    const len = r * (1.4 + Math.random() * 0.5);
    const flame = ctx.createLinearGradient(-r * 0.6, 0, -r * 0.6 - len, 0);
    flame.addColorStop(0, "rgba(255, 240, 180, 0.95)");
    flame.addColorStop(0.4, `hsla(${e.hue}, 100%, 60%, 0.7)`);
    flame.addColorStop(1, `hsla(${e.hue}, 100%, 50%, 0)`);
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.22);
    ctx.lineTo(-r * 0.6 - len, 0);
    ctx.lineTo(-r * 0.6, r * 0.22);
    ctx.closePath();
    ctx.fill();

    // Swept wings
    ctx.fillStyle = dark;
    ctx.strokeStyle = main;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.25, 0);
    ctx.lineTo(-r * 0.55, -r * 1.05);
    ctx.lineTo(-r * 0.85, -r * 0.95);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.85, r * 0.95);
    ctx.lineTo(-r * 0.55, r * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hull
    const hull = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.4);
    hull.addColorStop(0, "#f2f5ff");
    hull.addColorStop(0.5, main);
    hull.addColorStop(1, dark);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(r * 1.15, 0);
    ctx.lineTo(-r * 0.2, -r * 0.36);
    ctx.lineTo(-r * 0.7, -r * 0.26);
    ctx.lineTo(-r * 0.7, r * 0.26);
    ctx.lineTo(-r * 0.2, r * 0.36);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = "rgba(170, 240, 255, 0.95)";
    ctx.beginPath();
    ctx.ellipse(r * 0.3, 0, r * 0.3, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Blinking wingtip lights
    if (Math.sin(e.spin * 8) > 0) {
      ctx.fillStyle = "#ff4d6d";
      ctx.fillRect(-r * 0.7, -r * 1.02, 2.5, 2.5);
      ctx.fillStyle = "#4dff9a";
      ctx.fillRect(-r * 0.7, r * 0.98, 2.5, 2.5);
    }
    ctx.restore();
  },

  saucer(ctx, e) {
    const r = e.radius;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(e.spin * 1.5) * 0.15); // gentle wobble

    // Glow underneath
    ctx.fillStyle = `hsla(${e.hue}, 90%, 60%, 0.35)`;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.35, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Alien pilot (drawn before the glass dome)
    ctx.fillStyle = "#7dff8a";
    ctx.beginPath();
    ctx.arc(0, -r * 0.32, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#06210b";
    ctx.beginPath();
    ctx.ellipse(-r * 0.08, -r * 0.34, r * 0.05, r * 0.08, -0.4, 0, Math.PI * 2);
    ctx.ellipse(r * 0.08, -r * 0.34, r * 0.05, r * 0.08, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Glass dome
    const glass = ctx.createLinearGradient(0, -r * 0.8, 0, -r * 0.1);
    glass.addColorStop(0, `hsla(${e.hue}, 80%, 85%, 0.55)`);
    glass.addColorStop(1, `hsla(${e.hue}, 80%, 45%, 0.35)`);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.55, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.45, r * 0.1, r * 0.05, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Metal disc
    const metal = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.4);
    metal.addColorStop(0, "#e4ebf7");
    metal.addColorStop(0.5, "#8592ad");
    metal.addColorStop(1, "#353c52");
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.3, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chasing rim lights
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI;
      const on = (Math.floor(e.spin * 6) + i) % 3 === 0;
      ctx.fillStyle = on ? `hsl(${e.hue}, 100%, 70%)` : `hsla(${e.hue}, 60%, 40%, 0.8)`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.22, on ? 2.4 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  mothership(ctx, e) {
    const r = e.radius;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Rotating shield ring
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -e.spin * 40;
    ctx.strokeStyle = "rgba(255, 80, 150, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.7, r * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Lower hull
    const hull = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.6);
    hull.addColorStop(0, "#8a90ad");
    hull.addColorStop(0.5, "#40465f");
    hull.addColorStop(1, "#15172a");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.05, r * 1.45, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pulsing core
    const pulse = 0.7 + Math.sin(e.spin * 5) * 0.3;
    const core = ctx.createRadialGradient(0, r * 0.25, 0, 0, r * 0.25, r * 0.45);
    core.addColorStop(0, `rgba(255, 220, 240, ${pulse})`);
    core.addColorStop(0.4, `rgba(255, 60, 140, ${0.8 * pulse})`);
    core.addColorStop(1, "rgba(255, 60, 140, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Upper deck with windows
    ctx.fillStyle = "#5c6383";
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.18, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -3; i <= 3; i++) {
      const lit = (Math.floor(e.spin * 3) + i + 3) % 4 !== 0;
      ctx.fillStyle = lit ? "rgba(255, 220, 130, 0.9)" : "rgba(80, 70, 50, 0.9)";
      ctx.fillRect(i * r * 0.24 - 2, -r * 0.2, 4, 3);
    }

    // Command dome
    const dome = ctx.createLinearGradient(0, -r * 0.9, 0, -r * 0.3);
    dome.addColorStop(0, "rgba(255, 170, 220, 0.85)");
    dome.addColorStop(1, "rgba(150, 30, 100, 0.85)");
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, -r * 0.35, r * 0.45, Math.PI, Math.PI * 2);
    ctx.fill();

    // Rim lights
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI;
      const on = (Math.floor(e.spin * 8) + i) % 2 === 0;
      ctx.fillStyle = on ? "#ff4d8d" : "rgba(120, 30, 70, 0.9)";
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 1.3, r * 0.05 + Math.sin(a) * r * 0.35, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  orb(ctx, e, p) {
    const r = e.radius * (1 + Math.sin(e.spin * 5) * 0.08);
    ctx.save();
    ctx.translate(e.x, e.y);

    const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.2);
    halo.addColorStop(0, `hsla(${p.hue}, 90%, 60%, 0.45)`);
    halo.addColorStop(1, `hsla(${p.hue}, 90%, 60%, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    body.addColorStop(0, `hsla(${p.hue}, 90%, 80%, 0.95)`);
    body.addColorStop(1, `hsla(${p.hue}, 80%, 25%, 0.95)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(e.spin * 2);
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-e.spin * 2);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.icon, 0, 1);
    ctx.restore();
  },

  // Rotating corner brackets around the current target.
  reticle(ctx, e, t) {
    const r = e.radius * 1.55 + Math.sin(t * 8) * 2;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(t * 1.5);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(r * 0.55, r);
      ctx.lineTo(r, r);
      ctx.lineTo(r, r * 0.55);
      ctx.stroke();
    }
    ctx.restore();
  },
};
