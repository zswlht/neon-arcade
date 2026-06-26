/* =========================================================
 * NEON SCHULTE · 舒尔特三角训练
 * 从 1 到 25 按顺序点击三角形内的数字
 * ========================================================= */

const SchulteGame = (() => {
  const CANVAS_SIZE = 400;
  const TOTAL = 25;

  let canvas, ctx;
  let triangles = [];
  let nextNum = 1;
  let startTime = 0;
  let elapsed = 0;
  let running = false;
  let finished = false;
  let countingDown = false;
  let countdownValue = 3;
  let countdownStartTime = 0;
  let bestTime = null;
  let timerRAF = null;
  let flashWrong = 0;
  let particles = [];

  // ========== Audio ==========
  const Audio = (() => {
    let ctx = null;
    let master = null;
    let muted = false;

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
    }
    function resume() { ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); }

    function tone(freq, dur = 0.1, type = "sine", vol = 0.3, attack = 0.005) {
      ensure(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur = 0.08, vol = 0.2) {
      ensure(); if (!ctx) return;
      const t0 = ctx.currentTime;
      const bufSize = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(g);
      g.connect(master);
      src.start(t0);
    }

    return {
      resume,
      correct: () => { resume(); tone(660 + nextNum * 15, 0.08, "sine", 0.25); },
      wrong: () => { resume(); noise(0.12, 0.2); tone(160, 0.15, "square", 0.15); },
      tick: () => { resume(); tone(880, 0.08, "sine", 0.3); },
      start: () => {
        resume();
        [440, 554, 659].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.3), i * 80));
      },
      finish: () => {
        resume();
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          setTimeout(() => tone(f, 0.2, "triangle", 0.3), i * 100)
        );
      },
      toggleMute: () => {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.6;
        return muted;
      },
      isMuted: () => muted,
    };
  })();

  // ========== Triangle Helpers ==========
  function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const v0x = cx - ax, v0y = cy - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const inv = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * inv;
    const v = (dot00 * dot12 - dot01 * dot02) * inv;
    return u >= 0 && v >= 0 && u + v < 1;
  }

  function centroid(t) {
    return {
      x: (t.a.x + t.b.x + t.c.x) / 3,
      y: (t.a.y + t.b.y + t.c.y) / 3,
    };
  }

  function area(t) {
    return Math.abs(
      (t.b.x - t.a.x) * (t.c.y - t.a.y) - (t.c.x - t.a.x) * (t.b.y - t.a.y)
    ) / 2;
  }

  // ========== Delaunay Triangulation ==========
  // Bowyer-Watson algorithm
  function delaunayTriangulate(points) {
    // Super triangle - big enough to contain all points
    const minX = Math.min(...points.map(p => p.x)) - 1000;
    const minY = Math.min(...points.map(p => p.y)) - 1000;
    const maxX = Math.max(...points.map(p => p.x)) + 1000;
    const maxY = Math.max(...points.map(p => p.y)) + 1000;
    const w = maxX - minX;
    const h = maxY - minY;
    const superTri = {
      a: { x: minX - w, y: maxY + h },
      b: { x: maxX + w, y: maxY + h },
      c: { x: (minX + maxX) / 2, y: minY - h },
    };

    let triangles = [superTri];

    function circumcircleContains(tri, p) {
      const ax = tri.a.x, ay = tri.a.y;
      const bx = tri.b.x, by = tri.b.y;
      const cx = tri.c.x, cy = tri.c.y;
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-10) return false;
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
      const d2 = (p.x - ux) * (p.x - ux) + (p.y - uy) * (p.y - uy);
      return d2 < r2;
    }

    function edgesOf(tri) {
      return [
        [tri.a, tri.b],
        [tri.b, tri.c],
        [tri.c, tri.a],
      ];
    }

    function edgeEq(e1, e2) {
      const sameAB = (e1[0].x === e2[0].x && e1[0].y === e2[0].y && e1[1].x === e2[1].x && e1[1].y === e2[1].y);
      const sameBA = (e1[0].x === e2[1].x && e1[0].y === e2[1].y && e1[1].x === e2[0].x && e1[1].y === e2[0].y);
      return sameAB || sameBA;
    }

    for (const p of points) {
      const badTris = [];
      for (const t of triangles) {
        if (circumcircleContains(t, p)) badTris.push(t);
      }
      // Find boundary polygon edges (edges shared by only one bad triangle)
      const polygon = [];
      for (const t of badTris) {
        for (const e of edgesOf(t)) {
          let shared = false;
          for (const t2 of badTris) {
            if (t2 === t) continue;
            for (const e2 of edgesOf(t2)) {
              if (edgeEq(e, e2)) { shared = true; break; }
            }
            if (shared) break;
          }
          if (!shared) polygon.push(e);
        }
      }
      // Remove bad triangles
      triangles = triangles.filter(t => !badTris.includes(t));
      // Form new triangles from polygon edges + new point
      for (const e of polygon) {
        triangles.push({ a: e[0], b: e[1], c: p });
      }
    }

    // Remove triangles that share a vertex with super triangle
    const superVerts = [superTri.a, superTri.b, superTri.c];
    function hasSuperVert(t) {
      for (const sv of superVerts) {
        if ((t.a.x === sv.x && t.a.y === sv.y) ||
            (t.b.x === sv.x && t.b.y === sv.y) ||
            (t.c.x === sv.x && t.c.y === sv.y)) return true;
      }
      return false;
    }
    triangles = triangles.filter(t => !hasSuperVert(t));
    return triangles;
  }

  // ========== Generate Triangles ==========
  function generateTriangles() {
    const cs = CANVAS_SIZE;
    const cx = cs / 2;
    const cy = cs / 2;
    const radius = cs * 0.43;

    // Target: ~25 triangles. Formula: 2*innerPts + boundaryPts - 2 = triangles
    // 11 boundary + 8 inner = 2*8 + 11 - 2 = 25 triangles
    const nBoundary = 11;
    const nInner = 8;

    // Step 1: boundary points - slightly irregular 11-gon
    const boundaryPts = [];
    for (let i = 0; i < nBoundary; i++) {
      const angle = (i / nBoundary) * Math.PI * 2 - Math.PI / 2;
      const r = radius * (0.93 + Math.random() * 0.14);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      boundaryPts.push({ x, y });
    }

    // Step 2: interior points - 8 points, fairly evenly distributed
    const innerPts = [];
    const ringDefs = [
      { r: 0.2, count: 2, jitter: 0.12, angleOffset: Math.random() * Math.PI },
      { r: 0.5, count: 3, jitter: 0.1, angleOffset: Math.random() * Math.PI * 2 / 3 },
      { r: 0.75, count: 3, jitter: 0.08, angleOffset: Math.random() * Math.PI * 2 / 3 },
    ];
    for (const ring of ringDefs) {
      for (let i = 0; i < ring.count; i++) {
        const baseAngle = ring.angleOffset + (i / ring.count) * Math.PI * 2;
        const baseR = radius * ring.r;
        const jr = baseR * ring.jitter;
        const r = baseR + (Math.random() - 0.5) * jr;
        const angle = baseAngle + (Math.random() - 0.5) * 0.25;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        innerPts.push({ x, y });
      }
    }

    const allPts = [...boundaryPts, ...innerPts];

    // Step 3: Delaunay triangulation
    const tris = delaunayTriangulate(allPts);

    // Step 4: filter - keep triangles whose centroid is inside the boundary
    // All should be inside since boundary points define the convex hull
    const validTris = tris.filter(t => {
      const c = centroid(t);
      const dist = Math.hypot(c.x - cx, c.y - cy);
      return dist <= radius * 1.02;
    });

    // Step 5: assign numbers 1..N shuffled
    const total = validTris.length;
    const nums = [];
    for (let i = 1; i <= total; i++) nums.push(i);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }

    // Step 6: build result - all triangles have numbers
    const result = [];
    for (let i = 0; i < validTris.length; i++) {
      const t = validTris[i];
      const c = centroid(t);
      result.push({
        a: t.a, b: t.b, c: t.c,
        num: nums[i],
        cx: c.x, cy: c.y,
        found: false,
        pulse: 0,
        wrongFlash: 0,
      });
    }
    return result;
  }

  // ========== Particles ==========
  function spawnParticles(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  // ========== Drawing ==========
  function drawTriangle(t, fill, stroke, lineWidth = 1.5) {
    ctx.beginPath();
    ctx.moveTo(t.a.x, t.a.y);
    ctx.lineTo(t.b.x, t.b.y);
    ctx.lineTo(t.c.x, t.c.y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // background subtle grid
    ctx.fillStyle = "rgba(5, 7, 26, 0.3)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // draw triangles
    for (const t of triangles) {
      const isBg = t.num === null;
      let fill = isBg ? "rgba(34, 245, 255, 0.06)" : "rgba(34, 245, 255, 0.08)";
      let stroke = isBg ? "rgba(34, 245, 255, 0.25)" : "rgba(34, 245, 255, 0.5)";
      let lineW = isBg ? 1 : 1.5;
      let textColor = "#e0fbff";
      let glow = 0;

      if (t.found) {
        fill = "rgba(34, 255, 143, 0.15)";
        stroke = "rgba(34, 255, 143, 0.8)";
        textColor = "#aaffcc";
        glow = 12;
      }

      if (t.wrongFlash > 0) {
        fill = `rgba(255, 62, 100, ${0.3 * t.wrongFlash})`;
        stroke = `rgba(255, 62, 100, ${0.9 * t.wrongFlash})`;
        lineW = 2.5;
      }

      if (t.pulse > 0) {
        glow = 15 * t.pulse;
        stroke = `rgba(34, 255, 143, ${0.8 + 0.2 * t.pulse})`;
      }

      ctx.shadowBlur = glow;
      ctx.shadowColor = t.found ? "rgba(34, 255, 143, 0.8)" : (isBg ? "rgba(34,245,255,0.1)" : "rgba(34, 245, 255, 0.5)");
      drawTriangle(t, fill, stroke, lineW);
      ctx.shadowBlur = 0;

      // number (only for numbered triangles)
      if (!isBg) {
        const fontSize = Math.min(28, Math.max(18, area(t) / 120));
        ctx.font = `bold ${fontSize}px "Orbitron", "Press Start 2P", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = textColor;
        ctx.shadowBlur = t.found ? 8 : 4;
        ctx.shadowColor = t.found ? "rgba(34, 255, 143, 0.9)" : "rgba(34, 245, 255, 0.7)";
        ctx.fillText(String(t.num), t.cx, t.cy);
        ctx.shadowBlur = 0;
      }
    }

    // particles
    drawParticles();

    // wrong flash overlay
    if (flashWrong > 0) {
      ctx.fillStyle = `rgba(255, 62, 100, ${0.15 * flashWrong})`;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // countdown display
    if (countingDown) {
      // darken background
      ctx.fillStyle = "rgba(5, 7, 26, 0.5)";
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // draw countdown number
      ctx.font = `bold 120px "Orbitron", "Press Start 2P", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#22f5ff";
      ctx.shadowBlur = 30;
      ctx.shadowColor = "#22f5ff";
      ctx.fillText(String(countdownValue), CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      ctx.shadowBlur = 0;
    }
  }

  // ========== Game Loop ==========
  function update() {
    // Handle countdown
    if (countingDown) {
      const countdownElapsed = performance.now() - countdownStartTime;
      const newValue = 3 - Math.floor(countdownElapsed / 1000);
      if (newValue <= 0) {
        countingDown = false;
        running = true;
        startTime = performance.now();
      } else if (newValue !== countdownValue) {
        countdownValue = newValue;
        Audio.tick();
      }
    }

    if (running && !finished) {
      elapsed = performance.now() - startTime;
      updateTimerDisplay();
    }

    // update pulse / wrong flash
    for (const t of triangles) {
      if (t.pulse > 0) t.pulse = Math.max(0, t.pulse - 0.05);
      if (t.wrongFlash > 0) t.wrongFlash = Math.max(0, t.wrongFlash - 0.08);
    }
    if (flashWrong > 0) flashWrong = Math.max(0, flashWrong - 0.04);

    updateParticles();
    draw();

    requestAnimationFrame(update);
  }

  function formatTime(ms) {
    const totalSec = ms / 1000;
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    const msPart = Math.floor((ms % 1000) / 10);
    return (
      String(min).padStart(2, "0") +
      ":" +
      String(sec).padStart(2, "0") +
      "." +
      String(msPart).padStart(2, "0")
    );
  }

  function updateTimerDisplay() {
    const el = document.getElementById("schulte-timer");
    if (el) el.textContent = formatTime(elapsed);
  }

  function updateNext() {
    const el = document.getElementById("schulte-next");
    if (el) el.textContent = finished ? "✓" : String(nextNum);
  }

  // ========== Game Logic ==========
  function startGame() {
    triangles = generateTriangles();
    nextNum = 1;
    elapsed = 0;
    running = false;
    finished = false;
    particles.length = 0;
    flashWrong = 0;
    // Start countdown
    countingDown = true;
    countdownValue = 3;
    countdownStartTime = performance.now();
    updateNext();
    updateTimerDisplay();
    hideOverlay();
    Audio.start();
  }

  function handleClick(e) {
    if (!running || finished) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let hit = null;
    for (const t of triangles) {
      if (t.found || t.num === null) continue;
      if (pointInTriangle(x, y, t.a.x, t.a.y, t.b.x, t.b.y, t.c.x, t.c.y)) {
        hit = t;
        break;
      }
    }

    if (!hit) return;

    if (hit.num === nextNum) {
      // correct!
      hit.found = true;
      hit.pulse = 1;
      nextNum++;
      spawnParticles(hit.cx, hit.cy, "#22ff8f", 14);
      Audio.correct();

      if (nextNum > TOTAL) {
        // finish!
        finished = true;
        running = false;
        elapsed = performance.now() - startTime;
        updateTimerDisplay();
        saveBest();
        showResult();
        Audio.finish();
      }
      updateNext();
    } else {
      // wrong
      hit.wrongFlash = 1;
      flashWrong = 1;
      Audio.wrong();
    }
  }

  function saveBest() {
    const bestKey = "neon_schulte_best";
    const prev = localStorage.getItem(bestKey);
    if (!prev || elapsed < parseFloat(prev)) {
      localStorage.setItem(bestKey, String(elapsed));
      bestTime = elapsed;
    } else {
      bestTime = parseFloat(prev);
    }
    const el = document.getElementById("schulte-best");
    if (el) el.textContent = bestTime ? formatTime(bestTime) : "--:--.--";
  }

  function loadBest() {
    const b = localStorage.getItem("neon_schulte_best");
    if (b) bestTime = parseFloat(b);
    const el = document.getElementById("schulte-best");
    if (el) el.textContent = bestTime ? formatTime(bestTime) : "--:--.--";
  }

  function getRating(ms) {
    if (ms < 25000) return { text: "专注力非常优秀！", color: "#22ff8f" };
    if (ms < 35000) return { text: "专注力良好，继续加油", color: "#22f5ff" };
    return { text: "需要多训练哦", color: "#ff3e64" };
  }

  function showResult() {
    const overlay = document.getElementById("schulte-overlay");
    const title = document.getElementById("schulte-title");
    const sub = document.getElementById("schulte-subtitle");
    const btn = document.getElementById("schulte-btn-start");
    if (!overlay) return;

    const rating = getRating(elapsed);
    title.textContent = "训练完成！";
    sub.innerHTML =
      `用时: <b style="color:${rating.color};font-size:22px;text-shadow:0 0 12px ${rating.color}55">${formatTime(elapsed)}</b><br>` +
      `<span style="color:${rating.color};font-size:14px;margin-top:8px;display:inline-block">${rating.text}</span>` +
      (bestTime && Math.abs(bestTime - elapsed) < 1
        ? `<br><span style="color:#ffb84d;font-size:12px;margin-top:8px;display:inline-block">🏆 新纪录！</span>`
        : "");
    btn.textContent = "▶ 再来一局";
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    const overlay = document.getElementById("schulte-overlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function showStartOverlay() {
    const overlay = document.getElementById("schulte-overlay");
    const title = document.getElementById("schulte-title");
    const sub = document.getElementById("schulte-subtitle");
    const btn = document.getElementById("schulte-btn-start");
    if (!overlay) return;
    title.textContent = "舒尔特三角训练";
    sub.innerHTML =
      '从 <b style="color:#22f5ff">1</b> 到 <b style="color:#22f5ff">25</b> 按顺序点击数字<br>' +
      '<span style="color:var(--text-dim);font-size:12px">25秒内 = 优秀 &nbsp;·&nbsp; 35秒以上 = 需加强</span>';
    btn.textContent = "▶ 开始训练";
    overlay.classList.remove("hidden");
  }

  // ========== Init ==========
  function init() {
    canvas = document.getElementById("schulte-board");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    canvas.addEventListener("click", handleClick);

    const btnStart = document.getElementById("schulte-btn-start");
    if (btnStart) btnStart.addEventListener("click", startGame);

    const btnMute = document.getElementById("schulte-mute-btn");
    if (btnMute) {
      btnMute.addEventListener("click", () => {
        Audio.resume();
        const m = Audio.toggleMute();
        btnMute.textContent = m ? "🔇 音效:关" : "🔊 音效:开";
      });
    }

    const btnRestart = document.getElementById("schulte-restart-btn");
    if (btnRestart) btnRestart.addEventListener("click", startGame);

    // keyboard
    document.addEventListener("keydown", (e) => {
      const active = document.querySelector(".stage.active");
      if (!active || active.id !== "stage-schulte") return;
      if (e.key === "Enter") { startGame(); return; }
      if (e.key === "m" || e.key === "M") {
        Audio.resume();
        const m = Audio.toggleMute();
        if (btnMute) btnMute.textContent = m ? "🔇 音效:关" : "🔊 音效:开";
      }
    });

    // audio resume on interaction
    document.addEventListener("pointerdown", () => Audio.resume(), { once: false });

    loadBest();
    triangles = generateTriangles();
    updateNext();
    updateTimerDisplay();
    showStartOverlay();
    requestAnimationFrame(update);
  }

  // auto-init when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    start: startGame,
    Audio,
  };
})();
