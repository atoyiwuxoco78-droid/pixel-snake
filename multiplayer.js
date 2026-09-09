/**
 * Pixel Snake — 2-player same-room multiplayer (Firestore host-authoritative)
 * Zero-build ES module. Relative paths for GitHub Pages /pixel-snake/
 *
 * Latency notes (E):
 * - Fixed MP tick ~85ms (fairness — ignores single-player difficulty).
 * - Guest applies local head prediction between snapshots; host remains authoritative.
 * - Guest dir uses immediate lightweight updateDoc; host state writes are lean/throttled.
 * - RTDB not required (Firestore-only).
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyPb86dOy-oMafn1QsUBKIqwl2aEyQT1I",
  authDomain: "pixel-snake-elana.firebaseapp.com",
  projectId: "pixel-snake-elana",
  storageBucket: "pixel-snake-elana.firebasestorage.app",
  messagingSenderId: "798863312987",
  appId: "1:798863312987:web:79a063a0add5948691d77e",
  measurementId: "G-LM60NX7JDY",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COLS = 20;
const ROWS = 20;
const CELL = 28;
const MP_TICK_MS = 85; // fixed medium tick for fairness (not SP difficulty)
const ROOM_TTL_MS = 30 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

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

function $(id) {
  return document.getElementById(id);
}

function setHidden(el, hide) {
  if (!el) return;
  if (hide) {
    el.setAttribute("hidden", "");
    el.classList.add("hidden");
  } else {
    el.removeAttribute("hidden");
    el.classList.remove("hidden");
  }
}

function displayNameFor(user) {
  if (!user) return "玩家";
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim().slice(0, 16);
  }
  if (user.email) return user.email.split("@")[0].slice(0, 16) || "玩家";
  return "玩家";
}

function requireLogin() {
  const user = auth.currentUser;
  if (!user) {
    setMpStatus("请先登录后再创建/加入房间", true);
    return null;
  }
  return user;
}

function randomCode() {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function cellKey(x, y) {
  return x + "," + y;
}

function occupiedKeys(snakeH, snakeG, foods) {
  const set = new Set();
  (snakeH || []).forEach(function (p) {
    set.add(cellKey(p.x, p.y));
  });
  (snakeG || []).forEach(function (p) {
    set.add(cellKey(p.x, p.y));
  });
  (foods || []).forEach(function (f) {
    if (f) set.add(cellKey(f.x, f.y));
  });
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
    if (!occupied.has(cellKey(nx, ny))) n++;
  }
  return n;
}

function filterPrefer(pool, pred) {
  const ok = [];
  for (let i = 0; i < pool.length; i++) {
    if (pred(pool[i])) ok.push(pool[i]);
  }
  return ok.length ? ok : pool;
}

/** Smart empty food cell; avoids dead ends + proximity to other foods. */
function randomEmptyFood(snakeH, snakeG, otherFoods, headDir) {
  const occupied = occupiedKeys(snakeH, snakeG, otherFoods || []);
  const empties = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(cellKey(x, y))) empties.push({ x: x, y: y });
    }
  }
  if (!empties.length) return { x: 10, y: 10 };

  let pool = empties;
  pool = filterPrefer(pool, function (c) {
    return freeOrthoNeighbors(c.x, c.y, occupied) >= 2;
  });

  // Prefer not immediately in front of either snake head along facing
  const heads = [];
  if (snakeH && snakeH[0] && headDir && headDir.host && DIRS[headDir.host]) {
    heads.push({ h: snakeH[0], d: DIRS[headDir.host] });
  }
  if (snakeG && snakeG[0] && headDir && headDir.guest && DIRS[headDir.guest]) {
    heads.push({ h: snakeG[0], d: DIRS[headDir.guest] });
  }
  if (heads.length) {
    pool = filterPrefer(pool, function (c) {
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i].h;
        const d = heads[i].d;
        for (let dist = 1; dist <= 2; dist++) {
          if (h.x + d.x * dist === c.x && h.y + d.y * dist === c.y) return false;
        }
      }
      return true;
    });
  }

  const others = otherFoods || [];
  if (others.length) {
    pool = filterPrefer(pool, function (c) {
      for (let i = 0; i < others.length; i++) {
        const f = others[i];
        if (!f) continue;
        if (Math.abs(c.x - f.x) + Math.abs(c.y - f.y) < 2) return false;
      }
      return true;
    });
  }

  let bestN = -1;
  for (let i = 0; i < pool.length; i++) {
    const n = freeOrthoNeighbors(pool[i].x, pool[i].y, occupied);
    if (n > bestN) bestN = n;
  }
  if (bestN >= 0) {
    const top = [];
    for (let i = 0; i < pool.length; i++) {
      if (freeOrthoNeighbors(pool[i].x, pool[i].y, occupied) >= bestN) top.push(pool[i]);
    }
    if (top.length) pool = top;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

/** Normalize foods from new `foods[]` or legacy single `food`. */
function normalizeFoods(state, snakeH, snakeG, headDir, opts) {
  opts = opts || {};
  let foods = [];
  if (state && Array.isArray(state.foods) && state.foods.length) {
    foods = state.foods
      .filter(function (f) {
        return f && typeof f.x === "number" && typeof f.y === "number";
      })
      .map(function (f) {
        return { x: f.x, y: f.y };
      });
  } else if (state && state.food && typeof state.food.x === "number") {
    foods = [{ x: state.food.x, y: state.food.y }];
  }
  if (opts.ensureTwo !== false) {
    while (foods.length < 2) {
      const cell = randomEmptyFood(snakeH, snakeG, foods, headDir);
      if (!cell) break;
      const dup = foods.some(function (f) {
        return f.x === cell.x && f.y === cell.y;
      });
      if (dup) break;
      foods.push(cell);
    }
  }
  return foods.slice(0, 2);
}

function foodAt(foods, x, y) {
  for (let i = 0; i < (foods || []).length; i++) {
    const f = foods[i];
    if (f && f.x === x && f.y === y) return { food: f, index: i };
  }
  return null;
}

function replaceFoodAt(foods, index, snakeH, snakeG, headDir) {
  const next = foods.slice();
  next.splice(index, 1);
  const cell = randomEmptyFood(snakeH, snakeG, next, headDir);
  if (cell) next.push(cell);
  while (next.length < 2) {
    const c = randomEmptyFood(snakeH, snakeG, next, headDir);
    if (!c) break;
    next.push(c);
  }
  return next.slice(0, 2);
}

function initialState() {
  const midY = Math.floor(ROWS / 2);
  const snakeH = [
    { x: 4, y: midY },
    { x: 3, y: midY },
    { x: 2, y: midY },
  ];
  const snakeG = [
    { x: COLS - 5, y: midY },
    { x: COLS - 4, y: midY },
    { x: COLS - 3, y: midY },
  ];
  const headDir = { host: "right", guest: "left" };
  const foods = normalizeFoods(null, snakeH, snakeG, headDir);
  return {
    snakeH: snakeH,
    snakeG: snakeG,
    foods: foods,
    food: foods[0] || null, // legacy alias for older guests
    scoreH: 0,
    scoreG: 0,
    aliveH: true,
    aliveG: true,
    tick: 0,
    cols: COLS,
    rows: ROWS,
  };
}

function cloneSegs(arr) {
  return (arr || []).map(function (p) {
    return { x: p.x, y: p.y };
  });
}

// ----- Session state -----
let mode = "single"; // 'single' | 'mp'
let role = null; // 'host' | 'guest'
let roomCode = null;
let unsub = null;
let roomData = null;
let localHostDir = "right";
let localGuestDir = "left";
let pendingHostDir = "right";
let pendingGuestDir = "left";
let hostTimer = null;
let writeBusy = false;
let startTimer = null;
let lastRenderedTick = -1;
let lastWrittenHostDir = null;
let lastStateWriteAt = 0;
let pendingStatePayload = null;
const STATE_WRITE_MIN_MS = 70; // slight throttle; dirs still immediate
// Guest prediction
let predSnakeG = null;
let predFoods = null;
let predTimer = null;
let lastAuthTick = -1;
let guestDirWriteBusy = false;
let pendingGuestDirFlush = null;

const canvas = $("game");
const ctx = canvas ? canvas.getContext("2d") : null;

function spApi() {
  return window.PixelSnakeGame || null;
}

function setMode(next) {
  if (mode === next) return;
  if (next === "mp") {
    const api = spApi();
    if (api && api.enterMultiplayer) api.enterMultiplayer();
    mode = "mp";
    document.body.classList.add("mode-mp");
    setHidden($("mpPanel"), false);
    setHidden($("spControls"), true);
    updateModeTabs();
    updateMpUi();
    setMpStatus("登录后可创建或加入房间。房间约 30 分钟后过期。", false);
  } else {
    leaveRoom(true);
    mode = "single";
    document.body.classList.remove("mode-mp");
    setHidden($("mpPanel"), true);
    setHidden($("spControls"), false);
    updateModeTabs();
    const api = spApi();
    if (api && api.exitMultiplayer) api.exitMultiplayer();
  }
}

function updateModeTabs() {
  const tabSp = $("tabModeSingle");
  const tabMp = $("tabModeMp");
  if (tabSp) {
    tabSp.classList.toggle("active", mode === "single");
    tabSp.setAttribute("aria-selected", mode === "single" ? "true" : "false");
  }
  if (tabMp) {
    tabMp.classList.toggle("active", mode === "mp");
    tabMp.setAttribute("aria-selected", mode === "mp" ? "true" : "false");
  }
}

function setMpStatus(msg, isError) {
  const el = $("mpStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("is-error", !!isError);
}

function updateMpUi() {
  const lobby = $("mpLobby");
  const inRoom = $("mpInRoom");
  const codeEl = $("mpRoomCodeDisplay");
  const roleEl = $("mpRoleLabel");
  const namesEl = $("mpPlayers");
  const scoreH = $("mpScoreH");
  const scoreG = $("mpScoreG");

  const inARoom = !!(roomCode && role);
  setHidden(lobby, inARoom);
  setHidden(inRoom, !inARoom);

  if (codeEl) codeEl.textContent = roomCode || "------";
  if (roleEl) {
    roleEl.textContent = role === "host" ? "你是主机" : role === "guest" ? "你是客机" : "";
  }

  if (namesEl && roomData) {
    const h = roomData.hostName || "主机";
    const g = roomData.guestName || "等待中…";
    namesEl.innerHTML =
      '<span class="mp-name-h">' +
      escapeHtml(h) +
      "</span>" +
      " vs " +
      '<span class="mp-name-g">' +
      escapeHtml(g) +
      "</span>";
  } else if (namesEl) {
    namesEl.textContent = "";
  }

  const st = roomData && roomData.state;
  if (scoreH) scoreH.textContent = String((st && st.scoreH) || 0);
  if (scoreG) scoreG.textContent = String((st && st.scoreG) || 0);

  // Mirror into left HUD when in MP
  if (mode === "mp") {
    const scoreEl = $("score");
    const lengthEl = $("length");
    const levelEl = $("level");
    if (scoreEl && st) {
      scoreEl.textContent = role === "guest" ? String(st.scoreG || 0) : String(st.scoreH || 0);
    }
    if (levelEl) levelEl.textContent = "MP";
    if (lengthEl && st) {
      const mine = role === "guest" ? st.snakeG : st.snakeH;
      lengthEl.textContent = String((mine && mine.length) || 0);
    }
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showOverlay(title, msg) {
  const overlay = $("overlay");
  const t = $("overlayTitle");
  const m = $("overlayMsg");
  if (t) t.textContent = title;
  if (m) m.textContent = msg;
  if (overlay) overlay.classList.remove("hidden");
}

function hideOverlay() {
  const overlay = $("overlay");
  if (overlay) overlay.classList.add("hidden");
}

function stopHostLoop() {
  if (hostTimer) {
    clearInterval(hostTimer);
    hostTimer = null;
  }
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
}

function stopGuestPredict() {
  if (predTimer) {
    clearInterval(predTimer);
    predTimer = null;
  }
  predSnakeG = null;
  predFoods = null;
  lastAuthTick = -1;
}

function clearSubscription() {
  if (unsub) {
    unsub();
    unsub = null;
  }
}

async function leaveRoom(silent) {
  stopHostLoop();
  clearSubscription();
  const prevCode = roomCode;
  const prevRole = role;
  const user = auth.currentUser;
  roomCode = null;
  role = null;
  roomData = null;
  lastRenderedTick = -1;
  writeBusy = false;
  pendingStatePayload = null;
  lastWrittenHostDir = null;
  lastStateWriteAt = 0;
  guestDirWriteBusy = false;
  pendingGuestDirFlush = null;
  stopGuestPredict();

  // Best-effort: mark room ended if host leaves during play
  if (prevCode && prevRole === "host" && user) {
    try {
      await updateDoc(doc(db, "mp_rooms", prevCode), {
        status: "ended",
        updatedAt: Date.now(),
      });
    } catch (_) {
      /* ignore */
    }
  }

  updateMpUi();
  if (!silent && mode === "mp") {
    setMpStatus("已退出房间", false);
    showOverlay("双人对战", "创建或加入房间开始");
    drawIdleBoard();
  }
}

async function createRoom() {
  const user = requireLogin();
  if (!user) return;
  if (roomCode) {
    setMpStatus("请先退出当前房间", true);
    return;
  }

  setMpStatus("正在创建房间…", false);
  let code = null;
  let created = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    code = randomCode();
    const ref = doc(db, "mp_rooms", code);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) continue;
      const state = initialState();
      await setDoc(ref, {
        hostUid: user.uid,
        guestUid: null,
        hostName: displayNameFor(user),
        guestName: null,
        status: "waiting",
        hostDir: "right",
        guestDir: "left",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        state: state,
      });
      created = true;
      break;
    } catch (err) {
      console.warn("[mp] create failed", err);
      setMpStatus("创建失败：" + ((err && err.code) || "未知错误"), true);
      return;
    }
  }
  if (!created || !code) {
    setMpStatus("创建失败：房间号冲突，请重试", true);
    return;
  }

  role = "host";
  roomCode = code;
  localHostDir = "right";
  pendingHostDir = "right";
  attachRoomListener(code);
  updateMpUi();
  setMpStatus("房间已创建 · 分享房间号给对手", false);
  showOverlay("等待对手", "房间号 " + code);
  drawIdleBoard();
}

async function joinRoom() {
  const user = requireLogin();
  if (!user) return;
  if (roomCode) {
    setMpStatus("请先退出当前房间", true);
    return;
  }
  const input = $("mpJoinCode");
  const raw = ((input && input.value) || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 6) {
    setMpStatus("请输入 6 位房间号", true);
    return;
  }

  setMpStatus("正在加入…", false);
  const ref = doc(db, "mp_rooms", raw);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setMpStatus("房间不存在", true);
      return;
    }
    const data = snap.data();
    if (data.hostUid === user.uid) {
      setMpStatus("不能加入自己创建的房间", true);
      return;
    }
    if (data.guestUid && data.guestUid !== user.uid) {
      setMpStatus("房间已满", true);
      return;
    }
    if (data.status === "ended") {
      setMpStatus("对局已结束，请新建房间", true);
      return;
    }
    const age = Date.now() - (data.createdAt || data.updatedAt || 0);
    if (age > ROOM_TTL_MS) {
      setMpStatus("房间已过期（约 30 分钟），请新建", true);
      return;
    }

    await updateDoc(ref, {
      guestUid: user.uid,
      guestName: displayNameFor(user),
      guestDir: "left",
      updatedAt: Date.now(),
    });

    role = "guest";
    roomCode = raw;
    localGuestDir = "left";
    pendingGuestDir = "left";
    attachRoomListener(raw);
    updateMpUi();
    setMpStatus("已加入 · 即将开始", false);
  } catch (err) {
    console.warn("[mp] join failed", err);
    setMpStatus("加入失败：" + ((err && err.code) || "未知错误"), true);
  }
}

