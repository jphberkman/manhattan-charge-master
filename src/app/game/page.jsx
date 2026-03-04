"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const CANVAS_W = 400;
const CANVAS_H = 600;
const ROAD_LEFT = 80;
const ROAD_RIGHT = 320;
const ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const LANE_W = ROAD_W / 3;
const CAR_W = 36;
const CAR_H = 60;
const ENEMY_W = 36;
const ENEMY_H = 60;

const ENEMY_COLORS = ["#e74c3c", "#e67e22", "#9b59b6", "#1abc9c", "#2980b9"];

function drawRoad(ctx, offset) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, "#0a0a1a");
  sky.addColorStop(1, "#1a1a2e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Road
  ctx.fillStyle = "#2c2c2c";
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, CANVAS_H);

  // Road edges
  ctx.fillStyle = "#f39c12";
  ctx.fillRect(ROAD_LEFT, 0, 4, CANVAS_H);
  ctx.fillRect(ROAD_RIGHT - 4, 0, 4, CANVAS_H);

  // Lane dashes
  ctx.fillStyle = "#ecf0f1";
  const dashH = 40;
  const dashGap = 30;
  const total = dashH + dashGap;
  for (let lane = 1; lane <= 2; lane++) {
    const x = ROAD_LEFT + lane * LANE_W - 2;
    for (let y = -(total - (offset % total)); y < CANVAS_H; y += total) {
      ctx.fillRect(x, y, 4, dashH);
    }
  }

  // Shoulder grass
  ctx.fillStyle = "#1a472a";
  ctx.fillRect(0, 0, ROAD_LEFT, CANVAS_H);
  ctx.fillRect(ROAD_RIGHT, 0, CANVAS_W - ROAD_RIGHT, CANVAS_H);
}

function drawCar(ctx, x, y, color, isPlayer) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, CAR_H / 2 + 4, CAR_W / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 6);
  ctx.fill();

  // Windshield
  ctx.fillStyle = isPlayer ? "#74b9ff" : "#81ecec";
  ctx.beginPath();
  if (isPlayer) {
    ctx.roundRect(-CAR_W / 2 + 4, -CAR_H / 2 + 6, CAR_W - 8, 18, 3);
  } else {
    ctx.roundRect(-CAR_W / 2 + 4, CAR_H / 2 - 24, CAR_W - 8, 18, 3);
  }
  ctx.fill();

  // Wheels
  ctx.fillStyle = "#1a1a1a";
  const wheels = [
    [-CAR_W / 2 - 4, -CAR_H / 2 + 8],
    [CAR_W / 2 - 6, -CAR_H / 2 + 8],
    [-CAR_W / 2 - 4, CAR_H / 2 - 18],
    [CAR_W / 2 - 6, CAR_H / 2 - 18],
  ];
  wheels.forEach(([wx, wy]) => {
    ctx.fillRect(wx, wy, 10, 18);
  });

  // Headlights / taillights
  if (isPlayer) {
    ctx.fillStyle = "#f9ca24";
    ctx.fillRect(-CAR_W / 2 + 4, CAR_H / 2 - 6, 8, 5);
    ctx.fillRect(CAR_W / 2 - 12, CAR_H / 2 - 6, 8, 5);
  } else {
    ctx.fillStyle = "#ff4444";
    ctx.fillRect(-CAR_W / 2 + 4, -CAR_H / 2 + 2, 8, 5);
    ctx.fillRect(CAR_W / 2 - 12, -CAR_H / 2 + 2, 8, 5);
  }

  ctx.restore();
}

