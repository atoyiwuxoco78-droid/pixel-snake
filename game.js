/**
 * 像素贪吃蛇 · Pixel Snake
 * Levels, speed ramp, power-ups, obstacles + local/cloud leaderboard
 */
(function () {
  "use strict";

  // ----- Config -----
  const COLS = 20;
  const ROWS = 20;
  const CELL = 28; // 20 * 28 = 560
  const SCORE_PER_LEVEL = 50;
  const POWERUP_CHANCE = 0.32; // after eating food
  const POWERUP_DURATION_MS = 5500;
  const STORAGE_KEY = "pixel-snake-leaderboard-v1";
  const DIFFICULTY_KEY = "pixel-snake-difficulty-v1";
  const MAX_SCORES = 10;
  const MIN_SNAKE_LEN = 3;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

  // Single-player difficulty presets (multiplayer uses fixed medium tick — see multiplayer.js)
  const DIFFICULTY = {
    easy: {
      id: "easy",
      label: "简单",
      baseTickMs: 175,
      minTickMs: 78,
      foodsPerSpeed: 5,
      speedStepMs: 7,
      obstacleStartLevel: 3,
      obstacleBase: 2,
      obstaclePerLevel: 1,
      obstacleCap: 12,
    },
    normal: {
      id: "normal",
      label: "普通",
      baseTickMs: 145,
      minTickMs: 58,
      foodsPerSpeed: 4,
      speedStepMs: 9,
      obstacleStartLevel: 2,
      obstacleBase: 3,
      obstaclePerLevel: 2,
      obstacleCap: 18,
    },
    hell: {
      id: "hell",
      label: "地狱",
      baseTickMs: 110,
      minTickMs: 42,
      foodsPerSpeed: 3,
      speedStepMs: 11,
      obstacleStartLevel: 1,
      obstacleBase: 4,
      obstaclePerLevel: 3,
      obstacleCap: 22,
    },
  };

  const POWER_TYPES = {
    slow: {
      id: "slow",
      label: "减速",
      color: "#4d7cff",
      highlight: "#a8c0ff",
      toastClass: "toast-slow",
      timed: true,
    },
    phase: {
      id: "phase",
      label: "穿墙",
      color: "#b388ff",
      highlight: "#e0d0ff",
      toastClass: "toast-phase",
      timed: true,
    },
    shrink: {
      id: "shrink",
      label: "缩短",
      color: "#39ff14",
      highlight: "#b8ff9a",
      toastClass: "toast-shrink",
      timed: false,
      instant: true,
    },
    double: {
      id: "double",
      label: "双倍分",
      color: "#ffe566",
      highlight: "#fff3a8",
      toastClass: "toast-double",
      timed: false,
      foods: 2,
    },
    shield: {
      id: "shield",
      label: "护盾",
      color: "#ff9f43",
      highlight: "#ffd0a0",
      toastClass: "toast-shield",
      timed: true,
    },
  };

  // ----- DOM -----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const highScoreEl = document.getElementById("highScore");
  const lengthEl = document.getElementById("length");
  const powerStatusEl = document.getElementById("powerStatus");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const toastEl = document.getElementById("toast");
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
  const difficultyTabs = document.getElementById("difficultyTabs");

  // ----- State -----
  let difficultyId = "normal";
  let diff = DIFFICULTY.normal;
  let snake = [];
  let dir = "right";
  let nextDir = "right";
  let foods = []; // always try to keep 2 apples on the board
  let powerUp = null; // { x, y, type }
  let obstacles = []; // [{ x, y }, ...]
  let score = 0;
  let level = 1;
  let foodsEaten = 0;
  let highScore = 0;
  let running = false;
  let paused = false;
  let dead = false;
  let timer = null;
  let tickMs = DIFFICULTY.normal.baseTickMs;
  let pendingScore = 0;
  let activePower = null; // { type, endsAt } timed powers
  let doubleFoodsLeft = 0; // 双倍分: next N foods
  let shieldCharges = 0; // 护盾: absorb one hit while timed/charged
  let toastTimer = null;
  let powerHudTimer = null;
  let mpMode = false; // when true, single-player yields canvas/input to multiplayer


  // ----- Difficulty -----
  function loadDifficulty() {
    try {
      const raw = localStorage.getItem(DIFFICULTY_KEY);
      if (raw && DIFFICULTY[raw]) return raw;
    } catch (_) {}
    return "normal";
  }

  function syncDifficultyTabs() {
    if (!difficultyTabs) return;
    const buttons = difficultyTabs.querySelectorAll(".diff-tab[data-diff]");
    buttons.forEach(function (btn) {
      const on = btn.getAttribute("data-diff") === difficultyId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
    const card = document.getElementById("difficultyCard");
    const cur = document.getElementById("difficultyCurrent");
    const label = (DIFFICULTY[difficultyId] && DIFFICULTY[difficultyId].label) || "普通";
    if (card) card.setAttribute("data-diff", difficultyId);
    if (cur) cur.textContent = "当前：" + label;
  }

  function applyDifficulty(id, opts) {
    const next = DIFFICULTY[id] ? id : "normal";
    difficultyId = next;
    diff = DIFFICULTY[next];
    try {
      localStorage.setItem(DIFFICULTY_KEY, next);
    } catch (_) {}
    syncDifficultyTabs();
    // Mid-run: retune timer; obstacles rebuild on next level sync / restart
    if (opts && opts.restartTimer) restartTimer();
  }

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
    if (!confirm("确定清空本地排行榜？此操作不可撤销。")) return;
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

  // ----- Speed / level -----
  function levelFromScore(pts) {
    return 1 + Math.floor(pts / SCORE_PER_LEVEL);
  }

  function baseTickForLevel(lv, foods) {
    const speedSteps = Math.floor(foods / diff.foodsPerSpeed) + (lv - 1);
    const ms = diff.baseTickMs - speedSteps * diff.speedStepMs;
    return Math.max(diff.minTickMs, ms);
  }

  function currentTickMs() {
    let ms = baseTickForLevel(level, foodsEaten);
    if (activePower && activePower.type === "slow") {
      ms = Math.min(diff.baseTickMs + 40, Math.floor(ms * 1.65));
    }
    return ms;
  }

  function restartTimer() {
    if (!running || paused || dead) return;
    clearInterval(timer);
    tickMs = currentTickMs();
    timer = setInterval(tick, tickMs);
  }

  function showToast(text, extraClass) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.className = "toast" + (extraClass ? " " + extraClass : "");
    // retrigger animation
    void toastEl.offsetWidth;
    toastTimer = setTimeout(function () {
      toastEl.classList.add("hidden");
    }, 1100);
  }

  function updatePowerHud() {
    const parts = [];
    if (activePower) {
      const left = Math.max(0, Math.ceil((activePower.endsAt - Date.now()) / 1000));
      const meta = POWER_TYPES[activePower.type];
      parts.push((meta ? meta.label : "") + " " + left + "s");
    }
    if (doubleFoodsLeft > 0) {
      parts.push("双倍分×" + doubleFoodsLeft);
    }
    if (shieldCharges > 0 && !(activePower && activePower.type === "shield")) {
      parts.push("护盾");
    }
    powerStatusEl.textContent = parts.join(" · ");
  }

  function clearActivePower() {
    if (activePower && activePower.type === "shield") {
      // timed shield expired without use
      shieldCharges = 0;
    }
    activePower = null;
    updatePowerHud();
    if (powerHudTimer) {
      clearInterval(powerHudTimer);
      powerHudTimer = null;
    }
    restartTimer();
  }

  function startPowerHudTicker() {
    if (powerHudTimer) clearInterval(powerHudTimer);
    powerHudTimer = setInterval(function () {
      if (activePower && Date.now() >= activePower.endsAt) {
        clearActivePower();
      } else {
        updatePowerHud();
      }
      if (!activePower && doubleFoodsLeft <= 0 && shieldCharges <= 0) {
        clearInterval(powerHudTimer);
        powerHudTimer = null;
      }
    }, 200);
  }

  function shrinkSnake(n) {
    const drop = Math.min(n, Math.max(0, snake.length - MIN_SNAKE_LEN));
    for (let i = 0; i < drop; i++) snake.pop();
    lengthEl.textContent = String(snake.length);
  }

  function activatePower(type) {
    const meta = POWER_TYPES[type];
    if (!meta) return;

    if (type === "shrink") {
      const n = 2 + Math.floor(Math.random() * 2); // 2 or 3
      shrinkSnake(n);
      showToast(meta.label + " -" + n + "!", meta.toastClass);
      updatePowerHud();
      return;
    }

    if (type === "double") {
      doubleFoodsLeft = meta.foods || 2;
      showToast(meta.label + "!", meta.toastClass);
      updatePowerHud();
      startPowerHudTicker();
      return;
    }

    // Timed: slow / phase / shield (replaces previous timed power)
    if (activePower && activePower.type === "shield" && type !== "shield") {
      shieldCharges = 0;
    }
    activePower = { type: type, endsAt: Date.now() + POWERUP_DURATION_MS };
    if (type === "shield") {
      shieldCharges = 1;
    }
    showToast(meta.label + "!", meta.toastClass);
    updatePowerHud();
    startPowerHudTicker();
    restartTimer();
  }

  function isPhasing() {
    return !!(activePower && activePower.type === "phase" && Date.now() < activePower.endsAt);
  }

  function hasShield() {
    if (shieldCharges <= 0) return false;
    if (activePower && activePower.type === "shield") {
      return Date.now() < activePower.endsAt;
    }
    return shieldCharges > 0;
  }

  function consumeShield() {
    shieldCharges = 0;
    if (activePower && activePower.type === "shield") {
      activePower = null;
      restartTimer();
    }
    showToast("护盾抵挡!", "toast-shield");
    updatePowerHud();
  }

  // ----- Occupancy helpers -----
  function occupiedSet(extra) {
    const set = new Set();
    snake.forEach(function (s) {
      set.add(s.x + "," + s.y);
    });
    obstacles.forEach(function (o) {
      set.add(o.x + "," + o.y);
    });
    foods.forEach(function (f) {
      set.add(f.x + "," + f.y);
    });
    if (powerUp) set.add(powerUp.x + "," + powerUp.y);
    if (extra) {
      extra.forEach(function (p) {
        set.add(p.x + "," + p.y);
      });
    }
    return set;
  }

  function freeOrthoNeighbors(x, y, occupied) {
    let n = 0;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];
    for (let i = 0; i < dirs.length; i++) {
      const nx = x + dirs[i][0];
      const ny = y + dirs[i][1];
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      if (!occupied.has(nx + "," + ny)) n++;
    }
    return n;
  }

  function isNearHeadCone(x, y, avoidDist) {
    const head = snake[0];
    if (!head) return false;
    const d = DIRS[dir] || DIRS.right;
    const maxD = avoidDist == null ? 2 : avoidDist;
    for (let dist = 1; dist <= maxD; dist++) {
      if (head.x + d.x * dist === x && head.y + d.y * dist === y) return true;
    }
    return false;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function filterPrefer(pool, pred) {
    const ok = [];
    for (let i = 0; i < pool.length; i++) {
      if (pred(pool[i])) ok.push(pool[i]);
    }
    return ok.length ? ok : pool;
  }

  /**
   * Smart empty-cell picker (food / power-ups / obstacles).
   * Prefer open neighbors, avoid head cone, keep distance from other foods.
   * Falls back to any free cell when filters empty.
   */
  function randomEmptyCell(extraOccupied, opts) {
    opts = opts || {};
    const occupied = occupiedSet(extraOccupied);
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const key = x + "," + y;
        if (!occupied.has(key)) free.push({ x: x, y: y });
      }
    }
    if (!free.length) return null;

    let pool = free;
    // Prefer cells with at least 2 free orthogonal neighbors (avoid dead ends)
    pool = filterPrefer(pool, function (c) {
      return freeOrthoNeighbors(c.x, c.y, occupied) >= 2;
    });

    if (opts.avoidHeadCone !== false && snake.length) {
      const avoidDist = opts.headAvoidDist == null ? 2 : opts.headAvoidDist;
      pool = filterPrefer(pool, function (c) {
        return !isNearHeadCone(c.x, c.y, avoidDist);
      });
    }

    const others = opts.otherFoods || [];
    if (others.length) {
      const minDist = opts.minFoodDist == null ? 2 : opts.minFoodDist;
      pool = filterPrefer(pool, function (c) {
        for (let i = 0; i < others.length; i++) {
          if (manhattan(c, others[i]) < minDist) return false;
        }
        return true;
      });
    }

    // Among remaining, prefer the most open cells
    let bestN = -1;
    for (let i = 0; i < pool.length; i++) {
      const n = freeOrthoNeighbors(pool[i].x, pool[i].y, occupied);
      if (n > bestN) bestN = n;
    }
    if (bestN >= 0) {
      const top = [];
      for (let i = 0; i < pool.length; i++) {
        if (freeOrthoNeighbors(pool[i].x, pool[i].y, occupied) >= bestN) {
          top.push(pool[i]);
        }
      }
      if (top.length) pool = top;
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  function obstacleCountForLevel(lv) {
    if (lv < diff.obstacleStartLevel) return 0;
    return Math.min(
      diff.obstacleCap,
      diff.obstacleBase + (lv - diff.obstacleStartLevel) * diff.obstaclePerLevel
    );
  }

  function rebuildObstacles(targetCount) {
    obstacles = [];
    // Keep center start corridor clear
    const midY = Math.floor(ROWS / 2);
    const midX = Math.floor(COLS / 2);
    const reserved = [];
    for (let dx = -4; dx <= 2; dx++) {
      reserved.push({ x: midX + dx, y: midY });
    }
    for (let i = 0; i < targetCount; i++) {
      const cell = randomEmptyCell(reserved, { avoidHeadCone: false, otherFoods: [] });
      if (!cell) break;
      obstacles.push(cell);
    }
  }

  function syncLevelAndObstacles(showFeedback) {
    const newLevel = levelFromScore(score);
    if (newLevel === level) return;
    const leveledUp = newLevel > level;
    level = newLevel;
    rebuildObstacles(obstacleCountForLevel(level));
    // Drop / replace items if now blocked by new obstacles
    if (powerUp) {
      const blocked = obstacles.some(function (o) {
        return o.x === powerUp.x && o.y === powerUp.y;
      });
      if (blocked) powerUp = null;
    }
    foods = foods.filter(function (f) {
      return !obstacles.some(function (o) {
        return o.x === f.x && o.y === f.y;
      });
    });
    ensureTwoFoods();
    if (leveledUp && showFeedback) {
      showToast("关卡 " + level + "!", "toast-level");
    }
    updateHUD();
    restartTimer();
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
    level = 1;
    foodsEaten = 0;
    tickMs = diff.baseTickMs;
    obstacles = [];
    foods = [];
    powerUp = null;
    doubleFoodsLeft = 0;
    shieldCharges = 0;
    clearActivePower();
    // Hell starts with obstacles at level 1
    if (diff.obstacleStartLevel <= 1) {
      rebuildObstacles(obstacleCountForLevel(1));
    }
    dead = false;
    paused = false;
    placeFoods();
    updateHUD();
    draw();
  }

  function ensureTwoFoods() {
    while (foods.length < 2) {
      const cell = randomEmptyCell(null, {
        otherFoods: foods.slice(),
        avoidHeadCone: true,
        headAvoidDist: 2,
        minFoodDist: 2,
      });
      if (!cell) {
        const any = randomEmptyCell(null, { avoidHeadCone: false, otherFoods: [] });
        if (!any) break;
        foods.push(any);
      } else {
        foods.push(cell);
      }
    }
  }

  function placeFoods() {
    foods = [];
    ensureTwoFoods();
    if (!foods.length) foods = [{ x: 1, y: 1 }, { x: COLS - 2, y: ROWS - 2 }];
  }

  function replaceEatenFood(eaten) {
    foods = foods.filter(function (f) {
      return !(f.x === eaten.x && f.y === eaten.y);
    });
    ensureTwoFoods();
  }

  function foodAt(x, y) {
    for (let i = 0; i < foods.length; i++) {
      if (foods[i].x === x && foods[i].y === y) return foods[i];
    }
    return null;
  }

  function maybeSpawnPowerUp() {
    if (powerUp) return;
    if (Math.random() > POWERUP_CHANCE) return;
    const cell = randomEmptyCell(null, {
      otherFoods: foods.slice(),
      avoidHeadCone: true,
      headAvoidDist: 2,
      minFoodDist: 2,
    });
    if (!cell) return;
    const keys = Object.keys(POWER_TYPES);
    const type = keys[Math.floor(Math.random() * keys.length)];
    powerUp = { x: cell.x, y: cell.y, type: type };
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
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
    if (mpMode) return;
    if (running && !paused && !dead) return;
    if (dead || !snake.length) resetGame();
    running = true;
    paused = false;
    dead = false;
    hideOverlay();
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.textContent = "暂停";
    restartTimer();
  }

  function pauseGame() {
    if (mpMode) return;
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
      restartTimer();
    }
  }

  function restartGame() {
    if (mpMode) return;
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

  function fb() {
    return window.PixelSnakeFirebase || null;
  }

  function preferNickname() {
    const api = fb();
    if (api && api.isLoggedIn && api.isLoggedIn()) {
      return (api.getDisplayName() || "玩家").slice(0, 12);
    }
    return "游客";
  }

  function syncCloudScore(pts) {
    const api = fb();
    if (!api || !api.isLoggedIn || !api.isLoggedIn() || !api.saveBestScore) {
      return Promise.resolve({ saved: false, reason: "not-logged-in" });
    }
    return Promise.resolve(api.saveBestScore(pts)).catch(function (err) {
      return {
        saved: false,
        reason: "error",
        message: (err && (err.message || err.code)) || "未知错误",
      };
    });
  }

  function setModalHidden(el, hide) {
    if (!el) return;
    if (hide) {
      el.setAttribute("hidden", "");
      el.classList.add("hidden");
    } else {
      el.removeAttribute("hidden");
      el.classList.remove("hidden");
    }
  }

  function gameOver() {
    dead = true;
    running = false;
    paused = false;
    clearInterval(timer);
    timer = null;
    if (powerHudTimer) {
      clearInterval(powerHudTimer);
      powerHudTimer = null;
    }
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = "暂停";
    pendingScore = score;
    finalScoreEl.textContent = String(score);
    nicknameInput.value = preferNickname();

    var loggedIn = !!(fb() && fb().isLoggedIn && fb().isLoggedIn());
    var cloudHint = document.getElementById("cloudSaveHint");
    if (cloudHint) setModalHidden(cloudHint, true);

    // Logged-in: auto-save local + cloud with displayName; skip nickname modal
    if (loggedIn) {
      setModalHidden(scoreModal, true);
      var name = preferNickname();
      addScore(name, pendingScore);
      showOverlay("游戏结束", "得分 " + score + " · 正在同步云端…");
      syncCloudScore(pendingScore).then(function (res) {
        if (res && res.saved) {
          showOverlay("成绩已保存", "本地 + 云端已更新 · 「重新开始」再来一局");
          showToast("云端上传成功", "toast-ok");
        } else if (res && res.reason === "lower") {
          showOverlay(
            "成绩已保存",
            "本地已更新 · 未超过云端最高分 · 「重新开始」再来一局"
          );
        } else if (res && res.reason === "error") {
          var why = (res.message || res.code || "未知错误").toString().slice(0, 40);
          showOverlay("云端上传失败", why + " · 本地成绩已保存");
          showToast("云端上传失败", "toast-error");
        } else {
          showOverlay("成绩已保存", "本地已更新 · 「重新开始」再来一局");
        }
      });
      return;
    }

    // Guests: nickname modal only
    showOverlay("游戏结束", "得分 " + score + " · 关卡 " + level);
    setModalHidden(scoreModal, false);
    setTimeout(function () {
      nicknameInput.focus();
      nicknameInput.select();
    }, 50);
  }

  function onFoodEaten(eatenCell) {
    const prevTick = currentTickMs();
    const prevLevel = level;
    const prevFoods = foodsEaten;
    foodsEaten += 1;
    let pts = 10;
    if (doubleFoodsLeft > 0) {
      pts = 20;
      doubleFoodsLeft -= 1;
      showToast("+20 双倍!", "toast-double");
      updatePowerHud();
    }
    score += pts;
    if (eatenCell) replaceEatenFood(eatenCell);
    else ensureTwoFoods();
    maybeSpawnPowerUp();
    syncLevelAndObstacles(true);

    // Speed-up toast when foods hit a step (skip if level toast already shown)
    const crossedSpeedStep =
      Math.floor(foodsEaten / diff.foodsPerSpeed) >
      Math.floor(prevFoods / diff.foodsPerSpeed);
    if (crossedSpeedStep && level === prevLevel) {
      showToast("加速!", "");
    }

    updateHUD();
    if (currentTickMs() !== prevTick) restartTimer();
  }

  function tick() {
    if (!running || paused || dead) return;

    // Expire power mid-tick
    if (activePower && Date.now() >= activePower.endsAt) {
      clearActivePower();
    }

    if (OPPOSITE[nextDir] !== dir) {
      dir = nextDir;
    }

    const head = snake[0];
    const d = DIRS[dir];
    let nx = head.x + d.x;
    let ny = head.y + d.y;
    const phasing = isPhasing();

    // Wall collision / wrap when phasing / absorb with shield
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      if (phasing) {
        nx = ((nx % COLS) + COLS) % COLS;
        ny = ((ny % ROWS) + ROWS) % ROWS;
      } else if (hasShield()) {
        consumeShield();
        draw();
        return; // skip this move
      } else {
        gameOver();
        draw();
        return;
      }
    }

    // Obstacle collision
    if (!phasing) {
      let hitObs = false;
      for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].x === nx && obstacles[i].y === ny) {
          hitObs = true;
          break;
        }
      }
      if (hitObs) {
        if (hasShield()) {
          consumeShield();
          draw();
          return;
        }
        gameOver();
        draw();
        return;
      }
    }

    // Self collision (ignore tail tip that will move away unless growing)
    const eaten = foodAt(nx, ny);
    const willGrow = !!eaten;
    for (let i = 0; i < snake.length - (willGrow ? 0 : 1); i++) {
      if (snake[i].x === nx && snake[i].y === ny) {
        // Shield can absorb one self-hit; phase does not
        if (hasShield()) {
          consumeShield();
          draw();
          return;
        }
        gameOver();
        draw();
        return;
      }
    }

    snake.unshift({ x: nx, y: ny });

    // Power-up pickup
    if (powerUp && nx === powerUp.x && ny === powerUp.y) {
      const type = powerUp.type;
      powerUp = null;
      activatePower(type);
    }

    if (willGrow) {
      onFoodEaten(eaten);
    } else {
      snake.pop();
      lengthEl.textContent = String(snake.length);
    }

    draw();
  }

  function setDirection(newDir) {
    if (mpMode) return;
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
  function drawCell(x, y, fill, glow, pad) {
    const px = x * CELL;
    const py = y * CELL;
    const p = pad == null ? 2 : pad;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(px + p, py + p, CELL - p * 2, CELL - p * 2);
    ctx.shadowBlur = 0;
  }

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

    // Obstacles — brick neon blocks
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const ox = o.x * CELL;
      const oy = o.y * CELL;
      const pad = 2;
      ctx.fillStyle = "#3a2030";
      ctx.shadowColor = "#ff4466";
      ctx.shadowBlur = 6;
      ctx.fillRect(ox + pad, oy + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff4466";
      ctx.fillRect(ox + pad + 2, oy + pad + 2, CELL - pad * 2 - 4, 3);
      ctx.fillRect(ox + pad + 2, oy + CELL / 2 - 1, CELL - pad * 2 - 4, 3);
      ctx.fillRect(ox + pad + 2, oy + CELL - pad - 5, CELL - pad * 2 - 4, 3);
      ctx.fillStyle = "rgba(255, 150, 170, 0.35)";
      ctx.fillRect(ox + pad + 4, oy + pad + 6, 5, 5);
    }

    // Power-up
    if (powerUp) {
      const meta = POWER_TYPES[powerUp.type] || POWER_TYPES.slow;
      const px = powerUp.x * CELL;
      const py = powerUp.y * CELL;
      const pad = 4;
      const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 180);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = meta.color;
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 14;
      ctx.fillRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = meta.highlight;
      ctx.fillRect(px + pad + 3, py + pad + 3, 6, 6);
      ctx.globalAlpha = 1;
      // tiny mark
      ctx.fillStyle = "#0a0e17";
      if (powerUp.type === "slow") {
        ctx.fillRect(px + 10, py + 10, 8, 3);
        ctx.fillRect(px + 10, py + 15, 8, 3);
      } else if (powerUp.type === "phase") {
        ctx.fillRect(px + 12, py + 9, 4, 10);
        ctx.fillRect(px + 9, py + 12, 10, 4);
      } else if (powerUp.type === "shrink") {
        ctx.fillRect(px + 9, py + 13, 10, 3);
      } else if (powerUp.type === "double") {
        ctx.fillRect(px + 9, py + 9, 3, 10);
        ctx.fillRect(px + 14, py + 9, 3, 10);
      } else if (powerUp.type === "shield") {
        ctx.fillRect(px + 10, py + 8, 8, 3);
        ctx.fillRect(px + 10, py + 8, 3, 12);
        ctx.fillRect(px + 15, py + 8, 3, 12);
        ctx.fillRect(px + 10, py + 17, 8, 3);
      }
    }

    // Foods — glowing pixel apples (×2)
    for (let fi = 0; fi < foods.length; fi++) {
      const food = foods[fi];
      const fx = food.x * CELL;
      const fy = food.y * CELL;
      const pad = 3;
      ctx.fillStyle = "#ff2bd6";
      ctx.shadowColor = "#ff2bd6";
      ctx.shadowBlur = 12;
      ctx.fillRect(fx + pad, fy + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff9ae8";
      ctx.fillRect(fx + pad + 4, fy + pad + 3, 6, 6);
      ctx.fillStyle = "#39ff14";
      ctx.fillRect(fx + CELL / 2 - 2, fy + 2, 4, 5);
    }

    // Snake
    const phasing = isPhasing();
    for (let i = snake.length - 1; i >= 0; i--) {
      const seg = snake[i];
      const sx = seg.x * CELL;
      const sy = seg.y * CELL;
      const pad = 2;
      const isHead = i === 0;
      const t = i / Math.max(snake.length - 1, 1);

      const shielded = hasShield();
      if (isHead) {
        ctx.fillStyle = phasing ? "#b388ff" : shielded ? "#ff9f43" : "#00f0ff";
        ctx.shadowColor = phasing ? "#b388ff" : shielded ? "#ff9f43" : "#00f0ff";
        ctx.shadowBlur = 10;
      } else {
        if (phasing) {
          const g = Math.floor(120 + (1 - t) * 100);
          ctx.fillStyle = "rgb(" + g + "," + Math.floor(g * 0.7) + ",255)";
        } else if (activePower && activePower.type === "slow") {
          const g = Math.floor(60 + (1 - t) * 140);
          ctx.fillStyle = "rgb(40," + Math.floor(g * 0.6) + "," + Math.min(255, g + 80) + ")";
        } else if (shielded) {
          const g = Math.floor(80 + (1 - t) * 140);
          ctx.fillStyle = "rgb(" + Math.min(255, g + 60) + "," + Math.floor(g * 0.55) + ",40)";
        } else if (doubleFoodsLeft > 0) {
          const g = Math.floor(80 + (1 - t) * 140);
          ctx.fillStyle = "rgb(" + Math.min(255, g + 40) + "," + g + ",40)";
        } else {
          const g = Math.floor(40 + (1 - t) * 180);
          ctx.fillStyle = "rgb(0," + g + "," + Math.min(255, g + 40) + ")";
        }
        ctx.shadowBlur = 0;
      }

      ctx.fillRect(sx + pad, sy + pad, CELL - pad * 2, CELL - pad * 2);
      ctx.shadowBlur = 0;

      if (isHead) {
        ctx.fillStyle = phasing ? "#efe6ff" : "#a8ffff";
        ctx.fillRect(sx + pad + 3, sy + pad + 3, 6, 6);
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

  // Soft repaint for power-up pulse while running
  setInterval(function () {
    if (mpMode) return;
    if (running && !paused && !dead && powerUp) draw();
  }, 120);

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
    if (mpMode) return;
    var authModal = document.getElementById("authModal");
    var authOpen = authModal && !authModal.classList.contains("hidden");
    var ae = document.activeElement;
    if (ae === nicknameInput) {
      if (e.key === "Enter") {
        e.preventDefault();
        submitScore();
      }
      return;
    }
    if (authOpen || (ae && (ae.id === "authEmail" || ae.id === "authPassword"))) {
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

  function bindDpad(el) {
    const dirAttr = el.getAttribute("data-dir");
    if (!dirAttr) return;

    function fire(ev) {
      if (mpMode) return;
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

  btnStart.addEventListener("click", function () {
    if (mpMode) return;
    if (!scoreModal.classList.contains("hidden")) return;
    startGame();
  });
  btnPause.addEventListener("click", pauseGame);
  btnRestart.addEventListener("click", function () {
    setModalHidden(scoreModal, true);
    restartGame();
  });
  btnClearScores.addEventListener("click", clearScores);

  function submitScore() {
    addScore(nicknameInput.value, pendingScore);
    setModalHidden(scoreModal, true);
    showOverlay("成绩已保存", "按「重新开始」或空格再来一局");
  }

  function skipScore() {
    setModalHidden(scoreModal, true);
    updateHighScoreDisplay();
    showOverlay("游戏结束", "按「重新开始」或空格再来一局");
  }

  btnSubmitScore.addEventListener("click", submitScore);
  btnSkipScore.addEventListener("click", skipScore);

  scoreModal.addEventListener("click", function (e) {
    if (e.target === scoreModal) {
      skipScore();
    }
  });

  // ----- Init -----
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  applyDifficulty(loadDifficulty());
  if (difficultyTabs) {
    difficultyTabs.addEventListener("click", function (e) {
      const btn = e.target.closest(".diff-tab[data-diff]");
      if (!btn || !difficultyTabs.contains(btn)) return;
      const next = btn.getAttribute("data-diff");
      if (!DIFFICULTY[next] || next === difficultyId) {
        syncDifficultyTabs();
        return;
      }
      const wasRunning = running && !paused && !dead;
      applyDifficulty(next, { restartTimer: wasRunning });
      if (!running || dead) {
        // Preview obstacle density on idle board for hell/easy
        resetGame();
        showOverlay("准备好了吗？", "难度：" + diff.label + " · 按「开始游戏」或空格键");
      } else {
        showToast("难度：" + diff.label, "");
      }
    });
    difficultyTabs.addEventListener("keydown", function (e) {
      const order = ["easy", "normal", "hell"];
      const idx = order.indexOf(difficultyId);
      if (idx < 0) return;
      let nextIdx = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % order.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + order.length) % order.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = order.length - 1;
      else return;
      e.preventDefault();
      const next = order[nextIdx];
      const wasRunning = running && !paused && !dead;
      applyDifficulty(next, { restartTimer: wasRunning });
      const focusBtn = difficultyTabs.querySelector('.diff-tab[data-diff="' + next + '"]');
      if (focusBtn) focusBtn.focus();
      if (!running || dead) {
        resetGame();
        showOverlay("准备好了吗？", "难度：" + diff.label + " · 按「开始游戏」或空格键");
      } else {
        showToast("难度：" + diff.label, "");
      }
    });
  }
  renderLeaderboard();
  updateHighScoreDisplay();
  resetGame();
  showOverlay("准备好了吗？", "按「开始游戏」或空格键");

  function enterMultiplayer() {
    mpMode = true;
    clearInterval(timer);
    timer = null;
    running = false;
    paused = false;
    if (powerHudTimer) {
      clearInterval(powerHudTimer);
      powerHudTimer = null;
    }
    btnStart.disabled = true;
    btnPause.disabled = true;
    btnPause.textContent = "暂停";
    setModalHidden(scoreModal, true);
    showOverlay("双人对战", "创建或加入房间开始");
  }

  function exitMultiplayer() {
    mpMode = false;
    clearInterval(timer);
    timer = null;
    running = false;
    paused = false;
    dead = false;
    resetGame();
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnPause.textContent = "暂停";
    showOverlay("准备好了吗？", "按「开始游戏」或空格键");
  }

  window.PixelSnakeGame = {
    enterMultiplayer: enterMultiplayer,
    exitMultiplayer: exitMultiplayer,
    isMultiplayerMode: function () {
      return mpMode;
    },
    getDifficulty: function () {
      return difficultyId;
    },
  };

})();