function attachRoomListener(code) {
  clearSubscription();
  const ref = doc(db, "mp_rooms", code);
  unsub = onSnapshot(
    ref,
    function (snap) {
      if (!snap.exists()) {
        setMpStatus("房间已删除", true);
        leaveRoom(true);
        showOverlay("房间关闭", "请重新创建或加入");
        return;
      }
      const data = snap.data();
      roomData = data;

      // Stale TTL note
      const age = Date.now() - (data.createdAt || data.updatedAt || 0);
      if (age > ROOM_TTL_MS && data.status !== "ended") {
        setMpStatus("房间可能已过期（>30 分钟）", true);
      }

      // Guest joined → host schedules auto-start
      if (role === "host" && data.guestUid && data.status === "waiting" && !startTimer) {
        setMpStatus("对手已加入 · 约 1 秒后开始", false);
        showOverlay("对手已加入", "对战即将开始…");
        startTimer = setTimeout(function () {
          startTimer = null;
          beginMatchAsHost();
        }, 1000);
      }

      // Sync guest dir from doc for host sim
      if (role === "host" && data.guestDir && DIRS[data.guestDir]) {
        pendingGuestDir = data.guestDir;
      }

      updateMpUi();

      if (data.status === "playing" && data.state) {
        if (role === "host" && !hostTimer) startHostLoop();
        if (role === "guest") {
          hideOverlay();
          onGuestAuthState(data.state, data);
        } else if (role === "host") {
          // Host also renders from local writes / snapshot
          renderState(data.state, data);
        }
      } else if (data.status === "waiting") {
        if (role === "host" && !data.guestUid) {
          showOverlay("等待对手", "房间号 " + code);
        } else if (role === "guest") {
          showOverlay("等待开始", "主机即将开始对局…");
        }
        drawIdleBoard();
      } else if (data.status === "ended" && data.state) {
        stopHostLoop();
        stopGuestPredict();
        renderState(data.state, data);
        const sh = data.state.scoreH || 0;
        const sg = data.state.scoreG || 0;
        const hName = data.hostName || "主机";
        const gName = data.guestName || "客机";
        let winner = "平局";
        if (data.state.aliveH && !data.state.aliveG) winner = hName + " 获胜";
        else if (data.state.aliveG && !data.state.aliveH) winner = gName + " 获胜";
        else if (sh > sg) winner = hName + " 分高";
        else if (sg > sh) winner = gName + " 分高";
        showOverlay(
          "对局结束",
          hName + " " + sh + " · " + gName + " " + sg + " · " + winner
        );
        setMpStatus("对局结束 · 可退出后重开", false);
      }
    },
    function (err) {
      console.warn("[mp] snapshot error", err);
      setMpStatus("同步失败：" + ((err && err.code) || "网络错误"), true);
    }
  );
}

