/* ============================================================
   NEON 2048 · 霓虹合成
   纯 JavaScript + Canvas + Web Audio
   ============================================================ */

(() => {
  "use strict";

  const SIZE = 4;
  const CANVAS_SIZE = 400;
  const CELL = CANVAS_SIZE / SIZE;
  const PAD = 10;

  // 每个数字方块对应的配色 (按 2^n 调色)
  const COLOR_MAP = {
    2:    { bg: "#0e1530", fg: "#7aa9ff", glow: "rgba(122,169,255,0.45)" },
    4:    { bg: "#16234a", fg: "#8fd3ff", glow: "rgba(143,211,255,0.5)" },
    8:    { bg: "#1f3a6b", fg: "#a9e5ff", glow: "rgba(169,229,255,0.6)" },
    16:   { bg: "#2665a6", fg: "#ffffff", glow: "rgba(100,180,255,0.7)" },
    32:   { bg: "#3a7dc8", fg: "#ffffff", glow: "rgba(120,190,255,0.75)" },
    64:   { bg: "#22f5ff", fg: "#07122a", glow: "rgba(34,245,255,0.85)" },
    128:  { bg: "#7affc9", fg: "#06201c", glow: "rgba(122,255,201,0.9)" },
    256:  { bg: "#b8ff6b", fg: "#0b2010", glow: "rgba(184,255,107,0.9)" },
    512:  { bg: "#ffec42", fg: "#2b1a00", glow: "rgba(255,236,66,0.9)" },
    1024: { bg: "#ff9a3c", fg: "#2a0a00", glow: "rgba(255,154,60,0.95)" },
    2048: { bg: "#ff3ea5", fg: "#ffffff", glow: "rgba(255,62,165,1)" },
    4096: { bg: "#c26bff", fg: "#ffffff", glow: "rgba(194,107,255,1)" },
    8192: { bg: "#6b5bff", fg: "#ffffff", glow: "rgba(107,91,255,1)" },
    16384:{ bg: "#22f5ff", fg: "#000000", glow: "rgba(34,245,255,1)" },
    32768:{ bg: "#ffffff", fg: "#000000", glow: "rgba(255,255,255,1)" },
  };
  function tileColor(v) {
    return COLOR_MAP[v] || { bg: "#ffffff", fg: "#000", glow: "rgba(255,255,255,0.9)" };
  }

  // ============== Audio ==============
  const Audio = (() => {
    let ctx = null;
    let masterGain = null;
    let muted = false;
    function ensure() {
      if (ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 0.7;
        masterGain.connect(ctx.destination);
      } catch (e) {}
    }
    function resume() {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    }
    function tone(freq, dur = 0.12, type = "triangle", vol = 0.3, attack = 0.005) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
    function noise(dur = 0.08, vol = 0.25, cutoff = 1500) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const bufSize = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      src.start(t0);
      src.stop(t0 + dur);
    }
    function sweep(f1, f2, dur, type = "sawtooth", vol = 0.25) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f1, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
    return {
      resume,
      move: () => { resume(); tone(330, 0.08, "square", 0.18); },
      merge: (v) => {
        resume();
        const base = Math.min(880, 220 + Math.log2(v) * 55);
        tone(base, 0.1, "triangle", 0.25);
        setTimeout(() => tone(base * 1.5, 0.12, "triangle", 0.22), 50);
      },
      spawn: () => { resume(); tone(660, 0.08, "sine", 0.18); },
      invalid: () => { resume(); noise(0.05, 0.15, 300); },
      win: () => {
        resume();
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.3), i * 120));
      },
      over: () => {
        resume();
        [440, 349, 293, 220, 165].forEach((f, i) => setTimeout(() => tone(f, 0.22, "square", 0.3), i * 130));
        setTimeout(() => noise(0.35, 0.2, 400), 650);
      },
      start: () => {
        resume();
        [440, 554, 659].forEach((f, i) => setTimeout(() => tone(f, 0.12, "triangle", 0.3), i * 80));
      },
      toggleMute: () => {
        muted = !muted;
        if (masterGain) masterGain.gain.value = muted ? 0 : 0.7;
        return muted;
      },
      isMuted: () => muted,
    };
  })();

  // ============== State ==============
  // 每个 tile: { v: value, x, y, from: null, merged: bool, pop: bool, anim: t }
  let grid; // 2D array of tile or null
  let score = 0;
  let best = Number(localStorage.getItem("neon_2048_best") || 0);
  let moves = 0;
  let maxTile = 2;
  let won = false;
  let keptPlaying = false;
  let gameOver = false;
  let paused = false;
  let started = false;

  // 粒子
  const particles = [];

  // 动画帧计数（用于每次移动动画）
  let animState = null; // { duration, startT }

  // ============== DOM ==============
  const canvas = document.getElementById("g2048-board");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("g2048-score");
  const bestEl = document.getElementById("g2048-best");
  const maxEl = document.getElementById("g2048-max");
  const movesEl = document.getElementById("g2048-moves");
  const overlay = document.getElementById("g2048-overlay");
  const overlayTitle = document.getElementById("g2048-title");
  const overlaySub = document.getElementById("g2048-subtitle");
  const btnStart = document.getElementById("g2048-btn-start");
  const btnMute = document.getElementById("g2048-mute-btn");
  const btnReset = document.getElementById("g2048-reset-btn");

  bestEl.textContent = best;

  // ============== Helpers ==============
  function createGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function forEachTile(cb) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) cb(grid[r][c], r, c);
      }
    }
  }

  function emptyCells() {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) cells.push([r, c]);
      }
    }
    return cells;
  }

  function spawnRandom() {
    const empty = emptyCells();
    if (!empty.length) return null;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    const v = Math.random() < 0.9 ? 2 : 4;
    const tile = {
      v,
      x: c,
      y: r,
      dx: c,
      dy: r,
      merged: false,
      isNew: true,
      anim: 0,
    };
    grid[r][c] = tile;
    return tile;
  }

  // 将每一行压缩到某一方向；返回 {moved, gained, mergedCount, merges: [tile...]}
  function move(direction) {
    if (gameOver || paused) return;
    const nowT = performance.now();
    // 为每个方块保存起始坐标（动画用）
    forEachTile(t => {
      t.animFromX = t.dx;
      t.animFromY = t.dy;
      t.animT = nowT;
      t.x = t.dx;
      t.y = t.dy;
      t.merged = false;
      t.isNew = false;
      t.isMerged = false;
      t.toRemove = false;
    });

    const traverse = getTraversal(direction);
    const vec = getVector(direction);
    let moved = false;
    let gained = 0;
    let mergedCount = 0;
    const mergedTiles = [];

    for (const [r, c] of traverse.cells) {
      const tile = grid[r][c];
      if (!tile) continue;
      // 找到最远的空位 / 可合并的方块
      let nr = r, nc = c;
      let mergedInto = null;
      while (true) {
        const tr = nr + vec.r;
        const tc = nc + vec.c;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        if (!grid[tr][tc]) {
          nr = tr;
          nc = tc;
        } else if (grid[tr][tc].v === tile.v && !grid[tr][tc].merged) {
          nr = tr;
          nc = tc;
          mergedInto = grid[tr][tc];
          break;
        } else break;
      }

      if (nr !== r || nc !== c) moved = true;
      if (mergedInto) {
        // 合并：将 tile 移动到 mergedInto 位置，并创建新合并方块
        const newV = tile.v * 2;
        gained += newV;
        mergedCount++;
        mergedInto.merged = true;
        // 标记：tile 会飞到目标位置并消失；mergedInto 也会消失被替换为新 tile
        // 简化处理：我们直接在目标位置放一个新的“合并”tile
        const mergeCell = {
          v: newV,
          x: nc, // 视觉起始位置
          y: nr,
          dx: nc,
          dy: nr,
          merged: true,
          isNew: true, // 让它有弹入效果
          isMerged: true,
          anim: 0,
        };
        // 把原 tile 和 mergedInto 标记为要消失，然后放置 mergeCell
        // 记录它们飞行位置（通过设置 .dx/dy 使其移动到合并点，再消失）
        tile.dx = nc;
        tile.dy = nr;
        tile.toRemove = true;
        mergedInto.dx = nc;
        mergedInto.dy = nr;
        mergedInto.toRemove = true;
        grid[r][c] = null;
        // 合并点的位置稍后统一替换为 mergeCell（下面会再次遍历冲突：我们先存到 pending）
        mergedTiles.push({ r: nr, c: nc, cell: mergeCell, from1: tile, from2: mergedInto });
        // 暂时在 grid 留 null; 下面再填
      } else {
        grid[r][c] = null;
        tile.dx = nc;
        tile.dy = nr;
        if (grid[nr][nc] !== null) {
          // 理论上不会发生，但若重叠，跳过合并则此处是冲突 -> 保持
        }
        grid[nr][nc] = tile;
      }
    }

    // 处理合并：替换 grid 中的占位
    // 需要注意：多个合并目标可能在同一格（不应该发生），这里做保险
    for (const m of mergedTiles) {
      grid[m.r][m.c] = m.cell;
    }

    if (moved) {
      // 重置动画
      const maxTile = Math.max(...mergedTiles.map(m => m.cell.v), 2);
      animState = { startT: performance.now(), duration: 150, movedSet: true };
      score += gained;
      moves++;
      if (maxTile > window.__max) window.__max = maxTile;
      if (mergedCount > 0) Audio.merge(mergedTiles[mergedTiles.length - 1].cell.v);
      else Audio.move();

      // 粒子：合并点产生粒子
      mergedTiles.forEach(m => {
        spawnParticles(m.c * CELL + CELL / 2, m.r * CELL + CELL / 2, tileColor(m.cell.v).fg, 10 + Math.log2(m.cell.v) * 2);
      });

      // 生成新方块
      setTimeout(() => {
        const t = spawnRandom();
        if (t) Audio.spawn();
        updateUI();
        render();
      }, 100);
    } else {
      // 不能移动
      Audio.invalid();
    }

    // 更新最大格
    let maxV = 2;
    forEachTile(t => { if (t.v > maxV) maxV = t.v; });
    if (maxV >= 2048 && !won) {
      won = true;
      if (!keptPlaying) {
        setTimeout(() => {
          showOverlay("胜利！", "按 R 继续挑战 或 点击下方继续游戏", "▶ 继续游戏");
          Audio.win();
          keptPlaying = true;
        }, 400);
      }
    }

    // 检查 game over
    if (emptyCells().length === 0 && !hasMergeMove()) {
      setTimeout(() => {
        gameOver = true;
        showOverlay("游戏结束", "最终得分: " + score, "▶ 再来一局");
        Audio.over();
      }, 400);
    }

    updateUI();
  }

  function hasMergeMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c];
        if (!t) return true;
        if (r + 1 < SIZE && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
        if (c + 1 < SIZE && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
      }
    }
    return false;
  }

  function getVector(d) {
    // 0=up,1=right,2=down,3=left
    return [
      { r: -1, c: 0 },
      { r: 0, c: 1 },
      { r: 1, c: 0 },
      { r: 0, c: -1 },
    ][d];
  }
  function getTraversal(d) {
    const cells = [];
    // 按移动方向反向遍历，防止先行的方块阻挡
    const ranges = {
      0: { r: [0, 1, 2, 3], c: [0, 1, 2, 3] },       // up: 从上到下
      1: { r: [0, 1, 2, 3], c: [3, 2, 1, 0] },       // right: 从右到左
      2: { r: [3, 2, 1, 0], c: [0, 1, 2, 3] },       // down: 从下到上
      3: { r: [0, 1, 2, 3], c: [0, 1, 2, 3] },       // left: 从左到右
    }[d];
    // 注意：left 我们也要从左到右遍历列 -> 左列先处理是对的
    for (const r of ranges.r) for (const c of ranges.c) cells.push([r, c]);
    return { cells };
  }

  // ============== Particles ==============
  function spawnParticles(px, py, color, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7 - 1,
        life: 30 + Math.random() * 20,
        age: 0,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.age++;
      if (p.age >= p.life) particles.splice(i, 1);
    }
  }

  // ============== Render ==============
  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
    g.addColorStop(0, "rgba(10,15,45,0.85)");
    g.addColorStop(1, "rgba(5,8,28,0.95)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 网格背景
    ctx.strokeStyle = "rgba(120, 200, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(CANVAS_SIZE, i * CELL + 0.5);
      ctx.stroke();
    }

    // 单元底色（空槽）
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const x = c * CELL + PAD;
        const y = r * CELL + PAD;
        const w = CELL - PAD * 2;
        const h = CELL - PAD * 2;
        ctx.save();
        ctx.fillStyle = "rgba(30, 45, 90, 0.55)";
        roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawTile(tile, progress) {
    // progress 0..1 对 isNew/isMerged/toRemove 生效
    const col = tileColor(tile.v);
    // 滑动动画：若 tile 有 .animFromX/.animFromY 并且 animT 记录了起始时间
    let fx = tile.dx;
    let fy = tile.dy;
    if (tile.animFromX !== undefined && animState) {
      const ap = Math.min(1, (performance.now() - tile.animT) / 150);
      fx = tile.animFromX + (tile.dx - tile.animFromX) * ap;
      fy = tile.animFromY + (tile.dy - tile.animFromY) * ap;
    }
    const px = fx * CELL + PAD;
    const py = fy * CELL + PAD;
    const w = CELL - PAD * 2;
    const h = CELL - PAD * 2;

    let scale = 1;
    let alpha = 1;
    if (tile.toRemove && progress >= 0.5) {
      alpha = 1 - (progress - 0.5) * 2;
      scale = 1 + (progress - 0.5) * 0.2;
    } else if (tile.isMerged) {
      scale = 0.85 + Math.min(1, progress) * 0.2 + Math.sin(Math.min(1, progress) * Math.PI) * 0.08;
    } else if (tile.isNew) {
      scale = 0.6 + Math.min(1, progress) * 0.4;
      alpha = Math.min(1, progress * 2);
    }

    const cx = px + w / 2;
    const cy = py + h / 2;
    const sw = w * scale;
    const sh = h * scale;
    const x = cx - sw / 2;
    const y = cy - sh / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    // 外发光
    ctx.shadowColor = col.glow;
    ctx.shadowBlur = 22;
    const grad = ctx.createLinearGradient(x, y, x + sw, y + sh);
    grad.addColorStop(0, lighten(col.bg, 0.25));
    grad.addColorStop(1, col.bg);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, sw, sh, 14);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 文本
    ctx.fillStyle = col.fg;
    const fontSize = tile.v >= 1000 ? Math.floor(sw * 0.28) : Math.floor(sw * 0.38);
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(tile.v), cx, cy + 2);

    // 高光
    ctx.globalAlpha = 0.25 * alpha;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x + 6, y + 6, sw - 12, (sh - 12) * 0.3, 10);
    ctx.fill();

    ctx.restore();
  }

  function render() {
    drawBg();
    const now = performance.now();
    let progress = 1;
    if (animState) {
      progress = Math.min(1, (now - animState.startT) / animState.duration);
    }

    // 先绘制 toRemove 的飞行方块（它们会飞到合并点并消失）
    // 再绘制正常方块
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const t = grid[r][c];
        if (t && !t.toRemove) drawTile(t, progress);
      }
    }
    // 合并点已在 grid 中作为 isMerged 方块绘制了；而 toRemove 的方块还没有绘制
    // 由于我们把 toRemove 的方块从 grid 中移除了，这里需要专门绘制它们的飞行动画
    // -> 我们把飞行中的方块保存在 flyingTiles 中
    if (flyingTiles.length) {
      for (const ft of flyingTiles) {
        const interp = Math.min(1, (now - ft.bornT) / 150);
        ft.tile.dx = ft.tile.dx; // 已设置
        ft.tile.dy = ft.tile.dy;
        // 临时设置位置从起点到终点做插值
        const startX = ft.fromX * CELL + PAD;
        const startY = ft.fromY * CELL + PAD;
        const endX = ft.tile.dx * CELL + PAD;
        const endY = ft.tile.dy * CELL + PAD;
        const px = startX + (endX - startX) * interp;
        const py = startY + (endY - startY) * interp;

        const col = tileColor(ft.tile.v);
        const w = CELL - PAD * 2;
        const h = CELL - PAD * 2;
        const alpha = 1 - interp;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.shadowColor = col.glow;
        ctx.shadowBlur = 18;
        const grad = ctx.createLinearGradient(px, py, px + w, py + h);
        grad.addColorStop(0, lighten(col.bg, 0.25));
        grad.addColorStop(1, col.bg);
        ctx.fillStyle = grad;
        roundRect(ctx, px, py, w, h, 14);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = col.fg;
        const fontSize = ft.tile.v >= 1000 ? Math.floor(w * 0.28) : Math.floor(w * 0.38);
        ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(ft.tile.v), px + w / 2, py + h / 2 + 2);
        ctx.restore();
      }
      // 清理已完成飞行
      for (let i = flyingTiles.length - 1; i >= 0; i--) {
        if (now - flyingTiles[i].bornT > 150) flyingTiles.splice(i, 1);
      }
    }

    // 粒子
    for (const p of particles) {
      const a = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.min(255, Math.floor(r + 255 * amt));
    g = Math.min(255, Math.floor(g + 255 * amt));
    b = Math.min(255, Math.floor(b + 255 * amt));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // 飞行记录列表
  const flyingTiles = [];

  // ============== 键盘输入入口 ==============
  function doMove(dir) {
    if (gameOver || paused || !started) return;
    // 记录每个 tile 的原始位置（动画用）
    const origPositions = [];
    forEachTile(t => origPositions.push({ t, x: t.dx, y: t.dy }));
    // 执行移动 / 合并
    move(dir);
    // 收集合并后消失的方块（toRemove），让它们有飞行动画
    const now = performance.now();
    for (const o of origPositions) {
      if (o.t.toRemove) {
        flyingTiles.push({ tile: o.t, fromX: o.x, fromY: o.y, bornT: now });
      }
    }
  }

  // ============== UI / Overlay ==============
  function updateUI() {
    let mV = 2;
    forEachTile(t => { if (t.v > mV) mV = t.v; });
    maxTile = mV;
    scoreEl.textContent = score;
    movesEl.textContent = moves;
    maxEl.textContent = maxTile;
    if (score > best) {
      best = score;
      localStorage.setItem("neon_2048_best", String(best));
    }
    bestEl.textContent = best;
  }

  function showOverlay(title, sub, btnLabel) {
    overlayTitle.textContent = title;
    overlaySub.innerHTML = sub;
    btnStart.textContent = btnLabel || "▶ 开始";
    overlay.classList.add("show");
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
    overlay.classList.remove("show");
  }

  function reset() {
    grid = createGrid();
    score = 0;
    moves = 0;
    maxTile = 2;
    won = false;
    keptPlaying = false;
    gameOver = false;
    paused = false;
    flyingTiles.length = 0;
    particles.length = 0;
    spawnRandom();
    spawnRandom();
    animState = { startT: performance.now(), duration: 250 };
    updateUI();
    hideOverlay();
  }

  function startGame() {
    Audio.start();
    reset();
    started = true;
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      showOverlay("暂停", "按 P 继续", "▶ 继续");
    } else {
      hideOverlay();
    }
  }

  // ============== Input ==============
  btnStart.addEventListener("click", () => {
    startGame();
  });
  btnReset.addEventListener("click", () => {
    Audio.start();
    reset();
  });
  btnMute.addEventListener("click", () => {
    Audio.resume();
    const m = Audio.toggleMute();
    btnMute.textContent = m ? "🔇 音效" : "🔊 音效";
  });

  const btnHelp = document.getElementById("g2048-help-btn");
  if (btnHelp) {
    btnHelp.addEventListener("click", () => {
      alert('🎮 霓虹2048玩法：\n\n📱 手机操作：\n1. 滑动屏幕移动方块\n2. 点击"重置"重新开始\n\n⌨️ 电脑操作：\n1. 方向键或WASD移动方块\n2. R键重新开始\n3. P键暂停\n4. M键静音切换\n\n📋 游戏规则：\n- 相同数字方块合并后翻倍\n- 达成2048即胜利\n- 棋盘填满无法移动即结束');
    });
  }

  document.addEventListener("keydown", (e) => {
    // 只在 2048 视图激活时响应
    const activeStage = document.querySelector(".stage.active");
    if (!activeStage || activeStage.id !== "stage-g2048") return;

    const k = e.key;
    if (k === "Enter") { startGame(); return; }
    if (!started || gameOver) return;

    if (k === "m" || k === "M") {
      Audio.resume();
      const m = Audio.toggleMute();
      btnMute.textContent = m ? "🔇 音效" : "🔊 音效";
      return;
    }
    if (k === "p" || k === "P") { togglePause(); return; }
    if (k === "r" || k === "R") { reset(); return; }
    if (paused) return;

    let dir = -1;
    if (k === "ArrowUp" || k === "w" || k === "W") dir = 0;
    else if (k === "ArrowRight" || k === "d" || k === "D") dir = 1;
    else if (k === "ArrowDown" || k === "s" || k === "S") dir = 2;
    else if (k === "ArrowLeft" || k === "a" || k === "A") dir = 3;
    if (dir !== -1) {
      e.preventDefault();
      doMove(dir);
    }
  });

  // 触摸按钮
  document.querySelectorAll(".touch-2048 .tbtn").forEach(btn => {
    const act = () => {
      const activeStage = document.querySelector(".stage.active");
      if (!activeStage || activeStage.id !== "stage-g2048") return;
      if (!started || gameOver || paused) return;
      switch (btn.dataset.act) {
        case "up": doMove(0); break;
        case "right": doMove(1); break;
        case "down": doMove(2); break;
        case "left": doMove(3); break;
        case "reset": reset(); break;
      }
    };
    btn.addEventListener("click", act);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); act(); });
  });

  // 画布滑动
  let touchStartG = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStartG = { x: t.clientX, y: t.clientY };
  });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStartG) return;
    const activeStage = document.querySelector(".stage.active");
    if (!activeStage || activeStage.id !== "stage-g2048") return;
    if (!started || gameOver || paused) { touchStartG = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartG.x;
    const dy = t.clientY - touchStartG.y;
    const threshold = 20;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      touchStartG = null; return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      doMove(dx > 0 ? 1 : 3);
    } else {
      doMove(dy > 0 ? 2 : 0);
    }
    touchStartG = null;
    e.preventDefault();
  });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  // 初始化音频
  document.addEventListener("pointerdown", () => Audio.resume(), { once: false });
  document.addEventListener("keydown", () => Audio.resume(), { once: false });

  // 初始化初始棋盘（为了显示效果）
  grid = createGrid();
  spawnRandom();
  spawnRandom();
  updateUI();

  // 渲染循环
  function tick() {
    updateParticles();
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
