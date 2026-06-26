/* =========================================================
 * NEON SUDOKU · 霓虹数独
 * 9x9 数独，标准规则
 * ========================================================= */

const SudokuGame = (() => {
  const CANVAS_SIZE = 400;
  const CELL = CANVAS_SIZE / 9;

  let canvas, ctx;
  let board = [];
  let solution = [];
  let selected = { r: -1, c: -1 };
  let difficulty = "medium";
  let mistakes = 0;
  let startTime = 0;
  let elapsed = 0;
  let running = false;
  let finished = false;
  let timerRAF = null;

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
      place: () => { resume(); tone(523, 0.08, "triangle", 0.25); },
      erase: () => { resume(); tone(220, 0.08, "triangle", 0.2); },
      error: () => { resume(); noise(0.15, 0.2); tone(140, 0.2, "square", 0.15); },
      select: () => { resume(); tone(660, 0.04, "sine", 0.15); },
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

  // ========== Sudoku Generator ==========
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isValid(board, r, c, num) {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === num) return false;
      if (board[i][c] === num) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[br + i][bc + j] === num) return false;
      }
    }
    return true;
  }

  function fillBoard(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const n of nums) {
            if (isValid(board, r, c, n)) {
              board[r][c] = n;
              if (fillBoard(board)) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function solveCount(board) {
    let count = 0;
    function solve() {
      if (count > 1) return;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (isValid(board, r, c, n)) {
                board[r][c] = n;
                solve();
                board[r][c] = 0;
              }
            }
            return;
          }
        }
      }
      count++;
    }
    solve();
    return count;
  }

  function generatePuzzle(diff) {
    // Create full solution
    const full = Array.from({ length: 9 }, () => Array(9).fill(0));
    fillBoard(full);

    // Copy to puzzle
    const puzzle = full.map(row => [...row]);

    // Cells to remove based on difficulty
    const removeMap = { easy: 35, medium: 45, hard: 55 };
    let remove = removeMap[diff] || 45;

    const cells = shuffle(
      Array.from({ length: 81 }, (_, i) => ({ r: Math.floor(i / 9), c: i % 9 }))
    );

    let removed = 0;
    for (const { r, c } of cells) {
      if (removed >= remove) break;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      const testBoard = puzzle.map(row => [...row]);
      if (solveCount(testBoard) === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup;
      }
    }

    return { puzzle, solution: full };
  }

  // ========== Drawing ==========
  function draw() {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // bg
    ctx.fillStyle = "rgba(5, 7, 26, 0.3)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Highlight selected row, col, and box
    if (selected.r >= 0 && selected.c >= 0) {
      ctx.fillStyle = "rgba(34, 245, 255, 0.08)";
      for (let i = 0; i < 9; i++) {
        ctx.fillRect(i * CELL, selected.r * CELL, CELL, CELL);
        ctx.fillRect(selected.c * CELL, i * CELL, CELL, CELL);
      }
      const br = Math.floor(selected.r / 3) * 3;
      const bc = Math.floor(selected.c / 3) * 3;
      ctx.fillStyle = "rgba(34, 245, 255, 0.12)";
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillRect((bc + j) * CELL, (br + i) * CELL, CELL, CELL);
        }
      }

      // Selected cell
      ctx.fillStyle = "rgba(34, 255, 143, 0.15)";
      ctx.fillRect(selected.c * CELL, selected.r * CELL, CELL, CELL);

      // Highlight same number
      const val = board[selected.r][selected.c];
      if (val !== 0) {
        ctx.fillStyle = "rgba(255, 62, 100, 0.1)";
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (board[r][c] === val && !(r === selected.r && c === selected.c)) {
              ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
            }
          }
        }
      }
    }

    // Grid lines - thin
    ctx.strokeStyle = "rgba(34, 245, 255, 0.2)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(CANVAS_SIZE, i * CELL);
      ctx.stroke();
    }

    // 3x3 box lines - thick
    ctx.strokeStyle = "#22f5ff";
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(34, 245, 255, 0.8)";
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3 * CELL, 0);
      ctx.lineTo(i * 3 * CELL, CANVAS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 3 * CELL);
      ctx.lineTo(CANVAS_SIZE, i * 3 * CELL);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Numbers
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const n = board[r][c];
        if (n === 0) continue;

        const isFixed = solution[r][c] === n && puzzleBoard[r][c] !== 0;
        const isError = n !== solution[r][c];
        const isSelected = r === selected.r && c === selected.c;

        let color = isFixed ? "#e0fbff" : "#ffb84d";
        if (isError) color = "#ff3e64";

        const fontSize = Math.floor(CELL * 0.55);
        ctx.font = `bold ${fontSize}px "Orbitron", "Press Start 2P", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.shadowBlur = isSelected ? 12 : 4;
        ctx.shadowColor = isError ? "rgba(255, 62, 100, 0.9)" :
          isFixed ? "rgba(34, 245, 255, 0.7)" : "rgba(255, 184, 77, 0.7)";
        ctx.fillText(String(n), c * CELL + CELL / 2, r * CELL + CELL / 2);
        ctx.shadowBlur = 0;
      }
    }
  }

  // ========== Game Logic ==========
  let puzzleBoard = [];

  function newGame(diff) {
    difficulty = diff || difficulty;
    const { puzzle, solution: sol } = generatePuzzle(difficulty);
    puzzleBoard = puzzle.map(row => [...row]);
    board = puzzle.map(row => [...row]);
    solution = sol;
    selected = { r: -1, c: -1 };
    mistakes = 0;
    elapsed = 0;
    running = true;
    finished = false;
    startTime = performance.now();
    updateInfo();
    draw();
    Audio.start();
  }

  function selectCell(r, c) {
    if (r < 0 || r > 8 || c < 0 || c > 8) return;
    selected = { r, c };
    Audio.select();
    draw();
  }

  function placeNumber(n) {
    if (!running || finished) return;
    if (selected.r < 0) return;
    const { r, c } = selected;
    if (puzzleBoard[r][c] !== 0) return; // fixed cell

    if (n === 0) {
      board[r][c] = 0;
      Audio.erase();
    } else {
      if (board[r][c] === n) {
        board[r][c] = 0;
        Audio.erase();
      } else {
        board[r][c] = n;
        if (n !== solution[r][c]) {
          mistakes++;
          Audio.error();
        } else {
          Audio.place();
        }
      }
    }

    updateInfo();
    draw();
    checkWin();
  }

  function checkWin() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 || board[r][c] !== solution[r][c]) return false;
      }
    }
    finished = true;
    running = false;
    elapsed = performance.now() - startTime;
    updateInfo();
    Audio.finish();
    saveBest();
    showResult();
    return true;
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

  function updateInfo() {
    const tEl = document.getElementById("sudoku-timer");
    if (tEl) tEl.textContent = formatTime(elapsed);
    const mEl = document.getElementById("sudoku-mistakes");
    if (mEl) mEl.textContent = mistakes;
    const dEl = document.getElementById("sudoku-difficulty");
    if (dEl) {
      const dMap = { easy: "简单", medium: "中等", hard: "困难" };
      dEl.textContent = dMap[difficulty] || "中等";
    }
  }

  function saveBest() {
    try {
      const key = `sudoku_best_${difficulty}`;
      const prev = parseInt(localStorage.getItem(key) || "999999999");
      if (elapsed < prev) {
        localStorage.setItem(key, String(elapsed));
      }
      updateBest();
    } catch (e) {}
  }

  function updateBest() {
    const el = document.getElementById("sudoku-best");
    if (!el) return;
    try {
      const key = `sudoku_best_${difficulty}`;
      const best = parseInt(localStorage.getItem(key) || "0");
      el.textContent = best > 0 ? formatTime(best) : "--:--.--";
    } catch (e) {
      el.textContent = "--:--.--";
    }
  }

  function showResult() {
    const titleEl = document.getElementById("sudoku-title");
    const subEl = document.getElementById("sudoku-subtitle");
    const btnEl = document.getElementById("sudoku-btn-start");
    const overlay = document.getElementById("sudoku-overlay");
    if (titleEl) titleEl.textContent = "✓ 完成！";
    if (subEl) subEl.textContent = `用时 ${formatTime(elapsed)} · 错误 ${mistakes} 次`;
    if (btnEl) btnEl.textContent = "↺ 再来一局";
    if (overlay) overlay.classList.remove("hidden");
  }

  function handleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (r >= 0 && r < 9 && c >= 0 && c < 9) {
      selectCell(r, c);
    }
  }

  function handleKey(e) {
    if (!running || finished) return;
    const { r, c } = selected;
    if (e.key >= "1" && e.key <= "9") {
      placeNumber(parseInt(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      placeNumber(0);
    } else if (e.key === "ArrowUp") {
      selectCell(Math.max(0, r - 1), c);
    } else if (e.key === "ArrowDown") {
      selectCell(Math.min(8, r + 1), c);
    } else if (e.key === "ArrowLeft") {
      selectCell(r, Math.max(0, c - 1));
    } else if (e.key === "ArrowRight") {
      selectCell(r, Math.min(8, c + 1));
    } else if (e.key.toLowerCase() === "m") {
      toggleMute();
    }
  }

  function toggleMute() {
    const m = Audio.toggleMute();
    const btn = document.getElementById("sudoku-mute-btn");
    if (btn) btn.textContent = m ? "🔇 音效:关" : "🔊 音效:开";
  }

  function updateTimer() {
    if (running && !finished) {
      elapsed = performance.now() - startTime;
      updateInfo();
    }
    requestAnimationFrame(updateTimer);
  }

  // ========== Init ==========
  function init() {
    canvas = document.getElementById("sudoku-board");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    canvas.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    const startBtn = document.getElementById("sudoku-btn-start");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        newGame(difficulty);
        const overlay = document.getElementById("sudoku-overlay");
        if (overlay) overlay.classList.add("hidden");
      });
    }

    const muteBtn = document.getElementById("sudoku-mute-btn");
    if (muteBtn) muteBtn.addEventListener("click", toggleMute);

    const diffBtns = document.querySelectorAll("[data-diff]");
    diffBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        diffBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        difficulty = btn.dataset.diff;
        updateBest();
      });
    });

    const restartBtn = document.getElementById("sudoku-restart-btn");
    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        newGame(difficulty);
        const overlay = document.getElementById("sudoku-overlay");
        if (overlay) overlay.classList.add("hidden");
      });
    }

    // Touch number pad - 使用事件委托
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".nbtn");
      if (btn && (btn.closest(".sudoku-numpad") || btn.closest(".sudoku-numpad-inner"))) {
        e.preventDefault();
        const n = parseInt(btn.dataset.num);
        placeNumber(n);
      }
    });

    // Initialize empty board for display
    board = Array.from({ length: 9 }, () => Array(9).fill(0));
    solution = Array.from({ length: 9 }, () => Array(9).fill(0));
    puzzleBoard = Array.from({ length: 9 }, () => Array(9).fill(0));
    updateBest();
    draw();
    updateTimer();
  }

  return { init, newGame, toggleMute, placeNumber };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (typeof SudokuGame !== "undefined") {
    SudokuGame.init();
  }
});
