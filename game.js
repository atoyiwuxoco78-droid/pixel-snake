/**
 * 像素贪吃蛇 · Pixel Snake
 * Classic grid snake + localStorage leaderboard
 */
(function () {
  "use strict";

  // ----- Config -----
  const COLS = 20;
  const ROWS = 20;
  const CELL = 28; // 20 * 28 = 560
  const TICK_MS = 110;
  const STORAGE_KEY = "pixel-snake-leaderboard-v1";
  const MAX_SCORES = 10;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

  // ----- DOM -----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("highScore");
  const lengthEl = document.getElementById("length");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const btnStart = document.getElementById("btnStart");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnClearScores = document.getElementById("btnClearScores");
  const leaderboardEl = document.getElementById("leaderboard");
  const scoreModal = document.getElementById("scoreModal");
  const finalScoreEl = document.getElementById("finalScore");
  const nicknameInput = document.getElementById("nickname");
  const btnSubmitScore = document.getElementById("btnSubmitScore");
  const btnSkipScore = document.getElementById("btnSkipScore");
  const dpad = document.getElementById("dpad");

  // ----- State -----
  let snake = [];
  let dir = "right";
  let nextDir = "right";
  let food = null;
  let score = 0;
  let highScore = 0;
  let running = false;
  let paused = false;
  let dead = false;
  let timer = null;
  let pendingScore = 0;

  // ----- Leaderboard -----
  function loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveScores(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SCORES)));
  }

  function addScore(nickname, pts) {
    const name = (nickname || "游客").trim().slice(0, 12) || "游客";
    const list = loadScores();
    list.push({
      nickname: name,
      score: pts,
      date: new Date().toISOString(),
    });
    list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
    saveScores(list);
    renderLeaderboard();
    updateHighScoreDisplay();
  }

  function clearScores() {
    if (!confirm("确定清空排行榜？此操作不可撤销。")) return;
    localStorage.removeItem(STORAGE_KEY);
    renderLeaderboard();
    updateHighScoreDisplay();
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    } catch {
      return "";
    }
  }

  function renderLeaderboard() {
    const list = loadScores();
    if (!list.length) {
      leaderboardEl.innerHTML =
        '<li class="empty">暂无成绩<br/>来一局吧！</li>';
      return;
    }
    leaderboardEl.innerHTML = list
      .map(function (entry, i) {
        return (
          "<li>" +
          '<span class="rank">#' +
          (i + 1) +
          "</span>" +
          '<span class="name">' +
          escapeHtml(entry.nickname) +
          "</span>" +
          '<span class="pts">' +
          entry.score +
          "</span>" +
          '<span class="date">' +
          formatDate(entry.date) +
          "</span>" +
          "</li>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateHighScoreDisplay() {
    const list = loadScores();
    highScore = list.length ? list[0].score : 0;
    if (score > highScore) highScore = score;
    highScoreEl.textContent = String(Math.max(highScore, score));
  }

  // ----- Game core -----
  function resetGame() {
    const midY = Math.floor(ROWS / 2);
    const midX = Math.floor(COLS / 2);
    snake = [
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
      { x: midX - 3, y: midY },
    ];
    dir = "right";
    nextDir = "right";
    score = 0;
    dead = false;
    paused = false;
    placeFood();
    updateHUD();
    draw();
  }

  function placeFood() {
    const occupied = new Set(snake.map(function (s) {
      return s.x + "," + s.y;
    }));
    let x, y, key;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      key = x + "," + y;
    } while (occupied.has(key));
    food = { x: x, y: y };
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    lengthEl.textContent = String(snake.length);
    highScoreEl.textContent = String(Math.max(highScore, score));
  }

  function showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function startGame() {
    if (running && !paused && !dead) return;
    if (dead || !snake.length) resetGame();
    running = true;
    paused = false;
    dead = false;
    hideOverlay();
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.textContent = "暂停";
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  function pauseGame() {
    if (!running || dead) return;
    paused = !paused;
    if (paused) {
      clearInterval(timer);
      timer = null;
      btnPause.textContent = "继续";
      showOverlay("已暂停", "按空格或「继续」恢复");
    } else {
      hideOverlay();
      btnPause.textContent = "暂停";
      timer = setInterval(tick, TICK_MS);
    }
  }

  function restartGame() {
    clearInterval(timer);
    timer = null;
    running = false;
    paused = false;
    resetGame();
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = "暂停";
    showOverlay("准备好了吗？", "按「开始游戏」或空格键");
    startGame();
  }

  function gameOver() {
    dead = true;
    running = false;
    paused = false;
    clearInterval(timer);
    timer = null;
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = "暂停";
    showOverlay("游戏结束", "得分 " + score + " · 可提交排行榜");
    pendingScore = score;
    finalScoreEl.textContent = String(score);
    nicknameInput.value = "游客";
    scoreModal.classList.remove("hidden");
    setTimeout(function () {
      nicknameInput.focus();
      nicknameInput.select();
    }, 50);
  }

  function tick() {
    if (!running || paused || dead) return;

    if (OPPOSITE[nextDir] !== dir) {
      dir = nextDir;
    }

    const head = snake[0];
    const d = DIRS[dir];
    const nx = head.x + d.x;
    const ny = head.y + d.y;

    // Wall collision
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      gameOver();
      draw();
      return;
    }

    // Self collision (ignore tail tip that will move away unless growing)
    const willGrow = food && nx === food.x && ny === food.y;
    for (let i = 0; i < snake.length - (willGrow ? 0 : 1); i++) {
      if (snake[i].x === nx && snake[i].y === ny) {
        gameOver();
        draw();
        return;
      }
    }

    snake.unshift({ x: nx, y: ny });

    if (willGrow) {
      score += 10;
      placeFood();
      updateHUD();
    } else {
      snake.pop();
      lengthEl.textContent = String(snake.length);
    }

    draw();
  }

  function setDirection(newDir) {
    if (!DIRS[newDir]) return;
    if (OPPOSITE[newDir] === dir && snake.length > 1) return;
    nextDir = newDir;
    if (!running && !dead) {
      startGame();
    } else if (dead) {
      // ignore until restart / modal closed
    } else if (paused) {
      pauseGame(); // resume
    }
  }

  // ----- Drawing -----
  function draw() {
    // Background
    ctx.fillStyle = "#060a12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = "#121a28";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
      ctx.stroke();
    }

    // Food — glowing pixel apple
    if (food) {
      const fx = food.x * CELL;
      const fy = food.y * CELL;
      const pad = 3;
      ctx.fillStyle = "#ff2bd6";
      ctx.shadowColor = "#ff2bd6";
      ctx.shadowBlur = 12;
      ctx.fillRect(fx + pad, fy + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;
      // highlight
      ctx.fillStyle = "#ff9ae8";
      ctx.fillRect(fx + pad + 4, fy + pad + 3, 6, 6);
      // stem
      ctx.fillStyle = "#39ff14";
      ctx.fillRect(fx + CELL / 2 - 2, fy + 2, 4, 5);
    }

    // Snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const sx = seg.x * CELL;
      const sy = seg.y * CELL;
      const pad = 2;
      const isHead = i === 0;
      const t = i / Math.max(snake.length - 1, 1);

      if (isHead) {
        ctx.fillStyle = "#00f0ff";
        ctx.shadowColor = "#00f0ff";
        ctx.shadowBlur = 10;
      } else {
        // Gradient cyan → teal along body
        const g = Math.floor(40 + (1 - t) * 180);
        ctx.fillStyle = "rgb(0," + g + "," + Math.min(255, g + 40) + ")";
        ctx.shadowBlur = 0;
      }

      ctx.fillRect(sx + pad, sy + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;

      // Inner pixel detail
      if (isHead) {
        ctx.fillStyle = "#a8ffff";
        ctx.fillRect(sx + pad + 3, sy + pad + 3, 6, 6);
        // Eyes based on direction
        ctx.fillStyle = "#0a0e17";
        const eyeOff = {
          right: [
            [CELL - 10, 8],
            [CELL - 10, CELL - 14],
          ],
          left: [
            [6, 8],
            [6, CELL - 14],
          ],
          up: [
            [8, 6],
            [CELL - 14, 6],
          ],
          down: [
            [8, CELL - 10],
            [CELL - 14, CELL - 10],
          ],
        };
        const eyes = eyeOff[dir] || eyeOff.right;
        eyes.forEach(function (e) {
          ctx.fillRect(sx + e[0], sy + e[1], 5, 5);
        });
      } else {
        ctx.fillStyle = "rgba(168, 255, 255, 0.25)";
        ctx.fillRect(sx + pad + 4, sy + pad + 4, 5, 5);
      }
    }
  }

  // ----- Input -----
  const KEY_MAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right",
  };

  document.addEventListener("keydown", function (e) {
    // Don't steal keys while typing nickname
    if (document.activeElement === nicknameInput) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitScore();
      }
      return;
    }

    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (!scoreModal.classList.contains("hidden")) return;
      if (!running && !dead) startGame();
      else if (dead) restartGame();
      else pauseGame();
      return;
    }

    const mapped = KEY_MAP[e.key];
    if (mapped) {
      e.preventDefault();
      if (!scoreModal.classList.contains("hidden")) return;
      setDirection(mapped);
    }
  });

  // D-pad
  function bindDpad(el) {
    const dirAttr = el.getAttribute("data-dir");
    if (!dirAttr) return;

    function fire(ev) {
      ev.preventDefault();
      el.classList.add("active");
      setDirection(dirAttr);
    }
    function release() {
      el.classList.remove("active");
    }

    el.addEventListener("pointerdown", fire);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointercancel", release);
  }

  dpad.querySelectorAll(".dpad-btn[data-dir]").forEach(bindDpad);

  // Buttons
  btnStart.addEventListener("click", function () {
    if (!scoreModal.classList.contains("hidden")) return;
    startGame();
  });
  btnPause.addEventListener("click", pauseGame);
  btnRestart.addEventListener("click", function () {
    if (!scoreModal.classList.contains("hidden")) {
      scoreModal.classList.add("hidden");
    }
    restartGame();
  });
  btnClearScores.addEventListener("click", clearScores);

  function submitScore() {
    addScore(nicknameInput.value, pendingScore);
    scoreModal.classList.add("hidden");
    showOverlay("成绩已保存", "按「重新开始」或空格再来一局");
  }

  function skipScore() {
    scoreModal.classList.add("hidden");
    updateHighScoreDisplay();
    showOverlay("游戏结束", "按「重新开始」或空格再来一局");
  }

  btnSubmitScore.addEventListener("click", submitScore);
  btnSkipScore.addEventListener("click", skipScore);

  // Close modal on backdrop click — keep focused on actions only
  scoreModal.addEventListener("click", function (e) {
    if (e.target === scoreModal) {
      skipScore();
    }
  });

  // ----- Init -----
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  renderLeaderboard();
  updateHighScoreDisplay();
  resetGame();
  showOverlay("准备好了吗？", "按「开始游戏」或空格键");
})();
