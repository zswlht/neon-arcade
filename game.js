/* ============================================================
   NEON TETRIS — 霓虹俄罗斯方块
   纯 JavaScript + Canvas + Web Audio 实现
   ============================================================ */

(() => {
  "use strict";

  // ---------- 配置 ----------
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 30;        // 主棋盘每格像素
  const MINI = 24;          // 小预览格像素

  // 七种方块形状 (tetromino)
  const PIECES = {
    I: {
      color: "#22f5ff",
      glow: "rgba(34,245,255,0.9)",
      shapes: [
        [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
        [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]]
      ]
    },
    O: {
      color: "#ffec42",
      glow: "rgba(255,236,66,0.9)",
      shapes: [
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]]
      ]
    },
    T: {
      color: "#c26bff",
      glow: "rgba(194,107,255,0.9)",
      shapes: [
        [[0,1,0],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,1],[0,1,0]],
        [[0,1,0],[1,1,0],[0,1,0]]
      ]
    },
    S: {
      color: "#4aff8b",
      glow: "rgba(74,255,139,0.9)",
      shapes: [
        [[0,1,1],[1,1,0],[0,0,0]],
        [[0,1,0],[0,1,1],[0,0,1]],
        [[0,0,0],[0,1,1],[1,1,0]],
        [[1,0,0],[1,1,0],[0,1,0]]
      ]
    },
    Z: {
      color: "#ff5577",
      glow: "rgba(255,85,119,0.9)",
      shapes: [
        [[1,1,0],[0,1,1],[0,0,0]],
        [[0,0,1],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,0],[0,1,1]],
        [[0,1,0],[1,1,0],[1,0,0]]
      ]
    },
    J: {
      color: "#4a7bff",
      glow: "rgba(74,123,255,0.9)",
      shapes: [
        [[1,0,0],[1,1,1],[0,0,0]],
        [[0,1,1],[0,1,0],[0,1,0]],
        [[0,0,0],[1,1,1],[0,0,1]],
        [[0,1,0],[0,1,0],[1,1,0]]
      ]
    },
    L: {
      color: "#ff9a3c",
      glow: "rgba(255,154,60,0.9)",
      shapes: [
        [[0,0,1],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,0],[0,1,1]],
        [[0,0,0],[1,1,1],[1,0,0]],
        [[1,1,0],[0,1,0],[0,1,0]]
      ]
    }
  };
  const KEYS = Object.keys(PIECES);

  // ============================================================
  // 🔊 AUDIO SYNTHESIZER (Web Audio API — 零文件依赖)
  // ============================================================
  const Audio = (() => {
    let ctx = null;
    let masterGain = null;
    let bgmGain = null;
    let sfxGain = null;
    let bgmTimer = null;
    let bgmStep = 0;
    let muted = false;
    let initialized = false;

    // 简单的 8-bit 风格音阶（A小调）
    const BGM_NOTES = [
      220.00, // A3
      277.18, // C#4
      329.63, // E4
      440.00, // A4
      329.63, // E4
      277.18, // C#4
      246.94, // B3
      220.00, // A3
      196.00, // G3
      246.94, // B3
      293.66, // D4
      392.00, // G4
      349.23, // F4
      293.66, // D4
      261.63, // C4
      246.94, // B3
    ];
    const BASS_NOTES = [110, 110, 110, 110, 98, 98, 98, 98];

    function ensure() {
      if (initialized) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 0.7;
        masterGain.connect(ctx.destination);

        bgmGain = ctx.createGain();
        bgmGain.gain.value = 0.18;
        bgmGain.connect(masterGain);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.55;
        sfxGain.connect(masterGain);

        initialized = true;
      } catch (e) {
        // Audio not supported
      }
    }

    function resume() {
      ensure();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    }

    // 播放单个音符
    function playTone(freq, duration, type = "square", volume = 0.3, attack = 0.005, release = 0.08, dest) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + attack);
      gain.gain.linearRampToValueAtTime(0, now + duration + release);
      osc.connect(gain);
      gain.connect(dest || sfxGain);
      osc.start(now);
      osc.stop(now + duration + release + 0.02);
    }

    // 滑音（用于 tetris / level up）
    function playSweep(startFreq, endFreq, duration, type = "sawtooth", volume = 0.3) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    // 噪音（用于 lock 撞击感）
    function playNoise(duration, volume = 0.25, filterFreq = 1200) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.linearRampToValueAtTime(0, now + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start(now);
      src.stop(now + duration);
    }

    // --- 各种音效 ---
    function sfxMove()   { resume(); playTone(420, 0.05, "square", 0.15); }
    function sfxRotate() { resume(); playTone(620, 0.06, "triangle", 0.2); }
    function sfxHold()   { resume(); playTone(520, 0.08, "square", 0.22); setTimeout(() => playTone(780, 0.08, "square", 0.22), 60); }
    function sfxLock()   { resume(); playNoise(0.08, 0.25, 800); playTone(130, 0.08, "sine", 0.25); }
    function sfxHardDrop() {
      resume();
      playSweep(800, 120, 0.15, "sawtooth", 0.25);
      setTimeout(() => playNoise(0.1, 0.3, 600), 100);
    }
    function sfxClear(n) {
      resume();
      // 消行越多，音阶越高
      const base = [440, 554, 659, 784][n - 1] || 440;
      playTone(base, 0.12, "square", 0.25);
      setTimeout(() => playTone(base * 1.25, 0.12, "square", 0.25), 70);
      setTimeout(() => playTone(base * 1.5, 0.16, "square", 0.3), 140);
      if (n >= 4) {
        // Tetris 特殊音
        setTimeout(() => playSweep(base * 2, base * 4, 0.35, "sawtooth", 0.28), 260);
      }
    }
    function sfxLevelUp() {
      resume();
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => setTimeout(() => playTone(f, 0.12, "triangle", 0.3), i * 80));
    }
    function sfxGameOver() {
      resume();
      const notes = [440, 392, 349, 330, 294, 262, 220];
      notes.forEach((f, i) => setTimeout(() => playTone(f, 0.22, "square", 0.28), i * 120));
      setTimeout(() => playNoise(0.3, 0.2, 400), notes.length * 120);
    }
    function sfxStart() {
      resume();
      [440, 554, 659].forEach((f, i) => setTimeout(() => playTone(f, 0.12, "triangle", 0.3), i * 90));
    }
    function sfxPause() { resume(); playTone(300, 0.15, "sine", 0.3); }

    // --- BGM (简单的循环 arpeggio + bass) ---
    function startBGM() {
      ensure();
      if (!ctx || bgmTimer) return;
      bgmStep = 0;
      const stepMs = 220;
      bgmTimer = setInterval(() => {
        if (muted) return;
        const note = BGM_NOTES[bgmStep % BGM_NOTES.length];
        const bass = BASS_NOTES[Math.floor(bgmStep / 2) % BASS_NOTES.length];
        // 主旋律
        playTone(note, 0.18, "triangle", 0.12, 0.01, 0.12, bgmGain);
        // 每 4 步加一个 bass
        if (bgmStep % 4 === 0) {
          playTone(bass, 0.4, "sine", 0.15, 0.02, 0.2, bgmGain);
        }
        bgmStep++;
      }, stepMs);
    }
    function stopBGM() {
      if (bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
      }
    }
    function pauseBGM(pause) {
      if (!ctx) return;
      if (pause) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    }

    function toggleMute() {
      muted = !muted;
      if (masterGain) masterGain.gain.value = muted ? 0 : 0.7;
      return muted;
    }
    function isMuted() { return muted; }

    return {
      ensure, resume,
      sfxMove, sfxRotate, sfxHold, sfxLock, sfxHardDrop,
      sfxClear, sfxLevelUp, sfxGameOver, sfxStart, sfxPause,
      startBGM, stopBGM, pauseBGM,
      toggleMute, isMuted
    };
  })();

  // ---------- 状态 ----------
  /** 游戏棋盘: 0=空, 字符串=方块key */
  let board = createBoard();
  let current = null;      // { key, rot, x, y }
  let nextKey = null;
  let holdKey = null;
  let holdUsed = false;
  let score = 0;
  let lines = 0;
  let level = 1;
  let gameOver = false;
  let paused = false;
  let running = false;
  let dropInterval = 800;   // ms
  let lastDrop = 0;
  let lastTick = 0;
  let highScore = Number(localStorage.getItem("neon_tetris_high") || 0);

  // 粒子效果
  const particles = [];
  // 消除闪光
  let flashLines = [];

  // ---------- DOM ----------
  const boardCanvas = document.getElementById("board");
  const ctx = boardCanvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nextCtx = nextCanvas.getContext("2d");
  const holdCanvas = document.getElementById("hold");
  const holdCtx = holdCanvas.getContext("2d");
  const nextMobileCanvas = document.getElementById("next-mobile");
  const nextMobileCtx = nextMobileCanvas ? nextMobileCanvas.getContext("2d") : null;
  const holdMobileCanvas = document.getElementById("hold-mobile");
  const holdMobileCtx = holdMobileCanvas ? holdMobileCanvas.getContext("2d") : null;
  const muteBtn = document.getElementById("muteBtn");

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const linesEl = document.getElementById("lines");
  const highEl = document.getElementById("highscore");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySubtitle");
  const btnStart = document.getElementById("btnStart");

  highEl.textContent = highScore;

  // 静音按钮切换
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      Audio.resume();
      const m = Audio.toggleMute();
      muteBtn.textContent = m ? "🔇 音效:关" : "🔊 音效:开";
    });
  }

  // ---------- 工具函数 ----------
  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function randomPiece(key) {
    const k = key || KEYS[Math.floor(Math.random() * KEYS.length)];
    const shape = PIECES[k].shapes[0];
    const piece = {
      key: k,
      rot: 0,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: -getTopOffset(shape)
    };
    return piece;
  }
  function getTopOffset(shape) {
    for (let r = 0; r < shape.length; r++) {
      if (shape[r].some(v => v)) return r;
    }
    return 0;
  }

  function getShape(piece) {
    return PIECES[piece.key].shapes[piece.rot];
  }

  function collides(piece, offX = 0, offY = 0, rot = piece.rot) {
    const shape = PIECES[piece.key].shapes[rot];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = piece.x + c + offX;
        const ny = piece.y + r + offY;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function merge(piece) {
    const shape = getShape(piece);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const y = piece.y + r;
        const x = piece.x + c;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
          board[y][x] = piece.key;
        }
      }
    }
  }

  function rotate(dir = 1) {
    const newRot = (current.rot + (dir > 0 ? 1 : 3)) % 4;
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(current, k, 0, newRot)) {
        current.x += k;
        current.rot = newRot;
        Audio.sfxRotate();
        return;
      }
    }
  }

  function hardDrop() {
    let d = 0;
    while (!collides(current, 0, d + 1)) d++;
    current.y += d;
    score += d * 2;
    spawnParticles(current);
    Audio.sfxHardDrop();
    lockPiece();
  }

  function lockPiece() {
    merge(current);
    Audio.sfxLock();
    const oldLevel = level;
    clearLines();
    if (level > oldLevel) Audio.sfxLevelUp();
    spawnNext();
    holdUsed = false;
  }

  function spawnNext() {
    current = randomPiece(nextKey);
    nextKey = KEYS[Math.floor(Math.random() * KEYS.length)];
    if (collides(current, 0, 0)) {
      endGame();
    }
  }

  function hold() {
    if (holdUsed) return;
    holdUsed = true;
    Audio.sfxHold();
    const prev = holdKey;
    holdKey = current.key;
    if (prev) {
      current = randomPiece(prev);
    } else {
      current = randomPiece(nextKey);
      nextKey = KEYS[Math.floor(Math.random() * KEYS.length)];
    }
  }

  function clearLines() {
    const cleared = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(c => c)) {
        cleared.push(r);
      }
    }
    if (!cleared.length) return;

    flashLines = cleared.slice();
    cleared.forEach(r => {
      for (let c = 0; c < COLS; c++) {
        spawnParticle(c * BLOCK + BLOCK / 2, r * BLOCK + BLOCK / 2, "#ffffff", 8);
      }
    });

    Audio.sfxClear(Math.min(4, cleared.length));

    setTimeout(() => {
      cleared.sort((a, b) => a - b);
      for (let i = cleared.length - 1; i >= 0; i--) {
        board.splice(cleared[i], 1);
      }
      while (board.length < ROWS) board.unshift(Array(COLS).fill(0));
      flashLines = [];
    }, 220);

    const gained = [0, 100, 300, 500, 800][cleared.length] || 0;
    score += gained * level;
    lines += cleared.length;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel !== level) {
      level = newLevel;
      dropInterval = Math.max(70, 800 - (level - 1) * 60);
    }
  }

  // ---------- 粒子 ----------
  function spawnParticle(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 40 + Math.random() * 30,
        age: 0,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }
  function spawnParticles(piece) {
    const shape = getShape(piece);
    const color = PIECES[piece.key].color;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const px = (piece.x + c) * BLOCK + BLOCK / 2;
        const py = (piece.y + r) * BLOCK + BLOCK / 2;
        if (piece.y + r >= 0) spawnParticle(px, py, color, 4);
      }
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.age += 1;
      if (p.age >= p.life) particles.splice(i, 1);
    }
  }

  // ---------- 绘制 ----------
  function drawCell(context, x, y, size, color, glow, alpha = 1) {
    const pad = 2;
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = glow;
    context.shadowBlur = 18;
    const grad = context.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, lighten(color, 0.25));
    grad.addColorStop(1, color);
    context.fillStyle = grad;
    context.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
    context.shadowBlur = 0;
    context.fillStyle = "rgba(255,255,255,0.35)";
    context.fillRect(x + pad, y + pad, size - pad * 2, 3);
    context.fillStyle = "rgba(0,0,0,0.35)";
    context.fillRect(x + pad, y + size - pad - 3, size - pad * 2, 3);
    context.restore();
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(120, 200, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK + 0.5, 0);
      ctx.lineTo(c * BLOCK + 0.5, ROWS * BLOCK);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK + 0.5);
      ctx.lineTo(COLS * BLOCK, r * BLOCK + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoard() {
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
    const bg = ctx.createLinearGradient(0, 0, 0, ROWS * BLOCK);
    bg.addColorStop(0, "rgba(10,15,45,0.55)");
    bg.addColorStop(1, "rgba(5,8,28,0.85)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    drawGrid();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = board[r][c];
        if (!key) continue;
        const isFlash = flashLines.includes(r);
        drawCell(ctx, c * BLOCK, r * BLOCK, BLOCK,
          isFlash ? "#ffffff" : PIECES[key].color,
          isFlash ? "rgba(255,255,255,1)" : PIECES[key].glow);
      }
    }

    if (current && running && !gameOver) {
      let ghostY = 0;
      while (!collides(current, 0, ghostY + 1)) ghostY++;
      const shape = getShape(current);
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const y = current.y + ghostY + r;
          if (y < 0) continue;
          ctx.save();
          ctx.strokeStyle = PIECES[current.key].color;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 2;
          ctx.strokeRect((current.x + c) * BLOCK + 3, y * BLOCK + 3, BLOCK - 6, BLOCK - 6);
          ctx.restore();
        }
      }
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const y = current.y + r;
          if (y < 0) continue;
          drawCell(ctx, (current.x + c) * BLOCK, y * BLOCK, BLOCK,
            PIECES[current.key].color, PIECES[current.key].glow);
        }
      }
    }

    for (const p of particles) {
      const a = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawMini(context, canvas, key, size = MINI) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const bg = context.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "rgba(10,15,45,0.5)");
    bg.addColorStop(1, "rgba(5,8,28,0.8)");
    context.fillStyle = bg;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!key) return;
    const shape = PIECES[key].shapes[0];
    let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }
    const w = (maxC - minC + 1) * size;
    const h = (maxR - minR + 1) * size;
    const offX = (canvas.width - w) / 2 - minC * size;
    const offY = (canvas.height - h) / 2 - minR * size;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        drawCell(context, offX + c * size, offY + r * size, size,
          PIECES[key].color, PIECES[key].glow);
      }
    }
  }

  // ---------- 主循环 ----------
  function tick(ts) {
    if (!lastTick) lastTick = ts;
    const dt = ts - lastTick;
    lastTick = ts;

    if (running && !paused && !gameOver) {
      lastDrop += dt;
      if (lastDrop >= dropInterval) {
        lastDrop = 0;
        if (!collides(current, 0, 1)) {
          current.y++;
        } else {
          spawnParticles(current);
          lockPiece();
        }
      }
    }

    updateParticles();
    drawBoard();
    drawMini(nextCtx, nextCanvas, nextKey);
    drawMini(holdCtx, holdCanvas, holdKey);
    if (nextMobileCtx && nextMobileCanvas) drawMini(nextMobileCtx, nextMobileCanvas, nextKey, 12);
    if (holdMobileCtx && holdMobileCanvas) drawMini(holdMobileCtx, holdMobileCanvas, holdKey, 12);

    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("neon_tetris_high", String(highScore));
      highEl.textContent = highScore;
    }

    requestAnimationFrame(tick);
  }

  // ---------- 控制 ----------
  function startGame() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 800;
    holdKey = null;
    holdUsed = false;
    particles.length = 0;
    flashLines = [];
    gameOver = false;
    paused = false;
    running = true;
    nextKey = KEYS[Math.floor(Math.random() * KEYS.length)];
    current = randomPiece();
    nextKey = KEYS[Math.floor(Math.random() * KEYS.length)];
    overlay.classList.add("hidden");

    Audio.sfxStart();
    Audio.startBGM();
  }

  function endGame() {
    gameOver = true;
    running = false;
    overlayTitle.textContent = "游戏结束";
    overlaySub.textContent = "最终得分: " + score;
    btnStart.textContent = "▶ 再来一局";
    overlay.classList.remove("hidden");

    Audio.stopBGM();
    Audio.sfxGameOver();
  }

  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    if (paused) {
      overlayTitle.textContent = "暂停";
      overlaySub.textContent = "按 P 继续";
      btnStart.textContent = "▶ 继续";
      overlay.classList.remove("hidden");
      Audio.pauseBGM(true);
      Audio.sfxPause();
    } else {
      overlay.classList.add("hidden");
      Audio.pauseBGM(false);
    }
  }

  btnStart.addEventListener("click", () => {
    if (paused) togglePause();
    else startGame();
  });

  document.addEventListener("keydown", (e) => {
    // 只在当前 Tetris 游戏可见时响应
    const active = document.querySelector(".stage.active");
    if (!active || active.id !== "stage-tetris") return;
    const k = e.key;
    if (k === "m" || k === "M") {
      Audio.resume();
      const m = Audio.toggleMute();
      if (muteBtn) muteBtn.textContent = m ? "🔇 音效:关" : "🔊 音效:开";
      return;
    }
    if (k === "Enter" && (!running || gameOver)) {
      startGame();
      return;
    }
    if (k === "p" || k === "P") {
      togglePause();
      return;
    }
    if (!running || paused || gameOver) return;

    switch (k) {
      case "ArrowLeft":
        if (!collides(current, -1, 0)) { current.x--; Audio.sfxMove(); }
        break;
      case "ArrowRight":
        if (!collides(current, 1, 0)) { current.x++; Audio.sfxMove(); }
        break;
      case "ArrowDown":
        if (!collides(current, 0, 1)) { current.y++; score += 1; }
        break;
      case "ArrowUp":
      case "x":
      case "X":
        rotate(1);
        break;
      case "z":
      case "Z":
        rotate(-1);
        break;
      case " ":
        e.preventDefault();
        hardDrop();
        break;
      case "c":
      case "C":
        hold();
        break;
    }
    lastDrop = 0;
  });

  // 触摸按钮
  document.querySelectorAll(".tbtn").forEach(btn => {
    const act = () => {
      if (!running || paused || gameOver) return;
      switch (btn.dataset.act) {
        case "left":  if (!collides(current, -1, 0)) { current.x--; Audio.sfxMove(); } break;
        case "right": if (!collides(current, 1, 0)) { current.x++; Audio.sfxMove(); } break;
        case "down":  if (!collides(current, 0, 1)) { current.y++; score += 1; } break;
        case "rotate": rotate(1); break;
        case "drop": hardDrop(); break;
        case "hold": hold(); break;
      }
      lastDrop = 0;
    };
    btn.addEventListener("click", act);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); act(); });
  });

  // 触摸滑动
  let touchStart = null;
  boardCanvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: Date.now(), moved: false };
  });
  boardCanvas.addEventListener("touchmove", (e) => {
    if (!touchStart || !running || paused || gameOver) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const step = 24;
    if (Math.abs(dx) > step && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) { if (!collides(current, 1, 0)) { current.x++; Audio.sfxMove(); } }
      else { if (!collides(current, -1, 0)) { current.x--; Audio.sfxMove(); } }
      touchStart.x = t.clientX;
      touchStart.moved = true;
      lastDrop = 0;
    } else if (dy > step * 1.5) {
      if (!collides(current, 0, 1)) { current.y++; score += 1; }
      touchStart.y = t.clientY;
      touchStart.moved = true;
      lastDrop = 0;
    }
    e.preventDefault();
  });
  boardCanvas.addEventListener("touchend", () => {
    if (!touchStart || !running || paused || gameOver) return;
    const dt = Date.now() - touchStart.time;
    if (!touchStart.moved && dt < 250) {
      rotate(1);
      lastDrop = 0;
    }
    touchStart = null;
  });

  // ---------- 工具 ----------
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

  // 初始渲染
  drawBoard();
  drawMini(nextCtx, nextCanvas, null);
  drawMini(holdCtx, holdCanvas, holdKey);
  if (nextMobileCtx && nextMobileCanvas) drawMini(nextMobileCtx, nextMobileCanvas, null, 12);
  if (holdMobileCtx && holdMobileCanvas) drawMini(holdMobileCtx, holdMobileCanvas, holdKey, 12);
  requestAnimationFrame(tick);

  // 首次任意点击/按键：唤醒 AudioContext（浏览器策略要求）
  document.addEventListener("pointerdown", () => Audio.resume(), { once: false });
  document.addEventListener("keydown", () => Audio.resume(), { once: false });
})();