function drawHUD(ctx, speed, score, lives, boost) {
  // Speed bar
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(10, 10, 120, 50, 8);
  ctx.fill();

  ctx.fillStyle = "#ecf0f1";
  ctx.font = "bold 11px monospace";
  ctx.fillText("SPEED", 18, 26);

  const barW = 100;
  const barH = 10;
  const barX = 14;
  const barY = 32;
  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barW, barH);
  const speedFrac = Math.min(speed / 12, 1);
  const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  g.addColorStop(0, "#2ecc71");
  g.addColorStop(0.6, "#f39c12");
  g.addColorStop(1, "#e74c3c");
  ctx.fillStyle = g;
  ctx.fillRect(barX, barY, barW * speedFrac, barH);

  ctx.fillStyle = "#ecf0f1";
  ctx.font = "bold 12px monospace";
  ctx.fillText(`${Math.round(speed * 10)} km/h`, 14, 56);

  // Score
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(CANVAS_W - 120, 10, 110, 50, 8);
  ctx.fill();
  ctx.fillStyle = "#f39c12";
  ctx.font = "bold 11px monospace";
  ctx.fillText("SCORE", CANVAS_W - 112, 26);
  ctx.fillStyle = "#ecf0f1";
  ctx.font = "bold 16px monospace";
  ctx.fillText(String(score).padStart(6, "0"), CANVAS_W - 112, 50);

  // Lives
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < lives ? "#e74c3c" : "#555";
    ctx.font = "20px serif";
    ctx.fillText("♥", CANVAS_W / 2 - 30 + i * 24, 30);
  }

  // Boost indicator
  if (boost) {
    ctx.fillStyle = "rgba(243,156,18,0.15)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#f39c12";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText("🔥 BOOST!", CANVAS_W / 2, CANVAS_H - 20);
    ctx.textAlign = "left";
  }
}