async function beginMatchAsHost() {
  if (role !== "host" || !roomCode) return;
  const state = initialState();
  localHostDir = "right";
  pendingHostDir = "right";
  pendingGuestDir = "left";
  lastWrittenHostDir = "right";
  lastStateWriteAt = 0;
  try {
    await updateDoc(doc(db, "mp_rooms", roomCode), {
      status: "playing",
      hostDir: "right",
      guestDir: "left",
      state: state,
      updatedAt: Date.now(),
    });
    hideOverlay();
    startHostLoop();
  } catch (err) {
    console.warn("[mp] start failed", err);
    setMpStatus("开始失败：" + ((err && err.code) || "错误"), true);
  }
}

function startHostLoop() {
  if (hostTimer) return;
  hostTimer = setInterval(hostTick, MP_TICK_MS);
}

function applyDir(current, pending, len) {
  if (!DIRS[pending]) return current;
  if (OPPOSITE[pending] === current && len > 1) return current;
  return pending;
}

function moveSnake(snake, dir, foods, otherSnake) {
  if (!snake || !snake.length) {
    return { snake: snake, dir: dir, grew: false, dead: true, eatIndex: -1 };
  }
  const d = DIRS[dir];
  const head = snake[0];
  const nx = head.x + d.x;
  const ny = head.y + d.y;

  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    return { snake: snake, dir: dir, grew: false, dead: true, eatIndex: -1 };
  }

  const hit = foodAt(foods, nx, ny);
  const willGrow = !!hit;

  // Self collision
  for (let i = 0; i < snake.length - (willGrow ? 0 : 1); i++) {
    if (snake[i].x === nx && snake[i].y === ny) {
      return { snake: snake, dir: dir, grew: false, dead: true, eatIndex: -1 };
    }
  }
  // Other snake collision
  for (let i = 0; i < (otherSnake || []).length; i++) {
    if (otherSnake[i].x === nx && otherSnake[i].y === ny) {
      return { snake: snake, dir: dir, grew: false, dead: true, eatIndex: -1 };
    }
  }

  const next = cloneSegs(snake);
  next.unshift({ x: nx, y: ny });
  if (!willGrow) next.pop();
  return {
    snake: next,
    dir: dir,
    grew: willGrow,
    dead: false,
    eatIndex: hit ? hit.index : -1,
  };
}

