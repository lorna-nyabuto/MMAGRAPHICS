// =====================================================================
//  SOLAR SYSTEM — Graphics Pipeline Demo
//
//  Three pipeline stages are clearly separated:
//
//  ① APPLICATION STAGE  — scene state, physics, game logic, user input
//  ② GEOMETRY STAGE     — coordinate transforms (world → screen space)
//  ③ RASTERIZATION STAGE — drawing pixels onto the canvas
//
// =====================================================================

const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const hitMsg  = document.getElementById('hit-msg');
const appLog  = document.getElementById('app-log');
const geoLog  = document.getElementById('geo-log');
const rastLog = document.getElementById('rast-log');

// ─── Pipeline log helpers ────────────────────────────────────────
function logStage(stage, msg) {
  const el  = document.getElementById(stage + '-log');
  const div = document.getElementById('s-' + stage);
  el.textContent = msg;
  div.classList.remove('pulse');
  void div.offsetWidth; // reflow to restart animation
  div.classList.add('pulse');
}


// =====================================================================
// ①  APPLICATION STAGE
//    Owns: scene objects, physics values, animation state, user input.
//    This is the "game logic" layer — nothing is drawn here.
// =====================================================================

// ── Canvas centre (world-space origin) ──
const CX = canvas.width  / 2;   // 400
const CY = canvas.height / 2;   // 300

// ── Sun (stationary at world origin) ──
const sun = {
  x: 0, y: 0,   // world-space position
  radius: 36,
  color: '#FFD060',
  glowColor: 'rgba(255,200,60,0.18)'
};

// ── Planets (defined in world space) ──
// APPLICATION STAGE: each planet has an orbital radius and angular speed
const planets = [
  {
    name:      'Earth',
    orbitR:    140,       // world-space orbital radius
    angle:     0.8,       // current angle (radians)
    speed:     0.008,     // radians per frame
    radius:    14,
    color:     '#4a9eff',
    glowColor: 'rgba(74,158,255,0.25)',
    hit:       false,
    hitTimer:  0
  },
  {
    name:      'Mars',
    orbitR:    220,
    angle:     2.4,
    speed:     0.005,
    radius:    11,
    color:     '#e05a2b',
    glowColor: 'rgba(224,90,43,0.25)',
    hit:       false,
    hitTimer:  0
  }
];

// ── Asteroid belt (APPLICATION STAGE: positions defined in world space) ──
// Randomly scattered between Mars and an outer ring
const NUM_ASTEROIDS = 22;
const asteroids = [];

for (let i = 0; i < NUM_ASTEROIDS; i++) {
  const beltR = 275 + Math.random() * 45;       // belt orbital radius
  const angle = (i / NUM_ASTEROIDS) * Math.PI * 2 + Math.random() * 0.4;
  asteroids.push({
    orbitR:    beltR,
    angle:     angle,
    speed:     0.001 + Math.random() * 0.001,   // slow drift
    radius:    2 + Math.random() * 2.5,
    color:     '#9a8878',
    // Launched asteroid state
    launched:  false,
    vx: 0, vy: 0,                               // velocity in world space
    wx: 0, wy: 0,                               // current world-space x,y
    targetPlanet: null
  });
}

// ── Stars (static background — APPLICATION STAGE: set once) ──
const stars = Array.from({ length: 120 }, () => ({
  x: Math.random() * canvas.width,
  y: Math.random() * canvas.height,
  r: Math.random() * 1.2 + 0.2,
  alpha: 0.3 + Math.random() * 0.7
}));

// Hit-message display state
let hitMsgTimer = 0;

// ── USER INPUT: click to launch an asteroid ──
// APPLICATION STAGE: translate a click into a game event
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  // Convert click from screen pixels → canvas pixels
  const clickX = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const clickY = (e.clientY - rect.top)  * (canvas.height / rect.height);

  // Convert canvas pixels → world space (subtract centre offset)
  const worldClickX = clickX - CX;
  const worldClickY = clickY - CY;

  // Check if click lands on any un-launched asteroid
  for (const ast of asteroids) {
    if (ast.launched) continue;
    // World-space position of this asteroid
    const ax = ast.orbitR * Math.cos(ast.angle);
    const ay = ast.orbitR * Math.sin(ast.angle);
    const dist = Math.hypot(worldClickX - ax, worldClickY - ay);
    if (dist < ast.radius + 8) {
      // APPLICATION STAGE: pick a random planet to target
      const target = planets[Math.floor(Math.random() * planets.length)];
      ast.launched     = true;
      ast.wx           = ax;
      ast.wy           = ay;
      ast.targetPlanet = target;
      // Direction toward current planet position
      const tx = target.orbitR * Math.cos(target.angle);
      const ty = target.orbitR * Math.sin(target.angle);
      const d  = Math.hypot(tx - ax, ty - ay) || 1;
      const speed = 3.5;
      ast.vx = (tx - ax) / d * speed;
      ast.vy = (ty - ay) / d * speed;
      logStage('app', `Asteroid launched → targeting ${target.name}`);
      break;
    }
  }
});


