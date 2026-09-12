/**
 * Pixel Snake — Firebase Auth + Cloud Leaderboard (CDN modular v10)
 * Zero-build ES module. Exposes window.PixelSnakeFirebase for game.js.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
const VALID_DIFFS = ["easy", "normal", "hell"];
const DIFF_LABELS = { easy: "简单", normal: "普通", hell: "地狱" };

function resolveDifficulty(explicit) {
  if (VALID_DIFFS.indexOf(explicit) >= 0) return explicit;
  try {
    const g = window.PixelSnakeGame;
    if (g && typeof g.getBoardDifficulty === "function") {
      const b = g.getBoardDifficulty();
      if (VALID_DIFFS.indexOf(b) >= 0) return b;
    }
    if (g && typeof g.getDifficulty === "function") {
      const d = g.getDifficulty();
      if (VALID_DIFFS.indexOf(d) >= 0) return d;
    }
  } catch (_) {}
  return "normal";
}

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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayNameFor(user) {
  if (!user) return "游客";
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim().slice(0, 32);
  }
  if (user.email) {
    return user.email.split("@")[0].slice(0, 32) || "玩家";
  }
  return "玩家";
}

function setAuthError(msg) {
  const el = $("authError");
  if (!el) return;
  el.textContent = msg || "";
  setHidden(el, !msg);
}

function openAuthModal(mode) {
  const modal = $("authModal");
  const title = $("authModalTitle");
  const submit = $("btnAuthSubmit");
  if (!modal || !title || !submit) return;
  modal.dataset.mode = mode;
  if (mode === "register") {
    title.textContent = "邮箱注册";
    submit.textContent = "注册";
  } else {
    title.textContent = "邮箱登录";
    submit.textContent = "登录";
  }
  setAuthError("");
  const email = $("authEmail");
  const pass = $("authPassword");
  if (email) email.value = "";
  if (pass) pass.value = "";
  setHidden(modal, false);
  setTimeout(function () {
    if (email) email.focus();
  }, 50);
}

function closeAuthModal() {
  const modal = $("authModal");
  setHidden(modal, true);
  setAuthError("");
  const email = $("authEmail");
  const pass = $("authPassword");
  if (email) email.value = "";
  if (pass) pass.value = "";
  if (modal) modal.dataset.mode = "login";
}

function showUiToast(msg, isError) {
  // Prefer game overlay toast if available; fall back to brief alert-style overlay text
  const toast = $("toast");
  if (toast) {
    toast.textContent = msg;
    toast.className =
      "toast" + (isError ? " toast-error" : " toast-ok");
    void toast.offsetWidth;
    setTimeout(function () {
      toast.classList.add("hidden");
    }, 1800);
    return;
  }
  console.log("[pixel-snake]", msg);
}

function updateAccountUI(user) {
  currentUser = user;
  const status = $("accountStatus");
  const guest = $("accountGuestBtns");
  const userBtns = $("accountUserBtns");
  const emailEl = $("accountEmail");
  const footer = $("footerNote");
  const chip = $("accountChip");

  if (status) {
    if (user) {
      const label = user.email || user.displayName || "已登录";
      status.textContent = "已登录";
      status.classList.add("logged-in");
      status.title = label;
    } else {
      status.textContent = "未登录";
      status.classList.remove("logged-in");
      status.title = "";
    }
  }
  if (emailEl) {
    emailEl.textContent = user
      ? user.email || user.displayName || "已登录"
      : "";
    emailEl.title = emailEl.textContent;
  }
  if (chip) chip.classList.toggle("is-logged-in", !!user);

  // Fully hide guest login UI when logged in; show email + 退出 only
  setHidden(guest, !!user);
  setHidden(userBtns, !user);

  if (footer) {
    footer.textContent = user
      ? "云端同步 · 登录后成绩可上传排行榜"
      : "本地存储 · 登录后同步云端排行榜";
  }

  // Clear leftover auth modal if somehow still open after login
  if (user) closeAuthModal();

  const nick = $("nickname");
  if (nick && user) {
    nick.value = displayNameFor(user).slice(0, 12);
  }
}

function errorReason(err) {
  if (!err) return "未知错误";
  const code = err.code || "";
  if (code === "permission-denied") return "权限不足（规则拒绝）";
  if (code === "unavailable") return "网络不可用";
  if (code === "failed-precondition") return "需要索引或前置条件";
  if (code === "unauthenticated") return "未登录";
  if (code) return code;
  return err.message || "未知错误";
}


/** Asia/Shanghai ISO-like week id: 2026-W37 */
function shanghaiParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  fmt.formatToParts(date || new Date()).forEach(function (p) {
    if (p.type !== "literal") parts[p.type] = p.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getSeasonInfo(now) {
  const p = shanghaiParts(now || new Date());
  // Treat Shanghai calendar date as UTC date for ISO week math
  const tmp = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dayNum = tmp.getUTCDay() || 7; // Mon=1..Sun=7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const isoYear = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  const id = isoYear + "-W" + String(week).padStart(2, "0");

  // Next Monday 00:00 Asia/Shanghai
  const shanghaiOffsetMs = 8 * 3600 * 1000;
  // current Shanghai instant as UTC+8 wall
  const wallUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // day of week for Shanghai date
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 Sun
  const daysUntilMon = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
  const nextMon = new Date(Date.UTC(p.year, p.month - 1, p.day + daysUntilMon, 0, 0, 0));
  // nextMon is wall clock in Shanghai expressed as UTC components; convert to real instant:
  const endsAt = nextMon.getTime() - shanghaiOffsetMs;
  return { id: id, label: id, endsAt: endsAt };
}

function formatSeasonCountdown(endsAt) {
  const ms = Math.max(0, endsAt - Date.now());
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return "本赛季剩余 " + d + " 天 " + h + " 小时";
  return "本赛季剩余 " + h + " 小时 " + m + " 分";
}

function syncSeasonBoardTitle(difficulty) {
  const info = getSeasonInfo();
  const label = DIFF_LABELS[difficulty] || "普通";
  const title = $("seasonBoardTitle");
  const sub = $("seasonBoardSub");
  const cd = $("seasonCountdown");
  if (title) title.textContent = "赛季 · " + label;
  if (sub) sub.textContent = info.id + " · TOP 10 · 周一 00:00（上海）重置";
  if (cd) cd.textContent = formatSeasonCountdown(info.endsAt);
}

async function saveSeasonScore(pts, difficultyId) {
  const user = auth.currentUser;
  if (!user || typeof pts !== "number" || pts < 0 || !Number.isFinite(pts)) {
    return { saved: false, reason: "skip" };
  }
  const difficulty = resolveDifficulty(difficultyId);
  const score = Math.floor(pts);
  const season = getSeasonInfo();
  const name = displayNameFor(user);
  const ref = doc(db, "seasons", season.id, "boards", difficulty, "entries", user.uid);
  try {
    await user.getIdToken(true);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const previous = snap.data().score;
      if (typeof previous === "number" && score < previous) {
        return { saved: false, reason: "lower", previous: previous, seasonId: season.id };
      }
    }
    await setDoc(
      ref,
      {
        score: score,
        displayName: name,
        updatedAt: Date.now(),
        uid: user.uid,
        difficulty: difficulty,
        seasonId: season.id,
      },
      { merge: true }
    );
    await loadSeasonLeaderboard(difficulty);
    return { saved: true, score: score, seasonId: season.id, difficulty: difficulty };
  } catch (err) {
    console.warn("[pixel-snake] season score save failed", err && err.code, err);
    return { saved: false, reason: "error", message: errorReason(err), code: err && err.code };
  }
}

async function loadSeasonLeaderboard(difficultyId) {
  const el = $("seasonLeaderboard");
  if (!el) return;
  const difficulty = resolveDifficulty(difficultyId);
  const season = getSeasonInfo();
  syncSeasonBoardTitle(difficulty);
  // If local scope selected, let game.js render
  const scopeBtn = document.querySelector("#seasonScopeTabs [data-season-scope].active");
  const scope = scopeBtn ? scopeBtn.getAttribute("data-season-scope") : "cloud";
  if (scope === "local") {
    if (window.PixelSnakeGame && typeof window.PixelSnakeGame.renderLocalSeason === "function") {
      window.PixelSnakeGame.renderLocalSeason(difficulty);
    }
    return;
  }
  el.innerHTML = '<li class="empty">加载中…</li>';
  const label = DIFF_LABELS[difficulty] || "普通";
  try {
    const q = query(
      collection(db, "seasons", season.id, "boards", difficulty, "entries"),
      orderBy("score", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      el.innerHTML =
        '<li class="empty">本周「' +
        label +
        "」暂无云端赛季成绩<br/>登录对局后自动上传最高分</li>";
      return;
    }
    const rows = [];
    let i = 0;
    snap.forEach(function (docSnap) {
      const data = docSnap.data();
      i += 1;
      rows.push(
        "<li>" +
          '<span class="rank">#' +
          i +
          "</span>" +
          '<span class="name">' +
          escapeHtml(data.displayName || "玩家") +
          "</span>" +
          '<span class="pts">' +
          (data.score ?? 0) +
          "</span>" +
          '<span class="date">' +
          formatUpdatedAt(data.updatedAt) +
          "</span>" +
          "</li>"
      );
    });
    el.innerHTML = rows.join("");
  } catch (err) {
    console.warn("[pixel-snake] season board load failed", err && err.code, err);
    let msg = "赛季榜加载失败<br/>请检查网络或稍后重试";
    if (err && err.code === "permission-denied") msg = "赛季榜无权限<br/>请稍后再试";
    el.innerHTML = '<li class="empty">' + msg + "</li>";
  }
}

async function saveBestScore(pts, difficultyId) {
  const user = auth.currentUser;
  if (!user || typeof pts !== "number" || pts < 0 || !Number.isFinite(pts)) {
    return { saved: false, reason: "not-logged-in" };
  }
  const difficulty = resolveDifficulty(difficultyId);
  const score = Math.floor(pts);
  const name = displayNameFor(user);
  const ref = doc(db, "boards", difficulty, "entries", user.uid);
  try {
    await user.getIdToken(true);
    const snap = await getDoc(ref);
    let previous = null;
    if (snap.exists()) {
      previous = snap.data().score;
      if (typeof previous === "number" && score < previous) {
        // Career best unchanged — still update weekly season independently
        try {
          await saveSeasonScore(score, difficulty);
        } catch (_) {}
        return { saved: false, reason: "lower", previous: previous, difficulty: difficulty };
      }
    } else {
      // migrate best from legacy scores/{uid_diff} or scores/{uid}
      try {
        const legacyDiff = await getDoc(doc(db, "scores", user.uid + "_" + difficulty));
        if (legacyDiff.exists()) {
          const leg = legacyDiff.data().score;
          if (typeof leg === "number" && score < leg) {
            previous = leg;
            await setDoc(
              ref,
              {
                score: Math.floor(leg),
                displayName: name,
                updatedAt: Date.now(),
                uid: user.uid,
                difficulty: difficulty,
              },
              { merge: true }
            );
            await loadCloudLeaderboard(difficulty);
            return { saved: false, reason: "lower", previous: leg, difficulty: difficulty };
          }
        } else if (difficulty === "normal") {
          const legacy = await getDoc(doc(db, "scores", user.uid));
          if (legacy.exists()) {
            const leg = legacy.data().score;
            if (typeof leg === "number" && score < leg) {
              await setDoc(
                ref,
                {
                  score: Math.floor(leg),
                  displayName: name,
                  updatedAt: Date.now(),
                  uid: user.uid,
                  difficulty: "normal",
                },
                { merge: true }
              );
              await loadCloudLeaderboard(difficulty);
              return { saved: false, reason: "lower", previous: leg, difficulty: difficulty };
            }
          }
        }
      } catch (_) {}
    }
    await setDoc(
      ref,
      {
        score: score,
        displayName: name,
        updatedAt: Date.now(),
        uid: user.uid,
        difficulty: difficulty,
      },
      { merge: true }
    );
    // also mirror to legacy path for safety
    try {
      await setDoc(
        doc(db, "scores", user.uid + "_" + difficulty),
        {
          score: score,
          displayName: name,
          updatedAt: Date.now(),
          uid: user.uid,
          difficulty: difficulty,
        },
        { merge: true }
      );
    } catch (_) {}
    await loadCloudLeaderboard(difficulty);
    try {
      await saveSeasonScore(score, difficulty);
    } catch (_) {}
    return { saved: true, score: score, difficulty: difficulty };
  } catch (err) {
    const code = err && err.code;
    console.warn("[pixel-snake] cloud score save failed", code, err);
    const reason = errorReason(err);
    showUiToast("云端上传失败：" + reason, true);
    return { saved: false, reason: "error", error: err, code: code, message: reason };
  }
}

function formatUpdatedAt(ts) {
  try {
    let d = null;
    if (ts && typeof ts.toDate === "function") d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
    if (!d || isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  } catch {
    return "";
  }
}

function syncCloudBoardTitle(difficulty) {
  const label = DIFF_LABELS[difficulty] || "普通";
  const title = $("cloudBoardTitle");
  const sub = $("cloudBoardSub");
  if (title) title.textContent = "云端 · " + label;
  if (sub) sub.textContent = "TOP 10 · Firestore · " + label;
}

async function loadCloudLeaderboard(difficultyId) {
  const el = $("cloudLeaderboard");
  if (!el) return;
  const difficulty = resolveDifficulty(difficultyId);
  syncCloudBoardTitle(difficulty);
  el.innerHTML = '<li class="empty">加载中…</li>';
  const label = DIFF_LABELS[difficulty] || "普通";
  try {
    // boards/{diff}/entries — only orderBy(score), no composite index needed
    const q = query(
      collection(db, "boards", difficulty, "entries"),
      orderBy("score", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      el.innerHTML =
        '<li class="empty">暂无「' + label + '」云端成绩<br/>登录后上传吧！</li>';
      return;
    }
    const rows = [];
    let i = 0;
    snap.forEach(function (docSnap) {
      const data = docSnap.data();
      i += 1;
      rows.push(
        "<li>" +
          '<span class="rank">#' +
          i +
          "</span>" +
          '<span class="name">' +
          escapeHtml(data.displayName || "玩家") +
          "</span>" +
          '<span class="pts">' +
          (data.score ?? 0) +
          "</span>" +
          '<span class="date">' +
          formatUpdatedAt(data.updatedAt) +
          "</span>" +
          "</li>"
      );
    });
    el.innerHTML = rows.join("");
  } catch (err) {
    console.warn("[pixel-snake] cloud leaderboard load failed", err && err.code, err);
    const code = err && err.code;
    let msg = "云端排行榜加载失败<br/>请检查网络";
    if (code === "failed-precondition") {
      msg = "云端排行榜加载失败<br/>请硬刷新后再试";
    } else if (code === "permission-denied") {
      msg = "云端排行榜无权限<br/>请稍后重试";
    }
    el.innerHTML = '<li class="empty">' + msg + "</li>";
  }
}

async function handleEmailAuth() {
  const modal = $("authModal");
  const mode = modal ? modal.dataset.mode : "login";
  const email = ($("authEmail") && $("authEmail").value.trim()) || "";
  const password = ($("authPassword") && $("authPassword").value) || "";
  if (!email || !password) {
    setAuthError("请输入邮箱和密码");
    return;
  }
  if (password.length < 6) {
    setAuthError("密码至少 6 位");
    return;
  }
  const submit = $("btnAuthSubmit");
  if (submit) submit.disabled = true;
  setAuthError("");
  try {
    if (mode === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    closeAuthModal();
  } catch (err) {
    const code = err && err.code;
    let msg = "操作失败，请重试";
    if (code === "auth/email-already-in-use") msg = "邮箱已被注册";
    else if (code === "auth/invalid-email") msg = "邮箱格式无效";
    else if (code === "auth/weak-password") msg = "密码太弱（至少 6 位）";
    else if (code === "auth/user-not-found" || code === "auth/wrong-password")
      msg = "邮箱或密码错误";
    else if (code === "auth/invalid-credential") msg = "邮箱或密码错误";
    else if (code === "auth/too-many-requests") msg = "尝试过多，稍后再试";
    else if (code === "auth/operation-not-allowed")
      msg = "未启用邮箱登录，请在控制台开启";
    setAuthError(msg);
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function handleGoogleLogin() {
  setAuthError("");
  try {
    await signInWithPopup(auth, googleProvider);
    closeAuthModal();
  } catch (err) {
    const code = err && err.code;
    if (code === "auth/popup-closed-by-user") return;
    if (code === "auth/popup-blocked") {
      alert("浏览器拦截了弹窗，请允许本站弹窗后重试 Google 登录");
      return;
    }
    if (code === "auth/unauthorized-domain") {
      alert(
        "当前域名未加入 Firebase 授权域名。请在 Firebase Console → Authentication → Settings → Authorized domains 添加本站域名。"
      );
      return;
    }
    console.warn("[pixel-snake] Google login failed", err);
    alert("Google 登录失败：" + ((err && err.message) || "未知错误"));
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn("[pixel-snake] signOut failed", err);
  }
}

function wireBoardTabs() {
  const tabs = document.querySelectorAll(".board-tab");
  const cloud = $("boardCloud");
  const local = $("boardLocal");
  const season = $("boardSeason");
  if (!tabs.length || !cloud || !local) return;

  function activate(which) {
    tabs.forEach(function (t) {
      const on = t.getAttribute("data-tab") === which;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    setHidden(cloud, which !== "cloud");
    setHidden(local, which !== "local");
    if (season) setHidden(season, which !== "season");
    if (which === "season") {
      const diff =
        (window.PixelSnakeGame &&
          window.PixelSnakeGame.getBoardDifficulty &&
          window.PixelSnakeGame.getBoardDifficulty()) ||
        "normal";
      loadSeasonLeaderboard(diff);
    }
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      activate(t.getAttribute("data-tab") || "cloud");
    });
  });

  const scopeTabs = $("seasonScopeTabs");
  if (scopeTabs) {
    scopeTabs.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-season-scope]");
      if (!btn || !scopeTabs.contains(btn)) return;
      scopeTabs.querySelectorAll("[data-season-scope]").forEach(function (b) {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      const diff =
        (window.PixelSnakeGame &&
          window.PixelSnakeGame.getBoardDifficulty &&
          window.PixelSnakeGame.getBoardDifficulty()) ||
        "normal";
      loadSeasonLeaderboard(diff);
    });
  }

  const btnRefreshSeason = $("btnRefreshSeason");
  if (btnRefreshSeason) {
    btnRefreshSeason.addEventListener("click", function () {
      const diff =
        (window.PixelSnakeGame &&
          window.PixelSnakeGame.getBoardDifficulty &&
          window.PixelSnakeGame.getBoardDifficulty()) ||
        "normal";
      loadSeasonLeaderboard(diff);
    });
  }

  // lightweight countdown ticker
  setInterval(function () {
    const cd = $("seasonCountdown");
    if (!cd || !season || season.classList.contains("hidden")) return;
    const info = getSeasonInfo();
    cd.textContent = formatSeasonCountdown(info.endsAt);
  }, 30000);

  activate("cloud");
}

function showSeasonBoard() {
  const tab = $("tabSeason");
  if (tab) tab.click();
}

function wireUI() {
  const btnReg = $("btnEmailRegister");
  const btnLogin = $("btnEmailLogin");
  const btnGoogle = $("btnGoogleLogin");
  const btnLogout = $("btnLogout");
  const btnSubmit = $("btnAuthSubmit");
  const btnCancel = $("btnAuthCancel");
  const modal = $("authModal");
  const btnRefresh = $("btnRefreshCloud");

  if (btnReg) btnReg.addEventListener("click", function () {
    openAuthModal("register");
  });
  if (btnLogin) btnLogin.addEventListener("click", function () {
    openAuthModal("login");
  });
  if (btnGoogle) btnGoogle.addEventListener("click", handleGoogleLogin);
  if (btnLogout) btnLogout.addEventListener("click", handleLogout);
  if (btnSubmit) btnSubmit.addEventListener("click", handleEmailAuth);
  if (btnCancel) btnCancel.addEventListener("click", closeAuthModal);
  if (btnRefresh) {
    btnRefresh.addEventListener("click", function () {
      loadCloudLeaderboard(resolveDifficulty());
    });
  }

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeAuthModal();
    });
  }

  const pass = $("authPassword");
  if (pass) {
    pass.addEventListener("keydown", function (e) {
      if (e.key === "Enter") handleEmailAuth();
    });
  }
  const email = $("authEmail");
  if (email) {
    email.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        const p = $("authPassword");
        if (p) p.focus();
      }
    });
  }

  wireBoardTabs();
}

// Public bridge for game.js (classic script)
window.PixelSnakeFirebase = {
  getUser: function () {
    return auth.currentUser || currentUser;
  },
  getDisplayName: function () {
    return displayNameFor(auth.currentUser || currentUser);
  },
  isLoggedIn: function () {
    return !!(auth.currentUser || currentUser);
  },
  saveBestScore: saveBestScore,
  saveSeasonScore: saveSeasonScore,
  refreshCloudLeaderboard: loadCloudLeaderboard,
  refreshSeasonLeaderboard: loadSeasonLeaderboard,
  getSeasonInfo: getSeasonInfo,
  showSeasonBoard: showSeasonBoard,
};

wireUI();
onAuthStateChanged(auth, function (user) {
  updateAccountUI(user);
  loadCloudLeaderboard(resolveDifficulty());
  loadSeasonLeaderboard(resolveDifficulty());
});