async function flushHostStateWrite() {
  if (writeBusy || !pendingStatePayload || !roomCode) return;
  const payload = pendingStatePayload;
  pendingStatePayload = null;
  writeBusy = true;
  lastStateWriteAt = Date.now();
  try {
    await updateDoc(doc(db, "mp_rooms", roomCode), payload);
  } catch (err) {
    console.warn("[mp] lean write failed, retrying full state", err);
    try {
      const st = roomData && roomData.state;
      const full = {
        state: st,
        updatedAt: Date.now(),
      };
      if (payload.hostDir) full.hostDir = payload.hostDir;
      if (payload.status) full.status = payload.status;
      await updateDoc(doc(db, "mp_rooms", roomCode), full);
    } catch (err2) {
      console.warn("[mp] host write failed", err2);
      setMpStatus("同步写入失败：" + ((err2 && err2.code) || "错误"), true);
    }
  } finally {
    writeBusy = false;
    if (pendingStatePayload) flushHostStateWrite();
  }
}

async function hostTick() {
  if (role !== "host" || !roomCode || !roomData) return;
  if (roomData.status !== "playing") return;
  // Always simulate locally; coalesce Firestore writes if previous still in flight

  const prev = roomData.state || initialState();
  if (!prev.aliveH || !prev.aliveG) return;

  localHostDir = applyDir(localHostDir, pendingHostDir, (prev.snakeH || []).length);
  const guestDir = applyDir(
    roomData.guestDir || "left",
    pendingGuestDir,
    (prev.snakeG || []).length
  );

  // Move host first, then guest against new host body (simple sequential)
  let snakeH = cloneSegs(prev.snakeH);
  let snakeG = cloneSegs(prev.snakeG);
  const headDir = { host: localHostDir, guest: guestDir };
  let foods = normalizeFoods(prev, snakeH, snakeG, headDir);
  let scoreH = prev.scoreH || 0;
  let scoreG = prev.scoreG || 0;
  let aliveH = true;
  let aliveG = true;

  const mh = moveSnake(snakeH, localHostDir, foods, snakeG);
  if (mh.dead) {
    aliveH = false;
  } else {
    snakeH = mh.snake;
    if (mh.grew && mh.eatIndex >= 0) {
      scoreH += 10;
      foods = replaceFoodAt(foods, mh.eatIndex, snakeH, snakeG, headDir);
    }
  }

  // Guest moves against updated host (or original if host died mid-tick — still check)
  const mg = moveSnake(snakeG, guestDir, foods, snakeH);
  if (mg.dead) {
    aliveG = false;
  } else {
    snakeG = mg.snake;
    if (mg.grew && mg.eatIndex >= 0) {
      scoreG += 10;
      foods = replaceFoodAt(foods, mg.eatIndex, snakeH, snakeG, headDir);
    }
  }

  // Head-on same cell: both die
  if (aliveH && aliveG && snakeH[0] && snakeG[0]) {
    if (snakeH[0].x === snakeG[0].x && snakeH[0].y === snakeG[0].y) {
      aliveH = false;
      aliveG = false;
    }
  }

  const tick = (prev.tick || 0) + 1;
  const nextState = {
    snakeH: snakeH,
    snakeG: snakeG,
    foods: foods,
    food: foods[0] || null, // legacy alias
    scoreH: scoreH,
    scoreG: scoreG,
    aliveH: aliveH,
    aliveG: aliveG,
    tick: tick,
    cols: COLS,
    rows: ROWS,
  };

  const ended = !aliveH || !aliveG;

  // Optimistic local render immediately (snappy for host)
  roomData = Object.assign({}, roomData, {
    hostDir: localHostDir,
    state: nextState,
    updatedAt: Date.now(),
    status: ended ? "ended" : roomData.status,
  });
  renderState(nextState, roomData);
  updateMpUi();

  // Always queue latest state; flushHostStateWrite coalesces in-flight writes.
  // Skip redundant hostDir field when unchanged to keep payload lean.
  const now = Date.now();
  const dirChanged = lastWrittenHostDir !== localHostDir;
  const payload = {
    // Do not write guestDir — guest owns that field
    state: nextState,
    updatedAt: now,
  };
  if (dirChanged) {
    payload.hostDir = localHostDir;
    lastWrittenHostDir = localHostDir;
  }
  if (ended) payload.status = "ended";
  pendingStatePayload = payload;
  // Tiny throttle only when a write is already flying and match not ending
  if (ended || !writeBusy || now - lastStateWriteAt >= STATE_WRITE_MIN_MS) {
    flushHostStateWrite();
  }

  if (ended) stopHostLoop();
}