// =====================================================================
// ②  GEOMETRY STAGE
//    Responsible for coordinate transforms:
//    world space (x,y) → screen space (sx,sy).
//
//    In this 2D demo the "projection" is simply:
//      screenX = worldX + CX
//      screenY = worldY + CY
//
//    Each helper returns screen-space coordinates
//    ready for the Rasterization Stage to draw.
// =====================================================================

// GEOMETRY STAGE: compute world-space position of a planet on its orbit
function planetWorldPos(planet) {
  return {
    wx: planet.orbitR * Math.cos(planet.angle),
    wy: planet.orbitR * Math.sin(planet.angle)
  };
}

// GEOMETRY STAGE: world space → screen space transform (2D projection)
function toScreen(wx, wy) {
  return {
    sx: wx + CX,
    sy: wy + CY
  };
}

// GEOMETRY STAGE: transform a complete orbit path into screen-space params
function orbitScreenParams(orbitR) {
  // For a circle centred at the world origin, screen centre is CX,CY
  return { cx: CX, cy: CY, r: orbitR };
}

// GEOMETRY STAGE: transform an asteroid belt particle to screen space
function asteroidScreenPos(ast) {
  if (ast.launched) {
    return toScreen(ast.wx, ast.wy);
  }
  const wx = ast.orbitR * Math.cos(ast.angle);
  const wy = ast.orbitR * Math.sin(ast.angle);
  return toScreen(wx, wy);
}


// =====================================================================
// ③  RASTERIZATION STAGE
//    Converts the transformed geometry into pixels on the canvas.
//    Each draw function takes screen-space coordinates as input.
// =====================================================================

// RASTERIZATION STAGE: draw the starfield background
function rasterizeStars() {
  stars.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fill();
  });
}