function drawExplosion(ctx, particles) {
  particles.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

export default function App() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    playerX: CANVAS_W / 2,
    playerY: CANVAS_H - 100,
    speed: 0,
    score: 0,
    lives: 3,
    offset: 0,
    enemies: [],
    particles: [],
    keys: {},
    invincible: 0,
    spawnTimer: 0,
    phase: "menu", // menu | playing | dead | gameover
    highScore: 0,
    drift: 0,
  });
  const [phase, setPhase] = useState("menu");
  const [finalScore, setFinalScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const animRef = useRef(null);

  const spawnEnemy = useCallback(() => {
    const lane = Math.floor(Math.random() * 3);
    const x = ROAD_LEFT + lane * LANE_W + LANE_W / 2;
    stateRef.current.enemies.push({
      x,
      y: -ENEMY_H,
      color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
      speed: 1.5 + Math.random() * 1.5,
    });
  }, []);

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.playerX = CANVAS_W / 2;
    s.playerY = CANVAS_H - 100;
    s.speed = 0;
    s.score = 0;
    s.lives = 3;
    s.offset = 0;
    s.enemies = [];
    s.particles = [];
    s.invincible = 0;
    s.spawnTimer = 0;
    s.drift = 0;
    s.phase = "playing";
    setPhase("playing");
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      stateRef.current.keys[e.code] = e.type === "keydown";
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.type === "keydown" && e.code === "Space") {
        const s = stateRef.current;
        if (s.phase === "menu" || s.phase === "dead" || s.phase === "gameover") {
          resetGame();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let last = 0;

    const loop = (ts) => {
      const dt = Math.min((ts - last) / 16.67, 3);
      last = ts;
      const s = stateRef.current;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      if (s.phase === "menu") {
        drawRoad(ctx, 0);
        // Title
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f39c12";
        ctx.font = "bold 42px monospace";
        ctx.fillText("TURBO", CANVAS_W / 2, 200);
        ctx.fillStyle = "#e74c3c";
        ctx.font = "bold 42px monospace";
        ctx.fillText("RACER", CANVAS_W / 2, 248);
        ctx.fillStyle = "#ecf0f1";
        ctx.font = "16px monospace";
        ctx.fillText("SPACE — Gas / Start", CANVAS_W / 2, 340);
        ctx.fillText("← → — Steer", CANVAS_W / 2, 368);
        ctx.fillText("↓ — Brake", CANVAS_W / 2, 396);
        ctx.fillStyle = "#bdc3c7";
        ctx.font = "13px monospace";
        ctx.fillText("Press SPACE to start", CANVAS_W / 2, 450);
        ctx.textAlign = "left";
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      if (s.phase === "dead" || s.phase === "gameover") {
        drawRoad(ctx, s.offset);
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.textAlign = "center";
        ctx.fillStyle = "#e74c3c";
        ctx.font = "bold 38px monospace";
        ctx.fillText(s.phase === "gameover" ? "GAME OVER" : "CRASH!", CANVAS_W / 2, 220);
        ctx.fillStyle = "#ecf0f1";
        ctx.font = "18px monospace";
        ctx.fillText(`Score: ${s.score}`, CANVAS_W / 2, 270);
        ctx.fillStyle = "#f39c12";
        ctx.fillText(`Best: ${s.highScore}`, CANVAS_W / 2, 300);
        ctx.fillStyle = "#bdc3c7";
        ctx.font = "14px monospace";
        ctx.fillText("Press SPACE to play again", CANVAS_W / 2, 360);
        ctx.textAlign = "left";
        drawExplosion(ctx, s.particles);
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      // --- Playing ---
      const gas = s.keys["Space"] || s.keys["ArrowUp"];
      const brake = s.keys["ArrowDown"];
      const left = s.keys["ArrowLeft"];
      const right = s.keys["ArrowRight"];

      // Acceleration
      if (gas) {
        s.speed = Math.min(s.speed + 0.08 * dt, 12);
      } else if (brake) {
        s.speed = Math.max(s.speed - 0.15 * dt, 0);
      } else {
        s.speed = Math.max(s.speed - 0.04 * dt, 0);
      }

      const boost = s.speed > 9;

      // Steering
      const steerPower = (2 + s.speed * 0.2) * dt;
      if (left) s.playerX = Math.max(ROAD_LEFT + CAR_W / 2 + 4, s.playerX - steerPower);
      if (right) s.playerX = Math.min(ROAD_RIGHT - CAR_W / 2 - 4, s.playerX + steerPower);

      // Drift effect
      if (left) s.drift = Math.max(s.drift - 0.5, -8);
      else if (right) s.drift = Math.min(s.drift + 0.5, 8);
      else s.drift *= 0.85;

      // Road scroll
      s.offset = (s.offset + s.speed * 3 * dt) % 70;
      s.score += Math.floor(s.speed * dt);

      // Spawn enemies
      s.spawnTimer -= dt;
      const spawnRate = Math.max(40 - s.score / 500, 15);
      if (s.spawnTimer <= 0) {
        spawnEnemy();
        s.spawnTimer = spawnRate + Math.random() * 20;
      }

      // Move enemies
      s.enemies = s.enemies.filter((e) => {
        e.y += (e.speed + s.speed * 0.8) * dt;
        return e.y < CANVAS_H + ENEMY_H;
      });

      // Collision
      if (s.invincible > 0) s.invincible -= dt;
      else {
        for (const e of s.enemies) {
          const dx = Math.abs(s.playerX - e.x);
          const dy = Math.abs(s.playerY - e.y);
          if (dx < (CAR_W + ENEMY_W) / 2 - 4 && dy < (CAR_H + ENEMY_H) / 2 - 4) {
            // Explode
            for (let i = 0; i < 30; i++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = 1 + Math.random() * 4;
              s.particles.push({
                x: s.playerX, y: s.playerY,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                r: 2 + Math.random() * 6,
                color: ["#e74c3c","#f39c12","#f1c40f","#ecf0f1"][Math.floor(Math.random()*4)],
                life: 40, maxLife: 40,
              });
            }
            s.lives--;
            s.invincible = 90;
            s.speed *= 0.3;
            s.enemies = s.enemies.filter((en) => en !== e);
            if (s.lives <= 0) {
              s.highScore = Math.max(s.highScore, s.score);
              s.phase = "gameover";
              setPhase("gameover");
              setFinalScore(s.score);
              setHighScore(s.highScore);
            } else {
              s.phase = "dead";
              setPhase("dead");
              setTimeout(() => {
                s.phase = "playing";
                setPhase("playing");
              }, 1200);
            }
            break;
          }
        }
      }

      // Update particles
      s.particles = s.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
      });

      // Draw
      drawRoad(ctx, s.offset);
      s.enemies.forEach((e) => drawCar(ctx, e.x, e.y, e.color, false));

      // Player flicker when invincible
      const draw = s.invincible <= 0 || Math.floor(s.invincible / 6) % 2 === 0;
      if (draw) {
        ctx.save();
        ctx.translate(s.playerX, s.playerY);
        ctx.rotate((s.drift * Math.PI) / 180);
        drawCar(ctx, 0, 0, "#3498db", true);
        ctx.restore();
      }

      drawExplosion(ctx, s.particles);
      drawHUD(ctx, s.speed, s.score, s.lives, boost);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [spawnEnemy]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0d0d1a",
        fontFamily: "monospace",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          border: "2px solid #f39c12",
          borderRadius: 8,
          boxShadow: "0 0 40px rgba(243,156,18,0.3)",
          display: "block",
        }}
      />
      <div style={{ color: "#555", fontSize: 12, marginTop: 10 }}>
        SPACE = Gas &nbsp;|&nbsp; ← → = Steer &nbsp;|&nbsp; ↓ = Brake
      </div>
    </div>
  );
}