async function flushGuestDir(dir) {
  if (!roomCode || role !== "guest") return;
  if (guestDirWriteBusy) {
    pendingGuestDirFlush = dir;
    return;
  }
  guestDirWriteBusy = true;
  try {
    // Lightweight input-only write (high priority vs full state)
    await updateDoc(doc(db, "mp_rooms", roomCode), {
      guestDir: dir,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("[mp] guestDir write failed", err);
  } finally {
    guestDirWriteBusy = false;
    if (pendingGuestDirFlush && pendingGuestDirFlush !== dir) {
      const next = pendingGuestDirFlush;
      pendingGuestDirFlush = null;
      flushGuestDir(next);
    } else {
      pendingGuestDirFlush = null;
    }
  }
}

function pushDir(dir) {
  if (!DIRS[dir] || !roomCode || !role) return;
  if (!roomData || roomData.status !== "playing") return;
  if (role === "host") {
    pendingHostDir = dir;
    // Host dir applied locally; written lean with ticks
  } else if (role === "guest") {
    // Reject 180° instantly for prediction feel
    const cur =
      (predSnakeG && predSnakeG.length > 1 && localGuestDir) ||
      (roomData.guestDir) ||
      "left";
    if (OPPOSITE[dir] === cur && predSnakeG && predSnakeG.length > 1) return;
    pendingGuestDir = dir;
    localGuestDir = dir;
    flushGuestDir(dir);
  }
}

function onGuestAuthState(state, room) {
  if (!state) return;
  lastAuthTick = state.tick || 0;
  // Reconcile prediction to authoritative snapshot
  predSnakeG = cloneSegs(state.snakeG);
  predFoods = normalizeFoods(
    state,
    state.snakeH,
    state.snakeG,
    {
      host: (room && room.hostDir) || "right",
      guest: (room && room.guestDir) || "left",
    },
    { ensureTwo: false }
  );
  if (room && room.guestDir && DIRS[room.guestDir]) {
    // Keep local pending if player already turned since snapshot
    if (!pendingGuestDir || pendingGuestDir === room.guestDir) {
      localGuestDir = room.guestDir;
      pendingGuestDir = room.guestDir;
    }
  }
  startGuestPredict();
  renderState(state, room, { predictGuest: true });
}

function startGuestPredict() {
  if (predTimer) return;
  predTimer = setInterval(guestPredictTick, MP_TICK_MS);
}

function guestPredictTick() {
  if (role !== "guest" || !roomData || roomData.status !== "playing") return;
  const auth = roomData.state;
  if (!auth || !auth.aliveG || !predSnakeG || !predSnakeG.length) return;

  const dir = applyDir(localGuestDir || "left", pendingGuestDir, predSnakeG.length);
  localGuestDir = dir;
  const d = DIRS[dir];
  if (!d) return;
  const head = predSnakeG[0];
  let nx = head.x + d.x;
  let ny = head.y + d.y;

  // Soft walls: stop predicting into death; wait for host
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;

  const foods =
    predFoods ||
    normalizeFoods(
      auth,
      auth.snakeH,
      auth.snakeG,
      {
        host: (roomData && roomData.hostDir) || "right",
        guest: dir,
      },
      { ensureTwo: false }
    );
  const hit = foodAt(foods, nx, ny);
  const willGrow = !!hit;

  // Don't predict through self / host body — freeze until auth
  for (let i = 0; i < predSnakeG.length - (willGrow ? 0 : 1); i++) {
    if (predSnakeG[i].x === nx && predSnakeG[i].y === ny) return;
  }
  const other = auth.snakeH || [];
  for (let i = 0; i < other.length; i++) {
    if (other[i].x === nx && other[i].y === ny) return;
  }

  const next = cloneSegs(predSnakeG);
  next.unshift({ x: nx, y: ny });
  if (!willGrow) next.pop();
  predSnakeG = next;

  const drawState = {
    snakeH: auth.snakeH,
    snakeG: predSnakeG,
    foods: foods,
    food: foods[0] || null,
    scoreH: auth.scoreH,
    scoreG: auth.scoreG,
    aliveH: auth.aliveH,
    aliveG: auth.aliveG,
    tick: auth.tick,
    cols: COLS,
    rows: ROWS,
  };
  const drawRoom = Object.assign({}, roomData, { guestDir: dir });
  renderState(drawState, drawRoom, { predictGuest: true });
}


function drawSnake(segs, dir, headColor, bodyFn, eyeColor) {
  if (!ctx || !segs) return;
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    const sx = seg.x * CELL;
    const sy = seg.y * CELL;
    const pad = 2;
    const isHead = i === 0;
    const t = i / Math.max(segs.length - 1, 1);
    if (isHead) {
      ctx.fillStyle = headColor;
      ctx.shadowColor = headColor;
      ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = bodyFn(t);
      ctx.shadowBlur = 0;
    }
    ctx.fillRect(sx + pad, sy + pad, CELL - pad * 2, CELL - pad * 2);
    ctx.shadowBlur = 0;
    if (isHead) {
      ctx.fillStyle = eyeColor;
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
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(sx + pad + 4, sy + pad + 4, 5, 5);
    }
  }
}

function drawBoardBg() {
  if (!ctx || !canvas) return;
  ctx.fillStyle = "#060a12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
}

function drawIdleBoard() {
  drawBoardBg();
}

function renderState(state, room, opts) {
  if (!ctx || !state) return;
  lastRenderedTick = state.tick || 0;
  drawBoardBg();

  // Foods (×2) — green apples in MP; tolerate legacy single food
  const foodsDraw = normalizeFoods(state, state.snakeH, state.snakeG, null, {
    ensureTwo: false,
  });
  for (let fi = 0; fi < foodsDraw.length; fi++) {
    const f = foodsDraw[fi];
    const fx = f.x * CELL;
    const fy = f.y * CELL;
    const pad = 3;
    ctx.fillStyle = "#39ff14";
    ctx.shadowColor = "#39ff14";
    ctx.shadowBlur = 12;
    ctx.fillRect(fx + pad, fy + pad, CELL - pad * 2, CELL - pad * 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#b8ff9a";
    ctx.fillRect(fx + pad + 4, fy + pad + 3, 6, 6);
    ctx.fillStyle = "#ff2bd6";
    ctx.fillRect(fx + CELL / 2 - 2, fy + 2, 4, 5);
  }

  const hDir = (room && room.hostDir) || "right";
  let gDir = (room && room.guestDir) || "left";
  if (role === "guest" && pendingGuestDir && DIRS[pendingGuestDir]) {
    gDir = pendingGuestDir;
  }

  // Host cyan
  drawSnake(
    state.snakeH,
    hDir,
    "#00e8ff",
    function (t) {
      const g = Math.floor(40 + (1 - t) * 180);
      return "rgb(0," + g + "," + Math.min(255, g + 40) + ")";
    },
    "#a8ffff"
  );

  // Guest magenta
  drawSnake(
    state.snakeG,
    gDir,
    "#ff2bd6",
    function (t) {
      const g = Math.floor(40 + (1 - t) * 180);
      return "rgb(" + Math.min(255, g + 40) + ",40," + g + ")";
    },
    "#ff9ae8"
  );
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.id === "mpJoinCode" || el.id === "authEmail" || el.id === "authPassword" || el.id === "nickname")
    return true;
  return false;
}

function onKeyDown(e) {
  if (mode !== "mp") return;
  if (isTypingTarget(document.activeElement)) return;
  const authModal = $("authModal");
  if (authModal && !authModal.classList.contains("hidden")) return;

  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    e.stopPropagation();
    if (roomData && roomData.status === "playing") pushDir(mapped);
  }
}