// RASTERIZATION STAGE: draw an orbit ring (ellipse in screen space)
function rasterizeOrbit(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// RASTERIZATION STAGE: draw the Sun with a glow halo
function rasterizeSun(sx, sy) {
  // Outer glow (fragment-level blending via globalAlpha)
  const grad = ctx.createRadialGradient(sx, sy, sun.radius * 0.5, sx, sy, sun.radius * 2.5);
  grad.addColorStop(0,   'rgba(255,210,60,0.35)');
  grad.addColorStop(1,   'rgba(255,210,60,0)');
  ctx.beginPath();
  ctx.arc(sx, sy, sun.radius * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Sun disc
  ctx.beginPath();
  ctx.arc(sx, sy, sun.radius, 0, Math.PI * 2);
  ctx.fillStyle = sun.color;
  ctx.fill();
}

// RASTERIZATION STAGE: draw a planet with optional hit flash
function rasterizePlanet(planet, sx, sy) {
  // Glow halo
  if (planet.hit) {
    // RASTERIZATION STAGE: impact glow — brighter, expanding halo
    const t = planet.hitTimer / 60;
    const glowR = planet.radius * (2 + t * 3);
    const grad = ctx.createRadialGradient(sx, sy, planet.radius * 0.3, sx, sy, glowR);
    grad.addColorStop(0, `rgba(255,200,100,${0.8 * (1-t)})`);
    grad.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.beginPath();
    ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    // Normal ambient glow
    const grad = ctx.createRadialGradient(sx, sy, planet.radius * 0.4, sx, sy, planet.radius * 2.2);
    grad.addColorStop(0, planet.glowColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(sx, sy, planet.radius * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Planet disc
  ctx.beginPath();
  ctx.arc(sx, sy, planet.radius, 0, Math.PI * 2);
  ctx.fillStyle = planet.hit ? '#ffcc55' : planet.color;
  ctx.fill();

  // Label
  ctx.fillStyle   = 'rgba(255,255,255,0.55)';
  ctx.font        = '11px system-ui, sans-serif';
  ctx.textAlign   = 'center';
  ctx.fillText(planet.name, sx, sy - planet.radius - 6);
}

// RASTERIZATION STAGE: draw an asteroid particle
function rasterizeAsteroid(ast, sx, sy) {
  ctx.beginPath();
  ctx.arc(sx, sy, ast.radius, 0, Math.PI * 2);
  ctx.fillStyle = ast.launched ? '#e0c890' : ast.color;
  ctx.fill();

  // Highlight: small specular dot (fragment-level lighting detail)
  ctx.beginPath();
  ctx.arc(sx - ast.radius * 0.3, sy - ast.radius * 0.3, ast.radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
}

// RASTERIZATION STAGE: draw trajectory trail for a launched asteroid
function rasterizeTrail(ast) {
  const { sx: ex, sy: ey } = toScreen(ast.wx, ast.wy);
  const { wx: tw, wy: ty } = planetWorldPos(ast.targetPlanet);
  const { sx: tx, sy: tsy } = toScreen(tw, ty);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(tx, tsy);
  ctx.strokeStyle = 'rgba(255,200,80,0.12)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}


// =====================================================================
//  MAIN LOOP — orchestrates all three stages each frame
// =====================================================================

let frame = 0;

function tick() {

  // ── ① APPLICATION STAGE ────────────────────────────────────────
  // Update all scene object positions and game logic

  // Advance planet angles (orbital motion)
  planets.forEach(p => {
    p.angle += p.speed;
    if (p.hit) {
      p.hitTimer++;
      if (p.hitTimer > 60) { p.hit = false; p.hitTimer = 0; }
    }
  });

  // Advance asteroid belt rotation
  asteroids.forEach(ast => {
    if (!ast.launched) {
      ast.angle += ast.speed;
    } else {
      // Move launched asteroid along its velocity vector
      ast.wx += ast.vx;
      ast.wy += ast.vy;

      // Collision detection: did asteroid reach its target planet?
      const tp = ast.targetPlanet;
      const { wx: pw, wy: py } = planetWorldPos(tp);
      const dist = Math.hypot(ast.wx - pw, ast.wy - py);
      if (dist < tp.radius + ast.radius) {
        // APPLICATION STAGE: register hit event
        tp.hit      = true;
        tp.hitTimer = 0;
        ast.launched = false;
        ast.orbitR   = 275 + Math.random() * 45;  // respawn in belt
        ast.angle    = Math.random() * Math.PI * 2;
        // Show hit message
        hitMsg.textContent = `${tp.name} hit! ☄️`;
        hitMsg.classList.add('show');
        hitMsgTimer = 90;
        logStage('app', `IMPACT: asteroid hit ${tp.name}!`);
      }
    }
  });

  // Fade hit message
  if (hitMsgTimer > 0) {
    hitMsgTimer--;
    if (hitMsgTimer === 0) hitMsg.classList.remove('show');
  }

  // Log Application Stage state every 60 frames
  if (frame % 60 === 0) {
    logStage('app', `t=${frame}  Earth angle=${planets[0].angle.toFixed(2)}  Mars angle=${planets[1].angle.toFixed(2)}`);
  }

  // ── ② GEOMETRY STAGE ───────────────────────────────────────────
  // Transform world-space positions → screen-space coordinates
  // (no drawing happens here — pure coordinate math)

  const sunScreen   = toScreen(sun.x, sun.y);
  const earthWorld  = planetWorldPos(planets[0]);
  const marsWorld   = planetWorldPos(planets[1]);
  const earthScreen = toScreen(earthWorld.wx, earthWorld.wy);
  const marsScreen  = toScreen(marsWorld.wx,  marsWorld.wy);
  const earthOrbit  = orbitScreenParams(planets[0].orbitR);
  const marsOrbit   = orbitScreenParams(planets[1].orbitR);
  const beltOrbit   = orbitScreenParams(290);   // belt guide ring

  // Transform each asteroid to screen space
  const astScreenPositions = asteroids.map(ast => asteroidScreenPos(ast));

  if (frame % 60 === 0) {
    logStage('geo',
      `Sun→(${sunScreen.sx},${sunScreen.sy})  ` +
      `Earth→(${earthScreen.sx.toFixed(0)},${earthScreen.sy.toFixed(0)})  ` +
      `Mars→(${marsScreen.sx.toFixed(0)},${marsScreen.sy.toFixed(0)})`
    );
  }

  // ── ③ RASTERIZATION STAGE ─────────────────────────────────────
  // Draw every transformed shape onto the canvas as pixels

  // Clear framebuffer
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background fill
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  rasterizeStars();

  // Orbit guide rings
  rasterizeOrbit(earthOrbit.cx, earthOrbit.cy, earthOrbit.r);
  rasterizeOrbit(marsOrbit.cx,  marsOrbit.cy,  marsOrbit.r);
  rasterizeOrbit(beltOrbit.cx,  beltOrbit.cy,  beltOrbit.r);

  // Asteroid belt particles + launched trails
  asteroids.forEach((ast, i) => {
    const { sx, sy } = astScreenPositions[i];
    if (ast.launched) rasterizeTrail(ast);
    rasterizeAsteroid(ast, sx, sy);
  });

  // Sun
  rasterizeSun(sunScreen.sx, sunScreen.sy);

  // Planets
  rasterizePlanet(planets[0], earthScreen.sx, earthScreen.sy);
  rasterizePlanet(planets[1], marsScreen.sx,  marsScreen.sy);

  if (frame % 60 === 0) {
    const launched = asteroids.filter(a => a.launched).length;
    logStage('rast',
      `Drew ${stars.length} stars, 3 orbits, ` +
      `${asteroids.length} asteroids (${launched} in flight), 2 planets`
    );
  }

  frame++;
  requestAnimationFrame(tick);
}

// Kick off
logStage('app',  'Scene built: Sun, Earth, Mars, 22 asteroids');
logStage('geo',  'World origin → screen centre (400, 300)');
logStage('rast', 'Canvas 2D context ready');
requestAnimationFrame(tick);