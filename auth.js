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
  serverTimestamp,
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

function $(id) {
  return document.getElementById(id);
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
  el.classList.toggle("hidden", !msg);
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
  modal.classList.remove("hidden");
  setTimeout(function () {
    if (email) email.focus();
  }, 50);
}

function closeAuthModal() {
  const modal = $("authModal");
  if (modal) modal.classList.add("hidden");
  setAuthError("");
}

function updateAccountUI(user) {
  currentUser = user;
  const status = $("accountStatus");
  const guest = $("accountGuestBtns");
  const userBtns = $("accountUserBtns");
  const footer = $("footerNote");

  if (status) {
    if (user) {
      const label = user.email || user.displayName || "已登录";
      status.textContent = label;
      status.classList.add("logged-in");
      status.title = label;
    } else {
      status.textContent = "未登录";
      status.classList.remove("logged-in");
      status.title = "";
    }
  }
  if (guest) guest.classList.toggle("hidden", !!user);
  if (userBtns) userBtns.classList.toggle("hidden", !user);
  if (footer) {
    footer.textContent = user
      ? "云端同步 · 登录后成绩可上传排行榜"
      : "本地存储 · 登录后同步云端排行榜";
  }

  // Prefill score nickname when logged in
  const nick = $("nickname");
  if (nick && user) {
    nick.value = displayNameFor(user).slice(0, 12);
  }
}

async function saveBestScore(pts) {
  const user = auth.currentUser;
  if (!user || typeof pts !== "number" || pts < 0) {
    return { saved: false, reason: "not-logged-in" };
  }
  const score = Math.floor(pts);
  const name = displayNameFor(user);
  const ref = doc(db, "scores", user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const prev = snap.data().score;
      if (typeof prev === "number" && score < prev) {
        return { saved: false, reason: "lower", previous: prev };
      }
    }
    await setDoc(
      ref,
      {
        score: score,
        displayName: name,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await loadCloudLeaderboard();
    return { saved: true };
  } catch (err) {
    console.warn("[pixel-snake] cloud score save failed", err);
    return { saved: false, reason: "error", error: err };
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

async function loadCloudLeaderboard() {
  const el = $("cloudLeaderboard");
  if (!el) return;
  el.innerHTML = '<li class="empty">加载中…</li>';
  try {
    const q = query(
      collection(db, "scores"),
      orderBy("score", "desc"),
      limit(10)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      el.innerHTML = '<li class="empty">暂无云端成绩<br/>登录后上传吧！</li>';
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
    console.warn("[pixel-snake] cloud leaderboard load failed", err);
    el.innerHTML =
      '<li class="empty">云端排行榜加载失败<br/>请检查网络</li>';
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
  if (btnRefresh) btnRefresh.addEventListener("click", loadCloudLeaderboard);

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
  refreshCloudLeaderboard: loadCloudLeaderboard,
};

wireUI();
onAuthStateChanged(auth, function (user) {
  updateAccountUI(user);
  loadCloudLeaderboard();
});