function bindDpad() {
  const dpad = $("dpad");
  if (!dpad) return;
  dpad.querySelectorAll(".dpad-btn[data-dir]").forEach(function (el) {
    el.addEventListener(
      "pointerdown",
      function (ev) {
        if (mode !== "mp") return;
        const dirAttr = el.getAttribute("data-dir");
        if (!dirAttr) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (roomData && roomData.status === "playing") pushDir(dirAttr);
      },
      true
    );
  });
}

function wireUi() {
  const tabSp = $("tabModeSingle");
  const tabMp = $("tabModeMp");
  if (tabSp) tabSp.addEventListener("click", function () {
    setMode("single");
  });
  if (tabMp) tabMp.addEventListener("click", function () {
    setMode("mp");
  });

  const btnCreate = $("btnMpCreate");
  const btnJoin = $("btnMpJoin");
  const btnLeave = $("btnMpLeave");
  const joinInput = $("mpJoinCode");

  if (btnCreate) btnCreate.addEventListener("click", createRoom);
  if (btnJoin) btnJoin.addEventListener("click", joinRoom);
  if (btnLeave) btnLeave.addEventListener("click", function () {
    leaveRoom(false);
  });
  if (joinInput) {
    joinInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") joinRoom();
    });
    joinInput.addEventListener("input", function () {
      joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    });
  }

  document.addEventListener("keydown", onKeyDown, true);
  bindDpad();

  // Default: single mode UI
  setHidden($("mpPanel"), true);
  setHidden($("spControls"), false);
  updateModeTabs();
}

onAuthStateChanged(auth, function (user) {
  if (!user && roomCode) {
    leaveRoom(true);
    if (mode === "mp") setMpStatus("已退出登录 · 对战需重新登录", true);
  }
  updateMpUi();
});

wireUi();

window.PixelSnakeMultiplayer = {
  getMode: function () {
    return mode;
  },
  isActive: function () {
    return mode === "mp";
  },
};
